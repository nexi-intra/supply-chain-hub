import { describe, expect, it } from 'vitest'
import { COLS, DAS_SECONDS, ARR_SECONDS, HIDDEN_ROWS, LOCK_DELAY_SECONDS, ROWS, SETTINGS, STEP_SECONDS, gravityRowsPerSecond } from './config'
import { createGame, getStats, ghostY, stepGame, type Action, type GameEvent, type GameState } from './engine'
import { pieceCells, type PieceType, type Rotation } from './pieces'

const none = { left: false, right: false, down: false }

function step(state: GameState, actions: Action[] = [], held = none): GameEvent[] {
  return stepGame(state, { actions, held })
}

function run(state: GameState, seconds: number, held = none): GameEvent[] {
  const events: GameEvent[] = []
  for (let t = 0; t < seconds - 1e-9; t += STEP_SECONDS) events.push(...step(state, [], held))
  return events
}

function ofType<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)
}

function fillRow(state: GameState, y: number, except: number[] = []) {
  for (let x = 0; x < COLS; x++) state.board[y][x] = except.includes(x) ? null : 'O'
}

function place(state: GameState, type: PieceType, x: number, y: number, rotation: Rotation = 0) {
  state.active = { type, x, y, rotation }
  state.lockTimer = 0
  state.lockResets = 0
  state.lowestY = y
  state.lastMoveRotation = false
}

function cellsOf(state: GameState) {
  const piece = state.active!
  return pieceCells(piece.type, piece.rotation).map(([cx, cy]) => [piece.x + cx, piece.y + cy])
}

describe('start og brikker', () => {
  it('starter med en synlig brik, forhåndsvisning og sværhedsgradens startniveau', () => {
    for (const difficulty of ['easy', 'expert'] as const) {
      const state = createGame(difficulty, { seed: 3 })
      expect(state.status).toBe('playing')
      expect(state.level).toBe(SETTINGS[difficulty].startLevel)
      expect(state.queue.length).toBeGreaterThanOrEqual(SETTINGS[difficulty].previews)
      expect(state.hold).toBeNull()
      expect(cellsOf(state).some(([, y]) => y >= HIDDEN_ROWS)).toBe(true)
    }
  })
})

describe('bevægelse og rotation', () => {
  it('flytter én kolonne pr. tryk og stopper ved væggen', () => {
    const state = createGame('easy', { seed: 1 })
    place(state, 'O', 4, 5)
    step(state, ['left'])
    expect(state.active!.x).toBe(3)
    step(state, ['right', 'right'])
    expect(state.active!.x).toBe(5)
    place(state, 'O', 0, 5)
    const events = step(state, ['left'])
    expect(state.active!.x).toBe(0)
    expect(ofType(events, 'move')).toHaveLength(0)
  })

  it('gentager bevægelsen efter DAS og ARR, når tasten holdes', () => {
    const state = createGame('easy', { seed: 1 })
    place(state, 'O', 8, 5)
    step(state, ['left'], { ...none, left: true })
    expect(state.active!.x).toBe(7)
    run(state, DAS_SECONDS - 0.02, { ...none, left: true })
    expect(state.active!.x).toBe(7)
    run(state, 0.02 + ARR_SECONDS * 3 + 0.005, { ...none, left: true })
    expect(state.active!.x).toBe(3)
  })

  it('roterer med SRS-kick væk fra væggen', () => {
    const state = createGame('easy', { seed: 1 })
    place(state, 'T', -1, 6, 1)
    const events = step(state, ['rotateCW'])
    expect(state.active).toMatchObject({ rotation: 2, x: 0 })
    expect(ofType(events, 'rotate')[0]).toMatchObject({ kick: 1 })
  })

  it('afviser en rotation, når ingen kick passer', () => {
    const state = createGame('easy', { seed: 1 })
    for (let y = 0; y < ROWS; y++) fillRow(state, y, [4])
    place(state, 'I', 2, 8, 1)
    const events = step(state, ['rotateCW'])
    expect(state.active!.rotation).toBe(1)
    expect(ofType(events, 'rotate')).toHaveLength(0)
  })
})

