import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  version?: string
  releaseNotes?: string
  releaseDate?: string
  percent?: number
  transferred?: number
  total?: number
  error?: string
}

let updateState: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
}

let checkingPromise: Promise<UpdateState> | null = null
let initialized = false

function formatReleaseNotes(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item : item?.note || ''))
      .filter(Boolean)
      .join('\n')
      .trim() || undefined
  }
  return undefined
}

function broadcastState() {
  const payload = getUpdateState()
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send('update:state', payload)
  })
}

function setState(partial: Partial<UpdateState>) {
  updateState = {
    ...updateState,
    ...partial,
    currentVersion: app.getVersion(),
  }
  broadcastState()
}

export function getUpdateState(): UpdateState {
  return { ...updateState }
}

export function initAutoUpdater(): void {
  if (initialized || is.dev) return
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', error: undefined })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'not-available', error: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    setState({
      status: 'available',
      version: info.version,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
      error: undefined,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      error: undefined,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState({
      status: 'downloaded',
      version: info.version,
      releaseNotes: formatReleaseNotes(info.releaseNotes) || updateState.releaseNotes,
      error: undefined,
    })
  })

  autoUpdater.on('error', (error) => {
    setState({
      status: 'error',
      error: error?.message || '检查更新失败',
    })
  })

  setTimeout(() => {
    checkForUpdates({ silent: true }).catch(() => {})
  }, 8000)
}

export async function checkForUpdates(options: { silent?: boolean } = {}): Promise<UpdateState> {
  if (is.dev) {
    const state = {
      ...getUpdateState(),
      status: 'error' as const,
      error: '开发模式不支持检查更新',
    }
    setState(state)
    return state
  }

  if (checkingPromise) return checkingPromise

  checkingPromise = (async () => {
    try {
      setState({ status: 'checking', error: undefined })
      await autoUpdater.checkForUpdates()
      return getUpdateState()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState({ status: 'error', error: message })
      return getUpdateState()
    } finally {
      checkingPromise = null
    }
  })()

  return checkingPromise
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (is.dev) {
    setState({ status: 'error', error: '开发模式不支持下载更新' })
    return getUpdateState()
  }

  if (updateState.status !== 'available' && updateState.status !== 'downloaded') {
    return getUpdateState()
  }

  if (updateState.status === 'downloaded') return getUpdateState()

  try {
    setState({ status: 'downloading', error: undefined, percent: 0 })
    await autoUpdater.downloadUpdate()
    return getUpdateState()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setState({ status: 'error', error: message })
    return getUpdateState()
  }
}

export function quitAndInstall(): void {
  if (is.dev) return
  autoUpdater.quitAndInstall()
}
