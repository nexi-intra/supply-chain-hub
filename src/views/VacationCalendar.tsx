import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Trash, User, Check, X, ClockCounterClockwise, CalendarDot, House } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useKV } from '@/hooks/useKV'
import { UserProfile } from '@/components/UserProfile'
import { SingleDayOffDialog } from '@/components/SingleDayOffDialog'
import { VacationRequestDialog } from '@/components/VacationRequestDialog'
import { HomeOfficeDialog } from '@/components/HomeOfficeDialog'
import { toast } from 'sonner'
import { AutoText } from '@/components/AutoText'
import { cn, newId } from '@/lib/utils'
import { getEmployeeColorByEmail, EMPLOYEE_COLOR_OVERRIDES_KEY, type EmployeeColorOverrides } from '@/lib/employeeColors'
import { getWeekNumber as getISOWeekNumber, parseLocalDate } from '@/lib/dateUtils'
import { appendToKvArray, removeFromKvArray } from '@/lib/kvArrays'
import { isAnyModalOpen } from '@/lib/modalStack'
import { useLanguage } from '@/contexts/LanguageContext'
import { vacationApprovedEmail, vacationRejectedEmail, vacationCancelledByEmployeeEmail } from '@/lib/emailTemplates'
import { isHomeOfficeOnDate } from '@/lib/homeOffice'
import type { VacationStatus, VacationEntry, BirthdayEntry, HomeOfficePattern, HomeOfficeException } from '@/lib/types'

interface VacationCalendarProps {
  onNavigateBack: () => void
  onLogout: () => void
  userEmail: string
}

