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
import { formatDistanceToNow } from 'date-fns'
import { da, enUS, fi } from 'date-fns/locale'

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
  const [isCreating, setIsCreating] = useState(false)
  const createInProgress = useRef(false)
  const pendingAnnouncement = useRef<{ id: string; createdAt: number } | null>(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')

  const visible = (announcements || [])
    .filter(a => !(dismissedIds || []).includes(a.id))
    .sort((a, b) => b.createdAt - a.createdAt)

  const handleCreate = async () => {
    if (createInProgress.current) return
    if (!title.trim() || !message.trim()) {
      toast.error(language === 'da' ? 'Udfyld både titel og besked' : language === 'fi' ? 'Täytä sekä otsikko että viesti' : 'Fill in both title and message')
      return
    }
    const creation = pendingAnnouncement.current || { id: newId('announcement'), createdAt: Date.now() }
    pendingAnnouncement.current = creation
    const announcement: Announcement = {
      id: creation.id,
      title: title.trim(),
      message: message.trim(),
      createdBy: userEmail,
      createdByName: userName,
      createdAt: creation.createdAt,
    }
    createInProgress.current = true
    setIsCreating(true)
    try {
      await appendToKvArray('announcements', [announcement])
      pendingAnnouncement.current = null
      setTitle('')
      setMessage('')
      setShowCreateDialog(false)
      toast.success(language === 'da' ? 'Opslag oprettet' : language === 'fi' ? 'Julkaistu ilmoitus' : 'Announcement posted')
    } catch (error) {
      console.error('Kunne ikke oprette opslag:', error)
      toast.error(language === 'da' ? 'Opslaget blev ikke gemt — prøv igen' : language === 'fi' ? 'Ilmoitusta ei tallennettu — yritä uudelleen' : 'The announcement was not saved — please try again')
    } finally {
      createInProgress.current = false
      setIsCreating(false)
    }
  }

  const handleDeleteGlobally = async (id: string) => {
    await removeFromKvArray<Announcement>('announcements', [id])
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
                          {formatDistanceToNow(a.createdAt, { addSuffix: true, locale: language === 'da' ? da : language === 'fi' ? fi : enUS })}
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
                          title={language === 'da' ? 'Slet opslag for alle' : language === 'fi' ? 'Poista kaikki' : 'Delete for everyone'}
                        >
                          <Trash size={14} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDismiss(a.id)}
                        title={language === 'da' ? 'Skjul for mig' : language === 'fi' ? 'Poistu puolestani.' : 'Dismiss for me'}
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
          {language === 'da' ? 'Nyt opslag til alle' : language === 'fi' ? 'Uusi ilmoitus' : 'New announcement'}
        </Button>
      )}

      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!createInProgress.current) setShowCreateDialog(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone size={22} weight="fill" className="text-accent" />
              {language === 'da' ? 'Nyt firmaopslag' : language === 'fi' ? 'Uusi yrityksen ilmoitus' : 'New company announcement'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder={language === 'da' ? 'Titel' : language === 'fi' ? 'Osasto' : 'Title'}
              value={title}
              disabled={isCreating}
              onChange={(e) => { pendingAnnouncement.current = null; setTitle(e.target.value) }}
            />
            <Textarea
              placeholder={language === 'da' ? 'Besked til alle medarbejdere…' : language === 'fi' ? 'Viesti kaikille työntekijöille.' : 'Message to all employees…'}
              value={message}
              disabled={isCreating}
              onChange={(e) => { pendingAnnouncement.current = null; setMessage(e.target.value) }}
              rows={5}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isCreating} onClick={() => setShowCreateDialog(false)}>
              {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : 'Cancel'}
            </Button>
            <Button onClick={handleCreate} loading={isCreating} className="gap-2">
              <Megaphone size={16} weight="bold" />
              {isCreating ? language === 'da' ? 'Gemmer…' : language === 'fi' ? 'Tallennetaan…' : 'Saving…' : language === 'da' ? 'Opslå' : language === 'fi' ? 'Posti' : 'Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
