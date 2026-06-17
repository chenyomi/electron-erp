import { join, dirname } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import * as fs from 'fs'
import JSZip from 'jszip'
import { closeDatabase, getDataDir, getDb, initDatabase } from './db'

const BACKUP_PREFIX = 'ledger_'
const AUTO_BACKUP_NAME = 'ledger_auto'
const AUTO_BACKUP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000
const MAX_BACKUPS = 30

const DATA_DIRS = ['excel-images', 'attachments'] as const

export interface BackupInfo {
  name: string
  time: string
  size: number
  type: 'full' | 'db-only'
  imageCount?: number
}

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let count = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) count += countFiles(fullPath)
    else if (entry.isFile()) count++
  }
  return count
}

function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let size = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) size += dirSize(fullPath)
    else if (entry.isFile()) size += fs.statSync(fullPath).size
  }
  return size
}

function copyDirIfExists(src: string, dest: string): number {
  if (!fs.existsSync(src)) return 0
  fs.cpSync(src, dest, { recursive: true })
  return countFiles(dest)
}

function writeBackupDirectory(backupDir: string): void {
  fs.mkdirSync(backupDir, { recursive: true })

  const dataDir = getDataDir()
  const db = getDb()
  const dbPath = join(backupDir, 'ledger.db')
  db.backup(dbPath)

  let imageCount = 0
  for (const dirName of DATA_DIRS) {
    imageCount += copyDirIfExists(join(dataDir, dirName), join(backupDir, dirName))
  }

  const manifest = {
    version: 1,
    type: 'full',
    createdAt: new Date().toISOString(),
    includes: ['ledger.db', ...DATA_DIRS],
    imageCount,
  }
  fs.writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

function shouldSkipAutomaticBackup(backupDir: string): boolean {
  if (!fs.existsSync(backupDir)) return false
  const lastBackupTime = fs.statSync(backupDir).mtime.getTime()
  return Date.now() - lastBackupTime < AUTO_BACKUP_MIN_INTERVAL_MS
}

export function autoBackup(options: { automatic?: boolean; force?: boolean } = {}): { ok: boolean; path?: string; error?: string } {
  try {
    const dataDir = getDataDir()
    const backupRoot = join(dataDir, 'backups')
    if (!fs.existsSync(backupRoot)) fs.mkdirSync(backupRoot, { recursive: true })

    const backupName = options.automatic ? AUTO_BACKUP_NAME : `${BACKUP_PREFIX}${backupTimestamp()}`
    const backupDir = join(backupRoot, backupName)

    if (options.automatic) {
      if (!options.force && shouldSkipAutomaticBackup(backupDir)) {
        return { ok: true, path: backupDir }
      }

      const tempBackupDir = join(backupRoot, `${AUTO_BACKUP_NAME}_tmp_${backupTimestamp()}`)
      removeIfExists(tempBackupDir)
      writeBackupDirectory(tempBackupDir)
      removeIfExists(backupDir)
      fs.renameSync(tempBackupDir, backupDir)
    } else {
      writeBackupDirectory(backupDir)
      pruneOldBackups(backupRoot)
    }
    return { ok: true, path: backupDir }
  } catch (e: any) {
    console.error('Backup failed:', e)
    return { ok: false, error: e?.message || 'backup failed' }
  }
}

function pruneOldBackups(backupRoot: string): void {
  const entries = listBackupEntries(backupRoot).filter(entry => entry.name !== AUTO_BACKUP_NAME)
  if (entries.length <= MAX_BACKUPS) return
  for (const entry of entries.slice(MAX_BACKUPS)) {
    if (entry.isDirectory) {
      fs.rmSync(entry.path, { recursive: true, force: true })
    } else {
      fs.unlinkSync(entry.path)
    }
  }
}

interface BackupEntry {
  name: string
  path: string
  time: number
  isDirectory: boolean
}

function listBackupEntries(backupRoot: string): BackupEntry[] {
  if (!fs.existsSync(backupRoot)) return []
  const entries: BackupEntry[] = []

  for (const name of fs.readdirSync(backupRoot)) {
    if (!name.startsWith(BACKUP_PREFIX)) continue
    const path = join(backupRoot, name)
    const stat = fs.statSync(path)
    if (stat.isDirectory() || name.endsWith('.db')) {
      entries.push({ name, path, time: stat.mtime.getTime(), isDirectory: stat.isDirectory() })
    }
  }

  return entries.sort((a, b) => b.time - a.time)
}

interface BackupSource {
  baseDir: string
  dbPath: string
  hasImages: boolean
}

function resolveBackupSource(sourcePath: string): BackupSource | null {
  if (!fs.existsSync(sourcePath)) return null

  const stat = fs.statSync(sourcePath)
  if (stat.isFile() && sourcePath.endsWith('.db')) {
    return { baseDir: sourcePath, dbPath: sourcePath, hasImages: false }
  }

  if (!stat.isDirectory()) return null

  const dbPath = join(sourcePath, 'ledger.db')
  if (!fs.existsSync(dbPath)) return null

  const hasImages = DATA_DIRS.some(dirName => fs.existsSync(join(sourcePath, dirName)))
  return { baseDir: sourcePath, dbPath, hasImages }
}

function removeIfExists(target: string): void {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
}

function replaceDir(src: string, dest: string): void {
  removeIfExists(dest)
  if (fs.existsSync(src)) fs.cpSync(src, dest, { recursive: true })
}

function resolveRestoredDataPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/')
  for (const dirName of DATA_DIRS) {
    const marker = `/${dirName}/`
    const markerIndex = normalized.indexOf(marker)
    if (markerIndex === -1) continue

    const relativePath = normalized.slice(markerIndex + marker.length)
    if (!relativePath) continue
    return join(getDataDir(), dirName, ...relativePath.split('/'))
  }
  return null
}

