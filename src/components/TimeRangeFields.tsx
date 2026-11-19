import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Optional start-end clock time ('HH:mm'); both may be left empty. */
export function TimeRangeFields({ id, label, start, end, onStart, onEnd, hint, clearText = 'Ryd', startLabel = 'Starttid', endLabel = 'Sluttid', disabled }: {
  id: string
  label: ReactNode
  start: string
  end: string
  onStart: (value: string) => void
  onEnd: (value: string) => void
  hint?: ReactNode
  clearText?: ReactNode
  startLabel?: string
  endLabel?: string
  disabled?: boolean
}) {
  return (
    <div>
      <Label htmlFor={`${id}-start`}>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Input id={`${id}-start`} type="time" step={300} value={start} disabled={disabled} onChange={(e) => onStart(e.target.value)} aria-label={startLabel} className="w-32" />
        <span className="text-muted-foreground" aria-hidden="true">–</span>
        <Input id={`${id}-end`} type="time" step={300} value={end} disabled={disabled} onChange={(e) => onEnd(e.target.value)} aria-label={endLabel} className="w-32" />
        {(start || end) && !disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { onStart(''); onEnd('') }}>
            {clearText}
          </Button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
