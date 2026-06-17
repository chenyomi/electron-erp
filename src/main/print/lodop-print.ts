import type { LodopSettings, SlipTemplate } from './print-settings'
import type { SalesSlipData } from './sales-slip'
import { getPaperForTemplate } from './paper-sizes'

export interface LodopPrintPayload {
  html: string
  title: string
  template: SlipTemplate
  lodop: LodopSettings
}

export function buildLodopPrintPayload(
  html: string,
  data: SalesSlipData,
  template: SlipTemplate,
  lodop: LodopSettings,
  overlay: boolean
): LodopPrintPayload {
  const paper = getPaperForTemplate(template)
  return {
    html,
    title: `${template === 'metal' ? '金属销售单' : '销售单'}-${data.docNo}`,
    template,
    lodop: {
      ...lodop,
      overlayMode: overlay,
      landscape: paper.landscape,
      pageWidthMm: paper.widthMm,
      pageHeightMm: paper.heightMm,
    },
  }
}

export function buildLodopRunnerScript(payload: LodopPrintPayload): string {
  const { html, title, lodop } = payload
  const escapedHtml = JSON.stringify(html)
  const escapedTitle = JSON.stringify(title)
  const orient = lodop.landscape ? 2 : 1
  const width = Math.round(lodop.pageWidthMm * 10)
  const height = Math.round(lodop.pageHeightMm * 10)
  const offsetX = Math.round(lodop.offsetXMm * 10)
  const offsetY = Math.round(lodop.offsetYMm * 10)
  const action = lodop.usePreview ? 'PREVIEW' : 'PRINT'

  return `
(function () {
  var LODOP = window.getCLodop && window.getCLodop();
  if (!LODOP) throw new Error('未检测到 C-Lodop，请先安装并启动 C-Lodop 服务');

  LODOP.PRINT_INITA(${offsetY}, ${offsetX}, ${width}, ${height}, ${escapedTitle});
  LODOP.SET_PRINT_PAGESIZE(${orient}, ${width}, ${height}, '');
  LODOP.SET_PRINT_MODE('PRINT_PAGE_PERCENT', 'Auto-Width');
  LODOP.SET_PRINT_MODE('RESELECT_PRINTER', true);
  LODOP.SET_PRINT_MODE('RESELECT_ORIENT', true);
  LODOP.SET_PRINT_MODE('RESELECT_PAGESIZE', true);
  ${lodop.overlayMode ? "LODOP.SET_PRINT_MODE('NOCLEAR_MODE', true);" : ''}

  LODOP.ADD_PRINT_HTM(${offsetY}, ${offsetX}, 'RightMargin:' + ${offsetX} + 'mm', 'BottomMargin:' + ${offsetY} + 'mm', ${escapedHtml});
  LODOP.SET_PRINT_STYLEA(0, 'HtmWaitMilSecs', 800);

  var result = LODOP.${action}();
  return { ok: true, result: result };
})()
`.trim()
}
