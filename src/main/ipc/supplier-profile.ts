import type Database from 'better-sqlite3'
import { buildDateOrderBy } from './helpers'
import { sqlAutoReturnStockInExclude } from '../../common/supplier-ledger'

export type SupplierProfile = {
  supplier_name: string
  contact_person: string
  phone: string
  address: string
  opening_balance: number
  note: string
}

function normalizeSupplierProfileInput(profile: Partial<SupplierProfile> & { supplier_name: string }): SupplierProfile {
  return {
    supplier_name: String(profile.supplier_name || '').trim(),
    contact_person: String(profile.contact_person || '').trim(),
    phone: String(profile.phone || '').trim(),
    address: String(profile.address || '').trim(),
    opening_balance: Number(profile.opening_balance || 0),
    note: String(profile.note || '').trim(),
  }
}

export function ensureSupplierProfilesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_profiles (
      supplier_name   TEXT PRIMARY KEY,
      contact_person  TEXT DEFAULT '',
      phone           TEXT DEFAULT '',
      address         TEXT DEFAULT '',
      opening_balance REAL DEFAULT 0,
      note            TEXT DEFAULT '',
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
    );
  `)
}

export function ensureSupplierLedgerTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_ledger (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name   TEXT    NOT NULL,
      date            TEXT    NOT NULL,
      description     TEXT    NOT NULL DEFAULT '',
      contract_no     TEXT    DEFAULT '',
      product_name    TEXT    DEFAULT '',
      spec            TEXT    DEFAULT '',
      unit            TEXT    DEFAULT '',
      quantity        REAL    DEFAULT 0,
      unit_price      REAL    DEFAULT 0,
      amount_in       REAL    DEFAULT 0,
      amount_out      REAL    DEFAULT 0,
      balance         REAL    DEFAULT 0,
      note            TEXT    DEFAULT '',
      stock_in_id     INTEGER,
      deleted_at      TEXT    DEFAULT NULL,
      created_at      TEXT    DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );
  `)
}

export function syncSupplierProfilesFromLedger(db: Database.Database): number {
  const result = db.prepare(`
    INSERT OR IGNORE INTO supplier_profiles (supplier_name, updated_at)
    SELECT DISTINCT TRIM(supplier_name), datetime('now','localtime')
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND TRIM(COALESCE(supplier_name, '')) != ''
      AND ${sqlAutoReturnStockInExclude()}
  `).run()
  return Number(result.changes || 0)
}

/** 客户退货自动入库产生的假供应商：直接删档案、清空入库上的 supplier_name */
export function cleanupAutoReturnSupplierProfiles(db: Database.Database): { stockInFixed: number; profilesRemoved: number } {
  const stockFix = db.prepare(`
    UPDATE stock_in_ledger
    SET supplier_name = '', updated_at = datetime('now','localtime')
    WHERE deleted_at IS NULL
      AND TRIM(COALESCE(supplier_name, '')) != ''
      AND (
        TRIM(COALESCE(note, '')) LIKE '%客户退货%'
        OR TRIM(COALESCE(supplier_name, '')) LIKE '%退货'
      )
  `).run()
  const profileDelete = db.prepare(`
    DELETE FROM supplier_profiles
    WHERE TRIM(COALESCE(supplier_name, '')) LIKE '%退货'
      AND NOT EXISTS (
        SELECT 1 FROM supplier_ledger
        WHERE deleted_at IS NULL AND supplier_name = supplier_profiles.supplier_name
      )
  `).run()
  return {
    stockInFixed: Number(stockFix.changes || 0),
    profilesRemoved: Number(profileDelete.changes || 0),
  }
}

export function getSupplierProfile(db: Database.Database, supplierName: string): SupplierProfile {
  const row = db.prepare(`
    SELECT supplier_name,
      COALESCE(contact_person, '') AS contact_person,
      COALESCE(phone, '') AS phone,
      COALESCE(address, '') AS address,
      COALESCE(opening_balance, 0) AS opening_balance,
      COALESCE(note, '') AS note
    FROM supplier_profiles
    WHERE supplier_name = ?
  `).get(supplierName) as SupplierProfile | undefined

  return row || {
    supplier_name: supplierName,
    contact_person: '',
    phone: '',
    address: '',
    opening_balance: 0,
    note: '',
  }
}

