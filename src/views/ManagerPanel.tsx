import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ShieldCheck, Check, Crown, User as UserIcon, Trash, FirstAidKit, X, Umbrella, ClockCounterClockwise, PencilSimple, Plus, Phone, CalendarBlank, Eye, Gift, WaveSine, LockKey, Books } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useKV } from '@/hooks/useKV'
import { UserProfile } from '@/components/UserProfile'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DatePickerField } from '@/components/DatePickerField'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { format } from 'date-fns'
import { da, enUS, fi } from 'date-fns/locale'
import { UserRole, hasManagerAccess, getCreatorEmail, getRoleDisplayName, getRoleDescription } from '@/lib/userRoles'
import { hashPassword } from '@/lib/passwords'
import { newId } from '@/lib/utils'
import { parseLocalDate } from '@/lib/dateUtils'
import { appendToKvArray, updateKvArrayItem, removeFromKvArray, upsertInKvArray, setKvObjectField, deleteKvObjectField, replaceKvObjectField } from '@/lib/kvArrays'
import { cn } from '@/lib/utils'
import { isAnyModalOpen } from '@/lib/modalStack'
import { consumeNavigationParams } from '@/lib/appNavigation'
import { getEmployeeColorByEmail, EMPLOYEE_COLOR_OVERRIDES_KEY, EMPLOYEE_COLOR_PALETTE, type EmployeeColorOverrides } from '@/lib/employeeColors'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getWeekNumber as getISOWeekNumber } from '@/lib/dateUtils'
import { useLanguage } from '@/contexts/LanguageContext'
import React from 'react'
import { ManualVacationGrant } from '@/components/ManualVacationGrant'
import { OnboardingWizard, OffboardingWizard } from '@/components/OnboardingWizard'
import { Checkbox } from '@/components/ui/checkbox'
import { vacationApprovedEmail, vacationRejectedEmail, vacationEditedEmail, vacationDeletedEmail, userApprovedEmail, userRejectedEmail } from '@/lib/emailTemplates'
import type { BirthdayEntry, SickLeaveEntry, VacationEntry, VacationStatus, GuideAccessRequest } from '@/lib/types'

interface User {
  email: string
  fullName: string
  role: UserRole
  phone?: string
  status?: 'pending' | 'approved' | 'rejected'
  username?: string
}

interface ManagerPanelProps {
  onNavigateBack: () => void
  onLogout: () => void
  userEmail: string
}

