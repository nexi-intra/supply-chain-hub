import { useState, useEffect, useRef, useCallback } from 'react'
import { WaveSine, Trophy, X, Lightning, Speedometer, Fire, Flame, Crown, Medal, Star, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useKV } from '@/hooks/useKV'
import { useLanguage } from '@/contexts/LanguageContext'
import { upsertInNestedKvArray } from '@/lib/kvArrays'
import { useCrossTeamLeaderboard, mergeNestedLeaderboard, type CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
// 'dying' keeps the render loop alive for the death animation before the results screen.
type GameState = 'menu' | 'playing' | 'dying' | 'ended'
type Direction = 'up' | 'down' | 'left' | 'right'

interface Cell {
  x: number
  y: number
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

interface User {
  email: string
  fullName: string
}

const GRID = 22
const CELL = 26
const BOARD = GRID * CELL

const DIFFICULTY_SETTINGS = {
  easy: {
    tickMs: 150,
    label: { en: 'Easy', da: 'Let' },
    description: { en: 'Relaxed pace', da: 'Roligt tempo' },
    icon: Speedometer,
    color: 'text-green-500',
    bgGradient: 'from-green-500/20 to-green-600/20',
    borderColor: 'border-green-500/30',
    glowColor: 'shadow-green-500/20',
  },
  medium: {
    tickMs: 110,
    label: { en: 'Medium', da: 'Mellem' },
    description: { en: 'Balanced', da: 'Afbalanceret' },
    icon: Lightning,
    color: 'text-yellow-500',
    bgGradient: 'from-yellow-500/20 to-yellow-600/20',
    borderColor: 'border-yellow-500/30',
    glowColor: 'shadow-yellow-500/20',
  },
  hard: {
    tickMs: 80,
    label: { en: 'Hard', da: 'Svær' },
    description: { en: 'Fast slither', da: 'Hurtig slange' },
    icon: Fire,
    color: 'text-red-500',
    bgGradient: 'from-red-500/20 to-red-600/20',
    borderColor: 'border-red-500/30',
    glowColor: 'shadow-red-500/20',
  },
  expert: {
    tickMs: 58,
    label: { en: 'Expert', da: 'Ekspert' },
    description: { en: 'Lightning fast!', da: 'Lynhurtig!' },
    icon: Flame,
    color: 'text-purple-500',
    bgGradient: 'from-purple-500/20 to-purple-600/20',
    borderColor: 'border-purple-500/30',
    glowColor: 'shadow-purple-500/20',
  },
}

const DIR_VECTORS: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

// Golden bonus fruit: appears occasionally, worth 5 apples, disappears if not eaten in time.
const GOLDEN_CHANCE = 0.14
const GOLDEN_LIFETIME_TICKS = 55

interface NeonSnakeProps {
  userEmail?: string
}

export function NeonSnake({ userEmail = 'guest@example.com' }: NeonSnakeProps = {}) {
  const { language } = useLanguage()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [gameState, setGameState] = useState<GameState>('menu')
  const [score, setScore] = useState(0)
  const [applesEaten, setApplesEaten] = useState(0)
  const [users, setUsers] = useState<User[]>([])
  const [globalLeaderboard, setGlobalLeaderboard] = useKV<GlobalLeaderboard>('neon-snake-global-leaderboard', {
    easy: [],
    medium: [],
    hard: [],
    expert: [],
  })

  // Éngangs-migrering: gamle entries manglede `id` (indført for atomare opdateringer) —
  // uden den kan slet/rediger i manager-panelet ikke finde entry'en igen.
  useEffect(() => {
    if (!globalLeaderboard) return
    const needsMigration = (Object.values(globalLeaderboard) as LeaderboardEntry[][]).some((board) =>
      board.some((entry) => !entry.id)
    )
    if (!needsMigration) return
    const migrated: GlobalLeaderboard = {
      easy: (globalLeaderboard.easy || []).map((e) => ({ ...e, id: e.id || e.email })),
      medium: (globalLeaderboard.medium || []).map((e) => ({ ...e, id: e.id || e.email })),
      hard: (globalLeaderboard.hard || []).map((e) => ({ ...e, id: e.id || e.email })),
      expert: (globalLeaderboard.expert || []).map((e) => ({ ...e, id: e.id || e.email })),
    }
    setGlobalLeaderboard(migrated)
    window.kv.set('neon-snake-global-leaderboard', migrated)
  }, [globalLeaderboard, setGlobalLeaderboard])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)

  const gameStateRef = useRef<GameState>('menu')
  const difficultyRef = useRef<Difficulty>('medium')
  const snakeRef = useRef<Cell[]>([])
  const directionRef = useRef<Direction>('right')
  const inputQueueRef = useRef<Direction[]>([])
  const appleRef = useRef<Cell>({ x: 5, y: 5 })
  const goldenRef = useRef<{ cell: Cell; ticksLeft: number } | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const scoreRef = useRef(0)
  const applesRef = useRef(0)
  const frameRef = useRef(0)
  const shakeRef = useRef(0)
  const flashRef = useRef(0)
  const deadRef = useRef(false)

  useEffect(() => {
    const loadUsers = async () => {
      const usersData = await window.kv.get<Record<string, { email: string; fullName: string }>>('users')
      setUsers(usersData ? Object.values(usersData).map((u) => ({ email: u.email, fullName: u.fullName })) : [])
    }
    loadUsers()
  }, [])

  const getDisplayName = (email: string) => users.find((u) => u.email === email)?.fullName ?? email.split('@')[0]

  // Storage-rækkefølgen garanteres ikke sorteret (atomar upsert tilføjer bare i
  // slutningen) — sortér altid ved læsning, så rangnumre/medaljer er korrekte.
  // Fase 8/9 "Highscores på tværs": fletter alle andre teams' samme sværhedsgrad ind.
  const { otherTeams } = useCrossTeamLeaderboard<GlobalLeaderboard>('neon-snake-global-leaderboard')
  const getSortedBoard = (diff: Difficulty): CrossTeamEntry[] => {
    const ownUsers = Object.fromEntries(users.map((u) => [u.email, { fullName: u.fullName }]))
    return mergeNestedLeaderboard(globalLeaderboard, ownUsers, otherTeams, diff)
  }

  const getCurrentHighScore = () => {
    const board = getSortedBoard(difficulty)
    return board.length > 0 ? board[0].score : 0
  }

  const getUserRankForDifficulty = (diff: Difficulty): number | null => {
    const board = getSortedBoard(diff)
    const index = board.findIndex((entry) => !entry.teamCode && entry.email === userEmail)
    return index !== -1 ? index + 1 : null
  }

  const spawnParticles = (cx: number, cy: number, count: number, colors: string[], speed: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const velocity = speed * (0.4 + Math.random() * 0.8)
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 26 + Math.random() * 18,
        maxLife: 44,
        size: 2 + Math.random() * 3.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
  }

  const randomFreeCell = (): Cell => {
    const occupied = new Set(snakeRef.current.map((c) => `${c.x},${c.y}`))
    occupied.add(`${appleRef.current.x},${appleRef.current.y}`)
    if (goldenRef.current) occupied.add(`${goldenRef.current.cell.x},${goldenRef.current.cell.y}`)
    let cell: Cell
    do {
      cell = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }
    } while (occupied.has(`${cell.x},${cell.y}`))
    return cell
  }

  const endGame = useCallback(async (finalScore: number) => {
    setGameState('ended')
    gameStateRef.current = 'ended'
    setScore(finalScore)
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (!userEmail) return

    try {
      const currentLeaderboard = (await window.kv.get<GlobalLeaderboard>('neon-snake-global-leaderboard')) || {
        easy: [], medium: [], hard: [], expert: [],
      }
      const diff = difficultyRef.current
      const board = currentLeaderboard[diff] || []
      const existing = board.find((entry) => entry.email === userEmail)

      if (!existing || finalScore > existing.score) {
        const updatedBoard = await upsertInNestedKvArray<LeaderboardEntry>(
          'neon-snake-global-leaderboard',
          [diff],
          [{ id: userEmail, email: userEmail, score: finalScore, timestamp: Date.now() }],
        )
        setGlobalLeaderboard({ ...currentLeaderboard, [diff]: updatedBoard })
      }
    } catch (error) {
      console.error('Error saving Neon Snake score:', error)
    }

    try {
      const playCounts = (await window.kv.get<Record<string, Record<Difficulty, number>>>('neon-snake-play-counts')) || {}
      if (!playCounts[userEmail]) playCounts[userEmail] = { easy: 0, medium: 0, hard: 0, expert: 0 }
      playCounts[userEmail][difficultyRef.current] = (playCounts[userEmail][difficultyRef.current] || 0) + 1
      await window.kv.set('neon-snake-play-counts', playCounts)
    } catch (error) {
      console.error('Error tracking Neon Snake play count:', error)
    }
  }, [userEmail, setGlobalLeaderboard])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const shakeX = shakeRef.current > 0.1 ? (Math.random() - 0.5) * shakeRef.current : 0
    const shakeY = shakeRef.current > 0.1 ? (Math.random() - 0.5) * shakeRef.current : 0

    ctx.save()
    ctx.translate(shakeX, shakeY)

    // Background: dark with a slow hue-shifting radial glow that follows the score.
    const hue = (140 + scoreRef.current * 3 + frameRef.current * 0.06) % 360
    ctx.fillStyle = '#0a0f1c'
    ctx.fillRect(-8, -8, BOARD + 16, BOARD + 16)
    const bgGlow = ctx.createRadialGradient(BOARD / 2, BOARD / 2, 60, BOARD / 2, BOARD / 2, BOARD * 0.75)
    bgGlow.addColorStop(0, `hsla(${hue}, 70%, 22%, 0.35)`)
    bgGlow.addColorStop(1, 'rgba(10, 15, 28, 0)')
    ctx.fillStyle = bgGlow
    ctx.fillRect(0, 0, BOARD, BOARD)

    // Subtle grid
    ctx.strokeStyle = 'rgba(120, 160, 255, 0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL, 0)
      ctx.lineTo(i * CELL, BOARD)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * CELL)
      ctx.lineTo(BOARD, i * CELL)
      ctx.stroke()
    }

    // Apple: pulsing red orb with glow
    const pulse = 1 + Math.sin(frameRef.current * 0.12) * 0.12
    const ax = appleRef.current.x * CELL + CELL / 2
    const ay = appleRef.current.y * CELL + CELL / 2
    ctx.shadowColor = '#ff4d6d'
    ctx.shadowBlur = 18
    ctx.fillStyle = '#ff4d6d'
    ctx.beginPath()
    ctx.arc(ax, ay, (CELL / 2 - 5) * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(ax - 3, ay - 4, 2.6, 0, Math.PI * 2)
    ctx.fill()

    // Golden bonus fruit: spinning star with countdown ring
    if (goldenRef.current) {
      const g = goldenRef.current
      const gx = g.cell.x * CELL + CELL / 2
      const gy = g.cell.y * CELL + CELL / 2
      const spin = frameRef.current * 0.08
      ctx.save()
      ctx.translate(gx, gy)
      ctx.rotate(spin)
      ctx.shadowColor = '#ffd93b'
      ctx.shadowBlur = 22
      ctx.fillStyle = '#ffd93b'
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const outer = (i * 2 * Math.PI) / 5 - Math.PI / 2
        const inner = outer + Math.PI / 5
        const r1 = CELL / 2 - 3
        const r2 = r1 * 0.45
        ctx.lineTo(Math.cos(outer) * r1, Math.sin(outer) * r1)
        ctx.lineTo(Math.cos(inner) * r2, Math.sin(inner) * r2)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.shadowBlur = 0
      // Countdown ring
      ctx.strokeStyle = 'rgba(255, 217, 59, 0.7)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(gx, gy, CELL / 2 + 2, -Math.PI / 2, -Math.PI / 2 + (g.ticksLeft / GOLDEN_LIFETIME_TICKS) * Math.PI * 2)
      ctx.stroke()
    }

    // Snake: neon gradient body with glow, rounded segments, eyes on head
    const snake = snakeRef.current
    for (let i = snake.length - 1; i >= 0; i--) {
      const seg = snake[i]
      const t = i / Math.max(1, snake.length - 1)
      const segHue = (hue + 40 + t * 60) % 360
      const sx = seg.x * CELL
      const sy = seg.y * CELL
      const inset = 2 + t * 1.5
      ctx.shadowColor = `hsl(${segHue}, 90%, 60%)`
      ctx.shadowBlur = i === 0 ? 20 : 10
      ctx.fillStyle = deadRef.current
        ? `hsla(0, 70%, ${45 - t * 12}%, 1)`
        : `hsl(${segHue}, 85%, ${62 - t * 18}%)`
      const radius = i === 0 ? 8 : 6
      ctx.beginPath()
      ctx.roundRect(sx + inset, sy + inset, CELL - inset * 2, CELL - inset * 2, radius)
      ctx.fill()
    }
    ctx.shadowBlur = 0

    // Eyes on the head, oriented by travel direction
    if (snake.length > 0) {
      const head = snake[0]
      const dir = DIR_VECTORS[directionRef.current]
      const hx = head.x * CELL + CELL / 2
      const hy = head.y * CELL + CELL / 2
      const perp = { x: -dir.y, y: dir.x }
      for (const side of [-1, 1]) {
        const ex = hx + dir.x * 4 + perp.x * 5 * side
        const ey = hy + dir.y * 4 + perp.y * 5 * side
        ctx.fillStyle = 'white'
        ctx.beginPath()
        ctx.arc(ex, ey, 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0a0f1c'
        ctx.beginPath()
        ctx.arc(ex + dir.x * 1.4, ey + dir.y * 1.4, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Particles
    for (const p of particlesRef.current) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Score-flash overlay when eating
    if (flashRef.current > 0.02) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashRef.current * 0.12})`
      ctx.fillRect(0, 0, BOARD, BOARD)
    }

    // Neon border
    ctx.strokeStyle = `hsla(${hue}, 90%, 60%, 0.65)`
    ctx.lineWidth = 3
    ctx.shadowColor = `hsl(${hue}, 90%, 60%)`
    ctx.shadowBlur = 12
    ctx.strokeRect(1.5, 1.5, BOARD - 3, BOARD - 3)
    ctx.shadowBlur = 0

    ctx.restore()
  }, [])

  const tick = useCallback(() => {
    const snake = snakeRef.current

    // Apply at most one queued direction per tick (prevents 180° double-turn deaths).
    while (inputQueueRef.current.length > 0) {
      const next = inputQueueRef.current.shift()!
      if (next !== OPPOSITE[directionRef.current] && next !== directionRef.current) {
        directionRef.current = next
        break
      }
    }

    const dir = DIR_VECTORS[directionRef.current]
    const head = snake[0]
    const newHead = { x: head.x + dir.x, y: head.y + dir.y }

    const hitWall = newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID
    const hitSelf = snake.some((seg, i) => i < snake.length - 1 && seg.x === newHead.x && seg.y === newHead.y)

    if (hitWall || hitSelf) {
      deadRef.current = true
      shakeRef.current = 16
      const cx = (hitWall ? head.x : newHead.x) * CELL + CELL / 2
      const cy = (hitWall ? head.y : newHead.y) * CELL + CELL / 2
      spawnParticles(cx, cy, 40, ['#ff4d6d', '#ff8fa3', '#ffd93b', '#ffffff'], 4.5)
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(60)
      setTimeout(() => endGame(scoreRef.current), 500)
      gameStateRef.current = 'dying'
      return
    }

    snake.unshift(newHead)

    const ateApple = newHead.x === appleRef.current.x && newHead.y === appleRef.current.y
    const ateGolden = goldenRef.current && newHead.x === goldenRef.current.cell.x && newHead.y === goldenRef.current.cell.y

    if (ateApple) {
      scoreRef.current += 1
      applesRef.current += 1
      setScore(scoreRef.current)
      setApplesEaten(applesRef.current)
      flashRef.current = 1
      spawnParticles(newHead.x * CELL + CELL / 2, newHead.y * CELL + CELL / 2, 14, ['#ff4d6d', '#ff8fa3', '#ffffff'], 3)
      appleRef.current = randomFreeCell()
      if (!goldenRef.current && Math.random() < GOLDEN_CHANCE) {
        goldenRef.current = { cell: randomFreeCell(), ticksLeft: GOLDEN_LIFETIME_TICKS }
      }
    } else if (ateGolden) {
      scoreRef.current += 5
      applesRef.current += 1
      setScore(scoreRef.current)
      setApplesEaten(applesRef.current)
      flashRef.current = 1
      shakeRef.current = 6
      spawnParticles(newHead.x * CELL + CELL / 2, newHead.y * CELL + CELL / 2, 30, ['#ffd93b', '#fff3b0', '#ffffff'], 4)
      goldenRef.current = null
    } else {
      snake.pop()
    }

    if (goldenRef.current) {
      goldenRef.current.ticksLeft -= 1
      if (goldenRef.current.ticksLeft <= 0) goldenRef.current = null
    }
  }, [endGame])

  const loop = useCallback((timestamp: number) => {
    if (gameStateRef.current !== 'playing' && gameStateRef.current !== 'dying') return

    frameRef.current++
    if (gameStateRef.current === 'playing' && timestamp - lastTickRef.current >= DIFFICULTY_SETTINGS[difficultyRef.current].tickMs) {
      lastTickRef.current = timestamp
      tick()
    }

    particlesRef.current = particlesRef.current
      .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.12, life: p.life - 1 }))
      .filter((p) => p.life > 0)
    shakeRef.current *= 0.88
    flashRef.current *= 0.86

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw, tick])

  const queueDirection = useCallback((dir: Direction) => {
    if (gameStateRef.current !== 'playing') return
    if (inputQueueRef.current.length < 3) inputQueueRef.current.push(dir)
  }, [])

  const startGame = () => {
    difficultyRef.current = difficulty
    const startY = Math.floor(GRID / 2)
    snakeRef.current = [
      { x: 6, y: startY },
      { x: 5, y: startY },
      { x: 4, y: startY },
    ]
    directionRef.current = 'right'
    inputQueueRef.current = []
    appleRef.current = { x: 14, y: startY }
    goldenRef.current = null
    particlesRef.current = []
    scoreRef.current = 0
    applesRef.current = 0
    frameRef.current = 0
    shakeRef.current = 0
    flashRef.current = 0
    deadRef.current = false
    lastTickRef.current = 0
    setScore(0)
    setApplesEaten(0)
    gameStateRef.current = 'playing'
    setGameState('playing')

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }

  const quitGame = () => {
    gameStateRef.current = 'menu'
    setGameState('menu')
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current !== 'playing') return
      const map: Record<string, Direction> = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowDown: 'down', KeyS: 'down',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
      }
      const dir = map[e.code]
      if (dir) {
        e.preventDefault()
        queueDirection(dir)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [queueDirection])

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-card via-primary/5 to-accent/5 border-2">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg">
              <WaveSine size={32} weight="duotone" className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Neon Snake
              </h2>
              <p className="text-sm text-muted-foreground">
                {language === 'da'
                  ? 'Spis æbler, voks dig lang — og undgå at bide dig selv!'
                  : language === 'fi' ? 'Syö omenat, kasva pitkäksi ja älä pure itseäsi!' : 'Eat apples, grow long — and don\u2019t bite yourself!'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center p-4 rounded-lg bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/20">
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
              <div className="flex items-center justify-center gap-4 flex-wrap">
                {(Object.keys(DIFFICULTY_SETTINGS) as Difficulty[]).map((diff) => {
                  const setting = DIFFICULTY_SETTINGS[diff]
                  const Icon = setting.icon
                  const isSelected = difficulty === diff

                  return (
                    <div
                      key={diff}
                      onClick={() => setDifficulty(diff)}
                      className={`group relative cursor-pointer rounded-xl p-6 transition-all duration-300 min-w-[140px] ${
                        isSelected
                          ? `bg-gradient-to-br ${setting.bgGradient} border-2 ${setting.borderColor} shadow-lg ${setting.glowColor}`
                          : 'bg-card border-2 border-border hover:border-border/60 hover:shadow-md'
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
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                {language === 'da'
                  ? 'Styr med piletasterne eller WASD. Æble = 1 point, gylden stjerne = 5 point!'
                  : language === 'fi' ? 'Ohjaa nuolinäppäimillä tai WASD. Apple = 1 piste, kultainen tähti = 5 pistettä!' : 'Steer with arrow keys or WASD. Apple = 1 point, golden star = 5 points!'}
              </p>
              <Button onClick={startGame} size="lg" className="px-8 bg-gradient-to-r from-primary to-accent hover:opacity-90">
                {language === 'da' ? 'Start spil' : language === 'fi' ? 'Käynnistä peli' : 'Start Game'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {gameState === 'playing' && (
        <Card className="p-0 overflow-hidden border-2 border-primary/30 shadow-2xl">
          <div className="relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 border-b-2 border-primary/30">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/10 to-primary/5" />
            <div className="relative flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="relative px-5 py-3 rounded-xl bg-gradient-to-br from-primary/20 to-accent/30 border-2 border-primary/40 backdrop-blur-sm">
                  <div className="text-[10px] text-primary-foreground/70 uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
                    <Trophy size={12} weight="fill" />
                    {language === 'da' ? 'Point' : language === 'fi' ? 'Pistemäärä' : 'Score'}
                  </div>
                  <div className="text-3xl font-black bg-gradient-to-br from-white to-primary-foreground bg-clip-text text-transparent drop-shadow-lg">
                    {score}
                  </div>
                </div>
                <div className="relative px-5 py-3 rounded-xl bg-gradient-to-br from-accent/20 to-yellow-500/20 border-2 border-accent/40 backdrop-blur-sm">
                  <div className="text-[10px] text-accent-foreground/70 uppercase tracking-widest font-bold mb-1">
                    {language === 'da' ? 'Længde' : language === 'fi' ? 'Pituus' : 'Length'}
                  </div>
                  <div className="text-3xl font-black text-yellow-400 drop-shadow-lg">
                    {3 + applesEaten}
                  </div>
                </div>
                <div className="relative px-5 py-3 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-primary/40 backdrop-blur-sm">
                  <div className="text-[10px] text-primary-foreground/70 uppercase tracking-widest font-bold mb-1">
                    {language === 'da' ? 'Bedste' : language === 'fi' ? 'Paras' : 'Best'}
                  </div>
                  <div className="text-3xl font-black text-white drop-shadow-lg">
                    {getCurrentHighScore()}
                  </div>
                </div>
              </div>

              <Button
                onClick={quitGame}
                variant="destructive"
                size="lg"
                className="shadow-xl hover:shadow-2xl transition-shadow font-bold"
              >
                <X size={20} weight="bold" className="mr-2" />
                {language === 'da' ? 'Stop' : language === 'fi' ? 'Lopeta' : 'Quit'}
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 bg-slate-950 py-6">
            <canvas
              ref={canvasRef}
              width={BOARD}
              height={BOARD}
              className="rounded-lg shadow-2xl border-2 border-primary/20"
              style={{ maxWidth: '100%', height: 'auto' }}
            />

            <div className="grid grid-cols-3 gap-1.5">
              <div />
              <Button variant="outline" size="icon" onClick={() => queueDirection('up')} className="bg-background/80">
                <ArrowUp size={20} weight="bold" />
              </Button>
              <div />
              <Button variant="outline" size="icon" onClick={() => queueDirection('left')} className="bg-background/80">
                <ArrowLeft size={20} weight="bold" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => queueDirection('down')} className="bg-background/80">
                <ArrowDown size={20} weight="bold" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => queueDirection('right')} className="bg-background/80">
                <ArrowRight size={20} weight="bold" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {gameState === 'ended' && (
        <Card className="p-6 text-center bg-gradient-to-br from-primary/10 via-accent/10 to-background border-2 border-primary/20">
          <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {language === 'da' ? 'Spil slut!' : language === 'fi' ? 'Peli loppui!' : 'Game Over!'}
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-muted-foreground">
                {language === 'da' ? 'Din sidste score' : language === 'fi' ? 'Lopputulos' : 'Your final score'}
              </p>
              <p className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {score}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'da' ? `Slangen blev ${3 + applesEaten} felter lang` : language === 'fi' ? `Käärmeesi kasvoi ${3 + applesEaten}-segmentteihin` : `Your snake grew to ${3 + applesEaten} segments`}
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
            <Button onClick={startGame} size="lg" className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
              {language === 'da' ? 'Prøv igen' : language === 'fi' ? 'Toista' : 'Play Again'}
            </Button>
            <Button onClick={() => setGameState('menu')} variant="outline" size="lg">
              {language === 'da' ? 'Tilbage til menu' : language === 'fi' ? 'Takaisin valikkoon' : 'Back to Menu'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-gradient-to-br from-accent/5 via-primary/5 to-card border-2 border-accent/20">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-full bg-gradient-to-br from-accent to-primary shadow-lg">
            <Crown size={28} weight="duotone" className="text-accent-foreground" />
          </div>
          <div>
            <h3 className="text-xl font-bold bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">
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
            const userEntry = leaderboard.find((entry) => !entry.teamCode && entry.email === userEmail)

            return (
              <div key={diff} className="space-y-3">
                <div className={`p-4 rounded-lg border-2 transition-all ${
                  userRank === 1
                    ? 'border-accent bg-gradient-to-br from-accent/10 to-primary/10 shadow-lg'
                    : 'border-border bg-gradient-to-br from-card to-muted/20'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-lg ${
                      diff === 'easy' ? 'bg-gradient-to-br from-green-500/20 to-green-600/20' :
                      diff === 'medium' ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/20' :
                      diff === 'hard' ? 'bg-gradient-to-br from-red-500/20 to-red-600/20' :
                      'bg-gradient-to-br from-purple-500/20 to-purple-600/20'
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
