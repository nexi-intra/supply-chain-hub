import { ENTER_SECONDS, ENTER_STAGGER_SECONDS, FIELD } from './config'
import { createRng, type Rng } from './rng'
import type { FormationEntrance, WaveSpec } from './waves'

export interface Point {
  x: number
  y: number
}

export interface Slot {
  row: number
  col: number
  x: number
  y: number
  /** Loop-gruppe (højst tre naboer i samme række) eller kædenummer i en slange. */
  group: number
  /** Slangens startposition langs banen i pixels; ellers 0. */
  param: number
}

/** Indflyvningskurve: 'quad' er en kvadratisk bezier, 'spiral' en snurrende spiral ind mod målet. */
export type EntryKind = 'quad' | 'spiral'

/** De felter af en fjende som formationslogikken læser og skriver; motorens Enemy opfylder dem. */
export interface Member {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  slotX: number
  slotY: number
  slotRow: number
  slotGroup: number
  slotParam: number
  entry: EntryKind
  delay: number
  pathT: number
  pathDuration: number
  p0x: number
  p0y: number
  p1x: number
  p1y: number
  p2x: number
  p2y: number
}

export interface FormationState {
  offsetX: number
  dir: 1 | -1
  descent: number
  /** Bølgens bevægelsesur i sekunder. */
  t: number
}

export interface EntrancePlan {
  entry: EntryKind
  delay: number
  duration: number
  x: number
  y: number
  p0x: number
  p0y: number
  p1x: number
  p1y: number
}

const TOP = 64
const SPACING_X = 64
const SPACING_Y = 50
export const MAX_ENEMIES = 40
const CENTER_X = FIELD.width / 2

const ROTATE_CENTER_Y = 188
const ROTATE_SPEED = 0.55
const ROTATE_SWAY = 0.6
const BOB_AMPLITUDE = 12
const BOB_RATE = 2.2
const BOB_ROW_PHASE = 0.8

const SNAKE_STRAIGHT = 560
const SNAKE_RADIUS = 75
const SNAKE_CENTER_Y = 190
const SNAKE_RIPPLE = 32
const SNAKE_RIPPLES_PER_STRAIGHT = 2
const SNAKE_GAP = 50
const SNAKE_SPEED = 1.7
const SNAKE_LENGTH = 2 * SNAKE_STRAIGHT + 2 * Math.PI * SNAKE_RADIUS

/** Øverste kant for pinball-høns, så de ikke flyver ind i HUD'en. */
const PINBALL_TOP = 48
const PINBALL_BOTTOM = FIELD.height * 0.6
const PINBALL_SPEED = 1.5
/** Adskillelsen gentages et par gange, så tætte klynger også løses op i samme trin. */
const PINBALL_PASSES = 3

/** Løkke-dykkets fart i px/s; varigheden følger banens længde. */
export const LOOP_SPEED = 330
const LOOP_RADIUS = 60
/** Cirklens centrum ligger så langt indad fra slottet. */
const LOOP_CENTER_X = 50
/** Radius på buen hønen slår op og udad, før den dykker. */
const LOOP_PEEL_RADIUS = 28
const LOOP_TURNS = 1.5
const LOOP_MIN_DEPTH = 90
const LOOP_MAX_DEPTH = 280
const LOOP_CENTER_Y = 360
const LOOP_MAX_PER_GROUP = 3

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const quad = (a: number, b: number, c: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c
const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

const slot = (row: number, col: number, x: number, y: number): Slot => ({ row, col, x, y, group: 0, param: 0 })

type LayoutBuilder = (rows: number, cols: number, cx: number) => Slot[]

const grid: LayoutBuilder = (rows, cols, cx) => {
  const left = cx - ((cols - 1) * SPACING_X) / 2
  const slots: Slot[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) slots.push(slot(row, col, left + col * SPACING_X, TOP + row * SPACING_Y))
  }
  return slots
}

/** Spids nedad; armene er to til tre høns tykke og forskudt en halv kolonne pr. række. */
const vShape: LayoutBuilder = (rows, cols, cx) => {
  const thickness = cols >= 9 ? 3 : 2
  const slots: Slot[] = []
  for (let row = 0; row < rows; row++) {
    const base = (rows - 1 - row) * (SPACING_X / 2)
    const xs: number[] = []
    for (let arm = 0; arm < thickness; arm++) {
      const offset = base + arm * SPACING_X
      if (offset === 0) xs.push(cx)
      else xs.push(cx - offset, cx + offset)
    }
    xs.sort((a, b) => a - b).forEach((x, col) => slots.push(slot(row, col, x, TOP + row * SPACING_Y)))
  }
  return slots
}

