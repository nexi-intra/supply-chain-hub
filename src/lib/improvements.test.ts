import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  IMPROVEMENT_CATEGORIES,
  IMPROVEMENT_PRIORITIES,
  IMPROVEMENT_STATUSES,
  filterImprovements,
  sortImprovements,
  type ImprovementAssignment,
  type ImprovementCase,
  type ImprovementCommand,
  type ImprovementSnapshot,
  type ImprovementsApi,
} from './improvements'
import { IMPROVEMENTS_LABELS, getImprovementsLabels } from './improvementsLabels'
import * as improvementModel from './improvements'

function assignment(overrides: Partial<ImprovementAssignment> = {}): ImprovementAssignment {
  return {
    id: 'assignment-1', email: 'worker@example.test', name: 'Worker', teamCode: 'operations',
    kind: 'contributor', status: 'accepted', invitedBy: 'leader@example.test',
    invitedAt: '2026-09-01T10:00:00.000Z', ...overrides,
  }
}

function improvement(overrides: Partial<ImprovementCase> = {}): ImprovementCase {
  return {
    id: 'case-a', revision: 1, title: 'Reduce handovers', problem: 'Repeated manual checks',
    proposal: 'Use a shared checklist', category: 'process', originTeamCode: 'operations',
    affectedTeamCodes: ['logistics'], createdBy: 'author@example.test', createdByName: 'Author',
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z',
    priority: 'medium', status: 'new', nextAction: '', assignments: [], history: [],
    notifications: [], ...overrides,
  }
}

const actorEmail = 'worker@example.test'
const teamCode = 'operations'

describe('applyImprovementResult', () => {
  it('removes a deleted result rather than inserting its notifications or tombstone', () => {
    expect(improvementModel).toHaveProperty('applyImprovementResult')
    const removed = improvement()
    const retained = improvement({ id: 'retained' })
    const tombstone = { ...removed, revision: 3, deletedAt: removed.updatedAt,
      notifications: [{ id: 'notice-1', recipientEmail: actorEmail, type: 'deleted', createdAt: removed.updatedAt, message: 'Removed' }] }
    const cases = Object.freeze([removed, retained])
    expect(improvementModel.applyImprovementResult(cases, tombstone)).toEqual([retained])
    expect(cases).toEqual([removed, retained])
    expect(improvementModel.applyImprovementResult([retained], tombstone)).toEqual([retained])
  })
  it('also excludes cached tombstones when merging a live result', () => {
    expect(improvementModel).toHaveProperty('applyImprovementResult')
    const deleted = { ...improvement({ id: 'deleted' }), deletedAt: '2026-10-01T10:00:00Z' }
    const updated = improvement({ revision: 2 })
    expect(improvementModel.applyImprovementResult([deleted, improvement()], updated)).toEqual([updated])
  })
  it('does not replace a newer case with a replayed older receipt', () => {
    expect(improvementModel).toHaveProperty('applyImprovementResult')
    const newer = improvement({ revision: 5, title: 'New title' })
    expect(improvementModel.applyImprovementResult([newer], improvement({ revision: 2 }))).toEqual([newer])
  })
  it('merges or appends live results once without duplicate cases', () => {
    expect(improvementModel).toHaveProperty('applyImprovementResult')
    const live = improvement()
    expect(improvementModel.applyImprovementResult([], live)).toEqual([live])
    expect(improvementModel.applyImprovementResult([live], live)).toEqual([live])
    const updated = improvement({ revision: 2, feedbackDueDate: '2026-10-05' })
    expect(improvementModel.applyImprovementResult([live], updated)).toEqual([updated])
  })
})

