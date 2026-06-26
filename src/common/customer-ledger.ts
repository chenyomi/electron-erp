import { sortLedgerGrouped } from './ledger-group-sort'

export type CustomerLedgerFields = {
  description?: string
  contract_no?: string
  product_name?: string
  spec?: string
  unit?: string
  quantity?: number
  unit_price?: number
  amount_out?: number
}

const UNIT_PATTERN = /^(只|个|件|套|台|斤|公斤|kg|KG|米|m|M|条|张|根|副|pcs|PCS)$/

function parseNum(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0
  const num = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(num) ? num : 0
}

export function isCustomerPaymentDescription(description: string): boolean {
  return String(description || '').trim() === '付款'
}

/** 客户退货行：负数量/负应收，或备注含「退货」（与 Excel 对账单一致） */
export function isCustomerReturnRecord(row: Record<string, any>): boolean {
  if (isCustomerPaymentRecord(row)) return false
  const qty = Number(row.quantity || 0)
  const amountIn = Number(row.amount_in || 0)
  if (qty < 0 || amountIn < 0) return true
  return String(row.note || '').includes('退货')
}

/** 计算某笔应收的待收金额（原应收 + 关联退货 + 已关联收款） */
export function calcCustomerReceivableRemaining(
  receivableAmountIn: number,
  linkedRows: Array<Record<string, any>>,
): number {
  let remaining = Number(receivableAmountIn || 0)
  for (const item of linkedRows) {
    if (isCustomerReturnRecord(item)) {
      remaining += Number(item.amount_in || 0)
    } else if (isCustomerPaymentRecord(item)) {
      remaining -= Number(item.amount_out || 0)
    }
  }
  return Math.round(Math.max(0, remaining) * 100) / 100
}

/** 单笔应收的净额、待收、多收（按关联退货/收款计算） */
export function calcCustomerReceivableSettlement(
  receivableAmountIn: number,
  linkedRows: Array<Record<string, any>>,
): { netDue: number; remaining: number; overpaid: number } {
  let net = Number(receivableAmountIn || 0)
  let paid = 0
  for (const item of linkedRows) {
    if (isCustomerReturnRecord(item)) net += Number(item.amount_in || 0)
    else if (isCustomerPaymentRecord(item)) paid += Number(item.amount_out || 0)
  }
  net = Math.round(net * 100) / 100
  paid = Math.round(paid * 100) / 100
  const delta = Math.round((net - paid) * 100) / 100
  return {
    netDue: net,
    remaining: Math.max(0, delta),
    overpaid: Math.max(0, -delta),
  }
}

/** 客户台账：每笔应收及其退货/收款紧挨排列，避免混在一起看不清 */
export function sortCustomerLedgerGrouped(rows: Array<Record<string, any>>): Array<Record<string, any>> {
  return sortLedgerGrouped(rows, {
    isParent: isCustomerReceivableRecord,
  })
}

export type CustomerLedgerRowActions = {
  showReceive: boolean
  showReturn: boolean
  showEdit: boolean
  showDelete: boolean
  editTip?: string
  deleteTip?: string
}

export function listCustomerLedgerLinkedToReceivable(
  receivableId: number,
  rows: Array<Record<string, any>>,
): Array<Record<string, any>> {
  const id = Number(receivableId || 0)
  if (!id) return []
  return rows.filter(item => Number(item.ref_ledger_id || 0) === id)
}

export function receivableLinkedHasPayment(linkedRows: Array<Record<string, any>>): boolean {
  return linkedRows.some(isCustomerPaymentRecord)
}

/** 主流台账交互：不适用则隐藏，禁止则隐藏并保留 tip 供 hover/提示 */
export function getCustomerLedgerRowActions(
  row: Record<string, any>,
  linkedToReceivable: Array<Record<string, any>>,
  remainingReceivable?: number,
): CustomerLedgerRowActions {
  if (isCustomerReceivableRecord(row)) {
    const remaining = remainingReceivable ?? calcCustomerReceivableRemaining(row.amount_in, linkedToReceivable)
    const hasLinked = linkedToReceivable.length > 0
    const fromStockOut = Number(row.stock_out_id || 0) > 0
    return {
      showReceive: remaining > 0.005,
      showReturn: remaining > 0.005,
      showEdit: false,
      showDelete: !fromStockOut && !hasLinked,
      editTip: fromStockOut ? '请在「产品出库」中修改' : '应收行不支持直接编辑',
      deleteTip: fromStockOut
        ? '请在「产品出库」中删除'
        : hasLinked
          ? '已有退货或收款，请先撤销关联记录'
          : undefined,
    }
  }
  if (isCustomerReturnRecord(row)) {
    const hasPayment = receivableLinkedHasPayment(linkedToReceivable)
    return {
      showReceive: false,
      showReturn: false,
      showEdit: true,
      showDelete: !hasPayment,
      deleteTip: hasPayment ? '应收已收款，请先撤销收款' : undefined,
    }
  }
  if (isCustomerPaymentRecord(row)) {
    return {
      showReceive: false,
      showReturn: false,
      showEdit: true,
      showDelete: true,
    }
  }
  return { showReceive: false, showReturn: false, showEdit: true, showDelete: true }
}

