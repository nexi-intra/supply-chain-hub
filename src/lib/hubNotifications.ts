import type { Language } from './translations'
import type { NavigationTarget } from './appNavigation'
import { getReviewStatus, type Guide, type GuideReviewRequest } from './guideTypes'
import type { ImprovementCase, ImprovementNotification } from './improvements'
import { HIGH_FIVE_TARGET, type HighFiveReceived } from './highFives'
import { HIGH_FIVE_LABELS } from './highFivesLabels'
import type { MultiplayerGameEntry, MultiplayerNotification } from './multiplayer'
import { MULTIPLAYER_LABELS } from './multiplayerLabels'
import { multiplayerActorName, multiplayerNotificationGameType, multiplayerNotificationTarget } from './multiplayerNotifications'
import type { PersonalTodo } from './personalTodos'
import { todoDueStatus } from './todoDueDates'
import type { BirthdayEntry, Email, VacationEntry } from './types'
import type { LinksSnapshot } from './links'
import { danishTime, type NisseFind } from './nisse'
import type { Project } from '@/views/ProjectBoard'

export interface NotebookNotification {
  id: string
  type: 'note-edited'
  noteId: string
  noteTitle: string
  editedByName: string
  originalCreator: string
  timestamp: string
  read: boolean
}

export type HubNotificationKind =
  | 'email' | 'note' | 'improvement' | 'multiplayer' | 'high-five' | 'vacation' | 'guide' | 'guide-review' | 'birthday' | 'todo' | 'link' | 'nisse'

/** How a module learns that its notification was read, when the module keeps its own read state. */
export type HubNotificationAck =
  | { source: 'improvement'; caseId: string; notificationId: string }
  | { source: 'multiplayer'; notificationId: string }
  | { source: 'high-five'; notificationId: string }
  | { source: 'note'; notificationId: string }

/** One "needs your attention" entry; `id` is stable per occurrence and shared by the bell and Windows notifications. */
export interface HubNotificationItem {
  id: string
  kind: HubNotificationKind
  iconColor: string
  title: string
  subtitle: string
  timestamp: number
  target: NavigationTarget
  ack?: HubNotificationAck
}

export const DISMISSED_NOTIFICATIONS_LIMIT = 500

export const dismissedNotificationsKey = (userEmail: string) => `hub-notifications-dismissed-${userEmail}`

/** The dismissed ids with `ids` added last (no duplicates), keeping only the newest `DISMISSED_NOTIFICATIONS_LIMIT`. */
export function withDismissed(current: readonly string[] | undefined, ids: readonly string[]): string[] {
  const added = new Set(ids)
  const kept = (current || []).filter(id => !added.has(id))
  return [...kept, ...added].slice(-DISMISSED_NOTIFICATIONS_LIMIT)
}

export interface HubNotificationInput {
  userEmail: string
  language: Language
  now: number
  isAdminOrManager: boolean
  isGuideReviewer: boolean
  emails: readonly Email[] | undefined
  notebookNotifications: readonly NotebookNotification[] | undefined
  birthdays: readonly BirthdayEntry[] | undefined
  vacations: readonly VacationEntry[] | undefined
  guides: readonly Guide[] | undefined
  guideReviewRequests: readonly GuideReviewRequest[] | undefined
  /** Vacation requests the manager already saw in Manager Panel. */
  seenVacationRequestIds: readonly string[] | undefined
  personalTodos: readonly PersonalTodo[] | undefined
  projects: readonly Project[] | undefined
  improvementNotifications: ReadonlyArray<{ entry: ImprovementCase; notification: ImprovementNotification }>
  multiplayerNotifications: readonly MultiplayerNotification[]
  multiplayerGames: readonly MultiplayerGameEntry[]
  /** Unread high-fives the user received. */
  highFives: readonly HighFiveReceived[]
  /** Link Library: what waits for this manager, and the user's own links a manager has decided on. */
  links?: LinksSnapshot | null
  /** Nisse finds this season (the creator only). */
  nisseFinds?: readonly NisseFind[]
}

/** Local text per language; sv is always present wherever fi is. */
const pick = (language: Language, text: { da: string; en: string; fi: string; sv: string }) =>
  language === 'da' ? text.da : language === 'fi' ? text.fi : language === 'sv' ? text.sv : text.en

