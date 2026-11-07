import { useEffect, useState } from 'react'
import { CheckCircle, CircleNotch, FileArrowDown, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { formatDate, materialLabel, purposeLabel, PURPOSES } from '@/lib/warehouse/locations'
import { cn } from '@/lib/utils'
import { t } from '@/lib/warehouse/text'
import type { ImportPreview, ImportStep, ImportWarningCode } from '@/types/warehouse'

// Each text is a ['dansk', 'English'] pair for t(...pair).
const WARNING_LABELS: Record<ImportWarningCode, { label: [string, string]; help: [string, string] }> = {
  NOT_IN_SAP: { label: ['Findes ikke i SAP', 'Not in SAP'], help: ['Rækken bliver ikke til en palle. Ret materialenummeret i arket eller opret pallen bagefter.', 'The row does not become a pallet. Correct the material number in the sheet or create the pallet afterwards.'] },
  DESCRIPTION_DIFFERS: { label: ['Arkets beskrivelse er anderledes end SAP', "The sheet's description differs from SAP"], help: ['Hubben bruger altid SAP-beskrivelsen.', "The Hub always uses SAP's description."] },
  AREA_FROM_NAME: { label: ['Område fundet ud fra navnet', 'Area taken from the name'], help: ['Arket havde intet område (#N/A).', 'The sheet had no area (#N/A).'] },
  NOT_CHECKED: { label: ['Ikke tjekket i SAP (MM60 fejlede)', 'Not checked in SAP (MM60 failed)'], help: ['Materialerne importeres uden beskrivelse; Hubben henter beskrivelsen senere, når MM60 virker.', 'The materials are imported without a description; the Hub fetches it later when MM60 works.'] },
  MIXED_PLACE: { label: ['Placeringer med både PLUK/999-999 og paller', 'Places with both PLUK/999-999 and pallets'], help: ['De er importeret som reservepladser, så ingen paller går tabt. Ret formålet under Administrér placeringer.', 'They are imported as reserve places so no pallets are lost. Correct the purpose under Manage locations.'] },
  ROW_SKIPPED: { label: ['Rækker der ikke bliver til noget', 'Rows that become nothing'], help: ['Fx en palle på en pluk-plads, en arbejdsstation eller en reserveret plads, eller et antal uden materiale. Opret pallen bagefter, hvis den findes.', 'E.g. a pallet on a pick place, a work station or a reserved place, or a quantity without a material. Create the pallet afterwards if it exists.'] },
  UNKNOWN_TYPE: { label: ['Ukendt type – sat til Palle', 'Unknown type – set to Pallet'], help: ['Kan rettes under Administrér placeringer.', 'Can be corrected under Manage locations.'] },
  PALLET_PLACE_MANY: { label: ['Pallepladser med flere rækker', 'Pallet places with several rows'], help: ['En palleplads har altid plads til én palle. Kan der stå flere, så ret typen til Gulv under Administrér placeringer; ellers flyt pallerne. Arkets paller importeres alle.', 'A pallet place always holds one pallet. If more fit, change the type to Floor under Manage locations; otherwise move the pallets. All pallets in the sheet are imported.'] },
}

/** The one-off import of TCD's placement sheet: read it, check every material in SAP, show what will happen, then import. */
export function ImportSheet({ onDone }: { onDone: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [reading, setReading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [step, setStep] = useState<ImportStep | null>(null)
  useEffect(() => window.electronWarehouse!.locations.onImportProgress(progress => setStep(progress.step)), [])
  const bridge = window.electronWarehouse!.locations

  async function read() {
    setStep(null)
    setReading(true)
    setConfirmReplace(false)
    try {
      setPreview(await bridge.previewImport())
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setReading(false)
    }
  }

  async function apply(replace: boolean) {
    if (!preview) return
    setApplying(true)
    try {
      const result = await bridge.applyImport({ token: preview.token, replace })
      toast.success(t(`${formatNumber(result.locations)} placeringer og ${formatNumber(result.pallets)} paller er importeret`, `${formatNumber(result.locations)} locations and ${formatNumber(result.pallets)} pallets imported`))
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setApplying(false)
    }
  }

  const groups = preview ? (Object.keys(WARNING_LABELS) as ImportWarningCode[]).map(code => ({ code, items: preview.warnings.filter(warning => warning.code === code) })).filter(group => group.items.length) : []

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Importér placeringsarket', 'Import the placement sheet')}</h1>
        <p className="text-sm text-muted-foreground">{t('Hubben læser det nyeste placeringsark på M: (kun læsning) og slår alle materialer op i SAP (MB52 og MM60), så beskrivelserne er SAP\'s egne. Intet gemmes, før du trykker Importér.', "The Hub reads the newest placement sheet on M: (read only) and looks every material up in SAP (MB52 and MM60), so the descriptions are SAP's own. Nothing is saved until you press Import.")}</p>
      </div>
      <SapActionButton onAction={read} loading={reading}><FileArrowDown size={16} /> {preview ? t('Læs arket igen', 'Read the sheet again') : t('Læs arket og tjek i SAP', 'Read the sheet and check in SAP')}</SapActionButton>
      {reading && <ImportProgress step={step} />}

      {preview && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{preview.file}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-6">
                <div><p className="text-2xl font-semibold">{formatNumber(preview.stats.locations)}</p><p className="text-xs text-muted-foreground">{t('placeringer', 'locations')}</p></div>
                <div><p className="text-2xl font-semibold">{formatNumber(preview.stats.pallets)}</p><p className="text-xs text-muted-foreground">{t('paller', 'pallets')}</p></div>
                {Boolean(preview.stats.stock) && <div><p className="text-2xl font-semibold">{formatNumber(preview.stats.stock ?? 0)}</p><p className="text-xs text-muted-foreground">{t('linjer på hylder', 'lines on shelves')}</p></div>}
                <div><p className="text-2xl font-semibold">{formatNumber(preview.stats.materials)}</p><p className="text-xs text-muted-foreground">{t('materialer', 'materials')}</p></div>
              </div>
              <div className="flex flex-wrap gap-1.5">{PURPOSES.filter(purpose => preview.stats.byPurpose[purpose]).map(purpose => <Badge key={purpose} variant="secondary">{purposeLabel(purpose)}: {preview.stats.byPurpose[purpose]}</Badge>)}</div>
              <div className="flex flex-wrap gap-1.5">{Object.entries(preview.stats.byArea).sort(([a], [b]) => a.localeCompare(b, 'da')).map(([area, count]) => <Badge key={area} variant="outline" className="font-mono">{area} {count}</Badge>)}</div>
            </CardContent>
          </Card>

          {preview.mm60Error && (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"><Warning size={16} className="mt-0.5 shrink-0 text-amber-600" /><span>{t('MM60 (materialer uden lager) fejlede – importen kan stadig gennemføres; de berørte materialer får beskrivelsen senere.', 'MM60 (materials without stock) failed – the import can still go ahead; the materials concerned get their description later.')} <span className="break-all font-mono text-xs text-muted-foreground">{preview.mm60Error}</span></span></p>
          )}
          {groups.map(group => (
            <details key={group.code} className="rounded-lg border bg-card px-4 py-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Warning size={16} className="text-amber-600" /> {t(...WARNING_LABELS[group.code].label)} <Badge variant="secondary">{group.items.length}</Badge>
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">{t(...WARNING_LABELS[group.code].help)}</p>
              <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto text-xs">
                {group.items.map(item => <li key={`${item.row}-${item.code}`}><span className="font-mono">{t(`Række ${item.row}`, `Row ${item.row}`)} · {item.name}</span> – {item.detail}</li>)}
              </ul>
            </details>
          ))}

          {preview.examples.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{t('Eksempler på paller', 'Example pallets')}</CardTitle></CardHeader>
              <CardContent className="divide-y text-sm">
                {preview.examples.map(pallet => (
                  <div key={pallet.id} className="flex flex-wrap gap-3 py-1.5">
                    <span className="w-16 font-mono font-semibold">{pallet.location}</span>
                    <span className="min-w-0 flex-1 truncate">{materialLabel(pallet.material, pallet.description)}</span>
                    <span>{pallet.quantity === null ? '' : formatNumber(pallet.quantity)}</span>
                    <span className="text-muted-foreground">{formatDate(pallet.receivedAt)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {preview.live ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{t('Placeringer er taget i brug – arket kan ikke importeres igen. Ret i stedet under Administrér placeringer.', 'Locations are in use – the sheet can no longer be imported. Correct things under Manage locations instead.')}</p>
          ) : preview.existing > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              <span className="flex-1">{t(`Der findes allerede ${preview.existing} placeringer. Erstat alt sletter dem og importerer arket.`, `There are already ${preview.existing} locations. Replace all deletes them and imports the sheet.`)}</span>
              {confirmReplace
                ? <Button variant="destructive" loading={applying} onClick={() => apply(true)}>{t('Ja, erstat alt', 'Yes, replace all')}</Button>
                : <Button variant="outline" onClick={() => setConfirmReplace(true)}>{t('Erstat alt', 'Replace all')}</Button>}
            </div>
          ) : (
            <div className="flex justify-end"><Button size="lg" loading={applying} onClick={() => apply(false)}>{t('Importér', 'Import')}</Button></div>
          )}
        </>
      )}
    </div>
  )
}

// Each step with what it does; MM60 is skipped when MB52 already knew every material.
const IMPORT_STEPS = (): { step: ImportStep; label: string; detail: string }[] => [
  { step: 'sheet', label: t('Læser placeringsarket', 'Reading the placement sheet'), detail: t('Det nyeste placeringsark på M: læses (kun læsning – arket ændres ikke).', 'The newest placement sheet on M: is read (read only – the sheet is not changed).') },
  { step: 'check', label: t('Tjekker SAP', 'Checking SAP'), detail: t('Er SAP logget ind og klar? Hubben åbner sin egen SAP-session i baggrunden – lad den være.', 'Is SAP logged in and ready? The Hub opens its own SAP session in the background – leave it be.') },
  { step: 'mb52', label: t('Beskrivelser fra lageret (MB52)', 'Descriptions from stock (MB52)'), detail: t('SAP\'s beskrivelse af alt, der er på lager i D301 – kun lagerlisten, ingen serienumre.', 'SAP\'s description of everything in stock in D301 – only the stock list, no serial numbers.') },
  { step: 'mm60', label: t('Materialer uden lager (MM60)', 'Materials without stock (MM60)'), detail: t('Materialer i arket, som ikke er på lager, slås op i SAP\'s materialeliste.', 'Materials in the sheet that are not in stock are looked up in SAP\'s material list.') },
  { step: 'plan', label: t('Laver forhåndsvisningen', 'Making the preview'), detail: t('Placeringer, paller og advarsler regnes ud. Intet er gemt endnu.', 'Locations, pallets and warnings are worked out. Nothing is saved yet.') },
]

function ImportProgress({ step }: { step: ImportStep | null }) {
  const steps = IMPORT_STEPS()
  const index = step === 'done' ? steps.length : Math.max(steps.findIndex(item => item.step === step), 0)
  const current = steps[Math.min(index, steps.length - 1)]
  const percent = step === 'done' ? 100 : Math.round(((index + 0.5) / steps.length) * 100)
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium"><CircleNotch size={16} className="animate-spin text-primary" /> {current.label}</span>
          <span className="tabular-nums text-muted-foreground">{percent} %</span>
        </div>
        <Progress value={percent} aria-label={t('Fremdrift for importen', 'Progress of the import')} />
        <p className="text-xs text-muted-foreground">{current.detail}</p>
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-live="polite">
          {steps.map((item, position) => (
            <li key={item.step} className={cn('inline-flex items-center gap-1.5', position < index ? 'text-foreground' : position === index ? 'font-semibold text-primary' : 'text-muted-foreground')}>
              {position < index ? <CheckCircle size={14} weight="fill" /> : position === index ? <CircleNotch size={14} className="animate-spin" /> : <span className="size-3.5 rounded-full border" />}
              {item.label}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
