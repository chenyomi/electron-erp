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
