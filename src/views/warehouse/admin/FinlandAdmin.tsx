import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime } from '@/lib/warehouse/format'
import { kolli } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import { FINLAND_TEST_SHEET, type FinlandDraftsCleared, type FinlandDraftsOverview, type FinlandDraftsPerson, type FinlandSettings } from '@/types/finland'

type SheetValues = Omit<FinlandSettings, 'isTest'>

/** The pick-up days of someone's changes, oldest first, as "24.11, 25.11". */
export function draftDays(byDay: Record<string, number>): string {
  return Object.keys(byDay).sort().map(iso => {
    const [, month, day] = iso.split('-').map(Number)
    return `${day}.${month}`
  }).join(', ')
}

/** "Annas ændringer", but "Jens' ændringer": a Danish name ending in s, x or z takes only an apostrophe. */
export const danishGenitive = (name: string) => (/[sxz]$/i.test(name) ? `${name}'` : `${name}s`)

const ALERT_CLASS = 'rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive'
const CLEARED_SHOWN = 20

/** What is left in the current sheet when the tool moves to another: changes not saved in it and parcels marked not sent. */
export type LeftBehind = { drafts: number; notSent: number }

/** The sentence in the confirmation of a sheet switch, or null when nothing stays behind. */
export function leftBehindText({ drafts, notSent }: LeftBehind): string | null {
  if (!drafts && !notSent) return null
  const changes = t(drafts === 1 ? '1 ikke gemt ændring' : `${drafts} ikke gemte ændringer`, drafts === 1 ? '1 unsaved change' : `${drafts} unsaved changes`)
  return t(
    `Der er ${changes} og ${kolli(notSent)} markeret som ikke sendt i det nuværende ark. De bliver ikke taget med til det nye ark.`,
    `There ${drafts === 1 ? 'is' : 'are'} ${changes} and ${kolli(notSent)} marked as not sent in the current sheet. They are not taken along to the new sheet.`,
  )
}

/**
 * Moving to another real sheet is confirmed, and so is moving back to the test sheet while changes or marks would stay
 * behind; a new tab or table in the same sheet is not.
 */
const needsConfirm = (next: SheetValues, current: FinlandSettings, leftBehind: LeftBehind | null) => next.workbookUrl !== current.workbookUrl
  && (next.workbookUrl !== FINLAND_TEST_SHEET.workbookUrl || !!(leftBehind && leftBehindText(leftBehind)))

/**
 * The sheet everyone in BPO and TCD writes: its address, tab and table, with "Gem" and the way back to the test sheet.
 * `leftBehind`: what the current sheet has that a switch leaves behind (null while unknown).
 */
