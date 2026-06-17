import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { getDb, getDataDir } from '../db'
import { listBackups, autoBackup, restoreFromBackup, getBackupPathByName } from '../backup'
import { join } from 'path'
import * as fs from 'fs'
import * as XLSX from 'xlsx'
import { buildExportWorkbook, timestampForFile, type ExportParams, type ExportTable } from '../export/ledger-export'

export function registerSystemHandlers(): void {
  ipcMain.handle('system:summary', () => {
    const db = getDb()
    const cash = db.prepare(`SELECT SUM(income) as totalIncome, SUM(expense) as totalExpense FROM cash_ledger WHERE deleted_at IS NULL`).get() as any
    const bank = db.prepare(`SELECT SUM(amount_in) as totalIn, SUM(amount_out) as totalOut FROM bank_ledger WHERE deleted_at IS NULL`).get() as any
    const bills = db.prepare(`SELECT SUM(amount_in) as totalIn, SUM(amount_out) as totalOut FROM acceptance_bills WHERE deleted_at IS NULL`).get() as any
    const cashBalance = db.prepare(`SELECT balance FROM cash_ledger WHERE deleted_at IS NULL ORDER BY date ASC, id ASC LIMIT 1`).get() as any
    const cashLastBalance = db.prepare(`SELECT balance FROM cash_ledger WHERE deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT 1`).get() as any
    return {
      cash: {
        totalIncome: cash?.totalIncome || 0,
        totalExpense: cash?.totalExpense || 0,
        balance: cashLastBalance?.balance || 0
      },
      bank: {
        totalIn: bank?.totalIn || 0,
        totalOut: bank?.totalOut || 0
      },
      bills: {
        totalIn: bills?.totalIn || 0,
        totalOut: bills?.totalOut || 0
      }
    }
  })

  ipcMain.handle('system:logs', (_e, { page = 1, pageSize = 50 } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const rows = db.prepare(`SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(pageSize, offset)
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM operation_logs`).get() as { total: number }
    return { rows, total }
  })

  ipcMain.handle('system:trash-all', () => {
    const db = getDb()
    const tables = ['cash_ledger', 'bank_ledger', 'acceptance_bills', 'customer_ledger', 'stock_in_ledger', 'stock_out_ledger']
    const result: Record<string, any[]> = {}
    for (const t of tables) {
      result[t] = db.prepare(`SELECT * FROM ${t} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all()
    }
    return result
  })

  ipcMain.handle('system:backup', () => autoBackup())

  ipcMain.handle('system:export-excel', async (event, params: ExportParams = {}) => {
    try {
      const table: ExportTable = params.table || 'all'
      if (table !== 'all' && !['cash', 'bank', 'bills', 'customer', 'stockIn', 'stockOut'].includes(table)) {
        return { ok: false, error: `不支持的导出类型: ${table}` }
      }

      const db = getDb()
      const { wb, totalRows, defaultBaseName } = buildExportWorkbook(db, table, params)
      const parent = BrowserWindow.fromWebContents(event.sender)
      const saveOptions = {
        title: '导出 Excel',
        defaultPath: `${defaultBaseName}-${timestampForFile()}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      }
      const result = parent
        ? await dialog.showSaveDialog(parent, saveOptions)
        : await dialog.showSaveDialog(saveOptions)

      if (result.canceled || !result.filePath) return { ok: false, canceled: true }

      XLSX.writeFile(wb, result.filePath)
      return { ok: true, filePath: result.filePath, totalRows }
    } catch (error: any) {
      return { ok: false, error: error?.message || '导出失败' }
    }
  })

  ipcMain.handle('system:backups-list', () => {
    return listBackups()
  })

  ipcMain.handle('system:pick-backup', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '选择备份文件夹',
      properties: ['openDirectory'] as Array<'openDirectory'>,
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return result.filePaths[0] || null
  })

  ipcMain.handle('system:restore-backup', async (event, sourcePath: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const confirm = parent
      ? await dialog.showMessageBox(parent, {
        type: 'warning',
        buttons: ['取消', '确认恢复'],
        defaultId: 0,
        cancelId: 0,
        title: '恢复备份',
        message: '恢复会覆盖当前所有账本数据',
        detail: '系统会先自动备份当前数据，再替换为所选备份。恢复后页面会自动刷新。',
      })
      : await dialog.showMessageBox({
        type: 'warning',
        buttons: ['取消', '确认恢复'],
        defaultId: 0,
        cancelId: 0,
        title: '恢复备份',
        message: '恢复会覆盖当前所有账本数据',
        detail: '系统会先自动备份当前数据，再替换为所选备份。恢复后页面会自动刷新。',
      })

    if (confirm.response !== 1) return { ok: false, canceled: true }

    const result = restoreFromBackup(sourcePath)
    if (result.ok) {
      BrowserWindow.getAllWindows().forEach(win => win.webContents.reload())
    }
    return result
  })

  ipcMain.handle('system:restore-backup-by-name', async (event, name: string) => {
    const path = getBackupPathByName(name)
    if (!path) return { ok: false, error: '备份不存在或已损坏' }

    const parent = BrowserWindow.fromWebContents(event.sender)
    const confirm = parent
      ? await dialog.showMessageBox(parent, {
        type: 'warning',
        buttons: ['取消', '确认恢复'],
        defaultId: 0,
        cancelId: 0,
        title: '恢复备份',
        message: '恢复会覆盖当前所有账本数据',
        detail: '系统会先自动备份当前数据，再替换为所选备份。恢复后页面会自动刷新。',
      })
      : await dialog.showMessageBox({
        type: 'warning',
        buttons: ['取消', '确认恢复'],
        defaultId: 0,
        cancelId: 0,
        title: '恢复备份',
        message: '恢复会覆盖当前所有账本数据',
        detail: '系统会先自动备份当前数据，再替换为所选备份。恢复后页面会自动刷新。',
      })

    if (confirm.response !== 1) return { ok: false, canceled: true }

    const result = restoreFromBackup(path)
    if (result.ok) {
      BrowserWindow.getAllWindows().forEach(win => win.webContents.reload())
    }
    return result
  })

  ipcMain.handle('system:data-dir', () => {
    return getDataDir()
  })

  ipcMain.handle('system:open-data-dir', () => {
    shell.openPath(getDataDir())
    return { ok: true }
  })

  ipcMain.handle('system:open-backup-dir', () => {
    const backupDir = join(getDataDir(), 'backups')
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
    shell.openPath(backupDir)
    return { ok: true }
  })

  ipcMain.handle('system:open-excel-images-dir', () => {
    const imagesDir = join(getDataDir(), 'excel-images')
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })
    shell.openPath(imagesDir)
    return { ok: true }
  })

  ipcMain.handle('system:monthly-all', () => {
    const db = getDb()
    const cash = db.prepare(`
      SELECT substr(date,1,7) as month, SUM(income) as income, SUM(expense) as expense
      FROM cash_ledger WHERE deleted_at IS NULL
      GROUP BY substr(date,1,7) ORDER BY month ASC
    `).all()
    const bank = db.prepare(`
      SELECT substr(date,1,7) as month, SUM(amount_in) as income, SUM(amount_out) as expense
      FROM bank_ledger WHERE deleted_at IS NULL
      GROUP BY substr(date,1,7) ORDER BY month ASC
    `).all()
    return { cash, bank }
  })
}
