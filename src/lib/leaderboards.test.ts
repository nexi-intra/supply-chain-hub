import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizeFlatLeaderboard,
  normalizeNestedLeaderboard,
  recordGamePlay,
  submitHighscore,
} from '@/lib/leaderboards'

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const

function entry(email: string, score: number, extra: Record<string, unknown> = {}) {
  return { id: email, email, score, timestamp: 1000, ...extra }
}

describe('normalizeNestedLeaderboard', () => {
  it('altid giver alle sværhedsgrader, også når nøglen slet ikke findes', () => {
    expect(normalizeNestedLeaderboard(undefined, DIFFICULTIES)).toEqual({
      easy: [], medium: [], hard: [], expert: [],
    })
  })

  // Dette er præcis den situation der fik hele appen til at falde ned med
  // "n.some is not a function": den lokale kopi indeholdt et fladt array.
  it('vælter ikke på et fladt array, men viser det som første sværhedsgrad', () => {
    const board = normalizeNestedLeaderboard([entry('a@x', 5)], DIFFICULTIES)
    expect(board.easy).toEqual([entry('a@x', 5)])
    expect(board.medium).toEqual([])
  })

  it.each([null, 42, 'noget tekst', true])('vælter ikke på værdien %p', (value) => {
    expect(normalizeNestedLeaderboard(value, DIFFICULTIES)).toEqual({
      easy: [], medium: [], hard: [], expert: [],
    })
  })

  it('springer en sværhedsgrad over der ikke er en liste', () => {
    const board = normalizeNestedLeaderboard(
      { easy: [entry('a@x', 3)], medium: { forkert: true }, hard: null },
      DIFFICULTIES,
    )
    expect(board.easy).toHaveLength(1)
    expect(board.medium).toEqual([])
    expect(board.hard).toEqual([])
  })

  it('udfylder manglende id fra e-mailen, så scoren kan redigeres bagefter', () => {
    const board = normalizeNestedLeaderboard({ easy: [{ email: 'a@x', score: 7, timestamp: 1 }] }, DIFFICULTIES)
    expect(board.easy[0].id).toBe('a@x')
  })

  it('kasserer rækker uden brugbar score i stedet for at vise NaN', () => {
    const board = normalizeNestedLeaderboard(
      { easy: [entry('a@x', Number.NaN), entry('b@x', 4), { email: 'c@x' }, null, 'tekst'] },
      DIFFICULTIES,
    )
    expect(board.easy).toEqual([entry('b@x', 4)])
  })

  it('sorterer højeste score først uanset rækkefølgen i data', () => {
    const board = normalizeNestedLeaderboard(
      { hard: [entry('a@x', 2), entry('b@x', 9), entry('c@x', 5)] },
      DIFFICULTIES,
    )
    expect(board.hard.map((e) => e.email)).toEqual(['b@x', 'c@x', 'a@x'])
  })

  it('beholder kun spillerens bedste, hvis der er endt to rækker for samme person', () => {
    const board = normalizeNestedLeaderboard(
      { hard: [entry('a@x', 3), entry('a@x', 11)] },
      DIFFICULTIES,
    )
    expect(board.hard).toHaveLength(1)
    expect(board.hard[0].score).toBe(11)
  })

  it('bevarer level, som Brick Break viser', () => {
    const board = normalizeNestedLeaderboard({ easy: [entry('a@x', 3, { level: 4 })] }, DIFFICULTIES)
    expect(board.easy[0].level).toBe(4)
  })
})

describe('normalizeFlatLeaderboard', () => {
  it('lægger en gammel opdelt liste sammen til spillerens bedste', () => {
    const board = normalizeFlatLeaderboard({
      easy: [entry('a@x', 3)],
      hard: [entry('a@x', 8), entry('b@x', 5)],
    })
    expect(board).toEqual([entry('a@x', 8), entry('b@x', 5)])
  })

  it.each([undefined, null, 7, 'tekst'])('vælter ikke på værdien %p', (value) => {
    expect(normalizeFlatLeaderboard(value)).toEqual([])
  })
})

