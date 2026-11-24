import { useCallback, useEffect, useMemo, useState } from 'react'
import { PencilSimple, Trash, UsersThree } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect } from '@/components/warehouse/ui'
import { useKV } from '@/hooks/useKV'
import { formatDuration, fromLocalInput, periodRange, summarizeEntries, toLocalInput, type PeriodKind } from '@/lib/timeclock'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatTime } from '@/lib/warehouse/format'
import { currentWarehouseLanguage, t, warehouseLocale } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { ShiftRole } from '@/lib/types'
import type { TimeclockBridge, TimeclockEntry } from '@/types/warehouse'

type Loaded = Awaited<ReturnType<TimeclockBridge['entries']>>
type Period = PeriodKind | 'custom'

const POLL_MS = 60_000
const PERIODS: { value: Period; label: () => string }[] = [
  { value: 'today', label: () => t('I dag', 'Today') },
  { value: 'week', label: () => t('Denne uge', 'This week') },
  { value: 'month', label: () => t('Denne måned', 'This month') },
  { value: 'lastMonth', label: () => t('Sidste måned', 'Last month') },
  { value: 'custom', label: () => t('Vælg periode', 'Choose period') },
]

const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(warehouseLocale(), { weekday: 'short', day: 'numeric', month: 'short' })

