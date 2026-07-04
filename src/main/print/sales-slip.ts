import { isCustomerReturnRecord } from '../../common/customer-ledger'
import { isSupplierReturnRecord } from '../../common/supplier-ledger'
import { renderMetalSlipHtml } from './metal-slip'
import type { PrintSettingsBundle, SlipTemplate } from './print-settings'
import { pageSizeCss } from './paper-sizes'

export interface SalesSlipSettings {
  companyName: string
  slipTitle: string
  address: string
  phones: string
  footerNote: string
  copyLabels: string[]
}

export interface SalesSlipItem {
  lineNo: string
  productName: string
  material: string
  model: string
  spec: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  note: string
}

export interface SalesSlipData {
  docNo: string
  date: string
  customerName: string
  customerPhone: string
  customerAddress: string
  /** 往来单位标签，默认「客户名称」；供应商退货单为「供应商名称」 */
  partyLabel?: string
  items: SalesSlipItem[]
  totalQuantity: number
  totalAmount: number
  amountChinese: string
  issuer: string
  paymentReceived: number
}

const CN_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const CN_UNITS = ['', '拾', '佰', '仟']
const CN_SECTIONS = ['', '万', '亿']

export function amountToChinese(value: number): string {
  const num = Math.round(Math.abs(value) * 100) / 100
  if (num === 0) return '零元整'

  const [intPart, decPartRaw] = num.toFixed(2).split('.')
  const jiao = Number(decPartRaw[0] || 0)
  const fen = Number(decPartRaw[1] || 0)

  const intText = sectionToChinese(Number(intPart))
  let result = `${intText}元`
  if (jiao === 0 && fen === 0) result += '整'
  else {
    if (jiao > 0) result += `${CN_DIGITS[jiao]}角`
    if (fen > 0) result += `${CN_DIGITS[fen]}分`
    else if (jiao > 0) result += '整'
  }
  return value < 0 ? `负${result}` : result
}

function sectionToChinese(n: number): string {
  if (n === 0) return '零'
  let result = ''
  let sectionIndex = 0
  while (n > 0) {
    const section = n % 10000
    if (section > 0) {
      const sectionText = chunkToChinese(section)
      result = sectionText + CN_SECTIONS[sectionIndex] + result
    } else if (result && !result.startsWith('零')) {
      result = `零${result}`
    }
    n = Math.floor(n / 10000)
    sectionIndex += 1
  }
  return result.replace(/零+/g, '零').replace(/零$/g, '')
}

function chunkToChinese(n: number): string {
  let result = ''
  let zeroPending = false
  for (let i = 0; n > 0; i += 1) {
    const digit = n % 10
    if (digit === 0) {
      zeroPending = result.length > 0
    } else {
      if (zeroPending) result = `零${result}`
      result = CN_DIGITS[digit] + CN_UNITS[i] + result
      zeroPending = false
    }
    n = Math.floor(n / 10)
  }
  return result
}

function padDocSuffix(id: number): string {
  return String(id).padStart(3, '0')
}

function normalizeDate(date: string): string {
  if (!date) return new Date().toISOString().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const m = date.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return date
}

export function buildSalesSlipData(
  rows: any[],
  options: {
    issuer?: string
    customerPhone?: string
    customerAddress?: string
    paymentReceived?: number
  } = {}
): { ok: true; data: SalesSlipData } | { ok: false; error: string } {
  if (!rows.length) return { ok: false, error: '请先选择要打印的出库记录' }

  const customers = Array.from(new Set(rows.map((r) => r.customer_name || '').filter(Boolean)))
  if (customers.length > 1) return { ok: false, error: '所选记录包含多个客户，请按同一客户勾选后再打印' }

  const dates = Array.from(new Set(rows.map((r) => normalizeDate(r.date || '')).filter(Boolean)))
  const date = dates.length === 1 ? dates[0] : normalizeDate(rows[0].date || '')

  const contractNos = Array.from(new Set(rows.map((r) => r.contract_no || '').filter(Boolean)))
  const docNo = contractNos.length === 1 && contractNos[0]
    ? contractNos[0]
    : `SA-${date.replace(/-/g, '')}-${padDocSuffix(Math.min(...rows.map((r) => Number(r.id) || 0)))}`

  const items: SalesSlipItem[] = rows.map((row, index) => {
    const productName = [row.product_name, row.spec].filter(Boolean).join(' ')
    return {
      lineNo: `${index + 1}`,
      productName: productName || row.product_name || '',
      material: row.category || '',
      model: row.product_name || '',
      spec: row.spec || '',
      quantity: Number(row.quantity) || 0,
      unit: row.unit || '',
      unitPrice: Number(row.unit_price) || 0,
      amount: Number(row.amount) || 0,
      note: row.note || '',
    }
  })

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  return {
    ok: true,
    data: {
      docNo,
      date,
      customerName: customers[0] || rows[0].customer_name || '',
      customerPhone: options.customerPhone || '',
      customerAddress: options.customerAddress || '',
      items,
      totalQuantity,
      totalAmount,
      amountChinese: amountToChinese(totalAmount),
      issuer: options.issuer || '',
      paymentReceived: Number(options.paymentReceived) || 0,
    },
  }
}

