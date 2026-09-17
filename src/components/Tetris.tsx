import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { SquaresFour, Trophy, X, Crown, Medal, Star, ArrowLeft, ArrowRight, ArrowClockwise, ArrowLineDown, CaretDown } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useKV } from '@/hooks/useKV'
import { useLanguage } from '@/contexts/LanguageContext'
import { upsertInKvArray } from '@/lib/kvArrays'
import { useCrossTeamLeaderboard, mergeFlatLeaderboard } from '@/hooks/useCrossTeamLeaderboard'

type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
type GameState = 'menu' | 'playing' | 'ended'
type Cell = string | null

interface ActivePiece {
  type: PieceType
  rotation: number
  x: number
  y: number
}

interface LeaderboardEntry {
  id: string
  email: string
  score: number
  timestamp: number
}

type GlobalLeaderboard = LeaderboardEntry[]

const BOARD_COLS = 10
const BOARD_ROWS = 20
const CELL_SIZE = 26
const BOARD_WIDTH = BOARD_COLS * CELL_SIZE
const BOARD_HEIGHT = BOARD_ROWS * CELL_SIZE

const TETROMINOES: Record<PieceType, { color: string; rotations: number[][][] }> = {
  I: {
    color: '#22d3ee',
    rotations: [
      [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
      [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
    ],
  },
  O: {
    color: '#facc15',
    rotations: [
      [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
      [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
      [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
      [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
    ],
  },
  T: {
    color: '#c084fc',
    rotations: [
      [[0, 1, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
      [[0, 0, 0, 0], [1, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    ],
  },
  S: {
    color: '#4ade80',
    rotations: [
      [[0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
      [[0, 0, 0, 0], [0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0]],
      [[1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    ],
  },
  Z: {
    color: '#f87171',
    rotations: [
      [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
      [[0, 0, 0, 0], [1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [1, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
    ],
  },
  J: {
    color: '#60a5fa',
    rotations: [
      [[1, 0, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 1, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
      [[0, 0, 0, 0], [1, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [0, 1, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0]],
    ],
  },
  L: {
    color: '#fb923c',
    rotations: [
      [[0, 0, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
      [[0, 0, 0, 0], [1, 1, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
      [[1, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    ],
  },
}

const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

interface User {
  email: string
  fullName: string
  role: string
  phone?: string
}

interface TetrisProps {
  userEmail?: string
}

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_ROWS }, () => Array<Cell>(BOARD_COLS).fill(null))
}

function shuffleBag(): PieceType[] {
  const bag = [...PIECE_TYPES]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

function getDropIntervalMs(stage: number): number {
  return Math.max(90, 800 - stage * 45)
}

// Sværhedsgraden stiger gradvist ud fra linjer ryddet OG forløbet spilletid - jo længere man spiller, jo hurtigere falder klodserne.
function getStage(lines: number, elapsedMs: number): number {
  return Math.floor(lines / 8) + Math.floor(elapsedMs / 25000)
}

// Migrerer gammelt leaderboard (opdelt pr. sværhedsgrad) til ét samlet highscores-array.
// Sørger også for `id` (bruges af den atomare kv:update-upsert) og at listen altid
// er sorteret højest score først, uanset rækkefølgen data blev skrevet i.
function migrateLeaderboard(data: unknown): LeaderboardEntry[] {
  if (Array.isArray(data)) {
    return (data as LeaderboardEntry[])
      .map((entry) => ({ ...entry, id: entry.id || entry.email }))
      .sort((a, b) => b.score - a.score)
  }
  if (!data || typeof data !== 'object') return []
  const combined = new Map<string, LeaderboardEntry>()
  for (const diff of ['easy', 'medium', 'hard', 'expert']) {
    const arr = (data as Record<string, LeaderboardEntry[]>)[diff] || []
    for (const entry of arr) {
      const existing = combined.get(entry.email)
      if (!existing || entry.score > existing.score) {
        combined.set(entry.email, { id: entry.email, email: entry.email, score: entry.score, timestamp: entry.timestamp })
      }
    }
  }
  return Array.from(combined.values()).sort((a, b) => b.score - a.score).slice(0, 10)
}

// Migrerer gamle play-counts (opdelt pr. sværhedsgrad) til ét samlet antal spil pr. bruger.
function migratePlayCounts(data: unknown): Record<string, { all: number }> {
  if (!data || typeof data !== 'object') return {}
  const result: Record<string, { all: number }> = {}
  for (const [email, counts] of Object.entries(data as Record<string, unknown>)) {
    if (counts && typeof counts === 'object' && 'all' in (counts as Record<string, unknown>)) {
      result[email] = { all: (counts as { all: number }).all || 0 }
      continue
    }
    const c = counts as Record<string, number> | undefined
    const total = ['easy', 'medium', 'hard', 'expert'].reduce((sum, d) => sum + (c?.[d] || 0), 0)
    result[email] = { all: total }
  }
  return result
}

export function Tetris({ userEmail = 'guest@example.com' }: TetrisProps = {}) {
  const { language } = useLanguage()
  const [gameState, setGameState] = useState<GameState>('menu')
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [users, setUsers] = useState<User[]>([])
  const [globalLeaderboard, setGlobalLeaderboard] = useKV<GlobalLeaderboard>('tetris-global-leaderboard', [])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nextCanvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  const gameStateRef = useRef<GameState>('menu')
  const boardRef = useRef<Cell[][]>(createEmptyBoard())
  const bagRef = useRef<PieceType[]>([])
  const currentPieceRef = useRef<ActivePiece | null>(null)
  const nextPieceTypeRef = useRef<PieceType>('I')
  const dropAccRef = useRef(0)
  const stageRef = useRef(0)
  const startTimeRef = useRef(0)
  const linesRef = useRef(0)
  const scoreRef = useRef(0)
  const softDropRef = useRef(false)

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

  // Éngangs-migrering: gammelt leaderboard opdelt pr. sværhedsgrad -> ét samlet array.
  // safeLeaderboard bruges til ALT render/logik, så en legacy-formet værdi fra
  // KV (før migreringen når at skrive tilbage) aldrig får kaldt array-metoder
  // på et almindeligt objekt og crasher komponenten.
  const safeLeaderboard = useMemo(() => migrateLeaderboard(globalLeaderboard), [globalLeaderboard])

  // Fase 8/9 "Highscores på tværs": fletter alle andre teams' samme leaderboard-nøgle ind,
  // sorteret samlet efter score. Skriver ALDRIG til andre teams' data, kun læser til visning.
  const { otherTeams } = useCrossTeamLeaderboard<GlobalLeaderboard>('tetris-global-leaderboard')
  const crossTeamLeaderboard = useMemo(() => {
    const ownUsers = Object.fromEntries(users.map(u => [u.email, { fullName: u.fullName }]))
    return mergeFlatLeaderboard(safeLeaderboard, ownUsers, otherTeams)
  }, [safeLeaderboard, users, otherTeams])

  useEffect(() => {
    if (!globalLeaderboard) return
    const needsMigration = !Array.isArray(globalLeaderboard) || globalLeaderboard.some((entry) => !entry.id)
    if (needsMigration) {
      setGlobalLeaderboard(safeLeaderboard)
      window.kv.set('tetris-global-leaderboard', safeLeaderboard)
    }
  }, [globalLeaderboard, safeLeaderboard, setGlobalLeaderboard])

  const getDisplayName = (email: string) => {
    const user = users.find(u => u.email === email)
    return user ? user.fullName : email.split('@')[0]
  }

  const getCurrentHighScore = () => {
    return crossTeamLeaderboard.length > 0 ? crossTeamLeaderboard[0].score : 0
  }

  const getUserRank = (): number | null => {
    const index = crossTeamLeaderboard.findIndex(entry => !entry.teamCode && entry.email === userEmail)
    return index !== -1 ? index + 1 : null
  }

  const drawNextPiece = useCallback(() => {
    const canvas = nextCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const size = 20
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const piece = TETROMINOES[nextPieceTypeRef.current]
    const matrix = piece.rotations[0]
    ctx.fillStyle = piece.color
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (matrix[row][col]) {
          ctx.fillRect(col * size, row * size, size - 2, size - 2)
        }
      }
    }
  }, [])

  const canPlace = (piece: ActivePiece, offsetX: number, offsetY: number, rotation: number): boolean => {
    const matrix = TETROMINOES[piece.type].rotations[rotation]
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (!matrix[row][col]) continue
        const boardX = piece.x + col + offsetX
        const boardY = piece.y + row + offsetY
        if (boardX < 0 || boardX >= BOARD_COLS || boardY >= BOARD_ROWS) return false
        if (boardY >= 0 && boardRef.current[boardY][boardX]) return false
      }
    }
    return true
  }

  const spawnPiece = (): boolean => {
    if (bagRef.current.length === 0) bagRef.current = shuffleBag()
    const type = nextPieceTypeRef.current
    if (bagRef.current.length === 0) bagRef.current = shuffleBag()
    const upcoming = bagRef.current.pop() as PieceType
    nextPieceTypeRef.current = upcoming
    drawNextPiece()

    const piece: ActivePiece = { type, rotation: 0, x: 3, y: 0 }
    if (!canPlace(piece, 0, 0, 0)) {
      currentPieceRef.current = piece
      return false
    }
    currentPieceRef.current = piece
    return true
  }

  const lockPiece = () => {
    const piece = currentPieceRef.current
    if (!piece) return
    const matrix = TETROMINOES[piece.type].rotations[piece.rotation]
    const color = TETROMINOES[piece.type].color
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (!matrix[row][col]) continue
        const boardY = piece.y + row
        const boardX = piece.x + col
        if (boardY >= 0 && boardY < BOARD_ROWS && boardX >= 0 && boardX < BOARD_COLS) {
          boardRef.current[boardY][boardX] = color
        }
      }
    }

    let cleared = 0
    boardRef.current = boardRef.current.filter(row => {
      const full = row.every(cell => cell !== null)
      if (full) cleared++
      return !full
    })
    while (boardRef.current.length < BOARD_ROWS) {
      boardRef.current.unshift(Array<Cell>(BOARD_COLS).fill(null))
    }

    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800][cleared] * (stageRef.current + 1)
      scoreRef.current += points
      setScore(scoreRef.current)
      linesRef.current += cleared
      setLines(linesRef.current)
    }
  }

  const endGame = useCallback(async (finalScore: number) => {
    setGameState('ended')
    gameStateRef.current = 'ended'
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (!userEmail) return

    try {
      const stored = await window.kv.get<unknown>('tetris-global-leaderboard')
      const board = migrateLeaderboard(stored)
      const existing = board.find(entry => entry.email === userEmail)

      if (!existing || finalScore > existing.score) {
        const updated = await upsertInKvArray<LeaderboardEntry>('tetris-global-leaderboard', [
          { id: userEmail, email: userEmail, score: finalScore, timestamp: Date.now() },
        ])
        setGlobalLeaderboard(updated)
      }
    } catch (error) {
      console.error('Error saving Tetris score:', error)
    }

    try {
      const stored = await window.kv.get<unknown>('tetris-play-counts')
      const gameStats = migratePlayCounts(stored)
      gameStats[userEmail] = { all: (gameStats[userEmail]?.all || 0) + 1 }
      await window.kv.set('tetris-play-counts', gameStats)
    } catch (error) {
      console.error('Error tracking Tetris play count:', error)
    }
  }, [userEmail, setGlobalLeaderboard])


  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)

    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let col = 0; col <= BOARD_COLS; col++) {
      ctx.beginPath()
      ctx.moveTo(col * CELL_SIZE, 0)
      ctx.lineTo(col * CELL_SIZE, BOARD_HEIGHT)
      ctx.stroke()
    }
    for (let row = 0; row <= BOARD_ROWS; row++) {
      ctx.beginPath()
      ctx.moveTo(0, row * CELL_SIZE)
      ctx.lineTo(BOARD_WIDTH, row * CELL_SIZE)
      ctx.stroke()
    }

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = boardRef.current[row][col]
        if (cell) {
          ctx.fillStyle = cell
          ctx.fillRect(col * CELL_SIZE + 1, row * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2)
        }
      }
    }

    const piece = currentPieceRef.current
    if (piece && gameStateRef.current === 'playing') {
      const matrix = TETROMINOES[piece.type].rotations[piece.rotation]

      let ghostY = piece.y
      while (canPlace(piece, 0, ghostY - piece.y + 1, piece.rotation)) {
        ghostY++
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          if (!matrix[row][col]) continue
          const boardY = ghostY + row
          const boardX = piece.x + col
          if (boardY >= 0) {
            ctx.fillRect(boardX * CELL_SIZE + 1, boardY * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2)
          }
        }
      }

      ctx.fillStyle = TETROMINOES[piece.type].color
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          if (!matrix[row][col]) continue
          const boardY = piece.y + row
          const boardX = piece.x + col
          if (boardY >= 0) {
            ctx.fillRect(boardX * CELL_SIZE + 1, boardY * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2)
          }
        }
      }
    }
  }, [])

  const step = useCallback((timestamp: number) => {
    if (gameStateRef.current !== 'playing') return

    if (!lastTimeRef.current) lastTimeRef.current = timestamp
    const delta = timestamp - lastTimeRef.current
    lastTimeRef.current = timestamp

    stageRef.current = getStage(linesRef.current, timestamp - startTimeRef.current)

    const interval = softDropRef.current ? Math.min(50, getDropIntervalMs(stageRef.current)) : getDropIntervalMs(stageRef.current)
    dropAccRef.current += delta

    if (dropAccRef.current >= interval) {
      dropAccRef.current = 0
      const piece = currentPieceRef.current
      if (piece) {
        if (canPlace(piece, 0, 1, piece.rotation)) {
          piece.y += 1
        } else {
          lockPiece()
          const spawned = spawnPiece()
          if (!spawned) {
            endGame(scoreRef.current)
            return
          }
        }
      }
    }

    draw()
    animationFrameRef.current = requestAnimationFrame(step)
  }, [draw, endGame])

  const moveLeft = useCallback(() => {
    if (gameStateRef.current !== 'playing' || !currentPieceRef.current) return
    const piece = currentPieceRef.current
    if (canPlace(piece, -1, 0, piece.rotation)) piece.x -= 1
    draw()
  }, [draw])

  const moveRight = useCallback(() => {
    if (gameStateRef.current !== 'playing' || !currentPieceRef.current) return
    const piece = currentPieceRef.current
    if (canPlace(piece, 1, 0, piece.rotation)) piece.x += 1
    draw()
  }, [draw])

  const rotatePiece = useCallback(() => {
    if (gameStateRef.current !== 'playing' || !currentPieceRef.current) return
    const piece = currentPieceRef.current
    const nextRotation = (piece.rotation + 1) % 4
    const kicks = [0, -1, 1, -2, 2]
    for (const kick of kicks) {
      if (canPlace(piece, kick, 0, nextRotation)) {
        piece.x += kick
        piece.rotation = nextRotation
        draw()
        return
      }
    }
  }, [draw])

  const softDropStep = useCallback(() => {
    if (gameStateRef.current !== 'playing' || !currentPieceRef.current) return
    const piece = currentPieceRef.current
    if (canPlace(piece, 0, 1, piece.rotation)) {
      piece.y += 1
      scoreRef.current += 1
      setScore(scoreRef.current)
    }
    draw()
  }, [draw])

  const hardDrop = useCallback(() => {
    if (gameStateRef.current !== 'playing' || !currentPieceRef.current) return
    const piece = currentPieceRef.current
    let cells = 0
    while (canPlace(piece, 0, 1, piece.rotation)) {
      piece.y += 1
      cells++
    }
    scoreRef.current += cells * 2
    setScore(scoreRef.current)
    lockPiece()
    const spawned = spawnPiece()
    if (!spawned) {
      endGame(scoreRef.current)
      return
    }
    dropAccRef.current = 0
    draw()
  }, [draw, endGame])

  const startGame = () => {
    boardRef.current = createEmptyBoard()
    bagRef.current = shuffleBag()
    nextPieceTypeRef.current = bagRef.current.pop() as PieceType
    scoreRef.current = 0
    linesRef.current = 0
    stageRef.current = 0
    dropAccRef.current = 0
    lastTimeRef.current = 0
    startTimeRef.current = 0
    softDropRef.current = false
    setScore(0)
    setLines(0)
    gameStateRef.current = 'playing'
    setGameState('playing')
    spawnPiece()
    draw()

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = requestAnimationFrame((timestamp) => {
      startTimeRef.current = timestamp
      step(timestamp)
    })
  }

  const quitGame = () => {
    gameStateRef.current = 'menu'
    setGameState('menu')
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current !== 'playing') return
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault()
      }
      switch (e.code) {
        case 'ArrowLeft':
          moveLeft()
          break
        case 'ArrowRight':
          moveRight()
          break
        case 'ArrowUp':
          rotatePiece()
          break
        case 'ArrowDown':
          if (!softDropRef.current) {
            softDropRef.current = true
            softDropStep()
          }
          break
        case 'Space':
          // e.repeat: OS-tastaturgentagelse ville ellers hard-droppe HVER
          // NYE brik igen og igen saa laenge tasten holdes nede.
          if (!e.repeat) hardDrop()
          break
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown') softDropRef.current = false
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [moveLeft, moveRight, rotatePiece, softDropStep, hardDrop])

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-card via-primary/5 to-accent/5 border-2">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg">
              <SquaresFour size={32} weight="duotone" className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Tetris
              </h2>
              <p className="text-sm text-muted-foreground">
                {language === 'da'
                  ? 'Klassisk klodsespil - ryd så mange linjer som muligt!'
                  : language === 'fi' ? 'Classic lohko peli - selkeä niin monta riviä kuin mahdollista!' : 'Classic block game - clear as many lines as possible!'}
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
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                {language === 'da'
                  ? 'Piletaster til at flytte/rotere, mellemrum for hurtigt fald. Spillet bliver gradvist sværere jo længere du spiller.'
                  : language === 'fi' ? 'Nuolinäppäimiä liikkua / pyörittää, tilaa kova pudota. Peli vaikeutuu koko ajan.' : 'Arrow keys to move/rotate, space for hard drop. The game gets progressively harder the longer you play.'}
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
                <div className="relative px-5 py-3 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-primary/40 backdrop-blur-sm">
                  <div className="text-[10px] text-primary-foreground/70 uppercase tracking-widest font-bold mb-1">
                    {language === 'da' ? 'Linjer' : language === 'fi' ? 'Rivit' : 'Lines'}
                  </div>
                  <div className="text-3xl font-black text-white drop-shadow-lg">
                    {lines}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-xl bg-slate-950/60 border-2 border-primary/30">
                  <div className="text-[10px] text-primary-foreground/70 uppercase tracking-widest font-bold mb-1 text-center">
                    {language === 'da' ? 'Næste' : language === 'fi' ? 'Seuraava' : 'Next'}
                  </div>
                  <canvas ref={nextCanvasRef} width={80} height={80} className="block" />
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
              width={BOARD_WIDTH}
              height={BOARD_HEIGHT}
              className="rounded-lg shadow-2xl border-2 border-primary/20"
              style={{ maxWidth: '100%', height: 'auto' }}
            />

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={moveLeft} className="bg-background/80">
                <ArrowLeft size={20} weight="bold" />
              </Button>
              <Button variant="outline" size="icon" onClick={rotatePiece} className="bg-background/80">
                <ArrowClockwise size={20} weight="bold" />
              </Button>
              <Button variant="outline" size="icon" onClick={moveRight} className="bg-background/80">
                <ArrowRight size={20} weight="bold" />
              </Button>
              <Button variant="outline" size="icon" onClick={softDropStep} className="bg-background/80">
                <CaretDown size={20} weight="bold" />
              </Button>
              <Button variant="outline" size="icon" onClick={hardDrop} className="bg-background/80">
                <ArrowLineDown size={20} weight="bold" />
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
                {language === 'da' ? `${lines} linjer` : language === 'fi' ? `${lines}-linjat` : `${lines} lines`}
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

        <div className="max-w-md mx-auto">
          {(() => {
            const leaderboard = crossTeamLeaderboard
            const userIndex = leaderboard.findIndex(entry => !entry.teamCode && entry.email === userEmail)
            const userRank = userIndex === -1 ? null : userIndex + 1
            const userEntry = userRank ? leaderboard[userIndex] : undefined

            return (
              <div className="p-4 rounded-lg border-2 border-border bg-gradient-to-br from-card to-muted/20">
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
                              {getDisplayName(userEmail)}
                            </div>
                          </div>
                          <div className="text-lg font-bold text-primary shrink-0 tabular-nums">{userEntry.score}</div>
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
            )
          })()}
        </div>
      </Card>
    </div>
  )
}
