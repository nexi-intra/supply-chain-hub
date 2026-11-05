import {
  COIN_POINTS,
  DANGER_PUSHBACK,
  DANGER_ZONE_Y,
  DIVE_SECONDS,
  DRUMSTICK_CHANCE,
  ENTRY_CONTACT_GRACE_SECONDS,
  FIELD,
  FULL_MISSILES_PICKUP_POINTS,
  GIFT_CHANCE,
  GOLDEN_DELAY_SECONDS,
  GOLDEN_SPEED,
  INVULNERABLE_SECONDS,
  MAX_LIVES,
  MAX_MISSILES,
  MAX_WEAPON_GIFT_POINTS,
  PICKUP_FALL_SPEED,
  PICKUP_RADIUS,
  POWERUP_CHANCE,
  SHIELD_GRACE_SECONDS,
  SHIP_HALF_WIDTH,
  SHIP_HIT_RADIUS,
  SHIP_MAX_Y,
  SHIP_MIN_Y,
  SHIP_POINTER_SPEED,
  SHIP_SPEED,
  SHIP_Y,
  STARTING_LIVES,
  STEP_SECONDS,
  WAVE_TRANSITION_SECONDS,
  type Difficulty,
} from './config'
import {
  beamHits,
  bossDrops,
  bossPoints,
  bossVulnerable,
  createBossFor,
  damageBoss,
  laserHits,
  missileDamage,
  projectileHitsBoss,
  settleBoss,
  setupBoss,
  touchesBoss,
  updateBossState,
  type BossState,
  type BossWorld,
} from './bosses'
import { steerHomingEgg } from './bosses/attacks'
import { campaignPosition } from './campaign'
import {
  BONUS_RESULT_SECONDS,
  bonusCollisions,
  bonusKill,
  bonusPickup,
  finishBonus,
  isBonusStage,
  moveGalleryHen,
  startBonus,
  updateBonus,
  weaponLocked,
} from './bonusStages'
import {
  absorbShield,
  aimedEgg,
  aimedInAir,
  burstBomb,
  eggRadius,
  ENEMY_DEFS,
  initEnemy,
  introduce,
  isFlyby,
  isSpecial,
  launchFlyby,
  MAX_AIMED_EGGS,
  moveFlyby,
  onKilled,
  stepTurkey,
  updateSpecials,
  type EnemyKind,
  type EnemyWorld,
  type FlybyKind,
} from './enemies'
import { createRng } from './rng'
import {
  blackHoleCatches,
  ejectShip,
  initMeteor,
  isHazardKind,
  meteorDrops,
  meteorHitEvent,
  meteorPoints,
  moveMeteor,
  planHazard,
  splitMeteor,
  updateHazards,
  type MeteorType,
} from './hazards'
import { addBonus, claimExtraLives, createScoreState, pickupDrumstick, registerKill, waveClearBonus } from './scoring'
import {
  advanceFormation,
  applyEntrance,
  createFormationState,
  entryPoint,
  generateSlots,
  initMember,
  memberTarget,
  pickLoopGroup,
  planEntrances,
  planReentry,
  separatePinball,
  settleMember,
  startLoop,
  stepLoop,
  usesColumnFronts,
  type Point,
} from './formations'
import { assignKinds, buildWaveSpec, type WaveSpec } from './waves'
import {
  activateCoolant,
  collectGift,
  coolWeapon,
  createWeaponState,
  downgradeWeapon,
  fire,
  isOverheated,
  rollGiftFamily,
  type WeaponFamily,
} from './weapons'
import { advanceProjectile, BOSS_TARGET_ID, fireShots, PROJECTILE_RADIUS, type ShotWorld } from './shots'
import {
  activatePowerup,
  attractPickup,
  createPowerups,
  isActive,
  LIFE_FULL_POINTS,
  pointsFactor,
  rollPowerup,
  timeScale,
  updatePowerups,
  type TimedPowerup,
} from './powerups'
import type { PickupKind, Enemy, Egg, Pickup, GameInput, GameEvent, GameState, GameStats } from './gameTypes'
export * from './gameTypes'
const HIT_FLASH_SECONDS = 0.08
const TIMED: Partial<Record<PickupKind, TimedPowerup>> = { drone: 'drone', slowmo: 'slowmo', magnet: 'magnet', double: 'double' }
/** Flyvere der ikke nåede ud, spæner af med denne fart, når bølgen er ryddet. */
const FLEE_FACTOR = 3

