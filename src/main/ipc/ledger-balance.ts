import type Database from 'better-sqlite3'
import { buildDateOrderBy } from './helpers'

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

type CashRow = { id: number; income: number; expense: number; balance?: number }
type AmountRow = { id: number; amount_in: number; amount_out: number; balance?: number }

function inferOpeningFromFirstRow(
  firstRow: CashRow | AmountRow | undefined,
  mode: 'cash' | 'amount',
): number {
  if (!firstRow) return 0
  const delta = mode === 'cash'
    ? Number((firstRow as CashRow).income || 0) - Number((firstRow as CashRow).expense || 0)
    : Number((firstRow as AmountRow).amount_in || 0) - Number((firstRow as AmountRow).amount_out || 0)
  return roundMoney(Number(firstRow.balance || 0) - delta)
}

export function recalculateCashBalances(db: Database.Database): number {
  const rows = db.prepare(`
    SELECT id, income, expense, balance
    FROM cash_ledger
    WHERE deleted_at IS NULL
    ORDER BY ${buildDateOrderBy('date', 'ASC')}, id ASC
  `).all() as CashRow[]

  let balance = inferOpeningFromFirstRow(rows[0], 'cash')
  const update = db.prepare(`UPDATE cash_ledger SET balance = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
  for (const row of rows) {
    balance += Number(row.income || 0) - Number(row.expense || 0)
    update.run(roundMoney(balance), row.id)
  }
  return balance
}

export function recalculateBankBalances(db: Database.Database): number {
  const rows = db.prepare(`
    SELECT id, amount_in, amount_out, balance
    FROM bank_ledger
    WHERE deleted_at IS NULL
    ORDER BY ${buildDateOrderBy('date', 'ASC')}, id ASC
  `).all() as AmountRow[]

  let balance = inferOpeningFromFirstRow(rows[0], 'amount')
  const update = db.prepare(`UPDATE bank_ledger SET balance = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
  for (const row of rows) {
    balance += Number(row.amount_in || 0) - Number(row.amount_out || 0)
    update.run(roundMoney(balance), row.id)
  }
  return balance
}

export function recalculateBillsBalances(db: Database.Database): number {
  const rows = db.prepare(`
    SELECT id, amount_in, amount_out, balance
    FROM acceptance_bills
    WHERE deleted_at IS NULL
    ORDER BY ${buildDateOrderBy('date', 'ASC')}, id ASC
  `).all() as AmountRow[]

  let balance = inferOpeningFromFirstRow(rows[0], 'amount')
  const update = db.prepare(`UPDATE acceptance_bills SET balance = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
  for (const row of rows) {
    balance += Number(row.amount_in || 0) - Number(row.amount_out || 0)
    update.run(roundMoney(balance), row.id)
  }
  return balance
}

export function recalculateAllLedgerBalances(db: Database.Database): void {
  recalculateCashBalances(db)
  recalculateBankBalances(db)
  recalculateBillsBalances(db)
}

type LedgerBalanceTable = 'cash_ledger' | 'bank_ledger' | 'acceptance_bills'

export function getLastLedgerBalance(
  db: Database.Database,
  table: LedgerBalanceTable,
  extraWhere = '',
  extraParams: unknown[] = [],
): number {
  const row = db.prepare(`
    SELECT balance
    FROM ${table}
    WHERE deleted_at IS NULL ${extraWhere}
    ORDER BY ${buildDateOrderBy('date', 'DESC')}, id DESC
    LIMIT 1
  `).get(...extraParams) as { balance?: number } | undefined
  return Number(row?.balance || 0)
}