describe('tyngde og drop', () => {
  it('falder efter niveauets tyngde', () => {
    const state = createGame('easy', { seed: 2 })
    place(state, 'O', 4, 3)
    run(state, 1 / gravityRowsPerSecond(1) + 0.02)
    expect(state.active!.y).toBe(4)
  })

  it('blødt drop er hurtigere og giver 1 point pr. række', () => {
    const state = createGame('easy', { seed: 2 })
    place(state, 'O', 4, 3)
    run(state, 0.5, { ...none, down: true })
    expect(state.active!.y).toBeGreaterThanOrEqual(12)
    expect(state.score).toBe(state.active!.y - 3)
  })

  it('hårdt drop lander på ghost-positionen, låser straks og giver 2 point pr. række', () => {
    const state = createGame('easy', { seed: 2 })
    place(state, 'O', 4, 3)
    const target = ghostY(state)
    expect(target).toBe(ROWS - 2)
    const events = step(state, ['hardDrop'])
    expect(state.board[ROWS - 1][4]).toBe('O')
    expect(state.board[ROWS - 2][5]).toBe('O')
    expect(state.score).toBe((target - 3) * 2)
    expect(ofType(events, 'hardDrop')[0]).toMatchObject({ distance: target - 3 })
    expect(ofType(events, 'lock')).toHaveLength(1)
    expect(ofType(events, 'spawn')).toHaveLength(1)
  })
})

describe('låsning', () => {
  it('låser først efter lock delay på jorden', () => {
    const state = createGame('easy', { seed: 2 })
    place(state, 'O', 4, ROWS - 2)
    run(state, LOCK_DELAY_SECONDS - 0.05)
    expect(state.board[ROWS - 1][4]).toBeNull()
    const events = run(state, 0.1)
    expect(ofType(events, 'lock')).toHaveLength(1)
    expect(state.board[ROWS - 1][4]).toBe('O')
  })

  it('nulstiller lock delay ved bevægelse, men højst 15 gange', () => {
    const state = createGame('easy', { seed: 2 })
    place(state, 'O', 4, ROWS - 2)
    let locked = false
    for (let i = 0; i < 30 && !locked; i++) {
      run(state, LOCK_DELAY_SECONDS * 0.8)
      locked = ofType(step(state, [i % 2 === 0 ? 'left' : 'right']), 'lock').length > 0 || state.board[ROWS - 1].some((cell) => cell !== null)
    }
    expect(locked).toBe(true)
    expect(state.stats.pieces).toBe(1)
  })

  it('kan ikke holdes i live i det uendelige ved at blive ved med at dreje brikken på bunden', () => {
    for (const type of ['T', 'I', 'L', 'J', 'S', 'Z'] as PieceType[]) {
      const state = createGame('easy', { seed: 2 })
      place(state, type, 3, ROWS - 3)
      run(state, 1)
      expect(state.stats.pieces, type).toBe(0)
      let lockedAt = -1
      for (let i = 0; i < 400 && lockedAt < 0; i++) {
        const events = step(state, [i % 2 === 0 ? 'rotateCW' : 'rotateCCW'])
        if (ofType(events, 'lock').length || state.stats.pieces > 0) lockedAt = i
      }
      expect(lockedAt, type).toBeGreaterThanOrEqual(0)
      // 15 nulstillinger + én lock delay er den absolutte grænse.
      expect(lockedAt * STEP_SECONDS, type).toBeLessThanOrEqual(LOCK_DELAY_SECONDS * 16 + 0.1)
    }
  })
})

describe('hold', () => {
  it('lægger brikken til side én gang pr. brik og bytter ved næste hold', () => {
    const state = createGame('easy', { seed: 7 })
    const first = state.active!.type
    const next = state.queue[0]
    step(state, ['hold'])
    expect(state.hold).toBe(first)
    expect(state.active!.type).toBe(next)
    const events = step(state, ['hold'])
    expect(ofType(events, 'hold')).toHaveLength(0)
    expect(state.active!.type).toBe(next)
    step(state, ['hardDrop'])
    const current = state.active!.type
    step(state, ['hold'])
    expect(state.active!.type).toBe(first)
    expect(state.hold).toBe(current)
  })
})

