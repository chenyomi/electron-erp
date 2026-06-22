import * as XLSX from 'xlsx-js-style'
import { enrichCustomerRow } from '../../common/customer-ledger'
import { buildDateOrderBy } from '../../common/ledger-date'
import { buildDateFilterClause } from '../ipc/helpers'

export type ExportTable = 'all' | 'cash' | 'bank' | 'bills' | 'customer' | 'stockIn' | 'stockOut'

export interface ExportParams {
  table?: ExportTable
  keyword?: string
  customerName?: string
  supplierName?: string
  year?: string | number
  month?: string | number
  startDate?: string
  endDate?: string
  ids?: number[]
}

const COMPANY_NAME = '温州东昊汽车配件有限公司'
const THEME = {
  navy: '17365D',
  blue: '2563A8',
  lightBlue: 'DCEBFA',
  paleBlue: 'F5FAFF',
  gray: 'F3F6FA',
  softGray: 'FAFBFD',
  white: 'FFFFFF',
  text: '1F2933',
  muted: '637083',
  border: 'CBD6E2',
  accent: 'EAF2FF',
  warning: 'FFF7E6',
}

const thinBorder = {
  top: { style: 'thin', color: { rgb: THEME.border } },
  bottom: { style: 'thin', color: { rgb: THEME.border } },
  left: { style: 'thin', color: { rgb: THEME.border } },
  right: { style: 'thin', color: { rgb: THEME.border } },
}

type ColumnType = 'text' | 'money' | 'qty'

interface ExportColumn {
  key: string
  header: string
  width: number
  type?: ColumnType
  sum?: 'money' | 'qty' | 'count'
}

interface ExportDesign {
  sheetName: string
  defaultFileName: string
  title: string
  columns: ExportColumn[]
  query: (params: ExportParams) => { sql: string; params: any[] }
  mapRow: (row: any, index: number) => Record<string, string | number>
}

function getSelectedIds(ids: unknown) {
  if (!Array.isArray(ids)) return []
  return ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
}

function num(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function text(value: unknown) {
  return value == null ? '' : String(value)
}

function moneyCell(value: number) {
  return { v: value, t: 'n' as const, z: '#,##0.00' }
}

function qtyCell(value: number) {
  return { v: value, t: 'n' as const, z: '#,##0.###' }
}

function textCell(value: string | number) {
  return { v: value, t: 's' as const }
}

function encodeRange(startRow: number, startCol: number, endRow: number, endCol: number) {
  return XLSX.utils.encode_range({ s: { r: startRow, c: startCol }, e: { r: endRow, c: endCol } })
}

function setCellStyle(sheet: XLSX.WorkSheet, row: number, col: number, style: any) {
  const address = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = (sheet[address] || { v: '', t: 's' }) as any
  sheet[address] = cell
  if (!cell) return
  cell.s = { ...(cell.s || {}), ...style }
}

function styleRow(sheet: XLSX.WorkSheet, row: number, colCount: number, style: any) {
  for (let col = 0; col < colCount; col++) setCellStyle(sheet, row, col, style)
}

function styleTableCell(sheet: XLSX.WorkSheet, row: number, col: number, column: ExportColumn, fill?: string) {
  const style: any = {
    border: thinBorder,
    font: { name: 'Microsoft YaHei', sz: 10, color: { rgb: THEME.text } },
    alignment: {
      horizontal: column.type === 'money' || column.type === 'qty'
        ? 'right'
        : ['index', 'date', 'month_label', 'unit', 'category'].includes(column.key)
          ? 'center'
          : 'left',
      vertical: 'center',
      wrapText: ['description', 'note', 'product_name', 'spec'].includes(column.key),
    },
  }
  if (fill) style.fill = { patternType: 'solid', fgColor: { rgb: fill } }
  setCellStyle(sheet, row, col, style)
}

function buildFilterLine(params: ExportParams) {
  const parts: string[] = []
  const ids = getSelectedIds(params.ids)
  if (ids.length) parts.push(`已选 ${ids.length} 条`)
  if (params.keyword?.trim()) parts.push(`关键词：${params.keyword.trim()}`)
  if (params.customerName?.trim()) parts.push(`客户：${params.customerName.trim()}`)
  if (params.supplierName?.trim()) parts.push(`供应商：${params.supplierName.trim()}`)
  if (params.year) parts.push(`年份：${params.year}`)
  if (params.month) parts.push(`月份：${String(params.month).padStart(2, '0')}`)
  if (params.startDate) parts.push(`开始日期：${params.startDate}`)
  if (params.endDate) parts.push(`结束日期：${params.endDate}`)
  return parts.length ? `筛选条件：${parts.join('；')}` : '筛选条件：全部记录'
}

function emptyRow(colCount: number) {
  return Array.from({ length: colCount }, () => '')
}

function buildTitleBlock(design: ExportDesign, params: ExportParams, rowCount: number) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const exportedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const colCount = design.columns.length
  const splitCol = Math.max(Math.floor(colCount / 2), 1)
  const companyRow = emptyRow(colCount)
  companyRow[0] = COMPANY_NAME
  companyRow[splitCol] = `导出时间：${exportedAt}`
  const filterRow = emptyRow(colCount)
  filterRow[0] = buildFilterLine(params)
  filterRow[splitCol] = `记录数：${rowCount} 条`
  return [
    [design.title, ...emptyRow(Math.max(colCount - 1, 0))],
    companyRow,
    filterRow,
    emptyRow(colCount),
  ]
}

