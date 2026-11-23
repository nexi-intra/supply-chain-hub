import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, MagnifyingGlass, Truck } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/warehouse/ui'
import { previewGroups, sapRunErrorMessage, targetLabel } from '@/lib/softwareload'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadKifMoveResult, SoftwareloadKifPreview, WarehouseUser } from '@/types/warehouse'
import { ErrorLine, ProgressBlock, ResultCard, parseSerials, useReportBusy, useSoftwareloadProgress, WriteDisabledLine, type ReportBusy } from './common'

const KIF = 'D005'

/** "Flyt ind i KIF": terminals to D005 ahead of loading, from scanned or pasted serials or a material document. */
export function SoftwareloadKif({ user, writeEnabled, active, onBusy }: { user: WarehouseUser; writeEnabled: boolean; active: boolean; onBusy?: ReportBusy }) {
  const [text, setText] = useState('')
  const [matdoc, setMatdoc] = useState('')
  const [preview, setPreview] = useState<SoftwareloadKifPreview | null>(null)
  const [usedDocument, setUsedDocument] = useState('')
  const [loading, setLoading] = useState(false)
  const [moving, setMoving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [result, setResult] = useState<SoftwareloadKifMoveResult | null>(null)
  const [progress, resetProgress] = useSoftwareloadProgress(user.email)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const inFlight = useRef(false)
  useReportBusy(onBusy, 'kif', loading || moving)

  useEffect(() => { if (active && !preview && !result) textRef.current?.focus() }, [active, preview, result])

  const parsed = useMemo(() => parseSerials(text), [text])
  const byDocument = matdoc.trim().length > 0
  const groups = useMemo(() => (preview ? previewGroups(preview.outcomes) : null), [preview])

  const showPreview = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setFailed(null)
    setLoading(true)
    try {
      const request = byDocument ? { document: matdoc.trim() } : { serials: parsed.serials }
      const planned = await window.electronWarehouse!.softwareload.kifPreview(request)
      setPreview(planned)
      setUsedDocument(byDocument ? planned.document ?? matdoc.trim() : '')
    } catch (error) {
      setFailed(errorMessage(error))
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  const move = async () => {
    // One SAP run at a time; a second press must not touch the state of the run in progress.
    if (!preview || inFlight.current) return
    inFlight.current = true
    setFailed(null)
    resetProgress()
    setMoving(true)
    try {
      setResult(await window.electronWarehouse!.softwareload.kifMove({ serials: preview.serials, ...(usedDocument ? { document: usedDocument } : {}) }))
      setPreview(null)
    } catch (error) {
      setFailed(sapRunErrorMessage(error))
    } finally {
      inFlight.current = false
      setMoving(false)
    }
  }

  const reset = () => {
    setText('')
    setMatdoc('')
    setPreview(null)
    setResult(null)
    setFailed(null)
    window.setTimeout(() => textRef.current?.focus(), 0)
  }

  if (result) {
    return (
      <div className="space-y-4">
        <ResultCard title={t('Flytningen til D005 er færdig', 'The move to D005 is done')} counts={result.counts} results={result.results} />
        <Button onClick={reset}><Truck size={18} /> {t('Ny flytning', 'New move')}</Button>
      </div>
    )
  }

  if (preview && groups) {
    const toMove = groups.toTarget.length
    const lines: { key: string; title: string; serials: string[]; problem?: boolean }[] = [
      { key: 'move', title: t('Flyttes til D005', 'Moved to D005'), serials: groups.toTarget },
      { key: 'skipped', title: t('Står allerede på D005', 'Already on D005'), serials: groups.skipped },
      { key: 'not-found', title: t('Ikke fundet i SAP. Flyttes ikke', 'Not found in SAP. Not moved'), serials: groups.notFound, problem: true },
      { key: 'blocked', title: t('Står i blocked stock og kan ikke flyttes', 'In blocked stock and cannot be moved'), serials: groups.blockedStock, problem: true },
    ]
    return (
      <Card className="gap-4 px-6 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setPreview(null)} disabled={moving}><ArrowLeft size={18} /> {t('Tilbage', 'Back')}</Button>
          <h2 className="text-lg font-semibold">{t(`Oversigt over ${preview.serials.length} serienumre`, `Overview of ${preview.serials.length} serial numbers`)}</h2>
          {usedDocument && <Badge variant="outline" className="font-mono">{usedDocument}</Badge>}
        </div>
        {lines.filter(line => line.serials.length).map(line => (
          <details key={line.key} className="rounded-lg border px-4 py-3" open={line.problem}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
              <span className={cn(line.problem && 'text-destructive')}>{line.title}</span>
              <Badge variant={line.problem ? 'destructive' : 'secondary'}>{line.serials.length}</Badge>
            </summary>
            <ul className="mt-2 grid gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-3">{line.serials.map(serial => <li key={serial}>{serial}</li>)}</ul>
          </details>
        ))}
        {preview.transfers.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {preview.transfers.map(item => <li key={`${item.wave}-${item.from}-${item.to}`} className="rounded border px-2 py-0.5">{targetLabel(item.from)} → {targetLabel(item.to)} ({item.serials.length})</li>)}
          </ul>
        )}
        {failed && <ErrorLine text={failed} />}
        {moving && <ProgressBlock progress={progress} />}
        {!moving && (
          <div className="space-y-2">
            <Button size="lg" onClick={move} disabled={!writeEnabled || toMove === 0}><ArrowRight size={20} /> {t(`Flyt til ${KIF}`, `Move to ${KIF}`)}</Button>
            {!writeEnabled && <WriteDisabledLine />}
            {writeEnabled && toMove === 0 && <p className="text-sm text-muted-foreground">{t('Ingen af terminalerne skal flyttes.', 'None of the terminals need to be moved.')}</p>}
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card className="gap-5 px-6 py-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('Flyt ind i KIF', 'Move into KIF')}</h2>
        <p className="text-sm text-muted-foreground">{t('Flyt terminaler til D005, før de skal loades. Appen slår dem op i SAP og viser en oversigt, før noget flyttes.', 'Move terminals to D005 before they are loaded. The app looks them up in SAP and shows an overview before anything is moved.')}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="space-y-2">
          <Label htmlFor="sl-kif-serials">{t('Scan eller indsæt serienumre, ét pr. linje', 'Scan or paste serial numbers, one per line')}</Label>
          <Textarea id="sl-kif-serials" ref={textRef} value={text} onChange={event => setText(event.target.value)} disabled={byDocument} spellCheck={false} className="min-h-48 font-mono" />
          <p className="text-xs text-muted-foreground">
            {t(`${parsed.serials.length} serienumre`, `${parsed.serials.length} serial numbers`)}
            {parsed.invalid.length > 0 && <span className="text-destructive"> · {t(`${parsed.invalid.length} ugyldige springes over: ${parsed.invalid.slice(0, 3).join(', ')}`, `${parsed.invalid.length} invalid are skipped: ${parsed.invalid.slice(0, 3).join(', ')}`)}</span>}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sl-kif-doc">{t('Eller et materialedokument', 'Or a material document')}</Label>
          <Input id="sl-kif-doc" value={matdoc} onChange={event => setMatdoc(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && byDocument) void showPreview() }} placeholder={t('4905204948 eller 4905204948 2026', '4905204948 or 4905204948 2026')} className="font-mono" autoComplete="off" />
          <p className="text-xs text-muted-foreground">{t('Dokumentnummer, året er valgfrit. Uden år prøves i år og sidste år. Så bruges dokumentets serienumre i stedet for listen.', 'Document number, the year is optional. Without a year, this year and last year are tried. Then the serial numbers of the document are used instead of the list.')}</p>
        </div>
      </div>
      {failed && <ErrorLine text={failed} />}
      <div>
        <Button onClick={showPreview} loading={loading} disabled={!byDocument && parsed.serials.length === 0}><MagnifyingGlass size={18} /> {t('Vis oversigt', 'Show overview')}</Button>
      </div>
    </Card>
  )
}
