import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useNestedLeaderboard } from '@/hooks/useLeaderboard'
import { mergeNestedLeaderboard, useCrossTeamLeaderboard, type CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'
import { useAutoPauseOnBlur } from '@/hooks/useAutoPauseOnBlur'
import { useGameOverRetry } from '@/hooks/useGameOverRetry'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { PauseOverlay } from '@/components/PauseOverlay'
import { ArcadeCabinetMenu } from '@/components/arcade/ArcadeCabinetMenu'
import { ArcadeHallOfFame } from '@/components/arcade/ArcadeHallOfFame'
import { ArcadeStage, type StageSize } from '@/components/arcade/ArcadeStage'
import { ArcadeGameOver } from '@/components/arcade/ArcadeGameOver'
import { arcadeLabels, personalBest } from '@/components/arcade/arcadeCabinet'
import { recordGamePlay, scoreSaveFailedMessage, submitHighscore, type LeaderboardEntry } from '@/lib/leaderboards'
import { DIFFICULTIES, FIELD, LEADERBOARD_KEY, PLAY_COUNTS_KEY, STEP_SECONDS, type Difficulty } from './config'
import { createGame, getStats, stepGame, type GameState, type GameStats } from './engine'
import { applyParcelEvents, createParcelEffects, updateParcelEffects, type ParcelEffects } from './effects'
import { createParcelRenderer, type ParcelRenderer } from './render'
import { parcelLabels } from './labels'
import { createParcelAudio, loadSoundEnabled, safeLocalStorage, saveSoundEnabled, type ParcelAudio } from './audio'
import { ParcelMarquee } from './ParcelMarquee'
import { scheduleLifts } from './input'

const THEME = 'parcel'
const MAX_STEPS_PER_FRAME = 12
const MAX_FRAME_SECONDS = 0.1
const GAME_OVER_DELAY_SECONDS = 1
const MAX_PENDING_PRESSES = 8
const LIFT_KEYS = new Set(['Space', 'ArrowUp', 'KeyW'])

type Phase = 'menu' | 'playing' | 'paused' | 'ended'

interface Result {
  stats: GameStats
  isNewRecord: boolean
}

export function ParcelPilot({ userEmail }: { userEmail?: string }) {
  const { language } = useLanguage()
  const labels = useMemo(() => parcelLabels(language), [language])
  const ui = useMemo(() => arcadeLabels(language), [language])
  const reducedMotion = usePrefersReducedMotion()

  const [phase, setPhase] = useState<Phase>('menu')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [soundEnabled, setSoundEnabled] = useState(() => loadSoundEnabled(safeLocalStorage()))
  const [result, setResult] = useState<Result | null>(null)
  const [users, setUsers] = useState<Record<string, { fullName: string }>>({})

  const phaseRef = useRef<Phase>('menu')
  const difficultyRef = useRef(difficulty)
  difficultyRef.current = difficulty
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion

  const gameRef = useRef<GameState | null>(null)
  const fxRef = useRef<ParcelEffects | null>(null)
  const rendererRef = useRef<ParcelRenderer | null>(null)
  const audioRef = useRef<ParcelAudio | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const lastFrameRef = useRef(0)
  const accumulatorRef = useRef(0)
  const clockRef = useRef(0)
  const overAtRef = useRef<number | null>(null)
  const pressTimesRef = useRef<number[]>([])
  const finishRef = useRef<() => void>(() => {})

  const { leaderboard, refresh, showScore } = useNestedLeaderboard(LEADERBOARD_KEY, DIFFICULTIES)
  const { otherTeams } = useCrossTeamLeaderboard<Record<Difficulty, LeaderboardEntry[]>>(LEADERBOARD_KEY)
  const boards = useMemo(
    () => Object.fromEntries(DIFFICULTIES.map((id) => [id, mergeNestedLeaderboard(leaderboard, users, otherTeams, id)])) as Record<Difficulty, CrossTeamEntry[]>,
    [leaderboard, users, otherTeams],
  )
  const boardsRef = useRef(boards)
  boardsRef.current = boards

  useEffect(() => {
    let cancelled = false
    window.kv
      .get<Record<string, { email?: string; fullName?: string }>>('users')
      .then((data) => {
        if (cancelled) return
        const entries = Object.values(data ?? {})
          .filter((user): user is { email: string; fullName?: string } => typeof user?.email === 'string')
          .map((user) => [user.email, { fullName: user.fullName || user.email.split('@')[0] }] as const)
        setUsers(Object.fromEntries(entries))
      })
      .catch((error) => console.error('Kunne ikke hente brugere til highscores:', error))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const audio = createParcelAudio({ enabled: loadSoundEnabled(safeLocalStorage()) })
    audioRef.current = audio
    return () => {
      audio.dispose()
      audioRef.current = null
    }
  }, [])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    saveSoundEnabled(next, safeLocalStorage())
    audioRef.current?.setEnabled(next)
    if (next) audioRef.current?.playEvents([{ type: 'parcel', x: 0, y: 0, points: 0, golden: false }])
  }

  const goTo = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const drawFrame = useCallback(() => {
    const game = gameRef.current
    const fx = fxRef.current
    if (game && fx) rendererRef.current?.draw(game, fx, labelsRef.current, clockRef.current)
  }, [])

  const queueLift = (time: number) => {
    if (pressTimesRef.current.length < MAX_PENDING_PRESSES) pressTimesRef.current.push(time)
  }

  const runFrame = useCallback((now: number) => {
    if (phaseRef.current !== 'playing') return
    const game = gameRef.current
    const fx = fxRef.current
    if (!game || !fx) return

    const elapsed = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrameRef.current) / 1000))
    const frameStart = lastFrameRef.current
    lastFrameRef.current = now
    clockRef.current += elapsed
    updateParcelEffects(fx, elapsed)

    if (fx.hitStop <= 0) {
      accumulatorRef.current += elapsed
      const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(accumulatorRef.current / STEP_SECONDS))
      // Hvert tryk får sit eget trin der, hvor det skete, også når billedet hakker.
      const { lifts, remaining } = scheduleLifts(pressTimesRef.current, frameStart, now, steps)
      pressTimesRef.current = remaining
      for (let i = 0; i < steps && game.status !== 'over'; i++) {
        const events = stepGame(game, { lift: lifts[i] })
        if (events.length > 0) {
          applyParcelEvents(fx, events, labelsRef.current, game.drone.y)
          audioRef.current?.playEvents(events)
        }
        accumulatorRef.current -= STEP_SECONDS
      }
      if (steps === MAX_STEPS_PER_FRAME) accumulatorRef.current = 0
    }

    rendererRef.current?.draw(game, fx, labelsRef.current, clockRef.current)

    if (game.status === 'over') {
      overAtRef.current ??= clockRef.current
      if (clockRef.current - overAtRef.current >= GAME_OVER_DELAY_SECONDS) {
        finishRef.current()
        return
      }
    }
    animationRef.current = requestAnimationFrame(runFrame)
  }, [])

  const startGame = useCallback(() => {
    cancelAnimationFrame(animationRef.current)
    gameRef.current = createGame(difficultyRef.current)
    fxRef.current = createParcelEffects({ reducedMotion: reducedMotionRef.current })
    clockRef.current = 0
    accumulatorRef.current = 0
    overAtRef.current = null
    pressTimesRef.current = []
    setResult(null)
    goTo('playing')
    drawFrame()
    lastFrameRef.current = performance.now()
    animationRef.current = requestAnimationFrame(runFrame)
  }, [drawFrame, goTo, runFrame])

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    goTo('paused')
    cancelAnimationFrame(animationRef.current)
    pressTimesRef.current = []
  }, [goTo])

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return
    goTo('playing')
    lastFrameRef.current = performance.now()
    animationRef.current = requestAnimationFrame(runFrame)
  }, [goTo, runFrame])

  const quit = () => {
    cancelAnimationFrame(animationRef.current)
    gameRef.current = null
    goTo('menu')
  }

  finishRef.current = () => {
    const game = gameRef.current
    if (!game) return
    cancelAnimationFrame(animationRef.current)
    const stats = getStats(game)
    const previousBest = personalBest(boardsRef.current[game.difficulty], userEmail)
    setResult({ stats, isNewRecord: stats.score > 0 && (previousBest === null || stats.score > previousBest) })
    goTo('ended')
    if (!userEmail) return
    // The game-over list shows the score at once; the score and the play count are saved at the same time, in the
    // background (each write takes up to 90 s on the shared drive). A failed save takes the score off the list again.
    if (stats.score > 0) {
      const entry = { email: userEmail, score: stats.score, level: stats.zone, timestamp: Date.now() }
      showScore(entry, game.difficulty)
      void submitHighscore(LEADERBOARD_KEY, entry, { path: [game.difficulty], categories: DIFFICULTIES }).then(refresh, error => {
        console.error('Kunne ikke gemme Parcel Pilot-score:', error)
        toast.error(scoreSaveFailedMessage(language))
        refresh()
      })
    }
    void recordGamePlay(PLAY_COUNTS_KEY, userEmail, game.difficulty).catch(error => console.error('Kunne ikke tælle Parcel Pilot-runde:', error))
  }

  useGameOverRetry(phase === 'ended', startGame)
  useAutoPauseOnBlur(phase === 'playing', pause)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = phaseRef.current
      if (current === 'menu' || current === 'ended' || event.altKey || event.ctrlKey || event.metaKey) return
      const { code } = event
      if (current === 'paused') {
        if (code === 'Space' || code === 'KeyP' || code === 'Enter') {
          event.preventDefault()
          if (!event.repeat) resume()
        }
        return
      }
      if (code === 'KeyP') {
        event.preventDefault()
        if (!event.repeat) pause()
        return
      }
      if (LIFT_KEYS.has(code)) {
        event.preventDefault()
        if (!event.repeat) queueLift(event.timeStamp)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pause, resume])

  useEffect(() => () => cancelAnimationFrame(animationRef.current), [])

  const stageVisible = phase !== 'menu'
  useEffect(() => {
    if (!stageVisible) rendererRef.current = null
  }, [stageVisible])

  const fitCanvas = useCallback((size: StageSize) => {
    const canvas = canvasRef.current
    if (!canvas) return
    rendererRef.current ??= createParcelRenderer(canvas)
    rendererRef.current.resize(size.width, size.height, window.devicePixelRatio || 1)
    if (phaseRef.current !== 'playing') drawFrame()
  }, [drawFrame])

  const board = boards[difficulty]
  const best = personalBest(board, userEmail)
  const leader = board[0]

  return phase === 'menu' ? (
    <div className="space-y-6">
      <ArcadeCabinetMenu
        theme={THEME}
        title={labels.menu.title}
        tagline={labels.menu.tagline}
        marquee={<ParcelMarquee reducedMotion={reducedMotion} />}
        labels={ui}
        personalBest={best === null ? null : labels.points(best)}
        topScore={leader ? { value: labels.points(leader.score), holder: leader.teamCode ? `${leader.displayName} (${leader.teamCode})` : leader.displayName } : null}
        difficulties={DIFFICULTIES.map((id) => ({ id, detail: labels.menu.difficultyDetail[id] }))}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        controls={[
          { keys: [labels.menu.spaceKey, '↑'], label: labels.menu.controls.lift },
          { keys: ['P'], label: labels.menu.controls.pause },
          { keys: [labels.menu.mouseKey], label: labels.menu.controls.mouse },
        ]}
        onStart={startGame}
        soundEnabled={soundEnabled}
        onSoundToggle={toggleSound}
      />
      <ArcadeHallOfFame
        theme={THEME}
        labels={ui}
        boards={boards}
        difficulties={[...DIFFICULTIES]}
        difficulty={difficulty}
        userEmail={userEmail}
        formatScore={labels.points}
      />
    </div>
  ) : (
    <ArcadeStage
      theme={THEME}
      title={labels.menu.title}
      badge={ui.difficulties[gameRef.current?.difficulty ?? difficulty]}
      labels={ui}
      soundEnabled={soundEnabled}
      onSoundToggle={toggleSound}
      onQuit={quit}
      aspect={FIELD.width / FIELD.height}
      onFit={fitCanvas}
      playing={phase === 'playing'}
      screenHandlers={{
        onPointerDown: (event) => {
          if (phaseRef.current !== 'playing' || event.button !== 0) return
          event.preventDefault()
          queueLift(event.timeStamp)
        },
      }}
    >
      <canvas ref={canvasRef} role="img" aria-label={labels.menu.title} />
      {phase === 'paused' && <PauseOverlay onResume={resume} />}
      {phase === 'ended' && result && (
        <ArcadeGameOver
          labels={ui}
          score={result.stats.score}
          formatScore={labels.points}
          isNewRecord={result.isNewRecord}
          reducedMotion={reducedMotion}
          stats={[
            { label: labels.stats.zone, value: String(result.stats.zone) },
            { label: labels.stats.gates, value: labels.points(result.stats.gates) },
            { label: labels.stats.parcels, value: labels.points(result.stats.parcels) },
            { label: labels.stats.perfect, value: labels.points(result.stats.perfect) },
            { label: labels.stats.bestStreak, value: String(result.stats.bestStreak) },
          ]}
          onRetry={startGame}
          onMenu={() => goTo('menu')}
        />
      )}
    </ArcadeStage>
  )
}
