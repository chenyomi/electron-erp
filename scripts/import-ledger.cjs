#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const Database = require('better-sqlite3')
const XLSX = require('xlsx')
const sharp = require('sharp')

const defaultFile = '/Users/chenyuming/Desktop/2026年东昊汽车配件公司账本-6-16-最新.xlsx'
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
importExcelFile(db, filePath).then(imported => {
  console.log(JSON.stringify({ dbPath, filePath, imported, counts: countRows(db) }, null, 2))
}).catch(error => {
  console.error(error)
  process.exit(1)
})

function createTables(db) {
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS attachments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      related_table TEXT    NOT NULL,
      related_id    INTEGER NOT NULL,
      file_path     TEXT    NOT NULL,
      file_name     TEXT    NOT NULL,
      created_at    TEXT    DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_import
      ON cash_ledger(date,income,description,expense,operator,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_import
      ON bank_ledger(date,description,amount_in,amount_out,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bills_import
      ON acceptance_bills(date,description,amount_in,amount_out,balance,note);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_import
      ON customer_ledger(customer_name,date,description,amount_in,amount_out,balance,note);
  `)
}

async function importExcelFile(db, filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const imported = { cash: 0, bank: 0, bills: 0, customers: 0, images: 0, attachments: 0 }
  const extractedImages = await extractExcelImages(filePath)
  imported.images = extractedImages.total

  const mainSheet = wb.Sheets['帐本'] || wb.Sheets[wb.SheetNames[0]]
  if (mainSheet) {
    const rows = XLSX.utils.sheet_to_json(mainSheet, { header: 1, defval: '', raw: false })
    importMainSheet(db, rows, imported, extractedImages.bySheetRow)
  }

  const skipSheets = new Set(['帐本', 'Sheet2', 'Sheet5', 'Sheet6', '滨海昊亮备份'])
  for (const name of wb.SheetNames) {
    if (skipSheets.has(name)) continue
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
    importCustomerSheet(db, name, rows, imported, extractedImages.bySheetRow)
  }

  return imported
}

async function extractExcelImages(filePath) {
  const JSZip = require('jszip')
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  const outputRoot = path.join(os.homedir(), 'Library/Application Support/donghao-ledger/ledger-data/excel-images')
  fs.mkdirSync(outputRoot, { recursive: true })

  const workbookXml = await zip.file('xl/workbook.xml')?.async('string')
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!workbookXml || !workbookRelsXml) return { total: 0, bySheetRow: new Map() }

  const workbookRels = parseRels(workbookRelsXml)
  const sheets = parseSheets(workbookXml)
  const seen = new Set()
  const bySheetRow = new Map()
  let count = 0

  for (const sheet of sheets) {
    const target = workbookRels.get(sheet.rid)
    if (!target) continue
    const sheetPath = normalizeZipPath('xl', target)
    const sheetRelFile = zip.file(relsPath(sheetPath))
    if (!sheetRelFile) continue

    const sheetRels = parseRels(await sheetRelFile.async('string'))
    for (const drawingTarget of sheetRels.values()) {
      if (!drawingTarget.includes('drawing')) continue
      const drawingPath = normalizeZipPath(path.posix.dirname(sheetPath), drawingTarget)
      const drawingFile = zip.file(drawingPath)
      const drawingRelFile = zip.file(relsPath(drawingPath))
      if (!drawingFile || !drawingRelFile) continue

      const drawingRels = parseRels(await drawingRelFile.async('string'))
      const drawingXml = await drawingFile.async('string')
      for (const image of parseDrawingImages(drawingXml)) {
        const mediaTarget = drawingRels.get(image.rid)
        if (!mediaTarget) continue
        const mediaPath = normalizeZipPath(path.posix.dirname(drawingPath), mediaTarget)
        const mediaFile = zip.file(mediaPath)
        if (!mediaFile) continue

        const sheetDir = path.join(outputRoot, safeName(sheet.name))
        const originalExt = path.extname(mediaPath) || '.png'
        const fileName = `${String(image.row).padStart(4, '0')}_${String(image.col).padStart(2, '0')}_${path.basename(mediaPath, originalExt)}.webp`
        const key = `${sheet.name}/${fileName}`
        if (seen.has(key)) continue
        seen.add(key)

        fs.mkdirSync(sheetDir, { recursive: true })
        const raw = Buffer.from(await mediaFile.async('uint8array'))
        const outputPath = path.join(sheetDir, fileName)
        fs.writeFileSync(outputPath, await optimizeImage(raw))
        const rowKey = imageRowKey(sheet.name, image.row)
        const list = bySheetRow.get(rowKey) || []
        list.push({ row: image.row, col: image.col, filePath: outputPath, fileName })
        bySheetRow.set(rowKey, list)
        count++
      }
    }
  }

  return { total: count, bySheetRow }
}

async function optimizeImage(raw) {
  try {
    return await sharp(raw)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer()
  } catch {
    return raw
  }
}

function imageRowKey(sheetName, row) {
  return `${sheetName}::${row}`
}

function parseRels(xml) {
  const rels = new Map()
  const re = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g
  let match
  while ((match = re.exec(xml))) rels.set(match[1], match[2])
  return rels
}

function parseSheets(xml) {
  const sheets = []
  const re = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g
  let match
  while ((match = re.exec(xml))) sheets.push({ name: decodeXml(match[1]), rid: match[2] })
  return sheets
}

function parseDrawingImages(xml) {
  const images = []
  const anchorRe = /<xdr:(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g
  let anchor
  while ((anchor = anchorRe.exec(xml))) {
    const block = anchor[0]
    const row = Number(block.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? -1) + 1
    const col = Number(block.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1] ?? -1) + 1
    const rid = block.match(/<a:blip[^>]*r:embed="([^"]+)"/)?.[1]
    if (row > 0 && col > 0 && rid) images.push({ row, col, rid })
  }
  return images
}

function normalizeZipPath(baseDir, target) {
  if (target.startsWith('/')) return target.slice(1)
  return path.posix.normalize(path.posix.join(baseDir, target))
}

function relsPath(filePath) {
  return path.posix.join(path.posix.dirname(filePath), '_rels', `${path.posix.basename(filePath)}.rels`)
}

function safeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

function decodeXml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function numVal(v) {
  if (v === '' || v === null || v === undefined) return 0
  const n = parseFloat(String(v).replace(/,/g, ''))
  return Number.isNaN(n) ? 0 : n
}

function strVal(v) {
  return String(v ?? '').trim()
}

function dateVal(v) {
  const value = strVal(v)
  if (!value || value.includes('合计') || value.includes('总')) return ''

  const normalized = value.replace(/\//g, '.').replace(/-/g, '.')
  const parts = normalized.split('.').map(p => p.trim()).filter(Boolean)
  if (parts.length === 3) {
    let [year, month, day] = parts
    if (year.length !== 4 && day.length >= 2) {
      ;[year, month, day] = [day, year, month]
    }
    if (year.length === 2) year = `20${year}`
    return `${year}.${month}.${day}`
  }
  return value
}

function dateKey(date) {
  const [year = '0', month = '0', day = '0'] = date.split('.')
  return Number(year) * 10000 + Number(month) * 100 + Number(day)
}

function importMainSheet(db, rows, imported, imagesBySheetRow) {
  const insertCash = db.prepare(`INSERT OR IGNORE INTO cash_ledger (date,income,description,expense,operator,balance,note) VALUES (?,?,?,?,?,?,?)`)
  const insertBank = db.prepare(`INSERT OR IGNORE INTO bank_ledger (date,description,amount_in,amount_out,balance,note) VALUES (?,?,?,?,?,?)`)
  const insertBills = db.prepare(`INSERT OR IGNORE INTO acceptance_bills (date,description,amount_in,amount_out,balance,note) VALUES (?,?,?,?,?,?)`)
  const findCash = db.prepare(`SELECT id FROM cash_ledger WHERE date=? AND income=? AND description=? AND expense=? AND operator=? AND balance=? AND note=? ORDER BY id DESC LIMIT 1`)
  const findBank = db.prepare(`SELECT id FROM bank_ledger WHERE date=? AND description=? AND amount_in=? AND amount_out=? AND balance=? AND note=? ORDER BY id DESC LIMIT 1`)
  const findBills = db.prepare(`SELECT id FROM acceptance_bills WHERE date=? AND description=? AND amount_in=? AND amount_out=? AND balance=? AND note=? ORDER BY id DESC LIMIT 1`)

  const insertMany = db.transaction((data) => {
    for (const r of data) {
      const { cash, bank, bills, excelRow } = r
      if (cash) {
        const result = insertCash.run(...cash)
        if (result.changes) imported.cash++
        const id = Number(result.changes ? result.lastInsertRowid : findCash.get(...cash)?.id || 0)
        imported.attachments += attachRowImages(db, 'cash_ledger', id, imagesBySheetRow.get(imageRowKey('帐本', excelRow)) || [], 1, 7)
      }
      if (bank) {
        const result = insertBank.run(...bank)
        if (result.changes) imported.bank++
        const id = Number(result.changes ? result.lastInsertRowid : findBank.get(...bank)?.id || 0)
        imported.attachments += attachRowImages(db, 'bank_ledger', id, imagesBySheetRow.get(imageRowKey('帐本', excelRow)) || [], 8, 13)
      }
      if (bills) {
        const result = insertBills.run(...bills)
        if (result.changes) imported.bills++
        const id = Number(result.changes ? result.lastInsertRowid : findBills.get(...bills)?.id || 0)
        imported.attachments += attachRowImages(db, 'acceptance_bills', id, imagesBySheetRow.get(imageRowKey('帐本', excelRow)) || [], 14, 19)
      }
    }
  })

  const batch = []
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i]
    let cashRow = null
    let bankRow = null
    let billsRow = null

    const dateA = dateVal(row[0])
    if (dateA) {
      const income = numVal(row[1])
      const desc = strVal(row[2])
      const expense = numVal(row[3])
      if (income !== 0 || expense !== 0 || desc) {
        cashRow = [dateA, income, desc, expense, strVal(row[4]), numVal(row[5]), strVal(row[6])]
      }
    }

    const dateH = dateVal(row[7])
    if (dateH) {
      const desc = strVal(row[8])
      const amountIn = numVal(row[9])
      const amountOut = numVal(row[10])
      if (amountIn !== 0 || amountOut !== 0 || desc) {
        bankRow = [dateH, desc, amountIn, amountOut, numVal(row[11]), strVal(row[12])]
      }
    }

    const dateN = dateVal(row[13])
    if (dateN) {
      const desc = strVal(row[14])
      const amountIn = numVal(row[15])
      const amountOut = numVal(row[16])
      if (amountIn !== 0 || amountOut !== 0 || desc) {
        billsRow = [dateN, desc, amountIn, amountOut, numVal(row[17]), strVal(row[18])]
      }
    }

    batch.push({ cash: cashRow, bank: bankRow, bills: billsRow, excelRow: i + 1 })
  }
  insertMany(batch)
}

function attachRowImages(db, relatedTable, relatedId, images, minCol, maxCol) {
  if (!relatedId) return 0
  let count = 0
  for (const image of images) {
    if (image.col < minCol || image.col > maxCol) continue
    count += insertAttachmentIfMissing(db, relatedTable, relatedId, image.filePath, image.fileName)
  }
  return count
}

function insertAttachmentIfMissing(db, relatedTable, relatedId, filePath, fileName) {
  const result = db.prepare(`
    INSERT INTO attachments (related_table, related_id, file_path, file_name)
    SELECT ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM attachments
      WHERE related_table = ? AND related_id = ? AND file_path = ?
    )
  `).run(relatedTable, relatedId, filePath, fileName, relatedTable, relatedId, filePath)
  return Number(result.changes || 0)
}

function importCustomerSheet(db, sheetName, rows, imported, imagesBySheetRow) {
  const headerIndex = rows.findIndex(row => row.some(cell => strVal(cell).includes('发货日期')))
  if (headerIndex === -1) return

  const header = rows[headerIndex].map(strVal)
  const col = (label) => header.findIndex(cell => cell.includes(label))
  const dateCol = col('发货日期')
  const contractCol = col('合同编号')
  const productCol = col('产品名称')
  const specCol = col('规格') >= 0 ? col('规格') : col('产品尺寸')
  const unitCol = col('单位')
  const qtyCol = col('数量')
  const priceCol = col('单价')
  const amountCol = col('金额')
  const noteCol = col('备注')
  const payDateCol = col('付款时间')
  const payAmountCol = col('付款金额')
  const payNoteCol = payAmountCol >= 0 ? payAmountCol + 1 : -1

  if (dateCol < 0 || amountCol < 0) return

  const insert = db.prepare(`
    INSERT OR IGNORE INTO customer_ledger (customer_name, date, description, amount_in, amount_out, balance, note, month_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const findExisting = db.prepare(`
    SELECT id FROM customer_ledger
    WHERE customer_name = ? AND date = ? AND description = ?
      AND amount_in = ? AND amount_out = ? AND balance = ? AND note = ?
    ORDER BY id DESC LIMIT 1
  `)
  const insertAttachment = db.prepare(`
    INSERT INTO attachments (related_table, related_id, file_path, file_name)
    SELECT ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM attachments
      WHERE related_table = ? AND related_id = ? AND file_path = ?
    )
  `)
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      const { values, excelRow } = item
      const result = insert.run(...values)
      let recordId = Number(result.lastInsertRowid || 0)
      if (result.changes) {
        imported.customers++
      } else {
        const existing = findExisting.get(values[0], values[1], values[2], values[3], values[4], values[5], values[6])
        recordId = Number(existing?.id || 0)
      }
      if (!recordId || !excelRow) continue
      const images = imagesBySheetRow.get(imageRowKey(sheetName, excelRow)) || []
      for (const image of images) {
        const inserted = insertAttachment.run('customer_ledger', recordId, image.filePath, image.fileName, 'customer_ledger', recordId, image.filePath)
        if (inserted.changes) imported.attachments++
      }
    }
  })

  const events = []
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    const excelRow = i + 1
    const date = dateVal(row[dateCol])
    const amount = numVal(row[amountCol])
    const payDate = payDateCol >= 0 ? dateVal(row[payDateCol]) : ''
    const payAmount = payAmountCol >= 0 ? numVal(row[payAmountCol]) : 0

    if (date && amount > 0) {
      const details = [
        strVal(row[contractCol]),
        strVal(row[productCol]),
        strVal(row[specCol]),
        strVal(row[unitCol]),
        strVal(row[qtyCol]) ? `数量${strVal(row[qtyCol])}` : '',
        strVal(row[priceCol]) ? `单价${strVal(row[priceCol])}` : ''
      ].filter(Boolean)
      events.push({ date, description: details.join(' '), amountIn: amount, amountOut: 0, note: noteCol >= 0 ? strVal(row[noteCol]) : '', excelRow })
    }

    if (payDate && payAmount > 0) {
      events.push({ date: payDate, description: '付款', amountIn: 0, amountOut: payAmount, note: payNoteCol >= 0 ? strVal(row[payNoteCol]) : '' })
    }
  }

  const batch = []
  let balance = 0
  events.sort((a, b) => dateKey(a.date) - dateKey(b.date))
  for (const event of events) {
    balance += event.amountIn - event.amountOut
    batch.push({ values: [sheetName, event.date, event.description, event.amountIn, event.amountOut, balance, event.note, ''], excelRow: event.excelRow })
  }

  insertMany(batch)
}

function countRows(db) {
  return {
    cash: db.prepare('SELECT COUNT(*) AS count FROM cash_ledger WHERE deleted_at IS NULL').get().count,
    bank: db.prepare('SELECT COUNT(*) AS count FROM bank_ledger WHERE deleted_at IS NULL').get().count,
    bills: db.prepare('SELECT COUNT(*) AS count FROM acceptance_bills WHERE deleted_at IS NULL').get().count,
    customers: db.prepare('SELECT COUNT(*) AS count FROM customer_ledger WHERE deleted_at IS NULL').get().count
  }
}
