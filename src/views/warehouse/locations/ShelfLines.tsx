import { useEffect, useRef, useState } from 'react'
import { ArrowsLeftRight, HandGrabbing, PencilSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorCode } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { sendLocationAction } from '@/lib/warehouse/locationActions'
import { locationKeyOf, materialLabel, newActionId, shownQuantity, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { StockLineView } from '@/types/warehouse'

type Action = 'take' | 'move' | 'set'
/** A change of one shelf line: `delta` added to the material on the place (a take is negative). */
export type StockChange = { line: Pick<StockLineView, 'location' | 'material' | 'description'>; delta: number }
type Sent = { changes: StockChange[]; write: () => Promise<object>; success: string; offer?: (error: unknown) => { label: string; onClick: () => void } | null }

/**
 * A lagerhylde's lines (material + quantity) with "Tag", "Flyt" and "Ret antal" (everyone in the team). The dialog closes
 * and `onApply` shows the change at once; M: gets it in the background (15-40 s), a refusal applies it back. `stale`:
 * the lines came from a read that may be older than this PC's own action on its way, so "Ret antal" sends no `expected`
 * (M: would refuse it because of that very action).
 */
export function ShelfLines({ shelf, lines, stale = false, onOpen, onApply, onChanged }: { shelf: string; lines: StockLineView[]; stale?: boolean; onOpen: (target: LocationsTarget) => void; onApply: (changes: StockChange[]) => void; onChanged: () => void }) {
  // `stale` as the dialog opened: the dialog keeps the line it showed then, also when the read after this PC's action lands.
  const [open, setOpen] = useState<{ action: Action; line: StockLineView; stale?: boolean } | null>(null)
  // The lines as shown now: "Gem alligevel" comes after a refusal and a re-read, so it changes what is shown then.
  const shown = useRef(lines)
  useEffect(() => { shown.current = lines })
  const send = ({ changes, write, success, offer }: Sent) => {
    setOpen(null)
    onApply(changes)
    void sendLocationAction(write, { success, offer, rollback: () => onApply(changes.map(change => ({ ...change, delta: -change.delta }))), settled: onChanged })
  }
  /**
   * "Ret antal": sent with the quantity the dialog showed (`expected`), so M: refuses when someone changed it meanwhile
   * (STOCK_CHANGED); the refusal offers "Gem alligevel", which sends the count again without it.
   */
  const setQuantity = (line: StockLineView, next: number, expected?: number) => {
    const now = expected ?? shown.current.find(item => item.id === line.id)?.quantity ?? 0
    send({
      changes: [{ line, delta: next - now }],
      write: () => window.electronWarehouse!.locations.shelfSet({ actionId: newActionId(), label: t(`Ret antal af ${line.material} på ${shelf}`, `Correct ${line.material} on ${shelf}`), location: line.location, material: line.material, quantity: next, ...(expected === undefined ? {} : { expected }) }),
      success: t(`Antallet på ${shelf} er rettet`, `The quantity on ${shelf} has been corrected`),
      offer: expected === undefined ? undefined : error => (errorCode(error) === 'STOCK_CHANGED' ? { label: t('Gem alligevel', 'Save anyway'), onClick: () => setQuantity(line, next) } : null),
    })
  }
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
              <Button size="sm" variant="ghost" onClick={() => setOpen({ action: 'set', line, stale })}><PencilSimple size={14} /> {t('Ret antal', 'Correct quantity')}</Button>
            </span>
          </div>
        ))}
      </div>
      {open && <ShelfLineDialog shelf={shelf} action={open.action} line={open.line} onClose={() => setOpen(null)} onSend={send} onSet={(line, next, expected) => setQuantity(line, next, open.stale || stale ? undefined : expected)} />}
    </>
  )
}

function ShelfLineDialog({ shelf, action, line, onClose, onSend, onSet }: { shelf: string; action: Action; line: StockLineView; onClose: () => void; onSend: (sent: Sent) => void; onSet: (line: StockLineView, next: number, expected: number) => void }) {
  const [quantity, setQuantity] = useState(action === 'set' ? String(line.quantity) : '')
  const [target, setTarget] = useState('')
  const bridge = window.electronWarehouse!.locations
  const amount = quantity.trim() ? Number(quantity) : undefined

  function run(all = false) {
    const actionId = newActionId()
    if (action === 'take') {
      const taken = all ? line.quantity : amount ?? line.quantity
      onSend({
        changes: [{ line, delta: -taken }],
        write: () => bridge.shelfTake({ actionId, label: t(`Tag ${line.material} fra ${shelf}`, `Take ${line.material} from ${shelf}`), location: line.location, material: line.material, quantity: taken }),
        success: t(`${formatNumber(taken)} stk. taget fra ${shelf}`, `${formatNumber(taken)} pcs taken from ${shelf}`),
      })
    } else if (action === 'move') {
      const moved = shownQuantity(quantity, line.quantity)
      const to = target.trim().toUpperCase()
      onSend({
        changes: [{ line, delta: -moved }, { line: { location: locationKeyOf(to), material: line.material, description: line.description }, delta: moved }],
        write: () => bridge.shelfMove({ actionId, label: t(`Flyt ${line.material} fra ${shelf} til ${to}`, `Move ${line.material} from ${shelf} to ${to}`), from: line.location, to, material: line.material, quantity: moved }),
        success: t(`${formatNumber(moved)} stk. flyttet fra ${shelf} til ${to}`, `${formatNumber(moved)} pcs moved from ${shelf} to ${to}`),
      })
    } else {
      // The quantity the dialog shows goes with it: M: refuses the count if someone changed it meanwhile.
      onSet(line, amount ?? 0, line.quantity)
    }
  }

  const title = action === 'take' ? t('Tag fra hylden', 'Take from the shelf') : action === 'move' ? t('Flyt til en anden hylde', 'Move to another shelf') : t('Ret antal', 'Correct quantity')
  const valid = action === 'move' ? Boolean(target.trim()) && locationKeyOf(target) !== line.location && (amount === undefined || (amount >= 1 && amount <= line.quantity)) : action === 'take' ? amount !== undefined && amount >= 1 && amount <= line.quantity : amount !== undefined && amount !== line.quantity
  return (
    <Dialog open onOpenChange={value => { if (!value) onClose() }}>
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
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          {action === 'take' && <Button variant="outline" onClick={() => run(true)}>{t('Tag alt', 'Take all')}</Button>}
          <Button onClick={() => run()} disabled={!valid}>
            {action === 'take' ? t(`Tag ${quantity || 'X'} stk.`, `Take ${quantity || 'X'}`) : action === 'move' ? t('Flyt', 'Move') : t('Gem', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
