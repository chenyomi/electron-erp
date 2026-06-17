import { ipcMain } from 'electron'
import { getDb } from '../db'
import { logOperation, softDelete, restore } from './helpers'
import { attachmentPreviewSql, withAttachmentPreviews } from './attachments'

export function registerStockOutHandlers(): void {
  ipcMain.handle('stockOut:names', () => {
    const db = getDb()
    return db.prepare(`
      SELECT DISTINCT customer_name FROM stock_out_ledger
      WHERE deleted_at IS NULL ORDER BY customer_name
    `).all()
  })

  ipcMain.handle('stockOut:list', (_e, { customerName, page = 1, pageSize = 50, keyword = '' } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const rows = db.prepare(`
      SELECT stock_out_ledger.*, ${attachmentPreviewSql('stock_out_ledger')}
      FROM stock_out_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?)
      ORDER BY date DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(customerName || '', customerName || '', like, like, like, like, like, like, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM stock_out_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?)
    `).get(customerName || '', customerName || '', like, like, like, like, like, like) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  ipcMain.handle('stockOut:summary', (_e, customerName = '') => {
    const db = getDb()
    if (customerName) {
      return db.prepare(`
        SELECT
          COUNT(*) as totalRecords,
          SUM(quantity) as totalQuantity,
          SUM(amount) as totalAmount
        FROM stock_out_ledger
        WHERE deleted_at IS NULL AND customer_name = ?
      `).get(customerName)
    }
    return db.prepare(`
      SELECT
        COUNT(*) as totalRecords,
        SUM(quantity) as totalQuantity,
        SUM(amount) as totalAmount,
        COUNT(DISTINCT customer_name) as customerCount
      FROM stock_out_ledger WHERE deleted_at IS NULL
    `).get()
  })

  ipcMain.handle('stockOut:add', (_e, row) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO stock_out_ledger (
        customer_name, category, date, contract_no, product_name, spec, unit,
        quantity, unit_price, amount, note
      ) VALUES (
        @customer_name, @category, @date, @contract_no, @product_name, @spec, @unit,
        @quantity, @unit_price, @amount, @note
      )
    `).run(row)
    const newRow = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(result.lastInsertRowid)
    logOperation('stock_out_ledger', result.lastInsertRowid as number, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('stockOut:update', (_e, { id, ...row }) => {
    const db = getDb()
    const oldRow = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id)
    db.prepare(`
      UPDATE stock_out_ledger SET
        customer_name=@customer_name, category=@category, date=@date,
        contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
        quantity=@quantity, unit_price=@unit_price, amount=@amount,
        note=@note, updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({ ...row, id })
    const newRow = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(id)
    logOperation('stock_out_ledger', id, 'UPDATE', oldRow as object, newRow as object)
    return newRow
  })

  ipcMain.handle('stockOut:delete', (_e, id) => { softDelete('stock_out_ledger', id); return { ok: true } })
  ipcMain.handle('stockOut:trash', () => {
    return getDb().prepare(`SELECT * FROM stock_out_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('stockOut:restore', (_e, id) => { restore('stock_out_ledger', id); return { ok: true } })
}
