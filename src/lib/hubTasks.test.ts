import { describe, expect, it } from 'vitest'
import { buildHubTasks, filterHubTasks } from './hubTasks'
import { resolveShiftDayComment } from './shiftDayComments'

describe('buildHubTasks', () => {
  const roles = [
    { id: 'regular', name: 'Support', color: '#123456' },
    { id: 'special', name: 'Status', color: '#abcdef', onlyWhenAssigned: true },
    { id: 'other', name: 'Status', color: '#987654', onlyWhenAssigned: true },
  ]

  it('keeps regular roles and hides occasional roles without a person today', () => {
    expect(buildHubTasks(roles, [])).toMatchObject([{ roleId: 'regular', people: [] }])
  })

  it('shows an assigned occasional role without merging same-named roles', () => {
    expect(buildHubTasks(roles, [{ roleId: 'other', name: 'Lise' }])).toMatchObject([
      { roleId: 'regular', people: [] },
      { roleId: 'other', taskName: 'Status', people: [{ name: 'Lise' }] },
    ])
  })

  it('shows one employee-day note on both assigned tasks', () => {
    const date = '2026-09-24'
    const email = 'lasse@example.com'
    const assignments = [
      { employeeId: email, date, roleId: 'regular', name: 'Lasse', comment: 'Går tidligt' },
      { employeeId: email, date, roleId: 'special', name: 'Lasse' },
    ]
    const tasks = buildHubTasks(roles, assignments.map(a => ({ ...a, email, comment: resolveShiftDayComment({}, date, email, assignments) })))
    expect(tasks.filter(task => task.people.length).map(task => task.people[0].comment)).toEqual(['Går tidligt', 'Går tidligt'])
  })

  it('filters only the widget view and preserves assignment-only role behavior', () => {
    const empty = buildHubTasks(roles, [])
    expect(empty.map(task => task.roleId)).toEqual(['regular'])
    expect(filterHubTasks(empty, true)).toEqual([])
    expect(filterHubTasks(empty, false)).toEqual(empty)

    const withSpecial = buildHubTasks(roles, [{ roleId: 'special', name: 'Lasse' }])
    expect(filterHubTasks(withSpecial, true).map(task => task.roleId)).toEqual(['special'])
    expect(filterHubTasks(withSpecial, false).map(task => task.roleId)).toEqual(['regular', 'special'])
    expect(empty.map(task => task.roleId)).toEqual(['regular'])
  })
})
