export const SCRAP_NOTE_MARKER = '废料回收'

export type ScrapSettlementMode = 'offset' | 'exchange' | 'cash'

export const SCRAP_SETTLEMENT_LABELS: Record<ScrapSettlementMode, string> = {
  offset: '抵应付',
  exchange: '换新料',
  cash: '兑现金',
}

export const DEFAULT_SCRAP_NAME_OPTIONS = ['铜屑', '黄铜屑', '铝屑', '铁屑']

export function normalizeScrapSettlementMode(value: unknown): ScrapSettlementMode {
  const raw = String(value || '').trim()
  if (raw === 'exchange' || raw === '换新料') return 'exchange'
  if (raw === 'cash' || raw === '兑现金') return 'cash'
  return 'offset'
}

export function scrapSettlementLabel(mode: ScrapSettlementMode): string {
  return SCRAP_SETTLEMENT_LABELS[mode]
}

export function buildScrapNote(mode: ScrapSettlementMode, userNote = '', linkSuffix = ''): string {
  const base = `${SCRAP_NOTE_MARKER}·${scrapSettlementLabel(mode)}`
  const note = String(userNote || '').trim()
  const link = String(linkSuffix || '').trim()
  return [note && !note.includes(SCRAP_NOTE_MARKER) ? note : '', base, link].filter(Boolean).join(' · ')
}

export function isSupplierScrapRecord(row: Record<string, any> | null | undefined): boolean {
  if (!row) return false
  return String(row.note || '').includes(SCRAP_NOTE_MARKER)
}

export function parseScrapSettlementMode(row: Record<string, any> | null | undefined): ScrapSettlementMode {
  const note = String(row?.note || '')
  if (note.includes('换新料')) return 'exchange'
  if (note.includes('兑现金')) return 'cash'
  return 'offset'
}

export function parseScrapLinkedCashId(note: string): number {
  const match = String(note || '').match(/(?:^|[·\s])cash:(\d+)\b/)
  return match ? Number(match[1] || 0) : 0
}

export function parseScrapLinkedStockInIds(note: string): number[] {
  const match = String(note || '').match(/(?:^|[·\s])stock_in:([\d,]+)\b/)
  if (!match) return []
  return String(match[1] || '')
    .split(',')
    .map(id => Number(id))
    .filter(id => id > 0)
}

export function scrapBizKindLabel(row: Record<string, any>): string {
  const mode = parseScrapSettlementMode(row)
  if (mode === 'exchange') return '废料换料'
  if (mode === 'cash') return '废料兑现'
  return '废料回收'
}
