import { useEffect, useRef, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { outcomeLabel, TYPE_LABELS } from '@/lib/softwareload'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime } from '@/lib/warehouse/format'
import { t } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadIndexLine } from '@/types/warehouse'
import { ErrorLine, cleanSerial, isProblem, label } from './common'

/** "Søg serienummer": every load and KIF move of a serial in TCD and TRR, newest first. */
export function SoftwareloadSearch() {
  const [serial, setSerial] = useState('')
  const [searched, setSearched] = useState<string | null>(null)
  const [lines, setLines] = useState<SoftwareloadIndexLine[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const search = async () => {
    const value = cleanSerial(serial)
    if (!value) return
    setLoading(true)
    setFailed(null)
    try {
      setLines(await window.electronWarehouse!.softwareload.search({ serial: value }))
      setSearched(value)
    } catch (error) {
      setFailed(errorMessage(error))
    } finally {
      setLoading(false)
      inputRef.current?.select()
    }
  }

  return (
    <div className="space-y-4">
      <Card className="gap-3 px-6 py-6">
        <Label htmlFor="sl-search">{t('Serienummer', 'Serial number')}</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="sl-search" ref={inputRef} value={serial} autoComplete="off" spellCheck={false} onChange={event => setSerial(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void search() }} className="h-12 min-w-0 flex-1 font-mono text-lg" placeholder={t('Scan eller skriv et serienummer', 'Scan or type a serial number')} />
          <Button size="lg" onClick={search} loading={loading} disabled={!serial.trim()}><MagnifyingGlass size={18} /> {t('Søg', 'Search')}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('Søgningen dækker både TCD og TRR.', 'The search covers both TCD and TRR.')}</p>
      </Card>

      {failed && <ErrorLine text={failed} />}
      {lines && searched && (
        lines.length === 0 ? (
          <Card className="items-center border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t(`Ingen hændelser for ${searched}.`, `No events for ${searched}.`)}</Card>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">{t(`${lines.length} hændelser for`, `${lines.length} events for`)} <span className="font-mono">{searched}</span></h2>
            {lines.map((line, index) => <IndexLineCard key={`${line.at}-${index}`} line={line} />)}
          </div>
        )
      )}
    </div>
  )
}

function IndexLineCard({ line }: { line: SoftwareloadIndexLine }) {
  return (
    <Card className="gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-mono">{line.team}</Badge>
        <span className="font-semibold">{line.kind === 'load' ? label(TYPE_LABELS[line.type]) : t('Flyttet ind i KIF', 'Moved into KIF')}</span>
        {line.kind === 'load' && <Badge variant="outline">{line.kif ? t('I KIF', 'In KIF') : t('Uden for KIF', 'Outside KIF')}</Badge>}
        <span className={cn('ml-auto text-sm', isProblem(line.outcome) ? 'font-medium text-destructive' : 'text-muted-foreground')}>{label(outcomeLabel(line.outcome))}</span>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Field term={t('Hvem', 'Who')} value={line.name || line.email} />
        <Field term={t('Hvornår', 'When')} value={formatDateTime(line.at)} />
        {line.kind === 'load' && <Field term={t('Software', 'Software')} value={line.version} />}
        <Field term={t('Fra og til', 'From and to')} value={`${line.from || '–'} → ${line.to || '–'}`} mono />
        <Field term={t('Dokumenter', 'Documents')} value={line.docs.length ? line.docs.join(', ') : '–'} mono />
        {line.kind === 'load' && line.note && <Field term={t('Note', 'Note')} value={line.note} />}
      </dl>
    </Card>
  )
}

function Field({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className={cn('break-words', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}
