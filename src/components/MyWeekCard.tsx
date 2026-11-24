import { useEffect, useMemo, useState } from 'react'
import { Airplane, Baby, Books, CalendarBlank, CalendarCheck, ClipboardText, FirstAidKit, House, Lightbulb, ListChecks, type Icon } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { useLanguage } from '@/contexts/LanguageContext'
import { useHubNotifications } from '@/contexts/HubNotificationsContext'
import { useKV } from '@/hooks/useKV'
import { navigateTo } from '@/lib/appNavigation'
import { getWeekNumber, parseLocalDate } from '@/lib/dateUtils'
import { buildMyWeek, visibleWeekDays, type MyWeekItem, type MyWeekItemKind, type MyWeekSize } from '@/lib/myWeek'
import { getMyWeekLabels, myWeekItemText } from '@/lib/myWeekLabels'
import { formatShiftTime } from '@/lib/shiftTimes'
import { MyWeekQuickAdd } from '@/components/MyWeekQuickAdd'
import { cn } from '@/lib/utils'
import type { HomeOfficeException, HomeOfficePattern, ShiftAssignment, ShiftPatternRule, ShiftRole, SickLeaveEntry, VacationEntry } from '@/lib/types'

const READ_ONLY = { initializeIfMissing: false } as const

const ICONS: Record<MyWeekItemKind, { icon: Icon; tone: string }> = {
  shift: { icon: ClipboardText, tone: 'text-primary' },
  vacation: { icon: Airplane, tone: 'text-ok' },
  dayOff: { icon: Airplane, tone: 'text-ok' },
  parental: { icon: Baby, tone: 'text-ok' },
  sick: { icon: FirstAidKit, tone: 'text-blocked' },
  homeOffice: { icon: House, tone: 'text-accent' },
  event: { icon: CalendarBlank, tone: 'text-primary' },
  todo: { icon: ListChecks, tone: 'text-attention' },
  review: { icon: Books, tone: 'text-attention' },
  improvement: { icon: Lightbulb, tone: 'text-ok' },
}

const DATE_LOCALES = { da: 'da-DK', fi: 'fi-FI', sv: 'sv-SE', en: 'en-GB' } as const

