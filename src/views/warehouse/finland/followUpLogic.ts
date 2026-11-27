// The rules of the Opfølgning form, as in Finland T&T's app/renderer/followup.js. Kept free of React so they can be
// tested: a form is a plain value, and every change gives a new one.
import { formatDate } from '@/lib/warehouse/finlandDates'
import { kolli } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import type { FinlandFollowUp, FinlandFollowUpField, FinlandFollowUpResult, FinlandFollowUpRow, FinlandFollowUpView, FinlandStatusResult, FinlandTimelineEvent } from '@/types/finland'

/** The sheet's column names, in the sheet's order. */
export const FIELD_NAMES: Record<FinlandFollowUpField, string> = { expected: 'Expected', received: 'Received', sla: 'SLA', comment: 'Comment', terminal: 'Terminal' }
const FIELDS = Object.keys(FIELD_NAMES) as FinlandFollowUpField[]

export interface FollowUpForm {
  /** rowId of the parcel the form is for. */
  id: string
  values: FinlandFollowUp
  /** What the sheet held when the form was opened; sent with every draft so the main process can spot conflicts. */
  base: FinlandFollowUp
  /** Only these fields are sent. */
  touched: FinlandFollowUpField[]
  slaManual: boolean
  /** A date field whose text could not be read. */
  error: FinlandFollowUpField | null
}

/** A row's identity in the list: its parcel key, or its row number when it has no T&T (those share the empty key). */
export const rowId = (r: Pick<FinlandFollowUpRow, 'key' | 'row'>) => r.key || `row-${r.row}`

export const slaFor = (expected: string, received: string) => (!expected || !received ? '' : received <= expected ? 'OK' : 'NOK')

/** The parcels picked up on `day`, in the sheet's order. */
export function rowsOfDay(rows: FinlandFollowUpRow[], day: string | null): FinlandFollowUpRow[] {
  return rows.filter(r => r.pickedUp === day).sort((a, b) => a.row - b.row)
}

/** The first parcel still to follow up, or the first of the day. */
export const firstOpenRow = (rows: FinlandFollowUpRow[]) => rows.find(r => !r.done && !r.duplicate) || rows[0] || null

/** The newest day before today with parcels to follow up, or else the newest day. */
export function chooseDefaultDay(days: FinlandFollowUpView['days'], today: string): string | null {
  const open = days.filter(d => d.status !== 'done' && d.date < today)
  return (open.length ? open[open.length - 1] : days[days.length - 1])?.date ?? null
}

export function openForm(r: FinlandFollowUpRow): FollowUpForm {
  return { id: rowId(r), values: { ...r.effective }, base: { ...r.sheet }, touched: [], slaManual: r.slaManual, error: null }
}

export function touch(form: FollowUpForm, field: FinlandFollowUpField, value: string): FollowUpForm {
  return {
    ...form,
    values: { ...form.values, [field]: value },
    touched: form.touched.includes(field) ? form.touched : [...form.touched, field],
  }
}

/** The SLA the dates give, with the suggested Expected when none is filled in. */
export const computedSla = (r: Pick<FinlandFollowUpRow, 'suggestedExpected'>, v: FinlandFollowUp) => slaFor(v.expected || r.suggestedExpected || '', v.received)

/**
 * nShift's SLA, while the dates are the ones the rules used: the same Expected, and Received as nShift's delivery day.
 * Otherwise null, and the date rule applies.
 */
export function nshiftSla(r: Pick<FinlandFollowUpRow, 'nshift' | 'effective' | 'suggestedExpected'>, v: FinlandFollowUp): string | null {
  const s = r.nshift?.suggestion
  if (!s?.sla) return null
  if ((v.expected || r.suggestedExpected || '') !== (r.effective.expected || r.suggestedExpected || '')) return null
  if ((v.received || '') !== (s.received || '')) return null
  return s.sla
}

const autoSla = (r: FinlandFollowUpRow, v: FinlandFollowUp) => nshiftSla(r, v) ?? computedSla(r, v)

/** A change made by the person. SLA follows the dates until it is chosen by hand. */
export function changeField(form: FollowUpForm, r: FinlandFollowUpRow, field: FinlandFollowUpField, value: string): FollowUpForm {
  let next = touch(form, field, value)
  if (field === 'sla') next = { ...next, slaManual: true }
  if ((field === 'received' || field === 'expected') && !next.slaManual) {
    // SLA worked out from a suggested Expected also keeps that Expected, so the two always agree.
    if (!next.values.expected && r.suggestedExpected) next = touch(next, 'expected', r.suggestedExpected)
    next = touch(next, 'sla', nshiftSla(r, next.values) ?? slaFor(next.values.expected, next.values.received))
  }
  return next
}

const NSHIFT_FIELDS = ['received', 'terminal', 'comment'] as const

/**
 * Suggestions become changes only when the person moves on. nShift's Received, Terminal and Comment fill only empty
 * fields the person has not changed. SLA is only worked out again when a date was changed now (by the person, or as
 * the suggested Expected), or when it is empty; a Received filled from nShift is not such a change, so an SLA already
 * in the sheet or set by hand is kept. nShift's SLA wins over the date rule while the dates are nShift's.
 */
