import { motion } from 'framer-motion'
import { useState, useEffect, lazy, Suspense } from 'react'
import { GameController, ArrowLeft, RocketLaunch, Cube, Bird, SquaresFour, WaveSine } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'
import { isAnyDialogOpen } from '@/lib/modalStack'

// Hvert spil hentes kun når spilleren rent faktisk vælger det, i stedet for at
// alle 5 spils kode indlæses samlet blot ved at åbne Arcade.
const EndlessDodger = lazy(() => import('@/components/EndlessDodger').then(m => ({ default: m.EndlessDodger })))
const BrickBreak = lazy(() => import('@/components/BrickBreak').then(m => ({ default: m.BrickBreak })))
const NexiFlyer = lazy(() => import('@/components/NexiFlyer').then(m => ({ default: m.NexiFlyer })))
const Tetris = lazy(() => import('@/components/Tetris').then(m => ({ default: m.Tetris })))
const NeonSnake = lazy(() => import('@/components/NeonSnake').then(m => ({ default: m.NeonSnake })))

/** Vises kortvarigt mens et spils kode hentes ved første valg. */
function GameLoadingFallback() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  )
}

interface ArcadeProps {
  onNavigateBack: () => void
  userEmail?: string
}

type GameView = 'hub' | 'endlessdodger' | 'brickbreak' | 'nexiflyer' | 'tetris' | 'neonsnake'

interface GameModule {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  gradient: string
  available: boolean
}

