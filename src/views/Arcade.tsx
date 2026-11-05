import { useState, useEffect, lazy, Suspense } from 'react'
import { GameController, ArrowLeft, RocketLaunch, Diamond, Package, ShippingContainer, Truck } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { SectionBadge, ArcadeArt } from '@/components/arcade/SectionTile'
import { useLanguage } from '@/contexts/LanguageContext'
import { isAnyDialogOpen } from '@/lib/modalStack'
import './arcade.css'

// Hvert spil hentes kun når spilleren rent faktisk vælger det, i stedet for at
// alle 5 spils kode indlæses samlet blot ved at åbne Arcade.
const ChickenInvaders = lazy(() => import('@/games/chickenInvaders/ChickenInvaders').then(m => ({ default: m.ChickenInvaders })))
const PrismBreak = lazy(() => import('@/games/brickBreak/PrismBreak').then(m => ({ default: m.PrismBreak })))
const ParcelPilot = lazy(() => import('@/games/parcelPilot/ParcelPilot').then(m => ({ default: m.ParcelPilot })))
const CargoStack = lazy(() => import('@/games/cargoStack/CargoStack').then(m => ({ default: m.CargoStack })))
const RouteRunner = lazy(() => import('@/games/routeRunner/RouteRunner').then(m => ({ default: m.RouteRunner })))

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
      title: 'Chicken Invaders',
      description: language === 'da'
        ? 'Mor Høne vil have sin flok tilbage. Skyd bølger af høns ned, opgrader kanonen og besejr hende.'
        : language === 'fi' ? 'Emokana haluaa parvensa takaisin. Ammu kana-aallot alas, paranna tykkiäsi ja voita hänet.' : language === 'sv' ? 'Mamma Höna vill ha tillbaka sin flock. Skjut ner vågor av hönor, uppgradera din kanon och besegra henne.' : 'Mother Hen wants her flock back. Shoot down waves of hens, upgrade your cannon and defeat her.',
      icon: <RocketLaunch size={48} weight="duotone" />,
      available: true,
    },
    {
      id: 'brickbreak',
      title: 'Prism Break',
      description: language === 'da'
        ? 'Knus glasmosaikkerne med en lysende kugle, fang power-ups og lad dagslyset strømme ind.'
        : language === 'fi' ? 'Murskaa lasimaalaukset hehkuvalla pallolla, kerää tehosteita ja päästä päivänvalo sisään.' : language === 'sv' ? 'Krossa glasmosaikerna med en glödande kula, fånga power-ups och låt dagsljuset strömma in.' : 'Smash the stained glass with a glowing ball, catch power-ups and let the daylight pour in.',
      icon: <Diamond size={48} weight="duotone" />,
      available: true,
    },
    {
      id: 'nexiflyer',
      title: 'Parcel Pilot',
      description: language === 'da'
        ? 'Flyv en fragtdrone gennem containerhavnen om natten, ram midten af hullerne og saml pakker undervejs.'
        : language === 'fi' ? 'Lennätä rahtidroonia yöllisen konttisataman läpi, osu aukkojen keskelle ja kerää paketteja matkalla.' : language === 'sv' ? 'Flyg en fraktdrönare genom containerhamnen på natten, träffa mitten av luckorna och samla paket på vägen.' : 'Fly a cargo drone through the container port at night, hit the centre of the gaps and grab parcels on the way.',
      icon: <Package size={48} weight="duotone" />,
      available: true,
    },
    {
      id: 'tetris',
      title: 'Cargo Stack',
      description: language === 'da'
        ? 'Læs godset tæt i containeren på lageret. Fulde rækker bliver kørt væk – fire på én gang er en fuld last.'
        : language === 'fi' ? 'Pakkaa lasti tiiviisti konttiin varastossa. Täydet rivit lähetetään matkaan – neljä kerralla on täysi lasti.' : language === 'sv' ? 'Packa lasten tätt i containern på lagret. Fulla rader skickas iväg – fyra på en gång är en full last.' : 'Pack the cargo tight in the container in the warehouse. Full rows get shipped out – four at once is a full load.',
      icon: <ShippingContainer size={48} weight="duotone" />,
      available: true,
    },
    {
      id: 'neonsnake',
      title: 'Route Runner',
      description: language === 'da'
        ? 'Kør lagertoget rundt, saml pakkerne op og få toget til at vokse – uden at ramme væggen, dine egne vogne eller pallerne.'
        : language === 'fi' ? 'Aja varastojunaa, kerää paketit ja kasvata junaa – osumatta seiniin, omiin vaunuihisi tai lavoihin.' : language === 'sv' ? 'Kör lagertåget runt, plocka upp paketen och låt tåget växa – utan att krocka med väggen, dina egna vagnar eller pallarna.' : 'Drive the warehouse train, pick up the parcels and grow the train – without hitting the walls, your own carts or the pallets.',
      icon: <Truck size={48} weight="duotone" />,
      available: true,
    },
  ]

  if (currentView === 'endlessdodger') {
    return (
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="endlessdodger">
        <div className="container mx-auto px-4 sm:px-6 pt-5 pb-10 max-w-6xl">
          <Button onClick={() => setCurrentView('hub')} variant="ghost" className="mb-4 gap-2 -ml-2">
            <ArrowLeft size={20} weight="bold" aria-hidden="true" />
            {language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : language === 'sv' ? 'Tillbaka till Arcade' : 'Back to Arcade'}
          </Button>
          <Suspense fallback={<GameLoadingFallback />}>
            <ChickenInvaders userEmail={userEmail} />
          </Suspense>
        </div>
      </div>
    )
  }

  if (currentView === 'brickbreak') {
    return (
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="brickbreak">
        <div className="container mx-auto px-4 sm:px-6 pt-5 pb-10 max-w-6xl">
          <Button onClick={() => setCurrentView('hub')} variant="ghost" className="mb-4 gap-2 -ml-2">
            <ArrowLeft size={20} weight="bold" aria-hidden="true" />
            {language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : language === 'sv' ? 'Tillbaka till Arcade' : 'Back to Arcade'}
          </Button>
          <Suspense fallback={<GameLoadingFallback />}>
            <PrismBreak userEmail={userEmail} />
          </Suspense>
        </div>
      </div>
    )
  }

  if (currentView === 'nexiflyer') {
    return (
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="nexiflyer">
        <div className="container mx-auto px-4 sm:px-6 pt-5 pb-10 max-w-6xl">
          <Button onClick={() => setCurrentView('hub')} variant="ghost" className="mb-4 gap-2 -ml-2">
            <ArrowLeft size={20} weight="bold" aria-hidden="true" />
            {language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : language === 'sv' ? 'Tillbaka till Arcade' : 'Back to Arcade'}
          </Button>
          <Suspense fallback={<GameLoadingFallback />}>
            <ParcelPilot userEmail={userEmail} />
          </Suspense>
        </div>
      </div>
    )
  }

  if (currentView === 'tetris') {
    return (
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="tetris">
        <div className="container mx-auto px-4 sm:px-6 pt-5 pb-10 max-w-6xl">
          <Button onClick={() => setCurrentView('hub')} variant="ghost" className="mb-4 gap-2 -ml-2">
            <ArrowLeft size={20} weight="bold" aria-hidden="true" />
            {language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : language === 'sv' ? 'Tillbaka till Arcade' : 'Back to Arcade'}
          </Button>
          <Suspense fallback={<GameLoadingFallback />}>
            <CargoStack userEmail={userEmail} />
          </Suspense>
        </div>
      </div>
    )
  }

  if (currentView === 'neonsnake') {
    return (
      <div className="arcade-screen min-h-screen bg-background text-foreground" data-game="neonsnake">
        <div className="container mx-auto px-4 sm:px-6 pt-5 pb-10 max-w-6xl">
          <Button onClick={() => setCurrentView('hub')} variant="ghost" className="mb-4 gap-2 -ml-2">
            <ArrowLeft size={20} weight="bold" aria-hidden="true" />
            {language === 'da' ? 'Tilbage til Arcade' : language === 'fi' ? 'Takaisin Arcadeen' : language === 'sv' ? 'Tillbaka till Arcade' : 'Back to Arcade'}
          </Button>
          <Suspense fallback={<GameLoadingFallback />}>
            <RouteRunner userEmail={userEmail} />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className="arcade-library min-h-screen text-foreground">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Button onClick={onNavigateBack} variant="outline" className="mb-10 gap-2">
          <ArrowLeft size={18} aria-hidden="true" />
          {language === 'da' ? 'Tilbage til Spilhjørnet' : language === 'fi' ? 'Takaisin pelinurkkaan' : language === 'sv' ? 'Tillbaka till Spelhörnan' : 'Back to Game Corner'}
        </Button>
        <header className="mb-8 flex items-center gap-4 border-b border-border pb-7">
          <SectionBadge game="section-arcade" art={<ArcadeArt />} />
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Arcade</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {language === 'da' ? 'Tag en pause og konkurrér med kollegaerne om de bedste scores.' : language === 'fi' ? 'Pidä tauko ja kilpaile kollegoiden kanssa parhaista pisteistä.' : language === 'sv' ? 'Ta en paus och tävla med kollegorna om de bästa poängen.' : 'Take a break and compete with colleagues for the best scores.'}
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
                  {language === 'da' ? 'Åbn spil' : language === 'fi' ? 'Avaa peli' : language === 'sv' ? 'Öppna spel' : 'Open game'}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
