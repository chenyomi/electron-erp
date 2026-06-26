import type Database from 'better-sqlite3'
import { stockInCountsInventoryForSupplierType } from '../../common/supplier-profile'
import { getSupplierType } from './supplier-profile'
import { rebuildInventoryBusinessTables } from './stock-business'

/** 根据历史入库类别推断供应商类型（仅填充尚未明确的档案） */
export function inferLegacySupplierTypes(db: Database.Database): void {
  db.prepare(`
    UPDATE supplier_profiles
    SET supplier_type = 'outsourcing', updated_at = datetime('now','localtime')
    WHERE COALESCE(TRIM(supplier_type), '') = ''
  `).run()

  db.prepare(`
    UPDATE supplier_profiles
    SET supplier_type = 'outsourcing', updated_at = datetime('now','localtime')
    WHERE supplier_name IN (
      SELECT DISTINCT supplier_name FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND TRIM(COALESCE(supplier_name, '')) != ''
        AND TRIM(COALESCE(category, '')) LIKE '%外协%'
    )
  `).run()

  db.prepare(`
    UPDATE supplier_profiles
    SET supplier_type = 'material', updated_at = datetime('now','localtime')
    WHERE supplier_name IN (
      SELECT DISTINCT supplier_name FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND TRIM(COALESCE(supplier_name, '')) != ''
        AND TRIM(COALESCE(category, '')) LIKE '%材料%'
        AND TRIM(COALESCE(category, '')) NOT LIKE '%外协%'
    )
    AND supplier_name NOT IN (
      SELECT DISTINCT supplier_name FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND TRIM(COALESCE(category, '')) LIKE '%外协%'
    )
  `).run()
}

export function backfillStockInInventoryFlags(db: Database.Database): void {
  const rows = db.prepare(`
    SELECT DISTINCT supplier_name FROM stock_in_ledger
    WHERE deleted_at IS NULL AND TRIM(COALESCE(supplier_name, '')) != ''
  `).all() as Array<{ supplier_name: string }>

  const update = db.prepare(`
    UPDATE stock_in_ledger
    SET counts_inventory = ?, updated_at = datetime('now','localtime')
    WHERE deleted_at IS NULL AND supplier_name = ?
  `)

  for (const { supplier_name } of rows) {
    const counts = stockInCountsInventoryForSupplierType(getSupplierType(db, supplier_name)) ? 1 : 0
    update.run(counts, supplier_name)
  }
}

export function resolveStockInCountsInventory(db: Database.Database, supplierName: string): number {
  if (!String(supplierName || '').trim()) return 1
  return stockInCountsInventoryForSupplierType(getSupplierType(db, supplierName)) ? 1 : 0
}