export function ManagerPanel({ onNavigateBack, onLogout, userEmail }: ManagerPanelProps) {
  const { t, language } = useLanguage()
  const dateLocale = language === 'en' ? enUS : language === 'fi' ? fi : da
  // Deep-link (fx knappen i ferieanmodnings-mails) kan bede om en bestemt fane.
  const [initialTab] = useState(() => consumeNavigationParams()?.tab ?? 'permissions')
  const [activeTab, setActiveTab] = useState(initialTab)
  const [users, setUsers] = useState<User[]>([])
  // Manager-satte farveoverstyringer (delt KV) — vinder over den automatiske hash-farve.
  const [colorOverrides] = useKV<EmployeeColorOverrides>(EMPLOYEE_COLOR_OVERRIDES_KEY, {})
  const [pendingUsers, setPendingUsers] = useState<User[]>([])
  const [sickLeaveEntries, setSickLeaveEntries] = useState<SickLeaveEntry[]>([])
  const [vacationEntries, setVacationEntries] = useState<VacationEntry[]>([])
  const [allVacations, setAllVacations] = useState<VacationEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserPhone, setNewUserPhone] = useState('')
  const [isEditVacationDialogOpen, setIsEditVacationDialogOpen] = useState(false)
  const [editingVacation, setEditingVacation] = useState<VacationEntry | null>(null)
  const [editVacationStartDate, setEditVacationStartDate] = useState<Date | undefined>()
  const [editVacationEndDate, setEditVacationEndDate] = useState<Date | undefined>()
  const [editVacationNotes, setEditVacationNotes] = useState('')
  const [vacationFilter, setVacationFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [previewVacation, setPreviewVacation] = useState<VacationEntry | null>(null)
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false)
  const [previewMonth, setPreviewMonth] = useState(new Date().getMonth())
  const [previewYear, setPreviewYear] = useState(new Date().getFullYear())
  const [isManualGrantDialogOpen, setIsManualGrantDialogOpen] = useState(false)
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([])
  const [isEditBirthdayDialogOpen, setIsEditBirthdayDialogOpen] = useState(false)
  const [editingBirthday, setEditingBirthday] = useState<BirthdayEntry | null>(null)
  const [birthdayDate, setBirthdayDate] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isOffboardingOpen, setIsOffboardingOpen] = useState(false)
  const [selectedVacationIds, setSelectedVacationIds] = useState<string[]>([])
  // Hvilke ferieanmodninger DENNE manager allerede har set — bruges til at fjerne
  // Hub-advarslen/notifikationen, uden at røre selve "afventer godkendelse"-status.
  const [seenVacationRequestIds, setSeenVacationRequestIds] = useKV<string[]>(`seen-vacation-requests-${userEmail}`, [])
  const [guideAdminEmails, setGuideAdminEmails] = useKV<string[]>('guide-admin-emails', [], { initializeIfMissing: false })
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)
  // Fase 8/9 guide-adgangsanmodning: andre teams' brugere anmoder om adgang til EGNE guides.
  // BEVIDST ikke useKV her: dens "skriv default hvis undefined"-adfærd kan i et kapløb
  // overskrive en anden brugers lige-indsendte anmodning med et tomt array (se lærdom i
  // repo-hukommelsen) — almindelig load-ved-mount/efter-handling er sikkert her.
  const [guideAccessRequests, setGuideAccessRequests] = useState<GuideAccessRequest[]>([])
  const pendingGuideAccessRequests = useMemo(() => guideAccessRequests.filter(r => r.status === 'pending'), [guideAccessRequests])

  const loadGuideAccessRequests = async () => {
    const requests = await window.kv.get<GuideAccessRequest[]>('guide-access-requests')
    setGuideAccessRequests(requests || [])
  }

  useEffect(() => {
    const checkAccess = async () => {
      const access = await hasManagerAccess(userEmail)
      setHasAccess(access)
      if (access) {
        loadUsers()
        loadSickLeaveEntries()
        loadVacationEntries()
        loadBirthdays()
        loadGuideAccessRequests()
      }
    }
    checkAccess()
  }, [userEmail])

  useEffect(() => {
    // Så snart manageren har fanen "Anmodninger" åben, regnes de synlige afventende
    // anmodninger for "set" — Hub-badge/notifikation forsvinder, men selve fanens
    // eget badge (nedenfor) fortsætter uændret med at vise alle afventende.
    if (activeTab !== 'vacation-requests' || vacationEntries.length === 0) return
    const pendingIds = vacationEntries.map(v => v.id)
    setSeenVacationRequestIds(current => {
      const currentIds = current || []
      const missing = pendingIds.filter(id => !currentIds.includes(id))
      return missing.length > 0 ? [...currentIds, ...missing] : currentIds
    })
  }, [activeTab, vacationEntries, setSeenVacationRequestIds])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAnyModalOpen()) return
        onNavigateBack()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onNavigateBack])

  const loadUsers = async () => {
    setIsLoading(true)
    const creator = await getCreatorEmail()
    const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; phone?: string; role?: UserRole; isManager?: boolean; status?: 'pending' | 'approved' | 'rejected'; username?: string }>>('users')
    if (usersData) {
      const allUsers = Object.values(usersData)
        .filter(u => u.role !== 'creator' && (!creator || u.email.toLowerCase() !== creator))
        .map(u => {
        let role: UserRole = 'user'
        if (u.role) {
          role = u.role
        } else if (u.isManager) {
          role = 'manager'
        }

        return {
          email: u.email,
          fullName: u.fullName,
          role,
          phone: u.phone,
          status: u.status,
          username: u.username,
        }
      })

      setPendingUsers(allUsers.filter(u => u.status === 'pending'))
      setUsers(allUsers.filter(u => u.status !== 'pending').sort((a, b) => {
        const roleOrder = { creator: 0, manager: 1, user: 2 }
        return roleOrder[a.role] - roleOrder[b.role]
      }))
    }
    setIsLoading(false)
  }

  const sendUserDecisionEmail = async (user: User, approved: boolean) => {
    try {
      const emailContent = approved ? userApprovedEmail(user.fullName, userEmail) : userRejectedEmail(user.fullName, userEmail)
      await appendToKvArray('emails', [{
        id: `${Date.now()}-user-decision`,
        from: userEmail,
        to: user.email,
        subject: emailContent.subject,
        message: emailContent.body,
        timestamp: Date.now(),
        read: false,
      }])
    } catch (error) {
      console.error('Error sending user decision email:', error)
    }
  }

  const handleApproveUser = async (user: User) => {
    const usersData = await window.kv.get<Record<string, { status?: string } & Record<string, unknown>>>('users')
    if (!usersData?.[user.email]) {
      toast.error(t.managerPanel.permissions.userNotFound)
      return
    }
    await replaceKvObjectField('users', user.email, usersData[user.email], { ...usersData[user.email], status: 'approved' })
    await loadUsers()
    await sendUserDecisionEmail(user, true)
    toast.success(`${user.fullName} ${t.managerPanel.permissions.userApprovedSuffix}`)
  }

  const handleRejectUser = async (user: User) => {
    const usersData = await window.kv.get<Record<string, { status?: string } & Record<string, unknown>>>('users')
    if (!usersData?.[user.email]) {
      toast.error(t.managerPanel.permissions.userNotFound)
      return
    }
    await replaceKvObjectField('users', user.email, usersData[user.email], { ...usersData[user.email], status: 'rejected' })
    await loadUsers()
    await sendUserDecisionEmail(user, false)
    toast.success(`${t.managerPanel.permissions.userRequestRejectedPrefix} ${user.fullName} ${t.managerPanel.permissions.userRequestRejectedSuffix}`)
  }

  const loadSickLeaveEntries = async () => {
    const entries = await window.kv.get<SickLeaveEntry[]>('sick-leave-entries') || []
    setSickLeaveEntries(entries.sort((a, b) => {
      const dateA = new Date(b.submittedAt)
      const dateB = new Date(a.submittedAt)
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0
      return dateA.getTime() - dateB.getTime()
    }))
  }

  const loadVacationEntries = async () => {
    const entries = await window.kv.get<VacationEntry[]>('vacation-entries') || []
    setVacationEntries(entries.filter(e => e.status === 'pending').sort((a, b) => {
      const dateA = new Date(a.startDate)
      const dateB = new Date(b.startDate)
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0
      return dateA.getTime() - dateB.getTime()
    }))
    setAllVacations(entries.filter(e => e.status !== 'rejected').sort((a, b) => {
      const dateA = new Date(a.startDate)
      const dateB = new Date(b.startDate)
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0
      return dateA.getTime() - dateB.getTime()
    }))
  }

  const loadBirthdays = async () => {
    const birthdaysData = await window.kv.get<BirthdayEntry[]>('employee-birthdays') || []
    setBirthdays(birthdaysData.sort((a, b) => {
      const dateA = new Date(`2000-${a.birthday}`)
      const dateB = new Date(`2000-${b.birthday}`)
      return dateA.getMonth() - dateB.getMonth() || dateA.getDate() - dateB.getDate()
    }))
  }

  const openEditBirthdayDialog = (entry: BirthdayEntry) => {
    setEditingBirthday(entry)
    setBirthdayDate(entry.birthday)
    setBirthYear(entry.birthYear?.toString() || '')
    setIsEditBirthdayDialogOpen(true)
  }

  const handleSaveBirthday = async () => {
    if (!editingBirthday || !birthdayDate) {
      toast.error(t.managerPanel.birthdays.dateRequiredError)
      return
    }

    const updatedEntry: BirthdayEntry = {
      email: editingBirthday.email,
      fullName: editingBirthday.fullName,
      birthday: birthdayDate,
      birthYear: birthYear ? parseInt(birthYear) : undefined
    }

    await upsertInKvArray('employee-birthdays', [{ ...updatedEntry, id: updatedEntry.email }])
    await loadBirthdays()
    
    setIsEditBirthdayDialogOpen(false)
    setEditingBirthday(null)
    setBirthdayDate('')
    setBirthYear('')
    toast.success(t.managerPanel.birthdays.savedToast)
  }

  const deleteBirthday = async (email: string) => {
    await removeFromKvArray('employee-birthdays', [email])
    await loadBirthdays()
    toast.success(t.managerPanel.birthdays.deletedToast)
  }

  const changeUserRole = async (email: string, newRole: UserRole) => {
    const creator = await getCreatorEmail()
    if (creator && email.toLowerCase() === creator) {
      toast.error(t.managerPanel.permissions.cannotChangeAdminRole)
      return
    }

    const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: UserRole; isManager: boolean }>>('users')
    if (usersData && usersData[email]) {
      await replaceKvObjectField('users', email, usersData[email], {
        ...usersData[email],
        role: newRole,
        isManager: newRole === 'manager' || newRole === 'creator',
      })
      await loadUsers()
      
      toast.success(`${t.managerPanel.permissions.roleChangedPrefix} ${getRoleDisplayName(newRole, language)}`)
    }
  }

  // Sætter en manuel farve for en bruger (delt override) — vinder over auto-farven overalt.
  const setUserColor = async (email: string, paletteIndex: number) => {
    try {
      await setKvObjectField(EMPLOYEE_COLOR_OVERRIDES_KEY, email.trim().toLowerCase(), paletteIndex)
      toast.success(language === 'da' ? 'Farve opdateret' : language === 'fi' ? 'Väri päivitetty' : 'Color updated')
    } catch {
      toast.error(language === 'da' ? 'Kunne ikke ændre farve' : language === 'fi' ? 'Värin muutos epäonnistui' : 'Could not change color')
    }
  }

  const resetUserColor = async (email: string) => {
    try {
      await deleteKvObjectField(EMPLOYEE_COLOR_OVERRIDES_KEY, email.trim().toLowerCase())
      toast.success(language === 'da' ? 'Farve nulstillet' : language === 'fi' ? 'Väri palautettu' : 'Color reset')
    } catch {
      toast.error(language === 'da' ? 'Kunne ikke nulstille farve' : language === 'fi' ? 'Värin palautus epäonnistui' : 'Could not reset color')
    }
  }

  const deleteUser = async (email: string) => {
    const creator = await getCreatorEmail()
    if (creator && email.toLowerCase() === creator) {
      toast.error(t.managerPanel.permissions.cannotDeleteAdmin)
      return
    }

    const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: UserRole; isManager: boolean }>>('users')
    if (usersData && usersData[email]) {
      const userFullName = usersData[email].fullName
      
      await deleteKvObjectField('users', email)
      setGuideAdminEmails((current) => (current || []).filter((item) => item.toLowerCase() !== email.toLowerCase()))
      
      const assignments = (await window.kv.get<Array<{ id: string; employeeId: string; employeeName: string; roleId: string; date: string; comment?: string }>>('shift-assignments')) || []
      const assignmentIdsToRemove = assignments.filter(a => a.employeeName === userFullName).map(a => a.id)
      await removeFromKvArray('shift-assignments', assignmentIdsToRemove)
      
      await loadUsers()
      toast.success(t.managerPanel.permissions.deleted)
    }
  }

  const setGuideAdmin = (email: string, enabled: boolean) => {
    const normalizedEmail = email.trim().toLowerCase()
    setGuideAdminEmails((current) => {
      const withoutUser = (current || []).filter((item) => item.trim().toLowerCase() !== normalizedEmail)
      return enabled ? [...withoutUser, normalizedEmail] : withoutUser
    })
    toast.success(enabled
      ? (language === 'da' ? 'Brugeren er nu Guide Admin' : language === 'fi' ? 'Käyttäjä on nyt opasvastaava' : 'User is now a Guide Admin')
      : (language === 'da' ? 'Guide Admin-adgangen er fjernet' : language === 'fi' ? 'Opasvastaavan käyttöoikeus poistettiin' : 'Guide Admin access removed'))
  }

  const handleApproveGuideAccessRequest = async (request: GuideAccessRequest) => {
    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    await upsertInKvArray<GuideAccessRequest>('guide-access-requests', [{
      ...request,
      status: 'approved',
      reviewedBy: userEmail,
      reviewedAt: new Date().toISOString(),
      expiresAt,
    }])
    await loadGuideAccessRequests()
    toast.success(t.managerPanel.guideAccessRequests.approved)
  }

  const handleRejectGuideAccessRequest = async (request: GuideAccessRequest) => {
    await upsertInKvArray<GuideAccessRequest>('guide-access-requests', [{
      ...request,
      status: 'rejected',
      reviewedBy: userEmail,
      reviewedAt: new Date().toISOString(),
    }])
    await loadGuideAccessRequests()
    toast.success(t.managerPanel.guideAccessRequests.rejected)
  }

  // Telefon og brugernavn er allerede hentet af loadUsers, saa dialogen aabner
  // med det samme i stedet for at vente paa endnu et opslag mod drevet.
  const openEditNameDialog = (user: User) => {
    setEditingUser(user)
    setNewName(user.fullName)
    setNewEmail(user.email)
    setNewPhone(user.phone || '')
    setNewUsername(user.username || '')
    setNewPassword('')
    setIsEditDialogOpen(true)
  }

  const handleSaveUserName = async () => {
    if (!editingUser || !newName.trim()) {
      toast.error(t.managerPanel.validation.nameEmpty)
      return
    }

    if (!newEmail.trim()) {
      toast.error(t.managerPanel.validation.emailEmpty)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail.trim())) {
      toast.error(t.managerPanel.validation.invalidEmail)
      return
    }

    const trimmedUsername = newUsername.trim()
    if (trimmedUsername && !/^[a-zA-Z0-9._-]{3,32}$/.test(trimmedUsername)) {
      toast.error(t.managerPanel.validation.usernameFormat)
      return
    }

    const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: UserRole; isManager: boolean; phone?: string; username?: string }>>('users')
    if (!usersData || !usersData[editingUser.email]) {
      toast.error(t.managerPanel.permissions.userNotFound)
      return
    }

    if (trimmedUsername) {
      const usernameTaken = Object.entries(usersData).some(([userEmail, u]) =>
        userEmail !== editingUser.email && u.username?.toLowerCase() === trimmedUsername.toLowerCase()
      )
      if (usernameTaken) {
        toast.error(t.managerPanel.validation.usernameTaken)
        return
      }
    }

    const userData = usersData[editingUser.email]
    const normalizedNewEmail = newEmail.trim().toLowerCase()
    if (normalizedNewEmail !== editingUser.email.trim().toLowerCase() && Object.keys(usersData).some(email => email.trim().toLowerCase() === normalizedNewEmail)) {
      toast.error(t.managerPanel.validation.emailExists)
      return
    }

    if (newPassword && newPassword.length < 6) {
      toast.error(t.managerPanel.validation.passwordTooShort)
      return
    }

    const updatedUserData = {
      ...userData,
      fullName: newName.trim(),
      email: newEmail.trim(),
      phone: newPhone.trim() || userData.phone,
      username: trimmedUsername || undefined,
      password: newPassword.trim() ? await hashPassword(newPassword.trim()) : userData.password,
    }

    if (newEmail.trim().toLowerCase() !== editingUser.email.toLowerCase()) {
      // Native account migration updates the directory and all references.
      if (!window.electronAuth && window.electronRegistry) {
        const currentTeam = await window.electronRegistry.getCurrentTeam()
        if (currentTeam) await window.electronRegistry.assignUser(newEmail.trim().toLowerCase(), currentTeam.teamId)
      }
      await window.kv.updateField('users', { op: 'renameField', field: editingUser.email, newField: normalizedNewEmail, expected: userData, value: { ...updatedUserData, email: normalizedNewEmail } })
      if (!window.electronAuth && (guideAdminEmails || []).some((item) => item.toLowerCase() === editingUser.email.toLowerCase())) {
        setGuideAdminEmails((current) => [
          ...(current || []).filter((item) => item.toLowerCase() !== editingUser.email.toLowerCase()),
          newEmail.trim().toLowerCase(),
        ])
      }
    } else {
      await window.kv.updateField('users', { op: 'renameField', field: editingUser.email, newField: editingUser.email, expected: userData, value: updatedUserData })
    }

    if (window.electronAuth && normalizedNewEmail !== editingUser.email.toLowerCase() && editingUser.email.toLowerCase() === userEmail.toLowerCase()) {
      onLogout()
      return
    }
    await loadUsers()
    setIsEditDialogOpen(false)
    setEditingUser(null)
    setNewName('')
    setNewEmail('')
    setNewPhone('')
    setNewUsername('')
    setNewPassword('')
    toast.success(t.managerPanel.validation.userUpdated)
  }

  const handleCreateUser = async () => {
    if (!newUserName.trim()) {
      toast.error(t.managerPanel.validation.createNameRequired)
      return
    }
    if (!newUserEmail.trim()) {
      toast.error(t.managerPanel.validation.createEmailRequired)
      return
    }
    if (!newUserPassword.trim()) {
      toast.error(t.managerPanel.validation.createPasswordRequired)
      return
    }
    if (!newUserPhone.trim()) {
      toast.error(t.managerPanel.validation.createPhoneRequired)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newUserEmail.trim())) {
      toast.error(t.managerPanel.validation.invalidEmail)
      return
    }

    const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: UserRole; isManager: boolean; phone?: string; status?: 'pending' | 'approved' | 'rejected' }>>('users') || {}
    
    if (usersData[newUserEmail.toLowerCase()]) {
      toast.error(t.managerPanel.validation.emailExists)
      return
    }

    try {
      // Uden dette kan brugeren ikke logge ind bagefter — registret er den ENESTE
      // kilde login-skærmen bruger til at finde ud af hvilket team en email hører til.
      if (window.electronRegistry) {
        const currentTeam = await window.electronRegistry.getCurrentTeam()
        if (currentTeam) await window.electronRegistry.assignUser(newUserEmail.toLowerCase(), currentTeam.teamId)
      }
      await setKvObjectField('users', newUserEmail.toLowerCase(), {
        email: newUserEmail.toLowerCase(),
        password: await hashPassword(newUserPassword.trim()),
        fullName: newUserName.trim(),
        role: 'user',
        isManager: false,
        phone: newUserPhone.trim(),
        // Manager-created accounts skip the approval flow.
        status: 'approved'
      })
    } catch (error) {
      console.error('Failed to save new user:', error)
      toast.error(`${t.managerPanel.validation.createFailedPrefix}: ${error instanceof Error ? error.message : String(error)}`)
      return
    }

    await loadUsers()
    
    setIsCreateDialogOpen(false)
    setNewUserName('')
    setNewUserEmail('')
    setNewUserPassword('')
    setNewUserPhone('')
    
    toast.success(t.managerPanel.validation.userCreated)
  }

  const deleteSickLeave = async (id: string) => {
    const previous = sickLeaveEntries
    setSickLeaveEntries(current => current.filter(entry => entry.id !== id))
    toast.success(t.managerPanel.sickLeave.deletedToast)

    try {
      await removeFromKvArray('sick-leave-entries', [id])
    } catch (error) {
      console.error('Failed to delete sick leave:', error)
      setSickLeaveEntries(previous)
      toast.error(t.managerPanel.vacationRequests.notFoundError)
      void loadSickLeaveEntries()
    }
  }

  /** Sender kvitterings-mail og notifikation. Maa aldrig forsinke selve beslutningen. */
  const sendVacationDecisionEmail = async (vacation: VacationEntry, approved: boolean) => {
    try {
      const emailContent = approved
        ? vacationApprovedEmail(vacation.startDate, vacation.endDate, userEmail, vacation.notes)
        : vacationRejectedEmail(vacation.startDate, vacation.endDate, userEmail, vacation.notes)
      const newEmail = {
        id: newId('email'),
        from: userEmail,
        to: vacation.userEmail,
        subject: emailContent.subject,
        message: emailContent.body,
        timestamp: Date.now(),
        read: false,
      }
      await appendToKvArray('emails', [newEmail])
      await appendToKvArray('email-notifications', [{
        id: newId('notif'),
        type: 'email' as const,
        message: approved ? t.managerPanel.vacationRequests.approvalEmailNotification : t.managerPanel.vacationRequests.rejectionEmailNotification,
        timestamp: Date.now(),
        read: false,
        from: userEmail,
        emailId: newEmail.id,
      }])
    } catch (emailError) {
      console.error('Kunne ikke sende feriebeslutnings-mail:', emailError)
    }
  }

  /**
   * Beslutningen vises straks: anmodningen forsvinder fra listen med det samme,
   * og skrivning + mail sker i baggrunden. Tidligere ventede brugeren paa en
   * skrivning, en unoedvendig genindlaesning og to mail-skrivninger.
   */
  const decideVacation = async (vacation: VacationEntry, status: 'approved' | 'rejected') => {
    const previous = vacationEntries
    setVacationEntries(current => current.filter(entry => entry.id !== vacation.id))
    if (status === 'approved') toast.success(t.managerPanel.vacationRequests.approvedToast)
    else toast.error(t.managerPanel.vacationRequests.rejectedToast)

    const updated = await updateKvArrayItem<VacationEntry>('vacation-entries', vacation.id, (v) => ({
      ...v, status: status as VacationStatus, reviewedBy: userEmail, reviewedAt: new Date().toISOString(),
    })).catch(error => { console.error('Kunne ikke gemme feriebeslutningen:', error); return null })

    if (!updated) {
      setVacationEntries(previous)
      toast.error(t.managerPanel.vacationRequests.notFoundError)
      void loadVacationEntries()
      return
    }
    void sendVacationDecisionEmail(vacation, status === 'approved')
  }

  const handleApproveVacation = (vacation: VacationEntry) => decideVacation(vacation, 'approved')

  const handleRejectVacation = (vacation: VacationEntry) => decideVacation(vacation, 'rejected')

  const openEditVacationDialog = (vacation: VacationEntry) => {
    setEditingVacation(vacation)
    setEditVacationStartDate(parseLocalDate(vacation.startDate))
    setEditVacationEndDate(parseLocalDate(vacation.endDate))
    setEditVacationNotes(vacation.notes || '')
    setIsEditVacationDialogOpen(true)
  }

  const toggleVacationSelected = (id: string) => {
    setSelectedVacationIds(current =>
      current.includes(id) ? current.filter(v => v !== id) : [...current, id]
    )
  }

  /** Batch-afgørelse: opdaterer hver valgt anmodning atomart og sender alle mails/notifikationer i ét skriv pr. nøgle. */
  const handleBulkVacationDecision = async (status: 'approved' | 'rejected') => {
    const selected = vacationEntries.filter(v => selectedVacationIds.includes(v.id))
    if (selected.length === 0) return
    setIsBulkProcessing(true)

    try {
      const emailItems: Array<{ id: string } & Record<string, unknown>> = []
      const notificationItems: Array<{ id: string } & Record<string, unknown>> = []
      let succeeded = 0

      for (const vacation of selected) {
        const updated = await updateKvArrayItem<VacationEntry>('vacation-entries', vacation.id, (v) => ({
          ...v, status: status as VacationStatus, reviewedBy: userEmail, reviewedAt: new Date().toISOString(),
        }))
        if (!updated) continue
        succeeded++

        const emailContent = status === 'approved'
          ? vacationApprovedEmail(vacation.startDate, vacation.endDate, userEmail, vacation.notes)
          : vacationRejectedEmail(vacation.startDate, vacation.endDate, userEmail, vacation.notes)
        const emailId = newId('email')
        emailItems.push({
          id: emailId,
          from: userEmail,
          to: vacation.userEmail,
          subject: emailContent.subject,
          message: emailContent.body,
          timestamp: Date.now(),
          read: false,
        })
        notificationItems.push({
          id: newId('notif'),
          type: 'email' as const,
          message: status === 'approved' ? t.managerPanel.vacationRequests.approvalEmailNotification : t.managerPanel.vacationRequests.rejectionEmailNotification,
          timestamp: Date.now(),
          read: false,
          from: userEmail,
          emailId,
        })
      }

      if (emailItems.length > 0) {
        // Mails maa ikke forsinke listen - de sendes i baggrunden.
        void appendToKvArray('emails', emailItems)
          .then(() => appendToKvArray('email-notifications', notificationItems))
          .catch(error => console.error('Kunne ikke sende beslutnings-mails:', error))
      }

      setVacationEntries(current => current.filter(entry => !selectedVacationIds.includes(entry.id)))
      setSelectedVacationIds([])

      if (succeeded === 0) {
        toast.error(t.managerPanel.vacationRequests.bulkNoneFound)
      } else if (status === 'approved') {
        toast.success(`${succeeded} ${succeeded === 1 ? t.managerPanel.vacationRequests.requestSingular : t.managerPanel.vacationRequests.requestPlural} ${t.managerPanel.vacationRequests.bulkApprovedSuffix}`)
      } else {
        toast.success(`${succeeded} ${succeeded === 1 ? t.managerPanel.vacationRequests.requestSingular : t.managerPanel.vacationRequests.requestPlural} ${t.managerPanel.vacationRequests.bulkRejectedSuffix}`)
      }
    } finally {
      setIsBulkProcessing(false)
    }
  }

  const handleSaveVacationEdit = async () => {
    if (!editingVacation || !editVacationStartDate || !editVacationEndDate) {
      toast.error(t.managerPanel.vacationOverview.startEndRequired)
      return
    }

    if (editVacationStartDate > editVacationEndDate) {
      toast.error(t.managerPanel.vacationOverview.startBeforeEnd)
      return
    }

    const editedEntry = await updateKvArrayItem<VacationEntry>('vacation-entries', editingVacation.id, (v) => ({
      ...v,
      startDate: format(editVacationStartDate, 'yyyy-MM-dd'),
      endDate: format(editVacationEndDate, 'yyyy-MM-dd'),
      notes: editVacationNotes.trim() || undefined,
    }))
    if (!editedEntry) {
      toast.error(t.managerPanel.vacationRequests.notFoundError)
      void loadVacationEntries()
      setIsEditVacationDialogOpen(false)
      return
    }
    setVacationEntries(current => current.map(entry => entry.id === editedEntry.id ? editedEntry : entry))
    setIsEditVacationDialogOpen(false)

    try {
      const emailContent = vacationEditedEmail(
        editingVacation.startDate,
        editingVacation.endDate,
        editVacationStartDate,
        editVacationEndDate,
        userEmail,
        editVacationNotes.trim() || undefined,
      )

      const newEmail = {
        id: newId('email'),
        from: userEmail,
        to: editingVacation.userEmail,
        subject: emailContent.subject,
        message: emailContent.body,
        timestamp: Date.now(),
        read: false
      }

      await appendToKvArray('emails', [newEmail])

      const notification = {
        id: newId('notif'),
        type: 'email' as const,
        message: t.managerPanel.vacationOverview.editedNotification,
        timestamp: Date.now(),
        read: false,
        from: userEmail,
        emailId: newEmail.id
      }

      await appendToKvArray('email-notifications', [notification])
    } catch (emailError) {
      console.error('Error sending vacation edit email:', emailError)
    }

    setEditingVacation(null)
    setEditVacationStartDate(undefined)
    setEditVacationEndDate(undefined)
    setEditVacationNotes('')
    toast.success(t.managerPanel.vacationOverview.updatedToast)
  }

  const deleteVacation = async (id: string) => {
    const allVacationsData = await window.kv.get<VacationEntry[]>('vacation-entries') || []
    const vacationToDelete = allVacationsData.find(v => v.id === id)
    
    if (!vacationToDelete) {
      toast.error(t.managerPanel.vacationOverview.notFoundError)
      return
    }

    await window.kv.update('vacation-entries', { op: 'remove', ids: [id] })
    await loadVacationEntries()
    toast.success(t.managerPanel.vacationOverview.deletedToast)

    try {
      const emailContent = vacationDeletedEmail(
        vacationToDelete.startDate,
        vacationToDelete.endDate,
        vacationToDelete.status,
        userEmail,
        vacationToDelete.notes,
      )

      const newEmail = {
        id: newId('email'),
        from: userEmail,
        to: vacationToDelete.userEmail,
        subject: emailContent.subject,
        message: emailContent.body,
        timestamp: Date.now(),
        read: false
      }

      await appendToKvArray('emails', [newEmail])

      const notification = {
        id: newId('notif'),
        type: 'email' as const,
        message: t.managerPanel.vacationOverview.deletedNotification,
        timestamp: Date.now(),
        read: false,
        from: userEmail,
        emailId: newEmail.id
      }

      await appendToKvArray('email-notifications', [notification])
    } catch (emailError) {
      console.error('Error sending vacation deletion email:', emailError)
    }
  }

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'manager':
        return (
          <Badge>
            <ShieldCheck size={14} className="mr-1" weight="fill" />
            {t.teamOverview.roleManager}
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            <UserIcon size={14} className="mr-1" />
            {t.teamOverview.userSingular}
          </Badge>
        )
    }
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.45_0.18_270/0.12),transparent_50%),radial-gradient(ellipse_at_bottom_right,oklch(0.55_0.13_255/0.10),transparent_50%),radial-gradient(ellipse_at_bottom_left,oklch(0.60_0.10_250/0.08),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(90deg, oklch(0.55 0.22 265 / 0.02) 0px, transparent 1px, transparent 100px, oklch(0.55 0.22 265 / 0.02) 101px),
                           repeating-linear-gradient(0deg, oklch(0.55 0.22 265 / 0.02) 0px, transparent 1px, transparent 100px, oklch(0.55 0.22 265 / 0.02) 101px)`
        }} />
        
        <Card className="p-8 max-w-md relative z-10">
          <div className="text-center space-y-4">
            <ShieldCheck size={64} className="text-destructive mx-auto" weight="duotone" />
            <h2 className="text-2xl font-bold">{t.managerPanel.noAccess.title}</h2>
            <p className="text-muted-foreground">{t.managerPanel.noAccess.description}</p>
            <Button onClick={onNavigateBack} className="w-full">
              <ArrowLeft size={20} className="mr-2" />
              {t.managerPanel.noAccess.backToHub}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">

      <div className="fixed top-6 right-6 left-6 z-30 pointer-events-none">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-16">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Button
                variant="outline"
                size="lg"
                onClick={onNavigateBack}
                className="pointer-events-auto bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4"
              >
                <ArrowLeft size={20} />
                {t.common.back}
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12 sm:pb-20 max-w-5xl relative z-10">
        <header className="mb-6 border-b pb-4">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {t.managerPanel.title}
          </h1>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 max-w-6xl">
            <TabsTrigger value="permissions" className="gap-2">
              <ShieldCheck size={18} />
              {t.managerPanel.tabs.permissions}
              {pendingUsers.length > 0 && (
                <Badge className="ml-1 h-5 px-1.5 bg-accent text-accent-foreground">
                  {pendingUsers.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sick-leave" className="gap-2">
              <FirstAidKit size={18} />
              {t.managerPanel.tabs.sickLeave}
            </TabsTrigger>
            <TabsTrigger value="vacation-requests" className="gap-2">
              <Umbrella size={18} />
              {t.managerPanel.tabs.vacationRequests}
              {vacationEntries.length > 0 && (
                <Badge className="ml-1 h-5 px-1.5 bg-accent text-accent-foreground">
                  {vacationEntries.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="vacation-overview" className="gap-2">
              <CalendarBlank size={18} />
              {t.managerPanel.tabs.vacationOverview}
            </TabsTrigger>
            <TabsTrigger value="birthdays" className="gap-2">
              <Gift size={18} />
              {t.managerPanel.tabs.birthdays}
            </TabsTrigger>
            <TabsTrigger value="guide-access" className="gap-2">
              <LockKey size={18} />
              {t.managerPanel.tabs.guideAccess}
              {pendingGuideAccessRequests.length > 0 && (
                <Badge className="ml-1 h-5 px-1.5 bg-accent text-accent-foreground">
                  {pendingGuideAccessRequests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="permissions" className="space-y-6">
            {pendingUsers.length > 0 && (
              <Card className="p-6 border-attention/40 bg-attention-surface">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <UserIcon size={28} className="text-amber-600 dark:text-amber-400" weight="duotone" />
                    <h2 className="text-2xl font-bold">{t.managerPanel.permissions.newRequestsTitle}</h2>
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                    {pendingUsers.length} {pendingUsers.length === 1 ? t.managerPanel.permissions.requestSingular : t.managerPanel.permissions.requestPlural}
                  </Badge>
                </div>
                <div className="mb-4 p-3 bg-background/60 rounded-lg border text-sm text-muted-foreground">
                  {t.managerPanel.permissions.newRequestsDescription}
                </div>
                <div className="space-y-3">
                  {pendingUsers.map((user) => (
                    <motion.div
                      key={user.email}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-md border bg-card"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-lg">{user.fullName}</div>
                        <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                        {user.phone && <div className="text-xs text-muted-foreground mt-0.5">{t.managerPanel.permissions.phonePrefix}: {user.phone}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleApproveUser(user)}
                          className="gap-2"
                        >
                          <Check size={18} weight="bold" />
                          {t.managerPanel.permissions.approve}
                        </Button>
                        <Button
                          onClick={() => handleRejectUser(user)}
                          variant="destructive"
                          className="gap-2"
                        >
                          <X size={18} weight="bold" />
                          {t.managerPanel.permissions.reject}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={28} className="text-primary" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.managerPanel.permissions.overviewTitle}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-sm">
                    {users.length} {users.length === 1 ? t.teamOverview.userSingular : t.teamOverview.userPlural}
                  </Badge>
                  <Button
                    onClick={() => setIsOnboardingOpen(true)}
                    variant="outline"
                    className="gap-2"
                  >
                    <UserIcon size={18} weight="bold" />
                    {t.managerPanel.permissions.onboarding}
                  </Button>
                  <Button
                    onClick={() => setIsOffboardingOpen(true)}
                    variant="outline"
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <UserIcon size={18} weight="bold" />
                    {t.managerPanel.permissions.offboarding}
                  </Button>
                  <Button 
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="gap-2"
                  >
                    <Plus size={18} weight="bold" />
                    {t.managerPanel.permissions.createUser}
                  </Button>
                </div>
              </div>

              {isLoading ? (
                <p className="text-muted-foreground text-center py-12">{t.managerPanel.permissions.loading}</p>
              ) : users.length === 0 ? (
                <p className="text-muted-foreground text-center py-12">{t.managerPanel.permissions.noneFound}</p>
              ) : (
                <div className="space-y-3">
                  {users.map((user) => (
                    <motion.div
                      key={user.email}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-lg mb-1">{user.fullName}</div>
                          <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                          <div className="text-xs text-muted-foreground mt-1">{getRoleDescription(user.role, language)}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          {user.status === 'rejected' && (
                            <Badge variant="destructive" className="text-xs">{t.managerPanel.permissions.rejectedBadge}</Badge>
                          )}
                          {getRoleBadge(user.role)}
                        </div>
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="w-10 h-10 rounded-md flex items-center justify-center font-bold text-sm border border-transparent hover:border-primary/40 transition-colors"
                              style={{
                                backgroundColor: getEmployeeColorByEmail(user.email, colorOverrides).bg,
                                color: getEmployeeColorByEmail(user.email, colorOverrides).text,
                              }}
                              title={language === 'da' ? 'Skift farve' : language === 'fi' ? 'Vaihda väri' : 'Change color'}
                            >
                              {user.fullName.charAt(0).toUpperCase()}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64">
                            <div className="space-y-3">
                              <div className="text-sm font-semibold">
                                {language === 'da' ? 'Vælg farve' : language === 'fi' ? 'Valitse väri' : 'Choose color'}
                              </div>
                              <div className="grid grid-cols-8 gap-2">
                                {EMPLOYEE_COLOR_PALETTE.map((color, index) => {
                                  const isActive = colorOverrides?.[user.email.trim().toLowerCase()] === index
                                  return (
                                    <button
                                      key={color.name}
                                      type="button"
                                      onClick={() => setUserColor(user.email, index)}
                                      className={cn(
                                        'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                                        isActive ? 'border-foreground ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-transparent'
                                      )}
                                      style={{ backgroundColor: color.bg }}
                                      title={color.name}
                                    />
                                  )
                                })}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => resetUserColor(user.email)}
                              >
                                {language === 'da' ? 'Nulstil til automatisk' : language === 'fi' ? 'Palauta automaattiseksi' : 'Reset to automatic'}
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditNameDialog(user)}
                          className="hover:bg-primary/10"
                        >
                          <PencilSimple size={20} />
                        </Button>
                        <Select
                          value={user.role}
                          onValueChange={(value) => changeUserRole(user.email, value as UserRole)}
                        >
                          <SelectTrigger className="w-40 h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">
                              <div className="flex items-center gap-2">
                                <UserIcon size={16} />
                                {t.teamOverview.userSingular}
                              </div>
                            </SelectItem>
                            <SelectItem value="manager">
                              <div className="flex items-center gap-2">
                                <ShieldCheck size={16} />
                                {t.teamOverview.roleManager}
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                              <Trash size={20} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t.managerPanel.permissions.deleteTitle}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t.managerPanel.permissions.deleteConfirmPrefix} <strong>{user.fullName}</strong>{t.managerPanel.permissions.deleteConfirmSuffix}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUser(user.email)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t.managerPanel.permissions.deleteAction}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-3 mb-5">
                <Books size={28} className="text-primary shrink-0" weight="duotone" />
                <div>
                  <h2 className="text-2xl font-bold">Guide Admins</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {language === 'da'
                      ? 'Vælg brugere, som må reviewe, redigere og godkende andre brugeres guideforslag. De får ingen øvrige managerrettigheder og kan ikke godkende deres egne indsendelser.'
                      : language === 'fi'
                        ? 'Valitse käyttäjät, jotka voivat tarkistaa, muokata ja hyväksyä muiden opasehdotuksia. He eivät saa muita esihenkilöoikeuksia eivätkä voi hyväksyä omia lähetyksiään.'
                        : 'Choose users who may review, edit and approve other users’ guide proposals. They receive no other manager permissions and cannot approve their own submissions.'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {users.filter((user) => user.status !== 'rejected').map((user) => {
                  const automaticReviewer = user.role === 'manager' || user.role === 'creator'
                  const checked = automaticReviewer || (guideAdminEmails || []).some((email) => email.toLowerCase() === user.email.toLowerCase())
                  return (
                    <label key={user.email} className={cn('flex items-center justify-between gap-4 rounded-md border p-4', !automaticReviewer && 'cursor-pointer hover:border-primary/40')}>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{user.fullName}</div>
                        <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {automaticReviewer && <Badge variant="secondary">{language === 'da' ? 'Automatisk via managerrolle' : language === 'fi' ? 'Automaattinen esihenkilöroolin kautta' : 'Automatic through manager role'}</Badge>}
                        {!automaticReviewer && checked && <Badge variant="outline">Guide Admin</Badge>}
                        <Checkbox checked={checked} disabled={automaticReviewer} onCheckedChange={(value) => setGuideAdmin(user.email, value === true)} />
                      </div>
                    </label>
                  )
                })}
              </div>
            </Card>

            <Card className="p-6 bg-muted/30">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={24} className="text-primary mt-0.5" weight="fill" />
                  <div>
                    <h3 className="font-bold text-lg mb-1">{t.teamOverview.roleManager}</h3>
                    <p className="text-sm text-muted-foreground">{getRoleDescription('manager', language)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <UserIcon size={24} className="text-secondary mt-0.5" />
                  <div>
                    <h3 className="font-bold text-lg mb-1">{t.teamOverview.userSingular}</h3>
                    <p className="text-sm text-muted-foreground">{getRoleDescription('user', language)}</p>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="sick-leave" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <FirstAidKit size={28} className="text-destructive" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.managerPanel.sickLeave.title}</h2>
                </div>
                <Badge variant="outline" className="text-sm">
                  {sickLeaveEntries.length} {sickLeaveEntries.length === 1 ? t.managerPanel.sickLeave.entrySingular : t.managerPanel.sickLeave.entryPlural}
                </Badge>
              </div>

              <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {(() => {
                  const employeeStats = new Map<string, { 
                    name: string
                    email: string
                    count: number
                    lastDate: string 
                  }>()

                  const selfSickEntries = sickLeaveEntries.filter(e => e.type !== 'child')
                  const childSickEntries = sickLeaveEntries.filter(e => e.type === 'child')

                  sickLeaveEntries.forEach((entry) => {
                    const existing = employeeStats.get(entry.userEmail)
                    if (existing) {
                      existing.count++
                      const existingDate = new Date(existing.lastDate)
                      const currentDate = parseLocalDate(entry.startDate)
                      if (currentDate > existingDate) {
                        existing.lastDate = entry.startDate
                      }
                    } else {
                      employeeStats.set(entry.userEmail, {
                        name: entry.userName,
                        email: entry.userEmail,
                        count: 1,
                        lastDate: entry.startDate
                      })
                    }
                  })

                  const sortedStats = Array.from(employeeStats.values()).sort((a, b) => b.count - a.count)
                  const totalEmployees = users.length
                  const employeesWithSickLeave = employeeStats.size
                  const totalSickDays = sickLeaveEntries.length

                  return (
                    <>
                      <Card className="p-4 bg-blocked-surface border-blocked/25">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-muted-foreground">{t.managerPanel.sickLeave.selfSickness}</div>
                          <FirstAidKit size={20} className="text-destructive" weight="duotone" />
                        </div>
                        <div className="text-3xl font-bold text-destructive">{selfSickEntries.length}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {t.managerPanel.sickLeave.selfSicknessUnit}
                        </div>
                      </Card>

                      <Card className="p-4 bg-attention-surface border-attention/25">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-muted-foreground">{t.managerPanel.sickLeave.childSick}</div>
                          <UserIcon size={20} className="text-orange-600" weight="duotone" />
                        </div>
                        <div className="text-3xl font-bold text-orange-600">{childSickEntries.length}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {t.managerPanel.sickLeave.childSickUnit}
                        </div>
                      </Card>

                      <Card className="p-4 bg-accent/10 border-accent/25">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-muted-foreground">{t.managerPanel.sickLeave.totalSickness}</div>
                          <FirstAidKit size={20} className="text-accent" weight="duotone" />
                        </div>
                        <div className="text-3xl font-bold text-accent">{totalSickDays}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {employeesWithSickLeave} {t.managerPanel.sickLeave.ofEmployees} {totalEmployees} {t.managerPanel.sickLeave.employeesUnit}
                        </div>
                      </Card>

                      <Card className="p-4 bg-primary/10 border-primary/25">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-muted-foreground">{t.managerPanel.sickLeave.mostSickness}</div>
                          <Crown size={20} className="text-primary" weight="duotone" />
                        </div>
                        {sortedStats.length > 0 ? (
                          <>
                            <div className="text-sm leading-snug font-bold text-primary break-words line-clamp-2" title={sortedStats[0].name}>{sortedStats[0].name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {sortedStats[0].count} {sortedStats[0].count === 1 ? t.managerPanel.sickLeave.entrySingular : t.managerPanel.sickLeave.entryPlural}
                            </div>
                          </>
                        ) : (
                          <div className="text-lg font-bold text-muted-foreground">{t.managerPanel.sickLeave.noData}</div>
                        )}
                      </Card>
                    </>
                  )
                })()}
              </div>

              {sickLeaveEntries.length > 0 && (() => {
                // Mønster-analyse: ugedags-heatmap (90 dage) + alarm ved ≥3 sygemeldinger på 30 dage.
                const now = Date.now()
                const DAY_MS = 86400000
                const last90 = sickLeaveEntries.filter(e => {
                  const d = parseLocalDate(e.startDate)
                  return !isNaN(d.getTime()) && now - d.getTime() <= 90 * DAY_MS
                })

                const weekdayLabels = t.managerPanel.weekdaysShort
                const weekdayCounts = new Array(7).fill(0)
                last90.forEach(e => {
                  const d = parseLocalDate(e.startDate)
                  if (isNaN(d.getTime())) return
                  weekdayCounts[(d.getDay() + 6) % 7]++
                })
                const maxWeekday = Math.max(...weekdayCounts, 1)

                const last30ByEmployee = new Map<string, { name: string; count: number }>()
                sickLeaveEntries.forEach(e => {
                  const d = parseLocalDate(e.startDate)
                  if (isNaN(d.getTime()) || now - d.getTime() > 30 * DAY_MS) return
                  const existing = last30ByEmployee.get(e.userEmail)
                  if (existing) existing.count++
                  else last30ByEmployee.set(e.userEmail, { name: e.userName, count: 1 })
                })
                const frequencyAlerts = Array.from(last30ByEmployee.values())
                  .filter(s => s.count >= 3)
                  .sort((a, b) => b.count - a.count)

                return (
                  <Card className="p-4 mb-6 border">
                    <div className="flex items-center gap-2 mb-4">
                      <WaveSine size={20} className="text-primary" weight="duotone" />
                      <h3 className="font-bold text-lg">{t.managerPanel.sickLeave.patternsTitle}</h3>
                      <span className="text-xs text-muted-foreground ml-1">{t.managerPanel.sickLeave.patternsSubtitle}</span>
                    </div>

                    <div className="grid grid-cols-7 gap-2 mb-2">
                      {weekdayLabels.map((label, i) => {
                        const count = weekdayCounts[i]
                        const intensity = count / maxWeekday
                        return (
                          <div key={label} className="flex flex-col items-center gap-1.5">
                            <div
                              className="w-full h-16 rounded-lg border flex items-end justify-center pb-1 transition-colors"
                              style={{
                                backgroundColor: count === 0
                                  ? 'transparent'
                                  : `oklch(0.55 0.18 25 / ${0.12 + intensity * 0.55})`
                              }}
                              title={`${count} ${count === 1 ? t.managerPanel.sickLeave.entrySingular : t.managerPanel.sickLeave.entryPlural} ${t.managerPanel.sickLeave.weekdayTooltipOn} ${label}`}
                            >
                              <span className={cn("text-sm font-bold", count === 0 ? "text-muted-foreground/40" : "text-foreground")}>
                                {count}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">{label}</span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {t.managerPanel.sickLeave.patternsHint}
                    </p>

                    {frequencyAlerts.length > 0 && (
                      <div className="p-4 rounded-md border border-attention/40 bg-attention-surface">
                        <div className="flex items-center gap-2 mb-2">
                          <FirstAidKit size={18} className="text-amber-600 dark:text-amber-400" weight="fill" />
                          <span className="font-semibold text-sm">{t.managerPanel.sickLeave.frequencyAlertTitle}</span>
                        </div>
                        <div className="space-y-1.5">
                          {frequencyAlerts.map(alert => (
                            <div key={alert.name} className="flex items-center justify-between text-sm">
                              <span className="font-medium">{alert.name}</span>
                              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                {alert.count} {t.managerPanel.sickLeave.entryPlural}
                              </Badge>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {t.managerPanel.sickLeave.frequencyAlertHint}
                        </p>
                      </div>
                    )}
                  </Card>
                )
              })()}

              {sickLeaveEntries.length > 0 && (() => {
                const employeeStats = new Map<string, { 
                  name: string
                  email: string
                  count: number
                  lastDate: string 
                }>()

                sickLeaveEntries.forEach((entry) => {
                  const existing = employeeStats.get(entry.userEmail)
                  if (existing) {
                    existing.count++
                    const existingDate = new Date(existing.lastDate)
                    const currentDate = parseLocalDate(entry.startDate)
                    if (currentDate > existingDate) {
                      existing.lastDate = entry.startDate
                    }
                  } else {
                    employeeStats.set(entry.userEmail, {
                      name: entry.userName,
                      email: entry.userEmail,
                      count: 1,
                      lastDate: entry.startDate
                    })
                  }
                })

                const sortedStats = Array.from(employeeStats.values()).sort((a, b) => b.count - a.count)

                return (
                  <Card className="p-4 mb-6 bg-muted/30 border">
                    <div className="flex items-center gap-2 mb-4">
                      <UserIcon size={20} className="text-primary" weight="duotone" />
                      <h3 className="font-bold text-lg">{t.managerPanel.sickLeave.employeeStatsTitle}</h3>
                    </div>
                    <div className="space-y-2">
                      {sortedStats.map((stat, index) => (
                        <div 
                          key={stat.email}
                          className="flex items-center justify-between p-3 rounded-lg bg-card border hover:shadow-sm transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blocked-surface text-blocked font-bold text-sm">
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-semibold">{stat.name}</div>
                              <div className="text-xs text-muted-foreground">{stat.email}</div>
                            </div>
                          </div>
                            <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="font-bold text-lg text-destructive">{stat.count}</div>
                              <div className="text-xs text-muted-foreground">
                                {stat.count === 1 ? t.managerPanel.sickLeave.entrySingular : t.managerPanel.sickLeave.entryPlural}
                              </div>
                            </div>
                            <div className="text-right min-w-[100px]">
                              <div className="text-xs text-muted-foreground">{t.managerPanel.sickLeave.latestLabel}</div>
                              <div className="text-sm font-medium">
                                {(() => {
                                  try {
                                    const date = new Date(stat.lastDate)
                                    if (isNaN(date.getTime())) return t.managerPanel.sickLeave.invalidDate
                                    return format(date, 'd. MMM', { locale: dateLocale })
                                  } catch {
                                    return t.managerPanel.sickLeave.invalidDate
                                  }
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )
              })()}

              <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  {t.managerPanel.sickLeave.managementDescription}
                </p>
              </div>

              {sickLeaveEntries.length === 0 ? (
                <div className="text-center py-12">
                  <FirstAidKit size={64} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                  <p className="text-muted-foreground">{t.managerPanel.sickLeave.none}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sickLeaveEntries.map((entry) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-lg mb-1">{entry.userName}</div>
                          <div className="text-sm text-muted-foreground">{entry.userEmail}</div>
                          <div className="flex flex-col gap-1 mt-2 text-sm">
                            <span className="font-medium">
                              {(() => {
                                try {
                                  const startDate = parseLocalDate(entry.startDate)
                                  if (isNaN(startDate.getTime())) return t.managerPanel.sickLeave.invalidDateFull
                                  return format(startDate, 'd. MMM yyyy', { locale: dateLocale })
                                } catch {
                                  return t.managerPanel.sickLeave.invalidDateFull
                                }
                              })()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {t.managerPanel.sickLeave.submittedPrefix}: {(() => {
                                try {
                                  const date = new Date(entry.submittedAt)
                                  if (isNaN(date.getTime())) return t.managerPanel.sickLeave.invalidDateFull
                                  return format(date, 'd. MMM yyyy HH:mm', { locale: dateLocale })
                                } catch {
                                  return t.managerPanel.sickLeave.invalidDateFull
                                }
                              })()}
                            </span>
                            {entry.reason && (
                              <span className="text-muted-foreground mt-1">{t.managerPanel.sickLeave.notesPrefix}: {entry.reason}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={entry.type === 'child' ? "bg-orange-500 text-white" : "bg-green-500 text-white"}>
                            <Check size={14} className="mr-1" />
                            {entry.type === 'child' ? t.managerPanel.sickLeave.childSickBadge : t.managerPanel.sickLeave.sickBadge}
                          </Badge>
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash size={20} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t.managerPanel.sickLeave.deleteTitle}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.managerPanel.sickLeave.deleteConfirmPrefix} <strong>{entry.userName}</strong>{t.managerPanel.sickLeave.deleteConfirmSuffix}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteSickLeave(entry.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t.managerPanel.sickLeave.deleteAction}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="vacation-requests" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Umbrella size={28} className="text-accent" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.managerPanel.vacationRequests.title}</h2>
                </div>
                <Badge variant="outline" className="text-sm">
                  {vacationEntries.length} {vacationEntries.length === 1 ? t.managerPanel.vacationRequests.requestSingular : t.managerPanel.vacationRequests.requestPlural}
                </Badge>
              </div>

              <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  {t.managerPanel.vacationRequests.description}
                </p>
              </div>

              {vacationEntries.length > 1 && (
                <div className="mb-4 flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-card">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                    <Checkbox
                      checked={selectedVacationIds.length === vacationEntries.length && vacationEntries.length > 0}
                      onCheckedChange={(checked) =>
                        setSelectedVacationIds(checked ? vacationEntries.map(v => v.id) : [])
                      }
                    />
                    {t.managerPanel.vacationRequests.selectAll}
                  </label>
                  {selectedVacationIds.length > 0 && (
                    <>
                      <Badge variant="secondary">{selectedVacationIds.length} {t.managerPanel.vacationRequests.selectedCountSuffix}</Badge>
                      <div className="flex gap-2 ml-auto">
                        <Button
                          size="sm"
                          disabled={isBulkProcessing}
                          onClick={() => handleBulkVacationDecision('approved')}
                          className="gap-2"
                        >
                          <Check size={16} weight="bold" />
                          {isBulkProcessing ? t.managerPanel.vacationRequests.processing : `${t.managerPanel.vacationRequests.approveSelectedPrefix} (${selectedVacationIds.length})`}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isBulkProcessing}
                          onClick={() => handleBulkVacationDecision('rejected')}
                          className="gap-2"
                        >
                          <X size={16} weight="bold" />
                          {t.managerPanel.vacationRequests.rejectSelected}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {vacationEntries.length === 0 ? (
                <div className="text-center py-12">
                  <Umbrella size={64} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                  <p className="text-muted-foreground">{t.managerPanel.vacationRequests.none}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {vacationEntries.map((vacation) => {
                    const requestingUser = users.find(u => u.email.toLowerCase() === vacation.userEmail.toLowerCase())
                    const displayName = requestingUser?.fullName || vacation.userEmail
                    const firstLetter = requestingUser?.fullName?.charAt(0).toUpperCase() || vacation.userEmail.charAt(0).toUpperCase()
                    
                    return (
                    <motion.div
                      key={vacation.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex flex-col gap-4 p-5 rounded-md border bg-card hover:border-primary/40 transition-colors",
                        selectedVacationIds.includes(vacation.id) && "border-primary/60 bg-primary/[0.03]"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <Checkbox
                            checked={selectedVacationIds.includes(vacation.id)}
                            onCheckedChange={() => toggleVacationSelected(vacation.id)}
                            className="shrink-0"
                          />
                          <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                            {firstLetter}
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-lg mb-1">{displayName}</div>
                            <div className="flex flex-col gap-1 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-muted-foreground">{t.managerPanel.vacationRequests.fromLabel}</span>
                                <span className="font-semibold">
                                  {(() => {
                                    try {
                                      const date = parseLocalDate(vacation.startDate)
                                      if (isNaN(date.getTime())) return t.managerPanel.vacationRequests.invalidDate
                                      return format(date, 'd. MMM yyyy', { locale: dateLocale })
                                    } catch {
                                      return t.managerPanel.vacationRequests.invalidDate
                                    }
                                  })()}
                                </span>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-medium text-muted-foreground">{t.managerPanel.vacationRequests.toLabel}</span>
                                <span className="font-semibold">
                                  {(() => {
                                    try {
                                      const date = parseLocalDate(vacation.endDate)
                                      if (isNaN(date.getTime())) return t.managerPanel.vacationRequests.invalidDate
                                      return format(date, 'd. MMM yyyy', { locale: dateLocale })
                                    } catch {
                                      return t.managerPanel.vacationRequests.invalidDate
                                    }
                                  })()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                          <ClockCounterClockwise size={14} className="mr-1" />
                          {t.managerPanel.vacationRequests.pendingBadge}
                        </Badge>
                      </div>

                      {vacation.notes && (
                        <div className="pl-16">
                          <div className="text-sm bg-muted p-3 rounded-lg">
                            <span className="font-semibold text-muted-foreground">{t.managerPanel.vacationRequests.notesPrefix}: </span>
                            {vacation.notes}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pl-16">
                        <Button
                          onClick={() => {
                            const startDate = parseLocalDate(vacation.startDate)
                            setPreviewMonth(startDate.getMonth())
                            setPreviewYear(startDate.getFullYear())
                            setPreviewVacation(vacation)
                            setIsPreviewDialogOpen(true)
                          }}
                          variant="outline"
                          className="gap-2"
                        >
                          <Eye size={18} weight="bold" />
                          {t.managerPanel.vacationRequests.preview}
                        </Button>
                        <Button
                          onClick={() => handleApproveVacation(vacation)}
                          className="flex-1 gap-2"
                        >
                          <Check size={18} weight="bold" />
                          {t.managerPanel.vacationRequests.approve}
                        </Button>
                        <Button
                          onClick={() => handleRejectVacation(vacation)}
                          variant="destructive"
                          className="flex-1 gap-2"
                        >
                          <X size={18} weight="bold" />
                          {t.managerPanel.vacationRequests.reject}
                        </Button>
                      </div>
                    </motion.div>
                  )})}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="vacation-overview" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <CalendarBlank size={28} className="text-primary" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.managerPanel.vacationOverview.title}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <Button 
                    onClick={() => setIsManualGrantDialogOpen(true)}
                    className="gap-2"
                  >
                    <Gift size={18} weight="bold" />
                    {t.managerPanel.vacationOverview.grantButton}
                  </Button>
                  <Select value={vacationFilter} onValueChange={(value: 'all' | 'pending' | 'approved') => setVacationFilter(value)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.managerPanel.vacationOverview.filterAll}</SelectItem>
                      <SelectItem value="pending">{t.managerPanel.vacationOverview.filterPending}</SelectItem>
                      <SelectItem value="approved">{t.managerPanel.vacationOverview.filterApproved}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="text-sm">
                    {allVacations.filter(v => vacationFilter === 'all' || v.status === vacationFilter).length} {allVacations.filter(v => vacationFilter === 'all' || v.status === vacationFilter).length === 1 ? t.managerPanel.vacationOverview.vacationSingular : t.managerPanel.vacationOverview.vacationPlural}
                  </Badge>
                </div>
              </div>

              <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  {t.managerPanel.vacationOverview.description}
                </p>
              </div>

              {allVacations.filter(v => vacationFilter === 'all' || v.status === vacationFilter).length === 0 ? (
                <div className="text-center py-12">
                  <CalendarBlank size={64} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                  <p className="text-muted-foreground">{t.managerPanel.vacationOverview.none}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allVacations.filter(v => vacationFilter === 'all' || v.status === vacationFilter).map((vacation) => {
                    const getUserName = () => {
                      const user = users.find(u => u.email === vacation.userEmail)
                      return user ? user.fullName : vacation.userEmail
                    }

                    return (
                      <motion.div
                        key={vacation.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors group"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex-1">
                            <div className="font-bold text-lg mb-1">{getUserName()}</div>
                            <div className="text-sm text-muted-foreground mb-2">{vacation.userEmail}</div>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="font-medium">
                                {(() => {
                                  try {
                                    const date = parseLocalDate(vacation.startDate)
                                    if (isNaN(date.getTime())) return t.managerPanel.vacationOverview.invalidDate
                                    return format(date, 'd. MMM yyyy', { locale: dateLocale })
                                  } catch {
                                    return t.managerPanel.vacationOverview.invalidDate
                                  }
                                })()}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium">
                                {(() => {
                                  try {
                                    const date = parseLocalDate(vacation.endDate)
                                    if (isNaN(date.getTime())) return t.managerPanel.vacationOverview.invalidDate
                                    return format(date, 'd. MMM yyyy', { locale: dateLocale })
                                  } catch {
                                    return t.managerPanel.vacationOverview.invalidDate
                                  }
                                })()}
                              </span>
                            </div>
                            {vacation.notes && (
                              <div className="text-xs text-muted-foreground mt-2">
                                {vacation.notes}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {vacation.status === 'pending' && (
                              <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                                <ClockCounterClockwise size={14} className="mr-1" />
                                {t.managerPanel.vacationOverview.pendingBadge}
                              </Badge>
                            )}
                            {vacation.status === 'approved' && (
                              <Badge className="bg-green-500/20 text-green-700 border-green-500/30">
                                <Check size={14} className="mr-1" />
                                {t.managerPanel.vacationOverview.approvedBadge}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="ml-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openEditVacationDialog(vacation)}
                            className="hover:bg-primary/10"
                          >
                            <PencilSimple size={20} />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash size={20} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t.managerPanel.vacationOverview.deleteTitle}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t.managerPanel.vacationOverview.deleteConfirmPrefix} <strong>{getUserName()}</strong>{t.managerPanel.vacationOverview.deleteConfirmSuffix}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteVacation(vacation.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t.managerPanel.vacationOverview.deleteAction}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="birthdays" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Gift size={28} className="text-accent" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.managerPanel.birthdays.title}</h2>
                </div>
                <Badge variant="outline" className="text-sm">
                  {birthdays.length} {birthdays.length === 1 ? t.managerPanel.birthdays.singular : t.managerPanel.birthdays.plural}
                </Badge>
              </div>

              <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  {t.managerPanel.birthdays.description}
                </p>
              </div>

              {isLoading ? (
                <p className="text-muted-foreground text-center py-12">{t.managerPanel.birthdays.loading}</p>
              ) : users.length === 0 ? (
                <p className="text-muted-foreground text-center py-12">{t.managerPanel.birthdays.noneFound}</p>
              ) : (
                <div className="space-y-3">
                  {users.map((user) => {
                    const birthdayEntry = birthdays.find(b => b.email === user.email)
                    const hasBirthday = !!birthdayEntry
                    
                    let birthdayDisplay = t.managerPanel.birthdays.noneRegistered
                    let daysUntilBirthday: number | null = null
                    
                    if (birthdayEntry) {
                      try {
                        const [month, day] = birthdayEntry.birthday.split('-').map(Number)
                        const today = new Date()
                        const thisYear = today.getFullYear()
                        let nextBirthday = new Date(thisYear, month - 1, day)
                        
                        if (nextBirthday < today) {
                          nextBirthday = new Date(thisYear + 1, month - 1, day)
                        }
                        
                        const diffTime = nextBirthday.getTime() - today.getTime()
                        daysUntilBirthday = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                        
                        const monthNames = t.managerPanel.birthdays.months
                        birthdayDisplay = `${day}. ${monthNames[month - 1]}`
                      } catch (error) {
                        birthdayDisplay = birthdayEntry.birthday
                      }
                    }

                    return (
                      <motion.div
                        key={user.email}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors cursor-pointer"
                        onClick={() => openEditBirthdayDialog({
                          email: user.email,
                          fullName: user.fullName,
                          birthday: birthdayEntry?.birthday || ''
                        })}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="font-bold text-lg">{user.fullName}</div>
                            </div>
                            <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                            <div className={cn(
                              "text-sm mt-1 flex items-center gap-2",
                              hasBirthday ? "text-foreground font-medium" : "text-muted-foreground"
                            )}>
                              <Gift size={16} weight={hasBirthday ? "fill" : "regular"} />
                              {birthdayDisplay}
                              {daysUntilBirthday !== null && daysUntilBirthday <= 7 && (
                                <Badge className="ml-2 bg-accent/20 text-accent border-accent/30">
                                  {daysUntilBirthday === 0 ? t.managerPanel.birthdays.todayBadge : daysUntilBirthday === 1 ? t.managerPanel.birthdays.tomorrowBadge : `${t.managerPanel.birthdays.inDaysPrefix} ${daysUntilBirthday} ${t.managerPanel.birthdays.inDaysSuffix}`}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="ml-4 flex items-center gap-2">
                          {hasBirthday ? (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditBirthdayDialog(birthdayEntry)
                                }}
                                className="hover:bg-primary/10"
                              >
                                <PencilSimple size={20} />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash size={20} />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t.managerPanel.birthdays.deleteTitle}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t.managerPanel.birthdays.deleteConfirmPrefix} <strong>{user.fullName}</strong>{t.managerPanel.birthdays.deleteConfirmSuffix}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteBirthday(user.email)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {t.managerPanel.birthdays.deleteAction}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                openEditBirthdayDialog({
                                  email: user.email,
                                  fullName: user.fullName,
                                  birthday: ''
                                })
                              }}
                              className="gap-2"
                            >
                              <Plus size={16} weight="bold" />
                              {t.managerPanel.birthdays.addButton}
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="guide-access" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <LockKey size={28} className="text-primary" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.managerPanel.guideAccessRequests.title}</h2>
                </div>
                {pendingGuideAccessRequests.length > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                    {pendingGuideAccessRequests.length}
                  </Badge>
                )}
              </div>
              <div className="mb-4 p-3 bg-background/60 rounded-lg border text-sm text-muted-foreground">
                {t.managerPanel.guideAccessRequests.description}
              </div>
              {pendingGuideAccessRequests.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{t.managerPanel.guideAccessRequests.none}</p>
              ) : (
                <div className="space-y-3">
                  {pendingGuideAccessRequests.map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-md border bg-card flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="font-bold truncate">{request.guideTitle}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {request.requestingUserName} ({request.requestingTeamCode})
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive hover:bg-destructive/10"
                          onClick={() => handleRejectGuideAccessRequest(request)}
                        >
                          <X size={16} weight="bold" />
                          {t.managerPanel.guideAccessRequests.reject}
                        </Button>
                        <Button size="sm" className="gap-1.5" onClick={() => handleApproveGuideAccessRequest(request)}>
                          <Check size={16} weight="bold" />
                          {t.managerPanel.guideAccessRequests.approve}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

        </Tabs>
      </div>

      <Dialog open={isEditVacationDialogOpen} onOpenChange={setIsEditVacationDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.managerPanel.dialogs.editVacation.title}</DialogTitle>
            <DialogDescription>
              {t.managerPanel.dialogs.editVacation.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.managerPanel.dialogs.editVacation.startDate}</Label>
              <DatePickerField
                value={editVacationStartDate ? format(editVacationStartDate, 'yyyy-MM-dd') : ''}
                onChange={(value) => setEditVacationStartDate(value ? new Date(value) : undefined)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.managerPanel.dialogs.editVacation.endDate}</Label>
              <DatePickerField
                value={editVacationEndDate ? format(editVacationEndDate, 'yyyy-MM-dd') : ''}
                onChange={(value) => setEditVacationEndDate(value ? new Date(value) : undefined)}
                min={editVacationStartDate ? format(editVacationStartDate, 'yyyy-MM-dd') : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-vacation-notes">{t.managerPanel.dialogs.editVacation.notesLabel}</Label>
              <Textarea
                id="edit-vacation-notes"
                value={editVacationNotes}
                onChange={(e) => setEditVacationNotes(e.target.value)}
                placeholder={t.managerPanel.dialogs.editVacation.notesPlaceholder}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditVacationDialogOpen(false)
              setEditingVacation(null)
              setEditVacationStartDate(undefined)
              setEditVacationEndDate(undefined)
              setEditVacationNotes('')
            }}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSaveVacationEdit} className="gap-2">
              <Check size={18} weight="bold" />
              {t.managerPanel.dialogs.editVacation.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.managerPanel.dialogs.editUser.title}</DialogTitle>
            <DialogDescription>
              {t.managerPanel.dialogs.editUser.descriptionPrefix} {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">{t.managerPanel.dialogs.editUser.fullNameLabel}</Label>
              <Input
                id="user-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.managerPanel.dialogs.editUser.fullNamePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">{t.managerPanel.dialogs.editUser.emailLabel}</Label>
              <Input
                id="user-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t.managerPanel.dialogs.editUser.emailPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-phone">{t.managerPanel.dialogs.editUser.phoneLabel}</Label>
              <div className="flex gap-2">
                <Phone size={20} className="text-muted-foreground mt-2.5" />
                <Input
                  id="user-phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder={t.managerPanel.dialogs.editUser.phonePlaceholder}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-username">{t.managerPanel.dialogs.editUser.usernameLabel}</Label>
              <Input
                id="user-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={t.managerPanel.dialogs.editUser.usernamePlaceholder}
              />
              <p className="text-xs text-muted-foreground">{t.managerPanel.dialogs.editUser.usernameHint}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">{t.managerPanel.dialogs.editUser.passwordLabel}</Label>
              <Input
                id="user-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t.managerPanel.dialogs.editUser.passwordPlaceholder}
              />
              {newPassword && newPassword.length > 0 && newPassword.length < 6 && (
                <p className="text-xs text-destructive">{t.managerPanel.validation.passwordTooShort}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false)
              setEditingUser(null)
              setNewName('')
              setNewEmail('')
              setNewPhone('')
              setNewUsername('')
              setNewPassword('')
            }}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSaveUserName}>
              {t.managerPanel.dialogs.editUser.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.managerPanel.dialogs.createUser.title}</DialogTitle>
            <DialogDescription>
              {t.managerPanel.dialogs.createUser.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-name">{t.managerPanel.dialogs.createUser.fullNameLabel}</Label>
              <Input
                id="new-user-name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder={t.managerPanel.dialogs.createUser.fullNamePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-email">{t.managerPanel.dialogs.createUser.emailLabel}</Label>
              <Input
                id="new-user-email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder={t.managerPanel.dialogs.createUser.emailPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-password">{t.managerPanel.dialogs.createUser.passwordLabel}</Label>
              <Input
                id="new-user-password"
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder={t.managerPanel.dialogs.createUser.passwordPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-phone">{t.managerPanel.dialogs.createUser.phoneLabel}</Label>
              <div className="flex gap-2">
                <Phone size={20} className="text-muted-foreground mt-2.5" />
                <Input
                  id="new-user-phone"
                  type="tel"
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  placeholder={t.managerPanel.dialogs.createUser.phonePlaceholder}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateDialogOpen(false)
              setNewUserName('')
              setNewUserEmail('')
              setNewUserPassword('')
              setNewUserPhone('')
            }}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleCreateUser} className="gap-2">
              <Plus size={18} weight="bold" />
              {t.managerPanel.dialogs.createUser.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Eye size={24} weight="duotone" className="text-accent" />
              {t.managerPanel.dialogs.preview.title}
            </DialogTitle>
            <DialogDescription>
              {t.managerPanel.dialogs.preview.description}
            </DialogDescription>
          </DialogHeader>
          
          {previewVacation && (() => {
            const months = t.managerPanel.birthdays.months
            
            const getDaysInMonth = (month: number, year: number) => {
              return new Date(year, month + 1, 0).getDate()
            }

            const getFirstDayOfMonth = (month: number, year: number) => {
              const day = new Date(year, month, 1).getDay()
              return day === 0 ? 6 : day - 1
            }

            const getWeekNumber = (date: Date) => {
              return getISOWeekNumber(date)
            }

            const isDateInVacation = (day: number, vacation: VacationEntry, month: number, year: number) => {
              const checkDate = new Date(year, month, day)
              const start = parseLocalDate(vacation.startDate)
              const end = parseLocalDate(vacation.endDate)
              
              start.setHours(0, 0, 0, 0)
              end.setHours(23, 59, 59, 999)
              checkDate.setHours(12, 0, 0, 0)

              return checkDate >= start && checkDate <= end
            }

            const getFirstName = (email: string) => {
              const user = users.find(u => u.email === email)
              if (user?.fullName) {
                return user.fullName.split(' ')[0]
              }
              return email.split('@')[0].split('.')[0]
            }

            const daysInMonth = getDaysInMonth(previewMonth, previewYear)
            const firstDay = getFirstDayOfMonth(previewMonth, previewYear)

            const approvedVacations = allVacations.filter((v) => {
              const start = parseLocalDate(v.startDate)
              const end = parseLocalDate(v.endDate)
              
              if (isNaN(start.getTime()) || isNaN(end.getTime())) return false
              
              const monthStart = new Date(previewYear, previewMonth, 1)
              const monthEnd = new Date(previewYear, previewMonth + 1, 0)

              return (start <= monthEnd && end >= monthStart) && v.status === 'approved'
            })

            const previewVacations = [...approvedVacations, previewVacation]

            return (
              <div className="py-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (previewMonth === 0) {
                          setPreviewMonth(11)
                          setPreviewYear(previewYear - 1)
                        } else {
                          setPreviewMonth(previewMonth - 1)
                        }
                      }}
                    >
                      ←
                    </Button>
                    <h3 className="text-lg font-bold">
                      {months[previewMonth]} {previewYear}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (previewMonth === 11) {
                          setPreviewMonth(0)
                          setPreviewYear(previewYear + 1)
                        } else {
                          setPreviewMonth(previewMonth + 1)
                        }
                      }}
                    >
                      →
                    </Button>
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                    <Eye size={14} className="mr-1" />
                    {t.managerPanel.dialogs.preview.previewMode}
                  </Badge>
                </div>

                <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ 
                        backgroundColor: getEmployeeColorByEmail(previewVacation.userEmail).bg
                      }}
                    />
                    <span className="font-semibold">{t.managerPanel.dialogs.preview.newRequestPrefix}</span>
                    <span>{getFirstName(previewVacation.userEmail)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(previewVacation.startDate), 'd. MMMM yyyy', { locale: dateLocale })} → {format(new Date(previewVacation.endDate), 'd. MMMM yyyy', { locale: dateLocale })}
                  </div>
                  {previewVacation.notes && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {t.managerPanel.dialogs.preview.noteLabel}: {previewVacation.notes}
                    </div>
                  )}
                </div>

                <div className="border rounded-md p-4">
                  <div className="grid grid-cols-8 gap-2">
                    <div className="text-center font-semibold text-xs py-2 text-muted-foreground">
                      {t.managerPanel.dialogs.preview.weekLabel}
                    </div>
                    {t.managerPanel.weekdaysShort.map((day, index) => (
                      <div
                        key={day}
                        className={cn(
                          "text-center font-semibold text-xs py-2",
                          index >= 5 ? "text-muted-foreground/60" : "text-muted-foreground"
                        )}
                      >
                        {day}
                      </div>
                    ))}

                    {Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) }).map((_, weekIndex) => {
                      const firstDateOfWeek = new Date(previewYear, previewMonth, weekIndex * 7 - firstDay + 1)
                      const weekNumber = getWeekNumber(firstDateOfWeek)
                      
                      return (
                        <React.Fragment key={`week-${weekIndex}`}>
                          <div className="flex items-center justify-center text-xs font-bold text-muted-foreground border rounded bg-muted/30">
                            {weekNumber}
                          </div>
                          {Array.from({ length: 7 }).map((_, dayIndex) => {
                            const cellIndex = weekIndex * 7 + dayIndex
                            const day = cellIndex - firstDay + 1
                            
                            if (cellIndex < firstDay || day > daysInMonth) {
                              return <div key={`empty-${cellIndex}`} className="aspect-square" />
                            }

                            const dayVacations = previewVacations.filter((vacation) =>
                              isDateInVacation(day, vacation, previewMonth, previewYear)
                            )
                            const currentDate = new Date(previewYear, previewMonth, day)
                            const dayOfWeek = currentDate.getDay()
                            const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6
                            const isToday =
                              day === new Date().getDate() &&
                              previewMonth === new Date().getMonth() &&
                              previewYear === new Date().getFullYear()

                            return (
                              <div
                                key={day}
                                className={cn(
                                  "aspect-square border rounded p-1 relative text-xs",
                                  isToday && "ring-2 ring-primary",
                                  isWeekendDay && "bg-muted/50 opacity-60"
                                )}
                              >
                                <div className={cn(
                                  "font-semibold mb-1 text-[10px]",
                                  isWeekendDay && "text-muted-foreground"
                                )}>
                                  {day}
                                </div>
                                {isWeekendDay ? (
                                  <div className="text-[8px] text-muted-foreground text-center mt-1">
                                    {t.managerPanel.dialogs.preview.closedLabel}
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    {dayVacations.slice(0, 3).map((vacation) => (
                                      <div
                                        key={vacation.id}
                                        className={cn(
                                          "text-[9px] leading-[1.6] px-1 py-0.5 rounded truncate font-medium",
                                          vacation.id === previewVacation.id && "ring-1 ring-amber-500"
                                        )}
                                        style={{ 
                                          backgroundColor: getEmployeeColorByEmail(vacation.userEmail).bg,
                                          color: getEmployeeColorByEmail(vacation.userEmail).text
                                        }}
                                        title={`${getFirstName(vacation.userEmail)}${vacation.notes ? ': ' + vacation.notes : ''}`}
                                      >
                                        {getFirstName(vacation.userEmail)}
                                      </div>
                                    ))}
                                    {dayVacations.length > 3 && (
                                      <div className="text-[8px] text-muted-foreground">
                                        +{dayVacations.length - 3}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsPreviewDialogOpen(false)}
            >
              {t.managerPanel.dialogs.preview.closePreview}
            </Button>
            {previewVacation && (
              <>
                <Button
                  onClick={() => {
                    setIsPreviewDialogOpen(false)
                    handleApproveVacation(previewVacation)
                  }}
                  className="gap-2"
                >
                  <Check size={18} weight="bold" />
                  {t.managerPanel.dialogs.preview.approveVacation}
                </Button>
                <Button
                  onClick={() => {
                    setIsPreviewDialogOpen(false)
                    handleRejectVacation(previewVacation)
                  }}
                  variant="destructive"
                  className="gap-2"
                >
                  <X size={18} weight="bold" />
                  {t.managerPanel.dialogs.preview.rejectVacation}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManualVacationGrant 
        open={isManualGrantDialogOpen}
        onOpenChange={setIsManualGrantDialogOpen}
        managerEmail={userEmail}
        onSuccess={loadVacationEntries}
      />

      <OnboardingWizard
        open={isOnboardingOpen}
        onOpenChange={setIsOnboardingOpen}
        onCompleted={() => {
          loadUsers()
          loadBirthdays()
        }}
      />

      <OffboardingWizard
        open={isOffboardingOpen}
        onOpenChange={setIsOffboardingOpen}
        currentUserEmail={userEmail}
        onCompleted={() => {
          loadUsers()
          loadBirthdays()
          loadVacationEntries()
        }}
      />

      <Dialog open={isEditBirthdayDialogOpen} onOpenChange={setIsEditBirthdayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.managerPanel.dialogs.editBirthday.title}</DialogTitle>
            <DialogDescription>
              {t.managerPanel.dialogs.editBirthday.descriptionPrefix} {editingBirthday?.fullName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="birthday-date">{t.managerPanel.dialogs.editBirthday.dateLabel}</Label>
              <DatePickerField
                id="birthday-date"
                value={birthdayDate && birthYear ? `${birthYear}-${birthdayDate}` : birthdayDate ? `2000-${birthdayDate}` : ''}
                enableYearDropdown
                onChange={(value) => {
                  if (value) {
                    const [year, month, day] = value.split('-')
                    setBirthdayDate(`${month}-${day}`)
                    setBirthYear(year)
                  } else {
                    setBirthdayDate('')
                    setBirthYear('')
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t.managerPanel.dialogs.editBirthday.dateHint}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditBirthdayDialogOpen(false)
              setEditingBirthday(null)
              setBirthdayDate('')
              setBirthYear('')
            }}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSaveBirthday} className="gap-2">
              <Check size={18} weight="bold" />
              {t.managerPanel.dialogs.editBirthday.saveButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
