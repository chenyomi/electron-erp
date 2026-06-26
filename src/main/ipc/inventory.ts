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
    stockStatus = '',
  } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const productLike = `%${productName}%`
    const specLike = `%${spec}%`
    const unitLike = `%${unit}%`
    const having = stockStatus === 'inStock'
      ? 'HAVING SUM(in_qty) - SUM(out_qty) > 0'
      : stockStatus === 'outOfStock'
        ? 'HAVING SUM(in_qty) - SUM(out_qty) <= 0'
        : ''
    const flowSql = `
      FROM (
        ${inventoryFlowsSql}
      ) flows
    `
    const groupedSql = `
      SELECT
        product_name,
        spec,
        unit,
        SUM(in_qty) AS total_in,
        SUM(out_qty) AS total_out,
        SUM(in_qty) - SUM(out_qty) AS stock_qty
      ${flowSql}
      WHERE (product_name LIKE ? OR spec LIKE ? OR unit LIKE ?)
        AND product_name LIKE ?
        AND spec LIKE ?
        AND unit LIKE ?
      GROUP BY product_name, spec, unit
      ${having}
    `

    const rows = db.prepare(`
      ${groupedSql}
      ORDER BY product_name COLLATE NOCASE ASC, spec COLLATE NOCASE ASC, unit COLLATE NOCASE ASC
      LIMIT ? OFFSET ?
    `).all(like, like, like, productLike, specLike, unitLike, pageSize, offset)

    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM (
        ${groupedSql}
      )
    `).get(like, like, like, productLike, specLike, unitLike) as { total: number }

    const summary = db.prepare(`
      SELECT
        COUNT(*) AS totalRecords,
        SUM(total_in) AS totalIn,
        SUM(total_out) AS totalOut,
        SUM(stock_qty) AS totalStock
      FROM (
        ${groupedSql}
      )
    `).get(like, like, like, productLike, specLike, unitLike)

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