function summarizeRows(columns: ExportColumn[], rows: Record<string, string | number>[]) {
  const summary: Record<string, string | number> = {}
  for (const column of columns) {
    if (column.key === 'index') {
      summary[column.key] = rows.length
      continue
    }
    if (!column.sum) continue
    if (column.sum === 'count') {
      summary[column.key] = rows.length
      continue
    }
    const total = rows.reduce((sum, row) => sum + num(row[column.key]), 0)
    summary[column.key] = column.sum === 'qty' ? total : Math.round(total * 100) / 100
  }
  return summary
}

function summaryLabelKey(designColumns: ExportColumn[]) {
  const preferred = ['description', 'supplier_name', 'customer_name', 'product_name']
  return preferred.find(key => designColumns.some(column => column.key === key))
}

function buildSummaryCells(design: ExportDesign, designColumns: ExportColumn[], rows: Record<string, string | number>[], summary: Record<string, string | number>) {
  const labelKey = summaryLabelKey(designColumns)
  return designColumns.map((column) => {
    if (column.key === 'index') return rows.length
    if (column.key === labelKey) return '合计'
    if (column.sum === 'money' || column.sum === 'qty') return summary[column.key] ?? ''
    if (column.key === 'balance' && ['现金账', '公账', '承兑票'].includes(design.sheetName) && rows.length) {
      return num(rows[rows.length - 1][column.key])
    }
    return ''
  })
}

