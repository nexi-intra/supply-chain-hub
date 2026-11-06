import { useMemo, useState } from 'react'
import { ArrowUUpLeft, CheckCircle, Checks, Stamp } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatMoney, formatNumber, kindLabel } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { Approval, Kind } from '@/types/warehouse'
import type { PanelProps } from './CountView'
import { t } from '@/lib/warehouse/text'

interface MaterialSummary {
  material: string
  description: string
  kind: Kind
  sapQty: number
  counted: number
  diff: number
  valueDiff: number | null
  countedAfter: number
}

const statusMap = (): Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> => ({
  approved: { label: t('Godkendt', 'Approved'), variant: 'default' },
  posted: { label: t('Bogført i SAP', 'Posted in SAP'), variant: 'secondary' },
  returned: { label: t('Sendt tilbage', 'Sent back'), variant: 'destructive' },
  submitted: { label: t('Sendt til godkendelse', 'Sent for approval'), variant: 'secondary' },
  open: { label: t('Talt', 'Counted'), variant: 'outline' },
})

export function ApprovalPanel({ id, state, refresh }: PanelProps) {
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = state.me.isManager && !state.statusLocked
  const materials = useMemo(() => {
    const byMaterial = new Map<string, MaterialSummary>()
    for (const row of state.rows) {
      const entry = byMaterial.get(row.material) || { material: row.material, description: row.description, kind: row.kind, sapQty: 0, counted: 0, diff: 0, valueDiff: 0, countedAfter: 0 }
      entry.sapQty += row.sapQty
      entry.counted += row.counted
      entry.diff += row.diff
      entry.countedAfter += row.countedAfter || 0
      entry.valueDiff = row.valueDiff === null || entry.valueDiff === null ? null : Math.round((entry.valueDiff + row.valueDiff) * 100) / 100
      byMaterial.set(row.material, entry)
    }
    return [...byMaterial.values()].sort((a, b) => Number(state.approvals[b.material]?.status === 'submitted') - Number(state.approvals[a.material]?.status === 'submitted'))
  }, [state.rows, state.approvals])
  const needle = query.trim().toUpperCase()
  const visible = materials.filter(item => (!needle || item.material.includes(needle) || item.description.toUpperCase().includes(needle)) && (!onlyOpen || !['approved', 'posted'].includes(state.approvals[item.material]?.status || '')))

  const [pending, setPending] = useState<string | null>(null)
  const set = async (material: string, status: 'approved' | 'returned' | 'posted' | 'reset') => {
    if (pending) return
    let comment = ''
    if (status === 'returned') {
      comment = window.prompt(t(`Hvorfor sendes ${material} tilbage til optælling?`, `Why is ${material} sent back for counting?`)) || ''
      if (!comment.trim()) return
    }
    setPending(`${status}:${material}`)
    try {
      await window.electronWarehouse!.counts.approval({ id, material, status, comment })
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  const approveClean = async () => {
    setBusy(true)
    try {
      const result = await window.electronWarehouse!.counts.approveClean(id)
      toast.success(t(`${formatNumber(result.approved)} materialer uden difference er godkendt`, `${formatNumber(result.approved)} materials without a difference are approved`))
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Godkendelse pr. materialenummer', 'Approval per material number')}</CardTitle>
        <CardDescription>{t('Managers godkender slutresultatet og markerer, når differencen er bogført i SAP. Ved godkendelse låses SAP, talt og difference, så nye SAP-tal ikke ændrer dem. Markeringen er kun en note – Optælling bogfører intet.', 'Managers approve the final result and mark when the difference has been posted in SAP. Approval locks SAP, counted and difference, so new SAP figures do not change them. The mark is only a note – Stock count posts nothing.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Søg materiale', 'Search material')} className="max-w-xs" />
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyOpen} onCheckedChange={value => setOnlyOpen(value === true)} /> {t('Kun ikke-godkendte', 'Only not approved')}</label>
          {canEdit && <Button variant="outline" onClick={() => void approveClean()} loading={busy}><Checks size={18} /> {t('Godkend alle uden difference', 'Approve all without a difference')}</Button>}
        </div>
        <div className="max-h-[600px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                <th className="px-3 py-2">{t('Gruppe', 'Group')}</th>
                <th className="px-3 py-2 text-right">SAP</th>
                <th className="px-3 py-2 text-right">{t('Talt', 'Counted')}</th>
                <th className="px-3 py-2 text-right">Diff.</th>
                <th className="px-3 py-2 text-right">{t('Værdi diff.', 'Value diff.')}</th>
                <th className="px-3 py-2">Status</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {visible.map(item => {
                const approval: Approval | undefined = state.approvals[item.material]
                const status = statusMap()[approval?.status || 'open']
                return (
                  <tr key={item.material} className="border-t">
                    <td className="px-3 py-1.5"><div className="font-mono">{item.material}</div><div className="max-w-72 truncate text-xs text-muted-foreground">{item.description}</div></td>
                    <td className="px-3 py-1.5 text-xs">{kindLabel(item.kind)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(item.sapQty)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(item.counted)}</td>
                    <td className={cn('px-3 py-1.5 text-right font-semibold tabular-nums', item.diff < 0 && 'text-red-600 dark:text-red-400', item.diff > 0 && 'text-amber-600 dark:text-amber-400')}>{formatNumber(item.diff)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(item.valueDiff)}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {approval?.by && approval.status !== 'open' && <div className="mt-0.5 text-xs text-muted-foreground">{approval.status === 'submitted' ? t('Sendt af ', 'Sent by ') : ''}{approval.by.name} · {formatDateTime(approval.at)}</div>}
                      {approval?.status === 'submitted' && typeof approval.diff === 'number' && <div className={cn('text-xs font-medium', approval.diff === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>{approval.diff === 0 ? t('Uden difference', 'No difference') : t(`Med difference ${approval.diff > 0 ? '+' : ''}${formatNumber(approval.diff)}`, `With difference ${approval.diff > 0 ? '+' : ''}${formatNumber(approval.diff)}`)}</div>}
                      {approval?.status === 'posted' && approval.postedBy && <div className="text-xs text-muted-foreground">{t('Bogført', 'Posted')}: {approval.postedBy.name} · {formatDateTime(approval.postedAt)}</div>}
                      {approval?.comment && <div className="text-xs text-muted-foreground">{approval.comment}</div>}
                      {item.countedAfter !== 0 && <div className="text-xs font-medium text-amber-700 dark:text-amber-300">{item.countedAfter > 0 ? '+' : ''}{formatNumber(item.countedAfter)} {t('talt efter godkendelse – Nulstil for at tage dem med', 'counted after approval – Reset to include them')}</div>}
                    </td>
                    {canEdit && (
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          {(!approval || ['open', 'returned', 'submitted'].includes(approval.status)) && <Button size="sm" loading={pending === `approved:${item.material}`} onClick={() => void set(item.material, 'approved')}><CheckCircle size={16} /> {t('Godkend', 'Approve')}</Button>}
                          {approval?.status === 'approved' && <Button size="sm" variant="secondary" loading={pending === `posted:${item.material}`} onClick={() => void set(item.material, 'posted')}><Stamp size={16} /> {t('Bogført i SAP', 'Posted in SAP')}</Button>}
                          {approval?.status !== 'returned' && approval?.status !== 'posted' && <Button size="sm" variant="ghost" loading={pending === `returned:${item.material}`} onClick={() => void set(item.material, 'returned')}><ArrowUUpLeft size={16} /> {t('Tilbage', 'Send back')}</Button>}
                          {approval && approval.status !== 'open' && <Button size="sm" variant="ghost" loading={pending === `reset:${item.material}`} onClick={() => void set(item.material, 'reset')}>{t('Nulstil', 'Reset')}</Button>}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {visible.length === 0 && <tr><td colSpan={canEdit ? 8 : 7} className="px-3 py-6 text-center text-muted-foreground">{t('Ingen materialer.', 'No materials.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
