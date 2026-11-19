import { describe, it, expect } from 'vitest'
import { campaignWave } from './campaign'
import { DANGER_PUSHBACK, DANGER_ZONE_Y, FIELD, STEP_SECONDS } from './config'
import {
  advanceFormation,
  applyEntrance,
  createFormationState,
  entryPoint,
  generateSlots,
  initMember,
  loopEggAt,
  loopOffset,
  memberTarget,
  pickLoopGroup,
  planEntrances,
  separatePinball,
  settleMember,
  startLoop,
  stepLoop,
  type FormationState,
  type Member,
  type Point,
  type Slot,
} from './formations'
import { createRng } from './rng'
import { WAVE_TEMPLATES, type TemplateId } from './waveTemplates'
import { buildSpecFromWave, buildWaveSpec, type FormationEntrance, type FormationLayout, type FormationMotion, type WaveSpec } from './waves'

const LAYOUTS: FormationLayout[] = ['grid', 'vShape', 'ring', 'diamond', 'flanks', 'columns', 'checker', 'arrow']
const NEW_TEMPLATES: TemplateId[] = ['vSquadron', 'carousel', 'conga', 'pinballFlock', 'diamondDance', 'loopSquad', 'twinFlanks', 'checkerWall', 'columnDrop', 'arrowhead']
const MIN_DISTANCE = 2 * 19 + 6

const base = buildWaveSpec(1, 'medium', 1)
const withLayout = (layout: FormationLayout, rows: number, cols: number, extra: Partial<WaveSpec> = {}): WaveSpec => ({ ...base, layout, rows, cols, ...extra })
const forTemplate = (id: TemplateId, wave = 33, difficulty: 'easy' | 'expert' = 'expert') =>
  buildSpecFromWave({ ...campaignWave(wave, 1), templateId: id }, difficulty)

const SMALL = { rows: 4, cols: 7 }
const MAX = { rows: 6, cols: 10 }

function distanceBetween(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function minDistance(slots: Point[]) {
  let min = Infinity
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) min = Math.min(min, distanceBetween(slots[i], slots[j]))
  return min
}

function memberFor(spec: WaveSpec, slot: Slot, index: number, radius = 18): Member {
  const member: Member = {
    x: slot.x,
    y: slot.y,
    vx: 0,
    vy: 0,
    radius,
    slotX: slot.x,
    slotY: slot.y,
    slotRow: slot.row,
    slotGroup: slot.group,
    slotParam: slot.param,
    entry: 'quad',
    delay: 0,
    pathT: 0,
    pathDuration: 1,
    p0x: 0,
    p0y: 0,
    p1x: 0,
    p1y: 0,
    p2x: 0,
    p2y: 0,
  }
  initMember(spec, member, slot, index)
  return member
}

const membersFor = (spec: WaveSpec) => generateSlots(spec, FIELD.width).map((slot, index) => memberFor(spec, slot, index))

/** Kører formationen som motoren gør, inklusive farezonens tilbageskub. */
function simulate(spec: WaveSpec, seconds: number, onStep?: (members: Member[], formation: FormationState) => void) {
  const members = membersFor(spec)
  const formation = createFormationState()
  const target: Point = { x: 0, y: 0 }
  const steps = Math.round(seconds / STEP_SECONDS)
  for (let i = 0; i < steps; i++) {
    advanceFormation(spec, formation, members, STEP_SECONDS)
    for (const member of members) {
      memberTarget(spec, formation, member, target)
      settleMember(spec, member, target, STEP_SECONDS)
    }
    if (members.some((member) => member.y + member.radius >= DANGER_ZONE_Y)) formation.descent = Math.max(0, formation.descent - DANGER_PUSHBACK)
    onStep?.(members, formation)
  }
  return { members, formation }
}

const snapshot = (members: Member[]) => members.map((member) => [member.x, member.y])

