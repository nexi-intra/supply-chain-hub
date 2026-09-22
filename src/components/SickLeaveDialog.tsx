import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePickerField } from '@/components/DatePickerField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FirstAidKit, X } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { appendToKvArray, updateKvArrayItem } from '@/lib/kvArrays'
import type { SickLeaveEntry } from '@/lib/types'

interface SickLeaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
  editEntry?: SickLeaveEntry | null
}

interface User {
  email: string
  fullName: string
}

export function SickLeaveDialog({ open, onOpenChange, userEmail, editEntry = null }: SickLeaveDialogProps) {
  const [reason, setReason] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedUserEmail, setSelectedUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [sickLeaveType, setSickLeaveType] = useState<'self' | 'child'>('self')
  const { t } = useLanguage()

  const initialReason = editEntry?.reason || ''
  const initialDate = editEntry ? new Date(editEntry.startDate) : new Date()
  const initialEmail = editEntry?.userEmail || userEmail
  const initialType = editEntry?.type || 'self'

  const hasUnsavedChanges = useMemo(() => {
    if (!open) return false
    return (
      reason !== initialReason ||
      selectedDate?.getTime() !== initialDate?.getTime() ||
      selectedUserEmail !== initialEmail ||
      sickLeaveType !== initialType
    )
  }, [reason, selectedDate, selectedUserEmail, sickLeaveType, initialReason, initialDate, initialEmail, initialType, open])

  useUnsavedChanges({
    hasUnsavedChanges,
    onConfirmedExit: () => {
      setReason('')
      setSelectedDate(undefined)
      setSelectedUserEmail('')
      setSickLeaveType('self')
      onOpenChange(false)
    },
    enabled: open
  })

  useEffect(() => {
    const fetchUsers = async () => {
      const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string }>>('users')
      if (usersData) {
        const usersList = Object.keys(usersData).map(email => ({
          email,
          fullName: usersData[email].fullName || email
        }))
        setAllUsers(usersList)
      }
    }
    
    if (open) {
      fetchUsers()
      
      if (editEntry) {
        setSelectedUserEmail(editEntry.userEmail)
        setUserName(editEntry.userName)
        setReason(editEntry.reason || '')
        setSickLeaveType(editEntry.type || 'self')
        try {
          const date = new Date(editEntry.startDate)
          if (!isNaN(date.getTime())) {
            setSelectedDate(date)
          } else {
            setSelectedDate(new Date())
          }
        } catch (error) {
          console.error('Error parsing date:', error)
          setSelectedDate(new Date())
        }
      } else {
        setSelectedUserEmail(userEmail)
        setReason('')
        setSickLeaveType('self')
        setSelectedDate(new Date())
      }
    }
  }, [open, userEmail, editEntry])

  // Navnet findes allerede i den liste vi hentede da dialogen blev aabnet,
  // saa der er ingen grund til endnu et opslag paa drevet.
  useEffect(() => {
    if (!selectedUserEmail) return
    const match = allUsers.find(user => user.email === selectedUserEmail)
    if (match) setUserName(match.fullName || selectedUserEmail)
  }, [selectedUserEmail, allUsers])

  const handleSubmit = async () => {
    if (!selectedDate) {
      toast.error(t.sickLeaveDialog.selectDateError)
      return
    }

    if (!selectedUserEmail) {
      toast.error('Vælg venligst en medarbejder')
      return
    }

    const dateToUse = selectedDate
    const dateFormatted = format(dateToUse, 'd. MMMM yyyy', { locale: da })
    const entryReason = reason
    const entryType = sickLeaveType
    const entryUserEmail = selectedUserEmail
    const entryUserName = userName
    const entryToEdit = editEntry

    // Luk dialogen og kvitter med det samme. Selve skrivningen til det delte
    // drev sker i baggrunden, saa brugeren aldrig venter paa netvaerket.
    setReason('')
    setSelectedDate(undefined)
    onOpenChange(false)

    if (entryToEdit) {
      toast.success(t.sickLeaveDialog.updated, {
        description: t.sickLeaveDialog.updatedDescription.replace('{date}', dateFormatted),
        duration: 5000
      })

      updateKvArrayItem<SickLeaveEntry>('sick-leave-entries', entryToEdit.id, current => ({
        ...current,
        startDate: dateToUse.toISOString(),
        reason: entryReason,
        userEmail: entryUserEmail,
        userName: entryUserName,
        type: entryType,
      })).catch(error => {
        console.error('Error updating sick leave:', error)
        toast.error(t.sickLeaveDialog.error, {
          description: t.sickLeaveDialog.errorDescription
        })
      })
      return
    }

    const reporterIsSelf = entryUserEmail === userEmail

    const newEntry: SickLeaveEntry = {
      id: `sick-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userEmail: entryUserEmail,
      userName: entryUserName,
      startDate: dateToUse.toISOString(),
      reason: entryReason,
      status: 'approved',
      submittedAt: new Date().toISOString(),
      reportedBy: reporterIsSelf ? undefined : userEmail,
      type: entryType,
    }

    toast.success(`✅ ${t.sickLeaveDialog.registered}`, {
      description: t.sickLeaveDialog.notificationSent.replace('{date}', dateFormatted),
      duration: 8000
    })

    // Navnet paa den der indberetter staar allerede i den liste dialogen hentede.
    const reporterName = allUsers.find(user => user.email === userEmail)?.fullName || userEmail

    const sickTypeText = entryType === 'child' ? 'Barn syg' : 'Sygemelding'
    const emailSubject = `${sickTypeText} - ${entryUserName}`
    const emailBody = reporterIsSelf
      ? `Hej Jacob,

${entryUserName} (${entryUserEmail}) har meldt ${entryType === 'child' ? 'barn syg' : 'sig syg'}.

Type: ${entryType === 'child' ? 'Barn syg' : 'Egen sygdom'}
Dato: ${dateFormatted}

${entryReason ? `Bemærkninger:\n${entryReason}\n\n` : ''}Denne notifikation er automatisk genereret fra Supply Chain Hub.`
      : `Hej Jacob,

${entryUserName} (${entryUserEmail}) ${entryType === 'child' ? 'har fået barn syg registreret' : 'er blevet sygemeldt'} af ${reporterName} (${userEmail}).

Type: ${entryType === 'child' ? 'Barn syg' : 'Egen sygdom'}
Dato: ${dateFormatted}

${entryReason ? `Bemærkninger:\n${entryReason}\n\n` : ''}Denne notifikation er automatisk genereret fra Supply Chain Hub.`

    void (async () => {
      try {
        await appendToKvArray<SickLeaveEntry>('sick-leave-entries', [newEntry])
      } catch (error) {
        console.error('Error submitting sick leave:', error)
        toast.error(t.sickLeaveDialog.error, {
          description: t.sickLeaveDialog.errorDescription
        })
        return
      }

      try {
        await appendToKvArray('email-notifications', [{
          id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          to: 'Jacob.remmer@nexigroup.com',
          subject: emailSubject,
          body: emailBody,
          timestamp: new Date().toISOString(),
          type: 'sick-leave' as const,
          read: false
        }])
      } catch (emailError) {
        console.error('Error saving email notification:', emailError)
        toast.warning(t.sickLeaveDialog.registered, {
          description: t.sickLeaveDialog.registeredDescription.replace('{date}', dateFormatted),
          duration: 5000
        })
      }
    })()
  }

  const handleCancel = () => {
    setReason('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.55_0.16_25)] to-[oklch(0.62_0.13_30)] flex items-center justify-center">
              <FirstAidKit size={24} weight="duotone" className="text-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl">{editEntry ? t.sickLeaveDialog.editTitle : t.sickLeaveDialog.title}</DialogTitle>
              <DialogDescription>
                {editEntry ? t.sickLeaveDialog.editDescription : t.sickLeaveDialog.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="employee">{t.sickLeaveDialog.employee}</Label>
              <Select
                value={selectedUserEmail}
                onValueChange={(value) => {
                  setSelectedUserEmail(value)
                }}
                disabled={!!editEntry}
              >
                <SelectTrigger id="employee" className="w-full">
                  <SelectValue placeholder="Vælg medarbejder..." />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map((user) => (
                    <SelectItem key={user.email} value={user.email}>
                      {user.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedUserEmail !== userEmail && !editEntry && (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md border border-amber-200 dark:border-amber-800">
                  Du anmelder sygemelding på vegne af {userName}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sickType">Type</Label>
              <Select
                value={sickLeaveType}
                onValueChange={(value: 'self' | 'child') => setSickLeaveType(value)}
              >
                <SelectTrigger id="sickType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Egen sygdom</SelectItem>
                  <SelectItem value="child">Barn syg</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {sickLeaveType === 'child' 
                  ? 'Du melder barn syg' 
                  : 'Du melder egen sygdom'}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sickDate">{t.sickLeaveDialog.date}</Label>
              <DatePickerField
                id="sickDate"
                value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
                onChange={(value) => setSelectedDate(value ? new Date(value) : undefined)}
              />
              <p className="text-sm text-muted-foreground">
                {editEntry ? t.sickLeaveDialog.editDate : t.sickLeaveDialog.selectDate}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">{t.sickLeaveDialog.notes}</Label>
              <Textarea
                id="reason"
                placeholder={t.sickLeaveDialog.notesPlaceholder}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="gap-2"
          >
            <X size={18} />
            {t.sickLeaveDialog.cancel}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-gradient-to-r from-[oklch(0.55_0.16_25)] to-[oklch(0.62_0.13_30)] hover:from-[oklch(0.50_0.16_25)] hover:to-[oklch(0.58_0.13_30)] text-white gap-2"
          >
            <FirstAidKit size={18} weight="duotone" />
            {isSubmitting ? (editEntry ? t.sickLeaveDialog.updating : t.sickLeaveDialog.submitting) : (editEntry ? t.sickLeaveDialog.update : t.sickLeaveDialog.submit)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
