import type Database from 'better-sqlite3'
import { buildDateOrderBy } from './helpers'

export type CustomerProfile = {
  customer_name: string
  opening_balance: number
  note: string
}

export function ensureCustomerProfilesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_profiles (
      customer_name   TEXT PRIMARY KEY,
      opening_balance REAL DEFAULT 0,
      note            TEXT DEFAULT '',
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
    );
  `)
}

export function getCustomerProfile(db: Database.Database, customerName: string): CustomerProfile {
  const row = db.prepare(`
    SELECT customer_name, COALESCE(opening_balance, 0) AS opening_balance, COALESCE(note, '') AS note
    FROM customer_profiles
    WHERE customer_name = ?
  `).get(customerName) as CustomerProfile | undefined

  return row || { customer_name: customerName, opening_balance: 0, note: '' }
}

export function setCustomerProfile(db: Database.Database, profile: CustomerProfile): CustomerProfile {
  db.prepare(`
    INSERT INTO customer_profiles (customer_name, opening_balance, note, updated_at)
    VALUES (@customer_name, @opening_balance, @note, datetime('now','localtime'))
    ON CONFLICT(customer_name) DO UPDATE SET
      opening_balance = excluded.opening_balance,
      note = excluded.note,
      updated_at = datetime('now','localtime')
  `).run({
    customer_name: profile.customer_name,
    opening_balance: Number(profile.opening_balance || 0),
    note: String(profile.note || ''),
  })
  return getCustomerProfile(db, profile.customer_name)
}

export function customerNameExists(db: Database.Database, customerName: string): boolean {
  const name = String(customerName || '').trim()
  if (!name) return false
  const inProfile = db.prepare(`SELECT 1 FROM customer_profiles WHERE customer_name = ? LIMIT 1`).get(name)
  if (inProfile) return true
  const inLedger = db.prepare(`SELECT 1 FROM customer_ledger WHERE deleted_at IS NULL AND customer_name = ? LIMIT 1`).get(name)
  return Boolean(inLedger)
}

export function listAllCustomerNames(db: Database.Database): string[] {
  const rows = db.prepare(`
    SELECT customer_name FROM customer_profiles
    UNION
    SELECT DISTINCT customer_name FROM customer_ledger WHERE deleted_at IS NULL
    ORDER BY customer_name
  `).all() as Array<{ customer_name: string }>
  return rows.map(row => row.customer_name).filter(Boolean)
}

export type CustomerRemovePreview = {
  customer_name: string
  ledgerCount: number
  stockOutCount: number
  hasProfile: boolean
}

export function getCustomerRemovePreview(db: Database.Database, customerName: string): CustomerRemovePreview {
  const name = String(customerName || '').trim()
  const ledgerCount = Number((db.prepare(`
    SELECT COUNT(*) AS n FROM customer_ledger
    WHERE deleted_at IS NULL AND customer_name = ?
  `).get(name) as { n: number } | undefined)?.n || 0)
  const stockOutCount = Number((db.prepare(`
    SELECT COUNT(*) AS n FROM stock_out_ledger
    WHERE deleted_at IS NULL AND customer_name = ?
  `).get(name) as { n: number } | undefined)?.n || 0)
  const hasProfile = Boolean(db.prepare(`SELECT 1 FROM customer_profiles WHERE customer_name = ? LIMIT 1`).get(name))
  return { customer_name: name, ledgerCount, stockOutCount, hasProfile }
}

export function recalculateCustomerBalances(db: Database.Database, customerName: string): number {
  const opening = Number(getCustomerProfile(db, customerName).opening_balance || 0)
  const rows = db.prepare(`
    SELECT id, amount_in, amount_out
    FROM customer_ledger
    WHERE deleted_at IS NULL AND customer_name = ?
    ORDER BY ${buildDateOrderBy('date', 'ASC')}, id ASC
  `).all(customerName) as Array<{ id: number; amount_in: number; amount_out: number }>

  let balance = opening
  const update = db.prepare(`UPDATE customer_ledger SET balance = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
  for (const row of rows) {
    balance += Number(row.amount_in || 0) - Number(row.amount_out || 0)
    update.run(Math.round(balance * 100) / 100, row.id)
  }
  return balance
}

export function parseOpeningBalanceFromRows(rows: any[][], strVal: (v: any) => string, numVal: (v: any) => number): number {
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    for (let i = 0; i < row.length; i++) {
      const cell = strVal(row[i])
      if (!cell.includes('上期欠款') && !cell.includes('上期结欠')) continue
      const inline = cell.match(/([\d,.]+)\s*$/)
      if (inline) return numVal(inline[1])
      for (let j = i + 1; j < row.length; j++) {
        const value = numVal(row[j])
        if (value) return value
      }
    }
  }
  return 0
}
