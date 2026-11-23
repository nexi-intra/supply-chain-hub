import type { SoftwareloadComment, SoftwareloadKifPreview, SoftwareloadOutcome, SoftwareloadResult, SoftwareloadTask, SoftwareloadType } from '@/types/warehouse'
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

/** Outcomes of a terminal that should have moved and did not (all of its way). */
const NOT_MOVED: SoftwareloadOutcome[] = ['failed-sap', 'abandoned', 'interrupted']

/** Outcomes that are a problem for the person: shown first and in red. */
const PROBLEMS: SoftwareloadOutcome[] = ['failed-sap', 'interrupted', 'abandoned', 'manual', 'not-found', 'blocked-stock']
export const isProblemOutcome = (outcome: SoftwareloadOutcome) => PROBLEMS.includes(outcome)

/**
 * Whether the person scanned (`lastScanAt`) after the task's break began and it is still on it: scans are saved, but
 * their time does not count, so the screen offers to resume the time.
 */
export const scannedDuringPause = (running: { paused: boolean; lastEventAt: number }, lastScanAt: number | null) =>
  running.paused && lastScanAt !== null && lastScanAt >= running.lastEventAt

/**
 * The title over the result of a finished task (`name` for someone else's): "flyttet i SAP" only when something moved,
 * and it says when not everything did.
 */
export function finishTitle(results: Record<string, SoftwareloadResult>, name?: string): string {
  const list = Object.values(results)
  const subject = name ? t(`${name}s opgave`, `${name}'s task`) : t('Opgaven', 'The task')
  if (!list.length) return t(`${subject} er afsluttet. Der var ingen terminaler at flytte`, `${subject} is finished. There were no terminals to move`)
  if (!list.some(result => result.steps.length)) return t(`${subject} er afsluttet. Intet er flyttet i SAP`, `${subject} is finished. Nothing was moved in SAP`)
  if (list.some(result => NOT_MOVED.includes(result.outcome))) return t(`${subject} er afsluttet. Noget er flyttet i SAP, men ikke alt`, `${subject} is finished. Some was moved in SAP, but not all`)
  return t(`${subject} er afsluttet og flyttet i SAP`, `${subject} is finished and moved in SAP`)
}

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

export interface KifMovePlan {
  /** The dialog's question, e.g. "Flyt 3 terminaler til D005 i SAP?". */
  title: string
  /** Terminals the preview moves to D005. */
  count: number
  /** "Trin i SAP": one line per transfer, from → D005 and its number of terminals. */
  steps: { key: string; from: string; to: string; count: number }[]
  /** What "Flyt" sends: the serials, the document and the from-location of every move of the preview the user saw, copied when the dialog opened. */
  request: { serials: string[]; document?: string; planned: Record<string, string> }
}

/** The confirmation of a move into KIF, made once from the preview so the dialog and "Flyt" use the same plan. */
export function kifMovePlan(preview: Pick<SoftwareloadKifPreview, 'serials' | 'outcomes' | 'transfers'>, document: string): KifMovePlan {
  const count = Object.values(preview.outcomes).filter(outcome => outcome === 'to-target').length
  return {
    title: count === 1 ? t('Flyt 1 terminal til D005 i SAP?', 'Move 1 terminal to D005 in SAP?') : t(`Flyt ${count} terminaler til D005 i SAP?`, `Move ${count} terminals to D005 in SAP?`),
    count,
    steps: preview.transfers.map(item => ({ key: `${item.wave}-${item.from}-${item.to}`, from: item.from, to: item.to, count: item.serials.length })),
    request: {
      serials: [...preview.serials],
      ...(document ? { document } : {}),
      planned: Object.fromEntries(preview.transfers.flatMap(item => item.serials.map(serial => [serial, item.from]))),
    },
  }
}

/** A dialog's confirm button ignores presses this soon after it opened, so a fast double press cannot reach it. */
export const CONFIRM_ARM_MS = 400

/**
 * Whether a press on a confirm button in a dialog that moves in SAP was meant for it: not the second click of a double
 * click (`detail` 2 or more) that opened the dialog, and not a press within CONFIRM_ARM_MS of it opening.
 */
export function isDeliberateConfirm({ detail, sinceOpenMs }: { detail: number; sinceOpenMs: number }): boolean {
  return detail <= 1 && sinceOpenMs >= CONFIRM_ARM_MS
}

export interface SoftwareloadSummaryRow {
  key: string
  name: string
  type: SoftwareloadType
  tasks: number
  /** Terminals loaded: every scanned terminal not marked as failed, whatever SAP did with it. */
  moved: number
  failed: number
  /** Terminals not marked as failed that SAP refused to move; counted in `moved` as well. */
  sapFailed: number
  workedMs: number
  /** Terminals loaded (`moved`) per worked hour, one decimal; 0 without worked time. */
  perHour: number
}

