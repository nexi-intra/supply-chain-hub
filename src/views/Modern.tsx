import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { SectionTile, SectionBadge, CubeBasherArt, ModernArt } from '@/components/arcade/SectionTile'
import { useLanguage } from '@/contexts/LanguageContext'
import { isAnyModalOpen } from '@/lib/modalStack'
import { CubeBasherGame } from '@/components/CubeBasherGame'

interface ModernProps {
  onNavigateBack: () => void
  userEmail?: string
}

type ModernView = 'hub' | 'cubebasher'

export function Modern({ onNavigateBack }: ModernProps) {
  const { language } = useLanguage()
  const [view, setView] = useState<ModernView>('hub')
  const openLabel = language === 'da' ? 'Åbn spil' : language === 'fi' ? 'Avaa peli' : language === 'sv' ? 'Öppna spel' : 'Open game'

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
              {language === 'da' ? 'Tilbage til Spilhjørnet' : language === 'fi' ? 'Takaisin pelinurkkaan' : language === 'sv' ? 'Tillbaka till Spelhörnan' : 'Back to Game Corner'}
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
            <SectionBadge game="section-modern" art={<ModernArt />} />
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
              : language === 'fi' ? 'Suurempia, moderneja 3D-pelejä — enemmän kuin vain nopea kierros.' : language === 'sv' ? 'Större, moderna 3D-spel — mer än bara en snabb runda.' : 'Bigger, modern 3D games — more than just a quick round.'}
          </motion.p>
        </motion.header>

        <motion.div
          className="mx-auto grid max-w-md auto-rows-fr grid-cols-1 gap-4 md:gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          {/* Hvert spil-kort SKAL have sin egen unikke OKLCH-farve (ligesom Arcades 5 spil) —
              genbrug ALDRIG en anden games farve her. Farverne ligger i arcade.css pr. data-game. */}
          <motion.div
            className="h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <SectionTile
              game="cubebasher"
              title="Cube Basher"
              cta={openLabel}
              art={<CubeBasherArt />}
              onClick={() => setView('cubebasher')}
              description={language === 'da'
                ? 'Overlev 30 minutter fra daggry til nat mod en voksende hær af onde terninger. Saml 11 våben, udvikl dem til super-våben, åbn skattekister og klar meteorregn og blodmåne!'
                : language === 'fi' ? 'Selviydy 30 minuuttia aamunkoitosta yöhön kasvavaa pahojen kuutioiden laumaa vastaan. Kerää 11 asetta, kehitä niistä superaseita, avaa aarrearkkuja ja selviä meteorisateesta ja verikuusta!' : language === 'sv' ? 'Överlev 30 minuter från gryning till natt mot en växande horde av onda kuber. Samla 11 vapen, utveckla dem till supervapen, öppna skattkistor och klara meteorregn och blodmåne!' : 'Survive 30 minutes from dawn till night against a growing horde of evil cubes. Collect 11 weapons, evolve them into super weapons, open treasure chests and weather meteor showers and blood moons!'}
            />
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
