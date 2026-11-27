import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Users } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { dayTitle, formatDate } from '@/lib/warehouse/finlandDates'
import { kolli } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import type { FinlandCourier, FinlandFollowUpField, FinlandFollowUpRow, FinlandSnapshot } from '@/types/finland'
import { CourierTag, NoticeBox, sheetNotes, writtenAt, type Notice, type Working } from './common'
import { FollowUpCalendar } from './FollowUpCalendar'
import { FollowUpDetail } from './FollowUpDetail'
import { finlandPlace } from './place'
import { applySuggestions, changeField, chooseDefaultDay, fetchedText, filterCounts, firstInFilter, inFilter, newestFetch, nextInFilter, openForm, othersOnDay, othersOnParcel, rowId, rowStatus, rowsOfDay, savedLines, statusLines, suggestionList, wantedOf, type FollowUpFilter, type FollowUpForm, type FollowUpStatus } from './followUpLogic'
import { SaveAllConfirm, SuggestConfirm, SyncBar } from './SaveConfirm'

export interface FollowUpProps {
  /** The Opfølgning tab is shown: only then do its keys work. */
  active: boolean
  data: FinlandSnapshot | null
  working: Working
  /** Someone else holds the write lock: the buttons that write the sheet wait. */
  writeBlocked: boolean
  /** The confirmation for every day's changes is open (also from the orange marker in the title bar). */
  confirmAll: boolean
  onConfirmAll: (open: boolean) => void
  onData: (snapshot: FinlandSnapshot) => void
  onLoadSheet: () => void
  /** Runs `call` as the tool's one action at a time; undefined when something else is running. */
  exclusive: <R>(kind: NonNullable<Working>, call: () => Promise<R>) => Promise<R | undefined>
}

const ROW_GRID = 'grid grid-cols-[12px_minmax(0,1.2fr)_minmax(0,1fr)_5.5rem_3.25rem_3.25rem_3.75rem_1.75rem] items-center gap-x-2.5'

const STATUS_LOOK: Record<FollowUpStatus, { dot: string; label: () => string }> = {
  missing: { dot: 'bg-primary/30', label: () => t('Mangler', 'Missing') },
  done: { dot: 'bg-ok', label: () => t('Fulgt op', 'Followed up') },
  late: { dot: 'bg-destructive', label: () => t('For sent', 'Late') },
  blocked: { dot: 'bg-attention', label: () => t('Kan ikke følges op', 'Cannot be followed up') },
}

function StatusDot({ r }: { r: FinlandFollowUpRow }) {
  const look = STATUS_LOOK[rowStatus(r)]
  return <i title={look.label()} className={cn('inline-block size-2.5 rounded-full', look.dot)} />
}

/** Shows only the day's parcels with one status; the dots double as the legend. "Kan ikke følges op" only when there are any. */
export function StatusFilter({ counts, value, onChange }: { counts: Record<FollowUpFilter, number>; value: FollowUpFilter; onChange: (filter: FollowUpFilter) => void }) {
  const options: FollowUpFilter[] = ['all', 'missing', 'done', 'late', ...(counts.blocked || value === 'blocked' ? ['blocked' as const] : [])]
  return (
    <div role="group" aria-label={t('Vis kolli', 'Show parcels')} className="flex flex-wrap gap-1.5" data-status-filter>
      {options.map(option => {
        const pressed = value === option
        return (
          <button
            key={option}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              pressed ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:border-primary/60',
            )}
          >
            {option !== 'all' && <i aria-hidden="true" className={cn('inline-block size-2.5 rounded-full', STATUS_LOOK[option].dot, pressed && 'ring-1 ring-primary-foreground/70')} />}
            {option === 'all' ? t('Alle', 'All') : STATUS_LOOK[option].label()}
            <span className={cn('tabular-nums', pressed ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{counts[option]}</span>
          </button>
        )
      })}
    </div>
  )
}

const short = (iso: string) => formatDate(iso).slice(0, 5)