export function createGame(difficulty: Difficulty, options: { seed?: number } = {}): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32)
  const state: GameState = {
    difficulty,
    seed,
    rng: createRng(seed),
    time: 0,
    status: 'playing',
    wave: 0,
    spec: buildWaveSpec(1, difficulty, seed),
    waveHitTaken: false,
    awaitingWave: false,
    transitionUntil: 0,
    ship: { x: FIELD.width / 2, y: SHIP_Y, vx: 0, vy: 0, invulnerableUntil: 0, shield: false },
    lives: STARTING_LIVES,
    missiles: 1,
    weapon: createWeaponState(),
    powerups: createPowerups(),
    scoring: createScoreState(),
    enemies: [],
    projectiles: [],
    eggs: [],
    pickups: [],
    boss: null,
    formation: createFormationState(),
    meteorsToSpawn: 0,
    hazard: null,
    bonus: null,
    goldenAt: Infinity,
    flybys: [],
    introduced: [],
    stats: { shotsFired: 0, shotsHit: 0, kills: 0, bossesDefeated: 0, defeated: [] },
    nextId: 1,
    pendingEvents: [],
    practice: false,
  }
  startWave(state, 1)
  return state
}

function blankEnemy(state: GameState, kind: EnemyKind, x: number, y: number): Enemy {
  const def = ENEMY_DEFS[kind]
  const enemy: Enemy = {
    id: state.nextId++,
    kind,
    mode: 'free',
    x,
    y,
    vx: 0,
    vy: 0,
    hp: def.hp,
    maxHp: def.hp,
    radius: def.radius,
    large: false,
    meteorType: 'rock',
    dead: false,
    variant: Math.floor(state.rng() * 3),
    hitFlash: 0,
    shield: 0,
    cooldown: 0,
    stage: 0,
    stageT: 0,
    beam: 0,
    stolen: false,
    slotX: x,
    slotY: y,
    slotRow: 0,
    slotGroup: 0,
    slotParam: 0,
    entry: 'quad',
    dx: 0,
    delay: 0,
    pathT: 0,
    pathDuration: 1,
    p0x: x,
    p0y: y,
    p1x: x,
    p1y: y,
    p2x: x,
    p2y: y,
  }
  if (isSpecial(kind)) initEnemy(enemy, state.rng)
  return enemy
}

export function spawnEnemy(
  state: GameState,
  kind: EnemyKind,
  x: number,
  y: number,
  options: { large?: boolean; vx?: number; vy?: number; meteorType?: MeteorType } = {},
): Enemy {
  const enemy = blankEnemy(state, kind, x, y)
  enemy.vx = options.vx ?? 0
  enemy.vy = options.vy ?? 0
  if (kind === 'meteor') initMeteor(enemy, options.meteorType ?? 'rock', !!options.large)
  state.enemies.push(enemy)
  return enemy
}

/** Gaver uden fast familie får en seedet farve: oftest det nuværende våben. */
export function spawnPickup(state: GameState, kind: PickupKind, x: number, y: number, family?: WeaponFamily): Pickup {
  const pickup: Pickup = {
    id: state.nextId++,
    kind,
    x,
    y,
    vx: kind === 'drumstick' || kind === 'coin' ? (state.rng() - 0.5) * 80 : 0,
    vy: PICKUP_FALL_SPEED,
  }
  if (kind === 'gift') pickup.family = family ?? rollGiftFamily(state.weapon.family, state.rng)
  state.pickups.push(pickup)
  return pickup
}

function worldFor(state: GameState, events: GameEvent[]): EnemyWorld {
  return {
    state,
    events,
    spawn: (kind, x, y, options) => spawnEnemy(state, kind, x, y, options),
    drop: (kind, x, y, family) => {
      spawnPickup(state, kind, x, y, family)
    },
    chicks: (count, x, y) => spawnChicks(state, count, x, y),
  }
}

/** Sender en ninja, en UFO eller en regnbuehøne tværs over skærmen. */
export function spawnFlyby(state: GameState, kind: FlybyKind): Enemy {
  return launchFlyby(worldFor(state, state.pendingEvents), kind)
}

export function startWave(state: GameState, wave: number): void {
  beginWave(state, buildWaveSpec(wave, state.difficulty, state.seed))
}

/** Udviklerhop til test og verifikation: rydder banen, starter bølgen og gør spillet til en øvelse uden highscore. */
export function jumpToWave(state: GameState, wave: number): void {
  state.practice = true
  state.enemies = []
  state.projectiles = []
  state.pickups = []
  state.pendingEvents = []
  startWave(state, Math.max(1, Math.floor(wave)))
}

