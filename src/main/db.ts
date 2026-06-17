import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function getDataDir(): string {
  const dir = join(app.getPath('userData'), 'ledger-data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function initDatabase(): void {
  const dataDir = getDataDir()
  const dbPath = join(dataDir, 'ledger.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
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

    -- 客户往来账（每个工作表一套）
    CREATE TABLE IF NOT EXISTS customer_ledger (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT    NOT NULL,
      date          TEXT    NOT NULL,
      description   TEXT    NOT NULL DEFAULT '',
      amount_in     REAL    DEFAULT 0,
      amount_out    REAL    DEFAULT 0,
      balance       REAL    DEFAULT 0,
      note          TEXT    DEFAULT '',
      month_label   TEXT    DEFAULT '',
      deleted_at    TEXT    DEFAULT NULL,
      created_at    TEXT    DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    DEFAULT (datetime('now','localtime'))
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
  `)
}
