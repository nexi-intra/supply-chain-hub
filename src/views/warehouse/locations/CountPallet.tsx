import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumber } from '@/lib/warehouse/format'
import { sendLocationAction } from '@/lib/warehouse/locationActions'
import { newActionId } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { MaterialCard } from '@/types/warehouse'

type Reserve = MaterialCard['reserve'][number]

/**
 * "Tæl pallen" on a pallet with an unknown quantity: one field, saved as the pallet's quantity (an edit of the pallet,
 * kept in the log with before and after). `onCounted` shows it at once; M: gets it in the background.
 */
export function CountPallet({ pallet, onCounted, onDone }: { pallet: Reserve; onCounted: (quantity: number) => void; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState('')
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>{t('Tæl pallen', 'Count the pallet')}</Button>

  function save() {
    if (!count) return
    const quantity = Number(count)
    onCounted(quantity)
    setOpen(false)
    setCount('')
    void sendLocationAction(() => window.electronWarehouse!.locations.editPallet({
      actionId: newActionId(), label: t(`Tæl pallen med ${pallet.material} på ${pallet.location}`, `Count the pallet with ${pallet.material} on ${pallet.location}`), pallet: pallet.id, changes: { quantity },
    }), {
      success: t(`Pallen på ${pallet.location} har nu ${formatNumber(quantity)} stk.`, `The pallet on ${pallet.location} now has ${formatNumber(quantity)} pcs`),
      settled: onDone,
    })
  }

  return (
    <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); save() }}>
      <Input autoFocus inputMode="numeric" value={count} placeholder={t('stk.', 'pcs')} className="h-9 w-20" aria-label={t('Stk. på pallen', 'Pieces on the pallet')}
        onChange={event => setCount(event.target.value.replace(/\D/g, ''))} />
      <Button type="submit" size="sm" variant="outline" disabled={!count}>{t('Gem antal', 'Save quantity')}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setCount('') }}>{t('Annullér', 'Cancel')}</Button>
    </form>
  )
}
