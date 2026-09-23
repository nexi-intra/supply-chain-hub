import { describe, expect, it } from 'vitest'
import { buildHubTasks } from './hubTasks'

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
})