import { describe, expect, it } from 'vitest'
import type { MultiplayerBoard, MultiplayerChessEntry, MultiplayerNotification, MultiplayerPlayer, MultiplayerWordPuzzleEntry } from './multiplayer'
import {
  backspace, canAct, canApprove, canExchange, canMove, canRemind, draftToPlacements, emptyDraft, groupGames, isChessEntry, isWordPuzzleEntry, matchesPerson,
  moveCursor, moveDraftTile, multiplayerErrorInfo, opponentOf, outcomeFor, placeTile, recallAll, recallTile, relativeTime,
  retargetBlank, shuffleRack, toggleDirection, typeLetter, unplacedRackIndexes, unreadGameNotificationIds, REMINDER_INTERVAL_MS,
} from './multiplayerView'

const me: MultiplayerPlayer = { email: 'me@example.com', name: 'Me', teamCode: 'a' }
const other: MultiplayerPlayer = { email: 'anna@example.com', name: 'Anna', teamCode: 'b' }

function entry(patch: Partial<MultiplayerWordPuzzleEntry> & { id: string }): MultiplayerWordPuzzleEntry {
  return {
    type: 'word-puzzle', language: 'da', players: [me, other], status: 'active', turn: me.email, gameRevision: 1,
    createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', scores: [0, 0], winner: null,
    finishedReason: null, reminders: [null, null], ...patch,
  }
}

function chessEntry(patch: Partial<MultiplayerChessEntry> & { id: string }): MultiplayerChessEntry {
  return {
    type: 'chess', language: null, challengerColor: 'random', whiteIndex: 0, players: [me, other], status: 'active', turn: me.email, gameRevision: 1,
    createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', scores: [0, 0], winner: null,
    finishedReason: null, reminders: [null, null], ...patch,
  }
}

const emptyBoard = (): MultiplayerBoard => Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null))

describe('groupGames', () => {
  const games = [
    entry({ id: 'turn-old', updatedAt: '2026-01-02T00:00:00.000Z' }),
    entry({ id: 'turn-new', updatedAt: '2026-01-05T00:00:00.000Z', status: 'awaiting-approval' }),
    entry({ id: 'wait', turn: other.email, updatedAt: '2026-01-03T00:00:00.000Z' }),
    entry({ id: 'in', status: 'invited', turn: null, players: [other, me] }),
    entry({ id: 'out', status: 'invited', turn: null }),
    entry({ id: 'fin-old', status: 'finished', turn: null, updatedAt: '2026-01-02T00:00:00.000Z' }),
    entry({ id: 'declined', status: 'declined', turn: null, updatedAt: '2026-01-06T00:00:00.000Z' }),
    entry({ id: 'cancelled', status: 'cancelled', turn: null, updatedAt: '2026-01-04T00:00:00.000Z' }),
  ]

  it('splits games by what the player has to do', () => {
    const groups = groupGames(games, me.email)
    expect(groups.yourTurn.map(g => g.id)).toEqual(['turn-new', 'turn-old'])
    expect(groups.waiting.map(g => g.id)).toEqual(['wait'])
    expect(groups.invitationsIn.map(g => g.id)).toEqual(['in'])
    expect(groups.invitationsOut.map(g => g.id)).toEqual(['out'])
  })

  it('lists finished, declined and cancelled games newest first', () => {
    expect(groupGames(games, me.email).finished.map(g => g.id)).toEqual(['declined', 'cancelled', 'fin-old'])
  })

  it('compares emails case-insensitively and does not mutate the input', () => {
    const copy = [...games]
    expect(groupGames(games, 'ME@Example.com').yourTurn).toHaveLength(2)
    expect(games).toEqual(copy)
  })

  it('puts a game with no acting player under waiting', () => {
    expect(groupGames([entry({ id: 'x', turn: null })], me.email).waiting.map(g => g.id)).toEqual(['x'])
  })
})

