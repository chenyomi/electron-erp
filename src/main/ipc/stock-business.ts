import { getDb } from '../db'

export function normalizeProductRow(row: any) {
  return {
    product_name: String(row?.product_name || '').trim(),
    spec: String(row?.spec || '').trim(),
    unit: String(row?.unit || '').trim(),
    category: String(row?.category || '').trim(),
    unit_price: Number(row?.unit_price || 0),
  }
}

export function ensureProductCatalog(row: any) {
  const db = getDb()
  const product = normalizeProductRow(row)
  if (!product.product_name) return
  db.prepare(`
    INSERT INTO product_catalog (product_name, spec, unit, category, default_price)
    VALUES (@product_name, @spec, @unit, @category, @unit_price)
    ON CONFLICT(product_name, spec, unit) DO UPDATE SET
      category=excluded.category,
      default_price=CASE WHEN excluded.default_price > 0 THEN excluded.default_price ELSE product_catalog.default_price END,
      updated_at=datetime('now','localtime')
  `).run(product)
}

export function generateDocNo(
  prefix: 'RK' | 'CK' | 'TH' | 'GT' | 'FL',
  tableName: 'stock_in_ledger' | 'stock_out_ledger' | 'customer_ledger' | 'supplier_ledger',
  dateValue?: string,
) {
  const db = getDb()
  const compactDate = String(dateValue || new Date().toISOString().slice(0, 10)).replace(/\D/g, '').slice(0, 8)
  const head = `${prefix}${compactDate}`
  const row = db.prepare(`
    SELECT doc_no FROM ${tableName}
    WHERE doc_no LIKE ?
    ORDER BY doc_no DESC
    LIMIT 1
  `).get(`${head}%`) as { doc_no?: string } | undefined
  const lastNo = Number(String(row?.doc_no || '').slice(head.length)) || 0
  return `${head}${String(lastNo + 1).padStart(4, '0')}`
}

export function sumCustomerReturnQty(
  db: ReturnType<typeof getDb>,
  productName: string,
  spec: string,
  unit: string,
): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(ABS(quantity)), 0) AS qty
    FROM customer_ledger
    WHERE deleted_at IS NULL
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
      AND COALESCE(quantity, 0) < 0
  `).get(productName, spec, unit) as { qty?: number }
  return Number(row?.qty || 0)
}

/** 外协退供应商：供应商台账负数量，直接减库存（不写出库单） */
export function sumSupplierReturnQty(
  db: ReturnType<typeof getDb>,
  productName: string,
  spec: string,
  unit: string,
): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(ABS(s.quantity)), 0) AS qty
    FROM supplier_ledger s
    WHERE s.deleted_at IS NULL
      AND COALESCE(s.quantity, 0) < 0
      AND TRIM(COALESCE(s.product_name, '')) NOT LIKE '%原材料退货%'
      AND TRIM(COALESCE(s.note, '')) NOT LIKE '%原材料退货%'
      AND s.product_name = ?
      AND COALESCE(s.spec, '') = ?
      AND COALESCE(s.unit, '') = ?
  `).get(productName, spec, unit) as { qty?: number }
  return Number(row?.qty || 0)
}

/** 库存流水：入库、销售出库、客户退货冲减出库、外协退供应商冲减入库 */
export const inventoryFlowsSql = `
  SELECT product_name, COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit,
         quantity AS in_qty, 0 AS out_qty
  FROM stock_in_ledger
  WHERE deleted_at IS NULL AND COALESCE(counts_inventory, 1) = 1
  UNION ALL
  SELECT product_name, COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit,
         0, quantity AS out_qty
  FROM stock_out_ledger WHERE deleted_at IS NULL
  UNION ALL
  SELECT product_name, COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit,
         0, -ABS(quantity) AS out_qty
  FROM customer_ledger WHERE deleted_at IS NULL AND COALESCE(quantity, 0) < 0
  UNION ALL
  SELECT s.product_name, COALESCE(s.spec, '') AS spec, COALESCE(s.unit, '') AS unit,
         -ABS(s.quantity) AS in_qty, 0 AS out_qty
  FROM supplier_ledger s
  WHERE s.deleted_at IS NULL AND COALESCE(s.quantity, 0) < 0
    AND TRIM(COALESCE(s.product_name, '')) NOT LIKE '%原材料退货%'
    AND TRIM(COALESCE(s.note, '')) NOT LIKE '%原材料退货%'
`