export function Arcade({ onNavigateBack, userEmail }: ArcadeProps) {
  const { language } = useLanguage()
  const [currentView, setCurrentView] = useState<GameView>('hub')

  // Signalerer til den globale Escape-håndtering (App.tsx) at et spil er
  // aktivt, så Escape først går tilbage til spil-menuen her, i stedet for at
  // hoppe direkte til main Hub. Se lib/modalStack.ts.
  useEffect(() => {
    if (currentView !== 'hub') {
      document.body.setAttribute('data-game-active', 'true')
    } else {
      document.body.removeAttribute('data-game-active')
    }
    return () => document.body.removeAttribute('data-game-active')
  }, [currentView])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isAnyDialogOpen()) return
      if (currentView !== 'hub') {
        setCurrentView('hub')
        return
      }
      onNavigateBack()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [currentView, onNavigateBack])

  const games: GameModule[] = [
    {
      id: 'endlessdodger',
      title: 'Chickeninvasion',
      description: language === 'da' 
        ? 'Skyd bølge efter bølge af høns ned og undgå deres æg. Hvor langt kan du nå?'
        : 'Blast wave after wave of chickens and dodge their falling eggs. How far can you get?',
      icon: <RocketLaunch size={48} weight="duotone" />,
      color: 'oklch(0.50 0.14 275)',
      gradient: 'from-[oklch(0.50_0.14_275)] via-[oklch(0.56_0.12_262)] to-[oklch(0.46_0.15_276)]',
      available: true,
    },
    {
      id: 'brickbreak',
      title: language === 'da' ? 'Brick Break' : 'Brick Break',
      description: language === 'da' 
        ? 'Ødelæg alle brikkerne og klar så mange levels som muligt!'
        : 'Destroy all bricks and clear as many levels as possible!',
      icon: <Cube size={48} weight="duotone" />,
      color: 'oklch(0.52 0.12 330)',
      gradient: 'from-[oklch(0.52_0.12_330)] via-[oklch(0.55_0.11_305)] to-[oklch(0.48_0.12_332)]',
      available: true,
    },
    {
      id: 'nexiflyer',
      title: 'Nexi Flyer',
      description: language === 'da'
        ? 'Flyv gennem rørene og sæt ny rekord i dette klassiske arkadespil!'
        : 'Fly through the pipes and set a new record in this classic arcade game!',
      icon: <Bird size={48} weight="duotone" />,
      color: 'oklch(0.68 0.11 80)',
      gradient: 'from-[oklch(0.68_0.11_80)] via-[oklch(0.72_0.10_65)] to-[oklch(0.64_0.11_82)]',
      available: true,
    },
    {
      id: 'tetris',
      title: 'Tetris',
      description: language === 'da'
        ? 'Det klassiske klodsespil. Ryd så mange linjer som muligt!'
        : 'The classic block game. Clear as many lines as possible!',
      icon: <SquaresFour size={48} weight="duotone" />,
      color: 'oklch(0.52 0.13 248)',
      gradient: 'from-[oklch(0.52_0.13_248)] via-[oklch(0.56_0.11_240)] to-[oklch(0.48_0.13_250)]',
      available: true,
    },
    {
      id: 'neonsnake',
      title: 'Neon Snake',
      description: language === 'da'
        ? 'Styr den glødende slange, spis æbler og jagt de gyldne bonusfrugter — uden at bide dig selv!'
        : 'Steer the glowing snake, eat apples and chase golden bonus fruit — without biting yourself!',
      icon: <WaveSine size={48} weight="duotone" />,
      color: 'oklch(0.56 0.12 155)',
      gradient: 'from-[oklch(0.56_0.12_155)] via-[oklch(0.60_0.10_170)] to-[oklch(0.52_0.12_157)]',
      available: true,
    },
  ]

  const getIconAnimation = () => {
    return {
      initial: {
        scale: 1,
        rotate: 0,
        y: 0,
      },
      hover: {
        scale: [1, 1.3, 1.15],
        rotate: [0, -15, 15, -10, 10, 0],
        y: [0, -8, 0],
      },
      transition: {
        duration: 0.8,
        ease: "easeInOut" as const
      }
    }
  }

  const getCardAnimation = () => {
    return {
      initial: {
        scale: 1,
        y: 0,
        rotate: 0,
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
      },
      hover: {
        scale: 1.08,
        y: -10,
        rotate: [0, 3, -3, 0],
        boxShadow: "0 30px 60px -15px rgba(0, 0, 0, 0.35)",
      },
      tap: { scale: 0.92 },
      transition: {
        duration: 0.3,
        ease: "easeInOut" as const
      }
    }
  }

  if (currentView === 'endlessdodger') {
    return (
      <div className="min-h-screen" style={{
        background: `
          radial-gradient(circle at 20% 30%, oklch(0.45 0.14 270 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 80% 60%, oklch(0.55 0.11 255 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 50% 90%, oklch(0.60 0.08 250 / 0.05) 0%, transparent 50%),
          linear-gradient(
            135deg,
            oklch(0.98 0.01 250) 0%,
            oklch(0.97 0.02 280) 25%,
            oklch(0.98 0.01 210) 50%,
            oklch(0.97 0.02 240) 75%,
            oklch(0.98 0.01 250) 100%
          )
        `
      }}>
        <div style={{
          background: `
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            )
          `
        }}>
          <div className="relative bg-gradient-to-r from-[oklch(0.50_0.14_275)] via-[oklch(0.56_0.12_262)] to-[oklch(0.46_0.15_276)] py-8 shadow-xl border-b-4 border-white/10">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-xl">
                    <RocketLaunch size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                      Chickeninvasion
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da' 
                        ? 'Skyd hønseinvasionen ned og undgå deres æg'
                        : 'Blast the chicken invasion and dodge their eggs'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
            <Suspense fallback={<GameLoadingFallback />}>
              <EndlessDodger userEmail={userEmail} />
            </Suspense>
          </div>
        </div>
      </div>
    )
  }

  if (currentView === 'brickbreak') {
    return (
      <div className="min-h-screen" style={{
        background: `
          radial-gradient(circle at 20% 30%, oklch(0.45 0.14 270 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 80% 60%, oklch(0.55 0.11 255 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 50% 90%, oklch(0.60 0.08 250 / 0.05) 0%, transparent 50%),
          linear-gradient(
            135deg,
            oklch(0.98 0.01 250) 0%,
            oklch(0.97 0.02 280) 25%,
            oklch(0.98 0.01 210) 50%,
            oklch(0.97 0.02 240) 75%,
            oklch(0.98 0.01 250) 100%
          )
        `
      }}>
        <div style={{
          background: `
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            )
          `
        }}>
          <div className="relative bg-gradient-to-r from-[oklch(0.52_0.12_330)] via-[oklch(0.55_0.11_305)] to-[oklch(0.48_0.12_332)] py-8 shadow-xl border-b-4 border-white/10">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-xl">
                    <Cube size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                      Brick Break
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da' 
                        ? 'Ødelæg alle brikker og klar så mange levels som muligt'
                        : 'Destroy all bricks and clear as many levels as possible'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
            <Suspense fallback={<GameLoadingFallback />}>
              <BrickBreak userEmail={userEmail} />
            </Suspense>
          </div>
        </div>
      </div>
    )
  }

  if (currentView === 'nexiflyer') {
    return (
      <div className="min-h-screen" style={{
        background: `
          radial-gradient(circle at 20% 30%, oklch(0.45 0.14 270 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 80% 60%, oklch(0.55 0.11 255 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 50% 90%, oklch(0.60 0.08 250 / 0.05) 0%, transparent 50%),
          linear-gradient(
            135deg,
            oklch(0.98 0.01 250) 0%,
            oklch(0.97 0.02 280) 25%,
            oklch(0.98 0.01 210) 50%,
            oklch(0.97 0.02 240) 75%,
            oklch(0.98 0.01 250) 100%
          )
        `
      }}>
        <div style={{
          background: `
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            )
          `
        }}>
          <div className="relative bg-gradient-to-r from-[oklch(0.68_0.11_80)] via-[oklch(0.72_0.10_65)] to-[oklch(0.64_0.11_82)] py-8 shadow-xl border-b-4 border-white/10">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-xl">
                    <Bird size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                      Nexi Flyer
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da'
                        ? 'Flyv gennem rørene så langt som muligt'
                        : 'Fly through the pipes as far as you can'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
            <Suspense fallback={<GameLoadingFallback />}>
              <NexiFlyer userEmail={userEmail} />
            </Suspense>
          </div>
        </div>
      </div>
    )
  }

  if (currentView === 'tetris') {
    return (
      <div className="min-h-screen" style={{
        background: `
          radial-gradient(circle at 20% 30%, oklch(0.45 0.14 270 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 80% 60%, oklch(0.55 0.11 255 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 50% 90%, oklch(0.60 0.08 250 / 0.05) 0%, transparent 50%),
          linear-gradient(
            135deg,
            oklch(0.98 0.01 250) 0%,
            oklch(0.97 0.02 280) 25%,
            oklch(0.98 0.01 210) 50%,
            oklch(0.97 0.02 240) 75%,
            oklch(0.98 0.01 250) 100%
          )
        `
      }}>
        <div style={{
          background: `
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            )
          `
        }}>
          <div className="relative bg-gradient-to-r from-[oklch(0.52_0.13_248)] via-[oklch(0.56_0.11_240)] to-[oklch(0.48_0.13_250)] py-8 shadow-xl border-b-4 border-white/10">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-xl">
                    <SquaresFour size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                      Tetris
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da'
                        ? 'Ryd så mange linjer som muligt'
                        : 'Clear as many lines as possible'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
            <Suspense fallback={<GameLoadingFallback />}>
              <Tetris userEmail={userEmail} />
            </Suspense>
          </div>
        </div>
      </div>
    )
  }

  if (currentView === 'neonsnake') {
    return (
      <div className="min-h-screen" style={{
        background: `
          radial-gradient(circle at 20% 30%, oklch(0.45 0.14 270 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 80% 60%, oklch(0.55 0.11 255 / 0.08) 0%, transparent 50%),
          radial-gradient(circle at 50% 90%, oklch(0.60 0.08 250 / 0.05) 0%, transparent 50%),
          linear-gradient(
            135deg,
            oklch(0.98 0.01 250) 0%,
            oklch(0.97 0.02 280) 25%,
            oklch(0.98 0.01 210) 50%,
            oklch(0.97 0.02 240) 75%,
            oklch(0.98 0.01 250) 100%
          )
        `
      }}>
        <div style={{
          background: `
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 100px,
              oklch(0.96 0.01 240 / 0.3) 100px,
              oklch(0.96 0.01 240 / 0.3) 101px
            )
          `
        }}>
          <div className="relative bg-gradient-to-r from-[oklch(0.56_0.12_155)] via-[oklch(0.60_0.10_170)] to-[oklch(0.52_0.12_157)] py-8 shadow-xl border-b-4 border-white/10">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-xl">
                    <WaveSine size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                      Neon Snake
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da'
                        ? 'Spis æbler, voks dig lang og slå rekorden'
                        : 'Eat apples, grow long and beat the record'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
            <Suspense fallback={<GameLoadingFallback />}>
              <NeonSnake userEmail={userEmail} />
            </Suspense>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-6 right-6 left-6 z-20">
        <div className="flex items-center justify-start pb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Button
              onClick={onNavigateBack}
              variant="outline"
              size="lg"
              className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold"
            >
              <ArrowLeft size={20} weight="bold" />
              {language === 'da' ? 'Tilbage til Spilhjørnet' : 'Back to Game Corner'}
            </Button>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 pt-56 sm:pt-60 pb-12 sm:pb-20 max-w-7xl relative z-10">
        <motion.header 
          className="text-center mb-10 sm:mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex justify-center mb-6"
          >
            <div className="p-6 rounded-3xl bg-gradient-to-br from-[oklch(0.42_0.19_270)] via-[oklch(0.50_0.16_265)] to-[oklch(0.38_0.19_272)] shadow-2xl">
              <GameController size={64} weight="duotone" className="text-white" />
            </div>
          </motion.div>
          <motion.h1 
            className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight bg-gradient-to-br from-[oklch(0.42_0.19_270)] via-[oklch(0.50_0.16_265)] to-[oklch(0.38_0.19_272)] bg-clip-text text-transparent mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Arcade
          </motion.h1>
          <motion.p
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {language === 'da' 
              ? 'Tag en pause og test dine færdigheder. Konkurrér med kollegaer om de bedste scores!'
              : 'Take a break and test your skills. Compete with colleagues for the best scores!'}
          </motion.p>
        </motion.header>

        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          {games.filter(game => game.available).map((game, index) => {
            const cardAnimation = getCardAnimation()
            const iconAnimation = getIconAnimation()
            
            return (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.05, duration: 0.4 }}
              >
                <motion.div
                  initial={cardAnimation.initial}
                  whileHover={cardAnimation.hover}
                  whileTap={cardAnimation.tap}
                  transition={cardAnimation.transition}
                >
                  <Card
                    className="relative overflow-hidden border-2 transition-all duration-300 group h-full min-h-[180px] sm:min-h-[220px] flex flex-col cursor-pointer hover:border-primary/40"
                    onClick={() => setCurrentView(game.id as GameView)}
                  >
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-br"
                      style={{
                        background: `radial-gradient(circle at top right, ${game.color}15, transparent)`
                      }}
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                    
                    <div className="relative p-4 md:p-6 flex flex-col flex-1">
                      <motion.div 
                        className={cn(
                          "mb-3 md:mb-4 inline-flex items-center justify-center rounded-2xl p-2 md:p-3 shadow-lg",
                          `bg-gradient-to-br ${game.gradient}`
                        )}
                        style={{ color: 'white' }}
                        initial={iconAnimation.initial}
                        whileHover={iconAnimation.hover}
                        transition={iconAnimation.transition}
                      >
                        <div className="[&>svg]:w-8 [&>svg]:h-8 md:[&>svg]:w-12 md:[&>svg]:h-12">
                          {game.icon}
                        </div>
                      </motion.div>

                      <h3 className="text-sm sm:text-base md:text-lg font-bold mb-1.5 md:mb-2 text-foreground text-center">
                        {game.title}
                      </h3>
                      
                      <p className="text-muted-foreground text-xs leading-relaxed mb-3 md:mb-4 flex-1">
                        {game.description}
                      </p>
                    </div>
                  </Card>
                </motion.div>
              </motion.div>
            )
          })}
        </motion.div>

        {games.filter(g => g.available).length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center py-20"
          >
            <GameController size={64} className="text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">
              {language === 'da' ? 'Nye spil kommer snart!' : 'New games coming soon!'}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
