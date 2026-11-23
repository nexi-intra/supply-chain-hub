import { useEffect, useState } from 'react'
import { ArrowsLeftRight, HandGrabbing, PencilSimple, Swap, Warning } from '@phosphor-icons/react'
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
import { matdocOf, moveTargetCheck, palletEdit, sendLocationAction, startLocationsRead } from '@/lib/warehouse/locationActions'
import { formatAge, formatDate, locationKeyOf, materialLabel, newActionId, reasonLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationList, PalletCard as PalletCardData, PalletView, SlotSuggestion } from '@/types/warehouse'
import { HistoryList } from './HistoryList'

type Dialogs = 'edit' | 'move' | 'sloc' | null
const DAY_MS = 86400000

/** One pallet with all its fields and history: edit it, move it, or change its storage location. */
export function PalletCard({ pallet: id, version, tags, onOpen, onChanged }: { pallet: string; version: number; tags: string[]; onOpen: (target: LocationsTarget) => void; onChanged: () => void }) {
  const [card, setCard] = useState<PalletCardData | null>(null)
  const [gone, setGone] = useState(false)
  const [dialog, setDialog] = useState<Dialogs>(null)
  useEffect(() => {
    let current = true
    // A re-read during this PC's own change on its way to M: is older than the card, which already shows the change.
    const fresh = startLocationsRead()
    window.electronWarehouse!.locations.palletCard({ pallet: id })
      .then(result => { if (current) { setCard(value => (value && !fresh() ? value : result)); setGone(false) } })
      .catch(error => { if (!current) return; if (errorCode(error) === 'PALLET_GONE') { if (fresh()) setGone(true) } else toast.error(errorMessage(error)) })
    return () => { current = false }
  }, [id, version])

  if (gone) return <p className="text-sm text-muted-foreground">{t('Pallen er ikke på lageret længere.', 'The pallet is no longer in stock.')}</p>
  if (!card) return <Skeleton className="h-80 rounded-xl" />
  const pallet = card.pallet
  // The card shows the change and the dialog closes at once; M: gets it in the background (15-40 s). A refusal puts the
  // changed fields back and says why.
  const send = (patch: Partial<PalletView>, write: () => Promise<object>, success: string) => {
    const before = Object.fromEntries(Object.keys(patch).map(field => [field, pallet[field as keyof PalletView]])) as Partial<PalletView>
    setCard(value => value && { ...value, pallet: { ...value.pallet, ...patch } })
    setDialog(null)
    void sendLocationAction(write, { success, rollback: () => setCard(value => value && { ...value, pallet: { ...value.pallet, ...before } }), settled: onChanged })
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

      {dialog === 'edit' && <EditDialog pallet={pallet} tags={tags} onClose={() => setDialog(null)} onSend={(patch, write) => send(patch, write, t('Pallen er rettet', 'The pallet has been edited'))} />}
      {dialog === 'move' && <MoveDialog pallet={pallet} onClose={() => setDialog(null)} onSend={(to, write) => send({ location: to.id }, write, t(`Pallen står nu på ${to.name}`, `The pallet is now on ${to.name}`))} />}
      {dialog === 'sloc' && <SlocDialog pallet={pallet} onClose={() => setDialog(null)} onSend={(sloc, write) => send({ sloc }, write, t(`Storage location er nu ${sloc} i Hubben`, `Storage location is now ${sloc} in the Hub`))} />}
    </div>
  )
}

