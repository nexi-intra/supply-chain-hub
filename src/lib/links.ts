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
