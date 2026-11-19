import type { ReactNode } from 'react'

// Paper objects that lie on the board-game table. A game composes its panels from these so every game
// in the room shares the same score pad, index cards, notebook and fold-out cards.

interface PaperProps {
  /** Heading on the paper; also its accessible name unless `label` is given. */
  title?: ReactNode
  label?: string
  /** A coloured ring: something waits for the player, or the game is won. */
  tone?: 'attention' | 'win'
  className?: string
  children?: ReactNode
}

function Paper({ variant, title, label, tone, className = '', children, role }: PaperProps & { variant: string; role?: string }) {
  return (
    <section className={`bgr-paper ${variant} ${className}`.trim()} data-tone={tone} aria-label={label} role={role}>
      {title && <h2 className="bgr-paper__title">{title}</h2>}
      {children}
    </section>
  )
}

/** A plain sheet of paper. */
export function PaperNote(props: PaperProps & { role?: string }) {
  return <Paper variant="bgr-paper--note" {...props} />
}

/** A note taped to the table, for results and announcements. */
export function TapedNote(props: PaperProps & { role?: string }) {
  return <Paper variant="bgr-paper--taped" {...props} />
}

/** Ruled paper with a red margin under a brass clip: players and scores. */
export function ScorePad(props: PaperProps) {
  return <Paper variant="bgr-paper--scorepad" {...props} />
}

/** An index card with a red rule under its heading: the move being made, a short list. */
export function IndexCard(props: PaperProps) {
  return <Paper variant="bgr-paper--index" {...props} />
}

/** A leather notebook lying open; it stretches to fill the rest of the panel column. */
export function NotebookPanel(props: PaperProps) {
  return <Paper variant="bgr-paper--notebook" {...props} />
}

/** A card that folds open, with an optional count beside its heading. */
export function FoldedCard({ title, count, className = '', children }: { title: ReactNode; count?: number; className?: string; children?: ReactNode }) {
  return (
    <details className={`bgr-paper bgr-fold ${className}`.trim()}>
      <summary>
        {title}
        {count !== undefined && <span className="bgr-fold__count">{count}</span>}
      </summary>
      {children}
    </details>
  )
}
