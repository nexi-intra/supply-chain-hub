import { useState, useEffect, useRef, useCallback } from 'react'
import { Bird, Trophy, X, Lightning, Speedometer, Fire, Flame, Crown, Medal, Star } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useNestedLeaderboard } from '@/hooks/useLeaderboard'
import { useAutoPauseOnBlur } from '@/hooks/useAutoPauseOnBlur'
import { PauseOverlay } from '@/components/PauseOverlay'
import { ArcadeReadyOverlay } from '@/components/ArcadeReadyOverlay'
import { recordGamePlay, scoreSaveFailedMessage, submitHighscore } from '@/lib/leaderboards'
import { nextParticleId } from '@/lib/utils'
import { useCrossTeamLeaderboard, mergeNestedLeaderboard, type CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'

const LEADERBOARD_KEY = 'nexi-flyer-global-leaderboard'
const PLAY_COUNTS_KEY = 'nexi-flyer-play-counts'
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const

interface Pipe {
  id: number
  x: number
  gapY: number
  passed: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface LeaderboardEntry {
  id: string
  email: string
  score: number
  timestamp: number
}

interface GlobalLeaderboard {
  easy: LeaderboardEntry[]
  medium: LeaderboardEntry[]
  hard: LeaderboardEntry[]
  expert: LeaderboardEntry[]
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
type GameState = 'menu' | 'playing' | 'paused' | 'ended'

const DIFFICULTY_SETTINGS = {
  easy: {
    gap: 195,
    speed: 2.6,
    spawnDistance: 260,
    label: { en: 'Easy', da: 'Let' },
    description: { en: 'Wide gaps', da: 'Brede huller' },
    icon: Speedometer,
    color: 'text-green-500',
    bgGradient: 'from-green-500/20 to-green-600/20',
    borderColor: 'border-green-500/30',
    glowColor: 'shadow-green-500/20',
  },
  medium: {
    gap: 165,
    speed: 3.4,
    spawnDistance: 250,
    label: { en: 'Medium', da: 'Mellem' },
    description: { en: 'Balanced', da: 'Afbalanceret' },
    icon: Lightning,
    color: 'text-yellow-500',
    bgGradient: 'from-yellow-500/20 to-yellow-600/20',
    borderColor: 'border-yellow-500/30',
    glowColor: 'shadow-yellow-500/20',
  },
  hard: {
    gap: 140,
    speed: 4.2,
    spawnDistance: 235,
    label: { en: 'Hard', da: 'Svær' },
    description: { en: 'Tight gaps', da: 'Smalle huller' },
    icon: Fire,
    color: 'text-red-500',
    bgGradient: 'from-red-500/20 to-red-600/20',
    borderColor: 'border-red-500/30',
    glowColor: 'shadow-red-500/20',
  },
  expert: {
    gap: 118,
    speed: 5.2,
    spawnDistance: 220,
    label: { en: 'Expert', da: 'Ekspert' },
    description: { en: 'Very tight!', da: 'Meget smalt!' },
    icon: Flame,
    color: 'text-purple-500',
    bgGradient: 'from-purple-500/20 to-purple-600/20',
    borderColor: 'border-purple-500/30',
    glowColor: 'shadow-purple-500/20',
  }
}

const GAME_WIDTH = 480
const GAME_HEIGHT = 600
const GROUND_HEIGHT = 70
const BIRD_X = 120
const BIRD_HITBOX_RADIUS = 15
const BIRD_VISUAL_RADIUS = 18
const PIPE_WIDTH = 70
const GRAVITY = 0.45
const FLAP_VELOCITY = -8.2
const GROUND_TILE_WIDTH = 40

const SKY_PALETTES = [
  { top: '#7ec8ff', bottom: '#bfe9ff', night: false },
  { top: '#ff9a76', bottom: '#ffd9a0', night: false },
  { top: '#8a7fd6', bottom: '#c9b8ff', night: false },
  { top: '#12203f', bottom: '#3f5f8a', night: true },
]

interface User {
  email: string
  fullName: string
  role: string
  phone?: string
}

interface NexiFlyerProps {
  userEmail?: string
}

export function NexiFlyer({ userEmail = 'guest@example.com' }: NexiFlyerProps = {}) {
  const { language } = useLanguage()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [gameState, setGameState] = useState<GameState>('menu')
  const [awaitingFirstFlap, setAwaitingFirstFlap] = useState(false)
  const [score, setScore] = useState(0)
  const [users, setUsers] = useState<User[]>([])
  const { leaderboard: globalLeaderboard, refresh: refreshLeaderboard } = useNestedLeaderboard(LEADERBOARD_KEY, DIFFICULTIES)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  const gameStateRef = useRef<GameState>('menu')
  const difficultyRef = useRef<Difficulty>('medium')
  const startedRef = useRef(false)
  const birdYRef = useRef(GAME_HEIGHT / 2)
  const birdVelocityRef = useRef(0)
  const pipesRef = useRef<Pipe[]>([])
  const particlesRef = useRef<Particle[]>([])
  const distanceAccRef = useRef(0)
  const frameCountRef = useRef(0)
  const groundOffsetRef = useRef(0)
  const shakeRef = useRef(0)
  const scoreRef = useRef(0)
  const flapAnimRef = useRef(0)
  // Sand mens mellemrum/pil-op er trykket ned - forhindrer at OS'ets tastatur-
  // gentagelse (holder man tasten nede, fyrer keydown igen og igen) sender
  // flere flap() af sted for ÉT fysisk tryk, hvilket fik fuglen til at skyde
  // ukontrolleret opad i stedet for ét kontrolleret hop.
  const flapKeyHeldRef = useRef(false)
  const starsRef = useRef<{ x: number; y: number; size: number }[]>(
    Array.from({ length: 40 }, () => ({
      x: Math.random() * GAME_WIDTH,
      y: Math.random() * (GAME_HEIGHT - GROUND_HEIGHT - 60),
      size: Math.random() * 2 + 0.5
    }))
  )

  useEffect(() => {
    const loadUsers = async () => {
      const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: string; phone?: string }>>('users')
      if (usersData) {
        setUsers(Object.values(usersData).map(u => ({ email: u.email, fullName: u.fullName, role: u.role || 'user', phone: u.phone })))
      } else {
        setUsers([])
      }
    }
    loadUsers()
  }, [])

  const getDisplayName = (email: string) => {
    const user = users.find(u => u.email === email)
    return user ? user.fullName : email.split('@')[0]
  }

  // Storage-rækkefølgen garanteres ikke sorteret (atomar upsert tilføjer bare i
  // slutningen) — sortér altid ved læsning, så rangnumre/medaljer er korrekte.
  // Fase 8/9 "Highscores på tværs": fletter alle andre teams' samme sværhedsgrad ind.
  const { otherTeams } = useCrossTeamLeaderboard<GlobalLeaderboard>(LEADERBOARD_KEY)
  const getSortedBoard = (diff: Difficulty): CrossTeamEntry[] => {
    const ownUsers = Object.fromEntries(users.map(u => [u.email, { fullName: u.fullName }]))
    return mergeNestedLeaderboard(globalLeaderboard, ownUsers, otherTeams, diff)
  }

  const getCurrentHighScore = () => {
    const board = getSortedBoard(difficulty)
    return board.length > 0 ? board[0].score : 0
  }

  const getTopScoreForDifficulty = (diff: Difficulty): number => {
    const board = getSortedBoard(diff)
    return board.length > 0 ? board[0].score : 0
  }

  const getUserRankForDifficulty = (diff: Difficulty): number | null => {
    const board = getSortedBoard(diff)
    const index = board.findIndex(entry => !entry.teamCode && entry.email === userEmail)
    return index !== -1 ? index + 1 : null
  }

  const spawnParticles = (x: number, y: number, count: number, colors: string[], spread: number, speed: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const velocity = speed * (0.4 + Math.random() * 0.6)
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * velocity * (spread / 10),
        vy: Math.sin(angle) * velocity * (spread / 10) - 1,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)]
      })
    }
  }

  const spawnPipe = () => {
    const gap = DIFFICULTY_SETTINGS[difficultyRef.current].gap
    const topMargin = 70
    const bottomMargin = GAME_HEIGHT - GROUND_HEIGHT - 70
    const minGapY = topMargin + gap / 2
    const maxGapY = bottomMargin - gap / 2
    const gapY = minGapY + Math.random() * Math.max(1, maxGapY - minGapY)

    pipesRef.current.push({
      id: nextParticleId(),
      x: GAME_WIDTH + PIPE_WIDTH,
      gapY,
      passed: false
    })
  }

  const checkPipeCollision = (birdY: number, pipe: Pipe): boolean => {
    const birdLeft = BIRD_X - BIRD_HITBOX_RADIUS
    const birdRight = BIRD_X + BIRD_HITBOX_RADIUS
    const birdTop = birdY - BIRD_HITBOX_RADIUS
    const birdBottom = birdY + BIRD_HITBOX_RADIUS

    if (birdRight > pipe.x && birdLeft < pipe.x + PIPE_WIDTH) {
      const gap = DIFFICULTY_SETTINGS[difficultyRef.current].gap
      const gapTop = pipe.gapY - gap / 2
      const gapBottom = pipe.gapY + gap / 2
      if (birdTop < gapTop || birdBottom > gapBottom) {
        return true
      }
    }
    return false
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const shakeX = shakeRef.current > 0.1 ? (Math.random() - 0.5) * shakeRef.current : 0
    const shakeY = shakeRef.current > 0.1 ? (Math.random() - 0.5) * shakeRef.current : 0

    ctx.save()
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    ctx.translate(shakeX, shakeY)

    const paletteIndex = Math.floor(scoreRef.current / 5) % SKY_PALETTES.length
    const palette = SKY_PALETTES[paletteIndex]

    const skyGradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT - GROUND_HEIGHT)
    skyGradient.addColorStop(0, palette.top)
    skyGradient.addColorStop(1, palette.bottom)
    ctx.fillStyle = skyGradient
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    if (palette.night) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      starsRef.current.forEach(star => {
        ctx.globalAlpha = 0.5 + Math.sin(frameCountRef.current * 0.05 + star.x) * 0.5
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.fillStyle = '#f4f1de'
      ctx.arc(GAME_WIDTH - 80, 90, 34, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.arc(GAME_WIDTH - 80, 80, 30, 0, Math.PI * 2)
      ctx.fill()
    }

    const cloudOffset = (frameCountRef.current * 0.3) % (GAME_WIDTH + 200)
    ctx.fillStyle = palette.night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)'
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 220) - cloudOffset + GAME_WIDTH + 200) % (GAME_WIDTH + 200) - 100
      const cy = 60 + (i % 2) * 90 + Math.sin(i) * 20
      ctx.beginPath()
      ctx.ellipse(cx, cy, 45, 18, 0, 0, Math.PI * 2)
      ctx.ellipse(cx + 30, cy + 6, 32, 14, 0, 0, Math.PI * 2)
      ctx.ellipse(cx - 28, cy + 8, 30, 13, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    pipesRef.current.forEach(pipe => {
      const gap = DIFFICULTY_SETTINGS[difficultyRef.current].gap
      const gapTop = pipe.gapY - gap / 2
      const gapBottom = pipe.gapY + gap / 2

      const drawPipeSegment = (x: number, y: number, w: number, h: number) => {
        const grad = ctx.createLinearGradient(x, 0, x + w, 0)
        grad.addColorStop(0, '#2e8b3f')
        grad.addColorStop(0.15, '#5fd46e')
        grad.addColorStop(0.5, '#3fae52')
        grad.addColorStop(1, '#1f6b2c')
        ctx.fillStyle = grad
        ctx.fillRect(x, y, w, h)
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, w, h)
      }

      drawPipeSegment(pipe.x, 0, PIPE_WIDTH, Math.max(0, gapTop))
      ctx.fillStyle = '#245c30'
      ctx.fillRect(pipe.x - 6, Math.max(0, gapTop) - 26, PIPE_WIDTH + 12, 26)
      ctx.strokeRect(pipe.x - 6, Math.max(0, gapTop) - 26, PIPE_WIDTH + 12, 26)

      const bottomY = Math.max(gapBottom, 0)
      drawPipeSegment(pipe.x, bottomY, PIPE_WIDTH, GAME_HEIGHT - GROUND_HEIGHT - bottomY)
      ctx.fillStyle = '#245c30'
      ctx.fillRect(pipe.x - 6, bottomY, PIPE_WIDTH + 12, 26)
      ctx.strokeRect(pipe.x - 6, bottomY, PIPE_WIDTH + 12, 26)
    })

    particlesRef.current.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    const groundY = GAME_HEIGHT - GROUND_HEIGHT
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, GAME_HEIGHT)
    groundGrad.addColorStop(0, '#8fd45e')
    groundGrad.addColorStop(0.15, '#6bb83f')
    groundGrad.addColorStop(0.15, '#c9a15a')
    groundGrad.addColorStop(1, '#8a6a3a')
    ctx.fillStyle = groundGrad
    ctx.fillRect(0, groundY, GAME_WIDTH, GROUND_HEIGHT)

    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    const tileOffset = groundOffsetRef.current % GROUND_TILE_WIDTH
    for (let x = -tileOffset; x < GAME_WIDTH; x += GROUND_TILE_WIDTH) {
      ctx.fillRect(x, groundY + 14, GROUND_TILE_WIDTH / 2, 6)
    }

    const birdY = birdYRef.current
    const velocity = birdVelocityRef.current
    const angle = Math.max(-0.5, Math.min(1.3, velocity * 0.08))

    ctx.save()
    ctx.translate(BIRD_X, birdY)
    ctx.rotate(angle)

    const wingPhase = Math.sin(flapAnimRef.current * 0.6) * 0.6

    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.beginPath()
    ctx.ellipse(2, BIRD_VISUAL_RADIUS + 4, BIRD_VISUAL_RADIUS * 0.7, 5, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.rotate(wingPhase)
    const wingGrad = ctx.createLinearGradient(-10, -6, 6, 10)
    wingGrad.addColorStop(0, '#ffb703')
    wingGrad.addColorStop(1, '#fb8500')
    ctx.fillStyle = wingGrad
    ctx.beginPath()
    ctx.ellipse(-4, 2, 13, 8, 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    const bodyGrad = ctx.createRadialGradient(-5, -5, 2, 0, 0, BIRD_VISUAL_RADIUS)
    bodyGrad.addColorStop(0, '#fff3b0')
    bodyGrad.addColorStop(0.6, '#ffd93b')
    bodyGrad.addColorStop(1, '#ffb300')
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.arc(0, 0, BIRD_VISUAL_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#ff8c42'
    ctx.beginPath()
    ctx.moveTo(BIRD_VISUAL_RADIUS - 4, -2)
    ctx.lineTo(BIRD_VISUAL_RADIUS + 12, 2)
    ctx.lineTo(BIRD_VISUAL_RADIUS - 4, 6)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(7, -6, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.arc(9, -6, 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    ctx.restore()

    ctx.save()
    ctx.font = 'bold 52px sans-serif'
    ctx.textAlign = 'center'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.fillStyle = 'white'
    ctx.strokeText(String(scoreRef.current), GAME_WIDTH / 2, 90)
    ctx.fillText(String(scoreRef.current), GAME_WIDTH / 2, 90)
    ctx.restore()
  }, [])

  const endGame = useCallback(async (finalScore: number) => {
    setGameState('ended')
    gameStateRef.current = 'ended'
    setScore(finalScore)

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (!userEmail) return

    try {
      await submitHighscore(
        LEADERBOARD_KEY,
        { email: userEmail, score: finalScore, timestamp: Date.now() },
        { path: [difficultyRef.current], categories: DIFFICULTIES },
      )
      refreshLeaderboard()
    } catch (error) {
      console.error('Error saving Nexi Flyer score:', error)
      toast.error(scoreSaveFailedMessage(language))
    }

    try {
      await recordGamePlay(PLAY_COUNTS_KEY, userEmail, difficultyRef.current)
    } catch (error) {
      console.error('Error tracking Nexi Flyer play count:', error)
    }
  }, [userEmail, refreshLeaderboard, language])

  const triggerDeath = useCallback(() => {
    if (!startedRef.current && gameStateRef.current !== 'playing') return
    startedRef.current = false
    shakeRef.current = 14
    spawnParticles(BIRD_X, birdYRef.current, 26, ['#ffd93b', '#ffb300', '#ff8c42', '#ffffff'], 10, 6)
    setTimeout(() => {
      endGame(scoreRef.current)
    }, 420)
  }, [endGame])

  const step = useCallback(() => {
    if (gameStateRef.current !== 'playing') return

    frameCountRef.current++
    const speed = DIFFICULTY_SETTINGS[difficultyRef.current].speed
    groundOffsetRef.current += startedRef.current ? speed : speed * 0.4

    if (startedRef.current) {
      birdVelocityRef.current += GRAVITY
      birdYRef.current += birdVelocityRef.current

      if (birdYRef.current - BIRD_HITBOX_RADIUS < 0) {
        birdYRef.current = BIRD_HITBOX_RADIUS
        birdVelocityRef.current = 0
      }

      pipesRef.current = pipesRef.current
        .map(p => ({ ...p, x: p.x - speed }))
        .filter(p => p.x > -PIPE_WIDTH - 20)

      distanceAccRef.current += speed
      if (distanceAccRef.current >= DIFFICULTY_SETTINGS[difficultyRef.current].spawnDistance) {
        distanceAccRef.current = 0
        spawnPipe()
      }

      pipesRef.current.forEach(p => {
        if (!p.passed && p.x + PIPE_WIDTH < BIRD_X - BIRD_HITBOX_RADIUS) {
          p.passed = true
          scoreRef.current += 1
          setScore(scoreRef.current)
          spawnParticles(BIRD_X, birdYRef.current, 8, ['#ffd93b', '#ffffff'], 6, 3)
        }
      })

      const groundY = GAME_HEIGHT - GROUND_HEIGHT
      let died = birdYRef.current + BIRD_HITBOX_RADIUS >= groundY
      if (!died) {
        for (const p of pipesRef.current) {
          if (checkPipeCollision(birdYRef.current, p)) {
            died = true
            break
          }
        }
      }

      if (died) {
        triggerDeath()
      }
    } else {
      birdYRef.current = GAME_HEIGHT / 2 + Math.sin(frameCountRef.current * 0.08) * 8
    }

    particlesRef.current = particlesRef.current
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, life: p.life - 1 }))
      .filter(p => p.life > 0)

    shakeRef.current *= 0.9
    if (shakeRef.current < 0.05) shakeRef.current = 0

    flapAnimRef.current += startedRef.current ? 1 : 0.3

    draw()
    animationFrameRef.current = requestAnimationFrame(step)
  }, [draw, triggerDeath])

  const flap = useCallback(() => {
    if (gameStateRef.current !== 'playing') return
    startedRef.current = true
    setAwaitingFirstFlap(false)
    birdVelocityRef.current = FLAP_VELOCITY
    flapAnimRef.current = 0
    spawnParticles(BIRD_X - 10, birdYRef.current + 6, 4, ['#ffffff', '#ffd93b'], 3, 2)
  }, [])

  const startGame = () => {
    difficultyRef.current = difficulty
    scoreRef.current = 0
    setScore(0)
    birdYRef.current = GAME_HEIGHT / 2
    birdVelocityRef.current = 0
    pipesRef.current = []
    particlesRef.current = []
    distanceAccRef.current = 0
    frameCountRef.current = 0
    shakeRef.current = 0
    startedRef.current = false
    setAwaitingFirstFlap(true)
    flapKeyHeldRef.current = false
    gameStateRef.current = 'playing'
    setGameState('playing')

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = requestAnimationFrame(step)
  }

  const quitGame = () => {
    gameStateRef.current = 'menu'
    setGameState('menu')
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }

  const pauseGame = useCallback(() => {
    if (gameStateRef.current !== 'playing') return
    gameStateRef.current = 'paused'
    setGameState('paused')
    flapKeyHeldRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const resumeGame = useCallback(() => {
    if (gameStateRef.current !== 'paused') return
    gameStateRef.current = 'playing'
    setGameState('playing')
    animationFrameRef.current = requestAnimationFrame(step)
  }, [step])

  useAutoPauseOnBlur(gameState === 'playing', pauseGame)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current === 'paused') {
        if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Enter') {
          e.preventDefault()
          resumeGame()
        }
        return
      }
      if (e.code === 'KeyP' && gameStateRef.current === 'playing') {
        e.preventDefault()
        pauseGame()
        return
      }
      if (e.code !== 'Space' && e.key !== 'ArrowUp') return
      e.preventDefault()
      // e.repeat daekker OS-gentagelse; flapKeyHeldRef daekker desuden det
      // sjaeldne tilfaelde af to keydown i traek uden en keyup imellem.
      if (e.repeat || flapKeyHeldRef.current) return
      flapKeyHeldRef.current = true
      flap()
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'ArrowUp') flapKeyHeldRef.current = false
    }
    // Alt-tab eller klik uden for vinduet mens tasten er nede giver ellers
    // ingen keyup - naeste faktiske tryk ville saa fejlagtigt blive ignoreret.
    const handleBlur = () => { flapKeyHeldRef.current = false }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [flap, pauseGame, resumeGame])

  return (
    <div className="space-y-6">
      <Card className="arcade-menu p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary">
              <Bird size={32} weight="duotone" className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">
                Nexi Flyer
              </h2>
              <p className="text-sm text-muted-foreground">
                {language === 'da'
                  ? 'Flyv gennem rørene så langt som muligt!'
                  : language === 'fi' ? 'Lennä putkien läpi niin pitkälle kuin voit!' : 'Fly through the pipes as far as you can!'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center p-4 rounded-md bg-secondary border">
              <div className="text-sm text-muted-foreground font-semibold">
                {language === 'da' ? 'Højeste score' : language === 'fi' ? 'Korkeat tulokset' : 'High Score'}
              </div>
              <div className="text-2xl font-bold text-primary flex items-center gap-2 justify-center mt-1">
                <Trophy size={24} weight="fill" className="text-accent" />
                {getCurrentHighScore()}
              </div>
            </div>
          </div>
        </div>

        {gameState === 'menu' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  {language === 'da' ? 'Vælg sværhedsgrad' : language === 'fi' ? 'Valitse vaikeudet' : 'Select Difficulty'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-center sm:gap-4 sm:flex-wrap">
                {(Object.keys(DIFFICULTY_SETTINGS) as Difficulty[]).map((diff) => {
                  const setting = DIFFICULTY_SETTINGS[diff]
                  const Icon = setting.icon
                  const isSelected = difficulty === diff

                  return (
                    <button type="button" aria-pressed={isSelected}
                      key={diff}
                      onClick={() => setDifficulty(diff)}
                      className={`group relative rounded-md p-4 sm:p-6 transition-colors min-w-0 w-full sm:w-auto sm:min-w-[140px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        isSelected
                          ? `bg-secondary border-2 ${setting.borderColor}`
                          : 'bg-card border-2 border-border hover:border-primary/40'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <Icon
                          size={28}
                          weight="duotone"
                          className={isSelected ? setting.color : `${setting.color} opacity-60 group-hover:opacity-100`}
                        />
                        <div className="flex flex-col items-center gap-1">
                          <span className={`font-bold text-base ${isSelected ? setting.color : 'text-foreground'}`}>
                            {setting.label[language as 'en' | 'da']}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {setting.description[language as 'en' | 'da']}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                {language === 'da'
                  ? 'Tryk mellemrum, pil op eller klik for at flyve. Undgå rørene!'
                  : language === 'fi' ? 'Paina tilaa, nuolta ylös tai napsauta läppä. Vältä putkia!' : 'Press space, arrow up, or click to flap. Avoid the pipes!'}
              </p>
              <Button onClick={startGame} size="lg" className="px-8">
                {language === 'da' ? 'Start spil' : language === 'fi' ? 'Käynnistä peli' : 'Start Game'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {(gameState === 'playing' || gameState === 'paused') && (
        <Card className="p-0 overflow-hidden">
          <div className="relative bg-slate-900 p-6 border-b border-slate-700">
            <div className="hidden" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div className="relative group">
                  <div className="hidden" />
                  <div className="relative px-6 py-3 rounded-md bg-white/10 border border-white/20">
                    <div className="text-[11px] text-primary-foreground/70 font-semibold mb-1 flex items-center gap-1">
                      <Trophy size={12} weight="fill" />
                      {language === 'da' ? 'Point' : language === 'fi' ? 'Pistemäärä' : 'Score'}
                    </div>
                    <div className="text-4xl font-bold text-white">
                      {score}
                    </div>
                  </div>
                </div>
                <div className="h-14 w-px bg-border" />
                <div className="relative group">
                  <div className="relative px-5 py-3 rounded-md bg-white/10 border border-white/20">
                    <div className="text-[11px] text-accent-foreground/70 font-semibold mb-1 flex items-center gap-1">
                      <Crown size={12} weight="fill" />
                      {language === 'da' ? 'Bedste' : language === 'fi' ? 'Paras' : 'Best'}
                    </div>
                    <div className="text-4xl font-bold text-yellow-400">
                      {getCurrentHighScore()}
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={quitGame}
                variant="destructive"
                size="lg"
                className="font-bold"
              >
                <X size={20} weight="bold" className="mr-2" />
                {language === 'da' ? 'Stop' : language === 'fi' ? 'Lopeta' : 'Quit'}
              </Button>
            </div>
          </div>

          <div className="flex justify-center bg-slate-950 py-4">
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                onClick={flap}
                onTouchStart={(e) => { e.preventDefault(); flap() }}
                className="cursor-pointer rounded-md border border-white/15 touch-none"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
              {gameState === 'playing' && awaitingFirstFlap && <ArcadeReadyOverlay onStart={flap} />}
              {gameState === 'paused' && <PauseOverlay onResume={resumeGame} />}
            </div>
          </div>
        </Card>
      )}

      {gameState === 'ended' && (
        <Card className="p-6 text-center">
          <h3 className="text-2xl font-semibold mb-2 text-foreground">
            {language === 'da' ? 'Spil slut!' : language === 'fi' ? 'Peli loppui!' : 'Game Over!'}
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-muted-foreground">
                {language === 'da' ? 'Din sidste score' : language === 'fi' ? 'Lopputulos' : 'Your final score'}
              </p>
              <p className="text-4xl font-semibold text-foreground">
                {score}
              </p>
            </div>
          </div>
          {score > 0 && score >= getCurrentHighScore() && (
            <p className="text-sm text-accent font-semibold mt-4 flex items-center gap-2 justify-center">
              <Trophy size={20} weight="fill" />
              {language === 'da' ? '🎉 Ny højeste score!' : language === 'fi' ? '- Uusi huipputulos!' : '🎉 New high score!'}
            </p>
          )}
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button onClick={startGame} size="lg" className="">
              {language === 'da' ? 'Prøv igen' : language === 'fi' ? 'Toista' : 'Play Again'}
            </Button>
            <Button onClick={() => setGameState('menu')} variant="outline" size="lg">
              {language === 'da' ? 'Tilbage til menu' : language === 'fi' ? 'Takaisin valikkoon' : 'Back to Menu'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="arcade-leaderboard p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-full bg-primary">
            <Crown size={28} weight="duotone" className="text-accent-foreground" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">
              {language === 'da' ? 'Global resultattavle' : language === 'fi' ? 'Maailmanlaajuinen Leaderboard' : 'Global Leaderboard'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {language === 'da' ? 'Konkurer med andre medarbejdere!' : language === 'fi' ? 'Kilpaile muiden työntekijöiden kanssa!' : 'Compete with other employees!'}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-4 md:grid-cols-2">
          {(Object.keys(DIFFICULTY_SETTINGS) as Difficulty[]).map((diff) => {
            const setting = DIFFICULTY_SETTINGS[diff]
            const Icon = setting.icon
            const leaderboard = getSortedBoard(diff)
            const userRank = getUserRankForDifficulty(diff)
            const userEntry = leaderboard.find(entry => !entry.teamCode && entry.email === userEmail)

            return (
              <div key={diff} className="space-y-3">
                <div className={`arcade-score-column p-4 rounded-md border-2 transition-colors ${
                  userRank === 1
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-lg ${
                      diff === 'easy' ? 'bg-green-500/15' :
                      diff === 'medium' ? 'bg-yellow-500/15' :
                      diff === 'hard' ? 'bg-red-500/15' :
                      'bg-purple-500/15'
                    }`}>
                      <Icon size={24} weight="duotone" className={setting.color} />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">
                        {setting.label[language as 'en' | 'da']}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {setting.description[language as 'en' | 'da']}
                      </div>
                    </div>
                  </div>

                  {leaderboard.length > 0 ? (
                    <div className="space-y-2">
                      {leaderboard.slice(0, 10).map((entry, index) => {
                        const isCurrentUser = !entry.teamCode && entry.email === userEmail
                        const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600']
                        const rankIcons = [Crown, Medal, Star]
                        const RankIcon = index < 3 ? rankIcons[index] : null

                        return (
                          <div
                            key={`${entry.teamCode || 'own'}-${entry.id}`}
                            className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                              isCurrentUser ? 'bg-primary/10 border border-primary/30 shadow-md' : 'bg-muted/30'
                            }`}
                          >
                            <div className="flex items-center justify-center w-8 h-8 shrink-0">
                              {RankIcon ? (
                                <RankIcon size={20} weight="fill" className={rankColors[index]} />
                              ) : (
                                <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-medium truncate ${isCurrentUser ? 'text-primary font-bold' : 'text-foreground'}`}>
                                {entry.displayName}{entry.teamCode && <span className="text-muted-foreground font-normal"> ({entry.teamCode})</span>}
                              </div>
                            </div>
                            <div className={`text-lg font-bold shrink-0 tabular-nums ${isCurrentUser ? 'text-primary' : 'text-muted-foreground'}`}>
                              {entry.score}
                            </div>
                          </div>
                        )
                      })}

                      {userEntry && userRank && userRank > 10 && (
                        <>
                          <div className="text-center py-1">
                            <span className="text-xs text-muted-foreground">...</span>
                          </div>
                          <div className="flex items-center gap-3 p-2 rounded-lg bg-primary/10 border border-primary/30 shadow-md">
                            <div className="flex items-center justify-center w-8 h-8 shrink-0">
                              <span className="text-sm font-bold text-primary">#{userRank}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-primary truncate">
                                {userEntry.displayName}
                              </div>
                            </div>
                            <div className="text-lg font-bold text-primary">{userEntry.score}</div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <Trophy size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {language === 'da' ? 'Ingen scores endnu' : language === 'fi' ? 'Ei tuloksia vielä' : 'No scores yet'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === 'da' ? 'Vær den første!' : language === 'fi' ? 'Ole ensimmäinen!' : 'Be the first!'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
