import { useState } from 'react'
import { Minus, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage } from '@/lib/warehouse/errors'
import type { LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { RackCard } from '@/types/warehouse'

/** The rack card's administration (managers and Placerings admins): add a shelf, remove the top one, delete the rack. `drawn`: shelves are added on the drawing. */
export function RackAdmin({ card, drawn, onOpen, onChanged }: { card: RackCard; drawn: boolean; onOpen: (target: LocationsTarget) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const bridge = window.electronWarehouse!.locations
  const top = card.shelves[0]
  const topEmpty = Boolean(top && !top.stock.length)

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    try {
      await action()
      onChanged()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const addShelf = () => run('add', async () => {
    const { location } = await bridge.addShelf({ rack: card.rack })
    toast.success(t(`${location.name} er tilføjet`, `${location.name} has been added`))
  })
  const removeTop = () => run('remove', async () => {
    const result = await bridge.deleteLocations({ locations: [top.location.id] })
    if (result.kept.length) toast.error(result.kept[0].reason)
    else toast.success(t(`${top.location.name} er fjernet`, `${top.location.name} has been removed`))
  })
  const deleteRack = () => run('delete', async () => {
    await bridge.deleteLocations({ locations: card.shelves.map(shelf => shelf.location.id), allOrNothing: true })
    toast.success(t(`Reol ${card.rack} er slettet`, `Rack ${card.rack} has been deleted`))
    setConfirm(false)
    onOpen({ kind: 'admin' })
  })

  return (
    <span className="ml-auto flex flex-wrap gap-2">
      {!drawn && <Button size="sm" variant="outline" onClick={() => addShelf()} loading={busy === 'add'} disabled={busy !== null}><Plus size={14} /> {t('Tilføj hylde', 'Add shelf')}</Button>}
      <Button size="sm" variant="outline" onClick={() => removeTop()} loading={busy === 'remove'} disabled={busy !== null || !topEmpty || card.shelves.length < 2}
        title={topEmpty ? undefined : t('Den øverste hylde er ikke tom', 'The top shelf is not empty')}><Minus size={14} /> {t('Fjern hylde', 'Remove shelf')}</Button>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)} disabled={busy !== null}><Trash size={14} /> {t('Slet reol', 'Delete rack')}</Button>
      {confirm && (
        <Dialog open onOpenChange={value => { if (!value && busy === null) setConfirm(false) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(`Slet reol ${card.rack}?`, `Delete rack ${card.rack}?`)}</DialogTitle>
              <DialogDescription>{t(`Alle ${card.shelves.length} hylder slettes – kun hvis de er tomme. Sletningen står i loggen og kan fortrydes.`, `All ${card.shelves.length} shelves are deleted – only if they are empty. The deletion is logged and can be undone.`)}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy !== null}>{t('Annullér', 'Cancel')}</Button>
              <Button variant="destructive" onClick={() => deleteRack()} loading={busy === 'delete'}><Trash size={16} /> {t('Slet reol', 'Delete rack')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </span>
  )
}
