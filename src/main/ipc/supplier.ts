import { ipcMain } from 'electron'
import { getDb } from '../db'
import {
  buildSupplierDescription,
  enrichSupplierRow,
  getSupplierLedgerDeleteBlockReason,
  isSupplierPayableRecord,
  isSupplierPaymentRecord,
  isSupplierReturnRecord,
  isSupplierScrapRecord,
  sqlSupplierNetPayableSum,
  sqlSupplierPaymentWhere,
  validateSupplierPaymentAmount,
  validateSupplierReturnAgainstPayments,
} from '../../common/supplier-ledger'
import {
  buildScrapNote,
  normalizeScrapSettlementMode,
  parseScrapLinkedCashId,
  parseScrapLinkedStockInIds,
  SCRAP_NOTE_MARKER,
} from '../../common/supplier-scrap'
import { isMaterialSupplierType } from '../../common/supplier-profile'
import { recalculateCashBalances } from './ledger-balance'
import {
  getSupplierProfile,
  getSupplierRemovePreview,
  getSupplierType,
  listAllSupplierNames,
  listSupplierProfileNames,
  recalculateSupplierBalances,
  setSupplierProfile,
  supplierNameExists,
  syncSupplierProfilesFromLedger,
} from './supplier-profile'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, restore, softDelete } from './helpers'
import {
  applySupplierReturnSideEffects,
  backfillSupplierPayablesFromStockIn,
  cleanupSupplierReturnStockOut,
  createPayableFromStockIn,
  deletePayableForStockIn,
  listLinkedSupplierLedgerRows as listLinkedRows,
  recalcInventoryForSupplierReturnRow,
  resolvePayableReference,
  shouldLinkSupplierPayable,
} from './stock-supplier-link'
import { generateDocNo, recalcInventoryForRows } from './stock-business'

const MATERIAL_RETURN_PRODUCT_NAME = '原材料退货'

function listSupplierMaterialCatalog(db: ReturnType<typeof getDb>, supplierName: string) {
  const name = String(supplierName || '').trim()
  if (!name) return []
  const fromStockIn = db.prepare(`
    SELECT material_name,
      COALESCE(material_spec, '') AS material_spec,
      COALESCE(material_unit, '公斤') AS material_unit,
      MAX(material_unit_price) AS unit_price,
      COALESCE(SUM(material_quantity), 0) AS purchased_qty
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND TRIM(COALESCE(material_name, '')) != ''
      AND COALESCE(material_quantity, 0) > 0
    GROUP BY material_name, COALESCE(material_spec, ''), COALESCE(material_unit, '公斤')
    ORDER BY material_name COLLATE NOCASE ASC, material_spec COLLATE NOCASE ASC
  `).all(name) as Array<Record<string, any>>
  if (fromStockIn.length) return fromStockIn

  // 兼容：仅有台账应付、入库 material_name 为空时，从供应商应付行取材料
  return db.prepare(`
    SELECT product_name AS material_name,
      COALESCE(spec, '') AS material_spec,
      COALESCE(unit, '公斤') AS material_unit,
      MAX(unit_price) AS unit_price,
      COALESCE(SUM(quantity), 0) AS purchased_qty
    FROM supplier_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND COALESCE(quantity, 0) > 0
      AND TRIM(COALESCE(product_name, '')) != ''
      AND TRIM(COALESCE(product_name, '')) NOT IN ('付款', '原材料退货')
      AND TRIM(COALESCE(note, '')) NOT LIKE '%废料回收%'
    GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '公斤')
    ORDER BY product_name COLLATE NOCASE ASC, spec COLLATE NOCASE ASC
  `).all(name) as Array<Record<string, any>>
}

function isSupplierMaterialReturnRow(row: Record<string, any>): boolean {
  if (isSupplierPaymentRecord(row)) return false
  return Number(row.quantity || 0) < 0 && (
    String(row.product_name || '').includes(MATERIAL_RETURN_PRODUCT_NAME)
    || String(row.note || '').includes(MATERIAL_RETURN_PRODUCT_NAME)
  )
}

function listSupplierReturnProductOptions(db: ReturnType<typeof getDb>, supplierName: string) {
  const name = String(supplierName || '').trim()
  if (!name) return []
  if (isMaterialSupplierType(getSupplierType(db, name))) return []
  return db.prepare(`
    WITH supplied AS (
      SELECT product_name, COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit,
        COALESCE(SUM(quantity), 0) AS supplied_qty,
        MAX(unit_price) AS unit_price
      FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND supplier_name = ?
        AND COALESCE(counts_inventory, 1) = 1
      GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '')
    ),
    returned AS (
      SELECT product_name, COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit,
        COALESCE(SUM(ABS(quantity)), 0) AS returned_qty
      FROM supplier_ledger
      WHERE deleted_at IS NULL AND supplier_name = ? AND COALESCE(quantity, 0) < 0
      GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '')
    )
    SELECT supplied.product_name, supplied.spec, supplied.unit,
      supplied.unit_price,
      supplied.supplied_qty,
      COALESCE(returned.returned_qty, 0) AS returned_qty,
      COALESCE(inv.stock_qty, 0) AS stock_qty,
      MIN(supplied.supplied_qty - COALESCE(returned.returned_qty, 0), COALESCE(inv.stock_qty, 0)) AS max_qty
    FROM supplied
    LEFT JOIN returned ON returned.product_name = supplied.product_name
      AND returned.spec = supplied.spec
      AND returned.unit = supplied.unit
    LEFT JOIN inventory_balances inv ON inv.product_name = supplied.product_name
      AND COALESCE(inv.spec, '') = supplied.spec
      AND COALESCE(inv.unit, '') = supplied.unit
    WHERE supplied.supplied_qty - COALESCE(returned.returned_qty, 0) > 0.005
      AND COALESCE(inv.stock_qty, 0) > 0.005
    ORDER BY supplied.product_name COLLATE NOCASE ASC, supplied.spec COLLATE NOCASE ASC
  `).all(name, name) as Array<Record<string, any>>
}

function getSupplierMaterialReturnMax(
  db: ReturnType<typeof getDb>,
  supplierName: string,
  excludeLedgerId = 0,
): number {
  const supplied = db.prepare(`
    SELECT COALESCE(SUM(material_quantity), 0) AS qty
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND COALESCE(material_quantity, 0) > 0
  `).get(supplierName) as { qty?: number }
  const returned = db.prepare(`
    SELECT COALESCE(SUM(ABS(quantity)), 0) AS qty
    FROM supplier_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND COALESCE(quantity, 0) < 0
      AND (
        product_name LIKE ?
        OR note LIKE ?
      )
      AND (? = 0 OR id != ?)
  `).get(supplierName, `%${MATERIAL_RETURN_PRODUCT_NAME}%`, `%${MATERIAL_RETURN_PRODUCT_NAME}%`, excludeLedgerId, excludeLedgerId) as { qty?: number }
  return Math.max(0, Number(supplied?.qty || 0) - Number(returned?.qty || 0))
}

