import { useEffect, useRef } from 'react'

/**
 * Sætter et spil på pause når vinduet mister fokus eller fanen bliver skjult.
 *
 * Uden dette kørte spillene videre i baggrunden: skiftede man kortvarigt til et
 * andet vindue midt i en runde, var man død når man kom tilbage. Det var en af
 * de mest irriterende ting ved arkadespillene.
 *
 * `pause` kaldes kun når `isPlaying` er sand, og kaldet er altid sikkert at
 * gentage — spillene tjekker selv om de allerede er på pause.
 */
export function useAutoPauseOnBlur(isPlaying: boolean, pause: () => void): void {
  const pauseRef = useRef(pause)
  pauseRef.current = pause
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  useEffect(() => {
    const maybePause = () => {
      if (isPlayingRef.current) pauseRef.current()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') maybePause()
    }
    window.addEventListener('blur', maybePause)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('blur', maybePause)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}
