import { useState } from 'react'
import { ArrowsClockwise, FloppyDisk, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/warehouse/errors'
import { deferredText, isDeferred, newActionId, reasonLabel } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { PalletInput, SlotSuggestion } from '@/types/warehouse'

interface Draft {
  key: number
  document: string
  material: string
  description: string
  quantity: string
  serials: string[]
  location: string
  sloc: string
  date: string
  tags: string[]
  note: string
  slots: SlotSuggestion[]
  /** The material has been looked up: its description and place suggestions are known. */
  checked: boolean
}

let nextKey = 1
const today = () => new Date().toISOString().slice(0, 10)
const blank = (): Draft => ({ key: nextKey++, document: '', material: '', description: '', quantity: '', serials: [], location: '', sloc: 'D000', date: today(), tags: [], note: '', slots: [], checked: false })
// Noon local time, so the day never shifts with the time zone.
const dateMs = (value: string) => new Date(`${value}T12:00:00`).getTime()

/** Put one or more pallets away after goods receipt: the 49/50 number fills in the rest, the Hub suggests a place. */
export function PutAway({ tags, onDone }: { tags: string[]; onDone: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([blank()])
  const [saving, setSaving] = useState(false)
  const update = (key: number, patch: Partial<Draft>) => setDrafts(list => list.map(item => (item.key === key ? { ...item, ...patch } : item)))
  const bridge = window.electronWarehouse!.locations

  async function describe(key: number, material: string) {
    const code = material.trim().toUpperCase()
    if (!code) return
    try {
      const [card, suggestion] = await Promise.all([bridge.materialCard({ material: code }), bridge.suggest({ material: code })])
      update(key, { material: code, description: card.description, slots: suggestion.slots, checked: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function lookup(draft: Draft) {
    try {
      const found = await bridge.lookupDocument({ document: draft.document })
      if (!found.materials.length) { toast.warning(t('Materialedokumentet har ingen serienumre i SAP.', 'The material document has no serial numbers in SAP.')); return }
      // One pallet per material on the document.
      const [first, ...rest] = found.materials
      const extra = rest.map(item => ({ ...blank(), document: found.document, material: item.material, description: item.description, quantity: String(item.quantity), serials: item.serials, sloc: draft.sloc, date: draft.date }))
      setDrafts(list => list.flatMap(item => (item.key === draft.key ? [{ ...item, document: found.document, material: first.material, description: first.description, quantity: String(first.quantity), serials: first.serials }, ...extra] : [item])))
      for (const item of [{ key: draft.key, material: first.material }, ...extra]) void describe(item.key, item.material)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function save() {
    const ready = drafts.filter(item => item.material || item.location)
    const missing = ready.find(item => !item.material || !item.location)
    if (!ready.length || missing) { toast.error(t('Hver palle skal have materiale og plads.', 'Every pallet needs a material and a place.')); return }
    const pallets: PalletInput[] = ready.map(item => ({
      location: item.location, material: item.material, quantity: item.quantity.trim() === '' ? null : Number(item.quantity), document: item.document || null,
      serials: item.serials, sloc: item.sloc, receivedAt: dateMs(item.date), tags: item.tags, note: item.note,
    }))
    setSaving(true)
    try {
      const result = await bridge.putAway({ actionId: newActionId(), label: t('Sæt på plads: ', 'Put away: ') + pallets.map(item => `${item.material} → ${item.location}`).join(', '), pallets })
      if (isDeferred(result)) toast.warning(deferredText(result))
      else {
        const count = result.created.length + result.filled.length
        toast.success(count === 1 && result.created.length === 1 ? t(`Pallen står nu på ${result.created[0].location}`, `The pallet is now on ${result.created[0].location}`)
          : count === 1 ? t(`${result.filled[0]} er fyldt op`, `${result.filled[0]} has been refilled`)
          : t(`${count} paller er sat på plads`, `${count} pallets put away`))
      }
      setDrafts([blank()])
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Sæt palle på plads', 'Put a pallet away')}</h1>
        <p className="text-sm text-muted-foreground">{t('Scan 49/50-nummeret, så henter Hubben materiale, antal og serienumre fra SAP. Uden SAP: skriv materiale og antal.', 'Scan the 49/50 number and the Hub fetches material, quantity and serial numbers from SAP. Without SAP: type material and quantity.')}</p>
      </div>
      {drafts.map((draft, index) => (
        <DraftCard key={draft.key} draft={draft} index={index} tags={tags} canRemove={drafts.length > 1}
          onChange={patch => update(draft.key, patch)} onLookup={() => lookup(draft)} onDescribe={material => void describe(draft.key, material)}
          onRemove={() => setDrafts(list => list.filter(item => item.key !== draft.key))} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setDrafts(list => [...list, { ...blank(), sloc: list[list.length - 1]?.sloc || 'D000', date: list[list.length - 1]?.date || today() }])}><Plus size={16} /> {t('Tilføj næste palle', 'Add next pallet')}</Button>
        <Button className="ml-auto" onClick={() => void save()} loading={saving}><FloppyDisk size={16} /> {drafts.length > 1 ? t('Gem alle', 'Save all') : t('Gem', 'Save')}</Button>
      </div>
    </div>
  )
}

function DraftCard({ draft, index, tags, canRemove, onChange, onLookup, onDescribe, onRemove }: {
  draft: Draft; index: number; tags: string[]; canRemove: boolean
  onChange: (patch: Partial<Draft>) => void; onLookup: () => Promise<void>; onDescribe: (material: string) => void; onRemove: () => void
}) {
  const id = (name: string) => `putaway-${draft.key}-${name}`

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t(`Palle ${index + 1}`, `Pallet ${index + 1}`)}</Badge>
          {canRemove && <Button variant="ghost" size="sm" className="ml-auto" onClick={onRemove} aria-label={t('Fjern pallen', 'Remove the pallet')}><Trash size={16} /></Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={id('document')}>{t('49/50-nummer (materialedokument)', '49/50 number (material document)')}</Label>
            <Input id={id('document')} value={draft.document} placeholder={t('Scan eller skriv, fx 5000032337 2026 0001', 'Scan or type, e.g. 5000032337 2026 0001')} onChange={event => onChange({ document: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && draft.document.trim()) void onLookup() }} />
          </div>
          <SapActionButton variant="outline" className="self-end" disabled={!draft.document.trim()} onAction={onLookup}><ArrowsClockwise size={16} /> {t('Hent fra SAP', 'Fetch from SAP')}</SapActionButton>
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={id('material')}>{t('Materiale', 'Material')}</Label>
            <Input id={id('material')} value={draft.material} className="font-mono" onChange={event => onChange({ material: event.target.value.toUpperCase(), description: '', checked: false })} onBlur={event => onDescribe(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onDescribe(draft.material) }} />
            {draft.description && <p className="truncate text-xs text-muted-foreground">{draft.description}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('quantity')}>{t('Antal', 'Quantity')}</Label>
            <Input id={id('quantity')} inputMode="numeric" value={draft.quantity} onChange={event => onChange({ quantity: event.target.value.replace(/\D/g, '') })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('sloc')}>Storage location</Label>
            <Input id={id('sloc')} value={draft.sloc} className="font-mono" maxLength={4} onChange={event => onChange({ sloc: event.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('date')}>{t('Dato', 'Date')}</Label>
            <Input id={id('date')} type="date" value={draft.date} onChange={event => onChange({ date: event.target.value || today() })} />
          </div>
        </div>
        {draft.serials.length > 0 && <p className="text-xs text-muted-foreground">{t(`${draft.serials.length} serienumre fra SAP`, `${draft.serials.length} serial numbers from SAP`)}</p>}

        <div className="space-y-1.5">
          <Label htmlFor={id('location')}>{t('Plads', 'Place')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input id={id('location')} value={draft.location} className="w-36 font-mono" placeholder="A2.4" onChange={event => onChange({ location: event.target.value.toUpperCase() })} />
            {draft.slots.map(slot => (
              <button key={slot.location} type="button" onClick={() => onChange({ location: slot.location })}
                className={cn('rounded-md border px-2.5 py-1 text-left text-xs transition', draft.location === slot.location ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary')}>
                <span className="font-mono font-semibold">{slot.location}</span> <span className="opacity-75">{reasonLabel(slot.reason)}</span>
              </button>
            ))}
            {draft.checked && !draft.slots.length && <span className="text-xs text-muted-foreground">{t('Ingen ledige pladser at foreslå', 'No free places to suggest')}</span>}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Mærkater', 'Labels')}>
            {tags.map(tag => {
              const on = draft.tags.includes(tag)
              return (
                <button key={tag} type="button" aria-pressed={on} onClick={() => onChange({ tags: on ? draft.tags.filter(item => item !== tag) : [...draft.tags, tag] })}
                  className={cn('rounded-full border px-2.5 py-0.5 text-xs transition', on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {tag}
                </button>
              )
            })}
          </div>
        )}
        <Input value={draft.note} maxLength={500} placeholder={t('Note (valgfri)', 'Note (optional)')} onChange={event => onChange({ note: event.target.value })} aria-label={t('Note', 'Note')} />
      </CardContent>
    </Card>
  )
}
