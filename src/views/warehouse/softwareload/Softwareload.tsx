import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs } from '@/components/warehouse/ui'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import type { SoftwareloadBridge, SoftwareloadTaskView, CountingUser } from '@/types/warehouse'
import { ErrorLine, type ReportBusy } from './common'
import { SoftwareloadFinish } from './SoftwareloadFinish'
import { SoftwareloadKif } from './SoftwareloadKif'
import { SoftwareloadPending } from './SoftwareloadPending'
import { SoftwareloadSearch } from './SoftwareloadSearch'
import { SoftwareloadStats } from './SoftwareloadStats'
import { SoftwareloadTask } from './SoftwareloadTask'

export type SoftwareloadStatus = Awaited<ReturnType<SoftwareloadBridge['status']>>
type Tab = 'task' | 'pending' | 'kif' | 'search' | 'stats'

// The task can change elsewhere (Stempelkort pauses it, another PC); the screen asks again now and then and when it is shown.
const STATUS_POLL_MS = 30_000

/** Softwareload: the person's own timed task with scanned terminals, moved in SAP when it is finished. */
export function Softwareload({ user, onOpenTimeclock, onBusyChange }: { user: CountingUser; onOpenTimeclock: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('task')
  const [status, setStatus] = useState<SoftwareloadStatus | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  // The worked time counts on from when the main process answered, by this PC's clock.
  const [receivedAt, setReceivedAt] = useState(() => Date.now())
  // A status read that started before a change on this screen must not undo that change when it answers late.
  const changes = useRef(0)

  // The parts that are working (a SAP run, scans being saved); while any is, the tool must not be left.
  const busyParts = useRef(new Set<string>())
  const reportBusy = useCallback<ReportBusy>((key, busy) => {
    const before = busyParts.current.size > 0
    if (busy) busyParts.current.add(key)
    else busyParts.current.delete(key)
    const after = busyParts.current.size > 0
    if (before !== after) onBusyChange?.(after)
  }, [onBusyChange])
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  const load = useCallback(async () => {
    const before = changes.current
    try {
      const next = await window.electronWarehouse!.softwareload.status()
      if (changes.current !== before) return
      setStatus(next)
      setReceivedAt(Date.now())
      setFailed(null)
    } catch (error) {
      setFailed(errorMessage(error))
    }
  }, [])

  const showRunning = useCallback((running: SoftwareloadTaskView | null) => {
    changes.current++
    setStatus(current => (current ? { ...current, running } : current))
    setReceivedAt(Date.now())
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, STATUS_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    const onFocus = () => { void load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const pendingCount = status?.pending.length ?? 0

  // Statistik is for managers only: a role taken away while it is open leads back to the own task.
  useEffect(() => {
    if (tab === 'stats' && status && !status.isManager) setTab('task')
  }, [tab, status])

  const choose = (next: Tab) => {
    setTab(next)
    if (next === 'task' || next === 'pending') void load()
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Tabs<Tab>
        value={tab}
        onChange={choose}
        items={[
          { value: 'task', label: t('Min opgave', 'My task') },
          // Stays while it is open, so the result of a continued task is not taken away when the list empties.
          { value: 'pending', label: t('Venter på SAP', 'Waiting for SAP'), badge: pendingCount ? <Badge variant="destructive">{pendingCount}</Badge> : undefined, hidden: !pendingCount && tab !== 'pending' },
          { value: 'kif', label: t('Flyt ind i KIF', 'Move into KIF') },
          { value: 'search', label: t('Søg serienummer', 'Search serial number') },
          // The statistics and their comments are for managers; the main process refuses anyone else.
          { value: 'stats', label: t('Statistik', 'Statistics'), hidden: !status?.isManager },
        ]}
      />
      {failed && <ErrorLine text={failed} />}

      {/* These stay mounted on the other tabs: scans being saved and a move running in SAP must not lose their screen. */}
      <div hidden={tab !== 'task'}>
        {!status ? (!failed && <Skeleton className="h-80 rounded-xl" />) : finishing ? (
          <SoftwareloadFinish
            user={user}
            task={status.running}
            writeEnabled={status.writeEnabled}
            onBack={() => { setFinishing(false); void load() }}
            onChanged={load}
            onOpenPending={() => { setFinishing(false); choose('pending') }}
            onBusy={reportBusy}
          />
        ) : (
          <SoftwareloadTask
            email={user.email}
            running={status.running}
            receivedAt={receivedAt}
            active={tab === 'task'}
            onRunning={showRunning}
            onFinish={() => setFinishing(true)}
            writeEnabled={status.writeEnabled}
            onOpenPending={() => choose('pending')}
            reload={load}
            onOpenTimeclock={onOpenTimeclock}
            onBusy={reportBusy}
          />
        )}
      </div>
      {status && <div hidden={tab !== 'pending'}><SoftwareloadPending user={user} status={status} reload={load} onBusy={reportBusy} /></div>}
      <div hidden={tab !== 'kif'}><SoftwareloadKif user={user} writeEnabled={status?.writeEnabled ?? false} active={tab === 'kif'} onBusy={reportBusy} /></div>
      {tab === 'search' && <SoftwareloadSearch isManager={status?.isManager ?? false} team={user.team} />}
      {tab === 'stats' && status?.isManager && <SoftwareloadStats />}
    </div>
  )
}
