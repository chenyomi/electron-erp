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
  platformMessage?: string
  silent?: boolean
}

let updateState: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
}

let checkingPromise: Promise<UpdateState> | null = null
let initialized = false
let lastCheckSilent = true

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
    silent: partial.silent ?? lastCheckSilent,
  }
  broadcastState()
}

export function getUpdateState(): UpdateState {
  return { ...updateState, silent: lastCheckSilent }
}

export function initAutoUpdater(): void {
  if (initialized || is.dev) return
  if (process.platform !== 'win32') return
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', error: undefined, platformMessage: undefined })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'not-available', error: undefined, platformMessage: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    setState({
      status: 'available',
      version: info.version,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
      error: undefined,
      platformMessage: undefined,
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
    let message = error?.message || '检查更新失败'
    if (/404|Not Found/i.test(message)) {
      message = '更新包下载失败（404）：更新服务器上的安装包或清单缺失，请从官网重新下载安装，或联系管理员。'
    }
    setState({
      status: 'error',
      error: message,
    })
  })

  setTimeout(() => {
    checkForUpdates({ silent: true }).catch(() => {})
  }, 8000)
}

export async function checkForUpdates(options: { silent?: boolean } = {}): Promise<UpdateState> {
  lastCheckSilent = options.silent !== false

  if (process.platform !== 'win32') {
    const platformMessage = process.platform === 'darwin'
      ? 'macOS 暂不支持自动更新，请从 GitHub Releases 下载最新安装包。'
      : '当前系统暂不支持自动更新，请从 GitHub Releases 手动下载安装包。'
    if (!lastCheckSilent) {
      setState({
        status: 'not-available',
        error: undefined,
        platformMessage,
      })
    }
    return getUpdateState()
  }

  if (is.dev) {
    const state = {
      ...getUpdateState(),
      status: 'error' as const,
      error: '开发模式不支持检查更新',
      platformMessage: undefined,
    }
    setState(state)
    return state
  }

  if (checkingPromise) return checkingPromise

  checkingPromise = (async () => {
    try {
      setState({ status: 'checking', error: undefined, platformMessage: undefined })
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
  if (process.platform !== 'win32') {
    return getUpdateState()
  }
  if (is.dev) {
    setState({ status: 'error', error: '开发模式不支持下载更新' })
    return getUpdateState()
  }

  if (updateState.status !== 'available' && updateState.status !== 'downloaded') {
    return getUpdateState()
  }

  if (updateState.status === 'downloaded') return getUpdateState()

  try {
    setState({ status: 'downloading', error: undefined, percent: 0, transferred: 0, total: 0 })
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