describe('generateSlots', () => {
  for (const layout of LAYOUTS) {
    for (const [name, size] of [['lille', SMALL], ['maksimal', MAX]] as const) {
      it(`giver gyldige slots for ${layout} (${name} spec)`, () => {
        const spec = withLayout(layout, size.rows, size.cols)
        const slots = generateSlots(spec, FIELD.width)
        expect(slots.length).toBeGreaterThan(0)
        for (const slot of slots) {
          expect(Number.isFinite(slot.x) && Number.isFinite(slot.y)).toBe(true)
          expect(slot.x).toBeGreaterThanOrEqual(24)
          expect(slot.x).toBeLessThanOrEqual(FIELD.width - 24)
          expect(slot.y).toBeGreaterThanOrEqual(50)
          expect(slot.y).toBeLessThanOrEqual(330)
          expect(slot.row).toBeGreaterThanOrEqual(0)
          expect(slot.row).toBeLessThan(spec.rows)
        }
        expect(minDistance(slots)).toBeGreaterThanOrEqual(MIN_DISTANCE)
        if (layout === 'grid') {
          expect(slots).toHaveLength(spec.rows * spec.cols)
        } else {
          expect(slots.length).toBeGreaterThanOrEqual(12)
          expect(slots.length).toBeLessThanOrEqual(40)
        }
      })
    }
  }

  it('bevarer det klassiske gitter præcis', () => {
    const slots = generateSlots(withLayout('grid', 3, 7), FIELD.width)
    expect(slots).toHaveLength(21)
    expect(slots[0]).toMatchObject({ row: 0, col: 0, x: (FIELD.width - 6 * 64) / 2, y: 64 })
    expect(slots[20]).toMatchObject({ row: 2, col: 6, y: 64 + 2 * 50 })
  })

  it('giver ingen slots uden rækker eller kolonner', () => {
    expect(generateSlots({ ...base, rows: 0, cols: 0 }, FIELD.width)).toEqual([])
    expect(generateSlots({ ...base, rows: 0, cols: 0, motion: 'snake' }, FIELD.width)).toEqual([])
  })

  it('vokser med rækker og kolonner uden at sprænge loftet', () => {
    for (const layout of LAYOUTS.filter((id) => id !== 'grid')) {
      let previous = 0
      for (const rows of [4, 5, 6]) {
        const count = generateSlots(withLayout(layout, rows, 10), FIELD.width).length
        expect(count).toBeLessThanOrEqual(40)
        expect(count).toBeGreaterThanOrEqual(previous - 12)
        previous = count
      }
    }
  })

  it('lægger loop-grupper på højst tre naboer i samme række', () => {
    for (const layout of LAYOUTS) {
      const slots = generateSlots(withLayout(layout, 5, 8), FIELD.width)
      const groups = new Map<number, Slot[]>()
      for (const slot of slots) groups.set(slot.group, [...(groups.get(slot.group) ?? []), slot])
      for (const members of groups.values()) {
        expect(members.length).toBeLessThanOrEqual(3)
        expect(new Set(members.map((slot) => slot.row)).size).toBe(1)
      }
    }
  })

  it('lader slangebevægelsen bygge kæder af høns uanset layout', () => {
    for (const size of [SMALL, MAX]) {
      const spec = withLayout('grid', size.rows, size.cols, { motion: 'snake' })
      const slots = generateSlots(spec, FIELD.width)
      expect(slots.length).toBeGreaterThanOrEqual(12)
      expect(slots.length).toBeLessThanOrEqual(40)
      expect(minDistance(slots)).toBeGreaterThanOrEqual(MIN_DISTANCE)
      for (const slot of slots) {
        expect(slot.y).toBeGreaterThanOrEqual(50)
        expect(slot.y).toBeLessThanOrEqual(330)
        expect(slot.x).toBeGreaterThanOrEqual(24)
        expect(slot.x).toBeLessThanOrEqual(FIELD.width - 24)
        expect(slot.row).toBeLessThan(spec.rows)
      }
      expect(new Set(slots.map((slot) => slot.group)).size).toBeGreaterThanOrEqual(3)
    }
  })

  it('giver de nye skabeloner 12-40 høns i alle sektorer og runder', () => {
    for (const id of NEW_TEMPLATES) {
      for (const wave of [1, 9, 17, 25, 33, 41, 73, 121, 161]) {
        const spec = forTemplate(id, wave)
        const slots = generateSlots(spec, FIELD.width)
        expect(slots.length, `${id} bølge ${wave}`).toBeGreaterThanOrEqual(12)
        expect(slots.length, `${id} bølge ${wave}`).toBeLessThanOrEqual(40)
        expect(minDistance(slots), `${id} bølge ${wave}`).toBeGreaterThanOrEqual(MIN_DISTANCE)
        for (const slot of slots) expect(slot.row).toBeLessThan(spec.rows)
      }
    }
  })
})

