import { ipcMain } from 'electron'
import { getDb } from '../db'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import { attachmentPreviewSql, cleanupOrphanAttachments, withAttachmentPreviews } from './attachments'
import { ensureProductCatalog, generateDocNo, recalcInventoryForRows, syncProductCatalogWithLedger } from './stock-business'
import { assertSupplierProfileExists, getSupplierType, listAllSupplierNames } from './supplier-profile'
import { isMaterialSupplierType } from '../../common/supplier-profile'
import {
  deletePayableForStockIn,
  syncPayableFromStockIn,
} from './stock-supplier-link'
import { resolveStockInCountsInventory } from './supplier-migrate'

function normalizeStockInRow(row: any, fallbackDocNo = '') {
  return {
    doc_no: String(row?.doc_no || fallbackDocNo || '').trim(),
    supplier_name: String(row?.supplier_name || '').trim(),
    category: String(row?.category || '').trim(),
    date: String(row?.date || '').trim(),
    contract_no: String(row?.contract_no || '').trim(),
    product_name: String(row?.product_name || '').trim(),
    spec: String(row?.spec || '').trim(),
    unit: String(row?.unit || '').trim(),
    quantity: Number(row?.quantity || 0),
    unit_price: Number(row?.unit_price || 0),
    amount: Number(row?.amount || 0),
    material_quantity: Number(row?.material_quantity || 0),
    material_unit_price: Number(row?.material_unit_price || 0),
    tax_rate: Number(row?.tax_rate || 0),
    tax_amount: Number(row?.tax_amount || 0),
    invoice_amount: Number(row?.invoice_amount || 0),
    note: String(row?.note || '').trim(),
    counts_inventory: Number(row?.counts_inventory ?? 1) ? 1 : 0,
  }
}

function validateStockInRow(db: ReturnType<typeof getDb>, row: any) {
  if (!String(row?.date || '').trim()) throw new Error('请填写日期')

  if (!String(row?.product_name || '').trim()) {
    throw new Error('请填写成品名称')
  }
  if (!String(row?.spec || '').trim()) throw new Error('请填写规格（出库须与入库完全一致，用于库存匹配）')
  if (!String(row?.unit || '').trim()) throw new Error('请填写单位（出库须与入库完全一致，用于库存匹配）')
  if (Number(row?.quantity || 0) <= 0) throw new Error('请填写成品数量')

  const supplierName = String(row?.supplier_name || '').trim()
  if (!supplierName) {
    if (Number(row?.unit_price || 0) <= 0) throw new Error('请填写单价')
    if (Number(row?.amount || 0) <= 0) throw new Error('请填写金额')
    return
  }

  assertSupplierProfileExists(db, supplierName)
  const isMaterial = isMaterialSupplierType(getSupplierType(db, supplierName))

  if (isMaterial) {
    if (Number(row?.material_quantity || 0) <= 0) throw new Error('请填写材料公斤数')
    if (Number(row?.material_unit_price || 0) <= 0) throw new Error('请填写材料单价（元/公斤）')
    if (Number(row?.amount || 0) <= 0) throw new Error('请填写材料金额')
  } else {
    if (Number(row?.unit_price || 0) <= 0) throw new Error('请填写加工单价')
    if (Number(row?.amount || 0) <= 0) throw new Error('请填写加工费用')
  }
}

function applyStockInSideEffects(db: ReturnType<typeof getDb>, row: Record<string, any>, oldRow?: Record<string, any>) {
  if (Number(row?.counts_inventory || 0) === 1) {
    ensureProductCatalog(row)
    recalcInventoryForRows(row)
  }
  if (oldRow && Number(oldRow?.counts_inventory || 0) === 1) {
    recalcInventoryForRows(oldRow)
  }
  syncPayableFromStockIn(db, row)
}

