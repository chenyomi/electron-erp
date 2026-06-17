import { ipcMain } from 'electron'
import { getDb } from '../db'
import { logOperation, softDelete, restore } from './helpers'
import { attachmentPreviewSql, withAttachmentPreviews } from './attachments'

export function registerCashHandlers(): void {
  // 获取列表
  ipcMain.handle('cash:list', (_e, { page = 1, pageSize = 50, keyword = '' } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const rows = db.prepare(`
      SELECT cash_ledger.*, ${attachmentPreviewSql('cash_ledger')}
      FROM cash_ledger
      WHERE deleted_at IS NULL
        AND (description LIKE ? OR operator LIKE ? OR note LIKE ? OR date LIKE ?)
      ORDER BY date ASC, id ASC
      LIMIT ? OFFSET ?
    `).all(like, like, like, like, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM cash_ledger
      WHERE deleted_at IS NULL
        AND (description LIKE ? OR operator LIKE ? OR note LIKE ? OR date LIKE ?)
    `).get(like, like, like, like) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  // 汇总
  ipcMain.handle('cash:summary', () => {
    const db = getDb()
    return db.prepare(`
      SELECT
        SUM(income)  as totalIncome,
        SUM(expense) as totalExpense,
        MAX(balance) as lastBalance
      FROM cash_ledger WHERE deleted_at IS NULL
    `).get()
  })

  // 月度汇总（图表用）
  ipcMain.handle('cash:monthly', () => {
    const db = getDb()
    return db.prepare(`
      SELECT
        substr(date, 1, 7) as month,
        SUM(income)  as income,
        SUM(expense) as expense
      FROM cash_ledger WHERE deleted_at IS NULL
      GROUP BY substr(date, 1, 7)
      ORDER BY month ASC
    `).all()
  })

  // 新增
  ipcMain.handle('cash:add', (_e, row) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO cash_ledger (date, income, description, expense, operator, balance, note)
      VALUES (@date, @income, @description, @expense, @operator, @balance, @note)
    `)
    const result = stmt.run(row)
    const newRow = db.prepare('SELECT * FROM cash_ledger WHERE id = ?').get(result.lastInsertRowid)
    logOperation('cash_ledger', result.lastInsertRowid as number, 'INSERT', null, newRow as object)
    return newRow
  })

  // 修改
  ipcMain.handle('cash:update', (_e, { id, ...row }) => {
    const db = getDb()
    const oldRow = db.prepare('SELECT * FROM cash_ledger WHERE id = ?').get(id)
    db.prepare(`
      UPDATE cash_ledger
      SET date=@date, income=@income, description=@description,
          expense=@expense, operator=@operator, balance=@balance,
          note=@note, updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({ ...row, id })
    const newRow = db.prepare('SELECT * FROM cash_ledger WHERE id = ?').get(id)
    logOperation('cash_ledger', id, 'UPDATE', oldRow as object, newRow as object)
    return newRow
  })

  // 软删除
  ipcMain.handle('cash:delete', (_e, id) => {
    softDelete('cash_ledger', id)
    return { ok: true }
  })

  // 回收站列表
  ipcMain.handle('cash:trash', () => {
    const db = getDb()
    return db.prepare(`SELECT * FROM cash_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })

  // 恢复
  ipcMain.handle('cash:restore', (_e, id) => {
    restore('cash_ledger', id)
    return { ok: true }
  })
}