/** Starter en bølge ud fra en færdig spec; tests kan tvinge en bestemt skabelon. */
export function beginWave(state: GameState, spec: WaveSpec): void {
  const wave = spec.wave
  state.wave = wave
  state.spec = spec
  state.waveHitTaken = false
  state.awaitingWave = false
  state.transitionUntil = 0
  state.formation = createFormationState()
  state.eggs = []
  state.boss = null
  state.hazard = isHazardKind(spec.hazard) ? planHazard(spec, state.rng, state.time) : null
  state.meteorsToSpawn = state.hazard?.queue.length ?? 0
  state.bonus = isBonusStage(spec.bonus) ? startBonus(state, spec.bonus) : null
  state.goldenAt = spec.goldenFlyby ? state.time + GOLDEN_DELAY_SECONDS : Infinity
  state.flybys = spec.flybys.map((flyby) => ({ kind: flyby.kind, at: state.time + flyby.at }))
  const slots = generateSlots(spec, FIELD.width)
  const entrances = planEntrances(spec, slots, FIELD.width)
  const kinds = assignKinds(spec, slots)
  state.enemies = slots.map((slot, index) => {
    const enemy = blankEnemy(state, kinds[index], 0, 0)
    initMember(spec, enemy, slot, index)
    applyEntrance(enemy, entrances[index])
    enemy.mode = 'entering'
    return enemy
  })
  state.pendingEvents.push({ type: 'waveStart', wave, kind: spec.kind, templateId: spec.templateId })
  if (spec.slot === 0) state.pendingEvents.push({ type: 'sectorStart', sector: spec.sector, theme: spec.theme, round: spec.round })
  if (state.hazard) state.pendingEvents.push({ type: 'hazardStart', hazard: state.hazard.kind, theme: spec.theme })
  if (state.bonus) state.pendingEvents.push({ type: 'bonusStart', stage: state.bonus.stage, seconds: state.bonus.endsAt - state.bonus.startedAt })
  for (const kind of new Set(kinds)) introduce(state, kind, state.pendingEvents)
  if (spec.bossType) spawnBoss(state, spec)
}

function spawnBoss(state: GameState, spec: WaveSpec): void {
  const boss = createBossFor(spec.bossType!, { level: spec.bossLevel, round: spec.round, difficulty: state.difficulty, variant: spec.bossVariant ?? 0 })
  state.boss = boss
  setupBoss(bossWorld(state, state.pendingEvents))
  state.pendingEvents.push({ type: 'bossIntro', boss: boss.id, variant: boss.variant, mini: boss.mini })
}

function bossWorld(state: GameState, events: GameEvent[]): BossWorld {
  const world = worldFor(state, events)
  return {
    state,
    events,
    boss: state.boss!,
    egg: (x, y, vx, vy, kind) => {
      const egg: Egg = { id: state.nextId++, x, y, vx, vy }
      if (kind) egg.kind = kind
      state.eggs.push(egg)
      return egg
    },
    spawn: world.spawn,
    flyby: (kind) => launchFlyby(world, kind),
    chicks: world.chicks,
    drop: world.drop,
  }
}

export function getStats(state: GameState): GameStats {
  const { shotsFired, shotsHit, kills, bossesDefeated, defeated } = state.stats
  const position = campaignPosition(Math.max(1, state.wave))
  return {
    score: state.scoring.score,
    wave: state.wave,
    kills,
    shotsFired,
    shotsHit,
    accuracy: shotsFired > 0 ? shotsHit / shotsFired : 0,
    bestChain: state.scoring.bestChain,
    bossesDefeated,
    distinctBosses: defeated.length,
    sector: position.sector + 1,
    round: position.round,
  }
}