function createWorksheet(design: ExportDesign, params: ExportParams, rawRows: any[]) {
  const rows = rawRows.map((row, index) => design.mapRow(row, index))
  const titleBlock = buildTitleBlock(design, params, rows.length)
  const headerRow = design.columns.map((column) => column.header)
  const dataRows = rows.map((row) => design.columns.map((column) => row[column.key] ?? ''))
  const summary = summarizeRows(design.columns, rows)
  const summaryCells = buildSummaryCells(design, design.columns, rows, summary)

  const aoa = [...titleBlock, headerRow, ...dataRows, summaryCells]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  const headerRowIndex = titleBlock.length
  const summaryRowIndex = headerRowIndex + dataRows.length + 1

  for (let rowIndex = headerRowIndex + 1; rowIndex < headerRowIndex + 1 + dataRows.length; rowIndex++) {
    design.columns.forEach((column, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
      const cell = sheet[address]
      if (!cell) return
      const value = num(cell.v)
      if (column.type === 'money') sheet[address] = moneyCell(value)
      if (column.type === 'qty') sheet[address] = qtyCell(value)
    })
  }

  design.columns.forEach((column, columnIndex) => {
    const address = XLSX.utils.encode_cell({ r: summaryRowIndex, c: columnIndex })
    const raw = summaryCells[columnIndex]
    if (raw === '' || raw == null) return
    if (column.type === 'money') sheet[address] = moneyCell(num(raw))
    else if (column.type === 'qty') sheet[address] = qtyCell(num(raw))
    else sheet[address] = textCell(String(raw))
  })

  sheet['!cols'] = design.columns.map((column) => ({ wch: column.width }))
  sheet['!rows'] = [
    { hpt: 34 },
    { hpt: 22 },
    { hpt: 22 },
    { hpt: 6 },
    { hpt: 26 },
    ...dataRows.map(() => ({ hpt: 24 })),
    { hpt: 26 },
  ]
  const splitCol = Math.max(Math.floor(design.columns.length / 2), 1)
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(design.columns.length - 1, 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: splitCol - 1 } },
    { s: { r: 1, c: splitCol }, e: { r: 1, c: Math.max(design.columns.length - 1, splitCol) } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: splitCol - 1 } },
    { s: { r: 2, c: splitCol }, e: { r: 2, c: Math.max(design.columns.length - 1, splitCol) } },
  ]
  sheet['!autofilter'] = { ref: encodeRange(headerRowIndex, 0, Math.max(headerRowIndex + dataRows.length, headerRowIndex), design.columns.length - 1) }
  sheet['!freeze'] = { xSplit: 0, ySplit: headerRowIndex + 1, topLeftCell: 'A' + (headerRowIndex + 2), activePane: 'bottomLeft', state: 'frozen' }

  styleRow(sheet, 0, design.columns.length, {
    font: { name: 'Microsoft YaHei', sz: 17, bold: true, color: { rgb: THEME.white } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.navy } },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  styleRow(sheet, 1, design.columns.length, {
    font: { name: 'Microsoft YaHei', sz: 10, bold: true, color: { rgb: THEME.text } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.accent } },
    border: thinBorder,
    alignment: { vertical: 'center' },
  })
  styleRow(sheet, 2, design.columns.length, {
    font: { name: 'Microsoft YaHei', sz: 10, color: { rgb: THEME.muted } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.softGray } },
    border: thinBorder,
    alignment: { vertical: 'center' },
  })
  styleRow(sheet, headerRowIndex, design.columns.length, {
    font: { name: 'Microsoft YaHei', sz: 10.5, bold: true, color: { rgb: THEME.white } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.blue } },
    border: thinBorder,
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  for (let rowIndex = headerRowIndex + 1; rowIndex < headerRowIndex + 1 + dataRows.length; rowIndex++) {
    const fill = (rowIndex - headerRowIndex) % 2 === 0 ? THEME.paleBlue : undefined
    design.columns.forEach((column, columnIndex) => styleTableCell(sheet, rowIndex, columnIndex, column, fill))
  }
  styleRow(sheet, summaryRowIndex, design.columns.length, {
    font: { name: 'Microsoft YaHei', sz: 10.5, bold: true, color: { rgb: THEME.text } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.lightBlue } },
    border: thinBorder,
    alignment: { vertical: 'center', horizontal: 'center' },
  })
  design.columns.forEach((column, columnIndex) => {
    if (column.type === 'money' || column.type === 'qty') {
      styleTableCell(sheet, summaryRowIndex, columnIndex, column, THEME.lightBlue)
      setCellStyle(sheet, summaryRowIndex, columnIndex, {
        font: { name: 'Microsoft YaHei', sz: 10.5, bold: true, color: { rgb: THEME.text } },
      })
    }
  })

  return { sheet, rows }
}

function idsQuery(table: string, columns: string, ids: number[], orderBy: string) {
  return {
    sql: `
      SELECT ${columns}
      FROM ${table}
      WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
      ORDER BY ${orderBy}
    `,
    params: ids,
  }
}

