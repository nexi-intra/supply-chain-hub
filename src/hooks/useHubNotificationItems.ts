import { acknowledgeMultiplayerNotifications } from '@/lib/multiplayerAcknowledge'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKV } from '@/hooks/useKV'
import { useImprovementNotificationState } from '@/hooks/useImprovementNotifications'
import { useCountNotifications } from '@/hooks/useCountNotifications'
import { useHighFives } from '@/hooks/useHighFives'
import { useMultiplayerNotifications, type MultiplayerNotificationState } from '@/hooks/useMultiplayerNotifications'
import { useLanguage } from '@/contexts/LanguageContext'
import { buildHubNotificationItems, dismissedNotificationsKey, withDismissed, type HubNotificationItem, type NotebookNotification } from '@/lib/hubNotifications'
import { newOperationId } from '@/lib/multiplayerView'
import { upsertInKvArray } from '@/lib/kvArrays'
import { personalTodosKey, type PersonalTodo } from '@/lib/personalTodos'
import { hasManagerAccess } from '@/lib/userRoles'
import type { Guide, GuideReviewRequest } from '@/lib/guideTypes'
import type { ImprovementCase } from '@/lib/improvements'
import type { BirthdayEntry, Email, VacationEntry } from '@/lib/types'
import { subscribeLinksPrediction, type LibraryLink, type LinksSnapshot } from '@/lib/links'
import type { NisseFind } from '@/lib/nisse'
import type { Project } from '@/views/ProjectBoard'

/** Data this hook already holds in memory; the Ctrl+K palette searches it without extra reads. */
export interface HubSearchData {
  emails: Email[]
  projects: Project[]
  personalTodos: PersonalTodo[]
  guides: Guide[]
  improvements: ImprovementCase[]
  links: LibraryLink[]
}

export interface HubNotificationsValue {
  /** What the bell shows: everything that needs attention minus what the user removed. */
  items: HubNotificationItem[]
  /** True once the snapshot-based sources have answered; the KV sources are covered by a short grace period. */
  settled: boolean
  multiplayer: MultiplayerNotificationState
  /** Removes notifications for good (clicked or deleted) and marks them read in the module they came from. */
  dismiss: (ids: readonly string[]) => void
  searchData: HubSearchData
}

const CLOCK_TICK_MS = 5 * 60 * 1000
const HIGH_FIVE_ACK_BATCH = 100

/** Marks the given notebook notifications read with one read and one atomic write. */
async function markNotesRead(notificationIds: readonly string[]) {
  const wanted = new Set(notificationIds)
  const current = (await window.kv.get<NotebookNotification[]>('notebook-notifications')) || []
  const unread = current.filter(note => wanted.has(note.id) && !note.read)
  if (unread.length) await upsertInKvArray('notebook-notifications', unread.map(note => ({ ...note, read: true })))
}

/** Best effort: the dismissed list already hides the item, the module ack also clears it there and on other PCs. */
function acknowledgeInModules(items: readonly HubNotificationItem[]) {
  const improvements = typeof window === 'undefined' ? undefined : window.electronImprovements
  const multiplayer = typeof window === 'undefined' ? undefined : window.electronMultiplayer
  const highFives = typeof window === 'undefined' ? undefined : window.electronHighFives
  const multiplayerIds: string[] = []
  const highFiveIds: string[] = []
  const noteIds: string[] = []
  for (const { ack } of items) {
    if (ack?.source === 'improvement') {
      void improvements?.command({ operationId: newOperationId(), type: 'acknowledge', caseId: ack.caseId, notificationId: ack.notificationId }).catch(() => {})
    } else if (ack?.source === 'multiplayer') multiplayerIds.push(ack.notificationId)
    else if (ack?.source === 'high-five') highFiveIds.push(ack.notificationId)
    else if (ack?.source === 'note') noteIds.push(ack.notificationId)
  }
  if (noteIds.length && typeof window !== 'undefined' && window.kv) void markNotesRead(noteIds).catch(() => {})
  if (multiplayer && multiplayerIds.length) void acknowledgeMultiplayerNotifications(multiplayerIds).catch(() => {})
  for (let start = 0; highFives && start < highFiveIds.length; start += HIGH_FIVE_ACK_BATCH) {
    const ids = highFiveIds.slice(start, start + HIGH_FIVE_ACK_BATCH)
    void highFives.command({ operationId: newOperationId(), type: 'acknowledge', ids }).catch(() => {})
  }
}

/**
 * Every "needs your attention" item the bell shows, from the same sources the Hub reads. Mounted once
 * above all views so the bell and the Windows-notification bridge share a single set of listeners.
 */
