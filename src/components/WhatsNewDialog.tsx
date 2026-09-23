import { useEffect, useState } from 'react'
import { Sparkle } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/contexts/LanguageContext'
import { getChangelogSince, type ChangelogEntry } from '@/lib/changelog'

// Gemmes lokalt pr. maskine (ikke i den delte KV-store) — hver klient kan være
// på sin egen version, så "sidst sete version" er pr. installation, ikke pr. bruger.
const LAST_SEEN_VERSION_KEY = 'tcd-hub:last-seen-version'

/** Viser "Nyheder i denne version" én gang pr. maskine, når app-versionen er steget. */
export function WhatsNewDialog() {
  const { language } = useLanguage()
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!window.electronUpdates) return
      const status = await window.electronUpdates.getStatus()
      const currentVersion = status.currentVersion
      if (!currentVersion) return

      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY)
      if (lastSeen === currentVersion) return

      const changes = getChangelogSince(lastSeen, currentVersion)
      localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion)
      if (changes.length > 0) setEntries(changes)
    }
    run().catch(error => console.error('Kunne ikke hente changelog:', error))
  }, [])

  if (!entries) return null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setEntries(null) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle size={22} weight="fill" className="text-accent" />
            {language === 'da' ? 'Nyheder i Supply Chain Hub' : language === 'fi' ? "Mitä uutta Supply Chain Hubissa?" : "What's new in Supply Chain Hub"}
          </DialogTitle>
          <DialogDescription>
            {language === 'da' ? 'Appen er blevet opdateret. Her er hvad der er nyt.' : language === 'fi' ? 'Sovellus on päivitetty. Täällä se on uutta.' : 'The app has been updated. Here’s what’s new.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[50vh] overflow-y-auto">
          {entries.map(entry => (
            <div key={entry.version}>
              <Badge variant="secondary" className="mb-2">v{entry.version}</Badge>
              <ul className="space-y-1.5">
                {entry.items.map((item, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => setEntries(null)} className="w-full">
            {language === 'da' ? 'Fedt, tak!' : language === 'fi' ? 'Hienoa, kiitos!' : 'Great, thanks!'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