describe('bevægelsesmønstre', () => {
  const movingSpecs = (): [string, WaveSpec][] => NEW_TEMPLATES.flatMap((id) => [[`${id} (let)`, forTemplate(id, 1, 'easy')], [`${id} (ekspert)`, forTemplate(id, 73)]] as [string, WaveSpec][])

  it('har registreret alle nye skabeloner med rigtige kombinationer', () => {
    for (const id of NEW_TEMPLATES) expect(WAVE_TEMPLATES[id], id).toBeDefined()
    const combos: Record<string, [FormationLayout, FormationMotion, FormationEntrance]> = {
      vSquadron: ['vShape', 'sway', 'split'],
      carousel: ['ring', 'rotate', 'spiral'],
      pinballFlock: ['checker', 'pinball', 'top'],
      diamondDance: ['diamond', 'rotate', 'sides'],
      twinFlanks: ['flanks', 'bob', 'split'],
      checkerWall: ['grid', 'sway', 'sides'],
      columnDrop: ['columns', 'bob', 'top'],
      arrowhead: ['arrow', 'sway', 'spiral'],
    }
    for (const [id, [layout, motion, entrance]] of Object.entries(combos)) {
      expect(forTemplate(id as TemplateId, 33), id).toMatchObject({ layout, motion, entrance })
    }
    expect(forTemplate('conga', 33).motion).toBe('snake')
    expect(forTemplate('loopSquad', 33).motion).toBe('loopers')
  })

  it('holder alle medlemmer inden for banen i 60 sekunder', () => {
    for (const [name, spec] of movingSpecs()) {
      simulate(spec, 60, (members) => {
        for (const member of members) {
          if (!Number.isFinite(member.x) || !Number.isFinite(member.y)) throw new Error(`${name}: ikke et tal`)
          if (member.x < 0 || member.x > FIELD.width || member.y < 0 || member.y + member.radius > FIELD.height) {
            throw new Error(`${name}: uden for banen (${member.x.toFixed(1)}, ${member.y.toFixed(1)})`)
          }
        }
      })
    }
  })

  it('er deterministisk pr. seed', () => {
    for (const [name, spec] of movingSpecs()) {
      const first = snapshot(simulate(spec, 20).members)
      const second = snapshot(simulate(JSON.parse(JSON.stringify(spec)) as WaveSpec, 20).members)
      expect(first, name).toEqual(second)
    }
  })

  it('får forskellige hastigheder af pinball-hønsene for forskellige bølger', () => {
    const a = membersFor({ ...forTemplate('pinballFlock'), wave: 5 })
    const b = membersFor({ ...forTemplate('pinballFlock'), wave: 6 })
    expect(a.map((member) => member.vx)).not.toEqual(b.map((member) => member.vx))
  })

  it('lader sway rykke ned ved kanten', () => {
    const spec = forTemplate('vSquadron', 1, 'easy')
    const { formation } = simulate(spec, 25)
    expect(formation.descent).toBeGreaterThan(0)
  })

  it('lader bob svinge op og ned pr. række uden at ændre rækkefølgen af kolonner', () => {
    const spec = forTemplate('twinFlanks', 1, 'easy')
    const members = membersFor(spec)
    const formation = createFormationState()
    const target: Point = { x: 0, y: 0 }
    const ys = new Map<number, number[]>()
    for (let i = 0; i < 240; i++) {
      advanceFormation(spec, formation, members, STEP_SECONDS)
      for (const member of members) {
        memberTarget(spec, formation, member, target)
        ys.set(member.slotRow, [...(ys.get(member.slotRow) ?? []), target.y - member.slotY - formation.descent])
      }
    }
    for (const offsets of ys.values()) expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(8)
  })

  it('roterer ringen stift omkring et center der glider', () => {
    const spec = forTemplate('carousel', 1, 'easy')
    const members = membersFor(spec)
    const formation = createFormationState()
    const target: Point = { x: 0, y: 0 }
    const centerY = 188
    const original = members.map((member) => Math.hypot(member.slotX - FIELD.width / 2, member.slotY - centerY))
    let moved = 0
    for (let i = 0; i < 600; i++) {
      advanceFormation(spec, formation, members, STEP_SECONDS)
      members.forEach((member, index) => {
        memberTarget(spec, formation, member, target)
        const radius = Math.hypot(target.x - (FIELD.width / 2 + formation.offsetX), target.y - (centerY + formation.descent))
        expect(radius).toBeCloseTo(original[index], 6)
        moved = Math.max(moved, Math.hypot(target.x - member.slotX - formation.offsetX, target.y - member.slotY - formation.descent))
      })
    }
    expect(moved).toBeGreaterThan(50)
    expect(formation.offsetX).not.toBe(0)
  })

  it('lader diamanten rotere inden for banen', () => {
    for (const wave of [1, 33, 73]) {
      const spec = forTemplate('diamondDance', wave)
      simulate(spec, 30, (members) => {
        for (const member of members) expect(member.y - member.radius).toBeGreaterThanOrEqual(0)
      })
    }
  }, 20_000)

  it('lader slangen løbe i en lukket sløjfe og aldrig forlade banen', () => {
    const spec = forTemplate('conga', 33)
    const members = membersFor(spec)
    const start = snapshot(members)
    const formation = createFormationState()
    const target: Point = { x: 0, y: 0 }
    let farthest = 0
    let minGap = Infinity
    let returned = Infinity
    for (let i = 0; i < Math.round(80 / STEP_SECONDS); i++) {
      advanceFormation(spec, formation, members, STEP_SECONDS)
      for (const member of members) {
        memberTarget(spec, formation, member, target)
        settleMember(spec, member, target, STEP_SECONDS)
      }
      expect(formation.descent).toBe(0)
      if (i % 15 === 0) {
        minGap = Math.min(minGap, minDistance(members))
        farthest = Math.max(farthest, Math.hypot(members[0].x - start[0][0], members[0].y - start[0][1]))
        if (formation.t > 5) returned = Math.min(returned, Math.hypot(members[0].x - start[0][0], members[0].y - start[0][1]))
      }
    }
    expect(farthest).toBeGreaterThan(300)
    expect(returned).toBeLessThan(25)
    expect(minGap).toBeGreaterThanOrEqual(36)
    for (const member of members) {
      expect(member.x).toBeGreaterThan(0)
      expect(member.x).toBeLessThan(FIELD.width)
    }
  })

  it('lader pinball-hønsene preller af mod kanterne i de øverste 60 % af banen', () => {
    const spec = forTemplate('pinballFlock', 33)
    const members = membersFor(spec)
    const initial = members.map((member) => Math.sign(member.vx))
    const formation = createFormationState()
    const target: Point = { x: 0, y: 0 }
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let flipped = 0
    for (let i = 0; i < Math.round(40 / STEP_SECONDS); i++) {
      advanceFormation(spec, formation, members, STEP_SECONDS)
      for (const member of members) {
        memberTarget(spec, formation, member, target)
        settleMember(spec, member, target, STEP_SECONDS)
        minX = Math.min(minX, member.x - member.radius)
        maxX = Math.max(maxX, member.x + member.radius)
        minY = Math.min(minY, member.y - member.radius)
        maxY = Math.max(maxY, member.y + member.radius)
      }
    }
    members.forEach((member, index) => {
      if (Math.sign(member.vx) !== initial[index]) flipped++
    })
    expect(minY, 'under HUD-linjen').toBeGreaterThanOrEqual(48)
    expect(minX).toBeGreaterThanOrEqual(-0.5)
    expect(maxX).toBeLessThanOrEqual(FIELD.width + 0.5)
    expect(maxY).toBeLessThanOrEqual(FIELD.height * 0.6 + 0.5)
    expect(flipped).toBeGreaterThan(0)
    expect(formation.descent).toBe(0)
    expect(Math.max(...members.map((member) => Math.abs(member.vy)))).toBeGreaterThan(30)
  })

  it('lader pinball-hønsene prelle af hinanden i stedet for at flyve ind i hinanden', () => {
    for (const wave of [17, 73]) {
      const spec = forTemplate('pinballFlock', wave)
      const members = membersFor(spec)
      const energy = (all: Member[]) => all.reduce((sum, member) => sum + member.vx * member.vx + member.vy * member.vy, 0)
      const energyBefore = energy(members)
      let worst = Infinity
      simulate(spec, 20, (all) => {
        separatePinball(all)
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            worst = Math.min(worst, distanceBetween(all[i], all[j]) - all[i].radius - all[j].radius)
          }
        }
        for (const member of all) {
          expect(member.x - member.radius).toBeGreaterThanOrEqual(-0.5)
          expect(member.x + member.radius).toBeLessThanOrEqual(FIELD.width + 0.5)
          expect(member.y + member.radius).toBeLessThanOrEqual(FIELD.height * 0.6 + 0.5)
        }
      })
      expect(worst, `bølge ${wave}`).toBeGreaterThanOrEqual(-1)
      const after = simulate(spec, 10, separatePinball).members
      expect(energy(after) / energyBefore).toBeCloseTo(1, 6)
    }
  }, 20_000)
})

