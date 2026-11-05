import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Buildings, Crown, SignOut, UsersThree } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useLanguage } from '@/contexts/LanguageContext'
import { getHubAccessLabels } from '@/lib/hubAccessLabels'
import type { MyHub } from '@/lib/electronRegistryBridge'
import { cn } from '@/lib/utils'

interface HubPickerProps {
  hubs: MyHub[]
  /** The hub chosen last time on this pc; it is preselected. */
  preferred: string | null
  onChoose: (hub: MyHub) => Promise<boolean>
  onLogout: () => void
}

export function HubPicker({ hubs, preferred, onChoose, onLogout }: HubPickerProps) {
  const { language, t } = useLanguage()
  const labels = getHubAccessLabels(language)
  const initial = hubs.find(hub => hub.folderName === preferred) ?? hubs.find(hub => hub.active) ?? hubs[0]
  const [selected, setSelected] = useState(initial?.folderName)
  const [busy, setBusy] = useState(false)
  const choose = async (hub: MyHub) => {
    if (busy) return
    setBusy(true)
    if (!await onChoose(hub)) { toast.error(labels.switchFailed); setBusy(false) }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      const hub = hubs.find(item => item.folderName === selected)
      if (hub) void choose(hub)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        <ThemeToggle />
        <LanguageToggle />
        <Button variant="outline" onClick={onLogout} className="gap-2">
          <SignOut size={18} /> {t.profile.menuLogout}
        </Button>
      </div>
      <div className="container mx-auto px-4 pt-32 pb-16 max-w-5xl relative z-10">
        <div className="text-center mb-10">
          <UsersThree size={54} weight="duotone" className="text-primary mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground pb-2">{labels.pickerTitle}</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">{labels.pickerSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {hubs.map(hub => (
            <Card
              key={hub.teamId}
              onMouseEnter={() => setSelected(hub.folderName)}
              className={cn('p-6 transition-colors flex flex-col', selected === hub.folderName ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50')}
            >
              <div className="flex items-start justify-between gap-3">
                {hub.home ? <Buildings size={32} weight="duotone" className="text-primary" /> : <Crown size={32} weight="duotone" className="text-primary" />}
                <div className="flex flex-wrap justify-end gap-2">
                  {hub.home ? <Badge variant="secondary">{labels.homeTeam}</Badge> : <Badge variant="outline">{labels.managerRole}</Badge>}
                  {hub.pending > 0 && <Badge className="bg-[oklch(0.55_0.16_25)] text-white">{labels.waiting(hub.pending)}</Badge>}
                </div>
              </div>
              <h2 className="text-xl font-bold mt-3">{hub.name}</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-5">{hub.abbreviation}</p>
              <Button onClick={() => void choose(hub)} disabled={busy} variant={selected === hub.folderName ? 'default' : 'outline'} className="mt-auto">
                {labels.open}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
