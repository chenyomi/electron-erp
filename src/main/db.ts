import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { parseLedgerDate } from '../common/ledger-date'
import { isCustomerPaymentDescription, parseCustomerDescription } from '../common/customer-ledger'
import { ensureCustomerProfilesTable, recalculateCustomerBalances } from './ipc/customer-profile'
import { ensureSupplierProfilesTable, ensureSupplierLedgerTable, syncSupplierProfilesFromLedger, cleanupAutoReturnSupplierProfiles, recalculateSupplierBalances } from './ipc/supplier-profile'
import { cleanupCustomerReturnStockInRows } from './ipc/stock-customer-link'
import { recalculateAllLedgerBalances } from './ipc/ledger-balance'
import { cleanupOrphanAttachments } from './ipc/attachments'
import { recompressLegacyStoredImages } from './image-compress'
import { rebuildInventoryBusinessTables } from './ipc/stock-business'
import { backfillReceivablesFromStockOut, cleanupMislinkedReceivablesFromStockOut } from './ipc/stock-customer-link'
import { cleanupLegacySupplierReturnStockOuts } from './ipc/stock-supplier-link'
import { backfillSupplierPayablesFromStockIn } from './ipc/stock-supplier-link'
import { inferLegacySupplierTypes, backfillStockInInventoryFlags } from './ipc/supplier-migrate'

let db: Database.Database | undefined

export function getDb(): Database.Database {
  if (!db) throw new Error('数据库未初始化')
  return db
}

export function closeDatabase(): void {
  if (!db) return
  db.close()
  db = undefined
}