/** A list cell: the value, or nShift's suggestion in grey, or "?". `text`: not a date. */
function ListValue({ value, suggestion, text = false }: { value: string; suggestion?: string | null; text?: boolean }) {
  const shown = (v: string) => (text ? v : short(v))
  if (value) return <span className={cn(text && 'truncate')}>{shown(value)}</span>
  return (
    <span className={cn('text-muted-foreground', text && 'truncate')} title={suggestion ? t('Forslag fra nShift, ikke gemt endnu', 'Suggestion from nShift, not saved yet') : t('Ikke udfyldt', 'Not filled in')}>
      {suggestion ? shown(suggestion) : '?'}
    </span>
  )
}

/**
 * Opfølgning, as Finland T&T's followup.js: a pick-up day's parcels one by one, filled in with Expected, Received,
 * SLA, Comment and Terminal. Every change is kept as the person's draft in the shared folder at once; only "Ja, gem i
 * arket" writes the sheet. Colleagues' drafts are shown as a warning and never stop anyone.
 */
export function FollowUp({ active, data, working, writeBlocked, confirmAll, onConfirmAll, onData, onLoadSheet, exclusive }: FollowUpProps) {
  const bridge = window.electronWarehouse!.finland
  const [day, setDayState] = useState<string | null>(finlandPlace.followDay)
  const [form, setFormState] = useState<FollowUpForm | null>(null)
  const [month, setMonth] = useState<number | null>(finlandPlace.followMonth)
  const [filter, setFilterState] = useState<FollowUpFilter>(finlandPlace.followFilter)
  const [confirm, setConfirm] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [suggestOpen, setSuggestOpen] = useState(false)
  // fetch-status answered FINLAND_NSHIFT_NOT_SET; the buttons stay usable so a later setup works at once.
  const [nshiftNotSet, setNshiftNotSet] = useState(false)
  /** What "Hent status" is fetching: 'day', or the parcel's key. */
  const [fetching, setFetching] = useState<string | null>(null)
  // The keys and the awaited saves need the newest values, not the ones of the render they started in.
  const dayRef = useRef(day)
  const filterRef = useRef(filter)
  const formRef = useRef(form)
  const dataRef = useRef(data)
  const draftQueue = useRef<Promise<unknown>>(Promise.resolve())
  const rootRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const allRef = useRef<HTMLDivElement>(null)
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {})
  const saving = working === 'followup'

  const setDay = (next: string | null) => { dayRef.current = next; finlandPlace.followDay = next; setDayState(next) }
  const setForm = (next: FollowUpForm | null) => { formRef.current = next; setFormState(next) }
  const takeData = (next: FinlandSnapshot) => { dataRef.current = next; onData(next) }

  const currentRow = (snapshot: FinlandSnapshot | null = dataRef.current) => {
    const id = formRef.current?.id
    if (!snapshot || !id) return null
    return rowsOfDay(snapshot.followUp.rows, dayRef.current).find(r => rowId(r) === id) ?? null
  }

  const openRow = (r: FinlandFollowUpRow | null) => {
    setForm(r ? openForm(r) : null)
    setConfirm(false)
  }

  // New data from the main process: choose a day the first time (or keep the remembered one), and show a parcel the
  // person has not touched with the new values, as followup.js' render().
  useEffect(() => {
    dataRef.current = data
    if (!data?.sheet) return
    const rows = data.followUp.rows
    if (!dayRef.current || !data.followUp.days.some(d => d.date === dayRef.current)) setDay(chooseDefaultDay(data.followUp.days, data.today))
    const list = rowsOfDay(rows, dayRef.current)
    const f = formRef.current
    if (!f) {
      openRow(firstInFilter(list, filterRef.current))
      return
    }
    const r = list.find(x => rowId(x) === f.id)
    if (!r) openRow(list[0] ?? null)
    else if (!r.pending && f.touched.length === 0) setForm(openForm(r))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => { finlandPlace.followMonth = month }, [month])

  useEffect(() => {
    if (!confirmAll) return
    setConfirm(false)
    allRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [confirmAll])

  useEffect(() => {
    if (focusTick) detailRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [focusTick])

  const showError = (error: unknown) => setNotice({ tone: 'error', lines: [errorMessage(error)] })

  /** Keeps the touched fields as the person's draft. Saves run one after the other, so the last answer is the newest. */
  const saveDraft = async (f: FollowUpForm, r: FinlandFollowUpRow): Promise<{ ok: boolean; data?: FinlandSnapshot }> => {
    if (r.duplicate || r.noTracking) return { ok: false }
    const wanted = wantedOf(f)
    if (!Object.keys(wanted).length) return { ok: true }
    const call = draftQueue.current.then(() => bridge.saveDraft({ key: r.key, wanted, slaManual: f.slaManual, base: f.base }))
    draftQueue.current = call.catch(() => undefined)
    try {
      const fresh = await call
      takeData(fresh)
      return { ok: true, data: fresh }
    } catch (error) {
      showError(error)
      return { ok: false }
    }
  }

  const change = (field: FinlandFollowUpField, value: string) => {
    const r = currentRow()
    const f = formRef.current
    if (!r || !f || saving) return
    // A date picked with a button replaces text in the field that could not be read.
    const next = changeField(f.error === field ? { ...f, error: null } : f, r, field, value)
    setForm(next)
    void saveDraft(next, r)
  }

  const setDateError = (field: FinlandFollowUpField | null) => {
    const f = formRef.current
    if (f && f.error !== field) setForm({ ...f, error: field })
  }

  /** To the next (or previous) parcel; `commit` takes the suggestions and saves the draft first, as Enter. */
  const next = async (step = 1, commit = true) => {
    if (saving) return
    const r = currentRow()
    const f = formRef.current
    let snapshot = dataRef.current
    if (commit && r && f && !r.duplicate && !r.noTracking) {
      if (f.error) return
      const applied = applySuggestions(f, r)
      setForm(applied)
      const result = await saveDraft(applied, r)
      if (!result.ok) return
      if (result.data) snapshot = result.data
    }
    if (!snapshot) return
    openRow(nextInFilter(rowsOfDay(snapshot.followUp.rows, dayRef.current), formRef.current?.id, step, filterRef.current))
    setFocusTick(n => n + 1)
  }

  const openTracking = async () => {
    const r = currentRow()
    if (!r || !r.tracking) return
    try {
      await bridge.openTracking({ courier: r.courier as FinlandCourier, tracking: r.tracking })
    } catch (error) {
      showError(error)
    }
  }

  /** `date` null: every day with changes. */
  const saveToSheet = async (date: string | null) => {
    if (working) return
    setConfirm(false)
    setNotice(null)
    try {
      const result = await exclusive('followup', () => bridge.saveFollowUp({ date }))
      if (!result) return
      takeData(result)
      const { tone, lines } = savedLines(result.followUpResult)
      setNotice({ tone, lines: [...lines, ...sheetNotes(result)] })
      openRow(currentRow(result))
    } catch (error) {
      showError(error)
    } finally {
      onConfirmAll(false)
    }
  }

  /** "Hent status fra nShift" for the day, or "Opdater status" for one parcel. Reads neither SAP nor the sheet. */
  const fetchStatus = async (request: { date: string } | { key: string }) => {
    if (working) return
    setNotice(null)
    setSuggestOpen(false)
    setFetching('key' in request ? request.key : 'day')
    try {
      const result = await exclusive('nshift', () => bridge.fetchStatus(request))
      if (!result) return
      setNshiftNotSet(false)
      takeData(result)
      const s = result.statusResult
      setNotice({ tone: s.notFound || s.failed ? 'info' : 'success', lines: [statusLines(s)] })
    } catch (error) {
      if (errorCode(error) === 'FINLAND_NSHIFT_NOT_SET') setNshiftNotSet(true)
      else showError(error)
    } finally {
      setFetching(null)
    }
  }

  /** "Ja, brug forslagene": the day's suggestions become the person's drafts; the sheet is not written. */
  const applyDaySuggestions = async () => {
    const date = dayRef.current
    if (working || !date) return
    setNotice(null)
    try {
      // The open parcel's last change must be a draft first, and the fields it touched are left alone even when they
      // are back to what the sheet has (no draft then), as suggestionList shows.
      await draftQueue.current
      const f = formRef.current
      const r = currentRow()
      const keep = f && r?.key && f.id === r.key ? { [r.key]: f.touched } : undefined
      const result = await exclusive('suggest', () => bridge.applySuggestions({ date, keep }))
      if (!result) return
      takeData(result)
      setSuggestOpen(false)
      setNotice({
        tone: 'success',
        lines: [result.applied
          ? t(`Forslagene er brugt på ${kolli(result.applied)}. De er ikke gemt i arket endnu.`, `The suggestions were used on ${kolli(result.applied)}. They are not saved in the sheet yet.`)
          : t('Der var ingen forslag at bruge.', 'There were no suggestions to use.')],
      })
      openRow(currentRow(result))
    } catch (error) {
      showError(error)
    }
  }

  const resolve = async (field: FinlandFollowUpField, choice: 'sheet' | 'mine') => {
    const r = currentRow()
    if (!r) return
    try {
      const fresh = await bridge.resolveConflict({ key: r.key, field, choice })
      takeData(fresh)
      openRow(currentRow(fresh))
    } catch (error) {
      showError(error)
    }
  }

  const selectDay = (date: string) => {
    setDay(date)
    setMonth(null)
    setSuggestOpen(false)
    openRow(firstInFilter(rowsOfDay(dataRef.current?.followUp.rows ?? [], date), filterRef.current))
    setNotice(null)
  }

  /** A filter the open parcel is not in opens the filter's first parcel, so the form shows what the list shows. */
  const chooseFilter = (next: FollowUpFilter) => {
    filterRef.current = next
    finlandPlace.followFilter = next
    setFilterState(next)
    const list = rowsOfDay(dataRef.current?.followUp.rows ?? [], dayRef.current)
    const r = currentRow()
    if (!r || !inFilter(r, next)) openRow(firstInFilter(list, next))
  }

  const onKey = (event: KeyboardEvent) => {
    if (!active || !formRef.current || saving) return
    const target = event.target as HTMLElement
    if (!(target === document.body || rootRef.current?.contains(target))) return
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
    if (event.key === 'Enter') {
      // Enter always means "next" inside the form, also on a pressed choice button, which would otherwise toggle off.
      // A text field has already handed over its value in its own Enter handler, which runs first.
      if (target.tagName === 'BUTTON' && !detailRef.current?.contains(target)) return
      event.preventDefault()
      window.setTimeout(() => void next(1), 0)
      return
    }
    if (typing || event.ctrlKey || event.altKey || event.metaKey) return
    const r = currentRow()
    if (!r || r.duplicate || r.noTracking) return
    const fixedTerminal = r.courier === 'DHL' || r.courier === 'DSV'
    const k = event.key.toLowerCase()
    if (k === '1' && !fixedTerminal) change('terminal', 'Turku')
    else if (k === '2' && !fixedTerminal) change('terminal', 'Vantaa')
    else if (k === 'o') change('sla', 'OK')
    else if (k === 'n') change('sla', 'NOK')
    else if (k === 't') void openTracking()
    else if (event.key === 'ArrowDown') { event.preventDefault(); void next(1, false) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); void next(-1, false) }
  }

  useEffect(() => { keyHandler.current = onKey })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  if (!data?.sheet) {
    const reading = working === 'load' || working === 'sheet'
    return (
      <div ref={rootRef} className="space-y-3 rounded-xl border border-dashed px-6 py-10 text-center">
        <h2 className="text-xl font-semibold">{reading ? t('Læser arket', 'Reading the sheet') : t('Arket er ikke læst endnu', 'The sheet has not been read yet')}</h2>
        <p className="mx-auto max-w-prose text-sm text-muted-foreground">
          {reading
            ? t('Det tager et øjeblik.', 'It takes a moment.')
            : t('Programmet læser først arket, når du trykker. Opfølgningen kræver ikke SAP.', 'The program reads the sheet only when you press. Follow-up does not need SAP.')}
        </p>
        {!reading && <Button disabled={working !== null} onClick={onLoadSheet}>{t('Læs arket', 'Read the sheet')}</Button>}
        {notice && <NoticeBox notice={notice} />}
      </div>
    )
  }

  const view = data.followUp
  const rows = rowsOfDay(view.rows, day)
  const counts = filterCounts(rows)
  // The open parcel stays in the list after it has left the filter, until the person moves on.
  const shown = rows.filter(r => inFilter(r, filter) || (!!form && rowId(r) === form.id))
  const info = view.days.find(d => d.date === day)
  const pendingOfDay = rows.filter(r => r.pending)
  const row = currentRow(data)
  const lastWrite = day ? data.dayLog[day] : undefined
  const others = day ? othersOnDay(view.othersByDay[day]) : []
  const suggestions = day ? suggestionList(view.rows, day, form) : []
  const fetchedAt = newestFetch(rows)
  const busy = working !== null

  return (
    <div ref={rootRef} className="grid gap-6 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(320px,380px)]">
      <FollowUpCalendar view={view} today={data.today} selected={day} month={month} onSelect={selectDay} onMonth={setMonth} />

      <section aria-label={t('Dagens kolli', "The day's parcels")} className="min-w-0 space-y-4">
        {notice && <NoticeBox notice={notice} />}
        {confirmAll && (
          <div ref={allRef}>
            <SaveAllConfirm
              rows={view.rows.filter(r => r.pending)}
              total={view.pendingTotal}
              saving={saving}
              busy={working !== null}
              writeBlocked={writeBlocked}
              onSave={() => saveToSheet(null)}
              onClose={() => onConfirmAll(false)}
            />
          </div>
        )}
        {!day ? (
          <div className="space-y-2 rounded-xl border border-dashed px-6 py-10 text-center">
            <h2 className="text-xl font-semibold">{t('Vælg en dag', 'Choose a day')}</h2>
            <p className="text-sm text-muted-foreground">{t('Klik på en dag i kalenderen.', 'Click a day in the calendar.')}</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">{dayTitle(day)}</h2>
              <p className="text-sm text-muted-foreground">
                {info
                  ? t(`${kolli(info.total)}. ${info.done} fulgt op, ${info.total - info.done} mangler.`, `${kolli(info.total)}. ${info.done} followed up, ${info.total - info.done} missing.`)
                  : t('Ingen rækker i arket.', 'No rows in the sheet.')}
              </p>
              {lastWrite && (
                <p className="text-xs text-muted-foreground">
                  {t(`Sidst skrevet af ${lastWrite.byName} ${writtenAt(lastWrite.at)}`, `Last written by ${lastWrite.byName} ${writtenAt(lastWrite.at)}`)}
                </p>
              )}
            </div>
            {others.length > 0 && (
              <div role="status" className="space-y-0.5 rounded-lg border border-attention/40 bg-attention-surface px-3 py-2 text-sm">
                {others.map(line => <p key={line} className="flex items-center gap-2"><Users aria-hidden="true" className="size-4 shrink-0" />{line}</p>)}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button size="sm" variant="outline" disabled={busy} loading={fetching === 'day'} onClick={() => fetchStatus({ date: day })}>
                  {fetching === 'day' ? t('Henter status ...', 'Fetching status ...') : t('Hent status fra nShift', 'Fetch status from nShift')}
                </Button>
                {suggestions.length > 0 && !suggestOpen && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setSuggestOpen(true)}>
                    {t('Brug forslagene for alle leverede kolli på dagen', 'Use the suggestions for every delivered parcel on the day')}
                  </Button>
                )}
                {nshiftNotSet
                  ? <span className="text-xs text-attention">{t('nShift er ikke sat op endnu.', 'nShift is not set up yet.')}</span>
                  : fetchedAt && <span className="text-xs text-muted-foreground">{fetchedText(fetchedAt)}</span>}
              </div>
              {suggestOpen && (
                <SuggestConfirm
                  day={day}
                  list={suggestions}
                  applying={working === 'suggest'}
                  busy={busy}
                  onApply={applyDaySuggestions}
                  onCancel={() => setSuggestOpen(false)}
                />
              )}
            </div>

            <StatusFilter counts={counts} value={filter} onChange={chooseFilter} />

            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <Legend mark={<b className="text-[11px] text-primary">●</b>}>{t('Ændret i appen, ikke gemt i arket', 'Changed in the app, not saved in the sheet')}</Legend>
              <Legend mark={<Users aria-hidden="true" className="size-3.5" />}>{t('En kollega har en ændring, der ikke er gemt', 'A colleague has a change that is not saved')}</Legend>
              <Legend mark={<b>?</b>}>{t('Ikke udfyldt', 'Not filled in')}</Legend>
              <Legend mark={<b>24-11</b>}>{t('Grå: forslag, bliver gemt når du går videre', 'Grey: suggestion, saved when you move on')}</Legend>
            </ul>

            <div role="listbox" aria-label={t('Kolli', 'Parcels')} className="space-y-1">
              <div aria-hidden="true" className={cn(ROW_GRID, 'px-3 pb-0.5 text-[11.5px] font-semibold text-muted-foreground')}>
                <span /><span>Delivery</span><span>T&T</span><span>Courier</span><span>Expected</span><span>Received</span><span>Terminal</span><span />
              </div>
              {shown.length === 0 && (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  {filter === 'late'
                    ? t('Ingen kolli er for sent denne dag.', 'No parcels are late on this day.')
                    : filter === 'missing'
                      ? t('Alle kolli på dagen er fulgt op.', 'Every parcel on the day is followed up.')
                      : t('Ingen kolli her denne dag.', 'No parcels here on this day.')}
                </p>
              )}
              {shown.map(r => {
                const isCurrent = !!form && rowId(r) === form.id
                return (
                  <button
                    key={rowId(r)}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={() => { openRow(r); setFocusTick(n => n + 1) }}
                    className={cn(
                      ROW_GRID,
                      'w-full rounded-md border bg-card px-3 py-1.5 text-left text-sm transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      isCurrent && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <StatusDot r={r} />
                    <span className="truncate font-mono text-xs">{r.delivery}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground" title={r.tracking}>{r.tracking ? r.tracking.slice(-8) : t('intet T&T', 'no T&T')}</span>
                    <span><CourierTag courier={r.courier} /></span>
                    {r.effective.expected
                      ? <span>{short(r.effective.expected)}</span>
                      : <span className="text-muted-foreground" title={r.suggestedExpected ? t('Forslag, ikke gemt endnu', 'Suggestion, not saved yet') : t('Ikke udfyldt', 'Not filled in')}>{r.suggestedExpected ? short(r.suggestedExpected) : '?'}</span>}
                    <ListValue value={r.effective.received} suggestion={r.duplicate ? null : r.nshift?.suggestion.received} />
                    <ListValue value={r.effective.terminal} suggestion={r.duplicate ? null : r.nshift?.suggestion.terminal} text />
                    <span className="flex items-center gap-1">
                      {r.pending && <b className="text-[11px] text-primary" title={t('Ikke gemt i arket', 'Not saved in the sheet')}>●</b>}
                      {r.othersPending.length > 0 && <span title={othersOnParcel(r.othersPending) ?? ''}><Users aria-hidden="true" className="size-3.5 text-muted-foreground" /></span>}
                    </span>
                  </button>
                )
              })}
            </div>

            <SyncBar
              day={day}
              pending={pendingOfDay}
              total={view.pendingTotal}
              confirm={confirm}
              saving={saving}
              busy={working !== null}
              writeBlocked={writeBlocked}
              onAsk={() => setConfirm(true)}
              onCancel={() => setConfirm(false)}
              onSave={() => saveToSheet(day)}
              onAll={() => { setConfirm(false); onConfirmAll(true) }}
            />
          </>
        )}
      </section>

      <section ref={detailRef} aria-label={t('Kolli', 'Parcel')} className="self-start rounded-xl border bg-card p-5 lg:col-span-2 xl:sticky xl:top-4 xl:col-span-1">
        <FollowUpDetail
          row={row}
          form={form}
          hasDay={!!day}
          comments={view.comments}
          onChange={change}
          onDateError={setDateError}
          onResolve={resolve}
          onTracking={openTracking}
          onPrevious={() => next(-1, false)}
          onNext={() => next(1)}
          onUpdateStatus={row && row.key ? () => fetchStatus({ key: row.key }) : undefined}
          busy={busy}
          updating={!!row && fetching === row.key}
        />
      </section>
    </div>
  )
}

function Legend({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return <li className="inline-flex items-center gap-1.5">{mark}{children}</li>
}
