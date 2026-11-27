import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { useSapStatus } from '@/components/warehouse/SapStatusContext'
import { Tabs } from '@/components/warehouse/ui'
import { errorMessage } from '@/lib/warehouse/errors'
import { dayTitle, isoOf, shortDay } from '@/lib/warehouse/finlandDates'
import { kolli } from '@/lib/warehouse/finlandText'
import { describeSapState } from '@/lib/warehouse/sapStatus'
import { t } from '@/lib/warehouse/text'
import type { FinlandManualInput, FinlandNotSentRow, FinlandParcelRow, FinlandReviewRow, FinlandSnapshot } from '@/types/finland'
import { Calendar } from './Calendar'
import { NoticeBox, sheetNotes, type Notice, type Working } from './common'
import { FollowUp } from './FollowUp'
import { ManualRow } from './ManualRow'
import { finlandPlace } from './place'
import { WriteDay } from './WriteDay'

type Tab = 'write' | 'follow'

/** How often the window asks how many of the person's changes are not in the sheet, before the sheet is read. */
const PENDING_POLL_MS = 10_000

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const pad = (n: number) => String(n).padStart(2, '0')

/** The order types in the sheet, most used first. */
function orderTypesOf(snapshot: FinlandSnapshot | null): string[] {
  const counts = new Map<string, number>()
  for (const row of snapshot?.followUp.rows ?? []) {
    const type = String(row.orderType || '').trim()
    if (/^Z[A-Z]{1,4}$/.test(type)) counts.set(type, (counts.get(type) || 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([type]) => type)
}

/** "Anna Holm skriver 19. november i arket lige nu", by the action the main process holds the lock for. */
export function lockText(lock: Pick<NonNullable<FinlandSnapshot['lock']>, 'byName' | 'day' | 'action'>): string {
  const name = lock.byName
  // The main process's action strings (service.cjs) start with their verb: skriver, retter, gemmer opfølgning, sletter række.
  const verb = lock.action.split(' ')[0]
  if (verb === 'sletter') return t(`${name} sletter en række i arket lige nu.`, `${name} is deleting a row in the sheet right now.`)
  if (verb === 'gemmer') return t(`${name} gemmer opfølgning i arket lige nu.`, `${name} is saving follow-up in the sheet right now.`)
  const day = ISO_DAY.test(lock.day) ? shortDay(lock.day) : ''
  if (verb === 'retter') {
    return day
      ? t(`${name} retter ${day} i arket lige nu.`, `${name} is correcting ${day} in the sheet right now.`)
      : t(`${name} retter i arket lige nu.`, `${name} is correcting the sheet right now.`)
  }
  return day
    ? t(`${name} skriver ${day} i arket lige nu.`, `${name} is writing ${day} in the sheet right now.`)
    : t(`${name} skriver i arket lige nu.`, `${name} is writing in the sheet right now.`)
}

/** The orange "N kolli er ikke gemt i arket" and the "Lokal kopi" badge, shown in the tool's title bar next to the SAP light. */
export function FinlandMarks({ pending, localCopy = false, onOpenPending }: { pending: number; localCopy?: boolean; onOpenPending?: () => void }) {
  return (
    <>
      {pending > 0 && (
        <button
          type="button"
          onClick={onOpenPending}
          title={t('Vis ændringerne, og gem dem i arket', 'Show the changes, and save them in the sheet')}
          className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-amber-950 shadow-[0_0_0_3px_rgba(245,158,11,0.28)] transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {t(`${kolli(pending)} er ikke gemt i arket`, `${kolli(pending)} not saved in the sheet`)}
        </button>
      )}
      {localCopy && (
        <span
          className="rounded-full border-2 border-amber-500 bg-amber-500/15 px-2.5 py-1 text-xs font-bold tracking-wide text-amber-700 dark:text-amber-300"
          title={t('Værktøjet skriver i en lokal kopi på denne pc, valgt da hubben blev startet. Det fælles ark røres ikke.', 'The tool writes in a local copy on this PC, chosen when the Hub was started. The shared sheet is not touched.')}
        >
          {t('Lokal kopi', 'Local copy')}
        </span>
      )}
    </>
  )
}

/**
 * Finlandsforsendelser (BPO and TCD): parcels from D301 to F300 written into the shared sheet day by day. Nothing is
 * fetched by itself: SAP and the sheet are read only when the person presses "Hent fra SAP" or "Læs arket". The lock
 * and the day log come with every answer from the main process, so they are as fresh as the person's last action.
 */
export function Finland({ headerSlot, onBusyChange }: { headerSlot: HTMLElement | null; onBusyChange?: (busy: boolean) => void }) {
  const bridge = window.electronWarehouse!.finland
  const { status: sap } = useSapStatus()
  const [tab, setTab] = useState<Tab>(finlandPlace.tab)
  const [data, setData] = useState<FinlandSnapshot | null>(null)
  const [localCopySetting, setLocalCopySetting] = useState(false)
  const [working, setWorkingState] = useState<Working>(null)
  const workingRef = useRef<Working>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [selected, setSelected] = useState<string | null>(finlandPlace.selected)
  const [month, setMonth] = useState<number | null>(finlandPlace.month)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [polledPending, setPolledPending] = useState(0)

  const setWorking = useCallback((next: Working) => {
    workingRef.current = next
    setWorkingState(next)
  }, [])

  useEffect(() => { onBusyChange?.(working !== null) }, [onBusyChange, working])
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  // Which sheet is used is a setting, not the sheet itself, so "Lokal kopi" shows from the start.
  useEffect(() => {
    bridge.settings().then(settings => setLocalCopySetting(!!settings.localCopy)).catch(() => {})
  }, [bridge])

  useEffect(() => { Object.assign(finlandPlace, { tab, selected, month }) }, [tab, selected, month])

  // What this Hub fetched earlier comes back at once; nothing is read from SAP or the sheet here.
  useEffect(() => {
    let stopped = false
    bridge.current().then(found => {
      if (stopped || !found) return
      setData(current => current ?? found)
      setSelected(current => (current && found.days.some(day => day.date === current) ? current : found.defaultDay))
    }).catch(() => {})
    return () => { stopped = true }
  }, [bridge])

  const lockedBy = data?.lock && !data.lock.mine ? data.lock : null
  const localCopy = data?.sheet ? !!data.sheet.localCopy : localCopySetting
  // Before anything is read, the count comes from the shared drafts alone, so the marker shows from the start.
  const pending = data ? data.followUp.pendingTotal : polledPending
  const sapDescription = describeSapState(sap, 'finland')
  const sapNotReady = sap !== null && !sap.ready

  useEffect(() => {
    if (data) return
    let stopped = false
    const poll = () => { bridge.pending().then(count => { if (!stopped) setPolledPending(count) }).catch(() => {}) }
    poll()
    const timer = window.setInterval(poll, PENDING_POLL_MS)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [bridge, data])

  /** Runs `call` as the tool's one action at a time; undefined when something else is running. Errors go to the caller. */
  const exclusive = async <R,>(kind: NonNullable<Working>, call: () => Promise<R>): Promise<R | undefined> => {
    if (workingRef.current) return undefined
    setWorking(kind)
    try {
      return await call()
    } finally {
      setWorking(null)
    }
  }

  /** Runs one action against the main process; `done` gives the lines to show when it went well. */
  const act = async <R extends FinlandSnapshot>(kind: NonNullable<Working>, call: () => Promise<R>, done: (result: R) => string[]) => {
    if (workingRef.current) return
    setWorking(kind)
    setNotice(null)
    try {
      const result = await call()
      setData(result)
      const lines = done(result)
      setNotice(lines.length ? { tone: kind === 'load' || kind === 'sheet' ? 'info' : 'success', lines } : null)
    } catch (error) {
      setNotice({ tone: 'error', lines: [errorMessage(error)] })
    } finally {
      setWorking(null)
    }
  }

  const load = () => act('load', () => bridge.load(), result => {
    setSelected(current => (current && result.days.some(day => day.date === current) ? current : result.defaultDay))
    setMonth(null)
    setConfirmDelete(null)
    return sheetNotes(result)
  })

  // The main process keeps what SAP gave earlier, so the answer is complete.
  const loadSheet = () => act('sheet', () => bridge.loadSheet(), sheetNotes)

  const writeDay = (date: string) => act('write', () => bridge.writeDay({ date }), result => {
    const r = result.result
    const lines: string[] = []
    if (r.added) lines.push(t(`${kolli(r.added)} skrevet i række ${r.firstRow} til ${r.lastRow}, og arket er gemt.`, `${kolli(r.added)} written on rows ${r.firstRow} to ${r.lastRow}, and the sheet is saved.`))
    if (r.skipped) lines.push(t(`${kolli(r.skipped)} stod der allerede og blev sprunget over.`, `${kolli(r.skipped)} were already there and were skipped.`))
    if (!r.added && !r.skipped) lines.push(t(`${shortDay(date)} stod allerede i arket. Intet er skrevet.`, `${shortDay(date)} was already in the sheet. Nothing was written.`))
    if (!r.weekFormulaOk) lines.push(t('Week nr blev ikke udregnet på alle nye rækker. Tjek kolonnen i arket.', 'Week nr was not calculated on all new rows. Check the column in the sheet.'))
    return [...lines, ...sheetNotes(result)]
  })

  const fixReview = (r: FinlandReviewRow) => act('fix', () => bridge.fixReview({ delivery: String(r.delivery), tracking: r.tracking }), result => {
    const f = result.fixed
    const lines: string[] = []
    if (f.kind === 'add') lines.push(f.row ? t(`Kolliet ${f.tracking} er sat ind i række ${f.row}, og arket er gemt.`, `Parcel ${f.tracking} was put in on row ${f.row}, and the sheet is saved.`) : t(`Kolliet ${f.tracking} stod der allerede.`, `Parcel ${f.tracking} was already there.`))
    if (f.kind === 'replace') lines.push(t(`T&T i række ${f.row} er rettet fra ${f.oldTracking} til ${f.tracking}, og arket er gemt.`, `The T&T on row ${f.row} was corrected from ${f.oldTracking} to ${f.tracking}, and the sheet is saved.`))
    if (f.kind === 'already') lines.push(t(`Kolliet ${f.tracking} står allerede i arket. Intet er ændret.`, `Parcel ${f.tracking} is already in the sheet. Nothing was changed.`))
    return [...lines, ...sheetNotes(result)]
  })

  const markNotSent = (r: FinlandParcelRow) => act('mark', () => bridge.markNotSent({ delivery: String(r.delivery), tracking: r.tracking }), result => {
    const marked = result.days.find(day => day.date === selected)?.notSent.find(x => x.tracking === r.tracking)
    const lines = [t(`Kolli ${r.tracking} er markeret som ikke sendt og bliver ikke skrevet i arket. "Sæt ind igen" fortryder.`, `Parcel ${r.tracking} is marked as not sent and will not be written in the sheet. "Put back" undoes it.`)]
    if (marked?.sheetRows.length) {
      const rows = marked.sheetRows.map(s => s.row).join(', ')
      lines.push(t(`Det står stadig i række ${rows}. Rækken kan slettes under "Ikke sendt".`, `It is still on row ${rows}. The row can be deleted under "Not sent".`))
    }
    return lines
  })

  const restoreNotSent = (r: FinlandNotSentRow) => act('restore', () => bridge.restoreNotSent({ key: r.key }), () => {
    setConfirmDelete(current => (current === r.key ? null : current))
    return [r.sheetRows.length
      ? t(`Kolli ${r.tracking} er sat ind igen og står i arket.`, `Parcel ${r.tracking} is put back and is in the sheet.`)
      : t(`Kolli ${r.tracking} er sat ind igen og står under "Mangler i arket".`, `Parcel ${r.tracking} is put back and is under "Missing in the sheet".`)]
  })

  const deleteRow = async (r: FinlandNotSentRow, row: number) => {
    await act('delete', () => bridge.deleteNotSentRow({ key: r.key, row }), result => {
      const d = result.deleted
      const lines = [d.kind === 'deleted'
        ? t(`Række ${d.row} med ${d.tracking} er slettet i arket, og arket er gemt.`, `Row ${d.row} with ${d.tracking} was deleted in the sheet, and the sheet is saved.`)
        : t(`Kolli ${d.tracking} stod ikke længere i arket. Intet er slettet.`, `Parcel ${d.tracking} was no longer in the sheet. Nothing was deleted.`)]
      return [...lines, ...sheetNotes(result)]
    })
    setConfirmDelete(null)
  }

  const checkManual = (values: FinlandManualInput) => bridge.checkManual(values)

  const writeManual = async (values: FinlandManualInput) => {
    if (workingRef.current) return { form: t('Vent, programmet arbejder stadig.', 'Wait, the program is still working.') }
    setWorking('manual')
    setNotice(null)
    try {
      const result = await bridge.addManualRow(values)
      setData(result)
      const r = result.manual
      if (!r.ok) return r.errors
      const lines = [r.skipped
        ? t(`Kolliet ${r.tracking} stod der allerede. Intet er skrevet.`, `Parcel ${r.tracking} was already there. Nothing was written.`)
        : r.row ? t(`Rækken med ${r.tracking} er skrevet i række ${r.row}, og arket er gemt.`, `The row with ${r.tracking} was written on row ${r.row}, and the sheet is saved.`)
          : t(`Rækken med ${r.tracking} er skrevet, og arket er gemt.`, `The row with ${r.tracking} was written, and the sheet is saved.`)]
      if (r.weekFormulaOk === false) lines.push(t('Week nr blev ikke udregnet på den nye række. Tjek kolonnen i arket.', 'Week nr was not calculated on the new row. Check the column in the sheet.'))
      setNotice({ tone: 'success', lines: [...lines, ...sheetNotes(result)] })
      setManualOpen(false)
      return null
    } catch (error) {
      return { form: errorMessage(error) }
    } finally {
      setWorking(null)
    }
  }

  const selectDay = (date: string) => {
    setSelected(date)
    setConfirmDelete(null)
    setNotice(current => (current && current.tone !== 'info' ? null : current))
  }

  const loadedAt = data?.loadedAt ? new Date(data.loadedAt) : null
  const day = data?.days.find(d => d.date === selected) ?? null

  const dayPane = () => {
    if (manualOpen) {
      return (
        <ManualRow
          orderTypes={orderTypesOf(data)}
          working={working}
          writeBlocked={!!lockedBy}
          check={checkManual}
          write={writeManual}
          onClose={() => setManualOpen(false)}
        />
      )
    }
    if (!data?.range) {
      if (working === 'load') {
        return (
          <EmptyState title={t('Henter dagens billede', "Fetching the day's picture")}>
            {t('ZMS_cons_info kører i sit eget SAP-vindue, og arket bliver læst. Det tager omkring et minut.', 'ZMS_cons_info runs in its own SAP window, and the sheet is read. It takes about a minute.')}
          </EmptyState>
        )
      }
      if (sapNotReady) {
        return (
          <EmptyState title={sapDescription.label} action={<Button variant="outline" disabled={working !== null} loading={working === 'sheet'} onClick={loadSheet}>{t('Læs arket', 'Read the sheet')}</Button>}>
            {t('Når SAP er logget på PS4 på engelsk, kan du trykke "Hent fra SAP". Uden SAP kan du læse arket og bruge Tilføj række i hånden.', 'When SAP is logged on to PS4 in English, you can press "Fetch from SAP". Without SAP you can read the sheet and use Add a row by hand.')}
          </EmptyState>
        )
      }
      return (
        <EmptyState title={t('Klar til at hente', 'Ready to fetch')} action={<Button disabled={working !== null} onClick={load}>{t('Hent fra SAP', 'Fetch from SAP')}</Button>}>
          {t('Programmet henter først, når du trykker. "Hent fra SAP" kører ZMS_cons_info og læser arket. Det tager omkring et minut.', 'The program fetches only when you press. "Fetch from SAP" runs ZMS_cons_info and reads the sheet. It takes about a minute.')}
        </EmptyState>
      )
    }
    if (!day) {
      return (
        <EmptyState title={selected ? dayTitle(selected) : t('Vælg en dag', 'Choose a day')}>
          {selected ? t('Der blev ikke sendt kolli fra D301 til F300 den dag.', 'No parcels were sent from D301 to F300 that day.') : t('Klik på en farvet dag i kalenderen.', 'Click a coloured day in the calendar.')}
        </EmptyState>
      )
    }
    return (
      <WriteDay
        day={day}
        lastWrite={data.dayLog[day.date]}
        working={working}
        writeBlocked={!!lockedBy}
        isAdmin={data.isAdmin}
        confirmDelete={confirmDelete}
        onWrite={() => writeDay(day.date)}
        onFix={fixReview}
        onMarkNotSent={markNotSent}
        onRestore={restoreNotSent}
        onAskDelete={setConfirmDelete}
        onDelete={deleteRow}
      />
    )
  }

  const lockLine = lockedBy && (
    <p role="status" className="rounded-lg border border-attention/40 bg-attention-surface px-4 py-3 text-sm">
      {lockText(lockedBy)} {t('Knapperne, der skriver i arket, venter. Tryk "Læs arket igen" om lidt.', 'The buttons that write in the sheet wait. Press "Read the sheet again" shortly.')}
    </p>
  )

  // The orange marker: to Opfølgning, read the sheet if it is not read yet (showing the changes needs it), then every
  // waiting change by day, as Finland T&T.
  const openPending = async () => {
    setTab('follow')
    if (!data?.sheet) await loadSheet()
    setConfirmAll(true)
  }

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6">
      {headerSlot && createPortal(<FinlandMarks pending={pending} localCopy={localCopy} onOpenPending={openPending} />, headerSlot)}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs<Tab> value={tab} onChange={setTab} items={[{ value: 'write', label: t('Skriv ind', 'Write in') }, { value: 'follow', label: t('Opfølgning', 'Follow-up') }]} className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          {loadedAt && <span className="text-xs text-muted-foreground">{t(`Hentet kl. ${pad(loadedAt.getHours())}.${pad(loadedAt.getMinutes())}`, `Fetched at ${pad(loadedAt.getHours())}:${pad(loadedAt.getMinutes())}`)}</span>}
          <Button variant="outline" disabled={working !== null} loading={working === 'sheet'} onClick={loadSheet} title={t('Læser kun arket, også uden SAP.', 'Reads only the sheet, also without SAP.')}>
            {working === 'sheet' ? t('Læser ...', 'Reading ...') : data?.sheet ? t('Læs arket igen', 'Read the sheet again') : t('Læs arket', 'Read the sheet')}
          </Button>
          <Button
            disabled={working !== null || sapNotReady}
            loading={working === 'load'}
            onClick={load}
            title={sapNotReady ? sapDescription.help : t('Henter fra SAP og læser arket.', 'Fetches from SAP and reads the sheet.')}
          >
            {working === 'load' ? t('Henter ...', 'Fetching ...') : data?.range ? t('Hent igen', 'Fetch again') : t('Hent fra SAP', 'Fetch from SAP')}
          </Button>
        </div>
      </div>

      {tab === 'follow' && (lockedBy || notice) && (
        <div className="space-y-4" aria-live="polite">
          {lockLine}
          {notice && <NoticeBox notice={notice} />}
        </div>
      )}
      <div hidden={tab !== 'follow'}>
        <FollowUp
          active={tab === 'follow'}
          data={data}
          working={working}
          writeBlocked={!!lockedBy}
          confirmAll={confirmAll}
          onConfirmAll={setConfirmAll}
          onData={setData}
          onLoadSheet={loadSheet}
          exclusive={exclusive}
        />
      </div>

      <div hidden={tab !== 'write'}>
        <div className="grid gap-8 lg:grid-cols-[minmax(280px,340px)_1fr]">
          <div className="space-y-4">
            <Calendar
              days={data?.days ?? []}
              range={data?.range ?? null}
              today={data?.today ?? isoOf(new Date())}
              selected={selected}
              month={month}
              loading={working === 'load'}
              onSelect={selectDay}
              onMonth={setMonth}
            />
            <Button variant="outline" className="w-full" disabled={manualOpen} onClick={() => { setNotice(null); setManualOpen(true) }}>
              {t('Tilføj række i hånden', 'Add a row by hand')}
            </Button>
          </div>
          <section className="min-w-0 space-y-4" aria-live="polite">
            {lockLine}
            {notice && <NoticeBox notice={notice} />}
            {dayPane()}
          </section>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed px-6 py-10 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mx-auto max-w-prose text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}
