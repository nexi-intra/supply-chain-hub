import { useRef, useState, type ReactNode } from 'react'
import { MagnifyingGlass, UploadSimple, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSapStatus } from '@/components/warehouse/SapStatusContext'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatNumber } from '@/lib/warehouse/format'
import type { WarehouseUser, ImportCheck, MatdocLookup } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'

export function CheckSummary({ check }: { check: ImportCheck }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
      <p className="font-semibold">{t(`Forhåndstjek af ${formatNumber(check.total)} serienumre`, `Pre-check of ${formatNumber(check.total)} serial numbers`)}</p>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <li>{t('Kendte i optællingen', 'Known in the count')}: <strong>{formatNumber(check.found)}</strong>{check.blocked ? t(` (heraf ${formatNumber(check.blocked)} blocked)`, ` (of which ${formatNumber(check.blocked)} blocked)`) : ''}</li>
        <li>{t('Skal flyttes', 'Must be moved')}: <strong>{formatNumber(check.move)}</strong></li>
        <li>{t('Allerede scannet', 'Already scanned')}: <strong>{formatNumber(check.duplicate)}</strong> {t('(springes over)', '(skipped)')}</li>
        <li>{t('Anden storage location', 'Other storage location')}: <strong>{formatNumber(check.otherSloc)}</strong></li>
        {check.otherCount > 0 && <li>{t('Tælles i en anden optælling', 'Counted in another count')}: <strong>{formatNumber(check.otherCount)}</strong></li>}
        <li>{t('Uden for optællingen', 'Outside the count')}: <strong>{formatNumber(check.outside)}</strong></li>
        <li>{t('Ukendte i SAP', 'Unknown in SAP')}: <strong>{formatNumber(check.unknown)}</strong></li>
        <li>{t('Gentaget i listen', 'Repeated in the list')}: <strong>{formatNumber(check.repeated)}</strong></li>
        <li>{t('Ugyldige', 'Invalid')}: <strong>{formatNumber(check.invalid)}</strong></li>
      </ul>
    </div>
  )
}

interface MatdocImportProps {
  id: string
  team: WarehouseUser['team']
  place: string
  placeInput: ReactNode
  refresh: () => Promise<void>
}

export function MatdocImport({ id, team, place, placeInput, refresh }: MatdocImportProps) {
  const { status, refresh: refreshSap } = useSapStatus()
  const [document, setDocument] = useState('')
  const [lookup, setLookup] = useState<MatdocLookup | null>(null)
  const [busy, setBusy] = useState<'lookup' | 'import' | null>(null)
  const documentRef = useRef<HTMLInputElement>(null)
  const transaction = team === 'TCD' ? 'ZMS_REP' : 'ZMS_PREP'

  const runLookup = async () => {
    if (!document.trim()) return
    setBusy('lookup')
    setLookup(null)
    try {
      const sap = await refreshSap(true)
      if (!sap.ready) { toast.warning(t('SAP er ikke klar', 'SAP is not ready'), { description: t('Log på SAP og luk eventuelle pop-ups (se SAP-indikatoren øverst).', 'Log on to SAP and close any pop-ups (see the SAP indicator at the top).') }); return }
      setLookup(await window.electronWarehouse!.counts.lookupMatdoc({ id, document }))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const runImport = async () => {
    if (!lookup) return
    setBusy('import')
    try {
      const result = await window.electronWarehouse!.counts.importSerials({ id, place, serials: lookup.serials, document: lookup.document, dryRun: false })
      toast.success(t(`${formatNumber(result.imported ?? 0)} serienumre fra ${lookup.document} importeret på ${place}`, `${formatNumber(result.imported ?? 0)} serial numbers from ${lookup.document} imported in ${place}`))
      setLookup(null)
      setDocument('')
      await refresh()
      documentRef.current?.focus()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Importér fra materialedokument', 'Import from material document')}</CardTitle>
        <CardDescription>
          {t(`Skriv eller scan materialedokumentet som i ${transaction} (fx "4900229137 2026 01"). Optælling slår serienumrene op i SAP – kun opslag, intet ændres.`, `Type or scan the material document as in ${transaction} (e.g. "4900229137 2026 01"). Stock count looks the serial numbers up in SAP – lookup only, nothing is changed.`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {placeInput}
        <div className="space-y-1.5">
          <Label htmlFor="matdoc">{t('Materialedokument', 'Material document')}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="matdoc"
              ref={documentRef}
              value={document}
              maxLength={20}
              autoComplete="off"
              onChange={event => { setDocument(event.target.value); setLookup(null) }}
              onKeyDown={event => { if (event.key === 'Enter') void runLookup() }}
              className="max-w-xs font-mono"
              placeholder="4900229137 2026 01"
            />
            <Button variant="secondary" onClick={() => void runLookup()} loading={busy === 'lookup'} disabled={!document.trim() || !status?.ready}>
              <MagnifyingGlass size={18} /> {t('Slå op i SAP', 'Look up in SAP')}
            </Button>
          </div>
          {!status?.ready && <p className="text-xs text-muted-foreground">{t('Opslag kræver at SAP er klar (se indikatoren øverst).', 'Lookup needs SAP to be ready (see the indicator at the top).')}</p>}
        </div>

        {lookup && (
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
            {lookup.alreadyImported && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
                {t(`Dokumentet er allerede importeret af ${lookup.alreadyImported.byName} ${formatDateTime(lookup.alreadyImported.at)} på ${lookup.alreadyImported.place}. Serienumre, der allerede er talt, springes over.`, `The document was already imported by ${lookup.alreadyImported.byName} ${formatDateTime(lookup.alreadyImported.at)} in ${lookup.alreadyImported.place}. Serial numbers already counted are skipped.`)}
              </p>
            )}
            {lookup.serials.length > 0 && <CheckSummary check={lookup.check} />}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void runImport()} loading={busy === 'import'} disabled={!lookup.check.toImport || !place.trim()}>
                <UploadSimple size={18} /> {t(`Importér ${formatNumber(lookup.check.toImport ?? 0)} på ${place.trim() || '…'}`, `Import ${formatNumber(lookup.check.toImport ?? 0)} in ${place.trim() || '…'}`)}
              </Button>
              <Button variant="ghost" onClick={() => { setLookup(null); documentRef.current?.focus() }}>{t('Annullér', 'Cancel')}</Button>
            </div>
            {!place.trim() && <p className="text-xs text-amber-700 dark:text-amber-300">{t('Angiv stedet (fx pallen) før import.', 'Enter the location (e.g. the pallet) before importing.')}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
