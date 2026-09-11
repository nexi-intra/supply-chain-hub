// Let deep-link-navigation på tværs af views uden router: et view (eller en
// komponent som notifikationscentret) kan bede App.tsx om at skifte view og
// samtidig aflevere one-shot-parametre (fx en bestemt fane eller forudfyldt
// søgning), som mål-viewet selv samler op ved mount.

export type AppViewId =
  | 'hub'
  | 'guides'
  | 'calendar'
  | 'shifts'
  | 'admin'
  | 'manager'
  | 'creator'
  | 'team'
  | 'email'
  | 'meals'
  | 'games'
  | 'projects'
  | 'notebook'

export interface NavigationParams {
  /** Fane som mål-viewet skal åbne på (fx ManagerPanels 'requests'-fane). */
  tab?: string
  /** Forudfyldt søgetekst i mål-viewets søgefelt. */
  search?: string
  /** Specifikt element (fx email- eller note-id) mål-viewet skal åbne. */
  itemId?: string
}

export const NAVIGATE_EVENT = 'tcd-hub:navigate'

let pendingParams: NavigationParams | null = null

/** Naviger til et view. Kan kaldes fra alle komponenter — App.tsx lytter. */
export function navigateTo(view: AppViewId, params?: NavigationParams) {
  pendingParams = params ?? null
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { view } }))
}

/** Mål-viewet henter (og rydder) sine parametre — one-shot, så et almindeligt
 *  senere besøg i viewet ikke genbruger gamle parametre. */
export function consumeNavigationParams(): NavigationParams | null {
  const params = pendingParams
  pendingParams = null
  return params
}
