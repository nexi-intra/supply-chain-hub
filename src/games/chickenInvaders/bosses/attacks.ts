import { FIELD, SHIP_MAX_Y, SHIP_MIN_Y } from '../config'
import { pullShip, type MeteorType } from '../hazards'
import { addBeam, clamp, livingMinions, pace, type AttackSpec, type BeamStyle, type BossWorld } from './core'
import type { EggKind } from './types'

const TAU = Math.PI * 2
const eggSpeed = (w: BossWorld) => w.state.spec.eggSpeed
export const TRACTOR_HALF_WIDTH = 92
export const TRACTOR_STEAL_SECONDS = 1
const MAX_CHUNKS = 7
const MAX_HOMING = 4
/** Målsøgende æg drejer langsomt, styrer kun i 4,5 s og vender aldrig opad. */
export const HOMING = { turn: 1.4, life: 4.5, maxAngle: 1.2 }

export function steerHomingEgg(egg: { x: number; y: number; vx: number; vy: number; age?: number }, target: { x: number; y: number }, dt: number): void {
  egg.age = (egg.age ?? 0) + dt
  if (egg.age > HOMING.life) return
  const heading = Math.atan2(egg.vx, egg.vy)
  let diff = Math.atan2(target.x - egg.x, target.y - egg.y) - heading
  diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  const next = clamp(heading + clamp(diff, -HOMING.turn * dt, HOMING.turn * dt), -HOMING.maxAngle, HOMING.maxAngle)
  const speed = Math.hypot(egg.vx, egg.vy)
  egg.vx = Math.sin(next) * speed
  egg.vy = Math.cos(next) * speed
}

export function fanEggs(w: BossWorld, x: number, y: number, count: number, spread: number, speed: number, kind?: EggKind, center = 0): void {
  for (let i = 0; i < count; i++) {
    const angle = center + (count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1))
    w.egg(x, y, Math.sin(angle) * speed, Math.cos(angle) * speed, kind)
  }
}

export function ringEggs(w: BossWorld, x: number, y: number, count: number, speed: number, offset: number, kind?: EggKind, radius = 0): void {
  for (let i = 0; i < count; i++) {
    const angle = offset + (i * TAU) / count
    w.egg(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, Math.cos(angle) * speed, Math.sin(angle) * speed, kind)
  }
}

/** Sigtet æg; vinklen holdes inden for ±max fra lodret, så det kan læses. */
export function aimEgg(w: BossWorld, x: number, y: number, toX: number, toY: number, speed: number, kind: EggKind = 'aimed', max = 0.8): void {
  const angle = clamp(Math.atan2(toX - x, Math.max(1, toY - y)), -max, max)
  w.egg(x, y, Math.sin(angle) * speed, Math.cos(angle) * speed, kind)
}

type Point = { x: number; y: number }
const below = (w: BossWorld, depth = 0.8): Point => ({ x: w.boss.x, y: w.boss.y + w.boss.halfHeight * depth })

export function fanAttack(o: { count: number; spread: number; speed?: number; kind?: EggKind; cooldown: number; charge?: number; from?: (w: BossWorld) => Point }): AttackSpec {
  return {
    charge: o.charge ?? 0.8,
    cooldown: o.cooldown,
    begin: (w, a) => Object.assign(a, (o.from ?? below)(w)),
    fire: (w) => {
      const p = (o.from ?? below)(w)
      fanEggs(w, p.x, p.y, o.count, o.spread, eggSpeed(w) * (o.speed ?? 1), o.kind)
    },
  }
}

/** Meteor-klumper kastes fra skallen ned mod skibet (almindelige meteorer, der kan skydes). */
export function chunksAttack(o: { count: number; types: MeteorType[]; cooldown: number }): AttackSpec {
  return {
    charge: 0.85,
    cooldown: o.cooldown,
    begin: (w, a) => Object.assign(a, below(w, 0.7)),
    fire: (w) => {
      const { state, boss } = w
      const alive = state.enemies.filter((enemy) => !enemy.dead && enemy.kind === 'meteor').length
      const count = Math.min(o.count, MAX_CHUNKS - alive)
      const aim = Math.atan2(state.ship.x - boss.x, Math.max(80, state.ship.y - boss.y))
      for (let i = 0; i < count; i++) {
        const type = o.types[Math.floor(state.rng() * o.types.length)]
        const angle = clamp(aim + (i - (count - 1) / 2) * 0.42, -1.1, 1.1)
        const speed = eggSpeed(w) * (0.5 + state.rng() * 0.12)
        const meteor = w.spawn('meteor', boss.x + Math.sin(angle) * boss.halfWidth * 0.65, boss.y + Math.cos(angle) * boss.halfHeight * 0.65, {
          vx: Math.sin(angle) * speed,
          vy: Math.cos(angle) * speed,
          meteorType: type,
          large: i === 0 && type !== 'metal' && state.rng() < 0.4,
        })
        boss.minions.push(meteor.id)
      }
    },
  }
}

