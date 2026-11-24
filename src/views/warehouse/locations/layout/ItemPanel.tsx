import { useEffect, useState, type Dispatch } from 'react'
import { ArrowClockwise, Plus, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, Textarea } from '@/components/warehouse/ui'
import type { EditorAction } from '@/lib/warehouse/layout/editor'
import { bayNo, bayPos, levelsOf, NAME_MAX, proposeNames, pullNo, shelvesOfUnit, tooLongNames } from '@/lib/warehouse/layout/slots'
import { t } from '@/lib/warehouse/text'
import type { LayoutItem, LayoutOwner, LayoutPull } from '@/types/warehouse'
import { OWNED, typeLabel } from './LayoutCanvas'
import { RackFront, type SlotLink } from './RackFront'

type Patch = Extract<EditorAction, { type: 'set' }>['patch']
const OWNERS: LayoutOwner[] = ['TCD', 'TRR', 'Andet']
const PATTERNED = ['rack', 'floorrow', 'shelfrack']
const defaultPattern = (item: LayoutItem) => (item.type === 'rack' ? '{reol}{fag}.{n}' : item.type === 'floorrow' || item.type === 'shelfrack' ? '{reol}{nr}' : '{reol}')
const ownerLabel = (owner: LayoutOwner) => (owner === 'Andet' ? t('Andet team', 'Other team') : owner)

function nameLabel(item: LayoutItem): string {
  if (item.type === 'rack') return t('Rækkens navn (fx A)', 'Name of the row (e.g. A)')
  if (item.type === 'floorrow') return t('Bogstav (fx S)', 'Letter (e.g. S)')
  if (item.type === 'shelfrack') return t('Reolens navn (fx E9)', 'Name of the rack (e.g. E9)')
  if (item.type === 'floor' || item.type === 'special') return t('Pladsens navn', 'Name of the place')
  if (item.type === 'text') return t('Tekst', 'Text')
  return t('Navn (valgfrit)', 'Name (optional)')
}

