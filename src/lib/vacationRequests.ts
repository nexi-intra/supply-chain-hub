// Delt indsendelseslogik for en ferieanmodning — brugt af BÅDE den manuelle
// dialog (VacationRequestDialog.tsx) og Hubert's "opret ferieanmodning"-skill
// (HubAssistant.tsx), så begge veje går gennem PRÆCIS samme validering,
// KV-skrivning og manager-notifikation. Ingen ny/parallel skrivevej.
import { newId } from './utils'
import { appendToKvArray } from './kvArrays'
import { beginKvPrediction } from '../hooks/useKV'
import { vacationRequestEmail, vacationRequestConfirmationEmail } from './emailTemplates'
import type { VacationEntry } from './types'

/**
 * Decides several vacation requests in ONE write: a write to M: takes 20-90 s, and the Manager Panel's "Godkend valgte"
 * made one write per request. The list is stored only if nobody changed it meanwhile (else it is tried again on the
 * fresh list), like the single decision. Returns the decided entries; requests deleted meanwhile are left out.
 */
export async function decideVacationRequests(ids: string[], status: 'approved' | 'rejected', reviewerEmail: string, now = new Date()): Promise<VacationEntry[]> {
  const wanted = new Set(ids)
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await window.kv.get<VacationEntry[]>('vacation-entries')
    const decided: VacationEntry[] = []
    const next = (current || []).map(entry => {
      if (!entry || !wanted.has(entry.id)) return entry
      const updated: VacationEntry = { ...entry, status, reviewedBy: reviewerEmail, reviewedAt: now.toISOString() }
      decided.push(updated)
      return updated
    })
    if (decided.length === 0) return []
    // Open views (useKV) show the decision at once.
    const end = beginKvPrediction('vacation-entries', { op: 'upsert', items: decided })
    try {
      await window.kv.compareAndSet('vacation-entries', current, next)
      return decided
    } catch (error) {
      if (attempt === 4 || !String(error).includes('KV_CONFLICT')) throw error
    } finally {
      end()
    }
  }
  return []
}

export interface SubmitVacationRequestParams {
  userEmail: string
  startDate: string
  endDate: string
  notes?: string
  /** Called as soon as the request itself is saved; the mails to managers and the requester follow. */
  onSaved?: (entry: VacationEntry) => void
}

/** Kaster hvis datoerne mangler eller slutdato ligger før startdato. */
export async function submitVacationRequest({ userEmail, startDate, endDate, notes, onSaved }: SubmitVacationRequestParams): Promise<VacationEntry> {
  if (!startDate || !endDate) throw new Error('MISSING_DATES')
  if (endDate < startDate) throw new Error('END_BEFORE_START')

  const newVacation: VacationEntry = {
    id: newId('vacation'),
    userId: userEmail,
    userEmail,
    startDate,
    endDate,
    notes: notes?.trim() || undefined,
    status: 'pending',
  }

  // The users are read while the request is saved (each is a round trip to M:).
  const [, usersData] = await Promise.all([
    appendToKvArray('vacation-entries', [newVacation]),
    window.kv.get<Record<string, { email: string; password: string; fullName: string; isManager: boolean }>>('users'),
  ])
  onSaved?.(newVacation)
  const managers = Object.values(usersData || {}).filter((user) => user.isManager)
  const requesterName = usersData?.[userEmail]?.fullName || userEmail

  // All mails in one write and all notifications in one write, at the same time: a write to M: takes 20+ s, and they
  // were four writes one after another.
  const emails: unknown[] = []
  const notifications: unknown[] = []
  const emailContent = vacationRequestEmail(requesterName, startDate, endDate, notes?.trim() || undefined)
  for (const manager of managers) {
    emails.push({
      id: newId('email'),
      from: userEmail,
      to: manager.email,
      subject: emailContent.subject,
      message: emailContent.body,
      timestamp: Date.now(),
      read: false,
      type: 'vacation-request',
      actionLink: { view: 'manager', tab: 'vacation-requests', label: 'Gå til ferieanmodninger' },
    })
    notifications.push({
      id: newId('notif'),
      to: manager.email,
      subject: emailContent.subject,
      body: emailContent.body,
      timestamp: new Date().toISOString(),
      type: 'vacation-request' as const,
      read: false,
    })
  }
  const confirmEmail = vacationRequestConfirmationEmail(startDate, endDate, notes?.trim() || undefined)
  emails.push({
    id: newId('email'),
    from: 'system@nexigroup.com',
    to: userEmail,
    subject: confirmEmail.subject,
    message: confirmEmail.body,
    timestamp: Date.now(),
    read: false,
    type: 'vacation-confirmation',
  })
  notifications.push({
    id: newId('notif'),
    to: userEmail,
    subject: confirmEmail.subject,
    body: confirmEmail.body,
    timestamp: new Date().toISOString(),
    type: 'vacation-request' as const,
    read: false,
  })
  const sent = await Promise.allSettled([
    appendToKvArray('emails', emails as { id: string }[]),
    appendToKvArray('email-notifications', notifications as { id: string }[]),
  ])
  for (const result of sent) if (result.status === 'rejected') console.error('Error sending vacation request mails:', result.reason)

  return newVacation
}
