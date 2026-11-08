import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useChristmas } from '@/contexts/ChristmasContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { danishTime } from '@/lib/nisse'
import { FOUND_ANNOUNCED_KEY, GREETING_SHOWN_KEY, shouldAnnounceFound, shouldGreet } from '@/lib/nisseGreeting'
import { nisseLabels } from '@/lib/nisseLabels'
import { useNisse } from './NisseContext'

function remembered(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

/** The daily greeting at 10 and the "found" message for everyone in the hub. */
export function NisseGreeting({ view, hubName, userEmail }: { view: string; hubName: string; userEmail: string }) {
  const christmas = useChristmas()
  const { state } = useNisse()
  const { language } = useLanguage()
  const labels = nisseLabels(language)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open || !shouldGreet({ state, view, seasonOn: !!christmas.season, shownDate: remembered(GREETING_SHOWN_KEY) })) return
    if (state.status === 'hiding' || state.status === 'found') remember(GREETING_SHOWN_KEY, state.date)
    setOpen(true)
  }, [state, view, christmas.season, open])

  useEffect(() => {
    if (!shouldAnnounceFound({ state, view, active: christmas.active, announcedDate: remembered(FOUND_ANNOUNCED_KEY), userEmail })) return
    if (state.status !== 'found') return
    remember(FOUND_ANNOUNCED_KEY, state.date)
    toast(labels.foundToast(state.finder.name, danishTime(state.finder.at)), { duration: 12000 })
  }, [state, view, christmas.active, userEmail, labels])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{labels.greetingTitle}</DialogTitle>
          <DialogDescription className="pt-2 text-base leading-relaxed text-foreground">{labels.greetingBody(hubName)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {christmas.enabled
            ? <Button onClick={() => setOpen(false)} className="w-full">{labels.greetingGo}</Button>
            : <Button onClick={() => { christmas.setEnabled(true); setOpen(false) }} className="w-full">{labels.greetingOn}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
