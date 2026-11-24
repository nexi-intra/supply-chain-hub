// Pure model of "Min uge": the signed-in user's own Monday-Sunday week, built from data the Hub already holds.
import type { NavigationTarget } from './appNavigation'
import { isWorkingDay } from './absence'
import { parseLocalDate, toIsoDateString } from './dateUtils'
import { getReviewStatus, type Guide } from './guideTypes'
import { isHomeOfficeOnDate } from './homeOffice'
import type { ImprovementCase } from './improvements'
import type { PersonalTodo } from './personalTodos'
import { expandShiftPatterns } from './shiftPatterns'
import { resolveShiftTime } from './shiftTimes'
import type { HomeOfficeException, HomeOfficePattern, ShiftAssignment, ShiftPatternRule, ShiftRole, SickLeaveEntry, VacationEntry } from './types'

export type MyWeekItemKind = 'shift' | 'vacation' | 'dayOff' | 'parental' | 'sick' | 'homeOffice' | 'event' | 'todo' | 'review' | 'improvement'
export type MyWeekItemVariant = 'personal' | 'team' | 'due' | 'respond' | 'feedback'
export type MyWeekSize = 'compact' | 'standard' | 'large'

export interface MyWeekItem {
  id: string
  kind: MyWeekItemKind
  /** Role, to-do, guide or improvement title; empty for items that are only a kind (and for a shift whose role is gone). */
  title: string
  /** Shift role colour. */
  color?: string
  variant?: MyWeekItemVariant
  /** A vacation or day-off request that is not approved yet. */
  pending?: boolean
  overdue?: boolean
  /** 'HH:mm'; items without a start time are all-day. */
  startTime?: string
  endTime?: string
  target: NavigationTarget
}

export interface MyWeekDay {
  date: string
  isToday: boolean
  isPast: boolean
  isWeekend: boolean
  items: MyWeekItem[]
}

export interface MyWeek {
  start: string
  end: string
  days: MyWeekDay[]
  /** True when nothing at all is planned this week. */
  empty: boolean
}

interface MyWeekProject {
  id: string
  title: string
  status?: string
  dueDate?: string
  startTime?: string
  endTime?: string
  createdBy: string
  teamMembers?: ReadonlyArray<{ email: string }>
}

type Maybe<T> = readonly T[] | null | undefined

export interface MyWeekInput {
  userEmail: string
  now: Date
  assignments?: Maybe<ShiftAssignment>
  roles?: Maybe<ShiftRole>
  patterns?: Maybe<ShiftPatternRule>
  vacations?: Maybe<VacationEntry>
  sickLeave?: Maybe<SickLeaveEntry>
  homeOfficePatterns?: Record<string, HomeOfficePattern> | null
  homeOfficeExceptions?: Maybe<HomeOfficeException>
  personalTodos?: Maybe<PersonalTodo>
  projects?: Maybe<MyWeekProject>
  guides?: Maybe<Guide>
  improvements?: Maybe<ImprovementCase>
}

const KIND_ORDER: Record<MyWeekItemKind, number> = { sick: 0, vacation: 1, parental: 1, dayOff: 1, shift: 2, homeOffice: 3, event: 4, todo: 4, review: 5, improvement: 6 }

// All-day items first (by kind), then timed items by the clock.
const byDayOrder = (a: MyWeekItem, b: MyWeekItem) =>
  (a.startTime ? 1 : 0) - (b.startTime ? 1 : 0)
  || (a.startTime ?? '').localeCompare(b.startTime ?? '')
  || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)

const normalize = (value: string | undefined | null) => String(value ?? '').trim().toLowerCase()
const dateOf = (value: string) => value.slice(0, 10)

/** The seven dates ('yyyy-MM-dd', local time) of the Monday-Sunday week containing `now`. */
export function myWeekDates(now: Date): string[] {
  const isoDay = now.getDay() || 7
  return Array.from({ length: 7 }, (_, index) => toIsoDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - isoDay + 1 + index)))
}

