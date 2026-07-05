import { dialog, ipcMain } from 'electron'
import { getDataDir, getDb } from '../db'
import { buildCustomerDescription, calcCustomerReceivableRemaining, enrichCustomerRow, getCustomerLedgerAmountEditBlockReason, getCustomerLedgerDeleteBlockReason, isCustomerPaymentRecord, isCustomerReceivableRecord, isCustomerReturnRecord, sqlCustomerNetReceivableSum, sqlCustomerPaymentWhere, validateCustomerPaymentAmount, validateCustomerReturnAgainstPayments } from '../../common/customer-ledger'
import {
  customerNameExists,
  getCustomerProfile,
  getCustomerRemovePreview,
  listAllCustomerNames,
  listCustomerProfileNames,
  recalculateCustomerBalances,
  repairCustomerPaymentRows,
  setCustomerProfile,
} from './customer-profile'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import { cleanupOrphanAttachments, saveAttachments } from './attachments'
import { imagePickerExtensions, imagePreviewDataUrl, storedImageDataUrl } from '../image-compress'
import * as fs from 'fs'
import * as path from 'path'
import {
  applyCustomerReturnSideEffects,
  backfillReceivablesFromStockOut,
  deleteLegacyReturnStockIn,
  deleteReceivableForStockOut,
  listCustomerSaleOptions,
  resolveReceivableReference,
  resolveReturnReference,
} from './stock-customer-link'
import { generateDocNo, recalcInventoryForRows, syncProductCatalogWithLedger } from './stock-business'

function listLinkedCustomerLedgerRows(db: ReturnType<typeof getDb>, receivableId: number) {
  return db.prepare(`
    SELECT * FROM customer_ledger
    WHERE deleted_at IS NULL AND ref_ledger_id = ?
  `).all(receivableId) as Array<Record<string, any>>
}

function listCustomerReturnProductOptions(db: ReturnType<typeof getDb>, customerName: string) {
  const name = String(customerName || '').trim()
  if (!name) return []
  return db.prepare(`
    WITH sold AS (
      SELECT product_name, COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit,
        COALESCE(SUM(quantity), 0) AS sold_qty,
        MAX(unit_price) AS unit_price
      FROM stock_out_ledger
      WHERE deleted_at IS NULL AND customer_name = ?
      GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '')
    ),
    returned AS (
      SELECT product_name, COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit,
        COALESCE(SUM(ABS(quantity)), 0) AS returned_qty
      FROM customer_ledger
      WHERE deleted_at IS NULL AND customer_name = ? AND COALESCE(quantity, 0) < 0
      GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '')
    )
    SELECT sold.product_name, sold.spec, sold.unit,
      sold.unit_price,
      sold.sold_qty,
      COALESCE(returned.returned_qty, 0) AS returned_qty,
      MAX(0, sold.sold_qty - COALESCE(returned.returned_qty, 0)) AS max_qty
    FROM sold
    LEFT JOIN returned ON returned.product_name = sold.product_name
      AND returned.spec = sold.spec
      AND returned.unit = sold.unit
    WHERE sold.sold_qty - COALESCE(returned.returned_qty, 0) > 0.005
    ORDER BY sold.product_name COLLATE NOCASE ASC, sold.spec COLLATE NOCASE ASC
  `).all(name, name) as Array<Record<string, any>>
}

