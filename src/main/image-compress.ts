import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import type Database from 'better-sqlite3'
import { getDataDir } from './db'

export const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif'] as const

export const MAX_IMAGE_EDGE = 1600
export const WEBP_QUALITY = 80
export const PREVIEW_MAX_EDGE = 960
export const PREVIEW_WEBP_QUALITY = 75
const LEGACY_SIZE_THRESHOLD = 350 * 1024

export function isCompressibleImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().slice(1)
  return (IMAGE_FILE_EXTENSIONS as readonly string[]).includes(ext)
}

export function imagePickerExtensions(): string[] {
  return [...IMAGE_FILE_EXTENSIONS]
}

export async function compressImageBuffer(
  raw: Buffer,
  options: { maxEdge?: number; quality?: number } = {},
): Promise<Buffer> {
  const maxEdge = options.maxEdge ?? MAX_IMAGE_EDGE
  const quality = options.quality ?? WEBP_QUALITY
  try {
    return await sharp(raw)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer()
  } catch {
    return sharp(raw)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.min(quality, 85), mozjpeg: true })
      .toBuffer()
  }
}

export async function compressImageFile(sourcePath: string): Promise<Buffer> {
  return compressImageBuffer(fs.readFileSync(sourcePath))
}

export async function compressImageToWebpFile(sourcePath: string, targetPath: string): Promise<void> {
  const buffer = await compressImageFile(sourcePath)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, buffer)
}

export async function imagePreviewDataUrl(filePath: string): Promise<string> {
  if (!filePath || !fs.existsSync(filePath) || !isCompressibleImageFile(filePath)) return ''
  try {
    const buffer = await compressImageBuffer(fs.readFileSync(filePath), {
      maxEdge: PREVIEW_MAX_EDGE,
      quality: PREVIEW_WEBP_QUALITY,
    })
    return `data:image/webp;base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

export function storedImageDataUrl(filePath?: string): string {
  if (!filePath || !fs.existsSync(filePath)) return ''
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.png'
    ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : 'image/webp'
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
}

function shouldRecompressStoredImage(filePath: string): boolean {
  if (!fs.existsSync(filePath) || !isCompressibleImageFile(filePath)) return false
  const ext = path.extname(filePath).toLowerCase()
  const size = fs.statSync(filePath).size
  return ext !== '.webp' || size > LEGACY_SIZE_THRESHOLD
}

function uniqueWebpTarget(filePath: string): string {
  const dir = path.dirname(filePath)
  const stem = path.basename(filePath, path.extname(filePath))
  let candidate = path.join(dir, `${stem}.webp`)
  let index = 1
  while (fs.existsSync(candidate) && path.resolve(candidate) !== path.resolve(filePath)) {
    candidate = path.join(dir, `${stem}_${index}.webp`)
    index += 1
  }
  return candidate
}

async function recompressImageAtPath(filePath: string): Promise<{ path: string; fileName: string; savedBytes: number } | null> {
  if (!shouldRecompressStoredImage(filePath)) return null
  const oldSize = fs.statSync(filePath).size
  const isWebp = path.extname(filePath).toLowerCase() === '.webp'
  const targetPath = isWebp ? `${filePath}.recompress.tmp` : uniqueWebpTarget(filePath)
  try {
    await compressImageToWebpFile(filePath, targetPath)
    const newSize = fs.statSync(targetPath).size
    if (isWebp) {
      fs.unlinkSync(filePath)
      fs.renameSync(targetPath, filePath)
      return { path: filePath, fileName: path.basename(filePath), savedBytes: Math.max(0, oldSize - newSize) }
    }
    fs.unlinkSync(filePath)
    return {
      path: targetPath,
      fileName: path.basename(targetPath),
      savedBytes: Math.max(0, oldSize - newSize),
    }
  } catch {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
    return null
  }
}

/** 将历史大图或未转 webp 的附件重新压缩，减小本地与云端体积 */
export async function recompressLegacyStoredImages(db: Database): Promise<{ converted: number; savedBytes: number }> {
  let converted = 0
  let savedBytes = 0
  const update = db.prepare('UPDATE attachments SET file_path = ?, file_name = ? WHERE id = ?')
  const rows = db.prepare('SELECT id, file_path, file_name FROM attachments').all() as Array<{
    id: number
    file_path: string
    file_name: string
  }>

  for (const row of rows) {
    const result = await recompressImageAtPath(row.file_path)
    if (!result) continue
    update.run(result.path, result.fileName, row.id)
    converted += 1
    savedBytes += result.savedBytes
  }

  const referenced = new Set(rows.map(row => path.resolve(row.file_path)))
  for (const dirName of ['attachments', 'excel-images'] as const) {
    const root = path.join(getDataDir(), dirName)
    if (!fs.existsSync(root)) continue
    for (const filePath of walkFiles(root)) {
      if (referenced.has(path.resolve(filePath))) continue
      const result = await recompressImageAtPath(filePath)
      if (!result) continue
      converted += 1
      savedBytes += result.savedBytes
    }
  }

  return { converted, savedBytes }
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (isCompressibleImageFile(full)) out.push(full)
  }
  return out
}
