import { ipcMain } from 'electron'
import { getDb } from '../db'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import { attachmentPreviewSql, withAttachmentPreviews } from './attachments'
import { recalculateBillsBalances, getLastLedgerBalance } from './ledger-balance'

function normalizeBillsRow(row: any) {
  return {
    date: String(row.date || ''),
    description: String(row.description || ''),
    amount_in: Number(row.amount_in || 0),
    amount_out: Number(row.amount_out || 0),
    balance: 0,
    note: String(row.note || ''),
  }
}

export function registerBillsHandlers(): void {
  ipcMain.handle('bills:list', (_e, params = {}) => {
    const { page = 1, pageSize = 50, keyword = '' } = params as any
    const filters = normalizeLedgerFilters(params)
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const dateWhere = buildDateFilterClause(filters)
    const rows = db.prepare(`
      SELECT acceptance_bills.*, ${attachmentPreviewSql('acceptance_bills')}
      FROM acceptance_bills
      WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
      ${dateWhere.sql}
      ORDER BY ${buildDateOrderBy('acceptance_bills.date')} LIMIT ? OFFSET ?
    `).all(like, like, like, ...dateWhere.params, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM acceptance_bills
      WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
      ${dateWhere.sql}
    `).get(like, like, like, ...dateWhere.params) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  ipcMain.handle('bills:summary', (_e, params = {}) => {
    const filters = normalizeLedgerFilters(params)
    const dateWhere = buildDateFilterClause(filters)
    const db = getDb()
    const totals = db.prepare(`
      SELECT SUM(amount_in) as totalIn, SUM(amount_out) as totalOut
      FROM acceptance_bills WHERE deleted_at IS NULL ${dateWhere.sql}
    `).get(...dateWhere.params) as { totalIn?: number; totalOut?: number }
    return {
      totalIn: totals?.totalIn || 0,
      totalOut: totals?.totalOut || 0,
      lastBalance: getLastLedgerBalance(db, 'acceptance_bills', dateWhere.sql, dateWhere.params),
    }
  })

  ipcMain.handle('bills:add', (_e, row) => {
    const db = getDb()
    const payload = normalizeBillsRow(row)
    const r = db.prepare(`
      INSERT INTO acceptance_bills (date, description, amount_in, amount_out, balance, note)
      VALUES (@date, @description, @amount_in, @amount_out, @balance, @note)
    `).run(payload)
    recalculateBillsBalances(db)
    const newRow = db.prepare('SELECT * FROM acceptance_bills WHERE id = ?').get(r.lastInsertRowid)
    logOperation('acceptance_bills', r.lastInsertRowid as number, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('bills:update', (_e, { id, ...row }) => {
    const db = getDb()
    const old = db.prepare('SELECT * FROM acceptance_bills WHERE id = ?').get(id)
    const payload = { ...normalizeBillsRow(row), id }
    db.prepare(`
      UPDATE acceptance_bills SET date=@date, description=@description,
        amount_in=@amount_in, amount_out=@amount_out, balance=@balance,
        note=@note, updated_at=datetime('now','localtime') WHERE id=@id
    `).run(payload)
    recalculateBillsBalances(db)
    const newRow = db.prepare('SELECT * FROM acceptance_bills WHERE id = ?').get(id)
    logOperation('acceptance_bills', id, 'UPDATE', old as object, newRow as object)
    return newRow
  })

  ipcMain.handle('bills:delete', (_e, id) => {
    softDelete('acceptance_bills', id)
    recalculateBillsBalances(getDb())
    return { ok: true }
  })
  ipcMain.handle('bills:trash', () => {
    return getDb().prepare(`SELECT * FROM acceptance_bills WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('bills:restore', (_e, id) => {
    restore('acceptance_bills', id)
    recalculateBillsBalances(getDb())
    return { ok: true }
  })
}