describe('indflyvning', () => {
  const entranceSpec = (entrance: FormationEntrance, layout: FormationLayout = 'grid') => withLayout(layout, 4, 8, { entrance })

  const fly = (member: Member, target: Point) => {
    const point: Point = { x: 0, y: 0 }
    let elapsed = member.delay
    const path: Point[] = []
    while (member.pathT < 1 && elapsed < 20) {
      member.pathT = Math.min(1, member.pathT + STEP_SECONDS / member.pathDuration)
      entryPoint(member, target, point)
      path.push({ ...point })
      elapsed += STEP_SECONDS
    }
    return { end: path[path.length - 1], elapsed, path }
  }

  const planned = (spec: WaveSpec) => {
    const slots = generateSlots(spec, FIELD.width)
    const plans = planEntrances(spec, slots, FIELD.width)
    const members = slots.map((slot, index) => memberFor(spec, slot, index))
    members.forEach((member, index) => applyEntrance(member, plans[index]))
    return { slots, members }
  }

  for (const entrance of ['sides', 'top', 'spiral', 'split'] as const) {
    for (const layout of ['grid', 'ring', 'vShape'] as const) {
      it(`${entrance} (${layout}) slutter præcis i slottet efter en rimelig tid`, () => {
        const spec = layout === 'ring' ? withLayout('ring', 3, 8, { entrance, motion: 'rotate' }) : entranceSpec(entrance, layout)
        const { slots, members } = planned(spec)
        members.forEach((member, index) => {
          const target = { x: slots[index].x, y: slots[index].y }
          expect(member.delay).toBeGreaterThanOrEqual(0)
          const startsOutside = member.x < -10 || member.x > FIELD.width + 10 || member.y < -10 || member.y > FIELD.height + 10
          expect(startsOutside, `${entrance} start ${member.x},${member.y}`).toBe(true)
          const { end, elapsed, path } = fly(member, target)
          expect(end.x).toBeCloseTo(target.x, 6)
          expect(end.y).toBeCloseTo(target.y, 6)
          expect(elapsed).toBeLessThan(9)
          for (const point of path) expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        })
      })
    }
  }

  it('sides spreder 40 høns på flere baner i stedet for én klump', () => {
    const spec = withLayout('grid', 5, 8, { entrance: 'sides' })
    const { slots, members } = planned(spec)
    const point: Point = { x: 0, y: 0 }
    let worst = 0
    let where = ''
    let sum = 0
    let samples = 0
    for (let elapsed = 0; elapsed < 6; elapsed += STEP_SECONDS) {
      const flying: Point[] = []
      members.forEach((member, index) => {
        if (elapsed < member.delay || member.pathT >= 1) return
        member.pathT = Math.min(1, member.pathT + STEP_SECONDS / member.pathDuration)
        entryPoint(member, slots[index], point)
        if (point.x > 0 && point.x < FIELD.width && point.y > 0) flying.push({ ...point })
      })
      for (const a of flying) {
        const crowd = flying.filter((b) => distanceBetween(a, b) < 22).length - 1
        if (crowd > worst) where = `${elapsed.toFixed(2)}s @ ${a.x.toFixed(0)},${a.y.toFixed(0)}`
        worst = Math.max(worst, crowd)
        sum += crowd
        samples++
      }
    }
    expect(worst, `flest høns oven i én høne (${where})`).toBeLessThanOrEqual(4)
    expect(sum / samples, 'gennemsnitlig trængsel').toBeLessThan(0.6)
    expect(Math.max(...members.map((member) => member.delay)), 'hele flokken er inde inden for 3 s').toBeLessThan(3)
  })

  it('top lader hver kolonne falde for sig oppefra', () => {
    const { slots, members } = planned(entranceSpec('top'))
    const columns = [...new Set(slots.map((slot) => slot.x))].sort((a, b) => a - b)
    const delayOf = (x: number) => Math.min(...members.filter((_, index) => slots[index].x === x).map((member) => member.delay))
    for (let i = 1; i < columns.length; i++) expect(delayOf(columns[i])).toBeGreaterThan(delayOf(columns[i - 1]))
    members.forEach((member, index) => {
      expect(member.y).toBeLessThan(0)
      expect(member.x).toBeCloseTo(slots[index].x, 6)
    })
  })

  it('split flyver spejlvendt ind fra begge sider samtidig', () => {
    const { slots, members } = planned(entranceSpec('split'))
    const center = FIELD.width / 2
    members.forEach((member, index) => {
      const mirror = slots.findIndex((slot) => slot.row === slots[index].row && Math.abs(slot.x - (2 * center - slots[index].x)) < 1e-6)
      expect(mirror).toBeGreaterThanOrEqual(0)
      expect(members[mirror].delay).toBeCloseTo(member.delay, 9)
      expect(members[mirror].x).toBeCloseTo(2 * center - member.x, 6)
      expect(member.x < center).toBe(member.x < 0)
    })
  })

  it('spiral krummer ind i stedet for at flyve lige', () => {
    const { slots, members } = planned(entranceSpec('spiral'))
    const target = { x: slots[5].x, y: slots[5].y }
    const { path } = fly(members[5], target)
    const first = path[0]
    const last = path[path.length - 1]
    let maxDeviation = 0
    for (const point of path) {
      const t = (point.x - first.x) * (last.x - first.x) + (point.y - first.y) * (last.y - first.y)
      const length = Math.hypot(last.x - first.x, last.y - first.y) ** 2
      const projX = first.x + ((last.x - first.x) * t) / length
      const projY = first.y + ((last.y - first.y) * t) / length
      maxDeviation = Math.max(maxDeviation, Math.hypot(point.x - projX, point.y - projY))
    }
    expect(maxDeviation).toBeGreaterThan(80)
  })

  it('følger et bevægeligt mål helt hjem', () => {
    const spec = forTemplate('carousel', 1, 'easy')
    const slots = generateSlots(spec, FIELD.width)
    const plans = planEntrances(spec, slots, FIELD.width)
    const members = slots.map((slot, index) => memberFor(spec, slot, index))
    members.forEach((member, index) => applyEntrance(member, plans[index]))
    const formation = createFormationState()
    const target: Point = { x: 0, y: 0 }
    const point: Point = { x: 0, y: 0 }
    for (let i = 0; i < 600; i++) {
      advanceFormation(spec, formation, members, STEP_SECONDS)
      for (const member of members) {
        if (member.delay > 0) {
          member.delay -= STEP_SECONDS
          continue
        }
        if (member.pathT >= 1) continue
        memberTarget(spec, formation, member, target)
        member.pathT = Math.min(1, member.pathT + STEP_SECONDS / member.pathDuration)
        entryPoint(member, target, point)
        if (member.pathT >= 1) {
          expect(point.x).toBeCloseTo(target.x, 6)
          expect(point.y).toBeCloseTo(target.y, 6)
        }
      }
    }
    expect(members.every((member) => member.pathT >= 1)).toBe(true)
  })
})

