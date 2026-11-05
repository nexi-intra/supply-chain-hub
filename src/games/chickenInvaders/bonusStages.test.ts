import { describe, it, expect } from 'vitest'
import { campaignWave } from './campaign'
import { STEP_SECONDS, type Difficulty } from './config'
import { beginWave, createGame, spawnEnemy, startWave, stepGame, type GameEvent, type GameInput, type GameState } from './engine'
import { BONUS_POINTS, BONUS_RESULT_SECONDS, BONUS_SECONDS, BONUS_STAGES, bonusScale, weaponLocked, type BonusStageId } from './bonusStages'
import { buildSpecFromWave } from './waves'

const idle: GameInput = { left: false, right: false, up: false, down: false, fire: false, missile: false, pointerX: null, pointerY: null }

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)

function run(state: GameState, seconds: number, input: Partial<GameInput> | (() => Partial<GameInput>) = {}, each?: () => void): GameEvent[] {
  const events: GameEvent[] = []
  const steps = Math.round(seconds / STEP_SECONDS)
  for (let i = 0; i < steps; i++) {
    each?.()
    events.push(...stepGame(state, { ...idle, ...(typeof input === 'function' ? input() : input) }))
  }
  return events
}

/** Bølge 4 er sektor 1's bonusplads; skabelonen tvinges, så hver bane kan testes. */
function bonusGame(stage: BonusStageId, difficulty: Difficulty = 'medium', wave = 4): GameState {
  const state = createGame(difficulty, { seed: 2 })
  stepGame(state, idle)
  state.pendingEvents = []
  state.ship.invulnerableUntil = 0
  beginWave(state, buildSpecFromWave({ ...campaignWave(wave, 2), slotType: 'bonus', templateId: stage }, difficulty))
  return state
}

/** Snyde-samler: skibet står hele tiden på den laveste pickup. */
function collector(state: GameState) {
  return () => {
    const lowest = state.pickups.reduce<{ x: number; y: number } | null>((low, pickup) => (!low || pickup.y > low.y ? pickup : low), null)
    if (lowest && lowest.y > 130) {
      state.ship.x = Math.min(936, Math.max(24, lowest.x))
      state.ship.y = Math.min(544, Math.max(120, lowest.y))
    }
  }
}

function snipeHens(state: GameState) {
  return () => {
    for (const enemy of state.enemies) {
      if (enemy.dead || enemy.kind !== 'galleryHen' || enemy.x < 0 || enemy.x > 960) continue
      state.projectiles.push({ id: state.nextId++, kind: 'bolt', x: enemy.x, y: enemy.y, vx: 0, vy: -1, damage: 9, pierce: false, hitIds: [], dead: false })
    }
  }
}

describe('bonusbanerne', () => {
  it('er de tre baner fra planen', () => {
    expect([...BONUS_STAGES]).toEqual(['drumstickRain', 'shootingGallery', 'eggDodge'])
    expect(BONUS_SECONDS).toBe(20)
  })

  it('varer præcis 20 s og går derefter videre til næste bølge efter resultatet', () => {
    for (const stage of BONUS_STAGES) {
      const state = bonusGame(stage)
      const start = stepGame(state, idle)
      expect(ofType(start, 'bonusStart')).toEqual([{ type: 'bonusStart', stage, seconds: BONUS_SECONDS }])
      expect(state.bonus!.endsAt - state.bonus!.startedAt).toBeCloseTo(BONUS_SECONDS)
      const during = run(state, BONUS_SECONDS - 0.5)
      expect(ofType(during, 'bonusResult'), stage).toHaveLength(0)
      expect(ofType(during, 'waveClear'), stage).toHaveLength(0)
      const end = run(state, 1)
      expect(ofType(end, 'bonusResult'), stage).toHaveLength(1)
      expect(ofType(end, 'waveClear'), stage).toHaveLength(0)
      expect(state.wave).toBe(4)
      const next = run(state, BONUS_RESULT_SECONDS + 0.2)
      expect(ofType(next, 'waveStart')[0]).toMatchObject({ wave: 5 })
      expect(state.bonus).toBeNull()
    }
  })

  it('tikker de sidste tre sekunder ned', () => {
    const state = bonusGame('drumstickRain')
    const ticks = ofType(run(state, BONUS_SECONDS + 0.5), 'bonusTick').map((event) => event.seconds)
    expect(ticks).toEqual([3, 2, 1])
  })

  it('koster aldrig liv – heller ikke ved sammenstød eller æg', () => {
    for (const stage of BONUS_STAGES) {
      const state = bonusGame(stage)
      const lives = state.lives
      let n = 0
      const events = run(state, BONUS_SECONDS + 1, {}, () => {
        state.ship.invulnerableUntil = 0
        state.eggs.push({ id: state.nextId++, x: state.ship.x, y: state.ship.y, vx: 0, vy: 1 })
        if (n++ % 30 === 0) spawnEnemy(state, 'hen', state.ship.x, state.ship.y)
      })
      expect(ofType(events, 'playerHit'), stage).toHaveLength(0)
      expect(ofType(events, 'gameOver'), stage).toHaveLength(0)
      expect(state.lives, stage).toBe(lives)
    }
  })

  it('giver bonuspoint efter sektor og runde', () => {
    expect(bonusScale({ sector: 0, round: 0 })).toBe(1)
    expect(bonusScale({ sector: 4, round: 0 })).toBeGreaterThan(bonusScale({ sector: 1, round: 0 }))
    expect(bonusScale({ sector: 0, round: 1 })).toBeGreaterThan(1)
  })
})

