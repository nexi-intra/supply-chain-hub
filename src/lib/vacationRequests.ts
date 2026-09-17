// Delt indsendelseslogik for en ferieanmodning — brugt af BÅDE den manuelle
// dialog (VacationRequestDialog.tsx) og Hubert's "opret ferieanmodning"-skill
// (HubAssistant.tsx), så begge veje går gennem PRÆCIS samme validering,
// KV-skrivning og manager-notifikation. Ingen ny/parallel skrivevej.
import { newId } from './utils'
import { appendToKvArray } from './kvArrays'
import { vacationRequestEmail, vacationRequestConfirmationEmail } from './emailTemplates'
import type { VacationEntry } from './types'

export interface SubmitVacationRequestParams {
  userEmail: string
  startDate: string
  endDate: string
  notes?: string
}

/** Kaster hvis datoerne mangler eller slutdato ligger før startdato. */
export async function submitVacationRequest({ userEmail, startDate, endDate, notes }: SubmitVacationRequestParams): Promise<VacationEntry> {
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

  await appendToKvArray('vacation-entries', [newVacation])

  const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; isManager: boolean }>>('users')
  const managers = Object.values(usersData || {}).filter((user) => user.isManager)
  const requesterName = usersData?.[userEmail]?.fullName || userEmail

  try {
    const emailContent = vacationRequestEmail(requesterName, startDate, endDate, notes?.trim() || undefined)
    const managerEmailItems = managers.map((manager) => ({
      id: newId('email'),
      from: userEmail,
      to: manager.email,
      subject: emailContent.subject,
      message: emailContent.body,
      timestamp: Date.now(),
      read: false,
      type: 'vacation-request',
      actionLink: { view: 'manager', tab: 'vacation-requests', label: 'Gå til ferieanmodninger' },
    }))
    const managerNotifications = managers.map((manager) => ({
      id: newId('notif'),
      to: manager.email,
      subject: emailContent.subject,
      body: emailContent.body,
      timestamp: new Date().toISOString(),
      type: 'vacation-request' as const,
      read: false,
    }))
    await appendToKvArray('emails', managerEmailItems)
    await appendToKvArray('email-notifications', managerNotifications)
  } catch (error) {
    console.error('Error sending vacation request email to manager:', error)
  }

  try {
    const confirmEmail = vacationRequestConfirmationEmail(startDate, endDate, notes?.trim() || undefined)
    const confirmationEmail = {
      id: newId('email'),
      from: 'system@nexigroup.com',
      to: userEmail,
      subject: confirmEmail.subject,
      message: confirmEmail.body,
      timestamp: Date.now(),
      read: false,
      type: 'vacation-confirmation',
    }
    await appendToKvArray('emails', [confirmationEmail])
    const confirmNotification = {
      id: newId('notif'),
      to: userEmail,
      subject: confirmEmail.subject,
      body: confirmEmail.body,
      timestamp: new Date().toISOString(),
      type: 'vacation-request' as const,
      read: false,
    }
    await appendToKvArray('email-notifications', [confirmNotification])
  } catch (error) {
    console.error('Error sending confirmation email:', error)
  }

  return newVacation
}
