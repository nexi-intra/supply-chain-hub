import { useState, useEffect, lazy, Suspense } from 'react'
import { GameController, ArrowLeft, RocketLaunch, Cube, Bird, SquaresFour, WaveSine } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'
import { isAnyDialogOpen } from '@/lib/modalStack'
import './arcade.css'

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
        : language === 'fi' ? 'Räjähdysaalto kanojen aallon jälkeen ja väistää niiden munat. Kuinka pitkälle pääset?' : 'Blast wave after wave of chickens and dodge their falling eggs. How far can you get?',
      icon: <RocketLaunch size={48} weight="duotone" />,
      available: true,
    },
    {
      id: 'brickbreak',
      title: language === 'da' ? 'Brick Break' : language === 'fi' ? 'Brick Break' : 'Brick Break',
      description: language === 'da' 
        ? 'Ødelæg alle brikkerne og klar så mange levels som muligt!'
        : language === 'fi' ? 'Tuhoa kaikki tiilet ja selkeä mahdollisimman monta tasoa!' : 'Destroy all bricks and clear as many levels as possible!',
      icon: <Cube size={48} weight="duotone" />,
      available: true,
    },
    {
      id: 'nexiflyer',
      title: 'Nexi Flyer',
      description: language === 'da'
        ? 'Flyv gennem rørene og sæt ny rekord i dette klassiske arkadespil!'
        : language === 'fi' ? 'Lennä putkien läpi ja aseta uusi ennätys tässä klassinen arcade peli!' : 'Fly through the pipes and set a new record in this classic arcade game!',
      icon: <Bird size={48} weight="duotone" />,
      available: true,
    },
    {
      id: 'tetris',
      title: 'Tetris',
      description: language === 'da'
        ? 'Det klassiske klodsespil. Ryd så mange linjer som muligt!'
        : language === 'fi' ? 'Klassinen korttelipeli. Tyhjennä mahdollisimman monta riviä!' : 'The classic block game. Clear as many lines as possible!',
      icon: <SquaresFour size={48} weight="duotone" />,
      available: true,
    },
    {
      id: 'neonsnake',
      title: 'Neon Snake',
      description: language === 'da'
        ? 'Styr den glødende slange, spis æbler og jagt de gyldne bonusfrugter — uden at bide dig selv!'
        : language === 'fi' ? 'Ohjaa hehkuva käärme, syö omenoita ja jahtaa kultainen bonus hedelmiä purematta itseäsi!' : 'Steer the glowing snake, eat apples and chase golden bonus fruit — without biting yourself!',
      icon: <WaveSine size={48} weight="duotone" />,
      available: true,
    },
  ]

  if (currentView === 'endlessdodger') {
    return (
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="endlessdodger">
        <div>
          <div className="arcade-banner relative py-6 border-b">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  aria-label={language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : 'Back to Arcade'}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-md bg-white/15">
                    <RocketLaunch size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-white">
                      Chickeninvasion
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da' 
                        ? 'Skyd hønseinvasionen ned og undgå deres æg'
                        : language === 'fi' ? 'Räjäytä kanan hyökkäys ja väistä niiden munia' : 'Blast the chicken invasion and dodge their eggs'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="arcade-board container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
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
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="brickbreak">
        <div>
          <div className="arcade-banner relative py-6 border-b">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  aria-label={language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : 'Back to Arcade'}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-md bg-white/15">
                    <Cube size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-white">
                      Brick Break
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da' 
                        ? 'Ødelæg alle brikker og klar så mange levels som muligt'
                        : language === 'fi' ? 'Tuhoa kaikki tiilet ja selkeä mahdollisimman monta tasoa' : 'Destroy all bricks and clear as many levels as possible'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="arcade-board container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
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
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="nexiflyer">
        <div>
          <div className="arcade-banner relative py-6 border-b">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  aria-label={language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : 'Back to Arcade'}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-md bg-white/15">
                    <Bird size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-white">
                      Nexi Flyer
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da'
                        ? 'Flyv gennem rørene så langt som muligt'
                        : language === 'fi' ? 'Lennä putkien läpi niin pitkälle kuin voit' : 'Fly through the pipes as far as you can'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="arcade-board container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
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
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="tetris">
        <div>
          <div className="arcade-banner relative py-6 border-b">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  aria-label={language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : 'Back to Arcade'}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-md bg-white/15">
                    <SquaresFour size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-white">
                      Tetris
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da'
                        ? 'Ryd så mange linjer som muligt'
                        : language === 'fi' ? 'Tyhjennä mahdollisimman monta riviä' : 'Clear as many lines as possible'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="arcade-board container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
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
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="neonsnake">
        <div>
          <div className="arcade-banner relative py-6 border-b">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 relative z-10">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setCurrentView('hub')}
                  aria-label={language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : 'Back to Arcade'}
                  variant="ghost"
                  size="lg"
                  className="text-white hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft size={24} weight="bold" />
                </Button>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-md bg-white/15">
                    <WaveSine size={32} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-white">
                      Neon Snake
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base">
                      {language === 'da'
                        ? 'Spis æbler, voks dig lang og slå rekorden'
                        : language === 'fi' ? 'Syö omenat, kasva pitkäksi ja lyö ennätys' : 'Eat apples, grow long and beat the record'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="arcade-board container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
            <Suspense fallback={<GameLoadingFallback />}>
              <NeonSnake userEmail={userEmail} />
            </Suspense>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="arcade-library min-h-screen text-foreground">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Button onClick={onNavigateBack} variant="outline" className="mb-10 gap-2">
          <ArrowLeft size={18} aria-hidden="true" />
          {language === 'da' ? 'Tilbage til Spilhjørnet' : language === 'fi' ? 'Takaisin pelinurkkaan' : 'Back to Game Corner'}
        </Button>
        <header className="mb-8 flex items-center gap-4 border-b border-border pb-7">
          <div className="rounded-md bg-primary/10 p-3 text-primary"><GameController size={36} weight="duotone" aria-hidden="true" /></div>
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Arcade</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {language === 'da' ? 'Tag en pause og konkurrér med kollegaerne om de bedste scores.' : language === 'fi' ? 'Pidä tauko ja kilpaile kollegoiden kanssa parhaista pisteistä.' : 'Take a break and compete with colleagues for the best scores.'}
            </p>
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {games.filter(game => game.available).map(game => (
            <button key={game.id} type="button" data-game={game.id} onClick={() => setCurrentView(game.id as GameView)} className="arcade-tile group flex min-h-[270px] flex-col overflow-hidden rounded-md border border-border text-left transition-colors hover:border-primary/50">
              <span className="arcade-tile-art flex h-28 items-center px-6" aria-hidden="true"><span className="arcade-tile-icon">{game.icon}</span></span>
              <span className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4 sm:px-6">
                <span className="block text-lg font-semibold text-foreground">{game.title}</span>
                <span className="flex-1 text-sm leading-relaxed text-muted-foreground">{game.description}</span>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <GameController size={18} weight="duotone" aria-hidden="true" />
                  {language === 'da' ? 'Åbn spil' : language === 'fi' ? 'Avaa peli' : 'Open game'}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