describe('improvement contract', () => {
  it('exports the approved status, category and priority values in display order', () => {
    expect(IMPROVEMENT_STATUSES).toEqual([
      'new', 'assessment', 'planned', 'in-progress', 'testing', 'ready-for-approval',
      'completed', 'on-hold', 'declined',
    ])
    expect(IMPROVEMENT_CATEGORIES).toEqual(['process', 'automation', 'quality', 'workplace', 'cost', 'other'])
    expect(IMPROVEMENT_PRIORITIES).toEqual(['critical', 'high', 'medium', 'low'])
  })

  it('types the native bridge without accepting client actor credentials', () => {
    expectTypeOf<ImprovementsApi['snapshot']>().toEqualTypeOf<() => Promise<ImprovementSnapshot>>()
    expectTypeOf<ImprovementsApi['command']>().toEqualTypeOf<(command: ImprovementCommand) => Promise<ImprovementCase>>()
    expectTypeOf<ImprovementsApi['onChanged']>().toEqualTypeOf<(callback: () => void) => () => void>()
    expectTypeOf<Window['electronImprovements']>().toEqualTypeOf<ImprovementsApi | undefined>()
    expectTypeOf<Extract<keyof ImprovementCommand, 'actor' | 'role' | 'createdBy'>>().toEqualTypeOf<never>()
    expectTypeOf<ImprovementCommand['type']>().toEqualTypeOf<
      'create' | 'comment' | 'invite' | 'respond' | 'update' | 'submit' | 'approve' | 'return' | 'acknowledge'
      | 'set-deadlines' | 'request-deletion' | 'reject-deletion' | 'delete'
    >()
  })
})