/** One row per person and type, sorted by name and then type. Only terminals marked as failed are left out of the pace. */
export function summarizeTasks(tasks: SoftwareloadTask[]): SoftwareloadSummaryRow[] {
  const rows = new Map<string, SoftwareloadSummaryRow>()
  for (const task of tasks) {
    const key = `${task.email}|${task.type}`
    const row = rows.get(key) ?? { key, name: task.name, type: task.type, tasks: 0, moved: 0, failed: 0, sapFailed: 0, workedMs: 0, perHour: 0 }
    const loaded = Object.entries(task.terminals).filter(([, terminal]) => !terminal.failed)
    row.tasks += 1
    row.moved += loaded.length
    row.failed += Object.keys(task.terminals).length - loaded.length
    row.sapFailed += loaded.filter(([serial]) => task.results[serial]?.outcome === 'failed-sap').length
    row.workedMs += task.workedMs
    rows.set(key, row)
  }
  return [...rows.values()]
    .map(row => ({ ...row, perHour: row.workedMs > 0 ? Math.round(row.moved / (row.workedMs / 3_600_000) * 10) / 10 : 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'da') || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
}

/**
 * One task in the task list, counted like summarizeTasks: `loaded` is every terminal not marked failed (its `moved`),
 * and `problems` the problem outcomes of those loaded terminals per outcome, in the order of PROBLEMS. A failed terminal
 * is counted in `failed` only, so it never shows twice (as summarizeTasks.sapFailed).
 */
export function taskLoadCounts(task: SoftwareloadTask): { loaded: number; failed: number; problems: [SoftwareloadOutcome, number][] } {
  const terminals = Object.entries(task.terminals)
  const loaded = terminals.filter(([, terminal]) => !terminal.failed)
  const outcomes = loaded.map(([serial]) => task.results[serial]?.outcome)
  const problems = PROBLEMS
    .map(outcome => [outcome, outcomes.filter(item => item === outcome).length] as [SoftwareloadOutcome, number])
    .filter(([, count]) => count > 0)
  return { loaded: loaded.length, failed: terminals.length - loaded.length, problems }
}

export interface SoftwareloadMaterialRow {
  /** In capitals; empty for terminals SAP gave no material (e.g. a task without moves). */
  material: string
  /** Tasks with at least one terminal of the material. */
  tasks: number
  moved: number
  failed: number
  /** The task's worked time shared out on its materials by their number of terminals. */
  workedMs: number
  perHour: number
}

const materialOf = (task: SoftwareloadTask, serial: string) => (task.results[serial]?.material ?? '').trim().toUpperCase()

/**
 * One row per material, sorted by material. A task can hold several materials, so its time is shared out on them by
 * the number of terminals (failed ones too, as they took time); the pace counts the terminals not marked as failed.
 */
export function summarizeByMaterial(tasks: SoftwareloadTask[]): SoftwareloadMaterialRow[] {
  const rows = new Map<string, SoftwareloadMaterialRow>()
  for (const task of tasks) {
    const serials = Object.keys(task.terminals)
    for (const material of new Set(serials.map(serial => materialOf(task, serial)))) {
      const own = serials.filter(serial => materialOf(task, serial) === material)
      const failed = own.filter(serial => task.terminals[serial].failed).length
      const row = rows.get(material) ?? { material, tasks: 0, moved: 0, failed: 0, workedMs: 0, perHour: 0 }
      row.tasks += 1
      row.moved += own.length - failed
      row.failed += failed
      row.workedMs += task.workedMs * (own.length / serials.length)
      rows.set(material, row)
    }
  }
  return [...rows.values()]
    .map(row => ({ ...row, perHour: row.workedMs > 0 ? Math.round(row.moved / (row.workedMs / 3_600_000) * 10) / 10 : 0 }))
    .sort((a, b) => a.material.localeCompare(b.material, 'da', { numeric: true }))
}

/**
 * The part of a task that concerns one material: only its terminals, with the task's time shared out like in
 * summarizeByMaterial; null when the task has none of the material.
 */
export function taskForMaterial(task: SoftwareloadTask, material: string): SoftwareloadTask | null {
  const serials = Object.keys(task.terminals)
  const own = serials.filter(serial => materialOf(task, serial) === asMaterial(material))
  if (!own.length) return null
  if (own.length === serials.length) return task
  const pick = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([serial]) => own.includes(serial)))
  return { ...task, terminals: pick(task.terminals), results: pick(task.results), workedMs: task.workedMs * (own.length / serials.length) }
}

/** What a list of comments is matched against: '' or nothing matches every comment, a list the values shown in the numbers. */
export type CommentFilter = string | readonly string[] | undefined

const fits = (value: string | undefined, filter: CommentFilter, normalize: (text: string) => string) => {
  if (!value) return true
  if (typeof filter === 'string') return !filter || normalize(filter) === normalize(value)
  return !filter || filter.some(item => normalize(item) === normalize(value))
}
const asMaterial = (text: string) => text.trim().toUpperCase()
const asVersion = (text: string) => text.trim()

/**
 * The comments that fit the filters: a comment without a material (or version) fits any; one with a material fits the
 * chosen one, or, given a list, when the material is among the numbers shown. The order is kept.
 */
export function commentsFor(comments: SoftwareloadComment[], { material, version }: { material?: CommentFilter; version?: CommentFilter }): SoftwareloadComment[] {
  return comments.filter(comment => fits(comment.material, material, asMaterial) && fits(comment.version, version, asVersion))
}

const pad = (value: number) => String(value).padStart(2, '0')
const localDay = (ms: number) => { const date = new Date(ms); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }

/** The comments that concern a task: it started (local day) in their period and has their material and version. */
export function commentsOnTask(comments: SoftwareloadComment[], task: SoftwareloadTask): SoftwareloadComment[] {
  const day = localDay(task.startedAt)
  const materials = [...new Set(Object.keys(task.terminals).concat(Object.keys(task.results)).map(serial => materialOf(task, serial)).filter(Boolean))]
  return commentsFor(comments, { material: materials, version: task.version }).filter(comment => comment.from <= day && comment.to >= day)
}
