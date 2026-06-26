import { sortLedgerGrouped } from './ledger-group-sort'

export type SupplierLedgerFields = {
  description?: string
  contract_no?: string
  product_name?: string
  spec?: string
  unit?: string
  quantity?: number
  unit_price?: number
  amount_out?: number
}

export function isSupplierPaymentDescription(description: string): boolean {
  return String(description || '').trim() === '付款'
}

/** 应付行（可登记付款） */
/** 供应商退货行：负应付，或备注含「退货」 */
export function isSupplierReturnRecord(row: Record<string, any>): boolean {
  if (isSupplierPaymentRecord(row)) return false
  const amountIn = Number(row.amount_in || 0)
  if (amountIn < 0) return true
  return String(row.note || '').includes('退货')
}

export function isSupplierPayableRecord(row: Record<string, any>): boolean {
  if (isSupplierPaymentRecord(row)) return false
  if (isSupplierReturnRecord(row)) return false
  return Number(row.amount_in || 0) > 0
}

export function isSupplierPaymentRecord(row: Record<string, any>): boolean {
  if (isSupplierPaymentDescription(String(row.description || ''))) return true
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

export function sqlSupplierPaymentWhere(alias = ''): string {
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

export function sqlSupplierNetPayableSum(tableAlias = ''): string {
  const p = tableAlias ? `${tableAlias}.` : ''
  const paymentWhere = sqlSupplierPaymentWhere(tableAlias)
  return `COALESCE(SUM(CASE WHEN NOT (${paymentWhere}) THEN ${p}amount_in ELSE 0 END), 0)`
}

export function buildSupplierDescription(row: SupplierLedgerFields): string {
  if (isSupplierPaymentDescription(String(row.description || ''))) return '付款'
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

export function enrichSupplierRow<T extends Record<string, any>>(row: T): T {
  if (isSupplierPaymentDescription(row.description)) {
    return { ...row, product_name: row.product_name || '付款' }
  }
  return row
}

export function isAutoReturnStockIn(row: Record<string, any>): boolean {
  const note = String(row.note || '')
  const supplier = String(row.supplier_name || '')
  return note.includes('客户退货') || supplier.endsWith('退货')
}

export function sqlAutoReturnStockInExclude(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return `TRIM(COALESCE(${p}note, '')) NOT LIKE '%客户退货%'`
}

export function listSupplierLedgerLinkedToPayable(
  payableId: number,
  rows: Array<Record<string, any>>,
): Array<Record<string, any>> {
  const id = Number(payableId || 0)
  if (!id) return []
  return rows.filter(item => Number(item.ref_ledger_id || 0) === id)
}

export function calcSupplierPayableRemaining(
  payableAmountIn: number,
  linkedRows: Array<Record<string, any>>,
): number {
  let remaining = Number(payableAmountIn || 0)
  for (const item of linkedRows) {
    if (isSupplierReturnRecord(item)) {
      remaining += Number(item.amount_in || 0)
    } else if (isSupplierPaymentRecord(item)) {
      remaining -= Number(item.amount_out || 0)
    }
  }
  return Math.round(Math.max(0, remaining) * 100) / 100
}

/** 单笔应付的净额、尚欠、多付（按关联退货/付款计算） */
export function calcSupplierPayableSettlement(
  payableAmountIn: number,
  linkedRows: Array<Record<string, any>>,
): { netDue: number; remaining: number; overpaid: number } {
  let net = Number(payableAmountIn || 0)
  let paid = 0
  for (const item of linkedRows) {
    if (isSupplierReturnRecord(item)) net += Number(item.amount_in || 0)
    else if (isSupplierPaymentRecord(item)) paid += Number(item.amount_out || 0)
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

export function validateSupplierReturnAgainstPayments(
  payableAmountIn: number,
  linkedRows: Array<Record<string, any>>,
  returnAmountIn: number,
  excludeReturnId = 0,
): string | null {
  let returnSum = returnAmountIn
  for (const item of linkedRows) {
    if (!isSupplierReturnRecord(item)) continue
    if (excludeReturnId && Number(item.id) === excludeReturnId) continue
    returnSum += Number(item.amount_in || 0)
  }
  const paid = linkedRows
    .filter(isSupplierPaymentRecord)
    .reduce((sum, item) => sum + Number(item.amount_out || 0), 0)
  const net = Math.round((Number(payableAmountIn || 0) + returnSum) * 100) / 100
  if (net < -0.005) return '退货金额不能超过原应付'
  if (Math.round((net - paid) * 100) / 100 < -0.005) return '退货后应付不能小于已付款'
  return null
}

export function validateSupplierPaymentAmount(
  _payableAmountIn: number,
  _linkedRows: Array<Record<string, any>>,
  paymentAmountOut: number,
  _excludePaymentId = 0,
): string | null {
  if (paymentAmountOut <= 0) return '请填写付款金额'
  return null
}

export type SupplierLedgerRowActions = {
  showPay: boolean
  showReturn: boolean
  showEdit: boolean
  showDelete: boolean
  editTip?: string
  deleteTip?: string
}

export function getSupplierLedgerRowActions(
  row: Record<string, any>,
  linkedToPayable: Array<Record<string, any>>,
  remainingPayable?: number,
  allowReturn = false,
): SupplierLedgerRowActions {
  if (isSupplierPayableRecord(row)) {
    const remaining = remainingPayable ?? calcSupplierPayableRemaining(row.amount_in, linkedToPayable)
    const hasLinked = linkedToPayable.length > 0
    const fromStockIn = Number(row.stock_in_id || 0) > 0
    return {
      showPay: remaining > 0.005,
      showReturn: allowReturn && remaining > 0.005,
      showEdit: false,
      showDelete: !fromStockIn && !hasLinked,
      editTip: fromStockIn ? '请在「产品入库」中修改' : '应付行不支持直接编辑',
      deleteTip: fromStockIn
        ? '请在「产品入库」中删除'
        : hasLinked
          ? '已有退货或付款，请先撤销关联记录'
          : undefined,
    }
  }
  if (isSupplierReturnRecord(row)) {
    const hasPayment = linkedToPayable.some(isSupplierPaymentRecord)
    return {
      showPay: false,
      showReturn: false,
      showEdit: true,
      showDelete: !hasPayment,
      deleteTip: hasPayment ? '应付已付款，请先撤销付款' : undefined,
    }
  }
  if (isSupplierPaymentRecord(row)) {
    return { showPay: false, showReturn: false, showEdit: true, showDelete: true }
  }
  return { showPay: false, showReturn: false, showEdit: true, showDelete: true }
}

/** 供应商台账：每笔应付及其退货/付款紧挨排列 */
export function sortSupplierLedgerGrouped(rows: Array<Record<string, any>>): Array<Record<string, any>> {
  return sortLedgerGrouped(rows, {
    isParent: isSupplierPayableRecord,
  })
}

export function supplierLedgerBizKindLabel(row: Record<string, any>): string {
  if (isSupplierPaymentRecord(row)) return '付款'
  if (isSupplierReturnRecord(row)) return '退货'
  return '应付'
}

export function formatSupplierExportNote(row: Record<string, any>): string {
  let note = String(row.note || '').trim()
  if (row.payment_for) {
    const extra = `付款对应：${row.payment_for}${row.payment_for_contract ? `（${row.payment_for_contract}）` : ''}`
    note = note ? `${note}；${extra}` : extra
  }
  return note
}

export function getSupplierLedgerDeleteBlockReason(
  row: Record<string, any>,
  linkedToPayable: Array<Record<string, any>>,
): string | null {
  const actions = getSupplierLedgerRowActions(row, linkedToPayable)
  return actions.showDelete ? null : (actions.deleteTip || '不能删除')
}

export function getSupplierLedgerAmountEditBlockReason(
  row: Record<string, any>,
  linkedToPayable: Array<Record<string, any>>,
  payload?: Partial<Record<string, any>>,
): string | null {
  if (isSupplierPayableRecord(row)) {
    if (Number(row.stock_in_id || 0) > 0) return '入库生成的应付请在「产品入库」中修改'
    if (linkedToPayable.length > 0 && payload) {
      const changed = Math.abs(Number(payload.amount_in ?? row.amount_in) - Number(row.amount_in)) > 0.005
        || Math.abs(Number(payload.quantity ?? row.quantity) - Number(row.quantity)) > 0.005
        || Math.abs(Number(payload.unit_price ?? row.unit_price) - Number(row.unit_price)) > 0.005
      if (changed) return '该应付已有退货或付款，不能修改数量/金额'
    }
  }
  if (isSupplierReturnRecord(row) && payload && linkedToPayable.some(isSupplierPaymentRecord)) {
    const qtyChanged = Math.abs(Math.abs(Number(payload.quantity ?? row.quantity)) - Math.abs(Number(row.quantity))) > 0.005
    const priceChanged = Math.abs(Number(payload.unit_price ?? row.unit_price) - Number(row.unit_price)) > 0.005
    const amountChanged = Math.abs(Number(payload.amount_in ?? row.amount_in) - Number(row.amount_in)) > 0.005
    if (qtyChanged || priceChanged || amountChanged) {
      return '该应付已有付款，不能改退货数量/金额。可先撤销付款，或只改日期/备注'
    }
  }
  return null
}

export function validatePayableSyncFromStockIn(
  oldPayable: Record<string, any>,
  linkedRows: Array<Record<string, any>>,
  payload: { amount_in: number; quantity: number; unit_price: number },
): string | null {
  const block = getSupplierLedgerAmountEditBlockReason(oldPayable, linkedRows, payload)
  if (block) return block
  if (linkedRows.length > 0) {
    return validateSupplierReturnAgainstPayments(payload.amount_in, linkedRows, 0)
  }
  return null
}