describe('submitHighscore', () => {
  let stored: Record<string, unknown>

  beforeEach(() => {
    stored = {}
    const kv = {
      get: vi.fn(async (key: string) => stored[key]),
      update: vi.fn(async (key: string, operation: any) => {
        const applyUpsert = (list: any[]) => {
          const next = [...list]
          for (const item of operation.items) {
            const index = next.findIndex((existing) => existing.id === item.id)
            if (index === -1) next.push(item)
            else next[index] = item
          }
          return next
        }
        if (operation.path) {
          const root: any = { ...(stored[key] as object) }
          root[operation.path[0]] = applyUpsert(Array.isArray(root[operation.path[0]]) ? root[operation.path[0]] : [])
          stored[key] = root
          return root[operation.path[0]]
        }
        const next = applyUpsert(Array.isArray(stored[key]) ? (stored[key] as any[]) : [])
        stored[key] = next
        return next
      }),
      updateField: vi.fn(async (key: string, operation: any) => {
        const root: any = { ...((stored[key] as object) || {}) }
        root[operation.field] = operation.value
        stored[key] = root
        return root
      }),
    }
    ;(globalThis as any).window = { kv }
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('gemmer en ny spillers score', async () => {
    const result = await submitHighscore('board', { email: 'a@x', score: 10, timestamp: 1 }, { path: ['hard'], categories: DIFFICULTIES })
    expect(result).toEqual({ saved: true, best: 10 })
    expect((stored.board as any).hard).toHaveLength(1)
  })

  it('sætter aldrig en eksisterende rekord ned', async () => {
    stored.board = { hard: [entry('a@x', 50)] }
    const result = await submitHighscore('board', { email: 'a@x', score: 12, timestamp: 2 }, { path: ['hard'], categories: DIFFICULTIES })
    expect(result).toEqual({ saved: false, best: 50 })
    expect((stored.board as any).hard[0].score).toBe(50)
  })

  it('rører ikke en anden spillers rekord', async () => {
    stored.board = { hard: [entry('b@x', 99)] }
    await submitHighscore('board', { email: 'a@x', score: 3, timestamp: 2 }, { path: ['hard'], categories: DIFFICULTIES })
    const hard = (stored.board as any).hard
    expect(hard.find((e: any) => e.email === 'b@x').score).toBe(99)
  })

  it('virker på en flad liste uden sværhedsgrader', async () => {
    const result = await submitHighscore('tetris', { email: 'a@x', score: 4, timestamp: 1 })
    expect(result.saved).toBe(true)
    expect(stored.tetris).toHaveLength(1)
  })

  // Den gamle kode læste hele objektet og skrev det tilbage; her skal en
  // ødelagt/uventet form ikke kunne blokere at scoren bliver gemt.
  it('gemmer også selvom den gemte værdi har en uventet form', async () => {
    stored.board = 'noget helt forkert'
    const result = await submitHighscore('board', { email: 'a@x', score: 6, timestamp: 1 }, { path: ['hard'], categories: DIFFICULTIES })
    expect(result.saved).toBe(true)
  })

  it('prøver igen hvis en anden klient nåede at skrive først', async () => {
    let attempts = 0
    const kv = (globalThis as any).window.kv
    const realUpdate = kv.update
    kv.update = vi.fn(async (key: string, operation: any) => {
      attempts++
      if (attempts === 1) throw new Error('KV_CONFLICT: Data blev ændret')
      return realUpdate(key, operation)
    })
    const result = await submitHighscore('board', { email: 'a@x', score: 8, timestamp: 1 }, { path: ['hard'], categories: DIFFICULTIES })
    expect(result.saved).toBe(true)
    expect(attempts).toBe(2)
  })

  it('giver fejlen videre, når den ikke er en konflikt', async () => {
    const kv = (globalThis as any).window.kv
    kv.update = vi.fn(async () => { throw new Error('KV_LOCK_BUSY') })
    await expect(
      submitHighscore('board', { email: 'a@x', score: 8, timestamp: 1 }, { path: ['hard'], categories: DIFFICULTIES }),
    ).rejects.toThrow('KV_LOCK_BUSY')
  })
})

describe('recordGamePlay', () => {
  let stored: Record<string, unknown>

  beforeEach(() => {
    stored = {}
    ;(globalThis as any).window = {
      kv: {
        get: vi.fn(async (key: string) => stored[key]),
        updateField: vi.fn(async (key: string, operation: any) => {
          const root: any = { ...((stored[key] as object) || {}) }
          root[operation.field] = operation.value
          stored[key] = root
          return root
        }),
      },
    }
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('tæller første spil for en ny spiller', async () => {
    await recordGamePlay('counts', 'a@x', 'hard')
    expect(stored.counts).toEqual({ 'a@x': { hard: 1 } })
  })

  it('lægger til uden at røre andres tal', async () => {
    stored.counts = { 'a@x': { hard: 2 }, 'b@x': { easy: 7 } }
    await recordGamePlay('counts', 'a@x', 'hard')
    expect(stored.counts).toEqual({ 'a@x': { hard: 3 }, 'b@x': { easy: 7 } })
  })

  it('tager gamle Tetris-tal med over i det samlede antal', async () => {
    stored.counts = { 'a@x': { easy: 2, medium: 3 } }
    await recordGamePlay('counts', 'a@x')
    expect((stored.counts as any)['a@x'].all).toBe(6)
  })

  it('gør ingenting uden en bruger', async () => {
    await recordGamePlay('counts', '')
    expect(stored.counts).toBeUndefined()
  })
})
