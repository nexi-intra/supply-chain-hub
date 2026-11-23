import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, Barcode, CheckCircle, Clock, Pause, PencilSimple, Play, Trash, Warning, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, Textarea } from '@/components/warehouse/ui'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { scannedDuringPause, SOFTWARELOAD_TARGETS, SOFTWARELOAD_TYPES as TYPES, targetLabel, TYPE_LABELS } from '@/lib/softwareload'
import { drainScanQueue, dropOtherScanQueues, readScanQueue, writeScanQueue, type ScanJob } from '@/lib/softwareloadScanQueue'
import { formatClock, formatDuration, ranTooLong } from '@/lib/timeclock'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { formatTime, type Tone } from '@/lib/warehouse/format'
import { playTone } from '@/lib/warehouse/sound'
import { currentWarehouseLanguage, t } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadChoice, SoftwareloadTaskView } from '@/types/warehouse'
import { ErrorLine, label, SERIAL_PATTERN, cleanSerial, useReportBusy, type ReportBusy } from './common'

const LAST_START_KEY = 'softwareload-last-start'
const NOTE_MAX = 200

type Stopped = { taskName: string; workedMs: number }

interface TaskProps {
  /** The person's email: the scans waiting to be saved are kept in localStorage per person and task. */
  email: string
  running: SoftwareloadTaskView | null
  receivedAt: number
  active: boolean
  onRunning: (running: SoftwareloadTaskView | null) => void
  onFinish: () => void
  reload: () => Promise<void>
  onOpenTimeclock: () => void
  onBusy?: ReportBusy
}

/** "Min opgave": the start form, or the running task with its clock and scanner. */
export function SoftwareloadTask({ email, running, receivedAt, active, onRunning, onFinish, reload, onOpenTimeclock, onBusy }: TaskProps) {
  const [stopped, setStopped] = useState<Stopped | null>(null)
  if (!running) return <StartForm onStarted={(view, stoppedTimeclock) => { setStopped(stoppedTimeclock ?? null); onRunning(view) }} reload={reload} onOpenTimeclock={onOpenTimeclock} />
  return (
    <RunningTask
      key={running.id}
      email={email}
      running={running}
      receivedAt={receivedAt}
      active={active}
      stopped={stopped}
      onStopped={setStopped}
      onDismissStopped={() => setStopped(null)}
      onRunning={onRunning}
      onFinish={onFinish}
      reload={reload}
      onOpenTimeclock={onOpenTimeclock}
      onBusy={onBusy}
    />
  )
}

/** The choices of a task: chosen at start and corrected with "Ret opgave" while it runs. */
type Choice = SoftwareloadChoice
type LastStart = Omit<Choice, 'version'>

function readLastStart(): LastStart {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_START_KEY) || 'null') as Partial<LastStart> | null
    const target = typeof saved?.target === 'string' && SOFTWARELOAD_TARGETS.some(item => item.sloc === saved.target) ? saved.target : ''
    return { type: saved?.type && TYPES.includes(saved.type) ? saved.type : 'sw+key', kif: saved?.kif === true, target }
  } catch {
    return { type: 'sw+key', kif: false, target: '' }
  }
}

function rememberLastStart({ type, kif, target }: Choice) {
  try { localStorage.setItem(LAST_START_KEY, JSON.stringify({ type, kif, target })) } catch { /* only a convenience */ }
}

/** What is missing before the choices can be sent, or null. */
function choiceProblem({ target, version }: Choice): string | null {
  if (!target) return t('Vælg målet.', 'Choose the target.')
  if (!version.trim()) return t('Skriv softwareversionen.', 'Write the software version.')
  return null
}

/** The hub's latest versions, newest first, as suggestions for the version field. */
function useVersions() {
  const [versions, setVersions] = useState<string[]>([])
  useEffect(() => {
    let current = true
    window.electronWarehouse!.softwareload.versions().then(list => { if (current) setVersions(list) }).catch(() => {})
    return () => { current = false }
  }, [])
  return versions
}

