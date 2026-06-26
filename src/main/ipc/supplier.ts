import { ipcMain } from 'electron'
import { getDb } from '../db'
import {
  buildSupplierDescription,
  enrichSupplierRow,
  isSupplierPayableRecord,
  isSupplierPaymentRecord,
  isSupplierReturnRecord,
  sqlSupplierNetPayableSum,
  sqlSupplierPaymentWhere,
  validateSupplierPaymentAmount,
  validateSupplierReturnAgainstPayments,
} from '../../common/supplier-ledger'
import { isMaterialSupplierType } from '../../common/supplier-profile'
import {
  getSupplierProfile,
  getSupplierRemovePreview,
  getSupplierType,
  listAllSupplierNames,
  listSupplierProfileNames,
  recalculateSupplierBalances,
  setSupplierProfile,
  supplierNameExists,
  syncSupplierProfilesFromLedger,
} from './supplier-profile'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, restore, softDelete } from './helpers'
import {
  applySupplierReturnSideEffects,
  backfillSupplierPayablesFromStockIn,
  cleanupSupplierReturnStockOut,
  createPayableFromStockIn,
  listLinkedSupplierLedgerRows as listLinkedRows,
  recalcInventoryForSupplierReturnRow,
  resolvePayableReference,
  shouldLinkSupplierPayable,
} from './stock-supplier-link'

