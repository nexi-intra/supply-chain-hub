import { Button } from '@/components/ui/button'
import { Play } from '@phosphor-icons/react'
import { useLanguage } from '@/contexts/LanguageContext'

/**
 * Fælles pauseskærm for arkadespillene, så pausen ser ens ud og opfører sig ens
 * uanset hvilket spil man er i gang med. Lægges oven på spillefladen.
 */
export function PauseOverlay({ onResume }: { onResume: () => void }) {
  const { language } = useLanguage()
  const title = language === 'da' ? 'Pause' : language === 'fi' ? 'Tauko' : 'Paused'
  const hint = language === 'da'
    ? 'Spillet blev sat på pause, fordi vinduet mistede fokus'
    : language === 'fi'
      ? 'Peli pysäytettiin, koska ikkuna menetti kohdistuksen'
      : 'The game was paused because the window lost focus'
  const resume = language === 'da' ? 'Fortsæt' : language === 'fi' ? 'Jatka' : 'Resume'

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/80 backdrop-blur-sm rounded-lg">
      <div className="text-center">
        <div className="text-4xl font-black text-white drop-shadow-lg">{title}</div>
        <p className="mt-2 text-sm text-white/70 max-w-xs">{hint}</p>
      </div>
      <Button onClick={onResume} size="lg" className="font-bold shadow-xl">
        <Play size={20} weight="fill" className="mr-2" />
        {resume}
      </Button>
      <p className="text-xs text-white/50">
        {language === 'da' ? 'Tryk på mellemrum eller P' : language === 'fi' ? 'Paina välilyöntiä tai P' : 'Press space or P'}
      </p>
    </div>
  )
}
