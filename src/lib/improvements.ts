export const IMPROVEMENT_STATUSES = [
  'new', 'assessment', 'planned', 'in-progress', 'testing', 'ready-for-approval',
  'completed', 'on-hold', 'declined',
] as const

export const IMPROVEMENT_CATEGORIES = [
  'process', 'automation', 'quality', 'workplace', 'cost', 'other',
] as const

export const IMPROVEMENT_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const

export type ImprovementStatus = typeof IMPROVEMENT_STATUSES[number]
export type ImprovementCategory = typeof IMPROVEMENT_CATEGORIES[number]
export type ImprovementPriority = typeof IMPROVEMENT_PRIORITIES[number]
export type ImprovementAssignmentKind = 'owner' | 'contributor'
export type ImprovementAssignmentStatus = 'pending' | 'accepted' | 'declined'
export type ImprovementPreset = 'all' | 'mine' | 'assigned' | 'department'
export type ImprovementView = 'active' | 'completed' | 'declined'

export function improvementView(status: ImprovementStatus): ImprovementView {
  return status === 'completed' || status === 'declined' ? status : 'active'
}
export type ImprovementSort = 'updated' | 'newest' | 'oldest' | 'priority' | 'due'
export type ImprovementProgressStatus = Exclude<ImprovementStatus, 'ready-for-approval' | 'completed'>

export interface ImprovementActor {
  email: string
  fullName: string
  teamCode: string
  role: 'user' | 'manager' | 'creator'
}

export interface ImprovementPerson {
  email: string
  fullName: string
  teamCode: string
  /** false for creator-kontoen, som kan vises med navn men ikke inviteres. */
  invitable?: boolean
}

export interface ImprovementTeam {
  folderName: string
  name: string
}

export interface ImprovementAssignment {
  id: string
  email: string
  name: string
  teamCode: string
  kind: ImprovementAssignmentKind
  status: ImprovementAssignmentStatus
  invitedBy: string
  invitedAt: string
  respondedAt?: string
  responseDueDate?: string
}

export interface ImprovementDeletionRequest {
  id: string
  requestedBy: string
  requestedByName: string
  requestedAt: string
  message: string
  status: 'pending' | 'rejected' | 'approved'
  reviewedBy?: string
  reviewedAt?: string
  reviewMessage?: string
}

export interface ImprovementHistory {
  id: string
  type: string
  actorEmail: string
  actorName: string
  at: string
  message: string
}

export interface ImprovementNotification {
  id: string
  recipientEmail: string
  type: string
  createdAt: string
  message: string
  readAt?: string | null
  assignmentId?: string
}

export interface ImprovementCase {
  id: string
  revision: number
  title: string
  problem: string
  proposal: string
  /** En fast kategori-id eller en egen kategori skrevet af brugeren. */
  category: ImprovementCategory | string
  originTeamCode: string
  affectedTeamCodes: string[]
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  priority: ImprovementPriority
  status: ImprovementStatus
  nextAction: string
  dueDate?: string
  feedbackDueDate?: string
  deletedAt?: string
  deletedBy?: string
  deletionReason?: string
  deletionRequests?: ImprovementDeletionRequest[]
  assignments: ImprovementAssignment[]
  history: ImprovementHistory[]
  notifications: ImprovementNotification[]
}

export interface ImprovementSnapshot {
  cases: ImprovementCase[]
  people: ImprovementPerson[]
  teams: ImprovementTeam[]
  actor: ImprovementActor
}

export type ImprovementCommand = { operationId: string } & (
  | {
    type: 'create'
    title: string
    problem: string
    proposal: string
    category: ImprovementCategory | string
    affectedTeamCodes: string[]
    ownerEmail: string
  }
  | { type: 'comment'; caseId: string; message: string }
  | { type: 'invite'; caseId: string; expectedRevision: number; email: string; kind: ImprovementAssignmentKind; responseDueDate?: string }
  | { type: 'set-deadlines'; caseId: string; expectedRevision: number; feedbackDueDate?: string; assignmentId?: string; responseDueDate?: string }
  | { type: 'request-deletion'; caseId: string; message: string }
  | { type: 'reject-deletion'; caseId: string; expectedRevision: number; requestId: string; message: string }
  | { type: 'delete'; caseId: string; expectedRevision: number; message: string }
  | { type: 'respond'; caseId: string; assignmentId: string; accept: boolean }
  | {
    type: 'update'
    caseId: string
    expectedRevision: number
    status?: ImprovementProgressStatus
    priority?: ImprovementPriority
    nextAction?: string
    dueDate?: string
    message?: string
  }
  | { type: 'submit'; caseId: string; expectedRevision: number }
  | { type: 'approve'; caseId: string; expectedRevision: number; message?: string }
  | { type: 'return'; caseId: string; expectedRevision: number; message: string }
  | { type: 'acknowledge'; caseId: string; notificationId: string }
)

