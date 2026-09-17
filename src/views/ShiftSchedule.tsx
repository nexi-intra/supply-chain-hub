import { useState, useEffect, useRef, type ReactElement } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Plus, Trash, UserCircle, Tag, Calendar as CalendarIcon, PencilSimple, ChatText, Phone, FirstAidKit, Airplane, Gift, ArrowsClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DatePickerField } from '@/components/DatePickerField'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useKV } from '@/hooks/useKV'
import { UserProfile } from '@/components/UserProfile'
import { toast } from 'sonner'
import { AutoText } from '@/components/AutoText'
import { useAutoTranslate } from '@/lib/useAutoTranslate'
import { cn } from '@/lib/utils'
import { isAnyModalOpen } from '@/lib/modalStack'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { excludeCreator } from '@/lib/userRoles'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { da, enUS } from 'date-fns/locale'
import { getWeekNumber, getWeekDates, getWeeksInYear, isDanishHoliday, matchesShiftInterval, toIsoDateString, parseLocalDate } from '@/lib/dateUtils'
import { Textarea } from '@/components/ui/textarea'
import type { TeamEmployee } from '@/views/TeamOverview'
import { getEmployeeColorByEmail, EMPLOYEE_COLOR_OVERRIDES_KEY, type EmployeeColorOverrides } from '@/lib/employeeColors'
import { useLanguage } from '@/contexts/LanguageContext'
import type { ShiftRole, ShiftAssignment, ShiftPatternRule, SickLeaveEntry, VacationEntry, BirthdayEntry } from '@/lib/types'

interface ShiftScheduleProps {
  onNavigateBack: () => void
  onLogout: () => void
  userEmail: string
}

