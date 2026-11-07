// Shared lobby for the Multiplayer games: data and commands (useLobby), the walnut arcade cabinet, the game lists,
// "Your head-to-heads" and the leaderboard. Each game supplies its own marquee art, row art and challenge dialog.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CaretRight, Handshake } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { LanguageFlag } from '@/components/multiplayer/LanguageFlag'
import { useLanguage } from '@/contexts/LanguageContext'
import type {
  MultiplayerCommand, MultiplayerCommandResult, MultiplayerGameEntry, MultiplayerGameType, MultiplayerPerson, MultiplayerRival,
  MultiplayerSnapshot, MultiplayerStats, MultiplayerTopWord,
} from '@/lib/multiplayer'
import { getMultiplayerLabels, type MultiplayerLabels } from '@/lib/multiplayerLabels'
import {
  canRemind, groupGames, isChessEntry, multiplayerErrorInfo, newOperationId, opponentOf, outcomeFor, relativeTime, seatOf, type LobbyGroups,
} from '@/lib/multiplayerView'
import { isAnyDialogOpen } from '@/lib/modalStack'
import { useMultiplayerSnapshot } from '@/hooks/useMultiplayerSnapshot'
import { useStableValue } from '@/hooks/useStable'

export const PLAYABLE = ['active', 'awaiting-approval', 'finished']
const FINISHED_PREVIEW = 5
const DASH = '\u2013'

type LobbyLabels = MultiplayerLabels['lobby']

export interface UseLobbyOptions<T extends MultiplayerGameEntry> {
  gameType: MultiplayerGameType
  isGame: (entry: MultiplayerGameEntry) => entry is T
  userEmail?: string
  initialGameId?: string | null
  openGameId?: string | null
  onOpenGameConsumed?: () => void
  onNavigateBack: () => void
}

/** Snapshot, commands and the open match for one game's lobby; behaviour shared by every game. */
const pendingKey = (action: 'accept' | 'decline' | 'withdraw' | 'remind', gameId: string) => `${action}:${gameId}`

