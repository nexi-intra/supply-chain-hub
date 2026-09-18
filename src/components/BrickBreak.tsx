import { useState, useEffect, useRef } from 'react'
import { Cube, Trophy, X, Lightning, Speedometer, Fire, Flame, Crown, Medal, Star, Play } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useKV } from '@/hooks/useKV'
import { useLanguage } from '@/contexts/LanguageContext'
import { upsertInNestedKvArray } from '@/lib/kvArrays'
import { nextParticleId } from '@/lib/utils'
import { toast } from 'sonner'
import { useCrossTeamLeaderboard, mergeNestedLeaderboard, type CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'

interface Brick {
  id: number
  x: number
  y: number
  width: number
  height: number
  color: string
  hits: number
  maxHits: number
  points: number
}

interface Ball {
  x: number
  y: number
  dx: number
  dy: number
  radius: number
}

interface Paddle {
  x: number
  y: number
  width: number
  height: number
}

interface PowerUp {
  id: number
  x: number
  y: number
  width: number
  height: number
  type: 'extraLife' | 'shield' | 'fireball' | 'shrinkPaddle' | 'enlargePaddle' | 'slowMotion' | 'speedBoost' | 'laser' | 'stickyPaddle' | 'explosiveBall' | 'reverseControls'
  dy: number
}

interface Laser {
  id: number
  x: number
  y: number
  width: number
  height: number
  dy: number
}

interface LeaderboardEntry {
  id: string
  email: string
  score: number
  level: number
  timestamp: number
}

interface GlobalLeaderboard {
  easy: LeaderboardEntry[]
  medium: LeaderboardEntry[]
  hard: LeaderboardEntry[]
  expert: LeaderboardEntry[]
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
type GameState = 'menu' | 'playing' | 'paused' | 'levelComplete' | 'gameOver' | 'waitingToLaunch'

const DIFFICULTY_SETTINGS = {
  easy: {
    ballSpeed: 7,
    label: { en: 'Easy', da: 'Let' },
    description: { en: 'Slow ball', da: 'Langsom bold' },
    icon: Speedometer,
    color: 'text-green-500',
    bgGradient: 'from-green-500/20 to-green-600/20',
    borderColor: 'border-green-500/30',
    glowColor: 'shadow-green-500/20',
  },
  medium: {
    ballSpeed: 9,
    label: { en: 'Medium', da: 'Mellem' },
    description: { en: 'Medium speed', da: 'Mellem hastighed' },
    icon: Lightning,
    color: 'text-yellow-500',
    bgGradient: 'from-yellow-500/20 to-yellow-600/20',
    borderColor: 'border-yellow-500/30',
    glowColor: 'shadow-yellow-500/20',
  },
  hard: {
    ballSpeed: 11,
    label: { en: 'Hard', da: 'Svær' },
    description: { en: 'Fast ball', da: 'Hurtig bold' },
    icon: Fire,
    color: 'text-red-500',
    bgGradient: 'from-red-500/20 to-red-600/20',
    borderColor: 'border-red-500/30',
    glowColor: 'shadow-red-500/20',
  },
  expert: {
    ballSpeed: 13,
    label: { en: 'Expert', da: 'Ekspert' },
    description: { en: 'Very fast!', da: 'Meget hurtigt!' },
    icon: Flame,
    color: 'text-purple-500',
    bgGradient: 'from-purple-500/20 to-purple-600/20',
    borderColor: 'border-purple-500/30',
    glowColor: 'shadow-purple-500/20',
  }
}

const GAME_WIDTH = 800
const GAME_HEIGHT = 600
const PADDLE_HEIGHT = 15
const INITIAL_PADDLE_WIDTH = 120
const BALL_RADIUS = 8
const BRICK_ROWS = 6
const BRICK_COLS = 10
const BRICK_PADDING = 5
const BRICK_OFFSET_TOP = 80
const BRICK_OFFSET_LEFT = 35
const DEFLECTOR_SIZE = 40
const POWERUP_SIZE = 30
const POWERUP_FALL_SPEED = 3
const POWERUP_SPAWN_CHANCE = 0.30

const BRICK_COLORS_BY_DIFFICULTY = {
  easy: [
    { color: '#FFD84E', hits: 1, points: 10 },
    { color: '#FF8B4E', hits: 1, points: 10 },
    { color: '#4EFF8B', hits: 1, points: 15 },
    { color: '#4ECFFF', hits: 2, points: 20 },
  ],
  medium: [
    { color: '#FFD84E', hits: 1, points: 10 },
    { color: '#FF8B4E', hits: 1, points: 10 },
    { color: '#4ECFFF', hits: 2, points: 20 },
    { color: '#4EFF8B', hits: 2, points: 20 },
    { color: '#C94EFF', hits: 3, points: 30 },
  ],
  hard: [
    { color: '#4EFF8B', hits: 2, points: 20 },
    { color: '#4ECFFF', hits: 2, points: 20 },
    { color: '#C94EFF', hits: 3, points: 30 },
    { color: '#FF6B9D', hits: 3, points: 30 },
  ],
  expert: [
    { color: '#4ECFFF', hits: 2, points: 20 },
    { color: '#C94EFF', hits: 3, points: 30 },
    { color: '#FF6B9D', hits: 3, points: 30 },
    { color: '#9D4EFF', hits: 4, points: 40 },
  ]
}

const POWERUP_TYPES: PowerUp['type'][] = ['extraLife', 'shield', 'fireball', 'shrinkPaddle', 'enlargePaddle', 'slowMotion', 'speedBoost', 'laser', 'stickyPaddle', 'explosiveBall', 'reverseControls']

const POWERUP_CONFIG = {
  extraLife: { color: '#4EFF8B', symbol: '♥', label: { en: 'Extra Life', da: 'Ekstra Liv' } },
  shield: { color: '#4ECFFF', symbol: '🛡', label: { en: 'Shield', da: 'Skjold' } },
  fireball: { color: '#FF8B4E', symbol: '🔥', label: { en: 'Fireball', da: 'Ildkugle' } },
  shrinkPaddle: { color: '#FFD84E', symbol: '━', label: { en: 'Shrink Paddle', da: 'Formindsk bar' } },
  enlargePaddle: { color: '#C94EFF', symbol: '+', label: { en: 'Enlarge Paddle', da: 'Forstør bar' } },
  slowMotion: { color: '#9D4EFF', symbol: '⏱', label: { en: 'Slow Motion', da: 'Langsom' } },
  speedBoost: { color: '#FF4E6B', symbol: '⚡', label: { en: 'Speed Boost', da: 'Fart' } },
  laser: { color: '#00FFFF', symbol: '🔫', label: { en: 'Laser', da: 'Laser' } },
  stickyPaddle: { color: '#8FFF4E', symbol: '🟢', label: { en: 'Sticky Paddle', da: 'Klæbrig Bar' } },
  explosiveBall: { color: '#FF2E00', symbol: '💣', label: { en: 'Explosive Ball', da: 'Eksplosiv Bold' } },
  reverseControls: { color: '#FFB84E', symbol: '↔', label: { en: 'Reverse Controls', da: 'Omvendt Kontrol' } }
}

interface User {
  email: string
  fullName: string
  role: string
  phone?: string
}

interface BrickBreakProps {
  userEmail?: string
}

export function BrickBreak({ userEmail = 'guest@example.com' }: BrickBreakProps = {}) {
  const { language } = useLanguage()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [gameState, setGameState] = useState<GameState>('menu')
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [bricks, setBricks] = useState<Brick[]>([])
  const [balls, setBalls] = useState<Ball[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [ballAttachedToPaddle, setBallAttachedToPaddle] = useState(true)
  const [hasShield, setHasShield] = useState(false)
  const [shieldTimeLeft, setShieldTimeLeft] = useState(0)
  const [isFireball, setIsFireball] = useState(false)
  const [fireballTimeLeft, setFireballTimeLeft] = useState(0)
  const [ballSpeedMultiplier, setBallSpeedMultiplier] = useState(1)
  const [speedPowerupTimeLeft, setSpeedPowerupTimeLeft] = useState(0)
  const [hasLaser, setHasLaser] = useState(false)
  const [laserTimeLeft, setLaserTimeLeft] = useState(0)
  const [enlargePaddleTimeLeft, setEnlargePaddleTimeLeft] = useState(0)
  const [shrinkPaddleTimeLeft, setShrinkPaddleTimeLeft] = useState(0)
  const [isStickyPaddle, setIsStickyPaddle] = useState(false)
  const [stickyPaddleTimeLeft, setStickyPaddleTimeLeft] = useState(0)
  const [isExplosiveBall, setIsExplosiveBall] = useState(false)
  const [explosiveBallTimeLeft, setExplosiveBallTimeLeft] = useState(0)
  const [isReverseControls, setIsReverseControls] = useState(false)
  const [reverseControlsTimeLeft, setReverseControlsTimeLeft] = useState(0)
  const [aimAngle, setAimAngle] = useState(0)
  const [globalLeaderboard, setGlobalLeaderboard] = useKV<GlobalLeaderboard>('brickbreak-global-leaderboard', {
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
    window.kv.set('brickbreak-global-leaderboard', migrated)
  }, [globalLeaderboard, setGlobalLeaderboard])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<number | undefined>(undefined)
  // Powerup-nedtaellinger (skjold/fireball/osv.) koerer hver deres setInterval — samlet her
  // saa alle bliver ryddet, hvis komponenten unmountes midt i et powerup (fx spilleren
  // navigerer vaek), i stedet for at laekke en koerende timer der aldrig selv-clearer.
  const activePowerupIntervalsRef = useRef<Set<ReturnType<typeof setInterval>>>(new Set())

  useEffect(() => {
    return () => {
      activePowerupIntervalsRef.current.forEach((id) => clearInterval(id))
      activePowerupIntervalsRef.current.clear()
    }
  }, [])
  const mouseXRef = useRef<number>(GAME_WIDTH / 2)
  // Tastatur-tilstand for paddle-bevægelse — læses direkte i rAF-loopet
  // (combinedLoop) i stedet for et separat setInterval, så bevægelsen altid
  // er synkroniseret med selve tegne-loopet i stedet for at køre på sit eget ur.
  const pressedKeysRef = useRef<Set<string>>(new Set())
  const ballsRef = useRef<Ball[]>([])
  const bricksRef = useRef<Brick[]>([])
  const brickParticlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }[]>([])
  const ballTrailRef = useRef<{ x: number; y: number; life: number; maxLife: number; color: string }[]>([])
  const shakeRef = useRef(0)
  const powerUpsRef = useRef<PowerUp[]>([])
  const paddleRef = useRef<Paddle>({
    x: GAME_WIDTH / 2 - INITIAL_PADDLE_WIDTH / 2,
    y: GAME_HEIGHT - 40,
    width: INITIAL_PADDLE_WIDTH,
    height: PADDLE_HEIGHT
  })
  const livesRef = useRef<number>(3)
  const scoreRef = useRef<number>(0)
  const levelRef = useRef<number>(1)
  const ballAttachedRef = useRef<boolean>(true)
  const isFireballRef = useRef<boolean>(false)
  const hasShieldRef = useRef<boolean>(false)
  const ballSpeedMultiplierRef = useRef<number>(1)
  const hasLaserRef = useRef<boolean>(false)
  const lasersRef = useRef<Laser[]>([])
  const lastLaserTimeRef = useRef<number>(0)
  const isStickyPaddleRef = useRef<boolean>(false)
  const isExplosiveBallRef = useRef<boolean>(false)
  const isReverseControlsRef = useRef<boolean>(false)

  useEffect(() => {
    const loadUsers = async () => {
      const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: string; phone?: string }>>('users')
      if (usersData) {
        const userList = Object.values(usersData).map(u => ({
          email: u.email,
          fullName: u.fullName,
          role: u.role || 'user',
          phone: u.phone
        }))
        setUsers(userList)
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

  // Storage-rækkefølgen garanteres ikke længere sorteret (atomar upsert tilføjer
  // bare i slutningen) — sortér altid ved læsning, så rangnumre/medaljer er korrekte.
  // Fase 8/9 "Highscores på tværs": fletter alle andre teams' samme sværhedsgrad ind.
  const { otherTeams } = useCrossTeamLeaderboard<GlobalLeaderboard>('brickbreak-global-leaderboard')
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

  const createBricks = (levelNum: number) => {
    const newBricks: Brick[] = []
    const brickWidth = (GAME_WIDTH - BRICK_OFFSET_LEFT * 2 - BRICK_PADDING * (BRICK_COLS - 1)) / BRICK_COLS
    const brickHeight = 25
    
    const difficultyBrickColors = BRICK_COLORS_BY_DIFFICULTY[difficulty]
    
    const rowsByDifficulty = {
      easy: Math.min(BRICK_ROWS - 1, BRICK_ROWS - 1 + Math.floor(levelNum / 4)),
      medium: Math.min(BRICK_ROWS, BRICK_ROWS + Math.floor(levelNum / 3)),
      hard: Math.min(BRICK_ROWS + 1, BRICK_ROWS + 1 + Math.floor(levelNum / 3)),
      expert: Math.min(BRICK_ROWS + 2, BRICK_ROWS + 2 + Math.floor(levelNum / 2))
    }
    const rows = rowsByDifficulty[difficulty]

    const patternIndex = (levelNum - 1) % 15
    
    const patternDensityByDifficulty = {
      easy: 0.75,
      medium: 0.85,
      hard: 0.95,
      expert: 1.0
    }
    const densityFactor = patternDensityByDifficulty[difficulty]

    const shouldAddBrick = (row: number, col: number): boolean => {
      let basePattern = true
      
      switch (patternIndex) {
        case 0:
          basePattern = true
          break
        
        case 1:
          basePattern = (row + col) % 2 === 0
          break
        
        case 2:
          basePattern = col % 2 === 0
          break
        
        case 3:
          basePattern = row % 2 === 0
          break
        
        case 4:
          basePattern = Math.abs(col - BRICK_COLS / 2) <= row
          break
        
        case 5:
          basePattern = Math.abs(col - BRICK_COLS / 2) <= (rows - row - 1)
          break
        
        case 6:
          basePattern = col >= row && col < BRICK_COLS - row
          break
        
        case 7:
          const centerCol = BRICK_COLS / 2
          const centerRow = rows / 2
          const distance = Math.sqrt(Math.pow(col - centerCol, 2) + Math.pow(row - centerRow, 2))
          basePattern = distance <= 4 + row * 0.5
          break
        
        case 8:
          basePattern = col < BRICK_COLS / 2 ? row % 2 === 0 : row % 2 === 1
          break
        
        case 9:
          basePattern = (row % 3 !== 1) || (col % 3 === 1)
          break
        
        case 10:
          basePattern = col === 0 || col === BRICK_COLS - 1 || row === 0 || row === rows - 1 || (row === Math.floor(rows / 2) && col >= 2 && col <= BRICK_COLS - 3)
          break
        
        case 11:
          basePattern = Math.abs(col - row) <= 2 || Math.abs(col - (BRICK_COLS - 1 - row)) <= 2
          break
        
        case 12:
          basePattern = (col % 3 === 0) || (row % 3 === 0)
          break
        
        case 13:
          basePattern = col >= Math.floor(BRICK_COLS / 4) && col < Math.floor(3 * BRICK_COLS / 4)
          break
        
        case 14:
          basePattern = (row + col) % 3 !== 2
          break
        
        default:
          basePattern = true
      }
      
      if (!basePattern) return false
      
      if (difficulty === 'easy') {
        return Math.random() < densityFactor
      } else if (difficulty === 'medium') {
        return Math.random() < densityFactor
      }
      
      return basePattern
    }

    let brickId = 0
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        if (!shouldAddBrick(row, col)) continue

        const colorData = difficultyBrickColors[row % difficultyBrickColors.length]
        
        const hitsBonusByDifficulty = {
          easy: Math.floor(levelNum / 8),
          medium: Math.floor(levelNum / 6),
          hard: Math.floor(levelNum / 5),
          expert: Math.floor(levelNum / 4)
        }
        const maxHits = colorData.hits + hitsBonusByDifficulty[difficulty]

        newBricks.push({
          id: brickId++,
          x: BRICK_OFFSET_LEFT + col * (brickWidth + BRICK_PADDING),
          y: BRICK_OFFSET_TOP + row * (brickHeight + BRICK_PADDING),
          width: brickWidth,
          height: brickHeight,
          color: colorData.color,
          hits: 0,
          maxHits: maxHits,
          points: colorData.points * Math.floor(1 + levelNum * 0.5)
        })
      }
    }

    return newBricks
  }

  const startGame = () => {
    // Ryd evt. igangværende powerup-nedtællinger fra en tidligere runde, så de
    // ikke uventet nulstiller state midt i det nye spil.
    activePowerupIntervalsRef.current.forEach((id) => clearInterval(id))
    activePowerupIntervalsRef.current.clear()

    const newPaddle = {
      x: GAME_WIDTH / 2 - INITIAL_PADDLE_WIDTH / 2,
      y: GAME_HEIGHT - 40,
      width: INITIAL_PADDLE_WIDTH,
      height: PADDLE_HEIGHT
    }
    
    scoreRef.current = 0
    livesRef.current = 3
    levelRef.current = 1
    paddleRef.current = newPaddle
    ballAttachedRef.current = true
    powerUpsRef.current = []
    ballSpeedMultiplierRef.current = 1
    brickParticlesRef.current = []
    ballTrailRef.current = []
    shakeRef.current = 0
    
    const newBalls = [{
      x: newPaddle.x + newPaddle.width / 2,
      y: newPaddle.y - BALL_RADIUS,
      dx: 0,
      dy: 0,
      radius: BALL_RADIUS
    }]
    const newBricks = createBricks(1)
    
    ballsRef.current = newBalls
    bricksRef.current = newBricks
    
    setBallAttachedToPaddle(true)
    setBalls(newBalls)
    setBricks(newBricks)
    setScore(0)
    setLevel(1)
    setLives(3)
    setHasShield(false)
    setShieldTimeLeft(0)
    setIsFireball(false)
    setFireballTimeLeft(0)
    setIsExplosiveBall(false)
    setExplosiveBallTimeLeft(0)
    setBallSpeedMultiplier(1)
    setSpeedPowerupTimeLeft(0)
    setEnlargePaddleTimeLeft(0)
    setShrinkPaddleTimeLeft(0)
    isFireballRef.current = false
    isExplosiveBallRef.current = false
    hasShieldRef.current = false
    hasLaserRef.current = false
    lasersRef.current = []
    setHasLaser(false)
    setLaserTimeLeft(0)
    setGameState('waitingToLaunch')
  }

  const nextLevel = () => {
    const newLevel = level + 1
    levelRef.current = newLevel
    const newPaddle = {
      ...paddleRef.current,
      x: GAME_WIDTH / 2 - INITIAL_PADDLE_WIDTH / 2,
      width: INITIAL_PADDLE_WIDTH
    }
    
    paddleRef.current = newPaddle
    ballAttachedRef.current = true
    powerUpsRef.current = []
    
    const newBalls = [{
      x: newPaddle.x + newPaddle.width / 2,
      y: newPaddle.y - BALL_RADIUS,
      dx: 0,
      dy: 0,
      radius: BALL_RADIUS
    }]
    const newBricks = createBricks(newLevel)
    
    ballsRef.current = newBalls
    bricksRef.current = newBricks
    
    setBallAttachedToPaddle(true)
    setBalls(newBalls)
    setBricks(newBricks)
    setLevel(newLevel)
    setHasShield(false)
    setShieldTimeLeft(0)
    setIsFireball(false)
    setFireballTimeLeft(0)
    setIsExplosiveBall(false)
    setExplosiveBallTimeLeft(0)
    setBallSpeedMultiplier(1)
    setSpeedPowerupTimeLeft(0)
    setHasLaser(false)
    setLaserTimeLeft(0)
    setEnlargePaddleTimeLeft(0)
    setShrinkPaddleTimeLeft(0)
    setIsStickyPaddle(false)
    setStickyPaddleTimeLeft(0)
    isFireballRef.current = false
    isExplosiveBallRef.current = false
    hasShieldRef.current = false
    ballSpeedMultiplierRef.current = 1
    hasLaserRef.current = false
    lasersRef.current = []
    isStickyPaddleRef.current = false
    setGameState('waitingToLaunch')
  }

  const saveScore = async () => {
    if (!userEmail) {
      console.error('No user email for saving score')
      await trackGamePlay(difficulty)
      return
    }

    const finalScore = scoreRef.current
    const finalLevel = levelRef.current

    try {
      const currentLeaderboard = await window.kv.get<GlobalLeaderboard>('brickbreak-global-leaderboard') || {
        easy: [],
        medium: [],
        hard: [],
        expert: []
      }

      const difficultyBoard = currentLeaderboard[difficulty] || []
      const existing = difficultyBoard.find(entry => entry.email === userEmail)

      if (!existing || finalScore > existing.score) {
        const updatedBoard = await upsertInNestedKvArray<LeaderboardEntry>(
          'brickbreak-global-leaderboard',
          [difficulty],
          [{ id: userEmail, email: userEmail, score: finalScore, level: finalLevel, timestamp: Date.now() }],
        )
        setGlobalLeaderboard({ ...currentLeaderboard, [difficulty]: updatedBoard })
      }
    } catch (error) {
      console.error('Error saving score to leaderboard:', error)
    }
    
    await trackGamePlay(difficulty)
  }

  const trackGamePlay = async (gameDifficulty: Difficulty) => {
    if (!userEmail) return

    try {
      const gameStats = await window.kv.get<Record<string, Record<Difficulty, number>>>('brickbreak-play-counts') || {}
      
      if (!gameStats[userEmail]) {
        gameStats[userEmail] = { easy: 0, medium: 0, hard: 0, expert: 0 }
      }
      
      gameStats[userEmail][gameDifficulty] = (gameStats[userEmail][gameDifficulty] || 0) + 1
      
      await window.kv.set('brickbreak-play-counts', gameStats)
    } catch (error) {
      console.error('Error tracking game play:', error)
    }
  }

  const launchBall = () => {
    if (!ballAttachedRef.current) return
    
    const baseSpeed = DIFFICULTY_SETTINGS[difficulty].ballSpeed
    const currentBall = ballsRef.current[0]
    if (!currentBall) return
    
    const speedMultiplier = ballSpeedMultiplierRef.current
    
    let dx, dy
    if (isStickyPaddleRef.current && ballAttachedToPaddle) {
      const currentPaddle = paddleRef.current
      const mouseX = mouseXRef.current
      const ballX = currentBall.x
      const ballY = currentBall.y
      
      const deltaX = mouseX - ballX
      const deltaY = 0 - ballY
      const angle = Math.atan2(deltaY, deltaX)
      
      const clampedAngle = Math.max(-Math.PI * 0.8, Math.min(-Math.PI * 0.2, angle))
      
      const speed = baseSpeed * speedMultiplier
      dx = Math.cos(clampedAngle) * speed
      dy = Math.sin(clampedAngle) * speed
    } else {
      dx = (Math.random() > 0.5 ? 1 : -1) * baseSpeed * 0.7 * speedMultiplier
      dy = -baseSpeed * speedMultiplier
    }
    
    const launchedBall = {
      ...currentBall,
      dx,
      dy
    }
    
    ballsRef.current = [launchedBall]
    setBalls([launchedBall])
    setBallAttachedToPaddle(false)
    ballAttachedRef.current = false
    setGameState('playing')
  }

  const applyPowerUp = (type: PowerUp['type']) => {
    const message = POWERUP_CONFIG[type].label[language]
    
    switch (type) {
      case 'extraLife':
        if (livesRef.current < 3) {
          livesRef.current = livesRef.current + 1
          setLives(livesRef.current)
          toast.success(message)
        } else {
          const noEffectMsg = language === 'da' ? 'Max 3 liv!' : language === 'fi' ? 'Max 3 elää!' : 'Max 3 lives!'
          toast.info(noEffectMsg)
        }
        break
        
      case 'shield':
        setHasShield(true)
        hasShieldRef.current = true
        setShieldTimeLeft(20)
        toast.success(message)
        
        const shieldInterval = setInterval(() => {
          setShieldTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(shieldInterval)
              activePowerupIntervalsRef.current.delete(shieldInterval)
              setHasShield(false)
              hasShieldRef.current = false
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(shieldInterval)
        break
        
      case 'fireball':
        setIsFireball(true)
        isFireballRef.current = true
        setFireballTimeLeft(10)
        toast.success(message)
        
        const fireballInterval = setInterval(() => {
          setFireballTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(fireballInterval)
              activePowerupIntervalsRef.current.delete(fireballInterval)
              setIsFireball(false)
              isFireballRef.current = false
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(fireballInterval)
        break
        
      case 'shrinkPaddle':
        const newSmallPaddle = {
          ...paddleRef.current,
          width: Math.max(INITIAL_PADDLE_WIDTH * 0.6, 60)
        }
        paddleRef.current = newSmallPaddle
        setShrinkPaddleTimeLeft(10)
        toast.success(message)
        
        const shrinkInterval = setInterval(() => {
          setShrinkPaddleTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(shrinkInterval)
              activePowerupIntervalsRef.current.delete(shrinkInterval)
              const resetPaddle = {
                ...paddleRef.current,
                width: INITIAL_PADDLE_WIDTH
              }
              paddleRef.current = resetPaddle
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(shrinkInterval)
        break
        
      case 'enlargePaddle':
        const newWidePaddle = {
          ...paddleRef.current,
          width: Math.min(INITIAL_PADDLE_WIDTH * 1.5, 200)
        }
        paddleRef.current = newWidePaddle
        setEnlargePaddleTimeLeft(10)
        toast.success(message)
        
        const enlargeInterval = setInterval(() => {
          setEnlargePaddleTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(enlargeInterval)
              activePowerupIntervalsRef.current.delete(enlargeInterval)
              const resetPaddle = {
                ...paddleRef.current,
                width: INITIAL_PADDLE_WIDTH
              }
              paddleRef.current = resetPaddle
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(enlargeInterval)
        break
        
      case 'slowMotion':
        ballSpeedMultiplierRef.current = 0.5
        setBallSpeedMultiplier(0.5)
        setSpeedPowerupTimeLeft(8)
        toast.success(message)
        
        const slowMotionInterval = setInterval(() => {
          setSpeedPowerupTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(slowMotionInterval)
              activePowerupIntervalsRef.current.delete(slowMotionInterval)
              ballSpeedMultiplierRef.current = 1
              setBallSpeedMultiplier(1)
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(slowMotionInterval)
        break
        
      case 'speedBoost':
        ballSpeedMultiplierRef.current = 1.5
        setBallSpeedMultiplier(1.5)
        setSpeedPowerupTimeLeft(8)
        toast.success(message)
        
        const speedBoostInterval = setInterval(() => {
          setSpeedPowerupTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(speedBoostInterval)
              activePowerupIntervalsRef.current.delete(speedBoostInterval)
              ballSpeedMultiplierRef.current = 1
              setBallSpeedMultiplier(1)
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(speedBoostInterval)
        break
        
      case 'laser':
        setHasLaser(true)
        hasLaserRef.current = true
        setLaserTimeLeft(5)
        toast.success(message)
        
        const laserInterval = setInterval(() => {
          setLaserTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(laserInterval)
              activePowerupIntervalsRef.current.delete(laserInterval)
              setHasLaser(false)
              hasLaserRef.current = false
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(laserInterval)
        break
        
      case 'stickyPaddle':
        setIsStickyPaddle(true)
        isStickyPaddleRef.current = true
        setStickyPaddleTimeLeft(10)
        toast.success(message)
        
        const stickyInterval = setInterval(() => {
          setStickyPaddleTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(stickyInterval)
              activePowerupIntervalsRef.current.delete(stickyInterval)
              setIsStickyPaddle(false)
              isStickyPaddleRef.current = false
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(stickyInterval)
        break
        
      case 'explosiveBall':
        setIsExplosiveBall(true)
        isExplosiveBallRef.current = true
        setExplosiveBallTimeLeft(10)
        toast.success(message)
        
        const explosiveInterval = setInterval(() => {
          setExplosiveBallTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(explosiveInterval)
              activePowerupIntervalsRef.current.delete(explosiveInterval)
              setIsExplosiveBall(false)
              isExplosiveBallRef.current = false
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(explosiveInterval)
        break
        
      case 'reverseControls':
        setIsReverseControls(true)
        isReverseControlsRef.current = true
        setReverseControlsTimeLeft(5)
        toast.success(message)
        
        const reverseInterval = setInterval(() => {
          setReverseControlsTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(reverseInterval)
              activePowerupIntervalsRef.current.delete(reverseInterval)
              setIsReverseControls(false)
              isReverseControlsRef.current = false
              return 0
            }
            return prev - 1
          })
        }, 1000)
        activePowerupIntervalsRef.current.add(reverseInterval)
        break
    }
  }

  const spawnBrickParticles = (brick: Brick) => {
    const centerX = brick.x + brick.width / 2
    const centerY = brick.y + brick.height / 2
    const hitsRemaining = brick.maxHits - brick.hits
    const colors = [
      hitsRemaining === 1 ? '#FFD84E' :
      hitsRemaining === 2 ? '#FF8B4E' :
      hitsRemaining === 3 ? '#4EFF8B' :
      hitsRemaining === 4 ? '#4ECFFF' :
      hitsRemaining === 5 ? '#C94EFF' : '#FF6B9D',
      '#FFFFFF'
    ]

    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * 4
      brickParticlesRef.current.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 24,
        maxLife: 24,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2.5
      })
    }
  }

  const gameLoop = () => {
    const currentBalls = ballsRef.current
    const currentBricks = bricksRef.current
    const currentPaddle = paddleRef.current

    if (ballAttachedRef.current) {
      const attachedBall = {
        x: currentPaddle.x + currentPaddle.width / 2,
        y: currentPaddle.y - BALL_RADIUS,
        dx: 0,
        dy: 0,
        radius: BALL_RADIUS
      }
      ballsRef.current = [attachedBall]
      return
    }

    if (currentBalls.length === 0 && livesRef.current <= 1) {
      return
    }

    const newBalls = currentBalls.map(ball => {
      let newBall = { ...ball }
      const speedMultiplier = ballSpeedMultiplierRef.current
      newBall.x += newBall.dx * speedMultiplier
      newBall.y += newBall.dy * speedMultiplier

      if (newBall.x - newBall.radius < 0 || newBall.x + newBall.radius > GAME_WIDTH) {
        newBall.dx = -newBall.dx
      }

      if (newBall.y - newBall.radius < 0) {
        newBall.dy = -newBall.dy
      }

      if (newBall.x <= DEFLECTOR_SIZE && newBall.y <= DEFLECTOR_SIZE) {
        if (newBall.x + newBall.y <= DEFLECTOR_SIZE) {
          const speed = Math.sqrt(newBall.dx * newBall.dx + newBall.dy * newBall.dy)
          
          const nx = 1 / Math.sqrt(2)
          const ny = 1 / Math.sqrt(2)
          
          const dot = newBall.dx * nx + newBall.dy * ny
          newBall.dx = newBall.dx - 2 * dot * nx
          newBall.dy = newBall.dy - 2 * dot * ny
          
          while (newBall.x + newBall.y <= DEFLECTOR_SIZE + newBall.radius) {
            newBall.x += 1
            newBall.y += 1
          }
        }
      }

      if (newBall.x >= GAME_WIDTH - DEFLECTOR_SIZE && newBall.y <= DEFLECTOR_SIZE) {
        if ((GAME_WIDTH - newBall.x) + newBall.y <= DEFLECTOR_SIZE) {
          const speed = Math.sqrt(newBall.dx * newBall.dx + newBall.dy * newBall.dy)
          
          const nx = -1 / Math.sqrt(2)
          const ny = 1 / Math.sqrt(2)
          
          const dot = newBall.dx * nx + newBall.dy * ny
          newBall.dx = newBall.dx - 2 * dot * nx
          newBall.dy = newBall.dy - 2 * dot * ny
          
          while ((GAME_WIDTH - newBall.x) + newBall.y <= DEFLECTOR_SIZE + newBall.radius) {
            newBall.x -= 1
            newBall.y += 1
          }
        }
      }

      if (
        newBall.y + newBall.radius > currentPaddle.y &&
        newBall.y - newBall.radius < currentPaddle.y + currentPaddle.height &&
        newBall.x > currentPaddle.x &&
        newBall.x < currentPaddle.x + currentPaddle.width
      ) {
        if (isStickyPaddleRef.current && currentBalls.length === 1) {
          ballAttachedRef.current = true
          setBallAttachedToPaddle(true)
          newBall.dx = 0
          newBall.dy = 0
          newBall.y = currentPaddle.y - newBall.radius
          setGameState('waitingToLaunch')
        } else {
          const hitPos = (newBall.x - currentPaddle.x) / currentPaddle.width
          const angle = (hitPos - 0.5) * Math.PI * 0.6
          const speed = Math.sqrt(newBall.dx * newBall.dx + newBall.dy * newBall.dy)
          newBall.dx = Math.sin(angle) * speed
          newBall.dy = -Math.abs(Math.cos(angle) * speed)
        }
      }

      return newBall
    }).filter(ball => ball.y - ball.radius < GAME_HEIGHT)

    const trailColor = isFireballRef.current ? '#FF6B00' : isExplosiveBallRef.current ? '#FF4400' : '#4ECFFF'
    newBalls.forEach(ball => {
      ballTrailRef.current.push({ x: ball.x, y: ball.y, life: 12, maxLife: 12, color: trailColor })
    })
    ballTrailRef.current = ballTrailRef.current
      .map(t => ({ ...t, life: t.life - 1 }))
      .filter(t => t.life > 0)
      .slice(-80)

    brickParticlesRef.current = brickParticlesRef.current
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, life: p.life - 1 }))
      .filter(p => p.life > 0)

    shakeRef.current *= 0.88
    if (shakeRef.current < 0.3) shakeRef.current = 0

    let newBricks = [...currentBricks]
    let scoreIncrease = 0

    const bricksToRemove: number[] = []
    
    newBalls.forEach(ball => {
      newBricks.forEach((brick, index) => {
        if (bricksToRemove.includes(index)) return
        
        const collision = 
          ball.x + ball.radius > brick.x &&
          ball.x - ball.radius < brick.x + brick.width &&
          ball.y + ball.radius > brick.y &&
          ball.y - ball.radius < brick.y + brick.height

        if (collision) {
          if (isFireballRef.current) {
            scoreIncrease += brick.points
            
            if (Math.random() < POWERUP_SPAWN_CHANCE) {
              const powerUpType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)]
              const newPowerUp: PowerUp = {
                id: nextParticleId(),
                x: brick.x + brick.width / 2 - POWERUP_SIZE / 2,
                y: brick.y,
                width: POWERUP_SIZE,
                height: POWERUP_SIZE,
                type: powerUpType,
                dy: POWERUP_FALL_SPEED
              }
              powerUpsRef.current = [...powerUpsRef.current, newPowerUp]
            }
            
            spawnBrickParticles(brick)
            bricksToRemove.push(index)
          } else if (isExplosiveBallRef.current) {
            const overlapLeft = ball.x + ball.radius - brick.x
            const overlapRight = brick.x + brick.width - (ball.x - ball.radius)
            const overlapTop = ball.y + ball.radius - brick.y
            const overlapBottom = brick.y + brick.height - (ball.y - ball.radius)

            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom)

            if (minOverlap === overlapTop || minOverlap === overlapBottom) {
              ball.dy = -ball.dy
            } else {
              ball.dx = -ball.dx
            }
            
            scoreIncrease += brick.points
            
            if (Math.random() < POWERUP_SPAWN_CHANCE) {
              const powerUpType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)]
              const newPowerUp: PowerUp = {
                id: nextParticleId(),
                x: brick.x + brick.width / 2 - POWERUP_SIZE / 2,
                y: brick.y,
                width: POWERUP_SIZE,
                height: POWERUP_SIZE,
                type: powerUpType,
                dy: POWERUP_FALL_SPEED
              }
              powerUpsRef.current = [...powerUpsRef.current, newPowerUp]
            }
            
            spawnBrickParticles(brick)
            bricksToRemove.push(index)
            
            const explosionRadius = brick.width * 1.8
            const brickCenterX = brick.x + brick.width / 2
            const brickCenterY = brick.y + brick.height / 2
            
            newBricks.forEach((otherBrick, otherIndex) => {
              if (otherIndex === index || bricksToRemove.includes(otherIndex)) return
              
              const otherCenterX = otherBrick.x + otherBrick.width / 2
              const otherCenterY = otherBrick.y + otherBrick.height / 2
              
              const distance = Math.sqrt(
                Math.pow(otherCenterX - brickCenterX, 2) + 
                Math.pow(otherCenterY - brickCenterY, 2)
              )
              
              if (distance <= explosionRadius) {
                scoreIncrease += otherBrick.points
                spawnBrickParticles(otherBrick)
                bricksToRemove.push(otherIndex)
              }
            })
          } else {
            const overlapLeft = ball.x + ball.radius - brick.x
            const overlapRight = brick.x + brick.width - (ball.x - ball.radius)
            const overlapTop = ball.y + ball.radius - brick.y
            const overlapBottom = brick.y + brick.height - (ball.y - ball.radius)

            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom)

            if (minOverlap === overlapTop || minOverlap === overlapBottom) {
              ball.dy = -ball.dy
            } else {
              ball.dx = -ball.dx
            }

            brick.hits++

            if (brick.hits >= brick.maxHits) {
              scoreIncrease += brick.points
              
              if (Math.random() < POWERUP_SPAWN_CHANCE) {
                const powerUpType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)]
                const newPowerUp: PowerUp = {
                  id: nextParticleId(),
                  x: brick.x + brick.width / 2 - POWERUP_SIZE / 2,
                  y: brick.y,
                  width: POWERUP_SIZE,
                  height: POWERUP_SIZE,
                  type: powerUpType,
                  dy: POWERUP_FALL_SPEED
                }
                powerUpsRef.current = [...powerUpsRef.current, newPowerUp]
              }
              
              spawnBrickParticles(brick)
              bricksToRemove.push(index)
            }
          }
        }
      })
    })
    
    newBricks = newBricks.filter((_, index) => !bricksToRemove.includes(index))

    if (scoreIncrease > 0) {
      scoreRef.current += scoreIncrease
      setScore(scoreRef.current)
    }

    const currentPowerUps = powerUpsRef.current
    const updatedPowerUps = currentPowerUps.map(powerUp => ({
      ...powerUp,
      y: powerUp.y + powerUp.dy
    })).filter(powerUp => {
      if (powerUp.y > GAME_HEIGHT) {
        return false
      }
      
      if (
        powerUp.y + powerUp.height > currentPaddle.y &&
        powerUp.y < currentPaddle.y + currentPaddle.height &&
        powerUp.x + powerUp.width > currentPaddle.x &&
        powerUp.x < currentPaddle.x + currentPaddle.width
      ) {
        applyPowerUp(powerUp.type)
        return false
      }
      
      return true
    })
    
    powerUpsRef.current = updatedPowerUps

    if (hasLaserRef.current) {
      const currentTime = Date.now()
      if (currentTime - lastLaserTimeRef.current > 150) {
        const leftLaser: Laser = {
          id: nextParticleId(),
          x: currentPaddle.x + 5,
          y: currentPaddle.y - 10,
          width: 4,
          height: 15,
          dy: -10
        }
        const rightLaser: Laser = {
          id: nextParticleId(),
          x: currentPaddle.x + currentPaddle.width - 9,
          y: currentPaddle.y - 10,
          width: 4,
          height: 15,
          dy: -10
        }
        lasersRef.current = [...lasersRef.current, leftLaser, rightLaser]
        lastLaserTimeRef.current = currentTime
      }
    }

    const currentLasers = lasersRef.current
    const updatedLasers: Laser[] = []
    let laserScoreIncrease = 0
    const laserBricksToRemove: number[] = []

    currentLasers.forEach(laser => {
      let laserDestroyed = false
      const newLaser = {
        ...laser,
        y: laser.y + laser.dy
      }

      if (newLaser.y + newLaser.height < 0) {
        return
      }

      newBricks.forEach((brick, index) => {
        if (laserDestroyed || laserBricksToRemove.includes(index)) return

        const collision = 
          newLaser.x + newLaser.width > brick.x &&
          newLaser.x < brick.x + brick.width &&
          newLaser.y < brick.y + brick.height &&
          newLaser.y + newLaser.height > brick.y

        if (collision) {
          laserDestroyed = true
          brick.hits += 2

          if (brick.hits >= brick.maxHits) {
            laserScoreIncrease += brick.points

            if (Math.random() < POWERUP_SPAWN_CHANCE) {
              const powerUpType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)]
              const newPowerUp: PowerUp = {
                id: nextParticleId(),
                x: brick.x + brick.width / 2 - POWERUP_SIZE / 2,
                y: brick.y,
                width: POWERUP_SIZE,
                height: POWERUP_SIZE,
                type: powerUpType,
                dy: POWERUP_FALL_SPEED
              }
              powerUpsRef.current = [...powerUpsRef.current, newPowerUp]
            }

            laserBricksToRemove.push(index)
          }
        }
      })

      if (!laserDestroyed) {
        updatedLasers.push(newLaser)
      }
    })

    lasersRef.current = updatedLasers

    if (laserScoreIncrease > 0) {
      scoreRef.current += laserScoreIncrease
      setScore(scoreRef.current)
    }

    newBricks = newBricks.filter((_, index) => !laserBricksToRemove.includes(index))

    ballsRef.current = newBalls
    bricksRef.current = newBricks

    if (newBalls.length === 0 && currentBalls.length > 0) {
      if (hasShieldRef.current) {
        setHasShield(false)
        hasShieldRef.current = false
        const shieldMsg = language === 'da' ? 'Skjold brugt!' : language === 'fi' ? 'Kilpeä käytettiin!' : 'Shield used!'
        toast.info(shieldMsg)
        
        powerUpsRef.current = []
        setIsFireball(false)
        setFireballTimeLeft(0)
        setBallSpeedMultiplier(1)
        setSpeedPowerupTimeLeft(0)
        setHasLaser(false)
        setLaserTimeLeft(0)
        setEnlargePaddleTimeLeft(0)
        setShrinkPaddleTimeLeft(0)
        isFireballRef.current = false
        ballSpeedMultiplierRef.current = 1
        hasLaserRef.current = false
        lasersRef.current = []
        
        const currentPaddle = paddleRef.current
        const newBall = {
          x: currentPaddle.x + currentPaddle.width / 2,
          y: currentPaddle.y - BALL_RADIUS,
          dx: 0,
          dy: 0,
          radius: BALL_RADIUS
        }
        ballsRef.current = [newBall]
        setBalls([newBall])
        setBallAttachedToPaddle(true)
        ballAttachedRef.current = true
        setGameState('waitingToLaunch')
      } else {
        livesRef.current -= 1
        setLives(livesRef.current)
        shakeRef.current = 18
        
        powerUpsRef.current = []
        setHasShield(false)
        setShieldTimeLeft(0)
        setIsFireball(false)
        setFireballTimeLeft(0)
        setBallSpeedMultiplier(1)
        setSpeedPowerupTimeLeft(0)
        setHasLaser(false)
        setLaserTimeLeft(0)
        setEnlargePaddleTimeLeft(0)
        setShrinkPaddleTimeLeft(0)
        hasShieldRef.current = false
        isFireballRef.current = false
        ballSpeedMultiplierRef.current = 1
        hasLaserRef.current = false
        lasersRef.current = []
        
        if (livesRef.current <= 0) {
          setGameState('gameOver')
          saveScore()
        } else {
          const currentPaddle = paddleRef.current
          const newBall = {
            x: currentPaddle.x + currentPaddle.width / 2,
            y: currentPaddle.y - BALL_RADIUS,
            dx: 0,
            dy: 0,
            radius: BALL_RADIUS
          }
          ballsRef.current = [newBall]
          setBalls([newBall])
          setBallAttachedToPaddle(true)
          ballAttachedRef.current = true
          setGameState('waitingToLaunch')
        }
      }
    }

    if (newBricks.length === 0) {
      setGameState('levelComplete')
    }
  }

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    const shakeMagnitude = shakeRef.current
    const shakeX = shakeMagnitude > 0.3 ? (Math.random() - 0.5) * shakeMagnitude : 0
    const shakeY = shakeMagnitude > 0.3 ? (Math.random() - 0.5) * shakeMagnitude : 0
    ctx.save()
    ctx.translate(shakeX, shakeY)

    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(DEFLECTOR_SIZE, 0)
    ctx.lineTo(0, DEFLECTOR_SIZE)
    ctx.closePath()
    ctx.fillStyle = 'rgba(255, 107, 157, 0.4)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 107, 157, 0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(GAME_WIDTH, 0)
    ctx.lineTo(GAME_WIDTH - DEFLECTOR_SIZE, 0)
    ctx.lineTo(GAME_WIDTH, DEFLECTOR_SIZE)
    ctx.closePath()
    ctx.fillStyle = 'rgba(78, 207, 255, 0.4)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(78, 207, 255, 0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()

    const currentBricks = bricksRef.current
    const currentBalls = ballsRef.current
    const currentPaddle = paddleRef.current

    // Genbrug én lodret glans-gradient til alle bricks (samme hoejde) i stedet for
    // at allokere en ny pr. brick pr. frame, og drop shadowBlur pr. brick. Begge
    // dele er tunge nok til at tabe FPS ved en fuld mur, hvilket faar den
    // muse-styrede paddle til at halte selvom bolden ser glat ud.
    const brickGlowH = currentBricks.length > 0 ? currentBricks[0].height : 0
    let brickGlow: CanvasGradient | null = null
    if (brickGlowH > 0) {
      brickGlow = ctx.createLinearGradient(0, 0, 0, brickGlowH)
      brickGlow.addColorStop(0, 'rgba(255, 255, 255, 0.45)')
      brickGlow.addColorStop(0.4, 'rgba(255, 255, 255, 0.05)')
      brickGlow.addColorStop(1, 'rgba(0, 0, 0, 0.25)')
    }

    currentBricks.forEach(brick => {
      const hitsRemaining = brick.maxHits - brick.hits
      
      let displayColor = brick.color
      if (hitsRemaining === 1) {
        displayColor = '#FFD84E'
      } else if (hitsRemaining === 2) {
        displayColor = '#FF8B4E'
      } else if (hitsRemaining === 3) {
        displayColor = '#4EFF8B'
      } else if (hitsRemaining === 4) {
        displayColor = '#4ECFFF'
      } else if (hitsRemaining === 5) {
        displayColor = '#C94EFF'
      } else if (hitsRemaining >= 6) {
        displayColor = '#FF6B9D'
      }
      
      ctx.fillStyle = displayColor
      ctx.globalAlpha = 1
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height)

      if (brickGlow) {
        ctx.save()
        ctx.translate(brick.x, brick.y)
        ctx.fillStyle = brickGlow
        ctx.fillRect(0, 0, brick.width, brick.height)
        ctx.restore()
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, Math.max(2, brick.height * 0.22))
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 2
      ctx.strokeRect(brick.x, brick.y, brick.width, brick.height)
    })

    brickParticlesRef.current.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    ballTrailRef.current.forEach(t => {
      ctx.globalAlpha = Math.max(0, (t.life / t.maxLife) * 0.5)
      ctx.fillStyle = t.color
      ctx.beginPath()
      ctx.arc(t.x, t.y, BALL_RADIUS * (t.life / t.maxLife), 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    currentBalls.forEach(ball => {
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
      if (isFireballRef.current) {
        const fireGradient = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.radius * 3)
        fireGradient.addColorStop(0, '#FFFF00')
        fireGradient.addColorStop(0.3, '#FF6B00')
        fireGradient.addColorStop(0.6, '#FF0000')
        fireGradient.addColorStop(1, 'rgba(255, 0, 0, 0)')
        
        ctx.fillStyle = fireGradient
        ctx.shadowBlur = 30
        ctx.shadowColor = '#FF0000'
        ctx.beginPath()
        ctx.arc(ball.x, ball.y, ball.radius * 3, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = '#FF4400'
        ctx.shadowBlur = 25
        ctx.shadowColor = '#FF0000'
        ctx.beginPath()
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
        ctx.fill()
        
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = `rgba(255, ${100 - i * 30}, 0, ${0.6 - i * 0.2})`
          ctx.shadowBlur = 15 - i * 5
          ctx.beginPath()
          ctx.arc(ball.x - ball.dx * i * 0.5, ball.y - ball.dy * i * 0.5, ball.radius * (1 - i * 0.2), 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (isExplosiveBallRef.current) {
        ctx.save()
        ctx.font = `${ball.radius * 2}px Arial`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowBlur = 20
        ctx.shadowColor = '#FF4400'
        ctx.fillText('💣', ball.x, ball.y)
        ctx.restore()
      } else {
        ctx.fillStyle = '#FFFFFF'
        ctx.shadowBlur = 15
        ctx.shadowColor = '#4ECFFF'
        ctx.fill()
      }
      ctx.shadowBlur = 0
    })

    const gradient = ctx.createLinearGradient(currentPaddle.x, 0, currentPaddle.x + currentPaddle.width, 0)
    if (isStickyPaddleRef.current) {
      gradient.addColorStop(0, '#8FFF4E')
      gradient.addColorStop(0.5, '#4EFF8B')
      gradient.addColorStop(1, '#4ECFFF')
    } else {
      gradient.addColorStop(0, '#FF6B9D')
      gradient.addColorStop(0.5, '#C94EFF')
      gradient.addColorStop(1, '#4ECFFF')
    }
    ctx.fillStyle = gradient
    ctx.fillRect(currentPaddle.x, currentPaddle.y, currentPaddle.width, currentPaddle.height)
    ctx.shadowBlur = 10
    ctx.shadowColor = isStickyPaddleRef.current ? '#8FFF4E' : '#C94EFF'
    ctx.fillRect(currentPaddle.x, currentPaddle.y, currentPaddle.width, currentPaddle.height)
    ctx.shadowBlur = 0
    
    if (ballAttachedRef.current && isStickyPaddleRef.current && currentBalls.length > 0) {
      const ball = currentBalls[0]
      const mouseX = mouseXRef.current
      
      ctx.save()
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(143, 255, 78, 0.6)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ball.x, ball.y)
      ctx.lineTo(mouseX, 0)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      
      ctx.beginPath()
      ctx.arc(mouseX, 20, 8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(143, 255, 78, 0.8)'
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const currentPowerUps = powerUpsRef.current
    currentPowerUps.forEach(powerUp => {
      const config = POWERUP_CONFIG[powerUp.type]
      ctx.fillStyle = config.color
      ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 2
      ctx.strokeRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height)
      ctx.shadowBlur = 8
      ctx.shadowColor = config.color
      ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height)
      ctx.shadowBlur = 0
      
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 18px Quicksand, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(config.symbol, powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2)
    })

    const currentLasers = lasersRef.current
    currentLasers.forEach(laser => {
      const laserGradient = ctx.createLinearGradient(laser.x, laser.y, laser.x, laser.y + laser.height)
      laserGradient.addColorStop(0, '#00FFFF')
      laserGradient.addColorStop(0.5, '#00DDFF')
      laserGradient.addColorStop(1, 'rgba(0, 255, 255, 0.3)')
      
      ctx.fillStyle = laserGradient
      ctx.shadowBlur = 15
      ctx.shadowColor = '#00FFFF'
      ctx.fillRect(laser.x, laser.y, laser.width, laser.height)
      
      ctx.fillStyle = '#FFFFFF'
      ctx.shadowBlur = 20
      ctx.shadowColor = '#00FFFF'
      ctx.fillRect(laser.x + 1, laser.y, laser.width - 2, laser.height)
      
      ctx.shadowBlur = 0
    })

    if (ballAttachedRef.current) {
      ctx.save()
      ctx.font = 'bold 24px Quicksand, sans-serif'
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'center'
      ctx.shadowBlur = 10
      ctx.shadowColor = '#4ECFFF'
      const message = language === 'da' ? 'Klik eller tryk på mellemrum for at skyde' : language === 'fi' ? 'Napsauta tai paina tilaa käynnistääksesi' : 'Click or Press Space to Launch'
      ctx.fillText(message, GAME_WIDTH / 2, GAME_HEIGHT / 2)
      ctx.shadowBlur = 0
      ctx.restore()
    }

    ctx.restore()
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (gameState !== 'playing' && gameState !== 'waitingToLaunch') return
      
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const scaleX = GAME_WIDTH / rect.width
      let mouseX = (e.clientX - rect.left) * scaleX
      
      if (isReverseControlsRef.current) {
        mouseX = GAME_WIDTH - mouseX
      }
      
      mouseXRef.current = mouseX

      const currentPaddle = paddleRef.current
      const newX = Math.max(0, Math.min(GAME_WIDTH - currentPaddle.width, mouseX - currentPaddle.width / 2))
      
      paddleRef.current = { ...currentPaddle, x: newX }
    }

    const handleClick = (e: MouseEvent) => {
      if (gameState === 'waitingToLaunch') {
        const canvas = canvasRef.current
        if (!canvas) return
        
        const rect = canvas.getBoundingClientRect()
        const isClickOnCanvas = 
          e.clientX >= rect.left && 
          e.clientX <= rect.right && 
          e.clientY >= rect.top && 
          e.clientY <= rect.bottom
        
        if (isClickOnCanvas) {
          launchBall()
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('click', handleClick)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('click', handleClick)
    }
  }, [gameState])

  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'waitingToLaunch') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && gameState === 'waitingToLaunch') {
        e.preventDefault()
        launchBall()
        return
      }
      
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
        e.preventDefault()
        pressedKeysRef.current.add(e.key.toLowerCase())
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.key.toLowerCase())
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      pressedKeysRef.current.clear()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState])

  const PADDLE_KEY_SPEED = 8

  /** Opdaterer paddle-position ud fra aktuelt nedtrykte taster — kaldes fra rAF-loopet. */
  const updatePaddleFromKeys = () => {
    const pressedKeys = pressedKeysRef.current
    if (pressedKeys.size === 0) return

    const currentPaddle = paddleRef.current
    let newX = currentPaddle.x

    if (pressedKeys.has('arrowleft') || pressedKeys.has('a')) {
      newX -= PADDLE_KEY_SPEED
    }
    if (pressedKeys.has('arrowright') || pressedKeys.has('d')) {
      newX += PADDLE_KEY_SPEED
    }

    newX = Math.max(0, Math.min(GAME_WIDTH - currentPaddle.width, newX))

    if (newX !== currentPaddle.x) {
      paddleRef.current = { ...currentPaddle, x: newX }
    }
  }

  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'waitingToLaunch') return

    let animationFrameId: number

    const combinedLoop = () => {
      if (gameState === 'playing' || gameState === 'waitingToLaunch') {
        updatePaddleFromKeys()
        gameLoop()
        draw()
        animationFrameId = requestAnimationFrame(combinedLoop)
      }
    }

    animationFrameId = requestAnimationFrame(combinedLoop)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [gameState])

  if (gameState === 'menu') {
    return (
      <div className="space-y-6">
        <Card className="p-6 bg-gradient-to-br from-card via-primary/5 to-accent/5 border-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg">
                <Cube size={32} weight="duotone" className="text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Brick Break
                </h2>
                <p className="text-sm text-muted-foreground">
                  {language === 'da' 
                    ? 'Ødelæg alle brikker og klar så mange levels som muligt!' 
                    : language === 'fi' ? 'Tuhoa kaikki tiilet ja selkeä mahdollisimman monta tasoa!' : 'Destroy all bricks and clear as many levels as possible!'}
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

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  {language === 'da' ? 'Vælg sværhedsgrad' : language === 'fi' ? 'Valitse vaikeudet' : 'Select Difficulty'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-4">
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
                  ? 'Brug musen eller tasterne (pil venstre/højre eller A/D) til at styre paddlen. Ødelæg alle brikker!'
                  : language === 'fi' ? 'Käytä hiirtä tai näppäimiä (kavenna vasen/oikea tai A/D) melontaan. Tuhotkaa kaikki tiilet!' : 'Use your mouse or keys (arrow left/right or A/D) to control the paddle. Destroy all bricks!'}
              </p>
              <Button onClick={startGame} size="lg" className="px-8 bg-gradient-to-r from-primary to-accent hover:opacity-90 gap-2">
                <Play size={20} weight="fill" />
                {language === 'da' ? 'Start spil' : language === 'fi' ? 'Käynnistä peli' : 'Start Game'}
              </Button>
            </div>
          </div>
        </Card>

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
              const topScore = getTopScoreForDifficulty(diff)
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
                          const rankColors = [
                            'text-yellow-500',
                            'text-gray-400',
                            'text-amber-600'
                          ]
                          const rankIcons = [Crown, Medal, Star]
                          const RankIcon = index < 3 ? rankIcons[index] : null

                          return (
                            <div
                              key={`${entry.teamCode || 'own'}-${entry.id}`}
                              className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                                isCurrentUser
                                  ? 'bg-primary/10 border border-primary/30 shadow-md'
                                  : 'bg-muted/30'
                              }`}
                            >
                              <div className="flex items-center justify-center w-8 h-8 shrink-0">
                                {RankIcon ? (
                                  <RankIcon 
                                    size={20} 
                                    weight="fill" 
                                    className={rankColors[index]} 
                                  />
                                ) : (
                                  <span className="text-sm font-bold text-muted-foreground">
                                    #{index + 1}
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-medium truncate ${
                                  isCurrentUser ? 'text-primary font-bold' : 'text-foreground'
                                }`}>
                                  {entry.displayName}{entry.teamCode && <span className="text-muted-foreground font-normal"> ({entry.teamCode})</span>}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {language === 'da' ? 'Level' : language === 'fi' ? 'Taso' : 'Level'} {entry.level}
                                </div>
                              </div>
                              <div className={`text-lg font-bold shrink-0 tabular-nums ${
                                isCurrentUser ? 'text-primary' : 'text-muted-foreground'
                              }`}>
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
                                <span className="text-sm font-bold text-primary">
                                  #{userRank}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-primary truncate">
                                  {userEntry.displayName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {language === 'da' ? 'Level' : language === 'fi' ? 'Taso' : 'Level'} {userEntry.level}
                                </div>
                              </div>
                              <div className="text-lg font-bold text-primary">
                                {userEntry.score}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Trophy size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {language === 'da'
                            ? 'Ingen scores endnu'
                            : language === 'fi' ? 'Ei tuloksia vielä' : 'No scores yet'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {language === 'da'
                            ? 'Vær den første!'
                            : language === 'fi' ? 'Ole ensimmäinen!' : 'Be the first!'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            {language === 'da' ? 'Sådan Spiller Du' : language === 'fi' ? 'Pelaaminen' : 'How to Play'}
          </h3>
          <div className="text-sm space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{language === 'da' ? 'Kontroller' : language === 'fi' ? 'Tarkastukset' : 'Controls'}</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• {language === 'da' ? 'Bevæg musen eller brug piletasterne/A/D for at styre paddle' : language === 'fi' ? 'Siirrä hiirtä tai käytä nuolinäppäimiä/A/D melontaan' : 'Move mouse or use arrow keys/A/D to control paddle'}</li>
                <li>• {language === 'da' ? 'Ødelæg alle brikker for at klare niveauet' : language === 'fi' ? 'Tuhoa kaikki tiilet puhdistaa tasolle' : 'Destroy all bricks to clear the level'}</li>
                <li>• {language === 'da' ? 'Undgå at miste bolden' : language === 'fi' ? 'Vältä pallon häviämistä' : 'Avoid losing the ball'}</li>
                <li>• {language === 'da' ? 'Du har 3 liv per spil' : language === 'fi' ? 'Sinulla on 3 elämää per peli' : 'You have 3 lives per game'}</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3">{language === 'da' ? 'Power-Ups' : language === 'fi' ? 'Virrankulutus' : 'Power-Ups'}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-xl">
                    {POWERUP_CONFIG.extraLife.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-green-500 text-xs">
                      {POWERUP_CONFIG.extraLife.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Giver dig et ekstra liv' : language === 'fi' ? 'Se antaa sinulle ylimääräisen elämän' : 'Gives you an extra life'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-cyan-500/10 to-blue-600/10 border border-cyan-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20 text-xl">
                    {POWERUP_CONFIG.shield.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-cyan-500 text-xs">
                      {POWERUP_CONFIG.shield.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Beskytter dig mod ét tab i 20 sek' : language === 'fi' ? 'Suojaa yhdeltä 20-vuotiaan tappiolta' : 'Protects from one loss for 20s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-red-500/10 to-orange-600/10 border border-red-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 text-xl">
                    {POWERUP_CONFIG.fireball.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-red-500 text-xs">
                      {POWERUP_CONFIG.fireball.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Bolden går gennem brikker i 10 sek' : language === 'fi' ? 'Pallo menee tiilien läpi kymmenelle.' : 'Ball goes through bricks for 10s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/20 text-xl">
                    {POWERUP_CONFIG.enlargePaddle.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-purple-500 text-xs">
                      {POWERUP_CONFIG.enlargePaddle.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Gør paddle større i 10 sek' : language === 'fi' ? 'Tekee melonnasta suuremman 10-vuotiaille' : 'Makes paddle larger for 10s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border border-yellow-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 text-xl">
                    {POWERUP_CONFIG.shrinkPaddle.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-yellow-500 text-xs">
                      {POWERUP_CONFIG.shrinkPaddle.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Gør paddle mindre i 10 sek' : language === 'fi' ? 'Tekee melonnasta pienemmän 10:lle' : 'Makes paddle smaller for 10s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-indigo-500/10 to-purple-600/10 border border-indigo-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/20 text-xl">
                    {POWERUP_CONFIG.slowMotion.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-indigo-500 text-xs">
                      {POWERUP_CONFIG.slowMotion.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Sænker boldens hastighed til 0.5x i 8 sek' : language === 'fi' ? 'Hidastaa pallon 0.5x 8s' : 'Slows ball to 0.5x for 8s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-pink-500/10 to-red-600/10 border border-pink-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-500/20 text-xl">
                    {POWERUP_CONFIG.speedBoost.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-pink-500 text-xs">
                      {POWERUP_CONFIG.speedBoost.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Øger boldens hastighed til 1.5x i 8 sek' : language === 'fi' ? 'Nostaa pallon nopeutta 1,5x 8s' : 'Increases ball speed to 1.5x for 8s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-cyan-500/10 to-teal-600/10 border border-cyan-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20 text-xl">
                    {POWERUP_CONFIG.laser.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-cyan-500 text-xs">
                      {POWERUP_CONFIG.laser.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Skyder laser der giver 2x skade i 5 sek' : language === 'fi' ? 'Ampuu laserit 2x vahinko 5s' : 'Shoots lasers for 2x damage for 5s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-lime-500/10 to-green-600/10 border border-lime-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-lime-500/20 text-xl">
                    {POWERUP_CONFIG.stickyPaddle.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-lime-500 text-xs">
                      {POWERUP_CONFIG.stickyPaddle.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Bolden klæber til paddle - sigt og affyr i 10 sek' : language === 'fi' ? 'Pallo tikkuja meloa - tähdätä ja ampua 10s' : 'Ball sticks to paddle - aim and shoot for 10s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-orange-500/10 to-red-600/10 border border-orange-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/20 text-xl">
                    {POWERUP_CONFIG.explosiveBall.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-orange-500 text-xs">
                      {POWERUP_CONFIG.explosiveBall.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Bolden eksploderer ved kollision og ødelægger omgivende brikker i 10 sek' : language === 'fi' ? 'Pallo räjähtää törmäys tuhoaa ympäröivät tiilet 10 s' : 'Ball explodes on collision destroying surrounding bricks for 10s'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-600/10 border border-amber-500/20">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-xl">
                    {POWERUP_CONFIG.reverseControls.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-amber-500 text-xs">
                      {POWERUP_CONFIG.reverseControls.label[language as 'en' | 'da']}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'da' ? 'Vender musestyring om i 5 sek' : language === 'fi' ? 'Kääntää hiiren ohjaimet 5:lle' : 'Reverses mouse controls for 5s'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (gameState === 'levelComplete') {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-3xl font-bold mb-4 text-green-500">
          {language === 'da' ? 'Level Fuldført!' : language === 'fi' ? 'Taso valmis!' : 'Level Complete!'}
        </h2>
        <div className="text-5xl font-bold mb-6">{score}</div>
        <div className="text-xl mb-6">
          {language === 'da' ? 'Level' : language === 'fi' ? 'Taso' : 'Level'} {level}
        </div>
        <Button onClick={nextLevel} size="lg">
          {language === 'da' ? 'Næste Level' : language === 'fi' ? 'Seuraava taso' : 'Next Level'}
        </Button>
      </Card>
    )
  }

  if (gameState === 'gameOver') {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-3xl font-bold mb-4 text-red-500">
          {language === 'da' ? 'Spil Slut!' : language === 'fi' ? 'Peli loppui!' : 'Game Over!'}
        </h2>
        <div className="text-5xl font-bold mb-2">{score}</div>
        <div className="text-xl text-muted-foreground mb-6">
          {language === 'da' ? 'Level nået:' : language === 'fi' ? 'Saavutettu taso:' : 'Level reached:'} {level}
        </div>
        <div className="flex gap-4 justify-center">
          <Button onClick={startGame} size="lg">
            {language === 'da' ? 'Spil Igen' : language === 'fi' ? 'Toista' : 'Play Again'}
          </Button>
          <Button onClick={() => setGameState('menu')} variant="outline" size="lg">
            {language === 'da' ? 'Menu' : language === 'fi' ? 'Valikko' : 'Menu'}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-6 text-lg font-semibold">
          <div>{language === 'da' ? 'Score:' : language === 'fi' ? 'Pistemäärä:' : 'Score:'} {score}</div>
          <div>{language === 'da' ? 'Level:' : language === 'fi' ? 'Taso:' : 'Level:'} {level}</div>
          <div className="flex items-center gap-2">
            {language === 'da' ? 'Liv:' : language === 'fi' ? 'Elämät:' : 'Lives:'}
            {Array.from({ length: lives }).map((_, i) => (
              <span key={i} className="text-red-500">♥</span>
            ))}
          </div>
          {hasShield && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/50 text-cyan-500 animate-pulse">
              <span className="text-xl">🛡</span>
              <span className="font-bold">{language === 'da' ? 'SKJOLD AKTIV' : language === 'fi' ? 'KIDÄN VAIKUTTAVA' : 'SHIELD ACTIVE'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-cyan-500 text-white text-sm font-bold">{shieldTimeLeft}s</span>
            </div>
          )}
          {isFireball && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r from-red-500/20 to-orange-500/20 border-2 border-red-500/50 text-red-500 animate-pulse">
              <span className="text-xl">🔥</span>
              <span className="font-bold">{language === 'da' ? 'ILDKUGLE AKTIV' : language === 'fi' ? 'FIREBALL ACTIVE' : 'FIREBALL ACTIVE'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-red-500 text-white text-sm font-bold">{fireballTimeLeft}s</span>
            </div>
          )}
          {enlargePaddleTimeLeft > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-500">
              <span className="text-xl">+</span>
              <span className="font-bold">{language === 'da' ? 'STOR BAR' : language === 'fi' ? 'LARGE PADDLE' : 'LARGE PADDLE'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-purple-500 text-white text-sm font-bold">{enlargePaddleTimeLeft}s</span>
            </div>
          )}
          {shrinkPaddleTimeLeft > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-500">
              <span className="text-xl">━</span>
              <span className="font-bold">{language === 'da' ? 'LILLE BAR' : language === 'fi' ? 'PÄIVITYS' : 'SMALL PADDLE'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-yellow-500 text-white text-sm font-bold">{shrinkPaddleTimeLeft}s</span>
            </div>
          )}
          {ballSpeedMultiplier === 0.5 && speedPowerupTimeLeft > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-500">
              <span className="text-xl">⏱</span>
              <span className="font-bold">{language === 'da' ? 'LANGSOM' : language === 'fi' ? 'Hidas' : 'SLOW MOTION'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-purple-500 text-white text-sm font-bold">{speedPowerupTimeLeft}s</span>
            </div>
          )}
          {ballSpeedMultiplier === 1.5 && speedPowerupTimeLeft > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-pink-500/20 border border-pink-500/50 text-pink-500">
              <span className="text-xl">⚡</span>
              <span className="font-bold">{language === 'da' ? 'FART' : language === 'fi' ? 'NOPEA' : 'SPEED BOOST'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-pink-500 text-white text-sm font-bold">{speedPowerupTimeLeft}s</span>
            </div>
          )}
          {hasLaser && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/50 text-cyan-500 animate-pulse">
              <span className="text-xl">⚡</span>
              <span className="font-bold">{language === 'da' ? 'LASER AKTIV' : language === 'fi' ? 'LASER ACTIVE' : 'LASER ACTIVE'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-cyan-500 text-white text-sm font-bold">{laserTimeLeft}s</span>
            </div>
          )}
          {isExplosiveBall && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500/20 to-red-600/20 border-2 border-orange-500/50 text-orange-500 animate-pulse">
              <span className="text-xl">💣</span>
              <span className="font-bold">{language === 'da' ? 'EKSPLOSIV BOLD AKTIV' : language === 'fi' ? 'RÄJÄHDYSKESKUS' : 'EXPLOSIVE BALL ACTIVE'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-orange-500 text-white text-sm font-bold">{explosiveBallTimeLeft}s</span>
            </div>
          )}
          {isStickyPaddle && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r from-lime-500/20 to-green-500/20 border-2 border-lime-500/50 text-lime-500 animate-pulse">
              <span className="text-xl">🟢</span>
              <span className="font-bold">{language === 'da' ? 'KLÆBRIG BAR' : language === 'fi' ? 'Sticky paddle' : 'STICKY PADDLE'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-lime-500 text-white text-sm font-bold">{stickyPaddleTimeLeft}s</span>
            </div>
          )}
          {isReverseControls && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-2 border-amber-500/50 text-amber-500 animate-pulse">
              <span className="text-xl">↔</span>
              <span className="font-bold">{language === 'da' ? 'OMVENDT KONTROL' : language === 'fi' ? 'PALAUTUKSEN VALVONTA' : 'REVERSE CONTROLS'}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-amber-500 text-white text-sm font-bold">{reverseControlsTimeLeft}s</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setGameState('menu')} variant="outline" size="sm">
            {language === 'da' ? 'Menu' : language === 'fi' ? 'Valikko' : 'Menu'}
          </Button>
        </div>
      </div>

      <Card className="p-4 flex justify-center">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="border-2 border-border rounded-lg bg-gradient-to-b from-gray-900 to-gray-800"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </Card>
    </div>
  )
}