export function buildMyWeek(input: MyWeekInput): MyWeek {
  const me = normalize(input.userEmail)
  const dates = myWeekDates(input.now)
  const today = toIsoDateString(input.now)
  const start = dates[0]
  const end = dates[6]
  const buckets = new Map<string, MyWeekItem[]>(dates.map(date => [date, []]))
  const add = (date: string, item: MyWeekItem) => { buckets.get(date)?.push(item) }
  /** The day a deadline shows on: its own day, today when it passed before this week, nothing when it lies after the week. */
  const placeDeadline = (due: string | undefined | null): { date: string; overdue: boolean } | null => {
    if (!due) return null
    const day = dateOf(due)
    if (day > end) return null
    return day < start ? { date: today, overdue: true } : { date: day, overdue: day < today }
  }

  const myVacations = (input.vacations || []).filter(entry => normalize(entry.userEmail) === me && entry.status !== 'rejected' && dateOf(entry.startDate) <= dateOf(entry.endDate))
  const mySick = (input.sickLeave || []).filter(entry => normalize(entry.userEmail) === me && entry.status === 'approved')
  const sickEnd = (entry: SickLeaveEntry) => dateOf(entry.endDate && dateOf(entry.endDate) >= dateOf(entry.startDate) ? entry.endDate : entry.startDate)
  const isAway = (date: string) =>
    myVacations.some(entry => entry.status === 'approved' && dateOf(entry.startDate) <= date && date <= dateOf(entry.endDate))
    || mySick.some(entry => dateOf(entry.startDate) <= date && date <= sickEnd(entry))
  // A multi-day absence is not listed on weekends and holidays unless it starts or ends there.
  const showsOn = (from: string, to: string, date: string) => from <= date && date <= to && (isWorkingDay(date) || date === from || date === to)

  const roleById = new Map((input.roles || []).map(role => [role.id, role]))
  const myAssignments = (input.assignments || []).filter(entry => normalize(entry.employeeId) === me)
  const myPatterns = (input.patterns || []).filter(entry => normalize(entry.employeeId) === me)
  for (const date of dates) {
    const real = myAssignments.filter(entry => entry.date === date)
    const derived = expandShiftPatterns(myPatterns, myAssignments, date, () => isAway(date))
    for (const shift of [...real, ...derived]) {
      const role = roleById.get(shift.roleId)
      const time = resolveShiftTime(shift, role)
      add(date, { id: `shift-${shift.id}`, kind: 'shift', title: role?.name ?? '', color: role?.color, ...time, target: { view: 'shifts' } })
    }
  }

  for (const entry of myVacations) {
    const kind: MyWeekItemKind = entry.type === 'parental' ? 'parental' : entry.isSingleDay ? 'dayOff' : 'vacation'
    const from = dateOf(entry.startDate)
    const to = dateOf(entry.endDate)
    for (const date of dates) {
      if (showsOn(from, to, date)) add(date, { id: `${kind}-${entry.id}-${date}`, kind, title: '', pending: entry.status === 'pending', target: { view: 'calendar' } })
    }
  }

  for (const entry of mySick) {
    const from = dateOf(entry.startDate)
    const to = sickEnd(entry)
    for (const date of dates) {
      if (showsOn(from, to, date)) add(date, { id: `sick-${entry.id}-${date}`, kind: 'sick', title: '', target: { view: 'calendar' } })
    }
  }

  for (const date of dates) {
    if (isAway(date)) continue
    if (isHomeOfficeOnDate(input.userEmail, parseLocalDate(date), input.homeOfficePatterns, input.homeOfficeExceptions as HomeOfficeException[] | null | undefined)) {
      add(date, { id: `home-${date}`, kind: 'homeOffice', title: '', target: { view: 'calendar' } })
    }
  }

  // A carried-over deadline loses its time: it is no longer on that day.
  const timeOn = (place: { date: string }, due: string | undefined, time: { startTime?: string; endTime?: string }) =>
    due && place.date === dateOf(due) ? resolveShiftTime(time, undefined) : null

  for (const todo of input.personalTodos || []) {
    const target: NavigationTarget = { view: 'projects', params: { tab: 'personal' } }
    if (todo.kind === 'event') {
      const date = todo.dueDate ? dateOf(todo.dueDate) : ''
      if (buckets.has(date)) add(date, { id: `event-${todo.id}`, kind: 'event', title: todo.title, overdue: false, ...resolveShiftTime(todo, undefined), target })
      continue
    }
    if ((todo.status ?? (todo.done ? 'completed' : 'open')) === 'completed') continue
    const place = placeDeadline(todo.dueDate)
    if (place) add(place.date, { id: `todo-personal-${todo.id}`, kind: 'todo', title: todo.title, variant: 'personal', overdue: place.overdue, ...timeOn(place, todo.dueDate, todo), target })
  }

  for (const project of input.projects || []) {
    if (project.status === 'completed') continue
    if (normalize(project.createdBy) !== me && !(project.teamMembers || []).some(member => normalize(member.email) === me)) continue
    const place = placeDeadline(project.dueDate)
    if (place) add(place.date, { id: `todo-team-${project.id}`, kind: 'todo', title: project.title, variant: 'team', overdue: place.overdue, ...timeOn(place, project.dueDate, project), target: { view: 'projects', params: { tab: 'team', search: project.title } } })
  }

  // Same owner rule as the Hub's review alert: the responsible person, or the author when nobody is set.
  for (const guide of input.guides || []) {
    if (!guide.reviewIntervalMonths || !guide.nextReviewAt || normalize(guide.responsibleEmail || guide.author) !== me) continue
    const place = placeDeadline(toIsoDateString(new Date(guide.nextReviewAt)))
    if (place) add(place.date, { id: `review-${guide.id}`, kind: 'review', title: guide.title, overdue: place.overdue || getReviewStatus(guide, input.now.getTime()) === 'overdue', target: { view: 'guides', params: { itemId: guide.id } } })
  }

  for (const entry of input.improvements || []) {
    if (entry.deletedAt || entry.status === 'completed' || entry.status === 'declined') continue
    const mine = (entry.assignments || []).filter(assignment => normalize(assignment.email) === me && assignment.status !== 'declined')
    if (!mine.length) continue
    const target: NavigationTarget = { view: 'improvements', params: { itemId: entry.id } }
    const push = (variant: MyWeekItemVariant, due: string | undefined) => {
      const place = placeDeadline(due)
      if (place) add(place.date, { id: `improvement-${entry.id}-${variant}`, kind: 'improvement', title: entry.title, variant, overdue: place.overdue, target })
    }
    push('due', entry.dueDate)
    push('feedback', entry.feedbackDueDate)
    const pending = mine.find(assignment => assignment.status === 'pending' && assignment.responseDueDate)
    if (pending) push('respond', pending.responseDueDate)
  }

  const days = dates.map<MyWeekDay>(date => ({
    date,
    isToday: date === today,
    isPast: date < today,
    isWeekend: [0, 6].includes(parseLocalDate(date).getDay()),
    items: (buckets.get(date) || []).sort(byDayOrder),
  }))
  return { start, end, days, empty: days.every(day => day.items.length === 0) }
}

/** Compact shows today and the next two days; the other sizes show the whole week. */
export function visibleWeekDays(week: MyWeek, size: MyWeekSize): MyWeekDay[] {
  if (size !== 'compact') return week.days
  const index = week.days.findIndex(day => day.isToday)
  return week.days.slice(Math.max(index, 0), Math.max(index, 0) + 3)
}
