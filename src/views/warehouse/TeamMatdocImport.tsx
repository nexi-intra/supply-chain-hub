import { useRef, useState } from 'react'
import { FileXls, MagnifyingGlass, UploadSimple, Warning, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSapStatus } from '@/components/warehouse/SapStatusContext'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatNumber, stockLabel } from '@/lib/warehouse/format'
import { currentWarehouseLanguage, t } from '@/lib/warehouse/text'
import type { MatdocTarget, TeamMatdocLookup, WarehouseUser } from '@/types/warehouse'
import { CheckSummary } from './count/MatdocImport'

/**
 * Why a material document cannot be imported, with the distribution to fix in SAP; null when it belongs to one count.
 * `openCounts` is how many open counts the lookup saw: with none, that is the reason.
 */
export function targetProblem(target: MatdocTarget, openCounts?: number): { title: string; lines: string[] } | null {
  const countLines = target.byCount.map(entry => `'${entry.countName}': ${formatNumber(entry.count)}`)
  const unknownLines = target.unknown > 0 ? [t(`Ukendte i de åbne optællingers SAP-tal: ${formatNumber(target.unknown)}`, `Unknown in the SAP figures of the open counts: ${formatNumber(target.unknown)}`)] : []
  switch (target.outcome) {
    case 'ok':
      return null
    case 'mixed':
      return {
        title: t('Serienumrene ligger forskellige steder i SAP. Ret det i SAP, og slå op igen', 'The serial numbers are in different places in SAP. Correct it in SAP and look up again'),
        lines: [...target.groups.map(group => `${group.sloc} ${stockLabel(group.stockType)}: ${formatNumber(group.count)}`), ...unknownLines],
      }
    case 'several':
      return { title: t('Serienumrene hører til flere optællinger', 'The serial numbers belong to several counts'), lines: [...countLines, ...unknownLines] }
    case 'outside': {
      const outside = target.rows.filter(row => row.sloc && !row.countId).length
      return {
        title: t('Nogle serienumre hører ikke til nogen åben optælling', 'Some serial numbers do not belong to any open count'),
        lines: [t(`Uden for de åbne optællinger: ${formatNumber(outside)}`, `Outside the open counts: ${formatNumber(outside)}`), ...countLines, ...unknownLines],
      }
    }
    case 'none': {
      const where = `${target.sloc ?? ''} ${stockLabel(target.stockType)}`.trim()
      return { title: t(`Ingen åben optælling tæller ${where}`, `No open count counts ${where}`), lines: unknownLines }
    }
    case 'unknown':
      if (openCounts === 0) return { title: t('Der er ingen åbne optællinger', 'There are no open counts'), lines: [] }
      return { title: t('Ingen af serienumrene findes i de åbne optællingers SAP-tal', 'None of the serial numbers are in the SAP figures of the open counts'), lines: [] }
  }
}

/** Why the user cannot import in the count the document belongs to. */
export function reasonText(reason: TeamMatdocLookup['reason'], countName: string | null): string | null {
  switch (reason) {
    case 'not-member':
      return t(`Du er ikke med i '${countName ?? ''}'. Åbn optællingen og anmod om at være med`, `You are not in '${countName ?? ''}'. Open the count and ask to join`)
    case 'locked':
      return t('Statussen er godkendt og låst', 'The status is approved and locked')
    case 'closed':
      return t('Optællingen er afsluttet', 'The count is closed')
    default:
      return null
  }
}

interface TeamMatdocImportProps {
  team: WarehouseUser['team']
  onClose: () => void
  onImported: () => void
}

