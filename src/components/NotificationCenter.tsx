import { useState } from 'react'
import { Bell, Envelope, Umbrella, Books, Gift, NotePencil, CalendarBlank, Lightbulb, PuzzlePiece, HandsClapping, LinkSimple, Confetti, ClipboardText, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLanguage } from '@/contexts/LanguageContext'
import { useHubNotifications } from '@/contexts/HubNotificationsContext'
import { navigateTo } from '@/lib/appNavigation'
import type { HubNotificationKind } from '@/lib/hubNotifications'

const ICONS: Record<HubNotificationKind, typeof Bell> = {
  email: Envelope,
  note: NotePencil,
  improvement: Lightbulb,
  multiplayer: PuzzlePiece,
  'high-five': HandsClapping,
  vacation: Umbrella,
  guide: Books,
  'guide-review': Books,
  birthday: Gift,
  todo: CalendarBlank,
  link: LinkSimple,
  nisse: Confetti,
  count: ClipboardText,
}

/** Samlet klokke-ikon på Hub: viser alle "kræver din opmærksomhed"-kilder på tværs af moduler (samme liste som Windows-notifikationerne). */
export function NotificationCenter() {
  const { language } = useLanguage()
  const { items: visibleItems, dismiss } = useHubNotifications()
  const [open, setOpen] = useState(false)
  const clearAllLabel = language === 'da' ? 'Ryd alle' : language === 'fi' ? 'Tyhjennä kaikki' : language === 'sv' ? 'Rensa alla' : 'Clear all'

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
          <span className="font-semibold text-sm">{language === 'da' ? 'Notifikationer' : language === 'fi' ? 'Ilmoitukset' : language === 'sv' ? 'Notiser' : 'Notifications'}</span>
          {visibleItems.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => dismiss(visibleItems.map(item => item.id))}>
              {clearAllLabel} ({visibleItems.length})
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {visibleItems.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {language === 'da' ? 'Intet nyt lige nu 🎉' : language === 'fi' ? "Teidät on saatu kiinni." : language === 'sv' ? 'Du är helt ikapp 🎉' : "You're all caught up 🎉"}
            </div>
          ) : (
            <div className="divide-y">
              {visibleItems.map(item => {
                const Icon = ICONS[item.kind]
                return (
                  <div key={item.id} className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors group">
                    <button
                      className="flex items-start gap-3 flex-1 min-w-0 text-left"
                      onClick={() => {
                        dismiss([item.id])
                        navigateTo(item.target.view, item.target.params)
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
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      onClick={() => dismiss([item.id])}
                      title={language === 'da' ? 'Slet' : language === 'fi' ? 'Poista' : language === 'sv' ? 'Ta bort' : 'Delete'}
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
