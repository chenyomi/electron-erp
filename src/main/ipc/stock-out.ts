import { ipcMain } from 'electron'
import { getDb } from '../db'
import { buildDateFilterClause, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import { attachmentPreviewSql, withAttachmentPreviews } from './attachments'
import { ensureProductCatalog, generateDocNo, recalcInventoryForRows } from './stock-business'

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

function availableStock(row: any, excludeId?: number) {
  const db = getDb()
  const key = productKey(row)
  const stockIn = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
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
  return Number(stockIn?.qty || 0) - Number(stockOut?.qty || 0)
}

function validateStockOut(row: any, excludeId?: number) {
  const key = productKey(row)
  const quantity = Number(row?.quantity || 0)
  if (!String(row?.customer_name || '').trim()) throw new Error('请填写客户')
  if (!String(row?.date || '').trim()) throw new Error('请填写日期')
  if (!key.productName) throw new Error('请选择库存产品')
  if (quantity <= 0) throw new Error('出库数量必须大于 0')
  const available = availableStock(row, excludeId)
  if (available <= 0) throw new Error('该产品当前没有库存，不能出库')
  if (quantity > available) throw new Error(`库存不足，当前可出库 ${available}`)
}

export function registerStockOutHandlers(): void {
  ipcMain.handle('stockOut:names', () => {
    const db = getDb()
    return db.prepare(`
      SELECT DISTINCT customer_name FROM stock_out_ledger
      WHERE deleted_at IS NULL ORDER BY customer_name
    `).all()
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
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?)
        ${dateFilter.sql}
      ORDER BY date DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(customerName || '', customerName || '', like, like, like, like, like, like, ...dateFilter.params, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM stock_out_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?)
        ${dateFilter.sql}
    `).get(customerName || '', customerName || '', like, like, like, like, like, like, ...dateFilter.params) as { total: number }
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
    validateStockOut(payload)
    ensureProductCatalog(payload)
    const result = db.prepare(`
      INSERT INTO stock_out_ledger (
        doc_no, customer_name, category, date, contract_no, product_name, spec, unit,
        quantity, unit_price, amount, note
      ) VALUES (
        @doc_no, @customer_name, @category, @date, @contract_no, @product_name, @spec, @unit,
        @quantity, @unit_price, @amount, @note
      )
    `).run(payload)
    const newRow = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(result.lastInsertRowid)
    logOperation('stock_out_ledger', result.lastInsertRowid as number, 'INSERT', null, newRow as object)
    recalcInventoryForRows(newRow)
    return newRow
  })

  ipcMain.handle('stockOut:update', (_e, { id, ...row }) => {
    const db = getDb()
    const oldRow = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id) as any
    const payload = normalizeStockOutRow(row)
    if (!payload.doc_no) payload.doc_no = oldRow?.doc_no || generateDocNo('CK', 'stock_out_ledger', payload.date)
    validateStockOut(payload, id)
    ensureProductCatalog(payload)
    db.prepare(`
      UPDATE stock_out_ledger SET
        doc_no=@doc_no, customer_name=@customer_name, category=@category, date=@date,
        contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
        quantity=@quantity, unit_price=@unit_price, amount=@amount,
        note=@note, updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({ ...payload, id })
    const newRow = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id)
    logOperation('stock_out_ledger', id, 'UPDATE', oldRow as object, newRow as object)
    recalcInventoryForRows(oldRow, newRow)
    return newRow
  })

  ipcMain.handle('stockOut:delete', (_e, id) => {
    const row = getDb().prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id)
    softDelete('stock_out_ledger', id)
    recalcInventoryForRows(row)
    return { ok: true }
  })
  ipcMain.handle('stockOut:trash', () => {
    return getDb().prepare(`SELECT * FROM stock_out_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('stockOut:restore', (_e, id) => {
    const row = getDb().prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id)
    validateStockOut(row, id)
    restore('stock_out_ledger', id)
    recalcInventoryForRows(row)
    return { ok: true }
  })
}
