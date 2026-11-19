import { useEffect } from 'react'
import { ArrowsIn } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatDateTime, formatNumber, formatTime } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { PanelProps } from './CountView'
import { t } from '@/lib/warehouse/text'

const percentOf = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0)

function Meter({ label, part, total, unit = '', large = false }: { label: string; part: number; total: number; unit?: string; large?: boolean }) {
  const percent = percentOf(part, total)
  return (
    <div className="space-y-1.5">
      <div className={cn('flex items-baseline justify-between gap-3', large ? 'text-lg' : 'text-sm')}>
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{formatNumber(part)} / {formatNumber(total)}{unit} · <span className="font-semibold text-foreground">{percent} %</span></span>
      </div>
      <Progress value={percent} className={large ? 'h-3' : undefined} />
    </div>
  )
}

export function ProgressPanel({ state, fullscreen = false, onExitFullscreen }: PanelProps & { fullscreen?: boolean; onExitFullscreen?: () => void }) {
  const progress = state.progress
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onExitFullscreen?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, onExitFullscreen])

  const terminalGroups = (['new', 'used'] as const).flatMap(kind => (['unrestricted', 'blocked'] as const).map(stockType => ({ kind, stockType, value: progress.terminals[kind][stockType] }))).filter(item => item.value.expected > 0)
  const remaining = Math.max(progress.overall.total - progress.overall.reached, 0)

  const body = (
    <div className={cn('space-y-5', fullscreen && 'mx-auto max-w-7xl')}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('Samlet fremdrift', 'Overall progress')}</p>
              <p className={cn('font-bold tabular-nums tracking-tight', fullscreen ? 'text-8xl' : 'text-6xl')}>{progress.overall.percent} %</p>
            </div>
            <div className="space-y-1 text-right text-sm">
              <p><span className="font-semibold tabular-nums">{formatNumber(progress.overall.reached)}</span> {t(`stk. nået af ${formatNumber(progress.overall.total)} · mangler ${formatNumber(remaining)}`, `pcs reached of ${formatNumber(progress.overall.total)} · ${formatNumber(remaining)} left`)}</p>
              <p className="text-muted-foreground">{t(`Tempo: ${formatNumber(progress.pace.perHour)} stk. pr. time`, `Pace: ${formatNumber(progress.pace.perHour)} pcs per hour`)}{progress.pace.etaHours !== null ? t(` · færdig om ca. ${progress.pace.etaHours < 1 ? `${Math.max(1, Math.round(progress.pace.etaHours * 60))} min` : `${progress.pace.etaHours.toFixed(1).replace('.', ',')} timer`}`, ` · done in about ${progress.pace.etaHours < 1 ? `${Math.max(1, Math.round(progress.pace.etaHours * 60))} min` : `${progress.pace.etaHours.toFixed(1)} hours`}`) : ''}</p>
              <p className="text-xs text-muted-foreground">{t('SAP-data fra', 'SAP data from')} {formatDateTime(progress.fetchedAt)}</p>
            </div>
          </div>
          <Progress value={progress.overall.percent} className={fullscreen ? 'h-6' : 'h-4'} />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t('Terminaler (serienumre)', 'Terminals (serial numbers)')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {terminalGroups.length === 0 && <p className="text-sm text-muted-foreground">{t('Ingen terminaler i optællingen.', 'No terminals in the count.')}</p>}
            {terminalGroups.map(item => (
              <Meter key={`${item.kind}-${item.stockType}`} large={fullscreen} label={`${item.kind === 'new' ? t('Nye', 'New') : t('Brugte', 'Used')}${item.stockType === 'blocked' ? ' · blocked' : ''}`} part={item.value.found} total={item.value.expected} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t('Tilbehør', 'Accessories')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Meter large={fullscreen} label={t('Tællelinjer talt', 'Count lines counted')} part={progress.accessory.lines.counted} total={progress.accessory.lines.total} />
            <Meter large={fullscreen} label={t('Stk. talt mod SAP', 'Pieces counted against SAP')} part={progress.accessory.quantity.counted} total={progress.accessory.quantity.sap} unit={t(' stk.', ' pcs')} />
            {progress.accessory.serials.expected > 0 && <Meter large={fullscreen} label={t('Serienumre (fx simkort)', 'Serial numbers (e.g. SIM cards)')} part={progress.accessory.serials.found} total={progress.accessory.serials.expected} />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">{t('Materialer', 'Materials')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Meter label={t('Færdigtalt', 'Fully counted')} part={progress.materials.counted} total={progress.materials.total} />
            <Meter label={t('Godkendt', 'Approved')} part={progress.materials.approved} total={progress.materials.total} />
            <Meter label={t('Bogført i SAP', 'Posted in SAP')} part={progress.materials.posted} total={progress.materials.total} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t('Pr. område og storage location', 'Per area and storage location')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {progress.areas.map(area => <Meter key={area.area} label={area.area === '–' ? t('Uden område', 'No area') : t(`Område ${area.area}`, `Area ${area.area}`)} part={area.counted} total={area.total} />)}
            {progress.slocs.filter(sloc => sloc.expected > 0).map(sloc => <Meter key={sloc.sloc} label={t(`${sloc.sloc} serienumre`, `${sloc.sloc} serial numbers`)} part={sloc.found} total={sloc.expected} />)}
            {progress.areas.length === 0 && progress.slocs.every(sloc => sloc.expected === 0) && <p className="text-sm text-muted-foreground">{t('Intet at vise endnu.', 'Nothing to show yet.')}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t('Tællere', 'Counters')}</CardTitle></CardHeader>
          <CardContent>
            {progress.counters.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen har talt endnu.', 'Nobody has counted yet.')}</p> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="text-left font-normal">{t('Navn', 'Name')}</th><th className="text-right font-normal">{t('Serienr.', 'Serials')}</th><th className="text-right font-normal">{t('Linjer', 'Lines')}</th><th className="text-right font-normal">{t('Senest', 'Latest')}</th></tr></thead>
                <tbody>
                  {progress.counters.map(counter => (
                    <tr key={counter.email} className="border-t">
                      <td className="py-1.5">{counter.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatNumber(counter.serials)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatNumber(counter.lines)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatTime(counter.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )

  if (!fullscreen) return body
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background p-8">
      <div className="mx-auto mb-6 flex max-w-7xl items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{t('Optælling · Fremdrift', 'Stock count · Progress')}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{state.meta.name}</h1>
        </div>
        <Button variant="outline" onClick={onExitFullscreen}><ArrowsIn size={18} /> {t('Luk fuld skærm (Esc)', 'Close full screen (Esc)')}</Button>
      </div>
      {body}
    </div>
  )
}
