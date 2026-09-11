import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { GameController, ArrowLeft, Joystick, Headset } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'
import { isAnyModalOpen } from '@/lib/modalStack'
import { Arcade } from '@/views/Arcade'
import { Modern } from '@/views/Modern'

interface GameCornerProps {
  onNavigateBack: () => void
  userEmail?: string
}

type GameCornerView = 'hub' | 'arcade' | 'modern'

export function GameCorner({ onNavigateBack, userEmail }: GameCornerProps) {
  const { language } = useLanguage()
  const [view, setView] = useState<GameCornerView>('hub')

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
              {language === 'da' ? 'Tilbage til Hub' : 'Back to Hub'}
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
            {language === 'da' ? 'Spilhjørnet' : 'Game Corner'}
          </motion.h1>
          <motion.p
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {language === 'da'
              ? 'Tag en pause og test dine færdigheder.'
              : 'Take a break and test your skills.'}
          </motion.p>
        </motion.header>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <motion.div
              initial={{ scale: 1, y: 0, rotate: 0, boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)" }}
              whileHover={{ scale: 1.08, y: -10, rotate: [0, 3, -3, 0], boxShadow: "0 30px 60px -15px rgba(0, 0, 0, 0.35)" }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Card
                className="relative overflow-hidden border-2 transition-all duration-300 group h-full min-h-[180px] sm:min-h-[220px] flex flex-col cursor-pointer hover:border-primary/40"
                onClick={() => setView('arcade')}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-br"
                  style={{ background: 'radial-gradient(circle at top right, oklch(0.45 0.17 278 / 0.08), transparent)' }}
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />

                <div className="relative p-4 md:p-6 flex flex-col flex-1">
                  <motion.div
                    className="mb-3 md:mb-4 inline-flex items-center justify-center rounded-2xl p-2 md:p-3 shadow-lg bg-gradient-to-br from-[oklch(0.45_0.17_278)] via-[oklch(0.52_0.15_272)] to-[oklch(0.41_0.17_280)]"
                    style={{ color: 'white' }}
                    initial={{ scale: 1, rotate: 0, y: 0 }}
                    whileHover={{ scale: [1, 1.3, 1.15], rotate: [0, -15, 15, -10, 10, 0], y: [0, -8, 0] }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  >
                    <div className="[&>svg]:w-8 [&>svg]:h-8 md:[&>svg]:w-12 md:[&>svg]:h-12">
                      <Joystick size={48} weight="duotone" />
                    </div>
                  </motion.div>

                  <h3 className="text-sm sm:text-base md:text-lg font-bold mb-1.5 md:mb-2 text-foreground text-center">
                    Arcade
                  </h3>

                  <p className="text-muted-foreground text-xs leading-relaxed mb-3 md:mb-4 flex-1">
                    {language === 'da'
                      ? 'Klassiske arkadespil — konkurrér med kollegaer om de bedste scores!'
                      : 'Classic arcade games — compete with colleagues for the best scores!'}
                  </p>
                </div>
              </Card>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.4 }}
          >
            <motion.div
              initial={{ scale: 1, y: 0, rotate: 0, boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)" }}
              whileHover={{ scale: 1.08, y: -10, rotate: [0, 3, -3, 0], boxShadow: "0 30px 60px -15px rgba(0, 0, 0, 0.35)" }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Card
                className="relative overflow-hidden border-2 transition-all duration-300 group h-full min-h-[180px] sm:min-h-[220px] flex flex-col cursor-pointer hover:border-primary/40"
                onClick={() => setView('modern')}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-br"
                  style={{ background: 'radial-gradient(circle at top right, oklch(0.55 0.19 25 / 0.08), transparent)' }}
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />

                <div className="relative p-4 md:p-6 flex flex-col flex-1">
                  <motion.div
                    className="mb-3 md:mb-4 inline-flex items-center justify-center rounded-2xl p-2 md:p-3 shadow-lg bg-gradient-to-br from-[oklch(0.55_0.19_25)] via-[oklch(0.58_0.17_35)] to-[oklch(0.48_0.20_15)]"
                    style={{ color: 'white' }}
                    initial={{ scale: 1, rotate: 0, y: 0 }}
                    whileHover={{ scale: [1, 1.3, 1.15], rotate: [0, -15, 15, -10, 10, 0], y: [0, -8, 0] }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  >
                    <div className="[&>svg]:w-8 [&>svg]:h-8 md:[&>svg]:w-12 md:[&>svg]:h-12">
                      <Headset size={48} weight="duotone" />
                    </div>
                  </motion.div>

                  <h3 className="text-sm sm:text-base md:text-lg font-bold mb-1.5 md:mb-2 text-foreground text-center">
                    Modern
                  </h3>

                  <p className="text-muted-foreground text-xs leading-relaxed mb-3 md:mb-4 flex-1">
                    {language === 'da'
                      ? 'Større 3D-spil i moderne stil — mere end blot en hurtig omgang.'
                      : 'Bigger, modern 3D games — more than just a quick round.'}
                  </p>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