describe('loop-dyk', () => {
  it('starter og slutter præcis i slottet', () => {
    const out: Point = { x: 0, y: 0 }
    loopOffset(1, 200, 0, out)
    expect(out.x).toBeCloseTo(0, 9)
    expect(out.y).toBeCloseTo(0, 9)
    loopOffset(-1, 200, 1, out)
    expect(out.x).toBeCloseTo(0, 9)
    expect(out.y).toBeCloseTo(0, 9)
  })

  it('går ned i bunden af sløjfen og taber ægget dér', () => {
    const out: Point = { x: 0, y: 0 }
    for (const depth of [90, 200, 280]) {
      let deepest = 0
      for (let i = 0; i <= 2000; i++) {
        loopOffset(1, depth, i / 2000, out)
        deepest = Math.max(deepest, out.y)
      }
      loopOffset(1, depth, loopEggAt(depth), out)
      expect(out.y, `dybde ${depth}`).toBeGreaterThan(depth)
      expect(out.y, `dybde ${depth}`).toBeCloseTo(deepest, 0)
      expect(deepest).toBeLessThanOrEqual(depth + 70)
      loopOffset(1, depth, 1, out)
      expect(out.y).toBeCloseTo(0, 9)
    }
  })

  /** Krumningsradius gennem tre punkter. */
  const curvatureRadius = (a: Point, b: Point, c: Point) => {
    const ab = distanceBetween(a, b)
    const bc = distanceBetween(b, c)
    const ca = distanceBetween(c, a)
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    return (ab * bc * ca) / (2 * area2)
  }

  const samplePath = (side: number, depth: number, count = 1200) =>
    Array.from({ length: count + 1 }, (_, i) => loopOffset(side, depth, i / count, { x: 0, y: 0 }))

  it('laver en stor, rund Galaga-sløjfe i bunden i stedet for en lille dråbe', () => {
    for (const depth of [90, 200, 280]) {
      const path = samplePath(1, depth)
      const bottom = path.reduce((best, point, index) => (point.y > path[best].y ? index : best), 0)
      const radius = curvatureRadius(path[bottom - 20], path[bottom], path[bottom + 20])
      expect(radius, `dybde ${depth}`).toBeGreaterThanOrEqual(55)
      expect(radius, `dybde ${depth}`).toBeLessThanOrEqual(75)
    }
  })

  it('flyver blødt og med næsten jævn fart hele vejen rundt', () => {
    for (const depth of [90, 200, 280]) {
      const path = samplePath(1, depth)
      const steps = path.slice(1).map((point, i) => distanceBetween(point, path[i]))
      expect(Math.max(...steps) / Math.min(...steps), `dybde ${depth}`).toBeLessThanOrEqual(2.2)
      let sharpest = 0
      for (let i = 2; i < path.length; i++) {
        const a = Math.atan2(path[i - 1].y - path[i - 2].y, path[i - 1].x - path[i - 2].x)
        const b = Math.atan2(path[i].y - path[i - 1].y, path[i].x - path[i - 1].x)
        let turn = Math.abs(b - a)
        if (turn > Math.PI) turn = 2 * Math.PI - turn
        sharpest = Math.max(sharpest, turn)
      }
      expect(sharpest, `dybde ${depth}`).toBeLessThan(0.08)
    }
  })

  it('giver løkken en varighed efter længden, så farten er ens for høje og lave høns', () => {
    const speeds = [64, 160, 280].map((slotY) => {
      const member = memberFor(base, { row: 0, col: 0, x: 300, y: slotY, group: 0, param: 0 }, 0)
      startLoop(member, { x: 300, y: slotY }, 0)
      const path = samplePath(member.p0x, member.p0y, 400)
      const length = path.slice(1).reduce((sum, point, i) => sum + distanceBetween(point, path[i]), 0)
      return length / member.pathDuration
    })
    for (const speed of speeds) {
      expect(speed).toBeGreaterThan(250)
      expect(speed).toBeLessThan(420)
    }
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.1)
  })

  it('laver et fuldt kredsløb', () => {
    const out: Point = { x: 0, y: 0 }
    let previous = { x: 0, y: 0 }
    let heading = 0
    let lastRaw = 0
    let min = 0
    let max = 0
    for (let i = 1; i <= 800; i++) {
      loopOffset(1, 200, i / 800, out)
      const raw = Math.atan2(out.y - previous.y, out.x - previous.x)
      if (i > 1) {
        let delta = raw - lastRaw
        while (delta > Math.PI) delta -= 2 * Math.PI
        while (delta < -Math.PI) delta += 2 * Math.PI
        heading += delta
      }
      min = Math.min(min, heading)
      max = Math.max(max, heading)
      lastRaw = raw
      previous = { x: out.x, y: out.y }
    }
    expect(max - min).toBeGreaterThanOrEqual(2 * Math.PI * 0.95)
  })

  it('spejler siden og holder sig inden for 120 px sidelæns', () => {
    const left: Point = { x: 0, y: 0 }
    const right: Point = { x: 0, y: 0 }
    for (let i = 0; i <= 100; i++) {
      loopOffset(1, 180, i / 100, right)
      loopOffset(-1, 180, i / 100, left)
      expect(left.x).toBeCloseTo(-right.x, 9)
      expect(left.y).toBeCloseTo(right.y, 9)
      expect(Math.abs(right.x)).toBeLessThanOrEqual(120)
    }
  })

  it('vælger højst tre medlemmer af samme gruppe', () => {
    const spec = withLayout('grid', 4, 9, { motion: 'loopers' })
    const members = membersFor(spec)
    for (let seed = 0; seed < 30; seed++) {
      const group = pickLoopGroup(members, createRng(seed))
      expect(group.length).toBeGreaterThan(0)
      expect(group.length).toBeLessThanOrEqual(3)
      expect(new Set(group.map((member) => member.slotGroup)).size).toBe(1)
    }
    expect(pickLoopGroup([], createRng(1))).toEqual([])
  })

  it('lader hele gruppen dykke, tabe ét æg hver i bunden og vende tilbage til slottet', () => {
    const spec = forTemplate('loopSquad', 33)
    const members = membersFor(spec)
    const formation = createFormationState()
    const group = pickLoopGroup(members, createRng(5))
    const target: Point = { x: 0, y: 0 }
    group.forEach((member, index) => {
      memberTarget(spec, formation, member, target)
      startLoop(member, target, index * 0.25)
    })
    const drops = new Map<Member, number>()
    let deepest = 0
    for (let i = 0; i < Math.round((Math.max(...group.map((member) => member.pathDuration)) + 1.2) / STEP_SECONDS); i++) {
      advanceFormation(spec, formation, members, STEP_SECONDS)
      for (const member of members) {
        memberTarget(spec, formation, member, target)
        if (!group.includes(member)) {
          settleMember(spec, member, target, STEP_SECONDS)
          continue
        }
        if (member.delay > 0) {
          member.delay -= STEP_SECONDS
          member.x = target.x
          member.y = target.y
          continue
        }
        if (member.pathT >= 1) continue
        if (stepLoop(member, target, STEP_SECONDS)) drops.set(member, (drops.get(member) ?? 0) + 1)
        deepest = Math.max(deepest, member.y)
        expect(Number.isFinite(member.x) && Number.isFinite(member.y)).toBe(true)
        expect(member.x).toBeGreaterThanOrEqual(0)
        expect(member.x).toBeLessThanOrEqual(FIELD.width)
        if (member.pathT >= 1) {
          expect(member.x).toBeCloseTo(target.x, 6)
          expect(member.y).toBeCloseTo(target.y, 6)
        }
      }
    }
    expect(group.every((member) => member.pathT >= 1)).toBe(true)
    expect(group.every((member) => drops.get(member) === 1)).toBe(true)
    expect(deepest).toBeGreaterThan(group[0].slotY + 80)
    expect(deepest).toBeLessThan(DANGER_ZONE_Y)
  })
})
