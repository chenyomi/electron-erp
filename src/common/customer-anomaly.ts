import { isCustomerPaymentDescription, parseCustomerDescription } from './customer-ledger'

export type CustomerAnomalyIssue =
  | 'payment_amount_in_wrong_column'
  | 'payment_amount_in_date_column'
  | 'payment_missing_amount'
  | 'sale_missing_amount'
  | 'both_in_and_out'
  | 'summary_row'
  | 'balance_mismatch'
  | 'ambiguous_payment'

export type CustomerAnomaly = {
  id: number
  customer_name: string
  date: string
  issue: CustomerAnomalyIssue
  message: string
  autoFixable: boolean
}

const SUMMARY_MARKERS = ['合计', '上期欠款', '上期结欠', '累计应付', '累计应付款', '金额大写', '本期金额', '已收金额']

export function parsePlainAmount(value: unknown): number {
  if (value == null || value === '') return 0
  const num = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(num) ? num : 0
}

export function isValidLedgerIsoDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim())
}

/** 纯数字且不像日期（如 40455、25850），多半是金额被填进日期/备注列 */
export function isLikelyAmountNotDate(value: unknown): boolean {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  if (isValidLedgerIsoDate(raw)) return false
  if (/[年月日./-]/.test(raw)) return false

  const num = parsePlainAmount(raw)
  if (num <= 0) return false
  if (/^\d{1,2}$/.test(raw.replace(/,/g, ''))) return false

  const plain = raw.replace(/,/g, '')
  if (/^\d+(\.\d+)?$/.test(plain) && num >= 100) return true
  return false
}

export function inferMisalignedPaymentAmount(row: Record<string, any>): number {
  const candidates = [
    parsePlainAmount(row.date),
    parsePlainAmount(row.note),
    parsePlainAmount(row.amount_in),
  ].filter(amount => amount >= 100)
  const current = Number(row.amount_out || 0)
  return Math.round(Math.max(current, ...candidates, 0) * 100) / 100
}

export function isCustomerSummaryMarker(text: string): boolean {
  return SUMMARY_MARKERS.some(marker => String(text || '').includes(marker))
}

export function isCustomerSummaryRowCells(row: any[]): boolean {
  if (!Array.isArray(row)) return false
  return row.some(cell => isCustomerSummaryMarker(String(cell ?? '')))
}

export function isCustomerSummaryLedgerRow(row: Record<string, any>): boolean {
  const text = [row.description, row.product_name, row.note].filter(Boolean).join(' ')
  if (!isCustomerSummaryMarker(text)) return false
  return !row.contract_no && !Number(row.quantity) && Number(row.amount_in || 0) === 0
}

export function isCustomerPaymentRow(row: Record<string, any>): boolean {
  if (isCustomerPaymentDescription(row.description)) return true
  if (String(row.product_name || '').trim() === '付款') return true
  if (Number(row.amount_out || 0) > 0 && !Number(row.amount_in || 0)) {
    if (!row.contract_no && !Number(row.quantity) && !String(row.product_name || '').trim()) return true
    if (String(row.product_name || '').trim() === '付款') return true
  }
  return false
}

export function detectCustomerAnomaly(row: Record<string, any>, expectedBalance?: number): CustomerAnomaly | null {
  const id = Number(row.id || 0)
  if (!id) return null

  if (isCustomerSummaryLedgerRow(row)) {
    return {
      id,
      customer_name: row.customer_name,
      date: row.date,
      issue: 'summary_row',
      message: '疑似 Excel 汇总行（合计/上期欠款等）误导入为明细',
      autoFixable: false,
    }
  }

  const amountIn = Number(row.amount_in || 0)
  const amountOut = Number(row.amount_out || 0)
  const payment = isCustomerPaymentRow(row)

  if (payment && amountIn > 0 && amountOut <= 0) {
    return {
      id,
      customer_name: row.customer_name,
      date: row.date,
      issue: 'payment_amount_in_wrong_column',
      message: '收款记录金额写在「进账」列，应在「收款/付出」列',
      autoFixable: true,
    }
  }

  const dateLooksLikeAmount = isLikelyAmountNotDate(row.date)
  const noteLooksLikeAmount = isLikelyAmountNotDate(row.note)
  const noteSameAsDate = String(row.note || '').trim() === String(row.date || '').trim()
  if (payment && (dateLooksLikeAmount || (noteLooksLikeAmount && noteSameAsDate))) {
    const inferred = inferMisalignedPaymentAmount(row)
    const dateAmount = parsePlainAmount(row.date)
    const wrongColumn = dateLooksLikeAmount && dateAmount >= 100 && amountOut + 0.009 < dateAmount
    if (wrongColumn || inferred > amountOut + 0.009) {
      const hint = dateLooksLikeAmount ? row.date : row.note
      return {
        id,
        customer_name: row.customer_name,
        date: row.date,
        issue: 'payment_amount_in_date_column',
        message: `日期/备注里的数字「${hint}」应为收款金额（约 ${inferred}），当前收款仅 ${amountOut || 0}`,
        autoFixable: true,
      }
    }
  }

  if (payment && amountIn <= 0 && amountOut <= 0) {
    return {
      id,
      customer_name: row.customer_name,
      date: row.date,
      issue: 'payment_missing_amount',
      message: '标记为付款但未填写收款金额',
      autoFixable: false,
    }
  }

  if (!payment && amountIn > 0 && amountOut > 0) {
    return {
      id,
      customer_name: row.customer_name,
      date: row.date,
      issue: 'both_in_and_out',
      message: '同一行同时有应收与收款，通常应拆成两条记录',
      autoFixable: false,
    }
  }

  if (!payment && amountIn <= 0 && amountOut <= 0) {
    const qty = Number(row.quantity || 0)
    const price = Number(row.unit_price || 0)
    const parsed = parseCustomerDescription(row.description || '')
    const inferred = qty * price || parsed.quantity * parsed.unit_price
    if (inferred > 0 || row.product_name || row.contract_no) {
      return {
        id,
        customer_name: row.customer_name,
        date: row.date,
        issue: 'sale_missing_amount',
        message: '应收明细缺少金额',
        autoFixable: inferred > 0,
      }
    }
  }

  if (String(row.product_name || '').includes('付款') && String(row.product_name || '').trim() !== '付款') {
    return {
      id,
      customer_name: row.customer_name,
      date: row.date,
      issue: 'ambiguous_payment',
      message: '产品名称含「付款」字样，可能录入异常',
      autoFixable: false,
    }
  }

  if (expectedBalance != null && Math.abs(Number(row.balance || 0) - expectedBalance) > 0.009) {
    return {
      id,
      customer_name: row.customer_name,
      date: row.date,
      issue: 'balance_mismatch',
      message: `余额与自动重算不一致（账面 ${row.balance}，应为 ${expectedBalance}）`,
      autoFixable: true,
    }
  }

  return null
}

