import { useEffect, useRef, useState } from 'react'
import { ArrowCounterClockwise, MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect } from '@/components/warehouse/ui'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatTime } from '@/lib/warehouse/format'
import { sendLocationAction, startLocationsRead } from '@/lib/warehouse/locationActions'
import { describeEvent, describeUndoEffect, newActionId, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationEventType, LocationLog, WarehouseUser } from '@/types/warehouse'

type Line = LocationLog['events'][number]

const TYPES = (): { value: LocationEventType | ''; label: string }[] => [
  { value: '', label: t('Alle handlinger', 'All actions') },
  { value: 'putaway', label: t('Sat på plads', 'Put away') },
  { value: 'take', label: t('Taget', 'Taken') },
  { value: 'move', label: t('Flyttet', 'Moved') },
  { value: 'refill', label: t('Fyldt op', 'Refilled') },
  { value: 'sloc', label: 'Storage location' },
  { value: 'edit-pallet', label: t('Rettet palle', 'Pallet edited') },
  { value: 'location', label: t('Placering ændret', 'Location changed') },
  { value: 'import', label: t('Import', 'Import') },
  { value: 'undo', label: t('Fortrudt', 'Undone') },
  { value: 'layout', label: t('Tegning', 'Drawing') },
]
const PERIODS = (): { days: number; label: string }[] => [
  { days: 1, label: t('I dag', 'Today') },
  { days: 7, label: t('7 dage', '7 days') },
  { days: 30, label: t('30 dage', '30 days') },
  { days: 90, label: t('3 måneder', '3 months') },
]

/** The card a log line opens: the pallet, else the place, else the material. */
const targetOf = (line: Line): LocationsTarget | null => (line.pallet ? { kind: 'pallet', id: line.pallet } : line.location ? { kind: 'location', id: line.location } : line.material ? { kind: 'material', id: line.material } : null)

