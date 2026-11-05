import { useEffect, useState } from 'react'
import { ArrowsLeftRight, HandGrabbing, PencilSimple, Swap } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/warehouse/ui'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { deferredText, formatAge, formatDate, isDeferred, materialLabel, newActionId, reasonLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { Deferred, PalletCard as PalletCardData, PalletView, SlotSuggestion } from '@/types/warehouse'
import { HistoryList } from './HistoryList'

type Dialogs = 'edit' | 'move' | 'sloc' | null

/** One pallet with all its fields and history: edit it, move it, or change its storage location. */
export function PalletCard({ pallet: id, version, tags, onOpen, onChanged }: { pallet: string; version: number; tags: string[]; onOpen: (target: LocationsTarget) => void; onChanged: () => void }) {
  const [card, setCard] = useState<PalletCardData | null>(null)
  const [gone, setGone] = useState(false)
  const [dialog, setDialog] = useState<Dialogs>(null)
  useEffect(() => {
    let current = true
    window.electronWarehouse!.locations.palletCard({ pallet: id })
      .then(result => { if (current) { setCard(result); setGone(false) } })
      .catch(error => { if (!current) return; if (errorCode(error) === 'PALLET_GONE') setGone(true); else toast.error(errorMessage(error)) })
    return () => { current = false }
  }, [id, version])

  if (gone) return <p className="text-sm text-muted-foreground">{t('Pallen er ikke på lageret længere.', 'The pallet is no longer in stock.')}</p>
  if (!card) return <Skeleton className="h-80 rounded-xl" />
  const pallet = card.pallet
  const done = (result: object, text: string) => {
    if (isDeferred(result)) toast.warning(deferredText(result as Deferred))
    else toast.success(text)
    setDialog(null)
    onChanged()
  }

  const field = (label: string, content: React.ReactNode) => (
    <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm">{content}</dd></div>
  )

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <button type="button" className="text-left hover:underline" onClick={() => onOpen({ kind: 'material', id: pallet.material })}><h1 className="text-2xl font-semibold tracking-tight">{materialLabel(pallet.material, pallet.description)}</h1></button>
          <p className="text-sm text-muted-foreground">{t('Står på', 'Stands on')} <button type="button" className="font-mono font-semibold text-foreground hover:underline" onClick={() => onOpen({ kind: 'location', id: pallet.location })}>{pallet.location}</button> · {formatAge(pallet.ageDays)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialog('edit')}><PencilSimple size={16} /> {t('Ret', 'Edit')}</Button>
          <Button variant="outline" onClick={() => setDialog('move')}><ArrowsLeftRight size={16} /> {t('Flyt', 'Move')}</Button>
          <Button variant="outline" onClick={() => setDialog('sloc')}><Swap size={16} /> {t('Skift storage location', 'Change storage location')}</Button>
          <Button onClick={() => onOpen({ kind: 'take', id: pallet.material })}><HandGrabbing size={16} /> {t('Tag', 'Take')}</Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {field(t('Antal', 'Quantity'), pallet.quantity === null ? '–' : formatNumber(pallet.quantity))}
            {field(t('Dato', 'Date'), formatDate(pallet.receivedAt))}
            {field(t('49/50-nummer', '49/50 number'), <span className="font-mono">{pallet.document || '–'}</span>)}
            {field('Storage location', <span className="font-mono">{pallet.sloc}</span>)}
            {field(t('Mærkater', 'Labels'), pallet.tags.length ? <span className="flex flex-wrap gap-1">{pallet.tags.map(tag => <Badge key={tag} variant="outline">{tag}</Badge>)}</span> : '–')}
            {field(t('Registreret af', 'Registered by'), `${pallet.createdBy?.name || '–'} · ${formatDate(pallet.createdAt)}`)}
            {field(t('Note', 'Note'), pallet.note || '–')}
          </dl>
          {pallet.serials.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">{t(`${pallet.serials.length} serienumre`, `${pallet.serials.length} serial numbers`)}</summary>
              <p className="mt-2 max-h-48 overflow-y-auto break-words font-mono text-xs text-muted-foreground">{pallet.serials.join('  ')}</p>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('Historik', 'History')}</CardTitle></CardHeader>
        <CardContent><HistoryList events={card.history} /></CardContent>
      </Card>

      {dialog === 'edit' && <EditDialog pallet={pallet} tags={tags} onClose={() => setDialog(null)} onDone={result => done(result, t('Pallen er rettet', 'The pallet has been edited'))} />}
      {dialog === 'move' && <MoveDialog pallet={pallet} onClose={() => setDialog(null)} onDone={(result, to) => done(result, t(`Pallen står nu på ${to}`, `The pallet is now on ${to}`))} />}
      {dialog === 'sloc' && <SlocDialog pallet={pallet} onClose={() => setDialog(null)} onDone={(result, sloc) => done(result, t(`Storage location er nu ${sloc} i Hubben`, `Storage location is now ${sloc} in the Hub`))} />}
    </div>
  )
}

function useSubmit() {
  const [busy, setBusy] = useState(false)
  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    try { await job() } catch (error) { toast.error(errorMessage(error)) } finally { setBusy(false) }
  }
  return { busy, run }
}

