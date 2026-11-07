import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePickerField } from '@/components/DatePickerField'
import { PaperPlaneTilt, Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { submitVacationRequest } from '@/lib/vacationRequests'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'

interface VacationRequestDialogProps {
  userEmail: string
}

export function VacationRequestDialog({ userEmail }: VacationRequestDialogProps) {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
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

    // Sent at once: the dialog closes and the form is cleared; the request and the mails to the managers are saved in
    // the background (a write to M: takes 20-90 s). A failed save reopens the dialog with the dates.
    const form = { startDate, endDate, notes }
    toast.success(t.vacationRequestDialog.requestSent)
    setStartDate('')
    setEndDate('')
    setNotes('')
    setOpen(false)

    try {
      await submitVacationRequest({ userEmail, ...form })
    } catch (error) {
      console.error('Error creating vacation request:', error)
      toast.error('Kunne ikke oprette ferieansøgning')
      setStartDate(form.startDate)
      setEndDate(form.endDate)
      setNotes(form.notes)
      setOpen(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
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
            >
              {t.vacationRequestDialog.cancel}
            </Button>
            <Button
              type="submit"
              disabled={!startDate || !endDate}
              className="gap-2"
            >
              <PaperPlaneTilt size={18} weight="bold" />
              {t.vacationRequestDialog.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
