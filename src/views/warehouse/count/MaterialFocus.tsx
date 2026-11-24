import { useEffect, useMemo, useState } from 'react'
import { CircleNotch, MagnifyingGlass, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { NativeSelect, Tabs } from '@/components/warehouse/ui'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatNumber, kindLabel, stockLabel } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { CountState, MaterialSerialItem, MaterialSerials } from '@/types/warehouse'
import { isApproved, isSubmitted, lockOf, mayCount } from './MaterialWork'
import { FoundElsewhereNote } from './FoundElsewhere'
import { RemoveSerialButton } from './RemoveSerial'
import { t } from '@/lib/warehouse/text'

type ListKind = 'missing' | 'found' | 'elsewhere'

export interface FocusOption {
  material: string
  description: string
  found: number
  expected: number
}

/** Serial-managed materials in the count that are not approved yet, with how many of their serials are found. */
export function focusOptions(state: CountState): FocusOption[] {
  const byMaterial = new Map<string, FocusOption>()
  for (const row of state.rows) {
    if (!row.serialManaged || row.sapSerials === 0 || isApproved(state, row.material)) continue
    const option = byMaterial.get(row.material) || { material: row.material, description: row.description, found: 0, expected: 0 }
    option.found += Math.min(row.countedSerials, row.sapSerials)
    option.expected += row.sapSerials
    byMaterial.set(row.material, option)
  }
  return [...byMaterial.values()].sort((a, b) => a.material.localeCompare(b.material))
}

interface MaterialFocusProps {
  id: string
  state: CountState
  material: string
  onMaterialChange: (material: string) => void
  /** The chosen material is being taken for the user (a write to M:, can take many seconds). */
  taking?: boolean
  reloadKey: string
  lastSerial: string | null
  refresh: () => Promise<void>
}