export interface ImprovementsApi {
  snapshot(): Promise<ImprovementSnapshot>
  command(command: ImprovementCommand): Promise<ImprovementCase>
  onChanged(callback: () => void): () => void
}

declare global {
  interface Window {
    electronImprovements?: ImprovementsApi
  }
}

export interface ImprovementFilters {
  search?: string
  status?: ImprovementStatus | 'all'
  priority?: ImprovementPriority | 'all'
  originTeam?: string
  affectedTeam?: string
  person?: string
  preset?: ImprovementPreset
  view?: ImprovementView
  invitations?: boolean
  sort?: ImprovementSort
}

export function applyImprovementResult(cases: readonly ImprovementCase[], result: ImprovementCase): ImprovementCase[] {
  const liveCases = cases.filter(entry => !entry.deletedAt)
  if (result.deletedAt) return liveCases.filter(entry => entry.id !== result.id)
  const existing = liveCases.find(entry => entry.id === result.id)
  if (!existing) return [...liveCases, result]
  if (result.revision < existing.revision) return liveCases
  return liveCases.map(entry => entry.id === result.id ? result : entry)
}

export function sortImprovements(
  cases: readonly ImprovementCase[],
  sort: ImprovementSort = 'updated',
): ImprovementCase[] {
  return [...cases].sort((first, second) => {
    const updated = Date.parse(second.updatedAt) - Date.parse(first.updatedAt)
    const byId = first.id < second.id ? -1 : first.id > second.id ? 1 : 0
    if (sort === 'newest' || sort === 'oldest') {
      const created = Date.parse(first.createdAt) - Date.parse(second.createdAt)
      return (sort === 'newest' ? -created : created) || byId
    }
    if (sort === 'priority') {
      return IMPROVEMENT_PRIORITIES.indexOf(first.priority) - IMPROVEMENT_PRIORITIES.indexOf(second.priority)
        || updated || byId
    }
    if (sort === 'due') {
      const firstDue = first.dueDate ? Date.parse(first.dueDate) : NaN
      const secondDue = second.dueDate ? Date.parse(second.dueDate) : NaN
      const firstHasDue = Number.isFinite(firstDue)
      const secondHasDue = Number.isFinite(secondDue)
      if (firstHasDue !== secondHasDue) return firstHasDue ? -1 : 1
      if (firstHasDue && secondHasDue && firstDue !== secondDue) return firstDue - secondDue
    }
    return updated || byId
  })
}

export function filterImprovements(
  cases: readonly ImprovementCase[],
  filters: ImprovementFilters,
  actorEmail: string,
  teamCode: string,
): ImprovementCase[] {
  const search = filters.search?.trim().toLowerCase()
  const actor = actorEmail.trim().toLowerCase()
  const person = filters.person?.trim().toLowerCase()
  return sortImprovements(cases.filter(entry => {
    if (entry.deletedAt) return false
    if (filters.view && improvementView(entry.status) !== filters.view) return false
    if (search && ![entry.title, entry.problem, entry.proposal].some(text => text.toLowerCase().includes(search))) return false
    if (filters.status && filters.status !== 'all' && entry.status !== filters.status) return false
    if (filters.priority && filters.priority !== 'all' && entry.priority !== filters.priority) return false
    if (filters.originTeam && filters.originTeam !== 'all' && entry.originTeamCode !== filters.originTeam) return false
    if (filters.affectedTeam && filters.affectedTeam !== 'all' && !entry.affectedTeamCodes.includes(filters.affectedTeam)) return false
    const acceptedPerson = (email: string) => entry.assignments.some(assignment =>
      assignment.status === 'accepted' && assignment.email.trim().toLowerCase() === email,
    )
    if (person && person !== 'all' && !acceptedPerson(person)) return false
    if (filters.preset === 'mine' && (!actor || entry.createdBy.trim().toLowerCase() !== actor)) return false
    if (filters.preset === 'assigned' && (!actor || !acceptedPerson(actor))) return false
    if (filters.preset === 'department' && (!teamCode || (
      entry.originTeamCode !== teamCode && !entry.affectedTeamCodes.includes(teamCode)
    ))) return false
    if (filters.invitations && (!actor || !entry.assignments.some(assignment =>
      assignment.status === 'pending' && assignment.email.trim().toLowerCase() === actor,
    ))) return false
    return true
  }), filters.sort)
}

