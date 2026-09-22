import { useCallback, useEffect, useRef, useState } from 'react'
import {
  normalizeFlatLeaderboard,
  normalizeNestedLeaderboard,
  type LeaderboardEntry,
  type NestedLeaderboard,
} from '@/lib/leaderboards'

/**
 * Læser et spils highscore-liste og holder den ajour.
 *
 * Spillene brugte før `useKV` til leaderboardet, men skrev scoren med en atomar
 * opdatering ved siden af. Så kaldte de `setValue(...)` for at opdatere skærmen
 * — og `useKV` sammenligner med den værdi den kendte FØR den atomare skrivning,
 * så den skrivning blev altid afvist med "Data er ændret af en anden bruger.
 * Genindlæs og prøv igen." Den røde fejl kom altså hver eneste gang man slog sin
 * egen rekord, selvom scoren var gemt korrekt.
 *
 * Denne hook læser kun. Skrivning sker udelukkende gennem `submitHighscore`,
 * hvorefter `refresh()` henter den friske liste. Dermed er der én skrivevej og
 * ingen falske fejl.
 */
export function useLeaderboard(key: string): { leaderboard: LeaderboardEntry[]; refresh: () => void } {
  const [raw, setRaw] = useState<unknown>(undefined)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const load = useReloader(key, setRaw)

  useEffect(() => {
    setLeaderboard(normalizeFlatLeaderboard(raw))
  }, [raw])

  return { leaderboard, refresh: load }
}

/** Samme som `useLeaderboard`, men for de spil der har en liste pr. sværhedsgrad. */
export function useNestedLeaderboard<D extends string>(
  key: string,
  categories: readonly D[],
): { leaderboard: NestedLeaderboard<D>; refresh: () => void } {
  const [raw, setRaw] = useState<unknown>(undefined)
  const categoriesRef = useRef(categories)
  const [leaderboard, setLeaderboard] = useState<NestedLeaderboard<D>>(() =>
    normalizeNestedLeaderboard(undefined, categories),
  )
  const load = useReloader(key, setRaw)

  useEffect(() => {
    setLeaderboard(normalizeNestedLeaderboard(raw, categoriesRef.current))
  }, [raw])

  return { leaderboard, refresh: load }
}

/** Fælles læsning: hent ved mount, lyt efter andres ændringer, og genlæs på kommando. */
function useReloader(key: string, onValue: (value: unknown) => void): () => void {
  const onValueRef = useRef(onValue)
  onValueRef.current = onValue
  const cancelledRef = useRef(false)

  const load = useCallback(() => {
    window.kv
      .get<unknown>(key)
      .then((value) => {
        if (!cancelledRef.current) onValueRef.current(value)
      })
      .catch((error) => console.error(`Kunne ikke læse highscores fra "${key}":`, error))
  }, [key])

  useEffect(() => {
    cancelledRef.current = false
    load()
    const unsubscribe = window.kv.subscribe((changedKeys) => {
      // Under aktivt spil udskydes genindlæsningen ikke her: listen vises kun i
      // menuen og på slutskærmen, og et enkelt opslag koster ingenting.
      if (changedKeys.includes(key)) load()
    })
    return () => {
      cancelledRef.current = true
      unsubscribe()
    }
  }, [key, load])

  return load
}
