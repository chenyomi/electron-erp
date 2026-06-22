import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { getDb, getDataDir } from '../db'
import { listBackups, autoBackup, restoreFromBackup, restoreFromBackupPackage, exportBackupPackage, getBackupPathByName, getBackupPackageDefaultName } from '../backup'
import { dirname, join } from 'path'
import * as fs from 'fs'
import * as XLSX from 'xlsx-js-style'
import { buildExportWorkbook, timestampForFile, type ExportParams, type ExportTable } from '../export/ledger-export'
import { buildDateFilterClause } from './helpers'
import { getLastLedgerBalance } from './ledger-balance'

async function confirmRestore(parent: BrowserWindow | null): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    buttons: ['取消', '确认恢复'],
    defaultId: 0,
    cancelId: 0,
    title: '恢复备份',
    message: '恢复会覆盖当前所有账本数据',
    detail: '系统会先自动备份当前数据，再替换为所选备份。恢复后页面会自动刷新。',
  }
  const confirm = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return confirm.response === 1
}

async function runRestore(sourcePath: string, parent: BrowserWindow | null) {
  if (!(await confirmRestore(parent))) return { ok: false, canceled: true }

  const result = sourcePath.toLowerCase().endsWith('.zip')
    ? await restoreFromBackupPackage(sourcePath)
    : await restoreFromBackup(sourcePath)

  if (result.ok) {
    BrowserWindow.getAllWindows().forEach(win => win.webContents.reload())
  }
  return result
}

function ensureXlsxPath(filePath: string) {
  return filePath.toLowerCase().endsWith('.xlsx') ? filePath : `${filePath}.xlsx`
}

function writeExcelFile(wb: XLSX.WorkBook, filePath: string) {
  const targetPath = ensureXlsxPath(filePath)
  fs.mkdirSync(dirname(targetPath), { recursive: true })
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  fs.writeFileSync(targetPath, buffer)
  return targetPath
}

function friendlySaveError(error: any) {
  const code = error?.code || ''
  if (code === 'EACCES' || code === 'EPERM') return '没有权限保存到该位置，请换到桌面或文稿文件夹再试。'
  if (code === 'EBUSY') return '文件正在被其他程序占用，请关闭 Excel 后再导出。'
  if (code === 'ENOENT') return '保存位置不存在，请重新选择保存位置。'
  return error?.message || '导出失败'
}

