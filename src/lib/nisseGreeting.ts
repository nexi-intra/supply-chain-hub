import type { NisseToday } from './nisse'

export const GREETING_SHOWN_KEY = 'tcd-hub:nisse-greeting'
export const FOUND_ANNOUNCED_KEY = 'tcd-hub:nisse-found-announced'

/**
 * The Christmas greeting at 10: once a day, on the front page only (it never interrupts scanning or a game), also for
 * those who switched the Christmas theme off – they get a button to switch it on and join.
 */
export function shouldGreet({ state, view, seasonOn, shownDate }: { state: NisseToday; view: string; seasonOn: boolean; shownDate: string | null }): boolean {
  if (!seasonOn || view !== 'hub') return false
  if (state.status !== 'hiding' && state.status !== 'found') return false
  return shownDate !== state.date
}

/** "The nisse was found" – once a day for everyone who plays, everywhere but the games; the winner already got a dialog. */
export function shouldAnnounceFound({ state, view, active, announcedDate, userEmail }: { state: NisseToday; view: string; active: boolean; announcedDate: string | null; userEmail: string }): boolean {
  if (!active || view === 'games' || state.status !== 'found') return false
  if (announcedDate === state.date) return false
  return state.finder.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()
}

/** Main answers with a fresh object every time; keeping the old one when nothing changed spares a redraw of the Hub. */
export function sameNisseState(a: NisseToday, b: NisseToday): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
