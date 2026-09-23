import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarBlank, CalendarDot, House } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/contexts/LanguageContext'
import { getWeekNumber as getISOWeekNumber, parseLocalDate } from '@/lib/dateUtils'
import { getEmployeeColorByEmail } from '@/lib/employeeColors'
import { getHomeOfficeUsersForDate } from '@/lib/homeOffice'
import { isAnyModalOpen } from '@/lib/modalStack'
import { cn } from '@/lib/utils'
import type { AccessView, RegisteredTeam } from '@/lib/electronRegistryBridge'
import type { BirthdayEntry, HomeOfficeException, HomeOfficePattern, VacationEntry } from '@/lib/types'

type CalendarUser = { fullName?: string; status?: string }

export interface ObserverCalendarTeam {
  team: RegisteredTeam
  users: Record<string, CalendarUser>
  birthdays: BirthdayEntry[]
  patterns: Record<string, HomeOfficePattern>
  exceptions: HomeOfficeException[]
}

export type ObserverVacation = VacationEntry & {
  team: RegisteredTeam
  name: string
}

interface ObserverVacationCalendarProps {
  view: AccessView
  teams: ObserverCalendarTeam[]
  vacations: ObserverVacation[]
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

export function ObserverVacationCalendar({ view, teams, vacations }: ObserverVacationCalendarProps) {
  const { language, t } = useLanguage()
  const da = language === 'da'
  const fi = language === 'fi'
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [detailDay, setDetailDay] = useState<number | null>(null)

  useEffect(() => {
    const handleMonthNavigation = (event: KeyboardEvent) => {
      if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || isAnyModalOpen()) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"], [role="combobox"], [role="listbox"]')) return

      event.preventDefault()
      const offset = event.key === 'ArrowLeft' ? -1 : 1
      setSelectedMonth((currentMonth) => {
        const nextMonth = currentMonth + offset
        if (nextMonth < 0) {
          setSelectedYear((currentYear) => currentYear - 1)
          return 11
        }
        if (nextMonth > 11) {
          setSelectedYear((currentYear) => currentYear + 1)
          return 0
        }
        return nextMonth
      })
    }

    window.addEventListener('keydown', handleMonthNavigation)
    return () => window.removeEventListener('keydown', handleMonthNavigation)
  }, [])

  const months = [
    t.shifts.months.january, t.shifts.months.february, t.shifts.months.march, t.shifts.months.april,
    t.shifts.months.may, t.shifts.months.june, t.shifts.months.july, t.shifts.months.august,
    t.shifts.months.september, t.shifts.months.october, t.shifts.months.november, t.shifts.months.december,
  ]
  const weekdays = da
    ? ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']
    : fi
      ? ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const approvedVacations = useMemo(() => vacations.filter((vacation) => vacation.status === 'approved'), [vacations])
  const members = useMemo(() => teams.flatMap((entry) => Object.entries(entry.users)
    .filter(([, user]) => user.status !== 'rejected')
    .map(([email, user]) => ({
      email,
      name: user.fullName || email,
      team: entry.team,
    }))).sort((left, right) => left.name.localeCompare(right.name)), [teams])

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()
  const nativeFirstDay = new Date(selectedYear, selectedMonth, 1).getDay()
  const firstDay = nativeFirstDay === 0 ? 6 : nativeFirstDay - 1
  const weekCount = Math.ceil((firstDay + daysInMonth) / 7)

  const vacationsForDay = (day: number) => {
    const checkDate = new Date(selectedYear, selectedMonth, day, 12)
    return approvedVacations.filter((vacation) => {
      const start = parseLocalDate(vacation.startDate)
      const end = parseLocalDate(vacation.endDate)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      return checkDate >= start && checkDate <= end
    })
  }

