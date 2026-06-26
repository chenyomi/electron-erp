import { ipcMain } from 'electron'
import { getDb } from '../db'
import { listCustomerProfileNames } from './customer-profile'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import { attachmentPreviewSql, cleanupOrphanAttachments, withAttachmentPreviews } from './attachments'
import { ensureProductCatalog, generateDocNo, recalcInventoryForRows, sumCustomerReturnQty, sumSupplierReturnQty, syncProductCatalogWithLedger } from './stock-business'
import {
  assertStockOutCustomerExists,
  createReceivableFromStockOut,
  deleteReceivableForStockOut,
  syncReceivableFromStockOut,
} from './stock-customer-link'
import type Database from 'better-sqlite3'

function productKey(row: any) {
  return {
    productName: String(row?.product_name || '').trim(),
    spec: String(row?.spec || '').trim(),
    unit: String(row?.unit || '').trim(),
  }
}

function normalizeStockOutRow(row: any) {
  return {
    doc_no: String(row?.doc_no || '').trim(),
    customer_name: String(row?.customer_name || '').trim(),
    category: String(row?.category || '').trim(),
    date: String(row?.date || '').trim(),
    contract_no: String(row?.contract_no || '').trim(),
    product_name: String(row?.product_name || '').trim(),
    spec: String(row?.spec || '').trim(),
    unit: String(row?.unit || '').trim(),
    quantity: Number(row?.quantity || 0),
    unit_price: Number(row?.unit_price || 0),
    amount: Number(row?.amount || 0),
    note: String(row?.note || '').trim(),
  }
}

function availableStock(db: Database.Database, row: any, excludeId?: number) {
  const key = productKey(row)
  const stockIn = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND COALESCE(counts_inventory, 1) = 1
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
  `).get(key.productName, key.spec, key.unit) as { qty: number }
  const stockOut = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM stock_out_ledger
    WHERE deleted_at IS NULL
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
      AND (? IS NULL OR id != ?)
  `).get(key.productName, key.spec, key.unit, excludeId ?? null, excludeId ?? null) as { qty: number }
  const customerReturnQty = sumCustomerReturnQty(db, key.productName, key.spec, key.unit)
  const supplierReturnQty = sumSupplierReturnQty(db, key.productName, key.spec, key.unit)
  return Number(stockIn?.qty || 0) - (Number(stockOut?.qty || 0) - customerReturnQty) - supplierReturnQty
}

function formatSpecUnitLabel(spec: string, unit: string): string {
  const specLabel = spec || '无规格'
  const unitLabel = unit || '无单位'
  return `${specLabel} / ${unitLabel}`
}

function buildNoStockError(db: Database.Database, key: ReturnType<typeof productKey>, excludeId?: number): string {
  const variants = db.prepare(`
    SELECT DISTINCT COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit
    FROM stock_in_ledger
    WHERE deleted_at IS NULL AND COALESCE(counts_inventory, 1) = 1 AND product_name = ?
  `).all(key.productName) as Array<{ spec: string; unit: string }>

  const availableVariants: string[] = []
  for (const variant of variants) {
    const avail = availableStock(
      db,
      { product_name: key.productName, spec: variant.spec, unit: variant.unit },
      excludeId,
    )
    if (avail > 0) {
      availableVariants.push(`${formatSpecUnitLabel(variant.spec, variant.unit)}（可出库 ${avail}）`)
    }
  }

  if (availableVariants.length) {
    return `「${key.productName}」规格/单位与入库不一致（您填的是 ${formatSpecUnitLabel(key.spec, key.unit)}）。有库存的组合：${availableVariants.join('；')}`
  }
  return '该产品当前没有库存，不能出库'
}

function validateStockOut(db: Database.Database, row: any, excludeId?: number) {
  const key = productKey(row)
  const quantity = Number(row?.quantity || 0)
  assertStockOutCustomerExists(db, row?.customer_name)
  if (!String(row?.date || '').trim()) throw new Error('请填写日期')
  if (!key.productName) throw new Error('请选择库存产品')
  if (quantity <= 0) throw new Error('出库数量必须大于 0')
  const available = availableStock(db, row, excludeId)
  if (available <= 0) throw new Error(buildNoStockError(db, key, excludeId))
  if (quantity > available) throw new Error(`库存不足，当前可出库 ${available}`)
}

function deleteStockOutById(db: ReturnType<typeof getDb>, id: number) {
  const row = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id) as Record<string, any> | undefined
  if (!row || row.deleted_at) return
  deleteReceivableForStockOut(db, row)
  softDelete('stock_out_ledger', id)
  recalcInventoryForRows(row)
}

