import { app } from 'electron'
import * as os from 'os'

export type LogAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE'

const MODULE_LABELS: Record<string, string> = {
  cash_ledger: '现金账',
  bank_ledger: '公账',
  acceptance_bills: '承兑票',
  customer_ledger: '客户往来',
  customer_profiles: '客户资料',
  supplier_profiles: '供应商资料',
  supplier_ledger: '供应商往来',
  other_ledger: '其他账',
  stock_in_ledger: '产品入库',
  stock_out_ledger: '产品出库',
}

const ACTION_LABELS: Record<LogAction, string> = {
  INSERT: '新增',
  UPDATE: '修改',
  DELETE: '删除',
  RESTORE: '恢复',
}

const FIELD_LABELS: Record<string, Record<string, string>> = {
  cash_ledger: {
    date: '日期',
    description: '摘要',
    income: '收入',
    expense: '支出',
    operator: '经办人',
    balance: '余额',
    note: '备注',
  },
  bank_ledger: {
    date: '日期',
    description: '摘要',
    amount_in: '收入',
    amount_out: '支出',
    balance: '余额',
    note: '备注',
  },
  acceptance_bills: {
    date: '日期',
    description: '摘要',
    amount_in: '收入',
    amount_out: '支出',
    balance: '余额',
    note: '备注',
  },
  customer_ledger: {
    customer_name: '客户',
    date: '日期',
    description: '摘要',
    contract_no: '合同号',
    product_name: '品名',
    spec: '规格',
    unit: '单位',
    quantity: '数量',
    unit_price: '单价',
    amount_in: '收款',
    amount_out: '付款',
    balance: '余额',
    note: '备注',
    month_label: '月份',
  },
  customer_profiles: {
    customer_name: '客户',
    contact_person: '联系人',
    phone: '电话',
    address: '地址',
    opening_balance: '期初余额',
    note: '备注',
  },
  supplier_profiles: {
    supplier_name: '供应商',
    contact_person: '联系人',
    phone: '电话',
    address: '地址',
    opening_balance: '期初应付',
    note: '备注',
  },
  supplier_ledger: {
    supplier_name: '供应商',
    date: '日期',
    description: '摘要',
    contract_no: '合同号',
    product_name: '品名',
    spec: '规格',
    unit: '单位',
    quantity: '数量',
    unit_price: '单价',
    amount_in: '应付',
    amount_out: '付款',
    balance: '余额',
    note: '备注',
  },
  stock_in_ledger: {
    doc_no: '单号',
    supplier_name: '供应商',
    date: '日期',
    contract_no: '合同号',
    product_name: '品名',
    spec: '规格',
    unit: '单位',
    quantity: '数量',
    unit_price: '单价',
    amount: '金额',
    note: '备注',
  },
  stock_out_ledger: {
    doc_no: '单号',
    customer_name: '客户',
    date: '日期',
    contract_no: '合同号',
    product_name: '品名',
    spec: '规格',
    unit: '单位',
    quantity: '数量',
    unit_price: '单价',
    amount: '金额',
    note: '备注',
  },
}

const MONEY_FIELDS = new Set([
  'income', 'expense', 'amount_in', 'amount_out', 'balance', 'amount',
  'unit_price', 'opening_balance', 'tax_amount', 'invoice_amount',
])

const SKIP_FIELDS = new Set(['id', 'created_at', 'updated_at', 'deleted_at'])

let cachedClientContext: { clientIp: string; deviceInfo: string } | null = null

function isIPv4Family(family: string | number): boolean {
  return family === 'IPv4' || family === 4
}

export function getModuleLabel(tableName: string): string {
  return MODULE_LABELS[tableName] || tableName
}

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action as LogAction] || action
}

export function getOperationClientContext(): { clientIp: string; deviceInfo: string } {
  if (cachedClientContext) return cachedClientContext
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && !iface.internal && isIPv4Family(iface.family))
    .map((iface) => iface!.address)
  const clientIp = ips.length ? ips.join(', ') : '127.0.0.1'
  const platformLabel = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : process.platform
  const deviceInfo = [
    os.hostname(),
    `${platformLabel} ${os.release()}`,
    process.arch,
    `v${app.getVersion()}`,
  ].join(' / ')
  cachedClientContext = { clientIp, deviceInfo }
  return cachedClientContext
}

function fmtMoney(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '0'
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空）'
  if (MONEY_FIELDS.has(field)) return `¥${fmtMoney(value)}`
  if (field === 'quantity') return String(value)
  return String(value)
}

function moneyPair(inKey: string, outKey: string, row: Record<string, unknown>): string {
  const parts: string[] = []
  const income = Number(row[inKey] || 0)
  const expense = Number(row[outKey] || 0)
  if (income) parts.push(`收入 ¥${fmtMoney(income)}`)
  if (expense) parts.push(`支出 ¥${fmtMoney(expense)}`)
  return parts.length ? `，${parts.join('，')}` : ''
}