describe('rækker og point', () => {
  it('rydder fire rækker med et I og giver 800 x niveau', () => {
    const state = createGame('medium', { seed: 1 })
    for (let y = ROWS - 4; y < ROWS; y++) fillRow(state, y, [9])
    place(state, 'I', 7, 5, 1)
    const events = step(state, ['hardDrop'])
    const clear = ofType(events, 'lineClear')[0]
    expect(clear).toMatchObject({ count: 4, tspin: 'none', backToBack: false })
    expect(clear.rows).toEqual([ROWS - 4, ROWS - 3, ROWS - 2, ROWS - 1])
    expect(state.lines).toBe(4)
    expect(state.board.every((row) => row.every((cell) => cell === null))).toBe(true)
    expect(state.score).toBe((ROWS - 4 - 5) * 2 + 800 * 3 + 2000 * 3)
    expect(clear.perfect).toBe(true)
  })

  it('genkender en T-spin double', () => {
    const state = createGame('easy', { seed: 1 })
    fillRow(state, ROWS - 1, [4])
    fillRow(state, ROWS - 2, [3, 4, 5])
    state.board[ROWS - 3][3] = 'O'
    place(state, 'T', 3, ROWS - 3, 1)
    step(state, ['rotateCW'])
    const clear = ofType(step(state, ['hardDrop']), 'lineClear')[0]
    expect(clear).toMatchObject({ count: 2, tspin: 'full' })
    expect(clear.points).toBe(1200)
  })

  it('giver back-to-back x1,5 for to fulde læs i træk og kombo-bonus', () => {
    const state = createGame('easy', { seed: 1 })
    const tetris = () => {
      for (let y = ROWS - 4; y < ROWS; y++) fillRow(state, y, [0])
      state.board[ROWS - 5][5] = 'O'
      place(state, 'I', -2, 3, 1)
      return ofType(step(state, ['hardDrop']), 'lineClear')[0]
    }
    const first = tetris()
    const second = tetris()
    expect(first.backToBack).toBe(false)
    expect(second.backToBack).toBe(true)
    expect(second.combo).toBe(1)
    expect(second.points).toBe(800 * 1.5 + 50)
  })

  it('stiger et niveau for hver 10. række', () => {
    const state = createGame('easy', { seed: 1 })
    state.lines = 9
    fillRow(state, ROWS - 1, [0, 1])
    state.board[ROWS - 2][9] = 'O'
    place(state, 'O', 0, 5)
    const events = step(state, ['hardDrop'])
    expect(ofType(events, 'levelUp')[0]).toMatchObject({ level: 2 })
    expect(state.level).toBe(2)
  })
})

describe('game over', () => {
  it('slutter, når en ny brik ikke kan placeres', () => {
    const state = createGame('easy', { seed: 1 })
    for (let y = 0; y < ROWS; y++) fillRow(state, y, [y % 2 === 0 ? 0 : 9])
    place(state, 'O', 4, 0)
    state.board[0][4] = null
    state.board[0][5] = null
    state.board[1][4] = null
    state.board[1][5] = null
    const events = step(state, ['hardDrop'])
    expect(state.status).toBe('over')
    expect(ofType(events, 'gameOver')).toHaveLength(1)
    expect(step(state, ['left'])).toEqual([])
  })
})

describe('statistik og determinisme', () => {
  it('er deterministisk for samme seed og samme handlinger', () => {
    const play = () => {
      const state = createGame('hard', { seed: 9 })
      for (let i = 0; i < 400 && state.status === 'playing'; i++) step(state, i % 3 === 0 ? ['rotateCW', i % 2 ? 'left' : 'right', 'hardDrop'] : [])
      return getStats(state)
    }
    expect(play()).toEqual(play())
  })
})
