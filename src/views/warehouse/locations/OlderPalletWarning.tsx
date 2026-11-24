import { Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { formatAge } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { MaterialCard } from '@/types/warehouse'

/** Tag and Fyld op ask once before a younger pallet is used while an older one stands (FIFO). Nothing without that older pallet. */
export function OlderPalletWarning({ oldest, confirmLabel, onCancel, onConfirm }: { oldest: MaterialCard['reserve'][number] | undefined; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  if (!oldest) return null
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <Warning size={16} className="text-amber-600" />
      <span className="flex-1">{t(`Der står en ældre palle på ${oldest.location} (${formatAge(oldest.ageDays)}).`, `There is an older pallet on ${oldest.location} (${formatAge(oldest.ageDays)}).`)}</span>
      <Button size="sm" variant="ghost" onClick={onCancel}>{t('Annullér', 'Cancel')}</Button>
      <Button size="sm" variant="outline" onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  )
}