const exportDesigns: Record<Exclude<ExportTable, 'all'>, ExportDesign> = {
  cash: {
    sheetName: '现金账',
    defaultFileName: '现金账导出',
    title: '现金账',
    columns: [
      { key: 'index', header: '序号', width: 6, sum: 'count' },
      { key: 'date', header: '日期', width: 12 },
      { key: 'description', header: '摘要', width: 28 },
      { key: 'income', header: '收入金额', width: 14, type: 'money', sum: 'money' },
      { key: 'expense', header: '支出金额', width: 14, type: 'money', sum: 'money' },
      { key: 'balance', header: '余额', width: 14, type: 'money' },
      { key: 'operator', header: '经办人', width: 12 },
      { key: 'note', header: '备注', width: 24 },
    ],
    query: (params) => {
      const ids = getSelectedIds(params.ids)
      const columns = 'date, income, description, expense, operator, balance, note'
      if (ids.length) return idsQuery('cash_ledger', columns, ids, buildDateOrderBy('date'))
      const like = `%${params.keyword || ''}%`
      const dateWhere = buildDateFilterClause(params)
      return {
        sql: `
          SELECT ${columns}
          FROM cash_ledger
          WHERE deleted_at IS NULL
            AND (description LIKE ? OR operator LIKE ? OR note LIKE ? OR date LIKE ?)
            ${dateWhere.sql}
          ORDER BY ${buildDateOrderBy('date')}
        `,
        params: [like, like, like, like, ...dateWhere.params],
      }
    },
    mapRow: (row, index) => ({
      index: index + 1,
      date: text(row.date),
      description: text(row.description),
      income: num(row.income),
      expense: num(row.expense),
      balance: num(row.balance),
      operator: text(row.operator),
      note: text(row.note),
    }),
  },
  bank: {
    sheetName: '公账',
    defaultFileName: '公账导出',
    title: '公账',
    columns: [
      { key: 'index', header: '序号', width: 6, sum: 'count' },
      { key: 'date', header: '日期', width: 12 },
      { key: 'description', header: '摘要', width: 30 },
      { key: 'amount_in', header: '进账', width: 14, type: 'money', sum: 'money' },
      { key: 'amount_out', header: '付出', width: 14, type: 'money', sum: 'money' },
      { key: 'balance', header: '余额', width: 14, type: 'money' },
      { key: 'note', header: '备注', width: 24 },
    ],
    query: (params) => {
      const ids = getSelectedIds(params.ids)
      const columns = 'date, description, amount_in, amount_out, balance, note'
      if (ids.length) return idsQuery('bank_ledger', columns, ids, buildDateOrderBy('date'))
      const like = `%${params.keyword || ''}%`
      const dateWhere = buildDateFilterClause(params)
      return {
        sql: `
          SELECT ${columns}
          FROM bank_ledger
          WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
            ${dateWhere.sql}
          ORDER BY ${buildDateOrderBy('date')}
        `,
        params: [like, like, like, ...dateWhere.params],
      }
    },
    mapRow: (row, index) => ({
      index: index + 1,
      date: text(row.date),
      description: text(row.description),
      amount_in: num(row.amount_in),
      amount_out: num(row.amount_out),
      balance: num(row.balance),
      note: text(row.note),
    }),
  },
  bills: {
    sheetName: '承兑票',
    defaultFileName: '承兑票导出',
    title: '承兑票',
    columns: [
      { key: 'index', header: '序号', width: 6, sum: 'count' },
      { key: 'date', header: '日期', width: 12 },
      { key: 'description', header: '摘要', width: 30 },
      { key: 'amount_in', header: '收票', width: 14, type: 'money', sum: 'money' },
      { key: 'amount_out', header: '付出', width: 14, type: 'money', sum: 'money' },
      { key: 'balance', header: '余额', width: 14, type: 'money' },
      { key: 'note', header: '备注', width: 24 },
    ],
    query: (params) => {
      const ids = getSelectedIds(params.ids)
      const columns = 'date, description, amount_in, amount_out, balance, note'
      if (ids.length) return idsQuery('acceptance_bills', columns, ids, buildDateOrderBy('date'))
      const like = `%${params.keyword || ''}%`
      const dateWhere = buildDateFilterClause(params)
      return {
        sql: `
          SELECT ${columns}
          FROM acceptance_bills
          WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
            ${dateWhere.sql}
          ORDER BY ${buildDateOrderBy('date')}
        `,
        params: [like, like, like, ...dateWhere.params],
      }
    },
    mapRow: (row, index) => ({
      index: index + 1,
      date: text(row.date),
      description: text(row.description),
      amount_in: num(row.amount_in),
      amount_out: num(row.amount_out),
      balance: num(row.balance),
      note: text(row.note),
    }),
  },
  customer: {
    sheetName: '客户往来',
    defaultFileName: '客户往来导出',
    title: '客户往来账',
    columns: [
      { key: 'index', header: '序号', width: 6, sum: 'count' },
      { key: 'customer_name', header: '客户名称', width: 18 },
      { key: 'date', header: '日期', width: 12 },
      { key: 'contract_no', header: '合同编号', width: 14 },
      { key: 'product_name', header: '产品名称', width: 18 },
      { key: 'spec', header: '规格型号', width: 16 },
      { key: 'unit', header: '单位', width: 8 },
      { key: 'quantity', header: '数量', width: 10, sum: 'qty' },
      { key: 'unit_price', header: '单价', width: 10, type: 'money' },
      { key: 'amount_in', header: '金额', width: 14, type: 'money', sum: 'money' },
      { key: 'amount_out', header: '付款', width: 14, type: 'money', sum: 'money' },
      { key: 'balance', header: '余额', width: 14, type: 'money' },
      { key: 'month_label', header: '月份', width: 10 },
      { key: 'note', header: '备注', width: 20 },
    ],
    query: (params) => {
      const ids = getSelectedIds(params.ids)
      const columns = 'customer_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price, amount_in, amount_out, balance, note, month_label'
      if (ids.length) return idsQuery('customer_ledger', columns, ids, `customer_name ASC, ${buildDateOrderBy('date')}`)
      const like = `%${params.keyword || ''}%`
      const customerName = params.customerName || ''
      const dateWhere = buildDateFilterClause(params)
      return {
        sql: `
          SELECT ${columns}
          FROM customer_ledger
          WHERE deleted_at IS NULL
            AND (? = '' OR customer_name = ?)
            AND (description LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?
              OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
            ${dateWhere.sql}
          ORDER BY customer_name ASC, ${buildDateOrderBy('date')}
        `,
        params: [customerName, customerName, like, like, like, like, like, like, like, ...dateWhere.params],
      }
    },
    mapRow: (row, index) => {
      const item = enrichCustomerRow(row)
      return {
        index: index + 1,
        customer_name: text(item.customer_name),
        date: text(item.date),
        contract_no: text(item.contract_no),
        product_name: text(item.product_name),
        spec: text(item.spec),
        unit: text(item.unit),
        quantity: num(item.quantity),
        unit_price: num(item.unit_price),
        amount_in: num(item.amount_in),
        amount_out: num(item.amount_out),
        balance: num(item.balance),
        month_label: text(item.month_label),
        note: text(item.note),
      }
    },
  },
  stockIn: {
    sheetName: '产品入库',
    defaultFileName: '产品入库导出',
    title: '产品入库明细',
    columns: [
      { key: 'index', header: '序号', width: 6, sum: 'count' },
      { key: 'supplier_name', header: '供应商', width: 16 },
      { key: 'category', header: '类别', width: 10 },
      { key: 'date', header: '日期', width: 12 },
      { key: 'contract_no', header: '合同编号', width: 14 },
      { key: 'product_name', header: '产品名称', width: 18 },
      { key: 'spec', header: '规格', width: 14 },
      { key: 'unit', header: '单位', width: 8 },
      { key: 'quantity', header: '数量', width: 12, type: 'qty', sum: 'qty' },
      { key: 'unit_price', header: '单价', width: 12, type: 'money' },
      { key: 'amount', header: '金额', width: 14, type: 'money', sum: 'money' },
      { key: 'tax_rate', header: '税率', width: 10, type: 'money' },
      { key: 'tax_amount', header: '税额', width: 12, type: 'money', sum: 'money' },
      { key: 'invoice_amount', header: '开票金额', width: 14, type: 'money', sum: 'money' },
      { key: 'note', header: '备注', width: 20 },
    ],
    query: (params) => {
      const ids = getSelectedIds(params.ids)
      const columns = 'supplier_name, category, date, contract_no, product_name, spec, unit, quantity, unit_price, amount, tax_rate, tax_amount, invoice_amount, note'
      if (ids.length) return idsQuery('stock_in_ledger', columns, ids, buildDateOrderBy('date'))
      const like = `%${params.keyword || ''}%`
      const supplierName = params.supplierName || ''
      const dateWhere = buildDateFilterClause(params)
      return {
        sql: `
          SELECT ${columns}
          FROM stock_in_ledger
          WHERE deleted_at IS NULL
            AND (? = '' OR supplier_name = ?)
            AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR supplier_name LIKE ?)
            ${dateWhere.sql}
          ORDER BY ${buildDateOrderBy('date')}
        `,
        params: [supplierName, supplierName, like, like, like, like, like, like, ...dateWhere.params],
      }
    },
    mapRow: (row, index) => ({
      index: index + 1,
      supplier_name: text(row.supplier_name),
      category: text(row.category),
      date: text(row.date),
      contract_no: text(row.contract_no),
      product_name: text(row.product_name),
      spec: text(row.spec),
      unit: text(row.unit),
      quantity: num(row.quantity),
      unit_price: num(row.unit_price),
      amount: num(row.amount),
      tax_rate: num(row.tax_rate),
      tax_amount: num(row.tax_amount),
      invoice_amount: num(row.invoice_amount),
      note: text(row.note),
    }),
  },
  stockOut: {
    sheetName: '产品出库',
    defaultFileName: '产品出库导出',
    title: '产品出库明细',
    columns: [
      { key: 'index', header: '序号', width: 6, sum: 'count' },
      { key: 'customer_name', header: '客户', width: 16 },
      { key: 'category', header: '类别', width: 10 },
      { key: 'date', header: '日期', width: 12 },
      { key: 'contract_no', header: '合同编号', width: 14 },
      { key: 'product_name', header: '产品名称', width: 18 },
      { key: 'spec', header: '规格', width: 14 },
      { key: 'unit', header: '单位', width: 8 },
      { key: 'quantity', header: '数量', width: 12, type: 'qty', sum: 'qty' },
      { key: 'unit_price', header: '单价', width: 12, type: 'money' },
      { key: 'amount', header: '金额', width: 14, type: 'money', sum: 'money' },
      { key: 'note', header: '备注', width: 20 },
    ],
    query: (params) => {
      const ids = getSelectedIds(params.ids)
      const columns = 'customer_name, category, date, contract_no, product_name, spec, unit, quantity, unit_price, amount, note'
      if (ids.length) return idsQuery('stock_out_ledger', columns, ids, buildDateOrderBy('date'))
      const like = `%${params.keyword || ''}%`
      const customerName = params.customerName || ''
      const dateWhere = buildDateFilterClause(params)
      return {
        sql: `
          SELECT ${columns}
          FROM stock_out_ledger
          WHERE deleted_at IS NULL
            AND (? = '' OR customer_name = ?)
            AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?)
            ${dateWhere.sql}
          ORDER BY ${buildDateOrderBy('date')}
        `,
        params: [customerName, customerName, like, like, like, like, like, like, ...dateWhere.params],
      }
    },
    mapRow: (row, index) => ({
      index: index + 1,
      customer_name: text(row.customer_name),
      category: text(row.category),
      date: text(row.date),
      contract_no: text(row.contract_no),
      product_name: text(row.product_name),
      spec: text(row.spec),
      unit: text(row.unit),
      quantity: num(row.quantity),
      unit_price: num(row.unit_price),
      amount: num(row.amount),
      note: text(row.note),
    }),
  },
}