/** 客户/供应商退货单：台账退货行合并打印，数量/金额取绝对值 */
export function buildReturnSlipData(
  rows: any[],
  options: {
    issuer?: string
    customerPhone?: string
    customerAddress?: string
    partyKind?: 'customer' | 'supplier'
  } = {},
): { ok: true; data: SalesSlipData } | { ok: false; error: string } {
  if (!rows.length) return { ok: false, error: '请先选择要打印的退货记录' }

  const partyKind = options.partyKind === 'supplier' ? 'supplier' : 'customer'
  const isReturn = partyKind === 'supplier' ? isSupplierReturnRecord : isCustomerReturnRecord
  const partyKey = partyKind === 'supplier' ? 'supplier_name' : 'customer_name'
  const partyLabel = partyKind === 'supplier' ? '供应商名称' : '客户名称'
  const partyWord = partyKind === 'supplier' ? '供应商' : '客户'
  const docPrefix = partyKind === 'supplier' ? 'GT' : 'TH'

  if (rows.some((row) => !isReturn(row))) {
    return { ok: false, error: '只能勾选退货记录打印退货单' }
  }

  const parties = Array.from(new Set(rows.map((r) => r[partyKey] || '').filter(Boolean)))
  if (parties.length > 1) {
    return { ok: false, error: `所选记录包含多个${partyWord}，请按同一${partyWord}勾选后再打印` }
  }

  const dates = Array.from(new Set(rows.map((r) => normalizeDate(r.date || '')).filter(Boolean)))
  const date = dates.length === 1 ? dates[0] : normalizeDate(rows[0].date || '')

  const docNos = Array.from(new Set(rows.map((r) => String(r.doc_no || '').trim()).filter(Boolean)))
  const docNo = docNos.length === 1 && docNos[0]
    ? docNos[0]
    : `${docPrefix}${date.replace(/-/g, '')}${padDocSuffix(Math.min(...rows.map((r) => Number(r.id) || 0)))}`

  const items: SalesSlipItem[] = rows.map((row, index) => {
    const qty = Math.abs(Number(row.quantity) || 0)
    const unitPrice = Math.abs(Number(row.unit_price) || 0)
    const amount = Math.abs(Number(row.amount_in) || 0) || Math.round(qty * unitPrice * 100) / 100
    const productName = [row.product_name, row.spec].filter(Boolean).join(' ')
    return {
      lineNo: `${index + 1}`,
      productName: productName || row.product_name || '',
      material: '',
      model: row.product_name || '',
      spec: row.spec || '',
      quantity: qty,
      unit: row.unit || '',
      unitPrice,
      amount,
      note: row.note || '',
    }
  })

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  return {
    ok: true,
    data: {
      docNo,
      date,
      customerName: parties[0] || rows[0][partyKey] || '',
      customerPhone: options.customerPhone || '',
      customerAddress: options.customerAddress || '',
      partyLabel,
      items,
      totalQuantity,
      totalAmount,
      amountChinese: amountToChinese(totalAmount),
      issuer: options.issuer || '',
      paymentReceived: 0,
    },
  }
}

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

export function renderSlipHtml(
  data: SalesSlipData,
  bundle: PrintSettingsBundle,
  template: SlipTemplate,
  options: { overlay?: boolean } = {}
): string {
  if (template === 'metal') {
    return renderMetalSlipHtml(data, bundle.metal, {
      customerAddress: data.customerAddress,
      overlay: options.overlay,
    })
  }
  return renderSalesSlipHtml(data, bundle.sales)
}