describe('game permissions', () => {
  it('lets only the player to act move, and only while the game is active', () => {
    expect(canMove({ status: 'active', turn: me.email }, me.email)).toBe(true)
    expect(canMove({ status: 'active', turn: other.email }, me.email)).toBe(false)
    expect(canMove({ status: 'awaiting-approval', turn: me.email }, me.email)).toBe(false)
    expect(canMove({ status: 'finished', turn: null }, me.email)).toBe(false)
  })

  it('lets only the approver approve', () => {
    expect(canApprove({ status: 'awaiting-approval', turn: me.email }, me.email)).toBe(true)
    expect(canApprove({ status: 'awaiting-approval', turn: other.email }, me.email)).toBe(false)
    expect(canApprove({ status: 'active', turn: me.email }, me.email)).toBe(false)
  })

  it('treats moving or approving as acting', () => {
    expect(canAct({ status: 'awaiting-approval', turn: me.email }, me.email)).toBe(true)
    expect(canAct({ status: 'active', turn: me.email }, me.email)).toBe(true)
    expect(canAct({ status: 'active', turn: other.email }, me.email)).toBe(false)
  })

  it('allows an exchange only when the bag holds a full rack', () => {
    expect(canExchange({ bagCount: 7 })).toBe(true)
    expect(canExchange({ bagCount: 6 })).toBe(false)
  })

  it('allows a reminder only to the waiting player, at most every twelve hours', () => {
    const now = Date.parse('2026-01-02T12:00:00.000Z')
    const waiting = entry({ id: 'w', turn: other.email })
    expect(canRemind(waiting, me.email, now)).toBe(true)
    expect(canRemind(entry({ id: 'w', turn: me.email }), me.email, now)).toBe(false)
    expect(canRemind(entry({ id: 'w', status: 'finished', turn: null }), me.email, now)).toBe(false)
    const recent = new Date(now - REMINDER_INTERVAL_MS + 60_000).toISOString()
    expect(canRemind(entry({ id: 'w', turn: other.email, reminders: [recent, null] }), me.email, now)).toBe(false)
    const old = new Date(now - REMINDER_INTERVAL_MS).toISOString()
    expect(canRemind(entry({ id: 'w', turn: other.email, reminders: [old, null] }), me.email, now)).toBe(true)
    expect(canRemind(entry({ id: 'w', turn: other.email, players: [other, me], reminders: [recent, null] }), me.email, now)).toBe(true)
  })

  it('finds the opponent and the outcome', () => {
    expect(opponentOf(entry({ id: 'a' }), me.email)).toBe(other)
    expect(opponentOf(entry({ id: 'a', players: [other, me] }), me.email)).toBe(other)
    expect(outcomeFor({ status: 'finished', winner: me.email }, me.email)).toBe('won')
    expect(outcomeFor({ status: 'finished', winner: other.email }, me.email)).toBe('lost')
    expect(outcomeFor({ status: 'finished', winner: 'draw' }, me.email)).toBe('draw')
    expect(outcomeFor({ status: 'active', winner: null }, me.email)).toBeNull()
  })

  it('tells chess entries from Word-Puzzle entries and groups chess games like any other', () => {
    const word = entry({ id: 'word' })
    const chess = chessEntry({ id: 'chess', turn: other.email, scores: [0, 0] })
    expect([word, chess].filter(isWordPuzzleEntry).map(item => item.id)).toEqual(['word'])
    expect([word, chess].filter(isChessEntry).map(item => item.id)).toEqual(['chess'])
    expect(groupGames([word, chess], me.email).waiting.map(item => item.id)).toEqual(['chess'])
    expect(canRemind(chess, me.email, Date.parse('2026-01-02T12:00:00.000Z'))).toBe(true)
    expect(outcomeFor(chessEntry({ id: 'c', status: 'finished', winner: 'draw', finishedReason: 'stalemate', turn: null }), me.email)).toBe('draw')
  })
})

