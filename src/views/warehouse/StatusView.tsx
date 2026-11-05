import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, FileXls, LockSimple, LockSimpleOpen, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatMoney, scopeText } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { CountStatus, StatusArchive, StatusHistoryEntry } from '@/types/warehouse'
import { ArchiveMaterials, DifferenceFigures, formatShare } from './Archive'
import { StatusFigures } from './Counts'
import { DeleteStatusDialog, StatusChecklistCard, UnlockDialog } from './StatusChecklist'
import { t } from '@/lib/warehouse/text'

const actions = (): Record<string, string> => ({ started: t('Startet', 'Started'), locked: t('Godkendt og låst', 'Approved and locked'), unlocked: t('Låst op', 'Unlocked') })

export function StatusView({ id, onBack, onOpenCount }: { id: string; onBack: () => void; onOpenCount: (id: string) => void }) {
  const [status, setStatus] = useState<CountStatus | null>(null)
  const [archive, setArchive] = useState<StatusArchive | null>(null)
  const [archiveFailed, setArchiveFailed] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const overview = await window.electronWarehouse!.statuses.overview()
      const found = overview.statuses.find(item => item.id === id)
      if (!found) throw new Error('STATUS_NOT_FOUND')
      setStatus(found)
      setCanManage(overview.canManage)
      setFailed(null)
    } catch (error) {
      setFailed(errorMessage(error))
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  // A locked status shows the difference instead of progress; its lines and SAP documents come from the archive.
  const lockedAt = status?.state === 'locked' ? status.lockedAt : null
  useEffect(() => {
    setArchive(null)
    setArchiveFailed(null)
    if (!lockedAt) return
    let current = true
    window.electronWarehouse!.statuses.archive(id)
      .then(result => { if (current) setArchive(result) })
      .catch(error => { if (current) setArchiveFailed(errorMessage(error)) })
    return () => { current = false }
  }, [id, lockedAt])

  if (failed && !status) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}><ArrowLeft size={18} /> {t('Tilbage', 'Back')}</Button>
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{failed}</p>
      </div>
    )
  }
  if (!status) return <Skeleton className="h-96 rounded-xl" />

  const locked = status.state === 'locked'
  const openReport = async (file: string) => {
    try {
      await window.electronWarehouse!.counts.openReport(file)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={locked ? t('Tilbage til arkivet', 'Back to the archive') : t('Tilbage til forsiden', 'Back to the front page')}><ArrowLeft size={20} /></Button>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{status.name}</h1>
              {locked ? <Badge variant="secondary" className="gap-1"><LockSimple size={12} /> {t('Godkendt og låst', 'Approved and locked')}</Badge> : <Badge>{t('Igangværende', 'In progress')}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(`Startet ${formatDateTime(status.startedAt)} af ${status.startedBy.name}`, `Started ${formatDateTime(status.startedAt)} by ${status.startedBy.name}`)}
              {locked && status.lockedAt ? t(` · Låst ${formatDateTime(status.lockedAt)}${status.lockedBy ? ` af ${status.lockedBy.name}` : ''}`, ` · Locked ${formatDateTime(status.lockedAt)}${status.lockedBy ? ` by ${status.lockedBy.name}` : ''}`) : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {locked && canManage && <Button variant="outline" onClick={() => setUnlocking(true)}><LockSimpleOpen size={18} /> {t('Lås op', 'Unlock')}</Button>}
          {canManage && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(true)}><Trash size={18} /> {t('Slet status', 'Delete status')}</Button>}
        </div>
      </div>

      <Card className="px-5 py-5">
        {!locked ? <StatusFigures status={status} />
          : archive ? <DifferenceFigures totals={archive.totals} counts={archive.counts.length} />
          : archiveFailed ? <p role="alert" className="text-sm text-destructive">{archiveFailed}</p>
          : <Skeleton className="h-20" />}
      </Card>

      {!locked && <StatusChecklistCard status={status} canManage={canManage} onChanged={load} />}
      {unlocking && <UnlockDialog status={status} onClose={() => setUnlocking(false)} onUnlocked={async () => { setUnlocking(false); await load() }} />}
      {deleting && <DeleteStatusDialog status={status} onClose={() => setDeleting(false)} onDeleted={onBack} />}

      <Card>
        <CardHeader><CardTitle className="text-base">{t('Optællinger', 'Counts')} ({status.counts.length})</CardTitle></CardHeader>
        <CardContent>
          {status.counts.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen optællinger i statussen.', 'No counts in the status.')}</p> : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('Optælling', 'Count')}</th>
                    <th className="px-3 py-2">{t('Udvalg', 'Selection')}</th>
                    <th className="px-3 py-2">{t('Ansvarlig', 'Responsible')}</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">{locked ? t('Difference (stk.)', 'Difference (pcs)') : t('Fremdrift', 'Progress')}</th>
                    <th className="px-3 py-2 text-right">{locked ? 'Difference (DKK)' : t('Værdidifference', 'Value difference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {status.counts.map(entry => {
                    const valueDiff = entry.summary?.valueDiff
                    const totals = archive?.counts.find(item => item.id === entry.id)?.totals
                    return (
                      <tr key={entry.id} className="border-t hover:bg-muted/40">
                        <td className="px-3 py-2 font-medium"><button type="button" className="text-left hover:text-primary focus-visible:outline-none focus-visible:underline" onClick={() => onOpenCount(entry.id)}>{entry.name}</button></td>
                        <td className="px-3 py-2 font-mono text-xs">{scopeText(entry.scope)}</td>
                        <td className="px-3 py-2">{entry.owner.name}</td>
                        <td className="px-3 py-2"><Badge variant={entry.status === 'open' ? 'default' : 'secondary'}>{entry.status === 'open' ? t('Åben', 'Open') : t('Afsluttet', 'Closed')}</Badge></td>
                        {locked ? (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums">{totals ? <>{formatShare(totals.absPercent)} <span className="text-xs text-muted-foreground">({totals.absDiff} {t('stk.', 'pcs')})</span></> : '–'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{totals ? <>{formatShare(totals.valuePercent)} <span className="text-xs text-muted-foreground">({formatMoney(totals.valueAbs)})</span></> : '–'}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums">{entry.summary ? `${entry.summary.percent} %` : '–'}</td>
                            <td className={cn('px-3 py-2 text-right tabular-nums', (valueDiff ?? 0) < 0 && 'text-red-600 dark:text-red-400')}>{typeof valueDiff === 'number' ? formatMoney(valueDiff) : '–'}</td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {locked && archive && <ArchiveMaterials archive={archive} />}

      {status.reports && status.reports.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('Endelige rapporter', 'Final reports')}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[...status.reports].reverse().map(report => (
                <li key={report.version} className="space-y-1.5 rounded-lg border px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Version {report.version} · {formatDateTime(report.at)}</span>
                    <Button variant="outline" size="sm" onClick={() => void openReport(report.file)}><FileXls size={16} /> {t('Åbn statusrapport', 'Open status report')}</Button>
                  </div>
                  {report.counts && report.counts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {report.counts.map(item => <Button key={item.countId} variant="ghost" size="sm" onClick={() => void openReport(item.file)}><FileXls size={14} /> {item.name}</Button>)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{t('Historik', 'History')}</CardTitle></CardHeader>
        <CardContent>
          <HistoryList entries={status.history} />
        </CardContent>
      </Card>
    </div>
  )
}

function HistoryList({ entries }: { entries: StatusHistoryEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">{t('Ingen hændelser endnu.', 'No events yet.')}</p>
  return (
    <ol className="space-y-2 text-sm">
      {[...entries].reverse().map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="flex flex-wrap gap-x-3">
          <span className="tabular-nums text-muted-foreground">{formatDateTime(entry.at)}</span>
          <span className="font-medium">{actions()[entry.action] || entry.action}</span>
          <span className="text-muted-foreground">{entry.by?.name}</span>
          {entry.reason && <span className="w-full pl-0 text-muted-foreground sm:w-auto">{t('Begrundelse', 'Reason')}: {entry.reason}</span>}
        </li>
      ))}
    </ol>
  )
}
