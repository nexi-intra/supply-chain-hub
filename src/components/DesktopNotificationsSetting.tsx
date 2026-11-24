import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/contexts/LanguageContext'

/** Switch for Windows notifications; the choice is stored on this computer and defaults to on. */
export function DesktopNotificationsSetting() {
  const { language } = useLanguage()
  const api = typeof window === 'undefined' ? undefined : window.electronDesktopNotifications
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (!api) return
    let active = true
    api.isEnabled().then(value => { if (active) setEnabled(value) }).catch(() => { if (active) setEnabled(true) })
    return () => { active = false }
  }, [api])

  if (!api) return null

  const label = language === 'da' ? 'Windows-notifikationer' : language === 'fi' ? 'Windows-ilmoitukset' : language === 'sv' ? 'Windows-notiser' : 'Windows notifications'
  const hint = language === 'da'
    ? 'Vis nye notifikationer som Windows-besked, når Supply Chain Hub ikke er i fokus.'
    : language === 'fi'
      ? 'Näytä uudet ilmoitukset Windows-ilmoituksina, kun Supply Chain Hub ei ole aktiivinen.'
      : language === 'sv'
        ? 'Visa nya notiser som Windows-meddelanden när Supply Chain Hub inte är i fokus.'
        : 'Show new notifications as a Windows message when Supply Chain Hub is not in focus.'
  const failed = language === 'da' ? 'Indstillingen kunne ikke gemmes' : language === 'fi' ? 'Asetusta ei voitu tallentaa' : language === 'sv' ? 'Inställningen kunde inte sparas' : 'The setting could not be saved'

  const change = async (next: boolean) => {
    const previous = enabled
    setEnabled(next)
    try {
      setEnabled(await api.setEnabled(next))
    } catch {
      setEnabled(previous)
      toast.error(failed)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor="desktop-notifications">{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id="desktop-notifications" checked={enabled ?? true} disabled={enabled === null} onCheckedChange={change} aria-label={label} />
    </div>
  )
}
