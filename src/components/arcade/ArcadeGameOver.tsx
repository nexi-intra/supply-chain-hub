import { useEffect, useState } from 'react'
import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { countUpValue, type ArcadeLabels } from './arcadeCabinet'
import './arcadeCabinet.css'

const COUNT_UP_MS = 900

export interface ArcadeStat {
  label: string
  value: string
}

/** Lægges oven på spillefladen; spillet selv sørger for "spil igen" med tastaturet via useGameOverRetry. */
export function ArcadeGameOver({
  labels,
  score,
  formatScore,
  isNewRecord,
  stats,
  onRetry,
  onMenu,
  reducedMotion,
}: {
  labels: ArcadeLabels
  score: number
  formatScore: (score: number) => string
  isNewRecord: boolean
  stats: ArcadeStat[]
  onRetry: () => void
  onMenu: () => void
  reducedMotion: boolean
}) {
  const [shown, setShown] = useState(reducedMotion ? score : 0)

  useEffect(() => {
    if (reducedMotion) {
      setShown(score)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const value = countUpValue(score, now - start, COUNT_UP_MS)
      setShown(value)
      if (value < score) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [score, reducedMotion])

  return (
    <div className="arcade-over">
      <div className="arcade-over__card">
        <h2 className="arcade-over__title">{labels.gameOver}</h2>
        <p className="arcade-over__label">{labels.finalScore}</p>
        <div className="arcade-over__score" aria-hidden="true">{formatScore(shown)}</div>
        <p className="sr-only" role="status">{`${labels.gameOver}. ${labels.finalScore}: ${formatScore(score)}${isNewRecord ? `. ${labels.newRecord}` : ''}`}</p>
        {isNewRecord && <div className="arcade-over__record" aria-hidden="true">{labels.newRecord}</div>}
        <dl className="arcade-over__stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className="arcade-over__actions">
          <button type="button" className="arcade-cabinet__start" onClick={onRetry}>
            <ArrowCounterClockwise size={20} weight="bold" aria-hidden="true" />
            {labels.playAgain}
          </button>
          <button type="button" className="arcade-over__secondary" onClick={onMenu}>{labels.backToMenu}</button>
        </div>
        <p className="arcade-over__hint">{labels.retryHint}</p>
      </div>
    </div>
  )
}