function normalizeRestoredAttachmentPaths(): void {
  const db = getDb()
  const rows = db.prepare('SELECT id, file_path FROM attachments').all() as Array<{ id: number; file_path: string }>
  const update = db.prepare('UPDATE attachments SET file_path = ? WHERE id = ?')

  for (const row of rows) {
    const restoredPath = resolveRestoredDataPath(row.file_path)
    if (restoredPath && restoredPath !== row.file_path && fs.existsSync(restoredPath)) {
      update.run(restoredPath, row.id)
    }
  }
}

function replaceDbFile(src: string, dest: string): void {
  removeIfExists(dest)
  removeIfExists(`${dest}-wal`)
  removeIfExists(`${dest}-shm`)
  fs.copyFileSync(src, dest)
}

function findBackupRoot(dir: string): string | null {
  if (resolveBackupSource(dir)) return dir
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null

  for (const name of fs.readdirSync(dir)) {
    const sub = join(dir, name)
    if (fs.statSync(sub).isDirectory() && resolveBackupSource(sub)) return sub
  }
  return null
}

function addDirToZip(zip: JSZip, dirPath: string, zipPrefix = ''): void {
  for (const name of fs.readdirSync(dirPath)) {
    const fullPath = join(dirPath, name)
    const zipPath = zipPrefix ? `${zipPrefix}/${name}` : name
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      addDirToZip(zip, fullPath, zipPath)
    } else {
      zip.file(zipPath, fs.readFileSync(fullPath))
    }
  }
}

function backupPackageName(name?: string): string {
  const match = name?.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/)
  if (match) {
    const [, y, m, d, h, min] = match
    return `东昊账务备份-${y}${m}${d}-${h}${min}.zip`
  }
  return `东昊账务备份-${backupTimestamp()}.zip`
}

export async function exportBackupPackage(backupDir: string, destZipPath: string): Promise<{ ok: boolean; error?: string }> {
  const source = resolveBackupSource(backupDir)
  if (!source) return { ok: false, error: '备份无效，找不到 ledger.db' }

  try {
    const zip = new JSZip()
    addDirToZip(zip, source.baseDir)
    const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(destZipPath, content)
    return { ok: true }
  } catch (e: any) {
    console.error('Export backup package failed:', e)
    return { ok: false, error: e?.message || '保存备份包失败' }
  }
}

async function extractZipToDir(zipPath: string, destDir: string): Promise<void> {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
  for (const [relativePath, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      fs.mkdirSync(join(destDir, relativePath), { recursive: true })
      continue
    }
    const outPath = join(destDir, relativePath)
    fs.mkdirSync(dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, await entry.async('nodebuffer'))
  }
}

export async function restoreFromBackupPackage(zipPath: string): Promise<{ ok: boolean; error?: string }> {
  if (!fs.existsSync(zipPath)) return { ok: false, error: '备份包不存在' }

  const tempDir = mkdtempSync(join(tmpdir(), 'donghao-restore-'))
  try {
    await extractZipToDir(zipPath, tempDir)
    const backupRoot = findBackupRoot(tempDir)
    if (!backupRoot) {
      return { ok: false, error: '备份包无效，请使用本软件导出的备份包' }
    }
    return restoreFromBackup(backupRoot)
  } catch (e: any) {
    console.error('Restore backup package failed:', e)
    return { ok: false, error: e?.message || '恢复备份包失败' }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

export function getBackupPackageDefaultName(name: string): string {
  return backupPackageName(name)
}

export function restoreFromBackup(sourcePath: string): { ok: boolean; error?: string } {
  const source = resolveBackupSource(sourcePath)
  if (!source) {
    return { ok: false, error: '未找到有效备份，请选择包含 ledger.db 的备份文件夹' }
  }

  try {
    autoBackup({ automatic: true, force: true })

    const dataDir = getDataDir()
    const targetDbPath = join(dataDir, 'ledger.db')

    closeDatabase()
    replaceDbFile(source.dbPath, targetDbPath)

    if (source.hasImages) {
      for (const dirName of DATA_DIRS) {
        replaceDir(join(source.baseDir, dirName), join(dataDir, dirName))
      }
    }

    initDatabase()
    normalizeRestoredAttachmentPaths()
    return { ok: true }
  } catch (e: any) {
    try {
      initDatabase()
    } catch {
      // ignore re-init failure; caller will surface original error
    }
    console.error('Restore failed:', e)
    return { ok: false, error: e?.message || '恢复失败' }
  }
}

export function getBackupPathByName(name: string): string | null {
  const backupRoot = join(getDataDir(), 'backups')
  const path = join(backupRoot, name)
  if (!fs.existsSync(path)) return null
  return resolveBackupSource(path) ? path : null
}

export function listBackups(): BackupInfo[] {
  const backupRoot = join(getDataDir(), 'backups')
  return listBackupEntries(backupRoot).map(entry => {
    if (entry.isDirectory) {
      const manifestPath = join(entry.path, 'manifest.json')
      let imageCount = 0
      let type: BackupInfo['type'] = 'full'
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
          imageCount = manifest.imageCount || 0
          type = manifest.type === 'full' ? 'full' : 'full'
        } catch {
          type = 'full'
        }
      }
      return {
        name: entry.name,
        time: new Date(entry.time).toISOString(),
        size: dirSize(entry.path),
        type,
        imageCount,
      }
    }

    const stat = fs.statSync(entry.path)
    return {
      name: entry.name,
      time: stat.mtime.toISOString(),
      size: stat.size,
      type: 'db-only',
    }
  })
}
