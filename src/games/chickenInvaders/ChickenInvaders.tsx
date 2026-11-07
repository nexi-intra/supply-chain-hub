import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useNestedLeaderboard } from '@/hooks/useLeaderboard'
import { mergeNestedLeaderboard, useCrossTeamLeaderboard, type CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'
import { useAutoPauseOnBlur } from '@/hooks/useAutoPauseOnBlur'
import { useGameOverRetry } from '@/hooks/useGameOverRetry'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { PauseOverlay } from '@/components/PauseOverlay'
import { ArcadeReadyOverlay } from '@/components/ArcadeReadyOverlay'
import { ArcadeCabinetMenu } from '@/components/arcade/ArcadeCabinetMenu'
import { ArcadeHallOfFame } from '@/components/arcade/ArcadeHallOfFame'
import { ArcadeStage, type StageSize } from '@/components/arcade/ArcadeStage'
import { ArcadeGameOver } from '@/components/arcade/ArcadeGameOver'
import { arcadeLabels, personalBest } from '@/components/arcade/arcadeCabinet'
import { recordGamePlay, scoreSaveFailedMessage, submitHighscore, type LeaderboardEntry } from '@/lib/leaderboards'
import { DIFFICULTIES, FIELD, STEP_SECONDS, type Difficulty } from './config'
import { createGame, getStats, jumpToWave, stepGame, type GameInput, type GameState, type GameStats } from './engine'
import { applyEvents, createEffects, rocketTrails, updateEffects, type EffectsState } from './effects'
import { createRenderer, type Renderer } from './render'
import { chickenLabels } from './labels'
import { pointerToField } from './pointer'
import { createArcadeAudio, loadSoundEnabled, safeLocalStorage, saveSoundEnabled, type ArcadeAudio } from './audio'
import { ChickenMarquee } from './ChickenMarquee'

const LEADERBOARD_KEY = 'chicken-invaders-global-leaderboard'
// Runderne tælles fortsat på Chickeninvasions nøgle, så spillestatistikken lever videre.
const PLAY_COUNTS_KEY = 'endless-dodger-play-counts'
const THEME = 'chicken'
const MAX_STEPS_PER_FRAME = 5
const MAX_FRAME_SECONDS = 0.1
const GAME_OVER_DELAY_SECONDS = 1.3
const MOVE_LEFT = new Set(['ArrowLeft', 'KeyA'])
const MOVE_RIGHT = new Set(['ArrowRight', 'KeyD'])
const MOVE_UP = new Set(['ArrowUp', 'KeyW'])
const MOVE_DOWN = new Set(['ArrowDown', 'KeyS'])
const isMoveKey = (code: string) => MOVE_LEFT.has(code) || MOVE_RIGHT.has(code) || MOVE_UP.has(code) || MOVE_DOWN.has(code)
const anyHeld = (keys: Set<string>, codes: Set<string>) => [...codes].some((code) => keys.has(code))

type Phase = 'menu' | 'ready' | 'playing' | 'paused' | 'ended'

interface ChickenDevHook {
  jumpToWave: (wave: number) => boolean
  invulnerable: () => void
  snapshot: () => Record<string, unknown> | null
}

declare global {
  interface Window {
    __chickenInvadersDev?: ChickenDevHook
  }
}

interface Result {
  stats: GameStats
  isNewRecord: boolean
}

export function ChickenInvaders({ userEmail }: { userEmail?: string }) {
  const { language } = useLanguage()
  const labels = useMemo(() => chickenLabels(language), [language])
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
  const fxRef = useRef<EffectsState | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const audioRef = useRef<ArcadeAudio | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const lastFrameRef = useRef(0)
  const accumulatorRef = useRef(0)
  const clockRef = useRef(0)
  const overAtRef = useRef<number | null>(null)
  const keysRef = useRef(new Set<string>())
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const pointerFireRef = useRef(false)
  const missileQueuedRef = useRef(false)
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
    const audio = createArcadeAudio({ enabled: loadSoundEnabled(safeLocalStorage()) })
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
    if (next) audioRef.current?.play('pickup')
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
    const pointer = pointerRef.current
    const input: GameInput = {
      left: anyHeld(keys, MOVE_LEFT),
      right: anyHeld(keys, MOVE_RIGHT),
      up: anyHeld(keys, MOVE_UP),
      down: anyHeld(keys, MOVE_DOWN),
      fire: keys.has('Space') || pointerFireRef.current,
      missile: missileQueuedRef.current,
      pointerX: pointer?.x ?? null,
      pointerY: pointer?.y ?? null,
    }
    missileQueuedRef.current = false
    return input
  }

  const runFrame = useCallback((now: number) => {
    if (phaseRef.current !== 'playing') return
    const game = gameRef.current
    const fx = fxRef.current
    if (!game || !fx) return

    const elapsed = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrameRef.current) / 1000))
    lastFrameRef.current = now
    clockRef.current += elapsed
    updateEffects(fx, elapsed)

    if (game.status === 'playing' && fx.hitStop <= 0) {
      accumulatorRef.current += elapsed
      let steps = 0
      while (accumulatorRef.current >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME && game.status === 'playing') {
        const events = stepGame(game, readInput())
        if (events.length > 0) {
          applyEvents(fx, events, labelsRef.current, game.ship)
          audioRef.current?.playEvents(events)
        }
        rocketTrails(fx, game)
        accumulatorRef.current -= STEP_SECONDS
        steps++
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
    fxRef.current = createEffects({ reducedMotion: reducedMotionRef.current })
    clockRef.current = 0
    accumulatorRef.current = 0
    overAtRef.current = null
    keysRef.current.clear()
    pointerRef.current = null
    pointerFireRef.current = false
    missileQueuedRef.current = false
    setResult(null)
    goTo('ready')
    drawFrame()
  }, [drawFrame, goTo])

  const launch = useCallback(() => {
    if (phaseRef.current !== 'ready') return
    goTo('playing')
    lastFrameRef.current = performance.now()
    animationRef.current = requestAnimationFrame(runFrame)
  }, [goTo, runFrame])

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    goTo('paused')
    cancelAnimationFrame(animationRef.current)
    keysRef.current.clear()
    pointerFireRef.current = false
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
    setResult({ stats, isNewRecord: !game.practice && stats.score > 0 && (previousBest === null || stats.score > previousBest) })
    goTo('ended')
    if (!userEmail || game.practice) return
    // The game-over list shows the score at once; the score and the play count are saved at the same time, in the
    // background (each write takes up to 90 s on the shared drive). A failed save takes the score off the list again.
    const entry = { email: userEmail, score: stats.score, timestamp: Date.now() }
    showScore(entry, game.difficulty)
    void submitHighscore(LEADERBOARD_KEY, entry, { path: [game.difficulty], categories: DIFFICULTIES }).then(refresh, error => {
      console.error('Kunne ikke gemme Chicken Invaders-score:', error)
      toast.error(scoreSaveFailedMessage(language))
      refresh()
    })
    void recordGamePlay(PLAY_COUNTS_KEY, userEmail, game.difficulty).catch(error => console.error('Kunne ikke tælle Chicken Invaders-runde:', error))
  }

  useGameOverRetry(phase === 'ended', startGame)
  useAutoPauseOnBlur(phase === 'playing', pause)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = phaseRef.current
      if (current === 'menu' || current === 'ended' || event.altKey || event.ctrlKey || event.metaKey) return
      const { code } = event
      if (current === 'ready') {
        if (code === 'Space') {
          event.preventDefault()
          if (!event.repeat) launch()
        }
        return
      }
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
      if (code === 'KeyM') {
        event.preventDefault()
        if (!event.repeat) missileQueuedRef.current = true
        return
      }
      const moving = isMoveKey(code)
      if (moving) pointerRef.current = null
      if (moving || code === 'Space') {
        event.preventDefault()
        keysRef.current.add(code)
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
  }, [launch, pause, resume])

  useEffect(() => () => cancelAnimationFrame(animationRef.current), [])

  // Kun i udviklingsbygget: verifikationsscriptet kan hoppe til en bølge; spillet bliver en øvelse uden highscore.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const hook: ChickenDevHook = {
      jumpToWave: (wave) => {
        const game = gameRef.current
        if (!game || game.status !== 'playing') return false
        jumpToWave(game, wave)
        return true
      },
      invulnerable: () => {
        const game = gameRef.current
        if (!game) return
        game.practice = true
        game.ship.invulnerableUntil = Infinity
      },
      snapshot: () => {
        const game = gameRef.current
        if (!game) return null
        return { wave: game.wave, kind: game.spec.kind, templateId: game.spec.templateId, boss: game.boss?.id ?? null, hazard: game.hazard?.kind ?? null, bonus: game.bonus?.stage ?? null, enemies: game.enemies.length, ship: { x: game.ship.x, y: game.ship.y }, kills: game.stats.kills, shots: game.stats.shotsFired, practice: game.practice, status: game.status }
      },
    }
    window.__chickenInvadersDev = hook
    return () => {
      if (window.__chickenInvadersDev === hook) delete window.__chickenInvadersDev
    }
  }, [])

  const stageVisible = phase !== 'menu'
  useEffect(() => {
    if (!stageVisible) rendererRef.current = null
  }, [stageVisible])

  const fitCanvas = useCallback((size: StageSize) => {
    const canvas = canvasRef.current
    if (!canvas) return
    rendererRef.current ??= createRenderer(canvas)
    rendererRef.current.resize(size.width, window.devicePixelRatio || 1)
    if (phaseRef.current !== 'playing') drawFrame()
  }, [drawFrame])

  const toLogical = (event: ReactPointerEvent<HTMLDivElement>) =>
    pointerToField(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())

  const board = boards[difficulty]
  const best = personalBest(board, userEmail)
  const leader = board[0]

  return phase === 'menu' ? (
    <div className="space-y-6">
      <ArcadeCabinetMenu
        theme={THEME}
        title={labels.menu.title}
        tagline={labels.menu.tagline}
        marquee={<ChickenMarquee reducedMotion={reducedMotion} />}
        labels={ui}
        personalBest={best === null ? null : labels.points(best)}
        topScore={leader ? { value: labels.points(leader.score), holder: leader.teamCode ? `${leader.displayName} (${leader.teamCode})` : leader.displayName } : null}
        difficulties={DIFFICULTIES.map((id) => ({ id, detail: labels.menu.difficultyDetail[id] }))}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        controls={[
          { keys: ['WASD', '←↑↓→'], label: labels.menu.controls.move },
          { keys: [labels.menu.spaceKey], label: labels.menu.controls.fire },
          { keys: ['M'], label: labels.menu.controls.missile },
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
          if (phaseRef.current === 'playing') pointerRef.current = toLogical(event)
        },
        onPointerDown: (event) => {
          if (phaseRef.current !== 'playing' || event.button !== 0) return
          pointerRef.current = toLogical(event)
          pointerFireRef.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        },
        onPointerUp: () => {
          pointerFireRef.current = false
        },
        onPointerCancel: () => {
          pointerFireRef.current = false
        },
        onLostPointerCapture: () => {
          pointerFireRef.current = false
        },
      }}
    >
      <canvas ref={canvasRef} role="img" aria-label={labels.menu.title} />
      {phase === 'ready' && <ArcadeReadyOverlay onStart={launch} />}
      {phase === 'paused' && <PauseOverlay onResume={resume} />}
      {phase === 'ended' && result && (
        <ArcadeGameOver
          labels={ui}
          score={result.stats.score}
          formatScore={labels.points}
          isNewRecord={result.isNewRecord}
          reducedMotion={reducedMotion}
          stats={[
            { label: labels.stats.wave, value: String(result.stats.wave) },
            { label: labels.stats.sector, value: labels.sectorReached(result.stats.sector, result.stats.round) },
            { label: labels.stats.kills, value: labels.points(result.stats.kills) },
            { label: labels.stats.accuracy, value: labels.percent(result.stats.accuracy) },
            { label: labels.stats.bestChain, value: String(result.stats.bestChain) },
            { label: labels.stats.bosses, value: String(result.stats.distinctBosses) },
          ]}
          onRetry={startGame}
          onMenu={() => goTo('menu')}
        />
      )}
    </ArcadeStage>
  )
}
