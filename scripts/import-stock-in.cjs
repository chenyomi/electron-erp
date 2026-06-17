#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const Database = require('better-sqlite3')
const XLSX = require('xlsx')

const defaultFile = '/Users/chenyuming/Downloads/2026年材料产品入库.xlsx'
const filePath = process.argv[2] || defaultFile
const dbPath = process.argv[3] || path.join(os.homedir(), 'Library/Application Support/donghao-ledger/ledger-data/ledger.db')

if (!fs.existsSync(filePath)) {
  console.error(`Excel file not found: ${filePath}`)
  process.exit(1)
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

createTables(db)

function createTables(db) {
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_stock_in_supplier ON stock_in_ledger(supplier_name);
    CREATE INDEX IF NOT EXISTS idx_stock_in_date ON stock_in_ledger(date);
    CREATE INDEX IF NOT EXISTS idx_stock_in_del ON stock_in_ledger(deleted_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_in_import
      ON stock_in_ledger(supplier_name,date,contract_no,product_name,spec,quantity,unit_price,amount,note);
  `)
}

function numVal(v) {
  if (v === '' || v == null) return 0
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function strVal(v) {
  return String(v ?? '').trim()
}

function dateVal(v) {
  const value = strVal(v)
  if (!value) return ''
  if (value.includes('合计') || value.includes('总') || value.includes('欠款')) return ''
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}.${String(v.getMonth() + 1).padStart(2, '0')}.${String(v.getDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && v > 30000 && v < 60000) {
    const parsed = XLSX.SSF.parse_date_code(v)
    if (parsed) return `${parsed.y}.${String(parsed.m).padStart(2, '0')}.${String(parsed.d).padStart(2, '0')}`
  }
  const normalized = value.replace(/\//g, '.').replace(/-/g, '.')
  const parts = normalized.split('.').map(p => p.trim()).filter(Boolean)
  if (parts.length === 3) {
    let [year, month, day] = parts
    if (year.length !== 4 && day.length >= 2) [year, month, day] = [day, year, month]
    if (year.length === 2) year = `20${year}`
    return `${year}.${month}.${day}`
  }
  return value
}

function parseCategory(title) {
  if (title.includes('铝材料')) return '铝材料'
  if (title.includes('铜材料')) return '铜材料'
  if (title.includes('外协加工')) return '外协加工'
  if (title.includes('材料')) return '材料'
  return ''
}

function parseSupplier(rows, sheetName) {
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    const row = rows[i]
    for (let j = 0; j < row.length; j++) {
      if (strVal(row[j]).includes('客户名称')) {
        const name = strVal(row[j + 1])
        if (name) return name
      }
    }
  }
  return sheetName
}

function isFooterRow(row) {
  return ['上期欠款', '累计应付款', '合计', '金额大写'].some(m => row.some(cell => strVal(cell).includes(m)))
}

const SKIP_SHEETS = new Set(['Sheet1', 'Sheet3', 'Sheet4'])

function importStockInExcel(db, filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const result = { stockIn: 0, skipped: 0, sheets: 0 }
  const insert = db.prepare(`
    INSERT OR IGNORE INTO stock_in_ledger (
      supplier_name, category, date, contract_no, product_name, spec, unit,
      quantity, unit_price, amount, tax_rate, tax_amount, invoice_amount, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMany = db.transaction((items) => {
    for (const values of items) {
      const r = insert.run(...values)
      if (r.changes) result.stockIn++
      else result.skipped++
    }
  })

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
    const headerIndex = rows.findIndex(row => row.some(cell => strVal(cell).includes('产品名称')))
    if (headerIndex === -1) continue

    const category = parseCategory(strVal(rows[0]?.[0]))
    const supplierName = parseSupplier(rows, sheetName)
    const header = rows[headerIndex].map(strVal)
    const col = (label) => header.findIndex(cell => cell.replace(/\s/g, '').includes(label.replace(/\s/g, '')))

    const dateCol = col('发货日期') >= 0 ? col('发货日期') : col('日期')
    const contractCol = col('合同编号')
    const productCol = col('产品名称')
    const specCol = col('规格型号') >= 0 ? col('规格型号') : col('规格')
    const unitCol = col('单位')
    const qtyCol = col('数量')
    const priceCol = col('单价')
    const amountCol = col('金额')
    const taxRateCol = col('税率')
    const taxAmountCol = col('税额')
    const invoiceCol = col('开票金额')
    const noteCol = col('备注')
    if (productCol < 0) continue

    const batch = []
    let lastDate = ''
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i]
      if (isFooterRow(row)) break
      const productName = strVal(row[productCol])
      if (!productName || productName === '去年欠货款') continue
      const parsedDate = dateVal(row[dateCol])
      if (parsedDate) lastDate = parsedDate
      const date = lastDate || parsedDate
      if (!date) continue
      const quantity = numVal(row[qtyCol])
      const unitPrice = numVal(row[priceCol])
      let amount = numVal(row[amountCol])
      if (!amount && quantity && unitPrice) amount = quantity * unitPrice
      batch.push([
        supplierName, category, date,
        contractCol >= 0 ? strVal(row[contractCol]) : '',
        productName,
        specCol >= 0 ? strVal(row[specCol]) : '',
        unitCol >= 0 ? strVal(row[unitCol]) : '',
        quantity, unitPrice, amount,
        taxRateCol >= 0 ? numVal(row[taxRateCol]) : 0,
        taxAmountCol >= 0 ? numVal(row[taxAmountCol]) : 0,
        invoiceCol >= 0 ? numVal(row[invoiceCol]) : amount,
        noteCol >= 0 ? strVal(row[noteCol]) : '',
      ])
    }
    if (batch.length) {
      insertMany(batch)
      result.sheets++
    }
  }
  return result
}

const imported = importStockInExcel(db, filePath)
console.log(JSON.stringify({ dbPath, filePath, imported, count: db.prepare('SELECT COUNT(*) as c FROM stock_in_ledger WHERE deleted_at IS NULL').get() }, null, 2))
