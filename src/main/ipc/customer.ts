import { dialog, ipcMain } from 'electron'
import { getDataDir, getDb } from '../db'
import { buildCustomerDescription, enrichCustomerRow, sqlCustomerPaymentWhere } from '../../common/customer-ledger'
import {
  customerNameExists,
  getCustomerProfile,
  listAllCustomerNames,
  recalculateCustomerBalances,
  setCustomerProfile,
} from './customer-profile'
import { issueLabel as getCustomerIssueLabel } from '../../common/customer-anomaly'
import { repairCustomerAnomalies, scanCustomerAnomalies } from './customer-anomaly'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'

export function registerCustomerHandlers(): void {
  // 所有客户名
  ipcMain.handle('customer:names', () => {
    return listAllCustomerNames(getDb()).map(customer_name => ({ customer_name }))
  })

  ipcMain.handle('customer:create', (_e, profile: { customer_name: string; opening_balance?: number; note?: string }) => {
    const name = String(profile?.customer_name || '').trim()
    if (!name) throw new Error('请填写客户名称')
    const db = getDb()
    if (customerNameExists(db, name)) {
      throw new Error(`客户「${name}」已存在，请直接打开台账`)
    }
    const saved = setCustomerProfile(db, {
      customer_name: name,
      opening_balance: Number(profile.opening_balance || 0),
      note: String(profile.note || ''),
    })
    logOperation('customer_profiles', 0, 'INSERT', null, saved as object)
    return saved
  })

  ipcMain.handle('customer:list', (_e, params = {}) => {
    const { customerName, page = 1, pageSize = 100, keyword = '', entryType = 'all' } = params as any
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const filters = normalizeLedgerFilters(params, 'customerName')
    const dateWhere = buildDateFilterClause(filters)
    const paymentWhere = sqlCustomerPaymentWhere('customer_ledger')
    const entryWhere = entryType === 'payment'
      ? `AND ${paymentWhere}`
      : entryType === 'sale'
        ? `AND NOT ${paymentWhere}`
        : ''
    const rows = db.prepare(`
      SELECT customer_ledger.*,
        (SELECT COUNT(*) FROM attachments
          WHERE related_table = 'customer_ledger'
            AND related_id = customer_ledger.id) AS attachment_count,
        (SELECT file_path FROM attachments
          WHERE related_table = 'customer_ledger'
            AND related_id = customer_ledger.id
          ORDER BY id ASC LIMIT 1) AS attachment_thumb_path
      FROM customer_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (description LIKE ? OR note LIKE ? OR date LIKE ?
          OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
        ${dateWhere.sql}
        ${entryWhere}
      ORDER BY customer_name ASC, ${buildDateOrderBy('customer_ledger.date')}
      LIMIT ? OFFSET ?
    `).all(customerName || '', customerName || '', like, like, like, like, like, like, ...dateWhere.params, pageSize, offset) as any[]
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM customer_ledger
      WHERE deleted_at IS NULL
        AND (? = '' OR customer_name = ?)
        AND (description LIKE ? OR note LIKE ? OR date LIKE ?
          OR contract_no LIKE ? OR product_name LIKE ? OR spec LIKE ?)
        ${dateWhere.sql}
        ${entryWhere}
    `).get(customerName || '', customerName || '', like, like, like, like, like, like, ...dateWhere.params) as { total: number }
    return { rows: rows.map(row => ({ ...enrichCustomerRow(row), attachment_thumb: imageDataUrl(row.attachment_thumb_path) })), total }
  })

  ipcMain.handle('customer:payment-audit', (_e, customerName = '') => {
    const db = getDb()
    const paymentWhere = sqlCustomerPaymentWhere()
    const nameFilter = customerName ? 'AND customer_name = ?' : ''
    const params = customerName ? [customerName] : []
    const row = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN TRIM(COALESCE(date, '')) = '' THEN 1 ELSE 0 END) AS missingDate,
        SUM(CASE WHEN COALESCE(amount_out, 0) <= 0 THEN 1 ELSE 0 END) AS missingAmount
      FROM customer_ledger
      WHERE deleted_at IS NULL ${nameFilter} AND ${paymentWhere}
    `).get(...params) as { total: number; missingDate: number; missingAmount: number }

    const anomalies = scanCustomerAnomalies(db, customerName || '')
      .filter(item => item.issue.startsWith('payment_') || item.issue === 'balance_mismatch')

    return {
      total: Number(row?.total || 0),
      missingDate: Number(row?.missingDate || 0),
      missingAmount: Number(row?.missingAmount || 0),
      anomalyCount: anomalies.length,
      autoFixableCount: anomalies.filter(item => item.autoFixable).length,
    }
  })

  ipcMain.handle('customer:summary', (_e, params: any = {}) => {
    const filters = normalizeLedgerFilters(params, 'customerName')
    const customerName = filters.customerName || ''
    const dateWhere = buildDateFilterClause(filters)
    const db = getDb()

    if (!customerName) {
      const rows = db.prepare(`
        WITH names AS (
          SELECT customer_name FROM customer_profiles
          UNION
          SELECT DISTINCT customer_name FROM customer_ledger WHERE deleted_at IS NULL
        ),
        totals AS (
          SELECT customer_name,
            COALESCE(SUM(amount_in), 0) AS totalIn,
            COALESCE(SUM(amount_out), 0) AS totalOut
          FROM customer_ledger
          WHERE deleted_at IS NULL ${dateWhere.sql}
          GROUP BY customer_name
        )
        SELECT n.customer_name,
          COALESCE(t.totalIn, 0) AS totalIn,
          COALESCE(t.totalOut, 0) AS totalOut
        FROM names n
        LEFT JOIN totals t ON t.customer_name = n.customer_name
        ORDER BY n.customer_name
      `).all(...dateWhere.params) as Array<{ customer_name: string; totalIn: number; totalOut: number }>

      return rows.map((row) => {
        const openingBalance = Number(getCustomerProfile(db, row.customer_name).opening_balance || 0)
        const currentBalance = Math.round((openingBalance + Number(row.totalIn || 0) - Number(row.totalOut || 0)) * 100) / 100
        return {
          customer_name: row.customer_name,
          openingBalance,
          totalIn: Number(row.totalIn || 0),
          totalOut: Number(row.totalOut || 0),
          currentBalance,
        }
      })
    }

    const allTime = db.prepare(`
      SELECT
        COALESCE(SUM(amount_in), 0) AS totalIn,
        COALESCE(SUM(amount_out), 0) AS totalOut
      FROM customer_ledger
      WHERE deleted_at IS NULL AND customer_name = ?
    `).get(customerName) as { totalIn: number; totalOut: number }

    const openingBalance = Number(getCustomerProfile(db, customerName).opening_balance || 0)
    const totalIn = Number(allTime.totalIn || 0)
    const totalOut = Number(allTime.totalOut || 0)
    const currentBalance = Math.round((openingBalance + totalIn - totalOut) * 100) / 100

    return {
      customer_name: customerName,
      openingBalance,
      totalIn,
      totalOut,
      currentBalance,
    }
  })

  ipcMain.handle('customer:profile', (_e, customerName: string) => {
    return getCustomerProfile(getDb(), customerName || '')
  })

  ipcMain.handle('customer:set-profile', (_e, profile: { customer_name: string; opening_balance?: number; note?: string }) => {
    const db = getDb()
    const saved = setCustomerProfile(db, {
      customer_name: profile.customer_name,
      opening_balance: Number(profile.opening_balance || 0),
      note: String(profile.note || ''),
    })
    const currentBalance = recalculateCustomerBalances(db, profile.customer_name)
    return { ...saved, currentBalance }
  })

  ipcMain.handle('customer:anomalies', (_e, customerName = '') => {
    const items = scanCustomerAnomalies(getDb(), customerName || '')
    return items.map(item => ({ ...item, issueLabel: getCustomerIssueLabel(item.issue) }))
  })

  ipcMain.handle('customer:repair', (_e, customerName = '') => {
    return repairCustomerAnomalies(getDb(), customerName || '')
  })

  ipcMain.handle('customer:add', (_e, row) => {
    const db = getDb()
    const payload = {
      customer_name: String(row.customer_name || ''),
      date: String(row.date || ''),
      description: buildCustomerDescription(row),
      contract_no: String(row.contract_no || ''),
      product_name: String(row.product_name || ''),
      spec: String(row.spec || ''),
      unit: String(row.unit || ''),
      quantity: Number(row.quantity || 0),
      unit_price: Number(row.unit_price || 0),
      amount_in: Number(row.amount_in || 0),
      amount_out: Number(row.amount_out || 0),
      balance: Number(row.balance || 0),
      note: String(row.note || ''),
      month_label: String(row.month_label || ''),
    }
    const r = db.prepare(`
      INSERT INTO customer_ledger (
        customer_name, date, description, contract_no, product_name, spec, unit, quantity, unit_price,
        amount_in, amount_out, balance, note, month_label
      )
      VALUES (
        @customer_name, @date, @description, @contract_no, @product_name, @spec, @unit, @quantity, @unit_price,
        @amount_in, @amount_out, @balance, @note, @month_label
      )
    `).run(payload)
    recalculateCustomerBalances(db, payload.customer_name)
    const newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(r.lastInsertRowid)
    logOperation('customer_ledger', r.lastInsertRowid as number, 'INSERT', null, newRow as object)
    return newRow
  })

  ipcMain.handle('customer:update', (_e, { id, ...row }) => {
    const db = getDb()
    const old = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id)
    const payload = { ...row, id, description: buildCustomerDescription(row) }
    db.prepare(`
      UPDATE customer_ledger SET customer_name=@customer_name, date=@date,
        description=@description, contract_no=@contract_no, product_name=@product_name, spec=@spec, unit=@unit,
        quantity=@quantity, unit_price=@unit_price,
        amount_in=@amount_in, amount_out=@amount_out,
        balance=@balance, note=@note, month_label=@month_label,
        updated_at=datetime('now','localtime') WHERE id=@id
    `).run(payload)
    recalculateCustomerBalances(db, payload.customer_name)
    const newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id)
    logOperation('customer_ledger', id, 'UPDATE', old as object, newRow as object)
    return newRow
  })

  ipcMain.handle('customer:delete', (_e, id) => {
    const db = getDb()
    const row = db.prepare('SELECT customer_name FROM customer_ledger WHERE id = ?').get(id) as { customer_name?: string } | undefined
    softDelete('customer_ledger', id)
    if (row?.customer_name) recalculateCustomerBalances(db, row.customer_name)
    return { ok: true }
  })
  ipcMain.handle('customer:trash', () => {
    return getDb().prepare(`SELECT * FROM customer_ledger WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
  })
  ipcMain.handle('customer:restore', (_e, id) => { restore('customer_ledger', id); return { ok: true } })

  ipcMain.handle('customer:attachments', (_e, id: number) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM attachments
      WHERE related_table = 'customer_ledger' AND related_id = ?
      ORDER BY id ASC
    `).all(id) as any[]

    return rows
      .filter(row => fs.existsSync(row.file_path))
      .map(row => {
        const ext = path.extname(row.file_path).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp'
        const data = fs.readFileSync(row.file_path).toString('base64')
        return { id: row.id, fileName: row.file_name, dataUrl: `data:${mime};base64,${data}` }
      })
  })

  ipcMain.handle('customer:pick-attachments', async () => {
    const filePaths = await pickImageFiles()
    return filePaths.map(filePath => ({
      filePath,
      fileName: path.basename(filePath),
      dataUrl: imageDataUrl(filePath)
    }))
  })

  ipcMain.handle('customer:add-attachment', async (_e, id: number, filePaths?: string[]) => {
    const paths = filePaths?.length ? filePaths : await pickImageFiles()
    if (!paths.length) return { ok: false, canceled: true }
    const db = getDb()
    const outputDir = path.join(getDataDir(), 'attachments', 'customer')
    fs.mkdirSync(outputDir, { recursive: true })
    const insert = db.prepare(`
      INSERT INTO attachments (related_table, related_id, file_path, file_name)
      VALUES (?, ?, ?, ?)
    `)
    let count = 0

    for (const sourcePath of paths) {
      if (!fs.existsSync(sourcePath)) continue
      const fileName = `${id}_${Date.now()}_${count + 1}.webp`
      const targetPath = path.join(outputDir, fileName)
      fs.writeFileSync(targetPath, await compressImage(fs.readFileSync(sourcePath)))
      insert.run('customer_ledger', id, targetPath, fileName)
      count++
    }

    return { ok: true, count }
  })
}

async function pickImageFiles(): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile', 'multiSelections']
  })
  return result.canceled ? [] : result.filePaths
}

function imageDataUrl(filePath?: string): string {
  if (!filePath || !fs.existsSync(filePath)) return ''
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp'
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
}

async function compressImage(raw: Buffer): Promise<Buffer> {
  try {
    return await sharp(raw)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer()
  } catch {
    return raw
  }
}