/** Managers only (the main process answers nobody else): every registration of the team, statistics and corrections. */
export function TimeclockOverview() {
  const [period, setPeriod] = useState<Period>('week')
  const [custom, setCustom] = useState(() => periodRange('month', new Date()))
  const { from, to } = period === 'custom' ? custom : periodRange(period, new Date())
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [person, setPerson] = useState('')
  const [task, setTask] = useState('')
  const [editing, setEditing] = useState<TimeclockEntry | null>(null)
  const language = currentWarehouseLanguage()

  const load = useCallback(async () => {
    try {
      setData(await window.electronWarehouse!.timeclock.entries({ from, to }))
      setFailed(null)
    } catch (error) {
      setFailed(errorMessage(error))
    }
  }, [from, to])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const entries = data?.entries ?? []
  const filtered = useMemo(() => entries.filter(entry => (!person || entry.email === person) && (!task || entry.taskId === task)), [entries, person, task])
  const summary = useMemo(() => summarizeEntries(filtered), [filtered])
  const people = useMemo(() => [...new Map(entries.map(entry => [entry.email, entry.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'da')), [entries])
  const tasks = useMemo(() => [...new Map(entries.map(entry => [entry.taskId, entry.taskName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'da')), [entries])

  const remove = async (entry: TimeclockEntry) => {
    if (!window.confirm(t(`Slet ${entry.name}s registrering på ${entry.taskName} (${formatDuration(entry.workedMs, 'da')})?`, `Delete ${entry.name}'s registration on ${entry.taskName} (${formatDuration(entry.workedMs, 'en')})?`))) return
    try {
      await window.electronWarehouse!.timeclock.deleteEntry({ email: entry.email, id: entry.id })
      toast.success(t('Registreringen er slettet', 'The registration is deleted'))
    } catch (error) {
      toast.error(errorMessage(error))
    }
    void load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
          {PERIODS.map(item => (
            <Button key={item.value} size="sm" variant={period === item.value ? 'default' : 'ghost'} onClick={() => setPeriod(item.value)}>{item.label()}</Button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label htmlFor="tc-from">{t('Fra', 'From')}</Label><Input id="tc-from" type="date" value={custom.from} max={custom.to} onChange={event => event.target.value && setCustom(current => ({ ...current, from: event.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="tc-to">{t('Til', 'To')}</Label><Input id="tc-to" type="date" value={custom.to} min={custom.from} onChange={event => event.target.value && setCustom(current => ({ ...current, to: event.target.value }))} /></div>
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <NativeSelect aria-label={t('Person', 'Person')} value={person} onChange={event => setPerson(event.target.value)}>
            <option value="">{t('Alle personer', 'Everyone')}</option>
            {people.map(([email, name]) => <option key={email} value={email}>{name}</option>)}
          </NativeSelect>
          <NativeSelect aria-label={t('Opgave', 'Task')} value={task} onChange={event => setTask(event.target.value)}>
            <option value="">{t('Alle opgaver', 'All tasks')}</option>
            {tasks.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </NativeSelect>
        </div>
      </div>

      {failed && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{failed}</p>}
      {!data && !failed && <Skeleton className="h-64 rounded-xl" />}

      {data && (
        <>
          {data.running.length > 0 && (
            <Card className="gap-3 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><UsersThree size={18} /> {t('I gang lige nu', 'On the clock right now')}</h2>
              <ul className="flex flex-wrap gap-2">
                {data.running.map(item => (
                  <li key={item.email} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: item.taskColor }} aria-hidden="true" />
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground">{item.taskName} · {item.paused ? t('pause', 'break') : t('siden', 'since')} {formatTime(item.startedAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label={t('Registreret tid', 'Registered time')} value={formatDuration(summary.totalMs, language)} />
            <Figure label={t('Registreringer', 'Registrations')} value={String(summary.count)} />
            <Figure label={t('Personer', 'People')} value={String(summary.people)} />
            <Figure label={t('Gennemsnit pr. registrering', 'Average per registration')} value={formatDuration(summary.averageMs, language)} />
          </div>

          {summary.count === 0 ? (
            <Card className="items-center border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t('Ingen registreringer i perioden.', 'No registrations in the period.')}</Card>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Bars title={t('Tid pr. opgave', 'Time per task')} rows={summary.byTask.map(item => ({ key: item.taskId, label: item.taskName, color: item.taskColor, ms: item.ms, note: `${item.count} ${t('reg.', 'reg.')}` }))} />
                <Bars title={t('Tid pr. person', 'Time per person')} rows={summary.byPerson.map(item => ({ key: item.email, label: item.name, ms: item.ms, note: `${item.count} ${t('reg.', 'reg.')}` }))} />
              </div>
              <Bars title={t('Tid pr. dag', 'Time per day')} rows={summary.byDay.map(item => ({ key: item.date, label: dayLabel(item.date), ms: item.ms }))} />
              <EntryTable entries={filtered} onEdit={setEditing} onDelete={remove} />
            </>
          )}
        </>
      )}

      {editing && <EditEntryDialog entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  )
}

function Bars({ title, rows }: { title: string; rows: { key: string; label: string; ms: number; color?: string; note?: string }[] }) {
  const max = Math.max(1, ...rows.map(row => row.ms))
  const language = currentWarehouseLanguage()
  return (
    <Card className="gap-3 px-5 py-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="space-y-2">
        {rows.map(row => (
          <li key={row.key} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate" title={row.label}>{row.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (row.ms / max) * 100)}%`, ...(row.color ? { backgroundColor: row.color } : {}) }} />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{formatDuration(row.ms, language)}{row.note ? ` · ${row.note}` : ''}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function EntryTable({ entries, onEdit, onDelete }: { entries: TimeclockEntry[]; onEdit: (entry: TimeclockEntry) => void; onDelete: (entry: TimeclockEntry) => void }) {
  const language = currentWarehouseLanguage()
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <h2 className="border-b px-5 py-3 text-sm font-semibold">{t('Registreringer', 'Registrations')} ({entries.length})</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t('Dag', 'Day')}</th>
              <th className="px-4 py-2 font-medium">{t('Person', 'Person')}</th>
              <th className="px-4 py-2 font-medium">{t('Opgave', 'Task')}</th>
              <th className="px-4 py-2 font-medium">{t('Start – slut', 'Start – end')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Pause', 'Break')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Tid', 'Time')}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map(entry => (
              <tr key={`${entry.email}-${entry.id}`}>
                <td className="whitespace-nowrap px-4 py-2">{dayLabel(entry.date)}</td>
                <td className="px-4 py-2">{entry.name}</td>
                <td className="px-4 py-2"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: entry.taskColor }} aria-hidden="true" />{entry.taskName}</span></td>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                  {formatTime(entry.startedAt)} – {formatTime(entry.endedAt)}
                  {entry.endCorrected && <Badge variant="outline" className="ml-2">{t('sluttid valgt', 'end chosen')}</Badge>}
                  {entry.editedBy && <Badge variant="outline" className="ml-2" title={t(`Rettet af ${entry.editedBy.name}`, `Edited by ${entry.editedBy.name}`)}>{t('rettet', 'edited')}</Badge>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{entry.pausedMs ? formatDuration(entry.pausedMs, language) : '–'}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{formatDuration(entry.workedMs, language)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  <Button size="icon" variant="ghost" aria-label={t('Ret', 'Edit')} onClick={() => onEdit(entry)}><PencilSimple size={16} /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={t('Slet', 'Delete')} onClick={() => onDelete(entry)}><Trash size={16} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** A manager corrects the start, the end or the task of a registration (logged as edited). */
function EditEntryDialog({ entry, onClose, onSaved }: { entry: TimeclockEntry; onClose: () => void; onSaved: () => void }) {
  const [roles] = useKV<ShiftRole[]>('shift-roles', [], { initializeIfMissing: false })
  const [start, setStart] = useState(toLocalInput(entry.startedAt))
  const [end, setEnd] = useState(toLocalInput(entry.endedAt))
  const [taskId, setTaskId] = useState(entry.taskId)
  const [saving, setSaving] = useState(false)
  // The task of the registration stays choosable even when it is gone from the shift schedule.
  const options = useMemo(() => {
    const list = (roles || []).map(role => ({ taskId: role.id, taskName: role.name, taskColor: role.color }))
    return list.some(item => item.taskId === entry.taskId) ? list : [{ taskId: entry.taskId, taskName: entry.taskName, taskColor: entry.taskColor }, ...list]
  }, [roles, entry])
  const save = async () => {
    const chosen = options.find(item => item.taskId === taskId)
    setSaving(true)
    try {
      await window.electronWarehouse!.timeclock.updateEntry({ email: entry.email, id: entry.id, startedAt: fromLocalInput(start), endedAt: fromLocalInput(end), ...(chosen && chosen.taskId !== entry.taskId ? chosen : {}) })
      toast.success(t('Registreringen er rettet', 'The registration is corrected'))
      onSaved()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t(`Ret ${entry.name}s registrering`, `Edit ${entry.name}'s registration`)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tc-edit-task">{t('Opgave', 'Task')}</Label>
            <NativeSelect id="tc-edit-task" value={taskId} onChange={event => setTaskId(event.target.value)} className="w-full">
              {options.map(item => <option key={item.taskId} value={item.taskId}>{item.taskName}</option>)}
            </NativeSelect>
          </div>
          <div className={cn('grid gap-3 sm:grid-cols-2')}>
            <div className="space-y-1"><Label htmlFor="tc-edit-start">{t('Start', 'Start')}</Label><Input id="tc-edit-start" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="tc-edit-end">{t('Slut', 'End')}</Label><Input id="tc-edit-end" type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">{t('Pauser uden for den nye start og slut tælles ikke med. Rettelsen gemmes med dit navn.', 'Breaks outside the new start and end are left out. The correction is saved with your name.')}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={save} loading={saving} disabled={!start || !end}>{t('Gem', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
