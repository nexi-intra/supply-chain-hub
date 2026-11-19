import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Megaphone, X, Plus, Trash } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useKV } from '@/hooks/useKV'
import { useLanguage } from '@/contexts/LanguageContext'
import { newId } from '@/lib/utils'
import { appendToKvArray, removeFromKvArray } from '@/lib/kvArrays'
import { saveInBackground } from '@/lib/saveInBackground'
import { formatDistanceToNow } from 'date-fns'
import { da, enUS, fi, sv } from 'date-fns/locale'

export interface Announcement {
  id: string
  title: string
  message: string
  createdBy: string
  createdByName: string
  createdAt: number
}

interface AnnouncementsBoardProps {
  userEmail: string
  userName: string
  canPost: boolean
}

/** Let opslagstavle til firmameddelelser på Hub — adskilt fra email, mere synligt. */
export function AnnouncementsBoard({ userEmail, userName, canPost }: AnnouncementsBoardProps) {
  const { language } = useLanguage()
  const [announcements] = useKV<Announcement[]>('announcements', [])
  const [dismissedIds, setDismissedIds] = useKV<string[]>(`announcements-dismissed-${userEmail}`, [])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  // Opslag der er ved at blive gemt; en dobbeltklik paa "Opslå" maa ikke oprette to.
  const inFlight = useRef(new Set<string>())
  const pendingAnnouncement = useRef<{ id: string; createdAt: number } | null>(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')

  const visible = (announcements || [])
    .filter(a => !(dismissedIds || []).includes(a.id))
    .sort((a, b) => b.createdAt - a.createdAt)

  const notSavedMessage = () => language === 'da' ? 'Opslaget blev ikke gemt — prøv igen' : language === 'fi' ? 'Ilmoitusta ei tallennettu — yritä uudelleen' : language === 'sv' ? 'Inlägget sparades inte — försök igen' : 'The announcement was not saved — please try again'

  // Opslaget vises og dialogen lukkes med det samme; skrivningen til det delte drev sker i baggrunden.
  // Fejler den, forsvinder opslaget igen, og teksten kommer tilbage i dialogen, saa et nyt forsoeg
  // gemmer det med samme id (ingen dublet, hvis den foerste skrivning alligevel naaede frem).
  const handleCreate = () => {
    if (!title.trim() || !message.trim()) {
      toast.error(language === 'da' ? 'Udfyld både titel og besked' : language === 'fi' ? 'Täytä sekä otsikko että viesti' : language === 'sv' ? 'Fyll i både rubrik och meddelande' : 'Fill in both title and message')
      return
    }
    const creation = pendingAnnouncement.current || { id: newId('announcement'), createdAt: Date.now() }
    if (inFlight.current.has(creation.id)) return
    inFlight.current.add(creation.id)
    pendingAnnouncement.current = creation
    const announcement: Announcement = {
      id: creation.id,
      title: title.trim(),
      message: message.trim(),
      createdBy: userEmail,
      createdByName: userName,
      createdAt: creation.createdAt,
    }
    setTitle('')
    setMessage('')
    setShowCreateDialog(false)
    toast.success(language === 'da' ? 'Opslag oprettet' : language === 'fi' ? 'Julkaistu ilmoitus' : language === 'sv' ? 'Inlägg publicerat' : 'Announcement posted')
    void appendToKvArray('announcements', [announcement]).then(() => {
      if (pendingAnnouncement.current === creation) pendingAnnouncement.current = null
    }, (error) => {
      console.error('Kunne ikke oprette opslag:', error)
      toast.error(notSavedMessage())
      // Kun hvis brugeren ikke er gaaet i gang med et nyt opslag i mellemtiden.
      if (pendingAnnouncement.current === creation) {
        setTitle(announcement.title)
        setMessage(announcement.message)
        setShowCreateDialog(true)
      }
    }).finally(() => { inFlight.current.delete(creation.id) })
  }

  const handleDeleteGlobally = (id: string) => {
    void saveInBackground(removeFromKvArray<Announcement>('announcements', [id]), {
      failure: language === 'da' ? 'Opslaget blev ikke slettet — prøv igen' : language === 'fi' ? 'Ilmoitusta ei poistettu — yritä uudelleen' : language === 'sv' ? 'Inlägget togs inte bort — försök igen' : 'The announcement was not deleted — please try again',
    })
  }
  const handleDismiss = (id: string) => {
    setDismissedIds(current => [...(current || []), id])
  }

  if (visible.length === 0 && !canPost) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.6 }}
      className="mb-6"
    >
      {visible.length > 0 && (
        <div className="space-y-3 mb-3">
          <AnimatePresence>
            {visible.map(a => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="p-4 border-accent/40 bg-accent/10">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-primary shrink-0">
                      <Megaphone size={20} weight="fill" className="text-accent-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold">{a.title}</h3>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(a.createdAt, { addSuffix: true, locale: language === 'da' ? da : language === 'fi' ? fi : language === 'sv' ? sv : enUS })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">— {a.createdByName}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canPost && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteGlobally(a.id)}
                          title={language === 'da' ? 'Slet opslag for alle' : language === 'fi' ? 'Poista kaikki' : language === 'sv' ? 'Ta bort för alla' : 'Delete for everyone'}
                        >
                          <Trash size={14} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDismiss(a.id)}
                        title={language === 'da' ? 'Skjul for mig' : language === 'fi' ? 'Poistu puolestani.' : language === 'sv' ? 'Dölj för mig' : 'Dismiss for me'}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {canPost && (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => { pendingAnnouncement.current = null; setShowCreateDialog(true) }}>
          <Plus size={16} weight="bold" />
          {language === 'da' ? 'Nyt opslag til alle' : language === 'fi' ? 'Uusi ilmoitus' : language === 'sv' ? 'Nytt inlägg till alla' : 'New announcement'}
        </Button>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone size={22} weight="fill" className="text-accent" />
              {language === 'da' ? 'Nyt firmaopslag' : language === 'fi' ? 'Uusi yrityksen ilmoitus' : language === 'sv' ? 'Nytt företagsinlägg' : 'New company announcement'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder={language === 'da' ? 'Titel' : language === 'fi' ? 'Osasto' : language === 'sv' ? 'Rubrik' : 'Title'}
              value={title}
              onChange={(e) => { pendingAnnouncement.current = null; setTitle(e.target.value) }}
            />
            <Textarea
              placeholder={language === 'da' ? 'Besked til alle medarbejdere…' : language === 'fi' ? 'Viesti kaikille työntekijöille.' : language === 'sv' ? 'Meddelande till alla medarbetare…' : 'Message to all employees…'}
              value={message}
              onChange={(e) => { pendingAnnouncement.current = null; setMessage(e.target.value) }}
              rows={5}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : language === 'sv' ? 'Avbryt' : 'Cancel'}
            </Button>
            <Button onClick={handleCreate} className="gap-2">
              <Megaphone size={16} weight="bold" />
              {language === 'da' ? 'Opslå' : language === 'fi' ? 'Posti' : language === 'sv' ? 'Publicera' : 'Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
