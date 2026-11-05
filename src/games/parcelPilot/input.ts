/**
 * Fordeler tryk på motorens faste trin i dette billede efter hvornår de skete.
 * Hvert tryk får sit eget trin, så to hurtige tryk under et hak stadig giver to løft;
 * tryk der ikke kan nås i dette billede gemmes til næste.
 */
export function scheduleLifts(pressTimes: number[], frameStart: number, frameEnd: number, steps: number): { lifts: boolean[]; remaining: number[] } {
  const lifts = new Array<boolean>(steps).fill(false)
  const span = Math.max(1e-6, frameEnd - frameStart)
  let previous = -1
  for (let i = 0; i < pressTimes.length; i++) {
    const ideal = Math.min(steps - 1, Math.max(0, Math.floor(((pressTimes[i] - frameStart) / span) * steps)))
    const step = Math.max(ideal, previous + 1)
    if (step >= steps) return { lifts, remaining: pressTimes.slice(i) }
    lifts[step] = true
    previous = step
  }
  return { lifts, remaining: [] }
}