function getSupplierMaterialReturnOption(db: ReturnType<typeof getDb>, supplierName: string, excludeLedgerId = 0) {
  const name = String(supplierName || '').trim()
  if (!name) return { max_qty: 0, unit_price: 0, supplied_qty: 0, returned_qty: 0 }
  const supplied = db.prepare(`
    SELECT COALESCE(SUM(material_quantity), 0) AS qty
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND COALESCE(material_quantity, 0) > 0
  `).get(name) as { qty?: number }
  const returned = db.prepare(`
    SELECT COALESCE(SUM(ABS(quantity)), 0) AS qty
    FROM supplier_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND COALESCE(quantity, 0) < 0
      AND (
        product_name LIKE ?
        OR note LIKE ?
      )
      AND (? = 0 OR id != ?)
  `).get(name, `%${MATERIAL_RETURN_PRODUCT_NAME}%`, `%${MATERIAL_RETURN_PRODUCT_NAME}%`, excludeLedgerId, excludeLedgerId) as { qty?: number }
  const latest = db.prepare(`
    SELECT material_unit_price
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND COALESCE(material_quantity, 0) > 0
      AND COALESCE(material_unit_price, 0) > 0
    ORDER BY date DESC, id DESC
    LIMIT 1
  `).get(name) as { material_unit_price?: number } | undefined
  const suppliedQty = Number(supplied?.qty || 0)
  const returnedQty = Number(returned?.qty || 0)
  return {
    supplied_qty: suppliedQty,
    returned_qty: returnedQty,
    max_qty: Math.max(0, suppliedQty - returnedQty),
    unit_price: Number(latest?.material_unit_price || 0),
    unit: '公斤',
  }
}

function listSupplierMaterialReturnOptions(db: ReturnType<typeof getDb>, supplierName: string) {
  const name = String(supplierName || '').trim()
  if (!name) return []
  return db.prepare(`
    WITH supplied AS (
      SELECT material_name, COALESCE(material_spec, '') AS material_spec, COALESCE(material_unit, '公斤') AS material_unit,
        COALESCE(SUM(material_quantity), 0) AS supplied_qty,
        MAX(material_unit_price) AS unit_price
      FROM stock_in_ledger
      WHERE deleted_at IS NULL
        AND supplier_name = ?
        AND TRIM(COALESCE(material_name, '')) != ''
        AND COALESCE(material_quantity, 0) > 0
      GROUP BY material_name, COALESCE(material_spec, ''), COALESCE(material_unit, '公斤')
    ),
    returned AS (
      SELECT product_name AS material_name, COALESCE(spec, '') AS material_spec, COALESCE(unit, '公斤') AS material_unit,
        COALESCE(SUM(ABS(quantity)), 0) AS returned_qty
      FROM supplier_ledger
      WHERE deleted_at IS NULL
        AND supplier_name = ?
        AND COALESCE(quantity, 0) < 0
        AND note LIKE '%原材料退货%'
      GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '公斤')
    ),
    total_purchased AS (
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
    total_returned AS (
      SELECT product_name AS material_name, COALESCE(spec, '') AS material_spec, COALESCE(unit, '公斤') AS material_unit,
        COALESCE(SUM(ABS(quantity)), 0) AS returned_qty
      FROM supplier_ledger
      WHERE deleted_at IS NULL
        AND COALESCE(quantity, 0) < 0
        AND note LIKE '%原材料退货%'
      GROUP BY product_name, COALESCE(spec, ''), COALESCE(unit, '公斤')
    )
    SELECT supplied.material_name AS product_name,
      supplied.material_spec AS spec,
      supplied.material_unit AS unit,
      supplied.unit_price,
      supplied.supplied_qty,
      COALESCE(returned.returned_qty, 0) AS returned_qty,
      COALESCE(used.used_qty, 0) AS used_qty,
      MIN(
        supplied.supplied_qty - COALESCE(returned.returned_qty, 0),
        COALESCE(total_purchased.purchased_qty, 0) - COALESCE(used.used_qty, 0) - COALESCE(total_returned.returned_qty, 0)
      ) AS max_qty
    FROM supplied
    LEFT JOIN returned ON returned.material_name = supplied.material_name
      AND returned.material_spec = supplied.material_spec
      AND returned.material_unit = supplied.material_unit
    LEFT JOIN used ON used.material_name = supplied.material_name
      AND used.material_spec = supplied.material_spec
      AND used.material_unit = supplied.material_unit
    LEFT JOIN total_purchased ON total_purchased.material_name = supplied.material_name
      AND total_purchased.material_spec = supplied.material_spec
      AND total_purchased.material_unit = supplied.material_unit
    LEFT JOIN total_returned ON total_returned.material_name = supplied.material_name
      AND total_returned.material_spec = supplied.material_spec
      AND total_returned.material_unit = supplied.material_unit
    WHERE MIN(
        supplied.supplied_qty - COALESCE(returned.returned_qty, 0),
        COALESCE(total_purchased.purchased_qty, 0) - COALESCE(used.used_qty, 0) - COALESCE(total_returned.returned_qty, 0)
      ) > 0.005
    ORDER BY supplied.material_name COLLATE NOCASE ASC, supplied.material_spec COLLATE NOCASE ASC
  `).all(name, name) as Array<Record<string, any>>
}