/** Type, I KIF or Uden for KIF, the target and the version; the same fields at start and in "Ret opgave". */
function ChoiceFields({ value, onChange, versions, idPrefix, onEnter }: { value: Choice; onChange: (value: Choice) => void; versions: string[]; idPrefix: string; onEnter: () => void }) {
  const set = (change: Partial<Choice>) => onChange({ ...value, ...change })
  return (
    <>
      <div className="space-y-2">
        <Label>{t('Type', 'Type')}</Label>
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label={t('Type', 'Type')}>
          {TYPES.map(item => (
            <Button key={item} size="sm" role="radio" aria-checked={value.type === item} variant={value.type === item ? 'default' : 'ghost'} onClick={() => set({ type: item })}>{label(TYPE_LABELS[item])}</Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('KIF', 'KIF')}</Label>
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label={t('KIF', 'KIF')}>
          <Button size="sm" role="radio" aria-checked={value.kif} variant={value.kif ? 'default' : 'ghost'} onClick={() => set({ kif: true })}>{t('I KIF', 'In KIF')}</Button>
          <Button size="sm" role="radio" aria-checked={!value.kif} variant={!value.kif ? 'default' : 'ghost'} onClick={() => set({ kif: false })}>{t('Uden for KIF', 'Outside KIF')}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{value.kif
          ? t('Alle terminaler flyttes via D005, før de kommer til målet.', 'Every terminal is moved via D005 before it reaches the target.')
          : t('Terminalerne flyttes direkte til målet. Dem der allerede står der, springes over.', 'The terminals are moved straight to the target. Those already there are skipped.')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-target`}>{t('Mål (storage location)', 'Target (storage location)')}</Label>
          <NativeSelect id={`${idPrefix}-target`} value={value.target} onChange={event => set({ target: event.target.value })} className="w-full">
            <option value="" disabled>{t('Vælg en lokation', 'Choose a location')}</option>
            {SOFTWARELOAD_TARGETS.map(item => <option key={item.sloc} value={item.sloc}>{targetLabel(item.sloc)}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-version`}>{t('Softwareversion', 'Software version')}</Label>
          <Input id={`${idPrefix}-version`} list={`${idPrefix}-versions`} value={value.version} maxLength={60} autoComplete="off" onChange={event => set({ version: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') onEnter() }} placeholder={versions[0] || t('Fx 2.4.1', 'E.g. 2.4.1')} />
          <datalist id={`${idPrefix}-versions`}>{versions.map(item => <option key={item} value={item} />)}</datalist>
        </div>
      </div>
    </>
  )
}

function StartForm({ onStarted, reload, onOpenTimeclock }: { onStarted: (view: SoftwareloadTaskView, stopped?: Stopped) => void; reload: () => Promise<void>; onOpenTimeclock: () => void }) {
  const [choice, setChoice] = useState<Choice>(() => ({ ...readLastStart(), version: '' }))
  const versions = useVersions()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [longRun, setLongRun] = useState<string | null>(null)

  const start = async () => {
    if (busy) return
    const missing = choiceProblem(choice)
    setProblem(missing)
    if (missing) return
    setLongRun(null)
    setBusy(true)
    try {
      const { stoppedTimeclock, ...view } = await window.electronWarehouse!.softwareload.start({ ...choice, version: choice.version.trim() })
      rememberLastStart(choice)
      onStarted(view, stoppedTimeclock)
    } catch (error) {
      const code = errorCode(error)
      if (code === 'SOFTWARELOAD_TIMECLOCK_LONG_RUN') setLongRun(errorMessage(error))
      else {
        toast.error(errorMessage(error))
        if (code === 'SOFTWARELOAD_RUNNING') void reload()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="gap-6 px-6 py-8 sm:px-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-muted-foreground sm:text-7xl">00:00:00</p>
        <p className="text-sm text-muted-foreground">{t('Vælg hvad du loader, og tryk Start. Kører Stempelkort, bliver det stoppet.', 'Choose what you load and press Start. If your time card is running, it is stopped.')}</p>
      </div>

      <div className="mx-auto grid w-full max-w-2xl gap-5">
        <ChoiceFields value={choice} onChange={setChoice} versions={versions} idPrefix="sl" onEnter={() => void start()} />
        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        {longRun && (
          <div className="space-y-2">
            <ErrorLine text={longRun} />
            <Button variant="outline" onClick={onOpenTimeclock}><Clock size={18} /> {t('Åbn Stempelkort', 'Open time card')}</Button>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <Button size="lg" className="min-w-48" onClick={start} loading={busy}><Play size={20} weight="fill" /> {t('Start', 'Start')}</Button>
      </div>
    </Card>
  )
}

/** A scanned serial as shown: saved ones from the main process, and new ones at once while they are saved. */
type Shown = { serial: string; at: number; failed?: { note: string }; saving: boolean }
type Flash = { tone: Tone; text: string }

/** After an error that may pass (the drive, the network), the waiting scans are sent again this much later. */
const SCAN_RETRY_MS = 10_000

const FLASH_STYLES: Record<Tone, string> = {
  success: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  error: 'border-destructive/50 bg-destructive/10 text-destructive',
}

interface RunningProps {
  email: string
  running: SoftwareloadTaskView
  receivedAt: number
  active: boolean
  stopped: Stopped | null
  onStopped: (stopped: Stopped) => void
  onDismissStopped: () => void
  onRunning: (running: SoftwareloadTaskView | null) => void
  onFinish: () => void
  reload: () => Promise<void>
  onOpenTimeclock: () => void
  onBusy?: ReportBusy
}

/** The scans of this task still waiting in localStorage from an earlier visit; other tasks' leftovers are dropped. */
function waitingScans(email: string, taskId: string): ScanJob[] {
  try {
    dropOtherScanQueues(localStorage, email, taskId)
    return readScanQueue(localStorage, email, taskId)
  } catch {
    return []
  }
}

function RunningTask({ email, running, receivedAt, active, stopped, onStopped, onDismissStopped, onRunning, onFinish, reload, onOpenTimeclock, onBusy }: RunningProps) {
  const [serial, setSerial] = useState('')
  const [waiting] = useState(() => waitingScans(email, running.id))
  // Scans shown before the main process has them, and serials taken out before it has removed them.
  const [added, setAdded] = useState<Map<string, { at: number; saving: boolean }>>(() => new Map(waiting.filter(job => job.kind === 'scan').map(job => [job.serial, { at: job.at, saving: true }])))
  const [removed, setRemoved] = useState<Set<string>>(() => new Set(waiting.filter(job => job.kind === 'unscan').map(job => job.serial)))
  const [queueSize, setQueueSize] = useState(waiting.length)
  const [sending, setSending] = useState(false)
  // The waiting scans could not be sent; they are kept on this PC and sent again shortly.
  const [stuck, setStuck] = useState(false)
  const stuckRef = useRef(false)
  const [flash, setFlash] = useState<Flash | null>(null)
  // When this screen last took a scan; a scan during a break shows the banner that resumes the time.
  const [lastScanAt, setLastScanAt] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failing, setFailing] = useState<string | null>(null)
  const [askCancel, setAskCancel] = useState(false)
  const [editing, setEditing] = useState(false)
  const [, setTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const queue = useRef<ScanJob[]>(waiting)
  const working = useRef(false)
  const retryTimer = useRef<number | undefined>(undefined)
  const language = currentWarehouseLanguage()
  // Only while scans are being sent: waiting ones are safe in localStorage, so the tool may be left meanwhile.
  useReportBusy(onBusy, 'scans', sending)

  useEffect(() => { if (active) inputRef.current?.focus() }, [active])

  useEffect(() => {
    if (running.paused) return
    const timer = window.setInterval(() => setTick(tick => tick + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running.paused])

  const shown = useMemo<Shown[]>(() => {
    const saved = running.terminals.filter(terminal => !removed.has(terminal.serial))
    const known = new Set(saved.map(terminal => terminal.serial))
    const fresh = [...added].filter(([key]) => !known.has(key) && !removed.has(key)).map(([key, value]) => ({ serial: key, at: value.at, saving: value.saving }))
    return [...fresh, ...saved.map(terminal => ({ ...terminal, saving: false }))].sort((a, b) => b.at - a.at)
  }, [running.terminals, added, removed])
  const failedCount = shown.filter(item => item.failed).length

  const changeAdded = (change: (map: Map<string, { at: number; saving: boolean }>) => void) => setAdded(current => { const next = new Map(current); change(next); return next })
  const changeRemoved = (change: (set: Set<string>) => void) => setRemoved(current => { const next = new Set(current); change(next); return next })
  const keep = (jobs: ScanJob[]) => {
    writeScanQueue(localStorage, email, running.id, jobs)
    setQueueSize(jobs.length)
  }

  const onSent = (job: ScanJob, outcome: 'saved' | 'dropped', error?: unknown) => {
    const code = errorCode(error)
    if (job.kind === 'unscan') {
      changeAdded(map => { map.delete(job.serial) })
      return
    }
    if (outcome === 'saved' || code === 'SOFTWARELOAD_DUPLICATE') {
      changeAdded(map => { const entry = map.get(job.serial); if (entry) map.set(job.serial, { ...entry, saving: false }) })
      // Already in the task (scanned on another PC or before the screen was updated): it stays.
      if (code === 'SOFTWARELOAD_DUPLICATE') toast.warning(t(`${job.serial} var allerede scannet i opgaven`, `${job.serial} was already scanned in the task`))
      return
    }
    changeAdded(map => { map.delete(job.serial) })
    playTone('error')
    toast.error(t(`${job.serial} blev ikke gemt. ${errorMessage(error)}`, `${job.serial} was not saved. ${errorMessage(error)}`))
  }

  const processQueue = async () => {
    if (working.current) return
    working.current = true
    window.clearTimeout(retryTimer.current)
    setSending(true)
    try {
      const { stopped: problem } = await drainScanQueue(
        queue.current,
        // The queue belongs to this task; a scan left for an ended task is refused (NOT_RUNNING) and dropped.
        job => trackPendingWrite(job.kind === 'scan'
          ? window.electronWarehouse!.softwareload.scan({ serial: job.serial, taskId: running.id })
          : window.electronWarehouse!.softwareload.unscan({ serial: job.serial, taskId: running.id })),
        keep,
        onSent,
      )
      if (problem) {
        // Nothing is lost: the scans stay in localStorage and are sent again, also after a restart.
        if (!stuckRef.current) toast.warning(t('Scanningerne kunne ikke gemmes i opgaven lige nu. De ligger på denne PC og bliver sendt igen om lidt.', 'The scans could not be saved in the task just now. They are kept on this PC and sent again shortly.'))
        stuckRef.current = true
        setStuck(true)
        retryTimer.current = window.setTimeout(() => { void processQueue() }, SCAN_RETRY_MS)
      } else {
        stuckRef.current = false
        setStuck(false)
      }
    } finally {
      working.current = false
      setSending(false)
      void reload()
    }
  }

  // Scans left from an earlier visit (a closed window, a restart) go first.
  useEffect(() => {
    if (queue.current.length) void processQueue()
    return () => window.clearTimeout(retryTimer.current)
  }, [])

  const enqueue = (job: ScanJob) => {
    queue.current.push(job)
    keep(queue.current)
    // While stuck, the retry timer sends it with the rest, so every scan does not wait on a drive that is away.
    if (!stuckRef.current) void processQueue()
  }

  const submit = () => {
    const value = cleanSerial(serial)
    setSerial('')
    if (!value) return
    if (!SERIAL_PATTERN.test(value)) {
      playTone('error')
      setFlash({ tone: 'error', text: t(`Ugyldigt serienummer: ${value}`, `Invalid serial number: ${value}`) })
      return
    }
    if (shown.some(item => item.serial === value)) {
      playTone('warning')
      setFlash({ tone: 'warning', text: t(`${value} er allerede scannet i opgaven`, `${value} is already scanned in the task`) })
      return
    }
    changeRemoved(set => { set.delete(value) })
    changeAdded(map => { map.set(value, { at: Date.now(), saving: true }) })
    playTone('success')
    setFlash({ tone: 'success', text: value })
    setLastScanAt(Date.now())
    enqueue({ kind: 'scan', serial: value, at: Date.now() })
  }

  const unscan = (value: string) => {
    changeRemoved(set => { set.add(value) })
    enqueue({ kind: 'unscan', serial: value, at: Date.now() })
    inputRef.current?.focus()
  }

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name)
    try {
      await action()
    } catch (error) {
      if (errorCode(error) === 'SOFTWARELOAD_TIMECLOCK_LONG_RUN') toast.error(errorMessage(error), { action: { label: t('Åbn Stempelkort', 'Open time card'), onClick: onOpenTimeclock } })
      else toast.error(errorMessage(error))
      void reload()
    } finally {
      setBusy(null)
      inputRef.current?.focus()
    }
  }

  const pause = () => run('pause', async () => onRunning(await window.electronWarehouse!.softwareload.pause()))
  // Resuming stops a running Stempelkort, as starting does; the screen says so.
  const resume = () => run('resume', async () => {
    const { stoppedTimeclock, ...view } = await window.electronWarehouse!.softwareload.resume()
    if (stoppedTimeclock) onStopped(stoppedTimeclock)
    onRunning(view)
  })
  const unmarkFailed = (value: string) => run(`unfail-${value}`, async () => onRunning(await window.electronWarehouse!.softwareload.unmarkFailed({ serial: value })))
  const cancel = () => run('cancel', async () => {
    await window.electronWarehouse!.softwareload.cancel()
    onRunning(null)
    toast.info(t('Opgaven er annulleret', 'The task is cancelled'))
  })

  const sinceAnswer = Date.now() - receivedAt
  const worked = running.workedMs + (running.paused ? 0 : sinceAnswer)
  const pausedNow = running.pausedMs + (running.paused ? sinceAnswer : 0)
  const saving = queueSize > 0

  return (
    <div className="space-y-4">
      {stopped && (
        <p className="flex items-center gap-3 rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm">
          <span className="flex-1">{t(`Stempelkort for ${stopped.taskName} er stoppet (${formatDuration(stopped.workedMs, 'da')}).`, `The time card for ${stopped.taskName} is stopped (${formatDuration(stopped.workedMs, 'en')}).`)}</span>
          <Button size="icon" variant="ghost" aria-label={t('Luk', 'Close')} onClick={onDismissStopped}><X size={16} /></Button>
        </p>
      )}
      <Card className="gap-6 px-6 py-8 sm:px-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="secondary">{label(TYPE_LABELS[running.type])}</Badge>
            <Badge variant="outline">{running.kif ? t('I KIF', 'In KIF') : t('Uden for KIF', 'Outside KIF')}</Badge>
            <Badge variant="outline">{t('Mål', 'Target')} {targetLabel(running.target)}</Badge>
            <Badge variant="outline">{t('Version', 'Version')} {running.version}</Badge>
          </div>
          <p className={cn('font-mono text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl', running.paused && 'text-muted-foreground')}>{formatClock(worked)}</p>
          <p className="text-sm text-muted-foreground">
            {running.paused ? t('Pause', 'On a break') : t('I gang', 'Running')} · {t('startet', 'started')} {formatTime(running.startedAt)}
            {pausedNow >= 60_000 && ` · ${t('pause i alt', 'breaks in total')} ${formatDuration(pausedNow, language)}`}
          </p>
          {ranTooLong(running, sinceAnswer) && <p className="text-sm font-medium text-amber-600">{t('Opgaven har kørt i over 10 timer. Glemte du at afslutte den?', 'The task has run for more than 10 hours. Did you forget to finish it?')}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {running.paused
              ? <Button size="lg" onClick={resume} loading={busy === 'resume'} disabled={busy !== null}><Play size={20} weight="fill" /> {t('Fortsæt', 'Resume')}</Button>
              : <Button size="lg" variant="outline" onClick={pause} loading={busy === 'pause'} disabled={busy !== null}><Pause size={20} weight="fill" /> {t('Pause', 'Break')}</Button>}
            <Button size="lg" onClick={onFinish} disabled={busy !== null || saving} title={saving ? t('Venter på at scanningerne er gemt', 'Waiting for the scans to be saved') : undefined}><CheckCircle size={20} weight="fill" /> {t('Afslut opgave', 'Finish task')}</Button>
            <Button size="lg" variant="outline" onClick={() => setEditing(true)} disabled={busy !== null || saving} title={saving ? t('Venter på at scanningerne er gemt', 'Waiting for the scans to be saved') : undefined}><PencilSimple size={18} /> {t('Ret opgave', 'Edit task')}</Button>
            <Button size="lg" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAskCancel(true)} loading={busy === 'cancel'} disabled={busy !== null || saving}><Trash size={18} /> {t('Annullér', 'Cancel')}</Button>
          </div>
        </div>
      </Card>

      <Card className="gap-3 px-6 py-6">
        <Label htmlFor="sl-scan" className="flex items-center gap-2"><Barcode size={18} /> {t('Scan serienummer', 'Scan serial number')}</Label>
        <Input
          id="sl-scan"
          ref={inputRef}
          value={serial}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={event => setSerial(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } }}
          className="h-16 font-mono text-2xl tracking-wider"
          placeholder={t('Scan eller tast + Enter', 'Scan or type + Enter')}
        />
        <div aria-live="assertive" className={cn('min-h-11 rounded-md border px-4 py-2 text-sm font-medium', flash ? FLASH_STYLES[flash.tone] : 'border-dashed text-muted-foreground')}>
          {flash ? <span className={cn(flash.tone === 'success' && 'font-mono text-base')}>{flash.text}</span> : t('Klar til scanning.', 'Ready to scan.')}
        </div>
        {scannedDuringPause(running, lastScanAt) ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-300">
            <Pause size={18} weight="fill" aria-hidden="true" />
            <span className="flex-1">{t('Opgaven holder pause, så tiden tæller ikke med, mens du scanner. Scanningerne bliver gemt.', 'The task is on a break, so the time does not count while you scan. The scans are saved.')}</span>
            <Button size="sm" onClick={resume} loading={busy === 'resume'} disabled={busy !== null}><Play size={16} weight="fill" /> {t('Fortsæt tiden', 'Resume the time')}</Button>
          </div>
        ) : running.paused && <p className="text-xs text-muted-foreground">{t('Opgaven holder pause. Scanninger bliver stadig gemt.', 'The task is on a break. Scans are still saved.')}</p>}
        {stuck && saving && (
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300" role="status">
            {t(`${queueSize} scanninger venter på at blive gemt. De ligger på denne PC og sendes igen af sig selv.`, `${queueSize} scans are waiting to be saved. They are kept on this PC and sent again by themselves.`)}
            <Button size="sm" variant="outline" onClick={() => void processQueue()} disabled={sending}>{t('Prøv nu', 'Try now')}</Button>
          </p>
        )}
        {!stuck && saving && <p className="text-xs text-muted-foreground">{t(`${queueSize} gemmes …`, `${queueSize} being saved …`)}</p>}
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <h2 className="flex flex-wrap items-center gap-2 border-b px-5 py-3 text-sm font-semibold">
          {t('Scannede serienumre', 'Scanned serial numbers')} ({shown.length})
          {failedCount > 0 && <Badge variant="destructive">{t(`${failedCount} fejlet`, `${failedCount} failed`)}</Badge>}
        </h2>
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('Ingen serienumre endnu. Scan den første terminal.', 'No serial numbers yet. Scan the first terminal.')}</p>
        ) : (
          <ul className="max-h-[32rem] divide-y overflow-y-auto">
            {shown.map(item => (
              <li key={item.serial} className={cn('flex flex-wrap items-center gap-3 px-5 py-2', item.saving && 'opacity-60')}>
                <span className="font-mono">{item.serial}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{formatTime(item.at)}</span>
                {item.failed && <Badge variant="destructive" className="max-w-full whitespace-normal text-left" title={item.failed.note}>{t('Fejlet', 'Failed')}: {item.failed.note}</Badge>}
                <span className="ml-auto flex gap-1">
                  {item.failed
                    ? <Button size="sm" variant="ghost" onClick={() => unmarkFailed(item.serial)} loading={busy === `unfail-${item.serial}`} disabled={busy !== null}><ArrowCounterClockwise size={16} /> {t('Fortryd fejlet', 'Undo failed')}</Button>
                    : <Button size="sm" variant="ghost" onClick={() => setFailing(item.serial)} disabled={item.saving || busy !== null}><Warning size={16} /> {t('Fejlet', 'Failed')}</Button>}
                  <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={t(`Fjern ${item.serial}`, `Remove ${item.serial}`)} onClick={() => unscan(item.serial)} disabled={item.saving || busy !== null}><Trash size={16} /></Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {failing && <FailDialog serial={failing} onClose={() => { setFailing(null); inputRef.current?.focus() }} onSaved={view => { setFailing(null); onRunning(view); inputRef.current?.focus() }} />}
      {editing && <EditDialog running={running} reload={reload} onClose={() => { setEditing(false); inputRef.current?.focus() }} onSaved={view => { setEditing(false); onRunning(view); inputRef.current?.focus() }} />}

      <AlertDialog open={askCancel} onOpenChange={setAskCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Annullér opgaven?', 'Cancel the task?')}</AlertDialogTitle>
            <AlertDialogDescription>{t(`Tiden og de ${shown.length} scannede serienumre bliver ikke gemt, og intet flyttes i SAP.`, `The time and the ${shown.length} scanned serial numbers are not saved, and nothing is moved in SAP.`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Behold opgaven', 'Keep the task')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void cancel()}>{t('Annullér opgaven', 'Cancel the task')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Takes a terminal out as failed, with a note on what is wrong. */
function FailDialog({ serial, onClose, onSaved }: { serial: string; onClose: () => void; onSaved: (view: SoftwareloadTaskView) => void }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!note.trim()) return
    setSaving(true)
    try {
      onSaved(await window.electronWarehouse!.softwareload.markFailed({ serial, note: note.trim() }))
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`Markér ${serial} som fejlet`, `Mark ${serial} as failed`)}</DialogTitle>
          <DialogDescription>{t('Skriv hvad der er galt. Ved afslutningen går nye terminaler (-0) til D000 og blocked stock, og brugte (-R) til D002.', 'Write what is wrong. When the task is finished, new terminals (-0) go to D000 and blocked stock, and used ones (-R) to D002.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="sl-fail-note">{t('Note', 'Note')}</Label>
          <Textarea id="sl-fail-note" autoFocus value={note} maxLength={NOTE_MAX} onChange={event => setNote(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save() } }} placeholder={t('Fx loader ikke, skærm i stykker', 'E.g. does not load, broken screen')} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={save} loading={saving} disabled={!note.trim()}><Warning size={16} /> {t('Markér som fejlet', 'Mark as failed')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Corrects the running task's type, KIF, target and version. Nothing is moved in SAP before "Afslut", so all four may change. */
function EditDialog({ running, reload, onClose, onSaved }: { running: SoftwareloadTaskView; reload: () => Promise<void>; onClose: () => void; onSaved: (view: SoftwareloadTaskView) => void }) {
  const [choice, setChoice] = useState<Choice>({ type: running.type, kif: running.kif, target: running.target, version: running.version })
  const versions = useVersions()
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const save = async () => {
    if (saving) return
    const missing = choiceProblem(choice)
    setProblem(missing)
    if (missing) return
    setSaving(true)
    try {
      const view = await window.electronWarehouse!.softwareload.edit({ ...choice, version: choice.version.trim(), taskId: running.id })
      rememberLastStart(choice)
      onSaved(view)
      toast.success(t('Opgaven er rettet', 'The task is corrected'))
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
      void reload()
    }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Ret opgaven', 'Edit the task')}</DialogTitle>
          <DialogDescription>{t('Ret det, der blev valgt forkert. Intet er flyttet i SAP endnu, så afslutningen bruger de nye valg. Tiden og de scannede serienumre bliver stående.', 'Correct what was chosen wrong. Nothing is moved in SAP yet, so finishing uses the new choices. The time and the scanned serial numbers stay.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <ChoiceFields value={choice} onChange={setChoice} versions={versions} idPrefix="sl-edit" onEnter={() => void save()} />
          {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={save} loading={saving}><PencilSimple size={16} /> {t('Gem rettelsen', 'Save the correction')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
