import type Database from 'better-sqlite3'
import { buildSupplierDescription, isAutoReturnStockIn } from '../../common/supplier-ledger'
import { recalculateSupplierBalances } from './supplier-profile'
import { logOperation, restore, softDelete } from './helpers'

export function shouldLinkSupplierPayable(stockInRow: Record<string, any>): boolean {
  if (isAutoReturnStockIn(stockInRow)) return false
  const amount = Number(stockInRow.amount || 0)
  return amount > 0 && Boolean(String(stockInRow.supplier_name || '').trim())
}

export function createPayableFromStockIn(db: Database.Database, stockInRow: Record<string, any>) {
  if (!shouldLinkSupplierPayable(stockInRow)) return null

  const payload = {
    supplier_name: String(stockInRow.supplier_name || '').trim(),
    date: String(stockInRow.date || '').trim(),
    description: buildSupplierDescription(stockInRow),
    contract_no: String(stockInRow.contract_no || '').trim(),
    product_name: String(stockInRow.product_name || '').trim(),
    spec: String(stockInRow.spec || '').trim(),
    unit: String(stockInRow.unit || '').trim(),
    quantity: Number(stockInRow.quantity || 0),
    unit_price: Number(stockInRow.unit_price || 0),
    amount_in: Number(stockInRow.amount || 0),
    amount_out: 0,
    balance: 0,
    note: String(stockInRow.note || '').trim(),
    stock_in_id: Number(stockInRow.id || 0),
  }
  const result = db.prepare(`
    INSERT INTO supplier_ledger (
      supplier_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
      amount_in, amount_out, balance, note, stock_in_id
    ) VALUES (
      @supplier_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
      @amount_in, @amount_out, @balance, @note, @stock_in_id
    )
  `).run(payload)
  const ledgerId = Number(result.lastInsertRowid)
  db.prepare(`UPDATE stock_in_ledger SET ledger_id = ? WHERE id = ?`).run(ledgerId, stockInRow.id)
  recalculateSupplierBalances(db, payload.supplier_name)
  const newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(ledgerId)
  logOperation('supplier_ledger', ledgerId, 'INSERT', null, newRow as object)
  return newRow
}

export function syncPayableFromStockIn(db: Database.Database, stockInRow: Record<string, any>) {
  if (!shouldLinkSupplierPayable(stockInRow)) {
    deletePayableForStockIn(db, stockInRow)
    return null
  }

  const ledgerId = Number(stockInRow.ledger_id || 0)
  if (!ledgerId) {
    return createPayableFromStockIn(db, stockInRow)
  }

  const oldRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ? AND deleted_at IS NULL').get(ledgerId) as Record<string, any> | undefined
  if (!oldRow) {
    return createPayableFromStockIn(db, stockInRow)
  }

  const payload = {
    id: ledgerId,
    supplier_name: String(stockInRow.supplier_name || '').trim(),
    date: String(stockInRow.date || '').trim(),
    description: buildSupplierDescription(stockInRow),
    contract_no: String(stockInRow.contract_no || '').trim(),
    product_name: String(stockInRow.product_name || '').trim(),
    spec: String(stockInRow.spec || '').trim(),
    unit: String(stockInRow.unit || '').trim(),
    quantity: Number(stockInRow.quantity || 0),
    unit_price: Number(stockInRow.unit_price || 0),
    amount_in: Number(stockInRow.amount || 0),
    amount_out: 0,
    note: String(stockInRow.note || '').trim(),
    stock_in_id: Number(stockInRow.id || 0),
  }
  db.prepare(`
    UPDATE supplier_ledger SET
      supplier_name=@supplier_name, date=@date, description=@description,
      contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
      quantity=@quantity, unit_price=@unit_price, amount_in=@amount_in, amount_out=0,
      note=@note, stock_in_id=@stock_in_id,
      updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run(payload)
  if (oldRow.supplier_name !== payload.supplier_name) {
    recalculateSupplierBalances(db, oldRow.supplier_name)
  }
  recalculateSupplierBalances(db, payload.supplier_name)
  const newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(ledgerId)
  logOperation('supplier_ledger', ledgerId, 'UPDATE', oldRow as object, newRow as object)
  return newRow
}

export function deletePayableForStockIn(db: Database.Database, stockInRow: Record<string, any>) {
  const ledgerId = Number(stockInRow.ledger_id || 0)
  if (!ledgerId) {
    const linked = db.prepare(`
      SELECT id, supplier_name FROM supplier_ledger
      WHERE deleted_at IS NULL AND stock_in_id = ?
    `).get(Number(stockInRow.id || 0)) as { id: number; supplier_name: string } | undefined
    if (!linked) return
    softDelete('supplier_ledger', linked.id)
    recalculateSupplierBalances(db, linked.supplier_name)
    return
  }
  const row = db.prepare('SELECT supplier_name FROM supplier_ledger WHERE id = ?').get(ledgerId) as { supplier_name?: string } | undefined
  softDelete('supplier_ledger', ledgerId)
  if (row?.supplier_name) recalculateSupplierBalances(db, row.supplier_name)
}

export function restorePayableForStockIn(db: Database.Database, stockInRow: Record<string, any>) {
  const ledgerId = Number(stockInRow.ledger_id || 0)
  if (!ledgerId) {
    syncPayableFromStockIn(db, stockInRow)
    return
  }
  const ledger = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(ledgerId) as Record<string, any> | undefined
  if (ledger?.deleted_at) {
    restore('supplier_ledger', ledgerId)
    recalculateSupplierBalances(db, ledger.supplier_name)
    return
  }
  syncPayableFromStockIn(db, stockInRow)
}

export function backfillSupplierPayablesFromStockIn(db: Database.Database): number {
  const rows = db.prepare(`
    SELECT * FROM stock_in_ledger
    WHERE deleted_at IS NULL AND COALESCE(ledger_id, 0) = 0
  `).all() as Array<Record<string, any>>
  let linked = 0
  for (const row of rows) {
    if (!shouldLinkSupplierPayable(row)) continue
    createPayableFromStockIn(db, row)
    linked++
  }
  return linked
}