/** A text or number that is applied on Enter or when the field is left – every applied change is one undo step. */
export function Field({ id, label, value, onCommit, number, min, max, placeholder, className }: { id: string; label: string; value: string | number; onCommit: (value: string) => void; number?: boolean; min?: number; max?: number; placeholder?: string; className?: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    if (text === String(value)) return
    if (number) {
      const n = Number.parseInt(text, 10)
      if (Number.isNaN(n)) { setText(String(value)); return }
      const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
      setText(String(clamped))
      if (clamped !== Number(value)) onCommit(String(clamped))
      return
    }
    onCommit(text)
  }
  return (
    <div className={className ?? 'space-y-1'}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={id} className="h-8" inputMode={number ? 'numeric' : undefined} value={text} placeholder={placeholder} onChange={event => setText(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') commit() }} />
    </div>
  )
}

function Select({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <NativeSelect id={id} className="h-8 w-full" value={value} onChange={event => onChange(event.target.value)}>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </NativeSelect>
    </div>
  )
}

/** One number per bay / unit / section that differs from the standard; the standard itself is not stored. */
function PerGrid({ id, label, entries, standard, max, current, onCommit }: { id: string; label: string; entries: { key: number; title: string }[]; standard: number; max: number; current?: Record<number, number>; onCommit: (next: Record<number, number> | undefined) => void }) {
  const set = (key: number, value: string) => {
    const next = { ...(current ?? {}) }
    if (Number(value) === standard) delete next[key]
    else next[key] = Number(value)
    onCommit(Object.keys(next).length ? next : undefined)
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="grid grid-cols-4 gap-1">
        {entries.map(entry => (
          <Field key={entry.key} id={`${id}-${entry.key}`} label={entry.title} number min={1} max={max} value={current?.[entry.key] ?? standard} onCommit={value => set(entry.key, value)} className={current?.[entry.key] != null ? 'space-y-0.5 [&_input]:border-violet-500 [&_input]:font-bold' : 'space-y-0.5'} />
        ))}
      </div>
    </div>
  )
}

const listText = (item: LayoutItem, positions?: number[]) => (positions ?? []).filter(pos => pos <= (item.bays ?? 1)).map(pos => bayNo(item, pos)).sort((a, b) => a - b).join(', ')
const positionsFrom = (item: LayoutItem, text: string) => [...new Set(text.split(/[^0-9]+/).filter(Boolean).map(no => bayPos(item, Number(no))))].filter(pos => pos >= 1 && pos <= (item.bays ?? 1))

/** The fields of the selected item in the drawing editor. */
export function ItemPanel({ item, dispatch, duplicates, link, onSlot }: { item: LayoutItem; dispatch: Dispatch<EditorAction>; duplicates?: Set<string>; link?: Record<string, SlotLink>; onSlot?: (slotId: string) => void }) {
  const [rename, setRename] = useState<{ changes: { from: string; to: string; manual: boolean }[]; manual: number } | null>(null)
  const [newLevel, setNewLevel] = useState(1)
  const set = (patch: Patch) => dispatch({ type: 'set', id: item.id, patch })
  const id = (key: string) => `item-${key}`
  const firstBay: [string, string][] = [['start', t('venstre / øverste ende', 'left / top end')], ['end', t('højre / nederste ende', 'right / bottom end')]]
  const owners = OWNERS.map((owner): [string, string] => [owner, ownerLabel(owner)])
  const pull = item.pull
  const setPull = (patch: Partial<LayoutPull>) => pull && set({ pull: { ...pull, ...patch } })
  const levelPatterns = item.levelPatterns ?? {}
  const topLevel = Math.max(1, ...Array.from({ length: item.bays ?? 1 }, (_, i) => levelsOf(item, i + 1)))
  const freeLevels = Array.from({ length: topLevel }, (_, i) => i + 1).filter(level => levelPatterns[level] == null)
  const addLevel = freeLevels.includes(newLevel) ? newLevel : freeLevels[0]
  const longNames = tooLongNames(item)

  function setLevelPattern(level: number, pattern?: string) {
    const next = { ...levelPatterns }
    if (pattern) next[level] = pattern
    else delete next[level]
    set({ levelPatterns: Object.keys(next).length ? next : undefined })
  }

  // Every slot is named from the patterns again; hand-typed names are only overwritten after a confirm.
  function askRename() {
    const next = proposeNames(item, { slotIds: item.slots.map(slot => slot.id) })
    const changes = item.slots.map((slot, index) => ({ from: slot.name, to: next.slots[index].name, manual: !!slot.manual })).filter(change => change.from !== change.to)
    const manual = changes.filter(change => change.manual).length
    if (manual) { setRename({ changes, manual }); return }
    if (changes.length || item.slots.some(slot => slot.manual)) dispatch({ type: 'resetNames', itemId: item.id })
    if (changes.length) toast.success(t(`${changes.length} navne følger nu mønstrene`, `${changes.length} names now follow the patterns`))
    else toast.info(t('Navnene følger allerede mønstrene', 'The names already follow the patterns'))
  }

  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-semibold">{typeLabel(item.type)}</h3>
      <Field id={id('name')} label={nameLabel(item)} value={item.name} onCommit={name => set({ name: name.trim() })} />

      {OWNED.includes(item.type) && (
        <>
          <Select id={id('owner')} label={item.type === 'rack' ? t('Pallepladserne tilhører', 'The pallet places belong to') : t('Tilhører', 'Belongs to')} value={item.owner ?? 'TCD'} options={owners} onChange={owner => set({ owner: owner as LayoutOwner })} />
          <Select id={id('floor')} label={t('Står', 'Stands')} value={item.floor ?? 'ground'} options={[['ground', t('på gulvet', 'on the floor')], ['mezz', t('ovenpå (sluse / mezzanin)', 'upstairs (dock / mezzanine)')]]} onChange={floor => set({ floor: floor as 'ground' | 'mezz' })} />
        </>
      )}

      {item.type === 'rack' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field id={id('bays')} label={t('Antal fag', 'Number of bays')} number min={1} max={200} value={item.bays ?? 1} onCommit={value => set({ bays: Number(value) })} />
            <Field id={id('levels')} label={t('Niveauer (standard)', 'Levels (standard)')} number min={1} max={12} value={item.levels ?? 1} onCommit={value => set({ levels: Number(value) })} />
            <Field id={id('firstNo')} label={t('Første fag-nummer', 'First bay number')} number min={0} max={999} value={item.firstNo ?? 1} onCommit={value => set({ firstNo: Number(value) })} />
            <Select id={id('firstBay')} label={t('Første fag er i', 'First bay is at the')} value={item.firstBay ?? 'start'} options={firstBay} onChange={value => set({ firstBay: value as 'start' | 'end' })} />
          </div>
          <Field id={id('aisles')} label={t('Køregang i fag nr. (gulvniveau spærret)', 'Aisle in bay no. (floor level blocked)')} placeholder={t('fx 4 eller 4, 7', 'e.g. 4 or 4, 7')} value={listText(item, item.aisles)} onCommit={value => set({ aisles: positionsFrom(item, value) })} />
          <Field id={id('spacers')} label={t('Tomme fag (tæller ikke)', 'Empty bays (not counted)')} placeholder={t('fx 0', 'e.g. 0')} value={listText(item, item.spacers)} onCommit={value => { const spacers = positionsFrom(item, value); set({ spacers: spacers.length ? spacers : undefined }) }} />
          <PerGrid
            id={id('bay')} label={t('Niveauer pr. fag (ret de fag, der afviger)', 'Levels per bay (change the bays that differ)')} standard={item.levels ?? 1} max={12} current={item.bayLevels}
            entries={Array.from({ length: item.bays ?? 1 }, (_, i) => i + 1).filter(pos => !(item.spacers ?? []).includes(pos)).sort((a, b) => bayNo(item, a) - bayNo(item, b)).map(pos => ({ key: pos, title: `${item.name}${bayNo(item, pos)}` }))}
            onCommit={bayLevels => set({ bayLevels })}
          />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!pull} onChange={event => set({ pull: event.target.checked ? { count: item.bays ?? 1, firstNo: 1, shelves: 5, owner: 'TCD' } : undefined })} />
            {t('Udtræksreoler nederst', 'Pull-out shelves at the bottom')}
          </label>
          {pull && (
            <div className="space-y-2 rounded-md border p-2">
              <div className="grid grid-cols-2 gap-2">
                <Field id={id('pull-count')} label={t('Antal udtræk', 'Number of units')} number min={1} max={200} value={pull.count} onCommit={value => setPull({ count: Number(value) })} />
                <Field id={id('pull-first')} label={t('Første nummer', 'First number')} number min={0} max={999} value={pull.firstNo} onCommit={value => setPull({ firstNo: Number(value) })} />
                <Field id={id('pull-shelves')} label={t('Hylder (standard)', 'Shelves (standard)')} number min={1} max={20} value={pull.shelves} onCommit={value => setPull({ shelves: Number(value) })} />
                <Select id={id('pull-owner')} label={t('Udtrækkene tilhører', 'The units belong to')} value={pull.owner ?? 'TCD'} options={owners} onChange={owner => setPull({ owner: owner as LayoutOwner })} />
              </div>
              <PerGrid
                id={id('unit')} label={t('Hylder pr. udtræk (ret dem, der afviger)', 'Shelves per unit (change the ones that differ)')} standard={pull.shelves} max={20} current={pull.perUnit}
                entries={Array.from({ length: pull.count }, (_, i) => i + 1).map(unit => ({ key: unit, title: `${item.name}${pullNo(item, unit)}` }))}
                onCommit={perUnit => setPull({ perUnit })}
              />
              <p className="text-xs text-muted-foreground">{t(`${Array.from({ length: pull.count }, (_, i) => shelvesOfUnit(item, i + 1)).reduce((a, b) => a + b, 0)} hylder i alt`, `${Array.from({ length: pull.count }, (_, i) => shelvesOfUnit(item, i + 1)).reduce((a, b) => a + b, 0)} shelves in total`)}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t(`${item.slots.filter(slot => slot.unit == null && slot.kind === 'pallet').length} pallepladser · højeste fag har ${Math.max(1, ...Array.from({ length: item.bays ?? 1 }, (_, i) => levelsOf(item, i + 1)))} niveauer`, `${item.slots.filter(slot => slot.unit == null && slot.kind === 'pallet').length} pallet places · the highest bay has ${Math.max(1, ...Array.from({ length: item.bays ?? 1 }, (_, i) => levelsOf(item, i + 1)))} levels`)}</p>
        </>
      )}

      {item.type === 'floorrow' && (
        <div className="grid grid-cols-2 gap-2">
          <Field id={id('firstNo')} label={t('Første nummer', 'First number')} number min={0} max={999} value={item.firstNo ?? 0} onCommit={value => set({ firstNo: Number(value) })} />
          <Field id={id('count')} label={t('Antal positioner', 'Number of positions')} number min={1} max={200} value={item.count ?? 1} onCommit={value => set({ count: Number(value) })} />
          <Field id={id('depth')} label={t('Paller i dybden', 'Pallets deep')} number min={1} max={6} value={item.depth ?? 1} onCommit={value => set({ depth: Number(value) })} />
          <Select id={id('firstBay')} label={t('Første nummer er i', 'First number is at the')} value={item.firstBay ?? 'start'} options={firstBay} onChange={value => set({ firstBay: value as 'start' | 'end' })} />
        </div>
      )}

      {item.type === 'shelfrack' && (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!item.visual} onChange={event => set({ visual: event.target.checked || undefined })} />
            {t('Kun visuelt – ikke lagerført', 'Visual only – not stock')}
          </label>
          {item.visual && <p className="text-xs text-muted-foreground">{t('Reolen vises på kortet, men har ingen pladser.', 'The rack is shown on the map, but has no places.')}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Field id={id('sections')} label={t('Sektioner', 'Sections')} number min={1} max={50} value={item.sections ?? 1} onCommit={value => set({ sections: Number(value) })} />
            <Field id={id('shelves')} label={t('Hylder (standard)', 'Shelves (standard)')} number min={1} max={20} value={item.shelves ?? 1} onCommit={value => set({ shelves: Number(value) })} />
          </div>
          {(item.sections ?? 1) > 1 && (
            <PerGrid
              id={id('section')} label={t('Hylder pr. sektion (ret dem, der afviger)', 'Shelves per section (change the ones that differ)')} standard={item.shelves ?? 1} max={20} current={item.perSection}
              entries={Array.from({ length: item.sections ?? 1 }, (_, i) => ({ key: i + 1, title: t(`Sektion ${i + 1}`, `Section ${i + 1}`) }))}
              onCommit={perSection => set({ perSection })}
            />
          )}
        </>
      )}

      {PATTERNED.includes(item.type) && !item.visual && (
        <div className="space-y-1">
          <Field id={id('pattern')} label={t('Navnemønster', 'Name pattern')} placeholder={defaultPattern(item)} value={item.pattern ?? ''} onCommit={pattern => set({ pattern: pattern.trim() || undefined })} />
          {item.type === 'rack' && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('Mønster for enkelte niveauer (fx {reol}{fag} GULV på niveau 1)', 'Pattern for single levels (e.g. {reol}{fag} GULV on level 1)')}</p>
              {Object.keys(levelPatterns).map(Number).sort((a, b) => a - b).map(level => (
                <div key={level} className="flex items-end gap-1">
                  <Field id={id(`level-pattern-${level}`)} className="flex-1 space-y-0.5" label={t(`Niveau ${level}`, `Level ${level}`)} value={levelPatterns[level]} onCommit={pattern => setLevelPattern(level, pattern.trim() || undefined)} />
                  <Button size="sm" variant="ghost" className="h-8 px-2" aria-label={t(`Fjern mønster for niveau ${level}`, `Remove pattern for level ${level}`)} onClick={() => setLevelPattern(level)}><X size={14} /></Button>
                </div>
              ))}
              {addLevel != null && (
                <div className="flex items-center gap-1">
                  <NativeSelect id={id('level-new')} aria-label={t('Niveau', 'Level')} className="h-8 w-24" value={String(addLevel)} onChange={event => setNewLevel(Number(event.target.value))}>
                    {freeLevels.map(level => <option key={level} value={level}>{t(`Niveau ${level}`, `Level ${level}`)}</option>)}
                  </NativeSelect>
                  <Button size="sm" variant="outline" onClick={() => setLevelPattern(addLevel, item.pattern ?? defaultPattern(item))}><Plus size={14} /> {t('Mønster for niveau', 'Pattern for level')}</Button>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('Pladsholdere: {reol} navnet · {fag} fagets nr. · {n} pladsens nr. nedefra i faget · {niveau} rummet nedefra · {nr} nummer i rækken / reolen · {udtræk} udtrækkets nr. · {hylde} hylden', 'Placeholders: {reol} the name · {fag} bay no. · {n} place no. from the bottom of the bay · {niveau} room from the bottom · {nr} number in the row / rack · {udtraek} unit no. · {hylde} the shelf')}</p>
          {longNames > 0 && <p className="text-xs font-medium text-destructive" data-testid="long-names">{t(`${longNames} navne bliver længere end ${NAME_MAX} tegn og skæres af – gør mønsteret kortere.`, `${longNames} names are longer than ${NAME_MAX} characters and are cut – make the pattern shorter.`)}</p>}
          <Button size="sm" variant="outline" onClick={askRename}><ArrowClockwise size={14} /> {t('Navngiv igen', 'Name again')}</Button>
        </div>
      )}

      {PATTERNED.includes(item.type) && !item.visual && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{item.type === 'floorrow' ? t('Rækken forfra', 'The row from the front') : t('Reolen forfra', 'The rack from the front')}</h4>
          <RackFront item={item} mode="edit" duplicates={duplicates} link={link} onSlot={onSlot} dispatch={dispatch} />
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor={id('note')} className="text-xs text-muted-foreground">{t('Bemærkning', 'Note')}</Label>
        <Textarea id={id('note')} key={`${item.id}-note`} className="min-h-16" defaultValue={item.note} onBlur={event => { if (event.target.value !== item.note) set({ note: event.target.value }) }} />
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{t('Placering og størrelse (x, y, bredde, højde)', 'Position and size (x, y, width, height)')}</p>
        <div className="grid grid-cols-4 gap-1">
          <Field id={id('x')} label="x" number min={0} value={item.x} onCommit={value => dispatch({ type: 'move', id: item.id, x: Number(value), y: item.y })} />
          <Field id={id('y')} label="y" number min={0} value={item.y} onCommit={value => dispatch({ type: 'move', id: item.id, x: item.x, y: Number(value) })} />
          <Field id={id('w')} label={t('bredde', 'width')} number min={1} value={item.w} onCommit={value => dispatch({ type: 'resize', id: item.id, w: Number(value), h: item.h })} />
          <Field id={id('h')} label={t('højde', 'height')} number min={1} value={item.h} onCommit={value => dispatch({ type: 'resize', id: item.id, w: item.w, h: Number(value) })} />
        </div>
      </div>

      {rename && (
        <Dialog open onOpenChange={open => { if (!open) setRename(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t(`Navngiv ${item.name || typeLabel(item.type)} igen?`, `Name ${item.name || typeLabel(item.type)} again?`)}</DialogTitle>
              <DialogDescription>{t(`${rename.changes.length} navne skifter efter mønstrene – ${rename.manual} af dem er rettet i hånden og bliver overskrevet.`, `${rename.changes.length} names change by the patterns – ${rename.manual} of them were typed by hand and are overwritten.`)}</DialogDescription>
            </DialogHeader>
            <ul className="max-h-60 space-y-0.5 overflow-y-auto font-mono text-xs">
              {rename.changes.slice(0, 200).map((change, index) => <li key={index} className={change.manual ? 'font-bold' : undefined}>{change.from || '–'} → {change.to || '–'}{change.manual ? t(' (rettet i hånden)', ' (typed by hand)') : ''}</li>)}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRename(null)}>{t('Annullér', 'Cancel')}</Button>
              <Button onClick={() => { dispatch({ type: 'resetNames', itemId: item.id }); setRename(null) }}>{t('Navngiv igen', 'Name again')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
