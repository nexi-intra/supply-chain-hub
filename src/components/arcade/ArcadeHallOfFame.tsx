import { useEffect, useRef, useState } from 'react'
import type { CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'
import { hallOfFameRows, radioKeyTarget, type ArcadeDifficulty, type ArcadeLabels, type HallOfFameRow } from './arcadeCabinet'
import './arcadeCabinet.css'

export function ArcadeHallOfFame({
  theme,
  labels,
  boards,
  difficulties,
  difficulty,
  userEmail,
  formatScore,
}: {
  theme: string
  labels: ArcadeLabels
  boards: Record<ArcadeDifficulty, CrossTeamEntry[]>
  difficulties: ArcadeDifficulty[]
  difficulty: ArcadeDifficulty
  userEmail: string | undefined
  formatScore: (score: number) => string
}) {
  const [tab, setTab] = useState(difficulty)
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  useEffect(() => setTab(difficulty), [difficulty])

  const { top, own } = hallOfFameRows(boards[tab] ?? [], userEmail)
  const selectedIndex = Math.max(0, difficulties.indexOf(tab))

  const row = (entry: HallOfFameRow) => (
    <li key={`${entry.teamCode ?? 'own'}-${entry.id}-${entry.rank}`} className="arcade-fame__row" data-rank={entry.rank} data-me={entry.isCurrentUser ? '' : undefined}>
      <span className="arcade-fame__rank" aria-label={labels.rank(entry.rank)}>{entry.rank}</span>
      <span className="arcade-fame__name">
        {entry.displayName}
        {entry.teamCode && <span className="arcade-fame__team">{entry.teamCode}</span>}
        {entry.isCurrentUser && <span className="arcade-fame__you">({labels.you})</span>}
      </span>
      <span className="arcade-fame__score">{formatScore(entry.score)}</span>
    </li>
  )

  return (
    <section className="arcade-fame" data-arcade-theme={theme} aria-labelledby="arcade-fame-title">
      <div className="arcade-fame__head">
        <h2 id="arcade-fame-title" className="arcade-fame__title">{labels.highscores}</h2>
        <span className="arcade-fame__hint">{labels.highscoresHint}</span>
      </div>
      <div className="arcade-fame__tabs" role="tablist" aria-labelledby="arcade-fame-title">
        {difficulties.map((id, index) => (
          <button
            key={id}
            ref={(node) => { tabs.current[index] = node }}
            type="button"
            role="tab"
            id={`arcade-fame-tab-${id}`}
            aria-selected={id === tab}
            aria-controls="arcade-fame-panel"
            tabIndex={index === selectedIndex ? 0 : -1}
            className="arcade-fame__tab"
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const target = radioKeyTarget(index, event.key, difficulties.length)
              if (target === null) return
              event.preventDefault()
              setTab(difficulties[target])
              tabs.current[target]?.focus()
            }}
          >
            {labels.difficulties[id]}
          </button>
        ))}
      </div>
      <div id="arcade-fame-panel" role="tabpanel" aria-labelledby={`arcade-fame-tab-${tab}`}>
        {top.length === 0 ? (
          <p className="arcade-fame__empty">{labels.noScoresYet}</p>
        ) : (
          <ol className="arcade-fame__list">
            {top.map(row)}
            {own && (
              <>
                <li className="arcade-fame__gap" aria-hidden="true">…</li>
                {row(own)}
              </>
            )}
          </ol>
        )}
      </div>
    </section>
  )
}
