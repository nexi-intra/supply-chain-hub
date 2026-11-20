import type { SoftwareloadOutcome, SoftwareloadTask, SoftwareloadType } from '@/types/warehouse'

type Label = { da: string; en: string }

export const TYPE_LABELS: Record<SoftwareloadType, Label> = {
  'sw+key': { da: 'Softwareload + keyload', en: 'Softwareload + keyload' },
  sw: { da: 'Softwareload', en: 'Softwareload' },
  key: { da: 'Keyload', en: 'Keyload' },
}

/** The types in the order of the design (the order of TYPE_LABELS). */
export const SOFTWARELOAD_TYPES = Object.keys(TYPE_LABELS) as SoftwareloadType[]

const TYPE_ORDER = SOFTWARELOAD_TYPES

const OUTCOME_LABELS: Record<SoftwareloadOutcome, Label> = {
  'to-target': { da: 'Flyttet til målet', en: 'Moved to target' },
  'to-blocked': { da: 'Til blocked stock', en: 'To blocked stock' },
  'to-d002': { da: 'Til D002', en: 'To D002' },
  'not-found': { da: 'Ikke fundet i SAP', en: 'Not found in SAP' },
  'blocked-stock': { da: 'Står i blocked stock', en: 'In blocked stock' },
  'already-blocked': { da: 'Allerede i blocked stock', en: 'Already in blocked stock' },
  skipped: { da: 'Står allerede på målet', en: 'Already on target' },
  manual: { da: 'Kræver manuel håndtering', en: 'Needs manual handling' },
  'failed-sap': { da: 'SAP afviste', en: 'Refused by SAP' },
  abandoned: { da: 'Opgivet', en: 'Abandoned' },
  interrupted: { da: 'Afbrudt', en: 'Interrupted' },
}

export const outcomeLabel = (outcome: SoftwareloadOutcome): Label => OUTCOME_LABELS[outcome]

export interface PreviewGroups {
  toTarget: string[]
  toBlocked: string[]
  toD002: string[]
  notFound: string[]
  blockedStock: string[]
  skipped: string[]
  manual: string[]
  alreadyBlocked: string[]
}

const GROUP_OF: Partial<Record<SoftwareloadOutcome, keyof PreviewGroups>> = {
  'to-target': 'toTarget',
  'to-blocked': 'toBlocked',
  'to-d002': 'toD002',
  'not-found': 'notFound',
  'blocked-stock': 'blockedStock',
  skipped: 'skipped',
  manual: 'manual',
  'already-blocked': 'alreadyBlocked',
}

/** The serials of a preview per confirmation group, in their order; outcomes a preview never gives are left out. */
export function previewGroups(outcomes: Record<string, SoftwareloadOutcome>): PreviewGroups {
  const groups: PreviewGroups = { toTarget: [], toBlocked: [], toD002: [], notFound: [], blockedStock: [], skipped: [], manual: [], alreadyBlocked: [] }
  for (const [serial, outcome] of Object.entries(outcomes)) {
    const group = GROUP_OF[outcome]
    if (group) groups[group].push(serial)
  }
  return groups
}

export interface SoftwareloadSummaryRow {
  key: string
  name: string
  type: SoftwareloadType
  tasks: number
  moved: number
  failed: number
  workedMs: number
  /** Terminals moved to the target per worked hour, one decimal; 0 without worked time. */
  perHour: number
}

/** One row per person and type, sorted by name and then type. Failed terminals are counted apart and not in the pace. */
export function summarizeTasks(tasks: SoftwareloadTask[]): SoftwareloadSummaryRow[] {
  const rows = new Map<string, SoftwareloadSummaryRow>()
  for (const task of tasks) {
    const key = `${task.email}|${task.type}`
    const row = rows.get(key) ?? { key, name: task.name, type: task.type, tasks: 0, moved: 0, failed: 0, workedMs: 0, perHour: 0 }
    row.tasks += 1
    row.moved += Object.values(task.results).filter(result => result.outcome === 'to-target').length
    row.failed += Object.values(task.terminals).filter(terminal => terminal.failed).length
    row.workedMs += task.workedMs
    rows.set(key, row)
  }
  return [...rows.values()]
    .map(row => ({ ...row, perHour: row.workedMs > 0 ? Math.round(row.moved / (row.workedMs / 3_600_000) * 10) / 10 : 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'da') || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
}
