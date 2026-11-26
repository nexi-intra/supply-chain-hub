import { useEffect, useRef, type KeyboardEvent } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dayTitle, dottedDate, isoDay, isoOf, monthGrid, monthRange, monthTitle, parseIso, weekdayHeaders } from '@/lib/warehouse/finlandDates'
import { kolli } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import type { FinlandDay } from '@/types/finland'

const STATUS: Record<FinlandDay['status'], string> = {
  full: 'border-ok/40 bg-ok-surface',
  partial: 'border-attention/40 bg-attention-surface',
  none: 'border-blocked/40 bg-blocked-surface',
}
const FILL: Record<FinlandDay['status'], string> = { full: 'bg-ok', partial: 'bg-attention', none: 'bg-ok' }

interface CalendarProps {
  days: FinlandDay[]
  /** The SAP period (yyyy-mm-dd); null before "Hent fra SAP": the calendar shows this month without days. */
  range: { from: string; to: string } | null
  today: string
  selected: string | null
  /** Index into the period's months; null: the selected day's month, or the last. */
  month: number | null
  loading: boolean
  onSelect: (date: string) => void
  onMonth: (index: number) => void
}

/** The month calendar of Skriv ind: a colour per day with parcels in SAP, as Finland T&T. */
export function Calendar({ days, range, today, selected, month, loading, onSelect, onMonth }: CalendarProps) {
  const byDate = new Map(days.map(day => [day.date, day]))
  const months = range ? monthRange(range.from, range.to) : []
  const now = parseIso(today || isoOf(new Date()))
  const selectedMonth = selected ? months.findIndex(m => m.year === parseIso(selected).getFullYear() && m.month === parseIso(selected).getMonth()) : -1
  const index = months.length ? Math.max(0, Math.min(month ?? (selectedMonth >= 0 ? selectedMonth : months.length - 1), months.length - 1)) : 0
  const shown = months.length ? months[index] : { year: now.getFullYear(), month: now.getMonth() }
  const grid = useRef<HTMLDivElement>(null)
  const focusNext = useRef<string | null>(null)

  useEffect(() => {
    if (!focusNext.current) return
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focusNext.current}"]`)?.focus()
    focusNext.current = null
  })

  // Arrow keys move the selected day while a day has focus, as in Finland T&T.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
    if (!step || !selected || !range) return
    event.preventDefault()
    const d = parseIso(selected)
    d.setDate(d.getDate() + step)
    const next = isoOf(d)
    if (next < range.from || next > today) return
    const nextIndex = months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth())
    if (nextIndex >= 0 && nextIndex !== index) onMonth(nextIndex)
    if (byDate.has(next)) focusNext.current = next
    onSelect(next)
  }

  return (
    <section aria-label={t('Kalender', 'Calendar')} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label={t('Forrige måned', 'Previous month')} disabled={!months.length || index === 0} onClick={() => onMonth(index - 1)}><CaretLeft /></Button>
        <h2 className="text-base font-semibold">{monthTitle(shown.year, shown.month)}</h2>
        <Button variant="ghost" size="icon" aria-label={t('Næste måned', 'Next month')} disabled={!months.length || index === months.length - 1} onClick={() => onMonth(index + 1)}><CaretRight /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground" aria-hidden="true">
        {weekdayHeaders().map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="relative">
        <div ref={grid} className="grid grid-cols-7 gap-1.5" role="grid" aria-label={t('Dage', 'Days')} onKeyDown={onKeyDown}>
          {monthGrid(shown.year, shown.month).flat().map((n, cell) => {
            if (!n) return <div key={`out-${cell}`} aria-hidden="true" />
            const date = isoDay(shown.year, shown.month, n)
            const info = byDate.get(date)
            const weekend = cell % 7 >= 5
            const number = <span className={cn('text-[15px] font-semibold', date === today && 'text-primary underline underline-offset-4')}>{n}</span>
            if (!info) {
              return (
                <div key={date} className={cn('flex aspect-square items-start rounded-lg border border-dashed p-1.5 text-muted-foreground/70', weekend && 'border-transparent')}>
                  {number}
                </div>
              )
            }
            const share = info.total ? info.inSheet.length / info.total : 0
            const isSelected = date === selected
            return (
              <button
                key={date}
                type="button"
                data-date={date}
                aria-pressed={isSelected}
                aria-label={t(`${dayTitle(date)}: ${kolli(info.total)}, ${info.missing.length} mangler`, `${dayTitle(date)}: ${kolli(info.total)}, ${info.missing.length} missing`)}
                onClick={() => onSelect(date)}
                className={cn(
                  'relative flex aspect-square items-start overflow-hidden rounded-lg border p-1.5 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  STATUS[info.status],
                  isSelected && 'border-primary ring-2 ring-primary',
                )}
              >
                {number}
                {info.review.length > 0 && (
                  <span title={t(`${info.review.length} skal tjekkes`, `${info.review.length} to be checked`)} className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-attention text-[11px] font-bold text-white">!</span>
                )}
                <span className="absolute bottom-1 right-1.5 text-[11.5px] font-semibold tabular-nums">{info.total}</span>
                <span className={cn('absolute bottom-0 left-0 h-[3px]', FILL[info.status])} style={{ width: `${Math.round(share * 100)}%` }} />
              </button>
            )
          })}
        </div>
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/85 p-4 text-center text-sm">
            <span className="size-8 animate-spin rounded-full border-4 border-primary/25 border-t-primary" aria-hidden="true" />
            <p>{t('Henter fra SAP og læser arket. Det tager omkring et minut.', 'Fetching from SAP and reading the sheet. It takes about a minute.')}</p>
          </div>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-2"><i className="inline-block size-3.5 rounded border border-ok/40 bg-ok-surface" />{t('Alt står i arket', 'All in the sheet')}</li>
        <li className="flex items-center gap-2"><i className="inline-block size-3.5 rounded border border-attention/40 bg-attention-surface" />{t('Nogle mangler', 'Some missing')}</li>
        <li className="flex items-center gap-2"><i className="inline-block size-3.5 rounded border border-blocked/40 bg-blocked-surface" />{t('Dagen mangler helt', 'The whole day is missing')}</li>
        <li className="flex items-center gap-2"><i className="inline-block size-3.5 rounded border border-dashed" />{t('Ingen kolli i SAP', 'No parcels in SAP')}</li>
      </ul>
      {range && (
        <p className="text-xs text-muted-foreground">
          {t(`SAP-listen dækker leverancer oprettet ${dottedDate(range.from)} til ${dottedDate(range.to)}.`, `The SAP list covers deliveries created ${dottedDate(range.from)} to ${dottedDate(range.to)}.`)}
        </p>
      )}
    </section>
  )
}
