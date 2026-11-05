// Pure ranking and index building for the Ctrl+K palette; callers pass only data the signed-in user already has in the app.
import type { NavigationParams } from './appNavigation'
import type { CommandSearchGroupId, CommandSearchLabels } from './commandSearchLabels'

export type CommandSearchGroup = CommandSearchGroupId

export const GROUP_ORDER: readonly CommandSearchGroup[] = ['modules', 'guides', 'knowledge', 'links', 'people', 'notes', 'todos', 'improvements', 'messages']
export const MAX_PER_GROUP = 8
export const MAX_TOTAL = 40
const MIN_CONTENT_QUERY_LENGTH = 2
const MAX_MESSAGES = 1000

export interface CommandSearchEntry {
  id: string
  group: CommandSearchGroup
  /** Module id or content kind; the palette maps it to an icon. */
  icon: string
  title: string
  /** Short secondary line, e.g. "Guide · TCD". */
  detail: string
  /** Extra searchable text such as tags, category or e-mail. */
  terms: string[]
  target: { view: string; params?: NavigationParams }
}

export interface CommandSearchGroupResult { group: CommandSearchGroup; entries: CommandSearchEntry[] }

interface IndexedEntry { entry: CommandSearchEntry; title: string; terms: string[] }

const SPECIAL_LETTERS: Record<string, string> = { æ: 'ae', ø: 'o', å: 'a', ä: 'a', ö: 'o', ß: 'ss', œ: 'oe', ð: 'd', þ: 'th', đ: 'd', ł: 'l' }

/** Lower-cases, strips accents, folds Nordic letters and turns punctuation into single spaces. */
export function foldSearchText(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[æøåäößœðþđł]/g, letter => SPECIAL_LETTERS[letter] ?? letter)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function indexCommandEntries(entries: readonly CommandSearchEntry[]): IndexedEntry[] {
  return entries.map(entry => ({ entry, title: foldSearchText(entry.title), terms: entry.terms.map(foldSearchText).filter(Boolean) }))
}

function tokenScore(item: IndexedEntry, token: string): number {
  if (item.title.startsWith(token)) return 700
  if (item.title.includes(` ${token}`)) return 600
  if (item.title.includes(token)) return 400
  let best = 0
  for (const term of item.terms) {
    if (term.startsWith(token)) best = Math.max(best, 250)
    else if (term.includes(` ${token}`)) best = Math.max(best, 220)
    else if (term.includes(token)) best = Math.max(best, 150)
  }
  return best
}

function scoreEntry(item: IndexedEntry, query: string, tokens: readonly string[]): number {
  if (item.title === query) return 1000
  if (item.title.startsWith(query)) return 800
  let sum = 0
  for (const token of tokens) {
    const score = tokenScore(item, token)
    if (!score) return 0
    sum += score
  }
  const average = sum / tokens.length
  return item.title.includes(query) ? Math.max(average, 500) : average
}

const groupRank = (group: CommandSearchGroup) => GROUP_ORDER.indexOf(group)

