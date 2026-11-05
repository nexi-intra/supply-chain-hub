import { describe, expect, it } from 'vitest'
import {
  multiplayerActorName,
  multiplayerNotificationTarget,
  unreadMultiplayerNotifications,
} from './multiplayerNotifications'
import type { MultiplayerGameEntry, MultiplayerNotification, MultiplayerNotificationType } from './multiplayer'

const ANNA = { email: 'anna@example.test', name: 'Anna Andersen', teamCode: 'SC' }
const BO = { email: 'bo@example.test', name: 'Bo Bertelsen', teamCode: 'OPS' }

const game = (id: string): MultiplayerGameEntry => ({
  id, type: 'word-puzzle', language: 'da', players: [ANNA, BO], status: 'active', turn: BO.email, gameRevision: 1,
  createdAt: '2026-10-07T08:00:00.000Z', updatedAt: '2026-10-07T08:00:00.000Z', scores: [0, 0], winner: null, finishedReason: null, reminders: [null, null],
})

const note = (id: string, overrides: Partial<MultiplayerNotification> = {}): MultiplayerNotification => ({
  id, gameId: 'g1', recipientEmail: BO.email, actorEmail: ANNA.email, type: 'turn',
  createdAt: '2026-10-07T08:00:00.000Z', readAt: null, ...overrides,
})

const snapshot = (notifications: MultiplayerNotification[], email = BO.email) => ({
  actor: { email, fullName: 'Bo', teamCode: 'OPS' },
  notifications,
})

describe('unreadMultiplayerNotifications', () => {
  it('keeps unread notifications for the actor, newest first', () => {
    const result = unreadMultiplayerNotifications(snapshot([
      note('old', { createdAt: '2026-10-07T07:00:00.000Z' }),
      note('read', { readAt: '2026-10-07T09:00:00.000Z' }),
      note('other', { recipientEmail: ANNA.email }),
      note('new', { createdAt: '2026-10-07T09:00:00.000Z' }),
    ]), 'bo@example.test')
    expect(result.map(item => item.id)).toEqual(['new', 'old'])
  })

  it('compares emails case-insensitively', () => {
    const result = unreadMultiplayerNotifications(snapshot([note('a', { recipientEmail: 'Bo@Example.test' })], 'BO@example.test'), ' bo@EXAMPLE.test ')
    expect(result).toHaveLength(1)
  })

  it('returns nothing when the signed-in actor is not the expected user', () => {
    expect(unreadMultiplayerNotifications(snapshot([note('a')], 'anna@example.test'), 'bo@example.test')).toEqual([])
    expect(unreadMultiplayerNotifications(snapshot([note('a')]), '')).toEqual([])
  })
})

describe('multiplayerActorName', () => {
  it('uses the player name from the matching game', () => {
    expect(multiplayerActorName([game('g1')], note('a'))).toBe('Anna Andersen')
  })

  it('looks through all games when the notification game is unknown', () => {
    expect(multiplayerActorName([game('other')], note('a', { gameId: 'missing' }))).toBe('Anna Andersen')
  })

  it('falls back to the local part of the email', () => {
    expect(multiplayerActorName([], note('a', { actorEmail: 'carl.jensen@example.test' }))).toBe('carl.jensen')
  })
})

describe('multiplayerNotificationTarget', () => {
  it('opens the match for notifications about a started game', () => {
    const types: MultiplayerNotificationType[] = ['accepted', 'turn', 'approve-word', 'word-approved', 'word-rejected', 'reminder', 'chat', 'finished']
    for (const type of types) {
      expect(multiplayerNotificationTarget(note('a', { type, gameId: 'g9' }))).toEqual({ view: 'games', params: { tab: 'multiplayer', itemId: 'g9' } })
    }
  })

  it('names the game for invitations too, so the hub can open the right lobby', () => {
    for (const type of ['invite', 'declined', 'cancelled', 'draw-offer', 'draw-declined'] as const) {
      expect(multiplayerNotificationTarget(note('a', { type, gameId: 'g7' }))).toEqual({ view: 'games', params: { tab: 'multiplayer', itemId: 'g7' } })
    }
  })
})
