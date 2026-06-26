import type Database from 'better-sqlite3'
import {
  buildSupplierDescription,
  getSupplierLedgerDeleteBlockReason,
  isAutoReturnStockIn,
  isSupplierPayableRecord,
  validatePayableSyncFromStockIn,
} from '../../common/supplier-ledger'
import { isMaterialSupplierType } from '../../common/supplier-profile'
import { getSupplierType, recalculateSupplierBalances } from './supplier-profile'
import { logOperation, restore, softDelete } from './helpers'
import { ensureProductCatalog, recalcInventoryForRows } from './stock-business'

export function shouldLinkSupplierPayable(stockInRow: Record<string, any>): boolean {
  if (isAutoReturnStockIn(stockInRow)) return false
  const amount = Number(stockInRow.amount || 0)
  return amount > 0 && Boolean(String(stockInRow.supplier_name || '').trim())
}

export function buildPayablePayloadFromStockIn(db: Database.Database, stockInRow: Record<string, any>) {
  const supplierName = String(stockInRow.supplier_name || '').trim()
  const isMaterial = isMaterialSupplierType(getSupplierType(db, supplierName))
  const finishedName = String(stockInRow.product_name || '').trim()
  const finishedSpec = String(stockInRow.spec || '').trim()
  const finishedUnit = String(stockInRow.unit || '').trim()
  const finishedQty = Number(stockInRow.quantity || 0)

  if (isMaterial) {
    const materialQty = Number(stockInRow.material_quantity || 0)
    const materialPrice = Number(stockInRow.material_unit_price || 0)
    const materialAmount = Number(stockInRow.amount || 0)
    const materialNote = [
      String(stockInRow.note || '').trim(),
      finishedName ? `成品 ${finishedName}${finishedSpec ? ` ${finishedSpec}` : ''}${finishedQty ? ` ×${finishedQty}${finishedUnit}` : ''}` : '',
    ].filter(Boolean).join(' · ')
    const ledgerFields = {
      contract_no: String(stockInRow.contract_no || '').trim(),
      product_name: finishedName || '材料费',
      spec: '',
      unit: '公斤',
      quantity: materialQty,
      unit_price: materialPrice,
    }
    return {
      supplier_name: supplierName,
      date: String(stockInRow.date || '').trim(),
      description: buildSupplierDescription(ledgerFields),
      contract_no: ledgerFields.contract_no,
      product_name: ledgerFields.product_name,
      spec: ledgerFields.spec,
      unit: ledgerFields.unit,
      quantity: ledgerFields.quantity,
      unit_price: ledgerFields.unit_price,
      amount_in: materialAmount,
      amount_out: 0,
      balance: 0,
      note: materialNote,
      stock_in_id: Number(stockInRow.id || 0),
    }
  }

  return {
    supplier_name: supplierName,
    date: String(stockInRow.date || '').trim(),
    description: buildSupplierDescription(stockInRow),
    contract_no: String(stockInRow.contract_no || '').trim(),
    product_name: finishedName,
    spec: finishedSpec,
    unit: finishedUnit,
    quantity: finishedQty,
    unit_price: Number(stockInRow.unit_price || 0),
    amount_in: Number(stockInRow.amount || 0),
    amount_out: 0,
    balance: 0,
    note: String(stockInRow.note || '').trim(),
    stock_in_id: Number(stockInRow.id || 0),
  }
}

