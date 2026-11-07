import { useState } from 'react'
import { ArrowsLeftRight, HandGrabbing, PencilSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { deferredText, isDeferred, materialLabel, newActionId, shownQuantity, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { StockLineView } from '@/types/warehouse'

type Action = 'take' | 'move' | 'set'

/** A lagerhylde's lines (material + quantity) with "Tag", "Flyt" and "Ret antal" (everyone in the team). */
export function ShelfLines({ shelf, lines, onOpen, onChanged }: { shelf: string; lines: StockLineView[]; onOpen: (target: LocationsTarget) => void; onChanged: () => void }) {
  const [open, setOpen] = useState<{ action: Action; line: StockLineView } | null>(null)
  if (!lines.length) return <p className="text-sm text-muted-foreground">{t('Hylden er tom.', 'The shelf is empty.')}</p>
  return (
    <>
      <div className="divide-y">
        {lines.map(line => (
          <div key={line.id} className="flex flex-wrap items-center gap-3 px-1 py-2 text-sm">
            <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen({ kind: 'material', id: line.material })}>{materialLabel(line.material, line.description)}</button>
            <span className="font-semibold tabular-nums">{t(`${formatNumber(line.quantity)} stk.`, `${formatNumber(line.quantity)} pcs`)}</span>
            {line.note && <span className="w-full text-xs text-muted-foreground">{line.note}</span>}
            <span className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setOpen({ action: 'take', line })}><HandGrabbing size={14} /> {t('Tag', 'Take')}</Button>
              <Button size="sm" variant="outline" onClick={() => setOpen({ action: 'move', line })}><ArrowsLeftRight size={14} /> {t('Flyt', 'Move')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen({ action: 'set', line })}><PencilSimple size={14} /> {t('Ret antal', 'Correct quantity')}</Button>
            </span>
          </div>
        ))}
      </div>
      {open && <ShelfLineDialog shelf={shelf} action={open.action} line={open.line} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onChanged() }} />}
    </>
  )
}

function ShelfLineDialog({ shelf, action, line, onClose, onDone }: { shelf: string; action: Action; line: StockLineView; onClose: () => void; onDone: () => void }) {
  const [quantity, setQuantity] = useState(action === 'set' ? String(line.quantity) : '')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const bridge = window.electronWarehouse!.locations
  const amount = quantity.trim() ? Number(quantity) : undefined

  async function run(all = false) {
    setBusy(true)
    try {
      const actionId = newActionId()
      if (action === 'take') {
        const result = await bridge.shelfTake({ actionId, label: t(`Tag ${line.material} fra ${shelf}`, `Take ${line.material} from ${shelf}`), location: line.location, material: line.material, quantity: all ? line.quantity : amount })
        if (isDeferred(result)) toast.warning(deferredText(result))
        else toast.success(t(`${formatNumber(result.taken)} stk. taget fra ${shelf}`, `${formatNumber(result.taken)} pcs taken from ${shelf}`))
      } else if (action === 'move') {
        const result = await bridge.shelfMove({ actionId, label: t(`Flyt ${line.material} fra ${shelf} til ${target}`, `Move ${line.material} from ${shelf} to ${target}`), from: line.location, to: target.trim(), material: line.material, quantity: shownQuantity(quantity, line.quantity) })
        if (isDeferred(result)) toast.warning(deferredText(result))
        else toast.success(t(`${formatNumber(amount ?? line.quantity)} stk. flyttet fra ${shelf} til ${target.trim().toUpperCase()}`, `${formatNumber(amount ?? line.quantity)} pcs moved from ${shelf} to ${target.trim().toUpperCase()}`))
      } else {
        const result = await bridge.shelfSet({ actionId, label: t(`Ret antal af ${line.material} på ${shelf}`, `Correct ${line.material} on ${shelf}`), location: line.location, material: line.material, quantity: amount ?? 0 })
        if (isDeferred(result)) toast.warning(deferredText(result))
        else toast.success(t(`Antallet på ${shelf} er rettet`, `The quantity on ${shelf} has been corrected`))
      }
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const title = action === 'take' ? t('Tag fra hylden', 'Take from the shelf') : action === 'move' ? t('Flyt til en anden hylde', 'Move to another shelf') : t('Ret antal', 'Correct quantity')
  const valid = action === 'move' ? Boolean(target.trim()) && (amount === undefined || (amount >= 1 && amount <= line.quantity)) : action === 'take' ? amount !== undefined && amount >= 1 && amount <= line.quantity : amount !== undefined
  return (
    <Dialog open onOpenChange={value => { if (!value && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t(`${materialLabel(line.material, line.description)} på ${shelf}: ${formatNumber(line.quantity)} stk.`, `${materialLabel(line.material, line.description)} on ${shelf}: ${formatNumber(line.quantity)} pcs`)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="shelf-quantity">{action === 'set' ? t('Nyt antal', 'New quantity') : t('Antal', 'Quantity')}</Label>
            <Input id="shelf-quantity" autoFocus inputMode="numeric" value={quantity} placeholder={action === 'move' ? t('Alle', 'All') : ''} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} />
          </div>
          {action === 'move' && (
            <div className="grid gap-1.5">
              <Label htmlFor="shelf-target">{t('Ny hylde', 'New shelf')}</Label>
              <Input id="shelf-target" value={target} className="font-mono" placeholder="E9 H2" onChange={event => setTarget(event.target.value.toUpperCase())} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
          {action === 'take' && <Button variant="outline" onClick={() => run(true)} disabled={busy}>{t('Tag alt', 'Take all')}</Button>}
          <Button onClick={() => run()} loading={busy} disabled={!valid}>
            {action === 'take' ? t(`Tag ${quantity || 'X'} stk.`, `Take ${quantity || 'X'}`) : action === 'move' ? t('Flyt', 'Move') : t('Gem', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
