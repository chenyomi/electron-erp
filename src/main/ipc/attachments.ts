import { dialog, ipcMain } from 'electron'
import { getDataDir, getDb } from '../db'
import {
  compressImageFile,
  imagePickerExtensions,
  imagePreviewDataUrl,
  isCompressibleImageFile,
  recompressLegacyStoredImages,
  storedImageDataUrl,
} from '../image-compress'
import * as fs from 'fs'
import * as path from 'path'

const allowedTables = new Set(['cash_ledger', 'bank_ledger', 'acceptance_bills', 'customer_ledger', 'stock_in_ledger', 'stock_out_ledger'])
const attachmentDataDirs = ['attachments', 'excel-images'] as const

export function registerAttachmentHandlers(): void {
  ipcMain.handle('attachment:list', (_e, relatedTable: string, relatedId: number) => {
    if (!allowedTables.has(relatedTable)) return []
    return listAttachments(relatedTable, relatedId)
  })

  ipcMain.handle('attachment:pick', async () => {
    const filePaths = await pickImageFiles()
    return Promise.all(filePaths.map(async filePath => ({
      filePath,
      fileName: path.basename(filePath),
      dataUrl: await imagePreviewDataUrl(filePath),
    })))
  })

  ipcMain.handle('attachment:pick-chat', async () => {
    const filePaths = await pickChatFiles()
    return Promise.all(filePaths.map(async filePath => {
      const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null
      const image = isCompressibleImageFile(filePath)
      return {
        filePath,
        fileName: path.basename(filePath),
        size: stat?.size || 0,
        mime: mimeForFile(filePath),
        kind: image ? 'image' : 'file',
        dataUrl: image ? await imagePreviewDataUrl(filePath) : '',
      }
    }))
  })

  ipcMain.handle('attachment:add', async (_e, relatedTable: string, relatedId: number, filePaths?: string[]) => {
    if (!allowedTables.has(relatedTable)) return { ok: false, error: 'invalid table' }
    const paths = filePaths?.length ? filePaths : await pickImageFiles()
    if (!paths.length) return { ok: false, canceled: true }
    return { ok: true, count: await saveAttachments(relatedTable, relatedId, paths) }
  })

  ipcMain.handle('attachment:delete', (_e, id: number) => deleteAttachment(id))

  ipcMain.handle('attachment:cleanup', () => cleanupOrphanAttachments())

  ipcMain.handle('attachment:recompress', async () => recompressLegacyStoredImages(getDb()))
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
  return rows.map(row => ({ ...row, attachment_thumb: storedImageDataUrl(row.attachment_thumb_path) }))
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
    if (!fs.existsSync(sourcePath) || !isCompressibleImageFile(sourcePath)) continue
    const fileName = `${relatedId}_${Date.now()}_${count + 1}.webp`
    const targetPath = path.join(outputDir, fileName)
    fs.writeFileSync(targetPath, await compressImageFile(sourcePath))
    insertAttachmentIfMissing(db, relatedTable, relatedId, targetPath, fileName)
    count++
  }

  return count
}

async function pickImageFiles(): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Images', extensions: imagePickerExtensions() }],
    properties: ['openFile', 'multiSelections'],
  })
  return result.canceled ? [] : result.filePaths
}

async function pickChatFiles(): Promise<string[]> {
  const imageExtensions = imagePickerExtensions()
  const result = await dialog.showOpenDialog({
    filters: [
      { name: '可发送文件', extensions: [...imageExtensions, 'pdf', 'xlsx', 'xls', 'doc', 'docx', 'txt', 'csv'] },
      { name: '图片', extensions: imageExtensions },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
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
      dataUrl: storedImageDataUrl(row.file_path),
    }))
}

function deleteAttachment(id: number): { ok: boolean; error?: string } {
  const db = getDb()
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any
  if (!row) return { ok: false, error: 'not found' }
  if (!allowedTables.has(row.related_table)) return { ok: false, error: 'invalid table' }
  removeAttachmentFile(row.file_path)
  db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
  return { ok: true }
}

export function deleteAttachmentsForRecord(relatedTable: string, relatedId: number, db = getDb()): number {
  const rows = db.prepare(`
    SELECT id, file_path FROM attachments
    WHERE related_table = ? AND related_id = ?
  `).all(relatedTable, relatedId) as Array<{ id: number; file_path: string }>
  let removed = 0
  for (const row of rows) {
    if (removeAttachmentFile(row.file_path)) removed++
    db.prepare('DELETE FROM attachments WHERE id = ?').run(row.id)
  }
  return removed
}

function removeAttachmentFile(filePath?: string): boolean {
  if (!filePath || !fs.existsSync(filePath)) return false
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else out.push(full)
  }
  return out
}

/** 清理已删除/不存在记录上的附件，以及磁盘上无数据库引用的图片文件 */
export function cleanupOrphanAttachments(db = getDb()): { removedRecords: number; removedFiles: number } {
  const tableList = [...allowedTables]
  let removedRecords = 0
  let removedFiles = 0

  const rows = db.prepare('SELECT * FROM attachments').all() as Array<{
    id: number
    related_table: string
    related_id: number
    file_path: string
  }>

  for (const row of rows) {
    let shouldRemove = !allowedTables.has(row.related_table)
    if (!shouldRemove) {
      const related = db.prepare(`
        SELECT id FROM ${row.related_table}
        WHERE id = ? AND deleted_at IS NULL
      `).get(row.related_id) as { id?: number } | undefined
      shouldRemove = !related?.id
    }
    if (!shouldRemove) continue
    if (removeAttachmentFile(row.file_path)) removedFiles++
    db.prepare('DELETE FROM attachments WHERE id = ?').run(row.id)
    removedRecords++
  }

  const referenced = new Set(
    (db.prepare('SELECT file_path FROM attachments').all() as Array<{ file_path: string }>)
      .map(item => path.resolve(item.file_path)),
  )
  for (const dirName of attachmentDataDirs) {
    const dataRoot = path.join(getDataDir(), dirName)
    for (const filePath of walkFiles(dataRoot)) {
      if (referenced.has(path.resolve(filePath))) continue
      if (removeAttachmentFile(filePath)) removedFiles++
    }
  }

  return { removedRecords, removedFiles }
}

function mimeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.csv') return 'text/csv'
  if (ext === '.txt') return 'text/plain'
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === '.xls') return 'application/vnd.ms-excel'
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === '.doc') return 'application/msword'
  return 'application/octet-stream'
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}
