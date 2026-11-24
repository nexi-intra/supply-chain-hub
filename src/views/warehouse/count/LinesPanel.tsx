import { useMemo, useRef, useState } from 'react'
import { FloppyDisk, LockKey, PaperPlaneTilt, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/warehouse/ui'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber, formatTime, scopeStockTypes, stockLabel } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { CountLine, CountListLine, StockType } from '@/types/warehouse'
import type { PanelProps } from './CountView'
import { isApproved, isSubmitted, lockOf, mayCount, MaterialsInProgress, RequestButton, SubmitDialog, type SubmitRetry } from './MaterialWork'
import { takeLock, withLine, withoutLine } from './optimisticState'
import { addLineTarget, existingTotal, findExistingLines, materialRowSave, mayReplace, placeKey, type ExistingChoice } from './existingLine'
import { t } from '@/lib/warehouse/text'

type Filter = 'all' | 'missing' | 'uncounted' | 'over'

interface MaterialGroup {
  key: string
  material: string
  description: string
  stockType: StockType
  sapQty: number
  counted: number
  suggestions: CountListLine[]
  lines: CountLine[]
}

export function LinesPanel({ id, open, state, reloadOpen, optimistic, person }: PanelProps) {
  const [area, setArea] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const canWrite = state.me.canWrite
  const types = scopeStockTypes(state.meta.scope)
  const descriptions = useMemo(() => new Map(open.materials.map(item => [item.material, item.description])), [open.materials])
  const serialMaterials = useMemo(() => new Set(state.rows.filter(row => row.serialManaged).map(row => row.material)), [state.rows])
  /** What a quantity line on a serial-managed material must say: approved with it (the frozen figures hold it), approved, or not yet. */
  const serialNoteOf = (material: string) => {
    if (!serialMaterials.has(material)) return null
    if (isApproved(state, material) && state.approvedWithSerialLines?.includes(material)) {
      return state.approvals[material]?.status === 'posted'
        ? t('Godkendt med tællelinjer med antal. Tjek det bogførte antal i SAP.', 'Approved with count lines with a quantity. Check the posted quantity in SAP.')
        : t('Godkendt med tællelinjer med antal. Nulstil materialet, slet linjen og godkend igen.', 'Approved with count lines with a quantity. Reset the material, delete the line and approve again.')
    }
    if (isApproved(state, material)) return t('Materialet har serienumre. Slet linjen.', 'The material has serial numbers. Delete the line.')
    return t('Materialet har serienumre. Slet linjen, før materialet kan godkendes.', 'The material has serial numbers. Delete the line before the material can be approved.')
  }
  const groups = useMemo(() => {
    const suggestions = new Map<string, CountListLine[]>()
    for (const line of open.countLists) suggestions.set(line.material, [...(suggestions.get(line.material) || []), line])
    const byKey = new Map<string, MaterialGroup>()
    const groupOf = (material: string, stockType: StockType, description: string) => {
      const key = `${material}|${stockType}`
      let group = byKey.get(key)
      if (!group) {
        group = { key, material, description, stockType, sapQty: 0, counted: 0, suggestions: suggestions.get(material) || [], lines: [] }
        byKey.set(key, group)
      }
      return group
    }
    for (const row of state.rows) {
      if (row.serialManaged) continue
      const group = groupOf(row.material, row.stockType, row.description)
      group.sapQty += row.sapQty
      group.counted += row.counted
    }
    // A quantity line on a serial-managed material is never counted here (LINE_SERIAL_MANAGED); it is only deleted under Talte linjer.
    for (const line of state.lines) if (!serialMaterials.has(line.material)) groupOf(line.material, line.stockType, descriptions.get(line.material) || '').lines.push(line)
    return [...byKey.values()].filter(group => !isApproved(state, group.material)).sort((a, b) => a.material.localeCompare(b.material) || a.stockType.localeCompare(b.stockType))
  }, [state, open.countLists, descriptions, serialMaterials])

  const needle = query.trim().toUpperCase()
  const visible = groups.filter(group => {
    if (area && !group.suggestions.some(line => line.area === area) && !group.lines.some(line => line.area === area)) return false
    if (needle && !group.material.includes(needle) && !group.description.toUpperCase().includes(needle) && !group.suggestions.some(line => line.place.toUpperCase().includes(needle))) return false
    if (filter === 'missing' && group.counted >= group.sapQty) return false
    if (filter === 'uncounted' && group.lines.length > 0) return false
    if (filter === 'over' && group.counted <= group.sapQty) return false
    return true
  })
  const areas = [...new Set(open.countLists.map(line => line.area))].filter(Boolean).sort()
  const totals = groups.reduce((sum, group) => ({ sap: sum.sap + group.sapQty, counted: sum.counted + group.counted, missing: sum.missing + Math.max(group.sapQty - group.counted, 0), matching: sum.matching + (group.lines.length > 0 && group.counted === group.sapQty ? 1 : 0) }), { sap: 0, counted: 0, missing: 0, matching: 0 })

  return (
    <div className="space-y-5">
      {canWrite && state.materialLocks.length > 0 && <MaterialsInProgress id={id} state={state} optimistic={optimistic} person={person} isOwner={state.me.isOwner} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(`Tællelister pr. materiale (${formatNumber(totals.matching)} af ${formatNumber(groups.length)} stemmer)`, `Count lists per material (${formatNumber(totals.matching)} of ${formatNumber(groups.length)} match)`)}</CardTitle>
          <CardDescription>
            {t('Hvert materiale står én gang med samlet SAP-antal.', 'Each material is listed once with the total SAP quantity.')} {open.meta.team === 'TCD' ? t('Placeringerne fra det nyeste placeringsark er kun forslag til, hvor materialet ligger – klik på en placering for at tælle der, eller vælg "Anden placering".', 'The locations from the newest placement sheet are only suggestions for where the material is – click a location to count there, or choose "Other location".') : t('Klik på en placering for at tælle der, eller vælg "Anden placering".', 'Click a location to count there, or choose "Other location".')} {t('Når du tæller et materiale, låses det til dig; godkendte materialer forsvinder fra listen.', 'When you count a material it is locked to you; approved materials disappear from the list.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Total label={t('SAP i alt', 'SAP in total')} value={totals.sap} />
            <Total label={t('Fundet', 'Found')} value={totals.counted} />
            <Total label={t('Mangler', 'Missing')} value={totals.missing} tone={totals.missing > 0 ? 'warn' : 'ok'} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {areas.length > 0 && (
              <NativeSelect value={area} onChange={event => setArea(event.target.value)} aria-label={t('Område', 'Area')}>
                <option value="">{t('Alle områder', 'All areas')}</option>
                {areas.map(item => <option key={item} value={item}>{t('Område', 'Area')} {item}</option>)}
              </NativeSelect>
            )}
            <NativeSelect value={filter} onChange={event => setFilter(event.target.value as Filter)} aria-label={t('Vis', 'Show')}>
              <option value="all">{t('Alle materialer', 'All materials')}</option>
              <option value="missing">{t('Mangler', 'Missing')}</option>
              <option value="uncounted">{t('Ikke talt', 'Not counted')}</option>
              <option value="over">{t('For mange', 'Too many')}</option>
            </NativeSelect>
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Søg materiale, tekst eller placering', 'Search material, text or location')} className="max-w-xs" />
          </div>
          <div className="rounded-lg border">
            <div className="hidden grid-cols-[minmax(200px,1.3fr)_80px_80px_110px_minmax(330px,1.7fr)] gap-3 bg-muted/50 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground lg:grid">
              <span>{t('Materiale', 'Material')}</span><span className="text-right">SAP</span><span className="text-right">{t('Fundet', 'Found')}</span><span className="text-right">{t('Mangler', 'Missing')}</span><span>{canWrite ? t('Tæl', 'Count') : ''}</span>
            </div>
            {visible.slice(0, 300).map(group => <MaterialRow key={group.key} id={id} open={open} state={state} group={group} showType={types.length > 1 || group.stockType === 'blocked'} canWrite={canWrite} reloadOpen={reloadOpen} optimistic={optimistic} person={person} />)}
            {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{groups.length ? t('Ingen materialer matcher.', 'No materials match.') : t('Ingen materialer, der tælles som antal.', 'No materials counted by quantity.')}</p>}
          </div>
          {visible.length > 300 && <p className="text-xs text-muted-foreground">{t(`Viser 300 af ${formatNumber(visible.length)} – brug område eller søgning.`, `Showing 300 of ${formatNumber(visible.length)} – use area or search.`)}</p>}
        </CardContent>
      </Card>

      {canWrite && <AddLine id={id} open={open} state={state} types={types} reloadOpen={reloadOpen} optimistic={optimistic} person={person} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('Talte linjer', 'Counted lines')} ({formatNumber(state.lines.length)})</CardTitle>
          <CardDescription>{t('Alle tællelinjer pr. placering – ret eller slet her.', 'All count lines per location – edit or delete here.')}</CardDescription>
        </CardHeader>
        <CardContent>
          {state.lines.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen endnu.', 'None yet.')}</p> : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('Placering', 'Location')}</th>
                    <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                    <th className="px-3 py-2">Sloc</th>
                    <th className="px-3 py-2">{t('Lagertype', 'Stock type')}</th>
                    <th className="px-3 py-2 text-right">{t('Antal', 'Quantity')}</th>
                    <th className="px-3 py-2">{t('Talt af', 'Counted by')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {state.lines.map(line => <OwnRow key={line.lineId} id={id} line={line} description={descriptions.get(line.material) || ''} serialNote={serialNoteOf(line.material)} canWrite={canWrite} optimistic={optimistic} person={person} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StockTypeOptions({ types }: { types: StockType[] }) {
  return <>{types.map(type => <option key={type} value={type}>{stockLabel(type)}</option>)}</>
}

function Total({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-semibold tabular-nums', tone === 'warn' && 'text-amber-600 dark:text-amber-400', tone === 'ok' && 'text-emerald-600 dark:text-emerald-400')}>{formatNumber(value)}</div>
    </div>
  )
}

const OTHER = '__other__'

const newLineId = () => `ln-${crypto.randomUUID()}`

/** A new own location is saved in the background; the line does not wait for it (it carries the area itself). */
function saveOwnPlace(name: string, area: string, reloadOpen: () => Promise<void>) {
  trackPendingWrite(window.electronWarehouse!.placements.save({ name, area }))
    .then(() => reloadOpen())
    .catch(error => toast.error(t(`Placeringen ${name} kunne ikke gemmes`, `The location ${name} could not be saved`), { description: errorMessage(error) }))
}

interface PlaceOption { place: string; area: string; sloc?: string; lineId?: string; sheetQty: number | null }

/** A quantity typed for a place that already has lines: saved once the counter has chosen to replace or add. */
interface ExistingAsk { lines: CountLine[]; value: number; save: (choice: ExistingChoice) => void }

function ExistingLineDialog({ ask, onClose }: { ask: ExistingAsk; onClose: () => void }) {
  const m = formatNumber(ask.value)
  const place = ask.lines[ask.lines.length - 1].place
  const material = ask.lines[0].material
  const n = formatNumber(existingTotal(ask.lines))
  const several = !mayReplace(ask.lines)
  const choose = (choice: ExistingChoice) => {
    onClose()
    ask.save(choice)
  }
  return (
    <Dialog open onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${material} er allerede talt på ${place}`, `${material} is already counted in ${place}`)}</DialogTitle>
          <DialogDescription>{t(`Der er allerede talt ${n} på ${place}. Erstat med ${m} eller læg ${m} til?`, `${n} have already been counted in ${place}. Replace with ${m} or add ${m}?`)}</DialogDescription>
        </DialogHeader>
        {several && <p className="text-sm text-muted-foreground">{t(`Der er flere tællelinjer på ${place}. Ret dem enkeltvis under Talte linjer.`, `There are several count lines in ${place}. Edit them one by one under Counted lines.`)}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          {!several && <Button variant="outline" onClick={() => choose('replace')}>{t(`Erstat med ${m}`, `Replace with ${m}`)}</Button>}
          <Button onClick={() => choose('add')}>{t(`Læg ${m} til`, `Add ${m}`)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type RowProps = Pick<PanelProps, 'id' | 'open' | 'state' | 'reloadOpen' | 'optimistic' | 'person'>

function MaterialRow({ id, open, state, group, showType, canWrite, reloadOpen, optimistic, person }: RowProps & { group: MaterialGroup; showType: boolean; canWrite: boolean }) {
  const lock = lockOf(state, group.material)
  const taken = !mayCount(lock, state.me.email)
  const [submitting, setSubmitting] = useState<{ retry?: SubmitRetry } | null>(null)
  const [asking, setAsking] = useState<ExistingAsk | null>(null)
  const countedAt = new Map(group.lines.map(line => [placeKey(line.place), line]))
  const options: PlaceOption[] = [
    ...group.suggestions.map(line => ({ place: line.place, area: line.area, sloc: line.sloc, lineId: line.lineId, sheetQty: line.sheetQty })),
    ...group.lines.filter(line => !group.suggestions.some(item => placeKey(item.place) === placeKey(line.place))).map(line => ({ place: line.place, area: line.area, sloc: line.sloc, sheetQty: null })),
  ]
  const firstOpen = options.find(option => !countedAt.has(placeKey(option.place)))
  const [choice, setChoice] = useState(firstOpen?.place ?? options[0]?.place ?? OTHER)
  const [otherPlace, setOtherPlace] = useState('')
  const [qty, setQty] = useState('')
  const qtyRef = useRef<HTMLInputElement>(null)
  const missing = group.sapQty - group.counted

  const pick = (place: string) => {
    setChoice(place)
    const existing = countedAt.get(placeKey(place))
    setQty(existing ? String(existing.qty) : '')
    qtyRef.current?.focus()
  }

  const save = () => {
    const place = (choice === OTHER ? otherPlace : choice).trim()
    const value = Number(qty)
    if (!place) { toast.error(t('Vælg eller skriv en placering', 'Choose or type a location')); return }
    if (qty.trim() === '' || !Number.isInteger(value) || value < 0) { toast.error(t('Skriv et helt antal (0 eller mere)', 'Type a whole number (0 or more)')); return }
    // A place picked in the list shows its counted quantity in the field; a typed one does not, so the counter chooses.
    const existing = findExistingLines(group.lines, { place, material: group.material, stockType: group.stockType })
    if (choice === OTHER && existing.length > 0) { setAsking({ lines: existing, value, save: answer => commit(place, value, answer) }); return }
    commit(place, value, null)
  }

  // The line and the counted quantity show at once (the material is taken for you); the save runs in the background.
  // Without an answer (a place picked in the list) the shown line gets the typed quantity.
  const commit = (typed: string, value: number, answer: ExistingChoice | null) => {
    const key = placeKey(typed)
    const option = options.find(item => placeKey(item.place) === key)
    const existing = countedAt.get(key)
    const known = open.places.find(item => placeKey(item.name) === key)
    const place = existing?.place ?? typed
    const lineId = existing?.lineId ?? option?.lineId ?? newLineId()
    const area = option?.area || existing?.area || known?.area || ''
    const atPlace = findExistingLines(group.lines, { place: typed, material: group.material, stockType: group.stockType })
    const total = answer && atPlace.length > 0 ? materialRowSave(atPlace, value, answer).qty : value
    const comment = existing?.comment ?? ''
    if (!option && !known) saveOwnPlace(place, '', reloadOpen)
    const line: CountLine = { lineId, place, area, material: group.material, sloc: option?.sloc || existing?.sloc || '', stockType: group.stockType, qty: total, status: 'counted', comment, by: person.email, byName: person.name, at: Date.now() }
    toast.success(t(`Gemt: ${formatNumber(total)} × ${group.material} på ${place}`, `Saved: ${formatNumber(total)} × ${group.material} in ${place}`))
    setQty('')
    setOtherPlace('')
    const next = options.find(item => placeKey(item.place) !== key && !countedAt.has(placeKey(item.place)))
    setChoice(next?.place ?? place)
    void optimistic(
      current => takeLock(group.material, person)(withLine(line)(current)),
      () => window.electronWarehouse!.counts.saveLine({ id, line: { lineId, place, area, material: group.material, sloc: option?.sloc || existing?.sloc, stockType: group.stockType, qty: total, comment } }),
      { onError: () => { setQty(current => current || String(value)); return false } },
    )
  }

  return (
    <div className={cn('grid gap-3 border-t px-3 py-3 first:border-t-0 lg:grid-cols-[minmax(200px,1.3fr)_80px_80px_110px_minmax(330px,1.7fr)] lg:items-start', group.lines.length > 0 && missing === 0 && 'bg-emerald-500/5')}>
      <div className="min-w-0">
        <div className="flex items-center gap-2"><span className="font-mono font-medium">{group.material}</span>{showType && <Badge variant="outline">{stockLabel(group.stockType)}</Badge>}{isSubmitted(state, group.material) && <Badge variant="secondary">{t('Sendt til godkendelse', 'Sent for approval')}</Badge>}</div>
        <div className="truncate text-xs text-muted-foreground">{group.description}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.length === 0 && <span className="text-xs text-muted-foreground">{t('Ingen placering i arket.', 'No location in the sheet.')}</span>}
          {options.map(option => {
            const counted = countedAt.get(placeKey(option.place))
            return (
              <button
                key={option.place}
                type="button"
                disabled={!canWrite || taken}
                onClick={() => pick(option.place)}
                className={cn('rounded-md border px-2 py-0.5 text-xs transition-colors enabled:hover:bg-muted', counted ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground', choice === option.place && 'ring-2 ring-primary/50')}
                title={option.sheetQty === null ? t('Egen placering', 'Own location') : t(`Placeringsarket: ${formatNumber(option.sheetQty)} stk.`, `Placement sheet: ${formatNumber(option.sheetQty)} pcs`)}
              >
                <span className="font-mono">{option.place}</span>
                {option.sheetQty !== null && <span> · {t('ark', 'sheet')} {formatNumber(option.sheetQty)}</span>}
                {counted && <span className="font-medium"> · {t('talt', 'counted')} {formatNumber(counted.qty)}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div className="text-right tabular-nums"><span className="text-xs text-muted-foreground lg:hidden">SAP </span>{formatNumber(group.sapQty)}</div>
      <div className="text-right font-medium tabular-nums"><span className="text-xs font-normal text-muted-foreground lg:hidden">{t('Fundet', 'Found')} </span>{formatNumber(group.counted)}</div>
      <div className="text-right">
        {group.lines.length === 0 && group.counted === 0 ? <Badge variant="outline">{t('Ikke talt', 'Not counted')}</Badge>
          : missing > 0 ? <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{formatNumber(missing)}</span>
          : missing < 0 ? <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">+{formatNumber(-missing)} {t('for mange', 'too many')}</span>
          : <Badge className="bg-emerald-600 text-white">{t('Stemmer', 'Matches')}</Badge>}
      </div>
      {canWrite && taken ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground"><LockKey size={16} /> {t(`Tælles af ${lock!.holder.name}`, `Counted by ${lock!.holder.name}`)}</span>
          <RequestButton id={id} material={group.material} state={state} optimistic={optimistic} person={person} />
        </div>
      ) : canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect value={choice} onChange={event => pick(event.target.value)} className="h-9 max-w-44" aria-label={t(`Placering for ${group.material}`, `Location for ${group.material}`)}>
            {options.map(option => <option key={option.place} value={option.place}>{option.place}{countedAt.has(placeKey(option.place)) ? ' ✓' : ''}</option>)}
            <option value={OTHER}>{t('Anden placering …', 'Other location …')}</option>
          </NativeSelect>
          {choice === OTHER && <Input value={otherPlace} list="line-places" maxLength={60} onChange={event => setOtherPlace(event.target.value)} placeholder={t('Placering', 'Location')} className="h-9 w-40" aria-label={t(`Anden placering for ${group.material}`, `Other location for ${group.material}`)} />}
          <Input ref={qtyRef} value={qty} inputMode="numeric" onChange={event => setQty(event.target.value.replace(/[^\d]/g, ''))} onKeyDown={event => { if (event.key === 'Enter') void save() }} className="h-9 w-24 text-right tabular-nums" placeholder={t('Antal', 'Quantity')} aria-label={t(`Antal for ${group.material}`, `Quantity for ${group.material}`)} />
          <Button size="sm" className="h-9" onClick={() => save()} aria-label={t(`Gem antal for ${group.material}`, `Save quantity for ${group.material}`)}><FloppyDisk size={16} /> {t('Gem', 'Save')}</Button>
          {group.lines.length > 0 && !isSubmitted(state, group.material) && <Button size="sm" variant="outline" className="h-9" onClick={() => setSubmitting({})} aria-label={t(`Send ${group.material} til godkendelse`, `Send ${group.material} for approval`)}><PaperPlaneTilt size={16} /> {t('Send til godkendelse', 'Send for approval')}</Button>}
        </div>
      ) : <div />}
      {submitting && <SubmitDialog key={submitting.retry?.serverDiff ?? 'new'} id={id} material={group.material} state={state} optimistic={optimistic} person={person} retry={submitting.retry} onClose={() => setSubmitting(null)} onServerDiff={retry => setSubmitting({ retry })} />}
      {asking && <ExistingLineDialog ask={asking} onClose={() => setAsking(null)} />}
    </div>
  )
}

function OwnRow({ id, line, description, serialNote, canWrite, optimistic, person }: Pick<PanelProps, 'id' | 'optimistic' | 'person'> & { line: CountLine; description: string; serialNote: string | null; canWrite: boolean }) {
  // Shown at once; saved in the background and taken back if the drive refuses it.
  const edit = () => {
    const answer = window.prompt(t(`Nyt antal for ${line.material} på ${line.place}:`, `New quantity for ${line.material} in ${line.place}:`), String(line.qty))
    if (answer === null) return
    const qty = Number(answer)
    if (!Number.isInteger(qty) || qty < 0) { toast.error(t('Skriv et helt antal', 'Type a whole number')); return }
    void optimistic(
      current => takeLock(line.material, person)(withLine({ ...line, qty, by: person.email, byName: person.name, at: Date.now() })(current)),
      () => window.electronWarehouse!.counts.saveLine({ id, line: { lineId: line.lineId, place: line.place, area: line.area, material: line.material, sloc: line.sloc, stockType: line.stockType, qty, status: line.status, comment: line.comment } }),
    )
  }
  const remove = () => {
    if (!window.confirm(t(`Slet linjen ${line.material} på ${line.place}?`, `Delete the line ${line.material} in ${line.place}?`))) return
    void optimistic(withoutLine(line.lineId), () => window.electronWarehouse!.counts.deleteLine({ id, lineId: line.lineId }))
  }
  return (
    <tr className="border-t">
      <td className="px-3 py-2">{line.place} <span className="text-xs text-muted-foreground">{line.area}</span></td>
      <td className="px-3 py-2"><div className="font-mono">{line.material}</div>{description && <div className="text-xs text-muted-foreground">{description}</div>}{serialNote && <div className="text-xs font-medium text-destructive">{serialNote}</div>}</td>
      <td className="px-3 py-2 font-mono">{line.sloc}</td>
      <td className="px-3 py-2">{stockLabel(line.stockType)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(line.qty)}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{line.byName} {formatTime(line.at)}</td>
      <td className="px-3 py-2 text-right">
        {canWrite && (
          <div className="flex justify-end gap-1">
            {!serialNote && <Button size="sm" variant="ghost" onClick={() => edit()} aria-label={t('Ret antal', 'Edit quantity')}><PencilSimple size={16} /></Button>}
            <Button size="sm" variant="ghost" onClick={() => remove()} aria-label={t('Slet linje', 'Delete line')}><Trash size={16} /></Button>
          </div>
        )}
      </td>
    </tr>
  )
}

function AddLine({ id, open, state, types, reloadOpen, optimistic, person }: Pick<PanelProps, 'id' | 'open' | 'state' | 'reloadOpen' | 'optimistic' | 'person'> & { types: StockType[] }) {
  const [place, setPlace] = useState('')
  const [newArea, setNewArea] = useState('')
  const [material, setMaterial] = useState('')
  const [stockType, setStockType] = useState<StockType>(types[0])
  const [qty, setQty] = useState('')
  const [comment, setComment] = useState('')
  const [asking, setAsking] = useState<ExistingAsk | null>(null)
  const materials = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of open.materials) if (!seen.has(item.material)) seen.set(item.material, item.description)
    return [...seen]
  }, [open.materials])
  const known = open.places.find(item => placeKey(item.name) === placeKey(place))
  const materialInfo = open.materials.filter(item => item.material === material.trim().toUpperCase())
  const serialManaged = materialInfo.some(item => item.serialManaged)
  const serialText = t('Materialet har serienumre. Scan eller importér dem, eller brug Fjern serienummer.', 'The material has serial numbers. Scan or import them, or use Remove serial number.')

  const save = () => {
    // The count document of a serial-managed material only knows its serials, so a quantity line is never saved.
    if (serialManaged) { toast.error(serialText); return }
    const value = Number(qty)
    if (!place.trim() || !material.trim() || qty.trim() === '' || !Number.isInteger(value) || value < 0) { toast.error(t('Udfyld placering, materiale og et helt antal', 'Fill in location, material and a whole number')); return }
    // Same place, material and stock type as a counted line: the counter chooses to replace it or add a line of their own.
    const existing = findExistingLines(state.lines, { place, material: material.trim().toUpperCase(), stockType })
    if (existing.length > 0) { setAsking({ lines: existing, value, save: answer => commit(value, addLineTarget(existing, answer)) }); return }
    commit(value, null)
  }

  // The line shows at once (the material is taken for you); the save runs in the background. A new location is saved
  // alongside it, not before it.
  const commit = (value: number, replaced: CountLine | null) => {
    const code = material.trim().toUpperCase()
    const area = replaced?.area || known?.area || newArea
    const lineId = replaced?.lineId ?? newLineId()
    const linePlace = replaced?.place ?? place
    const lineComment = comment.trim() || replaced?.comment || ''
    if (!known && !replaced) saveOwnPlace(place, newArea, reloadOpen)
    const sloc = replaced?.sloc || state.rows.find(row => row.material === code && row.stockType === stockType)?.sloc || ''
    const line: CountLine = { lineId, place: linePlace.trim(), area, material: code, sloc, stockType, qty: value, status: 'counted', comment: lineComment, by: person.email, byName: person.name, at: Date.now() }
    const typed = { material, qty, comment }
    toast.success(t(`Gemt: ${formatNumber(value)} × ${code} på ${linePlace}`, `Saved: ${formatNumber(value)} × ${code} in ${linePlace}`))
    setMaterial('')
    setQty('')
    setComment('')
    void optimistic(
      current => takeLock(code, person)(withLine(line)(current)),
      () => window.electronWarehouse!.counts.saveLine({ id, line: { lineId, place: linePlace, area, material, sloc: replaced?.sloc, stockType, qty: value, comment: lineComment } }),
      {
        onError: () => {
          setMaterial(current => current || typed.material)
          setQty(current => current || typed.qty)
          setComment(current => current || typed.comment)
          return false
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Tilføj tællelinje', 'Add count line')}</CardTitle>
        <CardDescription>{t('Tilbehør tælles som antal pr. placering. Materialenummeret tastes (forslag fra SAP-listen).', 'Accessories are counted as a quantity per location. Type the material number (suggestions from the SAP list).')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-[1.2fr_1.2fr_0.8fr_0.6fr]">
          <div className="space-y-1.5">
            <Label htmlFor="line-place">{t('Placering', 'Location')}</Label>
            <Input id="line-place" list="line-places" value={place} maxLength={60} onChange={event => setPlace(event.target.value)} placeholder={t('A1.1 eller Arbejdsstation 4', 'A1.1 or Workstation 4')} />
            <datalist id="line-places">{open.places.map(item => <option key={item.name} value={item.name}>{item.area}</option>)}</datalist>
            {place.trim() && !known && (
              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span>{t('Ny placering – område (valgfrit):', 'New location – area (optional):')}</span>
                <Input value={newArea} maxLength={12} onChange={event => setNewArea(event.target.value.toUpperCase())} className="h-8 w-20" aria-label={t('Område for ny placering', 'Area for new location')} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="line-material">{t('Materiale', 'Material')}</Label>
            <Input id="line-material" list="line-materials" value={material} onChange={event => setMaterial(event.target.value.toUpperCase())} className="font-mono" placeholder="R162-0717" />
            <datalist id="line-materials">{materials.map(([code, description]) => <option key={code} value={code}>{description}</option>)}</datalist>
            {serialManaged && <p role="alert" className="text-xs font-medium text-destructive">{serialText}</p>}
            {material.trim() && materialInfo.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{t('SAP har ikke materialet i optællingen – det kommer med som ekstra.', 'SAP does not have the material in the count – it is included as extra.')}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="line-stock">{t('Lagertype', 'Stock type')}</Label>
            <NativeSelect id="line-stock" value={stockType} onChange={event => setStockType(event.target.value as StockType)} className="w-full" disabled={types.length === 1}>
              <StockTypeOptions types={types} />
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="line-qty">{t('Antal', 'Quantity')}</Label>
            <Input id="line-qty" value={qty} inputMode="numeric" onChange={event => setQty(event.target.value.replace(/[^\d]/g, ''))} onKeyDown={event => { if (event.key === 'Enter') void save() }} className="text-right tabular-nums" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="line-comment">{t('Kommentar (valgfri)', 'Comment (optional)')}</Label>
            <Input id="line-comment" value={comment} maxLength={200} onChange={event => setComment(event.target.value)} />
          </div>
          <Button onClick={() => save()} disabled={serialManaged}><Plus size={18} weight="bold" /> {t('Gem linje', 'Save line')}</Button>
        </div>
        {asking && <ExistingLineDialog ask={asking} onClose={() => setAsking(null)} />}
      </CardContent>
    </Card>
  )
}
