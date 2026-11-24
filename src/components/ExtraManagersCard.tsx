import { useEffect, useState } from 'react'
import { Crown } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/contexts/LanguageContext'
import { getHubAccessLabels } from '@/lib/hubAccessLabels'
import type { ExtraManager } from '@/lib/electronRegistryBridge'

/** Manager Panel: who manages this team from another team. Read-only; only the creator changes it. */
export function ExtraManagersCard() {
  const { language } = useLanguage()
  const labels = getHubAccessLabels(language)
  const [managers, setManagers] = useState<ExtraManager[]>([])

  useEffect(() => {
    window.electronRegistry?.listExtraManagers().then(setManagers).catch(() => setManagers([]))
  }, [])

  if (managers.length === 0) return null
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <Crown size={28} className="text-primary" weight="duotone" />
        <h2 className="text-2xl font-bold">{labels.extraManagersTitle}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{labels.extraManagersDescription}</p>
      <div className="divide-y rounded-md border">
        {managers.map(manager => (
          <div key={manager.email} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{manager.fullName}</div>
              <div className="text-xs text-muted-foreground break-all">{manager.email}</div>
            </div>
            {manager.homeTeam && <Badge variant="secondary">{labels.fromTeam(manager.homeTeam.abbreviation || manager.homeTeam.name)}</Badge>}
          </div>
        ))}
      </div>
    </Card>
  )
}