export function useHubNotificationItems(userEmail: string): HubNotificationsValue {
  const { language } = useLanguage()
  const [isAdminOrManager, setIsAdminOrManager] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [emails] = useKV<Email[]>('emails', [])
  const [vacations] = useKV<VacationEntry[]>('vacation-entries', [])
  const [guides] = useKV<Guide[]>('guides', [])
  const [guideReviewRequests] = useKV<GuideReviewRequest[]>('guide-review-requests', [], { initializeIfMissing: false })
  const [guideAdminEmails] = useKV<string[]>('guide-admin-emails', [], { initializeIfMissing: false })
  const [seenVacationRequestIds] = useKV<string[]>(`seen-vacation-requests-${userEmail}`, [])
  const [projects] = useKV<Project[]>('projects', [])
  const [personalTodos] = useKV<PersonalTodo[]>(personalTodosKey(userEmail), [])
  const [notebookNotifications] = useKV<NotebookNotification[]>('notebook-notifications', [])
  const [birthdays] = useKV<BirthdayEntry[]>('employee-birthdays', [])
  const [dismissedIds, setDismissedIds] = useKV<string[]>(dismissedNotificationsKey(userEmail), [], { initializeIfMissing: false })
  const improvements = useImprovementNotificationState(userEmail)
  const multiplayer = useMultiplayerNotifications(userEmail)
  const highFives = useHighFives(userEmail)
  const counts = useCountNotifications(userEmail)
  const [links, setLinks] = useState<LinksSnapshot | null>(null)
  const [nisseFinds, setNisseFinds] = useState<NisseFind[]>([])

  // Nisse finds reach the creator only (main returns [] to everyone else and reads nothing outside the season).
  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronNisse
    if (!api || !userEmail) return
    let active = true
    const load = () => { api.finds().then(value => { if (active) setNisseFinds(value) }, () => {}) }
    load()
    const stop = api.onChanged(load)
    return () => { active = false; stop() }
  }, [userEmail])

  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronLinks
    if (!api || !userEmail) return
    let active = true
    const load = () => { api.snapshot().then(value => { if (active) setLinks(value) }, () => {}) }
    load()
    const stop = api.onChanged(load)
    // A command in the Link Library is shown here at once too, not only when it is saved.
    const stopPrediction = subscribeLinksPrediction(value => { if (active) setLinks(value) })
    return () => { active = false; stop(); stopPrediction() }
  }, [userEmail])

  useEffect(() => {
    let active = true
    setIsAdminOrManager(false)
    hasManagerAccess(userEmail).then(access => { if (active) setIsAdminOrManager(access) }).catch(() => {})
    return () => { active = false }
  }, [userEmail])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const isGuideReviewer = isAdminOrManager || (guideAdminEmails || []).some(email => email.trim().toLowerCase() === userEmail.trim().toLowerCase())

  const allItems = useMemo(() => buildHubNotificationItems({
    userEmail, language, now, isAdminOrManager, isGuideReviewer,
    emails, notebookNotifications, birthdays, vacations, guides, guideReviewRequests,
    seenVacationRequestIds, personalTodos, projects,
    improvementNotifications: improvements.items,
    multiplayerNotifications: multiplayer.notifications,
    multiplayerGames: multiplayer.games,
    highFives: highFives.unread,
    links,
    nisseFinds,
    countNotifications: counts.items,
  }), [userEmail, language, now, isAdminOrManager, isGuideReviewer, emails, notebookNotifications, birthdays, vacations, guides, guideReviewRequests, seenVacationRequestIds, personalTodos, projects, improvements.items, multiplayer.notifications, multiplayer.games, highFives.unread, links, nisseFinds, counts.items])

  const items = useMemo(() => {
    const dismissed = new Set(dismissedIds || [])
    return dismissed.size ? allItems.filter(item => !dismissed.has(item.id)) : allItems
  }, [allItems, dismissedIds])

  const allItemsRef = useRef(allItems)
  allItemsRef.current = allItems
  const dismiss = useCallback((ids: readonly string[]) => {
    if (!ids.length) return
    void setDismissedIds(current => withDismissed(current, ids)).catch(() => {})
    const wanted = new Set(ids)
    acknowledgeInModules(allItemsRef.current.filter(item => wanted.has(item.id)))
  }, [setDismissedIds])

  const settled = improvements.loaded && multiplayer.loaded && highFives.loaded && counts.loaded
  const searchData = useMemo<HubSearchData>(() => ({ emails, projects, personalTodos, guides, improvements: improvements.cases, links: links?.links ?? [] }), [emails, projects, personalTodos, guides, improvements.cases, links])
  return useMemo(() => ({ items, settled, multiplayer, dismiss, searchData }), [items, settled, multiplayer, dismiss, searchData])
}
