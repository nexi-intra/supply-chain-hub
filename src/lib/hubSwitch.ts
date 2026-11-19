// One way to change hub, used by the picker, the profile menu, Ctrl+K and the hub header.
// App.tsx owns the switch: it changes the active team and remounts every module on fresh data.
export const HUB_SWITCH_EVENT = 'hub:switch'
export const HUB_SWITCHED_EVENT = 'hub:switched'

/** Without a folder the hub picker opens; with one the hub switches straight away. */
export function requestHubSwitch(folderName?: string) {
  window.dispatchEvent(new CustomEvent(HUB_SWITCH_EVENT, { detail: { folderName } }))
}

const lastHubKey = (userId: string) => `last-hub-${userId}`

export function rememberedHub(userId: string): string | null {
  try { return localStorage.getItem(lastHubKey(userId)) } catch { return null }
}

export function rememberHub(userId: string, folderName: string) {
  try { localStorage.setItem(lastHubKey(userId), folderName) } catch { /* the choice is only a convenience */ }
}
