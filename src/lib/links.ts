// Renderer side of the Link Library. The main process (electron/links.cjs) decides everything.

export type LinkStatus = 'pending' | 'approved' | 'rejected'
export type LinkReportReason = 'dead' | 'wrong' | 'suspicious'
export type LinkWarning = 'not-https' | 'ip-address' | 'shortener' | 'punycode' | 'credentials' | 'unusual-port'

export interface LibraryLink {
  id: string
  url: string
  domain: string
  title: string
  description: string
  category: string
  ownerTeamCode: string
  sharedWithTeamCodes: string[]
  status: LinkStatus
  /** Hidden for colleagues while a "suspicious" report is open. */
  hidden: boolean
  createdByName: string
  createdAt: string
  updatedAt: string
  mine: boolean
  canManage: boolean
  warnings: LinkWarning[]
  reviewNote?: string
  reviewedAt?: string | null
  /** Approved or rejected by a manager other than the person who added it. */
  reviewedByOther?: boolean
  openReports?: number
  openSuggestions?: number
  myReport: LinkReportReason | null
  mySuggestionPending: boolean
}

export interface LinkSuggestionReview {
  id: string
  linkId: string
  linkTitle: string
  current: { url: string; title: string; description: string; category: string }
  url?: string
  title?: string
  description?: string
  category?: string
  note: string
  byName: string
  at: string
  warnings: LinkWarning[]
}

export interface LinkReportReview {
  id: string
  linkId: string
  linkTitle: string
  url: string
  reason: LinkReportReason
  note: string
  byName: string
  at: string
}

export interface LinksSnapshot {
  actor: { teamCode: string; fullName: string; isManager: boolean }
  teams: Array<{ folderName: string; name: string }>
  links: LibraryLink[]
  review: { pending: LibraryLink[]; suggestions: LinkSuggestionReview[]; reports: LinkReportReview[] }
}

export interface LinkFields { url: string; title: string; description: string; category: string; sharedWithTeamCodes: string[] }

export type LinkCommand =
  | ({ operationId: string; type: 'create' } & LinkFields)
  | ({ operationId: string; type: 'update'; linkId: string } & LinkFields)
  | { operationId: string; type: 'approve'; linkId: string }
  | { operationId: string; type: 'delete'; linkId: string }
  | { operationId: string; type: 'reject'; linkId: string; note?: string }
  | { operationId: string; type: 'suggest'; linkId: string; url?: string; title?: string; description?: string; category?: string; note?: string }
  | { operationId: string; type: 'resolve-suggestion'; linkId: string; suggestionId: string; accept: boolean }
  | { operationId: string; type: 'report'; linkId: string; reason: LinkReportReason; note?: string }
  | { operationId: string; type: 'resolve-report'; linkId: string; reportId: string; action: 'dismiss' | 'delete' }

/** A command without its operation id (added when it is sent). */
export type LinkCommandInput = { [K in LinkCommand['type']]: Omit<Extract<LinkCommand, { type: K }>, 'operationId'> }[LinkCommand['type']]

export interface LinksApi {
  snapshot(): Promise<LinksSnapshot>
  command(command: LinkCommand): Promise<LibraryLink | { id: string; deleted?: boolean }>
  open(linkId: string): Promise<{ opened: true }>
  onChanged(callback: () => void): () => void
}

declare global {
  interface Window {
    electronLinks?: LinksApi
  }
}

export const linkFavoritesKey = (email: string) => `link-favorites-${email}`

/**
 * What the library will show after `command`, computed locally so the screen can show it at once – a save to the
 * shared drive takes up to 90 s. Mirrors apply() in electron/links.cjs for the commands the screen does not wait for;
 * the main process stays the authority and the snapshot is read again when the command is done.
 */