export function registerSupplierHandlers(): void {
  ipcMain.handle('supplier:names', () => {
    return listAllSupplierNames(getDb()).map(supplier_name => ({ supplier_name }))
  })

  ipcMain.handle('supplier:profile-names', () => {
    return listSupplierProfileNames(getDb()).map(supplier_name => ({ supplier_name }))
  })

  ipcMain.handle('supplier:summary', (_e, params: any = {}) => {
    const db = getDb()
    const filters = normalizeLedgerFilters(params, 'supplierName')
    const supplierName = filters.supplierName || ''
    const dateWhere = buildDateFilterClause(filters)

    if (!supplierName) {
      const rows = db.prepare(`
        WITH names AS (
          SELECT supplier_name FROM supplier_profiles
          UNION
          SELECT DISTINCT supplier_name FROM supplier_ledger WHERE deleted_at IS NULL
        ),
        totals AS (
          SELECT supplier_name,
            ${sqlSupplierNetPayableSum()} AS totalIn,
            COALESCE(SUM(amount_out), 0) AS totalOut
          FROM supplier_ledger
          WHERE deleted_at IS NULL ${dateWhere.sql}
          GROUP BY supplier_name
        ),
        stock AS (
          SELECT supplier_name,
            COUNT(*) AS stockInCount,
            COALESCE(SUM(quantity), 0) AS totalQuantity,
            COALESCE(SUM(amount), 0) AS totalAmount
          FROM stock_in_ledger
          WHERE deleted_at IS NULL ${dateWhere.sql}
          GROUP BY supplier_name
        )
        SELECT n.supplier_name,
          COALESCE(p.supplier_type, 'outsourcing') AS supplier_type,
          COALESCE(p.contact_person, '') AS contact_person,
          COALESCE(p.phone, '') AS phone,
          COALESCE(t.totalIn, 0) AS totalIn,
          COALESCE(t.totalOut, 0) AS totalOut,
          COALESCE(s.stockInCount, 0) AS stockInCount,
          COALESCE(s.totalQuantity, 0) AS totalQuantity,
          COALESCE(s.totalAmount, 0) AS totalAmount
        FROM names n
        LEFT JOIN supplier_profiles p ON p.supplier_name = n.supplier_name
        LEFT JOIN totals t ON t.supplier_name = n.supplier_name
        LEFT JOIN stock s ON s.supplier_name = n.supplier_name
        ORDER BY n.supplier_name COLLATE NOCASE ASC
      `).all(...dateWhere.params, ...dateWhere.params) as Array<{
        supplier_name: string
        contact_person: string
        phone: string
        totalIn: number
        totalOut: number
        stockInCount: number
        totalQuantity: number
        totalAmount: number
      }>

      return rows.map(row => {
        const openingBalance = Number(getSupplierProfile(db, row.supplier_name).opening_balance || 0)
        const currentBalance = Math.round((openingBalance + Number(row.totalIn || 0) - Number(row.totalOut || 0)) * 100) / 100
        return {
          supplier_name: row.supplier_name,
          supplier_type: row.supplier_type || 'outsourcing',
          contact_person: row.contact_person,
          phone: row.phone,
          openingBalance,
          totalIn: Number(row.totalIn || 0),
          totalOut: Number(row.totalOut || 0),
          currentBalance,
          stockInCount: Number(row.stockInCount || 0),
          totalQuantity: Number(row.totalQuantity || 0),
          totalAmount: Number(row.totalAmount || 0),
        }
      })
    }

    const allTime = db.prepare(`
      SELECT
        ${sqlSupplierNetPayableSum()} AS totalIn,
        COALESCE(SUM(amount_out), 0) AS totalOut
      FROM supplier_ledger
      WHERE deleted_at IS NULL AND supplier_name = ?
    `).get(supplierName) as { totalIn: number; totalOut: number }

    const stockStats = db.prepare(`
      SELECT
        COUNT(*) AS stockInCount,
        COALESCE(SUM(quantity), 0) AS totalQuantity,
        COALESCE(SUM(amount), 0) AS totalAmount
      FROM stock_in_ledger
      WHERE deleted_at IS NULL AND supplier_name = ? ${dateWhere.sql}
    `).get(supplierName, ...dateWhere.params) as { stockInCount: number; totalQuantity: number; totalAmount: number }

    const openingBalance = Number(getSupplierProfile(db, supplierName).opening_balance || 0)
    const totalIn = Number(allTime.totalIn || 0)
    const totalOut = Number(allTime.totalOut || 0)
    const currentBalance = Math.round((openingBalance + totalIn - totalOut) * 100) / 100

    return {
      ...getSupplierProfile(db, supplierName),
      supplier_name: supplierName,
      openingBalance,
      totalIn,
      totalOut,
      currentBalance,
      stockInCount: Number(stockStats?.stockInCount || 0),
      totalQuantity: Number(stockStats?.totalQuantity || 0),
      totalAmount: Number(stockStats?.totalAmount || 0),
    }
  })

  ipcMain.handle('supplier:list', (_e, params = {}) => {
    const { supplierName, page = 1, pageSize = 100, keyword = '', entryType = 'all' } = params as any
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const filters = normalizeLedgerFilters(params, 'supplierName')
    const dateWhere = buildDateFilterClause(filters)
    const paymentWhere = sqlSupplierPaymentWhere('supplier_ledger')
    const entryWhere = entryType === 'payment'
      ? `AND ${paymentWhere}`
      : entryType === 'purchase'
        ? `AND NOT ${paymentWhere}`
        : ''
    const rows = db.prepare(`
      SELECT supplier_ledger.*
      FROM supplier_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (description LIKE ? OR note LIKE ? OR date LIKE ?
          OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
        ${dateWhere.sql}
        ${entryWhere}
      ORDER BY supplier_name ASC, ${buildDateOrderBy('supplier_ledger.date')}
      LIMIT ? OFFSET ?
    `).all(supplierName || '', supplierName || '', like, like, like, like, like, like, ...dateWhere.params, pageSize, offset) as any[]
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM supplier_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (description LIKE ? OR note LIKE ? OR date LIKE ?
          OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
        ${dateWhere.sql}
        ${entryWhere}
    `).get(supplierName || '', supplierName || '', like, like, like, like, like, like, ...dateWhere.params) as { total: number }
    const enrichedRows = rows.map(row => {
      const enriched = enrichSupplierRow(row)
      if (isSupplierPaymentRecord(enriched) && Number(enriched.ref_ledger_id || 0) > 0) {
        const ref = db.prepare(`
          SELECT product_name, contract_no, date FROM supplier_ledger
          WHERE id = ? AND deleted_at IS NULL
        `).get(Number(enriched.ref_ledger_id)) as { product_name?: string; contract_no?: string; date?: string } | undefined
        if (ref?.product_name) {
          enriched.payment_for = ref.product_name
          enriched.payment_for_contract = ref.contract_no || ''
        }
      }
      return enriched
    })
    return { rows: enrichedRows, total }
  })

  ipcMain.handle('supplier:profile', (_e, supplierName: string) => {
    return getSupplierProfile(getDb(), supplierName || '')
  })

  ipcMain.handle('supplier:create', (_e, profile: {
    supplier_name: string
    supplier_type?: string
    contact_person?: string
    phone?: string
    address?: string
    opening_balance?: number
    note?: string
  }) => {
    const name = String(profile?.supplier_name || '').trim()
    if (!name) throw new Error('请填写供应商名称')
    const db = getDb()
    if (supplierNameExists(db, name)) {
      throw new Error(`供应商「${name}」已存在`)
    }
    const saved = setSupplierProfile(db, profile)
    logOperation('supplier_profiles', 0, 'INSERT', null, saved as object)
    return saved
  })

  ipcMain.handle('supplier:set-profile', (_e, profile: {
    supplier_name: string
    supplier_type?: string
    contact_person?: string
    phone?: string
    address?: string
    opening_balance?: number
    note?: string
  }) => {
    const db = getDb()
    const saved = setSupplierProfile(db, profile)
    const currentBalance = recalculateSupplierBalances(db, profile.supplier_name)
    logOperation('supplier_profiles', 0, 'UPDATE', null, saved as object)
    return { ...saved, currentBalance }
  })

  ipcMain.handle('supplier:add', (_e, row) => {
    const db = getDb()
    const supplierName = String(row.supplier_name || '').trim()
    if (!supplierName) throw new Error('请选择供应商')
    const isPayment = isSupplierPaymentRecord(row)
    const isReturn = !isPayment && (
      Number(row.ref_ledger_id || 0) > 0
      || String(row.note || '').includes('退货')
    )

    if (isReturn && isMaterialSupplierType(getSupplierType(db, supplierName))) {
      throw new Error('原材料供应商不支持退货')
    }

    let payload: Record<string, any> = {
      supplier_name: supplierName,
      date: String(row.date || '').trim(),
      description: buildSupplierDescription(row),
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
      stock_in_id: null,
      ref_ledger_id: Number(row.ref_ledger_id || 0) || null,
      return_stock_out_id: null,
    }

    if (isReturn) {
      const refId = Number(row.ref_ledger_id || 0)
      if (!refId) throw new Error('请选择要退货的应付台账')
      const ref = resolvePayableReference(db, supplierName, refId)
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
      payload.amount_out = 0
      payload.description = buildSupplierDescription(payload)
      if (!String(payload.note || '').includes('退货')) {
        payload.note = payload.note ? `${payload.note} 退货` : '退货'
      }
      const linked = listLinkedRows(db, refId)
      const returnErr = validateSupplierReturnAgainstPayments(Number(ref.amount_in || 0), linked, payload.amount_in)
      if (returnErr) throw new Error(returnErr)
    } else if (isPayment) {
      payload.description = '付款'
      payload.product_name = '付款'
      payload.contract_no = ''
      payload.spec = ''
      payload.unit = ''
      payload.quantity = 0
      payload.unit_price = 0
      payload.amount_in = 0
      if (Number(payload.amount_out || 0) <= 0) throw new Error('请填写付款金额')
      const refId = Number(row.ref_ledger_id || 0)
      if (refId > 0) {
        const ref = resolvePayableReference(db, supplierName, refId)
        payload.ref_ledger_id = refId
        if (!String(payload.note || '').trim()) {
          payload.note = `付 ${ref.product_name || '应付'}`.trim()
        }
        const linked = listLinkedRows(db, refId)
        const paymentErr = validateSupplierPaymentAmount(Number(ref.amount_in || 0), linked, Number(payload.amount_out || 0))
        if (paymentErr) throw new Error(paymentErr)
      }
    } else {
      const qty = Number(payload.quantity || 0)
      const price = Number(payload.unit_price || 0)
      if (qty > 0 && price > 0) {
        payload.amount_in = Math.round(qty * price * 100) / 100
      }
      if (Number(payload.amount_in || 0) <= 0) {
        throw new Error('请填写应付金额，或填写数量与单价')
      }
      payload.amount_out = 0
      payload.description = buildSupplierDescription(payload)
      payload.ref_ledger_id = null
    }

    const r = db.prepare(`
      INSERT INTO supplier_ledger (
        supplier_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
        amount_in, amount_out, balance, note, stock_in_id, ref_ledger_id, return_stock_out_id
      ) VALUES (
        @supplier_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
        @amount_in, @amount_out, @balance, @note, @stock_in_id, @ref_ledger_id, @return_stock_out_id
      )
    `).run(payload)
    const ledgerId = Number(r.lastInsertRowid)
    recalculateSupplierBalances(db, supplierName)
    let newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(ledgerId) as Record<string, any>
    if (isReturn && !isPayment) {
      applySupplierReturnSideEffects(db, newRow)
      newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(ledgerId) as Record<string, any>
    }
    logOperation('supplier_ledger', ledgerId, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('supplier:update', (_e, { id, ...row }) => {
    const db = getDb()
    const old = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    if (!old) throw new Error('记录不存在')
    if (Number(old.stock_in_id || 0) > 0) {
      throw new Error('入库关联的应付请在「产品入库」中修改')
    }

    const isPayment = isSupplierPaymentRecord({ ...old, ...row })
    const isReturn = !isPayment && (
      isSupplierReturnRecord({ ...old, ...row })
      || Number(row.ref_ledger_id || old.ref_ledger_id || 0) > 0 && String(row.note || old.note || '').includes('退货')
    )

    const payload = {
      id,
      supplier_name: String(row.supplier_name || old.supplier_name || '').trim(),
      date: String(row.date || old.date || '').trim(),
      description: buildSupplierDescription(row),
      contract_no: String(row.contract_no || '').trim(),
      product_name: String(row.product_name || '').trim(),
      spec: String(row.spec || '').trim(),
      unit: String(row.unit || '').trim(),
      quantity: Number(row.quantity || 0),
      unit_price: Number(row.unit_price || 0),
      amount_in: Number(row.amount_in || 0),
      amount_out: Number(row.amount_out || 0),
      note: String(row.note || '').trim(),
      stock_in_id: old.stock_in_id ?? null,
      ref_ledger_id: Number(row.ref_ledger_id ?? old.ref_ledger_id ?? 0) || null,
      return_stock_out_id: Number(old.return_stock_out_id || 0) || null,
    }

    if (isReturn && isMaterialSupplierType(getSupplierType(db, payload.supplier_name))) {
      throw new Error('原材料供应商不支持退货')
    }

    if (isReturn) {
      const refId = Number(payload.ref_ledger_id || 0)
      if (!refId) throw new Error('请选择要退货的应付台账')
      const ref = resolvePayableReference(db, payload.supplier_name, refId)
      const qty = Math.abs(Number(payload.quantity || 0))
      const price = Math.abs(Number(payload.unit_price || ref.unit_price || 0))
      if (qty <= 0 || price <= 0) throw new Error('请填写退货数量与单价')
      payload.quantity = -qty
      payload.unit_price = price
      payload.amount_in = -Math.round(qty * price * 100) / 100
      payload.amount_out = 0
      payload.description = buildSupplierDescription(payload)
      if (!String(payload.note || '').includes('退货')) {
        payload.note = payload.note ? `${payload.note} 退货` : '退货'
      }
      const linked = listLinkedRows(db, refId)
      const returnErr = validateSupplierReturnAgainstPayments(Number(ref.amount_in || 0), linked, payload.amount_in, id)
      if (returnErr) throw new Error(returnErr)
    } else if (isPayment) {
      payload.description = '付款'
      payload.product_name = '付款'
      payload.contract_no = ''
      payload.spec = ''
      payload.unit = ''
      payload.quantity = 0
      payload.unit_price = 0
      payload.amount_in = 0
      const refId = Number(payload.ref_ledger_id || 0)
      if (refId > 0) {
        const ref = resolvePayableReference(db, payload.supplier_name, refId)
        const linked = listLinkedRows(db, refId)
        const paymentErr = validateSupplierPaymentAmount(Number(ref.amount_in || 0), linked, Number(payload.amount_out || 0), id)
        if (paymentErr) throw new Error(paymentErr)
      }
    } else {
      const qty = Number(payload.quantity || 0)
      const price = Number(payload.unit_price || 0)
      if (qty > 0 && price > 0) {
        payload.amount_in = Math.round(qty * price * 100) / 100
      }
      payload.amount_out = 0
      payload.description = buildSupplierDescription(payload)
      payload.ref_ledger_id = null
    }

    db.prepare(`
      UPDATE supplier_ledger SET
        supplier_name=@supplier_name, date=@date, description=@description,
        contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
        quantity=@quantity, unit_price=@unit_price, amount_in=@amount_in, amount_out=@amount_out,
        note=@note, ref_ledger_id=@ref_ledger_id, updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run(payload)
    if (old.supplier_name !== payload.supplier_name) {
      recalculateSupplierBalances(db, old.supplier_name)
    }
    recalculateSupplierBalances(db, payload.supplier_name)
    let newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    if (isReturn) {
      const previousProduct = isSupplierReturnRecord(old)
        ? {
          product_name: String(old.product_name || '').trim(),
          spec: String(old.spec || '').trim(),
          unit: String(old.unit || '').trim(),
        }
        : undefined
      applySupplierReturnSideEffects(db, newRow, {
        previousReturnStockOutId: Number(old.return_stock_out_id || 0),
        previousProduct,
      })
      newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    }
    logOperation('supplier_ledger', id, 'UPDATE', old as object, newRow as object)
    return newRow
  })

  ipcMain.handle('supplier:delete', (_e, id: number) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    if (!row) throw new Error('记录不存在')
    if (Number(row.stock_in_id || 0) > 0) {
      throw new Error('入库关联的应付请在「产品入库」中删除')
    }
    if (Number(row.return_stock_out_id || 0) > 0) {
      cleanupSupplierReturnStockOut(db, row)
    }
    const wasReturn = isSupplierReturnRecord(row)
    softDelete('supplier_ledger', id)
    recalculateSupplierBalances(db, row.supplier_name)
    if (wasReturn) recalcInventoryForSupplierReturnRow(db, row)
    return { ok: true }
  })

  ipcMain.handle('supplier:remove-preview', (_e, supplierName: string) => {
    return getSupplierRemovePreview(getDb(), supplierName || '')
  })

  ipcMain.handle('supplier:remove', (_e, supplierName: string) => {
    const db = getDb()
    const name = String(supplierName || '').trim()
    if (!name) throw new Error('请指定供应商名称')
    const preview = getSupplierRemovePreview(db, name)
    if (!preview.hasProfile && preview.ledgerCount === 0) {
      throw new Error(`供应商「${name}」不存在或已删除`)
    }
    if (preview.stockInCount > 0) {
      throw new Error(`该供应商在产品入库中还有 ${preview.stockInCount} 条记录，无法删除。请先在「产品入库」中处理相关记录。`)
    }

    const ledgerRows = db.prepare(`
      SELECT id FROM supplier_ledger
      WHERE deleted_at IS NULL AND supplier_name = ?
    `).all(name) as Array<{ id: number }>
    for (const row of ledgerRows) {
      softDelete('supplier_ledger', row.id)
    }

    if (preview.hasProfile) {
      const profile = getSupplierProfile(db, name)
      db.prepare(`DELETE FROM supplier_profiles WHERE supplier_name = ?`).run(name)
      logOperation('supplier_profiles', 0, 'DELETE', profile as object, null)
    }
    return { ok: true, ledgerCount: ledgerRows.length }
  })

  ipcMain.handle('supplier:sync-from-ledger', () => {
    const added = syncSupplierProfilesFromLedger(getDb())
    return { ok: true, added }
  })

  ipcMain.handle('supplier:backfill-from-stock-in', (_e, supplierName = '') => {
    const db = getDb()
    if (supplierName) {
      const rows = db.prepare(`
        SELECT * FROM stock_in_ledger
        WHERE deleted_at IS NULL AND supplier_name = ? AND COALESCE(ledger_id, 0) = 0
      `).all(supplierName) as Array<Record<string, any>>
      let linked = 0
      for (const row of rows) {
        if (!shouldLinkSupplierPayable(row)) continue
        createPayableFromStockIn(db, row)
        linked++
      }
      return { ok: true, linked }
    }
    const linked = backfillSupplierPayablesFromStockIn(db)
    return { ok: true, linked }
  })
}
