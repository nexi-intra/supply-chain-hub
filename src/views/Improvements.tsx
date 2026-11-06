import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowsClockwise, CheckCircle, EnvelopeSimple, Funnel, Lightning, MagnifyingGlass, Plus, X, XCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  IMPROVEMENT_PRIORITIES, IMPROVEMENT_STATUSES, applyImprovementResult, filterImprovements, improvementView, unseenImprovementIds,
  type ImprovementCommand, type ImprovementFilters, type ImprovementPreset,
  type ImprovementSnapshot, type ImprovementSort, type ImprovementView,
} from '@/lib/improvements'
import { getImprovementsLabels } from '@/lib/improvementsLabels'
import { consumeNavigationParams, peekNavigationParams } from '@/lib/appNavigation'
import { isAnyModalOpen } from '@/lib/modalStack'
import {
  ImprovementActionError, ImprovementCaseDialog, improvementDate, improvementError,
  isImprovementDeadlineOverdue, isRetryableImprovementError, type ImprovementActions, type ImprovementCommandInput,
} from '@/components/ImprovementCaseDialog'
import { ImprovementCreateDialog } from '@/components/ImprovementCreateDialog'
import { useImprovementSeen } from '@/hooks/useImprovementSeen'

export interface ImprovementsProps {
  onNavigateBack: () => void
  userEmail: string
}

interface PendingAction {
  command: ImprovementCommand
  onSuccess?: () => void
}

const selectClass = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const backLabels = { da: 'Tilbage', en: 'Back', fi: 'Takaisin', sv: 'Tillbaka' }
const rowColumns = 'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,.65fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.85fr)]'
const DEFAULT_FILTERS: ImprovementFilters = { preset: 'all', sort: 'updated', view: 'active' }