export function useLobby<T extends MultiplayerGameEntry>({
  gameType, isGame, userEmail, initialGameId = null, openGameId = null, onOpenGameConsumed, onNavigateBack,
}: UseLobbyOptions<T>) {
  const { language } = useLanguage()
  const labels = getMultiplayerLabels(language)
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const api = typeof window === 'undefined' ? undefined : window.electronMultiplayer

  const [patch, setPatch] = useState<{ base: MultiplayerSnapshot | null; entries: MultiplayerGameEntry[] }>({ base: null, entries: [] })
  const [busy, setBusy] = useState(false)
  // Which button the running command came from, so exactly that button shows "Accepterer…" with a spinner.
  const [pending, setPending] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [openGame, setOpenGame] = useState<string | null>(initialGameId)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [rematchEmail, setRematchEmail] = useState<string | null>(null)
  const [showAllFinished, setShowAllFinished] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // The snapshot is shared app-wide (bell, toasts, every lobby); an answer that changed nothing never re-renders.
  const { state: shared, refresh } = useMultiplayerSnapshot()
  const base = shared.snapshot
  const baseRef = useRef(base)
  baseRef.current = base
  // Results of our own commands show at once; the next real snapshot replaces them.
  const snapshot = useMemo(
    () => (patch.base === base ? patch.entries.reduce(applyEntry, base) : base),
    [base, patch],
  )
  const loading = Boolean(api) && (shared.loading || !shared.loaded)

  // Relative times only matter while the list is on screen; an open match must not re-render every minute.
  useEffect(() => {
    if (openGame) return
    setNow(previous => (Date.now() - previous > 1000 ? Date.now() : previous))
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [openGame])

  const errorText = useCallback((error: unknown): string => {
    const text = labelsRef.current
    const info = multiplayerErrorInfo(error)
    if (info.code === 'MULTIPLAYER_INVALID_MOVE' && info.detail) return text.moveErrors[info.detail]
    return info.code ? text.errors[info.code] : text.errors.generic
  }, [])

  const loadError: string | null = api ? (shared.error ? errorText(shared.error) : null) : labels.lobby.unavailableBody

  /** The retry button: shows the loading state. */
  const load = useCallback(() => refresh({ visible: true }), [refresh])
  const reload = useCallback(() => refresh(), [refresh])

  useEffect(() => {
    if (!openGameId) return
    setOpenGame(openGameId)
    onOpenGameConsumed?.()
  }, [openGameId, onOpenGameConsumed])

  // The match owns Escape while it is open; here it leaves the section.
  useEffect(() => {
    if (openGame) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isAnyDialogOpen()) return
      onNavigateBack()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [openGame, onNavigateBack])

  const me = snapshot?.actor.email ?? userEmail ?? ''
  const teams = useStableValue(snapshot?.teams)
  const teamName = useCallback(
    (code: string) => teams?.find(team => team.folderName === code)?.name ?? code,
    [teams],
  )
  const games = useMemo(() => (snapshot?.games ?? []).filter(isGame), [snapshot, isGame])
  const groups = useMemo(() => groupGames(games, me), [games, me])

  const run = async (build: () => MultiplayerCommand, action: string | null = null): Promise<{ ok: boolean; result?: MultiplayerCommandResult }> => {
    if (!api || inFlight.current) return { ok: false }
    inFlight.current = true
    setBusy(true)
    setPending(action)
    try {
      const result = await api.command(build())
      const entry = result.entry
      if (entry) {
        setPatch(previous => {
          const current = baseRef.current
          if (!current) return previous
          return { base: current, entries: previous.base === current ? [...previous.entries, entry] : [entry] }
        })
      }
      return { ok: true, result }
    } catch (error) {
      toast.error(errorText(error))
      void reload()
      return { ok: false }
    } finally {
      inFlight.current = false
      setBusy(false)
      setPending(null)
    }
  }

  const sendChallenge = async (person: MultiplayerPerson, build: (operationId: string) => MultiplayerCommand) => {
    const { ok } = await run(() => build(newOperationId()))
    if (!ok) return
    setChallengeOpen(false)
    toast.success(labels.toast.challengeSent(person.fullName))
  }

  const respond = async (entry: MultiplayerGameEntry, accept: boolean) => {
    const { ok, result } = await run(() => ({ operationId: newOperationId(), type: 'respond', gameId: entry.id, accept }), pendingKey(accept ? 'accept' : 'decline', entry.id))
    if (!ok) return
    toast.success(accept ? labels.toast.accepted : labels.toast.declined)
    if (accept && result?.game) setOpenGame(entry.id)
  }

  const cancel = async (entry: MultiplayerGameEntry) => {
    if ((await run(() => ({ operationId: newOperationId(), type: 'cancel', gameId: entry.id }), pendingKey('withdraw', entry.id))).ok) toast.success(labels.toast.withdrawn)
  }

  const remind = async (entry: MultiplayerGameEntry) => {
    if ((await run(() => ({ operationId: newOperationId(), type: 'remind', gameId: entry.id }), pendingKey('remind', entry.id))).ok) toast.success(labels.toast.reminded(opponentOf(entry, me).name))
  }

  const actorName = (email: string) =>
    snapshot?.games.flatMap(game => game.players).find(player => player.email === email)?.name
    ?? snapshot?.people.find(person => person.email === email)?.fullName
    ?? email.split('@')[0]

  const openChallenge = (email: string | null) => { setRematchEmail(email); setChallengeOpen(true) }

  return {
    api, labels, language, snapshot, loading, loadError, busy, pending, load, openGame, setOpenGame, now, me, teamName, games, groups,
    respond, cancel, remind, actorName, sendChallenge, challengeOpen, setChallengeOpen, rematchEmail, openChallenge,
    showAllFinished, setShowAllFinished,
  }
}

export type Lobby<T extends MultiplayerGameEntry> = ReturnType<typeof useLobby<T>>

/** The snapshot with the entry a command just returned put in place of (or in front of) the listed one. */
function applyEntry(snapshot: MultiplayerSnapshot | null, entry: MultiplayerGameEntry): MultiplayerSnapshot | null {
  return snapshot && {
    ...snapshot,
    games: snapshot.games.some(game => game.id === entry.id)
      ? snapshot.games.map(game => (game.id === entry.id ? entry : game))
      : [entry, ...snapshot.games],
  }
}

// ---------------------------------------------------------------- the cabinet

export function LobbyCabinet({ title, tagline, art, myStats, labels, disabled, onChallenge }: {
  title: string
  tagline: string
  art: ReactNode
  myStats?: MultiplayerStats
  labels: LobbyLabels
  disabled: boolean
  onChallenge: () => void
}) {
  const played = myStats && myStats.played > 0
  return (
    <section className="arcade-cabinet" aria-labelledby="wp-lobby-title">
      <div className="arcade-cabinet__marquee">
        <div className="arcade-cabinet__marquee-art" aria-hidden="true">{art}</div>
        <div className="arcade-cabinet__marquee-inner">
          <div>
            <h1 id="wp-lobby-title" className="arcade-cabinet__title">{title}</h1>
            <p className="arcade-cabinet__tagline">{tagline}</p>
          </div>
          <dl className="arcade-cabinet__scores">
            <div>
              <dt>{labels.record}</dt>
              <dd data-empty={played ? undefined : ''}>
                {myStats ? `${myStats.wins}${DASH}${myStats.losses}${DASH}${myStats.draws}` : DASH}
                <small>{labels.wins}, {labels.losses}, {labels.draws}</small>
              </dd>
            </div>
            <div>
              <dt>{labels.played}</dt>
              <dd data-empty={played ? undefined : ''}>{myStats?.played ?? 0}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="arcade-cabinet__panel">
        <div className="arcade-cabinet__footer">
          <p className="text-sm text-muted-foreground">{labels.challengeHint}</p>
          <button type="button" className="arcade-cabinet__start" disabled={disabled} onClick={onChallenge}>
            <Handshake size={22} weight="fill" aria-hidden="true" />
            {labels.challenge}
          </button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- notices and news

export function LobbyNotices<T extends MultiplayerGameEntry>({ lobby }: { lobby: Lobby<T> }) {
  const { labels, loadError, snapshot, loading, api, load } = lobby
  const l = labels.lobby
  return (
    <div className="mt-6 grid gap-3">
      {loadError && (
        <div className="wp-notice" data-tone="error" role="alert">
          <p>
            <strong>{snapshot ? l.loadError : l.unavailableTitle}</strong>
            {loadError}
          </p>
          {api && <Button size="sm" variant="outline" disabled={loading} onClick={() => load()}>{labels.retry}</Button>}
        </div>
      )}
      {!snapshot && loading && !loadError && <div className="wp-notice" role="status"><p>{labels.loading}</p></div>}
    </div>
  )
}

// ---------------------------------------------------------------- game rows

export type RowGroup = 'yourTurn' | 'invitation' | 'waiting' | 'finished'

export interface GameRowProps<T extends MultiplayerGameEntry> {
  entry: T
  group: RowGroup
  lobby: Lobby<T>
  /** The square picture at the start of the row. */
  art: ReactNode
  /** Game-specific facts under the opponent's name (language, colour). */
  detail: ReactNode
  /** Score text for started games; null hides it. */
  score: string | null
}

export function GameRow<T extends MultiplayerGameEntry>({ entry, group, lobby, art, detail, score }: GameRowProps<T>) {
  const { labels, me, teamName, now, language, busy, pending, setOpenGame, respond, cancel, remind } = lobby
  const l = labels.lobby
  const opponent = opponentOf(entry, me)
  const seat = seatOf(entry, me) ?? 0
  const outcome = outcomeFor(entry, me)
  const playable = PLAYABLE.includes(entry.status)
  const checking = entry.status === 'awaiting-approval'

  let badge: { text: string; tone?: string }
  if (group === 'yourTurn') badge = checking ? { text: l.badge.approve, tone: 'check' } : { text: l.badge.yourTurn, tone: 'turn' }
  else if (group === 'waiting') badge = checking ? { text: l.badge.waitingApproval, tone: 'check' } : { text: l.badge.waiting }
  else if (group === 'invitation') badge = { text: l.status.invited, tone: 'invite' }
  else if (outcome) badge = { text: l.outcome[outcome], tone: outcome === 'won' ? 'won' : outcome === 'lost' ? 'lost' : undefined }
  else badge = { text: l.status[entry.status] }

  const body = (
    <>
      <span className="wp-game-row__who">
        <span className="wp-game-row__name">{opponent.name}</span>
        <span className="wp-badge" data-tone={badge.tone}>{badge.text}</span>
      </span>
      <span className="wp-game-row__meta">
        <span>{teamName(opponent.teamCode)}</span>
        {detail}
      </span>
      <span className="wp-game-row__meta">
        {playable && score && <span className="wp-game-row__score">{score}</span>}
        <span>
          {l.updated(relativeTime(entry.updatedAt, now, language))}
          {entry.status === 'finished' && entry.finishedReason ? `. ${l.reason[entry.finishedReason]}` : ''}
        </span>
      </span>
    </>
  )

  return (
    <li className="wp-game-row" data-group={group} data-game-type={isChessEntry(entry) ? 'chess' : entry.type === 'backgammon' ? 'backgammon' : 'word-puzzle'}>
      <span className="wp-game-row__tile" aria-hidden="true">{art}</span>
      {playable ? (
        <button type="button" className="wp-game-row__main" onClick={() => setOpenGame(entry.id)}>{body}</button>
      ) : (
        <div className="wp-game-row__main">{body}</div>
      )}
      <div className="wp-game-row__actions">
        {group === 'invitation' && seat === 1 && (
          <>
            <Button size="sm" disabled={busy} loading={pending === pendingKey('accept', entry.id)} onClick={() => respond(entry, true)}>
              {pending === pendingKey('accept', entry.id) ? l.working.accept : l.accept}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} loading={pending === pendingKey('decline', entry.id)} onClick={() => respond(entry, false)}>
              {pending === pendingKey('decline', entry.id) ? l.working.decline : l.decline}
            </Button>
          </>
        )}
        {group === 'invitation' && seat === 0 && (
          <Button size="sm" variant="outline" disabled={busy} loading={pending === pendingKey('withdraw', entry.id)} onClick={() => cancel(entry)}>
            {pending === pendingKey('withdraw', entry.id) ? l.working.withdraw : l.withdraw}
          </Button>
        )}
        {group === 'waiting' && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canRemind(entry, me, now)}
            loading={pending === pendingKey('remind', entry.id)}
            title={canRemind(entry, me, now) ? undefined : l.remindedRecently}
            onClick={() => remind(entry)}
          >
            {pending === pendingKey('remind', entry.id) ? l.working.remind : l.remind}
          </Button>
        )}
        {playable && <CaretRight size={18} aria-hidden="true" className="text-muted-foreground" />}
      </div>
    </li>
  )
}

