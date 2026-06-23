import * as fs from 'fs'
import { join } from 'path'
import { getDataDir } from './db'

export interface CloudSyncPrefs {
  exitAutoUpload: boolean
  startupCheck: boolean
}

const DEFAULT_PREFS: CloudSyncPrefs = {
  exitAutoUpload: true,
  startupCheck: true,
}

function prefsPath(): string {
  return join(getDataDir(), 'cloud-sync-prefs.json')
}

export function getCloudSyncPrefs(): CloudSyncPrefs {
  const path = prefsPath()
  if (!fs.existsSync(path)) return { ...DEFAULT_PREFS }
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as Partial<CloudSyncPrefs>
    return {
      exitAutoUpload: parsed.exitAutoUpload !== false,
      startupCheck: parsed.startupCheck !== false,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveCloudSyncPrefs(input: Partial<CloudSyncPrefs>): CloudSyncPrefs {
  const next: CloudSyncPrefs = {
    exitAutoUpload: input.exitAutoUpload ?? getCloudSyncPrefs().exitAutoUpload,
    startupCheck: input.startupCheck ?? getCloudSyncPrefs().startupCheck,
  }
  fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