const quad = (a: number, b: number, c: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c

const clampShipX = (x: number) => Math.min(FIELD.width - SHIP_HALF_WIDTH, Math.max(SHIP_HALF_WIDTH, x))
const clampShipY = (y: number) => Math.min(SHIP_MAX_Y, Math.max(SHIP_MIN_Y, y))

function moveShip(state: GameState, input: GameInput, dt: number): void {
  const { ship } = state
  const fromX = ship.x
  const fromY = ship.y
  const keyX = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const keyY = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  if (keyX !== 0 || keyY !== 0) {
    const step = (SHIP_SPEED * dt) / Math.hypot(keyX, keyY)
    ship.x += keyX * step
    ship.y += keyY * step
  } else if (input.pointerX !== null || input.pointerY !== null) {
    const targetX = clampShipX(input.pointerX ?? ship.x)
    const targetY = clampShipY(input.pointerY ?? ship.y)
    const dx = targetX - ship.x
    const dy = targetY - ship.y
    const distance = Math.hypot(dx, dy)
    const step = SHIP_POINTER_SPEED * dt
    if (distance <= step) {
      ship.x = targetX
      ship.y = targetY
    } else {
      ship.x += (dx / distance) * step
      ship.y += (dy / distance) * step
    }
  }
  ship.x = clampShipX(ship.x)
  ship.y = clampShipY(ship.y)
  ship.vx = (ship.x - fromX) / dt
  ship.vy = (ship.y - fromY) / dt
}

function shotWorld(state: GameState, events: GameEvent[]): ShotWorld {
  return {
    state,
    events,
    hitEnemy: (enemy, damage) => damageEnemy(state, enemy, damage, events),
    hitBoss: (damage, x, y) => {
      if (!state.boss || !bossVulnerable(state.boss)) return
      events.push({ type: 'bossHit', x, y })
      damageBossBy(state, damage, events)
    },
  }
}

function handleFiring(state: GameState, input: GameInput, events: GameEvent[]): void {
  if (!input.fire || weaponLocked(state)) return
  const wasOverheated = isOverheated(state.weapon, state.time)
  const shots = fire(state.weapon, state.time)
  if (!shots) return
  events.push({ type: 'shot', level: state.weapon.level, family: state.weapon.family })
  fireShots(shotWorld(state, events), shots)
  if (!wasOverheated && isOverheated(state.weapon, state.time)) events.push({ type: 'overheat' })
}

function enemyPoints(enemy: Enemy): number {
  return enemy.kind === 'meteor' ? meteorPoints(enemy) : ENEMY_DEFS[enemy.kind].points
}

function rollDrops(state: GameState, enemy: Enemy): void {
  if (enemy.kind === 'meteor') return
  const roll = state.rng()
  if (roll < GIFT_CHANCE) spawnPickup(state, 'gift', enemy.x, enemy.y)
  else if (roll < GIFT_CHANCE + POWERUP_CHANCE) spawnPickup(state, rollPowerup(state.rng), enemy.x, enemy.y)
  if (state.rng() < DRUMSTICK_CHANCE) spawnPickup(state, 'drumstick', enemy.x, enemy.y)
}

function killEnemy(state: GameState, enemy: Enemy, events: GameEvent[], viaMissile: boolean): void {
  enemy.dead = true
  const world = worldFor(state, events)
  const base = enemyPoints(enemy) * pointsFactor(state)
  let points = base
  let multiplier = 1
  // Bonusbaner giver faste point uden combo.
  if (state.bonus) addBonus(state.scoring, (points = bonusKill(world, enemy)))
  else if (viaMissile) addBonus(state.scoring, base)
  else ({ points, multiplier } = registerKill(state.scoring, base, state.time))
  state.stats.kills++
  const meteor = enemy.kind === 'meteor'
  events.push({
    type: 'kill',
    x: enemy.x,
    y: enemy.y,
    kind: enemy.kind,
    points,
    multiplier,
    large: enemy.large,
    theme: state.spec.theme,
    ...(meteor ? { meteorType: enemy.meteorType } : {}),
    ...(enemy.kind === 'bossPart' ? { part: enemy.variant } : {}),
  })
  if (meteor) {
    if (!viaMissile) splitMeteor(world, enemy)
    meteorDrops(world, enemy)
    return
  }
  if (!onKilled(world, enemy, viaMissile)) rollDrops(state, enemy)
}

function defeatBoss(state: GameState, boss: BossState, events: GameEvent[]): void {
  const points = bossPoints(boss)
  addBonus(state.scoring, points)
  state.stats.bossesDefeated++
  if (!state.stats.defeated.includes(boss.id)) state.stats.defeated.push(boss.id)
  events.push({ type: 'bossDefeated', x: boss.x, y: boss.y, points, boss: boss.id, mini: boss.mini, variant: boss.variant })
  // Bossens dele forsvinder med den; hjælperne sprænger og giver point som ved et missil.
  for (const enemy of state.enemies) {
    if (enemy.dead) continue
    if (boss.parts.includes(enemy.id)) enemy.dead = true
    else if (boss.minions.includes(enemy.id)) killEnemy(state, enemy, events, true)
  }
  state.eggs = []
  if (boss.mini) {
    spawnPickup(state, 'gift', boss.x - 30, boss.y)
    spawnPickup(state, rollPowerup(state.rng), boss.x + 30, boss.y)
  } else {
    spawnPickup(state, 'gift', boss.x - 40, boss.y)
    spawnPickup(state, 'life', boss.x, boss.y + 10)
    spawnPickup(state, 'shield', boss.x + 40, boss.y)
  }
  bossDrops(bossWorld(state, events))
  state.boss = null
}

function damageBossBy(state: GameState, amount: number, events: GameEvent[]): void {
  const boss = state.boss
  if (!boss || !bossVulnerable(boss)) return
  const { defeated, phaseChanged } = damageBoss(boss, amount)
  if (defeated) defeatBoss(state, boss, events)
  else if (phaseChanged) events.push({ type: 'bossPhase', phase: boss.phase, boss: boss.id })
}

/** Et missil tager en fjerdedel af hvert tårn eller hver trio-høne i stedet for at knuse dem. */
const PART_MISSILE_RATIO = 0.25

function handleMissile(state: GameState, input: GameInput, events: GameEvent[]): void {
  if (!input.missile || state.missiles <= 0 || weaponLocked(state)) return
  state.missiles--
  events.push({ type: 'missile' })
  for (const enemy of state.enemies) {
    if (enemy.dead) continue
    if (enemy.kind === 'bossPart') damageEnemy(state, enemy, Math.max(1, Math.round(enemy.maxHp * PART_MISSILE_RATIO)), events)
    else killEnemy(state, enemy, events, true)
  }
  state.enemies = state.enemies.filter((enemy) => !enemy.dead)
  state.eggs = []
  if (state.boss) damageBossBy(state, missileDamage(state.boss), events)
}

function spawnWaveExtras(state: GameState, events: GameEvent[]): void {
  if (state.awaitingWave) return
  if (state.time >= state.goldenAt) {
    spawnEnemy(state, 'golden', -40, 36, { vx: GOLDEN_SPEED })
    state.goldenAt = Infinity
  }
  if (state.flybys.length > 0 && state.time >= state.flybys[0].at) {
    const due = state.flybys.filter((flyby) => state.time >= flyby.at)
    state.flybys = state.flybys.filter((flyby) => state.time < flyby.at)
    for (const flyby of due) launchFlyby(worldFor(state, events), flyby.kind)
  }
}

function updateFormation(state: GameState, dt: number): void {
  const members = state.enemies.filter((enemy) => enemy.mode === 'formation' || enemy.mode === 'entering' || enemy.mode === 'wobble')
  advanceFormation(state.spec, state.formation, members, dt)
}

function startDive(state: GameState, enemy: Enemy): void {
  enemy.mode = 'diving'
  enemy.pathT = 0
  enemy.pathDuration = DIVE_SECONDS
  enemy.p0x = enemy.x
  enemy.p0y = enemy.y
  enemy.p1x = enemy.x + (enemy.x < state.ship.x ? -160 : 160)
  enemy.p1y = enemy.y + 260
  enemy.p2x = state.ship.x
  enemy.p2y = FIELD.height + 60
  state.eggs.push({ id: state.nextId++, x: enemy.x, y: enemy.y + enemy.radius, vx: 0, vy: state.spec.eggSpeed })
}

const MAX_LOOPING = 6
const LOOP_STAGGER_SECONDS = 0.25
const targetScratch: Point = { x: 0, y: 0 }
const entryScratch: Point = { x: 0, y: 0 }

function startLoopDive(state: GameState): void {
  const looping = state.enemies.filter((enemy) => enemy.mode === 'looping' && !enemy.dead).length
  const ready = state.enemies.filter((enemy) => enemy.mode === 'formation' && !enemy.dead)
  const group = pickLoopGroup(ready, state.rng)
  if (looping + group.length > MAX_LOOPING) return
  group.forEach((enemy, index) => {
    memberTarget(state.spec, state.formation, enemy, targetScratch)
    startLoop(enemy, targetScratch, index * LOOP_STAGGER_SECONDS)
    enemy.mode = 'looping'
  })
}

function moveEnemies(state: GameState, dt: number, events: GameEvent[]): void {
  const { formation, spec } = state
  const target = targetScratch
  const world = worldFor(state, events)
  for (const enemy of state.enemies) {
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt)
    const fromX = enemy.x
    if (enemy.mode !== 'free') memberTarget(spec, formation, enemy, target)
    switch (enemy.mode) {
      case 'formation':
        settleMember(spec, enemy, target, dt)
        break
      case 'entering': {
        if (enemy.delay > 0) {
          enemy.delay -= dt
          break
        }
        enemy.pathT = Math.min(1, enemy.pathT + dt / enemy.pathDuration)
        entryPoint(enemy, target, entryScratch)
        enemy.x = entryScratch.x
        enemy.y = entryScratch.y
        if (enemy.pathT >= 1) enemy.mode = 'formation'
        break
      }
      case 'looping': {
        if (enemy.delay > 0) {
          enemy.delay -= dt
          enemy.x = target.x
          enemy.y = target.y
          break
        }
        if (stepLoop(enemy, target, dt)) {
          state.eggs.push({ id: state.nextId++, x: enemy.x, y: enemy.y + enemy.radius, vx: 0, vy: spec.eggSpeed })
        }
        if (enemy.pathT >= 1) enemy.mode = 'formation'
        break
      }
      case 'diving': {
        enemy.pathT = Math.min(1, enemy.pathT + dt / enemy.pathDuration)
        enemy.x = quad(enemy.p0x, enemy.p1x, enemy.p2x, enemy.pathT)
        enemy.y = quad(enemy.p0y, enemy.p1y, enemy.p2y, enemy.pathT)
        if (enemy.pathT < 1) break
        if (enemy.kind === 'chick') {
          enemy.dead = true
          break
        }
        enemy.mode = 'entering'
        planReentry(enemy, target)
        break
      }
      case 'wobble':
      case 'kamikaze':
        stepTurkey(world, enemy, target, dt)
        break
      case 'free':
        // Bossens tårne og høns flyttes af bossen selv.
        if (enemy.kind === 'bossPart') break
        if (isFlyby(enemy.kind)) moveFlyby(enemy, dt)
        else if (enemy.kind === 'meteor') moveMeteor(world, enemy, dt)
        else if (enemy.kind === 'galleryHen') moveGalleryHen(enemy, dt)
        else {
          enemy.x += enemy.vx * dt
          enemy.y += enemy.vy * dt
        }
        if (enemy.y > FIELD.height + 60 || enemy.x < -80 || enemy.x > FIELD.width + 80) {
          enemy.dead = true
          if (!ENEMY_DEFS[enemy.kind].requiredForClear) events.push({ type: 'escape', kind: enemy.kind })
        }
        break
    }
    enemy.dx = enemy.x - fromX
  }
  if (spec.motion === 'pinball') separatePinball(state.enemies.filter((enemy) => enemy.mode === 'formation' && !enemy.dead))
}

