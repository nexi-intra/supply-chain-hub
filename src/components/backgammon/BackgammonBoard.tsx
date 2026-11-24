import { memo, useMemo, type KeyboardEvent, type ReactElement } from 'react'
import type { BackgammonStep } from '@/lib/multiplayer'
import { ownCount, pointPlace, type BgColor, type BgPosition } from '@/lib/backgammon'
import type { BackgammonLabels } from '@/lib/backgammonLabels'

// Board geometry in SVG units: two fields of six points with the bar between them and the bear-off trays on the right.
const W = 1000
const H = 720
const FIELD_TOP = 40
const FIELD_BOTTOM = 680
const POINT_W = 400 / 6
const LEFT_X = 40
const RIGHT_X = 520
const BAR_X = 440
const BAR_W = 80
const TRAY_X = 930
const POINT_LEN = 280
const R = 30

const columnX = (column: number) => (column < 6 ? LEFT_X : RIGHT_X) + (column % 6) * POINT_W + POINT_W / 2

/** Centre of the n-th checker (0 = against the edge) of a stack of `size` on a point. */
function stackY(row: 'top' | 'bottom', index: number, size: number) {
  const gap = size > 5 ? Math.min(2 * R - 2, (POINT_LEN - 2 * R) / (size - 1)) : 2 * R - 2
  return row === 'bottom' ? FIELD_BOTTOM - R - index * gap : FIELD_TOP + R + index * gap
}

export interface BackgammonBoardProps {
  position: BgPosition
  me: BgColor
  /** Dice of the player on turn; `used` are spent by the staged moves. */
  dice: number[]
  usedDice: number[]
  diceKey: string
  /** Moves the player may make next (empty when it is not their turn). */
  options: BackgammonStep[]
  selected: number | 'bar' | null
  onSelect: (from: number | 'bar' | null) => void
  onMove: (step: BackgammonStep) => void
  /** Points the last turn touched, for a faint marker. */
  lastFrom: Array<number | 'bar'>
  lastTo: Array<number | 'off'>
  labels: BackgammonLabels
}

