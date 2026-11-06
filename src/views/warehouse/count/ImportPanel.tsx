import { useState } from 'react'
import { ArrowCounterClockwise, FileArrowUp, MagnifyingGlass, UploadSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea, Tabs } from '@/components/warehouse/ui'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatNumber } from '@/lib/warehouse/format'
import type { ImportCheck } from '@/types/warehouse'
import type { PanelProps } from './CountView'
import { CheckSummary, MatdocImport } from './MatdocImport'
import { t } from '@/lib/warehouse/text'

export function ImportPanel({ id, open, state, refresh }: PanelProps) {
  const [mode, setMode] = useState<'matdoc' | 'list'>('matdoc')
  const [text, setText] = useState('')
  const [fileSerials, setFileSerials] = useState<{ fileName: string; serials: string[] } | null>(null)
  const [place, setPlace] = useState('')
  const [check, setCheck] = useState<ImportCheck | null>(null)
  const [busy, setBusy] = useState<'check' | 'import' | 'file' | null>(null)

  const source = () => (fileSerials ? { serials: fileSerials.serials } : { text })

  const pickFile = async () => {
    setBusy('file')
    try {
      const result = await window.electronWarehouse!.counts.importFile()
      if (result) { setFileSerials(result); setText(''); setCheck(null) }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const runCheck = async () => {
    setBusy('check')
    try {
      setCheck(await window.electronWarehouse!.counts.importSerials({ id, place, dryRun: true, ...source() }))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const runImport = async () => {
    setBusy('import')
    try {
      const result = await window.electronWarehouse!.counts.importSerials({ id, place, dryRun: false, ...source() })
      toast.success(t(`${formatNumber(result.imported ?? 0)} serienumre importeret på ${place}`, `${formatNumber(result.imported ?? 0)} serial numbers imported in ${place}`))
      setText('')
      setFileSerials(null)
      setCheck(null)
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const [undoingId, setUndoingId] = useState<string | null>(null)
  const undoImport = async (eventId: string) => {
    if (undoingId) return
    if (!window.confirm(t('Fortryd hele importen?', 'Undo the whole import?'))) return
    setUndoingId(eventId)
    try {
      await window.electronWarehouse!.counts.undo({ id, eventId })
      toast.success(t('Importen er fortrudt', 'The import was undone'))
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUndoingId(null)
    }
  }

  const imports = state.myLastEvents.filter(event => event.type === 'import')
  const hasInput = Boolean(fileSerials?.serials.length || text.trim())
  const placeInput = (
    <div className="space-y-1.5">
      <Label htmlFor="import-place">{t('Sted', 'Location')} *</Label>
      <Input id="import-place" list="import-places" value={place} maxLength={60} onChange={event => { setPlace(event.target.value); setCheck(null) }} placeholder={t('Fx Palle 14.2', 'E.g. Pallet 14.2')} />
      <datalist id="import-places">{open.places.map(item => <option key={item.name} value={item.name} />)}</datalist>
    </div>
  )

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
      <Tabs<'matdoc' | 'list'> value={mode} onChange={setMode} items={[{ value: 'matdoc', label: t('Materialedokument', 'Material document') }, { value: 'list', label: t('Liste eller fil', 'List or file') }]} />
      {mode === 'matdoc' ? <MatdocImport id={id} team={state.meta.team} place={place} placeInput={placeInput} refresh={refresh} /> : (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('Importér serienumre', 'Import serial numbers')}</CardTitle>
          <CardDescription>{t('Til indplastede paller o.l.: indsæt serienumre eller vælg en Excel/CSV-fil. Stedet er obligatorisk, så man kan finde varerne igen.', 'For wrapped pallets and the like: paste serial numbers or choose an Excel/CSV file. The location is required so the items can be found again.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {placeInput}
          {fileSerials ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
              <FileArrowUp size={20} />
              <span><strong>{fileSerials.fileName}</strong> · {formatNumber(fileSerials.serials.length)} {t('serienumre', 'serial numbers')}</span>
              <Button variant="link" size="sm" onClick={() => { setFileSerials(null); setCheck(null) }}>{t('Fjern fil', 'Remove file')}</Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="import-text">{t('Serienumre (ét pr. linje)', 'Serial numbers (one per line)')}</Label>
              <Textarea id="import-text" value={text} onChange={event => { setText(event.target.value); setCheck(null) }} className="min-h-48 font-mono" placeholder={t('Indsæt fra Excel eller udklipsholder\n…', 'Paste from Excel or the clipboard\n…')} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void pickFile()} loading={busy === 'file'}><FileArrowUp size={18} /> {t('Vælg fil …', 'Choose file …')}</Button>
            <Button variant="secondary" onClick={() => void runCheck()} loading={busy === 'check'} disabled={!hasInput || !place.trim()}><MagnifyingGlass size={18} /> {t('Tjek først', 'Check first')}</Button>
            <Button onClick={() => void runImport()} loading={busy === 'import'} disabled={!check || !check.toImport}><UploadSimple size={18} /> {t('Importér', 'Import')} {check?.toImport ? formatNumber(check.toImport) : ''}</Button>
          </div>
          {check && <CheckSummary check={check} />}
        </CardContent>
      </Card>
      )}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{t('Dine seneste importer', 'Your latest imports')}</CardTitle></CardHeader>
        <CardContent>
          {imports.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen endnu.', 'None yet.')}</p> : (
            <ul className="divide-y text-sm">
              {imports.map(event => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{event.document ? <><span className="font-mono">{t('Matdok', 'Mat. doc.')} {event.document}</span> · </> : null}{formatNumber(event.serials?.length ?? 0)} {t('stk.', 'pcs')} · {event.place} · {formatDateTime(event.at)}</span>
                  <Button size="sm" variant="ghost" loading={undoingId === event.id} onClick={() => void undoImport(event.id)}><ArrowCounterClockwise size={16} /> {t('Fortryd', 'Undo')}</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
