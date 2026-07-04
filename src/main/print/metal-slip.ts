import type { MetalSlipSettings } from './print-settings'
import type { SalesSlipData } from './sales-slip'
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
  const customerAddress = options.customerAddress || ''
  const received = Number(data.paymentReceived) || 0
  const unpaid = Math.max(0, data.totalAmount - received)
  const title = settings.slipTitle ? `（${escapeHtml(settings.slipTitle)}）` : ''
  const paymentLine = received > 0
    ? `
    <div class="payment-line">
      <div><span class="bold">本次收款：</span><span class="amount">${escapeHtml(formatMoney(received))}</span></div>
      <div><span class="bold">未收金额：</span><span class="amount">${escapeHtml(formatMoney(unpaid))}</span></div>
    </div>`
    : ''

  const itemRows = data.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.lineNo)}</td>
      <td class="left">${escapeHtml([item.model || item.productName || '', item.spec || ''].filter(Boolean).join(' '))}</td>
      <td>${escapeHtml(formatQty(item.quantity))}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${escapeHtml(formatMoney(item.unitPrice))}</td>
      <td>${escapeHtml(formatMoney(item.amount))}</td>
      <td>${escapeHtml(item.note)}</td>
    </tr>
  `).join('')

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
      font-size: 10px;
      line-height: 1.25;
    }
    .sheet {
      width: ${METAL_SLIP_PAPER.widthMm - 6}mm;
      max-width: ${METAL_SLIP_PAPER.widthMm - 6}mm;
      margin: 0 auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid ${border};
      padding: 3px 3px;
      text-align: center;
      vertical-align: middle;
      word-break: break-all;
    }
    th {
      font-weight: 700;
      background: ${headerBg};
      font-size: 10px;
    }
    .company {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 1px;
      line-height: 1.2;
    }
    .subtitle {
      margin-top: 1px;
      text-align: center;
      font-size: 12px;
      font-weight: 700;
    }
    .mb4 { margin-bottom: 4px; }
    .bold { font-weight: 700; }
    .left { text-align: left; }
    .right { text-align: right; }
    .amount { font-family: "Courier New", "Microsoft YaHei", monospace; font-weight: 700; }
    .top {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: start;
      gap: 12px;
      margin-bottom: 4px;
    }
    .title-wrap {
      min-width: 0;
      padding-left: 72px;
      text-align: center;
    }
    .doc-no {
      min-width: 132px;
      padding-top: 4px;
      font-size: 10px;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
    }
    .meta-line {
      display: grid;
      grid-template-columns: 1.1fr 1.2fr 1fr;
      gap: 12px;
      margin-bottom: 3px;
      font-size: 10px;
    }
    .meta-cell {
      display: flex;
      gap: 4px;
      min-width: 0;
    }
    .meta-label {
      flex: 0 0 auto;
      font-weight: 700;
    }
    .meta-value {
      min-width: 0;
      flex: 1;
      padding: 0 3px 1px;
    }
    .item-table td { height: 19px; }
    .summary-box {
      display: grid;
      grid-template-columns: 1fr .75fr;
      border-left: 1px solid ${border};
      border-right: 1px solid ${border};
      border-bottom: 1px solid ${border};
    }
    .summary-cell {
      min-height: 23px;
      padding: 4px 6px;
      border-right: 1px solid ${border};
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .summary-cell:last-child { border-right: 0; }
    .payment-line {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-left: 1px solid ${border};
      border-right: 1px solid ${border};
      border-bottom: 1px solid ${border};
    }
    .payment-line > div {
      min-height: 23px;
      padding: 4px 6px;
      border-right: 1px solid ${border};
    }
    .payment-line > div:last-child { border-right: 0; }
    .footer-info {
      margin-top: 5px;
      display: grid;
      grid-template-columns: 1.1fr 1.4fr;
      gap: 8px;
      font-size: 10px;
      font-weight: 700;
    }
    .statement {
      margin-top: 3px;
      font-size: 9px;
      line-height: 1.45;
      text-align: left;
    }
    .sign-line {
      margin-top: 5px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      font-size: 10px;
      font-weight: 700;
    }
    .copies {
      margin-top: 2px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      font-size: 9px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="title-wrap">
        <div class="company">${escapeHtml(settings.companyName)}</div>
        <div class="subtitle">${title}</div>
      </div>
      <div class="doc-no">单据编号：${escapeHtml(data.docNo)}</div>
    </div>
    <div class="meta-line">
      <div class="meta-cell"><span class="meta-label">${escapeHtml(data.partyLabel || '客户名称')}：</span><span class="meta-value">${escapeHtml(data.customerName)}</span></div>
      <div class="meta-cell"><span class="meta-label">联系电话：</span><span class="meta-value">${escapeHtml(data.customerPhone || '')}</span></div>
      <div class="meta-cell"><span class="meta-label">日期：</span><span class="meta-value center">${escapeHtml(formatDisplayDate(data.date))}</span></div>
    </div>
    <div class="meta-line mb4">
      <div class="meta-cell" style="grid-column: span 2;"><span class="meta-label">${escapeHtml(data.partyLabel === '供应商名称' ? '供应商地址' : '客户地址')}：</span><span class="meta-value">${escapeHtml(customerAddress || '')}</span></div>
      <div class="meta-cell"><span class="meta-label">制单人：</span><span class="meta-value center">${escapeHtml(data.issuer || '')}</span></div>
    </div>

    <table class="item-table">
      <colgroup>
        <col style="width:8%" />
        <col style="width:42%" />
        <col style="width:9%" />
        <col style="width:8%" />
        <col style="width:10%" />
        <col style="width:11%" />
        <col style="width:12%" />
      </colgroup>
      <thead>
        <tr>
          <th>序号</th>
          <th>品名</th>
          <th>数量</th>
          <th>单位</th>
          <th>单价</th>
          <th>金额</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="summary-box">
      <div class="summary-cell"><span class="bold">总计：</span><span class="bold">${escapeHtml(data.amountChinese)}</span></div>
      <div class="summary-cell right"><span class="bold">合计金额：</span><span class="amount">￥${escapeHtml(formatMoney(data.totalAmount))}</span></div>
    </div>
    ${paymentLine}
    ${settings.pickNote ? `<div class="statement center">（${escapeHtml(settings.pickNote)}）</div>` : ''}

    <div class="footer-info">
      <div>联系电话：${escapeHtml(settings.phones || '')}</div>
      <div>店铺地址：${escapeHtml(settings.address || '')}</div>
    </div>
    <div class="statement">声明：${escapeHtml(settings.footerNote || '以上货品请核对数量，如有问题请三个工作日内通知本店，逾期概不负责。')}</div>
    <div class="sign-line">
      <span>审核人：${escapeHtml(settings.auditor || '')}</span>
      <span>客户签收：</span>
      <span>收货负责人：</span>
    </div>
    <div class="copies">
      <span>第一联：成单</span>
      <span>第二联：客户</span>
      <span>第三联：存根</span>
    </div>
  </div>
</body>
</html>`
}
