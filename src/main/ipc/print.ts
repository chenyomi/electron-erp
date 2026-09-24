import { ipcMain, shell } from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFileSync } from 'fs'
import { getDb } from '../db'
import { getCurrentUser } from './auth'
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

  const html = renderSlipHtml(built.data, printSettings, template)

  return {
    ok: true as const,
    html,
    slip: built.data,
    settings: printSettings,
    template,
    kind,
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
  } = {}) => {
    const result = buildPreviewPayload(params)
    if (!result.ok) return result
    return {
      ok: true,
      html: result.html,
      slip: result.slip,
      settings: result.settings,
      template: result.template,
      kind: result.kind,
    }
  })

  ipcMain.handle('print:open-browser', async (_e, html: string) => {
    if (!html?.trim()) return { ok: false, error: '没有可打印的内容' }
    try {
      const withPrint = html.includes('</body>')
        ? html.replace(
          '</body>',
          `<script>
            window.addEventListener('load', function () {
              setTimeout(function () { window.print(); }, 200);
            });
          </script></body>`,
        )
        : `${html}<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},200)});</script>`
      const filePath = join(tmpdir(), `donghao-print-${Date.now()}.html`)
      writeFileSync(filePath, withPrint, 'utf8')
      const openError = await shell.openPath(filePath)
      if (openError) return { ok: false, error: openError }
      return { ok: true, filePath }
    } catch (error: any) {
      return { ok: false, error: error?.message || '打开浏览器失败' }
    }
  })
}
