import { describe, expect, it } from 'vitest'
import { APP_VIEW_IDS } from './appNavigation'
import { buildHubNotificationItems, diffNotifications, DISMISSED_NOTIFICATIONS_LIMIT, dismissedNotificationsKey, withDismissed, type HubNotificationInput } from './hubNotifications'
import { MULTIPLAYER_LABELS } from './multiplayerLabels'
import type { MultiplayerGameEntry, MultiplayerNotification } from './multiplayer'

const NOW = new Date('2026-10-07T10:00:00.000Z').getTime()
const ME = 'me@example.test'

const base = (overrides: Partial<HubNotificationInput> = {}): HubNotificationInput => ({
  userEmail: ME,
  language: 'en',
  now: NOW,
  isAdminOrManager: false,
  isGuideReviewer: false,
  emails: [],
  notebookNotifications: [],
  birthdays: [],
  vacations: [],
  guides: [],
  guideReviewRequests: [],
  seenVacationRequestIds: [],
  personalTodos: [],
  projects: [],
  improvementNotifications: [],
  multiplayerNotifications: [],
  multiplayerGames: [],
  highFives: [],
  ...overrides,
})

const email = (id: string, overrides = {}) => ({ id, from: 'a@example.test', to: ME, subject: `Subject ${id}`, body: '', timestamp: NOW - 1000, read: false, ...overrides }) as never

const game: MultiplayerGameEntry = {
  id: 'g1', type: 'word-puzzle', language: 'da',
  players: [{ email: 'anna@example.test', name: 'Anna Andersen', teamCode: 'SC' }, { email: ME, name: 'Me', teamCode: 'SC' }],
  status: 'active', turn: ME, gameRevision: 1, createdAt: '2026-10-07T08:00:00.000Z', updatedAt: '2026-10-07T08:00:00.000Z',
  scores: [0, 0], winner: null, finishedReason: null, reminders: [null, null],
}
const turnNote: MultiplayerNotification = { id: 'n1', gameId: 'g1', recipientEmail: ME, actorEmail: 'anna@example.test', type: 'turn', createdAt: '2026-10-07T09:00:00.000Z', readAt: null }

describe('dismissed notifications', () => {
  it('is a personal key per user', () => {
    expect(dismissedNotificationsKey(ME)).toBe('hub-notifications-dismissed-me@example.test')
  })

  it('adds ids once, newest last, and keeps only the newest ones', () => {
    expect(withDismissed(undefined, ['a', 'b', 'a'])).toEqual(['a', 'b'])
    expect(withDismissed(['a', 'b'], ['a', 'c'])).toEqual(['b', 'a', 'c'])
    const full = Array.from({ length: DISMISSED_NOTIFICATIONS_LIMIT }, (_, index) => `old-${index}`)
    const next = withDismissed(full, ['new'])
    expect(next).toHaveLength(DISMISSED_NOTIFICATIONS_LIMIT)
    expect(next[next.length - 1]).toBe('new')
    expect(next).not.toContain('old-0')
  })
})

