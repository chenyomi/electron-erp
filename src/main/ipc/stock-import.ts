import * as XLSX from 'xlsx'
import { setSupplierProfile } from './supplier-profile'

export interface StockInImportResult {
  stockIn: number
  skipped: number
  sheets: number
}

function numVal(v: any): number {
  if (v === '' || v === null || v === undefined) return 0
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function strVal(v: any): string {
  return String(v ?? '').trim()
}

function dateVal(v: any): string {
  const value = strVal(v)
  if (!value) return ''
  if (value.includes('合计') || value.includes('总') || value.includes('欠款')) return ''

  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}.${m}.${d}`
  }

  if (typeof v === 'number' && v > 30000 && v < 60000) {
    const parsed = XLSX.SSF.parse_date_code(v)
    if (parsed) {
      return `${parsed.y}.${String(parsed.m).padStart(2, '0')}.${String(parsed.d).padStart(2, '0')}`
    }
  }

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

function parseCategory(title: string): string {
  if (title.includes('铝材料')) return '铝材料'
  if (title.includes('铜材料')) return '铜材料'
  if (title.includes('外协加工')) return '外协加工'
  if (title.includes('材料')) return '材料'
  return ''
}

function parseSupplier(rows: any[][], sheetName: string): string {
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

function isFooterRow(row: any[]): boolean {
  const markers = ['上期欠款', '累计应付款', '合计', '金额大写']
  return markers.some(m => row.some(cell => strVal(cell).includes(m)))
}

const SKIP_SHEETS = new Set(['Sheet1', 'Sheet3', 'Sheet4'])

export function importStockInExcel(db: any, filePath: string): StockInImportResult {
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const result: StockInImportResult = { stockIn: 0, skipped: 0, sheets: 0 }

  const exists = db.prepare(`
    SELECT 1 FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ? AND date = ? AND contract_no = ?
      AND product_name = ? AND spec = ? AND unit = ?
      AND quantity = ? AND unit_price = ? AND amount = ? AND note = ?
    LIMIT 1
  `)

  const insert = db.prepare(`
    INSERT INTO stock_in_ledger (
      supplier_name, category, date, contract_no, product_name, spec, unit,
      quantity, unit_price, amount, tax_rate, tax_amount, invoice_amount, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((items: any[][]) => {
    for (const values of items) {
      const [
        supplierName, , date, contractNo, productName, spec, unit,
        quantity, unitPrice, amount, , , , note,
      ] = values
      if (exists.get(supplierName, date, contractNo, productName, spec, unit, quantity, unitPrice, amount, note)) {
        result.skipped++
        continue
      }
      insert.run(...values)
      result.stockIn++
    }
  })

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
    const headerIndex = rows.findIndex(row =>
      row.some(cell => strVal(cell).includes('产品名称'))
    )
    if (headerIndex === -1) continue

    const category = parseCategory(strVal(rows[0]?.[0]))
    const supplierName = parseSupplier(rows, sheetName)
    if (supplierName) {
      setSupplierProfile(db, { supplier_name: supplierName })
    }
    const header = rows[headerIndex].map(strVal)
    const col = (label: string) => header.findIndex(cell => cell.replace(/\s/g, '').includes(label.replace(/\s/g, '')))

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

    const batch: any[][] = []
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
        supplierName,
        category,
        date,
        contractCol >= 0 ? strVal(row[contractCol]) : '',
        productName,
        specCol >= 0 ? strVal(row[specCol]) : '',
        unitCol >= 0 ? strVal(row[unitCol]) : '',
        quantity,
        unitPrice,
        amount,
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