const RING_SETS = [
  [{ radius: 128, count: 13 }, { radius: 76, count: 8 }],
  [{ radius: 136, count: 14 }, { radius: 90, count: 9 }, { radius: 44, count: 4 }],
]

/** Koncentriske ringe om rotationscentret; række = ringnummer, yderst først. */
const ring: LayoutBuilder = (rows, _cols, cx) => {
  const slots: Slot[] = []
  RING_SETS[rows >= 3 ? 1 : 0].forEach(({ radius, count }, row) => {
    const start = -Math.PI / 2 + (row % 2 === 1 ? Math.PI / count : 0)
    for (let i = 0; i < count; i++) {
      const angle = start + (i / count) * Math.PI * 2
      slots.push(slot(row, i, cx + Math.cos(angle) * radius, ROTATE_CENTER_Y + Math.sin(angle) * radius))
    }
  })
  return slots
}

const DIAMOND_SPACING = 48

/** Et kvadratisk gitter drejet 45°, så hele formen kan rotere inden for banens øvre del. */
const diamond: LayoutBuilder = (rows, _cols, cx) => {
  const size = rows >= 5 ? 5 : 4
  const diagonal = DIAMOND_SPACING * Math.SQRT1_2
  const slots: Slot[] = []
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) {
      const u = a - (size - 1) / 2
      const v = b - (size - 1) / 2
      slots.push(slot(Math.min(size - 1, Math.round((a + b) / 2)), a * size + b, cx + (u - v) * diagonal, ROTATE_CENTER_Y + (u + v) * diagonal))
    }
  }
  return slots
}

const FLANK_HALF_GAP = 130

const flanks: LayoutBuilder = (rows, cols, cx) => {
  const blockCols = clamp(Math.round(cols / 3), 2, 4)
  const usedRows = Math.min(rows, Math.floor(MAX_ENEMIES / (2 * blockCols)))
  const slots: Slot[] = []
  for (let row = 0; row < usedRows; row++) {
    for (let j = 0; j < blockCols; j++) {
      const y = TOP + row * SPACING_Y
      slots.push(slot(row, blockCols - 1 - j, cx - FLANK_HALF_GAP - j * SPACING_X, y))
      slots.push(slot(row, blockCols + j, cx + FLANK_HALF_GAP + j * SPACING_X, y))
    }
  }
  return slots
}

const COLUMN_SPACING = 128

const columns: LayoutBuilder = (rows, cols, cx) => {
  const count = Math.min(clamp(cols - 3, 4, 7), Math.floor(MAX_ENEMIES / rows))
  const slots: Slot[] = []
  for (let col = 0; col < count; col++) {
    for (let row = 0; row < rows; row++) slots.push(slot(row, col, cx + (col - (count - 1) / 2) * COLUMN_SPACING, TOP + row * SPACING_Y))
  }
  return slots
}

const CHECKER_SPACING_X = 52
const CHECKER_SPACING_Y = 44

/** Hvert andet felt i et gitter, så naboerne står på skrå som på et skakbræt. */
const checker: LayoutBuilder = (rows, cols, cx) => {
  const slots: Slot[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if ((row + col) % 2 === 0) slots.push(slot(row, col, cx + (col - (cols - 1) / 2) * CHECKER_SPACING_X, TOP + row * CHECKER_SPACING_Y))
    }
  }
  return slots
}

/** Pil nedad: et smalt skaft øverst og et trekantet hoved med spidsen mod spilleren. */
const arrow: LayoutBuilder = (rows, cols, cx) => {
  const headRows = clamp(rows - 1, 2, 4)
  const shaftRows = rows - headRows
  const extra = cols >= 9 ? 1 : 0
  const slots: Slot[] = []
  for (let row = 0; row < shaftRows; row++) {
    slots.push(slot(row, 0, cx - SPACING_X / 2, TOP + row * SPACING_Y), slot(row, 1, cx + SPACING_X / 2, TOP + row * SPACING_Y))
  }
  for (let j = 0; j < headRows; j++) {
    const count = 2 * (headRows - j) + 1 + 2 * extra
    for (let m = 0; m < count; m++) slots.push(slot(shaftRows + j, m, cx + (m - (count - 1) / 2) * SPACING_X, TOP + (shaftRows + j) * SPACING_Y))
  }
  return slots
}