describe('filterImprovements', () => {
  it('separates ongoing, completed and declined cases, keeping all when no view is chosen', () => {
    const ongoing: ImprovementCase['status'][] = ['new', 'assessment', 'planned', 'in-progress', 'testing', 'ready-for-approval', 'on-hold']
    const cases = [...ongoing, 'completed' as const, 'declined' as const].map(status => improvement({ id: status, status }))
    expect(filterImprovements(cases, { view: 'active' }, actorEmail, teamCode).map(entry => entry.id).sort()).toEqual([...ongoing].sort())
    expect(filterImprovements(cases, { view: 'completed' }, actorEmail, teamCode).map(entry => entry.id)).toEqual(['completed'])
    expect(filterImprovements(cases, { view: 'declined' }, actorEmail, teamCode).map(entry => entry.id)).toEqual(['declined'])
    expect(filterImprovements(cases, {}, actorEmail, teamCode)).toHaveLength(cases.length)
  })

  it('excludes tombstones from cached cases regardless of filters without mutating input', () => {
    const live = improvement()
    const deleted = Object.freeze({ ...improvement({ id: 'deleted', createdBy: actorEmail }), deletedAt: '2026-10-01T10:00:00Z' })
    const cases = Object.freeze([deleted, live])
    expect(filterImprovements(cases, {}, actorEmail, teamCode)).toEqual([live])
    expect(filterImprovements(cases, { preset: 'mine' }, actorEmail, teamCode)).toEqual([])
    expect(cases).toEqual([deleted, live])
  })

  it.each(['title', 'problem', 'proposal'] as const)('searches %s ignoring case and surrounding whitespace', field => {
    const matching = improvement({ id: 'matching', [field]: 'Special NEEDLE content' })
    expect(filterImprovements([improvement(), matching], { search: '  needle  ' }, actorEmail, teamCode))
      .toEqual([matching])
  })

  it('does not search author, assignments, history or next action', () => {
    const entry = improvement({
      createdByName: 'Needle', nextAction: 'Needle', assignments: [assignment({ name: 'Needle' })],
      history: [{ id: 'history-1', type: 'comment', actorEmail, actorName: 'Worker', at: '2026-09-02T10:00:00.000Z', message: 'Needle' }],
    })
    expect(filterImprovements([entry], { search: 'needle' }, actorEmail, teamCode)).toEqual([])
  })

  it('intersects search, status, priority, origin, affected department and accepted person filters', () => {
    const matching = improvement({ status: 'testing', priority: 'high', assignments: [assignment()] })
    const cases = [
      matching, improvement({ id: 'wrong-status', priority: 'high', assignments: [assignment()] }),
      improvement({ ...matching, id: 'wrong-priority', priority: 'low' }),
      improvement({ ...matching, id: 'wrong-origin', originTeamCode: 'finance' }),
      improvement({ ...matching, id: 'wrong-affected', affectedTeamCodes: ['finance'] }),
      improvement({ ...matching, id: 'wrong-person', assignments: [assignment({ status: 'pending' })] }),
      improvement({ ...matching, id: 'wrong-search', title: 'Different', problem: '', proposal: '' }),
    ]
    expect(filterImprovements(cases, {
      search: 'handovers', status: 'testing', priority: 'high', originTeam: 'operations',
      affectedTeam: 'logistics', person: actorEmail,
    }, actorEmail, teamCode)).toEqual([matching])
  })

  it('allows empty values and all sentinels without filtering', () => {
    const entry = improvement()
    expect(filterImprovements([entry], {
      search: ' ', status: 'all', priority: 'all', originTeam: 'all', affectedTeam: 'all',
      person: 'all', preset: 'all', invitations: false,
    }, actorEmail, teamCode)).toEqual([entry])
    expect(filterImprovements([entry], {
      originTeam: '', affectedTeam: '', person: '',
    }, actorEmail, teamCode)).toEqual([entry])
  })

  it('uses immutable authorship for mine, not ownership', () => {
    const authored = improvement({ id: 'authored', createdBy: actorEmail, assignments: [assignment({ email: 'other@example.test', kind: 'owner' })] })
    const owned = improvement({ id: 'owned', assignments: [assignment({ kind: 'owner' })] })
    expect(filterImprovements([owned, authored], { preset: 'mine' }, actorEmail, teamCode)).toEqual([authored])
  })

  it.each(['owner', 'contributor'] as const)('includes only accepted %s assignments in assigned and person filters', kind => {
    const accepted = improvement({ id: 'accepted', assignments: [assignment({ kind })] })
    const pending = improvement({ id: 'pending', assignments: [assignment({ kind, status: 'pending' })] })
    const declined = improvement({ id: 'declined', assignments: [assignment({ kind, status: 'declined' })] })
    const authored = improvement({ id: 'author-only', createdBy: actorEmail })
    const cases = [pending, accepted, declined, authored]
    expect(filterImprovements(cases, { preset: 'assigned' }, actorEmail, teamCode)).toEqual([accepted])
    expect(filterImprovements(cases, { person: actorEmail }, actorEmail, teamCode)).toEqual([accepted])
  })

  it('normalizes email identity for author, assignee, person and invitation matching', () => {
    const authored = improvement({ createdBy: ' WORKER@EXAMPLE.TEST ' })
    const accepted = improvement({ assignments: [assignment({ email: 'WORKER@EXAMPLE.TEST' })] })
    const pending = improvement({ assignments: [assignment({ email: 'WORKER@EXAMPLE.TEST', status: 'pending' })] })
    expect(filterImprovements([authored], { preset: 'mine' }, actorEmail, teamCode)).toEqual([authored])
    expect(filterImprovements([accepted], { preset: 'assigned' }, ' WORKER@example.test ', teamCode)).toEqual([accepted])
    expect(filterImprovements([accepted], { person: ' WORKER@example.test ' }, actorEmail, teamCode)).toEqual([accepted])
    expect(filterImprovements([pending], { invitations: true }, actorEmail, teamCode)).toEqual([pending])
  })

  it('matches my department through origin or affected departments, not assignment department', () => {
    const origin = improvement({ id: 'origin', affectedTeamCodes: [] })
    const affected = improvement({ id: 'affected', originTeamCode: 'logistics', affectedTeamCodes: ['operations'] })
    const unrelated = improvement({ id: 'assignment-only', originTeamCode: 'finance', affectedTeamCodes: [], assignments: [assignment()] })
    expect(filterImprovements([origin, affected, unrelated], { preset: 'department' }, actorEmail, teamCode))
      .toEqual([affected, origin])
  })

  it('filters only pending invitations addressed to the actor', () => {
    const pending = improvement({ id: 'pending', assignments: [assignment({ status: 'pending' })] })
    const cases = [
      improvement({ id: 'accepted', assignments: [assignment()] }), pending,
      improvement({ id: 'declined', assignments: [assignment({ status: 'declined' })] }),
      improvement({ id: 'other-recipient', assignments: [assignment({ email: 'other@example.test', status: 'pending' })] }),
    ]
    expect(filterImprovements(cases, { invitations: true }, actorEmail, teamCode)).toEqual([pending])
  })

  it('intersects invitations with other filters without turning them into assignments', () => {
    const pending = improvement({ assignments: [assignment({ status: 'pending' })] })
    expect(filterImprovements([pending], { invitations: true, priority: 'low' }, actorEmail, teamCode)).toEqual([])
    expect(filterImprovements([pending], { invitations: true, preset: 'assigned' }, actorEmail, teamCode)).toEqual([])
    const both = improvement({ assignments: [assignment(), assignment({ id: 'invite-2', kind: 'owner', status: 'pending' })] })
    expect(filterImprovements([both], { invitations: true, preset: 'assigned' }, actorEmail, teamCode)).toEqual([both])
  })

  it('does not accidentally match identity-dependent presets when identity is absent', () => {
    const entry = improvement({ createdBy: '', originTeamCode: '', affectedTeamCodes: [''], assignments: [assignment({ email: '' })] })
    expect(filterImprovements([entry], { preset: 'mine' }, '', '')).toEqual([])
    expect(filterImprovements([entry], { preset: 'assigned' }, '', '')).toEqual([])
    expect(filterImprovements([entry], { preset: 'department' }, '', '')).toEqual([])
    expect(filterImprovements([entry], { invitations: true }, '', '')).toEqual([])
  })

  it('combines filtering with the requested sort', () => {
    const older = improvement({ id: 'older', createdAt: '2026-08-01T10:00:00.000Z' })
    const newer = improvement({ id: 'newer' })
    expect(filterImprovements([newer, improvement({ id: 'excluded', priority: 'low' }), older], {
      priority: 'medium', sort: 'oldest',
    }, actorEmail, teamCode)).toEqual([older, newer])
  })
})