export function predictLinksCommand(snapshot: LinksSnapshot, command: LinkCommandInput): LinksSnapshot {
  const at = new Date().toISOString()
  const patchLink = (id: string, patch: (link: LibraryLink) => LibraryLink) => ({
    links: snapshot.links.map(link => link.id === id ? patch(link) : link),
    pending: snapshot.review.pending.map(link => link.id === id ? patch(link) : link),
  })
  const without = (id: string): LinksSnapshot => ({
    ...snapshot,
    links: snapshot.links.filter(link => link.id !== id),
    review: {
      pending: snapshot.review.pending.filter(link => link.id !== id),
      suggestions: snapshot.review.suggestions.filter(entry => entry.linkId !== id),
      reports: snapshot.review.reports.filter(entry => entry.linkId !== id),
    },
  })
  switch (command.type) {
    case 'delete':
      return without(command.linkId)
    case 'approve':
    case 'reject': {
      const status: LinkStatus = command.type === 'approve' ? 'approved' : 'rejected'
      const note = command.type === 'reject' ? command.note || '' : ''
      const { links } = patchLink(command.linkId, link => ({ ...link, status, reviewNote: note, reviewedAt: at, updatedAt: at }))
      return { ...snapshot, links, review: { ...snapshot.review, pending: snapshot.review.pending.filter(link => link.id !== command.linkId) } }
    }
    case 'suggest': {
      const { links, pending } = patchLink(command.linkId, link => ({ ...link, mySuggestionPending: true }))
      return { ...snapshot, links, review: { ...snapshot.review, pending } }
    }
    case 'report': {
      const { links, pending } = patchLink(command.linkId, link => ({ ...link, myReport: command.reason }))
      return { ...snapshot, links, review: { ...snapshot.review, pending } }
    }
    case 'resolve-suggestion': {
      const suggestion = snapshot.review.suggestions.find(entry => entry.id === command.suggestionId)
      const { links, pending } = patchLink(command.linkId, link => {
        const next = { ...link, openSuggestions: Math.max(0, (link.openSuggestions || 1) - 1) }
        if (!command.accept || !suggestion) return next
        for (const field of ['url', 'title', 'description', 'category'] as const) if (suggestion[field]) next[field] = suggestion[field]!
        return { ...next, updatedAt: at }
      })
      return { ...snapshot, links, review: { ...snapshot.review, pending, suggestions: snapshot.review.suggestions.filter(entry => entry.id !== command.suggestionId) } }
    }
    case 'resolve-report': {
      if (command.action === 'delete') return without(command.linkId)
      const { links, pending } = patchLink(command.linkId, link => ({ ...link, openReports: Math.max(0, (link.openReports || 1) - 1) }))
      return { ...snapshot, links, review: { ...snapshot.review, pending, reports: snapshot.review.reports.filter(entry => entry.id !== command.reportId) } }
    }
    default:
      return snapshot
  }
}

const predictionListeners = new Set<(snapshot: LinksSnapshot) => void>()

/** The library's predicted snapshot, also for the bell (which reads its own copy) until both read the saved one. */
export function publishLinksPrediction(snapshot: LinksSnapshot): void {
  predictionListeners.forEach(listener => listener(snapshot))
}

export function subscribeLinksPrediction(listener: (snapshot: LinksSnapshot) => void): () => void {
  predictionListeners.add(listener)
  return () => { predictionListeners.delete(listener) }
}

/** Same rule as electron/linkSafety.cjs, so the form can say so before sending. */
export function isAllowedLinkUrl(value: string): boolean {
  const text = value.trim()
  if (!text || text.length > 2048 || /\s/.test(text)) return false
  try {
    const url = new URL(text)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname
  } catch {
    return false
  }
}

/** Links matching a free-text search on title, description, category and domain. */
export function filterLinks(links: readonly LibraryLink[], query: string, category: string | null): LibraryLink[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return links.filter(link => {
    if (category && link.category !== category) return false
    const haystack = `${link.title} ${link.description} ${link.category} ${link.domain}`.toLowerCase()
    return words.every(word => haystack.includes(word))
  })
}
