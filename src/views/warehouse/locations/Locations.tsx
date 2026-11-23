import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CloudSlash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { isAnyModalOpen } from '@/lib/modalStack'
import { errorMessage } from '@/lib/warehouse/errors'
import type { LocationsTarget } from '@/lib/warehouse/locations'
import { startLocationsRead } from '@/lib/warehouse/locationActions'
import { t } from '@/lib/warehouse/text'
import type { LocationList, WarehouseUser } from '@/types/warehouse'
import { Admin } from './Admin'
import { FetchGuide } from './FetchGuide'
import { ImportSheet } from './ImportSheet'
import { LocationCard } from './LocationCard'
import { LocationsHome } from './LocationsHome'
import { MaterialCard } from './MaterialCard'
import { PalletCard } from './PalletCard'
import { PutAway } from './PutAway'
import { RackCard } from './RackCard'
import { ShelfPut } from './ShelfPut'
import { Refill } from './Refill'
import { LocationsLog } from './LocationsLog'
import { MovePallet } from './MovePallet'
import { TakePallet } from './TakePallet'
import { LayoutEditor } from './layout/LayoutEditor'
import { LocationsMap } from './map/LocationsMap'

/**
 * Placeringer: where every pallet of the hub stands. The front page leads to the daily tasks and the cards; a change on
 * this PC re-reads the open view at once, a change on another PC within 15 seconds (the change stamp is polled).
 */
