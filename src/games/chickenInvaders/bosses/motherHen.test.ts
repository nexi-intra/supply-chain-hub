import { describe, it, expect } from 'vitest'
import { BOSS_ENTER_SECONDS, BOSS_HALF_WIDTH, BOSS_Y, DIFFICULTY_SETTINGS, FIELD, LASER_WARNING_SECONDS, STEP_SECONDS } from '../config'
import { createRng } from '../rng'
import { bossPhase, damageBoss, missileDamage, type BossState } from './core'
import { bossMaxHealth, createBoss, laserHits, updateBoss, type BossAction } from './motherHen'

function simulate(boss: BossState, seconds: number, shipX: () => number = () => 480): Array<BossAction & { at: number }> {
  const rng = createRng(3)
  const actions: Array<BossAction & { at: number }> = []
  const steps = Math.round(seconds / STEP_SECONDS)
  for (let i = 0; i < steps; i++) {
    for (const action of updateBoss(boss, STEP_SECONDS, { shipX: shipX(), fieldWidth: FIELD.width, eggSpeed: 200, rng })) {
      actions.push({ ...action, at: boss.time })
    }
  }
  return actions
}

function readyBoss(level = 1): BossState {
  const boss = createBoss(level, 'medium', FIELD.width)
  simulate(boss, BOSS_ENTER_SECONDS + 0.1)
  return boss
}

describe('bossMaxHealth', () => {
  it('skalerer med niveau og sværhedsgrad', () => {
    expect(bossMaxHealth(1, 'medium')).toBe(DIFFICULTY_SETTINGS.medium.bossHealth)
    expect(bossMaxHealth(2, 'medium')).toBe(DIFFICULTY_SETTINGS.medium.bossHealth * 1.5)
    expect(bossMaxHealth(1, 'expert')).toBeGreaterThan(bossMaxHealth(1, 'easy'))
  })
})

describe('createBoss', () => {
  it('starter over skærmen med fuldt liv i fase 1', () => {
    const boss = createBoss(1, 'medium', FIELD.width)
    expect(boss.id).toBe('motherHen')
    expect(boss.entering).toBe(true)
    expect(boss.y).toBeLessThan(0)
    expect(boss.health).toBe(boss.maxHealth)
    expect(boss.phase).toBe(1)
  })

  it('angriber ikke under indflyvningen og lander på sin position', () => {
    const boss = createBoss(1, 'medium', FIELD.width)
    const actions = simulate(boss, BOSS_ENTER_SECONDS - 0.05)
    expect(actions).toEqual([])
    simulate(boss, 0.2)
    expect(boss.entering).toBe(false)
    expect(boss.y).toBe(BOSS_Y)
  })
})

describe('faser og skade', () => {
  it('skifter fase under 66 % og under 33 %', () => {
    expect(bossPhase(67, 100)).toBe(1)
    expect(bossPhase(66, 100)).toBe(2)
    expect(bossPhase(34, 100)).toBe(2)
    expect(bossPhase(33, 100)).toBe(3)
  })

  it('melder faseskift og nederlag, og liv går ikke under nul', () => {
    const boss = createBoss(1, 'medium', 960)
    boss.health = boss.maxHealth = 100
    expect(damageBoss(boss, 1)).toEqual({ defeated: false, phaseChanged: false })
    expect(damageBoss(boss, 33)).toEqual({ defeated: false, phaseChanged: true })
    expect(boss.phase).toBe(2)
    expect(damageBoss(boss, 500)).toEqual({ defeated: true, phaseChanged: true })
    expect(boss.health).toBe(0)
  })

  it('lader et missil tage 15 % af det fulde liv', () => {
    const boss = createBoss(1, 'medium', 960)
    boss.maxHealth = 160
    expect(missileDamage(boss)).toBe(24)
  })
})

describe('angreb', () => {
  it('skyder en symmetrisk vifte af 5 æg i fase 1', () => {
    const boss = readyBoss()
    const volley = simulate(boss, 3).find((action) => action.type === 'eggs')
    expect(volley?.type).toBe('eggs')
    if (volley?.type !== 'eggs') return
    expect(volley.eggs).toHaveLength(5)
    const vxs = volley.eggs.map((egg) => egg.vx).sort((a, b) => a - b)
    expect(vxs[0]).toBeCloseTo(-vxs[4])
    for (const egg of volley.eggs) expect(egg.vy).toBeGreaterThan(0)
  })

  it('kalder 3 kyllinger i fase 2', () => {
    const boss = readyBoss()
    damageBoss(boss, Math.ceil(boss.maxHealth * 0.4))
    const chicks = simulate(boss, 8).filter((action) => action.type === 'chicks')
    expect(chicks.length).toBeGreaterThanOrEqual(1)
    expect(chicks[0]).toMatchObject({ count: 3 })
  })

  it('varsler laseren et sekund før den rammer, og laseren følger ikke skibet', () => {
    const boss = readyBoss()
    damageBoss(boss, Math.ceil(boss.maxHealth * 0.7))
    let shipX = 300
    const actions = simulate(boss, 6, () => shipX++)
    const warning = actions.find((action) => action.type === 'laserWarning')
    const firing = actions.find((action) => action.type === 'laserFire')
    expect(warning).toBeDefined()
    expect(firing).toBeDefined()
    if (warning?.type !== 'laserWarning' || firing?.type !== 'laserFire') return
    expect(firing.at - warning.at).toBeCloseTo(LASER_WARNING_SECONDS, 1)
    expect(firing.x).toBe(warning.x)
  })

  it('rammer kun med laseren mens den skyder', () => {
    const boss = readyBoss()
    boss.laser = { state: 'warning', x: 400, until: boss.time + 1 }
    expect(laserHits(boss, 400, 16)).toBe(false)
    boss.laser = { state: 'firing', x: 400, until: boss.time + 1 }
    expect(laserHits(boss, 420, 16)).toBe(true)
    expect(laserHits(boss, 480, 16)).toBe(false)
  })

  it('bliver inden for banen', () => {
    const boss = readyBoss(3)
    for (let i = 0; i < 20; i++) {
      simulate(boss, 1)
      expect(boss.x - BOSS_HALF_WIDTH).toBeGreaterThanOrEqual(0)
      expect(boss.x + BOSS_HALF_WIDTH).toBeLessThanOrEqual(FIELD.width)
    }
  })

  it('er blidere som første boss end i Nyt+: færre æg i fase 2 og 3 og sjældnere laser', () => {
    const pressure = (round: number, damage: number) => {
      const boss = createBoss(1, 'medium', FIELD.width, round)
      simulate(boss, BOSS_ENTER_SECONDS + 0.1)
      boss.health = Math.ceil(boss.maxHealth * (1 - damage))
      boss.phase = damage > 0.67 ? 3 : 2
      const actions = simulate(boss, 20)
      const eggs = actions.reduce((sum, action) => sum + (action.type === 'eggs' ? action.eggs.length : 0), 0)
      return { eggs, lasers: actions.filter((action) => action.type === 'laserFire').length }
    }
    for (const damage of [0.4, 0.7]) {
      const first = pressure(0, damage)
      const later = pressure(1, damage)
      expect(first.eggs, `skade ${damage}`).toBeLessThan(later.eggs * 0.85)
    }
    expect(pressure(0, 0.7).lasers).toBeLessThan(pressure(1, 0.7).lasers)
  })
})
