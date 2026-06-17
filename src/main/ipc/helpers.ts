import { getDb } from '../db'
import Database from 'better-sqlite3'
import { getCurrentUser } from './auth'

export type TableName = 'cash_ledger' | 'bank_ledger' | 'acceptance_bills' | 'customer_ledger' | 'other_ledger' | 'stock_in_ledger' | 'stock_out_ledger'

export function logOperation(
  tableName: TableName,
  recordId: number,
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE',
  oldData: object | null,
  newData: object | null,
  operator = ''
): void {
  const db = getDb()
  const currentUser = getCurrentUser()
  const logOperator = operator || currentUser?.displayName || currentUser?.username || ''
  db.prepare(`
    INSERT INTO operation_logs (table_name, record_id, action, old_data, new_data, operator)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    tableName,
    recordId,
    action,
    oldData ? JSON.stringify(oldData) : null,
    newData ? JSON.stringify(newData) : null,
    logOperator
  )
}

export function softDelete(tableName: TableName, id: number): void {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id)
  if (!row) return
  db.prepare(`UPDATE ${tableName} SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(id)
  logOperation(tableName, id, 'DELETE', row as object, null)
}

export function restore(tableName: TableName, id: number): void {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id)
  if (!row) return
  db.prepare(`UPDATE ${tableName} SET deleted_at = NULL WHERE id = ?`).run(id)
  logOperation(tableName, id, 'RESTORE', null, row as object)
}
