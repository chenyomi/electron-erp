import { ipcMain } from 'electron'
import { getDb } from '../db'
import { buildDateFilterClause, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import { attachmentPreviewSql, withAttachmentPreviews } from './attachments'

export function registerBankHandlers(): void {
  ipcMain.handle('bank:list', (_e, params = {}) => {
    const { page = 1, pageSize = 50, keyword = '' } = params as any
    const filters = normalizeLedgerFilters(params)
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const dateWhere = buildDateFilterClause(filters)
    const rows = db.prepare(`
      SELECT bank_ledger.*, ${attachmentPreviewSql('bank_ledger')}
      FROM bank_ledger
      WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
      ${dateWhere.sql}
      ORDER BY date ASC, id ASC LIMIT ? OFFSET ?
    `).all(like, like, like, ...dateWhere.params, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM bank_ledger
      WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
      ${dateWhere.sql}
    `).get(like, like, like, ...dateWhere.params) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  ipcMain.handle('bank:summary', (_e, params = {}) => {
    const filters = normalizeLedgerFilters(params)
    const dateWhere = buildDateFilterClause(filters)
    const db = getDb()
    return db.prepare(`
      SELECT SUM(amount_in) as totalIn, SUM(amount_out) as totalOut
      FROM bank_ledger WHERE deleted_at IS NULL ${dateWhere.sql}
    `).get(...dateWhere.params)
  })

  ipcMain.handle('bank:monthly', () => {
    const db = getDb()
    return db.prepare(`
      SELECT substr(date,1,7) as month, SUM(amount_in) as income, SUM(amount_out) as expense
      FROM bank_ledger WHERE deleted_at IS NULL
      GROUP BY substr(date,1,7) ORDER BY month ASC
    `).all()
  })

  ipcMain.handle('bank:add', (_e, row) => {
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO bank_ledger (date, description, amount_in, amount_out, balance, note)
      VALUES (@date, @description, @amount_in, @amount_out, @balance, @note)
    `).run(row)
    const newRow = db.prepare('SELECT * FROM bank_ledger WHERE id = ?').get(r.lastInsertRowid)
    logOperation('bank_ledger', r.lastInsertRowid as number, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('bank:update', (_e, { id, ...row }) => {
    const db = getDb()
    const old = db.prepare('SELECT * FROM bank_ledger WHERE id = ?').get(id)
    db.prepare(`
      UPDATE bank_ledger SET date=@date, description=@description,
        amount_in=@amount_in, amount_out=@amount_out, balance=@balance,
        note=@note, updated_at=datetime('now','localtime') WHERE id=@id
    `).run({ ...row, id })
    const newRow = db.prepare('SELECT * FROM bank_ledger WHERE id = ?').get(id)
    logOperation('bank_ledger', id, 'UPDATE', old as object, newRow as object)
    return newRow
  })

  ipcMain.handle('bank:delete', (_e, id) => { softDelete('bank_ledger', id); return { ok: true } })
  ipcMain.handle('bank:trash', () => {
    return getDb().prepare(`SELECT * FROM bank_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('bank:restore', (_e, id) => { restore('bank_ledger', id); return { ok: true } })
}