function getSupplierProductReturnMax(
  db: ReturnType<typeof getDb>,
  supplierName: string,
  productName: string,
  spec: string,
  unit: string,
  excludeLedgerId = 0,
): number {
  const supplied = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM stock_in_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
      AND COALESCE(counts_inventory, 1) = 1
  `).get(supplierName, productName, spec, unit) as { qty?: number }
  const returned = db.prepare(`
    SELECT COALESCE(SUM(ABS(quantity)), 0) AS qty
    FROM supplier_ledger
    WHERE deleted_at IS NULL
      AND supplier_name = ?
      AND product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
      AND COALESCE(quantity, 0) < 0
      AND (? = 0 OR id != ?)
  `).get(supplierName, productName, spec, unit, excludeLedgerId, excludeLedgerId) as { qty?: number }
  const stock = db.prepare(`
    SELECT COALESCE(stock_qty, 0) AS qty
    FROM inventory_balances
    WHERE product_name = ?
      AND COALESCE(spec, '') = ?
      AND COALESCE(unit, '') = ?
  `).get(productName, spec, unit) as { qty?: number } | undefined
  const old = excludeLedgerId
    ? db.prepare(`
      SELECT product_name, COALESCE(spec, '') AS spec, COALESCE(unit, '') AS unit, ABS(quantity) AS qty
      FROM supplier_ledger
      WHERE id = ? AND deleted_at IS NULL AND COALESCE(quantity, 0) < 0
    `).get(excludeLedgerId) as { product_name?: string; spec?: string; unit?: string; qty?: number } | undefined
    : undefined
  const stockQty = Number(stock?.qty || 0) + (
    old?.product_name === productName && String(old.spec || '') === spec && String(old.unit || '') === unit
      ? Number(old.qty || 0)
      : 0
  )
  return Math.max(0, Math.min(Number(supplied?.qty || 0) - Number(returned?.qty || 0), stockQty))
}

export function registerSupplierHandlers(): void {
  ipcMain.handle('supplier:names', () => {
    return listAllSupplierNames(getDb()).map(supplier_name => ({ supplier_name }))
  })

  ipcMain.handle('supplier:profile-names', () => {
    return listSupplierProfileNames(getDb()).map(supplier_name => ({ supplier_name }))
  })

  ipcMain.handle('supplier:summary', (_e, params: any = {}) => {
    const db = getDb()
    const filters = normalizeLedgerFilters(params, 'supplierName')
    const supplierName = filters.supplierName || ''
    const dateWhere = buildDateFilterClause(filters)

    if (!supplierName) {
      const rows = db.prepare(`
        WITH names AS (
          SELECT supplier_name FROM supplier_profiles
          UNION
          SELECT DISTINCT supplier_name FROM supplier_ledger WHERE deleted_at IS NULL
        ),
        totals AS (
          SELECT supplier_name,
            ${sqlSupplierNetPayableSum()} AS totalIn,
            COALESCE(SUM(amount_out), 0) AS totalOut
          FROM supplier_ledger
          WHERE deleted_at IS NULL ${dateWhere.sql}
          GROUP BY supplier_name
        ),
        stock AS (
          SELECT supplier_name,
            COUNT(*) AS stockInCount,
            COALESCE(SUM(quantity), 0) AS totalQuantity,
            COALESCE(SUM(amount), 0) AS totalAmount
          FROM stock_in_ledger
          WHERE deleted_at IS NULL ${dateWhere.sql}
          GROUP BY supplier_name
        )
        SELECT n.supplier_name,
          COALESCE(p.supplier_type, 'outsourcing') AS supplier_type,
          COALESCE(p.contact_person, '') AS contact_person,
          COALESCE(p.phone, '') AS phone,
          COALESCE(t.totalIn, 0) AS totalIn,
          COALESCE(t.totalOut, 0) AS totalOut,
          COALESCE(s.stockInCount, 0) AS stockInCount,
          COALESCE(s.totalQuantity, 0) AS totalQuantity,
          COALESCE(s.totalAmount, 0) AS totalAmount
        FROM names n
        LEFT JOIN supplier_profiles p ON p.supplier_name = n.supplier_name
        LEFT JOIN totals t ON t.supplier_name = n.supplier_name
        LEFT JOIN stock s ON s.supplier_name = n.supplier_name
        ORDER BY n.supplier_name COLLATE NOCASE ASC
      `).all(...dateWhere.params, ...dateWhere.params) as Array<{
        supplier_name: string
        contact_person: string
        phone: string
        totalIn: number
        totalOut: number
        stockInCount: number
        totalQuantity: number
        totalAmount: number
      }>

      return rows.map(row => {
        const openingBalance = Number(getSupplierProfile(db, row.supplier_name).opening_balance || 0)
        const currentBalance = Math.round((openingBalance + Number(row.totalIn || 0) - Number(row.totalOut || 0)) * 100) / 100
        return {
          supplier_name: row.supplier_name,
          supplier_type: row.supplier_type || 'outsourcing',
          contact_person: row.contact_person,
          phone: row.phone,
          openingBalance,
          totalIn: Number(row.totalIn || 0),
          totalOut: Number(row.totalOut || 0),
          currentBalance,
          stockInCount: Number(row.stockInCount || 0),
          totalQuantity: Number(row.totalQuantity || 0),
          totalAmount: Number(row.totalAmount || 0),
        }
      })
    }

    const allTime = db.prepare(`
      SELECT
        ${sqlSupplierNetPayableSum()} AS totalIn,
        COALESCE(SUM(amount_out), 0) AS totalOut
      FROM supplier_ledger
      WHERE deleted_at IS NULL AND supplier_name = ?
    `).get(supplierName) as { totalIn: number; totalOut: number }

    const stockStats = db.prepare(`
      SELECT
        COUNT(*) AS stockInCount,
        COALESCE(SUM(quantity), 0) AS totalQuantity,
        COALESCE(SUM(amount), 0) AS totalAmount
      FROM stock_in_ledger
      WHERE deleted_at IS NULL AND supplier_name = ? ${dateWhere.sql}
    `).get(supplierName, ...dateWhere.params) as { stockInCount: number; totalQuantity: number; totalAmount: number }

    const openingBalance = Number(getSupplierProfile(db, supplierName).opening_balance || 0)
    const totalIn = Number(allTime.totalIn || 0)
    const totalOut = Number(allTime.totalOut || 0)
    const currentBalance = Math.round((openingBalance + totalIn - totalOut) * 100) / 100

    return {
      ...getSupplierProfile(db, supplierName),
      supplier_name: supplierName,
      openingBalance,
      totalIn,
      totalOut,
      currentBalance,
      stockInCount: Number(stockStats?.stockInCount || 0),
      totalQuantity: Number(stockStats?.totalQuantity || 0),
      totalAmount: Number(stockStats?.totalAmount || 0),
    }
  })

  ipcMain.handle('supplier:list', (_e, params = {}) => {
    const { supplierName, page = 1, pageSize = 100, keyword = '', entryType = 'all' } = params as any
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const filters = normalizeLedgerFilters(params, 'supplierName')
    const dateWhere = buildDateFilterClause(filters)
    const paymentWhere = sqlSupplierPaymentWhere('supplier_ledger')
    const entryWhere = entryType === 'payment'
      ? `AND ${paymentWhere}`
      : entryType === 'purchase'
        ? `AND NOT ${paymentWhere}`
        : ''
    const rows = db.prepare(`
      SELECT supplier_ledger.*
      FROM supplier_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (description LIKE ? OR note LIKE ? OR date LIKE ?
          OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
        ${dateWhere.sql}
        ${entryWhere}
      ORDER BY supplier_name ASC, ${buildDateOrderBy('supplier_ledger.date')}
      LIMIT ? OFFSET ?
    `).all(supplierName || '', supplierName || '', like, like, like, like, like, like, ...dateWhere.params, pageSize, offset) as any[]
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM supplier_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR supplier_name = ?)
        AND (description LIKE ? OR note LIKE ? OR date LIKE ?
          OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
        ${dateWhere.sql}
        ${entryWhere}
    `).get(supplierName || '', supplierName || '', like, like, like, like, like, like, ...dateWhere.params) as { total: number }
    const enrichedRows = rows.map(row => {
      const enriched = enrichSupplierRow(row)
      if (isSupplierPaymentRecord(enriched) && Number(enriched.ref_ledger_id || 0) > 0) {
        const ref = db.prepare(`
          SELECT product_name, contract_no, date FROM supplier_ledger
          WHERE id = ? AND deleted_at IS NULL
        `).get(Number(enriched.ref_ledger_id)) as { product_name?: string; contract_no?: string; date?: string } | undefined
        if (ref?.product_name) {
          enriched.payment_for = ref.product_name
          enriched.payment_for_contract = ref.contract_no || ''
        }
      }
      return enriched
    })
    return { rows: enrichedRows, total }
  })

  ipcMain.handle('supplier:profile', (_e, supplierName: string) => {
    return getSupplierProfile(getDb(), supplierName || '')
  })

  ipcMain.handle('supplier:return-product-options', (_e, supplierName: string) => {
    return listSupplierReturnProductOptions(getDb(), supplierName || '')
  })

  ipcMain.handle('supplier:material-return-option', (_e, supplierName: string) => {
    const db = getDb()
    const name = String(supplierName || '').trim()
    if (!name) throw new Error('请选择供应商')
    if (!isMaterialSupplierType(getSupplierType(db, name))) {
      throw new Error('只有原材料供应商按公斤退货')
    }
    return getSupplierMaterialReturnOption(db, name)
  })

  ipcMain.handle('supplier:material-return-options', (_e, supplierName: string) => {
    const db = getDb()
    const name = String(supplierName || '').trim()
    if (!name) throw new Error('请选择供应商')
    if (!isMaterialSupplierType(getSupplierType(db, name))) {
      throw new Error('只有原材料供应商按材料退货')
    }
    return listSupplierMaterialReturnOptions(db, name)
  })

  ipcMain.handle('supplier:material-catalog', (_e, supplierName: string) => {
    const db = getDb()
    const name = String(supplierName || '').trim()
    if (!name) throw new Error('请选择供应商')
    return listSupplierMaterialCatalog(db, name)
  })

  ipcMain.handle('supplier:create', (_e, profile: {
    supplier_name: string
    supplier_type?: string
    contact_person?: string
    phone?: string
    address?: string
    opening_balance?: number
    opening_reason?: string
    note?: string
  }) => {
    const name = String(profile?.supplier_name || '').trim()
    if (!name) throw new Error('请填写供应商名称')
    const db = getDb()
    const openingBalance = Number(profile?.opening_balance || 0)
    const openingReason = String(profile?.opening_reason || '').trim()
    if (Math.abs(openingBalance) > 0.005 && !openingReason) {
      throw new Error('请填写期初应付原因')
    }
    if (supplierNameExists(db, name)) {
      throw new Error(`供应商「${name}」已存在`)
    }
    const saved = setSupplierProfile(db, profile)
    if (Math.abs(openingBalance) > 0.005) {
      const row = {
        supplier_name: name,
        date: new Date().toISOString().slice(0, 10),
        description: '期初应付',
        contract_no: '',
        product_name: '期初应付',
        spec: '',
        unit: '',
        quantity: 0,
        unit_price: 0,
        amount_in: 0,
        amount_out: 0,
        balance: 0,
        note: `期初应付 ${openingBalance}；原因：${openingReason}`,
        stock_in_id: null,
        ref_ledger_id: null,
        return_stock_out_id: null,
      }
      const result = db.prepare(`
        INSERT INTO supplier_ledger (
          supplier_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
          amount_in, amount_out, balance, note, stock_in_id, ref_ledger_id, return_stock_out_id
        ) VALUES (
          @supplier_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
          @amount_in, @amount_out, @balance, @note, @stock_in_id, @ref_ledger_id, @return_stock_out_id
        )
      `).run(row)
      const ledgerId = Number(result.lastInsertRowid)
      const newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(ledgerId) as Record<string, any>
      logOperation('supplier_ledger', ledgerId, 'INSERT', null, newRow as object)
      recalculateSupplierBalances(db, name)
    }
    logOperation('supplier_profiles', 0, 'INSERT', null, saved as object)
    return saved
  })

  ipcMain.handle('supplier:set-profile', (_e, profile: {
    supplier_name: string
    supplier_type?: string
    contact_person?: string
    phone?: string
    address?: string
    opening_balance?: number
    opening_reason?: string
    note?: string
  }) => {
    const db = getDb()
    const openingBalance = Number(profile?.opening_balance || 0)
    const openingReason = String(profile?.opening_reason || '').trim()
    if (Math.abs(openingBalance) > 0.005 && !openingReason) {
      throw new Error('请填写期初应付原因')
    }
    const saved = setSupplierProfile(db, profile)
    const currentBalance = recalculateSupplierBalances(db, profile.supplier_name)
    logOperation('supplier_profiles', 0, 'UPDATE', null, saved as object)
    return { ...saved, currentBalance }
  })

  ipcMain.handle('supplier:add', (_e, row) => {
    const db = getDb()
    const supplierName = String(row.supplier_name || '').trim()
    if (!supplierName) throw new Error('请选择供应商')
    const isPayment = isSupplierPaymentRecord(row)
    const isReturn = !isPayment && (
      Number(row.ref_ledger_id || 0) > 0
      || String(row.note || '').includes('退货')
    )

    if (isReturn && isMaterialSupplierType(getSupplierType(db, supplierName))) {
      throw new Error('原材料供应商不支持退货')
    }

    let payload: Record<string, any> = {
      supplier_name: supplierName,
      date: String(row.date || '').trim(),
      description: buildSupplierDescription(row),
      contract_no: String(row.contract_no || '').trim(),
      product_name: String(row.product_name || '').trim(),
      spec: String(row.spec || '').trim(),
      unit: String(row.unit || '').trim(),
      quantity: Number(row.quantity || 0),
      unit_price: Number(row.unit_price || 0),
      amount_in: Number(row.amount_in || 0),
      amount_out: Number(row.amount_out || 0),
      balance: 0,
      note: String(row.note || '').trim(),
      doc_no: String(row.doc_no || '').trim(),
      stock_in_id: null,
      ref_ledger_id: Number(row.ref_ledger_id || 0) || null,
      return_stock_out_id: null,
    }

    if (isReturn) {
      const refId = Number(row.ref_ledger_id || 0)
      if (!refId) throw new Error('请选择要退货的应付台账')
      const ref = resolvePayableReference(db, supplierName, refId)
      payload.ref_ledger_id = refId
      payload.contract_no = payload.contract_no || ref.contract_no || ''
      payload.product_name = payload.product_name || ref.product_name || ''
      payload.spec = payload.spec || ref.spec || ''
      payload.unit = payload.unit || ref.unit || ''
      const qty = Math.abs(Number(payload.quantity || ref.quantity || 0))
      const price = Math.abs(Number(payload.unit_price || ref.unit_price || 0))
      if (qty <= 0 || price <= 0) throw new Error('请填写退货数量与单价')
      payload.quantity = -qty
      payload.unit_price = price
      payload.amount_in = -Math.round(qty * price * 100) / 100
      payload.amount_out = 0
      payload.description = buildSupplierDescription(payload)
      if (!String(payload.note || '').includes('退货')) {
        payload.note = payload.note ? `${payload.note} 退货` : '退货'
      }
      if (!payload.doc_no) payload.doc_no = generateDocNo('GT', 'supplier_ledger', payload.date)
      const linked = listLinkedRows(db, refId)
      const returnErr = validateSupplierReturnAgainstPayments(Number(ref.amount_in || 0), linked, payload.amount_in)
      if (returnErr) throw new Error(returnErr)
    } else if (isPayment) {
      payload.description = '付款'
      payload.product_name = '付款'
      payload.contract_no = ''
      payload.spec = ''
      payload.unit = ''
      payload.quantity = 0
      payload.unit_price = 0
      payload.amount_in = 0
      payload.doc_no = ''
      if (Number(payload.amount_out || 0) <= 0) throw new Error('请填写付款金额')
      const refId = Number(row.ref_ledger_id || 0)
      if (refId > 0) {
        const ref = resolvePayableReference(db, supplierName, refId)
        payload.ref_ledger_id = refId
        if (!String(payload.note || '').trim()) {
          payload.note = `付 ${ref.product_name || '应付'}`.trim()
        }
        const linked = listLinkedRows(db, refId)
        const paymentErr = validateSupplierPaymentAmount(Number(ref.amount_in || 0), linked, Number(payload.amount_out || 0))
        if (paymentErr) throw new Error(paymentErr)
      }
    } else {
      const qty = Number(payload.quantity || 0)
      const price = Number(payload.unit_price || 0)
      if (qty > 0 && price > 0) {
        payload.amount_in = Math.round(qty * price * 100) / 100
      }
      if (Number(payload.amount_in || 0) <= 0) {
        throw new Error('请填写应付金额，或填写数量与单价')
      }
      payload.amount_out = 0
      payload.description = buildSupplierDescription(payload)
      payload.ref_ledger_id = null
    }

    const r = db.prepare(`
      INSERT INTO supplier_ledger (
        supplier_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
        amount_in, amount_out, balance, note, doc_no, stock_in_id, ref_ledger_id, return_stock_out_id
      ) VALUES (
        @supplier_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
        @amount_in, @amount_out, @balance, @note, @doc_no, @stock_in_id, @ref_ledger_id, @return_stock_out_id
      )
    `).run(payload)
    const ledgerId = Number(r.lastInsertRowid)
    recalculateSupplierBalances(db, supplierName)
    let newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(ledgerId) as Record<string, any>
    if (isReturn && !isPayment) {
      applySupplierReturnSideEffects(db, newRow)
      newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(ledgerId) as Record<string, any>
    }
    logOperation('supplier_ledger', ledgerId, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('supplier:return-products', (_e, payload: { supplier_name?: string; date?: string; note?: string; items?: any[] }) => {
    const db = getDb()
    const supplierName = String(payload?.supplier_name || '').trim()
    if (!supplierName) throw new Error('请选择供应商')
    if (isMaterialSupplierType(getSupplierType(db, supplierName))) {
      throw new Error('原材料供应商请按公斤登记退货')
    }
    const date = String(payload?.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请填写退货日期')
    const options = listSupplierReturnProductOptions(db, supplierName)
    const optionMap = new Map(options.map(item => [`${item.product_name}\u0000${item.spec || ''}\u0000${item.unit || ''}`, item]))
    const items = (payload?.items || []).filter(item => Number(item.quantity || 0) > 0)
    if (!items.length) throw new Error('请选择退货产品并填写数量')
    const inserted: Record<string, any>[] = []
    const docNo = generateDocNo('GT', 'supplier_ledger', date)

    const tx = db.transaction(() => {
      for (const item of items) {
        const productName = String(item.product_name || '').trim()
        const spec = String(item.spec || '').trim()
        const unit = String(item.unit || '').trim()
        const key = `${productName}\u0000${spec}\u0000${unit}`
        const option = optionMap.get(key)
        if (!option) throw new Error(`产品「${productName} ${spec}」不可退或库存不足`)
        const qty = Math.abs(Number(item.quantity || 0))
        const maxQty = Number(option.max_qty || 0)
        if (qty <= 0) throw new Error(`请填写「${productName}」退货数量`)
        if (qty - maxQty > 0.005) throw new Error(`「${productName}」最多可退 ${maxQty}`)
        const price = Math.abs(Number(item.unit_price || option.unit_price || 0))
        if (price <= 0) throw new Error(`请填写「${productName}」单价`)
        const row = {
          supplier_name: supplierName,
          date,
          description: '',
          contract_no: '',
          product_name: productName,
          spec,
          unit,
          quantity: -qty,
          unit_price: price,
          amount_in: -Math.round(qty * price * 100) / 100,
          amount_out: 0,
          balance: 0,
          note: String(item.note || payload.note || '退货').includes('退货')
            ? String(item.note || payload.note || '退货').trim()
            : `${String(item.note || payload.note || '').trim()} 退货`.trim(),
          doc_no: docNo,
          stock_in_id: null,
          ref_ledger_id: null,
          return_stock_out_id: null,
        }
        row.description = buildSupplierDescription(row)
        const result = db.prepare(`
          INSERT INTO supplier_ledger (
            supplier_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
            amount_in, amount_out, balance, note, doc_no, stock_in_id, ref_ledger_id, return_stock_out_id
          ) VALUES (
            @supplier_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
            @amount_in, @amount_out, @balance, @note, @doc_no, @stock_in_id, @ref_ledger_id, @return_stock_out_id
          )
        `).run(row)
        const id = Number(result.lastInsertRowid)
        const newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
        recalcInventoryForRows(newRow)
        logOperation('supplier_ledger', id, 'INSERT', null, newRow as object)
        inserted.push(newRow)
      }
      recalculateSupplierBalances(db, supplierName)
    })
    tx()
    return { ok: true, count: inserted.length, rows: inserted }
  })

  ipcMain.handle('supplier:return-material', (_e, payload: { supplier_name?: string; date?: string; quantity?: number; unit_price?: number; note?: string }) => {
    const db = getDb()
    const supplierName = String(payload?.supplier_name || '').trim()
    if (!supplierName) throw new Error('请选择供应商')
    if (!isMaterialSupplierType(getSupplierType(db, supplierName))) {
      throw new Error('只有原材料供应商按公斤退货')
    }
    const date = String(payload?.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请填写退货日期')
    const qty = Math.abs(Number(payload?.quantity || 0))
    const price = Math.abs(Number(payload?.unit_price || 0))
    if (qty <= 0) throw new Error('请填写退货公斤数')
    if (price <= 0) throw new Error('请填写材料单价')
    const maxQty = getSupplierMaterialReturnMax(db, supplierName)
    if (qty - maxQty > 0.005) throw new Error(`最多可退 ${maxQty} 公斤`)
    const noteText = String(payload?.note || MATERIAL_RETURN_PRODUCT_NAME).includes(MATERIAL_RETURN_PRODUCT_NAME)
      ? String(payload?.note || MATERIAL_RETURN_PRODUCT_NAME).trim()
      : `${String(payload?.note || '').trim()} ${MATERIAL_RETURN_PRODUCT_NAME}`.trim()
    const row = {
      supplier_name: supplierName,
      date,
      description: '',
      contract_no: '',
      product_name: MATERIAL_RETURN_PRODUCT_NAME,
      spec: '',
      unit: '公斤',
      quantity: -qty,
      unit_price: price,
      amount_in: -Math.round(qty * price * 100) / 100,
      amount_out: 0,
      balance: 0,
      note: noteText,
      doc_no: generateDocNo('GT', 'supplier_ledger', date),
      stock_in_id: null,
      ref_ledger_id: null,
      return_stock_out_id: null,
    }
    row.description = buildSupplierDescription(row)
    const result = db.prepare(`
      INSERT INTO supplier_ledger (
        supplier_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
        amount_in, amount_out, balance, note, doc_no, stock_in_id, ref_ledger_id, return_stock_out_id
      ) VALUES (
        @supplier_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
        @amount_in, @amount_out, @balance, @note, @doc_no, @stock_in_id, @ref_ledger_id, @return_stock_out_id
      )
    `).run(row)
    const id = Number(result.lastInsertRowid)
    recalculateSupplierBalances(db, supplierName)
    const newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    logOperation('supplier_ledger', id, 'INSERT', null, newRow as object)
    return { ok: true, row: newRow }
  })

  ipcMain.handle('supplier:return-materials', (_e, payload: { supplier_name?: string; date?: string; note?: string; items?: any[] }) => {
    const db = getDb()
    const supplierName = String(payload?.supplier_name || '').trim()
    if (!supplierName) throw new Error('请选择供应商')
    if (!isMaterialSupplierType(getSupplierType(db, supplierName))) {
      throw new Error('只有原材料供应商按材料退货')
    }
    const date = String(payload?.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请填写退货日期')
    const options = listSupplierMaterialReturnOptions(db, supplierName)
    const optionMap = new Map(options.map(item => [`${item.product_name}\u0000${item.spec || ''}\u0000${item.unit || ''}`, item]))
    const items = (payload?.items || []).filter(item => Number(item.quantity || 0) > 0)
    if (!items.length) throw new Error('请选择退货材料并填写数量')
    const inserted: Record<string, any>[] = []
    const tx = db.transaction(() => {
      for (const item of items) {
        const materialName = String(item.product_name || '').trim()
        const spec = String(item.spec || '').trim()
        const unit = String(item.unit || '公斤').trim() || '公斤'
        const key = `${materialName}\u0000${spec}\u0000${unit}`
        const option = optionMap.get(key)
        if (!option) throw new Error(`材料「${materialName} ${spec}」不可退或库存不足`)
        const qty = Math.abs(Number(item.quantity || 0))
        const maxQty = Number(option.max_qty || 0)
        if (qty <= 0) throw new Error(`请填写「${materialName}」退货数量`)
        if (qty - maxQty > 0.005) throw new Error(`「${materialName}」最多可退 ${maxQty}${unit}`)
        const price = Math.abs(Number(item.unit_price || option.unit_price || 0))
        if (price <= 0) throw new Error(`请填写「${materialName}」单价`)
        const noteText = String(item.note || payload.note || MATERIAL_RETURN_PRODUCT_NAME).includes(MATERIAL_RETURN_PRODUCT_NAME)
          ? String(item.note || payload.note || MATERIAL_RETURN_PRODUCT_NAME).trim()
          : `${String(item.note || payload.note || '').trim()} ${MATERIAL_RETURN_PRODUCT_NAME}`.trim()
        const row = {
          supplier_name: supplierName,
          date,
          description: '',
          contract_no: '',
          product_name: materialName,
          spec,
          unit,
          quantity: -qty,
          unit_price: price,
          amount_in: -Math.round(qty * price * 100) / 100,
          amount_out: 0,
          balance: 0,
          note: noteText,
          stock_in_id: null,
          ref_ledger_id: null,
          return_stock_out_id: null,
        }
        row.description = buildSupplierDescription(row)
        const result = db.prepare(`
          INSERT INTO supplier_ledger (
            supplier_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
            amount_in, amount_out, balance, note, stock_in_id, ref_ledger_id, return_stock_out_id
          ) VALUES (
            @supplier_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
            @amount_in, @amount_out, @balance, @note, @stock_in_id, @ref_ledger_id, @return_stock_out_id
          )
        `).run(row)
        const id = Number(result.lastInsertRowid)
        const newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
        logOperation('supplier_ledger', id, 'INSERT', null, newRow as object)
        inserted.push(newRow)
      }
      recalculateSupplierBalances(db, supplierName)
    })
    tx()
    return { ok: true, count: inserted.length, rows: inserted }
  })

  ipcMain.handle('supplier:scrap-recover', (_e, payload: {
    supplier_name?: string
    date?: string
    settlement?: string
    scrap_name?: string
    quantity?: number
    unit_price?: number
    note?: string
    exchange_items?: Array<{
      material_name?: string
      material_spec?: string
      material_unit?: string
      material_quantity?: number
      material_unit_price?: number
    }>
  }) => {
    const db = getDb()
    const supplierName = String(payload?.supplier_name || '').trim()
    if (!supplierName) throw new Error('请选择供应商')
    if (!isMaterialSupplierType(getSupplierType(db, supplierName))) {
      throw new Error('只有原材料供应商可登记废料回收')
    }
    const date = String(payload?.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请填写回收日期')
    const mode = normalizeScrapSettlementMode(payload?.settlement)
    const scrapName = String(payload?.scrap_name || '').trim() || '废料'
    const qty = Math.abs(Number(payload?.quantity || 0))
    const price = Math.abs(Number(payload?.unit_price || 0))
    if (qty <= 0) throw new Error('请填写废料公斤数')
    if (mode !== 'exchange' && price <= 0) throw new Error('请填写废料回收单价')
    const scrapAmount = mode === 'exchange' ? 0 : Math.round(qty * price * 100) / 100
    const userNote = String(payload?.note || '').trim()
    const exchangeItems = (payload?.exchange_items || [])
      .map(item => ({
        material_name: String(item?.material_name || '').trim(),
        material_spec: String(item?.material_spec || '').trim(),
        material_unit: String(item?.material_unit || '公斤').trim() || '公斤',
        material_quantity: Math.abs(Number(item?.material_quantity || 0)),
        material_unit_price: Math.abs(Number(item?.material_unit_price || 0)),
      }))
      .filter(item => item.material_quantity > 0)

    if (mode === 'exchange') {
      if (!exchangeItems.length) throw new Error('换新料请填写置换的材料')
      for (const item of exchangeItems) {
        if (!item.material_name) throw new Error('请填写置换材料名称')
      }
    }

    const docNo = generateDocNo('FL', 'supplier_ledger', date)
    let cashId = 0
    const stockInIds: number[] = []

    const result = db.transaction(() => {
      if (mode === 'cash') {
        const cashResult = db.prepare(`
          INSERT INTO cash_ledger (date, income, description, expense, operator, balance, note)
          VALUES (?, ?, ?, 0, '', 0, ?)
        `).run(
          date,
          scrapAmount,
          `废料回收 ${supplierName} ${scrapName}`,
          `${SCRAP_NOTE_MARKER} ${supplierName} ${docNo}`.trim(),
        )
        cashId = Number(cashResult.lastInsertRowid)
        recalculateCashBalances(db)
        const cashRow = db.prepare('SELECT * FROM cash_ledger WHERE id = ?').get(cashId) as Record<string, any>
        logOperation('cash_ledger', cashId, 'INSERT', null, cashRow as object)
      }

      if (mode === 'exchange') {
        for (const item of exchangeItems) {
          // 置换新料：只入库数量，金额为 0，不生成应付（换料免付）
          const stockInResult = db.prepare(`
            INSERT INTO stock_in_ledger (
              doc_no, supplier_name, category, date, contract_no, product_name, spec, unit,
              quantity, unit_price, amount, material_name, material_spec, material_unit,
              material_quantity, material_unit_price, material_used_quantity,
              tax_rate, tax_amount, invoice_amount, note, counts_inventory
            ) VALUES (
              ?, ?, '', ?, '', '', '', '',
              0, 0, 0, ?, ?, ?,
              ?, 0, 0,
              0, 0, 0, ?, 0
            )
          `).run(
            generateDocNo('RK', 'stock_in_ledger', date),
            supplierName,
            date,
            item.material_name,
            item.material_spec,
            item.material_unit,
            item.material_quantity,
            `废料换料（免付） · ${docNo}`,
          )
          const stockInId = Number(stockInResult.lastInsertRowid)
          const stockInRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ?').get(stockInId) as Record<string, any>
          // amount=0 → 不会生成供应商应付
          createPayableFromStockIn(db, stockInRow)
          logOperation('stock_in_ledger', stockInId, 'INSERT', null, stockInRow as object)
          stockInIds.push(stockInId)
        }
      }

      const linkSuffix = mode === 'cash' && cashId
        ? `cash:${cashId}`
        : mode === 'exchange' && stockInIds.length
          ? `stock_in:${stockInIds.join(',')}`
          : ''
      const noteText = buildScrapNote(mode, userNote, linkSuffix)
      // 换新料：以废换料，不冲减应付；抵应付/兑现才按回收价记账
      const amountIn = mode === 'cash' || mode === 'exchange' ? 0 : -scrapAmount
      const row = {
        supplier_name: supplierName,
        date,
        description: '',
        contract_no: '',
        product_name: scrapName,
        spec: '',
        unit: '公斤',
        quantity: -qty,
        unit_price: mode === 'exchange' ? 0 : price,
        amount_in: amountIn,
        amount_out: 0,
        balance: 0,
        note: noteText,
        doc_no: docNo,
        stock_in_id: null,
        ref_ledger_id: null,
        return_stock_out_id: null,
      }
      row.description = buildSupplierDescription(row)
      const insertResult = db.prepare(`
        INSERT INTO supplier_ledger (
          supplier_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
          amount_in, amount_out, balance, note, doc_no, stock_in_id, ref_ledger_id, return_stock_out_id
        ) VALUES (
          @supplier_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
          @amount_in, @amount_out, @balance, @note, @doc_no, @stock_in_id, @ref_ledger_id, @return_stock_out_id
        )
      `).run(row)
      const id = Number(insertResult.lastInsertRowid)
      recalculateSupplierBalances(db, supplierName)
      const newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
      logOperation('supplier_ledger', id, 'INSERT', null, newRow as object)
      return newRow
    })()

    return {
      ok: true,
      row: result,
      settlement: mode,
      cash_id: cashId || null,
      stock_in_ids: stockInIds,
    }
  })

  ipcMain.handle('supplier:update', (_e, { id, ...row }) => {
    const db = getDb()
    const old = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    if (!old) throw new Error('记录不存在')
    if (isSupplierScrapRecord(old)) {
      throw new Error('废料回收请删除后重新登记')
    }
    if (Number(old.stock_in_id || 0) > 0) {
      throw new Error('入库关联的应付请在「产品入库」中修改')
    }

    const isPayment = isSupplierPaymentRecord({ ...old, ...row })
    const isReturn = !isPayment && (
      isSupplierReturnRecord({ ...old, ...row })
      || Number(row.ref_ledger_id || old.ref_ledger_id || 0) > 0 && String(row.note || old.note || '').includes('退货')
    )

    const payload = {
      id,
      supplier_name: String(row.supplier_name || old.supplier_name || '').trim(),
      date: String(row.date || old.date || '').trim(),
      description: buildSupplierDescription(row),
      contract_no: String(row.contract_no || '').trim(),
      product_name: String(row.product_name || '').trim(),
      spec: String(row.spec || '').trim(),
      unit: String(row.unit || '').trim(),
      quantity: Number(row.quantity || 0),
      unit_price: Number(row.unit_price || 0),
      amount_in: Number(row.amount_in || 0),
      amount_out: Number(row.amount_out || 0),
      note: String(row.note || '').trim(),
      doc_no: String(old.doc_no || row.doc_no || '').trim(),
      stock_in_id: old.stock_in_id ?? null,
      ref_ledger_id: Number(row.ref_ledger_id ?? old.ref_ledger_id ?? 0) || null,
      return_stock_out_id: Number(old.return_stock_out_id || 0) || null,
    }

    if (isReturn && Number(payload.ref_ledger_id || 0) > 0 && isMaterialSupplierType(getSupplierType(db, payload.supplier_name))) {
      throw new Error('原材料供应商不支持退货')
    }

    if (isReturn) {
      const refId = Number(payload.ref_ledger_id || 0)
      const qty = Math.abs(Number(payload.quantity || 0))
      const price = Math.abs(Number(payload.unit_price || 0))
      if (qty <= 0 || price <= 0) throw new Error('请填写退货数量与单价')
      if (refId) {
        const ref = resolvePayableReference(db, payload.supplier_name, refId)
        const linked = listLinkedRows(db, refId)
        const returnErr = validateSupplierReturnAgainstPayments(Number(ref.amount_in || 0), linked, -Math.round(qty * price * 100) / 100, id)
        if (returnErr) throw new Error(returnErr)
      } else if (isSupplierMaterialReturnRow({ ...old, ...payload }) || isMaterialSupplierType(getSupplierType(db, payload.supplier_name))) {
        const maxQty = getSupplierMaterialReturnMax(db, payload.supplier_name, id)
        if (qty - maxQty > 0.005) throw new Error(`最多可退 ${maxQty} 公斤`)
        payload.product_name = MATERIAL_RETURN_PRODUCT_NAME
        payload.spec = ''
        payload.unit = '公斤'
      } else {
        const productName = String(payload.product_name || '').trim()
        const spec = String(payload.spec || '').trim()
        const unit = String(payload.unit || '').trim()
        if (!productName) throw new Error('请选择退货产品')
        const maxQty = getSupplierProductReturnMax(db, payload.supplier_name, productName, spec, unit, id)
        if (qty - maxQty > 0.005) throw new Error(`「${productName}」最多可退 ${maxQty}`)
      }
      payload.quantity = -qty
      payload.unit_price = price
      payload.amount_in = -Math.round(qty * price * 100) / 100
      payload.amount_out = 0
      payload.description = buildSupplierDescription(payload)
      if (!String(payload.note || '').includes('退货')) {
        payload.note = payload.note ? `${payload.note} 退货` : '退货'
      }
      if (payload.product_name === MATERIAL_RETURN_PRODUCT_NAME && !String(payload.note || '').includes(MATERIAL_RETURN_PRODUCT_NAME)) {
        payload.note = payload.note ? `${payload.note} ${MATERIAL_RETURN_PRODUCT_NAME}` : MATERIAL_RETURN_PRODUCT_NAME
      }
      if (!payload.doc_no) payload.doc_no = generateDocNo('GT', 'supplier_ledger', payload.date)
    } else if (isPayment) {
      payload.description = '付款'
      payload.product_name = '付款'
      payload.contract_no = ''
      payload.spec = ''
      payload.unit = ''
      payload.quantity = 0
      payload.unit_price = 0
      payload.amount_in = 0
      payload.doc_no = ''
      const refId = Number(payload.ref_ledger_id || 0)
      if (refId > 0) {
        const ref = resolvePayableReference(db, payload.supplier_name, refId)
        const linked = listLinkedRows(db, refId)
        const paymentErr = validateSupplierPaymentAmount(Number(ref.amount_in || 0), linked, Number(payload.amount_out || 0), id)
        if (paymentErr) throw new Error(paymentErr)
      }
    } else {
      const qty = Number(payload.quantity || 0)
      const price = Number(payload.unit_price || 0)
      if (qty > 0 && price > 0) {
        payload.amount_in = Math.round(qty * price * 100) / 100
      }
      payload.amount_out = 0
      payload.description = buildSupplierDescription(payload)
      payload.ref_ledger_id = null
      payload.doc_no = ''
    }

    db.prepare(`
      UPDATE supplier_ledger SET
        supplier_name=@supplier_name, date=@date, description=@description,
        contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
        quantity=@quantity, unit_price=@unit_price, amount_in=@amount_in, amount_out=@amount_out,
        note=@note, doc_no=@doc_no, ref_ledger_id=@ref_ledger_id, updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run(payload)
    if (old.supplier_name !== payload.supplier_name) {
      recalculateSupplierBalances(db, old.supplier_name)
    }
    recalculateSupplierBalances(db, payload.supplier_name)
    let newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    if (isReturn && !isSupplierMaterialReturnRow(newRow)) {
      const previousProduct = isSupplierReturnRecord(old)
        ? {
          product_name: String(old.product_name || '').trim(),
          spec: String(old.spec || '').trim(),
          unit: String(old.unit || '').trim(),
        }
        : undefined
      applySupplierReturnSideEffects(db, newRow, {
        previousReturnStockOutId: Number(old.return_stock_out_id || 0),
        previousProduct,
      })
      newRow = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    }
    logOperation('supplier_ledger', id, 'UPDATE', old as object, newRow as object)
    return newRow
  })

  ipcMain.handle('supplier:delete', (_e, id: number) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(id) as Record<string, any>
    if (!row) throw new Error('记录不存在')

    const linkedToPayable = isSupplierPayableRecord(row)
      ? db.prepare(`SELECT * FROM supplier_ledger WHERE deleted_at IS NULL AND ref_ledger_id = ?`).all(id)
      : Number(row.ref_ledger_id || 0) > 0
        ? db.prepare(`SELECT * FROM supplier_ledger WHERE deleted_at IS NULL AND ref_ledger_id = ?`).all(Number(row.ref_ledger_id))
        : []
    const deleteBlock = getSupplierLedgerDeleteBlockReason(row, linkedToPayable as Array<Record<string, any>>)
    if (deleteBlock) throw new Error(deleteBlock)

    if (Number(row.stock_in_id || 0) > 0) {
      throw new Error('入库关联的应付请在「产品入库」中删除')
    }
    if (Number(row.return_stock_out_id || 0) > 0) {
      cleanupSupplierReturnStockOut(db, row)
    }
    const wasReturn = isSupplierReturnRecord(row)
    const wasMaterialReturn = isSupplierMaterialReturnRow(row)
    const wasScrap = isSupplierScrapRecord(row)

    db.transaction(() => {
      if (wasScrap) {
        const cashId = parseScrapLinkedCashId(String(row.note || ''))
        if (cashId > 0) {
          const cashRow = db.prepare('SELECT * FROM cash_ledger WHERE id = ? AND deleted_at IS NULL').get(cashId) as Record<string, any> | undefined
          if (cashRow) {
            softDelete('cash_ledger', cashId)
            recalculateCashBalances(db)
          }
        }
        for (const stockInId of parseScrapLinkedStockInIds(String(row.note || ''))) {
          const stockInRow = db.prepare('SELECT * FROM stock_in_ledger WHERE id = ? AND deleted_at IS NULL').get(stockInId) as Record<string, any> | undefined
          if (!stockInRow) continue
          deletePayableForStockIn(db, stockInRow)
          softDelete('stock_in_ledger', stockInId)
        }
      }
      softDelete('supplier_ledger', id)
      recalculateSupplierBalances(db, row.supplier_name)
    })()

    if (wasReturn && !wasMaterialReturn) recalcInventoryForSupplierReturnRow(db, row)
    return { ok: true }
  })

  ipcMain.handle('supplier:remove-preview', (_e, supplierName: string) => {
    return getSupplierRemovePreview(getDb(), supplierName || '')
  })

  ipcMain.handle('supplier:remove', (_e, supplierName: string) => {
    const db = getDb()
    const name = String(supplierName || '').trim()
    if (!name) throw new Error('请指定供应商名称')
    const preview = getSupplierRemovePreview(db, name)
    if (!preview.hasProfile && preview.ledgerCount === 0) {
      throw new Error(`供应商「${name}」不存在或已删除`)
    }
    if (preview.stockInCount > 0) {
      throw new Error(`该供应商在产品入库中还有 ${preview.stockInCount} 条记录，无法删除。请先在「产品入库」中处理相关记录。`)
    }

    const ledgerRows = db.prepare(`
      SELECT id FROM supplier_ledger
      WHERE deleted_at IS NULL AND supplier_name = ?
    `).all(name) as Array<{ id: number }>
    for (const row of ledgerRows) {
      softDelete('supplier_ledger', row.id)
    }

    if (preview.hasProfile) {
      const profile = getSupplierProfile(db, name)
      db.prepare(`DELETE FROM supplier_profiles WHERE supplier_name = ?`).run(name)
      logOperation('supplier_profiles', 0, 'DELETE', profile as object, null)
    }
    return { ok: true, ledgerCount: ledgerRows.length }
  })

  ipcMain.handle('supplier:sync-from-ledger', () => {
    const added = syncSupplierProfilesFromLedger(getDb())
    return { ok: true, added }
  })

  ipcMain.handle('supplier:backfill-from-stock-in', (_e, supplierName = '') => {
    const db = getDb()
    if (supplierName) {
      const rows = db.prepare(`
        SELECT * FROM stock_in_ledger
        WHERE deleted_at IS NULL AND supplier_name = ? AND COALESCE(ledger_id, 0) = 0
      `).all(supplierName) as Array<Record<string, any>>
      let linked = 0
      for (const row of rows) {
        if (!shouldLinkSupplierPayable(row)) continue
        createPayableFromStockIn(db, row)
        linked++
      }
      return { ok: true, linked }
    }
    const linked = backfillSupplierPayablesFromStockIn(db)
    return { ok: true, linked }
  })
}
