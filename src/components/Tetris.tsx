import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { SquaresFour, Trophy, X, Crown, Medal, Star, ArrowLeft, ArrowRight, ArrowClockwise, ArrowLineDown, CaretDown } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import { useAutoPauseOnBlur } from '@/hooks/useAutoPauseOnBlur'
import { PauseOverlay } from '@/components/PauseOverlay'
import { ArcadeReadyOverlay } from '@/components/ArcadeReadyOverlay'
import { recordGamePlay, scoreSaveFailedMessage, submitHighscore } from '@/lib/leaderboards'
import { useCrossTeamLeaderboard, mergeFlatLeaderboard } from '@/hooks/useCrossTeamLeaderboard'

const LEADERBOARD_KEY = 'tetris-global-leaderboard'
const PLAY_COUNTS_KEY = 'tetris-play-counts'

type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
type GameState = 'menu' | 'ready' | 'playing' | 'paused' | 'ended'
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

export function Tetris({ userEmail = 'guest@example.com' }: TetrisProps = {}) {
  const { language } = useLanguage()
  const [gameState, setGameState] = useState<GameState>('menu')
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [users, setUsers] = useState<User[]>([])
  const { leaderboard: safeLeaderboard, refresh: refreshLeaderboard } = useLeaderboard(LEADERBOARD_KEY)

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

  // Fase 8/9 "Highscores på tværs": fletter alle andre teams' samme leaderboard-nøgle ind,
  // sorteret samlet efter score. Skriver ALDRIG til andre teams' data, kun læser til visning.
  const { otherTeams } = useCrossTeamLeaderboard<GlobalLeaderboard>(LEADERBOARD_KEY)
  const crossTeamLeaderboard = useMemo(() => {
    const ownUsers = Object.fromEntries(users.map(u => [u.email, { fullName: u.fullName }]))
    return mergeFlatLeaderboard(safeLeaderboard, ownUsers, otherTeams)
  }, [safeLeaderboard, users, otherTeams])

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
      await submitHighscore(LEADERBOARD_KEY, { email: userEmail, score: finalScore, timestamp: Date.now() })
      refreshLeaderboard()
    } catch (error) {
      console.error('Error saving Tetris score:', error)
      toast.error(scoreSaveFailedMessage(language))
    }

    try {
      await recordGamePlay(PLAY_COUNTS_KEY, userEmail)
    } catch (error) {
      console.error('Error tracking Tetris play count:', error)
    }
  }, [userEmail, refreshLeaderboard, language])


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
    if (piece && (gameStateRef.current === 'playing' || gameStateRef.current === 'ready')) {
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
    gameStateRef.current = 'ready'
    setGameState('ready')
    spawnPiece()

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
  }

  useEffect(() => {
    if (gameState === 'ready') {
      draw()
      drawNextPiece()
    }
  }, [gameState, draw, drawNextPiece])

  const launchGame = () => {
    if (gameStateRef.current !== 'ready') return
    gameStateRef.current = 'playing'
    setGameState('playing')
    animationFrameRef.current = requestAnimationFrame((timestamp) => {
      startTimeRef.current = timestamp
      lastTimeRef.current = timestamp
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

  const pausedAtRef = useRef(0)

  const pauseGame = useCallback(() => {
    if (gameStateRef.current !== 'playing') return
    gameStateRef.current = 'paused'
    setGameState('paused')
    pausedAtRef.current = performance.now()
    softDropRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const resumeGame = useCallback(() => {
    if (gameStateRef.current !== 'paused') return
    gameStateRef.current = 'playing'
    setGameState('playing')
    animationFrameRef.current = requestAnimationFrame((timestamp) => {
      // Pausen må hverken tælle med i spilletiden (som styrer farten) eller
      // give ét enormt tidsspring der lader brikken falde flere felter.
      startTimeRef.current += timestamp - pausedAtRef.current
      lastTimeRef.current = timestamp
      dropAccRef.current = 0
      step(timestamp)
    })
  }, [step])

  useAutoPauseOnBlur(gameState === 'playing', pauseGame)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current === 'ready') {
        if (e.code === 'Space') {
          e.preventDefault()
          if (!e.repeat) launchGame()
        }
        return
      }
      if (gameStateRef.current === 'paused') {
        if (e.code === 'KeyP' || e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          resumeGame()
        }
        return
      }
      if (gameStateRef.current !== 'playing') return
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault()
      }
      if (e.code === 'KeyP') {
        e.preventDefault()
        pauseGame()
        return
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
      }    }
  }, [moveLeft, moveRight, rotatePiece, softDropStep, hardDrop, pauseGame, resumeGame, launchGame])

  return (
    <div className="space-y-6">
      <Card className="arcade-menu p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary">
              <SquaresFour size={32} weight="duotone" className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">
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
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                {language === 'da'
                  ? 'Piletaster til at flytte/rotere, mellemrum for hurtigt fald. Spillet bliver gradvist sværere jo længere du spiller.'
                  : language === 'fi' ? 'Nuolinäppäimiä liikkua / pyörittää, tilaa kova pudota. Peli vaikeutuu koko ajan.' : 'Arrow keys to move/rotate, space for hard drop. The game gets progressively harder the longer you play.'}
              </p>
              <Button onClick={startGame} size="lg" className="px-8">
                {language === 'da' ? 'Start spil' : language === 'fi' ? 'Käynnistä peli' : 'Start Game'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {(gameState === 'ready' || gameState === 'playing' || gameState === 'paused') && (
        <Card className="p-0 overflow-hidden">
          <div className="relative bg-slate-900 p-6 border-b border-slate-700">
            <div className="hidden" />
            <div className="relative flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="relative px-5 py-3 rounded-md bg-white/10 border border-white/20">
                  <div className="text-[11px] text-primary-foreground/70 font-semibold mb-1 flex items-center gap-1">
                    <Trophy size={12} weight="fill" />
                    {language === 'da' ? 'Point' : language === 'fi' ? 'Pistemäärä' : 'Score'}
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {score}
                  </div>
                </div>
                <div className="relative px-5 py-3 rounded-md bg-white/10 border border-white/20">
                  <div className="text-[11px] text-primary-foreground/70 font-semibold mb-1">
                    {language === 'da' ? 'Linjer' : language === 'fi' ? 'Rivit' : 'Lines'}
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {lines}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-md bg-slate-950/60 border border-white/15">
                  <div className="text-[11px] text-primary-foreground/70 font-semibold mb-1 text-center">
                    {language === 'da' ? 'Næste' : language === 'fi' ? 'Seuraava' : 'Next'}
                  </div>
                  <canvas ref={nextCanvasRef} width={80} height={80} className="block" />
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

          <div className="flex flex-col items-center gap-4 bg-slate-950 py-6">
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={BOARD_WIDTH}
                height={BOARD_HEIGHT}
                className="rounded-md border border-white/15"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
              {gameState === 'ready' && <ArcadeReadyOverlay onStart={launchGame} />}
              {gameState === 'paused' && <PauseOverlay onResume={resumeGame} />}
            </div>

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

        <div className="max-w-md mx-auto">
          {(() => {
            const leaderboard = crossTeamLeaderboard
            const userIndex = leaderboard.findIndex(entry => !entry.teamCode && entry.email === userEmail)
            const userRank = userIndex === -1 ? null : userIndex + 1
            const userEntry = userRank ? leaderboard[userIndex] : undefined

            return (
              <div className="arcade-score-column p-4 rounded-md border bg-card">
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
