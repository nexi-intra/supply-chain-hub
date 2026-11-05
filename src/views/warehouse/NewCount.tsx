import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle, CircleNotch, DownloadSimple, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/warehouse/ui'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { errorMessage } from '@/lib/warehouse/errors'
import { fetchSteps, formatMoney, formatNumber, kindLabel, stockLabel } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { WarehouseUser, CountPreview, FetchStep, Kind, StockType, TakenScope } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'

interface NewCountProps {
  user: WarehouseUser
  onCancel: () => void
  onCreated: (id: string) => void
}

type StockChoice = StockType
type Group = 'terminals' | 'accessories'

const BLOCKED_SLOC = 'D000'
const STOCK_CHOICES: { value: StockChoice; label: string }[] = [
  { value: 'unrestricted', label: 'Unblocked' },
  { value: 'blocked', label: 'Blocked' },
]
const GROUPS: { value: Group; label: [string, string]; kinds: Kind[] }[] = [
  { value: 'terminals', label: ['Terminaler', 'Terminals'], kinds: ['new', 'used'] },
  { value: 'accessories', label: ['Tilbehør', 'Accessories'], kinds: ['accessory'] },
]

function takenBy(taken: TakenScope[], sloc: string, stockType: StockType, kinds: Kind[]) {
  return taken.find(item => item.type === 'slocs' && item.slocs.includes(sloc) && item.stockTypes.includes(stockType) && (item.kinds ?? ['new', 'used', 'accessory']).some(kind => kinds.includes(kind))) || null
}

function parseExclusions(text: string): { material: string; reason: string }[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [material, ...rest] = line.split(/[;\t]|\s+-\s+/)
    return { material: material.trim().toUpperCase(), reason: rest.join(' ').trim() }
  })
}

function defaultName(slocs: string[], choice: StockChoice, group: Group) {
  const date = new Date()
  const stamp = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
  const what = group === 'accessories' ? t(' tilbehør', ' accessories') : t(' terminaler', ' terminals')
  const type = choice === 'blocked' ? ' blocked' : ''
  return `${slocs.join(' ')}${what}${type} ${stamp}`.replace(/\s+/g, ' ').trim().slice(0, 80)
}

