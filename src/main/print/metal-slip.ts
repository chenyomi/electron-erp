import type { MetalSlipSettings } from './print-settings'
import type { SalesSlipData } from './sales-slip'
import { amountToChinese } from './sales-slip'
import { METAL_SLIP_PAPER, pageSizeCss } from './paper-sizes'

function escapeHtml(text: string | number): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(value: number): string {
  const n = Number(value || 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

function formatDisplayDate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
  return date
}

export interface MetalSlipRenderOptions {
  customerAddress?: string
  overlay?: boolean
}

export function renderMetalSlipHtml(
  data: SalesSlipData,
  settings: MetalSlipSettings,
  options: MetalSlipRenderOptions = {}
): string {
  const overlay = Boolean(options.overlay)
  const border = overlay ? 'transparent' : '#111'
  const headerBg = overlay ? 'transparent' : '#fafafa'
  const emptyRows = Math.max(0, 4 - data.items.length)

  const itemRows = data.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.material || '')}</td>
      <td>${escapeHtml(item.lineNo)}</td>
      <td>${escapeHtml(item.model || item.productName || '')}</td>
      <td>${escapeHtml(item.spec)}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${escapeHtml(formatQty(item.quantity))}</td>
      <td>${escapeHtml(formatMoney(item.unitPrice))}</td>
      <td>${escapeHtml(formatMoney(item.amount))}</td>
      <td>${escapeHtml(item.note)}</td>
    </tr>
  `).join('')

  const blankRows = Array.from({ length: emptyRows }, () => `
    <tr class="blank-row">
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>
  `).join('')

  const customerAddress = options.customerAddress || ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(data.docNo)}</title>
  <style>
    @page { size: ${pageSizeCss('metal')}; margin: 3mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Microsoft YaHei", "SimSun", sans-serif;
      color: #111;
      font-size: 10.5px;
      line-height: 1.3;
    }
    .sheet {
      width: ${METAL_SLIP_PAPER.widthMm - 6}mm;
      max-width: ${METAL_SLIP_PAPER.widthMm - 6}mm;
      margin: 0 auto;
    }
    .head-row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: end;
      margin-bottom: 4px;
    }
    .company {
      text-align: center;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .doc-no {
      font-size: 11px;
      white-space: nowrap;
      padding-bottom: 1px;
    }
    .meta {
      display: grid;
      grid-template-columns: 1.2fr 1.4fr 0.9fr 0.8fr;
      gap: 3px 8px;
      margin-bottom: 4px;
    }
    .meta-item label {
      color: #444;
      margin-right: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid ${border};
      padding: 3px 2px;
      text-align: center;
      vertical-align: middle;
      word-break: break-all;
    }
    th {
      font-weight: 700;
      background: ${headerBg};
      font-size: 10px;
    }
    .blank-row td { height: 20px; }
    .total-row {
      margin-top: 4px;
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 8px;
      align-items: center;
    }
    .total-cn {
      border: 1px solid ${border};
      padding: 4px 6px;
      min-height: 24px;
    }
    .total-num {
      border: 1px solid ${border};
      padding: 4px 6px;
      text-align: right;
      font-size: 13px;
      font-weight: 700;
    }
    .pick-note {
      margin-top: 3px;
      text-align: center;
      font-size: 10px;
    }
    .footer {
      margin-top: 5px;
      display: grid;
      grid-template-columns: 1fr 1fr 0.8fr 0.8fr 0.8fr;
      gap: 4px;
      font-size: 10px;
    }
    .footer-item {
      min-height: 22px;
      border-top: 1px solid ${border};
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head-row">
      <div class="company">${escapeHtml(settings.companyName)}${settings.slipTitle ? ` ${escapeHtml(settings.slipTitle)}` : ''}</div>
      <div class="doc-no">NO: ${escapeHtml(data.docNo)}</div>
    </div>

    <div class="meta">
      <div class="meta-item"><label>客户名称</label><span>${escapeHtml(data.customerName)}</span></div>
      <div class="meta-item"><label>客户地址</label><span>${escapeHtml(customerAddress || '—')}</span></div>
      <div class="meta-item"><label>联系电话</label><span>${escapeHtml(data.customerPhone || '—')}</span></div>
      <div class="meta-item"><label>日期</label><span>${escapeHtml(formatDisplayDate(data.date))}</span></div>
    </div>

    <table>
      <colgroup>
        <col style="width:11%" />
        <col style="width:6%" />
        <col style="width:12%" />
        <col style="width:11%" />
        <col style="width:7%" />
        <col style="width:9%" />
        <col style="width:10%" />
        <col style="width:12%" />
        <col style="width:22%" />
      </colgroup>
      <thead>
        <tr>
          <th>材质</th>
          <th>序号</th>
          <th>型号</th>
          <th>规格</th>
          <th>单位</th>
          <th>重量</th>
          <th>单价</th>
          <th>金额(元)</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${blankRows}
      </tbody>
    </table>

    <div class="total-row">
      <div class="total-cn"><strong>总金额(大写)：</strong>${escapeHtml(data.amountChinese)}</div>
      <div class="total-num">￥${escapeHtml(formatMoney(data.totalAmount))}</div>
    </div>
    ${settings.pickNote ? `<div class="pick-note">(${escapeHtml(settings.pickNote)})</div>` : ''}

    <div class="footer">
      <div class="footer-item">${settings.phones ? `联系电话：${escapeHtml(settings.phones)}` : '联系电话：'}</div>
      <div class="footer-item">${settings.address ? `联系地址：${escapeHtml(settings.address)}` : '联系地址：'}</div>
      <div class="footer-item">审核人：${escapeHtml(settings.auditor || '')}</div>
      <div class="footer-item">提货人签收：</div>
      <div class="footer-item">客户签收：</div>
    </div>
    ${settings.footerNote ? `<div class="pick-note">${escapeHtml(settings.footerNote)}</div>` : ''}
  </div>
</body>
</html>`
}