/** Roterende arme af æg fra bossens midte. */
export function spiralAttack(o: { arms: number; rate: number; every: number; duration: number; speed?: number; kind?: EggKind; cooldown: number }): AttackSpec {
  return {
    charge: 0.85,
    duration: o.duration,
    cooldown: o.cooldown,
    hold: true,
    begin: (w, a) => {
      a.a = w.state.rng() * TAU
      a.n = w.state.rng() < 0.5 ? 1 : -1
    },
    tick: (w, a, dt) => {
      const { boss } = w
      a.a += a.n * o.rate * dt
      a.next -= dt
      while (a.next <= 0) {
        a.next += o.every
        const speed = eggSpeed(w) * (o.speed ?? 0.5)
        for (let arm = 0; arm < o.arms; arm++) {
          const angle = a.a + (arm * TAU) / o.arms
          w.egg(boss.x + Math.cos(angle) * boss.halfWidth * 0.5, boss.y + Math.sin(angle) * boss.halfHeight * 0.5, Math.cos(angle) * speed, Math.sin(angle) * speed, o.kind)
        }
      }
    },
  }
}

/** Skallen sprænger skår ud i alle retninger i flere ringe. */
export function shardsAttack(o: { count: number; bursts: number; gap: number; cooldown: number }): AttackSpec {
  return {
    charge: 0.9,
    duration: o.bursts * o.gap,
    cooldown: o.cooldown,
    begin: (w, a) => {
      a.a = w.state.rng() * TAU
    },
    tick: (w, a) => {
      if (a.n >= o.bursts || a.t - a.charge < a.n * o.gap) return
      const { boss } = w
      ringEggs(w, boss.x, boss.y, o.count, eggSpeed(w) * 0.62, a.a + (a.n * Math.PI) / o.count, 'shard', Math.min(boss.halfWidth, boss.halfHeight) * 0.6)
      a.n++
    },
  }
}

/** Fejende stråle fra et punkt; banen varsles som en kile, og den dækker højst ca. halvdelen af gulvet. */
export function sweepAttack(o: { span: number; fire: number; style: BeamStyle; halfWidth: number; cooldown: number; origin: (w: BossWorld) => Point }): AttackSpec {
  return {
    charge: 1,
    duration: o.fire,
    cooldown: o.cooldown,
    hold: true,
    begin: (w, a) => {
      const { state, boss } = w
      let dir = state.rng() < 0.5 ? -1 : 1
      const ends = () => {
        const from = clamp(state.ship.x - dir * 190, 40, FIELD.width - 40)
        return [from, clamp(from + dir * o.span, 40, FIELD.width - 40)]
      }
      let [x0, x1] = ends()
      if (Math.abs(x1 - x0) < o.span * 0.7) {
        dir = -dir
        ;[x0, x1] = ends()
      }
      const origin = o.origin(w)
      addBeam(boss, { ox: origin.x, oy: origin.y, x: x0, y: FIELD.height, toX: x1, toY: FIELD.height, sweep: true, halfWidth: o.halfWidth, warn: a.charge, fire: o.fire, style: o.style })
      a.x = x0
      a.y = FIELD.height
      a.a = x1
    },
  }
}