export const BackgammonBoard = memo(function BackgammonBoard({
  position, me, dice, usedDice, diceKey, options, selected, onSelect, onMove, lastFrom, lastTo, labels,
}: BackgammonBoardProps) {
  const them: BgColor = me === 'white' ? 'black' : 'white'
  const sources = useMemo(() => new Set(options.map(step => step.from)), [options])
  const targets = useMemo(() => {
    const map = new Map<number | 'off', BackgammonStep>()
    for (const step of options) {
      if (step.from !== selected) continue
      const known = map.get(step.to)
      // bearing off with either die: spend the smaller one
      if (!known || step.die < known.die) map.set(step.to, step)
    }
    return map
  }, [options, selected])

  const owner = (point: number): BgColor | null => (position.points[point - 1] > 0 ? 'white' : position.points[point - 1] < 0 ? 'black' : null)
  const pick = (from: number | 'bar') => {
    if (selected === from) onSelect(null)
    else if (sources.has(from)) onSelect(from)
  }
  const activate = (point: number) => {
    const target = targets.get(point)
    if (target) onMove(target)
    else pick(point)
  }
  const key = (handler: () => void) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handler()
  }

  const points: ReactElement[] = []
  for (let point = 1; point <= 24; point++) {
    const { row, column } = pointPlace(point, me)
    const x = columnX(column)
    const base = row === 'bottom' ? FIELD_BOTTOM : FIELD_TOP
    const tip = row === 'bottom' ? FIELD_BOTTOM - POINT_LEN : FIELD_TOP + POINT_LEN
    const color = owner(point)
    const count = color ? ownCount(position.points, color, point) : 0
    const isSource = sources.has(point)
    const isTarget = targets.has(point)
    const shown = Math.min(count, 6)
    const number = me === 'white' ? point : 25 - point
    points.push(
      <g
        key={point}
        className="bgm-point"
        role="button"
        tabIndex={isSource || isTarget ? 0 : -1}
        aria-label={labels.point(number, count, color ? labels.colors[color] : null)}
        data-source={isSource ? '' : undefined}
        data-target={isTarget ? '' : undefined}
        data-selected={selected === point ? '' : undefined}
        onClick={() => activate(point)}
        onKeyDown={key(() => activate(point))}
      >
        <polygon
          className="bgm-triangle"
          data-shade={column % 2 === 0 ? 'dark' : 'light'}
          points={`${x - POINT_W / 2 + 3},${base} ${x + POINT_W / 2 - 3},${base} ${x},${tip}`}
        />
        <rect className="bgm-hit" x={x - POINT_W / 2} y={row === 'bottom' ? tip : base} width={POINT_W} height={POINT_LEN} />
        {(lastFrom.includes(point) || lastTo.includes(point)) && <circle className="bgm-last" cx={x} cy={row === 'bottom' ? base - 8 : base + 8} r={6} />}
        {[...Array(shown).keys()].map(index => (
          <g key={index} className="bgm-checker" data-color={color ?? undefined} transform={`translate(${x} ${stackY(row, index, shown)})`}>
            <circle r={R} />
            <circle className="bgm-checker__ring" r={R * 0.62} />
          </g>
        ))}
        {count > 6 && <text className="bgm-count" x={x} y={stackY(row, 5, shown) + 9}>{count}</text>}
        {isTarget && <circle className="bgm-target" cx={x} cy={stackY(row, Math.min(count, 5), Math.max(shown, 1))} r={R * 0.55} />}
        <text className="bgm-number" x={x} y={row === 'bottom' ? FIELD_BOTTOM + 28 : FIELD_TOP - 12}>{number}</text>
      </g>,
    )
  }

  // the bar: my checkers on my half (bottom), theirs on top
  const barStack = (color: BgColor) => {
    const count = position.bar[color]
    const mine = color === me
    return [...Array(Math.min(count, 4)).keys()].map(index => (
      <g key={`${color}-${index}`} className="bgm-checker" data-color={color} transform={`translate(${BAR_X + BAR_W / 2} ${mine ? H / 2 + 70 + index * 50 : H / 2 - 70 - index * 50})`}>
        <circle r={R} />
        <circle className="bgm-checker__ring" r={R * 0.62} />
      </g>
    )).concat(count > 4 ? [<text key={`${color}-n`} className="bgm-count" x={BAR_X + BAR_W / 2} y={mine ? H / 2 + 70 + 3 * 50 + 9 : H / 2 - 70 - 3 * 50 + 9}>{count}</text>] : [])
  }

  const offStack = (color: BgColor) => {
    const count = position.off[color]
    const mine = color === me
    return [...Array(count).keys()].map(index => (
      <rect
        key={`${color}-${index}`}
        className="bgm-slab"
        data-color={color}
        x={TRAY_X + 6}
        y={mine ? FIELD_BOTTOM - 14 - index * 17 : FIELD_TOP + 2 + index * 17}
        width={48}
        height={12}
        rx={3}
      />
    ))
  }

  const offTarget = targets.get('off')
  const diceList = dice.length === 2 && dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice
  const spent = [...usedDice]
  const dieFaces = diceList.map(value => {
    const index = spent.indexOf(value)
    if (index >= 0) spent.splice(index, 1)
    return { value, used: index >= 0 }
  })

  return (
    <svg className="bgm-board" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={labels.boardLabel} data-me={me}>
      <defs>
        <radialGradient id="bgm-white" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.7" stopColor="#ecdcbc" />
          <stop offset="1" stopColor="#c9b28a" />
        </radialGradient>
        <radialGradient id="bgm-black" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#6b4a3c" />
          <stop offset="0.6" stopColor="#2b1913" />
          <stop offset="1" stopColor="#120905" />
        </radialGradient>
      </defs>
      <rect className="bgm-frame" x={0} y={0} width={W} height={H} rx={22} />
      <rect className="bgm-field" x={LEFT_X} y={FIELD_TOP} width={400} height={FIELD_BOTTOM - FIELD_TOP} />
      <rect className="bgm-field" x={RIGHT_X} y={FIELD_TOP} width={400} height={FIELD_BOTTOM - FIELD_TOP} />
      <rect className="bgm-bar" x={BAR_X} y={FIELD_TOP - 10} width={BAR_W} height={FIELD_BOTTOM - FIELD_TOP + 20} />
      <rect className="bgm-tray" x={TRAY_X} y={FIELD_TOP} width={60} height={(FIELD_BOTTOM - FIELD_TOP) / 2 - 10} rx={6} />
      <rect className="bgm-tray" x={TRAY_X} y={H / 2 + 10} width={60} height={(FIELD_BOTTOM - FIELD_TOP) / 2 - 10} rx={6} />
      {points}
      <g
        className="bgm-barzone"
        role="button"
        tabIndex={sources.has('bar') ? 0 : -1}
        aria-label={`${labels.bar}: ${position.bar[me]}`}
        data-source={sources.has('bar') ? '' : undefined}
        data-selected={selected === 'bar' ? '' : undefined}
        onClick={() => pick('bar')}
        onKeyDown={key(() => pick('bar'))}
      >
        <rect className="bgm-hit" x={BAR_X} y={H / 2} width={BAR_W} height={FIELD_BOTTOM - H / 2} />
        {barStack(me)}
      </g>
      {barStack(them)}
      <g
        className="bgm-offzone"
        role="button"
        tabIndex={offTarget ? 0 : -1}
        aria-label={offTarget ? labels.takeOff : `${labels.off}: ${position.off[me]}`}
        data-target={offTarget ? '' : undefined}
        onClick={() => { if (offTarget) onMove(offTarget) }}
        onKeyDown={key(() => { if (offTarget) onMove(offTarget) })}
      >
        <rect className="bgm-hit" x={TRAY_X} y={H / 2 + 10} width={60} height={(FIELD_BOTTOM - FIELD_TOP) / 2 - 10} />
        {offStack(me)}
      </g>
      {offStack(them)}
      <g className="bgm-dice" key={diceKey}>
        {dieFaces.map((face, index) => (
          <Die key={index} value={face.value} used={face.used} x={720 + (index - (dieFaces.length - 1) / 2) * 74} y={H / 2} />
        ))}
      </g>
    </svg>
  )
})

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
}

function Die({ value, used, x, y }: { value: number; used: boolean; x: number; y: number }) {
  return (
    <g className="bgm-die" data-used={used ? '' : undefined} transform={`translate(${x} ${y})`}>
      <rect x={-28} y={-28} width={56} height={56} rx={10} />
      {(PIPS[value] ?? []).map(([dx, dy], index) => <circle key={index} cx={dx * 14} cy={dy * 14} r={5.5} />)}
    </g>
  )
}
