import { ipcMain } from 'electron'
import { checkForUpdates, downloadUpdate, getUpdateState, quitAndInstall } from '../updater'

export function registerUpdateHandlers(): void {
  ipcMain.handle('update:get-state', () => getUpdateState())
  ipcMain.handle('update:check', (_event, options?: { silent?: boolean }) => checkForUpdates(options))
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => {
    quitAndInstall()
    return { ok: true }
  })
}
