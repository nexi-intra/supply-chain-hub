import { useEffect, useRef } from 'react'
import { Play } from '@phosphor-icons/react'
import { useLanguage } from '@/contexts/LanguageContext'

export function ArcadeReadyOverlay({ onStart }: { onStart: () => void }) {
  const { language } = useLanguage()
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true })
    buttonRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' })
  }, [])
  return (
    <button
      ref={buttonRef}
      type="button"
      data-arcade-ready
      onKeyDown={(event) => { if (event.code === 'Space') event.stopPropagation() }}
      onClick={(event) => { event.stopPropagation(); onStart() }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-md bg-slate-950/60 px-4 text-center text-white backdrop-blur-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Play size={32} weight="fill" aria-hidden="true" className="text-primary" />
      <span className="text-xl font-semibold">{language === 'da' ? 'Klar til start' : language === 'fi' ? 'Valmiina aloittamaan' : 'Ready to play'}</span>
      <span className="text-sm text-white/85">{language === 'da' ? 'Tryk mellemrum eller klik for at starte' : language === 'fi' ? 'Aloita välilyönnillä tai napauttamalla' : 'Press Space or click to begin'}</span>
    </button>
  )
}