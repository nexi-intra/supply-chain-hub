import type { BackgammonLabels } from '@/lib/backgammonLabels'
import { BackgammonBoard } from './BackgammonBoard'

const NOTHING = () => {}

// The starting position, as the lobby marquee and the hub tile show it.
const START_POINTS = (() => {
  const points = new Array(24).fill(0)
  for (const [point, count] of [[24, 2], [13, 5], [8, 3], [6, 5]]) {
    points[point - 1] = count
    points[24 - point] = -count
  }
  return points
})()
const START = { points: START_POINTS, bar: { white: 0, black: 0 }, off: { white: 0, black: 0 } }

/** A still board in the starting position with a roll on it. */
export function BackgammonStill({ labels }: { labels: BackgammonLabels }) {
  return (
    <BackgammonBoard
      position={START}
      me="white"
      dice={[5, 3]}
      usedDice={[]}
      diceKey="still"
      options={[]}
      selected={null}
      onSelect={NOTHING}
      onMove={NOTHING}
      lastFrom={[]}
      lastTo={[]}
      labels={labels}
    />
  )
}
