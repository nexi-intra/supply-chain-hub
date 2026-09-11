import { useEffect, useRef } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'

interface CubeBasherGameProps {
  onNavigateBack: () => void
}

// Cube Basher (github.com/mreflow/cube-basher) er en selvstændig three.js-baseret
// spilfil, vendoret lokalt under public/games/cube-basher/ (se plans/modern-cube-basher.md).
// Den kører i sin egen iframe i stedet for at blive omskrevet til en React-komponent:
// spillet ejer selv sin render-loop, sine egne window-keydown-lyttere og sin egen
// Escape/pause-håndtering, uden nogen form for unmount/dispose-logik. En iframe er sit
// eget browsing-context, så at afmontere den rydder GARANTERET alt op (rAF-loop,
// event-listeners) uden at vi skal røre ved spillets interne kode.
export function CubeBasherGame({ onNavigateBack }: CubeBasherGameProps) {
  const { language } = useLanguage()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    document.body.setAttribute('data-game-active', 'true')
    return () => document.body.removeAttribute('data-game-active')
  }, [])

  // Spillets tastatur-lyttere bor i iframens EGET window — mister iframen
  // keyboard-fokus (alt-tab, klik på app-UI, vindue genvinder fokus), går alle
  // tastetryk til parent-dokumentet og spillet virker "dødt". Skub derfor fokus
  // tilbage i iframen ved mount og ved enhver hændelse der kan have flyttet det.
  useEffect(() => {
    const refocus = () => requestAnimationFrame(() => iframeRef.current?.focus())
    refocus()
    window.addEventListener('focus', refocus)
    document.addEventListener('pointerdown', refocus)
    document.addEventListener('visibilitychange', refocus)
    return () => {
      window.removeEventListener('focus', refocus)
      document.removeEventListener('pointerdown', refocus)
      document.removeEventListener('visibilitychange', refocus)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Ingen sandbox-attribut: Chromium blokerer ALLE file://-ressourcer (inkl.
          selve iframe-dokumentet) inde i en sandboxed iframe, uanset allow-*-tokens —
          det var årsagen til at spillet virkede tomt (ingen JS kørte overhovedet).
          Electrons egen BrowserWindow-sandboxing (nodeIntegration:false,
          nodeIntegrationInSubFrames ikke sat) forhindrer stadig Node/Electron-adgang
          uafhængigt af denne attribut, så det er trygt at undlade den her. */}
      <iframe
        ref={iframeRef}
        src="./games/cube-basher/index.html"
        title="Cube Basher"
        className="w-full h-full border-0"
        onLoad={() => iframeRef.current?.focus()}
      />
      {/* Ingen backdrop-blur her: backdrop-filter oven på levende WebGL-indhold
          tvinger compositoren til at re-blurre spillet hver eneste frame. */}
      <div className="absolute top-4 left-4 z-10 opacity-50 hover:opacity-100 transition-opacity">
        <Button
          onClick={onNavigateBack}
          variant="outline"
          size="sm"
          className="bg-background shadow-lg gap-2 font-semibold"
        >
          <ArrowLeft size={16} weight="bold" />
          {language === 'da' ? 'Tilbage' : 'Back'}
        </Button>
      </div>
    </div>
  )
}