/** Ranked, grouped results. An empty query returns every module in its given order and nothing else. */
export function searchCommandEntries(index: readonly IndexedEntry[], rawQuery: string): CommandSearchGroupResult[] {
  const query = foldSearchText(rawQuery)
  if (!query) {
    const modules = index.filter(item => item.entry.group === 'modules').map(item => item.entry)
    return modules.length ? [{ group: 'modules', entries: modules }] : []
  }
  const tokens = query.split(' ')
  const contentAllowed = query.replace(/ /g, '').length >= MIN_CONTENT_QUERY_LENGTH
  const scored: Array<{ entry: CommandSearchEntry; score: number }> = []
  for (const item of index) {
    if (item.entry.group !== 'modules' && !contentAllowed) continue
    const score = scoreEntry(item, query, tokens)
    if (score > 0) scored.push({ entry: item.entry, score })
  }
  const compare = (a: { entry: CommandSearchEntry; score: number }, b: { entry: CommandSearchEntry; score: number }) =>
    b.score - a.score
    || groupRank(a.entry.group) - groupRank(b.entry.group)
    || a.entry.title.length - b.entry.title.length
    || a.entry.title.localeCompare(b.entry.title)
  scored.sort(compare)
  const perGroup = new Map<CommandSearchGroup, number>()
  let kept = scored.filter(item => {
    const count = perGroup.get(item.entry.group) ?? 0
    perGroup.set(item.entry.group, count + 1)
    return count < MAX_PER_GROUP
  })
  // Already sorted by score then group rank, so the cut drops the weakest hits.
  if (kept.length > MAX_TOTAL) kept = kept.slice(0, MAX_TOTAL)
  return GROUP_ORDER
    .map(group => ({ group, entries: kept.filter(item => item.entry.group === group).map(item => item.entry) }))
    .filter(result => result.entries.length > 0)
}

// ---------------------------------------------------------------- sources

export interface SearchGuide { id: string; title: string; category?: string; tags?: string[]; sharedWithTeamCodes?: string[] }
export interface SearchNote { id: string; title: string; creatorEmail: string; isPersonal?: boolean; tags?: string[] }
export interface SearchProject { id: string; title: string; status?: string }
export interface SearchTodo { id: string; title: string; status?: string; done?: boolean }
export interface SearchImprovement { id: string; title: string; status: string; deletedAt?: string }
export interface SearchLink { id: string; title: string; description?: string; category?: string; domain?: string; status: string; hidden?: boolean }
export interface SearchEmail { id: string; from: string; to: string; subject?: string; timestamp?: number; folderId?: string }
export interface SearchFolder { id: string; userId: string }
export interface SearchUser { email?: string; fullName?: string; role?: string; isManager?: boolean; status?: string }
export type SearchUsers = Record<string, SearchUser> | null | undefined

/** Each source is optional so groups can appear as their data arrives; a missing source yields no entries. */
export interface CommandSearchSources {
  userEmail: string
  /** Folder name of the signed-in user's team; decides which shared guides are readable. */
  teamCode?: string
  teamLabel?: string
  creatorEmail?: string | null
  guides?: SearchGuide[]
  sharedGuides?: SearchGuide[]
  articles?: SearchGuide[]
  sharedArticles?: SearchGuide[]
  users?: SearchUsers
  otherTeams?: Array<{ label: string; users: SearchUsers }>
  notes?: SearchNote[]
  projects?: SearchProject[]
  personalTodos?: SearchTodo[]
  improvements?: SearchImprovement[]
  /** The Link Library snapshot; only approved links that are not reported as suspicious are searchable. */
  links?: SearchLink[]
  emails?: SearchEmail[]
  folders?: SearchFolder[]
}

const normalize = (value: string | undefined | null) => String(value ?? '').trim().toLowerCase()
const joinDetail = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' · ')
const asArray = <T,>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : [])

function libraryEntries(group: 'guides' | 'knowledge', own: SearchGuide[] | undefined, shared: SearchGuide[] | undefined, sources: CommandSearchSources, labels: CommandSearchLabels): CommandSearchEntry[] {
  if (!own && !shared) return []
  const isShared = (guide: SearchGuide) => (guide.sharedWithTeamCodes?.length || 0) > 0
  // Same rule as the library view: own non-shared items plus shared ones tagged with my team.
  const visible = new Map<string, { guide: SearchGuide; shared: boolean }>()
  for (const guide of asArray(own)) if (guide?.id && !isShared(guide)) visible.set(guide.id, { guide, shared: false })
  for (const guide of asArray(shared)) if (guide?.id && sources.teamCode && guide.sharedWithTeamCodes?.includes(sources.teamCode)) visible.set(guide.id, { guide, shared: true })
  const kind = group === 'guides' ? labels.guide : labels.article
  return [...visible.values()].filter(({ guide }) => typeof guide.title === 'string' && guide.title.trim()).map(({ guide, shared: isSharedGuide }) => ({
    id: `${group}:${guide.id}`,
    group,
    icon: group === 'guides' ? 'guide' : 'article',
    title: guide.title,
    detail: joinDetail(kind, isSharedGuide ? labels.shared : sources.teamLabel),
    terms: [guide.category, ...asArray(guide.tags)].filter((term): term is string => typeof term === 'string' && Boolean(term)),
    target: { view: group, params: { itemId: guide.id } },
  }))
}