/** 2–3 lasere på kryds og tværs; én følger skibet, når varslet tændes, og der er altid fri plads imellem. */
export function gridAttack(o: { count: (w: BossWorld) => number; fire: number; cooldown: number; style?: BeamStyle }): AttackSpec {
  return {
    charge: 1,
    duration: o.fire,
    cooldown: o.cooldown,
    begin: (w, a) => {
      const { state, boss } = w
      const count = o.count(w)
      const x1 = clamp(state.ship.x, 60, FIELD.width - 60)
      let x2 = x1
      for (let tries = 0; tries < 12 && Math.abs(x2 - x1) < 260; tries++) x2 = 60 + state.rng() * (FIELD.width - 120)
      if (Math.abs(x2 - x1) < 260) x2 = x1 < FIELD.width / 2 ? x1 + 320 : x1 - 320
      const style = o.style ?? 'red'
      const warn = a.charge
      for (const x of [x1, x2]) addBeam(boss, { ox: x, oy: 96, x, y: FIELD.height, halfWidth: 11, warn, fire: o.fire, style })
      if (count >= 3) {
        const y = clamp(state.ship.y, 230, SHIP_MAX_Y - 30)
        addBeam(boss, { ox: 0, oy: y, x: FIELD.width, y, halfWidth: 11, warn, fire: o.fire, style })
      }
      a.x = x1
      a.y = state.ship.y
    },
  }
}

/** Sigtede salver fra hver kilde mod skibets plads, da varslet tændtes. */
export function burstAttack(o: { shots: number; gap: number; speed?: number; cooldown: number; sources: (w: BossWorld) => Point[] }): AttackSpec {
  const emit = (w: BossWorld, a: { t: number; charge: number; n: number; x: number; y: number }) => {
    while (a.n < o.shots && a.t - a.charge >= a.n * o.gap - 1e-9) {
      for (const s of o.sources(w)) aimEgg(w, s.x, s.y, a.x, a.y, eggSpeed(w) * (o.speed ?? 1.1))
      a.n++
    }
  }
  return {
    charge: 0.85,
    duration: o.shots * o.gap,
    cooldown: o.cooldown,
    begin: (w, a) => {
      a.x = w.state.ship.x
      a.y = w.state.ship.y
    },
    fire: emit,
    tick: emit,
  }
}

/** Langsomme æg, der drejer mod skibet (styres i motorens æggetrin). */
export function homingAttack(o: { count: (w: BossWorld) => number; cooldown: number; from: (w: BossWorld) => Point }): AttackSpec {
  return {
    charge: 0.85,
    cooldown: o.cooldown,
    begin: (w, a) => Object.assign(a, o.from(w)),
    fire: (w) => {
      const alive = w.state.eggs.filter((egg) => egg.kind === 'homing').length
      const count = Math.min(o.count(w), MAX_HOMING - alive)
      const p = o.from(w)
      const speed = eggSpeed(w) * 0.42
      for (let i = 0; i < count; i++) {
        const angle = (i - (count - 1) / 2) * 0.9
        w.egg(p.x, p.y, Math.sin(angle) * speed, Math.cos(angle) * speed, 'homing').age = 0
      }
    },
  }
}

/** Snestorm: isæg fra toppen i vindens retning; søjlerne fordeles, så der altid er huller. */
export function blizzardAttack(o: { duration: number; rate: number; cooldown: number }): AttackSpec {
  const COLUMNS = 14
  return {
    charge: 0.9,
    duration: o.duration,
    cooldown: o.cooldown,
    begin: (w, a) => {
      w.boss.wind = w.state.rng() < 0.5 ? -1 : 1
      a.a = w.boss.wind
    },
    tick: (w, a, dt) => {
      const { state, boss } = w
      a.next -= dt
      while (a.next <= 0) {
        // Snestormen bliver ikke tættere end 1,1 × grundtempoet, også på ekspert.
        a.next += 1 / (o.rate * Math.min(pace(boss), 1.1))
        const column = (a.n * 5) % COLUMNS
        a.n++
        const width = (FIELD.width + 160) / COLUMNS
        const x = clamp((column + state.rng()) * width - 80 - boss.wind * 60, -20, FIELD.width + 20)
        w.egg(x, -8, boss.wind * eggSpeed(w) * 0.4, eggSpeed(w) * 0.72, 'ice')
      }
    },
  }
}

export function summonAttack(o: { kind: 'shield'; count: (w: BossWorld) => number; max: number; cooldown: number }): AttackSpec {
  return {
    charge: 0.85,
    cooldown: o.cooldown,
    fire: (w) => {
      const { state, boss } = w
      const alive = livingMinions(state, boss).filter((enemy) => enemy.kind === o.kind).length
      const count = Math.min(o.count(w), o.max - alive)
      for (let i = 0; i < count; i++) boss.minions.push(w.spawn(o.kind, boss.x, boss.y + boss.halfHeight * 0.4).id)
    },
  }
}