export function buildHubNotificationItems(input: HubNotificationInput): HubNotificationItem[] {
  const { userEmail, language, now } = input
  const result: HubNotificationItem[] = []

  for (const e of (input.emails || []).filter(mail => mail.to === userEmail && !mail.read && !mail.folderId)) {
    result.push({
      id: `email-${e.id}`,
      kind: 'email',
      iconColor: 'text-primary',
      title: e.subject,
      subtitle: pick(language, { da: `Fra ${e.from}`, en: `From ${e.from}`, fi: `${e.from}:stä`, sv: `Från ${e.from}` }),
      timestamp: e.timestamp,
      target: { view: 'email' },
    })
  }

  for (const n of (input.notebookNotifications || []).filter(note => !note.read && note.originalCreator === userEmail)) {
    result.push({
      id: `note-${n.id}`,
      kind: 'note',
      iconColor: 'text-accent',
      title: n.noteTitle,
      subtitle: pick(language, {
        da: `${n.editedByName} redigerede noten`,
        en: `${n.editedByName} edited the note`,
        fi: `${n.editedByName} muokattu viesti`,
        sv: `${n.editedByName} redigerade anteckningen`,
      }),
      timestamp: new Date(n.timestamp).getTime(),
      target: { view: 'notebook' },
      ack: { source: 'note', notificationId: n.id },
    })
  }

  for (const { entry, notification } of input.improvementNotifications) {
    result.push({
      id: `improvement-${notification.id}`,
      kind: 'improvement',
      iconColor: 'text-amber-500',
      title: entry.title,
      subtitle: notification.message,
      timestamp: Date.parse(notification.createdAt) || now,
      target: { view: 'improvements', params: { itemId: entry.id } },
      ack: { source: 'improvement', caseId: entry.id, notificationId: notification.id },
    })
  }

  const labels = MULTIPLAYER_LABELS[language]
  for (const notification of input.multiplayerNotifications) {
    const gameType = multiplayerNotificationGameType(input.multiplayerGames, notification)
    result.push({
      id: `multiplayer-${notification.id}`,
      kind: 'multiplayer',
      iconColor: 'text-emerald-600',
      title: labels.gameNames[gameType],
      subtitle: labels.notifications[notification.type](multiplayerActorName(input.multiplayerGames, notification), gameType),
      timestamp: Date.parse(notification.createdAt) || now,
      target: multiplayerNotificationTarget(notification),
      ack: { source: 'multiplayer', notificationId: notification.id },
    })
  }

  const highFiveLabels = HIGH_FIVE_LABELS[language]
  for (const highFive of input.highFives) {
    result.push({
      id: `high-five-${highFive.id}`,
      kind: 'high-five',
      iconColor: 'text-amber-500',
      title: highFiveLabels.notification(highFive.senderName, highFive.emoji),
      subtitle: highFive.message,
      timestamp: Date.parse(highFive.at) || now,
      target: HIGH_FIVE_TARGET,
      ack: { source: 'high-five', notificationId: highFive.id },
    })
  }

  // Nisselegen: only the organisers receive finds (main returns them to them alone) – they hand out the chocolate.
  for (const find of input.nisseFinds || []) {
    result.push({
      id: `nisse-${find.teamId}-${find.date}`,
      kind: 'nisse',
      iconColor: 'text-red-600',
      title: pick(language, { da: `🎅 ${find.name} fandt nissen`, en: `🎅 ${find.name} found the elf`, fi: `🎅 ${find.name} löysi tontun`, sv: `🎅 ${find.name} hittade tomten` }),
      subtitle: `${find.teamName} · ${pick(language, { da: 'kl.', en: 'at', fi: 'klo', sv: 'kl.' })} ${danishTime(find.at)}`,
      timestamp: Date.parse(find.at) || now,
      target: { view: 'hub' },
    })
  }

  if (input.isAdminOrManager) {
    const seenIds = input.seenVacationRequestIds || []
    for (const v of (input.vacations || []).filter(entry => entry.status === 'pending' && !seenIds.includes(entry.id))) {
      result.push({
        id: `vacation-${v.id}`,
        kind: 'vacation',
        iconColor: 'text-amber-600',
        title: pick(language, { da: 'Afventende ferieanmodning', en: 'Pending vacation request', fi: 'Odotetaan lomapyyntöä', sv: 'Väntande semesteransökan' }),
        subtitle: v.userEmail,
        timestamp: new Date(v.startDate).getTime() || now,
        target: { view: 'manager', params: { tab: 'vacation-requests' } },
      })
    }
  }

  for (const g of (input.guides || []).filter(guide => getReviewStatus(guide, now) === 'overdue')) {
    result.push({
      id: `guide-${g.id}-${g.nextReviewAt ?? 0}`,
      kind: 'guide',
      iconColor: 'text-destructive',
      title: pick(language, { da: 'Guide skal revideres', en: 'Guide needs review', fi: 'Opastarvekatsaus', sv: 'Guiden behöver granskas' }),
      subtitle: g.title,
      timestamp: g.nextReviewAt || now,
      target: { view: 'guides', params: { search: g.title } },
    })
  }

  const pendingGuideReviews = input.isGuideReviewer ? (input.guideReviewRequests || []).filter(request => request.status === 'pending') : []
  if (pendingGuideReviews.length > 0) {
    const count = pendingGuideReviews.length
    const latest = Math.max(...pendingGuideReviews.map(request => request.submittedAt))
    result.push({
      id: `guide-review-queue-${latest}`,
      kind: 'guide-review',
      iconColor: 'text-amber-600',
      title: pick(language, { da: 'Guides afventer review', en: 'Guides awaiting review', fi: 'Oppaita odottaa tarkistusta', sv: 'Guider väntar på granskning' }),
      subtitle: pick(language, {
        da: `${count} ${count === 1 ? 'guide' : 'guides'} i køen`,
        en: `${count} ${count === 1 ? 'guide' : 'guides'} in the queue`,
        fi: `${count} ${count === 1 ? 'opas' : 'opasta'} jonossa`,
        sv: `${count} ${count === 1 ? 'guide' : 'guider'} i kön`,
      }),
      timestamp: latest,
      target: { view: 'guides', params: { tab: 'review' } },
    })
  }

  const isoDate = new Date(now).toISOString()
  const todayKey = isoDate.slice(5, 10)
  for (const b of (input.birthdays || []).filter(entry => entry.birthday === todayKey)) {
    result.push({
      id: `birthday-${b.email}-${isoDate.slice(0, 10)}`,
      kind: 'birthday',
      iconColor: 'text-pink-500',
      title: pick(language, {
        da: `${b.fullName} har fødselsdag i dag!`,
        en: `${b.fullName}'s birthday today!`,
        fi: `${b.fullName}:n syntymäpäivä tänään!`,
        sv: `${b.fullName} fyller år idag!`,
      }),
      subtitle: pick(language, { da: 'Husk et tillykke 🎉', en: "Don't forget to say congrats 🎉", fi: 'Muista onnitella', sv: 'Glöm inte att gratulera 🎉' }),
      timestamp: now,
      target: { view: 'calendar' },
    })
  }

  // Due-date items: only to-dos that are really the user's own (personal, or a team to-do they are on or created).
  const nowDate = new Date(now)
  for (const todo of input.personalTodos || []) {
    if (todo.kind === 'event') continue
    const completed = (todo.status ?? (todo.done ? 'completed' : 'open')) === 'completed'
    const status = todoDueStatus(todo.dueDate, completed, nowDate)
    if (status !== 'overdue' && status !== 'today') continue
    const overdue = status === 'overdue'
    result.push({
      id: `todo-personal-${todo.id}-${status}`,
      kind: 'todo',
      iconColor: overdue ? 'text-destructive' : 'text-amber-600',
      title: todo.title,
      subtitle: overdue
        ? pick(language, { da: 'To-do er overskredet', en: 'To-do is overdue', fi: 'To-do on myöhässä', sv: 'Att göra-uppgiften är försenad' })
        : pick(language, { da: 'To-do forfalder i dag', en: 'To-do is due today', fi: 'To-don määräaika on tänään', sv: 'Att göra-uppgiften förfaller idag' }),
      timestamp: new Date(todo.dueDate!).getTime() || now,
      target: { view: 'projects', params: { tab: 'personal' } },
    })
  }

  for (const project of input.projects || []) {
    const isRelevant = project.createdBy === userEmail || (project.teamMembers || []).some(member => member.email === userEmail)
    if (!isRelevant) continue
    const status = todoDueStatus(project.dueDate, project.status === 'completed', nowDate)
    if (status !== 'overdue' && status !== 'today') continue
    const overdue = status === 'overdue'
    result.push({
      id: `todo-team-${project.id}-${status}`,
      kind: 'todo',
      iconColor: overdue ? 'text-destructive' : 'text-amber-600',
      title: project.title,
      subtitle: overdue
        ? pick(language, { da: 'Team to-do er overskredet', en: 'Team to-do is overdue', fi: 'Tiimin to-do on myöhässä', sv: 'Teamets att göra-uppgift är försenad' })
        : pick(language, { da: 'Team to-do forfalder i dag', en: 'Team to-do is due today', fi: 'Tiimin to-don määräaika on tänään', sv: 'Teamets att göra-uppgift förfaller idag' }),
      timestamp: new Date(project.dueDate!).getTime() || now,
      target: { view: 'projects', params: { tab: 'team' } },
    })
  }

  if (input.links) {
    const review = { view: 'links' as const, params: { tab: 'review' } }
    const at = (value: string | null | undefined) => (value ? Date.parse(value) : NaN) || now
    for (const link of input.links.review.pending) {
      result.push({
        id: `link-pending-${link.id}`, kind: 'link', iconColor: 'text-attention', title: link.title,
        subtitle: pick(language, { da: `${link.createdByName} venter på godkendelse af et link`, en: `${link.createdByName} is waiting for a link to be approved`, fi: `${link.createdByName} odottaa linkin hyväksyntää`, sv: `${link.createdByName} väntar på att en länk godkänns` }),
        timestamp: at(link.createdAt), target: review,
      })
    }
    for (const suggestion of input.links.review.suggestions) {
      result.push({
        id: `link-suggestion-${suggestion.id}`, kind: 'link', iconColor: 'text-primary', title: suggestion.linkTitle,
        subtitle: pick(language, { da: `${suggestion.byName} har foreslået en ændring`, en: `${suggestion.byName} suggested a change`, fi: `${suggestion.byName} ehdotti muutosta`, sv: `${suggestion.byName} föreslog en ändring` }),
        timestamp: at(suggestion.at), target: review,
      })
    }
    for (const report of input.links.review.reports) {
      result.push({
        id: `link-report-${report.id}`, kind: 'link', iconColor: report.reason === 'suspicious' ? 'text-destructive' : 'text-attention', title: report.linkTitle,
        subtitle: pick(language, { da: `${report.byName} har rapporteret linket`, en: `${report.byName} reported the link`, fi: `${report.byName} ilmoitti linkistä`, sv: `${report.byName} rapporterade länken` }),
        timestamp: at(report.at), target: review,
      })
    }
    const recent = (value: string | null | undefined) => now - at(value) < 14 * 24 * 3600 * 1000
    for (const link of input.links.links.filter(entry => entry.mine && entry.reviewedByOther && entry.reviewedAt && entry.status !== 'pending' && recent(entry.reviewedAt))) {
      const approved = link.status === 'approved'
      result.push({
        id: `link-reviewed-${link.id}-${link.reviewedAt}`, kind: 'link', iconColor: approved ? 'text-ok' : 'text-destructive', title: link.title,
        subtitle: approved
          ? pick(language, { da: 'Dit link er godkendt', en: 'Your link was approved', fi: 'Linkkisi hyväksyttiin', sv: 'Din länk har godkänts' })
          : pick(language, { da: 'Dit link blev afvist', en: 'Your link was rejected', fi: 'Linkkisi hylättiin', sv: 'Din länk avvisades' }),
        timestamp: at(link.reviewedAt), target: { view: 'links', params: { itemId: link.id } },
      })
    }
  }

  return result.sort((a, b) => b.timestamp - a.timestamp)
}

export interface NotificationDiffState {
  known: ReadonlySet<string>
  baselined: boolean
}

export interface NotificationDiff<T extends { id: string }> {
  state: NotificationDiffState
  fresh: T[]
}

/**
 * Splits `items` into those that appeared since the last call. Everything seen before the baseline is
 * ready is only remembered, so the notifications that exist at sign-in are never reported as new.
 */
export function diffNotifications<T extends { id: string }>(state: NotificationDiffState, items: readonly T[], baselineReady: boolean): NotificationDiff<T> {
  const known = new Set(state.known)
  const fresh = state.baselined ? items.filter(item => !known.has(item.id)) : []
  for (const item of items) known.add(item.id)
  return { state: { known, baselined: state.baselined || baselineReady }, fresh }
}