export function NewCount({ user, onCancel, onCreated }: NewCountProps) {
  const [stockChoice, setStockChoice] = useState<StockChoice>('unrestricted')
  const [group, setGroup] = useState<Group>('terminals')
  const [taken, setTaken] = useState<TakenScope[]>([])
  const [slocs, setSlocs] = useState<string[]>([])
  const [exclusionsText, setExclusionsText] = useState('')
  const [step, setStep] = useState<FetchStep | null>(null)
  const [fetching, setFetching] = useState(false)
  const [preview, setPreview] = useState<CountPreview | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const types: StockType[] = [stockChoice]
  const kinds = GROUPS.find(item => item.value === group)!.kinds
  const onlyD000 = stockChoice === 'blocked' || group === 'accessories'
  const allowed = (sloc: string) => !onlyD000 || sloc === BLOCKED_SLOC
  const hasD000 = user.storageLocations.includes(BLOCKED_SLOC)
  const choices = STOCK_CHOICES.filter(choice => choice.value !== 'blocked' || hasD000)
  const groups = GROUPS.filter(item => item.value !== 'accessories' || hasD000)
  const slocTaken = (sloc: string) => types.flatMap(type => {
    const item = takenBy(taken, sloc, type, kinds)
    return item ? [{ type, item }] : []
  })
  const conflicts = slocs.filter(sloc => slocTaken(sloc).length > 0)
  const ready = slocs.length > 0 && conflicts.length === 0

  useEffect(() => window.electronWarehouse!.sap.onFetchProgress(progress => setStep(progress.step)), [])
  useEffect(() => {
    window.electronWarehouse!.statuses.overview().then(overview => setTaken(overview.active?.taken ?? [])).catch(() => setTaken([]))
  }, [])

  const toggleSloc = (sloc: string, on: boolean) => setSlocs(current => (on ? [...current, sloc] : current.filter(item => item !== sloc)))

  const fetchPreview = async () => {
    setFetching(true)
    setStep('check')
    setPreview(null)
    try {
      const scope = { type: 'slocs' as const, slocs, stockTypes: types, kinds }
      const result = await window.electronWarehouse!.counts.preview({ scope, exclusions: parseExclusions(exclusionsText) })
      setPreview(result)
      setName(defaultName(result.summary.slocs.length ? result.summary.slocs : slocs, stockChoice, group))
    } catch (error) {
      toast.error(errorMessage(error, t('Hentningen fra SAP fejlede.', 'Fetching from SAP failed.')))
    } finally {
      setFetching(false)
      setStep(null)
    }
  }

  const create = async () => {
    if (!preview) return
    setCreating(true)
    try {
      const meta = await window.electronWarehouse!.counts.create({ token: preview.token, name })
      toast.success(t(`Optællingen "${meta.name}" er oprettet`, `The count "${meta.name}" is created`))
      onCreated(meta.id)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label={t('Tilbage', 'Back')}><ArrowLeft size={20} /></Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('Ny optælling', 'New count')}</h1>
          <p className="text-sm text-muted-foreground">Team {user.team} · Plant D301 · {t('data hentes fra SAP (kun læsning)', 'data is fetched from SAP (read only)')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('1. Hvad skal tælles?', '1. What is counted?')}</CardTitle>
          <CardDescription>{t('Alt INT- og R-materiale med lager hentes – også det, der står forkert, så det kan findes og flyttes.', 'All INT and R material with stock is fetched – also what is in the wrong place, so it can be found and moved.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p id="group-label" className="text-sm font-medium">{t('Hvad tælles', 'What is counted')}</p>
            <div className="inline-flex rounded-lg border p-1" role="radiogroup" aria-labelledby="group-label">
              {groups.map(item => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={group === item.value}
                  disabled={fetching}
                  onClick={() => { setGroup(item.value); setPreview(null); if (item.value === 'accessories') setSlocs(current => current.filter(sloc => sloc === BLOCKED_SLOC)) }}
                  className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition', group === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t(...item.label)}
                </button>
              ))}
            </div>
            {group === 'accessories' && <p className="text-xs text-muted-foreground">{t(`Tilbehør hører kun til på ${BLOCKED_SLOC}. Tilbehør på andre storage locations vises som fejl i forhåndsvisningen.`, `Accessories only belong on ${BLOCKED_SLOC}. Accessories on other storage locations are shown as errors in the preview.`)}</p>}
          </div>

          <div className="space-y-2">
            <p id="stock-choice-label" className="text-sm font-medium">{t('Lagertype', 'Stock type')}</p>
            <div className="inline-flex rounded-lg border p-1" role="radiogroup" aria-labelledby="stock-choice-label">
              {choices.map(choice => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={stockChoice === choice.value}
                  disabled={fetching}
                  onClick={() => { setStockChoice(choice.value); setPreview(null); if (choice.value === 'blocked') setSlocs(current => current.filter(sloc => sloc === BLOCKED_SLOC)) }}
                  className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition', stockChoice === choice.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t(`Blocked lager findes kun på ${BLOCKED_SLOC} og tælles i sin egen optælling, fordi det bogføres for sig i SAP.`, `Blocked stock only exists on ${BLOCKED_SLOC} and is counted in its own count, because it is posted separately in SAP.`)}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Storage locations</p>
            <div className="flex flex-wrap gap-2">
                {user.storageLocations.map(sloc => {
                  const owners = slocTaken(sloc)
                  const blocked = owners.length === types.length || !allowed(sloc)
                  const selected = slocs.includes(sloc)
                  return (
                    <label key={sloc} title={owners.length ? owners.map(({ type, item }) => t(`${stockLabel(type)}: tælles i "${item.name}" af ${item.ownerName}`, `${stockLabel(type)}: counted in "${item.name}" by ${item.ownerName}`)).join('\n') : undefined} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-sm transition', blocked && !selected ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', selected && (owners.length ? 'border-destructive bg-destructive/5' : 'border-primary bg-primary/5'))}>
                      <Checkbox checked={selected} onCheckedChange={value => toggleSloc(sloc, value === true)} disabled={fetching || (blocked && !selected)} />
                      <span>{sloc}{owners.length > 0 && <>{' '}<span className="ml-1 font-sans text-xs text-muted-foreground">{t(`tælles i "${owners[0].item.name}"`, `counted in "${owners[0].item.name}"`)}</span></>}</span>
                    </label>
                  )
                })}
              </div>
              {conflicts.length > 0 && (
                <p role="alert" className="text-sm text-destructive">
                  {t(`${conflicts.join(', ')} tælles allerede med den lagertype i en anden optælling. Fravælg ${conflicts.length === 1 ? 'den' : 'dem'} eller vælg en anden lagertype.`, `${conflicts.join(', ')} ${conflicts.length === 1 ? 'is' : 'are'} already counted with that stock type in another count. Deselect ${conflicts.length === 1 ? 'it' : 'them'} or choose another stock type.`)}
                </p>
              )}
              <Button variant="link" size="sm" className="px-0" disabled={fetching} onClick={() => setSlocs(slocs.length ? [] : user.storageLocations.filter(sloc => allowed(sloc) && slocTaken(sloc).length === 0))}>
                {slocs.length ? t('Fravælg alle', 'Deselect all') : t('Vælg alle ledige', 'Select all free')}
              </Button>
          </div>

          <details className="rounded-lg border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">{t('Udelad materialer (valgfrit)', 'Leave out materials (optional)')}</summary>
            <div className="mt-3 space-y-2">
              <Label htmlFor="exclusions">{t('Ét materiale pr. linje, evt. med begrundelse efter semikolon', 'One material per line, optionally with a reason after a semicolon')}</Label>
              <Textarea id="exclusions" value={exclusionsText} onChange={event => setExclusionsText(event.target.value)} placeholder={t('R162-0717; tælles ikke på tilbehør', 'R162-0717; not counted with accessories')} className="font-mono" disabled={fetching} />
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <SapActionButton onAction={fetchPreview} disabled={!ready || fetching}>
              <DownloadSimple size={18} weight="bold" />
              {preview ? t('Hent igen fra SAP', 'Fetch again from SAP') : t('Hent fra SAP', 'Fetch from SAP')}
            </SapActionButton>
            {fetching && <FetchProgress step={step} />}
          </div>

          {taken.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <p className="font-medium">{t('Allerede i statussen', 'Already in the status')}</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {taken.map(item => (
                  <li key={item.countId}>
                    <span className="font-medium text-foreground">{item.name}</span>: {item.type === 'slocs' ? item.slocs.join(', ') : t(`materialer ${item.materials.slice(0, 3).join(', ')}${item.materials.length > 3 ? ` +${item.materials.length - 3}` : ''}`, `materials ${item.materials.slice(0, 3).join(', ')}${item.materials.length > 3 ? ` +${item.materials.length - 3}` : ''}`)} · {item.stockTypes.map(type => stockLabel(type).toLowerCase()).join(t(' og ', ' and '))} · {item.ownerName}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && <PreviewCard preview={preview} team={user.team} />}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>{t('3. Navngiv og opret', '3. Name and create')}</CardTitle>
            <CardDescription>{t(`Du bliver ansvarlig for optællingen. Kolleger i ${user.team} kan anmode om at deltage.`, `You become responsible for the count. Colleagues in ${user.team} can ask to join.`)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-72 flex-1 space-y-2">
              <Label htmlFor="count-name">{t('Navn', 'Name')}</Label>
              <Input id="count-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
            </div>
            <Button onClick={() => void create()} loading={creating} disabled={!name.trim()}>
              <CheckCircle size={18} weight="bold" />
              {t('Opret optælling', 'Create count')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FetchProgress({ step }: { step: FetchStep | null }) {
  const currentIndex = fetchSteps().findIndex(item => item.step === step)
  return (
    <div className="space-y-1">
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-live="polite">
        {fetchSteps().map((item, index) => (
          <li key={item.step} className={cn('inline-flex items-center gap-1.5', index < currentIndex ? 'text-foreground' : index === currentIndex ? 'font-semibold text-primary' : 'text-muted-foreground')}>
            {index < currentIndex ? <CheckCircle size={14} weight="fill" /> : index === currentIndex ? <CircleNotch size={14} className="animate-spin" /> : <span className="size-3.5 rounded-full border" />}
            {item.label}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{t('Hele D301 hentes altid – også blocked serienumre – så et serienummer, der scannes i den forkerte optælling, kan genkendes og henvises til den rigtige. Optællingen indeholder kun det, du har valgt.', 'All of D301 is always fetched – also blocked serial numbers – so a serial number scanned in the wrong count can be recognised and pointed to the right one. The count only contains what you chose.')}</p>
    </div>
  )
}

function PreviewCard({ preview, team }: { preview: CountPreview; team: string }) {
  const { summary } = preview
  const groups = (['new', 'used', 'accessory'] as const).filter(kind => summary.groups[kind].lines > 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('2. Forhåndsvisning fra SAP', '2. Preview from SAP')}</CardTitle>
        <CardDescription>Storage locations: {summary.slocs.join(', ')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('Gruppe', 'Group')}</th>
                <th className="px-3 py-2 text-right">{t('Materialer', 'Materials')}</th>
                <th className="px-3 py-2 text-right">Unblocked</th>
                <th className="px-3 py-2 text-right">Blocked</th>
                <th className="px-3 py-2 text-right">{t('Serienumre', 'Serial numbers')}</th>
                <th className="px-3 py-2 text-right">{t('Værdi', 'Value')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">{t('SAP har intet INT/R-lager i udvalget.', 'SAP has no INT/R stock in the selection.')}</td></tr>}
              {groups.map(kind => {
                const group = summary.groups[kind]
                return (
                  <tr key={kind} className="border-t">
                    <td className="px-3 py-2 font-medium">{kindLabel(kind)}{team === 'TRR' && kind !== 'used' && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">{t('(uventet for TRR)', '(unexpected for TRR)')}</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.materials)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.unrestricted)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.blocked)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.serials)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(group.value)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {preview.accessoryOutside?.length > 0 && (
          <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-destructive"><Warning size={18} weight="fill" /> {t('Fejl: tilbehør uden for D000', 'Error: accessories outside D000')}</p>
            <ul className="mt-1 space-y-0.5">
              {preview.accessoryOutside.map(item => <li key={item.sloc}><span className="font-mono">{item.sloc}</span>: {t(`${formatNumber(item.quantity)} stk. fordelt på ${formatNumber(item.materials)} ${item.materials === 1 ? 'materiale' : 'materialer'}`, `${formatNumber(item.quantity)} pcs across ${formatNumber(item.materials)} ${item.materials === 1 ? 'material' : 'materials'}`)}</li>)}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">{t('Tilbehør hører kun til på D000 og tælles ikke med her. Det skal flyttes eller rettes i SAP.', 'Accessories only belong on D000 and are not counted here. They must be moved or corrected in SAP.')}</p>
          </div>
        )}

        {summary.misplaced.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <Warning size={18} weight="fill" /> {t(`${summary.misplaced.length} ${summary.misplaced.length === 1 ? 'linje står' : 'linjer står'} på en storage location, hvor de ikke hører til`, `${summary.misplaced.length} ${summary.misplaced.length === 1 ? 'line is' : 'lines are'} on a storage location where they do not belong`)}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {summary.misplaced.slice(0, 8).map(item => (
                <li key={`${item.material}-${item.sloc}`} className="flex flex-wrap gap-x-2">
                  <span className="font-mono">{item.material}</span>
                  <span className="text-muted-foreground">{item.description}</span>
                  <span>· {t(`${formatNumber(item.unrestricted + item.blocked)} stk. i ${item.sloc}`, `${formatNumber(item.unrestricted + item.blocked)} pcs in ${item.sloc}`)}</span>
                  {item.suggestions.length > 0 && <span className="text-muted-foreground">→ {item.suggestions.join(' / ')}</span>}
                </li>
              ))}
              {summary.misplaced.length > 8 && <li className="text-muted-foreground">{t(`… og ${summary.misplaced.length - 8} mere`, `… and ${summary.misplaced.length - 8} more`)}</li>}
            </ul>
          </div>
        )}

        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>{t(`${formatNumber(summary.excluded.other.materials)} andre materialer (fx emballage, ${formatNumber(summary.excluded.other.quantity)} stk.) er udeladt.`, `${formatNumber(summary.excluded.other.materials)} other materials (e.g. packaging, ${formatNumber(summary.excluded.other.quantity)} pcs) are left out.`)}</li>
          {summary.excluded.manual.length > 0 && <li>{t('Udeladt efter ønske', 'Left out on request')}: {summary.excluded.manual.map(item => item.material).join(', ')}</li>}
          {team === 'TCD' && (preview.placementSheet
            ? <li>{t(`Placeringsark: ${preview.placementSheet.file} (${formatNumber(preview.placementSheet.placements)} placeringer) bruges som forslag til tællelister.`, `Placement sheet: ${preview.placementSheet.file} (${formatNumber(preview.placementSheet.placements)} locations) is used as suggestions for count lists.`)}</li>
            : <li className="text-amber-700 dark:text-amber-300">{t('Placeringsarket kunne ikke læses – tællelister kan laves manuelt.', 'The placement sheet could not be read – count lists can be made manually.')}</li>)}
        </ul>
      </CardContent>
    </Card>
  )
}
