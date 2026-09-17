import { useState, useEffect, useRef, useMemo } from 'react'
import { RocketLaunch, Trophy, X, Lightning, Speedometer, Fire, Flame, Crown, Medal, Star, ShieldCheck, Lightning as RapidFireIcon, Heart } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useKV } from '@/hooks/useKV'
import { useLanguage } from '@/contexts/LanguageContext'
import { upsertInNestedKvArray } from '@/lib/kvArrays'
import { nextParticleId } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useCrossTeamLeaderboard, mergeNestedLeaderboard, type CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'

interface Chicken {
  id: number
  row: number
  col: number
  x: number
  y: number
  alive: boolean
  variant: number
}

interface Egg {
  id: number
  x: number
  y: number
}

interface Bullet {
  id: number
  x: number
  y: number
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface PowerUp {
  id: number
  x: number
  y: number
  type: 'shield' | 'rapidfire'
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
type GameState = 'menu' | 'playing' | 'ended'

const DIFFICULTY_SETTINGS = {
  easy: {
    rows: 3,
    cols: 6,
    chickenSpeed: 1.3,
    descentStep: 16,
    eggChance: 0.0016,
    eggSpeed: 2.6,
    fireCooldown: 260,
    label: { en: 'Easy', da: 'Let' },
    description: { en: 'Small flock', da: 'Lille flok' },
    icon: Speedometer,
    color: 'text-green-500',
    bgGradient: 'from-green-500/20 to-green-600/20',
    borderColor: 'border-green-500/30',
    glowColor: 'shadow-green-500/20',
  },
  medium: {
    rows: 4,
    cols: 7,
    chickenSpeed: 1.7,
    descentStep: 18,
    eggChance: 0.0024,
    eggSpeed: 3.2,
    fireCooldown: 250,
    label: { en: 'Medium', da: 'Mellem' },
    description: { en: 'Balanced', da: 'Afbalanceret' },
    icon: Lightning,
    color: 'text-yellow-500',
    bgGradient: 'from-yellow-500/20 to-yellow-600/20',
    borderColor: 'border-yellow-500/30',
    glowColor: 'shadow-yellow-500/20',
  },
  hard: {
    rows: 4,
    cols: 8,
    chickenSpeed: 2.2,
    descentStep: 20,
    eggChance: 0.0032,
    eggSpeed: 3.8,
    fireCooldown: 240,
    label: { en: 'Hard', da: 'Svær' },
    description: { en: 'Big invasion', da: 'Stor invasion' },
    icon: Fire,
    color: 'text-red-500',
    bgGradient: 'from-red-500/20 to-red-600/20',
    borderColor: 'border-red-500/30',
    glowColor: 'shadow-red-500/20',
  },
  expert: {
    rows: 5,
    cols: 9,
    chickenSpeed: 2.8,
    descentStep: 22,
    eggChance: 0.004,
    eggSpeed: 4.4,
    fireCooldown: 220,
    label: { en: 'Expert', da: 'Ekspert' },
    description: { en: 'Egg storm!', da: 'Æg-storm!' },
    icon: Flame,
    color: 'text-purple-500',
    bgGradient: 'from-purple-500/20 to-purple-600/20',
    borderColor: 'border-purple-500/30',
    glowColor: 'shadow-purple-500/20',
  }
}

const SPACESHIP_SIZE = 50
const SPACESHIP_HITBOX_SIZE = 35
const GAME_AREA_HEIGHT = 600

const CHICKEN_SIZE = 42
const CHICKEN_HITBOX = 34
const FORMATION_MARGIN_X = 30
const FORMATION_TOP = 60
const FORMATION_ROW_SPACING = 54

const BULLET_WIDTH = 5
const BULLET_HEIGHT = 18
const BULLET_SPEED = 13

const EGG_SIZE = 18

const POWERUP_SIZE = 32
const POWERUP_FALL_SPEED = 3
const POWERUP_DROP_CHANCE = 0.12
const RAPIDFIRE_DURATION_MS = 6000
const STAR_COUNT = 60
const STARTING_LIVES = 3

const CHICKEN_VARIANTS = [
  { body: '#fff3d6', comb: '#ff4d6d', beak: '#ffb703' },
  { body: '#ffe8b3', comb: '#e5383b', beak: '#fb8500' },
  { body: '#f5f5f5', comb: '#d90429', beak: '#f77f00' },
]

interface User {
  email: string
  fullName: string
  role: string
  phone?: string
}

interface EndlessDodgerProps {
  userEmail?: string
}

export function EndlessDodger({ userEmail = 'guest@example.com' }: EndlessDodgerProps = {}) {
  const { language } = useLanguage()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [gameState, setGameState] = useState<GameState>('menu')
  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [lives, setLives] = useState(STARTING_LIVES)
  // Spillets bevægelige objekter (skib, høns, æg, kugler, partikler, powerups) lever
  // KUN i refs og tegnes direkte på canvas i rAF-loopet — de er bevidst IKKE React
  // state, da det ville betyde 5+ state-opdateringer og re-renders 60 gange i sekundet.
  const [hasShield, setHasShield] = useState(false)
  const [isRapidFire, setIsRapidFire] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [waveBanner, setWaveBanner] = useState<number | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [globalLeaderboard, setGlobalLeaderboard] = useKV<GlobalLeaderboard>('endless-dodger-global-leaderboard', {
    easy: [],
    medium: [],
    hard: [],
    expert: []
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
    window.kv.set('endless-dodger-global-leaderboard', migrated)
  }, [globalLeaderboard, setGlobalLeaderboard])

  const gameAreaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastCanvasSizeRef = useRef({ width: 0, height: 0 })
  const pendingFirstSpawnRef = useRef(false)
  const animationFrameRef = useRef<number | null>(null)
  const waveBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rapidFireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keysPressed = useRef<Set<string>>(new Set())
  const scoreRef = useRef(0)
  const waveRef = useRef(1)
  const livesRef = useRef(STARTING_LIVES)
  const difficultyRef = useRef<Difficulty>('medium')
  const gameStateRef = useRef<GameState>('menu')
  const hasShieldRef = useRef(false)
  const isRapidFireRef = useRef(false)
  const spaceshipXRef = useRef(0)
  const lastFireTimeRef = useRef(0)
  const thrusterTickRef = useRef(0)

  const chickensRef = useRef<Chicken[]>([])
  const eggsRef = useRef<Egg[]>([])
  const bulletsRef = useRef<Bullet[]>([])
  const particlesRef = useRef<Particle[]>([])
  const powerUpsRef = useRef<PowerUp[]>([])

  const formationOffsetXRef = useRef(0)
  const formationDirRef = useRef<1 | -1>(1)
  const formationDescentRef = useRef(0)
  const formationSpeedRef = useRef(1.5)
  const formationEggChanceRef = useRef(0.002)
  const formationColsRef = useRef(7)
  const formationRectWidthRef = useRef(600)

  const stars = useMemo(() => (
    Array.from({ length: STAR_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      delay: Math.random() * 3,
      duration: 2 + Math.random() * 3
    }))
  ), [])

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
  const { otherTeams } = useCrossTeamLeaderboard<GlobalLeaderboard>('endless-dodger-global-leaderboard')
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

  const spawnParticles = (x: number, y: number, count: number, colors: string[], speed: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const velocity = speed * (0.4 + Math.random() * 0.6)
      particlesRef.current.push({
        id: nextParticleId(),
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 28,
        maxLife: 28,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)]
      })
    }
  }

  const spawnThrusterParticle = (x: number, y: number) => {
    particlesRef.current.push({
      id: nextParticleId(),
      x,
      y,
      vx: (Math.random() - 0.5) * 1.2,
      vy: 1.5 + Math.random(),
      life: 18,
      maxLife: 18,
      size: 2 + Math.random() * 2,
      color: Math.random() > 0.5 ? '#60a5fa' : '#fbbf24'
    })
  }

  const getBaseX = (col: number, cols: number, rectWidth: number) => {
    const spacing = (rectWidth - FORMATION_MARGIN_X * 2) / cols
    return FORMATION_MARGIN_X + col * spacing + spacing / 2 - CHICKEN_SIZE / 2
  }

  const getBaseY = (row: number) => FORMATION_TOP + row * FORMATION_ROW_SPACING

  const getFrontLineChickens = (list: Chicken[]): Chicken[] => {
    const byCol = new Map<number, Chicken>()
    list.forEach(c => {
      if (!c.alive) return
      const existing = byCol.get(c.col)
      if (!existing || c.row > existing.row) {
        byCol.set(c.col, c)
      }
    })
    return Array.from(byCol.values())
  }

  const spawnWave = (waveNumber: number) => {
    const settings = DIFFICULTY_SETTINGS[difficultyRef.current]

    const rows = Math.min(settings.rows + Math.floor((waveNumber - 1) / 3), 6)
    const cols = Math.min(settings.cols + Math.floor((waveNumber - 1) / 2), 10)

    const rectWidth = formationRectWidthRef.current
    formationOffsetXRef.current = 0
    formationDescentRef.current = 0
    formationDirRef.current = 1
    formationSpeedRef.current = settings.chickenSpeed * (1 + (waveNumber - 1) * 0.12)
    formationEggChanceRef.current = settings.eggChance * (1 + (waveNumber - 1) * 0.15)
    formationColsRef.current = cols

    const newChickens: Chicken[] = []
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        newChickens.push({
          id: waveNumber * 10000 + row * 100 + col,
          row,
          col,
          x: getBaseX(col, cols, rectWidth),
          y: getBaseY(row),
          alive: true,
          variant: Math.floor(Math.random() * CHICKEN_VARIANTS.length)
        })
      }
    }

    chickensRef.current = newChickens
    eggsRef.current = []
    bulletsRef.current = []

    setWaveBanner(waveNumber)
    if (waveBannerTimeoutRef.current) clearTimeout(waveBannerTimeoutRef.current)
    waveBannerTimeoutRef.current = setTimeout(() => setWaveBanner(null), 1400)
  }

  const fireBullet = () => {
    if (gameStateRef.current !== 'playing') return
    const settings = DIFFICULTY_SETTINGS[difficultyRef.current]
    const cooldown = isRapidFireRef.current ? settings.fireCooldown * 0.4 : settings.fireCooldown
    const now = Date.now()
    if (now - lastFireTimeRef.current < cooldown) return
    lastFireTimeRef.current = now

    const shipCenterX = spaceshipXRef.current + SPACESHIP_SIZE / 2
    bulletsRef.current.push({
      id: now + Math.random(),
      x: shipCenterX - BULLET_WIDTH / 2,
      y: GAME_AREA_HEIGHT - SPACESHIP_SIZE - 16
    })
  }

  /** Holder canvas' tegne-buffer og CSS-størrelse synkroniseret med det (responsive) spilområde. */
  const syncCanvasSize = (rect: DOMRect) => {
    formationRectWidthRef.current = rect.width
    const canvas = canvasRef.current
    if (!canvas) return
    const width = Math.max(1, Math.round(rect.width))
    const height = GAME_AREA_HEIGHT
    if (lastCanvasSizeRef.current.width === width && lastCanvasSizeRef.current.height === height) return
    lastCanvasSizeRef.current = { width, height }
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const drawChicken = (ctx: CanvasRenderingContext2D, chicken: Chicken) => {
    const variant = CHICKEN_VARIANTS[chicken.variant]
    const wobble = Math.sin(Date.now() / 160 + chicken.col) * 0.12

    ctx.save()
    ctx.translate(chicken.x + CHICKEN_SIZE / 2, chicken.y + CHICKEN_SIZE / 2)
    ctx.scale(1, 1 + wobble)
    ctx.translate(-CHICKEN_SIZE / 2, -CHICKEN_SIZE / 2)

    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    ctx.beginPath()
    ctx.ellipse(10, 26, 5, 8, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = variant.body
    ctx.beginPath()
    ctx.ellipse(21, 24, 15, 13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(21, 12, 9, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = variant.comb
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(14, 6)
    ctx.quadraticCurveTo(16, 0, 19, 6)
    ctx.quadraticCurveTo(21, 1, 23, 6)
    ctx.quadraticCurveTo(26, 0, 28, 6)
    ctx.stroke()

    ctx.fillStyle = variant.beak
    ctx.beginPath()
    ctx.moveTo(28, 12)
    ctx.lineTo(36, 14)
    ctx.lineTo(28, 16)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.arc(25, 10, 1.6, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  const drawEgg = (ctx: CanvasRenderingContext2D, egg: Egg) => {
    const cx = egg.x + EGG_SIZE / 2
    const cy = egg.y + EGG_SIZE / 2
    const rx = (EGG_SIZE / 2) * (7 / 9)
    const ry = (EGG_SIZE / 2) * (8.5 / 9)

    const gradient = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.5, 1, cx, cy, Math.max(rx, ry))
    gradient.addColorStop(0, '#fffef2')
    gradient.addColorStop(1, '#f0e6c8')

    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 0.5
    ctx.stroke()
    ctx.restore()
  }

  const drawBullet = (ctx: CanvasRenderingContext2D, bullet: Bullet) => {
    ctx.save()
    const gradient = ctx.createLinearGradient(bullet.x, bullet.y, bullet.x, bullet.y + BULLET_HEIGHT)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.5, '#22d3ee')
    gradient.addColorStop(1, '#0891b2')
    ctx.fillStyle = gradient
    ctx.shadowColor = '#22d3ee'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.roundRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT, BULLET_WIDTH / 2)
    ctx.fill()
    ctx.restore()
  }

  const drawPowerUp = (ctx: CanvasRenderingContext2D, powerUp: PowerUp) => {
    const cx = powerUp.x + POWERUP_SIZE / 2
    const cy = powerUp.y + POWERUP_SIZE / 2
    const r = POWERUP_SIZE / 2
    const isShield = powerUp.type === 'shield'

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    gradient.addColorStop(0, isShield ? '#60a5fa' : '#fde047')
    gradient.addColorStop(1, isShield ? '#1d4ed8' : '#d97706')

    ctx.save()
    ctx.shadowColor = isShield ? '#60a5fa' : '#fde047'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.stroke()

    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (isShield) {
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy)
      ctx.lineTo(cx - 2, cy + 5)
      ctx.lineTo(cx + 7, cy - 6)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(cx + 2, cy - 8)
      ctx.lineTo(cx - 5, cy + 1)
      ctx.lineTo(cx - 1, cy + 1)
      ctx.lineTo(cx - 3, cy + 8)
      ctx.lineTo(cx + 6, cy - 2)
      ctx.lineTo(cx + 1, cy - 2)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  const drawSpaceship = (ctx: CanvasRenderingContext2D, x: number, hasShieldNow: boolean) => {
    const y = GAME_AREA_HEIGHT - SPACESHIP_SIZE - 10

    if (hasShieldNow) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(x + SPACESHIP_SIZE / 2, y + SPACESHIP_SIZE / 2, SPACESHIP_SIZE / 2 + 8, 0, Math.PI * 2)
      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(96, 165, 250, 0.7)'
      ctx.shadowBlur = 16
      ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 250) * 0.4
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.translate(x, y)
    const gradient = ctx.createLinearGradient(0, 0, 0, SPACESHIP_SIZE)
    gradient.addColorStop(0, '#3b82f6')
    gradient.addColorStop(1, '#8b5cf6')
    ctx.beginPath()
    ctx.moveTo(25, 10)
    ctx.lineTo(40, 42)
    ctx.lineTo(25, 38)
    ctx.lineTo(10, 42)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(25, 28, 4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,255,255,0.8)'
    ctx.fill()
    ctx.restore()
  }

  /** Tegner samtlige spilobjekter (høns, æg, kugler, powerups, partikler, skib) imperativt på canvas hvert frame. */
  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = lastCanvasSizeRef.current.width || formationRectWidthRef.current
    ctx.clearRect(0, 0, width, GAME_AREA_HEIGHT)

    particlesRef.current.forEach(p => {
      ctx.save()
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })

    chickensRef.current.forEach(chicken => {
      if (chicken.alive) drawChicken(ctx, chicken)
    })

    eggsRef.current.forEach(egg => drawEgg(ctx, egg))
    bulletsRef.current.forEach(bullet => drawBullet(ctx, bullet))
    powerUpsRef.current.forEach(powerUp => drawPowerUp(ctx, powerUp))

    drawSpaceship(ctx, spaceshipXRef.current, hasShieldRef.current)
  }

  const startGame = () => {
    difficultyRef.current = difficulty
    scoreRef.current = 0
    waveRef.current = 1
    livesRef.current = STARTING_LIVES
    hasShieldRef.current = false
    isRapidFireRef.current = false
    setScore(0)
    setWave(1)
    setLives(STARTING_LIVES)
    setHasShield(false)
    setIsRapidFire(false)
    particlesRef.current = []
    powerUpsRef.current = []
    chickensRef.current = []
    eggsRef.current = []
    bulletsRef.current = []
    gameStateRef.current = 'playing'
    setGameState('playing')

    // Canvas/spilområdet monter først når React har committet 'playing'-visningen,
    // så vi kan ikke måle gameAreaRef her endnu. I stedet sætter vi et flag som
    // runGameLoop tjekker på sit allerførste tick (hvor ref'en garanteret er klar).
    pendingFirstSpawnRef.current = true

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = requestAnimationFrame(runGameLoop)
  }

  const endGame = async (finalScore: number) => {
    gameStateRef.current = 'ended'
    setGameState('ended')
    setScore(finalScore)

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (rapidFireTimeoutRef.current) {
      clearTimeout(rapidFireTimeoutRef.current)
      rapidFireTimeoutRef.current = null
    }

    if (!userEmail) return

    try {
      const currentLeaderboard = await window.kv.get<GlobalLeaderboard>('endless-dodger-global-leaderboard') || {
        easy: [], medium: [], hard: [], expert: []
      }

      const diff = difficultyRef.current
      const board = currentLeaderboard[diff] || []
      const existing = board.find(entry => entry.email === userEmail)

      if (!existing || finalScore > existing.score) {
        const updatedBoard = await upsertInNestedKvArray<LeaderboardEntry>(
          'endless-dodger-global-leaderboard',
          [diff],
          [{ id: userEmail, email: userEmail, score: finalScore, timestamp: Date.now() }],
        )
        setGlobalLeaderboard({ ...currentLeaderboard, [diff]: updatedBoard })
      }
    } catch (error) {
      console.error('Error saving score:', error)
    }
  }

  const resetGame = () => {
    gameStateRef.current = 'menu'
    setGameState('menu')
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (rapidFireTimeoutRef.current) {
      clearTimeout(rapidFireTimeoutRef.current)
      rapidFireTimeoutRef.current = null
    }
  }

  const triggerDeath = () => {
    gameStateRef.current = 'ended'
    setIsShaking(true)
    spawnParticles(
      spaceshipXRef.current + SPACESHIP_SIZE / 2,
      GAME_AREA_HEIGHT - SPACESHIP_SIZE / 2 - 10,
      30,
      ['#ffd93b', '#f4f1de', '#fb8500', '#ffffff'],
      6
    )

    let frames = 0
    const outroLoop = () => {
      particlesRef.current = particlesRef.current
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.1, life: p.life - 1 }))
        .filter(p => p.life > 0)
      draw()
      frames++
      if (frames < 28) requestAnimationFrame(outroLoop)
    }
    requestAnimationFrame(outroLoop)

    setTimeout(() => setIsShaking(false), 300)
    setTimeout(() => endGame(scoreRef.current), 450)
  }

  const runGameLoop = () => {
    if (!gameAreaRef.current || gameStateRef.current !== 'playing') return

    const rect = gameAreaRef.current.getBoundingClientRect()
    syncCanvasSize(rect)
    const settings = DIFFICULTY_SETTINGS[difficultyRef.current]

    if (pendingFirstSpawnRef.current) {
      pendingFirstSpawnRef.current = false
      spaceshipXRef.current = (rect.width - SPACESHIP_SIZE) / 2
      spawnWave(1)
    }

    const moveSpeed = 9
    if (keysPressed.current.has('arrowleft') || keysPressed.current.has('a')) {
      spaceshipXRef.current = Math.max(0, spaceshipXRef.current - moveSpeed)
    }
    if (keysPressed.current.has('arrowright') || keysPressed.current.has('d')) {
      spaceshipXRef.current = Math.min(rect.width - SPACESHIP_SIZE, spaceshipXRef.current + moveSpeed)
    }
    if (keysPressed.current.has(' ')) {
      fireBullet()
    }

    const cols = formationColsRef.current
    formationOffsetXRef.current += formationSpeedRef.current * formationDirRef.current

    let needDescent = false
    for (const c of chickensRef.current) {
      if (!c.alive) continue
      const bx = getBaseX(c.col, cols, formationRectWidthRef.current)
      const projectedX = bx + formationOffsetXRef.current
      if (projectedX <= 6 || projectedX + CHICKEN_SIZE >= formationRectWidthRef.current - 6) {
        needDescent = true
        break
      }
    }
    if (needDescent) {
      formationDirRef.current = (formationDirRef.current * -1) as 1 | -1
      formationDescentRef.current += settings.descentStep
    }

    let updatedChickens = chickensRef.current.map(c => c.alive ? {
      ...c,
      x: getBaseX(c.col, cols, formationRectWidthRef.current) + formationOffsetXRef.current,
      y: getBaseY(c.row) + formationDescentRef.current
    } : c)

    const invasionLineY = GAME_AREA_HEIGHT - SPACESHIP_SIZE - 40
    const invaded = updatedChickens.some(c => c.alive && c.y + CHICKEN_SIZE >= invasionLineY)
    if (invaded) {
      chickensRef.current = updatedChickens
      draw()
      triggerDeath()
      return
    }

    const frontLine = getFrontLineChickens(updatedChickens)
    if (frontLine.length > 0 && Math.random() < formationEggChanceRef.current * frontLine.length) {
      const shooter = frontLine[Math.floor(Math.random() * frontLine.length)]
      eggsRef.current.push({
        id: nextParticleId(),
        x: shooter.x + CHICKEN_SIZE / 2 - EGG_SIZE / 2,
        y: shooter.y + CHICKEN_SIZE
      })
    }

    eggsRef.current = eggsRef.current
      .map(e => ({ ...e, y: e.y + settings.eggSpeed }))
      .filter(e => e.y < GAME_AREA_HEIGHT)

    bulletsRef.current = bulletsRef.current
      .map(b => ({ ...b, y: b.y - BULLET_SPEED }))
      .filter(b => b.y > -20)

    let scoreDelta = 0
    const remainingBullets: Bullet[] = []
    bulletsRef.current.forEach(bullet => {
      let hit = false
      for (const c of updatedChickens) {
        if (!c.alive) continue
        if (
          bullet.x < c.x + CHICKEN_HITBOX &&
          bullet.x + BULLET_WIDTH > c.x &&
          bullet.y < c.y + CHICKEN_HITBOX &&
          bullet.y + BULLET_HEIGHT > c.y
        ) {
          c.alive = false
          hit = true
          scoreDelta += 10 + waveRef.current * 2
          spawnParticles(c.x + CHICKEN_SIZE / 2, c.y + CHICKEN_SIZE / 2, 14, ['#fff3d6', '#ffb703', '#ff4d6d', '#ffffff'], 5)
          if (Math.random() < POWERUP_DROP_CHANCE) {
            powerUpsRef.current.push({
              id: nextParticleId(),
              x: c.x + CHICKEN_SIZE / 2 - POWERUP_SIZE / 2,
              y: c.y,
              type: Math.random() < 0.5 ? 'shield' : 'rapidfire'
            })
          }
          break
        }
      }
      if (!hit) remainingBullets.push(bullet)
    })
    bulletsRef.current = remainingBullets

    if (scoreDelta > 0) {
      scoreRef.current += scoreDelta
      setScore(scoreRef.current)
    }

    powerUpsRef.current = powerUpsRef.current
      .map(p => ({ ...p, y: p.y + POWERUP_FALL_SPEED }))
      .filter(p => {
        if (p.y > GAME_AREA_HEIGHT) return false
        const shipY = GAME_AREA_HEIGHT - SPACESHIP_SIZE - 10
        const centerX = spaceshipXRef.current + SPACESHIP_SIZE / 2
        const centerY = shipY + SPACESHIP_SIZE / 2
        const pCenterX = p.x + POWERUP_SIZE / 2
        const pCenterY = p.y + POWERUP_SIZE / 2
        const threshold = (SPACESHIP_HITBOX_SIZE + POWERUP_SIZE) / 2
        const collected = Math.abs(centerX - pCenterX) < threshold && Math.abs(centerY - pCenterY) < threshold
        if (collected) {
          if (p.type === 'shield') {
            hasShieldRef.current = true
            setHasShield(true)
          } else {
            isRapidFireRef.current = true
            setIsRapidFire(true)
            if (rapidFireTimeoutRef.current) clearTimeout(rapidFireTimeoutRef.current)
            rapidFireTimeoutRef.current = setTimeout(() => {
              isRapidFireRef.current = false
              setIsRapidFire(false)
            }, RAPIDFIRE_DURATION_MS)
          }
          spawnParticles(pCenterX, pCenterY, 10, p.type === 'shield' ? ['#60a5fa', '#ffffff'] : ['#fbbf24', '#ffffff'], 4)
          return false
        }
        return true
      })

    let eggHit = false
    eggsRef.current = eggsRef.current.filter(egg => {
      const shipY = GAME_AREA_HEIGHT - SPACESHIP_SIZE - 10
      const centerX = spaceshipXRef.current + SPACESHIP_SIZE / 2
      const centerY = shipY + SPACESHIP_SIZE / 2
      const eCenterX = egg.x + EGG_SIZE / 2
      const eCenterY = egg.y + EGG_SIZE / 2
      const threshold = (SPACESHIP_HITBOX_SIZE + EGG_SIZE) / 2
      const collided = Math.abs(centerX - eCenterX) < threshold && Math.abs(centerY - eCenterY) < threshold
      if (collided) {
        if (hasShieldRef.current) {
          hasShieldRef.current = false
          setHasShield(false)
          spawnParticles(eCenterX, eCenterY, 12, ['#60a5fa', '#93c5fd', '#ffffff'], 4)
        } else {
          eggHit = true
        }
        return false
      }
      return true
    })

    thrusterTickRef.current++
    if (thrusterTickRef.current % 3 === 0) {
      spawnThrusterParticle(spaceshipXRef.current + SPACESHIP_SIZE / 2, GAME_AREA_HEIGHT - 12)
    }

    particlesRef.current = particlesRef.current
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.1, life: p.life - 1 }))
      .filter(p => p.life > 0)

    chickensRef.current = updatedChickens
    draw()

    if (eggHit) {
      livesRef.current -= 1
      setLives(livesRef.current)
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 300)
      if (livesRef.current <= 0) {
        triggerDeath()
        return
      }
    }

    if (updatedChickens.every(c => !c.alive)) {
      waveRef.current += 1
      setWave(waveRef.current)
      spawnWave(waveRef.current)
    }

    animationFrameRef.current = requestAnimationFrame(runGameLoop)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (['arrowleft', 'arrowright', 'a', 'd', ' '].includes(key)) {
        e.preventDefault()
        keysPressed.current.add(key)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      keysPressed.current.delete(key)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (waveBannerTimeoutRef.current) {
        clearTimeout(waveBannerTimeoutRef.current)
      }
      if (rapidFireTimeoutRef.current) {
        clearTimeout(rapidFireTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-card via-primary/5 to-accent/5 border-2">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg">
              <RocketLaunch size={32} weight="duotone" className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Chickeninvasion
              </h2>
              <p className="text-sm text-muted-foreground">
                {language === 'da'
                  ? 'Skyd invasionen af høns og undgå deres æg!'
                  : language === 'fi' ? 'Ammu alas kanan hyökkäys ja väistä niiden munat!' : 'Shoot down the chicken invasion and dodge their eggs!'}
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
              <p className="text-sm text-muted-foreground mb-2">
                {language === 'da'
                  ? 'Flyt med piletaster/A-D, skyd med mellemrum. Undgå æggene der falder ned!'
                  : language === 'fi' ? 'Liiku nuolinäppäimillä/A-D, ammu avaruudessa. Väistäkää munia!' : 'Move with arrow keys/A-D, shoot with space. Dodge the falling eggs!'}
              </p>
              <p className="text-xs text-muted-foreground mb-4 flex items-center justify-center gap-3">
                <span className="flex items-center gap-1">
                  <ShieldCheck size={14} weight="fill" className="text-blue-400" />
                  {language === 'da' ? 'Skjold blokerer et æg' : language === 'fi' ? 'Kilpi salpaa yhden munan' : 'Shield blocks one egg'}
                </span>
                <span className="flex items-center gap-1">
                  <RapidFireIcon size={14} weight="fill" className="text-yellow-400" />
                  {language === 'da' ? 'Hurtigskydning' : language === 'fi' ? 'Nopea tulitus' : 'Rapid Fire'}
                </span>
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
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent blur-xl opacity-30 group-hover:opacity-50 transition-opacity" />
                  <div className="relative px-6 py-3 rounded-xl bg-gradient-to-br from-primary/20 to-accent/30 border-2 border-primary/40 backdrop-blur-sm">
                    <div className="text-[10px] text-primary-foreground/70 uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
                      <Trophy size={12} weight="fill" />
                      {language === 'da' ? 'Point' : language === 'fi' ? 'Pistemäärä' : 'Score'}
                    </div>
                    <div className="text-4xl font-black bg-gradient-to-br from-white to-primary-foreground bg-clip-text text-transparent drop-shadow-lg">
                      {score}
                    </div>
                  </div>
                </div>

                <div className="relative group">
                  <div className="relative px-5 py-3 rounded-xl bg-gradient-to-br from-accent/20 to-yellow-500/20 border-2 border-accent/40 backdrop-blur-sm">
                    <div className="text-[10px] text-accent-foreground/70 uppercase tracking-widest font-bold mb-1">
                      {language === 'da' ? 'Bølge' : language === 'fi' ? 'Aalto' : 'Wave'}
                    </div>
                    <div className="text-4xl font-black text-yellow-400 drop-shadow-lg">
                      {wave}
                    </div>
                  </div>
                </div>

                <div className="relative group">
                  <div className="relative px-5 py-3 rounded-xl bg-gradient-to-br from-destructive/20 to-red-500/20 border-2 border-destructive/40 backdrop-blur-sm">
                    <div className="text-[10px] text-destructive-foreground/70 uppercase tracking-widest font-bold mb-1">
                      {language === 'da' ? 'Liv' : language === 'fi' ? 'Elämä' : 'Lives'}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {Array.from({ length: STARTING_LIVES }).map((_, i) => (
                        <Heart
                          key={i}
                          size={22}
                          weight="fill"
                          className={i < lives ? 'text-red-500' : 'text-red-950/40'}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {hasShield && (
                  <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-400/40 text-blue-300 text-xs font-bold">
                    <ShieldCheck size={16} weight="fill" />
                    {language === 'da' ? 'Skjold' : language === 'fi' ? 'Suoja' : 'Shield'}
                  </div>
                )}
                {isRapidFire && (
                  <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-yellow-500/20 border border-yellow-400/40 text-yellow-300 text-xs font-bold">
                    <RapidFireIcon size={16} weight="fill" />
                    {language === 'da' ? 'Hurtigskydning' : language === 'fi' ? 'Nopea tulitus' : 'Rapid Fire'}
                  </div>
                )}
              </div>

              <Button
                onClick={resetGame}
                variant="destructive"
                size="lg"
                className="shadow-xl hover:shadow-2xl transition-shadow font-bold"
              >
                <X size={20} weight="bold" className="mr-2" />
                {language === 'da' ? 'Stop' : language === 'fi' ? 'Lopeta' : 'Quit'}
              </Button>
            </div>
          </div>

          <motion.div
            ref={gameAreaRef}
            onClick={fireBullet}
            className="relative overflow-hidden"
            animate={isShaking ? { x: [0, -6, 6, -5, 5, -2, 2, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              height: '600px',
              cursor: 'crosshair',
              background: `
                radial-gradient(circle at 15% 20%, rgba(139, 92, 246, 0.18) 0%, transparent 45%),
                radial-gradient(circle at 85% 70%, rgba(59, 130, 246, 0.16) 0%, transparent 45%),
                linear-gradient(180deg, #05010f 0%, #0b0620 45%, #150a33 100%)
              `
            }}
          >
            {stars.map(star => (
              <div
                key={star.id}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${star.x}%`,
                  top: `${star.y}%`,
                  width: `${star.size}px`,
                  height: `${star.size}px`,
                  animation: `pulse ${star.duration}s ease-in-out ${star.delay}s infinite`
                }}
              />
            ))}

            {/* Alle bevægelige spilobjekter (høns, æg, kugler, powerups, partikler, skib) tegnes
                imperativt på canvas fra runGameLoop/draw() — ingen DOM-noder pr. spilobjekt. */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 pointer-events-none"
            />

            <AnimatePresence>
              {isShaking && (
                <motion.div
                  className="absolute inset-0 bg-destructive/25 pointer-events-none z-30"
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {waveBanner !== null && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="text-5xl font-black bg-gradient-to-r from-yellow-300 via-white to-yellow-300 bg-clip-text text-transparent drop-shadow-lg">
                    {language === 'da' ? `Bølge ${waveBanner}` : language === 'fi' ? `Aalto ${waveBanner}` : `Wave ${waveBanner}`}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
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
            </div>
            <p className="text-sm text-muted-foreground">
              {language === 'da' ? `Du nåede bølge ${wave}` : language === 'fi' ? `Saavutit aallon ${wave}` : `You reached wave ${wave}`}
            </p>
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
            const userEntry = leaderboard.find(entry => !entry.teamCode && entry.email === userEmail)

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
