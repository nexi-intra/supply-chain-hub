import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fromLocalInput, suggestedEnd, toLocalInput } from '@/lib/timeclock'
import { currentWarehouseLanguage, t } from '@/lib/warehouse/text'

interface LongRunDialogProps {
  /** Kept mounted with `open`, the time the person typed survives a refusal. */
  open?: boolean
  startedAt: number
  taskName: string
  /** The earliest end the main process accepts: the last start or resume. */
  earliest?: number
  onCancel: () => void
  onStop: (endAt: number) => void
  busy: boolean
}

/** The clock or the softwareload task ran for more than 10 hours: when did the work really stop? */
export function LongRunDialog({ open = true, startedAt, taskName, earliest = startedAt, onCancel, onStop, busy }: LongRunDialogProps) {
  const [value, setValue] = useState(() => toLocalInput(suggestedEnd({ startedAt, earliest, now: Date.now() })))
  const started = new Date(startedAt).toLocaleString(currentWarehouseLanguage() === 'da' ? 'da-DK' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
  // The field has whole minutes; the minute of the earliest end means the earliest end itself.
  const chosen = () => { const at = fromLocalInput(value); return at < earliest && earliest - at < 60_000 ? earliest : at }
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Hvornår stoppede du?', 'When did you stop?')}</DialogTitle>
          <DialogDescription>{t(`Uret startede ${started} på ${taskName} og har kørt i over 10 timer. Vælg hvornår arbejdet reelt stoppede.`, `The clock started ${started} on ${taskName} and has run for more than 10 hours. Choose when the work really stopped.`)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="timeclock-end">{t('Sluttidspunkt', 'End time')}</Label>
          <Input id="timeclock-end" type="datetime-local" value={value} min={toLocalInput(earliest)} max={toLocalInput(Date.now())} onChange={event => setValue(event.target.value)} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onStop(Date.now())} disabled={busy}>{t('Det passer, stop nu', 'That is right, stop now')}</Button>
          <Button onClick={() => onStop(chosen())} loading={busy} disabled={!value}>{t('Gem med det sluttidspunkt', 'Save with that end time')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
