import { ipcMain, dialog, app, shell } from 'electron'
import { getDb, getDataDir } from '../db'
import { listBackups, autoBackup } from '../backup'
import { join } from 'path'
import * as fs from 'fs'
import * as XLSX from 'xlsx'

type ExportTable = 'all' | 'cash' | 'bank' | 'bills' | 'customer' | 'stockIn' | 'stockOut'

interface ExportParams {
  table?: ExportTable
  keyword?: string
  customerName?: string
  supplierName?: string
  ids?: number[]
}

function getSelectedIds({ ids = [] }: ExportParams) {
  return ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
}

const exportConfigs = {
  cash: {
    sheetName: '现金账',
    defaultFileName: '现金账导出',
    query: (params: ExportParams) => {
      const ids = getSelectedIds(params)
      if (ids.length) {
        return {
          sql: `
            SELECT date, income, description, expense, operator, balance, note
            FROM cash_ledger
            WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
            ORDER BY date ASC, id ASC
          `,
          params: ids,
        }
      }

      const { keyword = '' } = params
      const like = `%${keyword}%`
      return {
        sql: `
          SELECT date, income, description, expense, operator, balance, note
          FROM cash_ledger
          WHERE deleted_at IS NULL
            AND (description LIKE ? OR operator LIKE ? OR note LIKE ? OR date LIKE ?)
          ORDER BY date ASC, id ASC
        `,
        params: [like, like, like, like],
      }
    },
    map: (row: any) => ({
      日期: row.date,
      收入: row.income || 0,
      摘要: row.description || '',
      支出: row.expense || 0,
      经办人: row.operator || '',
      余额: row.balance || 0,
      备注: row.note || '',
    }),
  },
  bank: {
    sheetName: '公账',
    defaultFileName: '公账导出',
    query: (params: ExportParams) => {
      const ids = getSelectedIds(params)
      if (ids.length) {
        return {
          sql: `
            SELECT date, description, amount_in, amount_out, balance, note
            FROM bank_ledger
            WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
            ORDER BY date ASC, id ASC
          `,
          params: ids,
        }
      }

      const { keyword = '' } = params
      const like = `%${keyword}%`
      return {
        sql: `
          SELECT date, description, amount_in, amount_out, balance, note
          FROM bank_ledger
          WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
          ORDER BY date ASC, id ASC
        `,
        params: [like, like, like],
      }
    },
    map: (row: any) => ({
      日期: row.date,
      摘要: row.description || '',
      进账: row.amount_in || 0,
      付出: row.amount_out || 0,
      余额: row.balance || 0,
      备注: row.note || '',
    }),
  },
  bills: {
    sheetName: '承兑票',
    defaultFileName: '承兑票导出',
    query: (params: ExportParams) => {
      const ids = getSelectedIds(params)
      if (ids.length) {
        return {
          sql: `
            SELECT date, description, amount_in, amount_out, balance, note
            FROM acceptance_bills
            WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
            ORDER BY date ASC, id ASC
          `,
          params: ids,
        }
      }

      const { keyword = '' } = params
      const like = `%${keyword}%`
      return {
        sql: `
          SELECT date, description, amount_in, amount_out, balance, note
          FROM acceptance_bills
          WHERE deleted_at IS NULL AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
          ORDER BY date ASC, id ASC
        `,
        params: [like, like, like],
      }
    },
    map: (row: any) => ({
      日期: row.date,
      摘要: row.description || '',
      收入: row.amount_in || 0,
      付出: row.amount_out || 0,
      余额: row.balance || 0,
      备注: row.note || '',
    }),
  },
  customer: {
    sheetName: '客户往来',
    defaultFileName: '客户往来导出',
    query: (params: ExportParams) => {
      const ids = getSelectedIds(params)
      if (ids.length) {
        return {
          sql: `
            SELECT customer_name, date, description, amount_in, amount_out, balance, note, month_label
            FROM customer_ledger
            WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
            ORDER BY customer_name ASC, date ASC, id ASC
          `,
          params: ids,
        }
      }

      const { keyword = '', customerName = '' } = params
      const like = `%${keyword}%`
      return {
        sql: `
          SELECT customer_name, date, description, amount_in, amount_out, balance, note, month_label
          FROM customer_ledger
          WHERE deleted_at IS NULL
            AND (? = '' OR customer_name = ?)
            AND (description LIKE ? OR note LIKE ? OR date LIKE ?)
          ORDER BY customer_name ASC, date ASC, id ASC
        `,
        params: [customerName || '', customerName || '', like, like, like],
      }
    },
    map: (row: any) => ({
      客户名称: row.customer_name || '',
      日期: row.date,
      摘要: row.description || '',
      收款: row.amount_in || 0,
      付款: row.amount_out || 0,
      余额: row.balance || 0,
      备注: row.note || '',
      月份: row.month_label || '',
    }),
  },
  stockIn: {
    sheetName: '材料入库',
    defaultFileName: '材料入库导出',
    query: (params: ExportParams) => {
      const ids = getSelectedIds(params)
      if (ids.length) {
        return {
          sql: `
            SELECT supplier_name, category, date, contract_no, product_name, spec, unit,
              quantity, unit_price, amount, tax_rate, tax_amount, invoice_amount, note
            FROM stock_in_ledger
            WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
            ORDER BY date DESC, id DESC
          `,
          params: ids,
        }
      }

      const { keyword = '', supplierName = '' } = params
      const like = `%${keyword}%`
      return {
        sql: `
          SELECT supplier_name, category, date, contract_no, product_name, spec, unit,
            quantity, unit_price, amount, tax_rate, tax_amount, invoice_amount, note
          FROM stock_in_ledger
          WHERE deleted_at IS NULL
            AND (? = '' OR supplier_name = ?)
            AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR supplier_name LIKE ?)
          ORDER BY date DESC, id DESC
        `,
        params: [supplierName || '', supplierName || '', like, like, like, like, like, like],
      }
    },
    map: (row: any) => ({
      供应商: row.supplier_name || '',
      类别: row.category || '',
      日期: row.date,
      合同编号: row.contract_no || '',
      产品名称: row.product_name || '',
      规格: row.spec || '',
      单位: row.unit || '',
      数量: row.quantity || 0,
      单价: row.unit_price || 0,
      金额: row.amount || 0,
      税率: row.tax_rate || 0,
      税额: row.tax_amount || 0,
      开票金额: row.invoice_amount || 0,
      备注: row.note || '',
    }),
  },
  stockOut: {
    sheetName: '产品出库',
    defaultFileName: '产品出库导出',
    query: (params: ExportParams) => {
      const ids = getSelectedIds(params)
      if (ids.length) {
        return {
          sql: `
            SELECT customer_name, category, date, contract_no, product_name, spec, unit,
              quantity, unit_price, amount, note
            FROM stock_out_ledger
            WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
            ORDER BY date DESC, id DESC
          `,
          params: ids,
        }
      }

      const { keyword = '', customerName = '' } = params
      const like = `%${keyword}%`
      return {
        sql: `
          SELECT customer_name, category, date, contract_no, product_name, spec, unit,
            quantity, unit_price, amount, note
          FROM stock_out_ledger
          WHERE deleted_at IS NULL
            AND (? = '' OR customer_name = ?)
            AND (product_name LIKE ? OR spec LIKE ? OR contract_no LIKE ? OR note LIKE ? OR date LIKE ? OR customer_name LIKE ?)
          ORDER BY date DESC, id DESC
        `,
        params: [customerName || '', customerName || '', like, like, like, like, like, like],
      }
    },
    map: (row: any) => ({
      客户: row.customer_name || '',
      类别: row.category || '',
      日期: row.date,
      合同编号: row.contract_no || '',
      产品名称: row.product_name || '',
      规格: row.spec || '',
      单位: row.unit || '',
      数量: row.quantity || 0,
      单价: row.unit_price || 0,
      金额: row.amount || 0,
      备注: row.note || '',
    }),
  },
}

