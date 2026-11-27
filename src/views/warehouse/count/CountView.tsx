import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowsClockwise, ArrowsOut, CloudCheck, CloudSlash, FileXls, LockSimple, LockSimpleOpen, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs } from '@/components/warehouse/ui'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, scopeText } from '@/lib/warehouse/format'
import type { CountState, OpenCount, Person, WarehouseUser } from '@/types/warehouse'
import { ApprovalPanel } from './ApprovalPanel'
import { DeleteCountDialog } from './DeleteCountDialog'
import { DocPanel } from './DocPanel'
import { ExportPanel } from './ExportPanel'
import { ImportPanel } from './ImportPanel'
import { LinesPanel } from './LinesPanel'
import { MembersPanel } from './MembersPanel'
import { MovesPanel } from './MovesPanel'
import { answerRequest, createOverlays, withMember, withMeta, type StatePatch } from './optimisticState'
import { OverviewPanel } from './OverviewPanel'
import { ProgressPanel } from './ProgressPanel'
import { RefetchDialog } from './RefetchDialog'
import { ScanPanel } from './ScanPanel'
import { unsentHint, unsentPcText } from './since'
import { currentWarehouseLanguage, t } from '@/lib/warehouse/text'

const POLL_MS = 5000

export type CountTab = 'scan' | 'lines' | 'overview' | 'progress' | 'moves' | 'import' | 'export' | 'members' | 'approval' | 'doc'

/**
 * Shows `patch` at once and runs `write` in the background (a write to M: takes 15–90 s). On failure the change is
 * taken back and the error shown – unless `onError` returns true (it handled the error itself). Resolves to whether it was saved.
 */
export type Optimistic = (patch: StatePatch, write: () => Promise<unknown>, options?: { onError?: (error: unknown) => boolean | void }) => Promise<boolean>

export interface PanelProps {
  id: string
  open: OpenCount
  state: CountState
  refresh: () => Promise<void>
  reloadOpen: () => Promise<void>
  optimistic: Optimistic
  /** The user, as the drive stores who did something. */
  person: Person
}