function getCustomerProductReturnMax(
  db: ReturnType<typeof getDb>,
  customerName: string,
  productName: string,
  spec: string,
  unit: string,
  excludeLedgerId = 0,
): number {
  const sold = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM stock_out_ledger
    WHERE deleted_at IS NULL
      AND customer_name = ?
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
  `).get(customerName, productName, spec, unit) as { qty?: number }
  const returned = db.prepare(`
    SELECT COALESCE(SUM(ABS(quantity)), 0) AS qty
    FROM customer_ledger
    WHERE deleted_at IS NULL
      AND customer_name = ?
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
      AND COALESCE(quantity, 0) < 0
      AND (? = 0 OR id != ?)
  `).get(customerName, productName, spec, unit, excludeLedgerId, excludeLedgerId) as { qty?: number }
  return Math.max(0, Number(sold?.qty || 0) - Number(returned?.qty || 0))
}

export function registerCustomerHandlers(): void {
  // 所有客户名
  ipcMain.handle('customer:names', () => {
    return listAllCustomerNames(getDb()).map(customer_name => ({ customer_name }))
  })

  ipcMain.handle('customer:profile-names', () => {
    return listCustomerProfileNames(getDb()).map(customer_name => ({ customer_name }))
  })

  ipcMain.handle('customer:sale-options', (_e, customerName: string) => {
    return listCustomerSaleOptions(getDb(), customerName || '')
  })

  ipcMain.handle('customer:return-product-options', (_e, customerName: string) => {
    return listCustomerReturnProductOptions(getDb(), customerName || '')
  })

  ipcMain.handle('customer:backfill-from-stock-out', (_e, customerName = '') => {
    return { ok: true, ...backfillReceivablesFromStockOut(getDb(), String(customerName || '')) }
  })

  ipcMain.handle('customer:create', (_e, profile: {
    customer_name: string
    contact_person?: string
    phone?: string
    address?: string
    opening_balance?: number
    opening_reason?: string
    note?: string
  }) => {
    const name = String(profile?.customer_name || '').trim()
    if (!name) throw new Error('请填写客户名称')
    const db = getDb()
    const openingBalance = Number(profile?.opening_balance || 0)
    const openingReason = String(profile?.opening_reason || '').trim()
    if (Math.abs(openingBalance) > 0.005 && !openingReason) {
      throw new Error('请填写上期欠款原因')
    }
    if (customerNameExists(db, name)) {
      throw new Error(`客户「${name}」已存在，请直接打开台账`)
    }
    const saved = setCustomerProfile(db, profile)
    if (Math.abs(openingBalance) > 0.005) {
      const row = {
        customer_name: name,
        date: new Date().toISOString().slice(0, 10),
        description: '期初欠款',
        contract_no: '',
        product_name: '期初欠款',
        spec: '',
        unit: '',
        quantity: 0,
        unit_price: 0,
        amount_in: 0,
        amount_out: 0,
        balance: 0,
        note: `上期欠款 ${openingBalance}；原因：${openingReason}`,
        month_label: '',
        stock_out_id: null,
        ref_ledger_id: null,
        return_stock_in_id: null,
      }
      const result = db.prepare(`
        INSERT INTO customer_ledger (
          customer_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
          amount_in, amount_out, balance, note, month_label, stock_out_id, ref_ledger_id, return_stock_in_id
        ) VALUES (
          @customer_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
          @amount_in, @amount_out, @balance, @note, @month_label, @stock_out_id, @ref_ledger_id, @return_stock_in_id
        )
      `).run(row)
      const ledgerId = Number(result.lastInsertRowid)
      const newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(ledgerId) as Record<string, any>
      logOperation('customer_ledger', ledgerId, 'INSERT', null, newRow as object)
      recalculateCustomerBalances(db, name)
    }
    logOperation('customer_profiles', 0, 'INSERT', null, saved as object)
    return saved
  })

  ipcMain.handle('customer:list', (_e, params = {}) => {
    const { customerName, page = 1, pageSize = 100, keyword = '', entryType = 'all' } = params as any
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const filters = normalizeLedgerFilters(params, 'customerName')
    const dateWhere = buildDateFilterClause(filters)
    const paymentWhere = sqlCustomerPaymentWhere('customer_ledger')
    const entryWhere = entryType === 'payment'
      ? `AND ${paymentWhere}`
      : entryType === 'sale'
        ? `AND NOT ${paymentWhere}`
        : ''
    const rows = db.prepare(`
      SELECT customer_ledger.*,
        (SELECT COUNT(*) FROM attachments
          WHERE related_table = 'customer_ledger'
            AND related_id = customer_ledger.id) AS attachment_count,
        (SELECT file_path FROM attachments
          WHERE related_table = 'customer_ledger'
            AND related_id = customer_ledger.id
          ORDER BY id ASC LIMIT 1) AS attachment_thumb_path
      FROM customer_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (description LIKE ? OR note LIKE ? OR date LIKE ?
          OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
        ${dateWhere.sql}
        ${entryWhere}
      ORDER BY customer_name ASC, ${buildDateOrderBy('customer_ledger.date')}
      LIMIT ? OFFSET ?
    `).all(customerName || '', customerName || '', like, like, like, like, like, like, ...dateWhere.params, pageSize, offset) as any[]
    const enrichedRows = rows.map(row => {
      const enriched = { ...enrichCustomerRow(row), attachment_thumb: storedImageDataUrl(row.attachment_thumb_path) }
      if (isCustomerPaymentRecord(enriched) && Number(enriched.ref_ledger_id || 0) > 0) {
        const ref = db.prepare(`
          SELECT product_name, contract_no, date FROM customer_ledger
          WHERE id = ? AND deleted_at IS NULL
        `).get(Number(enriched.ref_ledger_id)) as { product_name?: string; contract_no?: string; date?: string } | undefined
        if (ref?.product_name) {
          enriched.payment_for = ref.product_name
          enriched.payment_for_contract = ref.contract_no || ''
        }
      }
      if (isCustomerReturnRecord(enriched) && Number(enriched.ref_ledger_id || 0) > 0) {
        const ref = db.prepare(`
          SELECT product_name, contract_no FROM customer_ledger
          WHERE id = ? AND deleted_at IS NULL
        `).get(Number(enriched.ref_ledger_id)) as { product_name?: string; contract_no?: string } | undefined
        if (ref?.product_name) {
          enriched.return_for = ref.product_name
        }
      }
      if (isCustomerReceivableRecord(enriched)) {
        const linked = db.prepare(`
          SELECT amount_in, amount_out, description, product_name, quantity, note
          FROM customer_ledger
          WHERE deleted_at IS NULL AND ref_ledger_id = ?
        `).all(enriched.id) as Array<Record<string, any>>
        enriched.remaining_receivable = calcCustomerReceivableRemaining(enriched.amount_in, linked)
      }
      return enriched
    })
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM customer_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (description LIKE ? OR note LIKE ? OR date LIKE ?
          OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
        ${dateWhere.sql}
        ${entryWhere}
    `).get(customerName || '', customerName || '', like, like, like, like, like, like, ...dateWhere.params) as { total: number }
    return { rows: enrichedRows, total }
  })

  ipcMain.handle('customer:payment-audit', (_e, customerName = '') => {
    const db = getDb()
    const paymentWhere = sqlCustomerPaymentWhere()
    const nameFilter = customerName ? 'AND customer_name = ?' : ''
    const params = customerName ? [customerName] : []
    const row = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN TRIM(COALESCE(date, '')) = '' THEN 1 ELSE 0 END) AS missingDate,
        SUM(CASE WHEN COALESCE(amount_out, 0) <= 0 THEN 1 ELSE 0 END) AS missingAmount
      FROM customer_ledger
      WHERE deleted_at IS NULL ${nameFilter} AND ${paymentWhere}
    `).get(...params) as { total: number; missingDate: number; missingAmount: number }

    return {
      total: Number(row?.total || 0),
      missingDate: Number(row?.missingDate || 0),
      missingAmount: Number(row?.missingAmount || 0),
      anomalyCount: 0,
      autoFixableCount: 0,
    }
  })

  ipcMain.handle('customer:summary', (_e, params: any = {}) => {
    const filters = normalizeLedgerFilters(params, 'customerName')
    const customerName = filters.customerName || ''
    const dateWhere = buildDateFilterClause(filters)
    const db = getDb()
    repairCustomerPaymentRows(db, customerName)

    if (!customerName) {
      const rows = db.prepare(`
        WITH names AS (
          SELECT customer_name FROM customer_profiles
          WHERE TRIM(COALESCE(customer_name, '')) != ''
          UNION
          SELECT DISTINCT customer_name FROM customer_ledger
          WHERE deleted_at IS NULL AND TRIM(COALESCE(customer_name, '')) != ''
        ),
        totals AS (
          SELECT customer_name,
            ${sqlCustomerNetReceivableSum()} AS totalIn,
            COALESCE(SUM(amount_out), 0) AS totalOut
          FROM customer_ledger
          WHERE deleted_at IS NULL ${dateWhere.sql}
          GROUP BY customer_name
        )
        SELECT n.customer_name,
          COALESCE(t.totalIn, 0) AS totalIn,
          COALESCE(t.totalOut, 0) AS totalOut
        FROM names n
        LEFT JOIN totals t ON t.customer_name = n.customer_name
        ORDER BY n.customer_name
      `).all(...dateWhere.params) as Array<{ customer_name: string; totalIn: number; totalOut: number }>

      return rows.map((row) => {
        const openingBalance = Number(getCustomerProfile(db, row.customer_name).opening_balance || 0)
        const currentBalance = Math.round((openingBalance + Number(row.totalIn || 0) - Number(row.totalOut || 0)) * 100) / 100
        return {
          customer_name: row.customer_name,
          openingBalance,
          totalIn: Number(row.totalIn || 0),
          totalOut: Number(row.totalOut || 0),
          currentBalance,
        }
      })
    }

    const allTime = db.prepare(`
      SELECT
        ${sqlCustomerNetReceivableSum()} AS totalIn,
        COALESCE(SUM(amount_out), 0) AS totalOut
      FROM customer_ledger
      WHERE deleted_at IS NULL AND customer_name = ?
    `).get(customerName) as { totalIn: number; totalOut: number }

    const openingBalance = Number(getCustomerProfile(db, customerName).opening_balance || 0)
    const totalIn = Number(allTime.totalIn || 0)
    const totalOut = Number(allTime.totalOut || 0)
    const currentBalance = Math.round((openingBalance + totalIn - totalOut) * 100) / 100

    return {
      customer_name: customerName,
      openingBalance,
      totalIn,
      totalOut,
      currentBalance,
    }
  })

  ipcMain.handle('customer:profile', (_e, customerName: string) => {
    return getCustomerProfile(getDb(), customerName || '')
  })

  ipcMain.handle('customer:set-profile', (_e, profile: {
    customer_name: string
    contact_person?: string
    phone?: string
    address?: string
    opening_balance?: number
    opening_reason?: string
    note?: string
  }) => {
    const db = getDb()
    const saved = setCustomerProfile(db, profile)
    const currentBalance = recalculateCustomerBalances(db, profile.customer_name)
    return { ...saved, currentBalance }
  })

  ipcMain.handle('customer:remove-preview', (_e, customerName: string) => {
    return getCustomerRemovePreview(getDb(), customerName || '')
  })

  ipcMain.handle('customer:remove', (_e, customerName: string) => {
    const db = getDb()
    const name = String(customerName || '').trim()
    if (!name) throw new Error('请指定客户名称')
    const preview = getCustomerRemovePreview(db, name)
    if (!preview.hasProfile && preview.ledgerCount === 0) {
      throw new Error(`客户「${name}」不存在或已删除`)
    }
    if (preview.stockOutCount > 0) {
      throw new Error(`该客户在产品出库中还有 ${preview.stockOutCount} 条记录，无法删除。请先在「产品出库」中处理相关记录。`)
    }

    const ledgerRows = db.prepare(`
      SELECT id FROM customer_ledger
      WHERE deleted_at IS NULL AND customer_name = ?
    `).all(name) as Array<{ id: number }>

    for (const row of ledgerRows) {
      softDelete('customer_ledger', row.id)
    }

    if (preview.hasProfile) {
      const profile = getCustomerProfile(db, name)
      db.prepare(`DELETE FROM customer_profiles WHERE customer_name = ?`).run(name)
      logOperation('customer_profiles', 0, 'DELETE', profile as object, null)
    }

    cleanupOrphanAttachments()
    syncProductCatalogWithLedger(db)
    return { ok: true, ledgerCount: ledgerRows.length }
  })

  ipcMain.handle('customer:add', (_e, row) => {
    const db = getDb()
    const customerName = String(row.customer_name || '').trim()
    if (!customerName) throw new Error('请填写客户名称')
    const isPayment = isCustomerPaymentRecord(row)
    const isReturn = !isPayment && Number(row.ref_ledger_id || 0) > 0
    const stockOutId = Number(row.stock_out_id || 0)

    if (!isPayment && !isReturn && !stockOutId) {
      throw new Error('应收由产品出库自动生成，请先在「产品出库」中登记')
    }

    let payload: Record<string, any> = {
      customer_name: customerName,
      date: String(row.date || '').trim(),
      description: buildCustomerDescription(row),
      contract_no: String(row.contract_no || '').trim(),
      product_name: String(row.product_name || '').trim(),
      spec: String(row.spec || '').trim(),
      unit: String(row.unit || '').trim(),
      quantity: Number(row.quantity || 0),
      unit_price: Number(row.unit_price || 0),
      amount_in: Number(row.amount_in || 0),
      amount_out: Number(row.amount_out || 0),
      balance: 0,
      note: String(row.note || '').trim(),
      month_label: String(row.month_label || ''),
      doc_no: String(row.doc_no || '').trim(),
      stock_out_id: stockOutId || null,
      ref_ledger_id: Number(row.ref_ledger_id || 0) || null,
      return_stock_in_id: null,
    }

    if (isReturn) {
      const refId = Number(row.ref_ledger_id || 0)
      if (!refId) throw new Error('请选择要退货的应收台账')
      const ref = resolveReturnReference(db, customerName, refId)
      payload.ref_ledger_id = refId
      payload.contract_no = payload.contract_no || ref.contract_no || ''
      payload.product_name = payload.product_name || ref.product_name || ''
      payload.spec = payload.spec || ref.spec || ''
      payload.unit = payload.unit || ref.unit || ''
      const qty = Math.abs(Number(payload.quantity || ref.quantity || 0))
      const price = Math.abs(Number(payload.unit_price || ref.unit_price || 0))
      if (qty <= 0 || price <= 0) throw new Error('请填写退货数量与单价')
      payload.quantity = -qty
      payload.unit_price = price
      payload.amount_in = -Math.round(qty * price * 100) / 100
      payload.description = buildCustomerDescription(payload)
      if (!String(payload.note || '').includes('退货')) {
        payload.note = payload.note ? `${payload.note} 退货` : '退货'
      }
      if (!payload.doc_no) payload.doc_no = generateDocNo('TH', 'customer_ledger', payload.date)
      const linked = listLinkedCustomerLedgerRows(db, refId)
      const returnErr = validateCustomerReturnAgainstPayments(Number(ref.amount_in || 0), linked, payload.amount_in)
      if (returnErr) throw new Error(returnErr)
    } else if (isPayment) {
      const refId = Number(row.ref_ledger_id || 0)
      if (refId) {
        const ref = resolveReceivableReference(db, customerName, refId)
        payload.ref_ledger_id = refId
        if (!String(payload.note || '').trim()) {
          payload.note = `收 ${ref.product_name || '应收'}`.trim()
        }
        if (Number(payload.amount_out || 0) <= 0) throw new Error('请填写收款金额')
        const linked = listLinkedCustomerLedgerRows(db, refId)
        const paymentErr = validateCustomerPaymentAmount(Number(ref.amount_in || 0), linked, Number(payload.amount_out || 0))
        if (paymentErr) throw new Error(paymentErr)
      }
      payload.description = '付款'
      payload.product_name = '付款'
      payload.contract_no = ''
      payload.spec = ''
      payload.unit = ''
      payload.quantity = 0
      payload.unit_price = 0
      payload.amount_in = 0
      payload.doc_no = ''
      if (Number(payload.amount_out || 0) <= 0) throw new Error('请填写收款金额')
    }

    const r = db.prepare(`
      INSERT INTO customer_ledger (
        customer_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
        amount_in, amount_out, balance, note, month_label, doc_no, stock_out_id, ref_ledger_id, return_stock_in_id
      )
      VALUES (
        @customer_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
        @amount_in, @amount_out, @balance, @note, @month_label, @doc_no, @stock_out_id, @ref_ledger_id, @return_stock_in_id
      )
    `).run(payload)
    const ledgerId = Number(r.lastInsertRowid)
    recalculateCustomerBalances(db, payload.customer_name)
    let newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(ledgerId) as Record<string, any>
    if (isReturn && !isPayment) {
      applyCustomerReturnSideEffects(db, newRow)
      newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(ledgerId) as Record<string, any>
    }
    logOperation('customer_ledger', ledgerId, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('customer:return-products', (_e, payload: { customer_name?: string; date?: string; note?: string; items?: any[] }) => {
    const db = getDb()
    const customerName = String(payload?.customer_name || '').trim()
    if (!customerName) throw new Error('请选择客户')
    const date = String(payload?.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请填写退货日期')
    const options = listCustomerReturnProductOptions(db, customerName)
    const optionMap = new Map(options.map(item => [`${item.product_name}\u0000${item.spec || ''}\u0000${item.unit || ''}`, item]))
    const items = (payload?.items || []).filter(item => Number(item.quantity || 0) > 0)
    if (!items.length) throw new Error('请选择退货产品并填写数量')
    const inserted: Record<string, any>[] = []
    const docNo = generateDocNo('TH', 'customer_ledger', date)

    const tx = db.transaction(() => {
      for (const item of items) {
        const productName = String(item.product_name || '').trim()
        const spec = String(item.spec || '').trim()
        const unit = String(item.unit || '').trim()
        const key = `${productName}\u0000${spec}\u0000${unit}`
        const option = optionMap.get(key)
        if (!option) throw new Error(`产品「${productName} ${spec}」不可退或已退完`)
        const qty = Math.abs(Number(item.quantity || 0))
        const maxQty = Number(option.max_qty || 0)
        if (qty <= 0) throw new Error(`请填写「${productName}」退货数量`)
        if (qty - maxQty > 0.005) throw new Error(`「${productName}」最多可退 ${maxQty}`)
        const price = Math.abs(Number(item.unit_price || option.unit_price || 0))
        if (price <= 0) throw new Error(`请填写「${productName}」单价`)
        const row = {
          customer_name: customerName,
          date,
          description: '',
          contract_no: '',
          product_name: productName,
          spec,
          unit,
          quantity: -qty,
          unit_price: price,
          amount_in: -Math.round(qty * price * 100) / 100,
          amount_out: 0,
          balance: 0,
          note: String(item.note || payload.note || '退货').includes('退货')
            ? String(item.note || payload.note || '退货').trim()
            : `${String(item.note || payload.note || '').trim()} 退货`.trim(),
          month_label: '',
          doc_no: docNo,
          stock_out_id: null,
          ref_ledger_id: null,
          return_stock_in_id: null,
        }
        row.description = buildCustomerDescription(row)
        const result = db.prepare(`
          INSERT INTO customer_ledger (
            customer_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
            amount_in, amount_out, balance, note, month_label, doc_no, stock_out_id, ref_ledger_id, return_stock_in_id
          ) VALUES (
            @customer_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
            @amount_in, @amount_out, @balance, @note, @month_label, @doc_no, @stock_out_id, @ref_ledger_id, @return_stock_in_id
          )
        `).run(row)
        const id = Number(result.lastInsertRowid)
        let newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id) as Record<string, any>
        applyCustomerReturnSideEffects(db, newRow)
        newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id) as Record<string, any>
        logOperation('customer_ledger', id, 'INSERT', null, newRow as object)
        inserted.push(newRow)
      }
      recalculateCustomerBalances(db, customerName)
    })
    tx()
    return { ok: true, count: inserted.length, rows: inserted }
  })

  ipcMain.handle('customer:update', (_e, { id, ...row }) => {
    const db = getDb()
    const old = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id) as Record<string, any>
    if (!old) throw new Error('记录不存在')

    const isPayment = isCustomerPaymentRecord({ ...old, ...row })
    const isReturn = !isPayment && (
      Number(row.ref_ledger_id || old.ref_ledger_id || 0) > 0
      || Number(old.return_stock_in_id || 0) > 0
      || String(row.note || old.note || '').includes('退货')
    )

    if (Number(old.stock_out_id || 0) > 0 && !isReturn && !isPayment) {
      throw new Error('出库生成的应收请在「产品出库」中修改')
    }

    const payload: Record<string, any> = {
      ...row,
      id,
      customer_name: String(row.customer_name || old.customer_name || '').trim(),
      date: String(row.date || old.date || '').trim(),
      description: buildCustomerDescription({ ...old, ...row }),
      contract_no: String(row.contract_no ?? old.contract_no ?? '').trim(),
      product_name: String(row.product_name ?? old.product_name ?? '').trim(),
      spec: String(row.spec ?? old.spec ?? '').trim(),
      unit: String(row.unit ?? old.unit ?? '').trim(),
      quantity: Number(row.quantity ?? old.quantity ?? 0),
      unit_price: Number(row.unit_price ?? old.unit_price ?? 0),
      amount_in: Number(row.amount_in ?? old.amount_in ?? 0),
      amount_out: Number(row.amount_out ?? old.amount_out ?? 0),
      balance: Number(row.balance ?? old.balance ?? 0),
      note: String(row.note ?? old.note ?? '').trim(),
      month_label: String(row.month_label ?? old.month_label ?? '').trim(),
      doc_no: String(old.doc_no || row.doc_no || '').trim(),
      ref_ledger_id: Number(row.ref_ledger_id ?? old.ref_ledger_id ?? 0) || null,
      stock_out_id: Number(old.stock_out_id || 0) || null,
      return_stock_in_id: Number(old.return_stock_in_id || 0) || null,
    }

    const receivableIdForGuard = isCustomerReceivableRecord(old) ? id : Number(payload.ref_ledger_id || 0)
    const linkedToReceivable = receivableIdForGuard
      ? listLinkedCustomerLedgerRows(db, receivableIdForGuard)
      : []
    const amountEditBlock = getCustomerLedgerAmountEditBlockReason(old, linkedToReceivable, payload)
    if (amountEditBlock) throw new Error(amountEditBlock)

    if (isReturn) {
      const refId = Number(payload.ref_ledger_id || 0)
      const qty = Math.abs(Number(payload.quantity || 0))
      const price = Math.abs(Number(payload.unit_price || 0))
      if (qty <= 0 || price <= 0) throw new Error('请填写退货数量与单价')
      if (refId) {
        const ref = resolveReturnReference(db, payload.customer_name, refId)
        const returnErr = validateCustomerReturnAgainstPayments(Number(ref.amount_in || 0), linkedToReceivable, -Math.round(qty * price * 100) / 100, id)
        if (returnErr) throw new Error(returnErr)
      } else {
        const productName = String(payload.product_name || '').trim()
        const spec = String(payload.spec || '').trim()
        const unit = String(payload.unit || '').trim()
        if (!productName) throw new Error('请选择退货产品')
        const maxQty = getCustomerProductReturnMax(db, payload.customer_name, productName, spec, unit, id)
        if (qty - maxQty > 0.005) throw new Error(`「${productName}」最多可退 ${maxQty}`)
      }
      payload.quantity = -qty
      payload.unit_price = price
      payload.amount_in = -Math.round(qty * price * 100) / 100
      payload.description = buildCustomerDescription(payload)
      if (!String(payload.note || '').includes('退货')) {
        payload.note = payload.note ? `${payload.note} 退货` : '退货'
      }
      if (!payload.doc_no) payload.doc_no = generateDocNo('TH', 'customer_ledger', payload.date)
    } else if (isPayment) {
      const refId = Number(payload.ref_ledger_id || 0)
      if (refId) {
        const ref = resolveReceivableReference(db, payload.customer_name, refId)
        const paymentErr = validateCustomerPaymentAmount(Number(ref.amount_in || 0), linkedToReceivable, Number(payload.amount_out || 0), id)
        if (paymentErr) throw new Error(paymentErr)
      }
      payload.description = '付款'
      payload.product_name = '付款'
      payload.contract_no = ''
      payload.spec = ''
      payload.unit = ''
      payload.quantity = 0
      payload.unit_price = 0
      payload.amount_in = 0
      payload.doc_no = ''
      if (Number(payload.amount_out || 0) <= 0) throw new Error('请填写收款金额')
    }

    db.prepare(`
      UPDATE customer_ledger SET customer_name=@customer_name, date=@date,
        description=@description, contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
        quantity=@quantity, unit_price=@unit_price,
        amount_in=@amount_in, amount_out=@amount_out,
        balance=@balance, note=@note, month_label=@month_label, doc_no=@doc_no,
        ref_ledger_id=@ref_ledger_id,
        updated_at=datetime('now','localtime') WHERE id=@id
    `).run(payload)
    recalculateCustomerBalances(db, payload.customer_name)
    if (old.customer_name !== payload.customer_name) {
      recalculateCustomerBalances(db, old.customer_name)
    }
    let newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id) as Record<string, any>
    if (isReturn) {
      applyCustomerReturnSideEffects(db, newRow, {
        previousReturnStockInId: Number(old.return_stock_in_id || 0),
        previousProduct: {
          product_name: String(old.product_name || ''),
          spec: String(old.spec || ''),
          unit: String(old.unit || ''),
        },
      })
      newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id) as Record<string, any>
    }
    logOperation('customer_ledger', id, 'UPDATE', old as object, newRow as object)
    return newRow
  })

  function deleteCustomerLedgerById(id: number) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM customer_ledger WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, any> | undefined
    if (!row) return

    const linkedToReceivable = isCustomerReceivableRecord(row)
      ? listLinkedCustomerLedgerRows(db, id)
      : Number(row.ref_ledger_id || 0) > 0
        ? listLinkedCustomerLedgerRows(db, Number(row.ref_ledger_id))
        : []
    const deleteBlock = getCustomerLedgerDeleteBlockReason(row, linkedToReceivable)
    if (deleteBlock) throw new Error(deleteBlock)

    if (Number(row.return_stock_in_id || 0) > 0) {
      deleteLegacyReturnStockIn(db, Number(row.return_stock_in_id))
    }
    const returnProduct = isCustomerReturnRecord(row)
      ? { product_name: row.product_name, spec: row.spec, unit: row.unit }
      : null

    const stockOutId = Number(row.stock_out_id || 0)
    if (stockOutId) {
      const stockOut = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ? AND deleted_at IS NULL').get(stockOutId) as Record<string, any> | undefined
      if (stockOut) {
        db.prepare(`UPDATE stock_out_ledger SET ledger_id = NULL WHERE id = ?`).run(stockOutId)
        softDelete('stock_out_ledger', stockOutId)
        recalcInventoryForRows(stockOut)
      }
    }

    softDelete('customer_ledger', id)
    if (returnProduct) recalcInventoryForRows(returnProduct)
    recalculateCustomerBalances(db, row.customer_name)
    syncProductCatalogWithLedger(db)
  }

  ipcMain.handle('customer:delete', (_e, id) => {
    deleteCustomerLedgerById(id)
    cleanupOrphanAttachments()
    return { ok: true }
  })

  ipcMain.handle('customer:deleteMany', (_e, ids: number[] = []) => {
    const uniqueIds = [...new Set((ids || []).map(id => Number(id)).filter(id => id > 0))]
    for (const id of uniqueIds) deleteCustomerLedgerById(id)
    cleanupOrphanAttachments()
    return { ok: true, count: uniqueIds.length }
  })
  ipcMain.handle('customer:trash', () => {
    return getDb().prepare(`SELECT * FROM customer_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('customer:restore', (_e, id) => {
    const db = getDb()
    restore('customer_ledger', id)
    const row = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id) as Record<string, any>
    if (row?.customer_name) recalculateCustomerBalances(db, row.customer_name)
    if (row && isCustomerReturnRecord(row)) {
      applyCustomerReturnSideEffects(db, row)
    }
    return { ok: true }
  })

  ipcMain.handle('customer:attachments', (_e, id: number) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM attachments
      WHERE related_table = 'customer_ledger' AND related_id = ?
      ORDER BY id ASC
    `).all(id) as any[]

    return rows
      .filter(row => fs.existsSync(row.file_path))
      .map(row => ({
        id: row.id,
        fileName: row.file_name,
        dataUrl: storedImageDataUrl(row.file_path),
      }))
  })

  ipcMain.handle('customer:pick-attachments', async () => {
    const filePaths = await pickImageFiles()
    return Promise.all(filePaths.map(async filePath => ({
      filePath,
      fileName: path.basename(filePath),
      dataUrl: await imagePreviewDataUrl(filePath),
    })))
  })

  ipcMain.handle('customer:add-attachment', async (_e, id: number, filePaths?: string[]) => {
    const paths = filePaths?.length ? filePaths : await pickImageFiles()
    if (!paths.length) return { ok: false, canceled: true }
    const count = await saveAttachments('customer_ledger', id, paths)
    return { ok: true, count }
  })
}

async function pickImageFiles(): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Images', extensions: imagePickerExtensions() }],
    properties: ['openFile', 'multiSelections'],
  })
  return result.canceled ? [] : result.filePaths
}
