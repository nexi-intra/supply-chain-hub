import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { nextParticleId } from '@/lib/utils'

interface Flag {
  id: number
  x: number
  delay: number
  duration: number
  rotation: number
  size: number
}

interface Confetti {
  id: number
  x: number
  y: number
  rotation: number
  color: string
  velocityX: number
  velocityY: number
  size: number
  shape: 'circle' | 'square' | 'triangle'
}

interface BirthdayCelebrationProps {
  userEmail: string
}

export function BirthdayCelebration({ userEmail }: BirthdayCelebrationProps) {
  const [showCelebration, setShowCelebration] = useState(false)
  const [flags, setFlags] = useState<Flag[]>([])
  const [confetti, setConfetti] = useState<Confetti[]>([])
  const [showConfettiBurst, setShowConfettiBurst] = useState(false)

  useEffect(() => {
    const checkBirthday = async () => {
      const birthdays = await window.kv.get<Array<{
        email: string
        birthday: string
      }>>('employee-birthdays') || []

      const today = new Date()
      const todayMonth = String(today.getMonth() + 1).padStart(2, '0')
      const todayDay = String(today.getDate()).padStart(2, '0')
      const todayStr = `${todayMonth}-${todayDay}`

      const userBirthday = birthdays.find(b => b.email === userEmail)
      
      if (userBirthday && userBirthday.birthday === todayStr) {
        setShowCelebration(true)
        
        const confettiKey = `confetti-shown-${userEmail}-${todayStr}-${new Date().getFullYear()}`
        const hasShownConfetti = await window.kv.get<boolean>(confettiKey)
        
        if (!hasShownConfetti) {
          setShowConfettiBurst(true)
          await window.kv.set(confettiKey, true)
          
          setTimeout(() => {
            setShowConfettiBurst(false)
          }, 4000)
        }
      } else {
        setShowCelebration(false)
      }
    }

    checkBirthday()
  }, [userEmail])

  useEffect(() => {
    if (!showCelebration) return

    const generateNewFlags = () => {
      const newFlags: Flag[] = []
      const baseTime = Date.now()
      for (let i = 0; i < 15; i++) {
        newFlags.push({
          id: baseTime + i + Math.random() * 1000,
          x: Math.random() * 100,
          delay: Math.random() * 1.5,
          duration: 5 + Math.random() * 3,
          rotation: Math.random() * 360,
          size: 30 + Math.random() * 20
        })
      }
      setFlags(prev => [...prev, ...newFlags])
    }

    generateNewFlags()

    const interval = setInterval(() => {
      generateNewFlags()
    }, 2000)

    const cleanupInterval = setInterval(() => {
      setFlags(prev => prev.slice(-60))
    }, 4000)

    return () => {
      clearInterval(interval)
      clearInterval(cleanupInterval)
    }
  }, [showCelebration])

  useEffect(() => {
    if (!showConfettiBurst) return

    const colors = [
      '#C8102E',
      '#FFFFFF',
      '#FFD700',
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#FFA07A',
      '#98D8C8'
    ]

    const shapes: Array<'circle' | 'square' | 'triangle'> = ['circle', 'square', 'triangle']

    const createConfettiBurst = (originX: number, originY: number, count: number) => {
      const newConfetti: Confetti[] = []
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
        const velocity = 8 + Math.random() * 8
        newConfetti.push({
          id: nextParticleId(),
          x: originX,
          y: originY,
          rotation: Math.random() * 360,
          color: colors[Math.floor(Math.random() * colors.length)],
          velocityX: Math.cos(angle) * velocity,
          velocityY: Math.sin(angle) * velocity - 5,
          size: 8 + Math.random() * 8,
          shape: shapes[Math.floor(Math.random() * shapes.length)]
        })
      }
      return newConfetti
    }

    const screenWidth = window.innerWidth
    const burstPoints = [
      { x: screenWidth * 0.2, y: window.innerHeight * 0.3 },
      { x: screenWidth * 0.5, y: window.innerHeight * 0.2 },
      { x: screenWidth * 0.8, y: window.innerHeight * 0.3 }
    ]

    let allConfetti: Confetti[] = []

    burstPoints.forEach((point, index) => {
      setTimeout(() => {
        const burst = createConfettiBurst(point.x, point.y, 40)
        allConfetti = [...allConfetti, ...burst]
        setConfetti(allConfetti)
      }, index * 150)
    })

    const gravity = 0.5
    const friction = 0.99
    let animationFrameId: number

    const animate = () => {
      setConfetti(currentConfetti => {
        return currentConfetti
          .map(piece => ({
            ...piece,
            x: piece.x + piece.velocityX,
            y: piece.y + piece.velocityY,
            velocityX: piece.velocityX * friction,
            velocityY: piece.velocityY + gravity,
            rotation: piece.rotation + piece.velocityX * 2
          }))
          .filter(piece => piece.y < window.innerHeight + 100)
      })

      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [showConfettiBurst])

  if (!showCelebration) return null

  return (
    <>
      <div 
        className="fixed inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 999999 }}
      >
        {confetti.map((piece) => (
          <div
            key={piece.id}
            className="absolute"
            style={{
              left: `${piece.x}px`,
              top: `${piece.y}px`,
              transform: `rotate(${piece.rotation}deg)`,
              transition: 'none',
              willChange: 'transform'
            }}
          >
            {piece.shape === 'circle' && (
              <div
                style={{
                  width: `${piece.size}px`,
                  height: `${piece.size}px`,
                  borderRadius: '50%',
                  backgroundColor: piece.color,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
              />
            )}
            {piece.shape === 'square' && (
              <div
                style={{
                  width: `${piece.size}px`,
                  height: `${piece.size}px`,
                  backgroundColor: piece.color,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
              />
            )}
            {piece.shape === 'triangle' && (
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: `${piece.size / 2}px solid transparent`,
                  borderRight: `${piece.size / 2}px solid transparent`,
                  borderBottom: `${piece.size}px solid ${piece.color}`,
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div 
        className="fixed inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 999998 }}
      >
        {flags.map((flag) => (
          <motion.div
            key={flag.id}
            className="absolute"
            style={{
              left: `${flag.x}%`,
              willChange: 'transform'
            }}
            initial={{ 
              y: -100, 
              rotate: flag.rotation,
              opacity: 1 
            }}
            animate={{
              y: window.innerHeight + 100,
              rotate: flag.rotation + 720,
              opacity: [1, 1, 0.8]
            }}
            transition={{
              duration: flag.duration,
              delay: flag.delay,
              ease: 'linear',
              times: [0, 0.95, 1]
            }}
            onAnimationComplete={() => {
              setFlags(prev => prev.filter(f => f.id !== flag.id))
            }}
          >
            <svg
              width={flag.size}
              height={flag.size * 0.75}
              viewBox="0 0 37 28"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
              }}
            >
              <rect width="37" height="28" fill="#C8102E"/>
              <rect x="12" width="3" height="28" fill="white"/>
              <rect y="12.5" width="37" height="3" fill="white"/>
            </svg>
          </motion.div>
        ))}
      </div>
    </>
  )
}