export function renderSalesSlipHtml(data: SalesSlipData, settings: SalesSlipSettings): string {
  const emptyRows = Math.max(0, 8 - data.items.length)
  const itemRows = data.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.lineNo)}</td>
      <td class="left">${escapeHtml(item.productName)}</td>
      <td>${escapeHtml(formatQty(item.quantity))}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${escapeHtml(formatMoney(item.unitPrice))}</td>
      <td>${escapeHtml(formatMoney(item.amount))}</td>
      <td class="left">${escapeHtml(item.note)}</td>
    </tr>
  `).join('')

  const blankRows = Array.from({ length: emptyRows }, () => `
    <tr class="blank-row">
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>
  `).join('')

  const copyText = settings.copyLabels.filter(Boolean).join('　　')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(data.docNo)}</title>
  <style>
    @page { size: ${pageSizeCss('sales')}; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Microsoft YaHei", "SimSun", sans-serif;
      color: #111;
      font-size: 13px;
      line-height: 1.4;
    }
    .sheet {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
    }
    .company {
      text-align: center;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .title {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 14px;
    }
    .meta {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 8px 12px;
      margin-bottom: 10px;
    }
    .meta-item label {
      color: #444;
      margin-right: 6px;
    }
    .meta-item.doc {
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #111;
      padding: 6px 4px;
      text-align: center;
      vertical-align: middle;
      word-break: break-all;
    }
    th { font-weight: 700; background: #fafafa; }
    td.left, th.left { text-align: left; }
    .blank-row td { height: 28px; }
    .summary {
      margin-top: 10px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
    }
    .summary-line { min-height: 24px; }
    .summary-line strong { margin-right: 8px; }
    .footer {
      margin-top: 14px;
      border-top: 1px solid #111;
      padding-top: 10px;
      font-size: 12px;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .note { margin-top: 8px; line-height: 1.6; }
    .copies { margin-top: 8px; text-align: center; color: #444; }
    .sign-row {
      margin-top: 18px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .sign-box {
      border-top: 1px solid #111;
      padding-top: 8px;
      min-height: 48px;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="company">${escapeHtml(settings.companyName)}</div>
    <div class="title">${escapeHtml(settings.slipTitle)}</div>

    <div class="meta">
      <div class="meta-item"><label>${escapeHtml(data.partyLabel || '客户名称')}</label><span>${escapeHtml(data.customerName)}</span></div>
      <div class="meta-item"><label>联系电话</label><span>${escapeHtml(data.customerPhone || '—')}</span></div>
      <div class="meta-item doc"><label>单据编号</label><span>${escapeHtml(data.docNo)}</span></div>
      <div class="meta-item"><label>日期</label><span>${escapeHtml(data.date)}</span></div>
      <div class="meta-item"><label>开单人</label><span>${escapeHtml(data.issuer || '—')}</span></div>
      <div class="meta-item doc"><label>本单收款</label><span>${escapeHtml(formatMoney(data.paymentReceived))}</span></div>
    </div>

    <table>
      <colgroup>
        <col style="width:8%" />
        <col style="width:34%" />
        <col style="width:10%" />
        <col style="width:8%" />
        <col style="width:12%" />
        <col style="width:14%" />
        <col style="width:14%" />
      </colgroup>
      <thead>
        <tr>
          <th>序号</th>
          <th class="left">品名</th>
          <th>数量</th>
          <th>单位</th>
          <th>单价</th>
          <th>金额</th>
          <th class="left">备注</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${blankRows}
      </tbody>
    </table>

    <div class="summary">
      <div class="summary-line"><strong>数量合计</strong>${escapeHtml(formatQty(data.totalQuantity))}</div>
      <div class="summary-line"><strong>金额合计</strong>${escapeHtml(formatMoney(data.totalAmount))}</div>
      <div class="summary-line" style="grid-column: 1 / span 2;"><strong>总计（大写）</strong>${escapeHtml(data.amountChinese)}</div>
    </div>

    <div class="footer">
      <div class="footer-grid">
        <div>${settings.address ? `地址：${escapeHtml(settings.address)}` : '&nbsp;'}</div>
        <div>${settings.phones ? `电话：${escapeHtml(settings.phones)}` : '&nbsp;'}</div>
        <div style="text-align:right;">金额：${escapeHtml(formatMoney(data.totalAmount))} 元</div>
      </div>
      <div class="note">${escapeHtml(settings.footerNote)}</div>
      ${copyText ? `<div class="copies">${escapeHtml(copyText)}</div>` : ''}
      <div class="sign-row">
        <div class="sign-box">开单人签字：${escapeHtml(data.issuer || '')}</div>
        <div class="sign-box">收货负责人签名：</div>
      </div>
    </div>
  </div>
</body>
</html>`
}