describe('buildHubNotificationItems', () => {
  it('tells the creator who found the nisse, in which hub and when (Danish time)', () => {
    const find = { teamId: 'tcd', teamName: 'Terminal Configuration & Dispatch', date: '2026-12-16', email: 'lasse@example.test', name: 'Lasse Hansen', at: '2026-12-16T09:42:00.000Z' }
    const items = buildHubNotificationItems(base({ language: 'da', nisseFinds: [find] }))
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: 'nisse-tcd-2026-12-16', kind: 'nisse', iconColor: 'text-red-600', title: '🎅 Lasse Hansen fandt nissen',
      subtitle: 'Terminal Configuration & Dispatch · kl. 10:42', timestamp: Date.parse(find.at), target: { view: 'hub' },
    })
    expect(buildHubNotificationItems(base({ language: 'en', nisseFinds: [find] }))[0].title).toBe('🎅 Lasse Hansen found the elf')
    expect(buildHubNotificationItems(base())).toHaveLength(0)
  })
  it('adds a bell item per unread high-five: sender and emoji in the title, the message as subtitle, the Hub as target, and an ack for the service', () => {
    const highFive = { id: 'h1', senderName: 'Anna Andersen', senderTeamCode: 'SC', emoji: '🙌', message: 'Thanks for the help!', at: '2026-10-07T09:30:00.000Z', readAt: null }
    const items = buildHubNotificationItems(base({ highFives: [highFive] }))
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: 'high-five-h1', kind: 'high-five', iconColor: 'text-amber-500', title: 'Anna Andersen sent you a high-five 🙌', subtitle: 'Thanks for the help!',
      timestamp: Date.parse(highFive.at), target: { view: 'hub' }, ack: { source: 'high-five', notificationId: 'h1' },
    })
    expect(buildHubNotificationItems(base({ language: 'da', highFives: [highFive] }))[0].title).toBe('Anna Andersen sendte dig en high-five 🙌')
    expect(buildHubNotificationItems(base({ language: 'fi', highFives: [highFive] }))[0].title).toContain('Anna Andersen')
    expect(buildHubNotificationItems(base({ language: 'sv', highFives: [highFive] }))[0].title).toContain('Anna Andersen')
    expect(APP_VIEW_IDS).toContain(items[0].target.view)
  })

  it('tells the bell how to mark improvement and multiplayer items read in their module', () => {
    const entry = { id: 'case-1', title: 'Better labels' } as never
    const notification = { id: 'note-1', message: 'You were invited', createdAt: '2026-10-07T09:00:00.000Z' } as never
    const items = buildHubNotificationItems(base({ improvementNotifications: [{ entry, notification }], multiplayerNotifications: [turnNote], multiplayerGames: [game] }))
    expect(items.find(item => item.kind === 'improvement')?.ack).toEqual({ source: 'improvement', caseId: 'case-1', notificationId: 'note-1' })
    expect(items.find(item => item.kind === 'multiplayer')?.ack).toEqual({ source: 'multiplayer', notificationId: 'n1' })
    const mail = buildHubNotificationItems(base({ emails: [email('e1')] }))
    expect(mail[0].ack).toBeUndefined()
  })

  it('tells the bell which notebook notification to mark read when a shared-note edit is dismissed', () => {
    const edit = { id: 'nn1', type: 'note-edited' as const, noteId: 'note-9', noteTitle: 'Handover', editedByName: 'Bo Berg', originalCreator: ME, timestamp: '2026-10-07T09:00:00.000Z', read: false }
    const items = buildHubNotificationItems(base({ notebookNotifications: [edit, { ...edit, id: 'nn2', read: true }, { ...edit, id: 'nn3', originalCreator: 'other@example.test' }] }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'note-nn1', kind: 'note', ack: { source: 'note', notificationId: 'nn1' } })
  })

  it('lists unread inbox mail with a stable id and a navigation target', () => {
    const items = buildHubNotificationItems(base({ emails: [email('e1'), email('e2', { read: true }), email('e3', { to: 'other@example.test' }), email('e4', { folderId: 'f' })] }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'email-e1', title: 'Subject e1', subtitle: 'From a@example.test', target: { view: 'email' } })
  })

  it('adds multiplayer items with the game name as title, a localised sentence, and a deep link', () => {
    const items = buildHubNotificationItems(base({ multiplayerNotifications: [turnNote], multiplayerGames: [game] }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'multiplayer-n1',
      kind: 'multiplayer',
      title: 'Word-Puzzle',
      subtitle: MULTIPLAYER_LABELS.en.notifications.turn('Anna Andersen'),
      timestamp: Date.parse(turnNote.createdAt),
      target: { view: 'games', params: { tab: 'multiplayer', itemId: 'g1' } },
    })
    const danish = buildHubNotificationItems(base({ language: 'da', multiplayerNotifications: [turnNote], multiplayerGames: [game] }))
    expect(danish[0].subtitle).toBe('Det er din tur mod Anna Andersen')
  })

  it('names the right game in the bell for chess, from the notification or the game list', () => {
    const invite: MultiplayerNotification = { ...turnNote, id: 'n2', gameId: 'c1', type: 'invite', gameType: 'chess' }
    const chessGame: MultiplayerGameEntry = { ...game, id: 'c1', type: 'chess', language: null, challengerColor: 'random', whiteIndex: null }
    const stored = buildHubNotificationItems(base({ language: 'da', multiplayerNotifications: [invite] }))
    expect(stored[0]).toMatchObject({ title: 'Skak', subtitle: 'anna har udfordret dig til skak' })
    const looked = buildHubNotificationItems(base({ multiplayerNotifications: [{ ...invite, gameType: undefined }], multiplayerGames: [chessGame] }))
    expect(looked[0]).toMatchObject({ title: 'Chess', subtitle: 'Anna Andersen challenged you to chess' })
    const wordInvite = buildHubNotificationItems(base({ language: 'sv', multiplayerNotifications: [{ ...invite, gameId: 'g1', gameType: undefined }], multiplayerGames: [game] }))
    expect(wordInvite[0]).toMatchObject({ title: 'Word-Puzzle', subtitle: 'Anna Andersen har utmanat dig i Word-Puzzle' })
    const draw = buildHubNotificationItems(base({ language: 'fi', multiplayerNotifications: [{ ...invite, type: 'draw-offer' }], multiplayerGames: [chessGame] }))
    expect(draw[0].subtitle).toBe('Anna Andersen tarjoaa tasapeliä')
  })

  it('only shows manager items to managers', () => {
    const vacation = { id: 'v1', userEmail: 'x@example.test', startDate: '2026-11-01', status: 'pending' } as never
    expect(buildHubNotificationItems(base({ vacations: [vacation] }))).toEqual([])
    const manager = buildHubNotificationItems(base({ isAdminOrManager: true, vacations: [vacation] }))
    expect(manager.map(item => item.id)).toEqual(['vacation-v1'])
    const seen = buildHubNotificationItems(base({ isAdminOrManager: true, vacations: [vacation], seenVacationRequestIds: ['v1'] }))
    expect(seen).toEqual([])
  })

  it('gives recurring items an id that is unique per occurrence so desktop dedupe never swallows a later one', () => {
    const birthday = { email: 'b@example.test', fullName: 'Bea', birthday: '10-07' } as never
    const a = buildHubNotificationItems(base({ birthdays: [birthday] }))
    const b = buildHubNotificationItems(base({ birthdays: [birthday], now: new Date('2027-10-07T10:00:00.000Z').getTime() }))
    expect(a).toHaveLength(1)
    expect(a[0].id).not.toBe(b[0].id)
    const due = { id: 't1', title: 'Pay', done: false, dueDate: '2026-10-07' } as never
    const overdue = { id: 't1', title: 'Pay', done: false, dueDate: '2026-10-01' } as never
    const today = buildHubNotificationItems(base({ personalTodos: [due] }))
    const late = buildHubNotificationItems(base({ personalTodos: [overdue] }))
    expect(today[0].id).not.toBe(late[0].id)
  })

  it('never reports an appointment as a due or overdue to-do', () => {
    const meeting = { id: 'm1', title: 'Møde', status: 'open', kind: 'event', dueDate: '2026-10-01' } as never
    expect(buildHubNotificationItems(base({ personalTodos: [meeting] }))).toEqual([])
  })

  it('sorts newest first and only uses ids made of plain strings', () => {
    const items = buildHubNotificationItems(base({
      emails: [email('old', { timestamp: NOW - 5000 }), email('new', { timestamp: NOW - 10 })],
      multiplayerNotifications: [turnNote], multiplayerGames: [game],
    }))
    expect(items.map(item => item.timestamp)).toEqual([...items.map(item => item.timestamp)].sort((x, y) => y - x))
    for (const item of items) expect(item.id).toMatch(/^[\w:.@-]+$/)
  })

  it('only targets known views', () => {
    const vacation = { id: 'v1', userEmail: 'x@example.test', startDate: '2026-11-01', status: 'pending' } as never
    const items = buildHubNotificationItems(base({ isAdminOrManager: true, vacations: [vacation], emails: [email('e1')], multiplayerNotifications: [turnNote], multiplayerGames: [game] }))
    for (const item of items) expect(APP_VIEW_IDS).toContain(item.target.view)
  })

  it('tells a manager about links waiting for review, suggestions and reports, and the creator about a decision', () => {
    const reviewedAt = new Date(NOW - 60_000).toISOString()
    const links = {
      links: [
        { id: 'mine', title: 'Mit link', mine: true, status: 'approved', reviewedByOther: true, reviewedAt },
        { id: 'self', title: 'Selv godkendt', mine: true, status: 'approved', reviewedByOther: false, reviewedAt },
        { id: 'old', title: 'Gammel', mine: true, status: 'rejected', reviewedByOther: true, reviewedAt: new Date(NOW - 30 * 86400000).toISOString() },
      ],
      review: {
        pending: [{ id: 'p1', title: 'Ny', createdByName: 'Anna', createdAt: reviewedAt }],
        suggestions: [{ id: 's1', linkTitle: 'Ret', byName: 'Bo', at: reviewedAt }],
        reports: [{ id: 'r1', linkTitle: 'Farlig', byName: 'Cy', reason: 'suspicious', at: reviewedAt }],
      },
    } as never
    const items = buildHubNotificationItems(base({ links }))
    expect(items.map(item => item.id).sort()).toEqual(['link-pending-p1', 'link-report-r1', `link-reviewed-mine-${reviewedAt}`, 'link-suggestion-s1'])
    for (const item of items) {
      expect(item.kind).toBe('link')
      expect(item.target.view).toBe('links')
      expect(item.id).toMatch(/^[\w:.@-]+$/)
    }
    expect(items.find(item => item.id === 'link-report-r1')?.iconColor).toBe('text-destructive')
  })

  it('turns count notifications into items that open the count on the right tab', () => {
    const count = { countId: 'c1', countName: 'D000 terminaler' }
    const items = buildHubNotificationItems(base({
      language: 'da',
      countNotifications: [
        { ...count, type: 'join-request', email: 'bo@example.test', name: 'Bo', at: NOW - 3000 },
        { ...count, type: 'submitted', material: 'R162-0717', name: 'Bo', diff: -2, at: NOW - 2000 },
        { ...count, type: 'join-decided', approved: false, name: 'Mona', at: NOW - 1000 },
        { ...count, type: 'returned', material: 'R162-0717', name: 'Mona', comment: 'Tæl igen', at: NOW },
      ],
    }))
    expect(items.map(item => [item.id, item.subtitle, item.target.params?.tab])).toEqual([
      [`count-returned-c1-R162-0717-${NOW}`, 'Mona har sendt R162-0717 tilbage: Tæl igen', 'count-approval'],
      [`count-joined-c1-${NOW - 1000}`, 'Mona har afvist din anmodning om at deltage', 'count'],
      [`count-submitted-c1-R162-0717-${NOW - 2000}`, 'Bo har sendt R162-0717 til godkendelse (difference -2)', 'count-approval'],
      [`count-join-c1-bo@example.test-${NOW - 3000}`, 'Bo anmoder om at deltage', 'count-members'],
    ])
    for (const item of items) {
      expect(item.kind).toBe('count')
      expect(item.title).toBe('Optælling · D000 terminaler')
      expect(item.target).toMatchObject({ view: 'warehouse', params: { itemId: 'c1' } })
      expect(item.id).toMatch(/^[\w:.@-]+$/)
    }
  })
})

