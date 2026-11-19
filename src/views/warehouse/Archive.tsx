import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Archive as ArchiveIcon, FileXls, LockSimple, MagnifyingGlass, SquaresFour } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatMoney, formatNumber, stockLabel } from '@/lib/warehouse/format'
import { t, warehouseLocale } from '@/lib/warehouse/text'
import { withoutDeleted } from './pendingDeletes'
import { cn } from '@/lib/utils'
import type { ArchiveLine, WarehouseUser, CountStatus, DifferenceTotals, StatusArchive } from '@/types/warehouse'

export const formatShare = (value: number) => `${new Intl.NumberFormat(warehouseLocale(), { maximumFractionDigits: 2 }).format(value)} %`

const approvalText = (): Record<string, string> => ({ approved: t('Godkendt', 'Approved'), posted: t('Bogført', 'Posted'), returned: t('Sendt retur', 'Sent back'), submitted: t('Indsendt', 'Submitted'), open: t('Åben', 'Open') })

/** The locked statuses of the team. Everyone in the team can see them. */
export function Archive({ user, onOpenStatus }: { user: WarehouseUser; onOpenStatus: (id: string) => void }) {
  const [statuses, setStatuses] = useState<CountStatus[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const overview = withoutDeleted(await window.electronWarehouse!.statuses.overview())
      setStatuses(overview.statuses.filter(status => status.state === 'locked').sort((a, b) => (b.lockedAt ?? 0) - (a.lockedAt ?? 0)))
      setFailed(null)
    } catch (error) {
      setFailed(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 15000)
    return () => window.clearInterval(timer)
  }, [load, user.team])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('Arkiv', 'Archive')}</h1>
        <p className="text-sm text-muted-foreground">{t(`Afholdte statusser for team ${user.team} · rapporter, differencer og SAP-dokumenter`, `Completed statuses for team ${user.team} · reports, differences and SAP documents`)}</p>
      </div>
      {failed && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{failed}</p>}
      {statuses === null && !failed && <Skeleton className="h-40 rounded-xl" />}
      {statuses !== null && statuses.length === 0 && (
        <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><ArchiveIcon size={24} weight="duotone" /></span>
          <h2 className="text-lg font-semibold">{t('Ingen afholdte statusser endnu', 'No completed statuses yet')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t('Når en manager godkender og låser en status, ligger den her med rapporter, differencer og SAP-dokumenter.', 'When a manager approves and locks a status, it is kept here with reports, differences and SAP documents.')}</p>
        </Card>
      )}
      {statuses !== null && statuses.length > 0 && (
        <Card className="gap-0 divide-y py-0">
          {statuses.map(status => <PastStatusRow key={status.id} status={status} onOpen={() => onOpenStatus(status.id)} />)}
        </Card>
      )}
    </div>
  )
}

function PastStatusRow({ status, onOpen }: { status: CountStatus; onOpen: () => void }) {
  const report = status.reports?.[status.reports.length - 1]
  const openReport = async () => {
    if (!report) return
    try {
      await window.electronWarehouse!.counts.openReport(report.file)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-2 font-semibold"><LockSimple size={16} className="text-muted-foreground" /> {status.name}</p>
        <p className="text-xs text-muted-foreground">
          {status.lockedAt ? t(`Godkendt og låst ${formatDateTime(status.lockedAt)}${status.lockedBy ? ` af ${status.lockedBy.name}` : ''}`, `Approved and locked ${formatDateTime(status.lockedAt)}${status.lockedBy ? ` by ${status.lockedBy.name}` : ''}`) : t('Ikke låst', 'Not locked')}
          {' · '}{status.progress.counts} {status.progress.counts === 1 ? t('optælling', 'count') : t('optællinger', 'counts')}
        </p>
      </div>
      <div className="flex gap-2">
        {report && <Button variant="outline" size="sm" onClick={() => openReport()}><FileXls size={16} /> {t('Åbn rapport', 'Open report')}</Button>}
        <Button variant="ghost" size="sm" onClick={onOpen}>{t('Se detaljer', 'See details')} <ArrowRight size={14} /></Button>
      </div>
    </div>
  )
}

/** Difference of a locked status: over and under both count, as a share of the SAP stock (pieces and DKK). */
export function DifferenceFigures({ totals, counts }: { totals: DifferenceTotals; counts: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('Difference (stk.)', 'Difference (pcs)')}</p>
        <p className="text-2xl font-semibold tabular-nums" data-testid="diff-qty-percent">{formatShare(totals.absPercent)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{t(`${formatNumber(totals.absDiff)} af ${formatNumber(totals.sapQty)} stk. i SAP`, `${formatNumber(totals.absDiff)} of ${formatNumber(totals.sapQty)} pcs in SAP`)}</p>
        <p className="text-xs tabular-nums"><span className="text-emerald-600 dark:text-emerald-400">+{formatNumber(totals.over)} over</span> · <span className="text-red-600 dark:text-red-400">-{formatNumber(totals.under)} under</span></p>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Difference (DKK)</p>
        <p className="text-2xl font-semibold tabular-nums" data-testid="diff-value-percent">{formatShare(totals.valuePercent)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(totals.valueAbs)} {t('af', 'of')} {formatMoney(totals.sapValue)}</p>
        <p className="text-xs tabular-nums"><span className="text-emerald-600 dark:text-emerald-400">+{formatMoney(totals.valueOver)}</span> · <span className="text-red-600 dark:text-red-400">-{formatMoney(totals.valueUnder)}</span></p>
        {!totals.priced && <p className="text-xs text-amber-700 dark:text-amber-400">{t('Nogle materialer har ingen pris og indgår ikke i kronebeløbet.', 'Some materials have no price and are not included in the DKK amount.')}</p>}
      </div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('Indhold', 'Contents')}</p>
        <p className="text-2xl font-semibold tabular-nums">{formatNumber(totals.lines)} {t('linjer', 'lines')}</p>
        <p className="text-xs text-muted-foreground">{counts} {counts === 1 ? t('optælling', 'count') : t('optællinger', 'counts')} · {t(`${formatNumber(totals.counted)} stk. talt`, `${formatNumber(totals.counted)} pcs counted`)}</p>
      </div>
    </div>
  )
}

