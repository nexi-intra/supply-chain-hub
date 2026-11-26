import { CaretLeft, CaretRight, Users } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dayTitle, isoDay, monthGrid, monthRange, monthTitle, parseIso, weekdayHeaders } from '@/lib/warehouse/finlandDates'
import { kolli } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import type { FinlandFollowUpView } from '@/types/finland'
import { othersOnDay } from './followUpLogic'

type Status = FinlandFollowUpView['days'][number]['status']
const STATUS: Record<Status, string> = {
  done: 'border-ok/40 bg-ok-surface',
  some: 'border-attention/40 bg-attention-surface',
  open: 'border-primary/25 bg-primary/5',
}

interface FollowUpCalendarProps {
  view: FinlandFollowUpView
  today: string
  selected: string | null
  /** Index into the months from the first day to today; null: the selected day's month, or the last. */
  month: number | null
  onSelect: (date: string) => void
  onMonth: (index: number) => void
}

/** Opfølgning's calendar: how far each pick-up day is followed up, own changes not saved, and colleagues'. */
export function FollowUpCalendar({ view, today, selected, month, onSelect, onMonth }: FollowUpCalendarProps) {
  const byDate = new Map(view.days.map(day => [day.date, day]))
  const first = view.days.map(day => day.date).sort()[0]
  const months = first ? monthRange(first, today > first ? today : first) : []
  const selectedMonth = selected ? months.findIndex(m => m.year === parseIso(selected).getFullYear() && m.month === parseIso(selected).getMonth()) : -1
  const index = months.length ? Math.max(0, Math.min(month ?? (selectedMonth >= 0 ? selectedMonth : months.length - 1), months.length - 1)) : 0
  const shown = months[index]

  return (
    <section aria-label={t('Kalender', 'Calendar')} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label={t('Forrige måned', 'Previous month')} disabled={!months.length || index === 0} onClick={() => onMonth(index - 1)}><CaretLeft /></Button>
        <h2 className="text-base font-semibold">{shown ? monthTitle(shown.year, shown.month) : '\u00a0'}</h2>
        <Button variant="ghost" size="icon" aria-label={t('Næste måned', 'Next month')} disabled={!months.length || index === months.length - 1} onClick={() => onMonth(index + 1)}><CaretRight /></Button>
      </div>
      {shown && (
        <>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground" aria-hidden="true">
            {weekdayHeaders().map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={t('Dage', 'Days')}>
            {monthGrid(shown.year, shown.month).flat().map((n, cell) => {
              if (!n) return <div key={`out-${cell}`} aria-hidden="true" />
              const date = isoDay(shown.year, shown.month, n)
              const info = byDate.get(date)
              const number = <span className={cn('text-[13px] font-semibold', date === today && 'text-primary underline underline-offset-4')}>{n}</span>
              if (!info) return <div key={date} className="flex h-12 items-start rounded-lg border border-dashed p-1 text-muted-foreground/70">{number}</div>
              const own = view.pendingByDay[date] || 0
              const others = othersOnDay(view.othersByDay[date])
              const othersCount = (view.othersByDay[date] ?? []).reduce((sum, o) => sum + o.count, 0)
              const label = t(`${dayTitle(date)}: ${info.done} af ${kolli(info.total)} fulgt op`, `${dayTitle(date)}: ${info.done} of ${kolli(info.total)} followed up`)
              return (
                <button
                  key={date}
                  type="button"
                  data-date={date}
                  aria-pressed={date === selected}
                  aria-label={others.length ? `${label}. ${others.join(' ')}` : label}
                  onClick={() => onSelect(date)}
                  className={cn(
                    'relative flex h-12 items-start overflow-hidden rounded-lg border p-1 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    STATUS[info.status],
                    date === selected && 'border-primary ring-2 ring-primary',
                  )}
                >
                  {number}
                  {own > 0 && (
                    <span title={t(`${own} ændringer er ikke gemt i arket`, `${own} changes not saved in the sheet`)} className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-primary-foreground">{own}</span>
                  )}
                  {othersCount > 0 && (
                    <span title={others.join(' ')} className="absolute bottom-0.5 left-1 flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                      <Users aria-hidden="true" className="size-3" />{othersCount}
                    </span>
                  )}
                  <span className="absolute bottom-0.5 right-1 text-[11px] font-semibold tabular-nums">{info.done === info.total ? '✓' : info.total - info.done}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-2"><i className="inline-block size-3.5 rounded border border-ok/40 bg-ok-surface" />{t('Alt fulgt op', 'All followed up')}</li>
        <li className="flex items-center gap-2"><i className="inline-block size-3.5 rounded border border-attention/40 bg-attention-surface" />{t('Nogle fulgt op', 'Some followed up')}</li>
        <li className="flex items-center gap-2"><i className="inline-block size-3.5 rounded border border-primary/25 bg-primary/5" />{t('Ingen fulgt op', 'None followed up')}</li>
        <li className="flex items-center gap-2"><Users aria-hidden="true" className="size-3.5" />{t('Kollegaers ikke gemte kolli', "Colleagues' parcels not saved")}</li>
      </ul>
    </section>
  )
}