export function registerStockInHandlers(): void {
  ipcMain.handle('stockIn:names', () => {
    return listAllSupplierNames(getDb()).map(supplier_name => ({ supplier_name }))
  })

  ipcMain.handle('stockIn:list', (_e, params = {}) => {
    const { supplierName, page = 1, pageSize = 50, keyword = '' } = params as any
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const filters = normalizeLedgerFilters(params, 'supplierName')
    const dateWhere = buildDateFilterClause(filters)
    const rows = db.prepare(`
      SELECT stock_in_ledger.*, ${attachmentPreviewSql('stock_in_ledger')}
      FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR category LIKE ? OR note LIKE ? OR date LIKE ? OR supplier_name LIKE ?)
        ${dateWhere.sql}
      ORDER BY ${buildDateOrderBy('stock_in_ledger.date')}
      LIMIT ? OFFSET ?
    `).all(supplierName || '', supplierName || '', like, like, like, like, like, like, like, ...dateWhere.params, pageSize, offset)
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR category LIKE ? OR note LIKE ? OR date LIKE ? OR supplier_name LIKE ?)
        ${dateWhere.sql}
    `).get(supplierName || '', supplierName || '', like, like, like, like, like, like, like, ...dateWhere.params) as { total: number }
    return { rows: withAttachmentPreviews(rows), total }
  })

  ipcMain.handle('stockIn:summary', (_e, params: any = {}) => {
    const filters = normalizeLedgerFilters(params, 'supplierName')
    const supplierName = filters.supplierName || ''
    const dateWhere = buildDateFilterClause(filters)
    const db = getDb()
    if (supplierName) {
      return db.prepare(`
        SELECT
          COUNT(*) as totalRecords,
          SUM(quantity) as totalQuantity,
          SUM(amount) as totalAmount
        FROM stock_in_ledger
        WHERE deleted_at IS NULL AND supplier_name = ? ${dateWhere.sql}
      `).get(supplierName, ...dateWhere.params)
    }
    return db.prepare(`
      SELECT
        COUNT(*) as totalRecords,
        SUM(quantity) as totalQuantity,
        SUM(amount) as totalAmount,
        COUNT(DISTINCT supplier_name) as supplierCount
      FROM stock_in_ledger WHERE deleted_at IS NULL ${dateWhere.sql}
    `).get(...dateWhere.params)
  })

  ipcMain.handle('stockIn:add', (_e, row) => {
    const db = getDb()
    const supplierName = String(row?.supplier_name || '').trim()
    const countsInventory = resolveStockInCountsInventory(db, supplierName)
    const payload = {
      ...normalizeStockInRow(row, generateDocNo('RK', 'stock_in_ledger', row?.date)),
      counts_inventory: countsInventory,
    }
    validateStockInRow(db, payload)

    const newRow = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO stock_in_ledger (
          doc_no, supplier_name, category, date, contract_no, product_name, spec, unit,
          quantity, unit_price, amount, material_quantity, material_unit_price,
          tax_rate, tax_amount, invoice_amount, note, counts_inventory
        ) VALUES (
          @doc_no, @supplier_name, @category, @date, @contract_no, @product_name, @spec, @unit,
          @quantity, @unit_price, @amount, @material_quantity, @material_unit_price,
          @tax_rate, @tax_amount, @invoice_amount, @note, @counts_inventory
        )
      `).run(payload)
      const stockInId = Number(result.lastInsertRowid)
      const inserted = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(stockInId) as Record<string, any>
      if (Number(inserted?.counts_inventory || 0) === 1) ensureProductCatalog(inserted)
      syncPayableFromStockIn(db, inserted)
      return inserted
    })()

    logOperation('stock_in_ledger', Number(newRow.id), 'INSERT', null, newRow as object)
    if (Number(newRow?.counts_inventory || 0) === 1) recalcInventoryForRows(newRow)
    return db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(newRow.id)
  })

  ipcMain.handle('stockIn:update', (_e, { id, ...row }) => {
    const db = getDb()
    const oldRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as any
    const supplierName = String(row?.supplier_name || oldRow?.supplier_name || '').trim()
    const countsInventory = resolveStockInCountsInventory(db, supplierName)
    const payload = {
      ...normalizeStockInRow(row, oldRow?.doc_no || generateDocNo('RK', 'stock_in_ledger', row?.date)),
      counts_inventory: countsInventory,
    }
    validateStockInRow(db, payload)

    const newRow = db.transaction(() => {
      db.prepare(`
        UPDATE stock_in_ledger SET
          doc_no=@doc_no, supplier_name=@supplier_name, category=@category, date=@date,
          contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
          quantity=@quantity, unit_price=@unit_price, amount=@amount,
          material_quantity=@material_quantity, material_unit_price=@material_unit_price,
          tax_rate=@tax_rate, tax_amount=@tax_amount, invoice_amount=@invoice_amount,
          note=@note, counts_inventory=@counts_inventory, updated_at=datetime('now','localtime')
        WHERE id=@id
      `).run({ ...payload, id })
      const updated = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
      syncPayableFromStockIn(db, updated)
      return updated
    })()

    logOperation('stock_in_ledger', id, 'UPDATE', oldRow as object, newRow as object)
    if (Number(newRow?.counts_inventory || 0) === 1) recalcInventoryForRows(newRow)
    if (oldRow && Number(oldRow?.counts_inventory || 0) === 1) recalcInventoryForRows(oldRow)
    return newRow
  })

  ipcMain.handle('stockIn:delete', (_e, id) => {
    try {
      const db = getDb()
      const row = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
      deletePayableForStockIn(db, row)
      softDelete('stock_in_ledger', id)
      if (Number(row?.counts_inventory || 0) === 1) recalcInventoryForRows(row)
      cleanupOrphanAttachments()
      syncProductCatalogWithLedger()
      return { ok: true }
    } catch (error: any) {
      return { ok: false, error: error?.message || '删除失败' }
    }
  })

  ipcMain.handle('stockIn:deleteMany', (_e, ids: number[] = []) => {
    const db = getDb()
    const uniqueIds = [...new Set((ids || []).map(id => Number(id)).filter(id => id > 0))]
    let count = 0
    let lastError = ''
    for (const id of uniqueIds) {
      try {
        const row = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
        deletePayableForStockIn(db, row)
        softDelete('stock_in_ledger', id)
        if (Number(row?.counts_inventory || 0) === 1) recalcInventoryForRows(row)
        count++
      } catch (error: any) {
        lastError = error?.message || '删除失败'
        break
      }
    }
    cleanupOrphanAttachments()
    syncProductCatalogWithLedger()
    if (count === uniqueIds.length) return { ok: true, count, total: uniqueIds.length }
    return { ok: false, count, total: uniqueIds.length, error: lastError || `仅删除 ${count}/${uniqueIds.length} 条` }
  })
  ipcMain.handle('stockIn:trash', () => {
    return getDb().prepare(`SELECT * FROM stock_in_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('stockIn:restore', (_e, id) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
    restore('stock_in_ledger', id)
    const newRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(id) as Record<string, any>
    applyStockInSideEffects(db, newRow, row)
    return { ok: true }
  })
}