function IconAction({ label, children, onClick, disabled }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" title={label} aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

export function Improvements({ onNavigateBack, userEmail }: ImprovementsProps) {
  const { language } = useLanguage()
  const labels = getImprovementsLabels(language)
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const api = typeof window === 'undefined' ? undefined : window.electronImprovements
  const [snapshot, setSnapshot] = useState<ImprovementSnapshot | null>(null)
  const snapshotRef = useRef<ImprovementSnapshot | null>(null)
  const [loading, setLoading] = useState(Boolean(api))
  const [loadError, setLoadError] = useState('')
  const [commandError, setCommandError] = useState('')
  const [authorizationBlocked, setAuthorizationBlocked] = useState(false)
  const [requiresFreshSnapshot, setRequiresFreshSnapshot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hasPendingAction, setHasPendingAction] = useState(false)
  const pendingAction = useRef<PendingAction | null>(null)
  const writeInFlight = useRef(false)
  const generation = useRef(0)
  const lifetime = useRef(0)
  const alive = useRef(false)
  const reload = useRef<() => void>(() => {})
  const scheduleReload = useRef<() => void>(() => {})
  const [filters, setFilters] = useState<ImprovementFilters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Sag valgt fra hubbens notifikationsklokke; åbnes, når snapshottet er hentet.
  const [requestedCaseId, setRequestedCaseId] = useState(() => peekNavigationParams()?.itemId ?? null)
  useEffect(() => { consumeNavigationParams() }, [])
  const { seen, markSeen } = useImprovementSeen(userEmail)

  useEffect(() => {
    if (!requestedCaseId || !snapshot) return
    if (snapshot.cases.some(entry => entry.id === requestedCaseId && !entry.deletedAt)) setSelectedId(requestedCaseId)
    setRequestedCaseId(null)
  }, [snapshot, requestedCaseId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing) return
      if (busy || writeInFlight.current || createOpen || selectedId !== null || isAnyModalOpen()) return
      event.preventDefault()
      onNavigateBack()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNavigateBack, busy, createOpen, selectedId])

  useEffect(() => {
    const session = ++lifetime.current
    alive.current = true
    generation.current++
    snapshotRef.current = null
    pendingAction.current = null
    writeInFlight.current = false
    setSnapshot(null)
    setBusy(false)
    setHasPendingAction(false)
    setAuthorizationBlocked(false)
    setRequiresFreshSnapshot(false)
    setLoadError('')
    setCommandError('')
    setSelectedId(null)
    setCreateOpen(false)
    setFilters(DEFAULT_FILTERS)
    let active = true
    let reading = false
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: (() => void) | undefined

    const schedule = () => {
      if (!active) return
      dirty = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; void load() }, 180)
    }
    const load = async () => {
      if (!api || !active) return
      if (reading || writeInFlight.current) { dirty = true; return }
      if (timer) { clearTimeout(timer); timer = undefined }
      reading = true
      dirty = false
      setLoading(true)
      const request = ++generation.current
      try {
        if (!unsubscribe) unsubscribe = api.onChanged(schedule)
        const result = await api.snapshot()
        if (!active || session !== lifetime.current) return
        if (request !== generation.current) { dirty = true; return }
        if (!userEmail.trim() || result.actor.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
          setSnapshot(null)
          snapshotRef.current = null
          setAuthorizationBlocked(true)
          setLoadError(labelsRef.current.permissionDenied)
          return
        }
        const next = { ...result, cases: result.cases.filter(entry => !entry.deletedAt) }
        snapshotRef.current = next
        setSnapshot(next)
        setLoadError('')
        setAuthorizationBlocked(false)
        setRequiresFreshSnapshot(false)
      } catch (error) {
        if (!active || session !== lifetime.current) return
        if (request !== generation.current) { dirty = true; return }
        const translated = improvementError(error, labelsRef.current)
        setLoadError(translated === labelsRef.current.saveError ? labelsRef.current.loadError : translated)
        if (translated === labelsRef.current.permissionDenied) {
          setAuthorizationBlocked(true)
          setSnapshot(null)
          snapshotRef.current = null
        }
      } finally {
        reading = false
        if (active && session === lifetime.current) {
          setLoading(false)
          if (dirty && !writeInFlight.current) schedule()
        }
      }
    }
    reload.current = () => { void load() }
    scheduleReload.current = () => { if (dirty) schedule() }
    if (api) {
      setLoading(true)
      void load()
    } else setLoading(false)
    return () => {
      active = false
      alive.current = false
      if (timer) clearTimeout(timer)
      unsubscribe?.()
      reload.current = () => {}
      scheduleReload.current = () => {}
    }
  }, [api, userEmail])

  const runAction = async (action: PendingAction) => {
    if (!api || writeInFlight.current || !alive.current) return
    const current = snapshotRef.current
    if (!current || current.actor.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
      setCommandError(labelsRef.current.permissionDenied)
      return
    }
    const session = lifetime.current
    writeInFlight.current = true
    generation.current++
    setBusy(true)
    setCommandError('')
    let needsReload = false
    try {
      const result = await api.command(action.command)
      if (!alive.current || session !== lifetime.current) return
      generation.current++
      const previous = snapshotRef.current
      if (previous) {
        const next = { ...previous, cases: applyImprovementResult(previous.cases, result) }
        snapshotRef.current = next
        setSnapshot(next)
      }
      if (result.deletedAt) setSelectedId(current => current === result.id ? null : current)
      pendingAction.current = null
      setHasPendingAction(false)
      action.onSuccess?.()
      toast.success(action.command.type === 'comment' ? labelsRef.current.commentSaved : labelsRef.current.saved)
      if (action.command.type === 'create' && !result.deletedAt) setSelectedId(result.id)
    } catch (error) {
      if (!alive.current || session !== lifetime.current) return
      const translated = improvementError(error, labelsRef.current)
      setCommandError(translated)
      if (!isRetryableImprovementError(error)) {
        pendingAction.current = null
        setHasPendingAction(false)
        needsReload = translated === labelsRef.current.conflict || translated === labelsRef.current.caseUnavailable || translated === labelsRef.current.permissionDenied
        if (needsReload) setRequiresFreshSnapshot(true)
        if (translated === labelsRef.current.permissionDenied) setAuthorizationBlocked(true)
      }
    } finally {
      if (alive.current && session === lifetime.current) {
        writeInFlight.current = false
        setBusy(false)
        if (needsReload) reload.current()
        else scheduleReload.current()
      }
    }
  }

  const blocked = hasPendingAction || authorizationBlocked || requiresFreshSnapshot || loading || Boolean(loadError) || !snapshot
  const actions: ImprovementActions = {
    busy,
    blocked,
    error: commandError,
    canRetry: hasPendingAction && !authorizationBlocked,
    retry: () => { if (pendingAction.current) void runAction(pendingAction.current) },
    command: (input: ImprovementCommandInput, onSuccess?: () => void) => {
      if (blocked || writeInFlight.current || pendingAction.current) return
      try {
        const action: PendingAction = { command: { ...input, operationId: crypto.randomUUID() }, onSuccess }
        pendingAction.current = action
        setHasPendingAction(true)
        void runAction(action)
      } catch { setCommandError(labelsRef.current.saveError) }
    },
  }
  const actorEmail = snapshot?.actor.email.trim().toLowerCase() || ''
  const liveCases = snapshot?.cases.filter(entry => !entry.deletedAt) || []
  const cases = snapshot ? filterImprovements(snapshot.cases, filters, snapshot.actor.email, snapshot.actor.teamCode) : []
  const view = filters.view || 'active'
  const viewCount = (value: ImprovementView) => snapshot ? filterImprovements(snapshot.cases, { ...filters, view: value }, snapshot.actor.email, snapshot.actor.teamCode).length : 0
  const viewStatuses = IMPROVEMENT_STATUSES.filter(status => improvementView(status) === view)
  const selected = liveCases.find(entry => entry.id === selectedId)
  const invitations = liveCases.reduce((total, entry) => total + entry.assignments.filter(assignment =>
    assignment.status === 'pending' && assignment.email.trim().toLowerCase() === actorEmail,
  ).length, 0)
  const unseen = unseenImprovementIds(liveCases, actorEmail, seen)
  // Opening a suggestion (and anything that happens while it is open) counts as seen.
  useEffect(() => { if (selected && seen) markSeen(selected) }, [selected, seen, markSeen])
  const teamName = (code: string) => snapshot?.teams.find(team => team.folderName === code)?.name || code
  const changeFilter = <Key extends keyof ImprovementFilters>(key: Key, value: ImprovementFilters[Key]) => setFilters(current => ({ ...current, [key]: value }))
  const backLabel = backLabels[language === 'da' || language === 'fi' || language === 'sv' ? language : 'en']
  const today = new Date()

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1600px] space-y-4 p-3 text-foreground sm:p-6" lang={language}>
      <header className="flex min-w-0 flex-wrap items-center gap-2 border-b pb-3">
        <IconAction label={backLabel} disabled={busy} onClick={onNavigateBack}><ArrowLeft size={20} /></IconAction>
        <h1 className="min-w-0 flex-1 break-words text-xl font-semibold leading-snug">{labels.title}</h1>
        {api && <IconAction label={labels.refresh} disabled={loading || busy} onClick={() => reload.current()}><ArrowsClockwise size={19} className={loading ? 'animate-spin' : ''} /></IconAction>}
        {snapshot && <Button disabled={blocked || busy} onClick={() => setCreateOpen(true)} className="max-w-full whitespace-normal text-left"><Plus size={18} />{labels.newSuggestion}</Button>}
      </header>
      {!api ? <p role="status" className="py-8 text-sm text-muted-foreground">{labels.unavailable}</p> : <>
        {loadError && <div role="alert" className="flex flex-wrap items-center gap-3 border-l-2 border-destructive bg-destructive/5 p-3 text-sm">
          <p className="min-w-0 flex-1 break-words">{loadError}</p>
          <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => reload.current()}><ArrowsClockwise size={16} />{labels.retry}</Button>
        </div>}
        <ImprovementActionError actions={actions} labels={labels} />
        {loading && <p role="status" className="text-sm text-muted-foreground">{labels.loading}</p>}
        {snapshot && <>
          <div className="inline-flex max-w-full flex-wrap gap-1 rounded-md border p-1" role="group" aria-label={labels.status}>
            {(['active', 'completed', 'declined'] as ImprovementView[]).map(value => <Button key={value} type="button" size="sm"
              variant={view === value ? 'secondary' : 'ghost'} aria-pressed={view === value} className="h-auto min-h-9 whitespace-normal py-1.5"
              onClick={() => setFilters(current => ({ ...current, view: value, status: 'all' }))}>
              {value === 'active' ? <Lightning size={17} /> : value === 'completed' ? <CheckCircle size={17} /> : <XCircle size={17} />}<span>{labels.views[value]}</span>
              <span className="inline-flex min-w-5 shrink-0 justify-center rounded-sm bg-muted px-1 text-xs tabular-nums">{viewCount(value)}</span>
            </Button>)}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-wrap gap-1" role="group" aria-label={labels.filters}>
              {(['all', 'mine', 'assigned', 'department'] as ImprovementPreset[]).map(preset => <Button key={preset} type="button" size="sm"
                variant={filters.preset === preset ? 'secondary' : 'ghost'} aria-pressed={filters.preset === preset}
                className="h-auto min-h-9 whitespace-normal py-1.5" onClick={() => setFilters(current => ({ ...current, preset, invitations: false }))}>{labels.presets[preset]}</Button>)}
            </div>
            <div className="flex min-w-0 flex-wrap gap-2 md:ml-auto">
              <Button type="button" size="sm" variant={filters.invitations ? 'secondary' : 'outline'} aria-pressed={Boolean(filters.invitations)}
                className="h-auto min-h-9 whitespace-normal py-1.5" onClick={() => setFilters(current => ({ ...current, invitations: !current.invitations, preset: 'all' }))}>
                <EnvelopeSimple size={17} /><span>{labels.pendingInvitations}</span><span className="inline-flex min-w-5 shrink-0 justify-center rounded-sm bg-muted px-1 text-xs tabular-nums">{invitations}</span>
              </Button>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-56 space-y-1">
              <Label htmlFor="improvements-search" className="sr-only">{labels.search}</Label>
              <div className="relative"><MagnifyingGlass size={17} className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" />
                <Input id="improvements-search" type="search" className="h-9 pl-9" placeholder={labels.searchPlaceholder} value={filters.search || ''} onChange={event => changeFilter('search', event.target.value)} />
              </div>
            </div>
            <Button type="button" variant={showFilters ? 'secondary' : 'outline'} size="sm" className="h-9" aria-expanded={showFilters} aria-controls="improvements-filters" onClick={() => setShowFilters(current => !current)}><Funnel size={17} />{labels.filters}</Button>
            <div className="min-w-0 max-w-full basis-48 space-y-1"><Label htmlFor="improvements-sort" className="sr-only">{labels.sortBy}</Label>
              <select id="improvements-sort" className={selectClass} value={filters.sort || 'updated'} onChange={event => changeFilter('sort', event.target.value as ImprovementSort)}>
                {(['updated', 'newest', 'oldest', 'priority', 'due'] as ImprovementSort[]).map(sort => <option key={sort} value={sort}>{labels.sorts[sort]}</option>)}
              </select></div>
            <IconAction label={labels.clearFilters} onClick={() => setFilters({ ...DEFAULT_FILTERS, view })}><X size={18} /></IconAction>
          </div>
          {showFilters && <section id="improvements-filters" aria-label={labels.filters} className="grid min-w-0 grid-cols-1 gap-3 border-b pb-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="min-w-0 space-y-1"><Label htmlFor="improvements-status">{labels.status}</Label><select id="improvements-status" className={selectClass} value={filters.status || 'all'} onChange={event => changeFilter('status', event.target.value as ImprovementFilters['status'])}>
              <option value="all">{labels.allStatuses}</option>{viewStatuses.map(status => <option key={status} value={status}>{labels.statuses[status]}</option>)}
            </select></div>
            <div className="min-w-0 space-y-1"><Label htmlFor="improvements-priority">{labels.priority}</Label><select id="improvements-priority" className={selectClass} value={filters.priority || 'all'} onChange={event => changeFilter('priority', event.target.value as ImprovementFilters['priority'])}>
              <option value="all">{labels.allPriorities}</option>{IMPROVEMENT_PRIORITIES.map(priority => <option key={priority} value={priority}>{labels.priorities[priority]}</option>)}
            </select></div>
            <div className="min-w-0 space-y-1"><Label htmlFor="improvements-origin">{labels.originTeam}</Label><select id="improvements-origin" className={selectClass} value={filters.originTeam || 'all'} onChange={event => changeFilter('originTeam', event.target.value)}>
              <option value="all">{labels.allTeams}</option>{snapshot.teams.map(team => <option key={team.folderName} value={team.folderName}>{team.name}</option>)}
            </select></div>
            <div className="min-w-0 space-y-1"><Label htmlFor="improvements-affected">{labels.affectedTeams}</Label><select id="improvements-affected" className={selectClass} value={filters.affectedTeam || 'all'} onChange={event => changeFilter('affectedTeam', event.target.value)}>
              <option value="all">{labels.allTeams}</option>{snapshot.teams.map(team => <option key={team.folderName} value={team.folderName}>{team.name}</option>)}
            </select></div>
            <div className="min-w-0 space-y-1"><Label htmlFor="improvements-person">{labels.person}</Label><select id="improvements-person" className={selectClass} value={filters.person || 'all'} onChange={event => changeFilter('person', event.target.value)}>
              <option value="all">{labels.allPeople}</option>{snapshot.people.map(person => <option key={person.email} value={person.email}>{person.fullName} / {teamName(person.teamCode)}</option>)}
            </select></div>
          </section>}
          <section aria-label={labels.title} aria-busy={loading}>
            <div className={`hidden gap-3 border-b px-2 py-2 text-xs font-medium text-muted-foreground md:grid ${rowColumns}`}>
              <span>{labels.caseTitle} ({cases.length})</span><span>{labels.status}</span><span>{labels.priority}</span><span>{labels.originTeam}</span><span>{labels.owner}</span><span>{labels.deadlines}</span>
            </div>
            {cases.length ? <ul className="divide-y">{cases.map(entry => {
              const owner = entry.assignments.find(assignment => assignment.kind === 'owner' && assignment.status === 'accepted')
              const activeDeadline = !['completed', 'declined'].includes(entry.status)
              const overdue = activeDeadline && isImprovementDeadlineOverdue(entry.dueDate, today)
              const feedbackOverdue = activeDeadline && isImprovementDeadlineOverdue(entry.feedbackDueDate, today)
              return <li key={entry.id}><button type="button" onClick={() => setSelectedId(entry.id)}
                className={`grid w-full min-w-0 grid-cols-2 items-start gap-x-3 gap-y-2 px-2 py-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${rowColumns}`}>
                <div className="col-span-2 min-w-0 md:col-span-1"><p className="flex min-w-0 items-start gap-2 break-words font-medium">
                  {unseen.has(entry.id) && <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-primary" title={labels.unseenChanges}><span className="sr-only">{labels.unseenChanges}</span></span>}
                  <span className="min-w-0">{entry.title}</span></p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{entry.createdByName || entry.createdBy}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{improvementDate(entry.updatedAt, language, true)}</p>
                </div>
                <div className="min-w-0"><span className="block text-xs text-muted-foreground md:hidden">{labels.status}</span><span className={`break-words ${entry.status === 'ready-for-approval' ? 'font-medium text-primary' : ''}`}>{labels.statuses[entry.status]}</span></div>
                <div className="min-w-0"><span className="block text-xs text-muted-foreground md:hidden">{labels.priority}</span><span className={`break-words ${entry.priority === 'critical' ? 'font-medium text-destructive' : ''}`}>{labels.priorities[entry.priority]}</span></div>
                <div className="min-w-0"><span className="block text-xs text-muted-foreground md:hidden">{labels.originTeam}</span><span className="break-words">{teamName(entry.originTeamCode)}</span></div>
                <div className="min-w-0"><span className="block text-xs text-muted-foreground md:hidden">{labels.owner}</span><span className="break-words">{owner?.name || labels.unassigned}</span></div>
                <div className="min-w-0 space-y-2"><div><span className="block text-xs text-muted-foreground">{labels.dueDate}</span><span className={overdue ? 'text-destructive' : 'text-muted-foreground'}>{entry.dueDate ? improvementDate(entry.dueDate, language) : labels.noDeadline}</span>
                  {overdue && <span className="block text-xs text-destructive">{labels.overdue}</span>}</div>
                  {entry.feedbackDueDate && <div><span className="block break-words text-xs text-muted-foreground">{labels.feedbackDueDate}</span>
                    <span className={feedbackOverdue ? 'text-destructive' : 'text-muted-foreground'}>{improvementDate(entry.feedbackDueDate, language)}</span>
                    {feedbackOverdue && <span className="block text-xs text-destructive">{labels.overdue}</span>}</div>}</div>
              </button></li>
            })}</ul> : <p className="py-8 text-sm text-muted-foreground">{liveCases.length ? labels.noResults : labels.empty}</p>}
          </section>
          <ImprovementCreateDialog snapshot={snapshot} labels={labels} actions={actions} open={createOpen} onOpenChange={setCreateOpen} />
          {selected && <ImprovementCaseDialog key={selected.id} entry={selected} snapshot={snapshot} labels={labels} language={language} actions={actions} open onOpenChange={value => { if (!value) setSelectedId(null) }} />}
          {selectedId && !selected && <p role="status" className="text-sm text-muted-foreground">{labels.caseUnavailable}</p>}
        </>}
      </>}
    </main>
  )
}