export function getDataDir(): string {
  const dir = join(app.getPath('userData'), 'ledger-data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function initDatabase(): void {
  if (db) return

  const dataDir = getDataDir()
  const dbPath = join(dataDir, 'ledger.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
  migrateSchema()
}

function columnExists(tableName: string, columnName: string) {
  return Boolean(db!.prepare(`PRAGMA table_info(${tableName})`).all().some((row: any) => row.name === columnName))
}

function addColumnIfMissing(tableName: string, columnSql: string) {
  const columnName = columnSql.trim().split(/\s+/)[0]
  if (!columnExists(tableName, columnName)) db!.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`)
}

function dropLegacyImportUniqueIndexes(): void {
  db!.exec(`
    DROP INDEX IF EXISTS uq_stock_in_import;
    DROP INDEX IF EXISTS uq_stock_out_import;
    DROP INDEX IF EXISTS uq_customer_import;
  `)
}

function migrateSchema(): void {
  addColumnIfMissing('operation_logs', "description TEXT DEFAULT ''")
  addColumnIfMissing('operation_logs', "client_ip TEXT DEFAULT ''")
  addColumnIfMissing('operation_logs', "device_info TEXT DEFAULT ''")
  addColumnIfMissing('stock_in_ledger', "doc_no TEXT DEFAULT ''")
  addColumnIfMissing('stock_out_ledger', "doc_no TEXT DEFAULT ''")
  addColumnIfMissing('stock_out_ledger', 'ledger_id INTEGER')
  addColumnIfMissing('customer_ledger', 'stock_out_id INTEGER')
  addColumnIfMissing('customer_ledger', 'ref_ledger_id INTEGER')
  addColumnIfMissing('customer_ledger', 'return_stock_in_id INTEGER')
  addColumnIfMissing('customer_ledger', "contract_no TEXT DEFAULT ''")
  addColumnIfMissing('customer_ledger', "product_name TEXT DEFAULT ''")
  addColumnIfMissing('customer_ledger', "spec TEXT DEFAULT ''")
  addColumnIfMissing('customer_ledger', "unit TEXT DEFAULT ''")
  addColumnIfMissing('customer_ledger', 'quantity REAL DEFAULT 0')
  addColumnIfMissing('customer_ledger', 'unit_price REAL DEFAULT 0')
  addColumnIfMissing('customer_profiles', "contact_person TEXT DEFAULT ''")
  addColumnIfMissing('customer_profiles', "phone TEXT DEFAULT ''")
  addColumnIfMissing('customer_profiles', "address TEXT DEFAULT ''")
  addColumnIfMissing('supplier_profiles', "opening_balance REAL DEFAULT 0")
  addColumnIfMissing('supplier_profiles', "supplier_type TEXT DEFAULT 'outsourcing'")
  addColumnIfMissing('stock_in_ledger', 'ledger_id INTEGER')
  addColumnIfMissing('stock_in_ledger', 'counts_inventory INTEGER DEFAULT 1')
  addColumnIfMissing('stock_in_ledger', 'material_quantity REAL DEFAULT 0')
  addColumnIfMissing('stock_in_ledger', 'material_unit_price REAL DEFAULT 0')
  addColumnIfMissing('supplier_ledger', 'ref_ledger_id INTEGER')
  addColumnIfMissing('supplier_ledger', 'return_stock_out_id INTEGER')
  migrateLedgerDates()
  backfillCustomerLedgerStructuredFields()
  dropLegacyImportUniqueIndexes()
  recalculateAllCustomerBalances()
  cleanupMislinkedReceivablesFromStockOut(db!)
  cleanupLegacySupplierReturnStockOuts(db!)
  backfillReceivablesFromStockOut(db!)
  recalculateAllLedgerBalances(db!)
  ensureCustomerProfilesTable(db!)
  ensureSupplierProfilesTable(db!)
  ensureSupplierLedgerTable(db!)
  cleanupAutoReturnSupplierProfiles(db!)
  cleanupCustomerReturnStockInRows(db!)
  syncSupplierProfilesFromLedger(db!)
  inferLegacySupplierTypes(db!)
  backfillStockInInventoryFlags(db!)
  backfillSupplierPayablesFromStockIn(db!)
  recalculateAllSupplierBalances()
  purgeDeprecatedLedgerData()
  cleanupOrphanAttachments(db!)
  rebuildInventoryBusinessTables()
  void recompressLegacyStoredImages(db!).then(result => {
    if (result.converted > 0) {
      console.log(`Recompressed ${result.converted} image(s), saved ${result.savedBytes} bytes`)
    }
  }).catch(error => {
    console.error('Legacy image recompress failed:', error)
  })
}

function recalculateAllSupplierBalances(): void {
  const names = db!.prepare(`
    SELECT supplier_name FROM supplier_profiles
    UNION
    SELECT DISTINCT supplier_name FROM supplier_ledger WHERE deleted_at IS NULL
  `).all() as Array<{ supplier_name: string }>
  for (const { supplier_name } of names) {
    if (supplier_name) recalculateSupplierBalances(db!, supplier_name)
  }
}


function recalculateAllCustomerBalances(): void {
  const names = db!.prepare(`
    SELECT customer_name FROM customer_profiles
    UNION
    SELECT DISTINCT customer_name FROM customer_ledger WHERE deleted_at IS NULL
  `).all() as Array<{ customer_name: string }>
  for (const { customer_name } of names) {
    if (customer_name) recalculateCustomerBalances(db!, customer_name)
  }
}


function backfillCustomerLedgerStructuredFields(): void {
  const rows = db!.prepare(`
    SELECT id, description, contract_no, product_name, spec, unit, quantity, unit_price
    FROM customer_ledger
    WHERE deleted_at IS NULL
      AND TRIM(COALESCE(product_name, '')) = ''
      AND TRIM(COALESCE(description, '')) != ''
  `).all() as Array<Record<string, any>>
  if (!rows.length) return

  const update = db!.prepare(`
    UPDATE customer_ledger SET
      contract_no = @contract_no,
      product_name = @product_name,
      spec = @spec,
      unit = @unit,
      quantity = @quantity,
      unit_price = @unit_price,
      updated_at = datetime('now','localtime')
    WHERE id = @id
  `)
  for (const row of rows) {
    if (isCustomerPaymentDescription(String(row.description || ''))) continue
    const parsed = parseCustomerDescription(String(row.description || ''))
    if (!parsed.product_name && !Number(parsed.quantity) && !Number(parsed.unit_price)) continue
    update.run({
      id: row.id,
      contract_no: String(row.contract_no || parsed.contract_no || '').trim(),
      product_name: String(parsed.product_name || '').trim(),
      spec: String(parsed.spec || '').trim(),
      unit: String(parsed.unit || '').trim(),
      quantity: Number(row.quantity || parsed.quantity || 0),
      unit_price: Number(row.unit_price || parsed.unit_price || 0),
    })
  }
}

function migrateLedgerDates(): void {
  const tables = [
    { name: 'cash_ledger', monthColumn: null as string | null },
    { name: 'bank_ledger', monthColumn: null },
    { name: 'acceptance_bills', monthColumn: null },
    { name: 'customer_ledger', monthColumn: 'month_label' },
    { name: 'stock_in_ledger', monthColumn: null },
    { name: 'stock_out_ledger', monthColumn: null },
  ]

  for (const table of tables) {
    const monthSelect = table.monthColumn ? `, ${table.monthColumn}` : ''
    const rows = db!.prepare(`
      SELECT id, date${monthSelect}
      FROM ${table.name}
      WHERE date IS NOT NULL AND TRIM(date) != '' AND date NOT GLOB '____-__-__'
    `).all() as Array<{ id: number; date: string; month_label?: string }>
    if (!rows.length) continue

    const update = db!.prepare(`UPDATE ${table.name} SET date = ? WHERE id = ?`)
    for (const row of rows) {
      const normalized = parseLedgerDate(row.date, { monthLabel: row.month_label })
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized !== row.date) {
        update.run(normalized, row.id)
      }
    }
  }
}


/** 废弃表 other_ledger 已无业务读写，启动时清空残留数据 */
function purgeDeprecatedLedgerData(): void {
  const result = db!.prepare(`DELETE FROM other_ledger`).run()
  if (result.changes > 0) {
    console.log(`Purged ${result.changes} deprecated other_ledger row(s)`)
  }
}


function createTables(): void {
  db.exec(`
    -- 现金账
    CREATE TABLE IF NOT EXISTS cash_ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      income      REAL    DEFAULT 0,
      description TEXT    NOT NULL DEFAULT '',
      expense     REAL    DEFAULT 0,
      operator    TEXT    DEFAULT '',
      balance     REAL    DEFAULT 0,
      note        TEXT    DEFAULT '',
      deleted_at  TEXT    DEFAULT NULL,
      created_at  TEXT    DEFAULT (datetime('now','localtime')),
      updated_at  TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 公账
    CREATE TABLE IF NOT EXISTS bank_ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      amount_in   REAL    DEFAULT 0,
      amount_out  REAL    DEFAULT 0,
      balance     REAL    DEFAULT 0,
      note        TEXT    DEFAULT '',
      deleted_at  TEXT    DEFAULT NULL,
      created_at  TEXT    DEFAULT (datetime('now','localtime')),
      updated_at  TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 承兑票
    CREATE TABLE IF NOT EXISTS acceptance_bills (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      amount_in   REAL    DEFAULT 0,
      amount_out  REAL    DEFAULT 0,
      balance     REAL    DEFAULT 0,
      note        TEXT    DEFAULT '',
      deleted_at  TEXT    DEFAULT NULL,
      created_at  TEXT    DEFAULT (datetime('now','localtime')),
      updated_at  TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 其他账（已废弃，仅保留表结构兼容旧库；启动时会清空数据）
    CREATE TABLE IF NOT EXISTS other_ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      income      REAL    DEFAULT 0,
      expense     REAL    DEFAULT 0,
      note        TEXT    DEFAULT '',
      deleted_at  TEXT    DEFAULT NULL,
      created_at  TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 产品入库
    CREATE TABLE IF NOT EXISTS stock_in_ledger (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_no          TEXT    DEFAULT '',
      supplier_name   TEXT    NOT NULL DEFAULT '', -- 关联 supplier_profiles.supplier_name
      category        TEXT    DEFAULT '',
      date            TEXT    NOT NULL,
      contract_no     TEXT    DEFAULT '',
      product_name    TEXT    NOT NULL DEFAULT '',
      spec            TEXT    DEFAULT '',
      unit            TEXT    DEFAULT '',
      quantity        REAL    DEFAULT 0,
      unit_price      REAL    DEFAULT 0,
      amount          REAL    DEFAULT 0,
      tax_rate        REAL    DEFAULT 0,
      tax_amount      REAL    DEFAULT 0,
      invoice_amount  REAL    DEFAULT 0,
      note            TEXT    DEFAULT '',
      ledger_id       INTEGER, -- 关联 supplier_ledger 应付 id
      counts_inventory INTEGER DEFAULT 1, -- 0=不计库存（保留兼容），1=成品入库
      material_quantity REAL DEFAULT 0, -- 原材料公斤（应付）
      material_unit_price REAL DEFAULT 0, -- 原材料元/公斤（应付）
      deleted_at      TEXT    DEFAULT NULL,
      created_at      TEXT    DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 产品出库
    CREATE TABLE IF NOT EXISTS stock_out_ledger (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_no          TEXT    DEFAULT '',
      customer_name   TEXT    NOT NULL,
      category        TEXT    DEFAULT '',
      date            TEXT    NOT NULL,
      contract_no     TEXT    DEFAULT '',
      product_name    TEXT    NOT NULL DEFAULT '',
      spec            TEXT    DEFAULT '',
      unit            TEXT    DEFAULT '',
      quantity        REAL    DEFAULT 0,
      unit_price      REAL    DEFAULT 0,
      amount          REAL    DEFAULT 0,
      note            TEXT    DEFAULT '',
      ledger_id       INTEGER, -- 关联 customer_ledger 应收 id
      deleted_at      TEXT    DEFAULT NULL,
      created_at      TEXT    DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 产品档案缓存（入库选品、默认单价；非独立产品档案页）
    CREATE TABLE IF NOT EXISTS product_catalog (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name    TEXT    NOT NULL DEFAULT '',
      spec            TEXT    DEFAULT '',
      unit            TEXT    DEFAULT '',
      category        TEXT    DEFAULT '',
      default_price   REAL    DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'active', -- 预留：启用/停用
      note            TEXT    DEFAULT '',               -- 预留：产品备注
      deleted_at      TEXT    DEFAULT NULL,
      created_at      TEXT    DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 库存余额（由出入库汇总维护）
    CREATE TABLE IF NOT EXISTS inventory_balances (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name    TEXT    NOT NULL DEFAULT '',
      spec            TEXT    DEFAULT '',
      unit            TEXT    DEFAULT '',
      stock_qty       REAL    DEFAULT 0,
      available_qty   REAL    DEFAULT 0, -- 预留：stock_qty - locked_qty
      locked_qty      REAL    DEFAULT 0, -- 预留：订单占用库存
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 客户往来账
    CREATE TABLE IF NOT EXISTS customer_ledger (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name       TEXT    NOT NULL,
      date                TEXT    NOT NULL,
      description         TEXT    NOT NULL DEFAULT '',
      contract_no         TEXT    DEFAULT '',
      product_name        TEXT    DEFAULT '',
      spec                TEXT    DEFAULT '',
      unit                TEXT    DEFAULT '',
      quantity            REAL    DEFAULT 0,
      unit_price          REAL    DEFAULT 0,
      amount_in           REAL    DEFAULT 0,
      amount_out          REAL    DEFAULT 0,
      balance             REAL    DEFAULT 0,
      note                TEXT    DEFAULT '',
      month_label         TEXT    DEFAULT '', -- Excel 导入月份兼容
      stock_out_id        INTEGER, -- 关联 stock_out_ledger
      ref_ledger_id       INTEGER, -- 退货关联原应收
      return_stock_in_id  INTEGER, -- 退货自动入库 id
      deleted_at          TEXT    DEFAULT NULL,
      created_at          TEXT    DEFAULT (datetime('now','localtime')),
      updated_at          TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 客户档案（期初欠款、联系方式）
    CREATE TABLE IF NOT EXISTS customer_profiles (
      customer_name   TEXT PRIMARY KEY,
      contact_person  TEXT DEFAULT '',
      phone           TEXT DEFAULT '',
      address         TEXT DEFAULT '',
      opening_balance REAL DEFAULT 0,
      note            TEXT DEFAULT '',
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 供应商档案（期初应付、联系方式；入库单通过 supplier_name 关联）
    CREATE TABLE IF NOT EXISTS supplier_profiles (
      supplier_name   TEXT PRIMARY KEY,
      supplier_type   TEXT DEFAULT 'outsourcing',
      contact_person  TEXT DEFAULT '',
      phone           TEXT DEFAULT '',
      address         TEXT DEFAULT '',
      opening_balance REAL DEFAULT 0,
      note            TEXT DEFAULT '',
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 供应商往来账（应付 / 付款）
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
      ref_ledger_id   INTEGER,
      return_stock_out_id INTEGER,
      deleted_at      TEXT    DEFAULT NULL,
      created_at      TEXT    DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 登录用户
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT    NOT NULL UNIQUE,
      password_hash  TEXT    NOT NULL,
      display_name   TEXT    NOT NULL DEFAULT '',
      role           TEXT    NOT NULL DEFAULT 'admin',
      status         TEXT    NOT NULL DEFAULT 'active',
      last_login_at  TEXT    DEFAULT NULL,
      created_at     TEXT    DEFAULT (datetime('now','localtime')),
      updated_at     TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 操作日志（软删除/修改历史）
    CREATE TABLE IF NOT EXISTS operation_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name  TEXT    NOT NULL,
      record_id   INTEGER NOT NULL,
      action      TEXT    NOT NULL,
      old_data    TEXT    DEFAULT NULL,
      new_data    TEXT    DEFAULT NULL,
      operator    TEXT    DEFAULT '',
      description TEXT    DEFAULT '',
      client_ip   TEXT    DEFAULT '',
      device_info TEXT    DEFAULT '',
      created_at  TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 附件
    CREATE TABLE IF NOT EXISTS attachments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      related_table TEXT    NOT NULL,
      related_id    INTEGER NOT NULL,
      file_path     TEXT    NOT NULL,
      file_name     TEXT    NOT NULL,
      created_at    TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 系统配置
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_cash_date       ON cash_ledger(date);
    CREATE INDEX IF NOT EXISTS idx_cash_deleted    ON cash_ledger(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_bank_date       ON bank_ledger(date);
    CREATE INDEX IF NOT EXISTS idx_bank_deleted    ON bank_ledger(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_bills_date      ON acceptance_bills(date);
    CREATE INDEX IF NOT EXISTS idx_bills_deleted   ON acceptance_bills(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_stock_in_supplier ON stock_in_ledger(supplier_name);
    CREATE INDEX IF NOT EXISTS idx_stock_in_date     ON stock_in_ledger(date);
    CREATE INDEX IF NOT EXISTS idx_stock_in_del      ON stock_in_ledger(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_stock_out_customer ON stock_out_ledger(customer_name);
    CREATE INDEX IF NOT EXISTS idx_stock_out_date     ON stock_out_ledger(date);
    CREATE INDEX IF NOT EXISTS idx_stock_out_del      ON stock_out_ledger(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_product_catalog_name ON product_catalog(product_name, spec, unit);
    CREATE INDEX IF NOT EXISTS idx_inventory_balance_name ON inventory_balances(product_name, spec, unit);
    CREATE INDEX IF NOT EXISTS idx_customer_name   ON customer_ledger(customer_name);
    CREATE INDEX IF NOT EXISTS idx_customer_date   ON customer_ledger(date);
    CREATE INDEX IF NOT EXISTS idx_customer_del    ON customer_ledger(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_supplier_name   ON supplier_ledger(supplier_name);
    CREATE INDEX IF NOT EXISTS idx_supplier_date   ON supplier_ledger(date);
    CREATE INDEX IF NOT EXISTS idx_supplier_del    ON supplier_ledger(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
    CREATE INDEX IF NOT EXISTS idx_logs_table      ON operation_logs(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_attach          ON attachments(related_table, related_id);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_import
      ON cash_ledger(date,income,description,expense,operator,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_import
      ON bank_ledger(date,description,amount_in,amount_out,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bills_import
      ON acceptance_bills(date,description,amount_in,amount_out,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_product_catalog_key
      ON product_catalog(product_name,spec,unit);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_balance_key
      ON inventory_balances(product_name,spec,unit);
  `)
}