export function recalcInventoryBalance(row: any) {
  const db = getDb()
  const product = normalizeProductRow(row)
  if (!product.product_name) return
  const stockIn = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND COALESCE(counts_inventory, 1) = 1
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
  `).get(product.product_name, product.spec, product.unit) as { qty: number }
  const stockOut = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM stock_out_ledger
    WHERE deleted_at IS NULL
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
  `).get(product.product_name, product.spec, product.unit) as { qty: number }
  const customerReturnQty = sumCustomerReturnQty(db, product.product_name, product.spec, product.unit)
  const supplierReturnQty = sumSupplierReturnQty(db, product.product_name, product.spec, product.unit)
  const qty = Number(stockIn?.qty || 0) - (Number(stockOut?.qty || 0) - customerReturnQty) - supplierReturnQty
  db.prepare(`
    INSERT INTO inventory_balances (product_name, spec, unit, stock_qty, available_qty)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(product_name, spec, unit) DO UPDATE SET
      stock_qty=excluded.stock_qty,
      available_qty=excluded.available_qty,
      updated_at=datetime('now','localtime')
  `).run(product.product_name, product.spec, product.unit, qty, qty)
}

export function recalcInventoryForRows(...rows: any[]) {
  for (const row of rows) {
    if (row) recalcInventoryBalance(row)
  }
}

export function syncProductCatalogWithLedger(db = getDb()): void {
  const productMatchSql = `
    s.product_name = product_catalog.product_name
    AND COALESCE(s.spec, '') = COALESCE(product_catalog.spec, '')
    AND COALESCE(s.unit, '') = COALESCE(product_catalog.unit, '')
  `
  db.prepare(`
    UPDATE product_catalog
    SET deleted_at = datetime('now','localtime'),
        updated_at = datetime('now','localtime')
    WHERE deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM stock_in_ledger s
        WHERE s.deleted_at IS NULL AND COALESCE(s.counts_inventory, 1) = 1 AND ${productMatchSql}
      )
      AND NOT EXISTS (
        SELECT 1 FROM stock_out_ledger s
        WHERE s.deleted_at IS NULL AND ${productMatchSql}
      )
      AND NOT EXISTS (
        SELECT 1 FROM customer_ledger c
        WHERE c.deleted_at IS NULL
          AND COALESCE(c.quantity, 0) < 0
          AND c.product_name = product_catalog.product_name
          AND COALESCE(c.spec, '') = COALESCE(product_catalog.spec, '')
          AND COALESCE(c.unit, '') = COALESCE(product_catalog.unit, '')
      )
  `).run()

  db.prepare(`
    UPDATE product_catalog
    SET deleted_at = NULL,
        updated_at = datetime('now','localtime')
    WHERE deleted_at IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM stock_in_ledger s
          WHERE s.deleted_at IS NULL AND COALESCE(s.counts_inventory, 1) = 1 AND ${productMatchSql}
        )
        OR EXISTS (
          SELECT 1 FROM stock_out_ledger s
          WHERE s.deleted_at IS NULL AND ${productMatchSql}
        )
        OR EXISTS (
          SELECT 1 FROM customer_ledger c
          WHERE c.deleted_at IS NULL
            AND COALESCE(c.quantity, 0) < 0
            AND c.product_name = product_catalog.product_name
            AND COALESCE(c.spec, '') = COALESCE(product_catalog.spec, '')
            AND COALESCE(c.unit, '') = COALESCE(product_catalog.unit, '')
        )
      )
  `).run()
}

export function rebuildInventoryBusinessTables() {
  const db = getDb()
  db.exec(`
    INSERT OR IGNORE INTO product_catalog (product_name, spec, unit, category, default_price)
    SELECT
      product_name,
      COALESCE(spec, ''),
      COALESCE(unit, ''),
      COALESCE(category, ''),
      COALESCE(MAX(NULLIF(unit_price, 0)), 0)
    FROM (
      SELECT product_name, spec, unit, category, unit_price FROM stock_in_ledger
      WHERE deleted_at IS NULL AND COALESCE(counts_inventory, 1) = 1
      UNION ALL
      SELECT product_name, spec, unit, category, unit_price FROM stock_out_ledger WHERE deleted_at IS NULL
    )
    WHERE product_name IS NOT NULL AND product_name != ''
    GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '');

    DELETE FROM inventory_balances;

    INSERT INTO inventory_balances (product_name, spec, unit, stock_qty, available_qty)
    SELECT product_name, spec, unit, stock_qty, stock_qty
    FROM (
      SELECT
        product_name,
        spec,
        unit,
        SUM(in_qty) - SUM(out_qty) AS stock_qty
      FROM (
        ${inventoryFlowsSql}
      )
      WHERE product_name IS NOT NULL AND product_name != ''
      GROUP BY product_name, spec, unit
    );
  `)
  syncProductCatalogWithLedger(db)
}