describe('sortImprovements', () => {
  it('defaults to updated ISO timestamps descending and breaks ties by ID ascending', () => {
    const older = improvement({ id: 'older', updatedAt: '2026-09-01T10:00:00.000Z' })
    const first = improvement({ id: 'case-a' })
    const second = improvement({ id: 'case-b' })
    expect(sortImprovements([second, older, first])).toEqual([first, second, older])
    expect(filterImprovements([second, older, first], {}, actorEmail, teamCode)).toEqual([first, second, older])
  })

  it('compares ISO timestamps chronologically even when timezone offsets differ', () => {
    const earlier = improvement({ id: 'earlier', updatedAt: '2026-09-02T11:00:00+02:00' })
    const later = improvement({ id: 'later', updatedAt: '2026-09-02T10:00:00Z' })
    expect(sortImprovements([earlier, later])).toEqual([later, earlier])
  })

  it.each(['newest', 'oldest'] as const)('sorts %s by creation time with ID ties', sort => {
    const older = improvement({ id: 'older', createdAt: '2026-08-01T10:00:00.000Z' })
    const first = improvement({ id: 'case-a' })
    const second = improvement({ id: 'case-b' })
    expect(sortImprovements([second, older, first], sort))
      .toEqual(sort === 'newest' ? [first, second, older] : [older, first, second])
  })

  it('orders critical, high, medium, low then updated time and ID', () => {
    const cases = IMPROVEMENT_PRIORITIES.map(priority => improvement({ id: priority, priority }))
    expect(sortImprovements([...cases].reverse(), 'priority')).toEqual(cases)
    const older = improvement({ id: 'older', updatedAt: '2026-08-01T10:00:00.000Z' })
    const first = improvement({ id: 'case-a' })
    const second = improvement({ id: 'case-b' })
    expect(sortImprovements([second, older, first], 'priority')).toEqual([first, second, older])
  })

  it('orders due dates earliest first, with absent deadlines last and deterministic ties', () => {
    const earlier = improvement({ id: 'earlier', dueDate: '2026-10-02' })
    const later = improvement({ id: 'later', dueDate: '2026-10-03' })
    const absentFirst = improvement({ id: 'absent-a' })
    const absentSecond = improvement({ id: 'absent-b', dueDate: '' })
    expect(sortImprovements([absentSecond, later, absentFirst, earlier], 'due'))
      .toEqual([earlier, later, absentFirst, absentSecond])
    const tie = improvement({ id: 'tie', dueDate: '2026-10-02', updatedAt: '2026-09-03T10:00:00.000Z' })
    expect(sortImprovements([earlier, tie], 'due')).toEqual([tie, earlier])
  })

  it('places invalid deadlines last rather than producing a non-deterministic comparator', () => {
    const invalid = improvement({ id: 'invalid', dueDate: 'not-a-date' })
    const valid = improvement({ id: 'valid', dueDate: '2026-10-02' })
    expect(sortImprovements([invalid, valid], 'due')).toEqual([valid, invalid])
  })

  it('does not mutate arrays or case records and accepts readonly inputs', () => {
    const first = Object.freeze(improvement({ id: 'case-a' }))
    const second = Object.freeze(improvement({ id: 'case-b' }))
    const cases = Object.freeze([second, first])
    expect(sortImprovements(cases)).toEqual([first, second])
    expect(filterImprovements(cases, {}, actorEmail, teamCode)).toEqual([first, second])
    expect(cases).toEqual([second, first])
    expect(sortImprovements(cases)[0]).toBe(first)
  })

  it('handles empty input', () => {
    expect(sortImprovements([])).toEqual([])
    expect(filterImprovements([], {}, actorEmail, teamCode)).toEqual([])
  })
})

