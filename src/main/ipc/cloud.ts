import { BrowserWindow, ipcMain } from 'electron'
import {
  checkCloudPendingDownload,
  evaluateCloudStartupSync,
  getCloudSyncStatus,
  getQiniuConfigView,
  listCloudBackups,
  restoreCloudBackup,
  saveQiniuConfig,
  syncCloudDownload,
  syncCloudUpload,
  testCloudConnection,
  uploadCloudBackup,
  type QiniuCloudConfig,
} from '../qiniu-cloud'
import { acknowledgeRemoteSnapshot, getCloudSyncPrefs, saveCloudSyncPrefs } from '../cloud-sync-prefs'

async function confirmCloudRestore(parent: BrowserWindow | null): Promise<boolean> {
  const { dialog } = await import('electron')
  const options = {
    type: 'warning' as const,
    buttons: ['取消', '确认恢复'],
    defaultId: 0,
    cancelId: 0,
    title: '从云端恢复',
    message: '恢复会覆盖当前所有账本数据',
    detail: '系统会先自动备份当前数据，再按文件差异从七牛云拉取/合并。恢复后页面会自动刷新。',
  }
  const confirm = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return confirm.response === 1
}

export function registerCloudHandlers(): void {
  ipcMain.handle('cloud:get-config', () => getQiniuConfigView())

  ipcMain.handle('cloud:save-config', (_event, config: Partial<QiniuCloudConfig>) => {
    try {
      return { ok: true, config: saveQiniuConfig(config) }
    } catch (error: any) {
      return { ok: false, error: error?.message || '保存配置失败' }
    }
  })

  ipcMain.handle('cloud:test', () => testCloudConnection())

  ipcMain.handle('cloud:list', async () => {
    try {
      const items = await listCloudBackups()
      return { ok: true, items }
    } catch (error: any) {
      return { ok: false, error: error?.message || '读取云端备份失败', items: [] }
    }
  })

  ipcMain.handle('cloud:status', () => getCloudSyncStatus())

  ipcMain.handle('cloud:evaluate-startup', () => evaluateCloudStartupSync())

  ipcMain.handle('cloud:check-pending-updates', () => checkCloudPendingDownload())

  ipcMain.handle('cloud:get-sync-prefs', () => getCloudSyncPrefs())

  ipcMain.handle('cloud:save-sync-prefs', (_event, prefs) => {
    try {
      return { ok: true, prefs: saveCloudSyncPrefs(prefs || {}) }
    } catch (error: any) {
      return { ok: false, error: error?.message || '保存同步设置失败' }
    }
  })

  ipcMain.handle('cloud:ack-remote-snapshot', (_event, payload: { updatedAt?: string; fingerprint?: string }) => {
    try {
      return { ok: true, prefs: acknowledgeRemoteSnapshot(payload?.updatedAt, payload?.fingerprint) }
    } catch (error: any) {
      return { ok: false, error: error?.message || '记录云端版本失败' }
    }
  })

  ipcMain.handle('cloud:sync-upload', async (event) => syncCloudUpload((progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('cloud:sync-progress', progress)
  }))

  ipcMain.handle('cloud:sync-download', async (event) => {
    const result = await syncCloudDownload((progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('cloud:sync-progress', progress)
    })
    if (result.ok) {
      BrowserWindow.getAllWindows().forEach(win => win.webContents.reload())
    }
    return result
  })

  ipcMain.handle('cloud:upload', async (_event, backupName?: string) => uploadCloudBackup(backupName))

  ipcMain.handle('cloud:restore', async (event, _key: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!(await confirmCloudRestore(parent))) return { ok: false, canceled: true }
    const result = await restoreCloudBackup()
    if (result.ok) {
      BrowserWindow.getAllWindows().forEach(win => win.webContents.reload())
    }
    return result
  })
}
