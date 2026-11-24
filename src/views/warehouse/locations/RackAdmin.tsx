import { useState } from 'react'
import { Minus, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { sendLocationAction } from '@/lib/warehouse/locationActions'
import { locationKeyOf, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { Location, RackCard } from '@/types/warehouse'

/**
 * The rack card's administration (managers and Placerings admins): add a shelf, remove the top one, delete the rack.
 * `drawn`: shelves are added on the drawing. Each change shows on the card at once (`onPatch`) and M: gets it in the
 * background (15-40 s); a refusal puts the card back.
 */
export function RackAdmin({ card, drawn, onOpen, onPatch, onChanged }: { card: RackCard; drawn: boolean; onOpen: (target: LocationsTarget) => void; onPatch: (change: (card: RackCard) => RackCard) => void; onChanged: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const bridge = window.electronWarehouse!.locations
  const top = card.shelves[0]
  const topEmpty = Boolean(top && !top.stock.length)
  const next = Math.max(0, ...card.shelves.map(({ location }) => location.shelf || 0)) + 1

  // The backend's addShelf: the next number, with the rack's area and purpose.
  function addShelf() {
    const name = `${card.rack} H${next}`
    const location: Location = { id: locationKeyOf(name), name, area: card.area, type: 'Hylde', purpose: card.purpose, capacity: 1, fixedMaterials: [], rack: card.rack, shelf: next, active: true, note: '', updatedAt: Date.now(), updatedBy: { email: '', name: '' } }
    onPatch(value => ({ ...value, shelves: [{ location, stock: [] }, ...value.shelves] }))
    void sendLocationAction(() => bridge.addShelf({ rack: card.rack }), {
      success: t(`${name} er tilføjet`, `${name} has been added`),
      rollback: () => onPatch(value => ({ ...value, shelves: value.shelves.filter(shelf => shelf.location.id !== location.id) })),
      settled: onChanged,
    })
  }
  function removeTop() {
    const shelf = top
    onPatch(value => ({ ...value, shelves: value.shelves.filter(item => item.location.id !== shelf.location.id) }))
    void sendLocationAction(() => bridge.deleteLocations({ locations: [shelf.location.id] }), {
      success: t(`${shelf.location.name} er fjernet`, `${shelf.location.name} has been removed`),
      confirmed: result => { if (result.kept.length) toast.error(result.kept[0].reason) },
      rollback: () => onPatch(value => (value.shelves.some(item => item.location.id === shelf.location.id) ? value : { ...value, shelves: [shelf, ...value.shelves] })),
      hides: [shelf.location.id],
      settled: onChanged,
    })
  }
  function deleteRack() {
    setConfirm(false)
    onOpen({ kind: 'admin' })
    const ids = card.shelves.map(shelf => shelf.location.id)
    void sendLocationAction(() => bridge.deleteLocations({ locations: ids, allOrNothing: true }), {
      success: t(`Reol ${card.rack} er slettet`, `Rack ${card.rack} has been deleted`),
      hides: ids,
      settled: onChanged,
    })
  }

  return (
    <span className="ml-auto flex flex-wrap gap-2">
      {!drawn && <Button size="sm" variant="outline" onClick={() => addShelf()} disabled={next > 99}><Plus size={14} /> {t('Tilføj hylde', 'Add shelf')}</Button>}
      <Button size="sm" variant="outline" onClick={() => removeTop()} disabled={!topEmpty || card.shelves.length < 2}
        title={topEmpty ? undefined : t('Den øverste hylde er ikke tom', 'The top shelf is not empty')}><Minus size={14} /> {t('Fjern hylde', 'Remove shelf')}</Button>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}><Trash size={14} /> {t('Slet reol', 'Delete rack')}</Button>
      {confirm && (
        <Dialog open onOpenChange={value => { if (!value) setConfirm(false) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(`Slet reol ${card.rack}?`, `Delete rack ${card.rack}?`)}</DialogTitle>
              <DialogDescription>{t(`Alle ${card.shelves.length} hylder slettes – kun hvis de er tomme. Sletningen står i loggen og kan fortrydes.`, `All ${card.shelves.length} shelves are deleted – only if they are empty. The deletion is logged and can be undone.`)}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(false)}>{t('Annullér', 'Cancel')}</Button>
              <Button variant="destructive" onClick={() => deleteRack()}><Trash size={16} /> {t('Slet reol', 'Delete rack')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </span>
  )
}
