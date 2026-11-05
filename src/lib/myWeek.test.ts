import { describe, expect, it } from 'vitest'
import { buildMyWeek, myWeekDates, visibleWeekDays, type MyWeekInput, type MyWeekItem } from './myWeek'
import type { Guide } from './guideTypes'
import type { ImprovementCase } from './improvements'
import type { HomeOfficeException, HomeOfficePattern, ShiftAssignment, ShiftPatternRule, ShiftRole, SickLeaveEntry, VacationEntry } from './types'

const ME = 'me@example.test'
const OTHER = 'other@example.test'
// Wednesday 14 October 2026; the week is Mon 12 - Sun 18 October.
const WEDNESDAY = new Date(2026, 9, 14, 10, 0, 0)

const roles: ShiftRole[] = [
  { id: 'r-lead', name: 'Lead', color: '#3366cc' },
  { id: 'r-pack', name: 'Pakning', color: '#cc6633' },
]

const input = (overrides: Partial<MyWeekInput> = {}): MyWeekInput => ({
  userEmail: ME,
  now: WEDNESDAY,
  assignments: [],
  roles,
  patterns: [],
  vacations: [],
  sickLeave: [],
  homeOfficePatterns: {},
  homeOfficeExceptions: [],
  personalTodos: [],
  projects: [],
  guides: [],
  improvements: [],
  ...overrides,
})

const assignment = (id: string, date: string, overrides: Partial<ShiftAssignment> = {}): ShiftAssignment =>
  ({ id, employeeId: ME, employeeName: 'Me', roleId: 'r-lead', date, ...overrides })

const pattern = (overrides: Partial<ShiftPatternRule> = {}): ShiftPatternRule =>
  ({ id: 'p1', employeeId: ME, employeeName: 'Me', roleId: 'r-pack', weekdays: [1, 3], intervalWeeks: 1, anchorDate: '2026-09-01', ...overrides })

const vacation = (overrides: Partial<VacationEntry> = {}): VacationEntry =>
  ({ id: 'v1', userId: ME, userEmail: ME, startDate: '2026-10-13', endDate: '2026-10-14', status: 'approved', ...overrides })

const sick = (overrides: Partial<SickLeaveEntry> = {}): SickLeaveEntry =>
  ({ id: 's1', userEmail: ME, userName: 'Me', startDate: '2026-10-15', status: 'approved', submittedAt: '2026-10-15T07:00:00.000Z', ...overrides })

const day = (week: ReturnType<typeof buildMyWeek>, date: string) => week.days.find(entry => entry.date === date)!
const kinds = (items: MyWeekItem[]) => items.map(item => item.kind)

describe('myWeekDates', () => {
  it('runs Monday to Sunday around any day of the week', () => {
    const expected = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
    expect(myWeekDates(new Date(2026, 9, 12, 0, 5))).toEqual(expected)
    expect(myWeekDates(WEDNESDAY)).toEqual(expected)
    expect(myWeekDates(new Date(2026, 9, 18, 23, 55))).toEqual(expected)
  })

  it('treats Sunday as the end of the week and the next Monday as the start of a new one', () => {
    expect(myWeekDates(new Date(2026, 9, 18))[6]).toBe('2026-10-18')
    expect(myWeekDates(new Date(2026, 9, 19))[0]).toBe('2026-10-19')
  })

  it('crosses a year change in either direction', () => {
    expect(myWeekDates(new Date(2026, 11, 31))).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
    expect(myWeekDates(new Date(2027, 0, 1))[0]).toBe('2026-12-28')
    expect(myWeekDates(new Date(2027, 0, 4))[0]).toBe('2027-01-04')
  })
})

