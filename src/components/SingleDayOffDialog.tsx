import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { singleDayOffRequestEmail, singleDayOffConfirmationEmail } from '@/lib/emailTemplates'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePickerField } from '@/components/DatePickerField'
import { PaperPlaneTilt, CalendarX } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { newId } from '@/lib/utils'
import { parseLocalDate } from '@/lib/dateUtils'
import { appendToKvArray } from '@/lib/kvArrays'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import type { VacationEntry } from '@/lib/types'

interface SingleDayOffDialogProps {
  userEmail: string
}

export function SingleDayOffDialog({ userEmail }: SingleDayOffDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { t } = useLanguage()

  const hasUnsavedChanges = useMemo(() => {
    return selectedDate !== '' || notes.trim() !== ''
  }, [selectedDate, notes])

  useUnsavedChanges({
    hasUnsavedChanges,
    onConfirmedExit: () => {
      setSelectedDate('')
      setNotes('')
      setOpen(false)
    },
    enabled: open
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedDate) {
      toast.error(t.singleDayOffDialog.selectDateError)
      return
    }

    const dateObj = parseLocalDate(selectedDate)
    const dayOfWeek = dateObj.getDay()
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      toast.error(t.singleDayOffDialog.weekendError)
      return
    }

    setIsSubmitting(true)

    try {
      const selectedDateStr = selectedDate

      const newVacation: VacationEntry = {
        id: newId('vacation'),
        userId: userEmail,
        userEmail,
        startDate: selectedDateStr,
        endDate: selectedDateStr,
        notes: notes.trim() || undefined,
        status: 'pending',
        isSingleDay: true
      }

      await appendToKvArray('vacation-entries', [newVacation])

      const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; isManager: boolean }>>('users')
      const managers = Object.values(usersData || {}).filter(user => user.isManager)
      const requesterName = usersData?.[userEmail]?.fullName || userEmail

      try {
        const emailContent = singleDayOffRequestEmail(requesterName, selectedDate, notes.trim() || undefined)

        // Saml alle manager-mails/notifikationer og skriv én atomar append pr. nøgle.
        const managerEmails = managers.map((manager) => ({
          id: newId('email'),
          from: userEmail,
          to: manager.email,
          subject: emailContent.subject,
          message: emailContent.body,
          timestamp: Date.now(),
          read: false,
          type: 'single-day-off-request',
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

        await appendToKvArray('emails', managerEmails)
        await appendToKvArray('email-notifications', managerNotifications)
      } catch (emailError) {
        console.error('Error sending day off request email to manager:', emailError)
      }

      try {
        const confirmEmail = singleDayOffConfirmationEmail(selectedDate, notes.trim() || undefined)

        const confirmationEmail = {
          id: newId('email'),
          from: 'system@nexigroup.com',
          to: userEmail,
          subject: confirmEmail.subject,
          message: confirmEmail.body,
          timestamp: Date.now(),
          read: false,
          type: 'day-off-confirmation'
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

      toast.success(t.singleDayOffDialog.requestSent)
      setSelectedDate('')
      setNotes('')
      setOpen(false)
    } catch (error) {
      console.error('Error creating day off request:', error)
      toast.error(t.singleDayOffDialog.requestError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CalendarX size={20} weight="bold" />
          {t.singleDayOffDialog.requestDayOff}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{t.singleDayOffDialog.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="single-date">{t.singleDayOffDialog.date}</Label>
            <DatePickerField
              id="single-date"
              value={selectedDate}
              onChange={setSelectedDate}
            />
            <p className="text-xs text-muted-foreground">
              {t.singleDayOffDialog.weekdayOnly}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t.singleDayOffDialog.comment}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.singleDayOffDialog.commentPlaceholder}
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
              {t.singleDayOffDialog.cancel}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedDate}
              className="gap-2"
            >
              <PaperPlaneTilt size={18} weight="bold" />
              {isSubmitting ? t.singleDayOffDialog.submitting : t.singleDayOffDialog.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
