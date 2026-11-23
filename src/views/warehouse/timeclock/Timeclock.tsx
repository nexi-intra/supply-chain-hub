import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsClockwise, Pause, Play, Plus, Stop, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ShiftRoleDialog } from '@/components/ShiftRoleDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect, Tabs } from '@/components/warehouse/ui'
import { useKV } from '@/hooks/useKV'
import { saveListChange } from '@/lib/kvChanges'
import { saveInBackground } from '@/lib/saveInBackground'
import { formatClock, formatDuration, isoDay, ranTooLong, todaysTasks } from '@/lib/timeclock'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { formatTime } from '@/lib/warehouse/format'
import { currentWarehouseLanguage, t } from '@/lib/warehouse/text'
import type { ShiftAssignment, ShiftPatternRule, ShiftRole } from '@/lib/types'
import type { TimeclockRunning, TimeclockTask, WarehouseUser } from '@/types/warehouse'
import { LongRunDialog } from './LongRunDialog'
import { TimeclockOverview } from './TimeclockOverview'

const READ_ONLY = { initializeIfMissing: false } as const
// The clock can be stopped on another PC; the screen asks again now and then and when the window comes back.
const STATUS_POLL_MS = 30_000

type Tab = 'clock' | 'overview'

export const taskOf = (role: ShiftRole): TimeclockTask => ({ taskId: role.id, taskName: role.name, taskColor: role.color })

/** Stempelkort: start, pause and stop on a task of the shift schedule. Saved times are only shown to managers. */
export function Timeclock({ user }: { user: WarehouseUser }) {
  const [tab, setTab] = useState<Tab>('clock')
  const [isManager, setIsManager] = useState(false)
  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {isManager && <Tabs<Tab> value={tab} onChange={setTab} items={[{ value: 'clock', label: t('Mit stempelkort', 'My time card') }, { value: 'overview', label: t('Oversigt og statistik', 'Overview and statistics') }]} />}
      {tab === 'clock' || !isManager ? <ClockCard user={user} onManager={setIsManager} /> : <TimeclockOverview />}
    </div>
  )
}

