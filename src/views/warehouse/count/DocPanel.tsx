import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowsClockwise, Copy, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { fetchSteps, formatDateTime, formatNumber } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { CountDoc, CountDocRow, FetchStep, PiDoc, PiDocList } from '@/types/warehouse'
import type { PanelProps } from './CountView'
import { CopySerialsButton } from './OverviewPanel'
import { PiDocsSection } from './PiDocsSection'
import { t } from '@/lib/warehouse/text'

const rowKey = (row: { material: string; sloc: string; stockType: string }) => `${row.material}|${row.sloc}|${row.stockType}`
// Same limit as MI31's "Maximum No. of Items" (electron/core/piDocs.cjs MAX_LINES).
const MAX_LINES = 20

export function DocPanel({ id, open, state }: PanelProps) {
  const [doc, setDoc] = useState<CountDoc | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [step, setStep] = useState<FetchStep | null>(null)
  const [query, setQuery] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [piList, setPiList] = useState<PiDocList | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const approvalsKey = JSON.stringify(state.approvals)

  const load = useCallback(async () => {
    try {
      setDoc(await window.electronWarehouse!.counts.doc(id))
      setFailed(null)
    } catch (error) {
      setFailed(errorMessage(error))
    }
    try {
      setPiList(await window.electronWarehouse!.piDocs.list(id))
    } catch {
      setPiList(null)
    }
  }, [id])

  useEffect(() => { void load() }, [load, approvalsKey])

  const fetchToday = async () => {
    setStep('check')
    const unsubscribe = window.electronWarehouse!.sap.onFetchProgress(progress => setStep(progress.step))
    try {
      setDoc(await window.electronWarehouse!.counts.fetchDoc(id))
      toast.success(t('Dagens SAP-tal er hentet', "Today's SAP figures are fetched"))
    } catch (error) {
      toast.error(errorMessage(error, t('Hentningen fra SAP fejlede.', 'Fetching from SAP failed.')))
    } finally {
      unsubscribe()
      setStep(null)
    }
  }

  const needle = query.trim().toUpperCase()
  const rows = useMemo(() => (doc?.rows || []).filter(row =>
    (!needle || row.material.includes(needle) || row.description.toUpperCase().includes(needle) || row.sloc === needle)
    && (!onlyDiff || (row.diff !== null && row.diff !== 0))), [doc, needle, onlyDiff])

  /** The SAP document of each line (a deleted one frees the line). */
  const docOf = useMemo(() => {
    const map = new Map<string, PiDoc>()
    for (const item of piList?.docs || []) if (item.status !== 'deleted') for (const line of item.lines) map.set(rowKey({ ...line, sloc: item.sloc, stockType: item.stockType }), item)
    return map
  }, [piList])
  const selectable = (row: CountDocRow) => Boolean(piList?.canCreate) && row.status === 'approved' && !docOf.has(rowKey(row))
  const chosenRows = (doc?.rows || []).filter(row => chosen.includes(rowKey(row)) && selectable(row))
  const selection = chosenRows.length ? { materials: chosenRows.map(row => row.material), sloc: chosenRows[0].sloc, stockType: chosenRows[0].stockType } : null

  /** New terminals (-0) one per document; used terminals (-0-R) and accessories together, same kind, location, stock type and serial handling. */
  const toggle = (row: CountDocRow) => {
    const key = rowKey(row)
    if (chosen.includes(key)) return setChosen(chosen.filter(item => item !== key))
    if (row.kind === 'new') return setChosen([key])
    const same = chosenRows.filter(item => item.kind === row.kind && item.sloc === row.sloc && item.stockType === row.stockType && item.serialManaged === row.serialManaged).map(rowKey)
    if (same.length >= MAX_LINES) return void toast.warning(t(`Højst ${MAX_LINES} materialer pr. optællingsdokument`, `At most ${MAX_LINES} materials per count document`), { description: t('Opret dokumentet, og vælg resten til et nyt.', 'Create the document and choose the rest for a new one.') })
    setChosen([...same, key])
  }

  /** Quantity per document line: posted = counted in SAP, otherwise "Antal til dokument" (or what was counted). */
  const qtyOf = (item: PiDoc, material: string) => {
    const posted = item.differences?.find(entry => entry.material === material)
    if (posted) return posted.counted
    const row = doc?.rows.find(entry => entry.material === material && entry.sloc === item.sloc && entry.stockType === item.stockType)
    if (!row) return null
    return row.docQty ?? (row.sapAtApproval !== null && row.diff !== null ? row.sapAtApproval + row.diff : null)
  }

  const createDoc = async () => {
    if (!selection) return
    setBusy('create')
    try {
      const result = await window.electronWarehouse!.piDocs.create({ id, ...selection })
      setPiList(result)
      setChosen([])
      toast.success(result.created.length === 1 ? t(`SAP-dokument ${result.created[0]} er oprettet`, `SAP document ${result.created[0]} is created`) : t(`SAP-dokumenter ${result.created.join(', ')} er oprettet`, `SAP documents ${result.created.join(', ')} are created`), { description: t('Print det nu (MI21).', 'Print it now (MI21).') })
      if (result.missing.length) toast.warning(t(`SAP tog ikke ${result.missing.join(', ')} med`, `SAP did not include ${result.missing.join(', ')}`), { description: t('Opret et nyt dokument for dem, eller tjek materialet i SAP.', 'Create a new document for them, or check the material in SAP.') })
    } catch (error) {
      toast.error(errorMessage(error))
      await load()
    } finally {
      setBusy(null)
    }
  }

  const deleteDoc = async (item: PiDoc) => {
    if (!window.confirm(t(`Slet SAP-dokument ${item.docNo}?\n\nMI02 åbnes, og du trykker selv på skraldespanden. Materialerne kan derefter få et nyt dokument.`, `Delete SAP document ${item.docNo}?\n\nMI02 opens, and you press the bin yourself. The materials can then get a new document.`))) return
    setBusy(`delete:${item.id}`)
    try {
      setPiList(await window.electronWarehouse!.piDocs.remove({ id, docId: item.id }))
      toast.success(t(`SAP-dokument ${item.docNo} er slettet`, `SAP document ${item.docNo} is deleted`))
    } catch (error) {
      toast.error(errorMessage(error), { duration: 20000 })
    } finally {
      setBusy(null)
    }
  }

  const postDocs = async (items: PiDoc[]) => {
    setBusy('post')
    try {
      const result = await window.electronWarehouse!.piDocs.post({ id, docIds: items.map(item => item.id) })
      setPiList(result)
      if (result.posted.length) toast.success(result.posted.length === 1 ? t(`SAP-dokument ${result.posted[0]} er bogført`, `SAP document ${result.posted[0]} is posted`) : t(`${result.posted.length} SAP-dokumenter er bogført`, `${result.posted.length} SAP documents are posted`), { description: t('Materialerne er markeret "Bogført i SAP".', 'The materials are marked "Posted in SAP".') })
      if (result.open.length) toast.warning(t(`Ikke bogført: ${result.open.join(', ')}`, `Not posted: ${result.open.join(', ')}`), { description: t('SAP viser dem stadig som aktive. Bogfør dem igen.', 'SAP still shows them as active. Post them again.'), duration: 20000 })
    } catch (error) {
      toast.error(errorMessage(error), { duration: 20000 })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const countDoc = async (item: PiDoc) => {
    setBusy(item.id)
    try {
      setPiList(await window.electronWarehouse!.piDocs.count({ id, docId: item.id }))
      toast.success(t(`Antal er lagt på SAP-dokument ${item.docNo}`, `Quantity entered on SAP document ${item.docNo}`), { description: t('Klar til bogføring (manager).', 'Ready for posting (manager).') })
    } catch (error) {
      const refetch = errorCode(error) === 'PIDOC_DOC_STALE' && doc?.canFetch ? { action: { label: t('Hent dagens SAP-tal', "Fetch today's SAP figures"), onClick: () => void fetchToday() } } : {}
      toast.error(errorMessage(error), { duration: 20000, ...refetch })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const printDoc = async (item: PiDoc) => {
    setBusy(item.id)
    try {
      setPiList(await window.electronWarehouse!.piDocs.print({ id, docId: item.id }))
      toast.success(t(`SAP-dokument ${item.docNo} er sendt til print`, `SAP document ${item.docNo} is sent to print`))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  if (failed && !doc) return <p role="alert" className="text-sm text-destructive">{failed}</p>
  if (!doc) return <p className="text-sm text-muted-foreground">{t('Henter …', 'Fetching …')}</p>
  const needsSerials = doc.rows.filter(row => row.needsSerials).length
  const mismatches = doc.rows.filter(serialMismatch).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Til optællingsdokument', 'To count document')}</CardTitle>
        <CardDescription>
          {t('Hent dagens SAP-tal den dag, optællingsdokumentet laves. Antal til dokument = SAP i dag + den godkendte difference. Materialer med serienumre får SAP\'s serienumre i dag minus dem, der manglede ved godkendelsen. Managers opretter og printer SAP-dokumentet herfra; du trykker selv F8 og Print i SAP.', "Fetch today's SAP figures on the day the count document is made. Quantity for document = SAP today + the approved difference. Materials with serial numbers get SAP's serial numbers today minus the ones missing at approval. Managers create and print the SAP document from here; you press F8 and Print in SAP yourself.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {doc.canFetch && (
            <SapActionButton variant="outline" onAction={fetchToday} disabled={step !== null}>
              <ArrowsClockwise size={18} /> {t('Hent dagens SAP-tal', "Fetch today's SAP figures")}
            </SapActionButton>
          )}
          <span className="text-sm text-muted-foreground">
            {step ? `${fetchSteps().find(item => item.step === step)?.label || t('Henter', 'Fetching')} …`
              : doc.fetchedAt ? t(`SAP-tal hentet ${formatDateTime(doc.fetchedAt)}${doc.fetchedBy ? ` af ${doc.fetchedBy.name}` : ''}`, `SAP figures fetched ${formatDateTime(doc.fetchedAt)}${doc.fetchedBy ? ` by ${doc.fetchedBy.name}` : ''}`)
              : t('Dagens SAP-tal er ikke hentet endnu.', "Today's SAP figures are not fetched yet.")}
          </span>
        </div>
        {doc.fetchedAt !== null && !step && new Date(doc.fetchedAt).toDateString() !== new Date().toDateString() && (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Warning size={16} /> {t(`SAP-tallene er fra ${formatDateTime(doc.fetchedAt)}, ikke i dag. Hent dagens SAP-tal, før dokumentet laves eller antallet lægges på.`, `The SAP figures are from ${formatDateTime(doc.fetchedAt)}, not today. Fetch today's SAP figures before the document is made or the quantity is entered.`)}
          </p>
        )}
        {needsSerials > 0 && (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Warning size={16} /> {t(`SAP-tallene blev hentet uden serienumre. Hent dagens SAP-tal igen for at få serienummerlisten til ${formatNumber(needsSerials)} ${needsSerials === 1 ? 'linje' : 'linjer'}.`, `The SAP figures were fetched without serial numbers. Fetch today's SAP figures again to get the serial list for ${formatNumber(needsSerials)} ${needsSerials === 1 ? 'line' : 'lines'}.`)}
          </p>
        )}
        {mismatches > 0 && (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Warning size={16} /> {t(`${formatNumber(mismatches)} ${mismatches === 1 ? 'linje' : 'linjer'} med serienumre giver et andet antal end SAP i dag + difference. Serienumrene bestemmer – tjek materialet, før dokumentet laves.`, `${formatNumber(mismatches)} ${mismatches === 1 ? 'line' : 'lines'} with serial numbers give another quantity than SAP today + difference. The serial numbers decide – check the material before the document is made.`)}
          </p>
        )}
        {doc.missingApproval > 0 && (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Warning size={16} /> {formatNumber(doc.missingApproval)} {doc.missingApproval === 1 ? t('materiale mangler godkendelse og får intet antal.', 'material needs approval and gets no quantity.') : t('materialer mangler godkendelse og får intet antal.', 'materials need approval and get no quantity.')}
          </p>
        )}
        {piList && <PiDocsSection list={piList} selected={selection} busy={busy} figuresAt={doc.fetchedAt} onCreate={() => void createDoc()} onPrint={item => void printDoc(item)} onCount={item => void countDoc(item)} onPost={items => void postDocs(items)} onDelete={item => void deleteDoc(item)} qtyOf={qtyOf} />}
        <div className="flex flex-wrap items-center gap-4">
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Søg materiale, tekst eller sloc', 'Search material, text or sloc')} className="max-w-xs" />
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyDiff} onCheckedChange={value => setOnlyDiff(value === true)} /> {t('Kun med difference', 'Only with a difference')}</label>
        </div>
        <div className="max-h-[600px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {piList?.canCreate && <th className="w-8 px-3 py-2"><span className="sr-only">{t('Vælg', 'Choose')}</span></th>}
                <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                <th className="px-3 py-2">Sloc</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">{t('SAP-dokument', 'SAP document')}</th>
                <th className="px-3 py-2 text-right">{t('SAP ved godkendelse', 'SAP at approval')}</th>
                <th className="px-3 py-2 text-right">{t('Godkendt diff.', 'Approved diff.')}</th>
                <th className="px-3 py-2 text-right">{t('SAP i dag', 'SAP today')}</th>
                <th className="px-3 py-2 text-right">{t('Antal til dokument', 'Quantity for document')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 600).map(row => (
                <tr key={`${row.material}|${row.sloc}|${row.stockType}`} className="border-t">
                  {piList?.canCreate && (
                    <td className="px-3 py-1.5">
                      {selectable(row) && <Checkbox aria-label={t(`Vælg ${row.material} ${row.sloc}${row.stockType === 'blocked' ? ' blocked' : ''}`, `Choose ${row.material} ${row.sloc}${row.stockType === 'blocked' ? ' blocked' : ''}`)} checked={chosen.includes(rowKey(row))} disabled={busy !== null} onCheckedChange={() => toggle(row)} />}
                    </td>
                  )}
                  <td className="px-3 py-1.5"><div className="font-mono">{row.material}</div><div className="max-w-72 truncate text-xs text-muted-foreground">{row.description}</div></td>
                  <td className="px-3 py-1.5 font-mono">{row.sloc}</td>
                  <td className="px-3 py-1.5">{row.stockType === 'blocked' && <Badge className="bg-orange-500 text-white">Blocked</Badge>}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{docOf.get(rowKey(row))?.docNo || ''}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{row.sapAtApproval === null ? '–' : formatNumber(row.sapAtApproval)}</td>
                  <td className={cn('px-3 py-1.5 text-right font-semibold tabular-nums', (row.diff || 0) < 0 && 'text-red-600 dark:text-red-400', (row.diff || 0) > 0 && 'text-amber-600 dark:text-amber-400')}>{row.diff === null ? '–' : formatNumber(row.diff)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.sapToday === null ? '–' : formatNumber(row.sapToday)}
                    {row.sapToday !== null && row.sapAtApproval !== null && row.sapToday !== row.sapAtApproval && (
                      <div className="text-xs text-muted-foreground">{row.sapToday > row.sapAtApproval ? '+' : ''}{formatNumber(row.sapToday - row.sapAtApproval)} {t('siden godkendelse', 'since approval')}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <DocQty row={row} fetched={doc.fetchedAt !== null} />
                  </td>
                  <td className="space-x-1 px-3 py-1.5 text-right whitespace-nowrap">
                    {row.docQty !== null && <CopyQtyButton row={row} />}
                    {row.approved && row.serialManaged && row.docQty !== null && row.docQty > 0 && <CopySerialsButton id={id} row={row} long={Boolean(open.serialRules?.[row.material]?.[row.stockType])} forDoc />}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">{t('Ingen linjer matcher.', 'No lines match.')}</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > 600 && <p className="text-xs text-muted-foreground">{t(`Viser 600 af ${formatNumber(rows.length)}.`, `Showing 600 of ${formatNumber(rows.length)}.`)}</p>}
      </CardContent>
    </Card>
  )
}

/** A serial list of the day that gives another quantity than "SAP today + difference": something changed in SAP since approval. */
const serialMismatch = (row: CountDocRow) => row.serialManaged && row.docQty !== null && row.expectedQty !== null && row.docQty !== row.expectedQty

function DocQty({ row, fetched }: { row: CountDocRow; fetched: boolean }) {
  if (!row.approved) return <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">{t('Mangler godkendelse', 'Needs approval')}</Badge>
  if (row.needsSerials) return <span className="text-xs text-amber-700 dark:text-amber-300">{t('Hent igen (serienumre)', 'Fetch again (serial numbers)')}</span>
  if (!fetched || row.docQty === null) return <span className="text-xs text-muted-foreground">{t('Hent dagens SAP-tal', "Fetch today's SAP figures")}</span>
  if (row.docQty < 0) {
    return <span className="font-semibold tabular-nums text-red-600 dark:text-red-400" title={t('SAP har i dag færre end differencen – tjek materialet, før dokumentet laves', 'SAP has fewer today than the difference – check the material before the document is made')}>{formatNumber(row.docQty)}</span>
  }
  if (serialMismatch(row)) {
    const title = t(
      `Serienumrene giver ${formatNumber(row.docQty)}, men SAP i dag + difference giver ${formatNumber(row.expectedQty!)}. Et serienummer, der manglede ved godkendelsen, er nok bogført ud eller flyttet i SAP siden. Serienumrene bestemmer – tjek materialet.`,
      `The serial numbers give ${formatNumber(row.docQty)}, but SAP today + difference gives ${formatNumber(row.expectedQty!)}. A serial number missing at approval has probably been booked out or moved in SAP since. The serial numbers decide – check the material.`,
    )
    return (
      <span className="inline-flex items-center gap-1 text-base font-semibold tabular-nums text-amber-700 dark:text-amber-300" title={title} aria-label={title}>
        <Warning size={14} /> {formatNumber(row.docQty)}
        <span className="text-xs font-normal">({t(`ventet ${formatNumber(row.expectedQty!)}`, `expected ${formatNumber(row.expectedQty!)}`)})</span>
      </span>
    )
  }
  return <span className="text-base font-semibold tabular-nums">{formatNumber(row.docQty)}</span>
}

function CopyQtyButton({ row }: { row: CountDocRow }) {
  const label = t(`Kopiér antal for ${row.material} ${row.sloc}${row.stockType === 'blocked' ? ' blocked' : ''}`, `Copy quantity for ${row.material} ${row.sloc}${row.stockType === 'blocked' ? ' blocked' : ''}`)
  const copy = async () => {
    try {
      await window.electronWarehouse!.app.copyText(String(row.docQty))
      toast.success(t(`${formatNumber(row.docQty!)} kopieret`, `${formatNumber(row.docQty!)} copied`), { description: `${row.material} · ${row.sloc}${row.stockType === 'blocked' ? ' · Blocked' : ''}` })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  return <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-label={label} title={label} onClick={() => copy()}><Copy size={14} /> {t('Antal', 'Quantity')}</Button>
}
