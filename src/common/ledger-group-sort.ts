import { normalizeLedgerDateText } from './ledger-date'

/** 台账分组排序：最近活动在上；同组内主单+子单按日期、id 倒序 */

export type LedgerGroupSortPredicates = {
  isParent: (row: Record<string, any>) => boolean
}

function dateSortKey(row: Record<string, any>): string {
  const normalized = normalizeLedgerDateText(row.date)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '0000-00-00'
}

/** 日期、id 倒序：较新的行排前 */
function compareNewestFirst(a: Record<string, any>, b: Record<string, any>): number {
  const dateCmp = dateSortKey(b).localeCompare(dateSortKey(a))
  if (dateCmp !== 0) return dateCmp
  return Number(b.id || 0) - Number(a.id || 0)
}

function newestRowInGroup(group: Array<Record<string, any>>): Record<string, any> {
  return group.reduce((best, row) => (compareNewestFirst(row, best) < 0 ? row : best), group[0])
}

export function sortLedgerGrouped(
  rows: Array<Record<string, any>>,
  predicates: LedgerGroupSortPredicates,
): Array<Record<string, any>> {
  const parents = rows.filter(predicates.isParent)
  const used = new Set<number>()
  const groups: Array<Array<Record<string, any>>> = []

  for (const parent of parents) {
    const children = rows.filter(r => Number(r.ref_ledger_id || 0) === Number(parent.id))
    const groupRows = [parent, ...children].sort(compareNewestFirst)
    groups.push(groupRows)
    for (const row of groupRows) used.add(Number(row.id))
  }

  const orphans = rows
    .filter(row => {
      const rowId = Number(row.id || 0)
      return rowId && !used.has(rowId)
    })
    .map(row => [row])

  return [...groups, ...orphans]
    .sort((a, b) => compareNewestFirst(newestRowInGroup(a), newestRowInGroup(b)))
    .flat()
}