function ClockCard({ user, onManager }: { user: WarehouseUser; onManager: (isManager: boolean) => void }) {
  const [roles] = useKV<ShiftRole[]>('shift-roles', [], READ_ONLY)
  const [assignments] = useKV<ShiftAssignment[]>('shift-assignments', [], READ_ONLY)
  const [patterns] = useKV<ShiftPatternRule[]>('shift-patterns', [], READ_ONLY)
  const [running, setRunning] = useState<TimeclockRunning | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [roleDialog, setRoleDialog] = useState(false)
  const [askEnd, setAskEnd] = useState(false)
  // The worked time counts on from when the main process answered, by this PC's clock.
  const received = useRef(Date.now())
  const [, setTick] = useState(0)

  const today = isoDay(new Date())
  const mine = useMemo(() => todaysTasks({ userEmail: user.email, date: today, roles, assignments, patterns }), [user.email, today, roles, assignments, patterns])
  const sortedRoles = useMemo(() => [...(roles || [])].sort((a, b) => a.name.localeCompare(b.name, 'da')), [roles])
  useEffect(() => {
    if (!chosen && mine[0]) setChosen(mine[0].id)
  }, [chosen, mine])
  const chosenRole = sortedRoles.find(role => role.id === chosen) || null

  const show = useCallback((value: TimeclockRunning | null) => {
    received.current = Date.now()
    setRunning(value)
  }, [])

  const load = useCallback(async () => {
    try {
      const status = await window.electronWarehouse!.timeclock.status()
      show(status.running)
      onManager(status.isManager)
      setFailed(null)
    } catch (error) {
      setFailed(errorMessage(error))
    } finally {
      setLoaded(true)
    }
  }, [show, onManager])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, STATUS_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setTick(tick => tick + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name)
    try {
      await action()
    } catch (error) {
      if (errorCode(error) === 'TIMECLOCK_LONG_RUN') setAskEnd(true)
      else toast.error(errorMessage(error))
      void load()
    } finally {
      setBusy(null)
    }
  }

  const start = (switchTask: boolean) => run('start', async () => {
    if (!chosenRole) { toast.error(t('Vælg en opgave først', 'Choose a task first')); return }
    const started = await window.electronWarehouse!.timeclock.start({ ...taskOf(chosenRole), switchTask })
    show(started)
    toast.success(started.saved
      ? t(`${started.saved.taskName} er gemt (${formatDuration(started.saved.workedMs, 'da')}). Uret kører nu på ${started.taskName}`, `${started.saved.taskName} is saved (${formatDuration(started.saved.workedMs, 'en')}). The clock now runs on ${started.taskName}`)
      : t(`Uret kører på ${started.taskName}`, `The clock runs on ${started.taskName}`))
  })
  const pause = () => run('pause', async () => show(await window.electronWarehouse!.timeclock.pause()))
  const resume = () => run('resume', async () => show(await window.electronWarehouse!.timeclock.resume()))
  const stop = (endAt?: number) => run('stop', async () => {
    const saved = await window.electronWarehouse!.timeclock.stop(endAt === undefined ? {} : { endAt })
    show(null)
    setAskEnd(false)
    toast.success(t(`Gemt: ${formatDuration(saved.workedMs, 'da')} på ${saved.taskName}`, `Saved: ${formatDuration(saved.workedMs, 'en')} on ${saved.taskName}`))
  })
  const cancel = () => {
    if (!window.confirm(t('Annullér uret? Tiden bliver ikke gemt.', 'Cancel the clock? The time is not saved.'))) return
    void run('cancel', async () => {
      await window.electronWarehouse!.timeclock.cancel()
      show(null)
      toast.info(t('Uret er annulleret', 'The clock is cancelled'))
    })
  }

  // A new task is a task of the shift schedule, made with the same dialog: it is in Vagtplan at once too.
  const createRole = (role: ShiftRole) => {
    void saveInBackground(saveListChange('shift-roles', roles || [], [...(roles || []), role]), { success: t('Opgaven er oprettet og findes nu også i vagtplanen', 'The task is created and is now in the shift schedule too'), failure: t('Opgaven blev ikke gemt – prøv igen', 'The task was not saved – try again') })
    setChosen(role.id)
  }

  if (!loaded) return <Skeleton className="h-80 rounded-xl" />

  const sinceAnswer = Date.now() - received.current
  const worked = running ? running.workedMs + (running.paused ? 0 : sinceAnswer) : 0
  const pausedNow = running ? running.pausedMs + (running.paused ? sinceAnswer : 0) : 0
  const longRun = running ? ranTooLong(running, sinceAnswer) : false
  const language = currentWarehouseLanguage()

  return (
    <div className="space-y-4">
      {failed && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{failed}</p>}
      <Card className="gap-6 px-6 py-8 sm:px-10">
        {running ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
              <span className="size-3 rounded-full" style={{ backgroundColor: running.taskColor }} aria-hidden="true" />
              {running.taskName}
            </span>
            <p className={`font-mono text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl ${running.paused ? 'text-muted-foreground' : ''}`}>{formatClock(worked)}</p>
            <p className="text-sm text-muted-foreground">
              {running.paused ? t('Pause', 'On a break') : t('I gang', 'Running')} · {t('startet', 'started')} {formatTime(running.startedAt)}
              {pausedNow >= 60_000 && ` · ${t('pause i alt', 'breaks in total')} ${formatDuration(pausedNow, language)}`}
            </p>
            {longRun && <p className="text-sm font-medium text-amber-600">{t('Uret har kørt i over 10 timer. Glemte du at stoppe?', 'The clock has run for more than 10 hours. Did you forget to stop?')}</p>}
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              {running.paused
                ? <Button size="lg" onClick={resume} loading={busy === 'resume'} disabled={busy !== null}><Play size={20} weight="fill" /> {t('Fortsæt', 'Resume')}</Button>
                : <Button size="lg" variant="outline" onClick={pause} loading={busy === 'pause'} disabled={busy !== null}><Pause size={20} weight="fill" /> {t('Pause', 'Break')}</Button>}
              <Button size="lg" variant="destructive" onClick={() => stop()} loading={busy === 'stop'} disabled={busy !== null}><Stop size={20} weight="fill" /> {t('Stop', 'Stop')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-muted-foreground sm:text-7xl">00:00:00</p>
            <p className="text-sm text-muted-foreground">{t('Vælg en opgave og tryk Start.', 'Choose a task and press Start.')}</p>
          </div>
        )}

        <div className="mx-auto w-full max-w-xl space-y-2">
          <Label htmlFor="timeclock-task">{running ? t('Skift til en anden opgave', 'Switch to another task') : t('Opgave', 'Task')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="size-4 shrink-0 rounded-full border" style={{ backgroundColor: chosenRole?.color || 'transparent' }} aria-hidden="true" />
            <NativeSelect id="timeclock-task" value={chosen} onChange={event => setChosen(event.target.value)} className="min-w-0 flex-1">
              <option value="">{t('Vælg opgave', 'Choose task')}</option>
              {mine.length > 0 && (
                <optgroup label={t('Dine opgaver i dag ifølge vagtplanen', 'Your tasks today in the shift schedule')}>
                  {mine.map(role => <option key={`mine-${role.id}`} value={role.id}>{role.name}</option>)}
                </optgroup>
              )}
              <optgroup label={t('Alle opgaver', 'All tasks')}>
                {sortedRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
              </optgroup>
            </NativeSelect>
            <Button variant="outline" onClick={() => setRoleDialog(true)}><Plus size={16} /> {t('Ny opgave', 'New task')}</Button>
          </div>
          {mine.length === 0 && <p className="text-xs text-muted-foreground">{t('Du har ingen opgave i vagtplanen i dag. Vælg en fra listen.', 'You have no task in the shift schedule today. Choose one from the list.')}</p>}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {running ? (
            <>
              <Button variant="secondary" onClick={() => start(true)} loading={busy === 'start'} disabled={busy !== null || !chosenRole || chosenRole.id === running.taskId}><ArrowsClockwise size={18} /> {t('Skift opgave', 'Switch task')}</Button>
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={cancel} disabled={busy !== null}><Trash size={18} /> {t('Annullér ur', 'Cancel clock')}</Button>
            </>
          ) : (
            <Button size="lg" className="min-w-48" onClick={() => start(false)} loading={busy === 'start'} disabled={busy !== null || !chosenRole}><Play size={20} weight="fill" /> {t('Start', 'Start')}</Button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">{t('Når du trykker Stop, gemmes tiden. Gemte tider kan kun ses af managere.', 'When you press Stop, the time is saved. Saved times can only be seen by managers.')}</p>
      </Card>

      <ShiftRoleDialog open={roleDialog} onOpenChange={setRoleDialog} role={null} onSave={createRole} />
      {askEnd && running && <LongRunDialog startedAt={running.startedAt} taskName={running.taskName} onCancel={() => setAskEnd(false)} onStop={stop} busy={busy === 'stop'} />}
    </div>
  )
}