/** Hub card: my own week (Monday-Sunday) - shifts, time off, home office, deadlines - each line opens its module. */
export function MyWeekCard({ userEmail, size = 'standard', className }: { userEmail: string; size?: MyWeekSize; className?: string }) {
  const { language } = useLanguage()
  const labels = getMyWeekLabels(language)
  const locale = DATE_LOCALES[language] ?? 'en-GB'
  const { searchData } = useHubNotifications()
  const [assignments] = useKV<ShiftAssignment[]>('shift-assignments', [], READ_ONLY)
  const [roles] = useKV<ShiftRole[]>('shift-roles', [], READ_ONLY)
  const [patterns] = useKV<ShiftPatternRule[]>('shift-patterns', [], READ_ONLY)
  const [vacations] = useKV<VacationEntry[]>('vacation-entries', [], READ_ONLY)
  const [sickLeave] = useKV<SickLeaveEntry[]>('sick-leave-entries', [], READ_ONLY)
  const [homeOfficePatterns] = useKV<Record<string, HomeOfficePattern>>('home-office-patterns', {}, READ_ONLY)
  const [homeOfficeExceptions] = useKV<HomeOfficeException[]>('home-office-exceptions', [], READ_ONLY)

  // One local timer per day (no network): rolls "today" over at midnight.
  const [dayTick, setDayTick] = useState(0)
  useEffect(() => {
    const midnight = new Date()
    midnight.setHours(24, 0, 5, 0)
    const timer = setTimeout(() => setDayTick(tick => tick + 1), midnight.getTime() - Date.now())
    return () => clearTimeout(timer)
  }, [dayTick])

  // dayTick only forces a fresh "now" after midnight.
  const week = useMemo(() => buildMyWeek({
    userEmail, now: new Date(),
    assignments, roles, patterns, vacations, sickLeave, homeOfficePatterns, homeOfficeExceptions,
    personalTodos: searchData.personalTodos, projects: searchData.projects, guides: searchData.guides, improvements: searchData.improvements,
  }), [userEmail, dayTick, assignments, roles, patterns, vacations, sickLeave, homeOfficePatterns, homeOfficeExceptions, searchData])

  const days = visibleWeekDays(week, size)
  const detailed = size === 'large'
  const weekNumber = getWeekNumber(parseLocalDate(week.start))
  const dayName = (date: string) => parseLocalDate(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
  const today = week.days.find(day => day.isToday)

  return (
    <Card id="my-week-card" data-size={size} role="region" aria-labelledby="my-week-heading" className={cn('p-5 md:p-7 bg-card hover:border-primary/40 transition-colors mb-4 md:mb-6', className)}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="p-2 md:p-2.5 rounded-md bg-secondary text-primary">
          <CalendarCheck size={24} weight="duotone" aria-hidden="true" />
        </div>
        <h3 id="my-week-heading" className="text-base md:text-lg font-semibold text-foreground">{labels.title}</h3>
        <span className="ml-auto text-xs md:text-sm text-muted-foreground">{labels.week(weekNumber)}</span>
      </div>

      {week.empty ? (
        <p data-my-week-empty className="flex items-center justify-center gap-2 py-2 text-center text-sm text-muted-foreground md:text-base">
          {labels.nothing}
          {today && <MyWeekQuickAdd userEmail={userEmail} date={today.date} dayName={dayName(today.date)} labels={labels} />}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {days.map(day => (
            <li
              key={day.date}
              data-my-week-day={day.date}
              data-today={day.isToday ? 'true' : undefined}
              className={cn(
                'grid grid-cols-[7.5rem_1fr] items-start gap-x-3 gap-y-1 rounded-md border-l-4 px-2 py-1.5 sm:grid-cols-[10rem_1fr]',
                day.isToday ? 'border-primary bg-secondary' : 'border-transparent',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className={cn('text-xs font-medium first-letter:uppercase md:text-sm', day.isToday ? 'text-foreground' : day.isPast || day.isWeekend ? 'text-muted-foreground' : 'text-foreground')}>
                    {dayName(day.date)}
                  </p>
                  {!day.isPast && <MyWeekQuickAdd userEmail={userEmail} date={day.date} dayName={dayName(day.date)} labels={labels} className="ml-auto" />}
                </div>
                {day.isToday && <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">{labels.today}</span>}
              </div>
              {day.items.length === 0 ? (
                <span className="text-sm text-muted-foreground" aria-label={labels.emptyDay} role="img">—</span>
              ) : (
                <ul className="flex min-w-0 flex-col gap-0.5">
                  {day.items.map(item => <MyWeekRow key={item.id} item={item} labels={labels} detailed={detailed} />)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function MyWeekRow({ item, labels, detailed }: { item: MyWeekItem; labels: ReturnType<typeof getMyWeekLabels>; detailed: boolean }) {
  const { icon: ItemIcon, tone } = ICONS[item.kind]
  const { label, detail } = myWeekItemText(labels, item)
  const time = formatShiftTime(item)
  return (
    <li>
      <button
        type="button"
        data-my-week-item={item.id}
        data-kind={item.kind}
        title={[time, label, detail].filter(Boolean).join(' · ')}
        onClick={() => navigateTo(item.target.view, item.target.params)}
        className="flex w-full min-w-0 items-start gap-2 rounded-md border-l-[3px] px-2 py-1 text-left transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        style={{ borderLeftColor: item.color ?? 'transparent' }}
      >
        <ItemIcon size={16} weight="duotone" className={cn('mt-0.5 shrink-0', item.overdue ? 'text-blocked' : tone)} aria-hidden="true" />
        {time && <span data-my-week-time className="shrink-0 pt-px text-xs font-medium tabular-nums text-muted-foreground md:text-sm">{time}</span>}
        <span className="min-w-0">
          <span className="block break-words text-xs text-foreground md:text-sm">{label}</span>
          {detailed && detail && <span className="block text-[11px] text-muted-foreground">{detail}</span>}
        </span>
        {item.pending && <span className="shrink-0 rounded-sm bg-attention-surface px-1.5 text-[11px] font-medium text-attention">{labels.pending}</span>}
        {item.overdue && <span className="shrink-0 rounded-sm bg-blocked-surface px-1.5 text-[11px] font-medium text-blocked">{labels.overdue}</span>}
      </button>
    </li>
  )
}
