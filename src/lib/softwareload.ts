import type { SoftwareloadOutcome, SoftwareloadTask, SoftwareloadType } from '@/types/warehouse'
import { errorCode, errorMessage } from './warehouse/errors'
import { t } from './warehouse/text'

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

/** Errors after which SAP may have posted a move the app never heard about. */
const UNCERTAIN_CODES = ['SAP_TIMEOUT', 'SAP_SCRIPT_FAILED', 'SOFTWARELOAD_SAP_FAILED']

/**
 * The text for an error of a finish, a continue or a move into KIF. When SAP may have posted without the app getting
 * the answer, it asks the person to check SAP rather than to try again.
 */
export function sapRunErrorMessage(error: unknown): string {
  const message = errorMessage(error)
  if (!UNCERTAIN_CODES.includes(errorCode(error) ?? '')) return message
  const base = message.replace(/\s*(Prøv igen|Try again)\.?\s*$/, '').replace(/[.\s]+$/, '')
  return t(`${base}. Tjek i SAP før du fortsætter.`, `${base}. Check in SAP before you continue.`)
}

export interface SoftwareloadTarget {
  sloc: string
  description: string
  team: 'TCD' | 'TRR'
}

/** The storage locations a task may end in, with SAP's description; the same list as electron/warehouse/softwareload/core/targets.cjs. */
export const SOFTWARELOAD_TARGETS: readonly SoftwareloadTarget[] = [
  { sloc: 'D000', description: 'Central Warehous', team: 'TCD' },
  { sloc: 'D001', description: 'Raw Terminals', team: 'TRR' },
  { sloc: 'D002', description: 'Repair', team: 'TRR' },
  { sloc: 'D003', description: 'SWAP Inbound', team: 'TRR' },
  { sloc: 'D004', description: 'SWAP Outbound', team: 'TCD' },
  { sloc: 'D005', description: 'SA – secure room', team: 'TCD' },
  { sloc: 'D006', description: 'Forecast Prep', team: 'TCD' },
]

/** "D002 · Repair (TRR)" for a location in the list, otherwise just the code. */
export function targetLabel(sloc: string): string {
  const item = SOFTWARELOAD_TARGETS.find(target => target.sloc === sloc)
  return item ? `${item.sloc} · ${item.description} (${item.team})` : sloc
}

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
