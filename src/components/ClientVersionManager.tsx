import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Monitor, Lightning, Clock } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { setKvObjectField } from '@/lib/kvArrays'
import type { UpdateStatus, UpdateManifest } from '@/lib/electronUpdatesBridge'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'
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

interface VersionRow {
  email: string
  fullName: string
  entry?: ClientVersionEntry
  teamId: string
  teamAbbreviation: string
  /** Force-opdatering skriver kun til det AKTIVE hubs KV - andre hubs er skrivebeskyttede her. */
  isOwnTeam: boolean
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
  const [currentTeam, setCurrentTeam] = useState<RegisteredTeam | null>(null)
  const [otherTeamRows, setOtherTeamRows] = useState<VersionRow[]>([])
  const [teamFilter, setTeamFilter] = useState('all')

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

  // Andre hubs' app-versioner: skrivebeskyttet oversigt paa tvaers, hentes én
  // gang (versions-skaerme aendrer sig sjaeldent nok til at polling ikke er
  // noedvendigt, samme tilgang som useCrossTeamLeaderboard).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!window.electronRegistry) return
      const [allTeams, own] = await Promise.all([window.electronRegistry.listTeams(), window.electronRegistry.getCurrentTeam()])
      if (cancelled) return
      setCurrentTeam(own)
      const others = allTeams.filter(team => team.teamId !== own?.teamId)
      if (!others.length) { setOtherTeamRows([]); return }
      const results = await window.electronRegistry.readTeamsKeys(others.map(team => ({ folderName: team.folderName, keys: ['users', 'client-versions'] })))
      if (cancelled) return
      const rows: VersionRow[] = []
      others.forEach((team, index) => {
        const teamUsers = (results[index]?.[0] as Record<string, { email: string; fullName: string }>) || {}
        const teamVersions = (results[index]?.[1] as Record<string, ClientVersionEntry>) || {}
        for (const user of Object.values(teamUsers)) {
          rows.push({ email: user.email, fullName: user.fullName, entry: teamVersions[user.email], teamId: team.teamId, teamAbbreviation: team.abbreviation || team.name, isOwnTeam: false })
        }
      })
      setOtherTeamRows(rows)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const teamOptions = useMemo(() => {
    const seen = new Map<string, string>()
    if (currentTeam) seen.set(currentTeam.teamId, currentTeam.abbreviation || currentTeam.name)
    for (const row of otherTeamRows) if (!seen.has(row.teamId)) seen.set(row.teamId, row.teamAbbreviation)
    return Array.from(seen, ([teamId, label]) => ({ teamId, label }))
  }, [currentTeam, otherTeamRows])

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

  const ownRows: VersionRow[] = users.map((user) => ({
    email: user.email,
    fullName: user.fullName,
    entry: clientVersions[user.email],
    teamId: currentTeam?.teamId || 'own',
    teamAbbreviation: currentTeam?.abbreviation || currentTeam?.name || '',
    isOwnTeam: true,
  }))

  const rows = [...ownRows, ...otherTeamRows]
    .filter((row) => teamFilter === 'all' || row.teamId === teamFilter)
    .sort((a, b) => (b.entry?.lastSeen || 0) - (a.entry?.lastSeen || 0))

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap justify-between">
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
        {teamOptions.length > 1 && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.clientVersionManager.allHubsOption}</SelectItem>
              {teamOptions.map((option) => (
                <SelectItem key={option.teamId} value={option.teamId}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
        {rows.map((row) => {
          const { email, fullName, entry, isOwnTeam } = row
          const outdated = entry ? isOutdated(entry.version) : false
          const neverSeen = !entry
          const isOffline = entry && Date.now() - entry.lastSeen > OFFLINE_THRESHOLD_MS
          const pending = isOwnTeam ? pendingRequests[email] : undefined
          const selectedVersion = getSelectedVersion(email)

          return (
            <div key={`${row.teamId}-${email}`} className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{fullName}</div>
                <div className="text-xs text-muted-foreground truncate">{email}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {teamOptions.length > 1 && row.teamAbbreviation && (
                  <Badge variant="outline" className="text-xs">{row.teamAbbreviation}</Badge>
                )}
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

                {isOwnTeam ? (
                  <>
                    <Select
                      value={selectedVersion}
                      onValueChange={(value) => setSelectedVersions((current) => ({ ...current, [email]: value }))}
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
                      disabled={neverSeen || busyEmail === email || !!pending || history.length === 0}
                      onClick={() => handleForceUpdate(email)}
                      className="gap-1.5"
                    >
                      <Lightning size={14} />
                      {t.clientVersionManager.forcePrefix}{selectedVersion || '…'}
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{t.clientVersionManager.crossHubReadOnlyHint}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}


