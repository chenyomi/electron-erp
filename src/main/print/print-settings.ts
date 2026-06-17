import type { SalesSlipSettings } from './sales-slip'
import { DEFAULT_LODOP_OFFSET, METAL_SLIP_PAPER } from './paper-sizes'

export type SlipTemplate = 'sales' | 'metal'

export interface MetalSlipSettings {
  companyName: string
  slipTitle: string
  address: string
  phones: string
  footerNote: string
  auditor: string
  pickNote: string
}

export interface LodopSettings {
  servicePort: number
  pageWidthMm: number
  pageHeightMm: number
  landscape: boolean
  offsetXMm: number
  offsetYMm: number
  usePreview: boolean
  overlayMode: boolean
}

export interface PrintSettingsBundle {
  template: SlipTemplate
  sales: SalesSlipSettings
  metal: MetalSlipSettings
  lodop: LodopSettings
}

export const DEFAULT_SALES_SLIP_SETTINGS: SalesSlipSettings = {
  companyName: '温州东昊汽车配件有限公司',
  slipTitle: '产品销售单',
  address: '',
  phones: '',
  footerNote: '收货时请核对数量，有问题请在 3 个工作日内反馈。本单签字生效。',
  copyLabels: ['第一联：存根', '第二联：客户', '第三联：记账'],
}

export const DEFAULT_METAL_SLIP_SETTINGS: MetalSlipSettings = {
  companyName: '温州东昊汽车配件有限公司',
  slipTitle: '产品销售单',
  address: '',
  phones: '',
  footerNote: '',
  auditor: '',
  pickNote: '提货前请核对重量',
}

export const DEFAULT_LODOP_SETTINGS: LodopSettings = {
  servicePort: 8000,
  pageWidthMm: METAL_SLIP_PAPER.widthMm,
  pageHeightMm: METAL_SLIP_PAPER.heightMm,
  landscape: METAL_SLIP_PAPER.landscape,
  offsetXMm: DEFAULT_LODOP_OFFSET.offsetXMm,
  offsetYMm: DEFAULT_LODOP_OFFSET.offsetYMm,
  usePreview: true,
  overlayMode: true,
}

export const DEFAULT_PRINT_SETTINGS: PrintSettingsBundle = {
  template: 'sales',
  sales: { ...DEFAULT_SALES_SLIP_SETTINGS },
  metal: { ...DEFAULT_METAL_SLIP_SETTINGS },
  lodop: { ...DEFAULT_LODOP_SETTINGS },
}

export function getPrintSettings(db: { prepare: (sql: string) => any }): PrintSettingsBundle {
  const bundleRow = db.prepare(`SELECT value FROM settings WHERE key = 'print_settings'`).get() as { value?: string } | undefined
  if (bundleRow?.value) {
    try {
      return mergePrintSettings(JSON.parse(bundleRow.value))
    } catch {
      return { ...DEFAULT_PRINT_SETTINGS }
    }
  }

  const legacyRow = db.prepare(`SELECT value FROM settings WHERE key = 'sales_slip'`).get() as { value?: string } | undefined
  if (legacyRow?.value) {
    try {
      return mergePrintSettings({ sales: JSON.parse(legacyRow.value) })
    } catch {
      return { ...DEFAULT_PRINT_SETTINGS }
    }
  }

  return { ...DEFAULT_PRINT_SETTINGS }
}

export function savePrintSettings(db: { prepare: (sql: string) => any }, settings: PrintSettingsBundle): void {
  const payload = mergePrintSettings(settings)
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('print_settings', @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run({ value: JSON.stringify(payload) })
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('sales_slip', @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run({ value: JSON.stringify(payload.sales) })
}

function mergePrintSettings(raw: Partial<PrintSettingsBundle>): PrintSettingsBundle {
  return {
    template: raw.template === 'metal' ? 'metal' : 'sales',
    sales: { ...DEFAULT_SALES_SLIP_SETTINGS, ...(raw.sales || {}) },
    metal: { ...DEFAULT_METAL_SLIP_SETTINGS, ...(raw.metal || {}) },
    lodop: { ...DEFAULT_LODOP_SETTINGS, ...(raw.lodop || {}) },
  }
}

export function getTemplateSettings(bundle: PrintSettingsBundle, template: SlipTemplate): SalesSlipSettings | MetalSlipSettings {
  return template === 'metal' ? bundle.metal : bundle.sales
}