function roleLabel(user: SearchUser, labels: CommandSearchLabels): string | undefined {
  const role = normalize(user.role)
  if (role === 'creator') return labels.creator
  if (role === 'manager' || role === 'admin' || user.isManager) return labels.manager
  return undefined
}

function peopleEntries(sources: CommandSearchSources, labels: CommandSearchLabels): CommandSearchEntry[] {
  if (!sources.users && !sources.otherTeams) return []
  const creator = normalize(sources.creatorEmail)
  const seen = new Set<string>()
  const result: CommandSearchEntry[] = []
  const add = (users: SearchUsers, teamLabel: string | undefined) => {
    if (!users || typeof users !== 'object' || Array.isArray(users)) return
    for (const [key, user] of Object.entries(users)) {
      const email = normalize(user?.email || key)
      const name = typeof user?.fullName === 'string' ? user.fullName.trim() : ''
      if (!user || !email || !name || seen.has(email) || email === creator) continue
      if (user.status && user.status !== 'approved') continue
      seen.add(email)
      const role = roleLabel(user, labels)
      result.push({
        id: `people:${email}`,
        group: 'people',
        icon: 'person',
        title: name,
        detail: joinDetail(labels.colleague, teamLabel, role),
        terms: [email, teamLabel, role].filter((term): term is string => Boolean(term)),
        target: { view: 'team', params: { search: name } },
      })
    }
  }
  add(sources.users, sources.teamLabel)
  for (const team of asArray(sources.otherTeams)) add(team.users, team.label)
  return result
}

function noteEntries(sources: CommandSearchSources, labels: CommandSearchLabels): CommandSearchEntry[] {
  const me = normalize(sources.userEmail)
  return asArray(sources.notes)
    .filter(note => note?.id && typeof note.title === 'string' && note.title.trim() && (!note.isPersonal || normalize(note.creatorEmail) === me))
    .map(note => ({
      id: `notes:${note.id}`,
      group: 'notes' as const,
      icon: note.isPersonal ? 'note-personal' : 'note',
      title: note.title,
      detail: joinDetail(labels.note, note.isPersonal ? labels.notePrivate : labels.shared),
      terms: asArray(note.tags),
      target: { view: 'notebook', params: { search: note.title, tab: note.isPersonal ? 'personal' : 'shared' } },
    }))
}

function todoEntries(sources: CommandSearchSources, labels: CommandSearchLabels): CommandSearchEntry[] {
  const result: CommandSearchEntry[] = []
  for (const todo of asArray(sources.personalTodos)) {
    if (!todo?.id || typeof todo.title !== 'string' || !todo.title.trim()) continue
    const done = todo.status === 'completed' || todo.done === true
    result.push({
      id: `todos:personal:${todo.id}`, group: 'todos', icon: 'todo', title: todo.title,
      detail: joinDetail(labels.todo, labels.todoPersonal, done && labels.todoDone), terms: [],
      target: { view: 'projects', params: { tab: 'personal' } },
    })
  }
  for (const project of asArray(sources.projects)) {
    if (!project?.id || typeof project.title !== 'string' || !project.title.trim()) continue
    result.push({
      id: `todos:team:${project.id}`, group: 'todos', icon: 'project', title: project.title,
      detail: joinDetail(labels.todo, labels.todoTeam, project.status === 'completed' && labels.todoDone), terms: [],
      target: { view: 'projects', params: { tab: 'team', search: project.title } },
    })
  }
  return result
}