export function customerLedgerFinancialFieldsLocked(
  row: Record<string, any>,
  linkedToReceivable: Array<Record<string, any>>,
): boolean {
  if (isCustomerReceivableRecord(row)) return true
  if (isCustomerReturnRecord(row) && receivableLinkedHasPayment(linkedToReceivable)) return true
  return false
}

export function getCustomerLedgerDeleteBlockReason(
  row: Record<string, any>,
  linkedToReceivable: Array<Record<string, any>>,
): string | null {
  const actions = getCustomerLedgerRowActions(row, linkedToReceivable)
  return actions.showDelete ? null : (actions.deleteTip || '不能删除')
}

export function sumLinkedPayments(linkedRows: Array<Record<string, any>>, excludeId = 0): number {
  let sum = 0
  for (const item of linkedRows) {
    if (!isCustomerPaymentRecord(item)) continue
    if (excludeId && Number(item.id) === excludeId) continue
    sum += Number(item.amount_out || 0)
  }
  return Math.round(sum * 100) / 100
}

export function validateCustomerReturnAgainstPayments(
  receivableAmountIn: number,
  linkedRows: Array<Record<string, any>>,
  returnAmountIn: number,
  excludeReturnId = 0,
): string | null {
  let returnSum = returnAmountIn
  for (const item of linkedRows) {
    if (!isCustomerReturnRecord(item)) continue
    if (excludeReturnId && Number(item.id) === excludeReturnId) continue
    returnSum += Number(item.amount_in || 0)
  }
  const net = Math.round((Number(receivableAmountIn || 0) + returnSum) * 100) / 100
  const paid = sumLinkedPayments(linkedRows)
  if (net + 0.005 < paid) {
    return `退货后待收（${net.toFixed(2)}）不能低于已收款（${paid.toFixed(2)}）`
  }
  return null
}

export function validateCustomerPaymentAmount(
  _receivableAmountIn: number,
  _linkedRows: Array<Record<string, any>>,
  paymentAmountOut: number,
  _excludePaymentId = 0,
): string | null {
  if (paymentAmountOut <= 0) return '请填写收款金额'
  return null
}

export function getCustomerLedgerAmountEditBlockReason(
  row: Record<string, any>,
  linkedToReceivable: Array<Record<string, any>>,
  payload?: Partial<Record<string, any>>,
): string | null {
  if (isCustomerReceivableRecord(row)) {
    if (Number(row.stock_out_id || 0) > 0) return '出库生成的应收请在「产品出库」中修改'
    if (linkedToReceivable.length > 0 && payload) {
      const changed = Math.abs(Number(payload.amount_in ?? row.amount_in) - Number(row.amount_in)) > 0.005
        || Math.abs(Number(payload.quantity ?? row.quantity) - Number(row.quantity)) > 0.005
        || Math.abs(Number(payload.unit_price ?? row.unit_price) - Number(row.unit_price)) > 0.005
      if (changed) return '该应收已有退货或收款，不能修改数量/金额'
    }
  }
  if (isCustomerReturnRecord(row) && payload && receivableLinkedHasPayment(linkedToReceivable)) {
    const qtyChanged = Math.abs(Math.abs(Number(payload.quantity ?? row.quantity)) - Math.abs(Number(row.quantity))) > 0.005
    const priceChanged = Math.abs(Number(payload.unit_price ?? row.unit_price) - Number(row.unit_price)) > 0.005
    const amountChanged = Math.abs(Number(payload.amount_in ?? row.amount_in) - Number(row.amount_in)) > 0.005
    if (qtyChanged || priceChanged || amountChanged) {
      return '该应收已有收款，不能改退货数量/金额。可先撤销收款，或只改日期/备注'
    }
  }
  return null
}

/** 正常应收行（可退货、可登记收款） */
export function isCustomerReceivableRecord(row: Record<string, any>): boolean {
  if (isCustomerPaymentRecord(row)) return false
  if (isCustomerReturnRecord(row)) return false
  return Number(row.amount_in || 0) > 0 && Number(row.quantity || 0) > 0
}

export function isCustomerPaymentRecord(row: Record<string, any>): boolean {
  if (isCustomerPaymentDescription(String(row.description || ''))) return true
  if (String(row.product_name || '').trim() === '付款') return true
  if (
    Number(row.amount_out || 0) > 0
    && !Number(row.amount_in || 0)
    && !String(row.contract_no || '').trim()
    && !Number(row.quantity || 0)
    && !String(row.product_name || '').trim()
  ) {
    return true
  }
  return false
}

