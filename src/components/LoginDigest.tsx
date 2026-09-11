import { useEffect, useState } from 'react'
import { Sparkle, Envelope, Umbrella, NotePencil, Megaphone } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'
import { navigateTo } from '@/lib/appNavigation'
import type { Email, VacationEntry } from '@/lib/types'
import type { Announcement } from '@/components/AnnouncementsBoard'

interface NotebookNote {
  id: string
  title: string
  isPersonal: boolean
  updatedAt: string
  creatorEmail: string
}

interface DigestItem {
  icon: typeof Sparkle
  iconColor: string
  text: string
  onOpen: () => void
}

interface LoginDigestProps {
  userEmail: string
}

const LAST_SEEN_KEY_PREFIX = 'digest-last-seen-'
// Undgå at spamme en helt ny bruger med "alt er nyt" — kig maks 30 dage tilbage.
const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000

/** "Hvad skete der, mens du var væk" — vises kun hvis der reelt er noget nyt siden sidste besøg. */
export function LoginDigest({ userEmail }: LoginDigestProps) {
  const { language } = useLanguage()
  const [items, setItems] = useState<DigestItem[] | null>(null)

  useEffect(() => {
    const key = `${LAST_SEEN_KEY_PREFIX}${userEmail}`
    let cancelled = false

    const run = async () => {
      const lastSeen = await window.kv.get<number>(key)
      const now = Date.now()
      const since = lastSeen ? Math.max(lastSeen, now - MAX_LOOKBACK_MS) : now - MAX_LOOKBACK_MS

      // Første nogensinde besøg (ingen lastSeen) — gem bare tidsstemplet, vis intet.
      if (!lastSeen) {
        await window.kv.set(key, now)
        return
      }

      const result: DigestItem[] = []

      const emails = (await window.kv.get<Email[]>('emails')) || []
      const newEmails = emails.filter(e => e.to === userEmail && e.timestamp > since)
      if (newEmails.length > 0) {
        result.push({
          icon: Envelope,
          iconColor: 'text-primary',
          text: language === 'da'
            ? `${newEmails.length} ${newEmails.length === 1 ? 'ny email' : 'nye emails'}`
            : `${newEmails.length} new ${newEmails.length === 1 ? 'email' : 'emails'}`,
          onOpen: () => navigateTo('email'),
        })
      }

      const vacations = (await window.kv.get<VacationEntry[]>('vacation-entries')) || []
      const decisions = vacations.filter(v =>
        v.userEmail === userEmail && v.reviewedAt && new Date(v.reviewedAt).getTime() > since
      )
      if (decisions.length > 0) {
        const approved = decisions.filter(v => v.status === 'approved').length
        const rejected = decisions.filter(v => v.status === 'rejected').length
        const parts: string[] = []
        if (approved > 0) parts.push(language === 'da' ? `${approved} godkendt` : `${approved} approved`)
        if (rejected > 0) parts.push(language === 'da' ? `${rejected} afvist` : `${rejected} rejected`)
        result.push({
          icon: Umbrella,
          iconColor: 'text-accent',
          text: `${language === 'da' ? 'Ferie:' : 'Vacation:'} ${parts.join(', ')}`,
          onOpen: () => navigateTo('calendar'),
        })
      }

      const notes = (await window.kv.get<NotebookNote[]>('notebook-notes')) || []
      const newSharedNotes = notes.filter(n =>
        !n.isPersonal && n.creatorEmail !== userEmail && new Date(n.updatedAt).getTime() > since
      )
      if (newSharedNotes.length > 0) {
        result.push({
          icon: NotePencil,
          iconColor: 'text-secondary-foreground',
          text: language === 'da'
            ? `${newSharedNotes.length} ${newSharedNotes.length === 1 ? 'delt note opdateret' : 'delte noter opdateret'}`
            : `${newSharedNotes.length} shared ${newSharedNotes.length === 1 ? 'note' : 'notes'} updated`,
          onOpen: () => navigateTo('notebook'),
        })
      }

      const announcements = (await window.kv.get<Announcement[]>('announcements')) || []
      const newAnnouncements = announcements.filter(a => a.createdAt > since)
      if (newAnnouncements.length > 0) {
        result.push({
          icon: Megaphone,
          iconColor: 'text-destructive',
          text: language === 'da'
            ? `${newAnnouncements.length} ${newAnnouncements.length === 1 ? 'nyt opslag' : 'nye opslag'}`
            : `${newAnnouncements.length} new ${newAnnouncements.length === 1 ? 'announcement' : 'announcements'}`,
          onOpen: () => navigateTo('hub'),
        })
      }

      await window.kv.set(key, now)
      if (!cancelled && result.length > 0) setItems(result)
    }

    run().catch(error => console.error('Kunne ikke opbygge login-digest:', error))
    return () => { cancelled = true }
    // Kør kun én gang pr. session (ved mount af Hub efter login).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!items) return null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setItems(null) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle size={22} weight="fill" className="text-accent" />
            {language === 'da' ? 'Siden sidst' : 'Since last time'}
          </DialogTitle>
          <DialogDescription>
            {language === 'da' ? 'Her er hvad der er sket, mens du var væk.' : "Here's what happened while you were away."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={i}
                onClick={() => { item.onOpen(); setItems(null) }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
              >
                <Icon size={20} weight="fill" className={`${item.iconColor} shrink-0`} />
                <span className="text-sm font-medium">{item.text}</span>
              </button>
            )
          })}
        </div>
        <DialogFooter>
          <Button onClick={() => setItems(null)} className="w-full">
            {language === 'da' ? 'Luk' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