export function applySuggestions(form: FollowUpForm, r: FinlandFollowUpRow): FollowUpForm {
  let next = form
  if (!next.values.expected && r.suggestedExpected) next = touch(next, 'expected', r.suggestedExpected)
  if (!next.values.terminal && (r.courier === 'DHL' || r.courier === 'DSV')) next = touch(next, 'terminal', r.courier)
  const datesChanged = next.touched.includes('expected') || next.touched.includes('received')
  const s = r.nshift?.suggestion
  for (const field of NSHIFT_FIELDS) {
    const value = s?.[field]
    if (value && !next.values[field] && !next.touched.includes(field)) next = touch(next, field, value)
  }
  if (!next.slaManual && (datesChanged || !next.values.sla)) {
    const sla = nshiftSla(r, next.values) ?? slaFor(next.values.expected, next.values.received)
    if (sla !== (next.values.sla || '')) next = touch(next, 'sla', sla)
  }
  return next
}

/**
 * The SLA the list fills in once the dates in `fields` are filled, as Enter gives it (and as proposedSla in
 * electron/warehouse/finland/service.cjs; change both): nShift's SLA while Received is nShift's and Expected the one
 * the rules used, else the date rule.
 */
function proposedSla(r: FinlandFollowUpRow, fields: Partial<FinlandFollowUp>): string {
  const expected = fields.expected || r.effective.expected || ''
  const received = fields.received || r.effective.received || ''
  const s = r.nshift?.suggestion
  if (s?.sla && received === (s.received || '') && expected === (r.effective.expected || r.suggestedExpected || '')) return s.sla
  return slaFor(expected, received)
}

/**
 * What "Brug forslagene for alle leverede kolli på dagen" fills in, by parcel, with the main process' rules: delivered
 * parcels on `day` that are not twice in the sheet, and only fields that are empty and not changed by the person (in a
 * draft or in the open `form`). Expected gets the suggested Expected, which nShift's SLA was worked out with.
 */
export function suggestionList(rows: FinlandFollowUpRow[], day: string | null, form: FollowUpForm | null = null): { row: FinlandFollowUpRow; fields: Partial<FinlandFollowUp> }[] {
  const list: { row: FinlandFollowUpRow; fields: Partial<FinlandFollowUp> }[] = []
  for (const r of rowsOfDay(rows, day)) {
    if (!r.key || r.duplicate || !r.nshift?.delivered) continue
    const touchedNow = form && form.id === rowId(r) ? form.touched : []
    const proposed: Partial<Record<FinlandFollowUpField, string | null>> = { expected: r.suggestedExpected, ...r.nshift.suggestion }
    const fields: Partial<FinlandFollowUp> = {}
    for (const field of FIELDS) {
      const value = field === 'sla' ? proposedSla(r, fields) : proposed[field]
      const empty = !String(r.effective[field] ?? '').trim()
      const changed = String(r.effective[field] ?? '') !== String(r.sheet[field] ?? '') || touchedNow.includes(field)
      if (value && empty && !changed) fields[field] = value
    }
    if (Object.keys(fields).length) list.push({ row: r, fields })
  }
  return list
}

// The same status ids as ATTEMPT_IDS and DELIVERED_IDS in electron/warehouse/finland/core/nshiftRules.cjs; change both.
const FIRST_ATTEMPT = new Set([3000, 2002, 5006, 6000, 6003])
const DELIVERED = new Set([3000, 2002])

/** The timeline oldest first, with the first attempt and the delivery marked, as the rules find them. */
export function timelineRows(events: FinlandTimelineEvent[]): (FinlandTimelineEvent & { firstAttempt: boolean; delivered: boolean })[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const first = sorted.findIndex(e => FIRST_ATTEMPT.has(e.statusId))
  const delivered = sorted.findIndex(e => DELIVERED.has(e.statusId))
  return sorted.map((e, i) => ({ ...e, firstAttempt: i === first, delivered: i === delivered }))
}

/** "Received 27-11-2026, SLA OK": the fields a suggestion fills in. */
export const suggestionText = (fields: Partial<FinlandFollowUp>) => FIELDS
  .filter(f => fields[f])
  .map(f => `${FIELD_NAMES[f]} ${shownValue(f, fields[f] as string)}`)
  .join(', ')

