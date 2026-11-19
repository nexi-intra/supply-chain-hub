// Once-per-day marker for Hubert's morning briefing: per user and per machine (localStorage), never on the shared drive.
import { toIsoDateString } from './dateUtils'

export type BriefingStorage = Pick<Storage, 'getItem' | 'setItem'>

/** The canonical question the panel sends; Hubert answers it with the briefing (electron/assistantBriefing.cjs). */
export const BRIEFING_QUESTIONS = { da: 'godmorgen', en: 'good morning', fi: 'huomenta', sv: 'god morgon' } as const

export const briefingMarkerKey = (email: string) => `hubert-briefing-${email.trim().toLowerCase()}`

function defaultStorage(): BriefingStorage | null {
  try { return window.localStorage } catch { return null }
}

/** True when this user has not had the briefing yet today; false without a user or usable storage. */
export function briefingDue(email: string, now: Date = new Date(), storage: BriefingStorage | null = defaultStorage()): boolean {
  if (!email.trim() || !storage) return false
  try { return storage.getItem(briefingMarkerKey(email)) !== toIsoDateString(now) } catch { return false }
}

/** Call only after the briefing was actually shown. */
export function markBriefingShown(email: string, now: Date = new Date(), storage: BriefingStorage | null = defaultStorage()): void {
  if (!email.trim() || !storage) return
  try { storage.setItem(briefingMarkerKey(email), toIsoDateString(now)) } catch { /* best effort: at worst the briefing shows once more */ }
}