const LAYOUTS: Record<WaveSpec['layout'], LayoutBuilder> = { grid, vShape, ring, diamond, flanks, columns, checker, arrow }

function assignGroups(slots: Slot[]): Slot[] {
  const order = slots.map((_, index) => index).sort((a, b) => slots[a].row - slots[b].row || slots[a].x - slots[b].x)
  let group = -1
  let run = 0
  let lastRow = -1
  for (const index of order) {
    if (slots[index].row !== lastRow || run === LOOP_MAX_PER_GROUP) {
      group++
      run = 0
      lastRow = slots[index].row
    }
    slots[index].group = group
    run++
  }
  return slots
}

/** Løbebanen: to vandrette bølgede stræk og to halvcirkler, målt som længde i pixels. */
function snakePoint(distance: number, out: Point): Point {
  const d = ((distance % SNAKE_LENGTH) + SNAKE_LENGTH) % SNAKE_LENGTH
  const halfStraight = SNAKE_STRAIGHT / 2
  const arc = Math.PI * SNAKE_RADIUS
  const ripple = (along: number) => SNAKE_RIPPLE * Math.sin((2 * Math.PI * SNAKE_RIPPLES_PER_STRAIGHT * along) / SNAKE_STRAIGHT)
  if (d < SNAKE_STRAIGHT) {
    out.x = CENTER_X - halfStraight + d
    out.y = SNAKE_CENTER_Y - SNAKE_RADIUS - ripple(d)
  } else if (d < SNAKE_STRAIGHT + arc) {
    const angle = -Math.PI / 2 + (d - SNAKE_STRAIGHT) / SNAKE_RADIUS
    out.x = CENTER_X + halfStraight + Math.cos(angle) * SNAKE_RADIUS
    out.y = SNAKE_CENTER_Y + Math.sin(angle) * SNAKE_RADIUS
  } else if (d < 2 * SNAKE_STRAIGHT + arc) {
    const along = d - SNAKE_STRAIGHT - arc
    out.x = CENTER_X + halfStraight - along
    out.y = SNAKE_CENTER_Y + SNAKE_RADIUS + ripple(along)
  } else {
    const angle = Math.PI / 2 + (d - 2 * SNAKE_STRAIGHT - arc) / SNAKE_RADIUS
    out.x = CENTER_X - halfStraight + Math.cos(angle) * SNAKE_RADIUS
    out.y = SNAKE_CENTER_Y + Math.sin(angle) * SNAKE_RADIUS
  }
  return out
}

function snakeSlots(spec: WaveSpec): Slot[] {
  const chains = spec.cols >= 9 ? 4 : 3
  const maxLength = Math.floor((SNAKE_LENGTH / chains - 90) / SNAKE_GAP) + 1
  const length = Math.min(clamp(spec.rows + 3, 6, 10), maxLength)
  const slots: Slot[] = []
  const point: Point = { x: 0, y: 0 }
  for (let chain = 0; chain < chains; chain++) {
    for (let i = 0; i < length; i++) {
      const param = (((chain * SNAKE_LENGTH) / chains - i * SNAKE_GAP) % SNAKE_LENGTH + SNAKE_LENGTH) % SNAKE_LENGTH
      snakePoint(param, point)
      slots.push({ row: Math.min(i, spec.rows - 1), col: chain, x: point.x, y: point.y, group: chain, param })
    }
  }
  return slots
}

/** Slot-generatoren for specens layout; slangebevægelsen bygger altid kæder og ignorerer layoutet. */
export function generateSlots(spec: WaveSpec, fieldWidth: number): Slot[] {
  if (spec.rows <= 0 || spec.cols <= 0) return []
  if (spec.motion === 'snake') return snakeSlots(spec)
  return assignGroups(LAYOUTS[spec.layout](spec.rows, spec.cols, fieldWidth / 2))
}

/** Gitterlignende bølger skyder med forreste høne pr. kolonne; ring, slange og pinball vælger frit blandt de levende. */
export function usesColumnFronts(spec: Pick<WaveSpec, 'motion'>): boolean {
  return spec.motion === 'sway' || spec.motion === 'bob' || spec.motion === 'loopers'
}

