import type { SlipTemplate } from './print-settings'

/** 金属出库单：针式二等分三联，行业最常见约 241×140mm */
export const METAL_SLIP_PAPER = {
  widthMm: 241,
  heightMm: 140,
  landscape: true,
  label: '241×140mm 横版（金属二等分三联）',
}

/** 竖版批发销售单：约半 A4 / 三联送货单 */
export const SALES_SLIP_PAPER = {
  widthMm: 210,
  heightMm: 140,
  landscape: false,
  label: '210×140mm 竖版（批发三联）',
}

/** 套打默认微调：多数空白表格略偏上/偏左，先给 1mm 右、0.5mm 下 */
export const DEFAULT_LODOP_OFFSET = {
  offsetXMm: 1,
  offsetYMm: 0.5,
}

export function getPaperForTemplate(template: SlipTemplate) {
  return template === 'metal' ? METAL_SLIP_PAPER : SALES_SLIP_PAPER
}

export function pageSizeCss(template: SlipTemplate): string {
  const paper = getPaperForTemplate(template)
  return paper.landscape
    ? `${paper.widthMm}mm ${paper.heightMm}mm`
    : `${paper.widthMm}mm ${paper.heightMm}mm`
}
