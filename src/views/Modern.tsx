import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Cube, Headset, Books, ArrowLeft } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'
import { isAnyModalOpen } from '@/lib/modalStack'
import { CubeBasherGame } from '@/components/CubeBasherGame'
import { TheLibrarian2Game } from '@/components/TheLibrarian2Game'

interface ModernProps {
  onNavigateBack: () => void
  userEmail?: string
}

type ModernView = 'hub' | 'cubebasher' | 'librarian2'

export function Modern({ onNavigateBack }: ModernProps) {
  const { language } = useLanguage()
  const [view, setView] = useState<ModernView>('hub')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isAnyModalOpen()) return
      // Cube Basher-iframen fanger selv Escape internt (egen pause-menu) — dette
      // niveau reagerer kun når vi allerede er tilbage på Moderns egen oversigt.
      if (view !== 'hub') return
      onNavigateBack()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [view, onNavigateBack])

  if (view === 'cubebasher') {
    return <CubeBasherGame onNavigateBack={() => setView('hub')} />
  }
  if (view === 'librarian2') {
    return <TheLibrarian2Game onNavigateBack={() => setView('hub')} />
  }

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
              {language === 'da' ? 'Tilbage til Spilhjørnet' : language === 'fi' ? 'Takaisin pelinurkkaan' : 'Back to Game Corner'}
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
              <Headset size={64} weight="duotone" className="text-white" />
            </div>
          </motion.div>
          <motion.h1
            className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Modern
          </motion.h1>
          <motion.p
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {language === 'da'
              ? 'Større, moderne 3D-spil — mere end blot en hurtig omgang.'
              : language === 'fi' ? 'Suurempi, moderni 3D-pelit ... enemmän kuin vain nopea kierros.' : 'Bigger, modern 3D games — more than just a quick round.'}
          </motion.p>
        </motion.header>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          {/* Hvert spil-kort SKAL have sin egen unikke OKLCH-farve (ligesom Arcades 5 spil) —
              genbrug ALDRIG en anden games farve her. Modern-headerens farve ovenfor er
              bevidst en tredje, neutral "modul-farve" delt af ingen af kortene. */}
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
                className="relative overflow-hidden transition-colors group h-full flex flex-col cursor-pointer hover:border-primary/40"
                onClick={() => setView('cubebasher')}
              >
                <motion.div
                  className="absolute inset-0"
                  style={{ background: 'radial-gradient(circle at top right, oklch(0.55 0.19 25 / 0.08), transparent)' }}
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />

                <div className="relative p-4 md:p-6 flex flex-col flex-1">
                  <motion.div
                    className="mb-3 inline-flex items-center justify-center rounded-md p-2 bg-secondary text-primary"
                    style={{ color: 'white' }}
                    initial={{ scale: 1, rotate: 0, y: 0 }}
                    whileHover={{ scale: [1, 1.3, 1.15], rotate: [0, -15, 15, -10, 10, 0], y: [0, -8, 0] }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  >
                    <div className="[&>svg]:w-8 [&>svg]:h-8 md:[&>svg]:w-12 md:[&>svg]:h-12">
                      <Cube size={48} weight="duotone" />
                    </div>
                  </motion.div>

                  <h3 className="text-sm sm:text-base md:text-lg font-bold mb-1.5 md:mb-2 text-foreground text-center">
                    Cube Basher
                  </h3>

                  <p className="text-muted-foreground text-xs leading-relaxed mb-3 md:mb-4 flex-1">
                    {language === 'da'
                      ? 'Overlev 30 minutter mod en voksende hær af onde terninger. Byg din helt og bank fjender med din hammer!'
                      : language === 'fi' ? 'Selviytyä 30 minuuttia vastaan kasvava lauma pahoja kuutioita. Tasoita sankari ja lyö vihollisia vasaralla!' : 'Survive 30 minutes against a growing horde of evil cubes. Level up your hero and bash enemies with your hammer!'}
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
                className="relative overflow-hidden transition-colors group h-full flex flex-col cursor-pointer hover:border-primary/40"
                onClick={() => setView('librarian2')}
              >
                <motion.div
                  className="absolute inset-0"
                  style={{ background: 'radial-gradient(circle at top right, oklch(0.50 0.18 295 / 0.08), transparent)' }}
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />

                <div className="relative p-4 md:p-6 flex flex-col flex-1">
                  <motion.div
                    className="mb-3 inline-flex items-center justify-center rounded-md p-2 bg-secondary text-primary"
                    style={{ color: 'white' }}
                    initial={{ scale: 1, rotate: 0, y: 0 }}
                    whileHover={{ scale: [1, 1.3, 1.15], rotate: [0, -15, 15, -10, 10, 0], y: [0, -8, 0] }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  >
                    <div className="[&>svg]:w-8 [&>svg]:h-8 md:[&>svg]:w-12 md:[&>svg]:h-12">
                      <Books size={48} weight="duotone" />
                    </div>
                  </motion.div>

                  <h3 className="text-sm sm:text-base md:text-lg font-bold mb-1.5 md:mb-2 text-foreground text-center">
                    The Librarian
                  </h3>

                  <p className="text-muted-foreground text-xs leading-relaxed mb-3 md:mb-4 flex-1">
                    {language === 'da'
                      ? 'Stil bøger tilbage på hylderne hurtigere end børnene kan tage dem ned. Hold Kaos-måleren under 100 % indtil lukketid!'
                      : language === 'fi' ? 'Hyllyt ovat nopeampia kuin lapset. Pidä kaaosmittari alle 100% kunnes sulkemisaika!' : 'Shelve books faster than the kids can unshelve them. Keep the Chaos meter under 100% until closing time!'}
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