function enemyAttacks(state: GameState, dt: number): void {
  if (state.awaitingWave) return
  const { spec, rng } = state
  const canShoot = (enemy: Enemy) => enemy.mode === 'formation' && !enemy.dead && ENEMY_DEFS[enemy.kind].shootsEggs
  let shooters: Enemy[]
  if (usesColumnFronts(spec)) {
    const front = new Map<number, Enemy>()
    for (const enemy of state.enemies) {
      if (!canShoot(enemy)) continue
      const existing = front.get(enemy.slotX)
      if (!existing || enemy.slotY > existing.slotY) front.set(enemy.slotX, enemy)
    }
    shooters = Array.from(front.values())
  } else {
    shooters = state.enemies.filter(canShoot)
  }
  if (shooters.length > 0 && rng() < spec.eggRate * dt) {
    const shooter = shooters[Math.floor(rng() * shooters.length)]
    if (shooter.kind === 'sniper' && aimedInAir(state) < MAX_AIMED_EGGS) state.eggs.push(aimedEgg(state, shooter))
    else state.eggs.push({ id: state.nextId++, x: shooter.x, y: shooter.y + shooter.radius, vx: 0, vy: spec.eggSpeed * (0.9 + rng() * 0.2) })
  }
  if (spec.diveRate > 0 && rng() < spec.diveRate * dt) {
    if (spec.motion === 'loopers') {
      startLoopDive(state)
      return
    }
    const divers = state.enemies.filter((enemy) => enemy.kind === 'diver' && enemy.mode === 'formation' && !enemy.dead)
    if (divers.length > 0) startDive(state, divers[Math.floor(rng() * divers.length)])
  }
}

