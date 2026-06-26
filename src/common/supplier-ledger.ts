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
export function isSupplierPayableRecord(row: Record<string, any>): boolean {
  if (isSupplierPaymentRecord(row)) return false
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
