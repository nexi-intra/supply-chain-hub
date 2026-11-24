import { memo, useMemo } from 'react'
import { MapTrifold } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { frontData, type MapContext } from '@/lib/warehouse/layout/map'
import type { Peek } from '@/lib/warehouse/layout/peek'
import { t } from '@/lib/warehouse/text'
import type { LayoutItemType, WarehouseLayout } from '@/types/warehouse'
import { LayoutCanvas, type FloorView } from '../layout/LayoutCanvas'
import { RackFront } from '../layout/RackFront'

// Items with several places show their front; a floor area or a special place only the small map.
const FRONTED: LayoutItemType[] = ['rack', 'floorrow', 'shelfrack']

/** The small hall map. The whole hall SVG redraws only when the drawing, the item, its floor or the team change – not on every keystroke in the form. Its height is capped; the hall keeps its shape. */
const MiniMap = memo(function MiniMap({ layout, itemId, floor, team }: { layout: WarehouseLayout; itemId: string; floor: FloorView; team: MapContext['team'] }) {
  const highlight = useMemo(() => [itemId], [itemId])
  return (
    <div className="w-60 flex-none overflow-hidden rounded border bg-card [&>svg]:max-h-48">
      <LayoutCanvas layout={layout} highlight={highlight} strongHighlight floorView={floor} zoom={1} readOnly team={team} />
    </div>
  )
})

// Its props are the peek's memoised values, so the front redraws only when the place or what stands there changes.
const PeekFront = memo(RackFront)

/** One place in "Sæt palle på plads": where in the hall (small map) and where in the rack (the front cut down to the place ± 1). Read only. */
export function PlacePeek({ peek, ctx, layout, chosen, onChoose, onShowOnMap }: {
  peek: Peek | null; ctx: MapContext; layout: WarehouseLayout; chosen: boolean; onChoose?: () => void; onShowOnMap: () => void
}) {
  const item = peek?.item
  const fronted = !!item && FRONTED.includes(item.type) && item.slots.length > 0
  const front = useMemo(() => (item && fronted ? frontData(item, ctx, { clickable: false }) : null), [item, fronted, ctx])
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
        <MiniMap layout={layout} itemId={peek.item.id} floor={peek.floor} team={ctx.team} />
        {fronted && front && (
          <div className="min-w-0 flex-1 overflow-x-auto">
            <PeekFront item={peek.item} mode="view" status={front.status} content={front.content} highlight={peek.slotId} visibleSlots={peek.visible} />
          </div>
        )}
      </div>
      <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onShowOnMap}><MapTrifold size={14} /> {t('Vis på kort', 'Show on map')}</Button>
    </div>
  )
}