function spawnChicks(state: GameState, count: number, x: number, y: number): void {
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * 40
    const chick = spawnEnemy(state, 'chick', x + offset, y)
    chick.mode = 'diving'
    chick.pathDuration = DIVE_SECONDS * 1.2
    chick.p0x = chick.x
    chick.p0y = chick.y
    chick.p1x = x + offset * 4
    chick.p1y = y + 220
    chick.p2x = state.ship.x + offset
    chick.p2y = FIELD.height + 60
  }
}

function updateBossFrame(state: GameState, dt: number, events: GameEvent[]): void {
  if (state.boss) updateBossState(bossWorld(state, events), dt)
}

/** Delene tælles sammen og bossen falder, når livet er væk (også når sidste tårn eller høne blev skudt). */
function settleBossState(state: GameState, events: GameEvent[]): void {
  const boss = state.boss
  if (boss && settleBoss(bossWorld(state, events))) defeatBoss(state, boss, events)
}

/** Skjold, liv og drab for ét træf fra et skud, et lynled eller et laser-tik. */
function damageEnemy(state: GameState, enemy: Enemy, damage: number, events: GameEvent[]): void {
  if (enemy.dead) return
  if (enemy.kind === 'bossPart' && state.boss?.entering) return
  enemy.hitFlash = HIT_FLASH_SECONDS
  if (absorbShield(enemy)) {
    events.push({ type: 'hit', x: enemy.x, y: enemy.y, kind: enemy.kind, shielded: true })
    if (enemy.shield === 0) events.push({ type: 'shieldBreak', x: enemy.x, y: enemy.y })
    return
  }
  enemy.hp -= damage
  if (enemy.hp <= 0) killEnemy(state, enemy, events, false)
  else events.push(enemy.kind === 'meteor' ? meteorHitEvent(enemy) : { type: 'hit', x: enemy.x, y: enemy.y, kind: enemy.kind })
}

function projectileCollisions(state: GameState, dt: number, events: GameEvent[]): void {
  for (const projectile of state.projectiles) {
    if (projectile.dead) continue
    advanceProjectile(state, projectile, dt)
    if (projectile.dead) continue
    const radius = PROJECTILE_RADIUS[projectile.kind]
    const counts = projectile.kind !== 'drone'
    for (const enemy of state.enemies) {
      if (enemy.dead || projectile.hitIds.includes(enemy.id)) continue
      const reach = enemy.radius + radius
      const dx = projectile.x - enemy.x
      const dy = projectile.y - enemy.y
      if (dx * dx + dy * dy > reach * reach) continue
      if (counts && projectile.hitIds.length === 0) state.stats.shotsHit++
      projectile.hitIds.push(enemy.id)
      damageEnemy(state, enemy, projectile.damage, events)
      if (!projectile.pierce) {
        projectile.dead = true
        break
      }
    }
    const boss = state.boss
    if (projectile.dead || !boss || projectile.hitIds.includes(BOSS_TARGET_ID) || !projectileHitsBoss(boss, projectile.x, projectile.y)) continue
    if (counts && projectile.hitIds.length === 0) state.stats.shotsHit++
    projectile.hitIds.push(BOSS_TARGET_ID)
    if (!projectile.pierce) projectile.dead = true
    if (boss.entering) continue
    if (!bossVulnerable(boss)) {
      // Panser og skjold stopper også gennemborende skud.
      projectile.dead = true
      events.push({ type: 'bossDeflect', x: projectile.x, y: projectile.y })
      continue
    }
    events.push({ type: 'bossHit', x: projectile.x, y: projectile.y })
    damageBossBy(state, projectile.damage, events)
  }
}

