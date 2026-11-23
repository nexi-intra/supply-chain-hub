import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowsClockwise, Copy, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { errorCode, errorMaterials, errorMessage } from '@/lib/warehouse/errors'
import { fetchSteps, formatDateTime, formatNumber } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { CountDoc, CountDocRow, FetchStep, PiDoc, PiDocList } from '@/types/warehouse'
import type { PanelProps } from './CountView'
import { FoundElsewhereNote } from './FoundElsewhere'
import { CopySerialsButton } from './OverviewPanel'
import { PiDocsSection } from './PiDocsSection'
import { t } from '@/lib/warehouse/text'

const rowKey = (row: { material: string; sloc: string; stockType: string }) => `${row.material}|${row.sloc}|${row.stockType}`
// Same limit as MI31's "Maximum No. of Items" (electron/core/piDocs.cjs MAX_LINES).
const MAX_LINES = 20

/** What the main process asks to confirm: SAP figures of the day missing approved materials, or a Zero Count on a document. */
// A count refused for a confirmation keeps the ones given before it, so confirming the next one does not undo them.
type CountConfirmed = { confirmZero?: string[]; confirmMissing?: string[] }
type Confirmation = { kind: 'missing'; materials: string[]; message: string } | { kind: 'zero' | 'count-missing'; materials: string[]; message: string; item: PiDoc; confirmed: CountConfirmed }
/** Documents refused with PIDOC_SERIAL_LINES that a manager may post anyway (corrected in SAP with MI05). */
type SerialConfirm = { items: PiDoc[]; flagged: PiDoc[] }
// The roles that may post (electron/warehouse/core/piDocs.cjs MANAGER_ROLES).
const MANAGER_ROLES = new Set(['manager', 'status-manager'])