export function Locations({ user, initial }: { user: WarehouseUser; initial: LocationsTarget }) {
  const [target, setTarget] = useState<LocationsTarget>(initial)
  const [version, setVersion] = useState(0)
  const [pending, setPending] = useState(0)
  // Managers and Placerings admins maintain locations and undo (roles.me: a status manager is not one by that alone).
  const [canAdmin, setCanAdmin] = useState(user.role === 'manager')
  const toHome = useCallback(() => setTarget({ kind: 'home' }), [])
  const [tags, setTags] = useState<string[]>([])
  // A published drawing makes the places (the create and import entries give way to it) and opens the map for everyone.
  const [drawing, setDrawing] = useState<LocationList['drawing']>(null)
  const overviewRead = useRef(false)
  useEffect(() => {
    let current = true
    const fresh = startLocationsRead()
    window.electronWarehouse!.locations.overview().then(result => {
      // An answer read while one of this PC's actions was on its way may be older than the screen; the action's end reads again.
      if (current && (fresh() || !overviewRead.current)) { overviewRead.current = true; setTags(result.tags); setDrawing(result.drawing) }
    }).catch(() => {})
    return () => { current = false }
  }, [version])
  const drawn = Boolean(drawing)

  useEffect(() => {
    window.electronWarehouse?.roles.me().then(result => setCanAdmin(result.locationAdmin)).catch(() => {})
  }, [user.role, user.email])

  useEffect(() => {
    const bridge = window.electronWarehouse!.locations
    // Failures of replayed actions are shown once on this PC (also another person's, by name) and then acknowledged.
    const checkPending = () => bridge.pending().then(result => {
      setPending(result.pending)
      if (!result.failures.length) return
      for (const failure of result.failures) {
        const who = failure.email === user.email ? '' : ` (${failure.name || failure.email})`
        toast.error(t(`En handling gemt på denne PC kunne ikke gennemføres${who}`, `An action saved on this PC could not be completed${who}`), { description: `${failure.label || failure.method}: ${errorMessage(new Error(failure.code))}`, duration: Infinity })
      }
      void bridge.acknowledgeFailures(result.failures.map(failure => failure.id)).catch(() => {})
    }).catch(() => {})
    let seen: number | null = null
    const checkStamp = () => bridge.stamp().then(({ changedAt }) => {
      if (seen !== null && changedAt !== seen) setVersion(value => value + 1)
      seen = changedAt
    }).catch(() => {})
    checkPending()
    void checkStamp()
    // The stamp is a read on M:: skipped while the window is hidden, checked at once when it shows again.
    const timer = window.setInterval(() => { checkPending(); if (document.visibilityState === 'visible') void checkStamp() }, 15000)
    const onVisible = () => { if (document.visibilityState === 'visible') void checkStamp() }
    document.addEventListener('visibilitychange', onVisible)
    const offChanged = bridge.onChanged(payload => { if (payload.team === user.team) { setVersion(value => value + 1); checkPending() } })
    const offFailed = bridge.onSyncFailed(payload => { if (payload.teams.includes(user.team)) checkPending() })
    // An action kept on this PC: the waiting banner shows at once, so nobody repeats it thinking it was lost.
    const offQueued = bridge.onQueued(payload => { if (payload.team === user.team) checkPending() })
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); offChanged(); offFailed(); offQueued() }
  }, [user.team, user.email])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape inside Placeringer goes back to its front page; Warehouse.tsx handles the front page itself.
      // An open suggestion list closes first.
      if ((event.target as HTMLElement | null)?.getAttribute?.('aria-expanded') === 'true') return
      if (event.key === 'Escape' && target.kind !== 'home' && !event.defaultPrevented && !isAnyModalOpen()) { event.preventDefault(); toHome() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [target.kind, toHome])

  return (
    <div className="container mx-auto space-y-5 px-4 py-6 sm:px-6">
      {(target.kind !== 'home' || pending > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {target.kind !== 'home' && <Button variant="ghost" size="sm" onClick={toHome}><ArrowLeft size={16} /> {t('Placeringer', 'Locations')}</Button>}
          {pending > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs">
              <CloudSlash size={14} /> {t(`${pending} handling(er) venter på M:`, `${pending} action(s) waiting for M:`)}
            </span>
          )}
        </div>
      )}
      {target.kind === 'home' && <LocationsHome user={user} canAdmin={canAdmin} drawn={drawn} drawing={drawing} version={version} onOpen={setTarget} />}
      {target.kind === 'putaway' && <PutAway user={user} tags={tags} drawing={drawing} version={version} onOpen={setTarget} onDone={() => setVersion(value => value + 1)} />}
      {target.kind === 'shelf' && <ShelfPut key={target.id || ''} shelf={target.id} version={version} onDone={() => setVersion(value => value + 1)} />}
      {target.kind === 'take' && <TakePallet material={target.id} version={version} onDone={() => setVersion(value => value + 1)} />}
      {target.kind === 'refill' && <Refill id={target.id} version={version} onDone={() => setVersion(value => value + 1)} />}
      {target.kind === 'fetch' && <FetchGuide key={target.id || ''} material={target.id} version={version} onOpen={setTarget} />}
      {target.kind === 'log' && <LocationsLog key={target.id || ''} user={user} query={target.id} version={version} onOpen={setTarget} onChanged={() => setVersion(value => value + 1)} />}
      {target.kind === 'move' && <MovePallet pallet={target.id} version={version} onDone={() => setVersion(value => value + 1)} />}
      {target.kind === 'material' && <MaterialCard material={target.id} version={version} onOpen={setTarget} />}
      {target.kind === 'location' && <LocationCard key={target.id} location={target.id} version={version} canAdmin={canAdmin} drawing={drawing} onOpen={setTarget} onChanged={() => setVersion(value => value + 1)} />}
      {target.kind === 'rack' && <RackCard key={target.id} rack={target.id} version={version} canAdmin={canAdmin} drawn={drawn} drawing={drawing} onOpen={setTarget} onChanged={() => setVersion(value => value + 1)} />}
      {target.kind === 'pallet' && <PalletCard key={target.id} pallet={target.id} version={version} tags={tags} onOpen={setTarget} onChanged={() => setVersion(value => value + 1)} />}
      {target.kind === 'admin' && <Admin user={user} version={version} onOpen={setTarget} onChanged={() => setVersion(value => value + 1)} onTags={setTags} />}
      {target.kind === 'import' && <ImportSheet onDone={() => { setVersion(value => value + 1); setTarget({ kind: 'home' }) }} />}
      {target.kind === 'layout' && canAdmin && <LayoutEditor user={user} onDone={toHome} />}
      {target.kind === 'map' && <LocationsMap key={target.id || ''} user={user} focus={target.id} drawing={drawing} version={version} onOpen={setTarget} />}
    </div>
  )
}
