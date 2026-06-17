import { dialog, ipcMain } from 'electron'
import { getDataDir, getDb } from '../db'
import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'

const allowedTables = new Set(['cash_ledger', 'bank_ledger', 'acceptance_bills', 'customer_ledger', 'stock_in_ledger', 'stock_out_ledger'])

export function registerAttachmentHandlers(): void {
  ipcMain.handle('attachment:list', (_e, relatedTable: string, relatedId: number) => {
    if (!allowedTables.has(relatedTable)) return []
    return listAttachments(relatedTable, relatedId)
  })

  ipcMain.handle('attachment:pick', async () => {
    const filePaths = await pickImageFiles()
    return filePaths.map(filePath => ({
      filePath,
      fileName: path.basename(filePath),
      dataUrl: imageDataUrl(filePath)
    }))
  })

  ipcMain.handle('attachment:add', async (_e, relatedTable: string, relatedId: number, filePaths?: string[]) => {
    if (!allowedTables.has(relatedTable)) return { ok: false, error: 'invalid table' }
    const paths = filePaths?.length ? filePaths : await pickImageFiles()
    if (!paths.length) return { ok: false, canceled: true }
    return { ok: true, count: await saveAttachments(relatedTable, relatedId, paths) }
  })
}

export function attachmentPreviewSql(tableName: string): string {
  return `
    (SELECT COUNT(*) FROM attachments
      WHERE related_table = '${tableName}'
        AND related_id = ${tableName}.id) AS attachment_count,
    (SELECT file_path FROM attachments
      WHERE related_table = '${tableName}'
        AND related_id = ${tableName}.id
      ORDER BY id ASC LIMIT 1) AS attachment_thumb_path
  `
}

export function withAttachmentPreviews(rows: any[]): any[] {
  return rows.map(row => ({ ...row, attachment_thumb: imageDataUrl(row.attachment_thumb_path) }))
}

export function insertAttachmentIfMissing(
  db: any,
  relatedTable: string,
  relatedId: number,
  filePath: string,
  fileName: string
): number {
  const result = db.prepare(`
    INSERT INTO attachments (related_table, related_id, file_path, file_name)
    SELECT ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM attachments
      WHERE related_table = ? AND related_id = ? AND file_path = ?
    )
  `).run(relatedTable, relatedId, filePath, fileName, relatedTable, relatedId, filePath)
  return Number(result.changes || 0)
}

export async function saveAttachments(relatedTable: string, relatedId: number, filePaths: string[]): Promise<number> {
  const db = getDb()
  const outputDir = path.join(getDataDir(), 'attachments', safeName(relatedTable))
  fs.mkdirSync(outputDir, { recursive: true })
  let count = 0

  for (const sourcePath of filePaths) {
    if (!fs.existsSync(sourcePath)) continue
    const fileName = `${relatedId}_${Date.now()}_${count + 1}.webp`
    const targetPath = path.join(outputDir, fileName)
    fs.writeFileSync(targetPath, await compressImage(fs.readFileSync(sourcePath)))
    insertAttachmentIfMissing(db, relatedTable, relatedId, targetPath, fileName)
    count++
  }

  return count
}

async function pickImageFiles(): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile', 'multiSelections']
  })
  return result.canceled ? [] : result.filePaths
}

function listAttachments(relatedTable: string, relatedId: number): any[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM attachments
    WHERE related_table = ? AND related_id = ?
    ORDER BY id ASC
  `).all(relatedTable, relatedId) as any[]

  return rows
    .filter(row => fs.existsSync(row.file_path))
    .map(row => ({
      id: row.id,
      fileName: row.file_name,
      dataUrl: imageDataUrl(row.file_path)
    }))
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

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}
