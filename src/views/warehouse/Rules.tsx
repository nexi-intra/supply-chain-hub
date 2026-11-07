import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Lightbulb } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatNumber, kindLabel } from '@/lib/warehouse/format'
import type { Kind, RulesView, WarehouseUser } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'

export function Rules({ user, onBack }: { user: WarehouseUser; onBack: () => void }) {
  const [view, setView] = useState<RulesView | null>(null)
  // The newest change per storage location: a failed older write must not take back a newer one.
  const versions = useRef(new Map<string, number>())

  const load = useCallback(async () => {
    try {
      setView(await window.electronWarehouse!.rules.get())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  // Shown at once; the write to M: (15–90 s) runs in the background and is taken back if it fails.
  const save = (sloc: string, kinds: Kind[]) => {
    if (!kinds.length) { toast.error(t('Vælg mindst én type', 'Choose at least one type')); return }
    if (!view) return
    const ordered = view.kinds.filter(kind => kinds.includes(kind))
    const previous = { rule: view.rules[sloc], stored: view.stored[sloc] }
    const version = (versions.current.get(sloc) || 0) + 1
    versions.current.set(sloc, version)
    const show = (rule: Kind[] | null, stored: RulesView['stored'][string] | undefined) => setView(current => {
      if (!current) return current
      const nextStored = { ...current.stored }
      if (stored) nextStored[sloc] = stored
      else delete nextStored[sloc]
      return { ...current, rules: { ...current.rules, [sloc]: rule }, stored: nextStored }
    })
    show(ordered, { kinds: ordered, updatedBy: { email: user.email, name: user.fullName || user.email }, updatedAt: Date.now() })
    toast.success(t(`Lagerregel for ${sloc} er gemt`, `Storage rule for ${sloc} saved`))
    trackPendingWrite(window.electronWarehouse!.rules.set({ sloc, kinds: ordered })).catch(error => {
      if (versions.current.get(sloc) === version) show(previous.rule, previous.stored)
      toast.error(t(`Lagerreglen for ${sloc} blev ikke gemt`, `The storage rule for ${sloc} was not saved`), { description: errorMessage(error) })
    })
  }

  if (!view) return <Skeleton className="h-96 rounded-xl" />
  const kinds = view.kinds.filter(kind => kind !== 'other')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('Tilbage', 'Back')}><ArrowLeft size={20} /></Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('Lagerregler', 'Storage rules')} · {view.team}</h1>
          <p className="text-sm text-muted-foreground">{t('Hvad må stå på hvilken storage location? Varer, der ikke må stå der, markeres "Skal flyttes" i nye optællinger.', 'What may be on which storage location? Items that may not be there are marked "Must be moved" in new counts.')}</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storage locations</CardTitle>
          <CardDescription>{view.canEdit ? t('Du er manager og kan rette reglerne.', 'You are a manager and can edit the rules.') : t('Kun managers kan rette reglerne.', 'Only managers can edit the rules.')} {t('En storage location uden regel markerer intet som fejlplaceret.', 'A storage location without a rule marks nothing as misplaced.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Sloc</th>
                  {kinds.map(kind => <th key={kind} className="px-3 py-2">{kindLabel(kind)}</th>)}
                  <th className="px-3 py-2">{t('Forslag fra SAP', 'Suggestion from SAP')}</th>
                  <th className="px-3 py-2">{t('Sidst ændret', 'Last changed')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(view.rules).map(([sloc, allowed]) => {
                  const suggestion = view.suggestions?.bySloc[sloc]
                  const stored = view.stored[sloc]
                  return (
                    <tr key={sloc} className="border-t">
                      <td className="px-3 py-2 font-mono font-semibold">{sloc}{!allowed && <Badge variant="outline" className="ml-2">{t('Ingen regel', 'No rule')}</Badge>}</td>
                      {kinds.map(kind => (
                        <td key={kind} className="px-3 py-2">
                          <Checkbox
                            checked={Boolean(allowed?.includes(kind))}
                            disabled={!view.canEdit}
                            aria-label={`${sloc}: ${kindLabel(kind)}`}
                            onCheckedChange={value => save(sloc, value === true ? [...(allowed || []), kind] : (allowed || []).filter(item => item !== kind))}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs">
                        {suggestion && suggestion.suggested.length ? (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            <Lightbulb size={14} />
                            {suggestion.suggested.map(kindLabel).join(' + ')}
                            <span className="text-muted-foreground">({kinds.map(kind => `${formatNumber(suggestion.quantities[kind] || 0)}`).join(' / ')})</span>
                            {view.canEdit && JSON.stringify(suggestion.suggested) !== JSON.stringify(allowed) && <Button size="sm" variant="link" className="h-auto px-1" onClick={() => save(sloc, suggestion.suggested)}>{t('Brug', 'Use')}</Button>}
                          </span>
                        ) : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{stored ? `${stored.updatedBy.name} · ${formatDateTime(stored.updatedAt)}` : t('Standard', 'Default')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {view.suggestions ? t(`Forslag ud fra SAP-data i "${view.suggestions.fromCount}" (${formatDateTime(view.suggestions.fetchedAt)}): typer med mindst 5 % af antallet. Tal = nye / brugte / tilbehør.`, `Suggestions from the SAP data in "${view.suggestions.fromCount}" (${formatDateTime(view.suggestions.fetchedAt)}): types with at least 5 % of the quantity. Figures = new / used / accessories.`) : t('Forslag vises, når teamet har oprettet en optælling.', 'Suggestions are shown once the team has created a count.')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
