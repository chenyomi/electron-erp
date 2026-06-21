import { ipcMain, dialog } from 'electron'
import { getDb } from '../db'
import { buildCustomerDescription } from '../../common/customer-ledger'
import { isCustomerSummaryRowCells, isLikelyAmountNotDate, parsePlainAmount } from '../../common/customer-anomaly'
import { parseLedgerDate } from '../../common/ledger-date'
import { parseOpeningBalanceFromRows, recalculateCustomerBalances, setCustomerProfile } from './customer-profile'
import { repairCustomerAnomalies } from './customer-anomaly'
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { getDataDir } from '../db'
import sharp from 'sharp'
import { insertAttachmentIfMissing } from './attachments'
import { importStockInExcel } from './stock-import'
import { rebuildInventoryBusinessTables } from './stock-business'

export function registerImportHandlers(): void {
  ipcMain.handle('import:pick-file', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile']
    })
    return result.filePaths[0] || null
  })

  ipcMain.handle('import:excel', async (_e, filePath: string) => {
    try {
      const db = getDb()
      return { ok: true, imported: await importExcelFile(db, filePath) }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('import:stock-in', async (_e, filePath: string) => {
    try {
      const db = getDb()
      const imported = importStockInExcel(db, filePath)
      rebuildInventoryBusinessTables()
      return { ok: true, imported }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })
}

export interface ImportResult {
  cash: number
  bank: number
  bills: number
  customers: number
  images: number
  attachments: number
}

interface StoredExcelImage {
  row: number
  col: number
  filePath: string
  fileName: string
}

interface ExtractedExcelImages {
  total: number
  bySheetRow: Map<string, StoredExcelImage[]>
}

export async function importExcelFile(db: any, filePath: string): Promise<ImportResult> {
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const imported = { cash: 0, bank: 0, bills: 0, customers: 0, images: 0, attachments: 0 }
  const extractedImages = await extractExcelImages(filePath)
  imported.images = extractedImages.total

  const mainSheet = wb.Sheets['帐本'] || wb.Sheets[wb.SheetNames[0]]
  if (mainSheet) {
    const rows: any[][] = XLSX.utils.sheet_to_json(mainSheet, { header: 1, defval: '', raw: false })
    importMainSheet(db, rows, imported, extractedImages.bySheetRow)
  }

  const skipSheets = new Set(['帐本', 'Sheet2', 'Sheet5', 'Sheet6', '滨海昊亮备份'])
  for (const name of wb.SheetNames) {
    if (skipSheets.has(name)) continue
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
    importCustomerSheet(db, name, rows, imported, extractedImages.bySheetRow)
  }

  return imported
}

async function extractExcelImages(filePath: string): Promise<ExtractedExcelImages> {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  const outputRoot = path.join(getDataDir(), 'excel-images')
  fs.mkdirSync(outputRoot, { recursive: true })

  const workbookXml = await zip.file('xl/workbook.xml')?.async('string')
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!workbookXml || !workbookRelsXml) return { total: 0, bySheetRow: new Map() }

  const workbookRels = parseRels(workbookRelsXml)
  const sheets = parseSheets(workbookXml)
  const seen = new Set<string>()
  const bySheetRow = new Map<string, StoredExcelImage[]>()
  let count = 0

  for (const sheet of sheets) {
    const target = workbookRels.get(sheet.rid)
    if (!target) continue
    const sheetPath = normalizeZipPath('xl', target)
    const sheetRelPath = relsPath(sheetPath)
    const sheetRelsXml = await zip.file(sheetRelPath)?.async('string')
    if (!sheetRelsXml) continue

    const sheetRels = parseRels(sheetRelsXml)
    for (const drawingTarget of sheetRels.values()) {
      if (!drawingTarget.includes('drawing')) continue
      const drawingPath = normalizeZipPath(path.posix.dirname(sheetPath), drawingTarget)
      const drawingXml = await zip.file(drawingPath)?.async('string')
      if (!drawingXml) continue

      const drawingRelPath = relsPath(drawingPath)
      const drawingRelsXml = await zip.file(drawingRelPath)?.async('string')
      if (!drawingRelsXml) continue
      const drawingRels = parseRels(drawingRelsXml)

      for (const image of parseDrawingImages(drawingXml)) {
        const mediaTarget = drawingRels.get(image.rid)
        if (!mediaTarget) continue
        const mediaPath = normalizeZipPath(path.posix.dirname(drawingPath), mediaTarget)
        const mediaFile = zip.file(mediaPath)
        if (!mediaFile) continue

        const safeSheet = safeName(sheet.name)
        const originalExt = path.extname(mediaPath) || '.png'
        const originalBase = path.basename(mediaPath, originalExt)
        const fileName = `${String(image.row).padStart(4, '0')}_${String(image.col).padStart(2, '0')}_${originalBase}.webp`
        const key = `${safeSheet}/${fileName}`
        if (seen.has(key)) continue
        seen.add(key)

        const sheetDir = path.join(outputRoot, safeSheet)
        fs.mkdirSync(sheetDir, { recursive: true })
        const raw = Buffer.from(await mediaFile.async('uint8array'))
        const optimized = await optimizeImage(raw)
        const outputPath = path.join(sheetDir, fileName)
        fs.writeFileSync(outputPath, optimized)
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

async function optimizeImage(raw: Buffer): Promise<Buffer> {
  try {
    const optimized = await sharp(raw)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer()
    return optimized
  } catch {
    return raw
  }
}

function imageRowKey(sheetName: string, row: number): string {
  return `${sheetName}::${row}`
}

function parseRels(xml: string): Map<string, string> {
  const rels = new Map<string, string>()
  const re = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) rels.set(match[1], match[2])
  return rels
}

function parseSheets(xml: string): Array<{ name: string; rid: string }> {
  const sheets: Array<{ name: string; rid: string }> = []
  const re = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) sheets.push({ name: decodeXml(match[1]), rid: match[2] })
  return sheets
}

function parseDrawingImages(xml: string): Array<{ row: number; col: number; rid: string }> {
  const images: Array<{ row: number; col: number; rid: string }> = []
  const anchorRe = /<xdr:(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g
  let anchor: RegExpExecArray | null
  while ((anchor = anchorRe.exec(xml))) {
    const block = anchor[0]
    const row = Number(block.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? -1) + 1
    const col = Number(block.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1] ?? -1) + 1
    const rid = block.match(/<a:blip[^>]*r:embed="([^"]+)"/)?.[1]
    if (row > 0 && col > 0 && rid) images.push({ row, col, rid })
  }
  return images
}

function normalizeZipPath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  return path.posix.normalize(path.posix.join(baseDir, target))
}

function relsPath(filePath: string): string {
  return path.posix.join(path.posix.dirname(filePath), '_rels', `${path.posix.basename(filePath)}.rels`)
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function numVal(v: any): number {
  if (v === '' || v === null || v === undefined) return 0
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function strVal(v: any): string {
  return String(v ?? '').trim()
}

function dateVal(v: any, monthLabel = ''): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return parseLedgerDate(`${y}-${m}-${d}`, { monthLabel })
  }

  if (typeof v === 'number' && v > 30000 && v < 60000) {
    const parsed = XLSX.SSF.parse_date_code(v)
    if (parsed) {
      return parseLedgerDate(`${parsed.y}.${parsed.m}.${parsed.d}`, { monthLabel })
    }
  }

  return parseLedgerDate(v, { monthLabel })
}

function dateKey(date: string, monthLabel = ''): number {
  const iso = parseLedgerDate(date, { monthLabel })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 0
  const [year, month, day] = iso.split('-').map(Number)
  return year * 10000 + month * 100 + day
}

function resolveImportedPayment(
  row: any[],
  payDateCol: number,
  payAmountCol: number,
  payNoteCol: number,
): { date: string; amountOut: number; note: string } | null {
  if (payAmountCol < 0 && payDateCol < 0) return null

  const dateRaw = payDateCol >= 0 ? row[payDateCol] : ''
  const noteRaw = payNoteCol >= 0 ? row[payNoteCol] : ''
  let payDate = payDateCol >= 0 ? dateVal(dateRaw) : ''
  let payAmount = payAmountCol >= 0 ? numVal(row[payAmountCol]) : 0
  let payNote = payNoteCol >= 0 ? strVal(noteRaw) : ''

  const dateText = strVal(dateRaw)
  const noteText = strVal(noteRaw)

  const dateLooksLikeAmount = isLikelyAmountNotDate(payDate) || isLikelyAmountNotDate(dateText)
  const noteLooksLikeAmount = isLikelyAmountNotDate(noteText)
  if (dateLooksLikeAmount || noteLooksLikeAmount) {
    const inferred = Math.max(parsePlainAmount(dateText), parsePlainAmount(noteText), 0)
    if (inferred >= 100 && (inferred > payAmount || payAmount < 100)) payAmount = inferred
    payDate = ''
    if (!noteText || noteText === dateText || noteLooksLikeAmount) payNote = ''
  } else if (payAmount > 0 && noteLooksLikeAmount && parsePlainAmount(noteText) > payAmount) {
    payAmount = parsePlainAmount(noteText)
    payNote = ''
  }

  if (payAmount <= 0) return null
  return { date: payDate, amountOut: payAmount, note: payNote }
}

function importMainSheet(db: any, rows: any[][], imported: any, imagesBySheetRow: Map<string, StoredExcelImage[]>): void {
  // 帐本: A=日期 B=收入 C=摘要 D=支出 E=经办人 F=余额 G=备注
  //       H=日期(公账) I=摘要 J=进出金额 K=付出 L=余额 M=备注
  //       N=日期(承兑) O=摘要 P=收入 Q=付出 R=余额 S=备注
  const insertCash = db.prepare(`INSERT OR IGNORE INTO cash_ledger (date,income,description,expense,operator,balance,note) VALUES (?,?,?,?,?,?,?)`)
  const insertBank = db.prepare(`INSERT OR IGNORE INTO bank_ledger (date,description,amount_in,amount_out,balance,note) VALUES (?,?,?,?,?,?)`)
  const insertBills = db.prepare(`INSERT OR IGNORE INTO acceptance_bills (date,description,amount_in,amount_out,balance,note) VALUES (?,?,?,?,?,?)`)
  const findCash = db.prepare(`SELECT id FROM cash_ledger WHERE date=? AND income=? AND description=? AND expense=? AND operator=? AND balance=? AND note=? ORDER BY id DESC LIMIT 1`)
  const findBank = db.prepare(`SELECT id FROM bank_ledger WHERE date=? AND description=? AND amount_in=? AND amount_out=? AND balance=? AND note=? ORDER BY id DESC LIMIT 1`)
  const findBills = db.prepare(`SELECT id FROM acceptance_bills WHERE date=? AND description=? AND amount_in=? AND amount_out=? AND balance=? AND note=? ORDER BY id DESC LIMIT 1`)

  const insertMany = db.transaction((data: any[]) => {
    for (const r of data) {
      const { cash, bank, bills, excelRow } = r
      if (cash) {
        const result = insertCash.run(...cash)
        if (result.changes) imported.cash++
        const id = Number(result.changes ? result.lastInsertRowid : (findCash.get(...cash) as any)?.id || 0)
        imported.attachments += attachRowImages(db, 'cash_ledger', id, imagesBySheetRow.get(imageRowKey('帐本', excelRow)) || [], 1, 7)
      }
      if (bank) {
        const result = insertBank.run(...bank)
        if (result.changes) imported.bank++
        const id = Number(result.changes ? result.lastInsertRowid : (findBank.get(...bank) as any)?.id || 0)
        imported.attachments += attachRowImages(db, 'bank_ledger', id, imagesBySheetRow.get(imageRowKey('帐本', excelRow)) || [], 8, 13)
      }
      if (bills) {
        const result = insertBills.run(...bills)
        if (result.changes) imported.bills++
        const id = Number(result.changes ? result.lastInsertRowid : (findBills.get(...bills) as any)?.id || 0)
        imported.attachments += attachRowImages(db, 'acceptance_bills', id, imagesBySheetRow.get(imageRowKey('帐本', excelRow)) || [], 14, 19)
      }
    }
  })

  const batch: any[] = []
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i]
    const dateA = dateVal(row[0])
    const dateH = dateVal(row[7])
    const dateN = dateVal(row[13])

    const isSum = strVal(row[0]).includes('合计') || strVal(row[0]).includes('总')
    if (isSum) continue

    let cashRow = null, bankRow = null, billsRow = null

    if (dateA && dateA !== '' && !dateA.includes('合计')) {
      const income = numVal(row[1])
      const desc = strVal(row[2])
      const expense = numVal(row[3])
      const operator = strVal(row[4])
      const balance = numVal(row[5])
      const note = strVal(row[6])
      if (income !== 0 || expense !== 0 || desc !== '') {
        cashRow = [dateA, income, desc, expense, operator, balance, note]
      }
    }

    if (dateH && !dateH.includes('合计')) {
      const desc = strVal(row[8])
      const amtIn = numVal(row[9])
      const amtOut = numVal(row[10])
      const balance = numVal(row[11])
      const note = strVal(row[12])
      if (amtIn !== 0 || amtOut !== 0 || desc !== '') {
        bankRow = [dateH, desc, amtIn, amtOut, balance, note]
      }
    }

    if (dateN && !dateN.includes('合计')) {
      const desc = strVal(row[14])
      const amtIn = numVal(row[15])
      const amtOut = numVal(row[16])
      const balance = numVal(row[17])
      const note = strVal(row[18])
      if (amtIn !== 0 || amtOut !== 0 || desc !== '') {
        billsRow = [dateN, desc, amtIn, amtOut, balance, note]
      }
    }

    batch.push({ cash: cashRow, bank: bankRow, bills: billsRow, excelRow: i + 1 })
  }

  insertMany(batch)
}

