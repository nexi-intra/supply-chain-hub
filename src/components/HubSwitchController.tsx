import { useEffect } from 'react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { getHubAccessLabels } from '@/lib/hubAccessLabels'
import { HUB_SWITCH_EVENT } from '@/lib/hubSwitch'

// Another pc removes the access, so this one only notices by asking now and then.
const CHECK_MS = 60_000

interface HubSwitchControllerProps {
  onSwitch: (folderName: string) => Promise<boolean>
  onOpenPicker: () => void
}

/** Carries out hub switch requests and sends the person home when access to the open hub is removed. */
export function HubSwitchController({ onSwitch, onOpenPicker }: HubSwitchControllerProps) {
  const { language } = useLanguage()

  useEffect(() => {
    const labels = getHubAccessLabels(language)
    const handleRequest = async (event: Event) => {
      const folderName = (event as CustomEvent<{ folderName?: string }>).detail?.folderName
      if (!folderName) { onOpenPicker(); return }
      if (!await onSwitch(folderName)) toast.error(labels.switchFailed)
    }
    window.addEventListener(HUB_SWITCH_EVENT, handleRequest)
    return () => window.removeEventListener(HUB_SWITCH_EVENT, handleRequest)
  }, [language, onSwitch, onOpenPicker])

  useEffect(() => {
    const registry = window.electronRegistry
    if (!registry) return
    const labels = getHubAccessLabels(language)
    let checking = false
    const check = async () => {
      if (checking) return
      checking = true
      try {
        const [hubs, current, actor] = await Promise.all([registry.listMyHubs(), registry.getCurrentTeam(), window.electronAuth?.current()])
        // The creator may open every team, not only the hubs in the list.
        if (!current || actor?.role === 'creator' || hubs.some(hub => hub.folderName === current.folderName)) return
        const home = hubs.find(hub => hub.home)
        if (home && await onSwitch(home.folderName)) toast.info(labels.accessRemoved(current.name), { duration: 8000 })
      } catch { /* the next check tries again */ } finally { checking = false }
    }
    const timer = setInterval(check, CHECK_MS)
    const unsubscribe = registry.onHubsChanged(check)
    return () => { clearInterval(timer); unsubscribe() }
  }, [language, onSwitch])

  return null
}