describe('kyllingelårsregn', () => {
  it('regner med kyllingelår og mønter uden fjender og æg', () => {
    const state = bonusGame('drumstickRain')
    const kinds = new Set<string>()
    run(state, 10, {}, () => {
      for (const pickup of state.pickups) kinds.add(pickup.kind)
      expect(state.eggs).toHaveLength(0)
      expect(state.enemies).toHaveLength(0)
    })
    expect(kinds).toEqual(new Set(['drumstick', 'coin']))
  })

  it('giver faste point pr. ting, rører ikke combo og giver "Perfekt" når alt er samlet', () => {
    const state = bonusGame('drumstickRain')
    const before = state.scoring.score
    const events = run(state, BONUS_SECONDS + 0.5, {}, collector(state))
    const result = ofType(events, 'bonusResult')[0]
    expect(result.possible).toBeGreaterThanOrEqual(30)
    expect(result.collected).toBe(result.possible)
    expect(result.perfect).toBe(true)
    const picked = ofType(events, 'pickup')
    const items = picked.reduce((sum, event) => sum + event.points, 0)
    expect(picked.filter((event) => event.kind === 'drumstick').every((event) => event.points === BONUS_POINTS.drumstick)).toBe(true)
    expect(result.points).toBe(items + BONUS_POINTS.perfect)
    expect(state.scoring.score - before).toBe(result.points)
    expect(state.scoring.chain).toBe(0)
  })

  it('kan samles helt med tastaturet: hvert stykke kan nås fra det forrige ved 480 px/s', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createGame('medium', { seed })
      stepGame(state, idle)
      beginWave(state, buildSpecFromWave({ ...campaignWave(4, seed), slotType: 'bonus', templateId: 'drumstickRain' }, 'medium'))
      const queue = [...state.bonus!.queue].sort((a, b) => a.at - b.at)
      expect(new Set(queue.map((item) => item.vy)).size, `seed ${seed}`).toBe(1)
      expect(queue.length, `seed ${seed}`).toBeGreaterThanOrEqual(30)
      for (let i = 1; i < queue.length; i++) {
        const reach = 36 * 2
        const needed = Math.max(0, Math.abs(queue[i].x - queue[i - 1].x) - reach) / 480
        expect(queue[i].at - queue[i - 1].at, `seed ${seed} #${i}`).toBeGreaterThanOrEqual(needed - 1e-9)
      }
    }
  })

  it('tæller kun regnens egne kyllingelår, ikke dem der faldt fra bølgen før', () => {
    const state = createGame('medium', { seed: 2 })
    stepGame(state, idle)
    state.pickups.push({ id: state.nextId++, kind: 'drumstick', x: state.ship.x, y: state.ship.y - 5, vx: 0, vy: 0 })
    beginWave(state, buildSpecFromWave({ ...campaignWave(4, 2), slotType: 'bonus', templateId: 'drumstickRain' }, 'medium'))
    run(state, 0.2)
    expect(state.bonus!.collected).toBe(0)
  })

  it('er ikke perfekt, når noget falder forbi', () => {
    const state = bonusGame('drumstickRain')
    state.ship.x = 24
    const result = ofType(run(state, BONUS_SECONDS + 0.5), 'bonusResult')[0]
    expect(result.perfect).toBe(false)
    expect(result.collected).toBeLessThan(result.possible)
  })
})

