import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useHubNotifications } from '@/contexts/HubNotificationsContext'
import { APP_VIEW_IDS, navigateTo } from '@/lib/appNavigation'
import { toDesktopRequest } from '@/lib/desktopNotifications'
import { diffNotifications, type NotificationDiffState } from '@/lib/hubNotifications'

/** Notifications already present while the sources load are the baseline; they are remembered, never shown. */
const BASELINE_GRACE_MS = 12_000
/** Upper bound on waiting for a slow snapshot before treating what we have as the baseline. */
const BASELINE_MAX_MS = 45_000

/**
 * Always-mounted while signed in: feeds every item the bell shows into the Windows notifier (the main process
 * dedupes by id, skips focused windows and rate-limits) and opens the right module when a toast is clicked.
 */
export function DesktopNotificationBridge() {
  const { language } = useLanguage()
  const { items, settled, dismiss } = useHubNotifications()
  const api = typeof window === 'undefined' ? undefined : window.electronDesktopNotifications
  const [graceOver, setGraceOver] = useState(false)
  const [maxOver, setMaxOver] = useState(false)
  const diffState = useRef<NotificationDiffState>({ known: new Set(), baselined: false })
  const languageRef = useRef(language)
  languageRef.current = language

  useEffect(() => {
    const grace = setTimeout(() => setGraceOver(true), BASELINE_GRACE_MS)
    const max = setTimeout(() => setMaxOver(true), BASELINE_MAX_MS)
    return () => { clearTimeout(grace); clearTimeout(max) }
  }, [])

  useEffect(() => {
    if (!api) return
    return api.onNavigate((target, notificationId) => {
      if (notificationId) dismiss([notificationId])
      if (target && (APP_VIEW_IDS as readonly string[]).includes(target.view)) navigateTo(target.view, target.params)
    })
  }, [api, dismiss])

  const baselineReady = graceOver && (settled || maxOver)
  useEffect(() => {
    if (!api) return
    const { state, fresh } = diffNotifications(diffState.current, items, baselineReady)
    diffState.current = state
    // Oldest first, so the newest ends up on top of the Windows notification stack.
    for (const item of [...fresh].reverse()) {
      void api.notify(toDesktopRequest(item, languageRef.current)).catch(() => {})
    }
  }, [api, items, baselineReady])

  return null
}