describe('buildMyWeek days', () => {
  it('returns seven days with today marked and the past flagged', () => {
    const week = buildMyWeek(input())
    expect(week.days.map(entry => entry.date)).toHaveLength(7)
    expect(week.days.filter(entry => entry.isToday).map(entry => entry.date)).toEqual(['2026-10-14'])
    expect(week.days.filter(entry => entry.isPast).map(entry => entry.date)).toEqual(['2026-10-12', '2026-10-13'])
    expect(week.days.filter(entry => entry.isWeekend).map(entry => entry.date)).toEqual(['2026-10-17', '2026-10-18'])
    expect(week.start).toBe('2026-10-12')
    expect(week.end).toBe('2026-10-18')
  })

  it('detects today on Sunday and on Monday morning', () => {
    expect(buildMyWeek(input({ now: new Date(2026, 9, 18, 22, 0) })).days.find(entry => entry.isToday)?.date).toBe('2026-10-18')
    const monday = buildMyWeek(input({ now: new Date(2026, 9, 19, 0, 1) }))
    expect(monday.start).toBe('2026-10-19')
    expect(monday.days.find(entry => entry.isToday)?.date).toBe('2026-10-19')
  })

  it('is empty when nothing is planned', () => {
    const week = buildMyWeek(input())
    expect(week.empty).toBe(true)
    expect(week.days.every(entry => entry.items.length === 0)).toBe(true)
  })
})

