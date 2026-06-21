export type LedgerDateParts = {
  year: number
  month: number
  day: number
}

function pad2(value: number | string) {
  return String(value).padStart(2, '0')
}

function toIso(parts: LedgerDateParts): string {
  if (!parts.year || !parts.month || !parts.day) return ''
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

function parseNumericDateParts(value: string): LedgerDateParts | null {
  const normalized = value.replace(/\//g, '.').replace(/-/g, '.').replace(/年/g, '.').replace(/月/g, '.').replace(/日/g, '')
  const parts = normalized.split('.').map(p => p.trim()).filter(Boolean)
  if (parts.length === 3) {
    let [year, month, day] = parts.map(p => Number(p))
    if (String(parts[0]).length !== 4 && String(parts[2]).length >= 2) {
      ;[year, month, day] = [Number(parts[2]), Number(parts[0]), Number(parts[1])]
    }
    if (String(year).length === 2) year = 2000 + year
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day }
    }
  }
  if (parts.length === 2) {
    const month = Number(parts[0])
    const day = Number(parts[1])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year: 0, month, day }
    }
  }
  return null
}

export function inferLedgerDateYear(value: any, fallbackYear?: number): number | undefined {
  const text = String(value ?? '').trim()
  const yearMatch = text.match(/(19|20)\d{2}/)
  if (yearMatch) return Number(yearMatch[0])
  if (fallbackYear && fallbackYear >= 1900) return fallbackYear
  const monthLabel = String(fallbackYear ?? '').trim()
  if (/^\d{4}/.test(monthLabel)) return Number(monthLabel.slice(0, 4))
  return undefined
}

export function parseLedgerDate(value: any, options: { fallbackYear?: number; monthLabel?: string } = {}): string {
  const raw = String(value ?? '').trim()
  if (!raw || raw.includes('合计') || raw.includes('总') || raw.includes('欠款')) return ''

  const fallbackYear = inferLedgerDateYear(raw, options.fallbackYear ?? inferLedgerDateYear(options.monthLabel))

  const fullChinese = raw.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/)
  if (fullChinese) return toIso({ year: Number(fullChinese[1]), month: Number(fullChinese[2]), day: Number(fullChinese[3]) })

  const monthDayChinese = raw.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/)
  if (monthDayChinese && fallbackYear) {
    return toIso({ year: fallbackYear, month: Number(monthDayChinese[1]), day: Number(monthDayChinese[2]) })
  }

  const dayOnlyChinese = raw.match(/^月\s*(\d{1,2})\s*日?$/)
  if (dayOnlyChinese && fallbackYear) {
    const monthFromLabel = Number(String(options.monthLabel || '').slice(5, 7))
    const month = monthFromLabel >= 1 && monthFromLabel <= 12 ? monthFromLabel : new Date().getMonth() + 1
    return toIso({ year: fallbackYear, month, day: Number(dayOnlyChinese[1]) })
  }

  const numericParts = parseNumericDateParts(raw)
  if (numericParts) {
    if (!numericParts.year && fallbackYear) numericParts.year = fallbackYear
    if (numericParts.year) return toIso(numericParts)
  }

  return raw
}

export function normalizeLedgerDateText(value: any, options: { fallbackYear?: number; monthLabel?: string } = {}): string {
  const parsed = parseLedgerDate(value, options)
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : String(value ?? '').trim()
}

export function ledgerDateSortSql(column = 'date') {
  const clean = `replace(replace(replace(replace(replace(${column}, '/', '-'), '.', '-'), '年', '-'), '月', '-'), '日', '')`
  const year = `CAST(substr(${clean}, 1, 4) AS INTEGER)`
  const month = `CAST(substr(${clean}, 6, 2) AS INTEGER)`
  const day = `CAST(substr(${clean}, 9, 2) AS INTEGER)`
  return `CASE
    WHEN ${column} GLOB '____-__-__' THEN ${column}
    WHEN ${clean} GLOB '____-__-__' THEN printf('%04d-%02d-%02d', ${year}, ${month}, ${day})
    WHEN instr(replace(replace(${column}, '/', '.'), '-', '.'), '.') > 0 THEN ${normalizedDotDateSql(column)}
    ELSE printf('9999-99-99')
  END`
}

function normalizedDotDateSql(column: string) {
  const clean = `replace(replace(${column}, '/', '.'), '-', '.')`
  const rest = `substr(${clean}, instr(${clean}, '.') + 1)`
  return `printf(
    '%04d-%02d-%02d',
    CAST(substr(${clean}, 1, instr(${clean}, '.') - 1) AS INTEGER),
    CAST(substr(${rest}, 1, instr(${rest}, '.') - 1) AS INTEGER),
    CAST(substr(${rest}, instr(${rest}, '.') + 1) AS INTEGER)
  )`
}

export function buildDateOrderBy(column = 'date', direction: 'ASC' | 'DESC' = 'DESC', tieBreaker = 'id') {
  const dir = direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
  return `${ledgerDateSortSql(column)} ${dir}, ${tieBreaker} ${dir}`
}
