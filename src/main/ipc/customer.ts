import { dialog, ipcMain } from 'electron'
import { getDataDir, getDb } from '../db'
import { buildCustomerDescription, enrichCustomerRow } from '../../common/customer-ledger'
import { buildDateFilterClause, buildDateOrderBy, logOperation, normalizeLedgerFilters, softDelete, restore } from './helpers'
import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'

export function registerCustomerHandlers(): void {
  // 所有客户名
  ipcMain.handle('customer:names', () => {
    const db = getDb()
    return db.prepare(`SELECT DISTINCT customer_name FROM customer_ledger WHERE deleted_at IS NULL ORDER BY customer_name`).all()
  })

  ipcMain.handle('customer:list', (_e, params = {}) => {
    const { customerName, page = 1, pageSize = 100, keyword = '' } = params as any
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const filters = normalizeLedgerFilters(params, 'customerName')
    const dateWhere = buildDateFilterClause(filters)
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
    `).get(customerName || '', customerName || '', like, like, like, like, like, like, ...dateWhere.params) as { total: number }
    return { rows: rows.map(row => ({ ...enrichCustomerRow(row), attachment_thumb: imageDataUrl(row.attachment_thumb_path) })), total }
  })

  ipcMain.handle('customer:summary', (_e, params: any = {}) => {
    const filters = normalizeLedgerFilters(params, 'customerName')
    const customerName = filters.customerName || ''
    const dateWhere = buildDateFilterClause(filters)
    const db = getDb()
    if (customerName) {
      return db.prepare(`
        SELECT customer_name,
          SUM(amount_in) as totalIn, SUM(amount_out) as totalOut
        FROM customer_ledger
        WHERE deleted_at IS NULL AND customer_name = ? ${dateWhere.sql}
        GROUP BY customer_name
      `).get(customerName, ...dateWhere.params)
    }
    return db.prepare(`
      SELECT customer_name,
        SUM(amount_in) as totalIn, SUM(amount_out) as totalOut
      FROM customer_ledger
      WHERE deleted_at IS NULL ${dateWhere.sql}
      GROUP BY customer_name
      ORDER BY customer_name
    `).all(...dateWhere.params)
  })

  ipcMain.handle('customer:add', (_e, row) => {
    const db = getDb()
    const payload = { ...row, description: buildCustomerDescription(row) }
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
    const newRow = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id)
    logOperation('customer_ledger', id, 'UPDATE', old as object, newRow as object)
    return newRow
  })

  ipcMain.handle('customer:delete', (_e, id) => { softDelete('customer_ledger', id); return { ok: true } })
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