function buildOverviewSheet(db: any) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const exportedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

  const stats: Array<{ name: string; count: number; inLabel: string; inValue: number; outLabel: string; outValue: number; extra: string }> = [
    {
      name: '现金账',
      count: (db.prepare(`SELECT COUNT(*) as n FROM cash_ledger WHERE deleted_at IS NULL`).get() as any).n,
      inLabel: '总收入', inValue: num((db.prepare(`SELECT SUM(income) as v FROM cash_ledger WHERE deleted_at IS NULL`).get() as any).v),
      outLabel: '总支出', outValue: num((db.prepare(`SELECT SUM(expense) as v FROM cash_ledger WHERE deleted_at IS NULL`).get() as any).v),
      extra: `期末余额 ${num((db.prepare(`SELECT balance as v FROM cash_ledger WHERE deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT 1`).get() as any)?.v)}`,
    },
    {
      name: '公账',
      count: (db.prepare(`SELECT COUNT(*) as n FROM bank_ledger WHERE deleted_at IS NULL`).get() as any).n,
      inLabel: '总进账', inValue: num((db.prepare(`SELECT SUM(amount_in) as v FROM bank_ledger WHERE deleted_at IS NULL`).get() as any).v),
      outLabel: '总付出', outValue: num((db.prepare(`SELECT SUM(amount_out) as v FROM bank_ledger WHERE deleted_at IS NULL`).get() as any).v),
      extra: '',
    },
    {
      name: '承兑票',
      count: (db.prepare(`SELECT COUNT(*) as n FROM acceptance_bills WHERE deleted_at IS NULL`).get() as any).n,
      inLabel: '总收票', inValue: num((db.prepare(`SELECT SUM(amount_in) as v FROM acceptance_bills WHERE deleted_at IS NULL`).get() as any).v),
      outLabel: '总付出', outValue: num((db.prepare(`SELECT SUM(amount_out) as v FROM acceptance_bills WHERE deleted_at IS NULL`).get() as any).v),
      extra: '',
    },
    {
      name: '客户往来',
      count: (db.prepare(`SELECT COUNT(*) as n FROM customer_ledger WHERE deleted_at IS NULL`).get() as any).n,
      inLabel: '总收款', inValue: num((db.prepare(`SELECT SUM(amount_in) as v FROM customer_ledger WHERE deleted_at IS NULL`).get() as any).v),
      outLabel: '总付款', outValue: num((db.prepare(`SELECT SUM(amount_out) as v FROM customer_ledger WHERE deleted_at IS NULL`).get() as any).v),
      extra: `客户数 ${(db.prepare(`SELECT COUNT(DISTINCT customer_name) as n FROM customer_ledger WHERE deleted_at IS NULL`).get() as any).n}`,
    },
    {
      name: '产品入库',
      count: (db.prepare(`SELECT COUNT(*) as n FROM stock_in_ledger WHERE deleted_at IS NULL`).get() as any).n,
      inLabel: '总数量', inValue: num((db.prepare(`SELECT SUM(quantity) as v FROM stock_in_ledger WHERE deleted_at IS NULL`).get() as any).v),
      outLabel: '总金额', outValue: num((db.prepare(`SELECT SUM(amount) as v FROM stock_in_ledger WHERE deleted_at IS NULL`).get() as any).v),
      extra: `供应商数 ${(db.prepare(`SELECT COUNT(DISTINCT supplier_name) as n FROM stock_in_ledger WHERE deleted_at IS NULL`).get() as any).n}`,
    },
    {
      name: '产品出库',
      count: (db.prepare(`SELECT COUNT(*) as n FROM stock_out_ledger WHERE deleted_at IS NULL`).get() as any).n,
      inLabel: '总数量', inValue: num((db.prepare(`SELECT SUM(quantity) as v FROM stock_out_ledger WHERE deleted_at IS NULL`).get() as any).v),
      outLabel: '总金额', outValue: num((db.prepare(`SELECT SUM(amount) as v FROM stock_out_ledger WHERE deleted_at IS NULL`).get() as any).v),
      extra: `客户数 ${(db.prepare(`SELECT COUNT(DISTINCT customer_name) as n FROM stock_out_ledger WHERE deleted_at IS NULL`).get() as any).n}`,
    },
  ]

  const aoa = [
    ['账务总览', '', '', '', '', '', ''],
    [COMPANY_NAME, '', '', `导出时间：${exportedAt}`, '', '', ''],
    ['包含现金账、公账、承兑票、客户往来、产品入库、产品出库全部未删除记录', '', '', `账册数：${stats.length}`, '', '', ''],
    [],
    ['账册', '记录数', '进/收入项', '金额', '出/支出项', '金额', '备注'],
    ...stats.map((item) => [item.name, item.count, item.inLabel, item.inValue, item.outLabel, item.outValue, item.extra]),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  sheet['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 28 }]
  sheet['!rows'] = [{ hpt: 34 }, { hpt: 22 }, { hpt: 22 }, { hpt: 6 }, { hpt: 26 }, ...stats.map(() => ({ hpt: 24 }))]
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 1, c: 3 }, e: { r: 1, c: 6 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
    { s: { r: 2, c: 3 }, e: { r: 2, c: 6 } },
  ]
  sheet['!autofilter'] = { ref: encodeRange(4, 0, 4 + stats.length, 6) }
  sheet['!freeze'] = { xSplit: 0, ySplit: 5, topLeftCell: 'A6', activePane: 'bottomLeft', state: 'frozen' }

  styleRow(sheet, 0, 7, {
    font: { name: 'Microsoft YaHei', sz: 17, bold: true, color: { rgb: THEME.white } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.navy } },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  styleRow(sheet, 1, 7, {
    font: { name: 'Microsoft YaHei', sz: 10, bold: true, color: { rgb: THEME.text } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.accent } },
    border: thinBorder,
    alignment: { vertical: 'center' },
  })
  styleRow(sheet, 2, 7, {
    font: { name: 'Microsoft YaHei', sz: 10, color: { rgb: THEME.muted } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.softGray } },
    border: thinBorder,
    alignment: { vertical: 'center' },
  })
  styleRow(sheet, 4, 7, {
    font: { name: 'Microsoft YaHei', sz: 10.5, bold: true, color: { rgb: THEME.white } },
    fill: { patternType: 'solid', fgColor: { rgb: THEME.blue } },
    border: thinBorder,
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  for (let rowIndex = 5; rowIndex < 5 + stats.length; rowIndex++) {
    const fill = (rowIndex - 5) % 2 === 1 ? THEME.paleBlue : undefined
    for (let col = 0; col < 7; col++) {
      const style: any = {
        font: { name: 'Microsoft YaHei', sz: 10, color: { rgb: THEME.text } },
        border: thinBorder,
        alignment: { horizontal: [1, 3, 5].includes(col) ? 'right' : col === 0 ? 'center' : 'left', vertical: 'center', wrapText: col === 6 },
      }
      if (fill) style.fill = { patternType: 'solid', fgColor: { rgb: fill } }
      setCellStyle(sheet, rowIndex, col, style)
    }
    for (const col of [1, 3, 5]) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: col })
      const value = num((sheet[address] as any)?.v)
      sheet[address] = col === 1 ? qtyCell(value) : moneyCell(value)
      setCellStyle(sheet, rowIndex, col, {
        font: { name: 'Microsoft YaHei', sz: 10, color: { rgb: THEME.text } },
        border: thinBorder,
        alignment: { horizontal: 'right', vertical: 'center' },
        ...(fill ? { fill: { patternType: 'solid', fgColor: { rgb: fill } } } : {}),
      })
    }
  }
  return sheet
}