describe('custom categories', () => {
  const labels = IMPROVEMENTS_LABELS.da.categories

  it('shows built-in categories translated and custom ones as written', () => {
    expect(improvementModel.improvementCategoryLabel('automation', labels)).toBe('Automatisering')
    expect(improvementModel.improvementCategoryLabel('Lager og logistik', labels)).toBe('Lager og logistik')
  })

  it('lists custom categories already used, once each, alphabetically and without deleted cases', () => {
    const cases = [
      improvement({ id: 'a', category: 'Truck-flåde' }),
      improvement({ id: 'b', category: 'IT' }),
      improvement({ id: 'c', category: 'truck-flåde' }),
      improvement({ id: 'd', category: 'process' }),
      { ...improvement({ id: 'e', category: 'Slettet kategori' }), deletedAt: '2026-10-01T00:00:00.000Z' },
    ]
    expect(improvementModel.customImprovementCategories(cases)).toEqual(['IT', 'Truck-flåde'])
  })

  it('resolves typed text to a built-in id, an existing custom category or a new clean category', () => {
    const cases = [improvement({ category: 'Truck-flåde' })]
    const resolve = (input: string) => improvementModel.resolveImprovementCategory(input, cases, labels)
    expect(resolve('  proces ')).toBe('process')
    expect(resolve('OTHER')).toBe('other')
    expect(resolve('truck-FLÅDE')).toBe('Truck-flåde')
    expect(resolve('  Ny   kategori ')).toBe('Ny kategori')
    expect(resolve('   ')).toBeNull()
    expect(resolve('x'.repeat(61))).toBeNull()
  })
})

describe('unreadImprovementNotifications', () => {
  it('returns the actor\'s unread notifications on live cases, newest first', () => {
    const notice = (id: string, createdAt: string, recipientEmail = actorEmail, readAt: string | null = null) => ({ id, type: 'invite', recipientEmail, createdAt, message: id, readAt })
    const cases = [
      improvement({ id: 'a', notifications: [notice('old', '2026-09-01T10:00:00.000Z'), notice('read', '2026-09-05T10:00:00.000Z', actorEmail, '2026-09-05T11:00:00.000Z')] }),
      improvement({ id: 'b', notifications: [notice('new', '2026-09-03T10:00:00.000Z', 'WORKER@example.test'), notice('other', '2026-09-04T10:00:00.000Z', 'someone@example.test')] }),
      { ...improvement({ id: 'c', notifications: [notice('deleted', '2026-09-06T10:00:00.000Z')] }), deletedAt: '2026-09-06T12:00:00.000Z' },
    ]
    const result = improvementModel.unreadImprovementNotifications(cases, ' Worker@Example.test ')
    expect(result.map(({ entry, notification }) => [entry.id, notification.id])).toEqual([['b', 'new'], ['a', 'old']])
    expect(improvementModel.unreadImprovementNotifications(cases, '')).toEqual([])
  })
})

