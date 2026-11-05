import { useMemo } from 'react'
import { MapTrifold } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { frontData, type MapContext } from '@/lib/warehouse/layout/map'
import type { Peek } from '@/lib/warehouse/layout/peek'
import { t } from '@/lib/warehouse/text'
import type { LayoutItemType, WarehouseLayout } from '@/types/warehouse'
import { LayoutCanvas } from '../layout/LayoutCanvas'
import { RackFront } from '../layout/RackFront'

// Items with several places show their front; a floor area or a special place only the small map.
const FRONTED: LayoutItemType[] = ['rack', 'floorrow', 'shelfrack']

/** One place in "Sæt palle på plads": where in the hall (small map) and where in the rack (the front cut down to the place ± 1). Read only. */
export function PlacePeek({ peek, ctx, layout, chosen, onChoose, onShowOnMap }: {
  peek: Peek | null; ctx: MapContext; layout: WarehouseLayout; chosen: boolean; onChoose?: () => void; onShowOnMap: () => void
}) {
  const item = peek?.item
  const fronted = !!item && FRONTED.includes(item.type) && item.slots.length > 0
  const front = useMemo(() => (item && fronted ? frontData(item, ctx) : null), [item, fronted, ctx])
  if (!peek) return null

  return (
    <div data-testid="place-peek" className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-sm">
          <span className="font-mono text-base font-bold">{peek.name}</span>
          <span className="text-muted-foreground"> · </span>{peek.title}
          {peek.level && <><span className="text-muted-foreground"> · </span><span className="font-semibold text-amber-700 dark:text-amber-400">{peek.level}</span></>}
        </h3>
        {!chosen && (
          <>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{t('Forslag – ikke valgt', 'Suggestion – not chosen')}</span>
            {onChoose && <Button size="sm" variant="outline" className="h-7" onClick={onChoose}>{t('Vælg', 'Choose')}</Button>}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-60 flex-none overflow-hidden rounded border bg-card">
          <LayoutCanvas layout={layout} highlight={[peek.item.id]} strongHighlight floorView={peek.floor} zoom={1} readOnly team={ctx.team} />
        </div>
        {fronted && front && (
          <div className="min-w-0 flex-1 overflow-x-auto">
            <RackFront item={peek.item} mode="view" status={front.status} content={front.content} highlight={peek.slotId} visibleSlots={peek.visible} />
          </div>
        )}
      </div>
      <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onShowOnMap}><MapTrifold size={14} /> {t('Vis på kort', 'Show on map')}</Button>
    </div>
  )
}
