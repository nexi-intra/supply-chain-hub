// Shared write path for a sick-leave registration: used by the manual dialog (SickLeaveDialog.tsx)
// and by Hubert's "meld mig syg" (HubAssistant.tsx), so both write exactly the same entry and notice.
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { appendToKvArray } from './kvArrays'
import type { SickLeaveEntry } from './types'

const MANAGER_NOTICE_TO = 'Jacob.remmer@nexigroup.com'

export interface RegisterSickLeaveParams {
  /** The signed-in user who registers it. */
  reporterEmail: string
  reporterName: string
  userEmail: string
  userName: string
  date: Date
  reason?: string
  type: 'self' | 'child'
}

/** Writes the entry (throws if that fails), then the manager notice; `notified` is false when only the notice failed. */
export async function registerSickLeave({ reporterEmail, reporterName, userEmail, userName, date, reason = '', type }: RegisterSickLeaveParams): Promise<{ entry: SickLeaveEntry; notified: boolean }> {
  const reporterIsSelf = userEmail === reporterEmail
  const entry: SickLeaveEntry = {
    id: `sick-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    userEmail,
    userName,
    startDate: date.toISOString(),
    reason,
    status: 'approved',
    submittedAt: new Date().toISOString(),
    reportedBy: reporterIsSelf ? undefined : reporterEmail,
    type,
  }
  await appendToKvArray<SickLeaveEntry>('sick-leave-entries', [entry])

  const dateFormatted = format(date, 'd. MMMM yyyy', { locale: da })
  const typeText = type === 'child' ? 'Barn syg' : 'Egen sygdom'
  const what = reporterIsSelf
    ? `${userName} (${userEmail}) har meldt ${type === 'child' ? 'barn syg' : 'sig syg'}.`
    : `${userName} (${userEmail}) ${type === 'child' ? 'har fået barn syg registreret' : 'er blevet sygemeldt'} af ${reporterName} (${reporterEmail}).`
  // The note stays on the entry (visible to the person and managers only); the copied notice never carries it.
  const body = `Hej Jacob,\n\n${what}\n\nType: ${typeText}\nDato: ${dateFormatted}\n\nDenne notifikation er automatisk genereret fra Supply Chain Hub.`
  try {
    await appendToKvArray('email-notifications', [{
      id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      to: MANAGER_NOTICE_TO,
      subject: `${type === 'child' ? 'Barn syg' : 'Sygemelding'} - ${userName}`,
      body,
      timestamp: new Date().toISOString(),
      type: 'sick-leave' as const,
      read: false,
    }])
    return { entry, notified: true }
  } catch (error) {
    console.error('Error saving email notification:', error)
    return { entry, notified: false }
  }
}
