import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
import { DIFFICULTIES, FIELD, NEW_LEADERBOARD_KEY, PLAY_COUNTS_KEY, STEP_SECONDS, type Difficulty } from './config'
import { createGame, getStats, stepGame, type GameInput, type GameState, type GameStats } from './engine'
import { applyPrismEvents, createPrismEffects, recordBalls, updatePrismEffects, type PrismEffects } from './effects'
import { createPrismRenderer, type PrismRenderer } from './render'
import { prismLabels } from './labels'
import { createPrismAudio, loadSoundEnabled, safeLocalStorage, saveSoundEnabled, type PrismAudio } from './audio'
import { PrismMarquee } from './PrismMarquee'

const THEME = 'prism'
const MAX_STEPS_PER_FRAME = 10
const MAX_FRAME_SECONDS = 0.1
const GAME_OVER_DELAY_SECONDS = 1.3
const MOVE_LEFT = new Set(['ArrowLeft', 'KeyA'])
const MOVE_RIGHT = new Set(['ArrowRight', 'KeyD'])

type Phase = 'menu' | 'playing' | 'paused' | 'ended'

interface Result {
  stats: GameStats
  isNewRecord: boolean
}

export function PrismBreak({ userEmail }: { userEmail?: string }) {
  const { language } = useLanguage()
  const labels = useMemo(() => prismLabels(language), [language])
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
  const fxRef = useRef<PrismEffects | null>(null)
  const rendererRef = useRef<PrismRenderer | null>(null)
  const audioRef = useRef<PrismAudio | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const lastFrameRef = useRef(0)
  const accumulatorRef = useRef(0)
  const clockRef = useRef(0)
  const overAtRef = useRef<number | null>(null)
  const keysRef = useRef(new Set<string>())
  const pointerXRef = useRef<number | null>(null)
  const pointerDownRef = useRef(false)
  const finishRef = useRef<() => void>(() => {})

  const { leaderboard, refresh, showScore } = useNestedLeaderboard(NEW_LEADERBOARD_KEY, DIFFICULTIES)
  const { otherTeams } = useCrossTeamLeaderboard<Record<Difficulty, LeaderboardEntry[]>>(NEW_LEADERBOARD_KEY)
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
    const audio = createPrismAudio({ enabled: loadSoundEnabled(safeLocalStorage()) })
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
    if (next) audioRef.current?.playEvents([{ type: 'pickup', kind: 'wide', x: 0, y: 0 }])
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

  const readInput = (): GameInput => {
    const keys = keysRef.current
    const action = keys.has('Space') || pointerDownRef.current
    return {
      left: keys.has('ArrowLeft') || keys.has('KeyA'),
      right: keys.has('ArrowRight') || keys.has('KeyD'),
      launch: action,
      fire: action,
      pointerX: pointerXRef.current,
    }
  }

  const runFrame = useCallback((now: number) => {
    if (phaseRef.current !== 'playing') return
    const game = gameRef.current
    const fx = fxRef.current
    if (!game || !fx) return

    const elapsed = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrameRef.current) / 1000))
    lastFrameRef.current = now
    clockRef.current += elapsed
    updatePrismEffects(fx, elapsed)

    if (fx.hitStop <= 0) {
      accumulatorRef.current += elapsed
      let steps = 0
      while (game.status !== 'over' && accumulatorRef.current >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
        const events = stepGame(game, readInput())
        if (events.length > 0) {
          applyPrismEvents(fx, events, labelsRef.current)
          audioRef.current?.playEvents(events)
        }
        accumulatorRef.current -= STEP_SECONDS
        steps++
      }
      if (steps === MAX_STEPS_PER_FRAME) accumulatorRef.current = 0
    }
    recordBalls(fx, game.balls)

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
    const game = createGame(difficultyRef.current)
    const fx = createPrismEffects({ reducedMotion: reducedMotionRef.current })
    // Motoren lægger "Vindue 1" i kø; vis banneret med det samme i stedet for efter første skridt.
    applyPrismEvents(fx, game.pendingEvents.splice(0), labelsRef.current)
    gameRef.current = game
    fxRef.current = fx
    clockRef.current = 0
    accumulatorRef.current = 0
    overAtRef.current = null
    keysRef.current.clear()
    pointerXRef.current = null
    pointerDownRef.current = false
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
    keysRef.current.clear()
    pointerDownRef.current = false
    // Musen kan have flyttet sig under pausen; en gammel position må ikke trække prismen væk.
    pointerXRef.current = null
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
    const entry = { email: userEmail, score: stats.score, level: stats.level, timestamp: Date.now() }
    showScore(entry, game.difficulty)
    void submitHighscore(NEW_LEADERBOARD_KEY, entry, { path: [game.difficulty], categories: DIFFICULTIES }).then(refresh, error => {
      console.error('Kunne ikke gemme Prism Break-score:', error)
      toast.error(scoreSaveFailedMessage(language))
      refresh()
    })
    void recordGamePlay(PLAY_COUNTS_KEY, userEmail, game.difficulty).catch(error => console.error('Kunne ikke tælle Prism Break-runde:', error))
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
      const moving = MOVE_LEFT.has(code) || MOVE_RIGHT.has(code)
      if (moving) pointerXRef.current = null
      if (moving || code === 'Space') {
        event.preventDefault()
        // Et gentaget tryk må ikke tælle som et nyt affyr efter en genstart.
        if (!event.repeat || moving) keysRef.current.add(code)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [pause, resume])

  useEffect(() => () => cancelAnimationFrame(animationRef.current), [])

  const stageVisible = phase !== 'menu'
  useEffect(() => {
    if (!stageVisible) rendererRef.current = null
  }, [stageVisible])

  const fitCanvas = useCallback((size: StageSize) => {
    const canvas = canvasRef.current
    if (!canvas) return
    rendererRef.current ??= createPrismRenderer(canvas)
    rendererRef.current.resize(size.width, size.height, window.devicePixelRatio || 1)
    if (phaseRef.current !== 'playing') drawFrame()
  }, [drawFrame])

  const toLogicalX = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return ((event.clientX - rect.left) / rect.width) * FIELD.width
  }

  const releasePointer = () => {
    pointerDownRef.current = false
  }

  const board = boards[difficulty]
  const best = personalBest(board, userEmail)
  const leader = board[0]

  return phase === 'menu' ? (
    <div className="space-y-6">
      <ArcadeCabinetMenu
        theme={THEME}
        title={labels.menu.title}
        tagline={labels.menu.tagline}
        marquee={<PrismMarquee reducedMotion={reducedMotion} />}
        labels={ui}
        personalBest={best === null ? null : labels.points(best)}
        topScore={leader ? { value: labels.points(leader.score), holder: leader.teamCode ? `${leader.displayName} (${leader.teamCode})` : leader.displayName } : null}
        difficulties={DIFFICULTIES.map((id) => ({ id, detail: labels.menu.difficultyDetail[id] }))}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        controls={[
          { keys: ['←', '→'], label: labels.menu.controls.move },
          { keys: [labels.menu.spaceKey], label: labels.menu.controls.launch },
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
        onPointerMove: (event) => {
          if (phaseRef.current === 'playing') pointerXRef.current = toLogicalX(event)
        },
        onPointerDown: (event) => {
          if (phaseRef.current !== 'playing' || event.button !== 0) return
          pointerXRef.current = toLogicalX(event)
          pointerDownRef.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        },
        onPointerUp: releasePointer,
        onPointerCancel: releasePointer,
        onLostPointerCapture: releasePointer,
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
            { label: labels.stats.level, value: String(result.stats.level) },
            { label: labels.stats.destroyed, value: labels.points(result.stats.destroyed) },
            { label: labels.stats.returns, value: labels.points(result.stats.returns) },
            { label: labels.stats.bestChain, value: String(result.stats.bestChain) },
            { label: labels.stats.perfect, value: String(result.stats.perfectLevels) },
          ]}
          onRetry={startGame}
          onMenu={() => goTo('menu')}
        />
      )}
    </ArcadeStage>
  )
}