function summarizeRow(tableName: string, row: Record<string, unknown> | null): string {
  if (!row) return ''
  const id = row.id ? `记录 #${row.id}` : ''
  switch (tableName) {
    case 'cash_ledger': {
      const head = [row.date, row.description].filter(Boolean).join(' ')
      return [id, head].filter(Boolean).join('：') + moneyPair('income', 'expense', row)
    }
    case 'bank_ledger':
    case 'acceptance_bills': {
      const head = [row.date, row.description].filter(Boolean).join(' ')
      return [id, head].filter(Boolean).join('：') + moneyPair('amount_in', 'amount_out', row)
    }
    case 'customer_ledger': {
      const head = [row.customer_name, row.date, row.description || row.product_name].filter(Boolean).join(' ')
      const amounts: string[] = []
      if (Number(row.amount_in)) amounts.push(`收款 ¥${fmtMoney(row.amount_in)}`)
      if (Number(row.amount_out)) amounts.push(`付款 ¥${fmtMoney(row.amount_out)}`)
      const amountText = amounts.length ? `，${amounts.join('，')}` : ''
      return [id, head].filter(Boolean).join('：') + amountText
    }
    case 'customer_profiles': {
      const name = String(row.customer_name || '').trim()
      const opening = Number(row.opening_balance || 0)
      return name
        ? `客户「${name}」，期初余额 ¥${fmtMoney(opening)}`
        : '客户资料'
    }
    case 'supplier_profiles': {
      const name = String(row.supplier_name || '').trim()
      const opening = Number(row.opening_balance || 0)
      return name
        ? `供应商「${name}」，期初应付 ¥${fmtMoney(opening)}`
        : '供应商资料'
    }
    case 'supplier_ledger': {
      const head = [row.supplier_name, row.date, row.description || row.product_name].filter(Boolean).join(' ')
      const amounts: string[] = []
      if (Number(row.amount_in)) amounts.push(`应付 ¥${fmtMoney(row.amount_in)}`)
      if (Number(row.amount_out)) amounts.push(`付款 ¥${fmtMoney(row.amount_out)}`)
      const amountText = amounts.length ? `，${amounts.join('，')}` : ''
      return [id, head].filter(Boolean).join('：') + amountText
    }
    case 'stock_in_ledger': {
      const head = [row.supplier_name, row.date, row.product_name, row.spec].filter(Boolean).join(' ')
      const qty = Number(row.quantity || 0)
      const qtyText = qty ? `，数量 ${row.quantity}${row.unit ? row.unit : ''}` : ''
      const amount = Number(row.amount || 0)
      const amountText = amount ? `，金额 ¥${fmtMoney(amount)}` : ''
      return [id, head].filter(Boolean).join('：') + qtyText + amountText
    }
    case 'stock_out_ledger': {
      const head = [row.customer_name, row.date, row.product_name, row.spec].filter(Boolean).join(' ')
      const qty = Number(row.quantity || 0)
      const qtyText = qty ? `，数量 ${row.quantity}${row.unit ? row.unit : ''}` : ''
      const amount = Number(row.amount || 0)
      const amountText = amount ? `，金额 ¥${fmtMoney(amount)}` : ''
      return [id, head].filter(Boolean).join('：') + qtyText + amountText
    }
    default:
      return id || JSON.stringify(row)
  }
}

function describeChanges(
  tableName: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): string {
  const labels = FIELD_LABELS[tableName] || {}
  const changes: string[] = []
  for (const [field, label] of Object.entries(labels)) {
    if (SKIP_FIELDS.has(field)) continue
    const oldVal = oldData?.[field]
    const newVal = newData?.[field]
    if (String(oldVal ?? '') === String(newVal ?? '')) continue
    changes.push(`${label} ${fmtFieldValue(field, oldVal)} → ${fmtFieldValue(field, newVal)}`)
  }
  return changes.join('；')
}

export function buildOperationDescription(
  tableName: string,
  action: LogAction | string,
  oldData: object | null,
  newData: object | null,
): string {
  const moduleLabel = getModuleLabel(tableName)
  const actionLabel = getActionLabel(action)
  const oldRow = oldData as Record<string, unknown> | null
  const newRow = newData as Record<string, unknown> | null

  if (action === 'INSERT') {
    const summary = summarizeRow(tableName, newRow)
    return summary ? `${actionLabel}${moduleLabel}：${summary}` : `${actionLabel}${moduleLabel}`
  }
  if (action === 'DELETE') {
    const summary = summarizeRow(tableName, oldRow)
    return summary ? `${actionLabel}${moduleLabel}：${summary}` : `${actionLabel}${moduleLabel}`
  }
  if (action === 'RESTORE') {
    const summary = summarizeRow(tableName, newRow)
    return summary ? `${actionLabel}${moduleLabel}：${summary}` : `${actionLabel}${moduleLabel}`
  }
  if (action === 'UPDATE') {
    const summary = summarizeRow(tableName, newRow || oldRow)
    const changes = describeChanges(tableName, oldRow, newRow)
    if (changes) return `${actionLabel}${moduleLabel}（${summary}）：${changes}`
    return summary ? `${actionLabel}${moduleLabel}：${summary}` : `${actionLabel}${moduleLabel}`
  }
  return `${actionLabel}${moduleLabel}`
}

export function parseLogJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function enrichOperationLogRow(row: Record<string, unknown>): Record<string, unknown> {
  const oldData = parseLogJson(row.old_data)
  const newData = parseLogJson(row.new_data)
  const description = String(row.description || '').trim()
    || buildOperationDescription(
      String(row.table_name || ''),
      String(row.action || ''),
      oldData,
      newData,
    )
  return {
    ...row,
    description,
    module_label: getModuleLabel(String(row.table_name || '')),
    action_label: getActionLabel(String(row.action || '')),
  }
}