describe('shifts', () => {
  it('lists my own shifts by role name and colour and leaves out other people and other weeks', () => {
    const week = buildMyWeek(input({
      assignments: [
        assignment('a1', '2026-10-13'),
        assignment('a2', '2026-10-13', { employeeId: OTHER, roleId: 'r-pack' }),
        assignment('a3', '2026-10-20'),
        assignment('a4', '2026-10-11'),
      ],
    }))
    const tuesday = day(week, '2026-10-13').items
    expect(tuesday).toHaveLength(1)
    expect(tuesday[0]).toMatchObject({ kind: 'shift', title: 'Lead', color: '#3366cc', target: { view: 'shifts' } })
    expect(week.days.flatMap(entry => entry.items)).toHaveLength(1)
  })

  it('never carries comments', () => {
    const week = buildMyWeek(input({ assignments: [assignment('a1', '2026-10-13', { comment: 'secret note' })], patterns: [pattern({ comment: 'pattern note' })] }))
    expect(JSON.stringify(week)).not.toContain('secret note')
    expect(JSON.stringify(week)).not.toContain('pattern note')
  })

  it('gives a shift its own time, else the pattern time, else the role default', () => {
    const timedRoles: ShiftRole[] = [{ ...roles[0], startTime: '07:00', endTime: '15:00' }, roles[1]]
    const week = buildMyWeek(input({
      roles: timedRoles,
      assignments: [assignment('own', '2026-10-13', { startTime: '09:30', endTime: '11:00' }), assignment('default', '2026-10-15')],
      patterns: [pattern({ weekdays: [3], startTime: '12:00' })],
    }))
    expect(day(week, '2026-10-13').items[0]).toMatchObject({ startTime: '09:30', endTime: '11:00' })
    expect(day(week, '2026-10-15').items[0]).toMatchObject({ startTime: '07:00', endTime: '15:00' })
    expect(day(week, '2026-10-14').items[0]).toMatchObject({ startTime: '12:00', endTime: undefined })
  })

  it('lists all-day items first and timed items by the clock', () => {
    const week = buildMyWeek(input({
      assignments: [
        assignment('late', '2026-10-13', { startTime: '13:00' }),
        assignment('early', '2026-10-13', { roleId: 'r-pack', startTime: '08:00' }),
        assignment('allday', '2026-10-13', { roleId: 'gone' }),
      ],
      homeOfficePatterns: { [ME]: { weekdays: [2] } },
    }))
    expect(day(week, '2026-10-13').items.map(item => item.startTime ?? item.kind)).toEqual(['shift', 'homeOffice', '08:00', '13:00'])
  })

  it('expands recurring patterns on their weekdays', () => {
    const week = buildMyWeek(input({ patterns: [pattern()] }))
    expect(day(week, '2026-10-12').items.map(item => item.title)).toEqual(['Pakning'])
    expect(day(week, '2026-10-14').items.map(item => item.title)).toEqual(['Pakning'])
    expect(day(week, '2026-10-13').items).toEqual([])
  })

  it('honours the interval: only the matching weeks show the shift', () => {
    const everyOther = pattern({ intervalWeeks: 2, anchorDate: '2026-10-05', weekdays: [2] })
    expect(day(buildMyWeek(input({ patterns: [everyOther], now: new Date(2026, 9, 7) })), '2026-10-06').items).toHaveLength(1)
    expect(buildMyWeek(input({ patterns: [everyOther] })).empty).toBe(true)
    expect(day(buildMyWeek(input({ patterns: [everyOther], now: new Date(2026, 9, 21) })), '2026-10-20').items).toHaveLength(1)
  })

  it('keeps the interval across a year change', () => {
    const everyThird = pattern({ intervalWeeks: 3, anchorDate: '2026-12-14', weekdays: [1] })
    expect(day(buildMyWeek(input({ patterns: [everyThird], now: new Date(2027, 0, 5) })), '2027-01-04').items).toHaveLength(1)
    expect(buildMyWeek(input({ patterns: [everyThird], now: new Date(2026, 11, 30) })).empty).toBe(true)
  })

  it('ignores patterns before their anchor week or after their end date', () => {
    expect(buildMyWeek(input({ patterns: [pattern({ anchorDate: '2026-10-19' })] })).empty).toBe(true)
    const ended = buildMyWeek(input({ patterns: [pattern({ endDate: '2026-10-13' })] }))
    expect(day(ended, '2026-10-12').items).toHaveLength(1)
    expect(day(ended, '2026-10-14').items).toHaveLength(0)
  })

  it('ignores other people\'s patterns', () => {
    expect(buildMyWeek(input({ patterns: [pattern({ employeeId: OTHER })] })).empty).toBe(true)
  })

  it('lets a real assignment for the same role win over the pattern, but not a different role', () => {
    const same = buildMyWeek(input({ patterns: [pattern({ roleId: 'r-lead', weekdays: [1] })], assignments: [assignment('a1', '2026-10-12')] }))
    expect(day(same, '2026-10-12').items).toHaveLength(1)
    expect(day(same, '2026-10-12').items[0].id).toBe('shift-a1')
    const different = buildMyWeek(input({ patterns: [pattern({ roleId: 'r-pack', weekdays: [1] })], assignments: [assignment('a1', '2026-10-12')] }))
    expect(day(different, '2026-10-12').items.map(item => item.title).sort()).toEqual(['Lead', 'Pakning'])
  })

  it('hides pattern shifts on approved vacation and on sick days, but not while the request is only pending', () => {
    const away = buildMyWeek(input({ patterns: [pattern()], vacations: [vacation({ startDate: '2026-10-12', endDate: '2026-10-12' })] }))
    expect(day(away, '2026-10-12').items.map(item => item.kind)).toEqual(['vacation'])
    expect(day(away, '2026-10-14').items.map(item => item.kind)).toEqual(['shift'])

    const ill = buildMyWeek(input({ patterns: [pattern()], sickLeave: [sick({ startDate: '2026-10-14' })] }))
    expect(day(ill, '2026-10-14').items.map(item => item.kind)).toEqual(['sick'])

    const pending = buildMyWeek(input({ patterns: [pattern()], vacations: [vacation({ startDate: '2026-10-12', endDate: '2026-10-12', status: 'pending' })] }))
    expect(kinds(day(pending, '2026-10-12').items).sort()).toEqual(['shift', 'vacation'])
  })

  it('hides pattern shifts on parental leave and single days off too', () => {
    const week = buildMyWeek(input({
      patterns: [pattern({ weekdays: [1, 3] })],
      vacations: [vacation({ id: 'v2', type: 'parental', startDate: '2026-10-12', endDate: '2026-10-12' }), vacation({ id: 'v3', isSingleDay: true, startDate: '2026-10-14', endDate: '2026-10-14' })],
    }))
    expect(kinds(day(week, '2026-10-12').items)).toEqual(['parental'])
    expect(kinds(day(week, '2026-10-14').items)).toEqual(['dayOff'])
  })

  it('labels a shift whose role was deleted with an empty title instead of dropping it', () => {
    const week = buildMyWeek(input({ assignments: [assignment('a1', '2026-10-13', { roleId: 'gone' })] }))
    expect(day(week, '2026-10-13').items[0]).toMatchObject({ kind: 'shift', title: '' })
  })
})

