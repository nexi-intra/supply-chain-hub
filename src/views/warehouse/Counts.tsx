import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, ClipboardText, Flag, HourglassMedium, Plus, UsersThree } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatMoney, formatNumber, scopeText } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { CountListEntry, WarehouseUser, CountStatus, StatusOverview } from '@/types/warehouse'
import { StartStatusDialog } from './StartStatusDialog'
import { useWithoutDeleted } from './pendingDeletes'
import { t } from '@/lib/warehouse/text'

const LIST_POLL_MS = 15000

interface CountsProps {
  user: WarehouseUser
  onNew: () => void
  onOpen: (id: string) => void
  onOpenStatus: (id: string) => void
  onOpenSapCheck: () => void
}

export function Counts({ user, onNew, onOpen, onOpenStatus, onOpenSapCheck }: CountsProps) {
  const [loaded, setOverview] = useState<StatusOverview | null>(null)
  // Without what is being deleted on this PC right now (the drive still has it until the delete is written).
  const overview = useWithoutDeleted(loaded)
  const [failed, setFailed] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    try {
      setOverview(await window.electronWarehouse!.statuses.overview())
      setFailed(null)
    } catch (error) {
      setFailed(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, LIST_POLL_MS)
    return () => window.clearInterval(timer)
  }, [load, user.team])

  const active = overview?.active ?? null
  const counts = active?.counts ?? []
  const open = counts.filter(entry => entry.status === 'open')
  const closed = counts.filter(entry => entry.status === 'closed')
  const unassigned = overview?.unassigned ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('Optællinger', 'Counts')}</h1>
          <p className="text-sm text-muted-foreground">Team {user.team} · Plant D301</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {overview?.canManage && !active && (
            <Button variant="outline" onClick={() => setStarting(true)}>
              <Flag size={18} weight="bold" />
              {t('Start ny status', 'Start new status')}
            </Button>
          )}
          <SapActionButton onAction={onNew} disabled={!active}>
            <Plus size={18} weight="bold" />
            {t('Ny optælling', 'New count')}
          </SapActionButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Storage locations</span>
        {user.storageLocations.map(location => (
          <Badge key={location} variant="outline" className="font-mono">{location}</Badge>
        ))}
      </div>

      {failed && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{failed}</p>}

      {overview === null && !failed && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(key => <Skeleton key={key} className="h-40 rounded-xl" />)}
        </div>
      )}

      {overview !== null && !active && (
        <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <HourglassMedium size={24} weight="duotone" />
          </span>
          <h2 className="text-lg font-semibold">{t('Venter på at en manager starter næste status', 'Waiting for a manager to start the next status')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {overview.canManage
              ? t('Start en status for kvartalet. Derefter kan alle i teamet oprette optællinger i den.', 'Start a status for the quarter. Then everyone in the team can create counts in it.')
              : t('Optællinger oprettes altid i en status. Når en manager har startet den, kan du oprette optællinger her.', 'Counts are always created in a status. Once a manager has started it, you can create counts here.')}
          </p>
        </Card>
      )}

      {active && (
        <Card className="gap-4 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Igangværende status', 'Status in progress')}</p>
              <h2 className="text-xl font-semibold">{active.name}</h2>
              <p className="text-xs text-muted-foreground">{t(`Startet ${formatDateTime(active.startedAt)} af ${active.startedBy.name}`, `Started ${formatDateTime(active.startedAt)} by ${active.startedBy.name}`)}</p>
            </div>
            <Button variant="outline" onClick={() => onOpenStatus(active.id)}>{t('Se detaljer', 'See details')} <ArrowRight size={16} /></Button>
          </div>
          <StatusFigures status={active} />
        </Card>
      )}

      {active && counts.length === 0 && (
        <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <ClipboardText size={24} weight="duotone" />
          </span>
          <h2 className="text-lg font-semibold">{t('Ingen optællinger endnu', 'No counts yet')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t(`"Ny optælling" henter lagerbeholdning og serienumre fra SAP, når SAP er klar. Alle i ${user.team} kan oprette en optælling.`, `"New count" fetches stock and serial numbers from SAP when SAP is ready. Everyone in ${user.team} can create a count.`)}
          </p>
        </Card>
      )}

      {open.length > 0 && <CountGrid title={t('Åbne', 'Open')} counts={open} me={user.email} onOpen={onOpen} />}
      {closed.length > 0 && <CountGrid title={t('Afsluttede', 'Closed')} counts={closed} me={user.email} onOpen={onOpen} />}

      {unassigned.length > 0 && <CountGrid title={t('Ældre optællinger (uden status)', 'Older counts (without status)')} counts={unassigned} me={user.email} onOpen={onOpen} />}

      {starting && <StartStatusDialog onClose={() => setStarting(false)} onStarted={() => { setStarting(false); void load() }} onOpenSapCheck={() => { setStarting(false); onOpenSapCheck() }} />}
    </div>
  )
}

