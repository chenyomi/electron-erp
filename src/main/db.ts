import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { buildCustomerRowRepair, isLikelyAmountNotDate } from '../common/customer-anomaly'
import { parseCustomerDescription } from '../common/customer-ledger'
import { parseLedgerDate } from '../common/ledger-date'
import { ensureCustomerProfilesTable, recalculateCustomerBalances } from './ipc/customer-profile'
import { recalculateAllLedgerBalances } from './ipc/ledger-balance'
import { repairCustomerAnomalies } from './ipc/customer-anomaly'

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
  rebuildInventoryBusinessTables()
}

function columnExists(tableName: string, columnName: string) {
  return Boolean(db!.prepare(`PRAGMA table_info(${tableName})`).all().some((row: any) => row.name === columnName))
}

function addColumnIfMissing(tableName: string, columnSql: string) {
  const columnName = columnSql.trim().split(/\s+/)[0]
  if (!columnExists(tableName, columnName)) db!.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`)
}

function migrateSchema(): void {
  addColumnIfMissing('stock_in_ledger', "doc_no TEXT DEFAULT ''")
  addColumnIfMissing('stock_out_ledger', "doc_no TEXT DEFAULT ''")
  migrateCustomerLedgerFields()
  migrateLedgerDates()
  migrateCustomerPaymentMisalignment()
  repairCustomerAnomalies(db!)
  recalculateAllCustomerBalances()
  recalculateAllLedgerBalances(db!)
  ensureCustomerProfilesTable(db!)
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

/** 付款行把金额填进日期/备注列（如 40455），启动时自动纠正收款金额并重算余额 */
function migrateCustomerPaymentMisalignment(): void {
  const rows = db!.prepare(`
    SELECT *
    FROM customer_ledger
    WHERE deleted_at IS NULL
      AND (TRIM(COALESCE(product_name, '')) = '付款' OR TRIM(COALESCE(description, '')) = '付款')
      AND (
        date GLOB '[0-9]*'
        OR note GLOB '[0-9]*'
      )
  `).all() as Array<Record<string, any>>

  const update = db!.prepare(`
    UPDATE customer_ledger SET
      date = @date,
      description = @description,
      contract_no = @contract_no,
      product_name = @product_name,
      spec = @spec,
      unit = @unit,
      quantity = @quantity,
      unit_price = @unit_price,
      amount_in = @amount_in,
      amount_out = @amount_out,
      note = @note,
      updated_at = datetime('now','localtime')
    WHERE id = @id
  `)

  const customers = new Set<string>()
  for (const row of rows) {
    if (!isLikelyAmountNotDate(row.date) && !isLikelyAmountNotDate(row.note)) continue
    const patch = buildCustomerRowRepair(row)
    if (!patch) continue
    const next = { ...row, ...patch }
    update.run({
      id: row.id,
      date: next.date ?? row.date ?? '',
      description: next.description ?? row.description,
      contract_no: next.contract_no ?? row.contract_no ?? '',
      product_name: next.product_name ?? row.product_name ?? '',
      spec: next.spec ?? row.spec ?? '',
      unit: next.unit ?? row.unit ?? '',
      quantity: next.quantity ?? row.quantity ?? 0,
      unit_price: next.unit_price ?? row.unit_price ?? 0,
      amount_in: next.amount_in ?? row.amount_in ?? 0,
      amount_out: next.amount_out ?? row.amount_out ?? 0,
      note: next.note ?? row.note ?? '',
    })
    customers.add(row.customer_name)
  }

  for (const name of customers) {
    recalculateCustomerBalances(db!, name)
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

function migrateCustomerLedgerFields(): void {
  addColumnIfMissing('customer_ledger', "contract_no TEXT DEFAULT ''")
  addColumnIfMissing('customer_ledger', "product_name TEXT DEFAULT ''")
  addColumnIfMissing('customer_ledger', "spec TEXT DEFAULT ''")
  addColumnIfMissing('customer_ledger', "unit TEXT DEFAULT ''")
  addColumnIfMissing('customer_ledger', 'quantity REAL DEFAULT 0')
  addColumnIfMissing('customer_ledger', 'unit_price REAL DEFAULT 0')

  const rows = db!.prepare(`
    SELECT id, description
    FROM customer_ledger
    WHERE COALESCE(product_name, '') = ''
      AND COALESCE(contract_no, '') = ''
      AND COALESCE(quantity, 0) = 0
      AND COALESCE(unit_price, 0) = 0
      AND TRIM(COALESCE(description, '')) NOT IN ('', '付款')
  `).all() as Array<{ id: number; description: string }>

  if (!rows.length) return

  const update = db!.prepare(`
    UPDATE customer_ledger
    SET contract_no = ?, product_name = ?, spec = ?, unit = ?, quantity = ?, unit_price = ?
    WHERE id = ?
  `)

  for (const row of rows) {
    const parsed = parseCustomerDescription(row.description)
    if (!parsed.product_name && !parsed.contract_no && !parsed.quantity) continue
    update.run(parsed.contract_no, parsed.product_name, parsed.spec, parsed.unit, parsed.quantity, parsed.unit_price, row.id)
  }
}

function rebuildInventoryBusinessTables(): void {
  db!.exec(`
    INSERT OR IGNORE INTO product_catalog (product_name, spec, unit, category, default_price)
    SELECT
      product_name,
      COALESCE(spec, ''),
      COALESCE(unit, ''),
      COALESCE(category, ''),
      COALESCE(MAX(NULLIF(unit_price, 0)), 0)
    FROM (
      SELECT product_name, spec, unit, category, unit_price FROM stock_in_ledger WHERE deleted_at IS NULL
      UNION ALL
      SELECT product_name, spec, unit, category, unit_price FROM stock_out_ledger WHERE deleted_at IS NULL
    )
    WHERE product_name IS NOT NULL AND product_name != ''
    GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '');

    DELETE FROM inventory_balances;

    INSERT INTO inventory_balances (product_name, spec, unit, stock_qty, available_qty)
    SELECT product_name, spec, unit, stock_qty, stock_qty
    FROM (
      SELECT
        product_name,
        COALESCE(spec, '') AS spec,
        COALESCE(unit, '') AS unit,
        SUM(in_qty) - SUM(out_qty) AS stock_qty
      FROM (
        SELECT product_name, spec, unit, quantity AS in_qty, 0 AS out_qty FROM stock_in_ledger WHERE deleted_at IS NULL
        UNION ALL
        SELECT product_name, spec, unit, 0 AS in_qty, quantity AS out_qty FROM stock_out_ledger WHERE deleted_at IS NULL
      )
      WHERE product_name IS NOT NULL AND product_name != ''
      GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '')
    );
  `)
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

    -- 其他账（T列往后的黄勇收入等）
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

    -- 材料/产品入库
    CREATE TABLE IF NOT EXISTS stock_in_ledger (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_no          TEXT    DEFAULT '',
      supplier_name   TEXT    NOT NULL,
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
      deleted_at      TEXT    DEFAULT NULL,
      created_at      TEXT    DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 产品/物料档案
    CREATE TABLE IF NOT EXISTS product_catalog (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name    TEXT    NOT NULL DEFAULT '',
      spec            TEXT    DEFAULT '',
      unit            TEXT    DEFAULT '',
      category        TEXT    DEFAULT '',
      default_price   REAL    DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'active',
      note            TEXT    DEFAULT '',
      deleted_at      TEXT    DEFAULT NULL,
      created_at      TEXT    DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 库存余额
    CREATE TABLE IF NOT EXISTS inventory_balances (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name    TEXT    NOT NULL DEFAULT '',
      spec            TEXT    DEFAULT '',
      unit            TEXT    DEFAULT '',
      stock_qty       REAL    DEFAULT 0,
      available_qty   REAL    DEFAULT 0,
      locked_qty      REAL    DEFAULT 0,
      updated_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 客户往来账（每个工作表一套）
    CREATE TABLE IF NOT EXISTS customer_ledger (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT    NOT NULL,
      date          TEXT    NOT NULL,
      description   TEXT    NOT NULL DEFAULT '',
      contract_no   TEXT    DEFAULT '',
      product_name  TEXT    DEFAULT '',
      spec          TEXT    DEFAULT '',
      unit          TEXT    DEFAULT '',
      quantity      REAL    DEFAULT 0,
      unit_price    REAL    DEFAULT 0,
      amount_in     REAL    DEFAULT 0,
      amount_out    REAL    DEFAULT 0,
      balance       REAL    DEFAULT 0,
      note          TEXT    DEFAULT '',
      month_label   TEXT    DEFAULT '',
      deleted_at    TEXT    DEFAULT NULL,
      created_at    TEXT    DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- 客户期初/汇总设置
    CREATE TABLE IF NOT EXISTS customer_profiles (
      customer_name   TEXT PRIMARY KEY,
      opening_balance REAL DEFAULT 0,
      note            TEXT DEFAULT '',
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
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
    CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
    CREATE INDEX IF NOT EXISTS idx_logs_table      ON operation_logs(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_attach          ON attachments(related_table, related_id);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_import
      ON cash_ledger(date,income,description,expense,operator,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_import
      ON bank_ledger(date,description,amount_in,amount_out,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bills_import
      ON acceptance_bills(date,description,amount_in,amount_out,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_import
      ON customer_ledger(customer_name,date,description,amount_in,amount_out,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_in_import
      ON stock_in_ledger(supplier_name,date,contract_no,product_name,spec,quantity,unit_price,amount,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_out_import
      ON stock_out_ledger(customer_name,date,contract_no,product_name,spec,quantity,unit_price,amount,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_product_catalog_key
      ON product_catalog(product_name,spec,unit);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_balance_key
      ON inventory_balances(product_name,spec,unit);
  `)
}