/** SQL fragment: 客户收款/付款行（与 Excel「付款」行一致） */
export function sqlCustomerPaymentWhere(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return `(
    TRIM(COALESCE(${p}description, '')) = '付款'
    OR TRIM(COALESCE(${p}product_name, '')) = '付款'
    OR (
      COALESCE(${p}amount_out, 0) > 0
      AND COALESCE(${p}amount_in, 0) = 0
      AND TRIM(COALESCE(${p}contract_no, '')) = ''
      AND COALESCE(${p}quantity, 0) = 0
      AND TRIM(COALESCE(${p}product_name, '')) = ''
    )
  )`
}

/** SQL: 应收净额（应收 + 退货，不含收款行） */
export function sqlCustomerNetReceivableSum(tableAlias = ''): string {
  const p = tableAlias ? `${tableAlias}.` : ''
  const paymentWhere = sqlCustomerPaymentWhere(tableAlias)
  return `COALESCE(SUM(CASE WHEN NOT (${paymentWhere}) THEN ${p}amount_in ELSE 0 END), 0)`
}

export function parseCustomerDescription(description: string): Required<Pick<CustomerLedgerFields, 'description' | 'contract_no' | 'product_name' | 'spec' | 'unit' | 'quantity' | 'unit_price'>> {
  const raw = String(description || '').trim()
  if (!raw || isCustomerPaymentDescription(raw)) {
    return { description: raw, contract_no: '', product_name: raw, spec: '', unit: '', quantity: 0, unit_price: 0 }
  }

  const qtyMatch = raw.match(/数量([\d,.]+)/)
  const priceMatch = raw.match(/单价([\d,.]+)/)
  const quantity = qtyMatch ? parseNum(qtyMatch[1]) : 0
  const unit_price = priceMatch ? parseNum(priceMatch[1]) : 0

  let rest = raw
    .replace(/\s*数量[\d,.]+\s*/g, ' ')
    .replace(/\s*单价[\d,.]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const parts = rest.split(' ').filter(Boolean)
  let contract_no = ''
  let spec = ''
  let unit = ''

  if (parts.length && /^\d{5,}$/.test(parts[0])) {
    contract_no = parts.shift() || ''
  }

  if (parts.length && UNIT_PATTERN.test(parts[parts.length - 1])) {
    unit = parts.pop() || ''
  }

  if (parts.length) {
    const last = parts[parts.length - 1]
    if (/[Φφ*×x]/.test(last) || /^\d/.test(last)) {
      spec = parts.pop() || ''
    }
  }

  const product_name = parts.join(' ').trim() || rest

  return { description: product_name, contract_no, product_name, spec, unit, quantity, unit_price }
}

export function buildCustomerDescription(row: CustomerLedgerFields): string {
  if (isCustomerPaymentDescription(String(row.description || ''))) return '付款'
  if (Number(row.amount_out || 0) > 0 && !row.product_name && !row.contract_no && !Number(row.quantity)) {
    return '付款'
  }

  const parts = [
    row.contract_no,
    row.product_name,
    row.spec,
    row.unit,
    Number(row.quantity) ? `数量${row.quantity}` : '',
    Number(row.unit_price) ? `单价${row.unit_price}` : '',
  ].filter(Boolean)

  return parts.join(' ') || String(row.description || '').trim()
}

export function customerLedgerBizKindLabel(row: Record<string, any>): string {
  if (isCustomerPaymentRecord(row)) return '付款'
  if (isCustomerReturnRecord(row)) return '退货'
  return '应收'
}

export function formatCustomerExportNote(row: Record<string, any>): string {
  let note = String(row.note || '').trim()
  if (row.payment_for) {
    const extra = `收款对应：${row.payment_for}${row.payment_for_contract ? `（${row.payment_for_contract}）` : ''}`
    note = note ? `${note}；${extra}` : extra
  }
  if (row.return_for) {
    const extra = `退货对应：${row.return_for}`
    note = note ? `${note}；${extra}` : extra
  }
  return note
}

export function validateReceivableSyncFromStockOut(
  oldReceivable: Record<string, any>,
  linkedRows: Array<Record<string, any>>,
  payload: { amount_in: number; quantity: number; unit_price: number },
): string | null {
  const block = getCustomerLedgerAmountEditBlockReason(oldReceivable, linkedRows, payload)
  if (block) return block
  if (linkedRows.length > 0) {
    return validateCustomerReturnAgainstPayments(payload.amount_in, linkedRows, 0)
  }
  return null
}

export function enrichCustomerRow<T extends Record<string, any>>(row: T): T {
  if (isCustomerPaymentDescription(row.description)) {
    return { ...row, product_name: row.product_name || '付款' }
  }

  const hasStored = Boolean(
    row.contract_no ||
    row.product_name ||
    Number(row.quantity) ||
    Number(row.unit_price)
  )
  if (hasStored) return row

  const parsed = parseCustomerDescription(row.description)
  return { ...row, ...parsed }
}
