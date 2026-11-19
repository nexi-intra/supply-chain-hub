import type { CountScope, Kind, ScanOutcome, StockType } from '@/types/warehouse'
import { t, warehouseLocale } from './text'

const formats = new Map<string, Intl.NumberFormat>()
const numberFormat = (fractions: number) => {
  const key = `${warehouseLocale()}:${fractions}`
  if (!formats.has(key)) formats.set(key, new Intl.NumberFormat(warehouseLocale(), { minimumFractionDigits: fractions, maximumFractionDigits: fractions }))
  return formats.get(key)!
}

export function formatNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? numberFormat(0).format(value).replace(/\u2212/g, '-') : '–'
}

export function formatMoney(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–'
  const amount = numberFormat(2).format(value).replace(/\u2212/g, '-')
  return t(`${amount} kr.`, `DKK ${amount}`)
}

export function formatPercent(value: number): string {
  return `${Math.round(value)} %`
}

const pad = (value: number) => String(value).padStart(2, '0')

export function formatDateTime(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '–'
  const date = new Date(ms)
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatTime(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '–'
  const date = new Date(ms)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const KIND_LABELS: Record<Kind, [string, string]> = { new: ['Nye terminaler', 'New terminals'], used: ['Brugte terminaler', 'Used terminals'], accessory: ['Tilbehør', 'Accessories'], other: ['Andet', 'Other'] }
export const kindLabel = (kind: Kind | null | undefined) => (kind ? t(...KIND_LABELS[kind]) : '–')
export const stockLabel = (stockType: StockType | null | undefined) => (stockType === 'blocked' ? 'Blocked' : stockType === 'unrestricted' ? 'Unblocked' : '–')
export const scopeStockTypes = (scope: CountScope): StockType[] => (scope.stockTypes?.length ? scope.stockTypes : ['unrestricted', 'blocked'])

export function scopeText(scope: CountScope): string {
  const kinds = scope.kinds?.length === 1 && scope.kinds[0] === 'accessory' ? ` · ${t('Tilbehør', 'Accessories')}` : scope.kinds?.length && !scope.kinds.includes('accessory') ? ` · ${t('Terminaler', 'Terminals')}` : ''
  const types = scope.stockTypes?.length === 1 ? ` · ${stockLabel(scope.stockTypes[0])}` : ''
  if (scope.type === 'slocs') return `${scope.slocs.join(', ')}${kinds}${types}`
  const shown = scope.materials.slice(0, 3).join(', ')
  return `${t('Materialer', 'Materials')}: ${shown}${scope.materials.length > 3 ? ` +${scope.materials.length - 3}` : ''}${types}`
}

export type Tone = 'success' | 'warning' | 'error'

export function outcomeView(result: { outcome: ScanOutcome; blocked: boolean; move: boolean; suggestions: string[]; sloc: string | null; stockType?: StockType | null; otherCount?: string }): { tone: Tone; title: string; detail: string } {
  switch (result.outcome) {
    case 'found':
      if (result.move) return { tone: 'warning', title: t('Fundet – skal flyttes', 'Found – must be moved'), detail: result.suggestions.length ? t(`Flyt til ${result.suggestions[0]}`, `Move to ${result.suggestions[0]}`) : t('Hører ikke til her', 'Does not belong here') }
      return { tone: 'success', title: result.blocked ? t('Fundet – blocked', 'Found – blocked') : t('Fundet', 'Found'), detail: '' }
    case 'duplicate':
      return { tone: 'warning', title: t('Allerede scannet', 'Already scanned'), detail: '' }
    case 'other-sloc':
      return { tone: 'error', title: t('Anden storage location', 'Other storage location'), detail: t(`SAP siger ${result.sloc}`, `SAP says ${result.sloc}`) }
    case 'other-count':
      return { tone: 'warning', title: result.stockType === 'blocked' ? t(`Blocked – tælles i '${result.otherCount}'`, `Blocked – counted in '${result.otherCount}'`) : t(`Tælles i '${result.otherCount}'`, `Counted in '${result.otherCount}'`), detail: t('Scan den i den optælling', 'Scan it in that count') }
    case 'outside':
      return { tone: 'error', title: t('Uden for optællingen', 'Outside the count'), detail: t('Materialet eller lagertypen indgår ikke i udvalget', 'The material or stock type is not part of the selection') }
    case 'invalid':
      return { tone: 'error', title: t('Ugyldigt serienummer', 'Invalid serial number'), detail: '' }
    default:
      return { tone: 'error', title: t('Ukendt serienummer', 'Unknown serial number'), detail: t('Findes ikke i SAP-billedet', 'Not in the SAP snapshot') }
  }
}

export const fetchSteps = (): { step: string; label: string }[] => [
  { step: 'check', label: t('Tjekker SAP', 'Checking SAP') },
  { step: 'mb52', label: t('Lagerbeholdning (MB52)', 'Stock (MB52)') },
  { step: 'iq09-unrestricted', label: t('Serienumre – unblocked (IQ09)', 'Serial numbers – unblocked (IQ09)') },
  { step: 'iq09-blocked', label: t('Serienumre – blocked (IQ09)', 'Serial numbers – blocked (IQ09)') },
]
