import { ipcMain } from 'electron'
import { getDb } from '../db'
import { logOperation, softDelete, restore } from './helpers'
import { attachmentPreviewSql, withAttachmentPreviews } from './attachments'

export function registerBillsHandlers(): void {
  ipcMain.handle('bills:list', (_e, { page = 1, pageSize = 50, keyword = '' } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const rows = db.prepare(`
      SELECT acceptance_bills.*, ${attachmentPreviewSql('acceptance_bills')}
      FROM acceptance_bills
      WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
      ORDER BY date ASC, id ASC LIMIT ? OFFSET ?
    `).all(like, like, like, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM acceptance_bills
      WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
    `).get(like, like, like) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  ipcMain.handle('bills:summary', () => {
    const db = getDb()
    return db.prepare(`
      SELECT SUM(amount_in) as totalIn, SUM(amount_out) as totalOut
      FROM acceptance_bills WHERE deleted_at IS NULL
    `).get()
  })

  ipcMain.handle('bills:add', (_e, row) => {
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO acceptance_bills (date, description, amount_in, amount_out, balance, note)
      VALUES (@date, @description, @amount_in, @amount_out, @balance, @note)
    `).run(row)
    const newRow = db.prepare('SELECT * FROM acceptance_bills WHERE id = ?').get(r.lastInsertRowid)
    logOperation('acceptance_bills', r.lastInsertRowid as number, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('bills:update', (_e, { id, ...row }) => {
    const db = getDb()
    const old = db.prepare('SELECT * FROM acceptance_bills WHERE id = ?').get(id)
    db.prepare(`
      UPDATE acceptance_bills SET date=@date, description=@description,
        amount_in=@amount_in, amount_out=@amount_out, balance=@balance,
        note=@note, updated_at=datetime('now','localtime') WHERE id=@id
    `).run({ ...row, id })
    const newRow = db.prepare('SELECT * FROM acceptance_bills WHERE id = ?').get(id)
    logOperation('acceptance_bills', id, 'UPDATE', old as object, newRow as object)
    return newRow
  })

  ipcMain.handle('bills:delete', (_e, id) => { softDelete('acceptance_bills', id); return { ok: true } })
  ipcMain.handle('bills:trash', () => {
    return getDb().prepare(`SELECT * FROM acceptance_bills WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('bills:restore', (_e, id) => { restore('acceptance_bills', id); return { ok: true } })
}
