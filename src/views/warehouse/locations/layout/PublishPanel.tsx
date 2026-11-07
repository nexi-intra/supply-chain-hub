import { useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { ArrowCounterClockwise, Eye, MagnifyingGlass, PaperPlaneTilt, Prohibit, Trash, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import type { EditorAction } from '@/lib/warehouse/layout/editor'
import { isPlaceSlot } from '@/lib/warehouse/layout/slots'
import { locationKeyOf, purposeLabel, typeLabel } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LayoutDraft, LayoutOwner, LocationPurpose, LocationType, PublishPlan } from '@/types/warehouse'
import type { SlotLink } from './RackFront'

type Props = {
  draft: LayoutDraft
  team: LayoutOwner
  dispatch: Dispatch<EditorAction>
  /** Saves what is not saved yet; false when it could not. */
  save: () => Promise<boolean>
  onPlan: (plan: PublishPlan) => void
  onFindSlot: (name: string) => void
  onShow: (itemId: string) => void
  onPublished: (version: number) => void
  onStale: () => void
  onClose: () => void
}

/** Slot colours in RackFront from the latest preview: on the list already, new, or blocking the publish. */
export function slotLinks(draft: LayoutDraft, plan: PublishPlan | null, team: LayoutOwner): Record<string, SlotLink> | undefined {
  if (!plan) return undefined
  const created = new Set(plan.create.map(entry => entry.slotId))
  const linked = new Set(plan.linked)
  const blocked = new Set(plan.blocked.map(entry => locationKeyOf(entry.name)))
  const links: Record<string, SlotLink> = {}
  for (const item of draft.items) {
    for (const slot of item.slots) {
      const id = locationKeyOf(slot.name)
      if (!id || !isPlaceSlot(item, slot, team)) continue
      if (blocked.has(id)) links[slot.id] = 'blocked'
      else if (created.has(slot.id)) links[slot.id] = 'new'
      else if (linked.has(id)) links[slot.id] = 'linked'
    }
  }
  return links
}

const has = (names: string[], name: string) => names.some(x => locationKeyOf(x) === locationKeyOf(name))
const palletsText = (n: number) => (n === 1 ? t('1 palle', '1 pallet') : t(`${n} paller`, `${n} pallets`))
const goodsText = ({ pallets, stock }: { pallets: number; stock: number }) => (pallets || stock
  ? [pallets ? palletsText(pallets) : '', stock ? t(`${stock} materialer`, `${stock} materials`) : ''].filter(Boolean).join(' · ')
  : t('tom', 'empty'))
const FIELDS: Record<string, [string, string]> = { type: ['Type', 'Type'], capacity: ['Kapacitet', 'Capacity'], purpose: ['Formål', 'Purpose'] }

function valueText(field: string, value: unknown): string {
  if (value == null) return '–'
  if (field === 'type') return typeLabel(value as LocationType)
  if (field === 'purpose') return purposeLabel(value as LocationPurpose)
  return String(value)
}

function Section({ title, count, testId, children }: { title: string; count: number; testId: string; children: ReactNode }) {
  if (!count) return null
  return (
    <section className="space-y-1" data-testid={testId}>
      <h3 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">({count})</span></h3>
      <ul className="divide-y rounded-md border text-sm">{children}</ul>
    </section>
  )
}

/** Afstemning og udgiv: what publishing the stored draft does to the place list, the admin's decisions, and the publish. */
export function PublishPanel({ draft, team, dispatch, save, onPlan, onFindSlot, onShow, onPublished, onStale, onClose }: Props) {
  const [plan, setPlan] = useState<PublishPlan | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [round, setRound] = useState(0)
  const seq = useRef(0)

  // The backend previews the stored draft, so every change made here is saved before the preview is fetched again.
  useEffect(() => {
    const at = ++seq.current
    setBusy(true)
    void (async () => {
      try {
        if (!(await save())) {
          if (at === seq.current) setError(t('Kladden kunne ikke gemmes, så udgivelsen kan ikke vises.', 'The draft could not be saved, so the publish cannot be shown.'))
          return
        }
        const next = await window.electronWarehouse!.locations.layoutPreview()
        if (at !== seq.current) return
        setPlan(next)
        setError(null)
        onPlan(next)
      } catch (failure) {
        if (at !== seq.current) return
        if (errorCode(failure) === 'LAYOUT_STALE') { toast.error(errorMessage(failure)); onStale(); return }
        setError(errorMessage(failure))
      } finally {
        if (at === seq.current) setBusy(false)
      }
    })()
  }, [draft, round, save, onPlan, onStale])

  const itemOfSlot = (slotId: string) => draft.items.find(item => item.slots.some(slot => slot.id === slotId))
  const itemOfName = (name: string) => draft.items.find(item => item.slots.some(slot => isPlaceSlot(item, slot, team) && locationKeyOf(slot.name) === locationKeyOf(name)))
  const decide = (name: string, as: 'outside' | 'remove' | null) => dispatch({ type: 'decide', name, as })

  async function publish() {
    if (!plan) return
    setPublishing(true)
    try {
      if (!(await save())) return
      // Only the previewed revision is published; a change since then is refused (LAYOUT_STALE).
      const { version } = await window.electronWarehouse!.locations.publishLayout({ rev: plan.rev })
      onPublished(version)
    } catch (failure) {
      toast.error(errorMessage(failure))
      if (errorCode(failure) === 'LAYOUT_STALE') onStale()
      else { setConfirming(false); setRound(value => value + 1) }
    } finally {
      setPublishing(false)
    }
  }

  const counts = plan?.counts
  const tiles: [keyof PublishPlan['counts'], string][] = [
    ['create', t('Nye', 'New')], ['rename', t('Omdøbt', 'Renamed')], ['change', t('Ændret', 'Changed')],
    ['remove', t('Nedlægges', 'Removed')], ['outside', t('Uden for tegningen', 'Outside the drawing')], ['blocked', t('Blokeret', 'Blocked')],
  ]
  const summary = counts && t(
    `${counts.create} nye, ${counts.rename} omdøbt, ${counts.change} ændret, ${counts.remove} nedlagt, ${counts.outside} uden for tegningen`,
    `${counts.create} new, ${counts.rename} renamed, ${counts.change} changed, ${counts.remove} removed, ${counts.outside} outside the drawing`,
  )

  return (
    <Dialog open onOpenChange={open => { if (!open && !publishing) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl" data-testid="publish-panel">
        <DialogHeader>
          <DialogTitle>{confirming ? t(`Udgiv tegningen som version ${(plan?.version ?? 0) + 1}?`, `Publish the drawing as version ${(plan?.version ?? 0) + 1}?`) : t('Afstemning og udgiv', 'Reconcile and publish')}</DialogTitle>
          <DialogDescription>{confirming
            ? t('Pladserne og tegningen skrives sammen. En udgivelse kan ikke fortrydes med Fortryd.', 'The places and the drawing are written together. A publish cannot be undone with Undo.')
            : t('Sådan bliver pladslisten, når kladden udgives. Intet ændres, før du udgiver.', 'This is how the place list will be when the draft is published. Nothing changes until you publish.')}</DialogDescription>
        </DialogHeader>

        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {!plan && !error && <Skeleton className="h-48 rounded-lg" />}

        {plan && counts && confirming && <p className="text-sm" data-testid="publish-summary">{summary}</p>}
        {plan && confirming && plan.version === 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" data-testid="publish-first">
            {t('Første udgivelse: herefter oprettes og ændres pladser kun på tegningen.', 'First publish: after it, places are only created and changed on the drawing.')}
          </p>
        )}

        {plan && counts && !confirming && (
          <div className="space-y-4" aria-busy={busy}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {tiles.map(([key, label]) => (
                <div key={key} className={`rounded-md border px-2 py-1.5 ${key === 'blocked' && counts.blocked ? 'border-destructive/50 bg-destructive/10' : ''}`} data-testid={`publish-count-${key}`}>
                  <div className="text-lg font-semibold">{counts[key]}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            <Section title={t('Blokeret – skal rettes før udgivelse', 'Blocked – fix before publishing')} count={plan.blocked.length} testId="publish-blocked">
              {plan.blocked.map(entry => {
                const item = itemOfName(entry.name)
                return (
                  <li key={`${entry.code}-${entry.name}`} className="flex items-center gap-2 px-3 py-1.5">
                    <Warning size={14} className="shrink-0 text-destructive" />
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-muted-foreground">{entry.detail}</span>
                    <span className="ml-auto flex gap-1">
                      {item && <Button size="sm" variant="outline" onClick={() => onShow(item.id)}><Eye size={14} /> {t('Vis', 'Show')}</Button>}
                      {entry.code === 'NOT_EMPTY' && has(draft.decisions.remove, entry.name) && <Button size="sm" variant="outline" onClick={() => decide(entry.name, null)}><ArrowCounterClockwise size={14} /> {t('Nedlæg ikke', 'Do not remove')}</Button>}
                    </span>
                  </li>
                )
              })}
            </Section>

            <Section title={t('Kun i listen', 'Only in the list')} count={plan.outside.length} testId="publish-outside">
              {plan.outside.map(entry => {
                const outside = has(draft.decisions.outside, entry.name)
                const empty = entry.pallets === 0 && entry.stock === 0
                return (
                  <li key={entry.name} className="flex flex-wrap items-center gap-2 px-3 py-1.5" data-place={entry.name}>
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-muted-foreground">{typeLabel(entry.type)} · {purposeLabel(entry.purpose)} · {goodsText(entry)}</span>
                    {outside && <span className="rounded bg-muted px-1.5 text-xs">{t('Bliver uden for tegningen', 'Stays outside the drawing')}</span>}
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => onFindSlot(entry.name)}><MagnifyingGlass size={14} /> {t('Find på tegningen', 'Find on the drawing')}</Button>
                      {outside
                        ? <Button size="sm" variant="ghost" onClick={() => decide(entry.name, null)}><ArrowCounterClockwise size={14} /> {t('Fortryd', 'Undo')}</Button>
                        : <Button size="sm" variant="outline" onClick={() => decide(entry.name, 'outside')}>{t('Uden for tegningen', 'Outside the drawing')}</Button>}
                      <Button size="sm" variant="outline" className="text-destructive" disabled={!empty} title={empty ? undefined : t('Kun en tom plads kan nedlægges', 'Only an empty place can be removed')} onClick={() => decide(entry.name, 'remove')}><Trash size={14} /> {t('Nedlæg', 'Remove')}</Button>
                    </span>
                  </li>
                )
              })}
            </Section>

            <Section title={t('Kun på tegningen – oprettes', 'Only on the drawing – created')} count={plan.create.length} testId="publish-create">
              {plan.create.map(entry => {
                const item = itemOfSlot(entry.slotId)
                return (
                  <li key={entry.slotId} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-muted-foreground">{entry.type ? typeLabel(entry.type) : ''}{entry.purpose ? ` · ${purposeLabel(entry.purpose)}` : ''}{entry.type === 'Palle' ? ` · ${t('plads til', 'room for')} ${palletsText(entry.capacity ?? 1)}` : ''}</span>
                    {item && <Button size="sm" variant="outline" className="ml-auto" onClick={() => dispatch({ type: 'setSlotKind', itemId: item.id, slotId: entry.slotId, kind: 'blocked' })}><Prohibit size={14} /> {t('Ikke en plads', 'Not a place')}</Button>}
                  </li>
                )
              })}
            </Section>

            <Section title={t('Omdøbes', 'Renamed')} count={plan.rename.length} testId="publish-rename">
              {plan.rename.map(entry => (
                <li key={entry.slotId} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-medium">{entry.from} → {entry.to}</span>
                  <span className="text-muted-foreground">{goodsText(entry)}</span>
                </li>
              ))}
            </Section>

            <Section title={t('Ændres', 'Changed')} count={plan.change.length} testId="publish-change">
              {plan.change.map(entry => (
                <li key={entry.slotId} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <span className="font-medium">{entry.name}</span>
                  {Object.entries(entry.changes).map(([field, [before, after]]) => (
                    <span key={field} className="text-muted-foreground">{t(...(FIELDS[field] ?? [field, field]))}: {valueText(field, before)} → {valueText(field, after)}</span>
                  ))}
                </li>
              ))}
            </Section>

            <Section title={t('Nedlægges', 'Removed')} count={plan.remove.length} testId="publish-remove">
              {plan.remove.map(entry => (
                <li key={entry.name} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-muted-foreground">{goodsText(entry)}</span>
                  {has(draft.decisions.remove, entry.name) && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => decide(entry.name, null)}><ArrowCounterClockwise size={14} /> {t('Fortryd', 'Undo')}</Button>}
                </li>
              ))}
            </Section>

            {!plan.blocked.length && counts.unchanged > 0 && <p className="text-xs text-muted-foreground">{t(`${counts.unchanged} pladser er uændrede.`, `${counts.unchanged} places are unchanged.`)}</p>}
          </div>
        )}

        <DialogFooter>
          {confirming
            ? <>
              <Button variant="ghost" disabled={publishing} onClick={() => setConfirming(false)}>{t('Tilbage', 'Back')}</Button>
              <Button loading={publishing} onClick={() => publish()}><PaperPlaneTilt size={16} /> {publishing ? t('Udgiver …', 'Publishing …') : t('Udgiv', 'Publish')}</Button>
            </>
            : <>
              <Button variant="ghost" onClick={onClose}>{t('Luk', 'Close')}</Button>
              <Button disabled={busy || !plan || !!error || plan.blocked.length > 0} title={plan?.blocked.length ? t('Ret det blokerede først', 'Fix what is blocked first') : undefined} onClick={() => setConfirming(true)}>
                <PaperPlaneTilt size={16} /> {t('Udgiv …', 'Publish …')}
              </Button>
            </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