export function detectCustomerAnomalies(
  rows: Record<string, any>[],
  openingBalance = 0,
): CustomerAnomaly[] {
  const sorted = [...rows].sort((a, b) => {
    const dateA = String(a.date || '')
    const dateB = String(b.date || '')
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    return Number(a.id || 0) - Number(b.id || 0)
  })

  let running = Number(openingBalance || 0)
  const anomalies: CustomerAnomaly[] = []
  const balanceChecked = new Set<number>()

  for (const row of sorted) {
    const withoutBalance = detectCustomerAnomaly(row)
    if (withoutBalance && withoutBalance.issue !== 'balance_mismatch') {
      anomalies.push(withoutBalance)
    }
    running += Number(row.amount_in || 0) - Number(row.amount_out || 0)
    running = Math.round(running * 100) / 100
    const balanceIssue = detectCustomerAnomaly(row, running)
    if (balanceIssue?.issue === 'balance_mismatch' && !balanceChecked.has(row.id)) {
      anomalies.push(balanceIssue)
      balanceChecked.add(row.id)
    }
  }

  return anomalies
}

export function buildCustomerRowRepair(row: Record<string, any>): Record<string, any> | null {
  const issue = detectCustomerAnomaly(row)
  if (!issue?.autoFixable) {
    if (issue?.issue === 'balance_mismatch') return null
    if (!issue) return null
    return null
  }

  const patch: Record<string, any> = { id: row.id }
  const amountIn = Number(row.amount_in || 0)
  const amountOut = Number(row.amount_out || 0)

  if (issue.issue === 'payment_amount_in_wrong_column') {
    patch.description = '付款'
    patch.product_name = '付款'
    patch.contract_no = ''
    patch.spec = ''
    patch.unit = ''
    patch.quantity = 0
    patch.unit_price = 0
    patch.amount_in = 0
    patch.amount_out = amountIn
    return patch
  }

  if (issue.issue === 'payment_amount_in_date_column') {
    const inferred = inferMisalignedPaymentAmount(row)
    patch.description = '付款'
    patch.product_name = '付款'
    patch.contract_no = ''
    patch.spec = ''
    patch.unit = ''
    patch.quantity = 0
    patch.unit_price = 0
    patch.amount_in = 0
    patch.amount_out = inferred
    patch.date = isValidLedgerIsoDate(row.date) ? row.date : ''
    if (isLikelyAmountNotDate(row.note) || String(row.note || '').trim() === String(row.date || '').trim()) {
      patch.note = ''
    }
    return patch
  }

  if (issue.issue === 'sale_missing_amount') {
    const qty = Number(row.quantity || 0)
    const price = Number(row.unit_price || 0)
    let amount = qty * price
    if (amount <= 0) {
      const parsed = parseCustomerDescription(row.description || '')
      amount = parsed.quantity * parsed.unit_price
    }
    if (amount > 0) {
      patch.amount_in = Math.round(amount * 100) / 100
      return patch
    }
  }

  return null
}

export function issueLabel(issue: CustomerAnomalyIssue): string {
  return ({
    payment_amount_in_wrong_column: '收款列错位',
    payment_amount_in_date_column: '日期列是金额',
    payment_missing_amount: '付款无金额',
    sale_missing_amount: '应收无金额',
    both_in_and_out: '进退并存',
    summary_row: '汇总行误入',
    balance_mismatch: '余额不一致',
    ambiguous_payment: '付款字样异常',
  })[issue]
}