function moveEggs(state: GameState, dt: number, events: GameEvent[]): void {
  const bursting: Egg[] = []
  state.eggs = state.eggs.filter((egg) => {
    if (egg.kind === 'homing') steerHomingEgg(egg, state.ship, dt)
    egg.x += egg.vx * dt
    egg.y += egg.vy * dt
    if (egg.kind === 'bomb' && egg.y >= (egg.burstY ?? Infinity)) {
      bursting.push(egg)
      return false
    }
    if (egg.x < -30 || egg.x > FIELD.width + 30 || egg.y < -30) return false
    if (egg.y < FIELD.height - eggRadius(egg)) return true
    if (egg.kind !== 'shard') events.push({ type: 'eggSplat', x: egg.x })
    return false
  })
  for (const bomb of bursting) burstBomb(state, bomb, events)
}

function collectPickups(state: GameState, dt: number, events: GameEvent[]): void {
  const reach = PICKUP_RADIUS + SHIP_HIT_RADIUS + 6
  const fall = dt * timeScale(state)
  const magnet = isActive(state, 'magnet')
  const factor = pointsFactor(state)
  state.pickups = state.pickups.filter((pickup) => {
    pickup.x += pickup.vx * fall
    pickup.y += pickup.vy * fall
    if (magnet) attractPickup(state, pickup, dt)
    if (pickup.y > FIELD.height + 30) return false
    const dx = pickup.x - state.ship.x
    const dy = pickup.y - state.ship.y
    if (dx * dx + dy * dy > reach * reach) return true
    let points = 0
    switch (pickup.kind) {
      case 'gift': {
        const family = pickup.family ?? state.weapon.family
        const result = collectGift(state.weapon, family)
        if (result === 'max') points = MAX_WEAPON_GIFT_POINTS
        else events.push({ type: 'weaponUp', level: state.weapon.level, family, switched: result === 'switch' })
        break
      }
      case 'shield':
        state.ship.shield = true
        break
      case 'coolant':
        activateCoolant(state.weapon, state.time)
        break
      case 'missile':
        if (state.missiles < MAX_MISSILES) state.missiles++
        else points = FULL_MISSILES_PICKUP_POINTS
        break
      case 'life':
        if (state.lives < MAX_LIVES) state.lives++
        else points = LIFE_FULL_POINTS
        break
      case 'drumstick':
        points = state.bonus ? bonusPickup(state, pickup) : pickupDrumstick(state.scoring, state.time, factor)
        break
      case 'coin':
        points = state.bonus ? bonusPickup(state, pickup) : COIN_POINTS * factor
        break
      default:
        activatePowerup(state, TIMED[pickup.kind]!)
    }
    // pickupDrumstick lægger selv sine point til; alt andet lægges til her.
    if ((pickup.kind !== 'drumstick' || state.bonus) && points > 0) addBonus(state.scoring, points)
    events.push({ type: 'pickup', kind: pickup.kind, x: pickup.x, y: pickup.y, points, ...(pickup.family ? { family: pickup.family } : {}) })
    return false
  })
}

/** Returnerer true hvis træffet blev "brugt" (liv mistet eller skjold), så kilden kan fjernes. */
function hitPlayer(state: GameState, events: GameEvent[]): boolean {
  const { ship } = state
  if (state.status !== 'playing' || state.time < ship.invulnerableUntil) return false
  if (ship.shield) {
    ship.shield = false
    ship.invulnerableUntil = state.time + SHIELD_GRACE_SECONDS
    events.push({ type: 'shieldBlock', x: ship.x, y: ship.y })
    return true
  }
  state.lives--
  state.waveHitTaken = true
  downgradeWeapon(state.weapon)
  ship.invulnerableUntil = state.time + INVULNERABLE_SECONDS
  state.eggs = []
  events.push({ type: 'playerHit', x: ship.x, y: ship.y, lives: state.lives })
  if (state.lives <= 0) {
    state.status = 'over'
    events.push({ type: 'gameOver' })
  }
  return true
}

/** Alle levende kyllinger kan ramme skibet; indflyvende først efter et kort frirum, så bølgestarten er fair. */
function canRam(state: GameState, enemy: Enemy): boolean {
  if (enemy.dead) return false
  if (enemy.kind === 'bossPart') return !state.boss?.entering
  if (enemy.mode !== 'entering') return true
  return enemy.delay <= 0 && enemy.pathT * enemy.pathDuration >= ENTRY_CONTACT_GRACE_SECONDS
}