describe('diffNotifications', () => {
  const item = (id: string) => ({ id })

  it('marks everything present before the baseline is ready as known without reporting it', () => {
    const first = diffNotifications({ known: new Set(), baselined: false }, [item('a'), item('b')], false)
    expect(first.fresh).toEqual([])
    expect(first.state.baselined).toBe(false)
    const late = diffNotifications(first.state, [item('a'), item('b'), item('c')], false)
    expect(late.fresh).toEqual([])
    const ready = diffNotifications(late.state, [item('a'), item('b'), item('c')], true)
    expect(ready.fresh).toEqual([])
    expect(ready.state.baselined).toBe(true)
  })

  it('reports only items that appear after the baseline, once', () => {
    let state = diffNotifications({ known: new Set(), baselined: false }, [item('a')], true).state
    const next = diffNotifications(state, [item('a'), item('b')], true)
    expect(next.fresh).toEqual([item('b')])
    state = next.state
    const again = diffNotifications(state, [item('a'), item('b')], true)
    expect(again.fresh).toEqual([])
    const gone = diffNotifications(again.state, [item('a')], true)
    const back = diffNotifications(gone.state, [item('a'), item('b')], true)
    expect(back.fresh).toEqual([])
  })

  it('does not mutate the previous state', () => {
    const before = { known: new Set(['a']), baselined: true }
    diffNotifications(before, [item('a'), item('b')], true)
    expect([...before.known]).toEqual(['a'])
  })
})
