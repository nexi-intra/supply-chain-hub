import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { vacationRequestEmail, vacationRequestConfirmationEmail } from '@/lib/emailTemplates'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePickerField } from '@/components/DatePickerField'
import { PaperPlaneTilt, Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { newId } from '@/lib/utils'
import { appendToKvArray } from '@/lib/kvArrays'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import type { VacationEntry } from '@/lib/types'

interface VacationRequestDialogProps {
  userEmail: string
}

export function VacationRequestDialog({ userEmail }: VacationRequestDialogProps) {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { t } = useLanguage()

  const hasUnsavedChanges = useMemo(() => {
    return startDate !== '' || endDate !== '' || notes.trim() !== ''
  }, [startDate, endDate, notes])

  useUnsavedChanges({
    hasUnsavedChanges,
    onConfirmedExit: () => {
      setStartDate('')
      setEndDate('')
      setNotes('')
      setOpen(false)
    },
    enabled: open
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!startDate || !endDate) {
      toast.error(t.vacationRequestDialog.selectStartEndDate)
      return
    }

    if (endDate < startDate) {
      toast.error(t.vacationRequestDialog.endDateAfterStart)
      return
    }

    setIsSubmitting(true)

    try {
      const startDateStr = startDate
      const endDateStr = endDate

      const newVacation: VacationEntry = {
        id: newId('vacation'),
        userId: userEmail,
        userEmail,
        startDate: startDateStr,
        endDate: endDateStr,
        notes: notes.trim() || undefined,
        status: 'pending'
      }

      await appendToKvArray('vacation-entries', [newVacation])

      const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; isManager: boolean }>>('users')
      const managers = Object.values(usersData || {}).filter(user => user.isManager)
      const requesterName = usersData?.[userEmail]?.fullName || userEmail

      try {
        const emailContent = vacationRequestEmail(requesterName, startDate, endDate, notes.trim() || undefined)

        // Saml alle manager-mails/notifikationer og skriv én atomar append pr. nøgle.
        const managerEmailItems = managers.map((manager) => ({
          id: newId('email'),
          from: userEmail,
          to: manager.email,
          subject: emailContent.subject,
          message: emailContent.body,
          timestamp: Date.now(),
          read: false,
          type: 'vacation-request',
          actionLink: { view: 'manager', tab: 'vacation-requests', label: 'Gå til ferieanmodninger' }
        }))

        const managerNotifications = managers.map((manager) => ({
          id: newId('notif'),
          to: manager.email,
          subject: emailContent.subject,
          body: emailContent.body,
          timestamp: new Date().toISOString(),
          type: 'vacation-request' as const,
          read: false
        }))

        await appendToKvArray('emails', managerEmailItems)
        await appendToKvArray('email-notifications', managerNotifications)
      } catch (emailError) {
        console.error('Error sending vacation request email to manager:', emailError)
      }

      try {
        const confirmEmail = vacationRequestConfirmationEmail(startDate, endDate, notes.trim() || undefined)

        const confirmationEmail = {
          id: newId('email'),
          from: 'system@nexigroup.com',
          to: userEmail,
          subject: confirmEmail.subject,
          message: confirmEmail.body,
          timestamp: Date.now(),
          read: false,
          type: 'vacation-confirmation'
        }

        await appendToKvArray('emails', [confirmationEmail])

        const confirmNotification = {
          id: newId('notif'),
          to: userEmail,
          subject: confirmEmail.subject,
          body: confirmEmail.body,
          timestamp: new Date().toISOString(),
          type: 'vacation-request' as const,
          read: false
        }

        await appendToKvArray('email-notifications', [confirmNotification])
      } catch (error) {
        console.error('Error sending confirmation email:', error)
      }

      toast.success(t.vacationRequestDialog.requestSent)
      setStartDate('')
      setEndDate('')
      setNotes('')
      setOpen(false)
    } catch (error) {
      console.error('Error creating vacation request:', error)
      toast.error('Kunne ikke oprette ferieansøgning')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90">
          <Plus size={20} weight="bold" />
          {t.vacationRequestDialog.requestVacation}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{t.vacationRequestDialog.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">{t.vacationRequestDialog.startDate || 'Startdato'}</Label>
            <DatePickerField
              id="start-date"
              value={startDate}
              onChange={setStartDate}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end-date">{t.vacationRequestDialog.endDate || 'Slutdato'}</Label>
            <DatePickerField
              id="end-date"
              value={endDate}
              onChange={setEndDate}
              min={startDate}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t.vacationRequestDialog.comment}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.vacationRequestDialog.commentPlaceholder}
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              {t.vacationRequestDialog.cancel}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !startDate || !endDate}
              className="gap-2"
            >
              <PaperPlaneTilt size={18} weight="bold" />
              {isSubmitting ? t.vacationRequestDialog.submitting : t.vacationRequestDialog.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
