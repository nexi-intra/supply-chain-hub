import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { outcomeLabel, targetLabel } from '@/lib/softwareload'
import { currentWarehouseLanguage, t } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadCounts, SoftwareloadOutcome, SoftwareloadProgress, SoftwareloadResult } from '@/types/warehouse'

/** As the main process cleans a serial: no spaces, capitals, then the same pattern. */
export const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/
export const cleanSerial = (value: string) => value.replace(/\s+/g, '').toUpperCase()

/** Serial numbers scanned or pasted one per line (or separated by commas, semicolons or tabs), cleaned and without repeats. */
export function parseSerials(text: string): { serials: string[]; invalid: string[] } {
  const serials: string[] = []
  const invalid: string[] = []
  for (const part of text.split(/[\r\n,;\t]+/)) {
    const serial = cleanSerial(part)
    if (!serial) continue
    if (!SERIAL_PATTERN.test(serial)) invalid.push(serial)
    else if (!serials.includes(serial)) serials.push(serial)
  }
  return { serials, invalid }
}

export const label = (value: { da: string; en: string }) => (currentWarehouseLanguage() === 'da' ? value.da : value.en)

/** Outcomes that are a problem for the person: shown first and in red. */
const PROBLEMS: SoftwareloadOutcome[] = ['failed-sap', 'interrupted', 'abandoned', 'manual', 'not-found', 'blocked-stock']
export const isProblem = (outcome: SoftwareloadOutcome) => PROBLEMS.includes(outcome)

/**
 * The SAP progress of the user's own finish or KIF move; other people's events (broadcast to every window) are left out.
 * It listens while the screen is open, so the first event is never missed; `reset` clears it before a new run.
 */
export function useSoftwareloadProgress(email: string): [SoftwareloadProgress | null, () => void] {
  const [progress, setProgress] = useState<SoftwareloadProgress | null>(null)
  useEffect(() => {
    const me = email.trim().toLowerCase()
    return window.electronWarehouse!.softwareload.onProgress(event => {
      if (String(event.email || '').trim().toLowerCase() === me) setProgress(event)
    })
  }, [email])
  const reset = useCallback(() => setProgress(null), [])
  return [progress, reset]
}

export type ReportBusy = (key: string, busy: boolean) => void

/** Tells the tool that a part of it is working (a SAP run, scans being saved), so it is not left midway; cleared on unmount. */
export function useReportBusy(onBusy: ReportBusy | undefined, key: string, busy: boolean) {
  useEffect(() => { onBusy?.(key, busy) }, [onBusy, key, busy])
  useEffect(() => () => onBusy?.(key, false), [onBusy, key])
}

const stepLabel = (step: SoftwareloadProgress['step']) =>
  step === 'lookup' ? t('Slår serienumrene op i SAP', 'Looking up the serial numbers in SAP')
    : step === 'transfer' ? t('Flytter terminalerne i SAP', 'Moving the terminals in SAP')
      : t('Sætter terminaler i blocked stock', 'Putting terminals in blocked stock')

export function ProgressBlock({ progress }: { progress: SoftwareloadProgress | null }) {
  const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{progress ? stepLabel(progress.step) : t('Starter SAP', 'Starting SAP')}</span>
        {progress && <span className="tabular-nums text-muted-foreground">{t(`${progress.done} af ${progress.total}`, `${progress.done} of ${progress.total}`)}</span>}
      </div>
      <Progress value={percent} />
      <p className="text-xs text-muted-foreground">{t('Luk ikke SAP, mens appen arbejder. Det kan tage nogle minutter.', 'Do not close SAP while the app works. It can take a few minutes.')}</p>
    </div>
  )
}

export function CountBadges({ counts }: { counts: SoftwareloadCounts }) {
  const entries = Object.entries(counts).filter(([, count]) => count) as [SoftwareloadOutcome, number][]
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([outcome, count]) => (
        <Badge key={outcome} variant={isProblem(outcome) ? 'destructive' : 'secondary'}>{label(outcomeLabel(outcome))}: {count}</Badge>
      ))}
    </div>
  )
}

/** The result per serial after a move: where it went, the SAP documents and SAP's message when it refused. Problems first. */
export function ResultTable({ results, notes }: { results: Record<string, SoftwareloadResult>; notes?: Record<string, string | undefined> }) {
  const rows = useMemo(() => Object.entries(results).sort(([a, ra], [b, rb]) => Number(isProblem(rb.outcome)) - Number(isProblem(ra.outcome)) || a.localeCompare(b)), [results])
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t('Serienummer', 'Serial number')}</th>
            <th className="px-4 py-2 font-medium">{t('Materiale', 'Material')}</th>
            <th className="px-4 py-2 font-medium">{t('Fra', 'From')}</th>
            <th className="px-4 py-2 font-medium">{t('Udfald', 'Outcome')}</th>
            <th className="px-4 py-2 font-medium">{t('Dokumenter', 'Documents')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(([serial, result]) => (
            <tr key={serial} className="align-top">
              <td className="whitespace-nowrap px-4 py-2 font-mono">{serial}</td>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-muted-foreground">{result.material || '–'}</td>
              <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{result.from ? targetLabel(result.from) : '–'}</td>
              <td className="px-4 py-2">
                <span className={cn(isProblem(result.outcome) && 'font-medium text-destructive')}>{label(outcomeLabel(result.outcome))}</span>
                {result.message && <p className="text-xs text-destructive">SAP: {result.message}</p>}
                {notes?.[serial] && <p className="text-xs text-muted-foreground">{t('Note', 'Note')}: {notes[serial]}</p>}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                {result.steps.length ? result.steps.map(step => step.doc ?? t('ukendt', 'unknown')).join(', ') : '–'}
                {result.steps.some(step => step.unverified) && <p className="font-sans">{t('SAP flyttede uden at appen fik dokumentnummeret', 'SAP moved it without the app getting the document number')}</p>}
                {result.uncertain && <p className="font-sans text-destructive">{t('SAP svarede ikke. Tjek i SAP om den er flyttet', 'SAP did not answer. Check in SAP whether it was moved')}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ResultCard({ title, counts, results, notes, children }: { title: string; counts: SoftwareloadCounts; results: Record<string, SoftwareloadResult>; notes?: Record<string, string | undefined>; children?: ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="space-y-3 border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <CountBadges counts={counts} />
        {children}
      </div>
      <ResultTable results={results} notes={notes} />
    </Card>
  )
}

export function ErrorLine({ text, className }: { text: string; className?: string }) {
  return <p role="alert" className={cn('rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive', className)}>{text}</p>
}

export function WriteDisabledLine() {
  return <p className="text-sm text-muted-foreground">{t('Softwareload må endnu ikke flytte i dette SAP-system', 'Softwareload may not move anything in this SAP system yet')}</p>
}