describe('unseenImprovementIds', () => {
  const step = (actor: string, at: string, type = 'comment') => ({ id: `${actor}-${at}`, type, actorEmail: actor, actorName: actor, at, message: '' })
  const since = '2026-09-10T00:00:00.000Z'

  it('marks only suggestions that concern me and were changed by somebody else after I last opened them', () => {
    const cases = [
      improvement({ id: 'mine', createdBy: actorEmail, history: [step('author@example.test', '2026-09-11T10:00:00.000Z')] }),
      improvement({ id: 'assigned', assignments: [assignment()], history: [step('author@example.test', '2026-09-12T10:00:00.000Z')] }),
      improvement({ id: 'seen', createdBy: actorEmail, history: [step('author@example.test', '2026-09-11T10:00:00.000Z')] }),
      improvement({ id: 'own-change', createdBy: actorEmail, history: [step(actorEmail, '2026-09-11T10:00:00.000Z'), step('author@example.test', '2026-09-11T11:00:00.000Z', 'acknowledge')] }),
      improvement({ id: 'not-mine', history: [step('author@example.test', '2026-09-11T10:00:00.000Z')] }),
      improvement({ id: 'declined', assignments: [assignment({ status: 'declined' })], history: [step('author@example.test', '2026-09-11T10:00:00.000Z')] }),
      improvement({ id: 'old', createdBy: actorEmail, history: [step('author@example.test', '2026-09-09T10:00:00.000Z')] }),
    ]
    const result = improvementModel.unseenImprovementIds(cases, ' Worker@Example.test ', { since, cases: { seen: '2026-09-11T12:00:00.000Z' } })
    expect([...result].sort()).toEqual(['assigned', 'mine'])
  })

  it('marks nothing before the seen record is loaded', () => {
    const cases = [improvement({ createdBy: actorEmail, history: [step('author@example.test', '2026-09-11T10:00:00.000Z')] })]
    expect(improvementModel.unseenImprovementIds(cases, actorEmail, null).size).toBe(0)
  })
})

describe('improvement labels', () => {
  it('calls the Danish completed state Gennemført and makes owner submission explicit', () => {
    expect(IMPROVEMENTS_LABELS.da.statuses.completed).toBe('Gennemført')
    expect(IMPROVEMENTS_LABELS.da.submitForApproval).toBe('Meld færdig (til godkendelse)')
    expect(IMPROVEMENTS_LABELS.da.dueDate).toBe('Opgavefrist')
  })

  it.each(['da', 'en', 'fi', 'sv'] as const)('provides nonempty %s translations for every enum and UI label', language => {
    const labels = IMPROVEMENTS_LABELS[language]
    expect(Object.keys(labels).sort()).toEqual(Object.keys(IMPROVEMENTS_LABELS.en).sort())
    expect(Object.keys(labels.statuses)).toEqual([...IMPROVEMENT_STATUSES])
    expect(Object.keys(labels.categories)).toEqual([...IMPROVEMENT_CATEGORIES])
    expect(Object.keys(labels.priorities)).toEqual([...IMPROVEMENT_PRIORITIES])
    expect(Object.keys(labels.presets)).toEqual(['all', 'mine', 'assigned', 'department'])
    expect(Object.keys(labels.sorts)).toEqual(['updated', 'newest', 'oldest', 'priority', 'due'])
    expect(Object.keys(labels.assignmentStatuses)).toEqual(['pending', 'accepted', 'declined'])
    expect(Object.keys(labels.assignmentKinds)).toEqual(['owner', 'contributor'])
    for (const value of Object.values(labels)) {
      for (const text of typeof value === 'string' ? [value] : Object.values(value)) {
        expect(text).toMatch(/\S/)
        expect(text).not.toMatch(/\\u[0-9a-f]{4}/i)
      }
    }
  })

  it('selects a supported language and falls back to English', () => {
    expect(getImprovementsLabels('da')).toBe(IMPROVEMENTS_LABELS.da)
    expect(getImprovementsLabels('fi')).toBe(IMPROVEMENTS_LABELS.fi)
    expect(getImprovementsLabels('sv')).toBe(IMPROVEMENTS_LABELS.sv)
    expect(getImprovementsLabels('en')).toBe(IMPROVEMENTS_LABELS.en)
    expect(getImprovementsLabels('unsupported')).toBe(IMPROVEMENTS_LABELS.en)
  })
})