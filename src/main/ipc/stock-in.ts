import { ipcMain } from 'electron'
import { getDb } from '../db'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import { attachmentPreviewSql, cleanupOrphanAttachments, withAttachmentPreviews } from './attachments'
import { ensureProductCatalog, generateDocNo, recalcInventoryForRows, syncProductCatalogWithLedger } from './stock-business'
import { assertSupplierProfileExists, listAllSupplierNames } from './supplier-profile'

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

function validateStockInRow(db: ReturnType<typeof getDb>, row: any) {
  if (!String(row?.date || '').trim()) throw new Error('请填写日期')
  const supplierName = String(row?.supplier_name || '').trim()
  if (supplierName) assertSupplierProfileExists(db, supplierName)
  if (!String(row?.product_name || '').trim()) throw new Error('请填写产品名称')
  if (!String(row?.spec || '').trim()) throw new Error('请填写规格（出库须与入库完全一致，用于库存匹配）')
  if (!String(row?.unit || '').trim()) throw new Error('请填写单位（出库须与入库完全一致，用于库存匹配）')
  if (Number(row?.quantity || 0) <= 0) throw new Error('入库数量必须大于 0')
}

export function registerStockInHandlers(): void {
  ipcMain.handle('stockIn:names', () => {
    return listAllSupplierNames(getDb()).map(supplier_name => ({ supplier_name }))
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
      ORDER BY ${buildDateOrderBy('stock_in_ledger.date')}
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
    validateStockInRow(db, payload)
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
    const stockInId = Number(result.lastInsertRowid)
    const newRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(stockInId) as Record<string, any>
    logOperation('stock_in_ledger', stockInId, 'INSERT', null, newRow as object)
    recalcInventoryForRows(newRow)
    return db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(stockInId)
  })

  ipcMain.handle('stockIn:update', (_e, { id, ...row }) => {
    const db = getDb()
    const oldRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as any
    const payload = normalizeStockInRow(row, oldRow?.doc_no || generateDocNo('RK', 'stock_in_ledger', row?.date))
    validateStockInRow(db, payload)
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
    const newRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
    logOperation('stock_in_ledger', id, 'UPDATE', oldRow as object, newRow as object)
    recalcInventoryForRows(oldRow, newRow)
    return newRow
  })

  ipcMain.handle('stockIn:delete', (_e, id) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
    softDelete('stock_in_ledger', id)
    recalcInventoryForRows(row)
    cleanupOrphanAttachments()
    syncProductCatalogWithLedger()
    return { ok: true }
  })

  ipcMain.handle('stockIn:deleteMany', (_e, ids: number[] = []) => {
    const db = getDb()
    const uniqueIds = [...new Set((ids || []).map(id => Number(id)).filter(id => id > 0))]
    for (const id of uniqueIds) {
      const row = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
      softDelete('stock_in_ledger', id)
      recalcInventoryForRows(row)
    }
    cleanupOrphanAttachments()
    syncProductCatalogWithLedger()
    return { ok: true, count: uniqueIds.length }
  })
  ipcMain.handle('stockIn:trash', () => {
    return getDb().prepare(`SELECT * FROM stock_in_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('stockIn:restore', (_e, id) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
    restore('stock_in_ledger', id)
    recalcInventoryForRows(row)
    return { ok: true }
  })
}
