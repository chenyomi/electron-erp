import { ipcMain } from 'electron'
import { getDb } from '../db'
import { logOperation, softDelete, restore } from './helpers'
import { attachmentPreviewSql, withAttachmentPreviews } from './attachments'

export function registerStockInHandlers(): void {
  ipcMain.handle('stockIn:names', () => {
    const db = getDb()
    return db.prepare(`
      SELECT DISTINCT supplier_name FROM stock_in_ledger
      WHERE deleted_at IS NULL ORDER BY supplier_name
    `).all()
  })

  ipcMain.handle('stockIn:list', (_e, { supplierName, page = 1, pageSize = 50, keyword = '' } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const rows = db.prepare(`
      SELECT stock_in_ledger.*, ${attachmentPreviewSql('stock_in_ledger')}
      FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR supplier_name LIKE ?)
      ORDER BY date DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(supplierName || '', supplierName || '', like, like, like, like, like, like, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR supplier_name LIKE ?)
    `).get(supplierName || '', supplierName || '', like, like, like, like, like, like) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  ipcMain.handle('stockIn:summary', (_e, supplierName = '') => {
    const db = getDb()
    if (supplierName) {
      return db.prepare(`
        SELECT
          COUNT(*) as totalRecords,
          SUM(quantity) as totalQuantity,
          SUM(amount) as totalAmount
        FROM stock_in_ledger
        WHERE deleted_at IS NULL AND supplier_name = ?
      `).get(supplierName)
    }
    return db.prepare(`
      SELECT
        COUNT(*) as totalRecords,
        SUM(quantity) as totalQuantity,
        SUM(amount) as totalAmount,
        COUNT(DISTINCT supplier_name) as supplierCount
      FROM stock_in_ledger WHERE deleted_at IS NULL
    `).get()
  })

  ipcMain.handle('stockIn:add', (_e, row) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO stock_in_ledger (
        supplier_name, category, date, contract_no, product_name, spec, unit,
        quantity, unit_price, amount, tax_rate, tax_amount, invoice_amount, note
      ) VALUES (
        @supplier_name, @category, @date, @contract_no, @product_name, @spec, @unit,
        @quantity, @unit_price, @amount, @tax_rate, @tax_amount, @invoice_amount, @note
      )
    `).run(row)
    const newRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(result.lastInsertRowid)
    logOperation('stock_in_ledger', result.lastInsertRowid as number, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('stockIn:update', (_e, { id, ...row }) => {
    const db = getDb()
    const oldRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id)
    db.prepare(`
      UPDATE stock_in_ledger SET
        supplier_name=@supplier_name, category=@category, date=@date,
        contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
        quantity=@quantity, unit_price=@unit_price, amount=@amount,
        tax_rate=@tax_rate, tax_amount=@tax_amount, invoice_amount=@invoice_amount,
        note=@note, updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({ ...row, id })
    const newRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id)
    logOperation('stock_in_ledger', id, 'UPDATE', oldRow as object, newRow as object)
    return newRow
  })

  ipcMain.handle('stockIn:delete', (_e, id) => { softDelete('stock_in_ledger', id); return { ok: true } })
  ipcMain.handle('stockIn:trash', () => {
    return getDb().prepare(`SELECT * FROM stock_in_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('stockIn:restore', (_e, id) => { restore('stock_in_ledger', id); return { ok: true } })
}
