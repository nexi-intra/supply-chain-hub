import { useEffect, useMemo, useState } from 'react'
import { Copy } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { NativeSelect, Tabs } from '@/components/warehouse/ui'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatMoney, formatNumber, kindLabel, stockLabel } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { Kind, ResultRow, SerialListItem, StockType } from '@/types/warehouse'
import type { PanelProps } from './CountView'
import { t } from '@/lib/warehouse/text'

const KINDS: Kind[] = ['new', 'used', 'accessory', 'other']
const STOCK_TYPES: StockType[] = ['unrestricted', 'blocked']
type SerialKind = 'missing' | 'extra' | 'duplicates'

export function OverviewPanel({ id, open, state }: PanelProps) {
  const [kind, setKind] = useState<Kind | ''>('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [onlyBlocked, setOnlyBlocked] = useState(false)
  const [query, setQuery] = useState('')
  const needle = query.trim().toUpperCase()
  const rows = useMemo(() => state.rows.filter(row => {
    if (kind && row.kind !== kind) return false
    if (onlyDiff && row.diff === 0) return false
    if (onlyBlocked && row.stockType !== 'blocked') return false
    if (needle && !row.material.includes(needle) && !row.description.toUpperCase().includes(needle) && row.sloc !== needle) return false
    return true
  }), [state.rows, kind, onlyDiff, onlyBlocked, needle])

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {KINDS.filter(item => state.totals[item]).map(item => (
          <Card key={item}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{kindLabel(item)}</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="text-left font-normal" /><th className="text-right font-normal">SAP</th><th className="text-right font-normal">{t('Talt', 'Counted')}</th><th className="text-right font-normal">Diff.</th><th className="text-right font-normal">{t('Værdi', 'Value')}</th></tr>
                </thead>
                <tbody>
                  {STOCK_TYPES.map(stockType => {
                    const bucket = state.totals[item]?.[stockType]
                    if (!bucket) return null
                    return (
                      <tr key={stockType}>
                        <td className="py-1">{stockLabel(stockType)}</td>
                        <td className="py-1 text-right tabular-nums">{formatNumber(bucket.sapQty)}</td>
                        <td className="py-1 text-right tabular-nums">{formatNumber(bucket.counted)}</td>
                        <td className={cn('py-1 text-right font-semibold tabular-nums', bucket.diff < 0 && 'text-red-600 dark:text-red-400', bucket.diff > 0 && 'text-amber-600 dark:text-amber-400')}>{formatNumber(bucket.diff)}</td>
                        <td className="py-1 text-right tabular-nums">{formatMoney(bucket.valueDiff)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('Materialer', 'Materials')} ({formatNumber(rows.length)})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <NativeSelect value={kind} onChange={event => setKind(event.target.value as Kind | '')} aria-label={t('Gruppe', 'Group')}>
              <option value="">{t('Alle grupper', 'All groups')}</option>
              {KINDS.map(item => <option key={item} value={item}>{kindLabel(item)}</option>)}
            </NativeSelect>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyDiff} onCheckedChange={value => setOnlyDiff(value === true)} /> {t('Kun differencer', 'Only differences')}</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyBlocked} onCheckedChange={value => setOnlyBlocked(value === true)} /> {t('Vis kun blocked', 'Show only blocked')}</label>
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Søg materiale, tekst eller sloc', 'Search material, text or sloc')} className="max-w-xs" />
          </div>
          <div className="max-h-[560px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                  <th className="px-3 py-2">{t('Gruppe', 'Group')}</th>
                  <th className="px-3 py-2">Sloc</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">SAP</th>
                  <th className="px-3 py-2 text-right">{t('Talt', 'Counted')}</th>
                  <th className="px-3 py-2 text-right">Diff.</th>
                  <th className="px-3 py-2 text-right">{t('Værdi diff.', 'Value diff.')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 600).map(row => (
                  <tr key={`${row.material}|${row.sloc}|${row.stockType}`} className="border-t">
                    <td className="px-3 py-1.5"><div className="font-mono">{row.material}</div><div className="max-w-80 truncate text-xs text-muted-foreground">{row.description}</div></td>
                    <td className="px-3 py-1.5 text-xs">{kindLabel(row.kind)}</td>
                    <td className="px-3 py-1.5 font-mono">{row.sloc}</td>
                    <td className="px-3 py-1.5">{row.stockType === 'blocked' && <Badge className="bg-orange-500 text-white">Blocked</Badge>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.sapQty)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.counted)}</td>
                    <td className={cn('px-3 py-1.5 text-right font-semibold tabular-nums', row.diff < 0 && 'text-red-600 dark:text-red-400', row.diff > 0 && 'text-amber-600 dark:text-amber-400')}>{formatNumber(row.diff)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(row.valueDiff)}</td>
                    <td className="space-x-1 px-3 py-1.5 text-right">
                      {row.misplaced && <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">{t('Flyt', 'Move')} → {row.suggestions[0] || '?'}</Badge>}
                      {row.frozenAt !== undefined && <FrozenBadge row={row} />}
                      {row.sapMismatch && <SapMismatchBadge sapQty={row.sapQty} sapSerials={row.sapSerials} sloc={row.sloc} />}
                      {row.serialManaged && row.countedSerials > 0 && <CopySerialsButton id={id} row={row} long={Boolean(open.serialRules?.[row.material]?.[row.stockType])} />}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">{t('Ingen linjer matcher.', 'No lines match.')}</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length > 600 && <p className="text-xs text-muted-foreground">{t(`Viser 600 af ${formatNumber(rows.length)}.`, `Showing 600 of ${formatNumber(rows.length)}.`)}</p>}
        </CardContent>
      </Card>

      <SerialLists id={id} counts={{ missing: state.serials.missing, extra: state.serials.extra, duplicates: state.duplicates.length }} version={`${state.serials.found}-${state.serials.extra}`} />
    </div>
  )
}

export function CopySerialsButton({ id, row, long }: { id: string; row: Pick<ResultRow, 'material' | 'sloc' | 'stockType'>; long: boolean }) {
  const [copying, setCopying] = useState(false)
  const label = t(`Kopiér ${long ? 'lange ' : ''}serienumre for ${row.material} ${row.sloc}${row.stockType === 'blocked' ? ' blocked' : ''}`, `Copy ${long ? 'long ' : ''}serial numbers for ${row.material} ${row.sloc}${row.stockType === 'blocked' ? ' blocked' : ''}`)
  const copy = async () => {
    setCopying(true)
    try {
      const result = await window.electronWarehouse!.counts.copySerials({ id, material: row.material, sloc: row.sloc, stockType: row.stockType })
      if (!result.total) { toast.info(t('Ingen fundne serienumre at kopiere', 'No found serial numbers to copy')); return }
      const what = result.long ? (result.total === 1 ? t('langt serienummer', 'long serial number') : t('lange serienumre', 'long serial numbers')) : (result.total === 1 ? t('serienummer', 'serial number') : t('serienumre', 'serial numbers'))
      toast.success(t(`${formatNumber(result.total)} ${what} kopieret`, `${formatNumber(result.total)} ${what} copied`), { description: t(`${row.material} · ${row.sloc}${row.stockType === 'blocked' ? ' · Blocked' : ''} – klar til at sætte ind i SAP.`, `${row.material} · ${row.sloc}${row.stockType === 'blocked' ? ' · Blocked' : ''} – ready to paste into SAP.`) })
      if (result.withoutLongTotal > 0) {
        const shown = result.withoutLong.slice(0, 10).join(', ')
        toast.warning(t(`${formatNumber(result.withoutLongTotal)} uden langt nummer i SAP – kopieret med det korte`, `${formatNumber(result.withoutLongTotal)} without a long number in SAP – copied with the short one`), { description: `${shown}${result.withoutLongTotal > 10 ? t(` og ${formatNumber(result.withoutLongTotal - 10)} mere`, ` and ${formatNumber(result.withoutLongTotal - 10)} more`) : ''}`, duration: 8000 })
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setCopying(false)
    }
  }
  if (long) {
    return <SapActionButton size="sm" variant="outline" className="h-7 px-2 text-xs" aria-label={label} title={label} onAction={copy}><Copy size={14} /> {t('Lange', 'Long')}</SapActionButton>
  }
  return <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-label={label} title={label} loading={copying} onClick={() => void copy()}><Copy size={14} /> {t('Kopiér', 'Copy')}</Button>
}

function FrozenBadge({ row }: { row: ResultRow }) {
  const after = row.countedAfter || 0
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="cursor-help border-emerald-500 text-emerald-700 dark:text-emerald-300">
          {t('Godkendt', 'Approved')}{after !== 0 && t(` · ${after > 0 ? '+' : ''}${formatNumber(after)} efter godkendelse`, ` · ${after > 0 ? '+' : ''}${formatNumber(after)} after approval`)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        {t(`SAP, talt og difference er låst fra godkendelsen ${formatDateTime(row.frozenAt!)}, så nye SAP-tal ikke ændrer dem.`, `SAP, counted and difference are locked from the approval ${formatDateTime(row.frozenAt!)}, so new SAP figures do not change them.`)}
        {after !== 0 && t(` Der er talt ${formatNumber(after)} stk. efter godkendelsen – de indgår ikke i differencen. Nulstil godkendelsen for at bruge de nye tal.`, ` ${formatNumber(after)} pcs were counted after the approval – they are not in the difference. Reset the approval to use the new figures.`)}
      </TooltipContent>
    </Tooltip>
  )
}

function SapMismatchBadge({ sapQty, sapSerials, sloc }: { sapQty: number; sapSerials: number; sloc: string }) {
  const fewer = sapSerials < sapQty
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="cursor-help border-amber-500 text-amber-700 dark:text-amber-300">
          {t(`SAP-fejl: ${formatNumber(sapQty)} på lager, ${formatNumber(sapSerials)} serienr.`, `SAP error: ${formatNumber(sapQty)} in stock, ${formatNumber(sapSerials)} serials`)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        {fewer
          ? t(`Lagerbeholdningen (MB52) siger ${formatNumber(sapQty)} stk. i ${sloc}, men SAP har kun ${formatNumber(sapSerials)} serienumre registreret der. De sidste ${formatNumber(sapQty - sapSerials)} har typisk deres serienummer registreret på en anden storage location: når de scannes, vises "Anden storage location", og de kommer på flyttelisten. Differencen forsvinder først, når serienummeret rettes i SAP.`, `The stock (MB52) says ${formatNumber(sapQty)} pcs in ${sloc}, but SAP only has ${formatNumber(sapSerials)} serial numbers registered there. The other ${formatNumber(sapQty - sapSerials)} usually have their serial number registered on another storage location: when scanned, "Other storage location" is shown and they go on the move list. The difference only disappears when the serial number is corrected in SAP.`)
          : t(`SAP har ${formatNumber(sapSerials)} serienumre registreret i ${sloc}, men lagerbeholdningen (MB52) siger kun ${formatNumber(sapQty)} stk. Nogle serienumre står forkert i SAP og bør rettes.`, `SAP has ${formatNumber(sapSerials)} serial numbers registered in ${sloc}, but the stock (MB52) only says ${formatNumber(sapQty)} pcs. Some serial numbers are wrong in SAP and should be corrected.`)}
      </TooltipContent>
    </Tooltip>
  )
}

function SerialLists({ id, counts, version }: { id: string; counts: Record<SerialKind, number>; version: string }) {
  const [kind, setKind] = useState<SerialKind>('missing')
  const [query, setQuery] = useState('')
  const [onlyBlocked, setOnlyBlocked] = useState(false)
  const [result, setResult] = useState<{ total: number; items: SerialListItem[] } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      window.electronWarehouse!.counts.serials({ id, kind, query, limit: 2000 })
        .then(value => { if (!cancelled) { setResult(value); setFailed(null) } })
        .catch(error => { if (!cancelled) setFailed(errorMessage(error)) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [id, kind, query, version])

  const items = (result?.items || []).filter(item => !onlyBlocked || item.stockType === 'blocked')

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t('Serienumre', 'Serial numbers')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Tabs<SerialKind>
          value={kind}
          onChange={setKind}
          items={[
            { value: 'missing', label: t('Mangler', 'Missing'), badge: <Badge variant="secondary" className="tabular-nums">{formatNumber(counts.missing)}</Badge> },
            { value: 'extra', label: t('Ekstra / ukendte', 'Extra / unknown'), badge: <Badge variant="secondary" className="tabular-nums">{formatNumber(counts.extra)}</Badge> },
            { value: 'duplicates', label: t('Dubletter', 'Duplicates'), badge: <Badge variant="secondary" className="tabular-nums">{formatNumber(counts.duplicates)}</Badge> },
          ]}
        />
        <div className="flex flex-wrap items-center gap-4">
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Søg serienummer, materiale eller sloc', 'Search serial number, material or sloc')} className="max-w-xs" />
          {kind === 'missing' && <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyBlocked} onCheckedChange={value => setOnlyBlocked(value === true)} /> {t('Vis kun blocked', 'Show only blocked')}</label>}
          {result && <span className="text-xs text-muted-foreground">{t(`${formatNumber(result.total)} i alt`, `${formatNumber(result.total)} in total`)}{result.total > result.items.length ? t(` · viser ${formatNumber(result.items.length)}`, ` · showing ${formatNumber(result.items.length)}`) : ''}</span>}
        </div>
        {failed && <p className="text-sm text-destructive">{failed}</p>}
        <div className="max-h-96 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('Serienummer', 'Serial number')}</th>
                <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                <th className="px-3 py-2">SAP sloc</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">{kind === 'missing' ? '' : t('Fundet', 'Found')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.serial}-${index}`} className="border-t">
                  <td className="px-3 py-1.5 font-mono">{item.serial}</td>
                  <td className="px-3 py-1.5"><span className="font-mono">{item.material || '–'}</span> {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}</td>
                  <td className="px-3 py-1.5 font-mono">{item.sloc || '–'}</td>
                  <td className="px-3 py-1.5">{stockLabel(item.stockType)}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{kind === 'missing' ? '' : `${item.place || ''} · ${item.byName || ''} · ${formatDateTime(item.at)}`}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">{t('Ingen.', 'None.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
