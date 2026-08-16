import { ipcMain } from 'electron'
import { getDb } from '../db'
import { buildInventorySummaryQuery, inventoryFlowsSql } from './stock-business'

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
    const { sql: groupedSql, params } = buildInventorySummaryQuery({
      keyword,
      productName,
      spec,
      unit,
      stockType,
      stockStatus,
    })

    const rows = db.prepare(`
      ${groupedSql}
      ORDER BY stock_type ASC, product_name COLLATE NOCASE ASC, spec COLLATE NOCASE ASC, unit COLLATE NOCASE ASC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM (
        ${groupedSql}
      )
    `).get(...params) as { total: number }

    const summary = db.prepare(`
      SELECT
        COUNT(*) AS totalRecords,
        SUM(total_in) AS totalIn,
        SUM(total_out) AS totalOut,
        SUM(stock_qty) AS totalStock
      FROM (
        ${groupedSql}
      )
    `).get(...params)

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