function playerCollisions(state: GameState, events: GameEvent[]): void {
  if (state.bonus) {
    bonusCollisions(state, events)
    return
  }
  const { ship } = state
  for (const egg of state.eggs) {
    const eggReach = eggRadius(egg) + SHIP_HIT_RADIUS
    const dx = egg.x - ship.x
    const dy = egg.y - ship.y
    if (dx * dx + dy * dy <= eggReach * eggReach && hitPlayer(state, events)) {
      state.eggs = state.eggs.filter((other) => other !== egg)
      break
    }
  }
  for (const enemy of state.enemies) {
    if (!canRam(state, enemy)) continue
    const reach = enemy.radius + SHIP_HIT_RADIUS
    const dx = enemy.x - ship.x
    const dy = enemy.y - ship.y
    // Bossens tårne og høns tager ikke skade af et sammenstød.
    if (dx * dx + dy * dy <= reach * reach && hitPlayer(state, events) && enemy.kind !== 'bossPart') enemy.dead = true
  }
  const boss = state.boss
  if (boss && (laserHits(boss, ship.x, SHIP_HIT_RADIUS, ship.y) || boss.beams.some((beam) => beamHits(beam, ship.x, ship.y, SHIP_HIT_RADIUS)) || touchesBoss(boss, ship.x, ship.y, SHIP_HIT_RADIUS))) {
    hitPlayer(state, events)
  }
  if (blackHoleCatches(state) && hitPlayer(state, events)) ejectShip(state)
  const invaded = state.enemies.some((enemy) => !enemy.dead && enemy.mode === 'formation' && enemy.y + enemy.radius >= DANGER_ZONE_Y)
  if (invaded) {
    hitPlayer(state, events)
    state.formation.descent = Math.max(0, state.formation.descent - DANGER_PUSHBACK)
  }
}

function waveIsCleared(state: GameState): boolean {
  if (state.boss || state.meteorsToSpawn > 0) return false
  return state.enemies.every((enemy) => enemy.dead || !ENEMY_DEFS[enemy.kind].requiredForClear)
}

function advanceWaveFlow(state: GameState, events: GameEvent[]): void {
  if (state.awaitingWave) {
    if (state.time >= state.transitionUntil) startWave(state, state.wave + 1)
    return
  }
  if (state.bonus) {
    if (state.time < state.bonus.endsAt) return
    addBonus(state.scoring, finishBonus(state, events))
    endWave(state, BONUS_RESULT_SECONDS)
    return
  }
  if (state.time < state.transitionUntil || !waveIsCleared(state)) return
  const perfect = !state.waveHitTaken
  const bonus = waveClearBonus(state.wave, perfect)
  addBonus(state.scoring, bonus)
  events.push({ type: 'waveClear', wave: state.wave, bonus, perfect })
  endWave(state, WAVE_TRANSITION_SECONDS)
}

function endWave(state: GameState, pause: number): void {
  state.awaitingWave = true
  state.goldenAt = Infinity
  state.flybys = []
  for (const enemy of state.enemies) if (!enemy.dead && enemy.mode === 'free') enemy.vx *= FLEE_FACTOR
  state.transitionUntil = state.time + pause
}

export function stepGame(state: GameState, input: GameInput, dt: number = STEP_SECONDS): GameEvent[] {
  if (state.status !== 'playing') return []
  state.time += dt
  const events = state.pendingEvents.splice(0)

  moveShip(state, input, dt)
  coolWeapon(state.weapon, state.time, dt)
  handleFiring(state, input, events)
  handleMissile(state, input, events)
  updatePowerups(state, events, dt)

  // Slowmo bremser verden, men aldrig skibet, skuddene eller dronen.
  const worldDt = dt * timeScale(state)
  spawnWaveExtras(state, events)
  const world = worldFor(state, events)
  updateHazards(world, worldDt)
  updateBonus(world, worldDt)
  updateFormation(state, worldDt)
  moveEnemies(state, worldDt, events)
  updateSpecials(world, worldDt)
  enemyAttacks(state, worldDt)
  updateBossFrame(state, worldDt, events)

  projectileCollisions(state, dt, events)
  moveEggs(state, worldDt, events)
  collectPickups(state, dt, events)
  playerCollisions(state, events)
  settleBossState(state, events)

  state.projectiles = state.projectiles.filter((projectile) => !projectile.dead)
  state.enemies = state.enemies.filter((enemy) => !enemy.dead)

  const extraLives = claimExtraLives(state.scoring)
  if (extraLives > 0 && state.status === 'playing') {
    state.lives = Math.min(MAX_LIVES, state.lives + extraLives)
    events.push({ type: 'extraLife', lives: state.lives })
  }

  if (state.status === 'playing') advanceWaveFlow(state, events)
  events.push(...state.pendingEvents.splice(0))
  return events
}