type Send<T> = (value: T, write: () => Promise<object>) => void
type Listed = LocationList['locations'][number]
const dayOf = (ms: number) => { const date = new Date(ms); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const serialsFrom = (text: string) => [...new Set(text.split(/[\s,;]+/).map(serial => serial.trim().toUpperCase()).filter(Boolean))]

function EditDialog({ pallet: current, tags, onClose, onSend }: { pallet: PalletView; tags: string[]; onClose: () => void; onSend: Send<Partial<PalletView>> }) {
  // The pallet as the dialog was opened: a re-read of the card meanwhile must not make an untouched field look changed.
  const [pallet] = useState(current)
  const [material, setMaterial] = useState(pallet.material)
  const [quantity, setQuantity] = useState(pallet.quantity === null ? '' : String(pallet.quantity))
  const [date, setDate] = useState(dayOf(pallet.receivedAt))
  const [document, setDocument] = useState(pallet.document || '')
  const [serials, setSerials] = useState(pallet.serials.join('\n'))
  const [chosen, setChosen] = useState<string[]>(pallet.tags)
  const [note, setNote] = useState(pallet.note)
  // Checked here as the backend does, so a typing error is shown before the dialog closes.
  const matdoc = document.trim() ? matdocOf(document) : null
  const documentInvalid = Boolean(document.trim()) && !matdoc
  const code = material.trim().toUpperCase()
  const changes = { material: code, quantity: quantity.trim() === '' ? null : Number(quantity), receivedAt: date === dayOf(pallet.receivedAt) ? pallet.receivedAt : new Date(`${date}T12:00:00`).getTime(), document: matdoc, serials: serialsFrom(serials), tags: [...new Set(chosen)], note: note.trim().slice(0, 500) }
  // Only what was changed is sent, with what the dialog showed: someone else's take meanwhile is never written back over.
  const edit = palletEdit(pallet, changes)
  function save() {
    // Nothing changed: nothing to write on M:.
    if (!Object.keys(edit.changes).length) { onClose(); return }
    const patch: Partial<PalletView> = { ...edit.changes, ...(edit.changes.material !== undefined ? { description: '' } : {}), ...(edit.changes.receivedAt !== undefined ? { ageDays: Math.max(0, Math.floor((Date.now() - changes.receivedAt) / DAY_MS)) } : {}) }
    onSend(patch, () => window.electronWarehouse!.locations.editPallet({
      actionId: newActionId(), label: t(`Ret pallen med ${pallet.material} på ${pallet.location}`, `Edit the pallet with ${pallet.material} on ${pallet.location}`), pallet: pallet.id,
      changes: edit.changes, expected: edit.expected,
    }))
  }
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Ret pallen', 'Edit the pallet')}</DialogTitle>
          <DialogDescription>{t('Alle ændringer gemmes i historikken med før og efter.', 'Every change is kept in the history with before and after.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="edit-material">{t('Materiale', 'Material')}</Label><Input id="edit-material" className="font-mono" value={material} onChange={event => setMaterial(event.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-quantity">{t('Antal', 'Quantity')}</Label><Input id="edit-quantity" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-date">{t('Dato', 'Date')}</Label><Input id="edit-date" type="date" value={date} onChange={event => setDate(event.target.value || date)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-document">{t('49/50-nummer', '49/50 number')}</Label><Input id="edit-document" className="font-mono" value={document} aria-invalid={documentInvalid} onChange={event => setDocument(event.target.value)} />
            {documentInvalid && <p className="text-xs text-destructive">{t('Skriv 49/50-nummeret som fx "5000032337" eller "5000032337 2026 0001"', 'Type the 49/50 number like "5000032337" or "5000032337 2026 0001"')}</p>}
          </div>
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
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => save()} disabled={!code || code.length > 40 || documentInvalid}>{t('Gem', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveDialog({ pallet, onClose, onSend }: { pallet: PalletView; onClose: () => void; onSend: Send<Listed> }) {
  const [to, setTo] = useState('')
  const [slots, setSlots] = useState<SlotSuggestion[]>([])
  // Every place, so the new place is checked here as the backend does (exists, active, room) before the dialog closes.
  const [places, setPlaces] = useState<Record<string, Listed> | null>(null)
  useEffect(() => { window.electronWarehouse!.locations.suggest({ material: pallet.material }).then(result => setSlots(result.slots.filter(slot => slot.location !== pallet.location))).catch(() => {}) }, [pallet.material, pallet.location])
  useEffect(() => { window.electronWarehouse!.locations.list().then(result => setPlaces(Object.fromEntries(result.locations.map(location => [location.id, location])))).catch(() => setPlaces({})) }, [])
  const target = places?.[locationKeyOf(to)] || null
  const { note, blocked } = moveTargetCheck(to, target, pallet.location)
  function save() {
    if (!target || blocked) return
    onSend(target, () => window.electronWarehouse!.locations.move({ actionId: newActionId(), label: t(`Flyt ${pallet.material} fra ${pallet.location} til ${target.name}`, `Move ${pallet.material} from ${pallet.location} to ${target.name}`), pallet: pallet.id, to: target.id }))
  }
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`Flyt pallen fra ${pallet.location}`, `Move the pallet from ${pallet.location}`)}</DialogTitle>
          <DialogDescription>{materialLabel(pallet.material, pallet.description)}</DialogDescription>
        </DialogHeader>
        <Input autoFocus className="font-mono" value={to} placeholder="A2.4" onChange={event => setTo(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter') save() }} aria-label={t('Ny plads', 'New place')} />
        {places && note && <p className={cn('flex items-center gap-1.5 text-sm', blocked ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}><Warning size={14} /> {note}</p>}
        <div className="flex flex-wrap gap-2">
          {slots.map(slot => (
            <button key={slot.location} type="button" onClick={() => setTo(slot.location)} className={cn('rounded-md border px-2.5 py-1 text-xs', to === slot.location ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}>
              <span className="font-mono font-semibold">{slot.location}</span> <span className="opacity-75">{reasonLabel(slot.reason)}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => save()} disabled={!places || blocked} loading={!places && Boolean(to.trim())}>{t('Flyt', 'Move')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SlocDialog({ pallet, onClose, onSend }: { pallet: PalletView; onClose: () => void; onSend: Send<string> }) {
  const [sloc, setSloc] = useState(pallet.sloc)
  const valid = /^[A-Z]\d{3}$/.test(sloc)
  const save = () => onSend(sloc, () => window.electronWarehouse!.locations.changeSloc({ actionId: newActionId(), label: t(`Storage location ${sloc} for ${pallet.material} på ${pallet.location}`, `Storage location ${sloc} for ${pallet.material} on ${pallet.location}`), pallet: pallet.id, sloc }))
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Skift storage location', 'Change storage location')}</DialogTitle>
          <DialogDescription>{t('Registreres i Hubben – SAP-overførslen (MIGO) kommer senere.', 'Registered in the Hub – the SAP transfer (MIGO) comes later.')}</DialogDescription>
        </DialogHeader>
        <Input autoFocus className="w-32 font-mono" maxLength={4} value={sloc} onChange={event => setSloc(event.target.value.toUpperCase())} aria-invalid={!valid} aria-label="Storage location" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => save()} disabled={!valid || sloc === pallet.sloc}>{t('Skift', 'Change')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