export function ShiftSchedule({ onNavigateBack, onLogout, userEmail: propUserEmail }: ShiftScheduleProps) {
  const [roles, setRoles] = useKV<ShiftRole[]>('shift-roles', [])
  const [assignments, setAssignments] = useKV<ShiftAssignment[]>('shift-assignments', [])
  const [shiftPatterns, setShiftPatterns] = useKV<ShiftPatternRule[]>('shift-patterns', [])
  const [colorOverrides] = useKV<EmployeeColorOverrides>(EMPLOYEE_COLOR_OVERRIDES_KEY, {})
  const [employees, setEmployees] = useState<TeamEmployee[]>([])
  const [sickLeaveEntries, setSickLeaveEntries] = useKV<SickLeaveEntry[]>('sick-leave-entries', [])
  const [vacationEntries, setVacationEntries] = useKV<VacationEntry[]>('vacation-entries', [])
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const userEmail = propUserEmail
  
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false)
  const [showWeekAssignmentDialog, setShowWeekAssignmentDialog] = useState(false)
  const [showWeekClearDialog, setShowWeekClearDialog] = useState(false)
  const [showCommentDialog, setShowCommentDialog] = useState(false)
  const [showDuplicateTaskDialog, setShowDuplicateTaskDialog] = useState(false)
  const [showPatternDialog, setShowPatternDialog] = useState(false)
  const [patternEmployee, setPatternEmployee] = useState('')
  const [patternRole, setPatternRole] = useState('')
  const [patternWeekdays, setPatternWeekdays] = useState<number[]>([])
  const [patternInterval, setPatternInterval] = useState<1 | 2 | 3 | 4>(2)
  const [patternStartDate, setPatternStartDate] = useState(() => toIsoDateString(new Date()))
  const [patternEndDate, setPatternEndDate] = useState('')
  const [patternComment, setPatternComment] = useState('')
  const [duplicateTaskInfo, setDuplicateTaskInfo] = useState<{ employeeName: string; roleName: string } | null>(null)
  const [editingRole, setEditingRole] = useState<ShiftRole | null>(null)
  const [editingComment, setEditingComment] = useState<{ employeeId: string; date: string } | null>(null)
  const [commentText, setCommentText] = useState('')
  
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleColor, setNewRoleColor] = useState('#8b5cf6')

  const rolePlaceholder = useAutoTranslate('F.eks. Supervisor, Tekniker, Support')
  const selectEmployeePlaceholder = useAutoTranslate('Vælg medarbejder')
  const selectRolePlaceholder = useAutoTranslate('Vælg rolle')
  const selectTaskPlaceholder = useAutoTranslate('Vælg opgave')
  const selectWeekPlaceholder = useAutoTranslate('Vælg uge')
  const commentPlaceholder = useAutoTranslate('F.eks. Går kl. 14:00 til tandlæge')

  const colorPresets = [
    { name: 'Lilla', value: '#a855f7' },
    { name: 'Blå', value: '#3b82f6' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Grøn', value: '#10b981' },
    { name: 'Gul', value: '#eab308' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Rød', value: '#ef4444' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Lime', value: '#84cc16' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Emerald', value: '#059669' },
    { name: 'Sky', value: '#0ea5e9' },
    { name: 'Violet', value: '#8b5cf6' },
    { name: 'Amber', value: '#f59e0b' },
  ]
  
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  
  const [weekEmployee, setWeekEmployee] = useState('')
  const [weekRole, setWeekRole] = useState('')
  const [weekNumber, setWeekNumber] = useState<number | null>(null)
  
  const [clearWeekNumber, setClearWeekNumber] = useState<number | null>(null)
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  
  const [activeTab, setActiveTab] = useState('schedule')
  const dateScrollRef = useRef<HTMLDivElement>(null)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const scheduleScrollRef = useRef<HTMLDivElement>(null)
  const hasScrolledToToday = useRef(false)
  const [scrollToToday, setScrollToToday] = useState(false)

  const syncScroll = (source: 'date' | 'content') => {
    if (source === 'date' && dateScrollRef.current && contentScrollRef.current) {
      contentScrollRef.current.scrollTop = dateScrollRef.current.scrollTop
    } else if (source === 'content' && dateScrollRef.current && contentScrollRef.current) {
      dateScrollRef.current.scrollTop = contentScrollRef.current.scrollTop
    }
  }

  const months = [
    'Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'December'
  ]

  useEffect(() => {
    const loadUserAndCheckAdmin = async () => {
      const usersData = await window.kv.get<Record<string, { email: string; fullName: string; role?: string }>>('users')
      if (usersData && usersData[userEmail]?.role === 'creator') {
        setIsAdmin(true)
      }

      const birthdaysData = await window.kv.get<BirthdayEntry[]>('employee-birthdays') || []
      setBirthdays(birthdaysData)
    }
    if (userEmail) {
      loadUserAndCheckAdmin()
    }
  }, [userEmail])

  useEffect(() => {
    loadEmployees()
  }, [])

  const loadEmployees = async () => {
    const usersData = await window.kv.get<Record<string, { email: string; fullName: string; role?: string; phone?: string }>>('users')
    const userSettings = (await window.kv.get<Record<string, { phoneNumber?: string }>>('user-settings')) || {}
    
    if (usersData && typeof usersData === 'object' && !Array.isArray(usersData)) {
      const userList: TeamEmployee[] = (await excludeCreator(Object.values(usersData))).map(user => {
        const settingsPhone = userSettings[user.email]?.phoneNumber
        const phone = user.phone || settingsPhone || ''
        
        return {
          id: user.email,
          name: user.fullName,
          email: user.email,
          phone,
          role: user.role as any
        }
      })
      setEmployees(userList)
    } else if (Array.isArray(usersData)) {
      setEmployees(usersData as TeamEmployee[])
    } else {
      setEmployees([])
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAnyModalOpen()) return
        onNavigateBack()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (selectedMonth === 0) {
          setSelectedMonth(11)
          setSelectedYear(selectedYear - 1)
        } else {
          setSelectedMonth(selectedMonth - 1)
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (selectedMonth === 11) {
          setSelectedMonth(0)
          setSelectedYear(selectedYear + 1)
        } else {
          setSelectedMonth(selectedMonth + 1)
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onNavigateBack, selectedMonth, selectedYear])

  useEffect(() => {
    if (activeTab === 'schedule' && scheduleScrollRef.current && (!hasScrolledToToday.current || scrollToToday)) {
      const scrollToCurrentWeek = () => {
        const today = new Date()
        const currentMonth = today.getMonth()
        const currentYear = today.getFullYear()

        if (selectedMonth !== currentMonth || selectedYear !== currentYear) {
          hasScrolledToToday.current = true
          setScrollToToday(false)
          return
        }

        const container = scheduleScrollRef.current
        const row = container?.querySelector<HTMLElement>('[data-current-week]')
        if (container && row) {
          const headerHeight = container.querySelector('thead')?.offsetHeight ?? 0
          const containerRect = container.getBoundingClientRect()
          const rowRect = row.getBoundingClientRect()
          const top = Math.max(0, rowRect.top - containerRect.top + container.scrollTop - headerHeight - 8)
          container.scrollTo({ top, behavior: 'smooth' })
        }

        hasScrolledToToday.current = true
        setScrollToToday(false)
      }

      setTimeout(scrollToCurrentWeek, 300)
    }
  }, [activeTab, selectedMonth, selectedYear, scrollToToday])

  const isWeekend = (date: Date) => {
    const day = date.getDay()
    return day === 0 || day === 6
  }

  const isDateLocked = (dateString: string) => {
    const date = new Date(dateString)
    return isWeekend(date) || isDanishHoliday(dateString)
  }

  const handleAddRole = () => {
    if (!newRoleName.trim()) {
      toast.error('Indtast et rolle navn')
      return
    }

    const newRole: ShiftRole = {
      id: Date.now().toString(),
      name: newRoleName.trim(),
      color: newRoleColor
    }

    setRoles((current) => [...(current || []), newRole])
    setNewRoleName('')
    setNewRoleColor('#8b5cf6')
    setShowRoleDialog(false)
    toast.success('Rolle tilføjet')
  }

  const handleUpdateRole = () => {
    if (!editingRole) return
    if (!newRoleName.trim()) {
      toast.error('Indtast et rolle navn')
      return
    }

    setRoles((current) => 
      (current || []).map(r => 
        r.id === editingRole.id 
          ? { ...r, name: newRoleName.trim(), color: newRoleColor }
          : r
      )
    )
    setNewRoleName('')
    setNewRoleColor('#8b5cf6')
    setEditingRole(null)
    setShowRoleDialog(false)
    toast.success('Rolle opdateret')
  }

  const handleDeleteRole = (roleId: string) => {
    setRoles((current) => (current || []).filter(r => r.id !== roleId))
    setAssignments((current) => (current || []).filter(a => a.roleId !== roleId))
    toast.success('Rolle slettet')
  }

  const handleAddAssignment = () => {
    if (!selectedEmployee || !selectedRole || !selectedDate) {
      toast.error('Udfyld alle felter')
      return
    }

    if (isDateLocked(selectedDate)) {
      toast.error('Kan ikke tildele vagter på weekender eller helligdage')
      return
    }

    const employee = (employees || []).find(e => e.id === selectedEmployee)
    if (!employee) return

    const existingTask = (assignments || []).find(
      a => a.employeeId === selectedEmployee && a.roleId === selectedRole && a.date === selectedDate
    )
    
    if (existingTask) {
      const role = (roles || []).find(r => r.id === selectedRole)
      setDuplicateTaskInfo({ 
        employeeName: employee.name, 
        roleName: role?.name || 'denne opgave'
      })
      setShowDuplicateTaskDialog(true)
      return
    }

    const newAssignment: ShiftAssignment = {
      id: Date.now().toString(),
      employeeId: selectedEmployee,
      employeeName: employee.name,
      roleId: selectedRole,
      date: selectedDate
    }

    setAssignments((current) => [...(current || []), newAssignment])
    setSelectedEmployee('')
    setSelectedRole('')
    setSelectedDate('')
    setShowAssignmentDialog(false)
    toast.success('Vagt tildelt')
  }

  const handleDeleteAssignment = (assignmentId: string) => {
    setAssignments((current) => (current || []).filter(a => a.id !== assignmentId))
    toast.success('Vagt fjernet')
  }

  const openEditRoleDialog = (role: ShiftRole) => {
    setEditingRole(role)
    setNewRoleName(role.name)
    setNewRoleColor(role.color)
    setShowRoleDialog(true)
  }

  const openAddRoleDialog = () => {
    setEditingRole(null)
    setNewRoleName('')
    setNewRoleColor('#8b5cf6')
    setShowRoleDialog(true)
  }

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay()
  }

  const isCurrentWeek = (date: Date) => {
    const today = new Date()
    return getWeekNumber(date) === getWeekNumber(today) && date.getFullYear() === today.getFullYear()
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear()
  }

  const getAssignmentsForEmployeeAndDate = (employeeId: string, dateString: string): (ShiftAssignment & { isPattern?: boolean })[] => {
    const real = (assignments || []).filter(a => a.employeeId === employeeId && a.date === dateString)
    // Gentagelses-mønstre udfoldes her, kun for de datoer der rent faktisk
    // vises — der skrives ALDRIG konkrete rækker for hver fremtidig uge.
    const employee = (employees || []).find(e => e.id === employeeId)
    const date = parseLocalDate(dateString)
    const weekday = date.getDay()
    const patternDerived: (ShiftAssignment & { isPattern?: boolean })[] = employee && !isDateLockedForEmployee(employee.email, dateString)
      ? (shiftPatterns || [])
        .filter(p => p.employeeId === employeeId
          && p.weekdays.includes(weekday)
          && dateString >= p.anchorDate
          && (!p.endDate || dateString <= p.endDate)
          && matchesShiftInterval(dateString, p.anchorDate, p.intervalWeeks)
          // En rigtig tildeling for samme rolle+dato vinder altid over mønsteret.
          && !real.some(a => a.roleId === p.roleId))
        .map(p => ({
          id: `pattern-${p.id}-${dateString}`,
          employeeId: p.employeeId,
          employeeName: p.employeeName,
          roleId: p.roleId,
          date: dateString,
          comment: p.comment,
          isPattern: true,
        }))
      : []
    return [...real, ...patternDerived]
  }

  const handleAddTaskToCell = (employeeId: string, dateString: string, roleId: string) => {
    const employee = (employees || []).find(e => e.id === employeeId)
    if (!employee) return

    if (isDateLockedForEmployee(employee.email, dateString)) {
      const vacation = getEmployeeVacationForDate(employee.email, dateString)
      const sickLeave = getEmployeeSickLeaveForDate(employee.email, dateString)
      if (vacation) {
        toast.error('Kan ikke tildele vagter når medarbejderen er på ferie')
      } else if (sickLeave) {
        toast.error('Kan ikke tildele vagter når medarbejderen er sygemeldt')
      } else {
        toast.error('Kan ikke tildele vagter på weekender eller helligdage')
      }
      return
    }

    const existingTask = (assignments || []).find(
      a => a.employeeId === employeeId && a.roleId === roleId && a.date === dateString
    )
    
    if (existingTask) {
      const role = (roles || []).find(r => r.id === roleId)
      setDuplicateTaskInfo({ 
        employeeName: employee.name, 
        roleName: role?.name || 'denne opgave'
      })
      setShowDuplicateTaskDialog(true)
      return
    }

    const newAssignment: ShiftAssignment = {
      id: Date.now().toString(),
      employeeId: employeeId,
      employeeName: employee.name,
      roleId: roleId,
      date: dateString
    }

    setAssignments((current) => [...(current || []), newAssignment])
    toast.success('Opgave tilføjet')
  }

  const handleAssignWeek = () => {
    if (!weekEmployee || !weekRole || weekNumber === null) {
      toast.error('Udfyld alle felter')
      return
    }

    const employee = (employees || []).find(e => e.id === weekEmployee)
    if (!employee) return

    const weekDates = getWeekDates(weekNumber, selectedYear)
    const newAssignments: ShiftAssignment[] = []
    let skippedCount = 0
    let addedCount = 0

    weekDates.forEach(dateString => {
      if (isDateLockedForEmployee(employee.email, dateString)) {
        skippedCount++
        return
      }

      newAssignments.push({
        id: `${Date.now()}-${dateString}`,
        employeeId: weekEmployee,
        employeeName: employee.name,
        roleId: weekRole,
        date: dateString
      })
      addedCount++
    })

    if (newAssignments.length > 0) {
      setAssignments((current) => [...(current || []), ...newAssignments])
    }

    setWeekEmployee('')
    setWeekRole('')
    setWeekNumber(null)
    setShowWeekAssignmentDialog(false)

    if (addedCount > 0) {
      toast.success(`${addedCount} vagt${addedCount > 1 ? 'er' : ''} tildelt${skippedCount > 0 ? ` (${skippedCount} sprunget over)` : ''}`)
    } else {
      toast.error('Ingen vagter kunne tildeles')
    }
  }

  const handleClearWeek = () => {
    if (clearWeekNumber === null) {
      toast.error('Vælg en uge')
      return
    }

    const weekDates = getWeekDates(clearWeekNumber, selectedYear)
    
    setAssignments((current) => {
      const filteredAssignments = (current || []).filter(assignment => {
        return !weekDates.includes(assignment.date)
      })
      return filteredAssignments
    })

    const removedCount = (assignments || []).filter(assignment => weekDates.includes(assignment.date)).length

    setClearWeekNumber(null)
    setShowWeekClearDialog(false)

    if (removedCount > 0) {
      toast.success(`${removedCount} opgave${removedCount > 1 ? 'r' : ''} fjernet fra uge ${clearWeekNumber}`)
    } else {
      toast.info('Ingen opgaver fundet i den valgte uge')
    }
  }

  const resetPatternForm = () => {
    setPatternEmployee('')
    setPatternRole('')
    setPatternWeekdays([])
    setPatternInterval(2)
    setPatternStartDate(toIsoDateString(new Date()))
    setPatternEndDate('')
    setPatternComment('')
  }

  const togglePatternWeekday = (weekday: number) => {
    setPatternWeekdays((current) => (
      current.includes(weekday) ? current.filter((d) => d !== weekday) : [...current, weekday].sort()
    ))
  }

  const handleCreatePattern = () => {
    if (!patternEmployee || !patternRole || patternWeekdays.length === 0) {
      toast.error('Vælg medarbejder, rolle og mindst én ugedag')
      return
    }
    const employee = (employees || []).find(e => e.id === patternEmployee)
    if (!employee) return
    if (patternEndDate && patternEndDate < patternStartDate) {
      toast.error('Slutdato kan ikke ligge før startdato')
      return
    }

    const newPattern: ShiftPatternRule = {
      id: `sp-${Date.now()}`,
      employeeId: patternEmployee,
      employeeName: employee.name,
      roleId: patternRole,
      weekdays: patternWeekdays,
      intervalWeeks: patternInterval,
      anchorDate: patternStartDate,
      endDate: patternEndDate || undefined,
      comment: patternComment.trim() || undefined,
    }

    setShiftPatterns((current) => [...(current || []), newPattern])
    resetPatternForm()
    toast.success('Gentaget vagt oprettet')
  }

  const handleDeletePattern = (patternId: string) => {
    setShiftPatterns((current) => (current || []).filter(p => p.id !== patternId))
    toast.success('Gentaget vagt slettet')
  }

  const openCommentDialog = (employeeId: string, dateString: string) => {
    const cellAssignments = getAssignmentsForEmployeeAndDate(employeeId, dateString)
    const existingComment = cellAssignments.find(a => a.comment)?.comment || ''
    
    setEditingComment({ employeeId, date: dateString })
    setCommentText(existingComment)
    setShowCommentDialog(true)
  }

  const handleSaveComment = () => {
    if (!editingComment) return

    const { employeeId, date } = editingComment
    const cellAssignments = getAssignmentsForEmployeeAndDate(employeeId, date)

    if (commentText.trim()) {
      if (cellAssignments.length > 0) {
        setAssignments((current) => 
          (current || []).map(a => 
            a.employeeId === employeeId && a.date === date
              ? { ...a, comment: commentText.trim() }
              : a
          )
        )
        toast.success('Kommentar gemt')
      } else {
        const employee = (employees || []).find(e => e.id === employeeId)
        if (employee) {
          const newAssignment: ShiftAssignment = {
            id: Date.now().toString(),
            employeeId: employeeId,
            employeeName: employee.name,
            roleId: '',
            date: date,
            comment: commentText.trim()
          }
          setAssignments((current) => [...(current || []), newAssignment])
          toast.success('Kommentar tilføjet')
        }
      }
    } else {
      setAssignments((current) => 
        (current || []).map(a => 
          a.employeeId === employeeId && a.date === date
            ? { ...a, comment: undefined }
            : a
        )
      )
      toast.success('Kommentar fjernet')
    }

    setShowCommentDialog(false)
    setEditingComment(null)
    setCommentText('')
  }

  const getCellComment = (employeeId: string, dateString: string) => {
    const cellAssignments = getAssignmentsForEmployeeAndDate(employeeId, dateString)
    const commentAssignment = cellAssignments.find(a => a.comment)
    return commentAssignment?.comment || ''
  }

  const handleDeleteComment = (employeeId: string, dateString: string) => {
    setAssignments((current) => 
      (current || []).map(a => 
        a.employeeId === employeeId && a.date === dateString && a.comment
          ? { ...a, comment: undefined }
          : a
      ).filter(a => !(a.employeeId === employeeId && a.date === dateString && !a.roleId && !a.comment))
    )
    toast.success('Kommentar slettet')
  }

  const getEmployeeSickLeaveForDate = (employeeEmail: string, dateString: string) => {
    if (!sickLeaveEntries || sickLeaveEntries.length === 0) return null
    
    const targetDate = new Date(dateString)
    if (isNaN(targetDate.getTime())) return null
    targetDate.setHours(0, 0, 0, 0)
    
    return (sickLeaveEntries || []).find(entry => {
      if (entry.userEmail !== employeeEmail) return false
      if (entry.status !== 'approved') return false
      
      try {
        const sickDate = new Date(entry.startDate)
        if (isNaN(sickDate.getTime())) return false
        sickDate.setHours(0, 0, 0, 0)
        
        return sickDate.getTime() === targetDate.getTime()
      } catch {
        return false
      }
    })
  }

  const getEmployeeVacationForDate = (employeeEmail: string, dateString: string) => {
    if (!vacationEntries || vacationEntries.length === 0) return null
    
    const targetDate = new Date(dateString)
    if (isNaN(targetDate.getTime())) return null
    targetDate.setHours(0, 0, 0, 0)
    
    return (vacationEntries || []).find(entry => {
      if (entry.userEmail !== employeeEmail) return false
      if (entry.status !== 'approved') return false
      
      try {
        const startDate = new Date(entry.startDate)
        const endDate = new Date(entry.endDate)
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false
        
        startDate.setHours(0, 0, 0, 0)
        endDate.setHours(0, 0, 0, 0)
        
        return targetDate.getTime() >= startDate.getTime() && targetDate.getTime() <= endDate.getTime()
      } catch {
        return false
      }
    })
  }

  const isDateLockedForEmployee = (employeeEmail: string, dateString: string) => {
    const date = new Date(dateString)
    const vacation = getEmployeeVacationForDate(employeeEmail, dateString)
    const sickLeave = getEmployeeSickLeaveForDate(employeeEmail, dateString)
    return isWeekend(date) || isDanishHoliday(dateString) || !!vacation || !!sickLeave
  }




  return (
    <div className="min-h-screen w-full relative overflow-hidden">
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
                className="pointer-events-auto bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
              >
                <ArrowLeft size={20} />
                <AutoText text="Tilbage" />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
      <div className="w-full px-4 sm:px-6 pt-40 pb-12 sm:pb-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1"><AutoText text="Vagtplan" /></h1>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="schedule" className="gap-2">
              <CalendarIcon size={18} />
              <AutoText text="Vagtplan" />
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-2">
              <UserCircle size={18} />
              <AutoText text="Medarbejdere" />
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <Tag size={18} />
              <AutoText text="Opgaver" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="space-y-4">

            <div className="w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <Select
                    value={selectedMonth.toString()}
                    onValueChange={(value) => setSelectedMonth(parseInt(value))}
                  >
                    <SelectTrigger className="w-[160px] font-semibold shadow-sm border-2 hover:border-primary/50 transition-all">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month, index) => (
                        <SelectItem 
                          key={index} 
                          value={index.toString()}
                          className="font-medium"
                        >
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(value) => setSelectedYear(parseInt(value))}
                  >
                    <SelectTrigger className="w-[130px] font-semibold shadow-sm border-2 hover:border-primary/50 transition-all">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2024" className="font-medium">2024</SelectItem>
                      <SelectItem value="2025" className="font-medium">2025</SelectItem>
                      <SelectItem value="2026" className="font-medium">2026</SelectItem>
                      <SelectItem value="2027" className="font-medium">2027</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => setShowWeekAssignmentDialog(true)}
                    variant="default"
                    className="gap-2 shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-primary to-primary/90"
                  >
                    <Plus size={18} weight="bold" />
                    <AutoText text="Tilføj Opgaver til Hel Uge" />
                  </Button>
                  <Button
                    onClick={() => setShowPatternDialog(true)}
                    variant="outline"
                    className="gap-2 shadow-md hover:shadow-lg transition-all border-2"
                  >
                    <ArrowsClockwise size={18} weight="bold" />
                    <AutoText text="Gentagne vagter" />
                  </Button>
                  <Button
                    onClick={() => setShowWeekClearDialog(true)}
                    variant="destructive"
                    className="gap-2 shadow-md hover:shadow-lg transition-all"
                  >
                    <Trash size={18} weight="bold" />
                    <AutoText text="Ryd Hel Uge" />
                  </Button>
                  <Button
                    onClick={() => {
                      const today = new Date()
                      setSelectedMonth(today.getMonth())
                      setSelectedYear(today.getFullYear())
                      hasScrolledToToday.current = false
                      setScrollToToday(true)
                    }}
                    variant="outline"
                    className="gap-2 shadow-md hover:shadow-lg transition-all border-2 hover:border-accent hover:bg-accent/10"
                  >
                    <CalendarIcon size={18} weight="bold" />
                    <AutoText text="Gå til i dag" />
                  </Button>
                </div>
              </div>

              <div className="shadow-inner rounded-lg border-2 border-border bg-card overflow-hidden">
                <div ref={scheduleScrollRef} className="overflow-auto relative" style={{ maxHeight: 'calc(100vh - 200px)', maxWidth: '100%' }}>
                  <table className="w-full border-collapse relative" style={{ tableLayout: 'fixed', width: 'max-content' }}>
                    <thead className="sticky top-0 z-50 bg-card shadow-lg" style={{ position: 'sticky', top: 0 }}>
                      <tr>
                        <th className="sticky left-0 z-[60] bg-card border-r-2 border-b-2 border-border px-3 py-4 text-left font-bold shadow-[2px_0_8px_rgba(0,0,0,0.15)]" style={{ position: 'sticky', left: 0, width: '160px', minWidth: '160px', maxWidth: '160px' }}>
                          <span className="text-sm font-bold">Dato</span>
                        </th>
                        {(employees || []).map((employee) => {
                          const firstName = employee.name.split(' ')[0]
                          const employeeColor = getEmployeeColorByEmail(employee.email, colorOverrides)
                          return (
                            <th
                              key={employee.id}
                              className="border-x-2 border-b-2 border-border px-2 py-4 text-center font-bold bg-card"
                              style={{ 
                                width: '120px', 
                                minWidth: '120px', 
                                maxWidth: '120px',
                                position: 'sticky',
                                top: 0,
                                backgroundColor: 'var(--card)'
                              }}
                            >
                              <div 
                                className="text-xs font-extrabold truncate" 
                                title={employee.name}
                                style={{ 
                                  color: employeeColor.bg
                                }}
                              >
                                {firstName}
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const daysInMonth = getDaysInMonth(selectedMonth, selectedYear)
                        const rows: ReactElement[] = []
                        for (let day = 1; day <= daysInMonth; day++) {
                          const date = new Date(selectedYear, selectedMonth, day)
                          const dateString = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                          const isLocked = isDateLocked(dateString)
                          const currentWeek = isCurrentWeek(date)
                          const todayDate = isToday(date)
                          
                          const dayNames = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør']
                          const dayName = dayNames[date.getDay()]
                          const weekNumber = getWeekNumber(date)

                          rows.push(
                            <tr 
                              key={day} 
                              data-current-week={currentWeek ? 'true' : undefined}
                              className={cn(
                                "border-b-2 border-border transition-all",
                                isLocked && "bg-muted/30",
                                currentWeek && "bg-primary/10",
                                todayDate && "bg-accent/20 ring-2 ring-accent/50"
                              )}
                            >
                              <td 
                                className={cn(
                                  "sticky left-0 z-40 bg-card border-r-2 border-border px-2 py-3 font-semibold transition-all shadow-[2px_0_8px_rgba(0,0,0,0.1)]",
                                  isWeekend(date) && "text-destructive",
                                  currentWeek && "bg-primary/10",
                                  todayDate && "bg-accent/20"
                                )}
                                style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }}
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge 
                                    variant={currentWeek ? "default" : "outline"} 
                                    className={cn(
                                      "text-[10px] px-1.5 py-0.5 font-bold",
                                      currentWeek && "bg-primary text-primary-foreground shadow-lg",
                                      todayDate && "ring-2 ring-accent"
                                    )}
                                  >
                                    U{weekNumber}
                                  </Badge>
                                  <span className={cn("text-xs", todayDate && "font-extrabold text-accent")}>{dayName}</span>
                                  <span className={cn("text-xs", todayDate && "font-extrabold text-accent")}>{day}/{selectedMonth + 1}</span>
                                  {isDanishHoliday(dateString) && (
                                    <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                      <AutoText text="Hel" />
                                    </Badge>
                                  )}
                                  {todayDate && (
                                    <Badge className="text-[9px] px-1 py-0 bg-accent text-accent-foreground">
                                      <AutoText text="I dag" />
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              {(employees || []).map((employee) => {
                                const cellAssignments = getAssignmentsForEmployeeAndDate(employee.id, dateString)
                                const cellComment = getCellComment(employee.id, dateString)
                                const sickLeave = getEmployeeSickLeaveForDate(employee.email, dateString)
                                const vacation = getEmployeeVacationForDate(employee.email, dateString)
                                const isEmployeeCellLocked = isDateLockedForEmployee(employee.email, dateString)
                                
                                const employeeColor = getEmployeeColorByEmail(employee.email, colorOverrides)

                                return (
                                  <td
                                    key={employee.id}
                                    className={cn(
                                      "border-x border-border p-2 text-center transition-all bg-card",
                                      isLocked && "bg-muted/10",
                                      sickLeave && "bg-card",
                                      vacation && "bg-card",
                                      currentWeek && !sickLeave && !vacation && "ring-1 ring-inset ring-border",
                                      todayDate && !sickLeave && !vacation && "ring-2 ring-inset ring-primary/30",
                                      todayDate && sickLeave && "bg-card ring-1 ring-border",
                                      todayDate && vacation && "bg-card ring-1 ring-border"
                                    )}
                                    style={{
                                      width: '120px',
                                      minWidth: '120px',
                                      maxWidth: '120px'
                                    }}
                                  >
                                    <div className="space-y-1.5 min-h-[60px]">
                                      {vacation && (
                                        <div className="relative group">
                                          <div
                                            className="px-1.5 py-1 rounded text-[10px] font-semibold bg-card text-foreground border border-border flex items-center gap-1 cursor-pointer justify-center"
                                            title={vacation.notes || 'På ferie'}
                                          >
                                            <Airplane size={12} weight="duotone" className="text-muted-foreground" />
                                            <span className="truncate">Ferie</span>
                                          </div>
                                        </div>
                                      )}
                                      {sickLeave && (
                                        <div className="relative group">
                                          <div
                                            className="px-1.5 py-1 rounded text-[10px] font-semibold bg-card text-foreground border border-border flex items-center gap-1 cursor-pointer justify-center"
                                            title={sickLeave.reason || 'Sygemeldt'}
                                          >
                                            <FirstAidKit size={12} weight="duotone" className="text-muted-foreground" />
                                            <span className="truncate">Syg</span>
                                          </div>
                                        </div>
                                      )}
                                      {cellComment && (
                                        <div className="relative group">
                                          <div
                                            className="px-1.5 py-1 rounded text-[10px] font-medium bg-muted/50 text-foreground border border-border flex items-center gap-1 cursor-pointer hover:bg-muted transition-all justify-center"
                                            onClick={() => openCommentDialog(employee.id, dateString)}
                                            title={cellComment}
                                          >
                                            <ChatText size={11} weight="duotone" className="text-muted-foreground" />
                                            <span className="truncate flex-1"><AutoText text={cellComment} /></span>
                                          </div>
                                          <Button
                                            size="sm"
                                            variant="destructive"
                                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleDeleteComment(employee.id, dateString)
                                            }}
                                          >
                                            <Trash size={10} />
                                          </Button>
                                        </div>
                                      )}
                                      {cellAssignments.length > 0 ? (
                                        <>
                                          {cellAssignments.map((assignment) => {
                                            const role = (roles || []).find(r => r.id === assignment.roleId)
                                            if (!role) return null
                                            
                                            return (
                                              <div key={assignment.id} className="group relative">
                                                <div
                                                  className={cn(
                                                    "px-1.5 py-1.5 rounded text-[11px] font-semibold truncate text-white border transition-all flex items-center justify-center gap-1",
                                                    assignment.isPattern && "border-dashed"
                                                  )}
                                                  style={{
                                                    backgroundColor: role.color || '#8b5cf6',
                                                    borderColor: `${role.color || '#8b5cf6'}CC`,
                                                    boxShadow: `0 2px 6px ${role.color || '#8b5cf6'}40`
                                                  }}
                                                  title={assignment.isPattern ? `${role.name} (gentaget mønster)` : role.name}
                                                >
                                                  {assignment.isPattern && <ArrowsClockwise size={10} weight="bold" className="shrink-0" />}
                                                  <span className="truncate">{role.name}</span>
                                                </div>
                                                <Button
                                                  size="sm"
                                                  variant="destructive"
                                                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (assignment.isPattern) {
                                                      toast.info('Dette er en gentaget vagt — rediger eller slet mønsteret under "Gentagne vagter"')
                                                      return
                                                    }
                                                    handleDeleteAssignment(assignment.id)
                                                  }}
                                                >
                                                  <Trash size={10} />
                                                </Button>
                                              </div>
                                            )
                                          })}
                                          {!isEmployeeCellLocked && (roles || []).length > 0 && (
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <button className="w-full h-full min-h-[24px] text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 rounded text-[10px] transition-colors flex items-center justify-center gap-1 border border-border/50 hover:border-border font-medium">
                                                  <Plus size={12} weight="regular" />
                                                  <span>Tilføj</span>
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-64 p-2" align="center">
                                                <div className="space-y-1">
                                                  <p className="text-sm font-semibold mb-2 px-2">Vælg Opgave</p>
                                                  {(roles || []).map(r => (
                                                    <button
                                                      key={r.id}
                                                      onClick={() => handleAddTaskToCell(employee.id, dateString, r.id)}
                                                      className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-all flex items-center gap-3"
                                                    >
                                                      <div
                                                        className="w-4 h-4 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: r.color }}
                                                      />
                                                      <span className="text-sm font-medium truncate">{r.name}</span>
                                                    </button>
                                                  ))}
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          )}
                                        </>
                                      ) : (
                                        !isEmployeeCellLocked && (roles || []).length > 0 ? (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="w-full h-full min-h-[28px] text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 rounded text-[11px] transition-colors flex items-center justify-center gap-1.5 border border-border/50 hover:border-border font-medium">
                                                <Plus size={13} weight="regular" />
                                                <span>Tilføj opgave</span>
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-64 p-2" align="center">
                                              <div className="space-y-1">
                                                <p className="text-sm font-semibold mb-2 px-2">Vælg Opgave</p>
                                                {(roles || []).map(r => (
                                                  <button
                                                    key={r.id}
                                                    onClick={() => handleAddTaskToCell(employee.id, dateString, r.id)}
                                                    className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-all flex items-center gap-3"
                                                  >
                                                    <div
                                                      className="w-4 h-4 rounded-full flex-shrink-0"
                                                      style={{ backgroundColor: r.color }}
                                                    />
                                                    <span className="text-sm font-medium truncate">{r.name}</span>
                                                  </button>
                                                ))}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        ) : (
                                          <div className="text-muted-foreground/40 text-xs">
                                            {!isLocked ? '−' : ''}
                                          </div>
                                        )
                                      )}
                                      {!isLocked && (
                                        <button
                                          onClick={() => openCommentDialog(employee.id, dateString)}
                                          className={cn(
                                            "w-full h-full min-h-[24px] rounded text-[10px] font-medium border transition-colors flex items-center justify-center gap-1",
                                            cellComment 
                                              ? "text-foreground/80 hover:text-foreground bg-muted/50 hover:bg-muted border-border" 
                                              : "text-muted-foreground/70 hover:text-foreground bg-card hover:bg-muted/30 border-border/50 hover:border-border"
                                          )}
                                          title={cellComment ? "Rediger kommentar" : "Tilføj kommentar"}
                                        >
                                          <ChatText size={11} weight={cellComment ? "duotone" : "regular"} />
                                          <span>Note</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        }
                        return rows
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="employees" className="space-y-6">
            <Card className="p-6 border-2">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <UserCircle size={28} className="text-primary" weight="duotone" />
                  <h2 className="text-2xl font-bold">Medarbejdere</h2>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-sm">
                    {(employees || []).length} {(employees || []).length === 1 ? 'Medarbejder' : 'Medarbejdere'}
                  </Badge>
                </div>
              </div>

              <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  Medarbejdere administreres via <strong>Team Oversigt</strong> menuen. Gå til Team Oversigt for at tilføje, redigere eller slette medarbejdere.
                </p>
              </div>

              {!(employees || []).length ? (
                <div className="text-center py-12">
                  <UserCircle size={48} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                  <p className="text-muted-foreground mb-4">Ingen medarbejdere endnu</p>
                  <p className="text-sm text-muted-foreground">Gå til Team Oversigt for at tilføje medarbejdere</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(employees || []).map((employee) => {
                    const employeeColor = getEmployeeColorByEmail(employee.email, colorOverrides)
                    return (
                      <motion.div
                        key={employee.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div 
                            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-md"
                            style={{
                              backgroundColor: employeeColor.bg,
                              color: employeeColor.text
                            }}
                          >
                            {employee.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-lg truncate mb-1">{employee.name}</div>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone size={16} className="flex-shrink-0" />
                            <a 
                              href={`tel:${employee.phone}`}
                              className="hover:text-primary transition-colors"
                            >
                              {employee.phone}
                            </a>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-6">
            <Card className="p-6 border-2">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Tag size={28} className="text-accent" weight="duotone" />
                  <h2 className="text-2xl font-bold"><AutoText text="Opgaver / Roller" /></h2>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-sm">
                    {(roles || []).length} <AutoText text={(roles || []).length === 1 ? 'Opgave' : 'Opgaver'} />
                  </Badge>
                  <Button
                    onClick={openAddRoleDialog}
                    size="sm"
                    className="gap-2 bg-gradient-to-r from-primary to-accent"
                  >
                    <Plus size={16} />
                    <AutoText text="Tilføj Opgave" />
                  </Button>
                </div>
              </div>

              <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  <AutoText text="Disse opgaver/roller kan tildeles medarbejdere i vagtplanen. Alle kan tilføje og slette opgaver." />
                </p>
              </div>

              {!roles || roles.length === 0 ? (
                <div className="text-center py-12">
                  <Tag size={48} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                  <p className="text-muted-foreground mb-4"><AutoText text="Ingen opgaver endnu" /></p>
                  <Button
                    onClick={openAddRoleDialog}
                    className="gap-2"
                  >
                    <Plus size={20} />
                    <AutoText text="Tilføj Din Første Opgave" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {roles.map((role) => (
                    <motion.div
                      key={role.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div
                          className="w-14 h-14 rounded-xl flex items-center justify-center shadow-md"
                          style={{ 
                            backgroundColor: `${role.color}30`,
                            border: `2px solid ${role.color}`
                          }}
                        >
                          <Tag size={28} style={{ color: role.color }} weight="duotone" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-lg mb-1"><AutoText text={role.name} /></div>
                        </div>
                        <div
                          className="px-5 py-2.5 rounded-lg font-semibold text-sm"
                          style={{ 
                            backgroundColor: `${role.color}20`,
                            color: role.color,
                            border: `2px solid ${role.color}`
                          }}
                        >
                          <AutoText text="Eksempel" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditRoleDialog(role)}
                          className="gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <PencilSimple size={16} />
                          <AutoText text="Rediger" />
                        </Button>
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
                              <AlertDialogTitle><AutoText text="Slet opgave?" /></AlertDialogTitle>
                              <AlertDialogDescription>
                                <AutoText text={`Er du sikker på at du vil slette ${role.name}? Alle vagter tildelt til denne opgave vil også blive fjernet. Denne handling kan ikke fortrydes.`} />
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel><AutoText text="Annuller" /></AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteRole(role.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                <AutoText text="Slet opgave" />
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
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={showRoleDialog} onOpenChange={(open) => {
        setShowRoleDialog(open)
        if (!open) {
          setEditingRole(null)
          setNewRoleName('')
          setNewRoleColor('#8b5cf6')
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><AutoText text={editingRole ? 'Rediger Rolle' : 'Tilføj Ny Rolle'} /></DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="role-name"><AutoText text="Rolle Navn" /></Label>
              <Input
                id="role-name"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder={rolePlaceholder}
              />
            </div>
            <div>
              <Label><AutoText text="Vælg Farve" /></Label>
              <div className="grid grid-cols-4 gap-3 mt-3">
                {colorPresets.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setNewRoleColor(color.value)}
                    className={cn(
                      "relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover:scale-105",
                      newRoleColor === color.value
                        ? "border-foreground shadow-lg scale-105"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    <div
                      className="w-10 h-10 rounded-full shadow-md"
                      style={{ backgroundColor: color.value }}
                    />
                    <span className="text-xs font-medium">{color.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={editingRole ? handleUpdateRole : handleAddRole} className="w-full">
              <AutoText text={editingRole ? 'Gem Ændringer' : 'Opret Rolle'} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showAssignmentDialog} onOpenChange={(open) => {
        setShowAssignmentDialog(open)
        if (!open) {
          setSelectedEmployee('')
          setSelectedRole('')
          setSelectedDate('')
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><AutoText text="Tildel Vagt" /></DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="employee"><AutoText text="Medarbejder" /></Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder={selectEmployeePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(employees || []).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="role"><AutoText text="Rolle" /></Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder={selectRolePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(roles || []).map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: role.color }}
                        />
                        {role.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date"><AutoText text="Dato" /></Label>
              <DatePickerField
                id="date"
                value={selectedDate}
                onChange={setSelectedDate}
              />
            </div>
            <Button onClick={handleAddAssignment} className="w-full">
              <AutoText text="Tildel Vagt" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showWeekAssignmentDialog} onOpenChange={(open) => {
        setShowWeekAssignmentDialog(open)
        if (!open) {
          setWeekEmployee('')
          setWeekRole('')
          setWeekNumber(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><AutoText text="Tildel Opgave for Hel Uge" /></DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="week-employee"><AutoText text="Medarbejder" /></Label>
              <Select value={weekEmployee} onValueChange={setWeekEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder={selectEmployeePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(employees || []).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="week-role"><AutoText text="Opgave" /></Label>
              <Select value={weekRole} onValueChange={setWeekRole}>
                <SelectTrigger>
                  <SelectValue placeholder={selectTaskPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(roles || []).map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: role.color }}
                        />
                        {role.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="week-number"><AutoText text="Uge Nummer" /></Label>
              <Select 
                value={weekNumber?.toString() || ''} 
                onValueChange={(value) => setWeekNumber(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectWeekPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const currentWeek = getWeekNumber(new Date())
                    const weeks: ReactElement[] = []
                    for (let i = currentWeek; i <= getWeeksInYear(selectedYear); i++) {
                      weeks.push(
                        <SelectItem key={i} value={i.toString()}>
                          Uge {i}
                        </SelectItem>
                      )
                    }
                    return weeks
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg border">
              <p className="text-xs text-muted-foreground">
                <AutoText text="Denne opgave vil blive tildelt til alle hverdage (mandag-fredag) i den valgte uge. Du kan tildele flere opgaver til samme dag. Weekender og helligdage springes automatisk over." />
              </p>
            </div>
            <Button onClick={handleAssignWeek} className="w-full">
              <AutoText text="Tildel Hel Uge" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showPatternDialog} onOpenChange={(open) => {
        setShowPatternDialog(open)
        if (!open) resetPatternForm()
      }}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle><AutoText text="Gentagne vagter" /></DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 -mr-2 pt-2">
            <div className="p-3 bg-muted/50 rounded-lg border">
              <p className="text-xs text-muted-foreground">
                <AutoText text="Tildel en opgave der gentages hver uge, hver anden, tredje eller fjerde uge — fx 'Bo har support hver tredje mandag'. Weekender, helligdage, ferie og sygdom springes automatisk over." />
              </p>
            </div>
            <div>
              <Label><AutoText text="Medarbejder" /></Label>
              <Select value={patternEmployee} onValueChange={setPatternEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder={selectEmployeePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(employees || []).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label><AutoText text="Opgave" /></Label>
              <Select value={patternRole} onValueChange={setPatternRole}>
                <SelectTrigger>
                  <SelectValue placeholder={selectTaskPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(roles || []).map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />
                        {role.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label><AutoText text="Ugedage" /></Label>
              <div className="flex gap-2 mt-1">
                {[{ day: 1, label: 'Man' }, { day: 2, label: 'Tir' }, { day: 3, label: 'Ons' }, { day: 4, label: 'Tor' }, { day: 5, label: 'Fre' }].map(({ day, label }) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => togglePatternWeekday(day)}
                    className={cn(
                      "flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all",
                      patternWeekdays.includes(day) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    <AutoText text={label} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label><AutoText text="Interval" /></Label>
              <Select value={patternInterval.toString()} onValueChange={(value) => setPatternInterval(parseInt(value) as 1 | 2 | 3 | 4)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1"><AutoText text="Hver uge" /></SelectItem>
                  <SelectItem value="2"><AutoText text="Hver anden uge" /></SelectItem>
                  <SelectItem value="3"><AutoText text="Hver tredje uge" /></SelectItem>
                  <SelectItem value="4"><AutoText text="Hver fjerde uge" /></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label><AutoText text="Startdato" /></Label>
                <DatePickerField value={patternStartDate} onChange={setPatternStartDate} />
              </div>
              <div>
                <Label><AutoText text="Slutdato (valgfri)" /></Label>
                <DatePickerField value={patternEndDate} onChange={setPatternEndDate} min={patternStartDate} />
              </div>
            </div>
            <div>
              <Label><AutoText text="Kommentar (valgfri)" /></Label>
              <Input value={patternComment} onChange={(e) => setPatternComment(e.target.value)} placeholder={commentPlaceholder} />
            </div>
            <Button onClick={handleCreatePattern} className="w-full">
              <AutoText text="Opret gentaget vagt" />
            </Button>

            {(shiftPatterns || []).length > 0 && (
              <div className="pt-2 border-t space-y-2">
                <Label><AutoText text="Eksisterende mønstre" /></Label>
                {(shiftPatterns || []).map((pattern) => {
                  const role = (roles || []).find(r => r.id === pattern.roleId)
                  const intervalLabel = pattern.intervalWeeks === 1 ? 'Hver uge' : pattern.intervalWeeks === 2 ? 'Hver anden uge' : pattern.intervalWeeks === 3 ? 'Hver tredje uge' : 'Hver fjerde uge'
                  const weekdayLabels = pattern.weekdays.map(d => ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'][d]).join(', ')
                  return (
                    <div key={pattern.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-card">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{pattern.employeeName} — {role?.name || '?'}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          <AutoText text={intervalLabel} /> · {weekdayLabels} · {pattern.anchorDate}{pattern.endDate ? ` → ${pattern.endDate}` : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={() => handleDeletePattern(pattern.id)}>
                        <Trash size={14} weight="duotone" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showWeekClearDialog} onOpenChange={(open) => {
        setShowWeekClearDialog(open)
        if (!open) {
          setClearWeekNumber(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash size={24} weight="duotone" className="text-destructive" />
              <AutoText text="Ryd Opgaver for Hel Uge" />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="clear-week-number"><AutoText text="Uge Nummer" /></Label>
              <Select 
                value={clearWeekNumber?.toString() || ''} 
                onValueChange={(value) => setClearWeekNumber(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectWeekPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const currentWeek = getWeekNumber(new Date())
                    const weeks: ReactElement[] = []
                    for (let i = 1; i <= getWeeksInYear(selectedYear); i++) {
                      weeks.push(
                        <SelectItem key={i} value={i.toString()}>
                          Uge {i}
                        </SelectItem>
                      )
                    }
                    return weeks
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-xs text-destructive font-medium">
                ⚠️ <AutoText text="Advarsel: Alle opgaver for alle medarbejdere i den valgte uge vil blive fjernet. Denne handling kan ikke fortrydes." />
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full gap-2" disabled={clearWeekNumber === null}>
                  <Trash size={18} />
                  <AutoText text="Ryd Hele Ugen" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive">⚠️ <AutoText text="Bekræft Sletning" /></AlertDialogTitle>
                  <AlertDialogDescription>
                    <AutoText text={`Er du helt sikker på at du vil rydde alle opgaver for uge ${clearWeekNumber}? Dette vil fjerne alle opgaver for alle medarbejdere i denne uge. Denne handling kan IKKE fortrydes!`} />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel><AutoText text="Annuller" /></AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearWeek}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    <AutoText text="Ja, Ryd Hele Ugen" />
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showCommentDialog} onOpenChange={(open) => {
        setShowCommentDialog(open)
        if (!open) {
          setEditingComment(null)
          setCommentText('')
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChatText size={24} weight="duotone" className="text-amber-600" />
              <AutoText text="Kommentar" />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-900"><AutoText text="Tilføj en kommentar" /></p>
            </div>
            <div>
              <Label htmlFor="comment-text"><AutoText text="Kommentar" /></Label>
              <Textarea
                id="comment-text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={commentPlaceholder}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveComment} className="flex-1">
                <AutoText text="Gem Kommentar" />
              </Button>
              <Button 
                onClick={() => {
                  setCommentText('')
                  handleSaveComment()
                }} 
                variant="outline"
                className="flex-1"
              >
                <AutoText text="Fjern Kommentar" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showDuplicateTaskDialog} onOpenChange={setShowDuplicateTaskDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Tag size={24} weight="duotone" className="text-amber-600" />
              <AutoText text="Opgave Findes Allerede" />
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-4">
              {duplicateTaskInfo && (
                <div className="space-y-2">
                  <p className="text-base">
                    <AutoText text={`${duplicateTaskInfo.employeeName} har allerede opgaven ${duplicateTaskInfo.roleName} tildelt på denne dato.`} />
                  </p>
                  <p className="text-sm text-muted-foreground pt-2">
                    <AutoText text="En bruger kan ikke have den samme opgave tildelt flere gange på samme dag." />
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowDuplicateTaskDialog(false)}>
              <AutoText text="Forstået" />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
