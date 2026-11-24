import { useEffect, useRef, useState } from 'react'
import { MagnifyingGlass, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { outcomeLabel, targetLabel, TYPE_LABELS } from '@/lib/softwareload'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime } from '@/lib/warehouse/format'
import { t } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadIndexLine, TeamId } from '@/types/warehouse'
import { DeleteDialog, ErrorLine, cleanSerial, isProblem, label } from './common'

/**
 * What "Slet" on a line deletes, for a manager of the line's team: a KIF line its move (`moveId`, given to managers
 * only), a load line the whole task. Null when the line cannot be deleted from here.
 */
function deletionOf(line: SoftwareloadIndexLine, isManager: boolean, team: TeamId) {
  if (!isManager || line.team !== team) return null
  if (line.kind === 'load') return { kind: 'task' as const, id: line.taskId }
  return line.moveId ? { kind: 'kif' as const, id: line.moveId } : null
}

/** "Søg serienummer": every load and KIF move of a serial in TCD and TRR, newest first. A manager can delete the own team's. */
export function SoftwareloadSearch({ isManager, team }: { isManager: boolean; team: TeamId }) {
  const [serial, setSerial] = useState('')
  const [searched, setSearched] = useState<string | null>(null)
  const [lines, setLines] = useState<SoftwareloadIndexLine[] | null>(null)
  const [unreadable, setUnreadable] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<SoftwareloadIndexLine | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searching = useRef(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  const search = async (value = cleanSerial(serial)) => {
    if (!value || searching.current) return
    searching.current = true
    setLoading(true)
    setFailed(null)
    try {
      const found = await window.electronWarehouse!.softwareload.search({ serial: value })
      setLines(found.lines)
      setUnreadable(found.unreadable)
      setSearched(value)
    } catch (error) {
      setFailed(errorMessage(error))
    } finally {
      searching.current = false
      setLoading(false)
      inputRef.current?.select()
    }
  }

  const remove = async (line: SoftwareloadIndexLine) => {
    const target = deletionOf(line, isManager, team)
    if (!target) return
    try {
      if (target.kind === 'task') await window.electronWarehouse!.softwareload.deleteTask({ taskId: target.id })
      else await window.electronWarehouse!.softwareload.deleteKifMove({ id: target.id })
      toast.success(target.kind === 'task' ? t('Opgaven er slettet', 'The task is deleted') : t('Flytningen er slettet', 'The move is deleted'))
      setDeleting(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
    if (searched) void search(searched)
  }

  return (
    <div className="space-y-4">
      <Card className="gap-3 px-6 py-6">
        <Label htmlFor="sl-search">{t('Serienummer', 'Serial number')}</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="sl-search" ref={inputRef} value={serial} autoComplete="off" spellCheck={false} onChange={event => setSerial(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void search() }} className="h-12 min-w-0 flex-1 font-mono text-lg" placeholder={t('Scan eller skriv et serienummer', 'Scan or type a serial number')} />
          <Button size="lg" onClick={() => void search()} loading={loading} disabled={!serial.trim()}><MagnifyingGlass size={18} /> {t('Søg', 'Search')}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('Søgningen dækker både TCD og TRR.', 'The search covers both TCD and TRR.')}</p>
      </Card>

      {failed && <ErrorLine text={failed} />}
      {lines && searched && unreadable > 0 && <ErrorLine text={t('Nogle søgedata kunne ikke læses, så der kan mangle hændelser. Prøv igen senere.', 'Some search data could not be read, so events may be missing. Try again later.')} />}
      {lines && searched && (
        lines.length === 0 ? (
          <Card className="items-center border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t(`Ingen hændelser for ${searched}.`, `No events for ${searched}.`)}</Card>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">{t(`${lines.length} hændelser for`, `${lines.length} events for`)} <span className="font-mono">{searched}</span></h2>
            {lines.map((line, index) => <IndexLineCard key={`${line.at}-${index}`} line={line} onDelete={deletionOf(line, isManager, team) ? () => setDeleting(line) : undefined} />)}
          </div>
        )
      )}

      {deleting && (
        <DeleteDialog
          title={deleting.kind === 'load' ? t('Slet hele opgaven?', 'Delete the whole task?') : t('Slet flytningen ind i KIF?', 'Delete the move into KIF?')}
          what={deleting.kind === 'load'
            ? t(
              `Hele opgaven, som ${deleting.name || deleting.email} afsluttede ${formatDateTime(deleting.at)}, slettes fra statistikken og søgningen med alle sine serienumre, ikke kun ${deleting.serial}.`,
              `The whole task that ${deleting.name || deleting.email} finished ${formatDateTime(deleting.at)} is deleted from the statistics and the search with all its serial numbers, not only ${deleting.serial}.`,
            )
            : t(
              `Flytningen ind i KIF, som ${deleting.name || deleting.email} lavede ${formatDateTime(deleting.at)}, slettes fra søgningen med alle sine serienumre.`,
              `The move into KIF that ${deleting.name || deleting.email} made ${formatDateTime(deleting.at)} is deleted from the search with all its serial numbers.`,
            )}
          onCancel={() => setDeleting(null)}
          onDelete={() => remove(deleting)}
        />
      )}
    </div>
  )
}

function IndexLineCard({ line, onDelete }: { line: SoftwareloadIndexLine; onDelete?: () => void }) {
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
        <Field term={t('Fra og til', 'From and to')} value={`${line.from ? targetLabel(line.from) : '–'} → ${line.to ? targetLabel(line.to) : '–'}`} />
        <Field term={t('Dokumenter', 'Documents')} value={`${line.docs.length ? line.docs.join(', ') : '–'}${line.unverified ? ` (${t('et trin uden dokumentnummer', 'a step without document number')})` : ''}`} mono />
        {line.kind === 'load' && line.note && <Field term={t('Note', 'Note')} value={line.note} />}
      </dl>
      {onDelete && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}><Trash size={16} /> {t('Slet', 'Delete')}</Button>
        </div>
      )}
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
