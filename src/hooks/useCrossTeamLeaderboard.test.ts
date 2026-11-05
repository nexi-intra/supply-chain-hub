import { describe, it, expect } from 'vitest'
import { mergeFlatLeaderboard, mergeNestedLeaderboard } from './useCrossTeamLeaderboard'

describe('mergeNestedLeaderboard', () => {
  it('fletter eget team og andre teams sorteret efter score', () => {
    const merged = mergeNestedLeaderboard(
      { hard: [{ id: 'a@x', email: 'a@x', score: 10, timestamp: 1 }] },
      { 'a@x': { fullName: 'Anna' } },
      [{ teamCode: 'TRR', users: { 'b@x': { fullName: 'Bo' } }, leaderboard: { hard: [{ id: 'b@x', email: 'b@x', score: 20, timestamp: 1 }] } }],
      'hard',
    )
    expect(merged.map((entry) => [entry.displayName, entry.teamCode])).toEqual([['Bo', 'TRR'], ['Anna', undefined]])
  })

  // Et andet team kan køre en ældre/nyere version; et navn der ikke er tekst må
  // ikke kunne vælte highscore-visningen.
  it('bruger e-mailen som navn når et andet teams navn ikke er tekst', () => {
    const merged = mergeNestedLeaderboard(
      undefined,
      {},
      [{ teamCode: 'TRR', users: { 'b@x': { fullName: { evil: true } as unknown as string } }, leaderboard: { hard: [{ id: 'b@x', email: 'b@x', score: 20, timestamp: 1 }] } }],
      'hard',
    )
    expect(merged[0].displayName).toBe('b@x')
  })

  it('giver altid et tekst-id, også for gamle rækker uden id', () => {
    const merged = mergeFlatLeaderboard(
      [{ email: 'a@x', score: 5 } as never],
      {},
      [{ teamCode: 'TRR', users: {}, leaderboard: [{ id: { x: 1 }, email: 'b@x', score: 7 } as never] }],
    )
    expect(merged.map((entry) => entry.id)).toEqual(['b@x', 'a@x'])
  })
})
