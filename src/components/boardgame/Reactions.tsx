import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Smiley } from '@phosphor-icons/react'
import { MULTIPLAYER_REACTION_EMOJIS, type MultiplayerReactionEmoji } from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'
import type { ReactionPop } from './useReactionPops'

export type ReactionLabels = MultiplayerLabels['match']['react']

/** The emoji floating up over the table: one small element each, moved with transform and opacity only. */
export function ReactionLayer({ pops }: { pops: readonly ReactionPop[] }) {
  return (
    <div className="bgr-react-layer" aria-hidden="true">
      {pops.map(pop => (
        <span
          key={pop.key}
          className="bgr-react-pop"
          data-emoji={pop.emoji}
          data-from={pop.own ? 'me' : 'opponent'}
          style={{ '--dx': `${pop.dx}rem`, '--delay': `${pop.delay}s` } as CSSProperties}
        >
          {pop.emoji}
        </span>
      ))}
    </div>
  )
}

interface ReactionCallProps {
  labels: ReactionLabels
  /** True during the cooldown after a reaction; the tray opens but its buttons wait. */
  cooling: boolean
  onPick: (emoji: MultiplayerReactionEmoji) => void
}

/** The smiley button that opens a small tray with the fixed emoji. Escape closes it (data-own-escape keeps it from leaving the game). */
export function ReactionCall({ labels, cooling, onPick }: ReactionCallProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [open])

  const handleKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      button.current?.focus()
      return
    }
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 } as Record<string, number>)[event.key]
    if (step === undefined) return
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.bgr-react-tray__item') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    event.preventDefault()
    items[(at + step + items.length) % items.length]?.focus()
  }

  return (
    <div className="bgr-react-call" ref={ref} data-own-escape={open ? '' : undefined} onKeyDown={handleKey}>
      <button
        ref={button}
        type="button"
        className="bgr-chip"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={labels.hint}
        title={labels.hint}
        data-cooling={cooling ? '' : undefined}
        onClick={() => setOpen(value => !value)}
      >
        <Smiley size={17} weight="fill" aria-hidden="true" />
        <span className="bgr-react-call__label">{labels.button}</span>
      </button>
      {open && (
        <div className="bgr-react-tray" role="group" aria-label={labels.tray}>
          {MULTIPLAYER_REACTION_EMOJIS.map((emoji, index) => (
            <button
              key={emoji}
              type="button"
              className="bgr-react-tray__item"
              aria-label={labels.names[index]}
              title={labels.names[index]}
              data-emoji={emoji}
              disabled={cooling}
              autoFocus={index === 0}
              onClick={() => { setOpen(false); button.current?.focus(); onPick(emoji) }}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
