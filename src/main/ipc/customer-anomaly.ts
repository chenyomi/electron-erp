import type Database from 'better-sqlite3'
import { buildCustomerDescription } from '../../common/customer-ledger'
import {
  buildCustomerRowRepair,
  detectCustomerAnomalies,
  isCustomerPaymentRow,
  issueLabel,
} from '../../common/customer-anomaly'
import { buildDateOrderBy } from './helpers'
import { getCustomerProfile, recalculateCustomerBalances } from './customer-profile'

export function scanCustomerAnomalies(db: Database.Database, customerName = ''): CustomerAnomaly[] {
  const rows = customerName
    ? db.prepare(`
      SELECT *
      FROM customer_ledger
      WHERE deleted_at IS NULL AND customer_name = ?
      ORDER BY ${buildDateOrderBy('date', 'ASC')}, id ASC
    `).all(customerName) as Record<string, any>[]
    : db.prepare(`
      SELECT *
      FROM customer_ledger
      WHERE deleted_at IS NULL
      ORDER BY customer_name ASC, ${buildDateOrderBy('date', 'ASC')}, id ASC
    `).all() as Record<string, any>[]

  if (!customerName) {
    const byCustomer = new Map<string, Record<string, any>[]>()
    for (const row of rows) {
      const key = row.customer_name
      if (!byCustomer.has(key)) byCustomer.set(key, [])
      byCustomer.get(key)!.push(row)
    }
    const all: CustomerAnomaly[] = []
    for (const [name, customerRows] of byCustomer) {
      const opening = Number(getCustomerProfile(db, name).opening_balance || 0)
      all.push(...detectCustomerAnomalies(customerRows, opening))
    }
    return all
  }

  const opening = Number(getCustomerProfile(db, customerName).opening_balance || 0)
  return detectCustomerAnomalies(rows, opening)
}

export function repairCustomerAnomalies(db: Database.Database, customerName = ''): {
  scanned: number
  fixed: number
  skipped: number
  recalculatedCustomers: string[]
} {
  const anomalies = scanCustomerAnomalies(db, customerName)
  const autoFixable = anomalies.filter(item => item.autoFixable && item.issue !== 'balance_mismatch')
  const rowIds = new Set<number>()

  const update = db.prepare(`
    UPDATE customer_ledger SET
      date = @date,
      description = @description,
      contract_no = @contract_no,
      product_name = @product_name,
      spec = @spec,
      unit = @unit,
      quantity = @quantity,
      unit_price = @unit_price,
      amount_in = @amount_in,
      amount_out = @amount_out,
      note = @note,
      updated_at = datetime('now','localtime')
    WHERE id = @id
  `)

  let fixed = 0
  let skipped = 0

  for (const anomaly of autoFixable) {
    if (rowIds.has(anomaly.id)) continue
    const row = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(anomaly.id) as Record<string, any> | undefined
    if (!row) continue
    const patch = buildCustomerRowRepair(row)
    if (!patch) {
      skipped++
      continue
    }
    const next = { ...row, ...patch }
    if (!isCustomerPaymentRow(next) && !patch.description) {
      next.description = buildCustomerDescription(next)
    }
    update.run({
      id: row.id,
      date: next.date ?? row.date ?? '',
      description: next.description ?? row.description,
      contract_no: next.contract_no ?? row.contract_no ?? '',
      product_name: next.product_name ?? row.product_name ?? '',
      spec: next.spec ?? row.spec ?? '',
      unit: next.unit ?? row.unit ?? '',
      quantity: next.quantity ?? row.quantity ?? 0,
      unit_price: next.unit_price ?? row.unit_price ?? 0,
      amount_in: next.amount_in ?? row.amount_in ?? 0,
      amount_out: next.amount_out ?? row.amount_out ?? 0,
      note: next.note ?? row.note ?? '',
    })
    rowIds.add(anomaly.id)
    fixed++
  }

  const customers = new Set<string>()
  if (customerName) customers.add(customerName)
  else {
    for (const anomaly of anomalies) customers.add(anomaly.customer_name)
  }

  for (const name of customers) {
    recalculateCustomerBalances(db, name)
  }

  const remaining = scanCustomerAnomalies(db, customerName)
  const balanceOnly = remaining.filter(item => item.issue === 'balance_mismatch')
  if (balanceOnly.length) {
    for (const name of customers) recalculateCustomerBalances(db, name)
  }

  return {
    scanned: anomalies.length,
    fixed,
    skipped,
    recalculatedCustomers: [...customers],
  }
}
