import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useKV } from '@/hooks/useKV'
import { applyChristmasAttribute, christmasDate, christmasDay, CHRISTMAS_PREVIEW_KEY, type ChristmasDay, type ChristmasMode } from '@/lib/christmas'

interface ChristmasContextType {
  /** Today in the season, or null outside December/New Year. */
  season: ChristmasDay | null
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  /** The season is on, the user wants it and this screen shows decorations. */
  active: boolean
  mode: ChristmasMode
}

const INACTIVE: ChristmasContextType = { season: null, enabled: false, setEnabled: () => {}, active: false, mode: 'off' }
const ChristmasContext = createContext<ChristmasContextType>(INACTIVE)

function currentSeason(): ChristmasDay | null {
  let preview: string | null = null
  try { preview = localStorage.getItem(CHRISTMAS_PREVIEW_KEY) } catch { /* storage unavailable */ }
  return christmasDay(christmasDate(new Date(), preview))
}

export function ChristmasProvider({ children, userId, mode }: { children: ReactNode; userId?: string; mode: ChristmasMode }) {
  const [season, setSeason] = useState(currentSeason)
  const [enabledSetting, setEnabled] = useKV<boolean>(userId ? `user-christmas-${userId}` : 'user-christmas-guest', true)
  const enabled = enabledSetting !== false
  const active = !!season && enabled && mode !== 'off'

  // The app stays open for days: check again now and then, so the theme starts at midnight on 1 December by itself.
  useEffect(() => {
    const refresh = () => setSeason(previous => {
      const next = currentSeason()
      return JSON.stringify(next) === JSON.stringify(previous) ? previous : next
    })
    const timer = window.setInterval(refresh, 5 * 60 * 1000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])

  useEffect(() => {
    applyChristmasAttribute(document.documentElement, active ? mode : null)
  }, [active, mode])
  useEffect(() => () => applyChristmasAttribute(document.documentElement, null), [])

  return (
    <ChristmasContext.Provider value={{ season, enabled, setEnabled: value => setEnabled(value), active, mode }}>
      {children}
    </ChristmasContext.Provider>
  )
}

export function useChristmas() {
  return useContext(ChristmasContext)
}