export const CUSTOM_CATEGORY_LIMIT = 60

export function isBuiltInImprovementCategory(value: string): value is ImprovementCategory {
  return (IMPROVEMENT_CATEGORIES as readonly string[]).includes(value)
}

export function improvementCategoryLabel(category: string, labels: Record<ImprovementCategory, string>): string {
  return isBuiltInImprovementCategory(category) ? labels[category] : category
}

const foldCategory = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('da')

/** Egne kategorier, som andre allerede har brugt, så de kan genbruges i stedet for at blive oprettet igen. */
export function customImprovementCategories(cases: readonly ImprovementCase[]): string[] {
  const byKey = new Map<string, string>()
  for (const entry of cases) {
    if (entry.deletedAt || isBuiltInImprovementCategory(entry.category)) continue
    const key = foldCategory(entry.category)
    if (key && !byKey.has(key)) byKey.set(key, entry.category)
  }
  return [...byKey.values()].sort((first, second) => first.localeCompare(second, 'da'))
}

/** Gør en skrevet kategori til en fast id, en eksisterende egen kategori eller en ny, renset kategori. */
export function resolveImprovementCategory(input: string, cases: readonly ImprovementCase[], labels: Record<ImprovementCategory, string>): string | null {
  const cleaned = input.trim().replace(/\s+/g, ' ')
  if (!cleaned || cleaned.length > CUSTOM_CATEGORY_LIMIT) return null
  const key = foldCategory(cleaned)
  const builtIn = IMPROVEMENT_CATEGORIES.find(id => id === key || foldCategory(labels[id]) === key)
  if (builtIn) return builtIn
  return customImprovementCategories(cases).find(existing => foldCategory(existing) === key) ?? cleaned
}

export function unreadImprovementNotifications(cases: readonly ImprovementCase[], actorEmail: string): Array<{ entry: ImprovementCase; notification: ImprovementNotification }> {
  const actor = actorEmail.trim().toLowerCase()
  if (!actor) return []
  return cases.filter(entry => !entry.deletedAt).flatMap(entry => entry.notifications
    .filter(notification => !notification.readAt && notification.recipientEmail.trim().toLowerCase() === actor)
    .map(notification => ({ entry, notification })))
    .sort((first, second) => Date.parse(second.notification.createdAt) - Date.parse(first.notification.createdAt))
}

/** When each suggestion was last opened; `since` covers suggestions never opened (set the first time the module is used). */
export interface ImprovementSeenState {
  since: string
  cases: Record<string, string>
}

const sameEmail = (first: string, second: string) => first.trim().toLowerCase() === second.trim().toLowerCase()

/** Suggestions I created, take part in, or got a notification about. */
export function isImprovementRelevant(entry: ImprovementCase, actorEmail: string): boolean {
  return sameEmail(entry.createdBy, actorEmail)
    || entry.assignments.some(assignment => sameEmail(assignment.email, actorEmail) && assignment.status !== 'declined')
    || entry.notifications.some(notification => sameEmail(notification.recipientEmail, actorEmail))
}

/** Newest change made by somebody else; my own actions never count as news. */
export function lastForeignActivity(entry: ImprovementCase, actorEmail: string): string | null {
  let latest: string | null = null
  for (const item of entry.history) {
    if (item.type === 'acknowledge' || sameEmail(item.actorEmail, actorEmail)) continue
    if (!latest || Date.parse(item.at) > Date.parse(latest)) latest = item.at
  }
  return latest
}

export function unseenImprovementIds(cases: readonly ImprovementCase[], actorEmail: string, seen: ImprovementSeenState | null): Set<string> {
  const result = new Set<string>()
  if (!seen || !actorEmail.trim()) return result
  for (const entry of cases) {
    if (entry.deletedAt || !isImprovementRelevant(entry, actorEmail)) continue
    const activity = lastForeignActivity(entry, actorEmail)
    const lastSeen = Math.max(Date.parse(seen.since) || 0, Date.parse(seen.cases[entry.id] ?? '') || 0)
    if (activity && Date.parse(activity) > lastSeen) result.add(entry.id)
  }
  return result
}