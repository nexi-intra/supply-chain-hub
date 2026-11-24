import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { manualVacationGrantEmail } from '@/lib/emailTemplates'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePickerField } from '@/components/DatePickerField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Gift, CalendarCheck } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { newId } from '@/lib/utils'
import { parseLocalDate } from '@/lib/dateUtils'
import { appendToKvArray } from '@/lib/kvArrays'
import { excludeCreator } from '@/lib/userRoles'
import type { VacationEntry } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'

interface User {
  email: string
  fullName: string
}

interface ManualVacationGrantProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  managerEmail: string
  /** Called at once with the vacation being granted; `saved` resolves when it is saved (false if it was not). */
  onGranted: (entry: VacationEntry, saved: Promise<boolean>) => void
}

export function ManualVacationGrant({ open, onOpenChange, managerEmail, onGranted }: ManualVacationGrantProps) {
  const { t } = useLanguage()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [grantType, setGrantType] = useState<'single' | 'vacation'>('single')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const loadUsers = async () => {
      const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string }>>('users')
      if (usersData) {
        const userList = (await excludeCreator(Object.values(usersData))).map(u => ({
          email: u.email,
          fullName: u.fullName
        })).sort((a, b) => a.fullName.localeCompare(b.fullName))
        setUsers(userList)
      }
    }
    
    if (open) {
      loadUsers()
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedUser) {
      toast.error(t.manualVacationGrant.selectUser)
      return
    }

    if (!startDate) {
      toast.error(t.manualVacationGrant.selectStartDate)
      return
    }

    if (grantType === 'vacation' && !endDate) {
      toast.error(t.manualVacationGrant.selectEndDateForVacation)
      return
    }

    const start = parseLocalDate(startDate)
    const end = grantType === 'single' ? parseLocalDate(startDate) : parseLocalDate(endDate)

    if (grantType === 'vacation' && end < start) {
      toast.error(t.manualVacationGrant.endBeforeStart)
      return
    }

    // Granted at once: the dialog closes, the vacation shows in the Manager Panel and it is saved in the background
    // (a write to M: takes 20+ s). A failed save reopens the dialog with the choices.
    const form = { selectedUser, grantType, startDate, endDate, notes }
    const newVacation: VacationEntry = {
      id: newId('vacation'),
      userId: selectedUser,
      userEmail: selectedUser,
      // Altid 'yyyy-MM-dd' — fulde ISO-strenge gav tidszone-tvetydighed på tværs af views.
      startDate: startDate,
      endDate: grantType === 'single' ? startDate : endDate,
      notes: notes.trim() || undefined,
      status: 'approved',
      reviewedBy: managerEmail,
      reviewedAt: new Date().toISOString(),
      isSingleDay: grantType === 'single',
      manuallyGranted: true
    }
    const saved = appendToKvArray('vacation-entries', [newVacation]).then(() => true, error => {
      console.error('Error granting vacation:', error)
      return false
    })
    onGranted(newVacation, saved)
    toast.success(grantType === 'single' ? t.manualVacationGrant.dayOffGranted : t.manualVacationGrant.vacationGranted)
    onOpenChange(false)
    setSelectedUser('')
    setGrantType('single')
    setStartDate('')
    setEndDate('')
    setNotes('')

    if (!(await saved)) {
      toast.error(t.manualVacationGrant.grantFailed)
      setSelectedUser(form.selectedUser)
      setGrantType(form.grantType)
      setStartDate(form.startDate)
      setEndDate(form.endDate)
      setNotes(form.notes)
      onOpenChange(true)
      return
    }

    const emailContent = manualVacationGrantEmail(managerEmail, start, end, form.grantType === 'single', form.notes.trim() || undefined)
    const newEmail = {
      id: newId('email'),
      from: managerEmail,
      to: form.selectedUser,
      subject: emailContent.subject,
      message: emailContent.body,
      timestamp: Date.now(),
      read: false
    }
    const notification = {
      id: newId('notif'),
      type: 'email' as const,
      message: form.grantType === 'single' ? t.manualVacationGrant.gotDayOffNotification : t.manualVacationGrant.gotVacationNotification,
      timestamp: Date.now(),
      read: false,
      from: managerEmail,
      emailId: newEmail.id
    }
    // The mail and its notification are independent keys: saved at the same time, in the background.
    void Promise.all([appendToKvArray('emails', [newEmail]), appendToKvArray('email-notifications', [notification])])
      .catch(emailError => console.error('Error sending vacation grant email:', emailError))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Gift size={28} className="text-accent" weight="duotone" />
            {t.manualVacationGrant.title}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="user-select">{t.manualVacationGrant.selectUserLabel}</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger id="user-select">
                <SelectValue placeholder={t.manualVacationGrant.selectUser} />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.email} value={user.email}>
                    {user.fullName} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant-type">{t.manualVacationGrant.typeLabel}</Label>
            <Select value={grantType} onValueChange={(value: 'single' | 'vacation') => setGrantType(value)}>
              <SelectTrigger id="grant-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">
                  <div className="flex items-center gap-2">
                    <CalendarCheck size={16} />
                    {t.manualVacationGrant.singleDayOff}
                  </div>
                </SelectItem>
                <SelectItem value="vacation">
                  <div className="flex items-center gap-2">
                    <Gift size={16} />
                    {t.manualVacationGrant.vacationMultiDay}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start-date">{grantType === 'single' ? t.manualVacationGrant.dateLabel : t.manualVacationGrant.startDateLabel}</Label>
            <DatePickerField
              id="start-date"
              value={startDate}
              onChange={setStartDate}
            />
          </div>

          {grantType === 'vacation' && (
            <div className="space-y-2">
              <Label htmlFor="end-date">{t.manualVacationGrant.endDateLabel}</Label>
              <DatePickerField
                id="end-date"
                value={endDate}
                onChange={setEndDate}
                min={startDate}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">{t.manualVacationGrant.notesLabel}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.manualVacationGrant.notesPlaceholder}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={!selectedUser || !startDate || (grantType === 'vacation' && !endDate)}
              className="gap-2"
            >
              <Gift size={18} weight="bold" />
              {grantType === 'single' ? t.manualVacationGrant.grantDayOff : t.manualVacationGrant.grantVacation}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