/** The lobby's lists: your turn, invitations, waiting and finished. */
export function LobbySections<T extends MultiplayerGameEntry>({ lobby, renderRow }: {
  lobby: Lobby<T>
  renderRow: (entry: T, group: RowGroup) => ReactNode
}) {
  const { labels, games, groups, showAllFinished, setShowAllFinished } = lobby
  const l = labels.lobby
  const g = groups as LobbyGroups<T>
  const hasInvitations = g.invitationsIn.length + g.invitationsOut.length > 0
  const finishedShown = showAllFinished ? g.finished : g.finished.slice(0, FINISHED_PREVIEW)
  return (
    <div>
      {games.length === 0 && <div className="wp-notice"><p>{l.noGames}</p></div>}

      {g.yourTurn.length > 0 && (
        <section className="wp-section" aria-labelledby="wp-sec-turn">
          <div className="wp-section__head"><h2 id="wp-sec-turn" className="wp-section__title">{l.sections.yourTurn}</h2><span className="wp-count">{g.yourTurn.length}</span></div>
          <ul className="wp-list">{g.yourTurn.map(entry => renderRow(entry, 'yourTurn'))}</ul>
        </section>
      )}

      {hasInvitations && (
        <section className="wp-section" aria-labelledby="wp-sec-inv">
          <div className="wp-section__head"><h2 id="wp-sec-inv" className="wp-section__title">{l.sections.invitations}</h2><span className="wp-count">{g.invitationsIn.length + g.invitationsOut.length}</span></div>
          {g.invitationsIn.length > 0 && (
            <>
              {g.invitationsOut.length > 0 && <h3 className="wp-subtitle">{l.invitationsIn}</h3>}
              <ul className="wp-list">{g.invitationsIn.map(entry => renderRow(entry, 'invitation'))}</ul>
            </>
          )}
          {g.invitationsOut.length > 0 && (
            <>
              {g.invitationsIn.length > 0 && <h3 className="wp-subtitle">{l.invitationsOut}</h3>}
              <ul className="wp-list">{g.invitationsOut.map(entry => renderRow(entry, 'invitation'))}</ul>
            </>
          )}
        </section>
      )}

      {g.waiting.length > 0 && (
        <section className="wp-section" aria-labelledby="wp-sec-wait">
          <div className="wp-section__head"><h2 id="wp-sec-wait" className="wp-section__title">{l.sections.waiting}</h2><span className="wp-count">{g.waiting.length}</span></div>
          <ul className="wp-list">{g.waiting.map(entry => renderRow(entry, 'waiting'))}</ul>
        </section>
      )}

      {g.finished.length > 0 && (
        <section className="wp-section" aria-labelledby="wp-sec-done">
          <div className="wp-section__head"><h2 id="wp-sec-done" className="wp-section__title">{l.sections.finished}</h2><span className="wp-count">{g.finished.length}</span></div>
          <ul className="wp-list">{finishedShown.map(entry => renderRow(entry, 'finished'))}</ul>
          {g.finished.length > FINISHED_PREVIEW && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAllFinished(value => !value)}>
              {showAllFinished ? l.showLess : l.showMore}
            </Button>
          )}
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- records

export function RivalsPanel<T extends MultiplayerGameEntry>({ lobby, rivals }: { lobby: Lobby<T>; rivals: readonly MultiplayerRival[] }) {
  const { labels, teamName, now, language, busy, snapshot, openChallenge } = lobby
  const l = labels.lobby
  const canChallenge = (email: string) => Boolean(snapshot?.people.some(person => person.email === email))
  return (
    <section className="arcade-fame wp-rivals" aria-labelledby="wp-rivals-title">
      <div className="arcade-fame__head">
        <h2 id="wp-rivals-title" className="arcade-fame__title">{l.rivals.title}</h2>
        <span className="arcade-fame__hint">{l.rivals.hint}</span>
      </div>
      {rivals.length === 0 ? (
        <p className="arcade-fame__empty">{l.rivals.empty}</p>
      ) : (
        <ul className="wp-rivals__list">
          {rivals.map(rival => {
            const standing = rival.wins > rival.losses ? 'ahead' : rival.wins < rival.losses ? 'behind' : 'level'
            const total = Math.max(1, rival.played)
            return (
              <li key={`${rival.type}-${rival.email}`} className="wp-rival" data-standing={standing}>
                <div className="wp-rival__who">
                  <span className="wp-rival__name">{rival.fullName}</span>
                  <span className="wp-rival__team">{teamName(rival.teamCode)}</span>
                </div>
                <div className="wp-rival__score" aria-label={l.rivals.record(rival.wins, rival.losses, rival.draws)}>
                  <span className="wp-rival__wins">{rival.wins}</span>
                  <span aria-hidden="true">{DASH}</span>
                  <span className="wp-rival__losses">{rival.losses}</span>
                  {rival.draws > 0 && <span className="wp-rival__draws">({rival.draws})</span>}
                </div>
                <div className="wp-rival__bar" aria-hidden="true">
                  <span style={{ width: `${(rival.wins / total) * 100}%` }} data-part="wins" />
                  <span style={{ width: `${(rival.draws / total) * 100}%` }} data-part="draws" />
                  <span style={{ width: `${(rival.losses / total) * 100}%` }} data-part="losses" />
                </div>
                <div className="wp-rival__meta">
                  <span className="wp-badge" data-tone={standing === 'ahead' ? 'won' : standing === 'behind' ? 'lost' : undefined}>{l.rivals[standing]}</span>
                  {rival.lastPlayedAt && <span>{l.rivals.last(relativeTime(rival.lastPlayedAt, now, language))}</span>}
                  {canChallenge(rival.email) && (
                    <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" disabled={busy} onClick={() => openChallenge(rival.email)}>{l.rivals.rematch}</Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function LeaderboardPanel<T extends MultiplayerGameEntry>({ lobby, stats }: { lobby: Lobby<T>; stats: readonly MultiplayerStats[] }) {
  const { labels, teamName, me } = lobby
  const l = labels.lobby
  const leaderboard = stats.slice(0, 10)
  const myRank = stats.findIndex(stat => stat.email === me)
  const ownOutside = myRank >= 10 ? stats[myRank] : null
  return (
    <section className="arcade-fame" aria-labelledby="wp-board-title">
      <div className="arcade-fame__head">
        <h2 id="wp-board-title" className="arcade-fame__title">{l.leaderboard.title}</h2>
        <span className="arcade-fame__hint">{l.leaderboard.hint}</span>
      </div>
      {stats.length === 0 ? (
        <p className="arcade-fame__empty">{l.leaderboard.empty}</p>
      ) : (
        <>
          <p className="mb-1 text-xs text-muted-foreground">{l.leaderboard.legend}</p>
          <ol className="arcade-fame__list">
            {leaderboard.map((stat, index) => (
              <li key={stat.email} className="arcade-fame__row" data-rank={index + 1} data-me={stat.email === me ? '' : undefined}>
                <span className="arcade-fame__rank">{index + 1}</span>
                <span className="arcade-fame__name">
                  {stat.fullName}
                  <span className="arcade-fame__team">{teamName(stat.teamCode)}</span>
                  {stat.email === me && <span className="arcade-fame__you">{labels.you}</span>}
                </span>
                <span className="arcade-fame__score">{stat.wins}{DASH}{stat.losses}{DASH}{stat.draws}</span>
              </li>
            ))}
            {ownOutside && (
              <>
                <li className="arcade-fame__gap" aria-hidden="true">{'\u2026'}</li>
                <li className="arcade-fame__row" data-me="">
                  <span className="arcade-fame__rank">{myRank + 1}</span>
                  <span className="arcade-fame__name">{ownOutside.fullName}<span className="arcade-fame__you">{labels.you}</span></span>
                  <span className="arcade-fame__score">{ownOutside.wins}{DASH}{ownOutside.losses}{DASH}{ownOutside.draws}</span>
                </li>
              </>
            )}
          </ol>
        </>
      )}
    </section>
  )
}

export function TopWordsPanel<T extends MultiplayerGameEntry>({ lobby, words }: { lobby: Lobby<T>; words: readonly MultiplayerTopWord[] }) {
  const { labels, teamName } = lobby
  const l = labels.lobby.topWords
  return (
    <section className="arcade-fame wp-top-words" aria-labelledby="wp-top-words-title">
      <div className="arcade-fame__head">
        <h2 id="wp-top-words-title" className="arcade-fame__title">{l.title}</h2>
        <span className="arcade-fame__hint">{l.hint}</span>
      </div>
      {words.length === 0 ? (
        <p className="arcade-fame__empty">{l.empty}</p>
      ) : (
        <ol className="arcade-fame__list">
          {words.map((entry, index) => (
            <li key={`${entry.at}-${entry.word}-${index}`} className="arcade-fame__row" data-rank={index + 1} data-me={entry.mine ? '' : undefined}>
              <span className="arcade-fame__rank">{index + 1}</span>
              <span className="arcade-fame__name">
                <span className="wp-top-word">
                  <LanguageFlag language={entry.language} />
                  <span className="sr-only">{labels.languageNames[entry.language]}</span>
                  {entry.word}
                </span>
                {entry.mine && <span className="arcade-fame__you">{labels.you}</span>}
                <span className="arcade-fame__team">{entry.teamCode ? `${entry.fullName} \u00b7 ${teamName(entry.teamCode)}` : entry.fullName}</span>
              </span>
              <span className="arcade-fame__score">{l.points(entry.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function MatchLoading() {
  return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
}
