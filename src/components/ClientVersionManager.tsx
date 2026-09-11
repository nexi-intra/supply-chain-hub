import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Monitor, Lightning, Clock } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { setKvObjectField } from '@/lib/kvArrays'
import type { UpdateStatus, UpdateManifest } from '@/lib/electronUpdatesBridge'
import { useLanguage } from '@/contexts/LanguageContext'

interface ClientVersionManagerProps {
  managerEmail: string
  users: Array<{ email: string; fullName: string }>
}

interface ClientVersionEntry {
  version: string
  platform: string
  lastSeen: number
}

const OFFLINE_THRESHOLD_MS = 24 * 60 * 60 * 1000

// Manager Panel → Datalagring: viser hvilken app-version hver bruger kører,
// og lader manageren tvinge en helt specifik version ud til dem der er bagud.
export function ClientVersionManager({ managerEmail, users }: ClientVersionManagerProps) {
  const { t } = useLanguage()
  const isDesktopApp = !!window.electronUpdates
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [history, setHistory] = useState<UpdateManifest[]>([])
  const [clientVersions, setClientVersions] = useState<Record<string, ClientVersionEntry>>({})
  const [pendingRequests, setPendingRequests] = useState<Record<string, { requestedAt: number; version?: string }>>({})
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
  const [busyEmail, setBusyEmail] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!window.electronUpdates) return
    try {
      const [statusResult, historyResult, versions, requests] = await Promise.all([
        window.electronUpdates.getStatus(),
        window.electronUpdates.history(),
        window.kv.get<Record<string, ClientVersionEntry>>('client-versions'),
        window.kv.get<Record<string, { requestedAt: number; requestedBy: string; version?: string }>>('force-update-requests'),
      ])
      setStatus(statusResult)
      setHistory(historyResult || [])
      setClientVersions(versions || {})
      setPendingRequests(requests || {})
    } catch (error) {
      console.error('Kunne ikke hente klient-versioner:', error)
    }
  }, [])

  useEffect(() => {
    refresh()
    if (!window.kv) return
    const unsubscribe = window.kv.subscribe((changedKeys) => {
      if (changedKeys.includes('client-versions') || changedKeys.includes('force-update-requests')) refresh()
    })
    return () => unsubscribe()
  }, [refresh])

  if (!isDesktopApp) return null

  const latestVersion = status?.manifest?.version || status?.currentVersion || ''

  const isOutdated = (version: string) => {
    if (!latestVersion || !version) return false
    const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0)
    const [a1, a2, a3] = parse(version)
    const [b1, b2, b3] = parse(latestVersion)
    return a1 < b1 || (a1 === b1 && a2 < b2) || (a1 === b1 && a2 === b2 && a3 < b3)
  }

  const getSelectedVersion = (email: string) => selectedVersions[email] || history[0]?.version || latestVersion

  const handleForceUpdate = async (email: string) => {
    const version = getSelectedVersion(email)
    if (!version) {
      toast.error(t.clientVersionManager.noVersionToPush)
      return
    }
    setBusyEmail(email)
    try {
      await setKvObjectField('force-update-requests', email, {
        requestedAt: Date.now(),
        requestedBy: managerEmail,
        version,
      })
      toast.success(`${t.clientVersionManager.sentToPrefix}${version} ${t.clientVersionManager.sentToMiddle} ${email} ${t.clientVersionManager.sentToSuffix}`)
      await refresh()
    } catch (error) {
      console.error('Kunne ikke sende tvungen opdatering:', error)
      toast.error(t.clientVersionManager.forceUpdateFailed)
    } finally {
      setBusyEmail(null)
    }
  }

  const rows = users
    .map((user) => ({
      user,
      entry: clientVersions[user.email],
    }))
    .sort((a, b) => (b.entry?.lastSeen || 0) - (a.entry?.lastSeen || 0))

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.50_0.14_275)] to-[oklch(0.56_0.12_262)] flex items-center justify-center">
          <Monitor size={24} weight="duotone" className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold">{t.clientVersionManager.title}</h3>
          <p className="text-sm text-muted-foreground">
            {t.clientVersionManager.subtitle}
          </p>
        </div>
      </div>

      {history.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border bg-muted/40 p-3">
          {t.clientVersionManager.noHistoryYet}
        </p>
      )}

      <div className="rounded-lg border divide-y">
        {rows.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{t.clientVersionManager.noUsersFound}</p>
        )}
        {rows.map(({ user, entry }) => {
          const outdated = entry ? isOutdated(entry.version) : false
          const neverSeen = !entry
          const isOffline = entry && Date.now() - entry.lastSeen > OFFLINE_THRESHOLD_MS
          const pending = pendingRequests[user.email]
          const selectedVersion = getSelectedVersion(user.email)

          return (
            <div key={user.email} className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{user.fullName}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {neverSeen ? (
                  <Badge variant="outline">{t.clientVersionManager.neverReported}</Badge>
                ) : (
                  <>
                    <Badge variant={outdated ? 'destructive' : 'default'}>
                      v{entry.version}
                    </Badge>
                    {isOffline && (
                      <Badge variant="outline" className="gap-1">
                        <Clock size={12} />
                        {t.clientVersionManager.notSeenIn24h}
                      </Badge>
                    )}
                  </>
                )}
                {pending && (
                  <Badge variant="secondary" className="gap-1">
                    <Lightning size={12} />
                    v{pending.version || '?'} {t.clientVersionManager.pendingSuffix}
                  </Badge>
                )}

                <Select
                  value={selectedVersion}
                  onValueChange={(value) => setSelectedVersions((current) => ({ ...current, [user.email]: value }))}
                  disabled={history.length === 0}
                >
                  <SelectTrigger className="w-[150px] h-9 text-sm">
                    <SelectValue placeholder={t.clientVersionManager.selectVersion} />
                  </SelectTrigger>
                  <SelectContent>
                    {history.map((entryManifest) => (
                      <SelectItem key={entryManifest.version} value={entryManifest.version}>
                        v{entryManifest.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={neverSeen || busyEmail === user.email || !!pending || history.length === 0}
                  onClick={() => handleForceUpdate(user.email)}
                  className="gap-1.5"
                >
                  <Lightning size={14} />
                  {t.clientVersionManager.forcePrefix}{selectedVersion || '…'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

