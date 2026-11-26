// The rules of the Opfølgning form, as in Finland T&T's app/renderer/followup.js. Kept free of React so they can be
// tested: a form is a plain value, and every change gives a new one.
import { formatDate } from '@/lib/warehouse/finlandDates'
import { kolli } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import type { FinlandFollowUp, FinlandFollowUpField, FinlandFollowUpResult, FinlandFollowUpRow, FinlandFollowUpView } from '@/types/finland'

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

/** A change made by the person. SLA follows the dates until it is chosen by hand. */
export function changeField(form: FollowUpForm, r: FinlandFollowUpRow, field: FinlandFollowUpField, value: string): FollowUpForm {
  let next = touch(form, field, value)
  if (field === 'sla') next = { ...next, slaManual: true }
  if ((field === 'received' || field === 'expected') && !next.slaManual) {
    // SLA worked out from a suggested Expected also keeps that Expected, so the two always agree.
    if (!next.values.expected && r.suggestedExpected) next = touch(next, 'expected', r.suggestedExpected)
    next = touch(next, 'sla', slaFor(next.values.expected, next.values.received))
  }
  return next
}

/**
 * Suggestions become changes only when the person moves on. SLA is only worked out again when a date was changed now,
 * or when it is empty; an SLA already in the sheet or set by hand is kept.
 */
export function applySuggestions(form: FollowUpForm, r: FinlandFollowUpRow): FollowUpForm {
  let next = form
  if (!next.values.expected && r.suggestedExpected) next = touch(next, 'expected', r.suggestedExpected)
  if (!next.values.terminal && (r.courier === 'DHL' || r.courier === 'DSV')) next = touch(next, 'terminal', r.courier)
  const datesChanged = next.touched.includes('expected') || next.touched.includes('received')
  if (!next.slaManual && (datesChanged || !next.values.sla)) {
    const sla = slaFor(next.values.expected, next.values.received)
    if (sla !== (next.values.sla || '')) next = touch(next, 'sla', sla)
  }
  return next
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
  const auto = computedSla(r, form.values)
  if (form.slaManual) {
    return auto && auto !== form.values.sla
      ? t(`valgt i hånden, beregnet ville være ${auto}`, `chosen by hand, calculated would be ${auto}`)
      : t('valgt i hånden', 'chosen by hand')
  }
  return auto ? t('beregnet', 'calculated') : t('sættes når Received er udfyldt', 'set when Received is filled in')
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