  const birthdaysForDay = (day: number) => {
    const dateKey = `${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return teams.flatMap((entry) => entry.birthdays
      .filter((birthday) => birthday.birthday === dateKey)
      .map((birthday) => ({ ...birthday, team: entry.team })))
  }

  const homeOfficeForDay = (day: number) => {
    const date = new Date(selectedYear, selectedMonth, day)
    return teams.flatMap((entry) => {
      const activeEmails = Object.entries(entry.users)
        .filter(([, user]) => user.status !== 'rejected')
        .map(([email]) => email)
      return getHomeOfficeUsersForDate(activeEmails, date, entry.patterns, entry.exceptions)
        .map((email) => ({
          email,
          name: entry.users[email]?.fullName || email,
          team: entry.team,
        }))
    })
  }

  const jumpToToday = () => {
    const today = new Date()
    setSelectedMonth(today.getMonth())
    setSelectedYear(today.getFullYear())
  }

  const selectedDayVacations = detailDay === null ? [] : vacationsForDay(detailDay)
  const selectedDayHomeOffice = detailDay === null ? [] : homeOfficeForDay(detailDay)
  const locale = da ? 'da-DK' : fi ? 'fi-FI' : 'en-US'
  const weekLabel = da ? 'Uge' : fi ? 'Viikko' : 'Week'
  const closedLabel = da ? 'Lukket' : fi ? 'Suljettu' : 'Closed'
  const todayLabel = da ? 'I dag' : fi ? 'Tänään' : 'Today'
  const noVacations = da ? 'Ingen godkendte ferier i denne måned' : fi ? 'Ei hyväksyttyjä lomia tässä kuussa' : 'No approved vacations this month'
  const approvedThisMonth = approvedVacations.some((vacation) => {
    const start = parseLocalDate(vacation.startDate)
    const end = parseLocalDate(vacation.endDate)
    const monthStart = new Date(selectedYear, selectedMonth, 1)
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999)
    return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= monthEnd && end >= monthStart
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <CalendarBlank size={30} weight="duotone" className="text-primary" />
            <div>
              <h2 className="text-2xl font-bold">{da ? 'Kalender' : fi ? 'Kalenteri' : 'Calendar'}</h2>
              <p className="text-sm text-muted-foreground">{view.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={String(selectedMonth)} onValueChange={(value) => setSelectedMonth(Number.parseInt(value, 10))}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((month, index) => <SelectItem key={month} value={String(index)}>{month}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number.parseInt(value, 10))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, index) => now.getFullYear() - 2 + index)
                  .map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={jumpToToday} className="gap-2">
              <CalendarDot size={18} weight="fill" />{todayLabel}
            </Button>
            <Badge variant="secondary">{da ? 'Kun læsning' : fi ? 'Vain luku' : 'Read only'}</Badge>
          </div>
        </div>

        {!approvedThisMonth && <p className="mb-4 rounded-lg bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">{noVacations}</p>}

        <Dialog open={detailDay !== null} onOpenChange={(open) => !open && setDetailDay(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {detailDay !== null && new Date(selectedYear, selectedMonth, detailDay).toLocaleDateString(locale, {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {selectedDayVacations.map((vacation) => {
                const color = getEmployeeColorByEmail(`${vacation.team.teamId}:${vacation.userEmail}`)
                return (
                  <div key={`${vacation.team.teamId}-${vacation.id}`} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: color.bg, color: color.text }}>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{vacation.name}</span>
                      {vacation.notes && <span className="block text-xs opacity-80 truncate">{vacation.notes}</span>}
                    </span>
                    <Badge variant="outline" className="bg-background/70 text-foreground shrink-0">{vacation.team.abbreviation || vacation.team.teamId}</Badge>
                  </div>
                )
              })}
              {selectedDayHomeOffice.map((member, idx) => (
                <div key={`ho-${member.team.teamId}-${idx}`} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                  <House size={16} weight="fill" className="flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{member.name}</span>
                  <Badge variant="outline" className="bg-background/70 text-foreground shrink-0">{member.team.abbreviation || member.team.teamId}</Badge>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-8 gap-1.5 sm:gap-2 min-w-[720px]">
            <div className="text-center font-semibold text-sm py-2 text-muted-foreground">{weekLabel}</div>
            {weekdays.map((day, index) => (
              <div key={day} className={cn('text-center font-semibold text-sm py-2', index >= 5 ? 'text-muted-foreground/60' : 'text-muted-foreground')}>{day}</div>
            ))}

            {Array.from({ length: weekCount }, (_, weekIndex) => {
              const firstDateOfWeek = new Date(selectedYear, selectedMonth, weekIndex * 7 - firstDay + 1)
              return (
                <React.Fragment key={`week-${weekIndex}`}>
                  <div className="flex items-center justify-center text-sm font-bold text-muted-foreground border rounded-lg bg-muted/30">{getISOWeekNumber(firstDateOfWeek)}</div>
                  {Array.from({ length: 7 }, (_, dayIndex) => {
                    const cellIndex = weekIndex * 7 + dayIndex
                    const day = cellIndex - firstDay + 1
                    if (cellIndex < firstDay || day > daysInMonth) return <div key={`empty-${cellIndex}`} className="aspect-square" />

                    const date = new Date(selectedYear, selectedMonth, day)
                    const dayVacations = vacationsForDay(day)
                    const dayBirthdays = birthdaysForDay(day)
                    const dayHomeOffice = homeOfficeForDay(day)
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6
                    const isToday = day === now.getDate() && selectedMonth === now.getMonth() && selectedYear === now.getFullYear()
                    const vacationLimit = dayBirthdays.length > 0 ? 2 : 3

                    return (
                      <div
                        key={day}
                        onClick={() => (dayVacations.length > 0 || dayHomeOffice.length > 0) && setDetailDay(day)}
                        className={cn(
                          'aspect-square border rounded-lg p-1 relative overflow-hidden',
                          isToday && 'ring-2 ring-primary',
                          isWeekend && 'bg-muted/50 opacity-60',
                          (dayVacations.length > 0 || dayHomeOffice.length > 0) && 'cursor-pointer hover:ring-2 hover:ring-primary/50',
                        )}
                      >
                        <div className={cn('text-xs font-semibold mb-1', isWeekend && 'text-muted-foreground')}>{day}</div>
                        <div className="space-y-0.5">
                          {dayBirthdays.length > 0 && (
                            <div className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300 truncate" title={dayBirthdays.map((birthday) => `${birthday.fullName} · ${birthday.team.abbreviation || birthday.team.teamId}`).join(', ')}>
                              🎂 {dayBirthdays.length === 1 ? firstName(dayBirthdays[0].fullName) : `${dayBirthdays.length} ${da ? 'fødselsdage' : fi ? 'syntymäpäivää' : 'birthdays'}`}
                            </div>
                          )}
                          {isWeekend && dayBirthdays.length === 0 ? (
                            <div className="text-[8px] text-muted-foreground text-center mt-2">{closedLabel}</div>
                          ) : !isWeekend && (
                            <>
                              {dayVacations.slice(0, vacationLimit).map((vacation) => {
                                const color = getEmployeeColorByEmail(`${vacation.team.teamId}:${vacation.userEmail}`)
                                const teamCode = vacation.team.abbreviation || vacation.team.teamId
                                return (
                                  <div key={`${vacation.team.teamId}-${vacation.id}`} className="text-[10px] px-1.5 py-0.5 rounded truncate font-semibold" style={{ backgroundColor: color.bg, color: color.text }} title={`${vacation.name} · ${vacation.team.name}${vacation.notes ? `: ${vacation.notes}` : ''}`}>
                                    {firstName(vacation.name)} · {teamCode}
                                  </div>
                                )
                              })}
                              {dayVacations.length > vacationLimit && (
                                <div className="text-[9px] text-muted-foreground underline">+{dayVacations.length - vacationLimit} {da ? 'se alle' : fi ? 'katso kaikki' : 'see all'}</div>
                              )}
                              {dayHomeOffice.slice(0, vacationLimit).map((member, idx) => (
                                <div key={`ho-${member.team.teamId}-${idx}`} className="text-[10px] px-1.5 py-0.5 rounded truncate font-semibold bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 flex items-center gap-0.5" title={`${member.name} · ${member.team.name}${da ? ' arbejder hjemme' : fi ? ' työskentelee etänä' : ' works from home'}`}>
                                  <House size={10} weight="fill" className="flex-shrink-0" /><span className="truncate">{firstName(member.name)} · {member.team.abbreviation || member.team.teamId}</span>
                                </div>
                              ))}
                              {dayHomeOffice.length > vacationLimit && (
                                <div className="text-[9px] text-sky-700 dark:text-sky-300 underline" title={dayHomeOffice.map((member) => `${member.name} · ${member.team.abbreviation || member.team.teamId}`).join(', ')}>+{dayHomeOffice.length - vacationLimit} {da ? 'hjemme' : fi ? 'etänä' : 'home'}</div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </Card>

      {members.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h3 className="text-xl font-bold mb-4">{da ? 'Alle teammedlemmer' : fi ? 'Kaikki tiimin jäsenet' : 'All team members'}</h3>
          <div className="flex flex-wrap gap-3">
            {members.map((member) => {
              const color = getEmployeeColorByEmail(`${member.team.teamId}:${member.email}`)
              return (
                <div key={`${member.team.teamId}-${member.email}`} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: color.bg, color: color.text }}>{member.name.charAt(0).toUpperCase()}</div>
                  <span className="text-sm font-medium">{firstName(member.name)}</span>
                  <Badge variant="outline">{member.team.abbreviation || member.team.teamId}</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </motion.div>
  )
}
