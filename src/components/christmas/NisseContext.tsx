import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'
import { CHRISTMAS_PREVIEW_KEY } from '@/lib/christmas'
import { danishTime, type NisseClaimResult, type NisseToday } from '@/lib/nisse'
import { nisseLabels } from '@/lib/nisseLabels'
import { sameNisseState } from '@/lib/nisseGreeting'

interface NisseContextValue {
  state: NisseToday
  claim: (spot: string) => Promise<void>
  /** The nisse's accessible name in the user's language. */
  label: string
}

export const NisseContext = createContext<NisseContextValue>({ state: { status: 'off' }, claim: async () => {}, label: 'Nisse' })

const REFRESH_MS = 5 * 60 * 1000

function preview(): string | null {
  try { return localStorage.getItem(CHRISTMAS_PREVIEW_KEY) } catch { return null }
}

type Outcome = { kind: 'searching' } | { kind: 'done'; result: NisseClaimResult } | { kind: 'failed' }

/** Today's nisse in the active hub, as decided by main. Remounted with the hub tree, so a hub switch starts fresh. */
export function NisseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NisseToday>({ status: 'off' })
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const { language } = useLanguage()
  const labels = nisseLabels(language)
  const busy = useRef(false)

  const refresh = useCallback(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronNisse
    if (!api) return
    api.today(preview()).then(next => setState(current => (sameNisseState(current, next) ? current : next)), () => {})
  }, [])

  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronNisse
    if (!api) return
    refresh()
    const stop = api.onChanged(refresh)
    const timer = window.setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    return () => { stop(); window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refresh])

  // The nisse appears at 10:00 sharp, also in an app that has been open since the morning.
  useEffect(() => {
    if (state.status !== 'waiting') return
    const timer = window.setTimeout(refresh, Math.max(0, state.startsAt - Date.now()) + 500)
    return () => window.clearTimeout(timer)
  }, [state, refresh])

  const claim = useCallback(async (spot: string) => {
    const api = window.electronNisse
    if (!api || busy.current || state.status !== 'hiding') return
    busy.current = true
    setOutcome({ kind: 'searching' })
    try {
      const result = await api.claim({ date: state.date, spot, preview: preview() })
      setOutcome({ kind: 'done', result })
      refresh()
    } catch {
      setOutcome({ kind: 'failed' })
    } finally {
      busy.current = false
    }
  }, [state, refresh])

  const result = outcome?.kind === 'done' ? outcome.result : null
  const title = !outcome || outcome.kind === 'searching' ? labels.searching
    : outcome.kind === 'failed' ? labels.failed
    : result?.result === 'won' ? labels.wonTitle
    : result?.result === 'taken' ? labels.taken(result.finder.name, danishTime(result.finder.at))
    : labels.preview

  return (
    <NisseContext.Provider value={{ state, claim, label: labels.nisse }}>
      {children}
      <Dialog open={!!outcome} onOpenChange={open => { if (!open && outcome?.kind !== 'searching') setOutcome(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg leading-snug">{title}</DialogTitle>
            {result?.result === 'won' && <DialogDescription className="pt-1 text-base text-foreground">{labels.wonBody}</DialogDescription>}
          </DialogHeader>
          {outcome?.kind !== 'searching' && (
            <DialogFooter>
              <Button onClick={() => setOutcome(null)} className="w-full">{labels.close}</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </NisseContext.Provider>
  )
}

export function useNisse() {
  return useContext(NisseContext)
}