export function registerSystemHandlers(): void {
  ipcMain.handle('system:app-version', () => app.getVersion())

  ipcMain.handle('system:summary', () => {
    const db = getDb()
    const cash = db.prepare(`SELECT SUM(income) as totalIncome, SUM(expense) as totalExpense FROM cash_ledger WHERE deleted_at IS NULL`).get() as any
    const bank = db.prepare(`SELECT SUM(amount_in) as totalIn, SUM(amount_out) as totalOut FROM bank_ledger WHERE deleted_at IS NULL`).get() as any
    const bills = db.prepare(`SELECT SUM(amount_in) as totalIn, SUM(amount_out) as totalOut FROM acceptance_bills WHERE deleted_at IS NULL`).get() as any
    const cashLastBalance = getLastLedgerBalance(db, 'cash_ledger')
    const bankLastBalance = getLastLedgerBalance(db, 'bank_ledger')
    const billsLastBalance = getLastLedgerBalance(db, 'acceptance_bills')
    return {
      cash: {
        totalIncome: cash?.totalIncome || 0,
        totalExpense: cash?.totalExpense || 0,
        balance: cashLastBalance,
      },
      bank: {
        totalIn: bank?.totalIn || 0,
        totalOut: bank?.totalOut || 0,
        balance: bankLastBalance,
      },
      bills: {
        totalIn: bills?.totalIn || 0,
        totalOut: bills?.totalOut || 0,
        balance: billsLastBalance,
      },
    }
  })

  ipcMain.handle('system:logs', (_e, {
    page = 1,
    pageSize = 50,
    keyword = '',
    tableName = '',
    action = '',
    startDate = '',
    endDate = '',
  } = {}) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const dateWhere = buildDateFilterClause({ startDate, endDate }, 'created_at')
    const where = `
      WHERE (? = '' OR table_name = ?)
        AND (? = '' OR action = ?)
        AND (table_name LIKE ? OR action LIKE ? OR operator LIKE ? OR CAST(record_id AS TEXT) LIKE ?)
        ${dateWhere.sql}
    `
    const queryParams = [tableName, tableName, action, action, like, like, like, like, ...dateWhere.params]
    const rows = db.prepare(`SELECT * FROM operation_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...queryParams, pageSize, offset)
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM operation_logs ${where}`).get(...queryParams) as { total: number }
    return { rows, total }
  })

  ipcMain.handle('system:trash-all', (_e, {
    keyword = '',
    startDate = '',
    endDate = '',
    deletedStartDate = '',
    deletedEndDate = '',
  } = {}) => {
    const db = getDb()
    const tables = [
      { name: 'cash_ledger', search: ['description', 'operator', 'note', 'date'] },
      { name: 'bank_ledger', search: ['description', 'note', 'date'] },
      { name: 'acceptance_bills', search: ['description', 'note', 'date'] },
      { name: 'customer_ledger', search: ['customer_name', 'description', 'note', 'date'] },
      { name: 'stock_in_ledger', search: ['supplier_name', 'category', 'contract_no', 'product_name', 'spec', 'unit', 'note', 'date'] },
      { name: 'stock_out_ledger', search: ['customer_name', 'category', 'contract_no', 'product_name', 'spec', 'unit', 'note', 'date'] },
    ]
    const result: Record<string, any[]> = {}
    for (const t of tables) {
      const like = `%${keyword}%`
      const keywordSql = t.search.map(column => `${column} LIKE ?`).join(' OR ')
      const rowDateWhere = buildDateFilterClause({ startDate, endDate })
      const deletedDateWhere = buildDateFilterClause({ startDate: deletedStartDate, endDate: deletedEndDate }, 'deleted_at')
      result[t.name] = db.prepare(`
        SELECT * FROM ${t.name}
        WHERE deleted_at IS NOT NULL
          AND (${keywordSql})
          ${rowDateWhere.sql}
          ${deletedDateWhere.sql}
        ORDER BY deleted_at DESC
      `).all(...t.search.map(() => like), ...rowDateWhere.params, ...deletedDateWhere.params)
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

      const filePath = writeExcelFile(wb, result.filePath)
      return { ok: true, filePath, totalRows }
    } catch (error: any) {
      return { ok: false, error: friendlySaveError(error) }
    }
  })

  ipcMain.handle('system:backups-list', () => {
    return listBackups()
  })

  ipcMain.handle('system:pick-backup-package', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '选择备份包',
      filters: [{ name: '东昊账务备份', extensions: ['zip'] }],
      properties: ['openFile'] as Array<'openFile'>,
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return result.filePaths[0] || null
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
    return runRestore(sourcePath, parent)
  })

  ipcMain.handle('system:restore-backup-by-name', async (event, name: string) => {
    const path = getBackupPathByName(name)
    if (!path) return { ok: false, error: '备份不存在或已损坏' }
    const parent = BrowserWindow.fromWebContents(event.sender)
    return runRestore(path, parent)
  })

  ipcMain.handle('system:export-backup-package', async (event, name: string) => {
    try {
      const backupPath = getBackupPathByName(name)
      if (!backupPath) return { ok: false, error: '备份不存在或已损坏' }

      const parent = BrowserWindow.fromWebContents(event.sender)
      const saveOptions = {
        title: '保存备份包',
        defaultPath: getBackupPackageDefaultName(name),
        filters: [{ name: '东昊账务备份', extensions: ['zip'] }],
      }
      const result = parent
        ? await dialog.showSaveDialog(parent, saveOptions)
        : await dialog.showSaveDialog(saveOptions)

      if (result.canceled || !result.filePath) return { ok: false, canceled: true }

      return await exportBackupPackage(backupPath, result.filePath)
    } catch (error: any) {
      return { ok: false, error: error?.message || '保存备份包失败' }
    }
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