export const createFormationState = (): FormationState => ({ offsetX: 0, dir: 1, descent: 0, t: 0 })

/** Sætter slotfelterne og, for pinball, en seedet starthastighed. */
export function initMember(spec: WaveSpec, member: Member, from: Slot, index: number): void {
  member.slotX = from.x
  member.slotY = from.y
  member.slotRow = from.row
  member.slotGroup = from.group
  member.slotParam = from.param
  member.x = from.x
  member.y = from.y
  if (spec.motion !== 'pinball') return
  const rng = createRng((Math.imul(spec.wave + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0)
  const speed = spec.enemySpeed * PINBALL_SPEED
  const angle = 0.35 + rng() * 0.8
  member.vx = (rng() < 0.5 ? -1 : 1) * Math.cos(angle) * speed
  member.vy = (rng() < 0.5 ? -1 : 1) * Math.sin(angle) * speed
}

/** Hvor medlemmet skal være lige nu; indflyvningen og løkke-dyk peger på dette punkt. */
export function memberTarget(spec: WaveSpec, formation: FormationState, member: Member, out: Point): Point {
  switch (spec.motion) {
    case 'rotate': {
      const angle = ROTATE_SPEED * formation.t
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const dx = member.slotX - CENTER_X
      const dy = member.slotY - ROTATE_CENTER_Y
      out.x = CENTER_X + formation.offsetX + dx * cos - dy * sin
      out.y = ROTATE_CENTER_Y + formation.descent + dx * sin + dy * cos
      break
    }
    case 'bob':
      out.x = member.slotX + formation.offsetX
      out.y = member.slotY + formation.descent + BOB_AMPLITUDE * Math.sin(BOB_RATE * formation.t + member.slotRow * BOB_ROW_PHASE)
      break
    case 'snake':
      snakePoint(member.slotParam + spec.enemySpeed * SNAKE_SPEED * formation.t, out)
      break
    case 'pinball':
      out.x = member.slotX
      out.y = member.slotY
      break
    default:
      out.x = member.slotX + formation.offsetX
      out.y = member.slotY + formation.descent
  }
  return out
}

/** Ur, sidelæns glidning og nedrykning ved kanten. `members` er dem der tæller med i formationens bredde. */
export function advanceFormation(spec: WaveSpec, formation: FormationState, members: readonly Member[], dt: number): void {
  formation.t += dt
  if (spec.motion === 'snake' || spec.motion === 'pinball') return
  const rotating = spec.motion === 'rotate'
  formation.offsetX += formation.dir * spec.enemySpeed * (rotating ? ROTATE_SWAY : 1) * dt
  let minX = Infinity
  let maxX = -Infinity
  if (rotating) {
    let reach = -Infinity
    for (const member of members) reach = Math.max(reach, Math.hypot(member.slotX - CENTER_X, member.slotY - ROTATE_CENTER_Y) + member.radius)
    minX = CENTER_X + formation.offsetX - reach
    maxX = CENTER_X + formation.offsetX + reach
  } else {
    for (const member of members) {
      minX = Math.min(minX, member.slotX + formation.offsetX - member.radius)
      maxX = Math.max(maxX, member.slotX + formation.offsetX + member.radius)
    }
  }
  const margin = 12
  if ((formation.dir === -1 && minX < margin) || (formation.dir === 1 && maxX > FIELD.width - margin)) {
    formation.dir = formation.dir === 1 ? -1 : 1
    formation.descent += spec.descentStep
  }
}

/** Placerer et medlem i formationen; pinball-høns flyver frit og preller af mod kanterne. */
export function settleMember(spec: WaveSpec, member: Member, target: Point, dt: number): void {
  if (spec.motion !== 'pinball') {
    member.x = target.x
    member.y = target.y
    return
  }
  member.x += member.vx * dt
  member.y += member.vy * dt
  bounceInPinballBox(member)
}

/** Elastisk stød mellem pinball-høns, der overlapper: de skubbes fra hinanden og bytter fart langs stødlinjen. */
export function separatePinball(members: readonly Member[]): void {
  for (let pass = 0; pass < PINBALL_PASSES; pass++) {
    for (let i = 0; i < members.length; i++) separateFrom(members, i)
    for (const member of members) bounceInPinballBox(member)
  }
}

function separateFrom(members: readonly Member[], i: number): void {
  const a = members[i]
  for (let j = i + 1; j < members.length; j++) {
    const b = members[j]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const reach = a.radius + b.radius
    const distanceSq = dx * dx + dy * dy
    if (distanceSq >= reach * reach) continue
    const distance = Math.sqrt(distanceSq)
    const nx = distance > 0 ? dx / distance : 1
    const ny = distance > 0 ? dy / distance : 0
    const push = (reach - distance) / 2
    a.x -= nx * push
    a.y -= ny * push
    b.x += nx * push
    b.y += ny * push
    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
    if (closing >= 0) continue
    a.vx += closing * nx
    a.vy += closing * ny
    b.vx -= closing * nx
    b.vy -= closing * ny
  }
}

function bounceInPinballBox(member: Member): void {
  const minX = member.radius
  const maxX = FIELD.width - member.radius
  const minY = PINBALL_TOP + member.radius
  const maxY = PINBALL_BOTTOM - member.radius
  if (member.x < minX) {
    member.x = 2 * minX - member.x
    member.vx = Math.abs(member.vx)
  } else if (member.x > maxX) {
    member.x = 2 * maxX - member.x
    member.vx = -Math.abs(member.vx)
  }
  if (member.y < minY) {
    member.y = 2 * minY - member.y
    member.vy = Math.abs(member.vy)
  } else if (member.y > maxY) {
    member.y = 2 * maxY - member.y
    member.vy = -Math.abs(member.vy)
  }
}

const SIDES_ROW_GAP_SECONDS = 0.15
const SIDES_STAGGER_SECONDS = 0.045

function sidesPlan(from: Slot, index: number, fieldWidth: number): EntrancePlan {
  const fromLeft = from.row % 2 === 0
  const x = fromLeft ? -60 : fieldWidth + 60
  const y = 50 + from.row * 34
  // Knækpunktet spredes pr. række og kolonne, så store flokke ikke følger præcis samme bane.
  const bend = 0.52 + 0.05 * (from.col % 8)
  return {
    entry: 'quad',
    delay: index * SIDES_STAGGER_SECONDS + from.row * SIDES_ROW_GAP_SECONDS,
    duration: ENTER_SECONDS,
    x,
    y,
    p0x: x,
    p0y: y,
    p1x: fromLeft ? fieldWidth * bend : fieldWidth * (1 - bend),
    p1y: 280 + from.row * 30 + (from.col % 2) * 60,
  }
}

function topPlans(slots: Slot[]): EntrancePlan[] {
  const key = (x: number) => Math.round(x * 1000)
  const columnXs = [...new Set(slots.map((from) => key(from.x)))].sort((a, b) => a - b)
  return slots.map((from) => {
    const rank = columnXs.indexOf(key(from.x))
    const below = slots.filter((other) => key(other.x) === key(from.x) && other.y > from.y).length
    return {
      entry: 'quad',
      delay: rank * 0.11 + below * 0.07,
      duration: ENTER_SECONDS,
      x: from.x,
      y: -60,
      p0x: from.x,
      p0y: -60,
      p1x: from.x,
      p1y: from.y * 0.55,
    }
  })
}

const SPIRAL_SWIRL = 5.4

function spiralPlan(from: Slot, index: number, fieldWidth: number): EntrancePlan {
  const fromLeft = index % 2 === 0
  const startX = fromLeft ? -70 : fieldWidth + 70
  const startY = 30 + ((index * 53) % 180)
  const dx = startX - from.x
  const dy = startY - from.y
  return {
    entry: 'spiral',
    delay: index * 0.05,
    duration: ENTER_SECONDS * 1.25,
    x: startX,
    y: startY,
    p0x: Math.atan2(dy, dx),
    p0y: Math.hypot(dx, dy),
    p1x: fromLeft ? SPIRAL_SWIRL : -SPIRAL_SWIRL,
    p1y: 0,
  }
}

function splitPlan(from: Slot, fieldWidth: number): EntrancePlan {
  const fromLeft = from.x < fieldWidth / 2
  const x = fromLeft ? -60 : fieldWidth + 60
  const y = 90 + from.row * 20
  return {
    entry: 'quad',
    delay: (Math.abs(from.x - fieldWidth / 2) / SPACING_X) * 0.1 + from.row * 0.05,
    duration: ENTER_SECONDS,
    x,
    y,
    p0x: x,
    p0y: y,
    p1x: fromLeft ? fieldWidth * 0.3 : fieldWidth * 0.7,
    p1y: 300,
  }
}

/** Indflyvningsplan for hver slot; alle varianter ender præcis i slottet. */
export function planEntrances(spec: Pick<WaveSpec, 'entrance'>, slots: Slot[], fieldWidth: number): EntrancePlan[] {
  const entrance: FormationEntrance = spec.entrance
  switch (entrance) {
    case 'top':
      return topPlans(slots)
    case 'spiral':
      return slots.map((from, index) => spiralPlan(from, index, fieldWidth))
    case 'split':
      return slots.map((from) => splitPlan(from, fieldWidth))
    default:
      return slots.map((from, index) => sidesPlan(from, index, fieldWidth))
  }
}

export function applyEntrance(member: Member, plan: EntrancePlan): void {
  member.entry = plan.entry
  member.delay = plan.delay
  member.pathT = 0
  member.pathDuration = plan.duration
  member.x = plan.x
  member.y = plan.y
  member.p0x = plan.p0x
  member.p0y = plan.p0y
  member.p1x = plan.p1x
  member.p1y = plan.p1y
}

/** Efter et dyk kommer hønen ind igen oppefra og lander i slottet. */
export function planReentry(member: Member, target: Point): void {
  member.entry = 'quad'
  member.pathT = 0
  member.pathDuration = ENTER_SECONDS * 0.7
  member.p0x = member.x = target.x
  member.p0y = member.y = -50
  member.p1x = target.x
  member.p1y = target.y * 0.5
}

/** Position på indflyvningen ved `member.pathT`; slutter i målet også når det bevæger sig. */
export function entryPoint(member: Member, target: Point, out: Point): Point {
  const t = member.pathT
  if (member.entry === 'spiral') {
    const radius = member.p0y * Math.pow(1 - t, 1.3)
    const angle = member.p0x + member.p1x * t
    out.x = target.x + Math.cos(angle) * radius
    out.y = target.y + Math.sin(angle) * radius
  } else {
    out.x = quad(member.p0x, member.p1x, target.x, t)
    out.y = quad(member.p0y, member.p1y, target.y, t)
  }
  return out
}

/*
 * Galaga-loopet i slottets koordinater for side +1: hønen slår en bue op og udad, styrtdykker,
 * flyver halvanden omgang i en stor cirkel og stiger hjem nedefra. `depth` er cirklens centrum under slottet.
 */
const LOOP_LEFT = LOOP_CENTER_X - LOOP_RADIUS
const LOOP_RIGHT = LOOP_CENTER_X + LOOP_RADIUS
const LOOP_PEEL_LENGTH = Math.PI * LOOP_PEEL_RADIUS
const LOOP_CIRCLE_LENGTH = LOOP_TURNS * 2 * Math.PI * LOOP_RADIUS

type LoopCurve = (depth: number, t: number, out: Point) => void

const loopDive: LoopCurve = (depth, t, out) => {
  out.x = cubic(-2 * LOOP_PEEL_RADIUS, -2 * LOOP_PEEL_RADIUS, LOOP_LEFT, LOOP_LEFT, t)
  out.y = cubic(0, depth * 0.4, depth * 0.6, depth, t)
}

const loopReturn: LoopCurve = (depth, t, out) => {
  out.x = cubic(LOOP_RIGHT, LOOP_RIGHT, 0, 0, t)
  out.y = cubic(depth, depth * 0.5, depth * 0.5, 0, t)
}

const curveScratch: Point = { x: 0, y: 0 }
const ARC_SAMPLES = 32

/** Fylder `table` med kurvens akkumulerede længde i ARC_SAMPLES lige store parameter-trin og returnerer længden. */
function measureCurve(curve: LoopCurve, depth: number, table: Float64Array): number {
  curve(depth, 0, curveScratch)
  let px = curveScratch.x
  let py = curveScratch.y
  table[0] = 0
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    curve(depth, i / ARC_SAMPLES, curveScratch)
    table[i] = table[i - 1] + Math.hypot(curveScratch.x - px, curveScratch.y - py)
    px = curveScratch.x
    py = curveScratch.y
  }
  return table[ARC_SAMPLES]
}

/** Kurveparameteren der ligger `distance` inde ad kurven, så hønen holder jævn fart. */
function paramAt(table: Float64Array, distance: number): number {
  let i = 1
  while (i < ARC_SAMPLES && table[i] < distance) i++
  const span = table[i] - table[i - 1]
  return (i - 1 + (span > 0 ? (distance - table[i - 1]) / span : 0)) / ARC_SAMPLES
}

const loopLengths = {
  depth: NaN,
  dive: 0,
  ret: 0,
  total: 0,
  diveTable: new Float64Array(ARC_SAMPLES + 1),
  returnTable: new Float64Array(ARC_SAMPLES + 1),
}

function lengthsFor(depth: number): typeof loopLengths {
  if (loopLengths.depth !== depth) {
    loopLengths.depth = depth
    loopLengths.dive = measureCurve(loopDive, depth, loopLengths.diveTable)
    loopLengths.ret = measureCurve(loopReturn, depth, loopLengths.returnTable)
    loopLengths.total = LOOP_PEEL_LENGTH + loopLengths.dive + LOOP_CIRCLE_LENGTH + loopLengths.ret
  }
  return loopLengths
}

/** Andel af loopet hvor hønen første gang er i bunden af cirklen og taber sit æg. */
export function loopEggAt(depth: number): number {
  const lengths = lengthsFor(depth)
  return (LOOP_PEEL_LENGTH + lengths.dive + (Math.PI / 2) * LOOP_RADIUS) / lengths.total
}

/** Forskydning fra slottet gennem loopet ved andel `tau` (jævn fart). `side` er ±1 (indad). */
export function loopOffset(side: number, depth: number, tau: number, out: Point): Point {
  const lengths = lengthsFor(depth)
  let distance = clamp(tau, 0, 1) * lengths.total
  if (distance < LOOP_PEEL_LENGTH) {
    const angle = distance / LOOP_PEEL_RADIUS
    out.x = LOOP_PEEL_RADIUS * (Math.cos(angle) - 1)
    out.y = -LOOP_PEEL_RADIUS * Math.sin(angle)
  } else if ((distance -= LOOP_PEEL_LENGTH) < lengths.dive) {
    loopDive(depth, paramAt(lengths.diveTable, distance), out)
  } else if ((distance -= lengths.dive) < LOOP_CIRCLE_LENGTH) {
    const angle = Math.PI - distance / LOOP_RADIUS
    out.x = LOOP_CENTER_X + LOOP_RADIUS * Math.cos(angle)
    out.y = depth + LOOP_RADIUS * Math.sin(angle)
  } else {
    loopReturn(depth, paramAt(lengths.returnTable, distance - LOOP_CIRCLE_LENGTH), out)
  }
  out.x *= side
  return out
}

/** Tilfældig loop-gruppe blandt de ledige høns: de levende naboer med samme gruppenummer. */
export function pickLoopGroup<T extends Member>(candidates: readonly T[], rng: Rng): T[] {
  if (candidates.length === 0) return []
  const pick = candidates[Math.floor(rng() * candidates.length)]
  return candidates.filter((member) => member.slotGroup === pick.slotGroup).sort((a, b) => a.slotX - b.slotX)
}

/** Gemmer siden i p0x, dybden i p0y og ægge-øjeblikket i p1x, mens loopet kører. */
export function startLoop(member: Member, target: Point, stagger: number): void {
  member.pathT = 0
  member.delay = stagger
  member.p0x = target.x < CENTER_X ? 1 : -1
  member.p0y = clamp(LOOP_CENTER_Y - target.y, LOOP_MIN_DEPTH, LOOP_MAX_DEPTH)
  member.p1x = loopEggAt(member.p0y)
  member.pathDuration = lengthsFor(member.p0y).total / LOOP_SPEED
}

const loopScratch: Point = { x: 0, y: 0 }

/** Flytter hønen ét trin gennem loopet; true i det trin hvor den passerer bunden og skal tabe et æg. */
export function stepLoop(member: Member, target: Point, dt: number): boolean {
  const before = member.pathT
  member.pathT = Math.min(1, before + dt / member.pathDuration)
  loopOffset(member.p0x, member.p0y, member.pathT, loopScratch)
  member.x = clamp(target.x + loopScratch.x, member.radius, FIELD.width - member.radius)
  member.y = target.y + loopScratch.y
  return before < member.p1x && member.pathT >= member.p1x
}
