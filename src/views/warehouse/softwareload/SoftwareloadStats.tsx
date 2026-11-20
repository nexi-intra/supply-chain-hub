import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect } from '@/components/warehouse/ui'
import { outcomeLabel, SOFTWARELOAD_TYPES as TYPES, summarizeTasks, targetLabel, TYPE_LABELS } from '@/lib/softwareload'
import { formatDuration, periodRange, type PeriodKind } from '@/lib/timeclock'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatTime } from '@/lib/warehouse/format'
import { currentWarehouseLanguage, t, warehouseLocale } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadTask } from '@/types/warehouse'
import { ErrorLine, isProblem, label } from './common'

type Period = PeriodKind | 'custom'

const POLL_MS = 60_000
const PERIODS: { value: Period; label: () => string }[] = [
  { value: 'today', label: () => t('I dag', 'Today') },
  { value: 'week', label: () => t('Denne uge', 'This week') },
  { value: 'month', label: () => t('Denne måned', 'This month') },
  { value: 'lastMonth', label: () => t('Sidste måned', 'Last month') },
  { value: 'custom', label: () => t('Vælg periode', 'Choose period') },
]

const formatRate = (value: number) => value.toLocaleString(warehouseLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const movedOf = (task: SoftwareloadTask) => Object.values(task.results).filter(result => result.outcome === 'to-target').length
const failedOf = (task: SoftwareloadTask) => Object.values(task.terminals).filter(terminal => terminal.failed).length

/** Times and pace per person and type. The main process gives a manager the team's tasks and anyone else their own. */
export function SoftwareloadStats({ isManager }: { isManager: boolean }) {
  const [period, setPeriod] = useState<Period>('week')
  const [custom, setCustom] = useState(() => periodRange('month', new Date()))
  const { from, to } = period === 'custom' ? custom : periodRange(period, new Date())
  const [tasks, setTasks] = useState<SoftwareloadTask[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [person, setPerson] = useState('')
  const [type, setType] = useState('')
  const [version, setVersion] = useState('')
  const language = currentWarehouseLanguage()

  // Only the newest request may fill the screen: a slow answer for an earlier period must not replace a newer one.
  const latest = useRef(0)
  const load = useCallback(async () => {
    const request = ++latest.current
    try {
      const next = await window.electronWarehouse!.softwareload.tasks({ from, to })
      if (request !== latest.current) return
      setTasks(next)
      setFailed(null)
    } catch (error) {
      if (request === latest.current) setFailed(errorMessage(error))
    }
  }, [from, to])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const all = useMemo(() => tasks ?? [], [tasks])
  const filtered = useMemo(() => all.filter(task => (!person || task.email === person) && (!type || task.type === type) && (!version || task.version === version)), [all, person, type, version])
  const rows = useMemo(() => summarizeTasks(filtered), [filtered])
  const people = useMemo(() => [...new Map(all.map(task => [task.email, task.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'da')), [all])
  const versions = useMemo(() => [...new Set(all.map(task => task.version))].sort((a, b) => b.localeCompare(a, 'da', { numeric: true })), [all])
  const totals = useMemo(() => rows.reduce((sum, row) => ({ moved: sum.moved + row.moved, failed: sum.failed + row.failed, workedMs: sum.workedMs + row.workedMs }), { moved: 0, failed: 0, workedMs: 0 }), [rows])
  const pace = totals.workedMs > 0 ? Math.round((totals.moved / (totals.workedMs / 3_600_000)) * 10) / 10 : 0

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
            <div className="space-y-1"><Label htmlFor="sl-from">{t('Fra', 'From')}</Label><Input id="sl-from" type="date" value={custom.from} max={custom.to} onChange={event => event.target.value && setCustom(current => ({ ...current, from: event.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="sl-to">{t('Til', 'To')}</Label><Input id="sl-to" type="date" value={custom.to} min={custom.from} onChange={event => event.target.value && setCustom(current => ({ ...current, to: event.target.value }))} /></div>
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {(isManager || people.length > 1) && (
            <NativeSelect aria-label={t('Person', 'Person')} value={person} onChange={event => setPerson(event.target.value)}>
              <option value="">{t('Alle personer', 'Everyone')}</option>
              {people.map(([email, name]) => <option key={email} value={email}>{name}</option>)}
            </NativeSelect>
          )}
          <NativeSelect aria-label={t('Type', 'Type')} value={type} onChange={event => setType(event.target.value)}>
            <option value="">{t('Alle typer', 'All types')}</option>
            {TYPES.map(item => <option key={item} value={item}>{label(TYPE_LABELS[item])}</option>)}
          </NativeSelect>
          <NativeSelect aria-label={t('Softwareversion', 'Software version')} value={version} onChange={event => setVersion(event.target.value)}>
            <option value="">{t('Alle versioner', 'All versions')}</option>
            {versions.map(item => <option key={item} value={item}>{item}</option>)}
          </NativeSelect>
        </div>
      </div>
      {!isManager && <p className="text-xs text-muted-foreground">{t('Du ser dine egne opgaver. Managers ser hele teamets.', 'You see your own tasks. Managers see the whole team.')}</p>}

      {failed && <ErrorLine text={failed} />}
      {!tasks && !failed && <Skeleton className="h-64 rounded-xl" />}

      {tasks && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label={t('Opgaver', 'Tasks')} value={String(filtered.length)} />
            <Figure label={t('Flyttet til målet', 'Moved to the target')} value={String(totals.moved)} />
            <Figure label={t('Fejlede', 'Failed')} value={String(totals.failed)} />
            <Figure label={t('Terminaler i timen', 'Terminals per hour')} value={formatRate(pace)} note={formatDuration(totals.workedMs, language)} />
          </div>

          {filtered.length === 0 ? (
            <Card className="items-center border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t('Ingen afsluttede opgaver i perioden.', 'No finished tasks in the period.')}</Card>
          ) : (
            <>
              <SummaryTable rows={rows} />
              <TaskList tasks={filtered} />
            </>
          )}
        </>
      )}
    </div>
  )
}

function Figure({ label: title, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </Card>
  )
}

function SummaryTable({ rows }: { rows: ReturnType<typeof summarizeTasks> }) {
  const language = currentWarehouseLanguage()
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <h2 className="border-b px-5 py-3 text-sm font-semibold">{t('Pr. person og type', 'Per person and type')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t('Person', 'Person')}</th>
              <th className="px-4 py-2 font-medium">{t('Type', 'Type')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Opgaver', 'Tasks')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Flyttet', 'Moved')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Fejlede', 'Failed')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Tid', 'Time')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Pr. time', 'Per hour')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(row => (
              <tr key={row.key}>
                <td className="px-4 py-2">{row.name}</td>
                <td className="px-4 py-2">{label(TYPE_LABELS[row.type])}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.tasks}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.moved}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums', row.failed > 0 && 'text-destructive')}>{row.failed}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatDuration(row.workedMs, language)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{formatRate(row.perHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-5 py-2 text-xs text-muted-foreground">{t('Tempoet tæller terminaler flyttet til målet pr. arbejdstime. Fejlede tælles for sig.', 'The pace counts terminals moved to the target per working hour. Failed ones are counted apart.')}</p>
    </Card>
  )
}

/** Every task in the period; a task opens to its serials with the outcome and the note. */
function TaskList({ tasks }: { tasks: SoftwareloadTask[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const language = currentWarehouseLanguage()
  const toggle = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <h2 className="border-b px-5 py-3 text-sm font-semibold">{t('Opgaver', 'Tasks')} ({tasks.length})</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-4 py-2 font-medium">{t('Start', 'Start')}</th>
              <th className="px-4 py-2 font-medium">{t('Person', 'Person')}</th>
              <th className="px-4 py-2 font-medium">{t('Type', 'Type')}</th>
              <th className="px-4 py-2 font-medium">{t('Version', 'Version')}</th>
              <th className="px-4 py-2 font-medium">{t('Mål', 'Target')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Terminaler', 'Terminals')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Pause', 'Break')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Tid', 'Time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks.map(task => {
              const isOpen = open.has(task.id)
              const count = Object.keys(task.terminals).length
              const failed = failedOf(task)
              return (
                <Fragment key={task.id}>
                  <tr className="cursor-pointer hover:bg-muted/30" onClick={() => toggle(task.id)}>
                    <td className="px-2 py-2">
                      <Button size="icon" variant="ghost" className="size-7" aria-expanded={isOpen} aria-label={isOpen ? t('Skjul serienumre', 'Hide serial numbers') : t('Vis serienumre', 'Show serial numbers')} onClick={event => { event.stopPropagation(); toggle(task.id) }}>
                        {isOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                      </Button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatDateTime(task.startedAt)}<span className="text-muted-foreground"> → {formatTime(task.endedAt)}</span></td>
                    <td className="px-4 py-2">{task.name}</td>
                    <td className="px-4 py-2">{label(TYPE_LABELS[task.type])}{task.kif && <Badge variant="outline" className="ml-2">KIF</Badge>}</td>
                    <td className="px-4 py-2">{task.version}</td>
                    <td className="whitespace-nowrap px-4 py-2">{targetLabel(task.target)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                      {movedOf(task)}/{count}
                      {failed > 0 && <span className="ml-1 text-destructive">({t(`${failed} fejlet`, `${failed} failed`)})</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{task.pausedMs >= 60_000 ? formatDuration(task.pausedMs, language) : '–'}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatDuration(task.workedMs, language)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-muted/20">
                      <td />
                      <td colSpan={8} className="px-4 py-3">
                        {task.abandoned && <p className="mb-2 text-xs text-destructive">{t(`Flytningerne blev opgivet af ${task.abandoned.by}: ${task.abandoned.reason}`, `The moves were given up by ${task.abandoned.by}: ${task.abandoned.reason}`)}</p>}
                        <SerialList task={task} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SerialList({ task }: { task: SoftwareloadTask }) {
  const serials = Object.keys(task.terminals).sort((a, b) => task.terminals[a].at - task.terminals[b].at)
  if (!serials.length) return <p className="text-xs text-muted-foreground">{t('Opgaven har ingen serienumre.', 'The task has no serial numbers.')}</p>
  return (
    <ul className="grid gap-x-6 gap-y-1 text-sm lg:grid-cols-2">
      {serials.map(serial => {
        const result = task.results[serial]
        const note = task.terminals[serial].failed?.note
        return (
          <li key={serial} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono">{serial}</span>
            {result && <span className={cn('text-xs', isProblem(result.outcome) ? 'font-medium text-destructive' : 'text-muted-foreground')}>{label(outcomeLabel(result.outcome))}</span>}
            {result?.message && <span className="w-full text-xs text-destructive">SAP: {result.message}</span>}
            {note && <span className="w-full text-xs text-muted-foreground">{t('Note', 'Note')}: {note}</span>}
          </li>
        )
      })}
    </ul>
  )
}
