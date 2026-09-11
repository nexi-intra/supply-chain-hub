import { useState } from 'react'
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
import { da, enUS } from 'date-fns/locale'

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
  const [announcements, setAnnouncements] = useKV<Announcement[]>('announcements', [])
  const [dismissedIds, setDismissedIds] = useKV<string[]>(`announcements-dismissed-${userEmail}`, [])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')

  const visible = (announcements || [])
    .filter(a => !(dismissedIds || []).includes(a.id))
    .sort((a, b) => b.createdAt - a.createdAt)

  const handleCreate = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error(language === 'da' ? 'Udfyld både titel og besked' : 'Fill in both title and message')
      return
    }
    const announcement: Announcement = {
      id: newId('announcement'),
      title: title.trim(),
      message: message.trim(),
      createdBy: userEmail,
      createdByName: userName,
      createdAt: Date.now(),
    }
    const updated = await appendToKvArray('announcements', [announcement])
    setAnnouncements(updated)
    setTitle('')
    setMessage('')
    setShowCreateDialog(false)
    toast.success(language === 'da' ? 'Opslag oprettet' : 'Announcement posted')
  }

  const handleDeleteGlobally = async (id: string) => {
    const updated = await removeFromKvArray<Announcement>('announcements', [id])
    setAnnouncements(updated)
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
                <Card className="p-4 border-2 border-accent/40 bg-gradient-to-br from-accent/10 to-primary/5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-accent to-primary shrink-0">
                      <Megaphone size={20} weight="fill" className="text-accent-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold">{a.title}</h3>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(a.createdAt, { addSuffix: true, locale: language === 'da' ? da : enUS })}
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
                          title={language === 'da' ? 'Slet opslag for alle' : 'Delete for everyone'}
                        >
                          <Trash size={14} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDismiss(a.id)}
                        title={language === 'da' ? 'Skjul for mig' : 'Dismiss for me'}
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
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCreateDialog(true)}>
          <Plus size={16} weight="bold" />
          {language === 'da' ? 'Nyt opslag til alle' : 'New announcement'}
        </Button>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone size={22} weight="fill" className="text-accent" />
              {language === 'da' ? 'Nyt firmaopslag' : 'New company announcement'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder={language === 'da' ? 'Titel' : 'Title'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder={language === 'da' ? 'Besked til alle medarbejdere…' : 'Message to all employees…'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button onClick={handleCreate} className="gap-2 bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90">
              <Megaphone size={16} weight="bold" />
              {language === 'da' ? 'Opslå' : 'Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
