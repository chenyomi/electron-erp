import { BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { getDb } from '../db'
import { getCurrentUser } from './auth'
import { buildLodopPrintPayload, buildLodopRunnerScript } from '../print/lodop-print'
import { renderSlipHtml, buildSalesSlipData, buildReturnSlipData } from '../print/sales-slip'
import {
  getPrintSettings,
  savePrintSettings,
  type PrintSettingsBundle,
  type SlipTemplate,
} from '../print/print-settings'

export type PrintSlipKind = 'stockOut' | 'customerReturn' | 'supplierReturn'

function getSelectedIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return []
  return ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
}

async function loadHtmlInWindow(html: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return win
}

function withReturnSlipTitles(settings: PrintSettingsBundle, partyKind: 'customer' | 'supplier'): PrintSettingsBundle {
  const slipTitle = partyKind === 'supplier' ? '供应商退货单' : '产品退货单'
  return {
    ...settings,
    sales: { ...settings.sales, slipTitle },
    metal: { ...settings.metal, slipTitle },
  }
}

function buildPreviewPayload(params: {
  ids?: number[]
  kind?: PrintSlipKind
  template?: SlipTemplate
  customerPhone?: string
  customerAddress?: string
  paymentReceived?: number
  overlay?: boolean
}) {
  const kind: PrintSlipKind = params.kind === 'customerReturn'
    ? 'customerReturn'
    : params.kind === 'supplierReturn'
      ? 'supplierReturn'
      : 'stockOut'
  const ids = getSelectedIds(params.ids)
  if (!ids.length) {
    return {
      ok: false as const,
      error: kind === 'stockOut' ? '请先选择要打印的出库记录' : '请先选择要打印的退货记录',
    }
  }

  const db = getDb()
  const user = getCurrentUser()
  const settings = getPrintSettings(db)
  const template: SlipTemplate = params.template === 'metal' ? 'metal' : (params.template === 'sales' ? 'sales' : settings.template)
  const overlay = Boolean(params.overlay ?? settings.lodop.overlayMode)

  let built: ReturnType<typeof buildSalesSlipData>
  let printSettings = settings

  if (kind === 'customerReturn' || kind === 'supplierReturn') {
    const table = kind === 'supplierReturn' ? 'supplier_ledger' : 'customer_ledger'
    const partyKind = kind === 'supplierReturn' ? 'supplier' as const : 'customer' as const
    const rows = db.prepare(`
      SELECT * FROM ${table}
      WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
      ORDER BY date ASC, id ASC
    `).all(...ids) as any[]
    if (!rows.length) return { ok: false as const, error: '未找到有效的退货记录' }
    built = buildReturnSlipData(rows, {
      issuer: user?.displayName || user?.username || '',
      customerPhone: params.customerPhone,
      customerAddress: params.customerAddress,
      partyKind,
    })
    printSettings = withReturnSlipTitles(settings, partyKind)
  } else {
    const rows = db.prepare(`
      SELECT * FROM stock_out_ledger
      WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
      ORDER BY date ASC, id ASC
    `).all(...ids) as any[]
    if (!rows.length) return { ok: false as const, error: '未找到有效的出库记录' }
    built = buildSalesSlipData(rows, {
      issuer: user?.displayName || user?.username || '',
      customerPhone: params.customerPhone,
      customerAddress: params.customerAddress,
      paymentReceived: params.paymentReceived,
    })
  }

  if (!built.ok) return built

  const html = renderSlipHtml(built.data, printSettings, template, { overlay })
  const lodopPayload = buildLodopPrintPayload(html, built.data, template, printSettings.lodop, overlay)

  return {
    ok: true as const,
    html,
    slip: built.data,
    settings: printSettings,
    template,
    kind,
    lodopPayload,
    lodopScript: buildLodopRunnerScript(lodopPayload),
  }
}

export function registerPrintHandlers(): void {
  ipcMain.handle('print:get-settings', () => {
    return getPrintSettings(getDb())
  })

  ipcMain.handle('print:save-settings', (_e, settings: PrintSettingsBundle) => {
    savePrintSettings(getDb(), settings)
    return { ok: true }
  })

  ipcMain.handle('print:preview', (_e, params: {
    ids?: number[]
    kind?: PrintSlipKind
    template?: SlipTemplate
    customerPhone?: string
    customerAddress?: string
    paymentReceived?: number
    overlay?: boolean
  } = {}) => {
    const result = buildPreviewPayload(params)
    if (!result.ok) return result
    const { html, slip, settings, template, kind, lodopPayload, lodopScript } = result
    return { ok: true, html, slip, settings, template, kind, lodopPayload, lodopScript }
  })

  ipcMain.handle('print:lodop-script', (_e, params: {
    ids?: number[]
    kind?: PrintSlipKind
    template?: SlipTemplate
    customerPhone?: string
    customerAddress?: string
    paymentReceived?: number
    overlay?: boolean
  } = {}) => {
    const result = buildPreviewPayload(params)
    if (!result.ok) return result
    return {
      ok: true,
      lodopScript: result.lodopScript,
      lodopPayload: result.lodopPayload,
      template: result.template,
      kind: result.kind,
    }
  })

  ipcMain.handle('print:execute', async (_e, html: string) => {
    if (!html?.trim()) return { ok: false, error: '没有可打印的内容' }
    const win = await loadHtmlInWindow(html)
    return new Promise((resolve) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        win.close()
        resolve(success ? { ok: true } : { ok: false, error: failureReason || '打印失败' })
      })
    })
  })

  ipcMain.handle('print:save-pdf', async (_e, params: string | { html?: string; landscape?: boolean }) => {
    const html = typeof params === 'string' ? params : params?.html
    const landscape = typeof params === 'string'
      ? /241mm\s+140mm|A4 landscape/i.test(html || '')
      : Boolean(params?.landscape)
    if (!html?.trim()) return { ok: false, error: '没有可保存的内容' }
    const result = await dialog.showSaveDialog({
      title: '保存 PDF',
      defaultPath: `单据-${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    const win = await loadHtmlInWindow(html)
    try {
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        landscape,
        margins: { marginType: 'default' },
      })
      const fs = await import('fs')
      fs.writeFileSync(result.filePath, pdf)
      return { ok: true, filePath: result.filePath }
    } catch (error: any) {
      return { ok: false, error: error?.message || 'PDF 保存失败' }
    } finally {
      win.close()
    }
  })
}
