import { ipcMain } from 'electron'
import { getDb } from '../db'
import { inventoryFlowsSql } from './stock-business'

export function registerInventoryHandlers(): void {
  ipcMain.handle('inventory:list', (_e, {
    page = 1,
    pageSize = 50,
    keyword = '',
    productName = '',
    spec = '',
    unit = '',
    stockType = '',
    stockStatus = '',
  } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const productLike = `%${productName}%`
    const specLike = `%${spec}%`
    const unitLike = `%${unit}%`
    const typeFilter = String(stockType || '').trim()
    const having = stockStatus === 'inStock'
      ? 'HAVING SUM(in_qty) - SUM(out_qty) > 0'
      : stockStatus === 'outOfStock'
        ? 'HAVING SUM(in_qty) - SUM(out_qty) <= 0'
        : ''
    const flowSql = `
      FROM (
        SELECT 'product' AS stock_type, product_name, spec, unit, in_qty, out_qty
        FROM (
          ${inventoryFlowsSql}
        )
        UNION ALL
        SELECT 'material' AS stock_type, material_name AS product_name, material_spec AS spec, material_unit AS unit,
          purchased_qty AS in_qty, used_qty + returned_qty AS out_qty
        FROM (
          WITH purchased AS (
            SELECT material_name, COALESCE(material_spec, '') AS material_spec, COALESCE(material_unit, '公斤') AS material_unit,
              COALESCE(SUM(material_quantity), 0) AS purchased_qty
            FROM stock_in_ledger
            WHERE deleted_at IS NULL
              AND TRIM(COALESCE(material_name, '')) != ''
              AND COALESCE(material_quantity, 0) > 0
            GROUP BY material_name, COALESCE(material_spec, ''), COALESCE(material_unit, '公斤')
          ),
          used AS (
            SELECT material_name, COALESCE(material_spec, '') AS material_spec, COALESCE(material_unit, '公斤') AS material_unit,
              COALESCE(SUM(material_used_quantity), 0) AS used_qty
            FROM stock_in_ledger
            WHERE deleted_at IS NULL
              AND TRIM(COALESCE(material_name, '')) != ''
              AND COALESCE(material_used_quantity, 0) > 0
            GROUP BY material_name, COALESCE(material_spec, ''), COALESCE(material_unit, '公斤')
          ),
          returned AS (
            SELECT product_name AS material_name, COALESCE(spec, '') AS material_spec, COALESCE(unit, '公斤') AS material_unit,
              COALESCE(SUM(ABS(quantity)), 0) AS returned_qty
            FROM supplier_ledger
            WHERE deleted_at IS NULL
              AND COALESCE(quantity, 0) < 0
              AND note LIKE '%原材料退货%'
            GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '公斤')
          )
          SELECT purchased.material_name, purchased.material_spec, purchased.material_unit,
            purchased.purchased_qty,
            COALESCE(used.used_qty, 0) AS used_qty,
            COALESCE(returned.returned_qty, 0) AS returned_qty
          FROM purchased
          LEFT JOIN used ON used.material_name = purchased.material_name
            AND used.material_spec = purchased.material_spec
            AND used.material_unit = purchased.material_unit
          LEFT JOIN returned ON returned.material_name = purchased.material_name
            AND returned.material_spec = purchased.material_spec
            AND returned.material_unit = purchased.material_unit
        ) material_flows
      ) flows
    `
    const groupedSql = `
      SELECT
        stock_type,
        product_name,
        spec,
        unit,
        SUM(in_qty) AS total_in,
        SUM(out_qty) AS total_out,
        SUM(in_qty) - SUM(out_qty) AS stock_qty
      ${flowSql}
      WHERE (? = '' OR stock_type = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR unit LIKE ?)
        AND product_name LIKE ?
        AND spec LIKE ?
        AND unit LIKE ?
      GROUP BY stock_type, product_name, spec, unit
      ${having}
    `

    const rows = db.prepare(`
      ${groupedSql}
      ORDER BY stock_type ASC, product_name COLLATE NOCASE ASC, spec COLLATE NOCASE ASC, unit COLLATE NOCASE ASC
      LIMIT ? OFFSET ?
    `).all(typeFilter, typeFilter, like, like, like, productLike, specLike, unitLike, pageSize, offset)

    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM (
        ${groupedSql}
      )
    `).get(typeFilter, typeFilter, like, like, like, productLike, specLike, unitLike) as { total: number }

    const summary = db.prepare(`
      SELECT
        COUNT(*) AS totalRecords,
        SUM(total_in) AS totalIn,
        SUM(total_out) AS totalOut,
        SUM(stock_qty) AS totalStock
      FROM (
        ${groupedSql}
      )
    `).get(typeFilter, typeFilter, like, like, like, productLike, specLike, unitLike)

    return { rows, total, summary }
  })

  ipcMain.handle('inventory:options', (_e, keyword = '') => {
    const db = getDb()
    const like = `%${keyword}%`
    return db.prepare(`
      SELECT
        product_name,
        spec,
        unit,
        SUM(in_qty) AS total_in,
        SUM(out_qty) AS total_out,
        SUM(in_qty) - SUM(out_qty) AS stock_qty
      FROM (
        ${inventoryFlowsSql}
      ) flows
      WHERE product_name LIKE ? OR spec LIKE ? OR unit LIKE ?
      GROUP BY product_name, spec, unit
      HAVING SUM(in_qty) - SUM(out_qty) > 0
      ORDER BY product_name COLLATE NOCASE ASC, spec COLLATE NOCASE ASC, unit COLLATE NOCASE ASC
      LIMIT 200
    `).all(like, like, like)
  })
}