/** "3 kolli hentet. 1 ikke fundet i nShift. 2 fejlede.": what a status fetch did; parts with nothing are left out. */
export function statusLines(s: FinlandStatusResult): string {
  const parts = [t(`${kolli(s.fetched)} hentet.`, `${kolli(s.fetched)} fetched.`)]
  if (s.notFound) parts.push(t(`${s.notFound} ikke fundet i nShift.`, `${s.notFound} not found in nShift.`))
  if (s.failed) parts.push(t(`${s.failed} fejlede.`, `${s.failed} failed.`))
  return parts.join(' ')
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "27-11 14.05": an event's time, in the computer's own time. */
export function eventTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)} ${pad(d.getHours())}.${pad(d.getMinutes())}`
}

/** "27-11" for a day as yyyy-mm-dd. */
export const dayMonth = (iso: string) => formatDate(iso).slice(0, 5)

/** The newest status fetch among `rows`, as an ISO time, or null. */
export function newestFetch(rows: FinlandFollowUpRow[]): string | null {
  let newest: string | null = null
  for (const r of rows) {
    const at = r.nshift?.fetchedAt
    if (at && (!newest || Date.parse(at) > Date.parse(newest))) newest = at
  }
  return newest
}

/** "Status hentet kl. 14.05", with the day when it was not today; nothing for a time that cannot be read. */
export function fetchedText(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = `${pad(d.getHours())}.${pad(d.getMinutes())}`
  const enTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const day = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}`
  return sameDay
    ? t(`Status hentet kl. ${time}`, `Status fetched at ${enTime}`)
    : t(`Status hentet ${day} kl. ${time}`, `Status fetched on ${day} at ${enTime}`)
}

/** The touched fields, as sent to the main process. */
export function wantedOf(form: FollowUpForm): Partial<FinlandFollowUp> {
  const wanted: Partial<FinlandFollowUp> = {}
  for (const f of form.touched) wanted[f] = form.values[f] ?? ''
  return wanted
}

const isDateField = (field: FinlandFollowUpField) => field === 'expected' || field === 'received'

/** A field's value as shown in texts: dates as dd-mm-yyyy, nothing as "tom". */
export const shownValue = (field: FinlandFollowUpField, value: string) => (isDateField(field) ? formatDate(value) : value) || t('tom', 'empty')

/** "Expected 26-11-2026, SLA OK": what a parcel's change writes in the sheet. */
export function changesText(r: Pick<FinlandFollowUpRow, 'effective' | 'sheet'>): string {
  return FIELDS
    .filter(f => String(r.effective[f] || '') !== String(r.sheet[f] || ''))
    .map(f => `${FIELD_NAMES[f]} ${shownValue(f, r.effective[f])}`)
    .join(', ')
}

export function slaHint(form: FollowUpForm, r: FinlandFollowUpRow): string {
  if (form.slaManual) {
    const auto = autoSla(r, form.values)
    return auto && auto !== form.values.sla
      ? t(`valgt i hånden, beregnet ville være ${auto}`, `chosen by hand, calculated would be ${auto}`)
      : t('valgt i hånden', 'chosen by hand')
  }
  // What Enter would give: nShift's Received may fill in the date the SLA needs.
  const preview = applySuggestions(form, r).values
  const fromNshift = nshiftSla(r, preview)
  if (fromNshift && (!form.values.sla || form.values.sla === fromNshift)) return t('forslag fra nShift', 'suggestion from nShift')
  return computedSla(r, preview) ? t('beregnet', 'calculated') : t('sættes når Received er udfyldt', 'set when Received is filled in')
}

/** "Anna Holm har 3 kolli, der ikke er gemt.": colleagues' changes on a day that are not in the sheet yet. */
export function othersOnDay(others: { name: string; count: number }[] | undefined): string[] {
  return (others ?? []).map(o => t(
    `${o.name} har ${kolli(o.count)}, der ikke er gemt.`,
    `${o.name} has ${kolli(o.count)} that ${o.count === 1 ? 'is' : 'are'} not saved.`,
  ))
}

/** The warning on a parcel a colleague has changed too. It never stops anyone. */
export function othersOnParcel(names: string[]): string | null {
  if (!names.length) return null
  return t(
    `${names.join(' og ')} har en ændring på dette kolli, der ikke er gemt.`,
    `${names.join(' and ')} ${names.length === 1 ? 'has' : 'have'} a change on this parcel that is not saved.`,
  )
}

/** What "Ja, gem i arket" did; `info` when something was left for the person to look at. */
export function savedLines(s: FinlandFollowUpResult): { tone: 'success' | 'info'; lines: string[] } {
  const lines = [s.written
    ? t(`${kolli(s.written)} er skrevet i arket, og arket er gemt.`, `${kolli(s.written)} written in the sheet, and the sheet is saved.`)
    : t('Der var intet nyt at skrive i arket.', 'There was nothing new to write in the sheet.')]
  if (s.conflicts) lines.push(t(`${kolli(s.conflicts)} er ændret i arket af en anden. De er ikke skrevet. Se dem i listen.`, `${kolli(s.conflicts)} were changed in the sheet by someone else. They were not written. See them in the list.`))
  if (s.notFound || s.moved) lines.push(t(`${kolli(s.notFound + s.moved)} blev ikke fundet i arket. Tryk "Hent igen".`, `${kolli(s.notFound + s.moved)} were not found in the sheet. Press "Fetch again".`))
  return { tone: s.conflicts || s.notFound || s.moved ? 'info' : 'success', lines }
}
