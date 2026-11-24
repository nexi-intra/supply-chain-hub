import { useRef, type ReactNode } from 'react'
import { Play, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { radioKeyTarget, type ArcadeDifficulty, type ArcadeLabels } from './arcadeCabinet'
import './arcadeCabinet.css'

export interface ArcadeDifficultyOption {
  id: ArcadeDifficulty
  detail: string
}

export interface ArcadeControl {
  keys: string[]
  label: string
}

const LEVEL: Record<ArcadeDifficulty, number> = { easy: 1, medium: 2, hard: 3, expert: 4 }

export function ArcadeSoundToggle({ enabled, onToggle, labels }: { enabled: boolean; onToggle: () => void; labels: ArcadeLabels }) {
  const Icon = enabled ? SpeakerHigh : SpeakerSlash
  return (
    <button type="button" className="arcade-sound" aria-pressed={enabled} aria-label={labels.sound} onClick={onToggle}>
      <Icon size={16} weight="fill" aria-hidden="true" />
      {enabled ? labels.soundOn : labels.soundOff}
    </button>
  )
}

export function ArcadeDifficultyPicker({
  options,
  value,
  onChange,
  labels,
}: {
  options: ArcadeDifficultyOption[]
  value: ArcadeDifficulty
  onChange: (value: ArcadeDifficulty) => void
  labels: ArcadeLabels
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value))

  return (
    <div>
      <div id="arcade-difficulty-legend" className="arcade-cabinet__legend">{labels.difficulty}</div>
      <div className="arcade-cabinet__difficulties" role="radiogroup" aria-labelledby="arcade-difficulty-legend">
        {options.map((option, index) => (
          <button
            key={option.id}
            ref={(node) => { buttons.current[index] = node }}
            type="button"
            role="radio"
            aria-checked={option.id === value}
            tabIndex={index === selectedIndex ? 0 : -1}
            className="arcade-cabinet__difficulty"
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => {
              const target = radioKeyTarget(index, event.key, options.length)
              if (target === null) return
              event.preventDefault()
              onChange(options[target].id)
              buttons.current[target]?.focus()
            }}
          >
            <span className="arcade-cabinet__pips" aria-hidden="true">
              {[1, 2, 3, 4].map((pip) => <span key={pip} className="arcade-cabinet__pip" data-on={pip <= LEVEL[option.id] ? '' : undefined} />)}
            </span>
            <span className="arcade-cabinet__difficulty-name">{labels.difficulties[option.id]}</span>
            <span className="arcade-cabinet__difficulty-detail">{option.detail}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ArcadeCabinetMenu({
  theme,
  title,
  tagline,
  marquee,
  labels,
  personalBest,
  topScore,
  difficulties,
  difficulty,
  onDifficultyChange,
  controls,
  onStart,
  soundEnabled,
  onSoundToggle,
}: {
  theme: string
  title: string
  tagline: string
  marquee: ReactNode
  labels: ArcadeLabels
  personalBest: string | null
  topScore: { value: string; holder: string } | null
  difficulties: ArcadeDifficultyOption[]
  difficulty: ArcadeDifficulty
  onDifficultyChange: (value: ArcadeDifficulty) => void
  controls: ArcadeControl[]
  onStart: () => void
  soundEnabled: boolean
  onSoundToggle: () => void
}) {
  return (
    <section className="arcade-cabinet" data-arcade-theme={theme} aria-labelledby="arcade-cabinet-title">
      <div className="arcade-cabinet__marquee">
        <div className="arcade-cabinet__marquee-art" aria-hidden="true">{marquee}</div>
        <ArcadeSoundToggle enabled={soundEnabled} onToggle={onSoundToggle} labels={labels} />
        <div className="arcade-cabinet__marquee-inner">
          <div>
            <h1 id="arcade-cabinet-title" className="arcade-cabinet__title">{title}</h1>
            <p className="arcade-cabinet__tagline">{tagline}</p>
          </div>
          <dl className="arcade-cabinet__scores">
            <div>
              <dt>{labels.personalBest}</dt>
              <dd data-empty={personalBest === null ? '' : undefined}>{personalBest ?? labels.noneYet}</dd>
            </div>
            <div>
              <dt>{labels.topScore}</dt>
              {topScore ? (
                <dd>
                  {topScore.value}
                  <small>{topScore.holder}</small>
                </dd>
              ) : (
                <dd data-empty="">{labels.noneYet}</dd>
              )}
            </div>
          </dl>
        </div>
      </div>

      <div className="arcade-cabinet__panel">
        <ArcadeDifficultyPicker options={difficulties} value={difficulty} onChange={onDifficultyChange} labels={labels} />
        <div className="arcade-cabinet__footer">
          <ul className="arcade-cabinet__controls" aria-label={labels.controls}>
            {controls.map((control) => (
              <li key={control.label}>
                {control.keys.map((key) => <kbd key={key} className="arcade-kbd">{key}</kbd>)}
                <span>{control.label}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="arcade-cabinet__start" onClick={onStart}>
            <Play size={20} weight="fill" aria-hidden="true" />
            {labels.start}
          </button>
        </div>
      </div>
    </section>
  )
}
