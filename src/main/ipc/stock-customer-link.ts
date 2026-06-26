import type Database from 'better-sqlite3'
import { buildCustomerDescription, isCustomerPaymentRecord, isCustomerReturnRecord, sqlCustomerPaymentWhere } from '../../common/customer-ledger'
import { customerNameExists, recalculateCustomerBalances } from './customer-profile'
import { logOperation, softDelete } from './helpers'
import { ensureProductCatalog, recalcInventoryForRows } from './stock-business'

function customerProfileExists(db: Database.Database, customerName: string): boolean {
  const name = String(customerName || '').trim()
  if (!name) return false
  return Boolean(db.prepare(`SELECT 1 FROM customer_profiles WHERE customer_name = ? LIMIT 1`).get(name))
}

export function assertStockOutCustomerExists(db: Database.Database, customerName: string): void {
  const name = String(customerName || '').trim()
  if (!name) throw new Error('请选择客户')
  if (!customerProfileExists(db, name)) {
    throw new Error(`客户「${name}」不存在，请先在客户管理中添加`)
  }
}

export function backfillReceivablesFromStockOut(db: Database.Database, customerName = ''): {
  added: number
  restored: number
  activeCount: number
} {
  const name = String(customerName || '').trim()
  let added = 0
  let restored = 0

  const toRestore = db.prepare(`
    SELECT c.id
    FROM customer_ledger c
    INNER JOIN stock_out_ledger s ON s.id = c.stock_out_id AND s.deleted_at IS NULL
    WHERE c.deleted_at IS NOT NULL
      AND (? = '' OR c.customer_name = ?)
  `).all(name, name) as Array<{ id: number }>
  for (const row of toRestore) {
    db.prepare(`
      UPDATE customer_ledger
      SET deleted_at = NULL, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(row.id)
    restored++
  }

  const orphans = db.prepare(`
    SELECT s.*
    FROM stock_out_ledger s
    LEFT JOIN customer_ledger c ON c.stock_out_id = s.id AND c.deleted_at IS NULL
    WHERE s.deleted_at IS NULL AND c.id IS NULL
      AND (? = '' OR s.customer_name = ?)
  `).all(name, name) as Record<string, any>[]
  for (const row of orphans) {
    db.prepare(`UPDATE stock_out_ledger SET ledger_id = NULL WHERE id = ?`).run(row.id)
    createReceivableFromStockOut(db, row)
    added++
  }

  if (restored > 0 && name) {
    recalculateCustomerBalances(db, name)
  }

  const { activeCount } = db.prepare(`
    SELECT COUNT(*) AS activeCount
    FROM customer_ledger
    WHERE deleted_at IS NULL AND (? = '' OR customer_name = ?)
  `).get(name, name) as { activeCount: number }

  return { added, restored, activeCount: Number(activeCount || 0) }
}

export function createReceivableFromStockOut(db: Database.Database, stockOutRow: Record<string, any>) {
  const payload = {
    customer_name: String(stockOutRow.customer_name || '').trim(),
    date: String(stockOutRow.date || '').trim(),
    description: buildCustomerDescription(stockOutRow),
    contract_no: String(stockOutRow.contract_no || '').trim(),
    product_name: String(stockOutRow.product_name || '').trim(),
    spec: String(stockOutRow.spec || '').trim(),
    unit: String(stockOutRow.unit || '').trim(),
    quantity: Number(stockOutRow.quantity || 0),
    unit_price: Number(stockOutRow.unit_price || 0),
    amount_in: Number(stockOutRow.amount || 0),
    amount_out: 0,
    balance: 0,
    note: String(stockOutRow.note || '').trim(),
    month_label: '',
    stock_out_id: Number(stockOutRow.id || 0),
  }
  const result = db.prepare(`
    INSERT INTO customer_ledger (
      customer_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
      amount_in, amount_out, balance, note, month_label, stock_out_id
    ) VALUES (
      @customer_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
      @amount_in, @amount_out, @balance, @note, @month_label, @stock_out_id
    )
  `).run(payload)
  const ledgerId = Number(result.lastInsertRowid)
  db.prepare(`UPDATE stock_out_ledger SET ledger_id = ? WHERE id = ?`).run(ledgerId, stockOutRow.id)
  recalculateCustomerBalances(db, payload.customer_name)
  const newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(ledgerId)
  logOperation('customer_ledger', ledgerId, 'INSERT', null, newRow as object)
  return newRow
}

export function syncReceivableFromStockOut(db: Database.Database, stockOutRow: Record<string, any>) {
  const ledgerId = Number(stockOutRow.ledger_id || 0)
  if (!ledgerId) {
    return createReceivableFromStockOut(db, stockOutRow)
  }
  const oldRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ? AND deleted_at IS NULL').get(ledgerId) as Record<string, any> | undefined
  if (!oldRow) {
    return createReceivableFromStockOut(db, stockOutRow)
  }
  const payload = {
    id: ledgerId,
    customer_name: String(stockOutRow.customer_name || '').trim(),
    date: String(stockOutRow.date || '').trim(),
    description: buildCustomerDescription(stockOutRow),
    contract_no: String(stockOutRow.contract_no || '').trim(),
    product_name: String(stockOutRow.product_name || '').trim(),
    spec: String(stockOutRow.spec || '').trim(),
    unit: String(stockOutRow.unit || '').trim(),
    quantity: Number(stockOutRow.quantity || 0),
    unit_price: Number(stockOutRow.unit_price || 0),
    amount_in: Number(stockOutRow.amount || 0),
    amount_out: 0,
    note: String(stockOutRow.note || '').trim(),
    stock_out_id: Number(stockOutRow.id || 0),
  }
  db.prepare(`
    UPDATE customer_ledger SET
      customer_name=@customer_name, date=@date, description=@description,
      contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
      quantity=@quantity, unit_price=@unit_price, amount_in=@amount_in, amount_out=0,
      note=@note, stock_out_id=@stock_out_id,
      updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run(payload)
  if (oldRow.customer_name !== payload.customer_name) {
    recalculateCustomerBalances(db, oldRow.customer_name)
  }
  recalculateCustomerBalances(db, payload.customer_name)
  const newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(ledgerId)
  logOperation('customer_ledger', ledgerId, 'UPDATE', oldRow as object, newRow as object)
  return newRow
}

export function deleteReceivableForStockOut(db: Database.Database, stockOutRow: Record<string, any>) {
  const ledgerId = Number(stockOutRow.ledger_id || 0)
  if (!ledgerId) {
    const linked = db.prepare(`
      SELECT id, customer_name FROM customer_ledger
      WHERE deleted_at IS NULL AND stock_out_id = ?
    `).get(Number(stockOutRow.id || 0)) as { id: number; customer_name: string } | undefined
    if (!linked) return
    softDelete('customer_ledger', linked.id)
    recalculateCustomerBalances(db, linked.customer_name)
    return
  }
  const row = db.prepare('SELECT customer_name FROM customer_ledger WHERE id = ?').get(ledgerId) as { customer_name?: string } | undefined
  softDelete('customer_ledger', ledgerId)
  if (row?.customer_name) recalculateCustomerBalances(db, row.customer_name)
}

export function cleanupCustomerReturnStockInRows(db: Database.Database): number {
  const rows = db.prepare(`
    SELECT id, product_name, spec, unit FROM stock_in_ledger
    WHERE deleted_at IS NULL AND TRIM(COALESCE(note, '')) LIKE '%客户退货%'
  `).all() as Array<{ id: number; product_name: string; spec: string; unit: string }>
  for (const row of rows) {
    softDelete('stock_in_ledger', row.id)
    recalcInventoryForRows(row)
  }
  db.prepare(`
    UPDATE customer_ledger SET return_stock_in_id = NULL, updated_at = datetime('now','localtime')
    WHERE return_stock_in_id IS NOT NULL
  `).run()
  const returns = db.prepare(`
    SELECT DISTINCT product_name, spec, unit FROM customer_ledger
    WHERE deleted_at IS NULL AND COALESCE(quantity, 0) < 0
  `).all() as Array<{ product_name: string; spec: string; unit: string }>
  for (const row of returns) recalcInventoryForRows(row)
  return rows.length
}

export function deleteLegacyReturnStockIn(db: Database.Database, returnStockInId: number) {
  if (!returnStockInId) return
  const row = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ? AND deleted_at IS NULL').get(returnStockInId)
  if (!row) return
  softDelete('stock_in_ledger', returnStockInId)
  recalcInventoryForRows(row)
}

export function listCustomerSaleOptions(db: Database.Database, customerName: string) {
  const name = String(customerName || '').trim()
  if (!name) return []
  const paymentWhere = sqlCustomerPaymentWhere('customer_ledger')
  return db.prepare(`
    SELECT
      id,
      date,
      contract_no,
      product_name,
      spec,
      unit,
      quantity,
      unit_price,
      amount_in,
      note,
      stock_out_id
    FROM customer_ledger
    WHERE deleted_at IS NULL
      AND customer_name = ?
      AND NOT ${paymentWhere}
      AND COALESCE(amount_in, 0) > 0
      AND COALESCE(quantity, 0) > 0
    ORDER BY date DESC, id DESC
  `).all(name) as Array<Record<string, any>>
}

export function applyCustomerReturnSideEffects(
  db: Database.Database,
  returnRow: Record<string, any>,
  options: {
    previousReturnStockInId?: number
    previousProduct?: { product_name: string; spec: string; unit: string }
  } = {},
) {
  if (options.previousReturnStockInId) {
    deleteLegacyReturnStockIn(db, options.previousReturnStockInId)
  }
  ensureProductCatalog(returnRow)
  recalcInventoryForRows(returnRow)
  if (options.previousProduct) {
    recalcInventoryForRows(options.previousProduct)
  }
  db.prepare(`
    UPDATE customer_ledger SET return_stock_in_id = NULL, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(returnRow.id)
}

export function resolveReturnReference(db: Database.Database, customerName: string, refLedgerId: number) {
  const ref = db.prepare(`
    SELECT * FROM customer_ledger
    WHERE id = ? AND deleted_at IS NULL AND customer_name = ?
  `).get(refLedgerId, customerName) as Record<string, any> | undefined
  if (!ref) throw new Error('请选择有效的应收台账')
  if (isCustomerPaymentRecord(ref)) {
    throw new Error('退货只能关联应收明细，不能关联收款')
  }
  if (isCustomerReturnRecord(ref)) {
    throw new Error('退货只能关联应收明细，不能关联退货')
  }
  if (Number(ref.amount_in || 0) <= 0 || Number(ref.quantity || 0) <= 0) {
    throw new Error('所选应收台账无效')
  }
  return ref
}

export function resolveReceivableReference(db: Database.Database, customerName: string, refLedgerId: number) {
  const ref = resolveReturnReference(db, customerName, refLedgerId)
  return ref
}

export function customerExistsForBusiness(db: Database.Database, customerName: string): boolean {
  return customerNameExists(db, customerName)
}