export function CountView({ id, user, initialTab, onBack }: { id: string; user: WarehouseUser; initialTab?: CountTab; onBack: () => void }) {
  const [open, setOpen] = useState<OpenCount | null>(null)
  const [state, setState] = useState<CountState | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [tab, setTab] = useState<CountTab>(initialTab ?? 'scan')
  const [fullscreen, setFullscreen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [refetchOpen, setRefetchOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const loading = useRef(false)
  const left = useRef(false)
  const overlays = useRef(createOverlays())
  // The last state read from the drive, without this PC's changes that are still on their way.
  const serverState = useRef<CountState | null>(null)

  const leaveDeleted = useCallback(() => {
    if (left.current) return
    left.current = true
    toast.info(t('Optællingen er slettet', 'The count has been deleted'))
    onBack()
  }, [onBack])

  const refresh = useCallback(async () => {
    if (loading.current || left.current) return
    loading.current = true
    try {
      const startedAt = Date.now()
      const fresh = await window.electronWarehouse!.counts.state(id)
      overlays.current.received(startedAt)
      serverState.current = fresh
      setState(overlays.current.apply(fresh))
      setFailed(null)
    } catch (error) {
      if (errorCode(error) === 'COUNT_DELETED') leaveDeleted()
      else setFailed(errorMessage(error))
    } finally {
      loading.current = false
    }
  }, [id, leaveDeleted])

  const optimistic = useCallback<Optimistic>((patch, write, options = {}) => {
    const overlay = overlays.current.add(patch)
    setState(current => (current ? patch(current) : current))
    return trackPendingWrite(Promise.resolve().then(write)).then(
      () => {
        overlays.current.settle(overlay, Date.now())
        void refresh()
        return true
      },
      error => {
        overlays.current.remove(overlay)
        if (serverState.current) setState(overlays.current.apply(serverState.current))
        if (errorCode(error) === 'COUNT_DELETED') leaveDeleted()
        else if (!options.onError?.(error)) toast.error(errorMessage(error))
        void refresh()
        return false
      },
    )
  }, [refresh, leaveDeleted])

  const person = useMemo<Person>(() => ({ email: user.email.trim().toLowerCase(), name: user.fullName || user.email }), [user.email, user.fullName])

  const reloadOpen = useCallback(async () => {
    try {
      setOpen(await window.electronWarehouse!.counts.open(id))
    } catch (error) {
      if (errorCode(error) === 'COUNT_DELETED') leaveDeleted()
      else setFailed(errorMessage(error))
    }
  }, [id, leaveDeleted])

  useEffect(() => {
    void reloadOpen().then(() => refresh())
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [reloadOpen, refresh])

  useEffect(() => {
    if (!open) return
    setTab(current => (current === 'scan' && !open.me.canWrite ? 'overview' : current))
  }, [open])

  // "Hent SAP igen" on another PC: the materials and count lists of the screen come from the SAP figures too.
  const reloadingOpen = useRef(false)
  useEffect(() => {
    if (!open || !state || reloadingOpen.current || state.snapshotFetchedAt === undefined || state.snapshotFetchedAt === open.snapshotFetchedAt) return
    reloadingOpen.current = true
    void reloadOpen().finally(() => { reloadingOpen.current = false })
  }, [open, state, reloadOpen])

  // Notifications across PCs: the owner hears about new join requests, the requester about the answer.
  const seenRequests = useRef<Set<string> | null>(null)
  const lastStatus = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!state) return
    const requested = state.members.filter(member => member.status === 'requested')
    if (seenRequests.current && state.me.canDecideMembers) {
      for (const member of requested) {
        if (!seenRequests.current.has(member.email)) toast.info(t(`${member.name} anmoder om at deltage`, `${member.name} asks to join`), { action: { label: t('Se', 'View'), onClick: () => setTab('members') }, duration: 8000 })
      }
    }
    seenRequests.current = new Set(requested.map(member => member.email))
    if (lastStatus.current === 'requested' && state.me.status === 'approved') {
      toast.success(t('Du er godkendt som deltager – du kan nu scanne og tælle', 'You are approved as a participant – you can now scan and count'))
      setTab('scan')
    }
    if (lastStatus.current === 'requested' && state.me.status === 'rejected') toast.error(t('Din anmodning om at deltage blev afvist', 'Your request to join was rejected'))
    lastStatus.current = state.me.status
  }, [state])

  // Material locks and approvals: the holder hears about requests, the asker about the answer, managers about submissions.
  const seenMaterialRequests = useRef<Set<string> | null>(null)
  const myRequests = useRef<Set<string>>(new Set())
  const seenSubmitted = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!state) return
    const email = state.me.email
    const answerable = state.materialLocks.filter(lock => lock.holder.email === email || state.me.isOwner)
    const requestKeys = new Set(answerable.flatMap(lock => lock.requests.map(request => `${lock.material}|${request.email}`)))
    if (seenMaterialRequests.current) {
      for (const lock of answerable) {
        for (const request of lock.requests) {
          if (seenMaterialRequests.current.has(`${lock.material}|${request.email}`)) continue
          const answer = (allow: boolean) => { void optimistic(answerRequest(lock.material, request.email, allow), () => window.electronWarehouse!.counts.answerMaterialRequest({ id, material: lock.material, email: request.email, allow })) }
          toast.info(t(`${request.name} vil tælle med på ${lock.material}`, `${request.name} wants to help count ${lock.material}`), { action: { label: t('Tillad', 'Allow'), onClick: () => answer(true) }, cancel: { label: t('Afvis', 'Reject'), onClick: () => answer(false) }, duration: 12000 })
        }
      }
    }
    seenMaterialRequests.current = requestKeys

    for (const material of [...myRequests.current]) {
      const lock = state.materialLocks.find(item => item.material === material)
      if (lock?.requests.some(request => request.email === email)) continue
      myRequests.current.delete(material)
      if (!lock || lock.helpers.some(helper => helper.email === email)) toast.success(t(`Du må nu tælle med på ${material}`, `You may now help count ${material}`))
      else toast.error(t(`${lock.holder.name} afviste din anmodning om ${material}`, `${lock.holder.name} rejected your request for ${material}`))
    }
    for (const lock of state.materialLocks) if (lock.requests.some(request => request.email === email)) myRequests.current.add(lock.material)

    const submitted = Object.entries(state.approvals).filter(([, approval]) => approval.status === 'submitted')
    if (seenSubmitted.current && state.me.isManager) {
      for (const [material, approval] of submitted) {
        if (seenSubmitted.current.has(`${material}|${approval.at}`) || approval.by?.email === email) continue
        const diff = typeof approval.diff === 'number' && approval.diff !== 0 ? t(` med difference ${approval.diff > 0 ? '+' : ''}${approval.diff}`, ` with difference ${approval.diff > 0 ? '+' : ''}${approval.diff}`) : t(' uden difference', ' without a difference')
        toast.info(t(`${approval.by?.name || 'En tæller'} har sendt ${material} til godkendelse${diff}`, `${approval.by?.name || 'A counter'} sent ${material} for approval${diff}`), { action: { label: t('Se', 'View'), onClick: () => setTab('approval') }, duration: 8000 })
      }
    }
    seenSubmitted.current = new Set(submitted.map(([material, approval]) => `${material}|${approval.at}`))
  }, [state, id, optimistic])

  /** Join, close and reopen show at once; the screen of the count follows when the drive has it. */
  const change = (patch: StatePatch, write: () => Promise<unknown>, success: string) => {
    toast.success(success)
    void optimistic(patch, write).then(saved => { if (saved) void reloadOpen() })
  }
  const requestJoin = () => change(withMember({ email: person.email, name: person.name, role: 'participant', status: 'requested', requestedAt: Date.now() }), () => window.electronWarehouse!.counts.requestJoin(id), t('Anmodningen er sendt. Den ansvarlige, en admin eller en manager godkender den', 'The request was sent. The person responsible, an admin or a manager approves it'))
  const closeCount = () => {
    setTab(current => (current === 'scan' || current === 'import' ? 'overview' : current))
    change(withMeta({ status: 'closed' }, { canWrite: false }), () => window.electronWarehouse!.counts.close(id), t('Optællingen er afsluttet', 'The count is closed'))
  }
  // Other PCs that may still hold scans are named in the question: a warning only, closing goes on if confirmed.
  const confirmClose = () => {
    const unsent = state?.unsentPcs || []
    const warning = unsent.length ? `\n\n${unsent.map(pc => unsentPcText(pc)).join('\n')}\n${unsentHint()}` : ''
    if (window.confirm(t('Afslut optællingen? Ingen kan scanne eller tælle, før du genåbner den.', 'Close the count? Nobody can scan or count until you reopen it.') + warning)) closeCount()
  }
  const reopenCount = () => change(withMeta({ status: 'open' }, { canWrite: state?.me.status === 'approved' }), () => window.electronWarehouse!.counts.reopen(id), t('Optællingen er genåbnet', 'The count is reopened'))

  const makeReport = async () => {
    setBusy('report')
    try {
      const report = await window.electronWarehouse!.counts.report(id, currentWarehouseLanguage())
      toast.success(t('Rapporten er gemt', 'The report is saved'), {
        description: report.name,
        action: { label: t('Åbn', 'Open'), onClick: () => { window.electronWarehouse!.counts.openReport(report.file).catch(error => toast.error(errorMessage(error))) } },
        duration: 6000,
      })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  if (failed && !open) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}><ArrowLeft size={18} /> {t('Tilbage', 'Back')}</Button>
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{failed}</p>
      </div>
    )
  }
  if (!open || !state) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  const meta = state.meta
  const me = state.me
  const locked = state.statusLocked
  const props: PanelProps = { id, open, state, refresh, reloadOpen, optimistic, person }
  const requests = state.members.filter(member => member.status === 'requested').length
  const submittedCount = Object.values(state.approvals).filter(approval => approval.status === 'submitted').length
  // A count of terminals only has nothing to count by quantity: no accessory tab.
  const terminalsOnly = Boolean(meta.scope.kinds?.length) && !meta.scope.kinds!.includes('accessory')

  if (fullscreen) {
    return <ProgressPanel {...props} fullscreen onExitFullscreen={() => setFullscreen(false)} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('Tilbage til optællinger', 'Back to counts')}><ArrowLeft size={20} /></Button>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{meta.name}</h1>
              <Badge variant={meta.status === 'open' ? 'default' : 'secondary'}>{meta.status === 'open' ? t('Åben', 'Open') : t('Afsluttet', 'Closed')}</Badge>
              {locked && <Badge variant="outline" className="gap-1"><LockSimple size={12} /> {t('Status låst', 'Status locked')}</Badge>}
              <SyncBadge state={state} />
            </div>
            <p className="text-sm text-muted-foreground">
              {scopeText(meta.scope)} · {t('Ansvarlig', 'Responsible')}: {meta.owner.name} · {t('SAP hentet', 'SAP fetched')} {formatDateTime(meta.fetchedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!me.status && meta.status === 'open' && !locked && (
            <Button onClick={requestJoin}>
              <Plus size={18} weight="bold" /> {t('Anmod om at deltage', 'Ask to join')}
            </Button>
          )}
          {me.status === 'requested' && <Badge variant="outline" className="h-9 px-3">{t('Afventer godkendelse', 'Awaiting approval')}</Badge>}
          {me.status === 'rejected' && <Badge variant="destructive" className="h-9 px-3">{t('Anmodning afvist', 'Request rejected')}</Badge>}
          <Button variant="outline" onClick={() => setFullscreen(true)}><ArrowsOut size={18} /> {t('Fremdrift i fuld skærm', 'Progress in full screen')}</Button>
          <Button variant="outline" onClick={() => makeReport()} loading={busy === 'report'}><FileXls size={18} /> {t('Excel-rapport', 'Excel report')}</Button>
          {me.canFetchSap && meta.status === 'open' && !locked && (
            <SapActionButton variant="outline" onAction={() => setRefetchOpen(true)}><ArrowsClockwise size={18} /> {t('Hent SAP igen', 'Fetch SAP again')}</SapActionButton>
          )}
          {me.isOwner && meta.status === 'open' && !locked && (
            <Button variant="secondary" onClick={confirmClose}>
              <LockSimple size={18} /> {t('Afslut', 'Close')}
            </Button>
          )}
          {me.isOwner && meta.status === 'closed' && !locked && (
            <Button variant="secondary" onClick={reopenCount}>
              <LockSimpleOpen size={18} /> {t('Genåbn', 'Reopen')}
            </Button>
          )}
          {(me.isOwner || me.isManager) && !locked && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash size={18} /> {t('Slet', 'Delete')}
            </Button>
          )}
        </div>
      </div>

      <Tabs<CountTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'scan', label: t('Scan serienumre', 'Scan serial numbers'), hidden: !me.canWrite },
          { value: 'import', label: 'Import', hidden: !me.canWrite },
          { value: 'export', label: t('Eksport', 'Export') },
          { value: 'lines', label: t('Tilbehør og tællelister', 'Accessories and count lists'), hidden: state.lines.length === 0 && (!me.canWrite || terminalsOnly) },
          { value: 'overview', label: t('Oversigt', 'Overview') },
          { value: 'progress', label: t('Fremdrift', 'Progress'), badge: <Badge variant="secondary" className="tabular-nums">{state.progress.overall.percent} %</Badge> },
          { value: 'moves', label: t('Skal flyttes', 'Must be moved'), badge: state.movesTotal ? <Badge variant="outline" className="tabular-nums">{state.movesTotal}</Badge> : undefined },
          { value: 'members', label: t('Deltagere', 'Participants'), badge: me.canDecideMembers && requests ? <Badge className="tabular-nums">{requests}</Badge> : undefined },
          { value: 'approval', label: t('Godkendelse', 'Approval'), hidden: !me.isManager && !Object.keys(state.approvals).length, badge: submittedCount ? <Badge className="tabular-nums">{submittedCount}</Badge> : undefined },
          { value: 'doc', label: t('Til optællingsdokument', 'To count document'), hidden: !me.isManager && !me.isOwner && !Object.keys(state.approvals).length },
        ]}
      />

      {tab === 'scan' && me.canWrite && <ScanPanel {...props} />}
      {tab === 'lines' && <LinesPanel {...props} />}
      {tab === 'overview' && <OverviewPanel {...props} />}
      {tab === 'progress' && <ProgressPanel {...props} />}
      {tab === 'moves' && <MovesPanel {...props} />}
      {tab === 'import' && me.canWrite && <ImportPanel {...props} />}
      {tab === 'export' && <ExportPanel {...props} />}
      {tab === 'members' && <MembersPanel {...props} />}
      {tab === 'approval' && <ApprovalPanel {...props} />}
      {tab === 'doc' && <DocPanel {...props} />}

      {refetchOpen && <RefetchDialog id={id} onClose={() => setRefetchOpen(false)} onApplied={async () => { setRefetchOpen(false); await Promise.all([reloadOpen(), refresh()]) }} />}
      {deleteOpen && <DeleteCountDialog id={id} name={meta.name} onClose={() => setDeleteOpen(false)} onDeleted={() => { left.current = true; onBack() }} />}
    </div>
  )
}

function SyncBadge({ state }: { state: CountState }) {
  const { journal } = state
  if (!journal.online) {
    return <Badge variant="destructive" className="gap-1"><CloudSlash size={14} /> Offline · {t(`${journal.pending} venter`, `${journal.pending} waiting`)}</Badge>
  }
  if (journal.pending > 0) return <Badge variant="outline" className="gap-1"><ArrowsClockwise size={14} className="animate-spin" /> {t('Sender', 'Sending')} {journal.pending}</Badge>
  return <Badge variant="outline" className="gap-1 text-muted-foreground"><CloudCheck size={14} /> {t('Gemt på M:', 'Saved on M:')}</Badge>
}
