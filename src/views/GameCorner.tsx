import { motion } from 'framer-motion'
import { useState, useEffect, useCallback, lazy, Suspense, type ReactNode } from 'react'
import { GameController, ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { SectionTile, ArcadeArt, ModernArt, MultiplayerArt } from '@/components/arcade/SectionTile'
import { useLanguage } from '@/contexts/LanguageContext'
import { HubLoader, hubLoaderLabel } from '@/components/HubMark'
import { NAVIGATE_EVENT, consumeNavigationParams, peekNavigationParams } from '@/lib/appNavigation'
import { getMultiplayerLabels } from '@/lib/multiplayerLabels'
import { isAnyModalOpen } from '@/lib/modalStack'
import { Arcade } from '@/views/Arcade'
import { Modern } from '@/views/Modern'

const MultiplayerHub = lazy(() => import('@/views/MultiplayerHub').then(m => ({ default: m.MultiplayerHub })))

interface GameCornerProps {
  onNavigateBack: () => void
  userEmail?: string
}

type GameCornerView = 'hub' | 'arcade' | 'modern' | 'multiplayer'

export function GameCorner({ onNavigateBack, userEmail }: GameCornerProps) {
  const { language } = useLanguage()
  const multiplayerLabels = getMultiplayerLabels(language)
  // A deep link ({ view: 'games', tab: 'multiplayer', itemId }) opens the section, and a game when itemId is set.
  // Read without clearing: a render React discards (lazy chunk, newer update) must not eat the link.
  const [deepLink] = useState(() => {
    const params = peekNavigationParams()
    return params?.tab === 'multiplayer' ? { gameId: params.itemId ?? null } : null
  })
  useEffect(() => { consumeNavigationParams() }, [])
  const [view, setView] = useState<GameCornerView>(deepLink ? 'multiplayer' : 'hub')
  const [initialGameId, setInitialGameId] = useState<string | null>(deepLink?.gameId ?? null)
  const [startInGame, setStartInGame] = useState(Boolean(deepLink))
  const [openGameId, setOpenGameId] = useState<string | null>(null)
  const clearOpenGame = useCallback(() => setOpenGameId(null), [])

  useEffect(() => {
    // App.tsx only passes the view in the event detail; the one-shot params are read here.
    const handleNavigate = (event: Event) => {
      if ((event as CustomEvent).detail?.view !== 'games') return
      const params = consumeNavigationParams()
      if (params?.tab !== 'multiplayer') return
      setView('multiplayer')
      setStartInGame(true)
      setInitialGameId(params.itemId ?? null)
      setOpenGameId(params.itemId ?? null)
    }
    window.addEventListener(NAVIGATE_EVENT, handleNavigate)
    return () => window.removeEventListener(NAVIGATE_EVENT, handleNavigate)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isAnyModalOpen()) return
      // Arcade er mounted og ejer selv sin Escape-håndtering (spil → spil-menu → hertil).
      if (view !== 'hub') return
      onNavigateBack()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [view, onNavigateBack])

  if (view === 'arcade') {
    return <Arcade onNavigateBack={() => setView('hub')} userEmail={userEmail} />
  }
  if (view === 'modern') {
    return <Modern onNavigateBack={() => setView('hub')} userEmail={userEmail} />
  }
  if (view === 'multiplayer') {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><HubLoader label={hubLoaderLabel(language)} /></div>}>
        <MultiplayerHub
          onNavigateBack={() => { setView('hub'); setStartInGame(false); setInitialGameId(null); setOpenGameId(null) }}
          userEmail={userEmail}
          startInGame={startInGame}
          initialGameId={initialGameId}
          openGameId={openGameId}
          onOpenGameConsumed={clearOpenGame}
        />
      </Suspense>
    )
  }

  const openLabel = language === 'da' ? 'Åbn' : language === 'fi' ? 'Avaa' : language === 'sv' ? 'Öppna' : 'Open'
  const sections: { view: Exclude<GameCornerView, 'hub'>; title: string; description: string; art: ReactNode }[] = [
    {
      view: 'arcade',
      title: 'Arcade',
      description: language === 'da'
        ? 'Klassiske arkadespil — konkurrér med kollegaer om de bedste scores!'
        : language === 'fi' ? 'Klassisia arcade-pelejä — kilpaile kollegoiden kanssa parhaista tuloksista!' : language === 'sv' ? 'Klassiska arkadspel — tävla med kollegorna om de bästa poängen!' : 'Classic arcade games — compete with colleagues for the best scores!',
      art: <ArcadeArt />,
    },
    {
      view: 'modern',
      title: 'Modern',
      description: language === 'da'
        ? 'Større 3D-spil i moderne stil — mere end blot en hurtig omgang.'
        : language === 'fi' ? 'Suurempia, moderneja 3D-pelejä — enemmän kuin vain nopea kierros.' : language === 'sv' ? 'Större, moderna 3D-spel — mer än bara en snabb runda.' : 'Bigger, modern 3D games — more than just a quick round.',
      art: <ModernArt />,
    },
    {
      view: 'multiplayer',
      title: multiplayerLabels.sectionName,
      description: multiplayerLabels.sectionTagline,
      art: <MultiplayerArt />,
    },
  ]

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed top-6 right-6 left-6 z-30 pointer-events-none">
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
              className="pointer-events-auto bg-background/90 hover:bg-background transition-colors gap-2 font-semibold"
            >
              <ArrowLeft size={20} weight="bold" />
              {language === 'da' ? 'Tilbage til Hub' : language === 'fi' ? 'Takaisin Hubiin' : language === 'sv' ? 'Tillbaka till Hub' : 'Back to Hub'}
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
            <div className="p-6 rounded-md bg-primary">
              <GameController size={64} weight="duotone" className="text-white" />
            </div>
          </motion.div>
          <motion.h1
            className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            {language === 'da' ? 'Spilhjørnet' : language === 'fi' ? 'Pelikulma' : language === 'sv' ? 'Spelhörnan' : 'Game Corner'}
          </motion.h1>
          <motion.p
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {language === 'da'
              ? 'Tag en pause og test dine færdigheder.'
              : language === 'fi' ? 'Pidä tauko ja testaa taitojasi.' : language === 'sv' ? 'Ta en paus och testa dina färdigheter.' : 'Take a break and test your skills.'}
          </motion.p>
        </motion.header>

        <motion.div
          className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          {sections.map((section, index) => (
            <motion.div
              key={section.view}
              className="h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + index * 0.05, duration: 0.4 }}
            >
              <SectionTile
                game={`section-${section.view}`}
                title={section.title}
                description={section.description}
                cta={openLabel}
                art={section.art}
                onClick={() => setView(section.view)}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