/** Every line of a locked status with its approval and SAP documents; "Vis i SAP" opens them display only. */
export function ArchiveMaterials({ archive }: { archive: StatusArchive }) {
  const [query, setQuery] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)

  const lines = useMemo(() => {
    const text = query.trim().toLowerCase()
    return archive.lines.filter(line => (!onlyDiff || line.diff !== 0) && (!text || `${line.material} ${line.description} ${line.sloc} ${line.doc?.docNo ?? ''} ${line.doc?.materialDoc ?? ''}`.toLowerCase().includes(text)))
  }, [archive.lines, query, onlyDiff])

  const show = async (line: ArchiveLine, kind: 'mi03' | 'mb03') => {
    const doc = line.doc
    const docNo = kind === 'mi03' ? doc?.docNo : doc?.materialDoc
    const year = kind === 'mi03' ? doc?.year : doc?.materialYear
    if (!doc || !docNo || !year) return
    setOpening(`${kind}:${docNo}`)
    try {
      await window.electronWarehouse!.statuses.showInSap({ system: doc.system, kind, docNo, year })
      toast.success(t(`${kind === 'mi03' ? 'SAP-dokument' : 'Materialedokument'} ${docNo} er åbnet i SAP`, `${kind === 'mi03' ? 'SAP document' : 'Material document'} ${docNo} is open in SAP`))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setOpening(null)
    }
  }

  const docButton = (line: ArchiveLine, kind: 'mi03' | 'mb03') => {
    const docNo = kind === 'mi03' ? line.doc?.docNo : line.doc?.materialDoc
    if (!docNo) return <span className="text-muted-foreground">–</span>
    return (
      <Button variant="link" size="sm" className="h-auto p-0 font-mono" disabled={opening !== null} onClick={() => show(line, kind)} title={t(`Vis ${docNo} i SAP (${kind === 'mi03' ? 'MI03' : 'MB03'})`, `Show ${docNo} in SAP (${kind === 'mi03' ? 'MI03' : 'MB03'})`)}>
        {opening === `${kind}:${docNo}` ? t('Åbner…', 'Opening…') : docNo}
      </Button>
    )
  }

  return (
    <Card data-testid="archive-materials">
      <CardHeader className="gap-3">
        <CardTitle className="flex items-center gap-2 text-base"><SquaresFour size={18} /> {t('Materialer', 'Materials')} ({archive.lines.length})</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Søg materiale, lager eller dokument', 'Search material, stock or document')} className="pl-8" aria-label={t('Søg i materialer', 'Search materials')} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyDiff} onChange={event => setOnlyDiff(event.target.checked)} className="size-4 accent-primary" />
            {t('Kun med difference', 'Only with a difference')}
          </label>
          <span className="text-xs text-muted-foreground">{t('Klik på et dokumentnummer for at se det i SAP (kun visning).', 'Click a document number to see it in SAP (display only).')}</span>
        </div>
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen materialer matcher.', 'No materials match.')}</p> : (
          <div className="max-h-[32rem] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                  <th className="px-3 py-2">{t('Lager', 'Stock')}</th>
                  <th className="px-3 py-2 text-right">SAP</th>
                  <th className="px-3 py-2 text-right">{t('Talt', 'Counted')}</th>
                  <th className="px-3 py-2 text-right">Difference</th>
                  <th className="px-3 py-2 text-right">{t('Værdi', 'Value')}</th>
                  <th className="px-3 py-2">{t('Godkendelse', 'Approval')}</th>
                  <th className="px-3 py-2">{t('SAP-dokument', 'SAP document')}</th>
                  <th className="px-3 py-2">{t('Materialedok.', 'Mat. doc.')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={`${line.countId}|${line.material}|${line.sloc}|${line.stockType}`} className="border-t align-top hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <p className="font-mono text-xs font-medium">{line.material}</p>
                      <p className="max-w-64 truncate text-xs text-muted-foreground" title={line.description}>{line.description || line.countName}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-xs">{line.sloc}</span>{' '}
                      {line.stockType === 'blocked' ? <Badge className="bg-orange-500 text-white">Blocked</Badge> : <span className="text-xs text-muted-foreground">{stockLabel(line.stockType)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(line.sapQty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(line.counted)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-medium', line.diff < 0 && 'text-red-600 dark:text-red-400', line.diff > 0 && 'text-emerald-600 dark:text-emerald-400')}>{line.diff > 0 ? '+' : ''}{formatNumber(line.diff)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap', (line.valueDiff ?? 0) < 0 && 'text-red-600 dark:text-red-400')}>{formatMoney(line.valueDiff)}</td>
                    <td className="px-3 py-2 text-xs">{line.approval ? <>{approvalText()[line.approval.status] || line.approval.status}{line.approval.by ? <span className="block text-muted-foreground">{line.approval.by}</span> : null}</> : '–'}</td>
                    <td className="px-3 py-2">{docButton(line, 'mi03')}</td>
                    <td className="px-3 py-2">{docButton(line, 'mb03')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
