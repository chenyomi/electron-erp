import { ipcMain } from 'electron'
import { getDb } from '../db'
import { buildDateFilterClause, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import { attachmentPreviewSql, withAttachmentPreviews } from './attachments'
import { ensureProductCatalog, generateDocNo, recalcInventoryForRows } from './stock-business'

function normalizeStockInRow(row: any, fallbackDocNo = '') {
  return {
    doc_no: String(row?.doc_no || fallbackDocNo || '').trim(),
    supplier_name: String(row?.supplier_name || '').trim(),
    category: String(row?.category || '').trim(),
    date: String(row?.date || '').trim(),
    contract_no: String(row?.contract_no || '').trim(),
    product_name: String(row?.product_name || '').trim(),
    spec: String(row?.spec || '').trim(),
    unit: String(row?.unit || '').trim(),
    quantity: Number(row?.quantity || 0),
    unit_price: Number(row?.unit_price || 0),
    amount: Number(row?.amount || 0),
    tax_rate: Number(row?.tax_rate || 0),
    tax_amount: Number(row?.tax_amount || 0),
    invoice_amount: Number(row?.invoice_amount || 0),
    note: String(row?.note || '').trim(),
  }
}

export function registerStockInHandlers(): void {
  ipcMain.handle('stockIn:names', () => {
    const db = getDb()
    return db.prepare(`
      SELECT DISTINCT supplier_name FROM stock_in_ledger
      WHERE deleted_at IS NULL ORDER BY supplier_name
    `).all()
  })

  ipcMain.handle('stockIn:list', (_e, params = {}) => {
    const { supplierName, page = 1, pageSize = 50, keyword = '' } = params as any
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const filters = normalizeLedgerFilters(params, 'supplierName')
    const dateWhere = buildDateFilterClause(filters)
    const rows = db.prepare(`
      SELECT stock_in_ledger.*, ${attachmentPreviewSql('stock_in_ledger')}
      FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR supplier_name LIKE ?)
        ${dateWhere.sql}
      ORDER BY date DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(supplierName || '', supplierName || '', like, like, like, like, like, like, ...dateWhere.params, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR supplier_name LIKE ?)
        ${dateWhere.sql}
    `).get(supplierName || '', supplierName || '', like, like, like, like, like, like, ...dateWhere.params) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  ipcMain.handle('stockIn:summary', (_e, params: any = {}) => {
    const filters = normalizeLedgerFilters(params, 'supplierName')
    const supplierName = filters.supplierName || ''
    const dateWhere = buildDateFilterClause(filters)
    const db = getDb()
    if (supplierName) {
      return db.prepare(`
        SELECT
          COUNT(*) as totalRecords,
          SUM(quantity) as totalQuantity,
          SUM(amount) as totalAmount
        FROM stock_in_ledger
        WHERE deleted_at IS NULL AND supplier_name = ? ${dateWhere.sql}
      `).get(supplierName, ...dateWhere.params)
    }
    return db.prepare(`
      SELECT
        COUNT(*) as totalRecords,
        SUM(quantity) as totalQuantity,
        SUM(amount) as totalAmount,
        COUNT(DISTINCT supplier_name) as supplierCount
      FROM stock_in_ledger WHERE deleted_at IS NULL ${dateWhere.sql}
    `).get(...dateWhere.params)
  })

  ipcMain.handle('stockIn:add', (_e, row) => {
    const db = getDb()
    const payload = normalizeStockInRow(row, generateDocNo('RK', 'stock_in_ledger', row?.date))
    ensureProductCatalog(payload)
    const result = db.prepare(`
      INSERT INTO stock_in_ledger (
        doc_no, supplier_name, category, date, contract_no, product_name, spec, unit,
        quantity, unit_price, amount, tax_rate, tax_amount, invoice_amount, note
      ) VALUES (
        @doc_no, @supplier_name, @category, @date, @contract_no, @product_name, @spec, @unit,
        @quantity, @unit_price, @amount, @tax_rate, @tax_amount, @invoice_amount, @note
      )
    `).run(payload)
    const newRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(result.lastInsertRowid)
    logOperation('stock_in_ledger', result.lastInsertRowid as number, 'INSERT', null, newRow as object)
    recalcInventoryForRows(newRow)
    return newRow
  })

  ipcMain.handle('stockIn:update', (_e, { id, ...row }) => {
    const db = getDb()
    const oldRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as any
    const payload = normalizeStockInRow(row, oldRow?.doc_no || generateDocNo('RK', 'stock_in_ledger', row?.date))
    ensureProductCatalog(payload)
    db.prepare(`
      UPDATE stock_in_ledger SET
        doc_no=@doc_no, supplier_name=@supplier_name, category=@category, date=@date,
        contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
        quantity=@quantity, unit_price=@unit_price, amount=@amount,
        tax_rate=@tax_rate, tax_amount=@tax_amount, invoice_amount=@invoice_amount,
        note=@note, updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({ ...payload, id })
    const newRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id)
    logOperation('stock_in_ledger', id, 'UPDATE', oldRow as object, newRow as object)
    recalcInventoryForRows(oldRow, newRow)
    return newRow
  })

  ipcMain.handle('stockIn:delete', (_e, id) => {
    const row = getDb().prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id)
    softDelete('stock_in_ledger', id)
    recalcInventoryForRows(row)
    return { ok: true }
  })
  ipcMain.handle('stockIn:trash', () => {
    return getDb().prepare(`SELECT * FROM stock_in_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('stockIn:restore', (_e, id) => {
    const row = getDb().prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id)
    restore('stock_in_ledger', id)
    recalcInventoryForRows(row)
    return { ok: true }
  })
}
