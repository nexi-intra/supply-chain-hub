import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  MULTIPLAYER_ERROR_CODES,
  MULTIPLAYER_FINISHED_REASONS,
  MULTIPLAYER_GAME_TYPES,
  MULTIPLAYER_HUBERT_LIMIT,
  MULTIPLAYER_LANGUAGES,
  MULTIPLAYER_MOVE_ERRORS,
  MULTIPLAYER_NOTIFICATION_TYPES,
  type MultiplayerApi,
  type MultiplayerAnyGame,
  type MultiplayerChessGame,
  type MultiplayerChessEntry,
  type MultiplayerBackgammonEntry,
  type MultiplayerBackgammonGame,
  type MultiplayerCommand,
  type MultiplayerCommandResult,
  type MultiplayerGame,
  type MultiplayerGameEntry,
  type MultiplayerPreview,
  type MultiplayerSnapshot,
  type MultiplayerStats,
  type MultiplayerWordPuzzleEntry,
} from './multiplayer'

describe('multiplayer contract', () => {
  it('exports the supported languages, notification types and error codes', () => {
    expect(MULTIPLAYER_LANGUAGES).toEqual(['da', 'en', 'sv', 'fi'])
    expect(MULTIPLAYER_NOTIFICATION_TYPES).toEqual([
      'invite', 'accepted', 'declined', 'cancelled', 'turn', 'approve-word', 'word-approved', 'word-rejected', 'reminder', 'chat', 'finished',
      'draw-offer', 'draw-declined',
    ])
    expect(MULTIPLAYER_GAME_TYPES).toEqual(['word-puzzle', 'chess', 'backgammon'])
    expect(MULTIPLAYER_FINISHED_REASONS).toEqual([
      'out-of-tiles', 'scoreless', 'resigned', 'checkmate', 'stalemate', 'threefold', 'fifty-move', 'insufficient', 'draw-agreed', 'bore-off',
    ])
    expect(MULTIPLAYER_MOVE_ERRORS).toContain('ILLEGAL_MOVE')
    expect(MULTIPLAYER_ERROR_CODES).toContain('MULTIPLAYER_CONFLICT')
    expect(MULTIPLAYER_ERROR_CODES).toContain('MULTIPLAYER_UNAVAILABLE')
    expect(MULTIPLAYER_MOVE_ERRORS).toContain('MUST_COVER_CENTER')
  })

  it('types the native bridge without accepting client actor credentials', () => {
    expectTypeOf<MultiplayerApi['snapshot']>().toEqualTypeOf<() => Promise<MultiplayerSnapshot>>()
    expectTypeOf<MultiplayerApi['game']>().toEqualTypeOf<(gameId: string) => Promise<MultiplayerAnyGame>>()
    expectTypeOf<MultiplayerApi['command']>().toEqualTypeOf<(command: MultiplayerCommand) => Promise<MultiplayerCommandResult>>()
    expectTypeOf<MultiplayerApi['onChanged']>().toEqualTypeOf<(callback: () => void) => () => void>()
    expectTypeOf<Window['electronMultiplayer']>().toEqualTypeOf<MultiplayerApi | undefined>()
    expectTypeOf<Extract<keyof MultiplayerCommand, 'actor' | 'role' | 'email'>>().toEqualTypeOf<never>()
    expectTypeOf<MultiplayerCommand['type']>().toEqualTypeOf<
      'challenge' | 'respond' | 'cancel' | 'move' | 'approve-word' | 'pass' | 'exchange' | 'chess-move' | 'offer-draw' | 'respond-draw' | 'bg-move' | 'resign' |
      'remind' | 'chat' | 'acknowledge' | 'hubert' | 'react'
    >()
  })

  it('discriminates games and entries on type and keeps stats per game type', () => {
    expectTypeOf<MultiplayerGameEntry>().toEqualTypeOf<MultiplayerWordPuzzleEntry | MultiplayerChessEntry | MultiplayerBackgammonEntry>()
    expectTypeOf<MultiplayerAnyGame>().toEqualTypeOf<MultiplayerGame | MultiplayerChessGame | MultiplayerBackgammonGame>()
    expectTypeOf<MultiplayerBackgammonGame['type']>().toEqualTypeOf<'backgammon'>()
    expectTypeOf<MultiplayerChessGame['type']>().toEqualTypeOf<'chess'>()
    expectTypeOf<MultiplayerChessEntry['language']>().toEqualTypeOf<null>()
    expectTypeOf<MultiplayerSnapshot['statsByType']['chess']>().toEqualTypeOf<MultiplayerStats[]>()
    expectTypeOf<MultiplayerSnapshot['myStatsByType']['word-puzzle']>().toEqualTypeOf<MultiplayerStats>()
    expectTypeOf<Extract<MultiplayerCommand, { type: 'chess-move' }>['promotion']>().toEqualTypeOf<'q' | 'r' | 'b' | 'n' | undefined>()
  })

  it('types the chess projection with legal moves and an optional draw offer', () => {
    expectTypeOf<MultiplayerChessGame['chess']['legalMoves'][number]['san']>().toEqualTypeOf<string>()
    expectTypeOf<MultiplayerChessGame['drawOffer']>().toEqualTypeOf<{ by: 0 | 1; at: string } | null>()
  })

  it('feeds Hubert without a revision and mirrors the service limits', () => {
    expect(MULTIPLAYER_HUBERT_LIMIT).toEqual({ treat: 10, bone: 2 })
    expect(MULTIPLAYER_ERROR_CODES).toContain('MULTIPLAYER_HUBERT_LIMIT')
    expectTypeOf<Extract<MultiplayerCommand, { type: 'hubert' }>>().toEqualTypeOf<{ operationId: string } & { type: 'hubert'; gameId: string; kind: 'treat' | 'bone' }>()
    expectTypeOf<MultiplayerGame['hubert']['last']>().toEqualTypeOf<{ id: string; by: 0 | 1; kind: 'treat' | 'bone'; at: string } | null>()
  })

  it('never exposes the bag or the opponent rack on a projected game', () => {
    expectTypeOf<Extract<keyof MultiplayerGame, 'bag' | 'racks'>>().toEqualTypeOf<never>()
    expectTypeOf<MultiplayerGame['rack']>().toEqualTypeOf<string[]>()
    expectTypeOf<MultiplayerGame['opponentRackCount']>().toEqualTypeOf<number>()
  })

  it('discriminates preview results on ok', () => {
    const failed: MultiplayerPreview = { ok: false, error: 'GAP' }
    const passed: MultiplayerPreview = { ok: true, words: [{ word: 'AA', score: 4, known: null }], total: 4, bingo: false }
    expect(failed.ok).toBe(false)
    if (passed.ok) expect(passed.words[0].known).toBeNull()
  })
})