function buildSheet(db: any, table: keyof typeof exportConfigs, params: ExportParams) {
  const config = exportConfigs[table]
  const query = config.query(params)
  const rows = db.prepare(query.sql).all(...query.params).map(config.map)
  return {
    name: config.sheetName,
    rows,
    sheet: XLSX.utils.json_to_sheet(rows),
  }
}

function timestampForFile() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

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

  ipcMain.handle('system:export-excel', async (_e, params: ExportParams = {}) => {
    const table = params.table || 'all'
    const db = getDb()
    const wb = XLSX.utils.book_new()
    const tables: Array<keyof typeof exportConfigs> = table === 'all'
      ? ['cash', 'bank', 'bills', 'customer', 'stockIn', 'stockOut']
      : [table as keyof typeof exportConfigs]
    let totalRows = 0

    for (const currentTable of tables) {
      const { name, rows, sheet } = buildSheet(db, currentTable, params)
      totalRows += rows.length
      XLSX.utils.book_append_sheet(wb, sheet, name)
    }

    const defaultBaseName = table === 'all' ? '总表导出' : exportConfigs[table].defaultFileName
    const result = await dialog.showSaveDialog({
      title: '导出 Excel',
      defaultPath: `${defaultBaseName}-${timestampForFile()}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })

    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    XLSX.writeFile(wb, result.filePath)
    return { ok: true, filePath: result.filePath, totalRows }
  })

  ipcMain.handle('system:backups-list', () => {
    return listBackups()
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
