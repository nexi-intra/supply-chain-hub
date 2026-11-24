import { Badge } from '@/components/ui/badge'
import { targetLabel, type PreviewGroups } from '@/lib/softwareload'
import { t } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadPreview, SoftwareloadSapRow } from '@/types/warehouse'

type GroupKey = keyof PreviewGroups
type PlanTask = { kif: boolean; target: string }

/** The groups of a plan from SAP, in the order of the design; the problems are marked. */
export const PLAN_GROUPS: { key: GroupKey; title: (task: PlanTask) => string; problem?: boolean }[] = [
  { key: 'toTarget', title: task => (task.kif && task.target !== 'D005' ? t(`Til målet ${targetLabel(task.target)} via D005`, `To the target ${targetLabel(task.target)} via D005`) : t(`Til målet ${targetLabel(task.target)}`, `To the target ${targetLabel(task.target)}`)) },
  { key: 'toBlocked', title: task => (task.kif ? t('Fejlede nye (-0) til D000 og blocked stock via D005', 'Failed new (-0) to D000 and blocked stock via D005') : t('Fejlede nye (-0) til D000 og blocked stock', 'Failed new (-0) to D000 and blocked stock')) },
  { key: 'toD002', title: task => (task.kif ? t('Fejlede brugte (-R) til D002 via D005', 'Failed used (-R) to D002 via D005') : t('Fejlede brugte (-R) til D002', 'Failed used (-R) to D002')) },
  { key: 'notFound', title: () => t('Ikke fundet i SAP. Flyttes ikke', 'Not found in SAP. Not moved'), problem: true },
  { key: 'blockedStock', title: () => t('Står i blocked stock og kan ikke flyttes', 'In blocked stock and cannot be moved'), problem: true },
  { key: 'skipped', title: () => t('Står allerede på målet og springes over', 'Already on the target and skipped') },
  { key: 'manual', title: () => t('Fejlede, men materialet er hverken -0 eller -R. Kræver manuel håndtering', 'Failed, but the material is neither -0 nor -R. Needs manual handling'), problem: true },
  { key: 'alreadyBlocked', title: () => t('Fejlede og står allerede i blocked stock', 'Failed and already in blocked stock') },
]

/** The number of terminals per group, for a confirmation dialog. */
export function PlanCounts({ groups, task }: { groups: PreviewGroups; task: PlanTask }) {
  return (
    <ul className="space-y-1 text-sm">
      {PLAN_GROUPS.filter(group => groups[group.key].length).map(group => (
        <li key={group.key} className="flex justify-between gap-4">
          <span className={cn(group.problem && 'text-destructive')}>{group.title(task)}</span>
          <span className="font-semibold tabular-nums">{groups[group.key].length}</span>
        </li>
      ))}
    </ul>
  )
}

/** The plan per group with every serial, where SAP has it now and its note, and the steps SAP will be asked for. */
export function PlanSummary({ preview, groups, task, rowOf, notes = {} }: { preview: SoftwareloadPreview; groups: PreviewGroups; task: PlanTask; rowOf: Map<string, SoftwareloadSapRow>; notes?: Record<string, string | undefined> }) {
  const shown = PLAN_GROUPS.filter(group => groups[group.key].length)
  return (
    <div className="space-y-3">
      {shown.length === 0 && <p className="text-sm text-muted-foreground">{t('Opgaven har ingen serienumre. Der flyttes intet, og kun tiden gemmes.', 'The task has no serial numbers. Nothing is moved and only the time is saved.')}</p>}
      {shown.map(group => (
        <details key={group.key} className="rounded-lg border px-4 py-3" open={group.problem}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
            <span className={cn(group.problem && 'text-destructive')}>{group.title(task)}</span>
            <Badge variant={group.problem ? 'destructive' : 'secondary'}>{groups[group.key].length}</Badge>
          </summary>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {groups[group.key].map(serial => {
              const row = rowOf.get(serial)
              return (
                <li key={serial} className="flex flex-wrap gap-x-2">
                  <span className="font-mono">{serial}</span>
                  {row && <span className="text-muted-foreground">{row.material} · {row.sloc}{row.blocked ? ' · blocked' : ''}</span>}
                  {notes[serial] && <span className="w-full text-xs text-muted-foreground">{t('Note', 'Note')}: {notes[serial]}</span>}
                </li>
              )
            })}
          </ul>
        </details>
      ))}
      {(preview.transfers.length > 0 || preview.blocks.length > 0) && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium">{t('Trin i SAP', 'Steps in SAP')}</p>
          <ul className="flex flex-wrap gap-2">
            {preview.transfers.map(move => <li key={`${move.wave}-${move.from}-${move.to}`} className="rounded border px-2 py-0.5">{targetLabel(move.from)} → {targetLabel(move.to)} ({move.serials.length})</li>)}
            {preview.blocks.map(block => <li key={`344-${block.material}`} className="rounded border px-2 py-0.5 font-mono">MIGO 344 {block.material} ({block.serials.length})</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