const dayOf = (ms: number) => { const date = new Date(ms); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

function EditDialog({ pallet, tags, onClose, onDone }: { pallet: PalletView; tags: string[]; onClose: () => void; onDone: (result: object) => void }) {
  const [material, setMaterial] = useState(pallet.material)
  const [quantity, setQuantity] = useState(pallet.quantity === null ? '' : String(pallet.quantity))
  const [date, setDate] = useState(dayOf(pallet.receivedAt))
  const [document, setDocument] = useState(pallet.document || '')
  const [serials, setSerials] = useState(pallet.serials.join('\n'))
  const [chosen, setChosen] = useState<string[]>(pallet.tags)
  const [note, setNote] = useState(pallet.note)
  const { busy, run } = useSubmit()
  const save = () => run(async () => {
    const result = await window.electronWarehouse!.locations.editPallet({
      actionId: newActionId(), label: t(`Ret pallen med ${pallet.material} på ${pallet.location}`, `Edit the pallet with ${pallet.material} on ${pallet.location}`), pallet: pallet.id,
      changes: { material, quantity: quantity.trim() === '' ? null : Number(quantity), receivedAt: new Date(`${date}T12:00:00`).getTime(), document: document.trim() || null, serials: serials.split(/[\s,;]+/).filter(Boolean), tags: chosen, note },
    })
    onDone(result)
  })
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Ret pallen', 'Edit the pallet')}</DialogTitle>
          <DialogDescription>{t('Alle ændringer gemmes i historikken med før og efter.', 'Every change is kept in the history with before and after.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="edit-material">{t('Materiale', 'Material')}</Label><Input id="edit-material" className="font-mono" value={material} onChange={event => setMaterial(event.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-quantity">{t('Antal', 'Quantity')}</Label><Input id="edit-quantity" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-date">{t('Dato', 'Date')}</Label><Input id="edit-date" type="date" value={date} onChange={event => setDate(event.target.value || date)} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-document">{t('49/50-nummer', '49/50 number')}</Label><Input id="edit-document" className="font-mono" value={document} onChange={event => setDocument(event.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="edit-serials">{t('Serienumre (et pr. linje)', 'Serial numbers (one per line)')}</Label><Textarea id="edit-serials" className="font-mono text-xs" value={serials} onChange={event => setSerials(event.target.value)} /></div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(tag => {
              const on = chosen.includes(tag)
              return <button key={tag} type="button" aria-pressed={on} onClick={() => setChosen(list => (on ? list.filter(item => item !== tag) : [...list, tag]))} className={cn('rounded-full border px-2.5 py-0.5 text-xs', on ? 'border-primary bg-primary/10' : 'text-muted-foreground')}>{tag}</button>
            })}
          </div>
        )}
        <div className="space-y-1.5"><Label htmlFor="edit-note">{t('Note', 'Note')}</Label><Input id="edit-note" value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void save()} loading={busy}>{t('Gem', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveDialog({ pallet, onClose, onDone }: { pallet: PalletView; onClose: () => void; onDone: (result: object, to: string) => void }) {
  const [to, setTo] = useState('')
  const [slots, setSlots] = useState<SlotSuggestion[]>([])
  const { busy, run } = useSubmit()
  useEffect(() => { window.electronWarehouse!.locations.suggest({ material: pallet.material }).then(result => setSlots(result.slots.filter(slot => slot.location !== pallet.location))).catch(() => {}) }, [pallet.material, pallet.location])
  const save = () => run(async () => {
    const result = await window.electronWarehouse!.locations.move({ actionId: newActionId(), label: t(`Flyt ${pallet.material} fra ${pallet.location} til ${to}`, `Move ${pallet.material} from ${pallet.location} to ${to}`), pallet: pallet.id, to })
    onDone(result, to.trim().toUpperCase())
  })
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`Flyt pallen fra ${pallet.location}`, `Move the pallet from ${pallet.location}`)}</DialogTitle>
          <DialogDescription>{materialLabel(pallet.material, pallet.description)}</DialogDescription>
        </DialogHeader>
        <Input autoFocus className="font-mono" value={to} placeholder="A2.4" onChange={event => setTo(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter' && to.trim()) void save() }} aria-label={t('Ny plads', 'New place')} />
        <div className="flex flex-wrap gap-2">
          {slots.map(slot => (
            <button key={slot.location} type="button" onClick={() => setTo(slot.location)} className={cn('rounded-md border px-2.5 py-1 text-xs', to === slot.location ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}>
              <span className="font-mono font-semibold">{slot.location}</span> <span className="opacity-75">{reasonLabel(slot.reason)}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void save()} disabled={!to.trim()} loading={busy}>{t('Flyt', 'Move')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SlocDialog({ pallet, onClose, onDone }: { pallet: PalletView; onClose: () => void; onDone: (result: object, sloc: string) => void }) {
  const [sloc, setSloc] = useState(pallet.sloc)
  const { busy, run } = useSubmit()
  const valid = /^[A-Z]\d{3}$/.test(sloc)
  const save = () => run(async () => {
    const result = await window.electronWarehouse!.locations.changeSloc({ actionId: newActionId(), label: t(`Storage location ${sloc} for ${pallet.material} på ${pallet.location}`, `Storage location ${sloc} for ${pallet.material} on ${pallet.location}`), pallet: pallet.id, sloc })
    onDone(result, sloc)
  })
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Skift storage location', 'Change storage location')}</DialogTitle>
          <DialogDescription>{t('Registreres i Hubben – SAP-overførslen (MIGO) kommer senere.', 'Registered in the Hub – the SAP transfer (MIGO) comes later.')}</DialogDescription>
        </DialogHeader>
        <Input autoFocus className="w-32 font-mono" maxLength={4} value={sloc} onChange={event => setSloc(event.target.value.toUpperCase())} aria-invalid={!valid} aria-label="Storage location" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void save()} disabled={!valid || sloc === pallet.sloc} loading={busy}>{t('Skift', 'Change')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