/** Everything that happened in Placeringer, newest first; managers and Placerings admins undo one action at a time. */
export function LocationsLog({ query: initial, user, version, onOpen, onChanged }: { query?: string; user: WarehouseUser; version: number; onOpen: (target: LocationsTarget) => void; onChanged: () => void }) {
  const [log, setLog] = useState<LocationLog | null>(null)
  const [query, setQuery] = useState(initial || '')
  const [person, setPerson] = useState('')
  const [type, setType] = useState<LocationEventType | ''>('')
  const [days, setDays] = useState(7)
  const [confirm, setConfirm] = useState<Line | null>(null)
  const bridge = window.electronWarehouse!.locations

  // The filters the shown log was read with: a read for other filters always replaces it.
  const shownFilters = useRef('')
  useEffect(() => {
    let current = true
    const filters = JSON.stringify([query.trim(), person, type, days])
    const timer = window.setTimeout(() => {
      // A re-read during an undo on its way to M: is older than the log, which already shows it undone.
      const fresh = startLocationsRead()
      bridge.log({ query: query.trim() || undefined, person: person || undefined, type: type || undefined, days })
        .then(result => {
          if (!current || (shownFilters.current === filters && !fresh())) return
          shownFilters.current = filters
          setLog(result)
        })
        .catch(error => toast.error(errorMessage(error)))
    }, 200)
    return () => { current = false; window.clearTimeout(timer) }
  }, [bridge, query, person, type, days, version])

  // The log offers an undo only when the backend has checked it can be done, so it shows as undone at once; M: does it in
  // the background (15-40 s) and the log is read again then. A refusal (someone changed it meanwhile) is shown.
  function undo(line: Line) {
    setConfirm(null)
    const tx = line.tx || line.id
    const at = Date.now()
    const by = { email: user.email, name: user.fullName || user.email }
    const mark = (undone: boolean) => setLog(value => value && { ...value, events: value.events.map(event => ((event.tx || event.id) === tx ? (undone ? { ...event, undoneAt: at, undoneBy: by } : { ...event, undoneAt: undefined, undoneBy: undefined }) : event)) })
    mark(true)
    void sendLocationAction(() => bridge.undo({ actionId: newActionId(), label: t(`Fortryd: ${describeEvent(line)}`, `Undo: ${describeEvent(line)}`), eventId: line.id, at: line.at }), {
      success: t('Handlingen er fortrudt', 'The action has been undone'),
      rollback: () => mark(false),
      settled: onChanged,
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Log', 'Log')}</h1>
        <p className="text-sm text-muted-foreground">{log?.canUndo
          ? t('Alt, der er sket i Placeringer, nyeste først. Du kan fortryde én handling ad gangen.', 'Everything that happened in Locations, newest first. You can undo one action at a time.')
          : t('Alt, der er sket i Placeringer, nyeste først. Managere og Placerings admins kan fortryde.', 'Everything that happened in Locations, newest first. Managers and Placerings admins can undo.')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Materiale, placering eller 49/50-nummer', 'Material, location or 49/50 number')} className="pl-8" aria-label={t('Søg i loggen', 'Search the log')} />
        </div>
        <NativeSelect value={person} onChange={event => setPerson(event.target.value)} aria-label={t('Person', 'Person')}>
          <option value="">{t('Alle personer', 'Everyone')}</option>
          {(log?.people || []).map(item => <option key={item.email} value={item.email}>{item.name}</option>)}
        </NativeSelect>
        <NativeSelect value={type} onChange={event => setType(event.target.value as LocationEventType | '')} aria-label={t('Handling', 'Action')}>
          {TYPES().map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </NativeSelect>
        <div className="flex gap-1" role="group" aria-label={t('Periode', 'Period')}>
          {PERIODS().map(item => (
            <button key={item.days} type="button" aria-pressed={days === item.days} onClick={() => setDays(item.days)}
              className={cn('rounded-md border px-2.5 py-1.5 text-xs', days === item.days ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}>{item.label}</button>
          ))}
        </div>
      </div>

      {!log && <Skeleton className="h-64 rounded-xl" />}
      {log && !log.events.length && <p className="py-6 text-center text-sm text-muted-foreground">{t('Ingen handlinger i perioden.', 'No actions in the period.')}</p>}
      {log && log.events.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {log.events.map(line => {
              const target = targetOf(line)
              const undone = Boolean(line.undoneAt)
              return (
                <div key={line.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-xs text-muted-foreground" title={formatDateTime(line.at)}>{days > 1 ? formatDateTime(line.at) : formatTime(line.at)}</span>
                  <span className="w-32 shrink-0 truncate font-medium">{line.by?.name}</span>
                  <button type="button" disabled={!target} onClick={() => target && onOpen(target)} className={cn('min-w-0 flex-1 text-left', target && 'hover:underline', undone && 'text-muted-foreground line-through')}>
                    {describeEvent(line)}{line.material && line.type !== 'location' ? <span className="ml-2 font-mono text-xs text-muted-foreground">{line.material}</span> : null}
                  </button>
                  {undone && <span className="text-xs text-muted-foreground">{t(`Fortrudt af ${line.undoneBy?.name} kl. ${formatTime(line.undoneAt!)}`, `Undone by ${line.undoneBy?.name} at ${formatTime(line.undoneAt!)}`)}</span>}
                  {log.canUndo && !undone && line.type !== 'undo' && (
                    <Button size="sm" variant="outline" disabled={!line.canUndo} title={line.canUndo ? undefined : t(line.reason || 'Kan ikke fortrydes', 'Cannot be undone')} onClick={() => setConfirm(line)}>
                      <ArrowCounterClockwise size={14} /> {t('Fortryd', 'Undo')}
                    </Button>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {confirm && (
        <Dialog open onOpenChange={open => { if (!open) setConfirm(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Fortryd handlingen?', 'Undo the action?')}</DialogTitle>
              <DialogDescription>{t(`Hele handlingen "${describeEvent(confirm)}" af ${confirm.by?.name} kl. ${formatTime(confirm.at)} bliver gjort om. Fortrydelsen kommer selv i loggen.`, `The whole action "${describeEvent(confirm)}" by ${confirm.by?.name} at ${formatTime(confirm.at)} is reverted. The undo is itself logged.`)}</DialogDescription>
            </DialogHeader>
            {confirm.effect && (
              <ul className="list-disc space-y-1 pl-5 text-sm" aria-label={t('Det sker', 'What happens')}>
                {describeUndoEffect(confirm.effect).map(line => <li key={line}>{line}</li>)}
              </ul>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(null)}>{t('Annullér', 'Cancel')}</Button>
              <Button onClick={() => undo(confirm)}><ArrowCounterClockwise size={16} /> {t('Fortryd', 'Undo')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
