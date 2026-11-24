import { useCallback, useEffect, useRef, useState } from 'react'
import type { MultiplayerReaction, MultiplayerReactionEmoji, MultiplayerSeat } from '@/lib/multiplayer'
import { loadSeenReactions, saveSeenReactions, unseenReactions, withSeenReactions } from '@/lib/multiplayerReactions'

export interface ReactionPop {
  key: string
  emoji: MultiplayerReactionEmoji
  /** Horizontal offset from the middle of the room, in rem. */
  dx: number
  /** Seconds to wait before the pop starts, so several in a row do not sit on top of each other. */
  delay: number
  own: boolean
}

/** Mirrors the animation length in boardgame.css (bgr-react-float). */
export const POP_MS = 2600
const MAX_POPS = 6
const SPREAD = [0, -5.5, 5.5]
const STAGGER_S = 0.45

const storage = (): Storage | null => {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

/**
 * The emoji floating over the table. The opponent's reactions show once per person and game (the seen ids live in
 * localStorage, so reopening the match does not repeat them) and only while the window is visible; our own pop
 * at once when we send them. Nothing here talks to the service.
 */
export function useReactionPops(
  reactions: readonly MultiplayerReaction[] | undefined,
  me: MultiplayerSeat,
  scope: string | null,
  describe: (reaction: MultiplayerReaction) => string,
) {
  const [pops, setPops] = useState<ReactionPop[]>([])
  const [caption, setCaption] = useState('')
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const seen = useRef<{ scope: string; ids: Set<string> } | null>(null)
  const counter = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const describeRef = useRef(describe)
  describeRef.current = describe

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => { for (const timer of pending) clearTimeout(timer); pending.clear() }
  }, [])

  const show = useCallback((emojis: readonly MultiplayerReactionEmoji[], own: boolean) => {
    const added = emojis.map((emoji, index): ReactionPop => {
      counter.current++
      return { key: `${counter.current}`, emoji, dx: own ? 0 : SPREAD[index % SPREAD.length], delay: index * STAGGER_S, own }
    })
    setPops(current => [...current, ...added].slice(-MAX_POPS))
    for (const pop of added) {
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        setPops(current => current.filter(item => item.key !== pop.key))
      }, POP_MS + pop.delay * 1000 + 250)
      timers.current.add(timer)
    }
  }, [])

  const reactionsKey = reactions ? reactions.map(reaction => reaction.id).join('|') : ''
  useEffect(() => {
    if (!scope || !reactions || !visible) return
    if (seen.current?.scope !== scope) seen.current = { scope, ids: loadSeenReactions(storage(), scope) }
    const known = seen.current.ids
    const fresh = unseenReactions(reactions, known, me)
    const next = withSeenReactions(known, reactions)
    if (next.size !== known.size) {
      seen.current.ids = next
      saveSeenReactions(storage(), scope, next)
    }
    if (fresh.length === 0) return
    show(fresh.map(reaction => reaction.emoji), false)
    setCaption(fresh.map(reaction => describeRef.current(reaction)).join('. '))
    // reactionsKey stands in for the list.
  }, [reactionsKey, scope, me, visible, show])

  const showOwn = useCallback((emoji: MultiplayerReactionEmoji) => show([emoji], true), [show])

  return { pops, caption, showOwn }
}
