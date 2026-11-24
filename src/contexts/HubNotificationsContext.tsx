import { createContext, useContext, type ReactNode } from 'react'
import { useHubNotificationItems, type HubNotificationsValue } from '@/hooks/useHubNotificationItems'

const EMPTY: HubNotificationsValue = { items: [], settled: false, multiplayer: { notifications: [], games: [], loaded: false, ready: false }, dismiss: () => {}, searchData: { emails: [], projects: [], personalTodos: [], guides: [], improvements: [], links: [] } }

const HubNotificationsContext = createContext<HubNotificationsValue>(EMPTY)

export function HubNotificationsProvider({ userEmail, children }: { userEmail: string; children: ReactNode }) {
  const value = useHubNotificationItems(userEmail)
  return <HubNotificationsContext.Provider value={value}>{children}</HubNotificationsContext.Provider>
}

export function useHubNotifications(): HubNotificationsValue {
  return useContext(HubNotificationsContext)
}