export function DocPanel({ id, open, state }: PanelProps) {
  const [doc, setDoc] = useState<CountDoc | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [step, setStep] = useState<FetchStep | null>(null)
  const [query, setQuery] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [piList, setPiList] = useState<PiDocList | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [serialConfirm, setSerialConfirm] = useState<SerialConfirm | null>(null)
  const [resolving, setResolving] = useState<PiDoc | null>(null)
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

  const fetchToday = async (confirmMissing: string[] = []) => {
    setConfirmation(null)
    setStep('check')
    const unsubscribe = window.electronWarehouse!.sap.onFetchProgress(progress => setStep(progress.step))
    try {
      setDoc(await window.electronWarehouse!.counts.fetchDoc(id, { confirmMissing }))
      toast.success(t('Dagens SAP-tal er hentet', "Today's SAP figures are fetched"))
    } catch (error) {
      if (errorCode(error) === 'DOC_STOCK_MISSING') setConfirmation({ kind: 'missing', materials: errorMaterials(error), message: errorMessage(error) })
      else toast.error(errorMessage(error, t('Hentningen fra SAP fejlede.', 'Fetching from SAP failed.')))
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
  const selectable = (row: CountDocRow) => Boolean(piList?.canCreate) && row.status === 'approved' && !row.serialLinesAtApproval && !docOf.has(rowKey(row))
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
    // Approved with quantity lines: the frozen figures cannot be trusted, so no quantity is shown for the document.
    if (row.serialLinesAtApproval) return null
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

  const postDocs = async (items: PiDoc[], confirmSerialLines?: { docIds: string[]; reason: string }) => {
    setSerialConfirm(null)
    setBusy('post')
    try {
      const result = await window.electronWarehouse!.piDocs.post({ id, docIds: items.map(item => item.id), ...(confirmSerialLines ? { confirmSerialLines } : {}) })
      setPiList(result)
      const { marked } = result
      // Only the materials really marked are said to be marked (a locked status or a failed write must not hide it).
      const markedText = !marked.posted.length ? undefined
        : marked.skipped.length ? t(`${marked.posted.join(', ')} er markeret "Bogført i SAP".`, `${marked.posted.join(', ')} are marked "Posted in SAP".`)
        : t('Materialerne er markeret "Bogført i SAP".', 'The materials are marked "Posted in SAP".')
      if (result.posted.length) toast.success(result.posted.length === 1 ? t(`SAP-dokument ${result.posted[0]} er bogført`, `SAP document ${result.posted[0]} is posted`) : t(`${result.posted.length} SAP-dokumenter er bogført`, `${result.posted.length} SAP documents are posted`), { description: markedText })
      if (marked.skipped.length) toast.warning(t(`Ikke markeret "Bogført i SAP": ${marked.skipped.join(', ')}`, `Not marked "Posted in SAP": ${marked.skipped.join(', ')}`), { description: marked.failed ? t('SAP-dokumentet er bogført, men markeringen kunne ikke gemmes. Materialerne står stadig som Godkendt.', 'The SAP document is posted, but the mark could not be saved. The materials are still Approved.') : t('De stod ikke som godkendt i CountPoint. SAP-dokumentet er bogført.', 'They were not approved in CountPoint. The SAP document is posted.'), duration: 20000 })
      if (result.open.length) toast.warning(t(`Ikke bogført: ${result.open.join(', ')}`, `Not posted: ${result.open.join(', ')}`), { description: t('SAP viser dem stadig som aktive. Bogfør dem igen.', 'SAP still shows them as active. Post them again.'), duration: 20000 })
      // Not listed by MI22 at all: posted or not is unknown, so they are never called "Ikke bogført".
      if (result.unknown?.length) toast.warning(t(`Ukendt i SAP: ${result.unknown.join(', ')}`, `Unknown in SAP: ${result.unknown.join(', ')}`), { description: errorMessage('PIDOC_UNKNOWN'), duration: 20000 })
    } catch (error) {
      const flagged = errorCode(error) === 'PIDOC_SERIAL_LINES' ? items.filter(item => item.docNo && errorMaterials(error).includes(item.docNo)) : []
      // Counted again in SAP with MI05: a manager may post it here anyway, with a reason.
      if (flagged.length && MANAGER_ROLES.has(piList?.role || '')) {
        setSerialConfirm({ items, flagged })
        return
      }
      toast.error(errorMessage(error), { duration: 20000 })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const countDoc = async (item: PiDoc, confirmed: CountConfirmed = {}) => {
    setConfirmation(null)
    setBusy(item.id)
    try {
      setPiList(await window.electronWarehouse!.piDocs.count({ id, docId: item.id, ...confirmed }))
      toast.success(t(`Antal er lagt på SAP-dokument ${item.docNo}`, `Quantity entered on SAP document ${item.docNo}`), { description: t('Klar til bogføring (manager).', 'Ready for posting (manager).') })
    } catch (error) {
      const code = errorCode(error)
      if (code === 'PIDOC_ZERO_CONFIRM' || code === 'PIDOC_MISSING_CONFIRM') {
        setConfirmation({ kind: code === 'PIDOC_ZERO_CONFIRM' ? 'zero' : 'count-missing', materials: errorMaterials(error), message: errorMessage(error), item, confirmed })
        return
      }
      const refetch = errorCode(error) === 'PIDOC_DOC_STALE' && doc?.canFetch ? { action: { label: t('Hent dagens SAP-tal', "Fetch today's SAP figures"), onClick: () => void fetchToday() } } : {}
      toast.error(errorMessage(error), { duration: 20000, ...refetch })
      await load()
    } finally {
      setBusy(null)
    }
  }

  /** A manager's decision on a document SAP may or may not have; SAP itself is not touched. */
  const resolveDoc = async (item: PiDoc, request: { outcome: 'saved' | 'missing'; docNo: string; reason: string }) => {
    setResolving(null)
    setBusy(`resolve:${item.id}`)
    try {
      setPiList(await window.electronWarehouse!.piDocs.resolve({ id, docId: item.id, ...request }))
      toast.success(request.outcome === 'saved' ? t(`SAP-dokument ${request.docNo.trim()} er afklaret`, `SAP document ${request.docNo.trim()} is resolved`) : t('Dokumentet er afklaret', 'The document is resolved'))
    } catch (error) {
      toast.error(errorMessage(error), { duration: 20000 })
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
  const foundElsewhere = doc.rows.filter(row => row.foundElsewhere?.length).length

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
            <SapActionButton variant="outline" onAction={() => fetchToday()} disabled={step !== null}>
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
        {foundElsewhere > 0 && (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Warning size={16} /> {t(`${formatNumber(foundElsewhere)} ${foundElsewhere === 1 ? 'linje' : 'linjer'} med serienumre afskriver serienumre, der er fundet i en anden optælling i statussen. Flyt dem i SAP, før dokumentet laves.`, `${formatNumber(foundElsewhere)} ${foundElsewhere === 1 ? 'line' : 'lines'} with serial numbers write off serial numbers that were found in another count of the status. Move them in SAP before the document is made.`)}
          </p>
        )}
        {doc.missingApproval > 0 && (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Warning size={16} /> {formatNumber(doc.missingApproval)} {doc.missingApproval === 1 ? t('materiale mangler godkendelse og får intet antal.', 'material needs approval and gets no quantity.') : t('materialer mangler godkendelse og får intet antal.', 'materials need approval and get no quantity.')}
          </p>
        )}
        {piList && <PiDocsSection list={piList} selected={selection} busy={busy} figuresAt={doc.fetchedAt} onCreate={() => void createDoc()} onPrint={item => void printDoc(item)} onCount={item => void countDoc(item)} onPost={items => void postDocs(items)} onDelete={item => void deleteDoc(item)} onResolve={item => setResolving(item)} qtyOf={qtyOf} />}
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
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', row.sapToday === 0 && 'font-semibold text-red-600 dark:text-red-400')}>
                    {row.sapToday === null ? '–' : formatNumber(row.sapToday)}
                    {row.sapToday !== null && row.sapAtApproval !== null && row.sapToday !== row.sapAtApproval && (
                      <div className="text-xs text-muted-foreground">{row.sapToday > row.sapAtApproval ? '+' : ''}{formatNumber(row.sapToday - row.sapAtApproval)} {t('siden godkendelse', 'since approval')}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <DocQty row={row} fetched={doc.fetchedAt !== null} />
                    {row.foundElsewhere?.map(item => <div key={item.serial} className="text-xs"><span className="font-mono">{item.serial}</span> <FoundElsewhereNote item={item} /></div>)}
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
        {confirmation && (
          <ConfirmDialog
            confirmation={confirmation}
            onCancel={() => setConfirmation(null)}
            onConfirm={() => void (confirmation.kind === 'missing' ? fetchToday(confirmation.materials)
              : countDoc(confirmation.item, { ...confirmation.confirmed, [confirmation.kind === 'zero' ? 'confirmZero' : 'confirmMissing']: confirmation.materials }))}
          />
        )}
        {serialConfirm && (
          <SerialLinesDialog
            flagged={serialConfirm.flagged}
            onCancel={() => setSerialConfirm(null)}
            onConfirm={reason => void postDocs(serialConfirm.items, { docIds: serialConfirm.flagged.map(item => item.id), reason })}
          />
        )}
        {resolving && <ResolveDialog item={resolving} onCancel={() => setResolving(null)} onResolve={request => void resolveDoc(resolving, request)} />}
      </CardContent>
    </Card>
  )
}

/** Lists what the main process refused and lets the user go ahead anyway, deliberately. */
function ConfirmDialog({ confirmation, onCancel, onConfirm }: { confirmation: Confirmation; onCancel: () => void; onConfirm: () => void }) {
  const { title, description, action } = confirmation.kind === 'missing'
    ? {
      title: t('Materialer mangler i dagens SAP-tal', "Materials are missing from today's SAP figures"),
      description: t('Dagens SAP-tal har ingen linje for disse godkendte materialer, selvom SAP havde dem på lager ved godkendelsen. Det sker, hvis eksporten fra SAP fejlede. Gemmer du tallene, bliver SAP i dag 0 for dem. Tjek dem i MB52, før du gemmer.', "Today's SAP figures have no line for these approved materials, although SAP had them in stock at approval. That happens when the export from SAP failed. If you save the figures, SAP today becomes 0 for them. Check them in MB52 before you save."),
      action: t('Gem tallene alligevel', 'Save the figures anyway'),
    }
    : confirmation.kind === 'count-missing'
      ? {
        title: t(`Materialer mangler i dagens SAP-tal for SAP-dokument ${confirmation.item.docNo}`, `Materials are missing from today's SAP figures for SAP document ${confirmation.item.docNo}`),
        description: t('Dagens SAP-tal har ingen linje for disse godkendte materialer, selvom SAP havde dem på lager ved godkendelsen. Det sker, hvis eksporten fra SAP fejlede. Lægger du antal på, regnes SAP i dag som 0 for dem. Tjek dem i MB52, eller hent dagens SAP-tal igen.', "Today's SAP figures have no line for these approved materials, although SAP had them in stock at approval. That happens when the export from SAP failed. If you enter the quantity, SAP today counts as 0 for them. Check them in MB52, or fetch today's SAP figures again."),
        action: t('Læg antal på alligevel', 'Enter the quantity anyway'),
      }
      : {
        title: t(`Antal 0 på SAP-dokument ${confirmation.item.docNo}?`, `Quantity 0 on SAP document ${confirmation.item.docNo}?`),
        description: t('Serienummerlisten er tom for disse materialer, men SAP har lager i dag. Antallet bliver 0 i SAP, og hele lageret bogføres som tab. Bekræft kun, hvis der virkelig ikke er nogen.', 'The serial number list is empty for these materials, but SAP has stock today. The quantity becomes 0 in SAP, and the whole stock is posted as a loss. Only confirm if there really are none.'),
        action: t('Læg 0 på alligevel', 'Enter 0 anyway'),
      }
  return (
    <Dialog open onOpenChange={value => { if (!value) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {confirmation.materials.length
          ? <ul className="max-h-60 overflow-auto rounded-md border px-3 py-2 font-mono text-sm">{confirmation.materials.map(material => <li key={material}>{material}</li>)}</ul>
          : <p role="alert" className="text-sm text-destructive">{confirmation.message}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>{t('Annullér', 'Cancel')}</Button>
          <SapActionButton variant="destructive" onAction={onConfirm} disabled={!confirmation.materials.length}>
            {action}
          </SapActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A document whose material was approved with quantity lines: posted only after the count is corrected in SAP (MI05), with a reason. */
function SerialLinesDialog({ flagged, onCancel, onConfirm }: { flagged: PiDoc[]; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={value => { if (!value) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Bogfør alligevel?', 'Post anyway?')}</DialogTitle>
          <DialogDescription>
            {t('Et materiale på disse SAP-dokumenter blev godkendt med tællelinjer med antal. Bogfør kun, hvis antallet er rettet i SAP med MI05. Skriv hvad der er rettet.', 'A material on these SAP documents was approved with count lines with a quantity. Only post if the count has been corrected in SAP with MI05. Write what was corrected.')}
          </DialogDescription>
        </DialogHeader>
        <ul className="rounded-md border px-3 py-2 font-mono text-sm">{flagged.map(item => <li key={item.id}>{item.docNo}</li>)}</ul>
        <Input value={reason} maxLength={300} onChange={event => setReason(event.target.value)} placeholder={t('Begrundelse', 'Reason')} aria-label={t('Begrundelse', 'Reason')} />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>{t('Annullér', 'Cancel')}</Button>
          <SapActionButton variant="destructive" onAction={() => onConfirm(reason.trim())} disabled={!reason.trim()}>
            {t('Bogfør alligevel', 'Post anyway')}
          </SapActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** What a manager can answer for an unknown document, per step SAP may have taken. */
const resolveTexts = (item: PiDoc) => {
  const step = item.sapUnknown?.step ?? 'create'
  if (step === 'count') {
    const sent = (item.sapUnknown?.materials ?? []).map(entry => `${entry.material} (${formatNumber(entry.qty)})`).join(', ')
    const left = item.lines.filter(line => !item.entered?.[line.material] && !item.sapUnknown?.materials?.some(entry => entry.material === line.material)).length
    return {
      title: t(`Afklar antallet på SAP-dokument ${item.docNo}`, `Resolve the quantity on SAP document ${item.docNo}`),
      description: t(`Optælling ved ikke, om antallet blev gemt på SAP-dokument ${item.docNo}${sent ? ` for ${sent}` : ''}. Tjek dokumentet i SAP (MI03), og vælg hvad SAP viser.`, `Stock count does not know whether the quantity was saved on SAP document ${item.docNo}${sent ? ` for ${sent}` : ''}. Check the document in SAP (MI03) and choose what SAP shows.`),
      saved: t('Antal er lagt på i SAP', 'The quantity is entered in SAP'),
      savedHelp: left
        ? t(`Optælling noterer dem som lagt på. ${left} ${left === 1 ? 'materiale mangler' : 'materialer mangler'} stadig, så dokumentet står igen som Printet, og en admin lægger resten på.`, `Stock count records them as entered. ${left} ${left === 1 ? 'material is' : 'materials are'} still missing, so the document is shown as Printed again, and an admin enters the rest.`)
        : t('Dokumentet står som Antal lagt på og kan bogføres.', 'The document is shown as Quantity entered and can be posted.'),
      missing: t('Antal er ikke lagt på i SAP', 'The quantity is not entered in SAP'),
      missingHelp: t('Dokumentet står igen som Printet, så en admin kan lægge antal på.', 'The document is shown as Printed again, so an admin can enter the quantity.'),
    }
  }
  if (step === 'post') {
    return {
      title: t(`Afklar bogføringen af SAP-dokument ${item.docNo}`, `Resolve the posting of SAP document ${item.docNo}`),
      description: t(`Optælling ved ikke, om SAP-dokument ${item.docNo} blev bogført. Tjek dokumentet i SAP (MI03), og vælg hvad SAP viser.`, `Stock count does not know whether SAP document ${item.docNo} was posted. Check the document in SAP (MI03) and choose what SAP shows.`),
      saved: t('Bogført i SAP', 'Posted in SAP'),
      savedHelp: t('Dokumentet står som Bogført, og materialerne markeres "Bogført i SAP".', 'The document is shown as Posted, and the materials are marked "Posted in SAP".'),
      missing: t('Ikke bogført i SAP', 'Not posted in SAP'),
      missingHelp: t('Dokumentet står igen som Antal lagt på og kan bogføres.', 'The document is shown as Quantity entered again and can be posted.'),
    }
  }
  return {
    title: t(`Afklar dokumentet med referencen ${item.reference}`, `Resolve the document with the reference ${item.reference}`),
    description: t(`Optælling ved ikke, om SAP oprettede dokumentet. Søg i MI22 på referencen ${item.reference} (Phys. Inv. No.), og vælg hvad SAP viser.`, `Stock count does not know whether SAP created the document. Search MI22 for the reference ${item.reference} (Phys. Inv. No.) and choose what SAP shows.`),
    saved: t('Oprettet i SAP', 'Created in SAP'),
    savedHelp: t('Skriv dokumentnummeret fra SAP. Dokumentet står derefter som Oprettet og kan printes.', 'Type the document number from SAP. The document is then shown as Created and can be printed.'),
    missing: t('Findes ikke i SAP', 'Not in SAP'),
    missingHelp: t('Materialerne frigives, så der kan laves et nyt dokument.', 'The materials are released, so a new document can be made.'),
  }
}

/** A manager's decision on a document SAP may or may not have: what SAP shows, the document number and why. */
function ResolveDialog({ item, onCancel, onResolve }: { item: PiDoc; onCancel: () => void; onResolve: (request: { outcome: 'saved' | 'missing'; docNo: string; reason: string }) => void }) {
  const [outcome, setOutcome] = useState<'saved' | 'missing' | null>(null)
  const [docNo, setDocNo] = useState('')
  const [reason, setReason] = useState('')
  const texts = resolveTexts(item)
  // Same rule as the backend (9 or 10 digits); a count or posting must name the document itself.
  const validNo = /^\d{9,10}$/.test(docNo.trim()) && (!item.docNo || docNo.trim() === item.docNo)
  const ready = outcome !== null && reason.trim() !== '' && (outcome === 'missing' || validNo)
  const choice = (value: 'saved' | 'missing', label: string, help: string) => (
    <button type="button" aria-pressed={outcome === value} onClick={() => setOutcome(value)} className={cn('rounded-md border px-3 py-2 text-left text-sm', outcome === value ? 'border-primary bg-primary/10' : 'hover:bg-muted/50')}>
      <span className="block font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{help}</span>
    </button>
  )
  return (
    <Dialog open onOpenChange={value => { if (!value) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{texts.title}</DialogTitle>
          <DialogDescription>{texts.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {choice('saved', texts.saved, texts.savedHelp)}
          {choice('missing', texts.missing, texts.missingHelp)}
        </div>
        {outcome === 'saved' && (
          <Input value={docNo} maxLength={10} inputMode="numeric" onChange={event => setDocNo(event.target.value)} placeholder={t('SAP-dokumentnummer', 'SAP document number')} aria-label={t('SAP-dokumentnummer', 'SAP document number')} aria-invalid={docNo.trim() !== '' && !validNo} />
        )}
        {outcome === 'saved' && !item.docNo && (
          <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Warning size={16} /> {t('Appen kan kun tage ét dokument pr. reference. Har MI31 lavet flere, så tjek dem i SAP.', 'The app can only take one document per reference. If MI31 made more, check them in SAP.')}
          </p>
        )}
        <Input value={reason} maxLength={300} onChange={event => setReason(event.target.value)} placeholder={t('Hvad viser SAP?', 'What does SAP show?')} aria-label={t('Begrundelse', 'Reason')} />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>{t('Annullér', 'Cancel')}</Button>
          <Button disabled={!ready} onClick={() => outcome && onResolve({ outcome, docNo: outcome === 'saved' ? docNo.trim() : '', reason: reason.trim() })}>{t('Gem afklaringen', 'Save the decision')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A serial list of the day that gives another quantity than "SAP today + difference": something changed in SAP since approval. */
const serialMismatch = (row: CountDocRow) => row.serialManaged && row.docQty !== null && row.expectedQty !== null && row.docQty !== row.expectedQty

function DocQty({ row, fetched }: { row: CountDocRow; fetched: boolean }) {
  if (!row.approved) return <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">{t('Mangler godkendelse', 'Needs approval')}</Badge>
  if (row.serialLinesAtApproval) return <span role="alert" className="inline-block max-w-56 text-left text-xs font-medium text-destructive">{row.status === 'posted' ? t('Godkendt med tællelinjer med antal. Tjek det bogførte antal i SAP.', 'Approved with count lines with a quantity. Check the posted quantity in SAP.') : t('Godkendt med tællelinjer med antal. Nulstil materialet, slet linjen og godkend igen.', 'Approved with count lines with a quantity. Reset the material, delete the line and approve again.')}</span>
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