export function createPayableFromStockIn(db: Database.Database, stockInRow: Record<string, any>) {
  if (!shouldLinkSupplierPayable(stockInRow)) return null

  const payload = buildPayablePayloadFromStockIn(db, stockInRow)
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

function findPayableForStockIn(db: Database.Database, stockInRow: Record<string, any>): Record<string, any> | undefined {
  const ledgerId = Number(stockInRow.ledger_id || 0)
  if (ledgerId) {
    return db.prepare('SELECT * FROM supplier_ledger WHERE id = ? AND deleted_at IS NULL').get(ledgerId) as Record<string, any> | undefined
  }
  return db.prepare(`
    SELECT * FROM supplier_ledger
    WHERE deleted_at IS NULL AND stock_in_id = ?
  `).get(Number(stockInRow.id || 0)) as Record<string, any> | undefined
}

function listLinkedSupplierRows(db: Database.Database, payableId: number) {
  return db.prepare(`
    SELECT * FROM supplier_ledger
    WHERE deleted_at IS NULL AND ref_ledger_id = ?
  `).all(payableId) as Array<Record<string, any>>
}

export function getStockInDeleteBlockReason(db: Database.Database, stockInRow: Record<string, any>): string | null {
  const payable = findPayableForStockIn(db, stockInRow)
  if (!payable) return null
  return getSupplierLedgerDeleteBlockReason(payable, listLinkedSupplierRows(db, Number(payable.id)))
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
    ...buildPayablePayloadFromStockIn(db, stockInRow),
  }
  const linkedRows = listLinkedSupplierRows(db, ledgerId)
  const syncError = validatePayableSyncFromStockIn(oldRow, linkedRows, {
    amount_in: Number(payload.amount_in || 0),
    quantity: Number(payload.quantity || 0),
    unit_price: Number(payload.unit_price || 0),
  })
  if (syncError) throw new Error(syncError)
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
  const block = getStockInDeleteBlockReason(db, stockInRow)
  if (block) throw new Error(block)
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

export function listLinkedSupplierLedgerRows(db: Database.Database, payableId: number) {
  return db.prepare(`
    SELECT * FROM supplier_ledger
    WHERE deleted_at IS NULL AND ref_ledger_id = ?
    ORDER BY id ASC
  `).all(payableId) as Array<Record<string, any>>
}

export function resolvePayableReference(db: Database.Database, supplierName: string, refLedgerId: number) {
  const ref = db.prepare(`
    SELECT * FROM supplier_ledger
    WHERE id = ? AND deleted_at IS NULL AND supplier_name = ?
  `).get(refLedgerId, supplierName) as Record<string, any> | undefined
  if (!ref) throw new Error('请选择有效的应付台账')
  if (!isSupplierPayableRecord(ref)) throw new Error('退货只能关联应付明细')
  return ref
}

function deleteReturnStockOut(db: Database.Database, stockOutId: number) {
  if (!stockOutId) return
  const row = db.prepare('SELECT * FROM stock_out_ledger WHERE id = ?').get(stockOutId) as Record<string, any> | undefined
  if (!row || row.deleted_at) return
  softDelete('stock_out_ledger', stockOutId)
  recalcInventoryForRows(row)
}

/** 迁移：删除旧版外协退货自动生成的出库单，改由供应商台账直接减库存 */
export function cleanupLegacySupplierReturnStockOuts(db: Database.Database): number {
  const rows = db.prepare(`
    SELECT id, product_name, spec, unit FROM stock_out_ledger
    WHERE deleted_at IS NULL
      AND (
        TRIM(COALESCE(category, '')) LIKE '%外协退货%'
        OR TRIM(COALESCE(note, '')) LIKE '%外协退货%'
      )
  `).all() as Array<{ id: number; product_name: string; spec: string; unit: string }>
  for (const row of rows) {
    softDelete('stock_out_ledger', row.id)
    recalcInventoryForRows(row)
  }
  db.prepare(`
    UPDATE supplier_ledger
    SET return_stock_out_id = NULL, updated_at = datetime('now','localtime')
    WHERE return_stock_out_id IS NOT NULL
  `).run()
  const returns = db.prepare(`
    SELECT DISTINCT s.product_name, COALESCE(s.spec, '') AS spec, COALESCE(s.unit, '') AS unit
    FROM supplier_ledger s
    WHERE s.deleted_at IS NULL AND COALESCE(s.quantity, 0) < 0
  `).all() as Array<{ product_name: string; spec: string; unit: string }>
  for (const row of returns) recalcInventoryForRows(row)
  return rows.length
}

export function applySupplierReturnSideEffects(
  db: Database.Database,
  returnRow: Record<string, any>,
  options: { previousReturnStockOutId?: number; previousProduct?: { product_name: string; spec: string; unit: string } } = {},
) {
  if (options.previousReturnStockOutId) {
    deleteReturnStockOut(db, options.previousReturnStockOutId)
  }
  if (Number(returnRow.return_stock_out_id || 0) > 0) {
    deleteReturnStockOut(db, Number(returnRow.return_stock_out_id))
    db.prepare(`
      UPDATE supplier_ledger SET return_stock_out_id = NULL, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(returnRow.id)
  }

  const refId = Number(returnRow.ref_ledger_id || 0)
  if (!refId) return

  const ref = db.prepare('SELECT * FROM supplier_ledger WHERE id = ? AND deleted_at IS NULL').get(refId) as Record<string, any> | undefined
  const stockInId = Number(ref?.stock_in_id || 0)
  if (!stockInId) return

  const stockIn = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ? AND deleted_at IS NULL').get(stockInId) as Record<string, any> | undefined
  if (!stockIn || Number(stockIn.counts_inventory || 0) !== 1) return

  const qty = Math.abs(Number(returnRow.quantity || 0))
  if (qty <= 0) return

  const product = {
    product_name: String(returnRow.product_name || stockIn.product_name || '').trim(),
    spec: String(returnRow.spec || stockIn.spec || '').trim(),
    unit: String(returnRow.unit || stockIn.unit || '').trim(),
    unit_price: Math.abs(Number(returnRow.unit_price || stockIn.unit_price || 0)),
  }
  ensureProductCatalog(product)
  recalcInventoryForRows(product)
  if (options.previousProduct) {
    recalcInventoryForRows(options.previousProduct)
  }
}

export function cleanupSupplierReturnStockOut(db: Database.Database, returnRow: Record<string, any>) {
  const stockOutId = Number(returnRow.return_stock_out_id || 0)
  if (!stockOutId) return
  deleteReturnStockOut(db, stockOutId)
  db.prepare(`
    UPDATE supplier_ledger SET return_stock_out_id = NULL, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(returnRow.id)
}

export function recalcInventoryForSupplierReturnRow(db: Database.Database, returnRow: Record<string, any>) {
  const product = {
    product_name: String(returnRow.product_name || '').trim(),
    spec: String(returnRow.spec || '').trim(),
    unit: String(returnRow.unit || '').trim(),
  }
  if (!product.product_name) return
  recalcInventoryForRows(product)
}
