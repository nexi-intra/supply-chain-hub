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
export const ChristmasContext = createContext<ChristmasContextType>(INACTIVE)
const GUEST_SETTING_KEY = 'tcd-hub:christmas-guest'

function currentSeason(): ChristmasDay | null {
  let preview: string | null = null
  try { preview = localStorage.getItem(CHRISTMAS_PREVIEW_KEY) } catch { /* storage unavailable */ }
  return christmasDay(christmasDate(new Date(), preview))
}

function ChristmasState({ children, mode, enabled, setEnabled }: { children: ReactNode; mode: ChristmasMode; enabled: boolean; setEnabled: (enabled: boolean) => void }) {
  const [season, setSeason] = useState(currentSeason)
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

  return <ChristmasContext.Provider value={{ season, enabled, setEnabled, active, mode }}>{children}</ChristmasContext.Provider>
}

// A personal setting like light/dark. The default (on) is never written: a file per user on the shared drive in
// November would give the surprise away. Only a real opt-out is saved.
function UserChristmas({ children, userId, mode }: { children: ReactNode; userId: string; mode: ChristmasMode }) {
  const [setting, setSetting] = useKV<boolean>(`user-christmas-${userId}`, true, { initializeIfMissing: false })
  return <ChristmasState mode={mode} enabled={setting !== false} setEnabled={value => void setSetting(value)}>{children}</ChristmasState>
}

// Before login there is no user: the choice stays on this PC.
function GuestChristmas({ children, mode }: { children: ReactNode; mode: ChristmasMode }) {
  const [enabled, setEnabledState] = useState(() => {
    try { return localStorage.getItem(GUEST_SETTING_KEY) !== 'off' } catch { return true }
  })
  const setEnabled = (value: boolean) => {
    setEnabledState(value)
    try { if (value) localStorage.removeItem(GUEST_SETTING_KEY); else localStorage.setItem(GUEST_SETTING_KEY, 'off') } catch { /* storage unavailable */ }
  }
  return <ChristmasState mode={mode} enabled={enabled} setEnabled={setEnabled}>{children}</ChristmasState>
}

export function ChristmasProvider({ children, userId, mode }: { children: ReactNode; userId?: string; mode: ChristmasMode }) {
  return userId
    ? <UserChristmas userId={userId} mode={mode}>{children}</UserChristmas>
    : <GuestChristmas mode={mode}>{children}</GuestChristmas>
}

export function useChristmas() {
  return useContext(ChristmasContext)
}