function attachRowImages(
  db: any,
  relatedTable: string,
  relatedId: number,
  images: StoredExcelImage[],
  minCol: number,
  maxCol: number
): number {
  if (!relatedId) return 0
  let count = 0
  for (const image of images) {
    if (image.col < minCol || image.col > maxCol) continue
    count += insertAttachmentIfMissing(db, relatedTable, relatedId, image.filePath, image.fileName)
  }
  return count
}

function importCustomerSheet(
  db: any,
  sheetName: string,
  rows: any[][],
  imported: any,
  imagesBySheetRow: Map<string, StoredExcelImage[]>
): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO customer_ledger (
      customer_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
      amount_in, amount_out, balance, note, month_label
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  const insertMany = db.transaction((items: any[]) => {
    for (const item of items) {
      const { values, excelRow } = item
      const result = insert.run(...values)
      let recordId = Number(result.lastInsertRowid || 0)
      if (result.changes) {
        imported.customers++
      } else {
        const existing = findExisting.get(values[0], values[1], values[2], values[3], values[4], values[5], values[6]) as any
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

  const headerIndex = rows.findIndex(row => row.some(cell => strVal(cell).includes('发货日期')))
  if (headerIndex === -1) return

  const openingBalance = parseOpeningBalanceFromRows(rows, strVal, numVal)
  if (openingBalance) {
    setCustomerProfile(db, { customer_name: sheetName, opening_balance: openingBalance, note: '' })
  }

  const header = rows[headerIndex].map(strVal)
  const col = (label: string): number => header.findIndex(cell => cell.includes(label))
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

  const events: Array<{
    date: string
    contract_no: string
    product_name: string
    spec: string
    unit: string
    quantity: number
    unit_price: number
    description: string
    amountIn: number
    amountOut: number
    note: string
    excelRow?: number
  }> = []
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (isCustomerSummaryRowCells(row)) continue
    const excelRow = i + 1
    const date = dateVal(row[dateCol])
    const amount = numVal(row[amountCol])
    const payment = resolveImportedPayment(row, payDateCol, payAmountCol, payNoteCol)

    if (date && amount > 0) {
      const contract_no = strVal(row[contractCol])
      const product_name = strVal(row[productCol])
      const spec = strVal(row[specCol])
      const unit = strVal(row[unitCol])
      const quantity = numVal(row[qtyCol])
      const unit_price = numVal(row[priceCol])
      const description = buildCustomerDescription({ contract_no, product_name, spec, unit, quantity, unit_price })
      events.push({ date, contract_no, product_name, spec, unit, quantity, unit_price, description, amountIn: amount, amountOut: 0, note: noteCol >= 0 ? strVal(row[noteCol]) : '', excelRow })
    }

    if (payment) {
      events.push({
        date: payment.date,
        contract_no: '',
        product_name: '付款',
        spec: '',
        unit: '',
        quantity: 0,
        unit_price: 0,
        description: '付款',
        amountIn: 0,
        amountOut: payment.amountOut,
        note: payment.note,
        excelRow,
      })
    }
  }

  const batch: any[] = []
  let balance = openingBalance
  events.sort((a, b) => dateKey(a.date) - dateKey(b.date))
  for (const event of events) {
    balance += event.amountIn - event.amountOut
    batch.push({
      values: [
        sheetName,
        event.date,
        event.description,
        event.contract_no,
        event.product_name,
        event.spec,
        event.unit,
        event.quantity,
        event.unit_price,
        event.amountIn,
        event.amountOut,
        balance,
        event.note,
        '',
      ],
      excelRow: event.excelRow,
    })
  }
  insertMany(batch)
  repairCustomerAnomalies(db, sheetName)
  recalculateCustomerBalances(db, sheetName)
}
