import { useEffect, useRef } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'

interface TheLibrarian2GameProps {
  onNavigateBack: () => void
}

// "The Librarian 2" (github.com/mreflow/the-librarian-2, licens ISC) er et fuldt
// Vite-projekt (three.js + postprocessing som npm-deps, ikke CDN), bygget lokalt og
// vendoret som statisk output under public/games/the-librarian-2/ (se
// plans/modern-librarian2-and-icon.md). Samme iframe-mønster og lærdomme som
// CubeBasherGame.tsx: ingen sandbox-attribut (Chromium blokerer file://-ressourcer i
// sandboxed iframes), data-game-active mens monteret, og aktiv refokusering af
// iframen (window-focus/pointerdown/visibilitychange) da spillets tastatur-lyttere
// bor i dens eget window og ellers "dør" hvis fokus lander i parent-dokumentet.
export function TheLibrarian2Game({ onNavigateBack }: TheLibrarian2GameProps) {
  const { language } = useLanguage()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    document.body.setAttribute('data-game-active', 'true')
    return () => document.body.removeAttribute('data-game-active')
  }, [])

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
      <iframe
        ref={iframeRef}
        src="./games/the-librarian-2/index.html"
        title="The Librarian"
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