describe('time off', () => {
  it('shows approved vacation on each working day of the range, clipped to the week', () => {
    const week = buildMyWeek(input({ vacations: [vacation({ startDate: '2026-10-08', endDate: '2026-10-21' })] }))
    expect(week.days.filter(entry => entry.items.length).map(entry => entry.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'])
    expect(day(week, '2026-10-12').items[0]).toMatchObject({ kind: 'vacation', pending: false, target: { view: 'calendar' } })
  })

  it('shows a range that starts or ends on a weekend on that weekend day', () => {
    const week = buildMyWeek(input({ vacations: [vacation({ startDate: '2026-10-17', endDate: '2026-10-18' })] }))
    expect(week.days.filter(entry => entry.items.length).map(entry => entry.date)).toEqual(['2026-10-17', '2026-10-18'])
  })

  it('marks pending requests as pending and separates parental leave and single days off', () => {
    const week = buildMyWeek(input({
      vacations: [
        vacation({ id: 'p', status: 'pending', startDate: '2026-10-15', endDate: '2026-10-15' }),
        vacation({ id: 'b', type: 'parental', startDate: '2026-10-13', endDate: '2026-10-13' }),
        vacation({ id: 'd', isSingleDay: true, startDate: '2026-10-16', endDate: '2026-10-16' }),
      ],
    }))
    expect(day(week, '2026-10-15').items[0]).toMatchObject({ kind: 'vacation', pending: true })
    expect(day(week, '2026-10-13').items[0]).toMatchObject({ kind: 'parental', pending: false })
    expect(day(week, '2026-10-16').items[0]).toMatchObject({ kind: 'dayOff', pending: false })
  })

  it('ignores rejected requests, other people and broken ranges', () => {
    const week = buildMyWeek(input({
      vacations: [
        vacation({ id: 'r', status: 'rejected' }),
        vacation({ id: 'o', userEmail: OTHER }),
        vacation({ id: 'x', startDate: '2026-10-16', endDate: '2026-10-13' }),
      ],
    }))
    expect(week.empty).toBe(true)
  })

  it('matches my e-mail regardless of case', () => {
    const week = buildMyWeek(input({ vacations: [vacation({ userEmail: 'ME@Example.test' })] }))
    expect(week.empty).toBe(false)
  })

  it('shows my approved sick leave; a start date without end date covers one day', () => {
    const week = buildMyWeek(input({ sickLeave: [sick(), sick({ id: 's2', userEmail: OTHER, startDate: '2026-10-13' }), sick({ id: 's3', status: 'pending', startDate: '2026-10-16' })] }))
    expect(week.days.filter(entry => entry.items.length).map(entry => entry.date)).toEqual(['2026-10-15'])
    expect(day(week, '2026-10-15').items[0]).toMatchObject({ kind: 'sick', target: { view: 'calendar' } })
  })

  it('spreads sick leave with an end date over the covered working days', () => {
    const week = buildMyWeek(input({ sickLeave: [sick({ startDate: '2026-10-15', endDate: '2026-10-19' })] }))
    expect(week.days.filter(entry => entry.items.length).map(entry => entry.date)).toEqual(['2026-10-15', '2026-10-16'])
  })
})

describe('home office', () => {
  const patterns: Record<string, HomeOfficePattern> = { [ME]: { weekdays: [2, 4] }, [OTHER]: { weekdays: [1] } }

  it('uses my weekday pattern', () => {
    const week = buildMyWeek(input({ homeOfficePatterns: patterns }))
    expect(week.days.filter(entry => kinds(entry.items).includes('homeOffice')).map(entry => entry.date)).toEqual(['2026-10-13', '2026-10-15'])
  })

  it('lets an exception add a day or take one away', () => {
    const exceptions: HomeOfficeException[] = [
      { id: 'e1', userEmail: ME, date: '2026-10-16', isHomeOffice: true },
      { id: 'e2', userEmail: ME, date: '2026-10-13', isHomeOffice: false },
      { id: 'e3', userEmail: OTHER, date: '2026-10-14', isHomeOffice: true },
    ]
    const week = buildMyWeek(input({ homeOfficePatterns: patterns, homeOfficeExceptions: exceptions }))
    expect(week.days.filter(entry => kinds(entry.items).includes('homeOffice')).map(entry => entry.date)).toEqual(['2026-10-15', '2026-10-16'])
  })

  it('honours the repeat interval of a weekday', () => {
    const every = { [ME]: { weekdays: [2], repeat: { 2: { intervalWeeks: 2, startDate: '2026-10-06' } } } }
    expect(buildMyWeek(input({ homeOfficePatterns: every })).empty).toBe(true)
    expect(buildMyWeek(input({ homeOfficePatterns: every, now: new Date(2026, 9, 21) })).empty).toBe(false)
  })

  it('is not shown on a day I am on vacation or sick', () => {
    const week = buildMyWeek(input({ homeOfficePatterns: patterns, vacations: [vacation({ startDate: '2026-10-13', endDate: '2026-10-13' })], sickLeave: [sick({ startDate: '2026-10-15' })] }))
    expect(kinds(day(week, '2026-10-13').items)).toEqual(['vacation'])
    expect(kinds(day(week, '2026-10-15').items)).toEqual(['sick'])
  })
})

describe('to-dos', () => {
  const todo = (id: string, dueDate: string | undefined, overrides: Record<string, unknown> = {}) =>
    ({ id, title: `Todo ${id}`, status: 'open', createdAt: '2026-10-01T08:00:00.000Z', dueDate, ...overrides }) as never
  const project = (id: string, overrides: Record<string, unknown> = {}) =>
    ({ id, title: `Project ${id}`, createdBy: ME, createdByName: 'Me', status: 'open', dueDate: '2026-10-16', teamMembers: [], ...overrides }) as never

  it('puts personal to-dos on their due day with a deep link to the personal tab', () => {
    const week = buildMyWeek(input({ personalTodos: [todo('a', '2026-10-16')] }))
    expect(day(week, '2026-10-16').items[0]).toMatchObject({
      kind: 'todo', variant: 'personal', title: 'Todo a', overdue: false, target: { view: 'projects', params: { tab: 'personal' } },
    })
  })

  it('leaves out completed to-dos, to-dos without a date and to-dos due in other weeks', () => {
    const week = buildMyWeek(input({
      personalTodos: [todo('done', '2026-10-16', { status: 'completed' }), todo('legacy', '2026-10-16', { status: undefined, done: true }), todo('none', undefined), todo('later', '2026-10-19'), todo('open', '2026-10-17')],
    }))
    expect(week.days.flatMap(entry => entry.items).map(item => item.title)).toEqual(['Todo open'])
  })

  it('carries overdue to-dos from earlier weeks onto today, flagged as overdue', () => {
    const week = buildMyWeek(input({ personalTodos: [todo('old', '2026-09-30')] }))
    expect(day(week, '2026-10-14').items[0]).toMatchObject({ title: 'Todo old', overdue: true })
  })

  it('keeps an overdue to-do from earlier this week on its own day, flagged as overdue', () => {
    const week = buildMyWeek(input({ personalTodos: [todo('mon', '2026-10-12'), todo('today', '2026-10-14')] }))
    expect(day(week, '2026-10-12').items[0]).toMatchObject({ overdue: true })
    expect(day(week, '2026-10-14').items[0]).toMatchObject({ overdue: false })
  })

  it('shows the time of a to-do on its own day, but not when it is carried over from an earlier week', () => {
    const week = buildMyWeek(input({
      personalTodos: [todo('timed', '2026-10-16', { startTime: '10:30' }), todo('old', '2026-09-30', { startTime: '09:00' })],
      projects: [project('team', { startTime: '08:00', endTime: '09:00' })],
    }))
    expect(day(week, '2026-10-16').items.map(item => [item.title, item.startTime])).toEqual([['Project team', '08:00'], ['Todo timed', '10:30']])
    expect(day(week, '2026-10-14').items[0]).toMatchObject({ title: 'Todo old', overdue: true })
    expect(day(week, '2026-10-14').items[0].startTime).toBeUndefined()
  })

  it('lists appointments on their own day only, never overdue and never carried over', () => {
    const week = buildMyWeek(input({
      personalTodos: [
        todo('meeting', '2026-10-13', { kind: 'event', startTime: '13:00', endTime: '14:00' }),
        todo('course', '2026-10-16', { kind: 'event' }),
        todo('old-meeting', '2026-09-30', { kind: 'event' }),
      ],
    }))
    expect(day(week, '2026-10-13').items[0]).toMatchObject({ kind: 'event', title: 'Todo meeting', startTime: '13:00', endTime: '14:00', overdue: false, target: { view: 'projects', params: { tab: 'personal' } } })
    expect(day(week, '2026-10-16').items[0]).toMatchObject({ kind: 'event', title: 'Todo course' })
    expect(week.days.flatMap(entry => entry.items)).toHaveLength(2)
  })

  it('includes team to-dos I created or am a member of, but not other people\'s', () => {
    const week = buildMyWeek(input({
      projects: [
        project('mine'),
        project('member', { createdBy: OTHER, teamMembers: [{ email: ME, name: 'Me' }] }),
        project('foreign', { createdBy: OTHER, teamMembers: [{ email: OTHER, name: 'Other' }] }),
        project('finished', { status: 'completed' }),
        project('undated', { dueDate: undefined }),
      ],
    }))
    const items = day(week, '2026-10-16').items
    expect(items.map(item => item.title).sort()).toEqual(['Project member', 'Project mine'])
    expect(items[0]).toMatchObject({ kind: 'todo', variant: 'team', target: { view: 'projects', params: { tab: 'team', search: items[0].title } } })
  })
})

describe('guide reviews', () => {
  const at = (iso: string) => new Date(iso).getTime()
  const guide = (id: string, nextReviewAt: number | null, overrides: Partial<Guide> = {}): Guide =>
    ({ id, title: `Guide ${id}`, category: 'Lager', tags: [], content: '', createdAt: 0, updatedAt: 0, reviewIntervalMonths: 12, nextReviewAt, responsibleEmail: ME, ...overrides }) as Guide

  it('lists guides I am responsible for on the day the review is due, linking to the guide', () => {
    const week = buildMyWeek(input({ guides: [guide('a', new Date(2026, 9, 16, 9).getTime())] }))
    expect(day(week, '2026-10-16').items[0]).toMatchObject({ kind: 'review', title: 'Guide a', overdue: false, target: { view: 'guides', params: { itemId: 'a' } } })
  })

  it('falls back to the author when nobody is responsible, like the Hub review alert', () => {
    const due = new Date(2026, 9, 16, 9).getTime()
    const week = buildMyWeek(input({ guides: [guide('own', due, { responsibleEmail: undefined, author: ME }), guide('theirs', due, { responsibleEmail: OTHER, author: ME })] }))
    expect(day(week, '2026-10-16').items.map(item => item.title)).toEqual(['Guide own'])
  })

  it('ignores guides without an interval or a date, and reviews outside the week', () => {
    const week = buildMyWeek(input({
      guides: [
        guide('none', null),
        guide('nointerval', new Date(2026, 9, 16).getTime(), { reviewIntervalMonths: null }),
        guide('later', new Date(2026, 9, 19, 9).getTime()),
      ],
    }))
    expect(week.empty).toBe(true)
  })

  it('carries overdue reviews from before the week onto today, flagged as overdue', () => {
    const week = buildMyWeek(input({ guides: [guide('old', at('2026-09-01T08:00:00.000Z'))] }))
    expect(day(week, '2026-10-14').items[0]).toMatchObject({ kind: 'review', overdue: true })
  })

  it('flags a review due earlier today as overdue', () => {
    const week = buildMyWeek(input({ guides: [guide('today', new Date(2026, 9, 14, 6).getTime())] }))
    expect(day(week, '2026-10-14').items[0]).toMatchObject({ overdue: true })
  })
})

describe('improvements', () => {
  const improvement = (id: string, overrides: Partial<ImprovementCase> = {}): ImprovementCase => ({
    id, revision: 1, title: `Improvement ${id}`, problem: '', proposal: '', category: 'process', originTeamCode: 'OPS', affectedTeamCodes: [],
    createdBy: OTHER, createdByName: 'Other', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', priority: 'medium', status: 'in-progress', nextAction: '',
    assignments: [{ id: 'as1', email: ME, name: 'Me', teamCode: 'OPS', kind: 'owner', status: 'accepted', invitedBy: OTHER, invitedAt: '2026-10-01T08:00:00.000Z' }],
    history: [], notifications: [], ...overrides,
  })

  it('shows the case deadline, the feedback deadline and a pending invitation deadline on their days', () => {
    const week = buildMyWeek(input({
      improvements: [
        improvement('due', { dueDate: '2026-10-16' }),
        improvement('feedback', { feedbackDueDate: '2026-10-15' }),
        improvement('invite', { assignments: [{ id: 'as2', email: ME, name: 'Me', teamCode: 'OPS', kind: 'contributor', status: 'pending', invitedBy: OTHER, invitedAt: '2026-10-01T08:00:00.000Z', responseDueDate: '2026-10-17' }] }),
      ],
    }))
    expect(day(week, '2026-10-16').items[0]).toMatchObject({ kind: 'improvement', variant: 'due', title: 'Improvement due', target: { view: 'improvements', params: { itemId: 'due' } } })
    expect(day(week, '2026-10-15').items[0]).toMatchObject({ kind: 'improvement', variant: 'feedback' })
    expect(day(week, '2026-10-17').items[0]).toMatchObject({ kind: 'improvement', variant: 'respond' })
  })

  it('ignores cases I am not assigned to, declined assignments, closed and deleted cases', () => {
    const declined = improvement('declined', { dueDate: '2026-10-16' })
    declined.assignments[0].status = 'declined'
    const week = buildMyWeek(input({
      improvements: [
        improvement('foreign', { dueDate: '2026-10-16', assignments: [{ id: 'x', email: OTHER, name: 'Other', teamCode: 'OPS', kind: 'owner', status: 'accepted', invitedBy: OTHER, invitedAt: '' }] }),
        declined,
        improvement('completed', { dueDate: '2026-10-16', status: 'completed' }),
        improvement('declinedCase', { dueDate: '2026-10-16', status: 'declined' }),
        improvement('deleted', { dueDate: '2026-10-16', deletedAt: '2026-10-10T08:00:00.000Z' }),
      ],
    }))
    expect(week.empty).toBe(true)
  })

  it('only shows a response deadline while the invitation is pending', () => {
    const accepted = improvement('accepted')
    accepted.assignments[0].responseDueDate = '2026-10-16'
    expect(buildMyWeek(input({ improvements: [accepted] })).empty).toBe(true)
  })

  it('flags overdue deadlines and carries those from before the week onto today', () => {
    const week = buildMyWeek(input({ improvements: [improvement('old', { dueDate: '2026-10-01' }), improvement('mon', { feedbackDueDate: '2026-10-12' })] }))
    expect(day(week, '2026-10-14').items[0]).toMatchObject({ title: 'Improvement old', overdue: true })
    expect(day(week, '2026-10-12').items[0]).toMatchObject({ title: 'Improvement mon', overdue: true })
  })
})

describe('ordering and counts', () => {
  it('orders a day as absence, shifts, home office, to-dos, reviews and improvements', () => {
    const week = buildMyWeek(input({
      assignments: [assignment('a1', '2026-10-16')],
      homeOfficeExceptions: [{ id: 'e', userEmail: ME, date: '2026-10-16', isHomeOffice: true }],
      personalTodos: [{ id: 't', title: 'Todo', status: 'open', createdAt: '', dueDate: '2026-10-16' }],
      guides: [{ id: 'g', title: 'Guide', category: '', tags: [], content: '', createdAt: 0, updatedAt: 0, reviewIntervalMonths: 6, nextReviewAt: new Date(2026, 9, 16, 12).getTime(), responsibleEmail: ME } as Guide],
      vacations: [vacation({ status: 'pending', startDate: '2026-10-16', endDate: '2026-10-16' })],
    }))
    expect(kinds(day(week, '2026-10-16').items)).toEqual(['vacation', 'shift', 'homeOffice', 'todo', 'review'])
    expect(week.empty).toBe(false)
  })

  it('gives every item a unique id within the week', () => {
    const week = buildMyWeek(input({ patterns: [pattern()], assignments: [assignment('a1', '2026-10-13')], personalTodos: [{ id: 't', title: 'T', status: 'open', createdAt: '', dueDate: '2026-10-13' }] }))
    const ids = week.days.flatMap(entry => entry.items.map(item => item.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tolerates missing data', () => {
    const week = buildMyWeek({ userEmail: ME, now: WEDNESDAY })
    expect(week.empty).toBe(true)
  })
})

describe('visibleWeekDays', () => {
  const week = buildMyWeek(input())

  it('shows the whole week for standard and large', () => {
    expect(visibleWeekDays(week, 'standard')).toHaveLength(7)
    expect(visibleWeekDays(week, 'large')).toHaveLength(7)
  })

  it('shows today and the next two days for compact', () => {
    expect(visibleWeekDays(week, 'compact').map(entry => entry.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'])
  })

  it('stops at the end of the week', () => {
    const sunday = buildMyWeek(input({ now: new Date(2026, 9, 18) }))
    expect(visibleWeekDays(sunday, 'compact').map(entry => entry.date)).toEqual(['2026-10-18'])
    const saturday = buildMyWeek(input({ now: new Date(2026, 9, 17) }))
    expect(visibleWeekDays(saturday, 'compact').map(entry => entry.date)).toEqual(['2026-10-17', '2026-10-18'])
  })
})
