import { getDb } from '../db'
import Database from 'better-sqlite3'
import { getCurrentUser } from './auth'
import { buildDateOrderBy, ledgerDateSortSql, normalizeLedgerDateText } from '../../common/ledger-date'
import { buildOperationDescription, getOperationClientContext } from '../operation-log'

export type TableName =
  | 'cash_ledger'
  | 'bank_ledger'
  | 'acceptance_bills'
  | 'customer_ledger'
  | 'customer_profiles'
  | 'other_ledger'
  | 'stock_in_ledger'
  | 'stock_out_ledger'

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
  const description = buildOperationDescription(tableName, action, oldData, newData)
  const { clientIp, deviceInfo } = getOperationClientContext()
  db.prepare(`
    INSERT INTO operation_logs (
      table_name, record_id, action, old_data, new_data, operator, description, client_ip, device_info
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tableName,
    recordId,
    action,
    oldData ? JSON.stringify(oldData) : null,
    newData ? JSON.stringify(newData) : null,
    logOperator,
    description,
    clientIp,
    deviceInfo,
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

export interface LedgerFilterParams {
  keyword?: string
  customerName?: string
  supplierName?: string
  year?: string | number
  month?: string | number
  startDate?: string
  endDate?: string
}

export function normalizeLedgerFilters(value: any = {}, legacyNameField?: 'customerName' | 'supplierName'): LedgerFilterParams {
  if (typeof value === 'string') {
    return legacyNameField ? { [legacyNameField]: value } : {}
  }
  return value && typeof value === 'object' ? value : {}
}

export function normalizeDateText(value: any) {
  return normalizeLedgerDateText(value)
}

export function normalizedSqlDate(column = 'date') {
  return ledgerDateSortSql(column)
}

export { buildDateOrderBy, ledgerDateSortSql }

export function buildDateFilterClause(filters: LedgerFilterParams, column = 'date') {
  const clauses: string[] = []
  const params: any[] = []
  const dateExpr = normalizedSqlDate(column)
  const year = String(filters.year || '').trim()
  const month = String(filters.month || '').trim().padStart(2, '0')
  const startDate = normalizeDateText(filters.startDate)
  const endDate = normalizeDateText(filters.endDate)

  if (year) {
    clauses.push(`substr(${dateExpr}, 1, 4) = ?`)
    params.push(year)
  }
  if (filters.month !== undefined && String(filters.month).trim()) {
    clauses.push(`substr(${dateExpr}, 6, 2) = ?`)
    params.push(month)
  }
  if (startDate) {
    clauses.push(`${dateExpr} >= ?`)
    params.push(startDate)
  }
  if (endDate) {
    clauses.push(`${dateExpr} <= ?`)
    params.push(endDate)
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  }
}