export function setSupplierProfile(db: Database.Database, profile: Partial<SupplierProfile> & { supplier_name: string }): SupplierProfile {
  const payload = normalizeSupplierProfileInput(profile)
  db.prepare(`
    INSERT INTO supplier_profiles (supplier_name, contact_person, phone, address, opening_balance, note, updated_at)
    VALUES (@supplier_name, @contact_person, @phone, @address, @opening_balance, @note, datetime('now','localtime'))
    ON CONFLICT(supplier_name) DO UPDATE SET
      contact_person = excluded.contact_person,
      phone = excluded.phone,
      address = excluded.address,
      opening_balance = excluded.opening_balance,
      note = excluded.note,
      updated_at = datetime('now','localtime')
  `).run(payload)
  return getSupplierProfile(db, payload.supplier_name)
}

export function supplierNameExists(db: Database.Database, supplierName: string): boolean {
  const name = String(supplierName || '').trim()
  if (!name) return false
  const inProfile = db.prepare(`SELECT 1 FROM supplier_profiles WHERE supplier_name = ? LIMIT 1`).get(name)
  if (inProfile) return true
  const inStockIn = db.prepare(`
    SELECT 1 FROM stock_in_ledger
    WHERE deleted_at IS NULL AND supplier_name = ? LIMIT 1
  `).get(name)
  if (inStockIn) return true
  const inLedger = db.prepare(`
    SELECT 1 FROM supplier_ledger WHERE deleted_at IS NULL AND supplier_name = ? LIMIT 1
  `).get(name)
  return Boolean(inLedger)
}

export function assertSupplierProfileExists(db: Database.Database, supplierName: string): void {
  const name = String(supplierName || '').trim()
  if (!name) throw new Error('请选择供应商')
  const inProfile = db.prepare(`SELECT 1 FROM supplier_profiles WHERE supplier_name = ? LIMIT 1`).get(name)
  if (!inProfile) {
    throw new Error(`供应商「${name}」不存在，请先在「供应商」中添加`)
  }
}

export function listSupplierProfileNames(db: Database.Database): string[] {
  const rows = db.prepare(`
    SELECT supplier_name FROM supplier_profiles
    ORDER BY supplier_name COLLATE NOCASE ASC
  `).all() as Array<{ supplier_name: string }>
  return rows.map(row => row.supplier_name).filter(Boolean)
}

export function listAllSupplierNames(db: Database.Database): string[] {
  const rows = db.prepare(`
    SELECT supplier_name FROM supplier_profiles
    UNION
    SELECT DISTINCT supplier_name FROM stock_in_ledger WHERE deleted_at IS NULL AND TRIM(COALESCE(supplier_name, '')) != ''
    UNION
    SELECT DISTINCT supplier_name FROM supplier_ledger WHERE deleted_at IS NULL
    ORDER BY supplier_name COLLATE NOCASE ASC
  `).all() as Array<{ supplier_name: string }>
  return rows.map(row => row.supplier_name).filter(Boolean)
}

export type SupplierRemovePreview = {
  supplier_name: string
  ledgerCount: number
  stockInCount: number
  hasProfile: boolean
}

export function getSupplierRemovePreview(db: Database.Database, supplierName: string): SupplierRemovePreview {
  const name = String(supplierName || '').trim()
  const ledgerCount = Number((db.prepare(`
    SELECT COUNT(*) AS n FROM supplier_ledger
    WHERE deleted_at IS NULL AND supplier_name = ?
  `).get(name) as { n: number } | undefined)?.n || 0)
  const stockInCount = Number((db.prepare(`
    SELECT COUNT(*) AS n FROM stock_in_ledger
    WHERE deleted_at IS NULL AND supplier_name = ?
  `).get(name) as { n: number } | undefined)?.n || 0)
  const hasProfile = Boolean(db.prepare(`SELECT 1 FROM supplier_profiles WHERE supplier_name = ? LIMIT 1`).get(name))
  return { supplier_name: name, ledgerCount, stockInCount, hasProfile }
}

export function recalculateSupplierBalances(db: Database.Database, supplierName: string): number {
  const opening = Number(getSupplierProfile(db, supplierName).opening_balance || 0)
  const rows = db.prepare(`
    SELECT id, amount_in, amount_out
    FROM supplier_ledger
    WHERE deleted_at IS NULL AND supplier_name = ?
    ORDER BY ${buildDateOrderBy('date', 'ASC')}, id ASC
  `).all(supplierName) as Array<{ id: number; amount_in: number; amount_out: number }>

  let balance = opening
  const update = db.prepare(`UPDATE supplier_ledger SET balance = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
  for (const row of rows) {
    balance += Number(row.amount_in || 0) - Number(row.amount_out || 0)
    update.run(Math.round(balance * 100) / 100, row.id)
  }
  return balance
}
