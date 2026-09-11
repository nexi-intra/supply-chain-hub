import { useEffect, useMemo, useState } from 'react'
import { Bell, Envelope, Umbrella, Books, Gift, NotePencil, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useKV } from '@/hooks/useKV'
import { useLanguage } from '@/contexts/LanguageContext'
import { navigateTo } from '@/lib/appNavigation'
import { getReviewStatus, type Guide } from '@/lib/guideTypes'
import type { Email, VacationEntry, SickLeaveEntry, BirthdayEntry } from '@/lib/types'

interface NotebookNotification {
  id: string
  type: 'note-edited'
  noteId: string
  noteTitle: string
  editedByName: string
  originalCreator: string
  timestamp: string
  read: boolean
}

interface NotificationItem {
  id: string
  icon: typeof Bell
  iconColor: string
  title: string
  subtitle: string
  timestamp: number
  onOpen: () => void
}

interface NotificationCenterProps {
  userEmail: string
  isAdminOrManager: boolean
  // Sendes ned fra Hub (som allerede læser disse) i stedet for egne useKV-kald her —
  // undgår flere uafhængige KV-lyttere for samme nøgler på den mest besøgte skærm.
  emails: Email[] | undefined
  vacations: VacationEntry[] | undefined
  sickLeave: SickLeaveEntry[] | undefined
  guides: Guide[] | undefined
  // Ferieanmodninger denne manager allerede har set inde i Manager Panel — skal
  // ikke blive ved med at poppe op her, selvom de stadig afventer godkendelse.
  seenVacationRequestIds: string[] | undefined
}

/** Samlet klokke-ikon på Hub: aggregerer alle "kræver din opmærksomhed"-kilder på tværs af moduler. */
export function NotificationCenter({ userEmail, isAdminOrManager, emails, vacations, sickLeave, guides, seenVacationRequestIds }: NotificationCenterProps) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [notebookNotifications] = useKV<NotebookNotification[]>('notebook-notifications', [])
  const [birthdays] = useKV<BirthdayEntry[]>('employee-birthdays', [])

  const items = useMemo<NotificationItem[]>(() => {
    const result: NotificationItem[] = []

    const unreadEmails = (emails || []).filter(e => e.to === userEmail && !e.read && !e.folderId)
    unreadEmails.forEach(e => {
      result.push({
        id: `email-${e.id}`,
        icon: Envelope,
        iconColor: 'text-primary',
        title: e.subject,
        subtitle: language === 'da' ? `Fra ${e.from}` : `From ${e.from}`,
        timestamp: e.timestamp,
        onOpen: () => navigateTo('email'),
      })
    })

    const unreadNotebook = (notebookNotifications || []).filter(n =>
      !n.read && n.originalCreator === userEmail
    )
    unreadNotebook.forEach(n => {
      result.push({
        id: `note-${n.id}`,
        icon: NotePencil,
        iconColor: 'text-accent',
        title: n.noteTitle,
        subtitle: language === 'da' ? `${n.editedByName} redigerede noten` : `${n.editedByName} edited the note`,
        timestamp: new Date(n.timestamp).getTime(),
        onOpen: () => navigateTo('notebook'),
      })
    })

    if (isAdminOrManager) {
      const seenIds = seenVacationRequestIds || []
      const pendingVacations = (vacations || []).filter(v => v.status === 'pending' && !seenIds.includes(v.id))
      pendingVacations.forEach(v => {
        result.push({
          id: `vacation-${v.id}`,
          icon: Umbrella,
          iconColor: 'text-amber-600',
          title: language === 'da' ? 'Afventende ferieanmodning' : 'Pending vacation request',
          subtitle: v.userEmail,
          timestamp: new Date(v.startDate).getTime() || Date.now(),
          onOpen: () => navigateTo('manager', { tab: 'vacation-requests' }),
        })
      })
      const pendingSick = (sickLeave || []).filter(s => s.status === 'pending')
      pendingSick.forEach(s => {
        result.push({
          id: `sick-${s.id}`,
          icon: Bell,
          iconColor: 'text-destructive',
          title: language === 'da' ? 'Ny sygemelding' : 'New sick leave',
          subtitle: s.userName,
          timestamp: new Date(s.submittedAt).getTime() || Date.now(),
          onOpen: () => navigateTo('manager', { tab: 'sick-leave' }),
        })
      })
    }

    const now = Date.now()
    const overdueGuides = (guides || []).filter(g => getReviewStatus(g, now) === 'overdue')
    overdueGuides.forEach(g => {
      result.push({
        id: `guide-${g.id}`,
        icon: Books,
        iconColor: 'text-destructive',
        title: language === 'da' ? 'Guide skal revideres' : 'Guide needs review',
        subtitle: g.title,
        timestamp: g.nextReviewAt || now,
        onOpen: () => navigateTo('guides', { search: g.title }),
      })
    })

    const todayKey = new Date().toISOString().slice(5, 10)
    const birthdaysToday = (birthdays || []).filter(b => b.birthday === todayKey)
    birthdaysToday.forEach(b => {
      result.push({
        id: `birthday-${b.email}`,
        icon: Gift,
        iconColor: 'text-pink-500',
        title: language === 'da' ? `${b.fullName} har fødselsdag i dag!` : `${b.fullName}'s birthday today!`,
        subtitle: language === 'da' ? 'Husk et tillykke 🎉' : "Don't forget to say congrats 🎉",
        timestamp: now,
        onOpen: () => navigateTo('calendar'),
      })
    })

    return result.sort((a, b) => b.timestamp - a.timestamp)
  }, [emails, notebookNotifications, vacations, sickLeave, guides, birthdays, userEmail, isAdminOrManager, language, seenVacationRequestIds])

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    // Ryd dismissed-set for id'er der ikke længere er relevante (fx mail blev læst andetsteds).
    setDismissedIds(current => new Set(Array.from(current).filter(id => items.some(i => i.id === id))))
  }, [items])

  const visibleItems = items.filter(i => !dismissedIds.has(i.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full relative">
          <Bell size={20} />
          {visibleItems.length > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {visibleItems.length > 9 ? '9+' : visibleItems.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">{language === 'da' ? 'Notifikationer' : 'Notifications'}</span>
          {visibleItems.length > 0 && (
            <span className="text-xs text-muted-foreground">{visibleItems.length}</span>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {visibleItems.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {language === 'da' ? 'Intet nyt lige nu 🎉' : "You're all caught up 🎉"}
            </div>
          ) : (
            <div className="divide-y">
              {visibleItems.map(item => {
                const Icon = item.icon
                return (
                  <div key={item.id} className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors group">
                    <button
                      className="flex items-start gap-3 flex-1 min-w-0 text-left"
                      onClick={() => {
                        item.onOpen()
                        setOpen(false)
                      }}
                    >
                      <Icon size={18} weight="fill" className={`${item.iconColor} shrink-0 mt-0.5`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{item.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setDismissedIds(current => new Set(current).add(item.id))}
                      title={language === 'da' ? 'Skjul' : 'Dismiss'}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