/** "Importér materialedokument" from the counts overview: the document goes to the one open count of the team that counts it. */
export function TeamMatdocImport({ team, onClose, onImported }: TeamMatdocImportProps) {
  const { status, refresh: refreshSap } = useSapStatus()
  const [document, setDocument] = useState('')
  const [place, setPlace] = useState('')
  const [lookup, setLookup] = useState<TeamMatdocLookup | null>(null)
  const [busy, setBusy] = useState<'lookup' | 'import' | 'export' | null>(null)
  const documentRef = useRef<HTMLInputElement>(null)
  const transaction = team === 'TCD' ? 'ZMS_REP' : 'ZMS_PREP'

  const runLookup = async () => {
    if (busy) return
    if (!document.trim()) return
    setBusy('lookup')
    setLookup(null)
    try {
      const sap = await refreshSap(true)
      if (!sap.ready) { toast.warning(t('SAP er ikke klar', 'SAP is not ready'), { description: t('Log på SAP og luk eventuelle pop-ups (se SAP-indikatoren øverst).', 'Log on to SAP and close any pop-ups (see the SAP indicator at the top).') }); return }
      setLookup(await window.electronWarehouse!.counts.teamMatdocLookup(document))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const runImport = async () => {
    if (!lookup?.target.countId) return
    setBusy('import')
    try {
      const result = await window.electronWarehouse!.counts.teamMatdocImport({ document: lookup.document, place: place.trim(), serials: lookup.serials, countId: lookup.target.countId })
      toast.success(t(`${formatNumber(result.imported ?? 0)} serienumre fra ${lookup.document} importeret i '${result.countName}' på ${place.trim()}`, `${formatNumber(result.imported ?? 0)} serial numbers from ${lookup.document} imported in '${result.countName}' in ${place.trim()}`))
      onImported()
    } catch (error) {
      toast.error(errorMessage(error))
      setBusy(null)
    }
  }

  const runExport = async () => {
    if (!lookup) return
    setBusy('export')
    try {
      const result = await window.electronWarehouse!.counts.teamMatdocExport(lookup.document, lookup.serials, currentWarehouseLanguage())
      await window.electronWarehouse!.counts.openReport(result.file)
      toast.success(t('Filen er gemt', 'The file is saved'), { description: result.name })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const target = lookup?.target ?? null
  const problem = target ? targetProblem(target, lookup?.openCounts) : null
  const reason = lookup && target ? reasonText(lookup.reason, target.countName) : null
  const toImport = lookup?.check?.toImport ?? 0

  return (
    <Dialog open onOpenChange={value => { if (!value && busy !== 'import') onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Importér materialedokument', 'Import material document')}</DialogTitle>
          <DialogDescription>
            {t(`Skriv eller scan materialedokumentet som i ${transaction}. Optælling slår serienumrene op i SAP og finder den åbne optælling i teamet, der tæller dem. Hele dokumentet lægges på det sted, du skriver.`, `Type or scan the material document as in ${transaction}. Stock count looks the serial numbers up in SAP and finds the open count in the team that counts them. The whole document is put in the location you enter.`)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-matdoc-place">{t('Sted', 'Location')} *</Label>
            <Input id="team-matdoc-place" value={place} maxLength={60} autoComplete="off" onChange={event => setPlace(event.target.value)} placeholder={t('Fx Palle 14.2', 'E.g. Pallet 14.2')} className="max-w-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-matdoc">{t('Materialedokument', 'Material document')}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="team-matdoc"
                ref={documentRef}
                value={document}
                maxLength={20}
                autoComplete="off"
                autoFocus
                onChange={event => { setDocument(event.target.value); setLookup(null) }}
                onKeyDown={event => { if (event.key === 'Enter') void runLookup() }}
                className="max-w-xs font-mono"
                placeholder={t('4900229137 eller 4900229137 2026 01', '4900229137 or 4900229137 2026 01')}
              />
              <Button variant="secondary" onClick={() => runLookup()} loading={busy === 'lookup'} disabled={!document.trim() || !status?.ready || busy !== null}>
                <MagnifyingGlass size={18} /> {t('Slå op', 'Look up')}
              </Button>
            </div>
            {!status?.ready && <p className="text-xs text-muted-foreground">{t('Opslag kræver at SAP er klar (se indikatoren øverst).', 'Lookup needs SAP to be ready (see the indicator at the top).')}</p>}
          </div>

          {lookup && target && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">{lookup.transaction} · {t('materialedokument', 'material document')}</p>
                <p className="font-mono text-lg font-semibold">{lookup.document}</p>
                {lookup.materials.length === 0 ? <p className="mt-2 text-sm">{t('SAP fandt ingen serienumre på dokumentet.', 'SAP found no serial numbers on the document.')}</p> : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {lookup.materials.map(item => (
                      <li key={item.material} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold tabular-nums">{formatNumber(item.count)} ×</span>
                        <span className="font-medium">{item.description || item.material}</span>
                        <span className="font-mono text-xs text-muted-foreground">{item.material}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {problem ? (
                <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  <p className="flex items-start gap-2 font-semibold"><WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />{problem.title}</p>
                  {problem.lines.length > 0 && (
                    <ul className="mt-2 space-y-0.5 pl-6 tabular-nums">
                      {problem.lines.map(line => <li key={line}>{line}</li>)}
                    </ul>
                  )}
                  <p className="mt-2 pl-6 text-xs">{t('Intet er importeret.', 'Nothing has been imported.')}</p>
                </div>
              ) : (
                <div className="rounded-lg border p-4 text-sm">
                  <p className="text-muted-foreground">{t('Hører til optællingen', 'Belongs to the count')}</p>
                  <p className="text-base font-semibold">{target.countName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{target.sloc} · {stockLabel(target.stockType)}</p>
                </div>
              )}

              {!problem && lookup.alreadyImported && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
                  {t(`Dokumentet er allerede importeret af ${lookup.alreadyImported.byName} ${formatDateTime(lookup.alreadyImported.at)} på ${lookup.alreadyImported.place}. Serienumre, der allerede er talt, springes over.`, `The document was already imported by ${lookup.alreadyImported.byName} ${formatDateTime(lookup.alreadyImported.at)} in ${lookup.alreadyImported.place}. Serial numbers already counted are skipped.`)}
                </p>
              )}
              {!problem && lookup.importedElsewhere.map(entry => (
                <p key={`${entry.countName}|${entry.at}`} className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
                  {t(`Allerede importeret i '${entry.countName}' af ${entry.byName} ${formatDateTime(entry.at)} på ${entry.place}`, `Already imported in '${entry.countName}' by ${entry.byName} ${formatDateTime(entry.at)} in ${entry.place}`)}
                </p>
              ))}
              {!problem && reason && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />{reason}
                </p>
              )}
              {!problem && lookup.check && lookup.serials.length > 0 && <CheckSummary check={lookup.check} />}

              <div className="flex flex-wrap gap-2">
                {problem ? (
                  <Button variant="outline" onClick={() => runExport()} loading={busy === 'export'} disabled={busy !== null || lookup.serials.length === 0}>
                    <FileXls size={18} /> {t('Eksportér til Excel', 'Export to Excel')}
                  </Button>
                ) : (
                  <Button onClick={() => runImport()} loading={busy === 'import'} disabled={!lookup.canImport || !toImport || !place.trim() || busy !== null}>
                    <UploadSimple size={18} /> {t(`Importér ${formatNumber(toImport)} på ${place.trim() || '…'}`, `Import ${formatNumber(toImport)} in ${place.trim() || '…'}`)}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => { setLookup(null); documentRef.current?.focus() }} disabled={busy === 'import'}>{t('Annullér', 'Cancel')}</Button>
              </div>
              {!problem && lookup.canImport && !place.trim() && <p className="text-xs text-amber-700 dark:text-amber-300">{t('Angiv stedet (fx pallen) før import.', 'Enter the location (e.g. the pallet) before importing.')}</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
