import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePickerField } from '@/components/DatePickerField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Baby } from '@phosphor-icons/react'
import { toast } from 'sonner'
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

interface ParentalLeaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  managerEmail: string
  onSuccess: () => void
}

export function ParentalLeaveDialog({ open, onOpenChange, managerEmail, onSuccess }: ParentalLeaveDialogProps) {
  const { t } = useLanguage()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    const loadUsers = async () => {
      const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string }>>('users')
      if (usersData) {
        const userList = (await excludeCreator(Object.values(usersData)))
          .map(u => ({ email: u.email, fullName: u.fullName }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
        setUsers(userList)
      }
    }
    void loadUsers()
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return void toast.error(t.parentalLeave.selectUser)
    if (!startDate) return void toast.error(t.parentalLeave.selectStartDate)
    if (!endDate) return void toast.error(t.parentalLeave.selectEndDate)
    if (parseLocalDate(endDate) < parseLocalDate(startDate)) return void toast.error(t.parentalLeave.endBeforeStart)

    const entry: VacationEntry = {
      id: newId('vacation'),
      userId: selectedUser,
      userEmail: selectedUser,
      startDate,
      endDate,
      notes: notes.trim() || undefined,
      status: 'approved',
      type: 'parental',
      reviewedBy: managerEmail,
      reviewedAt: new Date().toISOString(),
      isSingleDay: false,
      manuallyGranted: true,
    }

    // Optimistisk: luk og bekræft med det samme, skriv i baggrunden.
    setSelectedUser('')
    setStartDate('')
    setEndDate('')
    setNotes('')
    onOpenChange(false)
    toast.success(t.parentalLeave.registered)

    void (async () => {
      try {
        await appendToKvArray('vacation-entries', [entry])
        onSuccess()
      } catch (error) {
        console.error('Error registering parental leave:', error)
        toast.error(t.parentalLeave.registerFailed)
        return
      }
      try {
        const period = `${parseLocalDate(entry.startDate).toLocaleDateString()} – ${parseLocalDate(entry.endDate).toLocaleDateString()}`
        const message = {
          id: newId('email'),
          from: managerEmail,
          to: entry.userEmail,
          subject: t.parentalLeave.notification,
          message: `${t.parentalLeave.badge}: ${period}${entry.notes ? `\n\n${entry.notes}` : ''}`,
          timestamp: Date.now(),
          read: false,
        }
        await appendToKvArray('emails', [message])
        await appendToKvArray('email-notifications', [{
          id: newId('notif'),
          type: 'email' as const,
          message: t.parentalLeave.notification,
          timestamp: Date.now(),
          read: false,
          from: managerEmail,
          emailId: message.id,
        }])
      } catch (notificationError) {
        console.error('Error sending parental leave notification:', notificationError)
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Baby size={28} className="text-accent" weight="duotone" />
            {t.parentalLeave.title}
          </DialogTitle>
          <DialogDescription>{t.parentalLeave.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="parental-user-select">{t.parentalLeave.selectUserLabel}</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger id="parental-user-select">
                <SelectValue placeholder={t.parentalLeave.selectUser} />
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
            <Label htmlFor="parental-start-date">{t.parentalLeave.startDateLabel}</Label>
            <DatePickerField id="parental-start-date" value={startDate} onChange={setStartDate} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parental-end-date">{t.parentalLeave.endDateLabel}</Label>
            <DatePickerField id="parental-end-date" value={endDate} onChange={setEndDate} min={startDate} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parental-notes">{t.parentalLeave.notesLabel}</Label>
            <Textarea
              id="parental-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.parentalLeave.notesPlaceholder}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!selectedUser || !startDate || !endDate} className="gap-2">
              <Baby size={18} weight="bold" />
              {t.parentalLeave.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
