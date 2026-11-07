import { useEffect, useRef, useState } from 'react'
import { ArrowCounterClockwise, Barcode, LockKey, LockKeyOpen, SpeakerHigh, SpeakerSlash, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber, formatTime, kindLabel, outcomeView, type Tone } from '@/lib/warehouse/format'
import { isSoundOn, playTone, setSoundOn } from '@/lib/warehouse/sound'
import { cn } from '@/lib/utils'
import type { ScanResult } from '@/types/warehouse'
import type { PanelProps } from './CountView'
import { MaterialFocus } from './MaterialFocus'
import { isApproved, lockOf, mayCount, MaterialsInProgress } from './MaterialWork'
import { takeLock, withClaim } from './optimisticState'
import { RemoveSerialDialog } from './RemoveSerial'
import { t } from '@/lib/warehouse/text'

const TONE_STYLES: Record<Tone, string> = {
  success: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  warning: 'border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  error: 'border-red-500/60 bg-red-500/10 text-red-800 dark:text-red-200',
}

interface SessionScan {
  key: number
  result: ScanResult
  at: number
}

export function ScanPanel({ id, open, state, refresh, optimistic, person }: PanelProps) {
  const placeKey = `warehouse-place-${id}`
  const focusKey = `warehouse-focus-${id}`
  const [place, setPlace] = useState(() => localStorage.getItem(placeKey) || '')
  const [focusMaterial, setFocusMaterial] = useState(() => localStorage.getItem(focusKey) || '')
  const [serial, setSerial] = useState('')
  const [last, setLast] = useState<SessionScan | null>(null)
  const [session, setSession] = useState<SessionScan[]>([])
  const [sound, setSound] = useState(isSoundOn())
  const [queueSize, setQueueSize] = useState(0)
  const [removing, setRemoving] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [taking, setTaking] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queue = useRef<string[]>([])
  const working = useRef(false)
  const counter = useRef(0)
  const placeRef = useRef(place)

  useEffect(() => { placeRef.current = place; localStorage.setItem(placeKey, place) }, [place, placeKey])
  useEffect(() => { localStorage.setItem(focusKey, focusMaterial) }, [focusMaterial, focusKey])
  useEffect(() => { if (focusMaterial && isApproved(state, focusMaterial)) setFocusMaterial('') }, [focusMaterial, state])
  useEffect(() => { inputRef.current?.focus() }, [])

  const chooseMaterial = (value: string) => {
    const previous = focusMaterial
    // Shown at once (also under "Materialer i gang"): taking the material is a write to M: and can take many seconds.
    setFocusMaterial(value)
    inputRef.current?.focus()
    const lock = value ? lockOf(state, value) : null
    if (!value || (lock && mayCount(lock, state.me.email))) return
    setTaking(value)
    void optimistic(takeLock(value, person), () => window.electronWarehouse!.counts.lockMaterial({ id, material: value })).then(saved => {
      if (!saved) setFocusMaterial(current => (current === value ? previous : current))
      setTaking(current => (current === value ? null : current))
    })
  }

  const processQueue = async () => {
    if (working.current) return
    working.current = true
    try {
      while (queue.current.length) {
        const next = queue.current.shift()!
        setQueueSize(queue.current.length)
        try {
          const result = await window.electronWarehouse!.counts.scan({ id, serial: next, place: placeRef.current })
          const view = outcomeView(result)
          const tone: Tone = (result.areaWarning || result.materialWarning) && view.tone === 'success' ? 'warning' : view.tone
          playTone(tone)
          const entry = { key: ++counter.current, result, at: Date.now() }
          setLast(entry)
          setSession(current => [entry, ...current].slice(0, 200))
        } catch (error) {
          playTone('error')
          toast.error(errorMessage(error))
        }
      }
    } finally {
      working.current = false
      setQueueSize(0)
      void refresh()
    }
  }

  const submit = () => {
    const value = serial.trim()
    setSerial('')
    if (!value) return
    queue.current.push(value)
    setQueueSize(queue.current.length)
    void processQueue()
  }

  const undo = async () => {
    if (undoing) return
    setUndoing(true)
    try {
      const { undone } = await window.electronWarehouse!.counts.undo({ id })
      toast.success(t(`Fortrudt: ${undone.serial || undone.material || undone.type}`, `Undone: ${undone.serial || undone.material || undone.type}`))
      setSession(current => current.filter(entry => entry.result.eventId !== undone.id))
      setLast(current => (current?.result.eventId === undone.id ? null : current))
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUndoing(false)
      inputRef.current?.focus()
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLInputElement && event.target !== inputRef.current)) {
        event.preventDefault()
        void undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const claimedBy = new Map(state.claims.map(claim => [claim.area, claim]))
  const myClaims = state.claims.filter(claim => claim.email === state.me.email)
  // Shown at once; the write to M: (15–90 s) runs in the background and is taken back if it fails.
  const toggleClaim = (area: string) => {
    const claim = claimedBy.get(area)
    const at = Date.now()
    if (claim?.email === state.me.email) void optimistic(withClaim(area, null), () => window.electronWarehouse!.counts.release({ id, area }))
    else void optimistic(withClaim(area, { area, email: person.email, name: person.name, at, lastActivity: at }), () => window.electronWarehouse!.counts.claim({ id, area }))
  }

  const lastView = last ? outcomeView(last.result) : null
  const lastTone: Tone | null = last && lastView ? ((last.result.areaWarning || last.result.materialWarning) && lastView.tone === 'success' ? 'warning' : lastView.tone) : null
  const found = state.progress.overall

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <Label htmlFor="scan-place">{t('Sted (placering, palle, reol …)', 'Location (place, pallet, shelf …)')}</Label>
                <Input id="scan-place" list="scan-places" value={place} maxLength={60} onChange={event => setPlace(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') inputRef.current?.focus() }} placeholder={t('Fx A1.1 eller Arbejdsstation 4', 'E.g. A1.1 or Workstation 4')} />
                <datalist id="scan-places">{open.places.map(item => <option key={item.name} value={item.name}>{item.area}</option>)}</datalist>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" size="icon" aria-label={sound ? t('Slå lyd fra', 'Sound off') : t('Slå lyd til', 'Sound on')} onClick={() => { setSoundOn(!sound); setSound(!sound) }}>
                  {sound ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}
                </Button>
                <Button variant="outline" loading={undoing} onClick={() => undo()}><ArrowCounterClockwise size={18} /> {t('Fortryd (Ctrl+Z)', 'Undo (Ctrl+Z)')}</Button>
                <Button variant="outline" onClick={() => setRemoving(true)}><Trash size={18} /> {t('Fjern serienummer', 'Remove serial number')}</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scan-serial" className="flex items-center gap-2"><Barcode size={18} /> {t('Scan serienummer', 'Scan serial number')}</Label>
              <Input
                id="scan-serial"
                ref={inputRef}
                value={serial}
                autoComplete="off"
                spellCheck={false}
                onChange={event => setSerial(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } }}
                className="h-16 font-mono text-2xl tracking-wider"
                placeholder={t('Scan eller tast + Enter', 'Scan or type + Enter')}
              />
              {queueSize > 0 && <p className="text-xs text-muted-foreground">{t(`${queueSize} scanninger i kø …`, `${queueSize} scans queued …`)}</p>}
            </div>
          </CardContent>
        </Card>

        <div aria-live="assertive" className={cn('min-h-36 rounded-xl border-2 p-6 transition-colors', lastTone ? TONE_STYLES[lastTone] : 'border-dashed text-muted-foreground')}>
          {!last || !lastView ? (
            <p className="text-center text-sm">{t('Klar til scanning. Resultatet vises her med farve og lyd.', 'Ready to scan. The result is shown here with colour and sound.')}</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-3xl font-bold">{lastView.title}</span>
                {last.result.blocked && last.result.outcome !== 'unknown' && <Badge className="bg-orange-500 text-white">BLOCKED</Badge>}
                {lastView.detail && <span className="text-lg font-semibold">{lastView.detail}</span>}
              </div>
              <p className="font-mono text-xl">{last.result.serial}</p>
              {last.result.material && (
                <p className="text-sm">
                  <span className="font-semibold">{last.result.description || last.result.material}</span> · <span className="font-mono">{last.result.material}</span> · {kindLabel(last.result.kind)} · SAP: {last.result.sloc}
                </p>
              )}
              {focusMaterial && last.result.material && last.result.material !== focusMaterial && last.result.outcome !== 'duplicate' && (
                <p className="text-sm font-semibold">{t(`Bemærk: ikke det valgte materiale (${focusMaterial}).`, `Note: not the chosen material (${focusMaterial}).`)}</p>
              )}
              {last.result.outcome === 'duplicate' && last.result.previous && (
                <p className="text-sm">{t(`Scannet af ${last.result.previous.byName} kl. ${formatTime(last.result.previous.at)}${last.result.previous.place ? ` på ${last.result.previous.place}` : ''}`, `Scanned by ${last.result.previous.byName} at ${formatTime(last.result.previous.at)}${last.result.previous.place ? ` in ${last.result.previous.place}` : ''}`)}</p>
              )}
              {last.result.areaWarning && <p className="text-sm font-semibold">{t(`Område ${last.result.areaWarning.area} tælles af ${last.result.areaWarning.byName} – scanningen er gemt og markeret.`, `Area ${last.result.areaWarning.area} is counted by ${last.result.areaWarning.byName} – the scan is saved and marked.`)}</p>}
              {last.result.materialWarning?.kind === 'locked' && <p className="text-sm font-semibold">{t(`Materialet tælles af ${last.result.materialWarning.byName} – scanningen er gemt. Sig det til ${last.result.materialWarning.byName}.`, `The material is counted by ${last.result.materialWarning.byName} – the scan is saved. Tell ${last.result.materialWarning.byName}.`)}</p>}
              {last.result.materialWarning?.kind === 'approved' && <p className="text-sm font-semibold">{t('Materialet er allerede godkendt – scanningen er gemt, men ændrer ikke den godkendte difference.', 'The material is already approved – the scan is saved but does not change the approved difference.')}</p>}
            </div>
          )}
        </div>

        <MaterialFocus
          id={id}
          state={state}
          material={focusMaterial}
          onMaterialChange={value => void chooseMaterial(value)}
          taking={taking === focusMaterial && Boolean(taking)}
          reloadKey={`${session.length}-${state.serials.found}-${state.serials.extra}`}
          lastSerial={last?.result.serial ?? null}
          refresh={refresh}
        />

        <Card>
          <CardHeader><CardTitle className="text-base">{t('Denne session', 'This session')} ({session.length})</CardTitle></CardHeader>
          <CardContent>
            {session.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen scanninger endnu.', 'No scans yet.')}</p> : (
              <ul className="divide-y text-sm">
                {session.slice(0, 30).map(entry => {
                  const view = outcomeView(entry.result)
                  return (
                    <li key={entry.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <span className={cn('size-2.5 rounded-full', view.tone === 'success' ? 'bg-emerald-500' : view.tone === 'warning' ? 'bg-amber-500' : 'bg-red-500')} />
                      <span className="font-mono">{entry.result.serial}</span>
                      <span className="text-muted-foreground">{view.title}{view.detail ? ` · ${view.detail}` : ''}</span>
                      {entry.result.description && <span className="truncate text-xs text-muted-foreground">{entry.result.description}</span>}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatTime(entry.at)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <MaterialsInProgress id={id} state={state} optimistic={optimistic} person={person} isOwner={state.me.isOwner} />
        {removing && <RemoveSerialDialog id={id} refresh={refresh} onClose={() => { setRemoving(false); inputRef.current?.focus() }} />}

        <Card>
          <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t('Serienumre fundet', 'Serial numbers found')} value={`${formatNumber(state.serials.found)} / ${formatNumber(state.serials.expected)}`} />
            <Row label={t('Mangler', 'Missing')} value={formatNumber(state.serials.missing)} />
            <Row label={t('Ekstra / ukendte', 'Extra / unknown')} value={formatNumber(state.serials.extra)} />
            <Row label={t('Skal flyttes', 'Must be moved')} value={formatNumber(state.movesTotal)} />
            <Row label={t('Samlet fremdrift', 'Overall progress')} value={`${found.percent} %`} />
          </CardContent>
        </Card>

        {open.areas.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">{t('Områder', 'Areas')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('Lås dig på et område, så kolleger kan se, hvor du tæller. Låsen frigives efter 30 minutter uden aktivitet.', 'Lock an area so colleagues can see where you are counting. The lock is released after 30 minutes without activity.')}</p>
              <div className="flex flex-wrap gap-2">
                {open.areas.map(area => {
                  const claim = claimedBy.get(area)
                  const mine = claim?.email === state.me.email
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleClaim(area)}
                      disabled={Boolean(claim) && !mine}
                      title={claim ? t(`${claim.name} tæller her`, `${claim.name} is counting here`) : t('Lås området', 'Lock the area')}
                      className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-sm transition disabled:cursor-not-allowed', mine ? 'border-primary bg-primary text-primary-foreground' : claim ? 'bg-muted text-muted-foreground' : 'hover:border-primary')}
                    >
                      {claim ? <LockKey size={14} /> : <LockKeyOpen size={14} />}
                      {area}
                      {claim && !mine && <span className="font-sans text-xs">{claim.name.split(' ')[0]}</span>}
                    </button>
                  )
                })}
              </div>
              {myClaims.length > 0 && <p className="text-xs">{t('Du tæller', 'You are counting')}: {myClaims.map(claim => claim.area).join(', ')}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}
