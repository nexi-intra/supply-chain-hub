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
import { DIFFICULTIES, LEADERBOARD_KEY, PLAY_COUNTS_KEY, STEP_SECONDS, type Difficulty } from './config'
import { createGame, getStats, stepGame, type Action, type GameState, type GameStats } from './engine'
import { applyCargoEvents, createCargoEffects, updateCargoEffects, type CargoEffects } from './effects'
import { createCargoRenderer, type CargoRenderer } from './render'
import { cargoLabels } from './labels'
import { FIELD } from './sprites'
import { createCargoAudio, loadSoundEnabled, safeLocalStorage, saveSoundEnabled, type CargoAudio } from './audio'
import { CargoMarquee } from './CargoMarquee'

const THEME = 'cargo'
const MAX_STEPS_PER_FRAME = 12
const MAX_FRAME_SECONDS = 0.1
const GAME_OVER_DELAY_SECONDS = 1.2
const MAX_PENDING_ACTIONS = 16
const KEY_ACTIONS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyW: 'rotateCW',
  KeyZ: 'rotateCCW',
  Space: 'hardDrop',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
}
const HELD_KEYS: Record<string, 'left' | 'right' | 'down'> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
}

type Phase = 'menu' | 'playing' | 'paused' | 'ended'

interface Result {
  stats: GameStats
  isNewRecord: boolean
}

export function CargoStack({ userEmail }: { userEmail?: string }) {
  const { language } = useLanguage()
  const labels = useMemo(() => cargoLabels(language), [language])
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
  const fxRef = useRef<CargoEffects | null>(null)
  const rendererRef = useRef<CargoRenderer | null>(null)
  const audioRef = useRef<CargoAudio | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const lastFrameRef = useRef(0)
  const accumulatorRef = useRef(0)
  const clockRef = useRef(0)
  const overAtRef = useRef<number | null>(null)
  const actionsRef = useRef<Action[]>([])
  const heldKeysRef = useRef(new Set<string>())
  const finishRef = useRef<() => void>(() => {})

  const { leaderboard, refresh } = useNestedLeaderboard(LEADERBOARD_KEY, DIFFICULTIES)
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
    const audio = createCargoAudio({ enabled: loadSoundEnabled(safeLocalStorage()) })
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
    if (next) audioRef.current?.playEvents([{ type: 'hold', piece: 'T' }])
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

  const heldState = () => {
    const keys = heldKeysRef.current
    const has = (kind: 'left' | 'right' | 'down') => [...keys].some((code) => HELD_KEYS[code] === kind)
    return { left: has('left'), right: has('right'), down: has('down') }
  }

  const runFrame = useCallback((now: number) => {
    if (phaseRef.current !== 'playing') return
    const game = gameRef.current
    const fx = fxRef.current
    if (!game || !fx) return

    const elapsed = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrameRef.current) / 1000))
    lastFrameRef.current = now
    clockRef.current += elapsed
    updateCargoEffects(fx, elapsed)

    accumulatorRef.current += elapsed
    let steps = 0
    while (game.status !== 'over' && accumulatorRef.current >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      // Alle tryk siden sidste billede udføres i rækkefølge, så ingen går tabt.
      const actions = steps === 0 ? actionsRef.current.splice(0) : []
      const events = stepGame(game, { actions, held: heldState() })
      if (events.length > 0) {
        applyCargoEvents(fx, events, labelsRef.current)
        audioRef.current?.playEvents(events)
      }
      accumulatorRef.current -= STEP_SECONDS
      steps++
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulatorRef.current = 0

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
    fxRef.current = createCargoEffects({ reducedMotion: reducedMotionRef.current })
    clockRef.current = 0
    accumulatorRef.current = 0
    overAtRef.current = null
    actionsRef.current = []
    heldKeysRef.current.clear()
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
    actionsRef.current = []
    heldKeysRef.current.clear()
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
    const save = async () => {
      if (stats.score > 0) {
        try {
          await submitHighscore(
            LEADERBOARD_KEY,
            { email: userEmail, score: stats.score, level: stats.level, timestamp: Date.now() },
            { path: [game.difficulty], categories: DIFFICULTIES },
          )
          refresh()
        } catch (error) {
          console.error('Kunne ikke gemme Cargo Stack-score:', error)
          toast.error(scoreSaveFailedMessage(language))
        }
      }
      try {
        await recordGamePlay(PLAY_COUNTS_KEY, userEmail, game.difficulty)
      } catch (error) {
        console.error('Kunne ikke tælle Cargo Stack-runde:', error)
      }
    }
    void save()
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
      const action = KEY_ACTIONS[code]
      const held = HELD_KEYS[code]
      if (!action && !held) return
      event.preventDefault()
      if (event.repeat) return
      if (held) heldKeysRef.current.add(code)
      if (action && actionsRef.current.length < MAX_PENDING_ACTIONS) actionsRef.current.push(action)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      heldKeysRef.current.delete(event.code)
    }
    const handleBlur = () => heldKeysRef.current.clear()
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
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
    rendererRef.current ??= createCargoRenderer(canvas)
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
        marquee={<CargoMarquee reducedMotion={reducedMotion} />}
        labels={ui}
        personalBest={best === null ? null : labels.points(best)}
        topScore={leader ? { value: labels.points(leader.score), holder: leader.teamCode ? `${leader.displayName} (${leader.teamCode})` : leader.displayName } : null}
        difficulties={DIFFICULTIES.map((id) => ({ id, detail: labels.menu.difficultyDetail[id] }))}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        controls={[
          { keys: ['←', '→'], label: labels.menu.controls.move },
          { keys: ['↑', 'Z'], label: labels.menu.controls.rotate },
          { keys: ['↓'], label: labels.menu.controls.softDrop },
          { keys: [labels.menu.spaceKey], label: labels.menu.controls.hardDrop },
          { keys: ['C', 'Shift'], label: labels.menu.controls.hold },
          { keys: ['P'], label: labels.menu.controls.pause },
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
            { label: labels.stats.lines, value: labels.points(result.stats.lines) },
            { label: labels.stats.tetrises, value: String(result.stats.tetrises) },
            { label: labels.stats.tspins, value: String(result.stats.tspins) },
            { label: labels.stats.maxCombo, value: String(result.stats.maxCombo) },
            { label: labels.stats.pieces, value: labels.points(result.stats.pieces) },
          ]}
          onRetry={startGame}
          onMenu={() => goTo('menu')}
        />
      )}
    </ArcadeStage>
  )
}
