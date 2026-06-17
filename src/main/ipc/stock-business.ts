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

export function generateDocNo(prefix: 'RK' | 'CK', tableName: 'stock_in_ledger' | 'stock_out_ledger', dateValue?: string) {
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

export function recalcInventoryBalance(row: any) {
  const db = getDb()
  const product = normalizeProductRow(row)
  if (!product.product_name) return
  const stockIn = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
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
  const qty = Number(stockIn?.qty || 0) - Number(stockOut?.qty || 0)
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
      SELECT product_name, spec, unit, category, unit_price FROM stock_in_ledger WHERE deleted_at IS NULL
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
        COALESCE(spec, '') AS spec,
        COALESCE(unit, '') AS unit,
        SUM(in_qty) - SUM(out_qty) AS stock_qty
      FROM (
        SELECT product_name, spec, unit, quantity AS in_qty, 0 AS out_qty FROM stock_in_ledger WHERE deleted_at IS NULL
        UNION ALL
        SELECT product_name, spec, unit, 0 AS in_qty, quantity AS out_qty FROM stock_out_ledger WHERE deleted_at IS NULL
      )
      WHERE product_name IS NOT NULL AND product_name != ''
      GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '')
    );
  `)
}
