import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { MULTIPLAYER_REACTION_COOLDOWN_MS, MULTIPLAYER_REACTION_EMOJIS, type MultiplayerReaction } from './multiplayer'
import {
  loadSeenReactions, MAX_UNSEEN_REACTIONS, reactionScope, saveSeenReactions, unseenReactions, withSeenReactions,
} from './multiplayerReactions'

const reaction = (id: string, by: 0 | 1, emoji: MultiplayerReaction['emoji'] = '🔥'): MultiplayerReaction => ({ id, by, emoji, at: '2026-10-13T10:00:00.000Z' })

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, data }
}

describe('the fixed reaction set', () => {
  it('mirrors the service', () => {
    const service = createRequire(import.meta.url)('../../electron/multiplayer.cjs')
    expect([...MULTIPLAYER_REACTION_EMOJIS]).toEqual([...service.REACTION_EMOJIS])
    expect(MULTIPLAYER_REACTION_COOLDOWN_MS).toBe(service.REACTION_COOLDOWN_MS)
  })
})

describe('unseenReactions', () => {
  it('shows only what the opponent sent and this client has not shown yet', () => {
    const all = [reaction('a', 1), reaction('b', 0), reaction('c', 1), reaction('d', 1)]
    expect(unseenReactions(all, new Set(), 0).map(item => item.id)).toEqual(['a', 'c', 'd'])
    expect(unseenReactions(all, new Set(['a', 'c']), 0).map(item => item.id)).toEqual(['d'])
    expect(unseenReactions(all, new Set(['a', 'c', 'd']), 0)).toEqual([])
    expect(unseenReactions(all, new Set(), 1).map(item => item.id)).toEqual(['b'])
  })

  it('keeps the newest few, oldest first, so a long absence does not spam', () => {
    const many = Array.from({ length: 8 }, (_, i) => reaction(`r${i}`, 1))
    expect(MAX_UNSEEN_REACTIONS).toBe(3)
    expect(unseenReactions(many, new Set(), 0).map(item => item.id)).toEqual(['r5', 'r6', 'r7'])
    expect(unseenReactions(many, new Set(['r7']), 0, 2).map(item => item.id)).toEqual(['r5', 'r6'])
  })

  it('has nothing for an empty list', () => {
    expect(unseenReactions([], new Set(), 0)).toEqual([])
  })
})

describe('withSeenReactions', () => {
  it('counts every reaction in the game as seen, ours and those beyond the limit included, without touching the input', () => {
    const before = new Set(['x'])
    const after = withSeenReactions(before, [reaction('a', 1), reaction('b', 0)])
    expect([...after]).toEqual(['x', 'a', 'b'])
    expect([...before]).toEqual(['x'])
    expect(unseenReactions([reaction('a', 1), reaction('b', 1)], after, 0)).toEqual([])
  })

  it('remembers only the newest 40 ids', () => {
    const many = Array.from({ length: 60 }, (_, i) => reaction(`r${i}`, 1))
    const seen = withSeenReactions(new Set(), many)
    expect(seen.size).toBe(40)
    expect(seen.has('r59')).toBe(true)
    expect(seen.has('r19')).toBe(false)
  })
})

describe('seen reactions in storage', () => {
  it('is kept per person and game and survives a reload of the match', () => {
    const storage = memoryStorage()
    const scope = reactionScope(' Anna@Example.test ', 'game-1')
    expect(scope).toBe('anna@example.test:game-1')
    expect(loadSeenReactions(storage, scope).size).toBe(0)
    saveSeenReactions(storage, scope, new Set(['a', 'b']))
    expect([...loadSeenReactions(storage, scope)]).toEqual(['a', 'b'])
    expect(loadSeenReactions(storage, reactionScope('anna@example.test', 'game-2')).size).toBe(0)
    expect(loadSeenReactions(storage, reactionScope('bo@example.test', 'game-1')).size).toBe(0)
  })

  it('shows a reaction once: not again after reopening the match', () => {
    const storage = memoryStorage()
    const scope = reactionScope('anna@example.test', 'g')
    const game = [reaction('a', 1)]
    const open = () => {
      const seen = loadSeenReactions(storage, scope)
      const fresh = unseenReactions(game, seen, 0)
      saveSeenReactions(storage, scope, withSeenReactions(seen, game))
      return fresh.map(item => item.id)
    }
    expect(open()).toEqual(['a'])
    expect(open()).toEqual([])
  })

  it('ignores damaged or missing storage and survives a storage that throws', () => {
    expect(loadSeenReactions(null, 's').size).toBe(0)
    expect(loadSeenReactions(memoryStorage({ 'multiplayer-reactions-seen:s': 'not json' }), 's').size).toBe(0)
    expect([...loadSeenReactions(memoryStorage({ 'multiplayer-reactions-seen:s': '["a",5,null,"b"]' }), 's')]).toEqual(['a', 'b'])
    expect(loadSeenReactions(memoryStorage({ 'multiplayer-reactions-seen:s': '{"a":1}' }), 's').size).toBe(0)
    const throwing = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') } }
    expect(loadSeenReactions(throwing, 's').size).toBe(0)
    expect(() => saveSeenReactions(throwing, 's', new Set(['a']))).not.toThrow()
    expect(() => saveSeenReactions(null, 's', new Set(['a']))).not.toThrow()
  })
})