export function registerStockOutHandlers(): void {
  ipcMain.handle('stockOut:names', () => {
    return listCustomerProfileNames(getDb()).map(customer_name => ({ customer_name }))
  })

  ipcMain.handle('stockOut:list', (_e, params = {}) => {
    const db = getDb()
    const filters = normalizeLedgerFilters(params, 'customerName')
    const { customerName, page = 1, pageSize = 50, keyword = '' } = filters as any
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const dateFilter = buildDateFilterClause(filters)
    const rows = db.prepare(`
      SELECT stock_out_ledger.*, ${attachmentPreviewSql('stock_out_ledger')}
      FROM stock_out_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR category LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?)
        ${dateFilter.sql}
      ORDER BY ${buildDateOrderBy('stock_out_ledger.date')}
      LIMIT ? OFFSET ?
    `).all(customerName || '', customerName || '', like, like, like, like, like, like, like, ...dateFilter.params, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM stock_out_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR category LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?)
        ${dateFilter.sql}
    `).get(customerName || '', customerName || '', like, like, like, like, like, like, like, ...dateFilter.params) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  ipcMain.handle('stockOut:summary', (_e, params = {}) => {
    const db = getDb()
    const filters = normalizeLedgerFilters(params, 'customerName')
    const customerName = String(filters.customerName || '')
    const dateFilter = buildDateFilterClause(filters)
    if (customerName) {
      return db.prepare(`
        SELECT
          COUNT(*) as totalRecords,
          SUM(quantity) as totalQuantity,
          SUM(amount) as totalAmount
        FROM stock_out_ledger
        WHERE deleted_at IS NULL AND customer_name = ? ${dateFilter.sql}
      `).get(customerName, ...dateFilter.params)
    }
    return db.prepare(`
      SELECT
        COUNT(*) as totalRecords,
        SUM(quantity) as totalQuantity,
        SUM(amount) as totalAmount,
        COUNT(DISTINCT customer_name) as customerCount
      FROM stock_out_ledger WHERE deleted_at IS NULL ${dateFilter.sql}
    `).get(...dateFilter.params)
  })

  ipcMain.handle('stockOut:add', (_e, row) => {
    const db = getDb()
    const payload = normalizeStockOutRow(row)
    if (!payload.doc_no) payload.doc_no = generateDocNo('CK', 'stock_out_ledger', payload.date)
    ensureProductCatalog(payload)

    const newRow = db.transaction(() => {
      validateStockOut(db, payload)
      const result = db.prepare(`
        INSERT INTO stock_out_ledger (
          doc_no, customer_name, category, date, contract_no, product_name, spec, unit,
          quantity, unit_price, amount, note
        ) VALUES (
          @doc_no, @customer_name, @category, @date, @contract_no, @product_name, @spec, @unit,
          @quantity, @unit_price, @amount, @note
        )
      `).run(payload)
      const stockOutId = Number(result.lastInsertRowid)
      const inserted = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(stockOutId) as Record<string, any>
      createReceivableFromStockOut(db, inserted)
      return inserted
    })()

    logOperation('stock_out_ledger', Number(newRow.id), 'INSERT', null, newRow)
    recalcInventoryForRows(newRow)
    return db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(newRow.id)
  })

  ipcMain.handle('stockOut:update', (_e, { id, ...row }) => {
    const db = getDb()
    const oldRow = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id) as any
    const payload = normalizeStockOutRow(row)
    if (!payload.doc_no) payload.doc_no = oldRow?.doc_no || generateDocNo('CK', 'stock_out_ledger', payload.date)
    ensureProductCatalog(payload)

    const newRow = db.transaction(() => {
      validateStockOut(db, payload, id)
      db.prepare(`
        UPDATE stock_out_ledger SET
          doc_no=@doc_no, customer_name=@customer_name, category=@category, date=@date,
          contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
          quantity=@quantity, unit_price=@unit_price, amount=@amount,
          note=@note, updated_at=datetime('now','localtime')
        WHERE id=@id
      `).run({ ...payload, id })
      const updated = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id) as Record<string, any>
      syncReceivableFromStockOut(db, updated)
      return updated
    })()

    logOperation('stock_out_ledger', id, 'UPDATE', oldRow as object, newRow as object)
    recalcInventoryForRows(oldRow, newRow)
    return newRow
  })

  ipcMain.handle('stockOut:delete', (_e, id) => {
    try {
      deleteStockOutById(getDb(), id)
      cleanupOrphanAttachments()
      syncProductCatalogWithLedger()
      return { ok: true }
    } catch (error: any) {
      return { ok: false, error: error?.message || '删除失败' }
    }
  })

  ipcMain.handle('stockOut:deleteMany', (_e, ids: number[] = []) => {
    const db = getDb()
    const uniqueIds = [...new Set((ids || []).map(id => Number(id)).filter(id => id > 0))]
    let count = 0
    let lastError = ''
    for (const id of uniqueIds) {
      try {
        deleteStockOutById(db, id)
        count++
      } catch (error: any) {
        lastError = error?.message || '删除失败'
        break
      }
    }
    cleanupOrphanAttachments()
    syncProductCatalogWithLedger()
    if (count === uniqueIds.length) return { ok: true, count, total: uniqueIds.length }
    return { ok: false, count, total: uniqueIds.length, error: lastError || `仅删除 ${count}/${uniqueIds.length} 条` }
  })

  ipcMain.handle('stockOut:trash', () => {
    return getDb().prepare(`SELECT * FROM stock_out_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('stockOut:restore', (_e, id) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id)
    validateStockOut(db, row, id)
    restore('stock_out_ledger', id)
    recalcInventoryForRows(row)
    const restored = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id) as Record<string, any>
    syncReceivableFromStockOut(db, restored)
    return { ok: true }
  })
}