describe('unreadGameNotificationIds', () => {
  const note = (patch: Partial<MultiplayerNotification> & { id: string }): MultiplayerNotification => ({
    gameId: 'g1', recipientEmail: me.email, actorEmail: other.email, type: 'turn', createdAt: '2026-01-01T00:00:00.000Z', readAt: null, ...patch,
  })

  it('returns unread notifications for this game that a visible match makes obsolete', () => {
    const ids = unreadGameNotificationIds([
      note({ id: 'turn' }), note({ id: 'chat', type: 'chat' }), note({ id: 'approve', type: 'approve-word' }),
      note({ id: 'ok', type: 'word-approved' }), note({ id: 'no', type: 'word-rejected' }), note({ id: 'fin', type: 'finished' }),
      note({ id: 'rem', type: 'reminder' }), note({ id: 'acc', type: 'accepted' }),
      note({ id: 'read', readAt: '2026-01-02T00:00:00.000Z' }), note({ id: 'other-game', gameId: 'g2' }),
      note({ id: 'someone-else', recipientEmail: 'x@example.com' }), note({ id: 'invite', type: 'invite' }),
    ], 'g1', me.email)
    expect(ids).toEqual(['turn', 'chat', 'approve', 'ok', 'no', 'fin', 'rem', 'acc'])
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-03-10T12:00:00.000Z')
  it('describes recent activity in the app language', () => {
    expect(relativeTime('2026-03-10T11:59:50.000Z', now, 'en')).toBe('now')
    expect(relativeTime('2026-03-10T11:58:00.000Z', now, 'en')).toBe('2 minutes ago')
    expect(relativeTime('2026-03-10T09:00:00.000Z', now, 'en')).toBe('3 hours ago')
    expect(relativeTime('2026-03-09T11:00:00.000Z', now, 'en')).toBe('yesterday')
    expect(relativeTime('2026-03-07T12:00:00.000Z', now, 'en')).toBe('3 days ago')
  })
  it('falls back to a date for old activity and survives bad input', () => {
    expect(relativeTime('2025-01-05T12:00:00.000Z', now, 'en')).toContain('2025')
    expect(relativeTime('nonsense', now, 'en')).toBe('')
  })
})

describe('multiplayerErrorInfo', () => {
  it('reads the code and rules detail out of an IPC error message', () => {
    const error = new Error("Error invoking remote method 'multiplayer:command': Error: MULTIPLAYER_INVALID_MOVE: NOT_IN_LINE")
    expect(multiplayerErrorInfo(error)).toEqual({ code: 'MULTIPLAYER_INVALID_MOVE', detail: 'NOT_IN_LINE' })
  })
  it('reads plain codes and auth errors', () => {
    expect(multiplayerErrorInfo(new Error('MULTIPLAYER_CONFLICT: The game revision has changed'))).toEqual({ code: 'MULTIPLAYER_CONFLICT', detail: null })
    expect(multiplayerErrorInfo({ message: 'AUTH_REQUIRED: x' }).code).toBe('AUTH_REQUIRED')
  })
  it('returns no code for anything else', () => {
    expect(multiplayerErrorInfo(new Error('boom'))).toEqual({ code: null, detail: null })
    expect(multiplayerErrorInfo(undefined)).toEqual({ code: null, detail: null })
    expect(multiplayerErrorInfo(new Error('MULTIPLAYER_DIRECTORY: nope')).code).toBe('MULTIPLAYER_UNAVAILABLE')
  })
})

describe('matchesPerson', () => {
  it('matches on name or team, ignoring case and accents', () => {
    const person = { email: 'a@x.dk', fullName: 'Søren Åberg', teamCode: 'sc' }
    expect(matchesPerson(person, 'Supply Chain', 'søren')).toBe(true)
    expect(matchesPerson(person, 'Supply Chain', 'SOREN')).toBe(true)
    expect(matchesPerson(person, 'Supply Chain', 'supply')).toBe(true)
    expect(matchesPerson(person, 'Supply Chain', 'finance')).toBe(false)
    expect(matchesPerson(person, 'Supply Chain', '   ')).toBe(true)
  })
})

describe('draft placement', () => {
  const rack = ['A', 'B', '?', 'D', 'E', 'F', 'G']

  it('places, moves and recalls tiles', () => {
    let draft = emptyDraft(rack.length)
    expect(draft.order).toEqual([0, 1, 2, 3, 4, 5, 6])
    draft = placeTile(draft, emptyBoard(), rack, 0, 7, 7)
    draft = placeTile(draft, emptyBoard(), rack, 1, 7, 8)
    expect(draftToPlacements(draft)).toEqual([
      { row: 7, col: 7, letter: 'A', blank: false },
      { row: 7, col: 8, letter: 'B', blank: false },
    ])
    expect(unplacedRackIndexes(draft)).toEqual([2, 3, 4, 5, 6])
    draft = moveDraftTile(draft, emptyBoard(), { row: 7, col: 8 }, { row: 8, col: 7 })
    expect(draft.tiles.find(t => t.rackIndex === 1)).toMatchObject({ row: 8, col: 7 })
    draft = recallTile(draft, 7, 7)
    expect(unplacedRackIndexes(draft)).toEqual([0, 2, 3, 4, 5, 6])
    expect(recallAll(draft).tiles).toEqual([])
  })

  it('moves a rack tile that is already on the board when it is placed again', () => {
    let draft = placeTile(emptyDraft(7), emptyBoard(), rack, 0, 7, 7)
    draft = placeTile(draft, emptyBoard(), rack, 0, 7, 9)
    expect(draft.tiles).toHaveLength(1)
    expect(draft.tiles[0]).toMatchObject({ row: 7, col: 9 })
  })

  it('refuses occupied squares, bad squares and bad rack indexes', () => {
    const board = emptyBoard()
    board[7][7] = { letter: 'X', blank: false }
    const draft = placeTile(emptyDraft(7), board, rack, 0, 7, 8)
    expect(placeTile(draft, board, rack, 1, 7, 7)).toBe(draft)
    expect(placeTile(draft, board, rack, 1, 7, 8)).toBe(draft)
    expect(placeTile(draft, board, rack, 1, 15, 0)).toBe(draft)
    expect(placeTile(draft, board, rack, 9, 1, 1)).toBe(draft)
    expect(moveDraftTile(draft, board, { row: 7, col: 8 }, { row: 7, col: 7 })).toBe(draft)
  })

  it('requires a letter for a blank tile and reports it as blank', () => {
    const empty = emptyDraft(7)
    expect(placeTile(empty, emptyBoard(), rack, 2, 7, 7)).toBe(empty)
    expect(placeTile(empty, emptyBoard(), rack, 2, 7, 7, '')).toBe(empty)
    const draft = placeTile(empty, emptyBoard(), rack, 2, 7, 7, 'ø')
    expect(draftToPlacements(draft)).toEqual([{ row: 7, col: 7, letter: 'Ø', blank: true }])
    const changed = retargetBlank(draft, 7, 7, 'Z')
    expect(draftToPlacements(changed)[0].letter).toBe('Z')
    expect(retargetBlank(placeTile(empty, emptyBoard(), rack, 0, 1, 1), 1, 1, 'Z').tiles[0].letter).toBe('A')
  })

  it('shuffles the display order without losing tiles', () => {
    const draft = placeTile(emptyDraft(7), emptyBoard(), rack, 3, 7, 7)
    const steps = [0, 0, 0, 0, 0, 0]
    let i = 0
    const shuffled = shuffleRack(draft, () => steps[i++] ?? 0)
    expect([...shuffled.order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(shuffled.order).not.toEqual(draft.order)
    expect(shuffled.tiles).toBe(draft.tiles)
  })
})

describe('keyboard typing', () => {
  const rack = ['H', 'E', 'J', '?', 'A', 'B', 'C']
  const start = { cursor: { row: 7, col: 7 }, direction: 'across' as const }

  it('places letters from the rack along the direction and advances the cursor', () => {
    const first = typeLetter(emptyDraft(7), emptyBoard(), rack, start, 'h')
    const second = typeLetter(first.draft, emptyBoard(), rack, first.state, 'E')
    expect(second.draft.tiles.map(t => [t.letter, t.row, t.col])).toEqual([['H', 7, 7], ['E', 7, 8]])
    expect(second.state.cursor).toEqual({ row: 7, col: 9 })
    expect(second.placed).toBe(true)
  })

  it('types downwards when the direction is down', () => {
    const result = typeLetter(emptyDraft(7), emptyBoard(), rack, toggleDirection(start), 'J')
    expect(result.draft.tiles[0]).toMatchObject({ row: 7, col: 7 })
    expect(result.state.cursor).toEqual({ row: 8, col: 7 })
  })

  it('uses the blank tile when no real tile has the letter', () => {
    const result = typeLetter(emptyDraft(7), emptyBoard(), rack, start, 'z')
    expect(result.draft.tiles[0]).toMatchObject({ rackIndex: 3, letter: 'Z', blank: true })
  })

  it('does nothing when no tile is left for the letter or the letter is not in the alphabet', () => {
    const used = typeLetter(emptyDraft(7), emptyBoard(), rack, start, 'z')
    const again = typeLetter(used.draft, emptyBoard(), rack, used.state, 'y')
    expect(again.placed).toBe(false)
    expect(again.draft).toBe(used.draft)
    const bad = typeLetter(emptyDraft(7), emptyBoard(), rack, start, 'q', ['H', 'E'])
    expect(bad.placed).toBe(false)
    expect(typeLetter(emptyDraft(7), emptyBoard(), rack, start, '1').placed).toBe(false)
  })

  it('skips squares that already hold tiles', () => {
    const board = emptyBoard()
    board[7][8] = { letter: 'X', blank: false }
    const first = typeLetter(emptyDraft(7), board, rack, start, 'H')
    expect(first.state.cursor).toEqual({ row: 7, col: 9 })
    const onTile = typeLetter(emptyDraft(7), board, rack, { cursor: { row: 7, col: 8 }, direction: 'across' }, 'E')
    expect(onTile.draft.tiles[0]).toMatchObject({ row: 7, col: 9 })
  })

  it('stays put at the edge of the board', () => {
    const edge = typeLetter(emptyDraft(7), emptyBoard(), rack, { cursor: { row: 7, col: 14 }, direction: 'across' }, 'H')
    expect(edge.draft.tiles[0]).toMatchObject({ row: 7, col: 14 })
    expect(edge.state.cursor).toEqual({ row: 7, col: 14 })
  })

  it('moves the cursor with the arrow keys and keeps it on the board', () => {
    expect(moveCursor({ row: 7, col: 7 }, 'ArrowUp')).toEqual({ row: 6, col: 7 })
    expect(moveCursor({ row: 7, col: 7 }, 'ArrowLeft')).toEqual({ row: 7, col: 6 })
    expect(moveCursor({ row: 0, col: 0 }, 'ArrowUp')).toEqual({ row: 0, col: 0 })
    expect(moveCursor({ row: 14, col: 14 }, 'ArrowRight')).toEqual({ row: 14, col: 14 })
    expect(moveCursor({ row: 3, col: 3 }, 'Home')).toEqual({ row: 3, col: 3 })
  })

  it('toggles the direction', () => {
    expect(toggleDirection(start).direction).toBe('down')
    expect(toggleDirection(toggleDirection(start)).direction).toBe('across')
  })

  it('backspace recalls the tile under the cursor, else the previous one', () => {
    const typed = typeLetter(typeLetter(emptyDraft(7), emptyBoard(), rack, start, 'H').draft, emptyBoard(), rack, { cursor: { row: 7, col: 8 }, direction: 'across' }, 'E')
    // cursor is now at 7,9 (free): backspace removes E at 7,8 and moves the cursor there.
    const first = backspace(typed.draft, emptyBoard(), typed.state)
    expect(first.draft.tiles.map(t => t.letter)).toEqual(['H'])
    expect(first.state.cursor).toEqual({ row: 7, col: 8 })
    const second = backspace(first.draft, emptyBoard(), first.state)
    expect(second.draft.tiles).toEqual([])
    expect(second.state.cursor).toEqual({ row: 7, col: 7 })
    const none = backspace(second.draft, emptyBoard(), second.state)
    expect(none.draft).toBe(second.draft)
    expect(none.state.cursor).toEqual({ row: 7, col: 6 })
  })
})
