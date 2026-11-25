import { Minus, Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { GUIDE_ZOOM_DEFAULT, GUIDE_ZOOM_STEPS, stepGuideZoom } from '@/lib/guideZoom'

interface GuideZoomControlProps {
  zoom: number
  onChange: (zoom: number) => void
  labels: { zoomOut: string; zoomIn: string; zoomReset: string }
}

export function GuideZoomControl({ zoom, onChange, labels }: GuideZoomControlProps) {
  const min = GUIDE_ZOOM_STEPS[0]
  const max = GUIDE_ZOOM_STEPS[GUIDE_ZOOM_STEPS.length - 1]
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-muted/40 self-stretch sm:self-end">
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-xs" aria-label={labels.zoomOut} title={labels.zoomOut}
        disabled={zoom <= min} onClick={() => onChange(stepGuideZoom(zoom, -1))}>
        <Minus size={14} weight="bold" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-xs flex-1 tabular-nums" title={labels.zoomReset}
        onClick={() => onChange(GUIDE_ZOOM_DEFAULT)}>
        {`${zoom} %`}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-xs" aria-label={labels.zoomIn} title={labels.zoomIn}
        disabled={zoom >= max} onClick={() => onChange(stepGuideZoom(zoom, 1))}>
        <Plus size={14} weight="bold" />
      </Button>
    </div>
  )
}
