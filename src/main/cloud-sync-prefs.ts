import * as crypto from 'crypto'
import * as fs from 'fs'
import { join } from 'path'
import { getDataDir } from './db'
import type { SyncFileEntry } from './backup'

export interface CloudSyncPrefs {
  exitAutoUpload: boolean
  startupCheck: boolean
  acknowledgedRemoteUpdatedAt?: string
  acknowledgedRemoteFingerprint?: string
}

const DEFAULT_PREFS: CloudSyncPrefs = {
  exitAutoUpload: true,
  startupCheck: true,
}

function prefsPath(): string {
  return join(getDataDir(), 'cloud-sync-prefs.json')
}

export function manifestFingerprint(files: Record<string, SyncFileEntry>): string {
  const keys = Object.keys(files).sort()
  const payload = keys.map((key) => `${key}:${files[key]?.hash || ''}`).join('|')
  return crypto.createHash('md5').update(payload).digest('hex')
}

export function isRemoteManifestAcknowledged(files: Record<string, SyncFileEntry>): boolean {
  const prefs = getCloudSyncPrefs()
  if (!prefs.acknowledgedRemoteFingerprint) return false
  return prefs.acknowledgedRemoteFingerprint === manifestFingerprint(files)
}

export function acknowledgeRemoteManifest(
  updatedAt: string | undefined,
  files: Record<string, SyncFileEntry>,
): CloudSyncPrefs {
  return saveCloudSyncPrefs({
    acknowledgedRemoteUpdatedAt: updatedAt,
    acknowledgedRemoteFingerprint: manifestFingerprint(files),
  })
}

export function acknowledgeRemoteSnapshot(updatedAt?: string, fingerprint?: string): CloudSyncPrefs {
  return saveCloudSyncPrefs({
    acknowledgedRemoteUpdatedAt: updatedAt,
    acknowledgedRemoteFingerprint: fingerprint,
  })
}

export function getCloudSyncPrefs(): CloudSyncPrefs {
  const path = prefsPath()
  if (!fs.existsSync(path)) return { ...DEFAULT_PREFS }
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as Partial<CloudSyncPrefs>
    return {
      exitAutoUpload: parsed.exitAutoUpload !== false,
      startupCheck: parsed.startupCheck !== false,
      acknowledgedRemoteUpdatedAt: parsed.acknowledgedRemoteUpdatedAt,
      acknowledgedRemoteFingerprint: parsed.acknowledgedRemoteFingerprint,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveCloudSyncPrefs(input: Partial<CloudSyncPrefs>): CloudSyncPrefs {
  const current = getCloudSyncPrefs()
  const next: CloudSyncPrefs = {
    exitAutoUpload: input.exitAutoUpload ?? current.exitAutoUpload,
    startupCheck: input.startupCheck ?? current.startupCheck,
    acknowledgedRemoteUpdatedAt:
      input.acknowledgedRemoteUpdatedAt !== undefined
        ? input.acknowledgedRemoteUpdatedAt
        : current.acknowledgedRemoteUpdatedAt,
    acknowledgedRemoteFingerprint:
      input.acknowledgedRemoteFingerprint !== undefined
        ? input.acknowledgedRemoteFingerprint
        : current.acknowledgedRemoteFingerprint,
  }
  fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