export function FinlandSheetSettings({ settings, leftBehind = null, onSaved }: { settings: FinlandSettings; leftBehind?: LeftBehind | null; onSaved: (settings: FinlandSettings) => void }) {
  const [values, setValues] = useState<SheetValues>({ workbookUrl: settings.workbookUrl, sheetName: settings.sheetName, tableName: settings.tableName })
  const [confirm, setConfirm] = useState<SheetValues | null>(null)
  const [saving, setSaving] = useState(false)
  const next: SheetValues = { workbookUrl: values.workbookUrl.trim(), sheetName: values.sheetName.trim(), tableName: values.tableName.trim() }
  const changed = next.workbookUrl !== settings.workbookUrl || next.sheetName !== settings.sheetName || next.tableName !== settings.tableName
  const filled = !!(next.workbookUrl && next.sheetName && next.tableName)

  const write = async (sheet: SheetValues, saved: (result: FinlandSettings) => string) => {
    setSaving(true)
    try {
      const result = await trackPendingWrite(window.electronWarehouse!.finland.setSettings(sheet))
      toast.success(saved(result))
      onSaved(result)
    } catch (error) {
      toast.error(errorMessage(error, t('Arket blev ikke gemt', 'The sheet was not saved')))
    } finally {
      setSaving(false)
      setConfirm(null)
    }
  }

  const savedText = (result: FinlandSettings) => (result.isTest ? t('Værktøjet skriver nu i testarket', 'The tool now writes in the test sheet') : t('Arket er gemt', 'The sheet is saved'))
  const save = () => {
    if (!changed || !filled || saving) return
    if (needsConfirm(next, settings, leftBehind)) setConfirm(next)
    else void write(next, savedText)
  }
  const useTestSheet = () => {
    if (needsConfirm(FINLAND_TEST_SHEET, settings, leftBehind)) setConfirm(FINLAND_TEST_SHEET)
    else void write(FINLAND_TEST_SHEET, savedText)
  }
  const behind = leftBehind && leftBehindText(leftBehind)
  const field = (key: keyof SheetValues) => ({ value: values[key], disabled: saving, onChange: (event: ChangeEvent<HTMLInputElement>) => setValues(current => ({ ...current, [key]: event.target.value })) })

  return (
    <Card className="gap-0 p-6" data-finland-settings>
      <h2 className="text-lg font-semibold">{t('Arket', 'The sheet')}</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{t('BPO og TCD skriver kolli og opfølgning i dette ark.', 'BPO and TCD write parcels and follow-up in this sheet.')}</p>
      <div className="mb-5 space-y-1 rounded-md border p-4" data-active-sheet>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t('Værktøjet skriver i', 'The tool writes in')}</span>
          {settings.isTest && <Badge variant="attention">{t('Testark', 'Test sheet')}</Badge>}
        </div>
        <p className="break-all text-sm">{settings.workbookUrl}</p>
        <p className="text-sm text-muted-foreground">{t(`Fane ${settings.sheetName}, tabel ${settings.tableName}`, `Tab ${settings.sheetName}, table ${settings.tableName}`)}</p>
        {settings.isTest && <p className="text-sm text-muted-foreground">{t('Det er testarket. Skriv det rigtige arks adresse nedenfor, når værktøjet skal tages i brug.', "This is the test sheet. Type the real sheet's address below when the tool is to be used.")}</p>}
      </div>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); save() }}>
        <div className="space-y-1.5">
          <Label htmlFor="finland-workbook">{t('Arkets adresse', "The sheet's address")}</Label>
          <Input id="finland-workbook" autoComplete="off" {...field('workbookUrl')} />
          <p className="text-xs text-muted-foreground">{t('En adresse, der begynder med https://, eller en fuld sti til en .xlsx fil.', 'An address that begins with https://, or a full path to an .xlsx file.')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="finland-sheet">{t('Fane', 'Tab')}</Label>
            <Input id="finland-sheet" autoComplete="off" maxLength={64} {...field('sheetName')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="finland-table">{t('Tabel', 'Table')}</Label>
            <Input id="finland-table" autoComplete="off" maxLength={64} {...field('tableName')} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!changed || !filled || saving}>{t('Gem', 'Save')}</Button>
          {!settings.isTest && <Button type="button" variant="outline" disabled={saving} onClick={useTestSheet}>{t('Brug testarket igen', 'Use the test sheet again')}</Button>}
        </div>
      </form>
      {confirm && (
        <AlertDialog open onOpenChange={open => { if (!open && !saving) setConfirm(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Skift ark', 'Change sheet')}</AlertDialogTitle>
              <AlertDialogDescription>{t('Herefter skriver BPO og TCD i dette ark. Er det det rigtige ark?', 'From now on BPO and TCD write in this sheet. Is it the right sheet?')}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <p className="break-all">{confirm.workbookUrl}</p>
              <p className="text-muted-foreground">{t(`Fane ${confirm.sheetName}, tabel ${confirm.tableName}`, `Tab ${confirm.sheetName}, table ${confirm.tableName}`)}</p>
            </div>
            {behind && <p className="text-sm" data-left-behind>{behind}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>{t('Fortryd', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); void write(confirm, savedText) }}>{t('Ja, brug dette ark', 'Yes, use this sheet')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  )
}

/**
 * Everyone's follow-up changes saved in the app but not in the sheet yet, the manager's own included, and below them who
 * deleted whose changes (`cleared`, newest first).
 */
export function FinlandDrafts({ people, cleared = [], onCleared }: { people: FinlandDraftsPerson[]; cleared?: FinlandDraftsCleared[]; onCleared: () => Promise<void> }) {
  const [clearing, setClearing] = useState<FinlandDraftsPerson | null>(null)
  const [busy, setBusy] = useState(false)

  const clear = async (person: FinlandDraftsPerson) => {
    setBusy(true)
    try {
      await trackPendingWrite(window.electronWarehouse!.finland.clearDrafts({ email: person.email }))
      toast.success(t(`${danishGenitive(person.name)} ændringer er slettet i appen`, `${person.name}'s changes are deleted in the app`))
      await onCleared()
    } catch (error) {
      toast.error(errorMessage(error, t('Ændringerne blev ikke slettet', 'The changes were not deleted')))
    } finally {
      setBusy(false)
      setClearing(null)
    }
  }

  return (
    <Card className="gap-0 p-6" data-finland-drafts>
      <h2 className="text-lg font-semibold">{t('Ændringer, der ikke er gemt i arket', 'Changes not saved in the sheet')}</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{t('Opfølgning, som er gemt i appen, men ikke i arket endnu. Dine egne ændringer står her også.', 'Follow-up saved in the app but not in the sheet yet. Your own changes are here too.')}</p>
      {people.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen har ændringer, der ikke er gemt i arket.', 'Nobody has changes that are not saved in the sheet.')}</p> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">{t('Navn', 'Name')}</th>
                <th className="px-3 py-2 font-medium">{t('Antal', 'Count')}</th>
                <th className="px-3 py-2 font-medium">{t('Dage', 'Days')}</th>
                <th className="px-3 py-2 font-medium">{t('Senest ændret', 'Last changed')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {people.map(person => (
                <tr key={person.email} className="border-t" data-drafts-person={person.email}>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{person.name}</div>
                    <div className="text-xs text-muted-foreground">{person.email}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{kolli(person.count)}</td>
                  <td className="px-3 py-2 tabular-nums">{draftDays(person.byDay) || '–'}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDateTime(Date.parse(person.updatedAt))}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setClearing(person)}>
                      {t(`Slet ${danishGenitive(person.name)} ændringer`, `Delete ${person.name}'s changes`)}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cleared.length > 0 && (
        <div className="mt-5" data-drafts-cleared>
          <h3 className="mb-2 text-sm font-semibold">{t('Slettede ændringer', 'Deleted changes')}</h3>
          <ul className="space-y-1 text-sm">
            {cleared.slice(0, CLEARED_SHOWN).map(entry => (
              <li key={`${entry.at}-${entry.email}`} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-muted-foreground">{formatDateTime(entry.at)}</span>
                <span>{t(`${entry.byName} slettede ${danishGenitive(entry.name)} ændringer (${kolli(entry.count)})`, `${entry.byName} deleted ${entry.name}'s changes (${kolli(entry.count)})`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {clearing && (
        <AlertDialog open onOpenChange={open => { if (!open && !busy) setClearing(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t(`Slet ${danishGenitive(clearing.name)} ændringer`, `Delete ${clearing.name}'s changes`)}</AlertDialogTitle>
              <AlertDialogDescription>{t('Ændringerne slettes kun i appen. Arket bliver ikke ændret.', 'The changes are deleted only in the app. The sheet is not changed.')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{t('Fortryd', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={busy} onClick={event => { event.preventDefault(); void clear(clearing) }}>
                {t('Ja, slet ændringerne', 'Yes, delete the changes')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  )
}

/** Finlandsforsendelser in Administration: which sheet the tool writes, and the changes not in the sheet yet. */
export function FinlandAdmin() {
  const [settings, setSettings] = useState<FinlandSettings | null>(null)
  const [settingsFailed, setSettingsFailed] = useState<string | null>(null)
  const [overview, setOverview] = useState<FinlandDraftsOverview | null>(null)
  const [draftsFailed, setDraftsFailed] = useState<string | null>(null)

  const loadDrafts = useCallback(async () => {
    try {
      setOverview(await window.electronWarehouse!.finland.draftsOverview())
      setDraftsFailed(null)
    } catch (error) {
      setDraftsFailed(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    let current = true
    window.electronWarehouse?.finland.settings()
      .then(result => { if (current) setSettings(result) })
      .catch(error => { if (current) setSettingsFailed(errorMessage(error)) })
    window.electronWarehouse?.finland.draftsOverview()
      .then(result => { if (current) setOverview(result) })
      .catch(error => { if (current) setDraftsFailed(errorMessage(error)) })
    return () => { current = false }
  }, [])

  // The counts are of the sheet in the settings; one read before another sheet was chosen is not shown as this one's.
  const leftBehind = overview && settings && overview.currentSheet.workbookUrl === settings.workbookUrl ? overview.currentSheet : null
  const saved = (result: FinlandSettings) => {
    setSettings(result)
    void loadDrafts()
  }

  return (
    <>
      {settingsFailed && <p role="alert" className={ALERT_CLASS}>{settingsFailed}</p>}
      {!settingsFailed && !settings && <Skeleton className="h-64 rounded-xl" />}
      {/* The key starts the form over from what was saved, e.g. after "Brug testarket igen". */}
      {settings && <FinlandSheetSettings key={`${settings.workbookUrl}\n${settings.sheetName}\n${settings.tableName}`} settings={settings} leftBehind={leftBehind} onSaved={saved} />}
      {draftsFailed && <p role="alert" className={ALERT_CLASS}>{draftsFailed}</p>}
      {!draftsFailed && !overview && <Skeleton className="h-40 rounded-xl" />}
      {overview && !draftsFailed && <FinlandDrafts people={overview.people} cleared={overview.cleared} onCleared={loadDrafts} />}
    </>
  )
}
