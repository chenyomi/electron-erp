import type { SlipTemplate } from './print-settings'

/** 浏览器打印统一按 A4 纵向，纸张由打印机驱动处理 */
export const METAL_SLIP_PAPER = {
  widthMm: 190,
  heightMm: 277,
  landscape: false,
  label: 'A4',
}

export const SALES_SLIP_PAPER = {
  widthMm: 190,
  heightMm: 277,
  landscape: false,
  label: 'A4',
}

export function getPaperForTemplate(template: SlipTemplate) {
  return template === 'metal' ? METAL_SLIP_PAPER : SALES_SLIP_PAPER
}

export function pageSizeCss(_template?: SlipTemplate): string {
  return 'A4'
}
