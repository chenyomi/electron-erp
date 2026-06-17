import { join } from 'path'
import * as fs from 'fs'
import { closeDatabase, getDataDir, getDb, initDatabase } from './db'

const BACKUP_PREFIX = 'ledger_'
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

export function autoBackup(): { ok: boolean; path?: string; error?: string } {
  try {
    const dataDir = getDataDir()
    const backupRoot = join(dataDir, 'backups')
    if (!fs.existsSync(backupRoot)) fs.mkdirSync(backupRoot, { recursive: true })

    const backupName = `${BACKUP_PREFIX}${backupTimestamp()}`
    const backupDir = join(backupRoot, backupName)
    fs.mkdirSync(backupDir, { recursive: true })

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

    pruneOldBackups(backupRoot)
    return { ok: true, path: backupDir }
  } catch (e: any) {
    console.error('Backup failed:', e)
    return { ok: false, error: e?.message || 'backup failed' }
  }
}

function pruneOldBackups(backupRoot: string): void {
  const entries = listBackupEntries(backupRoot)
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

function replaceDbFile(src: string, dest: string): void {
  removeIfExists(dest)
  removeIfExists(`${dest}-wal`)
  removeIfExists(`${dest}-shm`)
  fs.copyFileSync(src, dest)
}

export function restoreFromBackup(sourcePath: string): { ok: boolean; error?: string } {
  const source = resolveBackupSource(sourcePath)
  if (!source) {
    return { ok: false, error: '未找到有效备份，请选择包含 ledger.db 的备份文件夹' }
  }

  try {
    autoBackup()

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