function CountGrid({ title, counts, me, onOpen }: { title: string; counts: CountListEntry[]; me: string; onOpen: (id: string) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {counts.map(entry => <CountCard key={entry.id} entry={entry} isOwner={entry.owner.email === me.toLowerCase()} onOpen={() => onOpen(entry.id)} />)}
      </div>
    </section>
  )
}

export function StatusFigures({ status }: { status: CountStatus }) {
  const { progress } = status
  return (
    <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">{t('Samlet fremdrift', 'Overall progress')}</span>
          <span className="text-lg font-semibold tabular-nums">{progress.total ? `${progress.percent} %` : '–'}</span>
        </div>
        <Progress value={progress.percent} />
        <p className="text-xs text-muted-foreground tabular-nums">{t(`${formatNumber(progress.reached)} af ${formatNumber(progress.total)} serienumre og tællelinjer`, `${formatNumber(progress.reached)} of ${formatNumber(progress.total)} serial numbers and count lines`)}</p>
      </div>
      <Figure label={t('Optællinger', 'Counts')} value={t(`${progress.closed} af ${progress.counts} afsluttet`, `${progress.closed} of ${progress.counts} closed`)} />
      <Figure label={t('Værdidifference', 'Value difference')} value={formatMoney(progress.valueDiff)} tone={progress.valueDiff < 0 ? 'negative' : progress.valueDiff > 0 ? 'positive' : undefined} />
    </div>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'negative' | 'positive' }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone === 'negative' && 'text-red-600 dark:text-red-400', tone === 'positive' && 'text-emerald-600 dark:text-emerald-400')}>{value}</p>
    </div>
  )
}

function CountCard({ entry, isOwner, onOpen }: { entry: CountListEntry; isOwner: boolean; onOpen: () => void }) {
  const percent = entry.summary?.percent ?? 0
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-5 text-left shadow-xs transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-base font-semibold group-hover:text-primary">{entry.name}</h3>
          <p className="truncate font-mono text-xs text-muted-foreground">{scopeText(entry.scope)}</p>
        </div>
        <Badge variant={entry.status === 'open' ? 'default' : 'secondary'}>{entry.status === 'open' ? t('Åben', 'Open') : t('Afsluttet', 'Closed')}</Badge>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">{t('Fremdrift', 'Progress')}</span>
          <span className="font-semibold tabular-nums">{entry.summary ? `${percent} %` : '–'}</span>
        </div>
        <Progress value={percent} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{t('Ansvarlig', 'Responsible')}: {entry.owner.name}</span>
        <span className="inline-flex items-center gap-1"><UsersThree size={14} /> {entry.members}</span>
        <span>SAP: {formatDateTime(entry.fetchedAt)}</span>
        {entry.myStatus === 'requested' && <Badge variant="outline">{t('Afventer godkendelse', 'Awaiting approval')}</Badge>}
        {isOwner && entry.requests > 0 && <Badge>{t(`${entry.requests} anmoder om at deltage`, `${entry.requests} asking to join`)}</Badge>}
      </div>
    </button>
  )
}

export function notifyError(error: unknown) {
  toast.error(errorMessage(error))
}
