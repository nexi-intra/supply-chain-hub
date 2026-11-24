import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { FoundElsewhere, SerialListItem } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'

type Where = Pick<FoundElsewhere, 'countName' | 'place' | 'byName' | 'at'>

/** A serial this count misses that another count of the status registered. */
export function foundElsewhereText(item: Where): string {
  return item.place
    ? t(`Fundet i '${item.countName}' på ${item.place}`, `Found in '${item.countName}' at ${item.place}`)
    : t(`Fundet i '${item.countName}'`, `Found in '${item.countName}'`)
}

export function FoundElsewhereNote({ item, className }: { item: Where; className?: string }) {
  const who = `${item.byName} · ${formatDateTime(item.at)}`
  return <span className={cn('text-xs font-medium text-amber-700 dark:text-amber-300', className)} title={who}>{foundElsewhereText(item)} <span className="font-normal text-muted-foreground">({who})</span></span>
}

/**
 * APPROVAL_FOUND_ELSEWHERE: the missing serials (`serials`, from the refusal) that another count of the status found,
 * with where. Approving goes on only with exactly this list confirmed.
 */
export function FoundElsewhereDialog({ id, serials, onCancel, onConfirm }: { id: string; serials: string[]; onCancel: () => void; onConfirm: () => void }) {
  const [items, setItems] = useState<SerialListItem[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    window.electronWarehouse!.counts.serials({ id, kind: 'found-elsewhere', limit: 2000 })
      .then(result => { if (!cancelled) setItems(result.items) })
      .catch(error => { if (!cancelled) setFailed(errorMessage(error)) })
    return () => { cancelled = true }
  }, [id])
  const bySerial = new Map((items || []).map(item => [item.serial, item]))
  return (
    <Dialog open onOpenChange={value => { if (!value) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Fundet i en anden optælling', 'Found in another count')}</DialogTitle>
          <DialogDescription>
            {t('Disse serienumre mangler her, men er fundet i en anden optælling i statussen. Godkendes de som manglende, afskrives varer, der er fundet. Flyt dem i SAP, eller godkend alligevel.', 'These serial numbers are missing here, but were found in another count of the status. If they are approved as missing, goods that were found are written off. Move them in SAP, or approve anyway.')}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-60 space-y-1 overflow-auto rounded-md border px-3 py-2 text-sm">
          {serials.map(serial => {
            const item = bySerial.get(serial)
            return (
              <li key={serial}>
                <span className="font-mono">{serial}</span>
                {item?.material && <span className="ml-2 font-mono text-xs text-muted-foreground">{item.material}</span>}
                {item?.foundElsewhere && <FoundElsewhereNote item={item.foundElsewhere} className="block" />}
              </li>
            )
          })}
        </ul>
        {failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>{t('Annullér', 'Cancel')}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!serials.length}>{t('Godkend alligevel', 'Approve anyway')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