export function buildExportWorkbook(db: any, table: ExportTable, params: ExportParams = {}) {
  const tableKeys: Array<Exclude<ExportTable, 'all'>> = table === 'all'
    ? ['cash', 'bank', 'bills', 'customer', 'stockIn', 'stockOut']
    : [table]
  const exportParams: ExportParams = table === 'all'
    ? {}
    : {
      keyword: params.keyword,
      customerName: params.customerName,
      supplierName: params.supplierName,
      year: params.year,
      month: params.month,
      startDate: params.startDate,
      endDate: params.endDate,
      ids: params.ids,
    }

  const wb = XLSX.utils.book_new()
  wb.Props = {
    Title: table === 'all' ? '总表导出' : exportDesigns[table].title,
    Subject: COMPANY_NAME,
    Author: COMPANY_NAME,
    Company: COMPANY_NAME,
    CreatedDate: new Date(),
  }
  let totalRows = 0

  if (table === 'all') {
    XLSX.utils.book_append_sheet(wb, buildOverviewSheet(db), '总览')
  }

  for (const key of tableKeys) {
    const design = exportDesigns[key]
    const query = design.query(exportParams)
    const rawRows = db.prepare(query.sql).all(...query.params)
    const { sheet, rows } = createWorksheet(design, exportParams, rawRows)
    totalRows += rows.length
    XLSX.utils.book_append_sheet(wb, sheet, design.sheetName)
  }

  const defaultBaseName = table === 'all' ? '总表导出' : exportDesigns[table].defaultFileName
  return { wb, totalRows, defaultBaseName }
}

export function timestampForFile() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}