export function MaterialFocus({ id, state, material, onMaterialChange, taking = false, reloadKey, lastSerial, refresh }: MaterialFocusProps) {
  const options = useMemo(() => focusOptions(state), [state])
  const [list, setList] = useState<ListKind>('missing')
  const [query, setQuery] = useState('')
  const [sloc, setSloc] = useState('')
  const [data, setData] = useState<MaterialSerials | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => { setQuery(''); setSloc(''); setList('missing'); setData(null) }, [material])

  useEffect(() => {
    if (!material) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      window.electronWarehouse!.counts.materialSerials({ id, material, query, limit: 2000 })
        .then(value => { if (!cancelled) { setData(value); setFailed(null) } })
        .catch(error => { if (!cancelled) setFailed(errorMessage(error)) })
    }, 200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [id, material, query, reloadKey])

  const selected = options.find(option => option.material === material)
  const items = (data ? data[list] : []).filter(item => !sloc || item.sloc === sloc)
  const slocs = data ? [...new Set([...data.found, ...data.missing].map(item => item.sloc).filter((value): value is string => Boolean(value)))].sort() : []
  const totals = data?.totals

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('Materiale i fokus', 'Material in focus')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect value={material} onChange={event => onMaterialChange(event.target.value)} className="min-w-0 flex-1" aria-label={t('Vælg materiale', 'Choose material')}>
            <option value="">{t('Vælg et materiale for at se alle dets serienumre …', 'Choose a material to see all its serial numbers …')}</option>
            {options.map(option => {
              const lock = lockOf(state, option.material)
              const taken = !mayCount(lock, state.me.email)
              return (
                <option key={option.material} value={option.material} disabled={taken}>
                  {option.material} – {option.description} ({formatNumber(option.found)}/{formatNumber(option.expected)}){taken ? t(` – tælles af ${lock!.holder.name}`, ` – counted by ${lock!.holder.name}`) : ''}{isSubmitted(state, option.material) ? t(' – sendt til godkendelse', ' – sent for approval') : ''}
                </option>
              )
            })}
          </NativeSelect>
          {material && <Button variant="ghost" size="icon" onClick={() => onMaterialChange('')} aria-label={t('Fjern materiale', 'Clear material')}><X size={18} /></Button>}
        </div>
        {taking && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleNotch size={16} className="animate-spin" /> {t(`Tager ${material} for dig – det fælles drev er langsomt, men du kan godt scanne imens …`, `Taking ${material} for you – the shared drive is slow, but you can scan meanwhile …`)}
          </p>
        )}
        {state.materialLocks.some(lock => !mayCount(lock, state.me.email) && options.some(option => option.material === lock.material)) && (
          <p className="text-xs text-muted-foreground">{t('Materialer, som andre tæller, kan ikke vælges. Anmod om at tælle med under "Materialer i gang".', 'Materials that others are counting cannot be chosen. Ask to help under "Materials in progress".')}</p>
        )}

        {material && (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{data?.description || selected?.description || material}</p>
                  <p className="font-mono text-sm text-muted-foreground">{material}{data ? ` · ${kindLabel(data.kind)}` : ''}</p>
                  {isSubmitted(state, material) && <Badge variant="secondary" className="mt-1">{t('Sendt til godkendelse', 'Sent for approval')}</Badge>}
                </div>
                {data && totals && (
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold">{formatNumber(totals.found)}</span> {t(`af ${formatNumber(data.expected)} fundet · ${formatNumber(totals.missing)} mangler`, `of ${formatNumber(data.expected)} found · ${formatNumber(totals.missing)} missing`)}
                  </p>
                )}
              </div>
              {data && totals && <Progress value={data.expected ? (totals.found / data.expected) * 100 : 0} />}
            </div>

            {failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}

            <Tabs<ListKind>
              value={list}
              onChange={setList}
              items={[
                { value: 'missing', label: t('Mangler', 'Missing'), badge: <Badge variant="secondary" className="tabular-nums">{formatNumber(totals?.missing ?? 0)}</Badge> },
                { value: 'found', label: t('Fundet', 'Found'), badge: <Badge variant="secondary" className="tabular-nums">{formatNumber(totals?.found ?? 0)}</Badge> },
                { value: 'elsewhere', label: t('Fundet uden for optællingen', 'Found outside the count'), hidden: !totals?.elsewhere, badge: <Badge variant="outline" className="tabular-nums">{formatNumber(totals?.elsewhere ?? 0)}</Badge> },
              ]}
            />

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative max-w-xs flex-1">
                <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Søg serienummer eller placering', 'Search serial number or location')} className="pl-9" />
              </div>
              {slocs.length > 1 && (
                <NativeSelect value={sloc} onChange={event => setSloc(event.target.value)} aria-label="Storage location">
                  <option value="">{t('Alle storage locations', 'All storage locations')}</option>
                  {slocs.map(item => <option key={item} value={item}>{item}</option>)}
                </NativeSelect>
              )}
            </div>

            <SerialTable kind={list} items={items} lastSerial={lastSerial} remove={state.me.canWrite && mayCount(lockOf(state, material), state.me.email) ? { id, refresh } : null} />
            {data && data[list].length >= 2000 && <p className="text-xs text-muted-foreground">{t('Viser de første 2.000 – brug søgning for at finde resten.', 'Showing the first 2,000 – use search to find the rest.')}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SerialTable({ kind, items, lastSerial, remove }: { kind: ListKind; items: MaterialSerialItem[]; lastSerial: string | null; remove: { id: string; refresh: () => Promise<void> } | null }) {
  const showWhere = kind !== 'missing'
  const canRemove = showWhere && remove !== null
  return (
    <div className="max-h-96 overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t('Serienummer', 'Serial number')}</th>
            <th className="px-3 py-2">Sloc (SAP)</th>
            <th className="px-3 py-2">Type</th>
            {showWhere && <th className="px-3 py-2">{t('Fundet på', 'Found in')}</th>}
            {showWhere && <th className="px-3 py-2">{t('Af', 'By')}</th>}
            {showWhere && <th className="px-3 py-2">{t('Tidspunkt', 'Time')}</th>}
            {canRemove && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.serial} className={cn('border-t', item.serial === lastSerial && 'bg-emerald-500/10')}>
              <td className="px-3 py-1.5"><span className="font-mono">{item.serial}</span>{kind === 'missing' && item.foundElsewhere && <FoundElsewhereNote item={item.foundElsewhere} className="block" />}</td>
              <td className="px-3 py-1.5 font-mono">{item.sloc || '–'}</td>
              <td className="px-3 py-1.5">{item.stockType === 'blocked' ? <Badge className="bg-orange-500 text-white">Blocked</Badge> : stockLabel(item.stockType)}</td>
              {showWhere && <td className="px-3 py-1.5">{item.place || '–'}{item.source === 'import' && <span className="ml-1 text-xs text-muted-foreground">({item.document ? t(`matdok ${item.document}`, `mat. doc. ${item.document}`) : 'import'})</span>}</td>}
              {showWhere && <td className="px-3 py-1.5">{item.byName || '–'}</td>}
              {showWhere && <td className="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">{formatDateTime(item.at)}</td>}
              {canRemove && <td className="px-1 py-0.5 text-right"><RemoveSerialButton id={remove!.id} serial={item.serial} refresh={remove!.refresh} /></td>}
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={showWhere ? (canRemove ? 7 : 6) : 3} className="px-3 py-6 text-center text-muted-foreground">{kind === 'missing' ? t('Ingen mangler – alle er fundet.', 'None missing – all are found.') : t('Ingen endnu.', 'None yet.')}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