function improvementEntries(sources: CommandSearchSources, labels: CommandSearchLabels): CommandSearchEntry[] {
  return asArray(sources.improvements)
    .filter(item => item?.id && !item.deletedAt && typeof item.title === 'string' && item.title.trim())
    .map(item => ({
      id: `improvements:${item.id}`, group: 'improvements' as const, icon: 'improvement', title: item.title,
      detail: joinDetail(labels.improvement, labels.improvementStatuses[item.status] ?? item.status), terms: [],
      target: { view: 'improvements', params: { itemId: item.id } },
    }))
}

function linkEntries(sources: CommandSearchSources, labels: CommandSearchLabels): CommandSearchEntry[] {
  return asArray(sources.links)
    .filter(link => link?.id && link.status === 'approved' && !link.hidden && typeof link.title === 'string' && link.title.trim())
    .map(link => ({
      id: `links:${link.id}`, group: 'links' as const, icon: 'link', title: link.title,
      detail: joinDetail(labels.link, link.domain),
      terms: [link.description, link.category, link.domain].filter((term): term is string => typeof term === 'string' && Boolean(term)),
      target: { view: 'links', params: { itemId: link.id } },
    }))
}

function messageEntries(sources: CommandSearchSources, labels: CommandSearchLabels): CommandSearchEntry[] {
  if (!sources.emails) return []
  const me = normalize(sources.userEmail)
  const myFolders = new Set(asArray(sources.folders).filter(folder => normalize(folder?.userId) === me).map(folder => folder.id))
  const names = new Map<string, string>()
  if (sources.users && typeof sources.users === 'object' && !Array.isArray(sources.users)) {
    for (const [key, user] of Object.entries(sources.users)) if (user?.fullName) names.set(normalize(user.email || key), user.fullName)
  }
  const mine = asArray(sources.emails)
    .filter(mail => mail?.id && (normalize(mail.to) === me || normalize(mail.from) === me))
    // Mail filed in someone else's folder is not shown anywhere for me.
    .filter(mail => !mail.folderId || myFolders.has(mail.folderId))
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, MAX_MESSAGES)
  return mine.map(mail => {
    const inbound = normalize(mail.to) === me
    const other = normalize(inbound ? mail.from : mail.to)
    const otherName = names.get(other) || (inbound ? mail.from : mail.to)
    const subject = (mail.subject || '').trim()
    const params: NavigationParams = {}
    if (mail.folderId) { params.tab = 'folder'; params.itemId = mail.folderId } else if (!inbound) params.tab = 'sent'
    if (subject) params.search = subject
    return {
      id: `messages:${mail.id}`, group: 'messages' as const, icon: 'message', title: subject || labels.noSubject,
      detail: joinDetail(labels.message, `${inbound ? labels.messageFrom : labels.messageTo} ${otherName}`), terms: [other],
      target: { view: 'email', params },
    }
  })
}

export function buildCommandSearchEntries(sources: CommandSearchSources, labels: CommandSearchLabels): CommandSearchEntry[] {
  return [
    ...libraryEntries('guides', sources.guides, sources.sharedGuides, sources, labels),
    ...libraryEntries('knowledge', sources.articles, sources.sharedArticles, sources, labels),
    ...linkEntries(sources, labels),
    ...peopleEntries(sources, labels),
    ...noteEntries(sources, labels),
    ...todoEntries(sources, labels),
    ...improvementEntries(sources, labels),
    ...messageEntries(sources, labels),
  ]
}

export function moduleEntries(modules: ReadonlyArray<{ id: string; label: string }>): CommandSearchEntry[] {
  return modules.map(module => ({ id: `modules:${module.id}`, group: 'modules' as const, icon: module.id, title: module.label, detail: '', terms: [], target: { view: module.id } }))
}
