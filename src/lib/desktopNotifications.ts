import type { Language } from './translations'
import type { AppViewId, NavigationParams, NavigationTarget } from './appNavigation'
import type { HubNotificationItem } from './hubNotifications'

/** Mirrors LIMITS in electron/desktopNotifications.cjs; the main process stays the authority. */
export const DESKTOP_NOTIFICATION_LIMITS = { id: 200, title: 120, body: 300, param: 200 } as const

export interface DesktopNotificationRequest {
  id: string
  title: string
  body: string
  target: NavigationTarget | null
  language: Language
}

export interface DesktopNotificationsApi {
  notify(request: DesktopNotificationRequest): Promise<string>
  isEnabled(): Promise<boolean>
  setEnabled(enabled: boolean): Promise<boolean>
  /** `notificationId` is the bell item that was clicked, so it can be removed there too. */
  onNavigate(callback: (target: { view: AppViewId; params?: NavigationParams }, notificationId?: string) => void): () => void
}

declare global {
  interface Window {
    electronDesktopNotifications?: DesktopNotificationsApi
  }
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`)

export function toDesktopRequest(item: HubNotificationItem, language: Language): DesktopNotificationRequest {
  const params = item.target.params
  const clipped: NavigationParams = {}
  for (const key of ['tab', 'itemId', 'search'] as const) {
    const value = params?.[key]
    if (typeof value === 'string') clipped[key] = value.slice(0, DESKTOP_NOTIFICATION_LIMITS.param)
  }
  return {
    id: item.id.slice(0, DESKTOP_NOTIFICATION_LIMITS.id),
    title: clip(item.title.trim() || item.subtitle.trim() || 'Supply Chain Hub', DESKTOP_NOTIFICATION_LIMITS.title),
    body: clip(item.subtitle, DESKTOP_NOTIFICATION_LIMITS.body),
    target: params ? { view: item.target.view, params: clipped } : { view: item.target.view },
    language,
  }
}