export function ufosAttack(o: { max: (w: BossWorld) => number; cooldown: number }): AttackSpec {
  return {
    charge: 0.85,
    cooldown: o.cooldown,
    fire: (w) => {
      const alive = w.state.enemies.filter((enemy) => !enemy.dead && enemy.kind === 'ufo').length
      for (let i = alive; i < o.max(w); i++) w.boss.minions.push(w.flyby('ufo').id)
    },
  }
}

/** Teleport: destinationen varsles, bossen forsvinder et øjeblik og dukker op langt fra skibet. */
export function teleportAttack(o: { cooldown: number }): AttackSpec {
  return {
    charge: 0.9,
    duration: 0.32,
    cooldown: o.cooldown,
    hold: true,
    begin: (w, a) => {
      const { state, boss } = w
      const options: number[] = []
      for (let x = boss.halfWidth + 50; x <= FIELD.width - boss.halfWidth - 50; x += 30) {
        if (Math.abs(x - state.ship.x) >= 240 && Math.abs(x - boss.x) >= 160) options.push(x)
      }
      a.x = options.length > 0 ? options[Math.floor(state.rng() * options.length)] : state.ship.x < FIELD.width / 2 ? FIELD.width - boss.halfWidth - 50 : boss.halfWidth + 50
      a.y = clamp(boss.homeY + (state.rng() - 0.5) * 40, 140, 185)
    },
    fire: (w) => {
      w.boss.hidden = true
    },
    end: (w, a) => {
      const { boss } = w
      w.events.push({ type: 'bossTeleport', fromX: boss.x, fromY: boss.y, x: a.x, y: a.y })
      boss.x = a.x
      boss.y = boss.homeY = a.y
      boss.hidden = false
    },
  }
}

/** Det sorte huls sug mod bossen: højst 80 px/s (skibet flyver 480), med langsomme ringe af æg. */
export function blackHoleAttack(o: { duration: number; ringEvery: number; cooldown: number }): AttackSpec {
  return {
    charge: 1,
    duration: o.duration,
    cooldown: o.cooldown,
    hold: true,
    tick: (w, a, dt) => {
      const { state, boss } = w
      const active = a.t - a.charge
      boss.pull = Math.min(1, active / 0.6) * Math.min(1, (a.charge + a.duration - a.t) / 0.4)
      pullShip(state.ship, { x: boss.x, y: boss.y, age: 0, strength: boss.pull, collapsing: false, collapseT: 0 }, dt)
      state.ship.y = clamp(state.ship.y, SHIP_MIN_Y, SHIP_MAX_Y)
      if (active >= a.n * o.ringEvery) {
        ringEggs(w, boss.x, boss.y, 10, eggSpeed(w) * 0.38, a.n * 0.31, undefined, boss.halfWidth * 0.75)
        a.n++
      }
    },
    end: (w) => {
      w.boss.pull = 0
    },
  }
}

/** Bred traktorstråle: står skibet i den i 1 s, stjæles ét våbenniveau (højst én gang pr. stråle). */
export function tractorAttack(o: { duration: number; cooldown: number }): AttackSpec {
  return {
    charge: 0.95,
    duration: o.duration,
    cooldown: o.cooldown,
    hold: true,
    begin: (w, a) => {
      a.x = w.boss.x
      a.y = w.boss.y
    },
    tick: (w, a, dt) => {
      const { state, boss } = w
      const ship = state.ship
      const inside = Math.abs(ship.x - boss.x) <= TRACTOR_HALF_WIDTH && ship.y > boss.y
      a.n = inside ? a.n + dt : 0
      if (inside) ship.x += clamp(boss.x - ship.x, -45 * dt, 45 * dt)
      if (a.next > 0 || a.n < TRACTOR_STEAL_SECONDS - 1e-9 || state.weapon.level <= 1) return
      state.weapon.level--
      boss.stolen++
      a.next = 1
      w.events.push({ type: 'weaponStolen', x: boss.x, y: boss.y, level: state.weapon.level })
    },
  }
}
