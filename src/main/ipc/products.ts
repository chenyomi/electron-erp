import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerProductHandlers(): void {
  ipcMain.handle('products:list', (_e, { page = 1, pageSize = 50, keyword = '' } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const rows = db.prepare(`
      SELECT
        product_catalog.*,
        COALESCE(inventory_balances.stock_qty, 0) AS stock_qty,
        COALESCE(inventory_balances.available_qty, 0) AS available_qty
      FROM product_catalog
      LEFT JOIN inventory_balances
        ON inventory_balances.product_name = product_catalog.product_name
        AND COALESCE(inventory_balances.spec, '') = COALESCE(product_catalog.spec, '')
        AND COALESCE(inventory_balances.unit, '') = COALESCE(product_catalog.unit, '')
      WHERE product_catalog.deleted_at IS NULL
        AND (
          product_catalog.product_name LIKE ?
          OR product_catalog.spec LIKE ?
          OR product_catalog.unit LIKE ?
          OR product_catalog.category LIKE ?
        )
      ORDER BY product_catalog.product_name COLLATE NOCASE ASC, product_catalog.spec COLLATE NOCASE ASC
      LIMIT ? OFFSET ?
    `).all(like, like, like, like, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) AS total
      FROM product_catalog
      WHERE deleted_at IS NULL
        AND (product_name LIKE ? OR spec LIKE ? OR unit LIKE ? OR category LIKE ?)
    `).get(like, like, like, like) as { total: number }
    return { rows, total }
  })
}