export function VacationCalendar({ onNavigateBack, onLogout, userEmail: propUserEmail }: VacationCalendarProps) {
  const [vacations, setVacations] = useKV<VacationEntry[]>('vacation-entries', [])
  const [colorOverrides] = useKV<EmployeeColorOverrides>(EMPLOYEE_COLOR_OVERRIDES_KEY, {})
  const [homeOfficePatterns] = useKV<Record<string, HomeOfficePattern>>('home-office-patterns', {})
  const [homeOfficeExceptions] = useKV<HomeOfficeException[]>('home-office-exceptions', [])
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [detailDay, setDetailDay] = useState<number | null>(null)
  const [isManager, setIsManager] = useState(false)
  const [usersData, setUsersData] = useState<Record<string, { email: string; password: string; fullName: string; isManager: boolean }>>({})
  const [allTeamMembers, setAllTeamMembers] = useState<Array<{ email: string; name: string }>>([])
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([])
  const userEmail = propUserEmail
  const { t, language } = useLanguage()

  const months = [
    t.shifts.months.january, t.shifts.months.february, t.shifts.months.march, t.shifts.months.april,
    t.shifts.months.may, t.shifts.months.june, t.shifts.months.july, t.shifts.months.august,
    t.shifts.months.september, t.shifts.months.october, t.shifts.months.november, t.shifts.months.december
  ]

  useEffect(() => {
    const loadUser = async () => {
      const users = await window.kv.get<Record<string, { email: string; password: string; fullName: string; isManager: boolean }>>('users')
      if (users) {
        setUsersData(users)
        if (users[userEmail]) {
          setIsManager(users[userEmail].isManager || false)
        }
        
        const teamList = Object.values(users).map(user => ({
          email: user.email,
          name: user.fullName
        })).sort((a, b) => a.name.localeCompare(b.name))
        setAllTeamMembers(teamList)
      }

      const birthdaysData = (await window.kv.get<BirthdayEntry[]>('employee-birthdays')) || []
      setBirthdays(birthdaysData)
    }
    if (userEmail) {
      loadUser()
    }
  }, [userEmail])

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

  const isWeekend = (date: Date) => {
    const day = date.getDay()
    return day === 0 || day === 6
  }

  const handleDeleteVacation = async (id: string) => {
    const vacation = (vacations || []).find(v => v.id === id)
    if (!vacation) return

    // Fjern med det samme i billedet og kvitter; skrivning og mails i baggrunden.
    const previousVacations = vacations || []
    setVacations((current) => (current || []).filter(v => v.id !== id))
    toast.success('Ferie anmodning fjernet')

    try {
      await removeFromKvArray('vacation-entries', [id])
    } catch (error) {
      console.error('Error removing vacation:', error)
      setVacations(previousVacations)
      toast.error('Kunne ikke fjerne ferie anmodningen')
      return
    }

    try {
      const emailContent = vacationCancelledByEmployeeEmail(vacation.userEmail, vacation.startDate, vacation.endDate)

      const users = await window.kv.get<Record<string, { email: string; password: string; fullName: string; isManager: boolean }>>('users')
      const managerEmails: string[] = []

      if (users) {
        for (const [email, userData] of Object.entries(users)) {
          if (userData.isManager) {
            managerEmails.push(email)
          }
        }
      }

      // Saml alt og skriv én atomar append pr. nøgle — før kunne to samtidige
      // sletninger overskrive hinandens notifikationer.
      const newEmails = managerEmails.map((managerEmail) => ({
        id: newId('email'),
        from: vacation.userEmail,
        to: managerEmail,
        subject: emailContent.subject,
        message: emailContent.body,
        timestamp: Date.now(),
        read: false
      }))

      const newNotifications = managerEmails.map((managerEmail) => ({
        id: newId('notif'),
        to: managerEmail,
        subject: emailContent.subject,
        body: emailContent.body,
        timestamp: new Date().toISOString(),
        type: 'vacation-removed' as const,
        read: false
      }))

      await appendToKvArray('emails', newEmails)
      await appendToKvArray('email-notifications', newNotifications)
    } catch (emailError) {
      console.error('Error sending vacation removal email:', emailError)
      toast.error('Kunne ikke sende email notifikation')
    }
  }

  const handleApproveVacation = async (id: string) => {
    const vacation = (vacations || []).find(v => v.id === id)
    if (!vacation) return

    setVacations((current) =>
      (current || []).map((v) =>
        v.id === id
          ? { ...v, status: 'approved' as VacationStatus, reviewedBy: userEmail, reviewedAt: new Date().toISOString() }
          : v
      )
    )
    toast.success('Ferie godkendt')

    try {
      const emailContent = vacationApprovedEmail(vacation.startDate, vacation.endDate, userEmail, vacation.notes)

      const newEmail = {
        id: Date.now().toString() + '-approval',
        from: userEmail,
        to: vacation.userEmail,
        subject: emailContent.subject,
        message: emailContent.body,
        timestamp: Date.now(),
        read: false
      }

      // Atomart append i stedet for at laese og skrive hele arrayet: hurtigere,
      // og to samtidige godkendelser taber ikke hinandens mail.
      await appendToKvArray('emails', [newEmail])

      const notification = {
        id: Date.now().toString() + '-notif',
        to: vacation.userEmail,
        subject: emailContent.subject,
        body: emailContent.body,
        timestamp: new Date().toISOString(),
        type: 'vacation-approved' as const,
        read: false
      }

      await appendToKvArray('email-notifications', [notification])
    } catch (emailError) {
      console.error('Error sending vacation approval email:', emailError)
      toast.error('Kunne ikke sende email notifikation')
    }
  }

  const handleRejectVacation = async (id: string) => {
    const vacation = (vacations || []).find(v => v.id === id)
    if (!vacation) return

    setVacations((current) =>
      (current || []).map((v) =>
        v.id === id
          ? { ...v, status: 'rejected' as VacationStatus, reviewedBy: userEmail, reviewedAt: new Date().toISOString() }
          : v
      )
    )
    toast.error('Ferie afvist')

    try {
      const emailContent = vacationRejectedEmail(vacation.startDate, vacation.endDate, userEmail, vacation.notes)

      const newEmail = {
        id: Date.now().toString() + '-rejection',
        from: userEmail,
        to: vacation.userEmail,
        subject: emailContent.subject,
        message: emailContent.body,
        timestamp: Date.now(),
        read: false
      }

      await appendToKvArray('emails', [newEmail])

      const notification = {
        id: Date.now().toString() + '-notif-reject',
        to: vacation.userEmail,
        subject: emailContent.subject,
        body: emailContent.body,
        timestamp: new Date().toISOString(),
        type: 'vacation-rejected' as const,
        read: false
      }

      await appendToKvArray('email-notifications', [notification])
    } catch (emailError) {
      console.error('Error sending vacation rejection email:', emailError)
      toast.error('Kunne ikke sende email notifikation')
    }
  }

  const getVacationsForMonth = (month: number, year: number) => {
    return (vacations || []).filter((vacation) => {
      const start = parseLocalDate(vacation.startDate)
      const end = parseLocalDate(vacation.endDate)
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false
      
      const monthStart = new Date(year, month, 1)
      const monthEnd = new Date(year, month + 1, 0)

      return (start <= monthEnd && end >= monthStart) && vacation.status === 'approved'
    })
  }

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (month: number, year: number) => {
    const day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1
  }

  const isDateInVacation = (day: number, vacation: VacationEntry) => {
    const checkDate = new Date(selectedYear, selectedMonth, day)
    const start = parseLocalDate(vacation.startDate)
    const end = parseLocalDate(vacation.endDate)
    
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    checkDate.setHours(12, 0, 0, 0)

    return checkDate >= start && checkDate <= end
  }

  const getDayVacations = (day: number) => {
    return getVacationsForMonth(selectedMonth, selectedYear).filter((vacation) =>
      isDateInVacation(day, vacation)
    )
  }

  const getBirthdaysForDay = (day: number) => {
    const currentMonth = selectedMonth + 1
    const monthStr = currentMonth.toString().padStart(2, '0')
    const dayStr = day.toString().padStart(2, '0')
    const dateStr = `${monthStr}-${dayStr}`
    
    return birthdays.filter(b => b.birthday === dateStr)
  }

  const getHomeOfficeMembersForDay = (day: number) => {
    const date = new Date(selectedYear, selectedMonth, day)
    return allTeamMembers.filter(member =>
      isHomeOfficeOnDate(member.email, date, homeOfficePatterns, homeOfficeExceptions)
    )
  }

  const daysInMonth = getDaysInMonth(selectedMonth, selectedYear)
  const firstDay = getFirstDayOfMonth(selectedMonth, selectedYear)

  const getFirstName = (email: string) => {
    if (usersData[email]?.fullName) {
      return usersData[email].fullName.split(' ')[0]
    }
    return email.split('@')[0].split('.')[0]
  }

  const calculateAge = (birthday: BirthdayEntry, currentDay: number): number | null => {
    if (!birthday.birthYear) return null
    
    const [monthStr, dayStr] = birthday.birthday.split('-')
    const birthMonth = parseInt(monthStr)
    const birthDay = parseInt(dayStr)
    
    const currentDate = new Date(selectedYear, selectedMonth, currentDay)
    const birthdayThisYear = new Date(selectedYear, birthMonth - 1, birthDay)
    
    let age = selectedYear - birthday.birthYear
    
    if (currentDate < birthdayThisYear) {
      age--
    }
    
    return age
  }

  const getWeekNumber = (date: Date) => {
    return getISOWeekNumber(date)
  }

  const myVacations = (vacations || []).filter(v => v.userEmail === userEmail && v.status !== 'rejected')
  const pendingRequests = (vacations || []).filter(v => v.status === 'pending' && v.userEmail !== userEmail)
  const myPendingRequests = myVacations.filter(v => v.status === 'pending')
  const myApprovedVacations = myVacations.filter(v => v.status === 'approved')

  const handleJumpToToday = () => {
    const today = new Date()
    setSelectedMonth(today.getMonth())
    setSelectedYear(today.getFullYear())
    toast.success('Sprang til i dag')
  }

  const getStatusBadge = (status: VacationStatus) => {
    if (status === 'pending') {
      return (
        <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">
          <ClockCounterClockwise size={14} className="mr-1" />
          <AutoText text="Afventer" />
        </Badge>
      )
    }
    if (status === 'approved') {
      return (
        <Badge className="bg-green-500/20 text-green-700 border-green-500/30">
          <Check size={14} className="mr-1" />
          <AutoText text="Godkendt" />
        </Badge>
      )
    }
    return (
      <Badge className="bg-red-500/20 text-red-700 border-red-500/30">
        <X size={14} className="mr-1" />
        <AutoText text="Afvist" />
      </Badge>
    )
  }

  const renderVacationCard = (vacation: VacationEntry, showActions: boolean = false, showReviewActions: boolean = false) => (
    <motion.div
      key={vacation.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between p-4 rounded-lg border bg-card"
    >
      <div className="flex items-center gap-4 flex-1">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ 
            backgroundColor: getEmployeeColorByEmail(vacation.userEmail, colorOverrides).bg,
            color: getEmployeeColorByEmail(vacation.userEmail, colorOverrides).text
          }}
        >
          <User size={20} weight="bold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {parseLocalDate(vacation.startDate).toLocaleDateString('da-DK', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
            {' → '}
            {parseLocalDate(vacation.endDate).toLocaleDateString('da-DK', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </div>
          {vacation.notes && (
            <div className="text-sm text-muted-foreground"><AutoText text={vacation.notes} /></div>
          )}
          {showReviewActions && (
            <div className="text-xs text-muted-foreground mt-1">
              Anmodet af: {vacation.userEmail}
            </div>
          )}
          <div className="mt-2">
            {getStatusBadge(vacation.status)}
          </div>
          {vacation.reviewedBy && (
            <div className="text-xs text-muted-foreground mt-1">
              Behandlet af: {vacation.reviewedBy}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 ml-4">
        {showReviewActions && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleApproveVacation(vacation.id)}
              className="text-green-600 hover:bg-green-500/10"
            >
              <Check size={20} weight="bold" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRejectVacation(vacation.id)}
              className="text-red-600 hover:bg-red-500/10"
            >
              <X size={20} weight="bold" />
            </Button>
          </>
        )}
        {showActions && vacation.status === 'pending' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteVacation(vacation.id)}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash size={20} />
          </Button>
        )}
      </div>
    </motion.div>
  )

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
                className="pointer-events-auto bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
              >
                <ArrowLeft size={20} />
                {t.common?.back || 'Tilbage'}
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-36 pb-12 sm:pb-20 max-w-7xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center"
        >
          <div className="flex flex-col items-center gap-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1">
              {language === 'da' ? 'Kalender' : language === 'fi' ? 'Kalenteri' : 'Calendar'}
            </h1>
            {isManager && (
              <Badge className="bg-gradient-to-r from-primary to-accent text-white text-xs sm:text-sm">
                Manager
              </Badge>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="space-y-6"
        >
          <Card className="p-6 border-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedMonth.toString()}
                    onValueChange={(value) => setSelectedMonth(parseInt(value))}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month, index) => (
                        <SelectItem key={index} value={index.toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(value) => setSelectedYear(parseInt(value))}
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => {
                        const year = new Date().getFullYear() - 2 + i
                        return (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  variant="outline"
                  onClick={handleJumpToToday}
                  className="gap-2"
                >
                  <CalendarDot size={18} weight="fill" />
                  I dag
                </Button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <VacationRequestDialog userEmail={userEmail} />
                <SingleDayOffDialog userEmail={userEmail} />
                <HomeOfficeDialog userEmail={userEmail} />
              </div>
            </div>

            <Dialog open={detailDay !== null} onOpenChange={(open) => !open && setDetailDay(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {detailDay !== null && new Date(selectedYear, selectedMonth, detailDay).toLocaleDateString(
                      language === 'da' ? 'da-DK' : language === 'fi' ? 'fi-FI' : 'en-US',
                      { weekday: 'long', day: 'numeric', month: 'long' }
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {detailDay !== null && getDayVacations(detailDay).map((vacation) => {
                    const userColor = getEmployeeColorByEmail(vacation.userEmail, colorOverrides)
                    return (
                      <div
                        key={vacation.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: userColor.bg, color: userColor.text }}
                      >
                        <span className="flex-1">{getFirstName(vacation.userEmail)}</span>
                        {vacation.notes && <span className="text-xs opacity-80 truncate">{vacation.notes}</span>}
                      </div>
                    )
                  })}
                  {detailDay !== null && getHomeOfficeMembersForDay(detailDay).map((member) => (
                    <div
                      key={`ho-${member.email}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                    >
                      <House size={16} weight="fill" className="flex-shrink-0" />
                      <span className="flex-1">{member.name}</span>
                      <span className="text-xs opacity-80">{language === 'da' ? 'Hjemmearbejde' : language === 'fi' ? 'Etätyö' : 'Home office'}</span>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid grid-cols-8 gap-2">
              <div className="text-center font-semibold text-sm py-2 text-muted-foreground">
                Uge
              </div>
              {['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((day, index) => (
                <div
                  key={day}
                  className={cn(
                    "text-center font-semibold text-sm py-2",
                    index >= 5 ? "text-muted-foreground/60" : "text-muted-foreground"
                  )}
                >
                  {day}
                </div>
              ))}

              {Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) }).map((_, weekIndex) => {
                const firstDateOfWeek = new Date(selectedYear, selectedMonth, weekIndex * 7 - firstDay + 1)
                const weekNumber = getWeekNumber(firstDateOfWeek)
                
                return (
                  <React.Fragment key={`week-${weekIndex}`}>
                    <div className="flex items-center justify-center text-sm font-bold text-muted-foreground border rounded-lg bg-muted/30">
                      {weekNumber}
                    </div>
                    {Array.from({ length: 7 }).map((_, dayIndex) => {
                      const cellIndex = weekIndex * 7 + dayIndex
                      const day = cellIndex - firstDay + 1
                      
                      if (cellIndex < firstDay || day > daysInMonth) {
                        return <div key={`empty-${cellIndex}`} className="aspect-square" />
                      }

                      const dayVacations = getDayVacations(day)
                      const dayBirthdays = getBirthdaysForDay(day)
                      const dayHomeOffice = getHomeOfficeMembersForDay(day)
                      const currentDate = new Date(selectedYear, selectedMonth, day)
                      const dayOfWeek = currentDate.getDay()
                      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6
                      const isToday =
                        day === new Date().getDate() &&
                        selectedMonth === new Date().getMonth() &&
                        selectedYear === new Date().getFullYear()

                      return (
                        <div
                          key={day}
                          onClick={() => (dayVacations.length > 0 || dayHomeOffice.length > 0) && setDetailDay(day)}
                          className={cn(
                            "aspect-square border rounded-lg p-1 relative",
                            isToday && "ring-2 ring-primary",
                            isWeekendDay && "bg-muted/50 opacity-60",
                            (dayVacations.length > 0 || dayHomeOffice.length > 0) && "cursor-pointer hover:ring-2 hover:ring-primary/50"
                          )}
                        >
                          <div className={cn(
                            "text-xs font-semibold mb-1",
                            isWeekendDay && "text-muted-foreground"
                          )}>
                            {day}
                          </div>
                          <div className="space-y-0.5">
                            {dayBirthdays.length > 0 && (
                              <div 
                                className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300 flex items-center gap-0.5"
                                title={dayBirthdays.map(b => `${b.fullName} har fødselsdag 🎉`).join(', ')}
                              >
                                <svg width="12" height="10" viewBox="0 0 37 28" className="flex-shrink-0">
                                  <rect width="37" height="28" fill="#C8102E"/>
                                  <rect x="12" y="0" width="4" height="28" fill="#FFFFFF"/>
                                  <rect x="0" y="12" width="37" height="4" fill="#FFFFFF"/>
                                </svg>
                                <span className="truncate">
                                  {dayBirthdays.length === 1 
                                    ? (() => {
                                        const age = calculateAge(dayBirthdays[0], day)
                                        return age !== null 
                                          ? `${getFirstName(dayBirthdays[0].email)} (${age} år)`
                                          : getFirstName(dayBirthdays[0].email)
                                      })()
                                    : `${dayBirthdays.length} fødselsdage`
                                  }
                                </span>
                              </div>
                            )}
                            {isWeekendDay && dayBirthdays.length === 0 ? (
                              <div className="text-[8px] text-muted-foreground text-center mt-2">
                                Lukket
                              </div>
                            ) : !isWeekendDay && (
                              <>
                                {dayVacations.slice(0, dayBirthdays.length > 0 ? 2 : 3).map((vacation) => {
                                  const userColor = getEmployeeColorByEmail(vacation.userEmail, colorOverrides)
                                  return (
                                    <div
                                      key={vacation.id}
                                      className="text-[10px] px-1.5 py-0.5 rounded truncate font-semibold"
                                      style={{
                                        backgroundColor: userColor.bg,
                                        color: userColor.text
                                      }}
                                      title={`${getFirstName(vacation.userEmail)}${vacation.notes ? ': ' + vacation.notes : ''}`}
                                    >
                                      {getFirstName(vacation.userEmail)}
                                    </div>
                                  )
                                })}
                                {dayVacations.length > (dayBirthdays.length > 0 ? 2 : 3) && (
                                  <div className="text-[9px] text-muted-foreground underline">
                                    +{dayVacations.length - (dayBirthdays.length > 0 ? 2 : 3)} {language === 'da' ? 'se alle' : language === 'fi' ? 'katso kaikki' : 'see all'}
                                  </div>
                                )}
                                {dayHomeOffice.slice(0, 3).map((member) => (
                                  <div
                                    key={member.email}
                                    className="text-[10px] px-1.5 py-0.5 rounded truncate font-semibold bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 flex items-center gap-0.5"
                                    title={`${member.name}${language === 'da' ? ' arbejder hjemme' : language === 'fi' ? ' työskentelee etänä' : ' works from home'}`}
                                  >
                                    <House size={10} weight="fill" className="flex-shrink-0" />
                                    <span className="truncate">{getFirstName(member.email)}</span>
                                  </div>
                                ))}
                                {dayHomeOffice.length > 3 && (
                                  <div
                                    className="text-[9px] text-sky-700 dark:text-sky-300 underline"
                                    title={dayHomeOffice.map(m => m.name).join(', ')}
                                  >
                                    +{dayHomeOffice.length - 3} {language === 'da' ? 'hjemme' : language === 'fi' ? 'etänä' : 'home'}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </div>
          </Card>

          {isManager && pendingRequests.length > 0 && (
            <Card className="p-6 border-2">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-xl font-bold">Afventende Anmodninger</h3>
                <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                  {pendingRequests.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {pendingRequests
                  .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                  .map((vacation) => renderVacationCard(vacation, false, true))}
              </div>
            </Card>
          )}

          <Card className="p-6 border-2">
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all"><AutoText text={`Alle (${myVacations.length})`} /></TabsTrigger>
                <TabsTrigger value="pending"><AutoText text={`Afventer (${myPendingRequests.length})`} /></TabsTrigger>
                <TabsTrigger value="approved"><AutoText text={`Godkendt (${myApprovedVacations.length})`} /></TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-4">
                <h3 className="text-xl font-bold mb-4"><AutoText text="Mine Ferier" /></h3>
                {myVacations.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    <AutoText text="Du har ikke registreret nogen ferier endnu" />
                  </p>
                ) : (
                  <div className="space-y-3">
                    {myVacations
                      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                      .map((vacation) => renderVacationCard(vacation, true))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="pending" className="mt-4">
                <h3 className="text-xl font-bold mb-4"><AutoText text="Afventende Anmodninger" /></h3>
                {myPendingRequests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    <AutoText text="Du har ingen afventende anmodninger" />
                  </p>
                ) : (
                  <div className="space-y-3">
                    {myPendingRequests
                      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                      .map((vacation) => renderVacationCard(vacation, true))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="approved" className="mt-4">
                <h3 className="text-xl font-bold mb-4"><AutoText text="Godkendte Ferier" /></h3>
                {myApprovedVacations.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    <AutoText text="Du har ingen godkendte ferier" />
                  </p>
                ) : (
                  <div className="space-y-3">
                    {myApprovedVacations
                      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                      .map((vacation) => renderVacationCard(vacation))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>

          {allTeamMembers.length > 1 && (
            <Card className="p-6 border-2">
              <h3 className="text-xl font-bold mb-4"><AutoText text="Alle Team Medlemmer" /></h3>
              <div className="flex flex-wrap gap-3">
                {allTeamMembers.map((member) => (
                  <div
                    key={member.email}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ 
                        backgroundColor: getEmployeeColorByEmail(member.email, colorOverrides).bg,
                        color: getEmployeeColorByEmail(member.email, colorOverrides).text
                      }}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{member.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  )
}