describe('skydebanen', () => {
  it('sender guldhøns i mønstre – og ingen æg', () => {
    const state = bonusGame('shootingGallery')
    let hens = 0
    const ys = new Set<number>()
    run(state, BONUS_SECONDS, { fire: true }, () => {
      expect(state.eggs).toHaveLength(0)
      for (const enemy of state.enemies) if (enemy.kind === 'galleryHen') ys.add(Math.round(enemy.y / 20))
      hens = Math.max(hens, state.enemies.filter((enemy) => enemy.kind === 'galleryHen').length)
    })
    expect(hens).toBeGreaterThanOrEqual(4)
    expect(ys.size).toBeGreaterThan(4)
  })

  it('tæller ramte høns, rører ikke combo og giver "Perfekt" når alle er skudt', () => {
    const state = bonusGame('shootingGallery')
    const before = state.scoring.score
    const events = run(state, BONUS_SECONDS + 0.5, {}, snipeHens(state))
    const result = ofType(events, 'bonusResult')[0]
    expect(result.possible).toBeGreaterThanOrEqual(30)
    expect(result.collected).toBe(result.possible)
    expect(result.perfect).toBe(true)
    expect(state.scoring.chain).toBe(0)
    for (const kill of ofType(events, 'kill')) expect(kill).toMatchObject({ kind: 'galleryHen', points: BONUS_POINTS.hen, multiplier: 1 })
    expect(state.scoring.score - before).toBe(result.points)
    expect(result.points).toBeGreaterThanOrEqual(result.collected * BONUS_POINTS.hen + BONUS_POINTS.perfect)
  })
})

describe('æggeregnen', () => {
  it('låser våbnet og missilerne', () => {
    const state = bonusGame('eggDodge')
    state.missiles = 1
    expect(weaponLocked(state)).toBe(true)
    const events = run(state, 2, { fire: true, missile: true })
    expect(state.projectiles).toHaveLength(0)
    expect(state.stats.shotsFired).toBe(0)
    expect(ofType(events, 'missile')).toHaveLength(0)
    expect(state.missiles).toBe(1)
  })

  it('regner med æg fra hønsene øverst', () => {
    const state = bonusGame('eggDodge')
    state.ship.x = -999
    const ids = new Set<number>()
    run(state, BONUS_SECONDS, {}, () => {
      for (const egg of state.eggs) ids.add(egg.id)
    })
    expect(ids.size).toBeGreaterThanOrEqual(30)
    expect(state.bonus!.droppers.length).toBeGreaterThanOrEqual(4)
  })

  it('giver den store bonus, når man klarer sig uden træf', () => {
    const state = bonusGame('eggDodge')
    const before = state.scoring.score
    const events = run(state, BONUS_SECONDS + 0.5, {}, () => {
      state.eggs = []
    })
    const result = ofType(events, 'bonusResult')[0]
    expect(result.perfect).toBe(true)
    expect(result.points).toBeGreaterThanOrEqual(BONUS_POINTS.survive)
    expect(state.scoring.score - before).toBe(result.points)
  })

  it('koster kun bonussen – ikke et liv – at blive ramt', () => {
    const state = bonusGame('eggDodge')
    const lives = state.lives
    state.eggs.push({ id: state.nextId++, x: state.ship.x, y: state.ship.y, vx: 0, vy: 1 })
    const hit = stepGame(state, idle)
    expect(ofType(hit, 'bonusMiss')).toEqual([{ type: 'bonusMiss', x: state.ship.x, y: state.ship.y, first: true }])
    expect(ofType(hit, 'playerHit')).toHaveLength(0)
    expect(state.lives).toBe(lives)
    expect(state.bonus!.hit).toBe(true)
    const events = run(state, BONUS_SECONDS, {}, () => {
      state.eggs = []
    })
    const result = ofType(events, 'bonusResult')[0]
    expect(result.perfect).toBe(false)
    expect(result.points).toBeLessThan(BONUS_POINTS.survive)
    expect(state.lives).toBe(lives)
  })
})

describe('i kampagnen', () => {
  it('kører plads 4 som bonusbane og fortsætter til plads 5 efter timeren', () => {
    const state = createGame('easy', { seed: 6 })
    startWave(state, 4)
    expect(state.spec.kind).toBe('bonus')
    expect(BONUS_STAGES).toContain(state.spec.templateId)
    state.ship.invulnerableUntil = Infinity
    run(state, BONUS_SECONDS + BONUS_RESULT_SECONDS + 0.5, { fire: true })
    expect(state.wave).toBe(5)
  })
})
