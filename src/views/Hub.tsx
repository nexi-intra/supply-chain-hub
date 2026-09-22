import { motion } from 'framer-motion'
import { useState, useEffect, useMemo } from 'react'
import { Books, Users, Calendar, Gear, ChatCircle, FileText, FirstAidKit, Envelope, ClipboardText, ShieldCheck, ForkKnife, CheckCircle, User, GameController, Warning, UserPlus, ChatText, Notebook, X, PencilSimple, Buildings, House, UsersThree, ListChecks } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserProfile } from '@/components/UserProfile'
import { SickLeaveDialog } from '@/components/SickLeaveDialog'
import { GuideReviewAlert } from '@/components/GuideReviewAlert'
import { NotificationCenter } from '@/components/NotificationCenter'
import { AnnouncementsBoard } from '@/components/AnnouncementsBoard'
import { EmailNotifications } from '@/components/EmailNotifications'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { hasManagerAccess, hasCreatorAccess, getCreatorEmail } from '@/lib/userRoles'
import { useKV } from '@/hooks/useKV'
import { useCachedState } from '@/hooks/useCachedState'
import { useLanguage } from '@/contexts/LanguageContext'
import nexiLogo from '@/assets/images/nexi-logo.svg'
import nexiLogoWhite from '@/assets/images/nexi-logo-white.svg'
import { format, isSameDay, parseISO } from 'date-fns'
import { da, enUS } from 'date-fns/locale'
import type { ShiftRole, ShiftAssignment, ShiftPatternRule, SickLeaveEntry, VacationEntry, WeekMenu, Email, HomeOfficePattern, HomeOfficeException } from '@/lib/types'
import { getEmployeeColorByEmail, EMPLOYEE_COLOR_OVERRIDES_KEY, type EmployeeColorOverrides } from '@/lib/employeeColors'
import type { Guide, GuideReviewRequest } from '@/lib/guideTypes'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'
import { getHomeOfficeUsersForDate } from '@/lib/homeOffice'
import { personalTodosKey, type PersonalTodo } from '@/lib/personalTodos'
import type { Project } from '@/views/ProjectBoard'
import { appendToKvArray, removeFromKvArray, upsertInKvArray } from '@/lib/kvArrays'
import { expandShiftPatterns } from '@/lib/shiftPatterns'

interface HubModule {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  gradient: string
  available: boolean
}

interface HubProps {
  onNavigate: (moduleId: string) => void
  onLogout: () => void
  userEmail: string
  onChooseAccessView?: () => void
}

type DashboardWidgetId = 'teamTasks' | 'teamStatus' | 'offToday' | 'todaysMeal' | 'sickToday' | 'supplyOff' | 'supplyHomeOffice' | 'supplySick'
type DashboardWidgetSize = 'compact' | 'standard' | 'large'
type DashboardPreferences = Record<DashboardWidgetId, { visible: boolean; size: DashboardWidgetSize }>

// Bruger-centreret status-række til "Team status"-widgeten (omvendt af team-opgaver).
type TeamStatusRow = {
  email: string
  name: string
  status: 'working' | 'vacation' | 'sick' | 'available'
  tasks: Array<{ roleId: string; taskName: string; taskColor: string; comment?: string }>
}

const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  teamTasks: { visible: true, size: 'standard' },
  teamStatus: { visible: true, size: 'standard' },
  offToday: { visible: true, size: 'standard' },
  todaysMeal: { visible: true, size: 'standard' },
  sickToday: { visible: true, size: 'standard' },
  supplyOff: { visible: true, size: 'standard' },
  supplyHomeOffice: { visible: true, size: 'standard' },
  supplySick: { visible: true, size: 'standard' },
}

/** Alle godkendte ferier der dækker `date`, som navne (dedupliceret). Bruges til tværgående Fase 9-kort. */
function computeOffToday(
  users: Record<string, { fullName: string }> | null | undefined,
  vacations: VacationEntry[] | null | undefined,
  date: Date
): string[] {
  const names: string[] = []
  for (const v of vacations || []) {
    if (v.status !== 'approved') continue
    const start = parseISO(v.startDate)
    const end = parseISO(v.endDate)
    if (!(isSameDay(start, date) || isSameDay(end, date) || (start < date && end > date))) continue
    const name = users?.[v.userEmail]?.fullName || v.userEmail
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/** Alle godkendte sygemeldinger for `date`, som navne (dedupliceret). Bruges til tværgående Fase 9-kort. */
function computeSickToday(
  users: Record<string, { fullName: string }> | null | undefined,
  sickLeave: SickLeaveEntry[] | null | undefined,
  date: Date
): string[] {
  const names: string[] = []
  for (const s of sickLeave || []) {
    if (s.status !== 'approved' || !isSameDay(parseISO(s.startDate), date)) continue
    const name = s.userName || users?.[s.userEmail]?.fullName || s.userEmail
    if (!names.includes(name)) names.push(name)
  }
  return names
}


export function Hub({ onNavigate, onLogout, userEmail, onChooseAccessView }: HubProps) {
  const { t, language } = useLanguage()
  const [isAdminOrManager, setIsAdminOrManager] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  // Creator-kontoen er en platform-konto og skal ikke vises i team-oversigter.
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState(userEmail)
  const [showSickLeaveDialog, setShowSickLeaveDialog] = useState(false)
  const [showEmailNotifications, setShowEmailNotifications] = useState(false)
  const [showDashboardEditor, setShowDashboardEditor] = useState(false)
  // useKV abonnerer automatisk på ændringer — ingen manuel subscribe-boilerplate nødvendig.
  // Hentes ÉN gang her og sendes ned som props til NotificationCenter/GuideReviewAlert,
  // så vi undgår flere uafhængige KV-lyttere for de samme nøgler på den mest besøgte skærm.
  const [emails] = useKV<Email[]>('emails', [])
  const [vacationsForBadge] = useKV<VacationEntry[]>('vacation-entries', [])
  const [sickLeaveForBadge] = useKV<SickLeaveEntry[]>('sick-leave-entries', [])
  const [guidesForAlerts] = useKV<Guide[]>('guides', [])
  const [guideReviewRequests] = useKV<GuideReviewRequest[]>('guide-review-requests', [], { initializeIfMissing: false })
  const [guideAdminEmails] = useKV<string[]>('guide-admin-emails', [], { initializeIfMissing: false })
  // Ferieanmodninger manageren allerede har set inde i Manager Panel — bruges til
  // at fjerne Hub-advarslen/notifikationen uden at røre selve godkendelses-status.
  const [seenVacationRequestIds] = useKV<string[]>(`seen-vacation-requests-${userEmail}`, [])
  // Til forfaldsdato-notifikationer i NotificationCenter (samme begrundelse: én
  // fælles KV-lytter her i stedet for at ProjectBoard og Hub abonnerer separat).
  const [projectsForAlerts] = useKV<Project[]>('projects', [])
  const [personalTodosForAlerts] = useKV<PersonalTodo[]>(personalTodosKey(userEmail), [])
  const [dashboardPreferences, setDashboardPreferences] = useKV<DashboardPreferences>(`hub-dashboard-${userEmail}`, DEFAULT_DASHBOARD_PREFERENCES)
  // Til "Team status"-widgeten: faste brugere + manager-farveoverstyringer.
  const [usersForStatus] = useKV<Record<string, { fullName: string }>>('users', {})
  const [colorOverrides] = useKV<EmployeeColorOverrides>(EMPLOYEE_COLOR_OVERRIDES_KEY, {})
  // Kommentarer til brugere UDEN dagens opgave gemmes her (noeglet paa dato|email),
  // da de ikke har en vagtplan-tildeling at haenge kommentaren paa.
  const [teamStatusNotes, setTeamStatusNotes] = useKV<Record<string, string>>('team-status-notes', {})

  const dashboardWidget = (id: DashboardWidgetId) => dashboardPreferences?.[id] || DEFAULT_DASHBOARD_PREFERENCES[id]
  const dashboardSizeClass = (id: DashboardWidgetId) => {
    const size = dashboardWidget(id).size
    if (size === 'compact') return 'min-h-[110px]'
    if (size === 'large') return 'min-h-[230px] md:col-span-2'
    return 'min-h-[150px]'
  }
  const updateDashboardWidget = (id: DashboardWidgetId, patch: Partial<DashboardPreferences[DashboardWidgetId]>) => {
    setDashboardPreferences((current) => ({
      ...DEFAULT_DASHBOARD_PREFERENCES,
      ...(current || {}),
      [id]: { ...DEFAULT_DASHBOARD_PREFERENCES[id], ...(current?.[id] || {}), ...patch },
    }))
  }

  const unreadInboxCount = useMemo(() => (
    (emails || []).filter(e => e.to === userEmail && !e.read && (e.folderId === undefined || e.folderId === null || e.folderId === '')).length
  ), [emails, userEmail])

  const pendingVacationRequests = useMemo(() => {
    if (!isAdminOrManager) return 0
    const seenIds = seenVacationRequestIds || []
    const pendingVacations = (vacationsForBadge || []).filter(v => v.status === 'pending' && !seenIds.includes(v.id)).length
    const pendingSickLeave = (sickLeaveForBadge || []).filter(s => s.status === 'pending').length
    return pendingVacations + pendingSickLeave
  }, [isAdminOrManager, vacationsForBadge, sickLeaveForBadge, seenVacationRequestIds])
  const isGuideReviewer = isAdminOrManager || (guideAdminEmails || []).some((email) => email.trim().toLowerCase() === userEmail.trim().toLowerCase())
  const pendingGuideReviews = isGuideReviewer ? (guideReviewRequests || []).filter((request) => request.status === 'pending').length : 0
  
  const [teamTasks, setTeamTasks] = useCachedState<Array<{ taskName: string; taskColor: string; people: Array<{ name: string; comment?: string }>; roleId: string }>>(`hub:teamTasks:${userEmail}`, [])
  const [peopleOff, setPeopleOff] = useCachedState<Array<{ name: string; type: 'vacation' | 'single' }>>(`hub:peopleOff:${userEmail}`, [])
  const [peopleSick, setPeopleSick] = useCachedState<string[]>(`hub:peopleSick:${userEmail}`, [])
  const [todaysMeal, setTodaysMeal] = useCachedState<string>(`hub:todaysMeal:${userEmail}`, '')

  // Omvendt af team-opgaver: faste brugere, hvor hver række viser dagens opgave(r) +
  // kommentar fra vagtplanen, eller ferie/syg. Afledt af allerede indlæst state.
  const teamStatusRows = useMemo<TeamStatusRow[]>(() => {
    const sickSet = new Set(peopleSick || [])
    const offSet = new Set((peopleOff || []).map((p) => p.name))
    const tasksByName = new Map<string, Array<{ roleId: string; taskName: string; taskColor: string; comment?: string }>>()
    for (const task of teamTasks || []) {
      for (const person of task.people) {
        const list = tasksByName.get(person.name) || []
        list.push({ roleId: task.roleId, taskName: task.taskName, taskColor: task.taskColor, comment: person.comment })
        tasksByName.set(person.name, list)
      }
    }
    return Object.entries(usersForStatus || {})
      .filter(([email]) => !creatorEmail || email.trim().toLowerCase() !== creatorEmail.trim().toLowerCase())
      .map(([email, data]) => ({ email, name: data?.fullName || email }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ email, name }): TeamStatusRow => {
        if (sickSet.has(name)) return { email, name, status: 'sick', tasks: [] }
        if (offSet.has(name)) return { email, name, status: 'vacation', tasks: [] }
        const tasks = tasksByName.get(name) || []
        return { email, name, status: tasks.length ? 'working' : 'available', tasks }
      })
  }, [usersForStatus, peopleSick, peopleOff, teamTasks, creatorEmail])

  // Tværgående Fase 9-kort: fri/syge/hjemmearbejde i ANDRE teams. Kun vist når der findes >1 team.
  const [hasOtherTeams, setHasOtherTeams] = useCachedState(`hub:hasOtherTeams:${userEmail}`, false)
  const [otherTeamsOff, setOtherTeamsOff] = useCachedState<Array<{ name: string; teamCode: string }>>(`hub:otherTeamsOff:${userEmail}`, [])
  const [otherTeamsSick, setOtherTeamsSick] = useCachedState<Array<{ name: string; teamCode: string }>>(`hub:otherTeamsSick:${userEmail}`, [])
  const [otherTeamsHomeOffice, setOtherTeamsHomeOffice] = useCachedState<Array<{ name: string; teamCode: string }>>(`hub:otherTeamsHomeOffice:${userEmail}`, [])
  
  const [showQuickAssignDialog, setShowQuickAssignDialog] = useState(false)
  const [selectedTaskForAssign, setSelectedTaskForAssign] = useState<{ roleId: string; roleName: string } | null>(null)
  const [selectedEmployeeForAssign, setSelectedEmployeeForAssign] = useState<string>('')
  const [allEmployees, setAllEmployees] = useState<Array<{ email: string; name: string }>>([])
  // Widget: tildel en opgave (rolle) direkte til en bruger fra Team status-kortet.
  const [showWidgetAssignDialog, setShowWidgetAssignDialog] = useState(false)
  const [widgetAssignUser, setWidgetAssignUser] = useState<{ email: string; name: string } | null>(null)
  const [widgetAssignRoleId, setWidgetAssignRoleId] = useState('')
  
  const [showCommentDialog, setShowCommentDialog] = useState(false)
  const [selectedUserForComment, setSelectedUserForComment] = useState<{ name: string; roleId: string; currentComment?: string; email?: string } | null>(null)
  const [newComment, setNewComment] = useState('')
  const [appVersion, setAppVersion] = useState<string>('')
  const [teamName, setTeamName] = useState<string>('Supply Chain Hub')

  useEffect(() => {
    const loadTeamName = async () => {
      const team = await window.electronRegistry?.getCurrentTeam()
      if (team) setTeamName(team.name)
    }
    loadTeamName()
  }, [])

  useEffect(() => {
    // Lav frekvens (kun ved mount + hvert 5. minut) — dette er tværgående læsninger fra ANDRE
    // teams' mapper, ikke lokal reaktiv KV-state, så det giver ikke mening at polle sekundært.
    const loadCrossTeamOverview = async () => {
      if (!window.electronRegistry) return
      const [allTeams, currentTeam] = await Promise.all([
        window.electronRegistry.listTeams(),
        window.electronRegistry.getCurrentTeam(),
      ])
      const others = allTeams.filter(team => team.teamId !== currentTeam?.teamId)
      setHasOtherTeams(others.length > 0)
      if (others.length === 0) return

      const today = new Date()
      const off: Array<{ name: string; teamCode: string }> = []
      const sick: Array<{ name: string; teamCode: string }> = []
      const homeOffice: Array<{ name: string; teamCode: string }> = []

      // Fri/syg viser fortsat kun de andre teams, mens Home Office-kortet bevidst
      // samler BÅDE eget team og de andre teams, så hele Supply Chain ses ét sted.
      const teamResults = await window.electronRegistry.readTeamsKeys(allTeams.map(team => ({
        folderName: team.folderName,
        keys: ['users', 'vacation-entries', 'sick-leave-entries', 'home-office-patterns', 'home-office-exceptions'],
      })))
      allTeams.forEach((team, index) => {
        const [teamUsers, teamVacations, teamSickLeave, teamPatterns, teamExceptions] = teamResults[index] as [Record<string, { fullName: string }>, VacationEntry[], SickLeaveEntry[], Record<string, HomeOfficePattern>, HomeOfficeException[]]
        const isOtherTeam = team.teamId !== currentTeam?.teamId
        if (isOtherTeam) {
          for (const name of computeOffToday(teamUsers, teamVacations, today)) off.push({ name, teamCode: team.abbreviation || team.teamId })
          for (const name of computeSickToday(teamUsers, teamSickLeave, today)) sick.push({ name, teamCode: team.abbreviation || team.teamId })
        }
        const homeOfficeEmails = getHomeOfficeUsersForDate(Object.keys(teamUsers || {}), today, teamPatterns, teamExceptions)
        for (const email of homeOfficeEmails) homeOffice.push({ name: teamUsers?.[email]?.fullName || email, teamCode: team.abbreviation || team.teamId })
      })

      setOtherTeamsOff(off)
      setOtherTeamsSick(sick)
      setOtherTeamsHomeOffice(homeOffice)
    }

    loadCrossTeamOverview()
    const interval = setInterval(loadCrossTeamOverview, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const loadVersion = async () => {
      if (window.electronUpdates) {
        const status = await window.electronUpdates.getStatus()
        setAppVersion(status.currentVersion)
      }
    }
    loadVersion()
  }, [])
  
  useEffect(() => {
    const checkUserRole = async () => {
      const access = await hasManagerAccess(userEmail)
      setIsAdminOrManager(access)
    }
    checkUserRole()
  }, [userEmail])

  useEffect(() => {
    const checkCreator = async () => {
      const [creatorAccess, creator] = await Promise.all([hasCreatorAccess(userEmail), getCreatorEmail()])
      setIsCreator(creatorAccess)
      setCreatorEmail(creator)
    }
    checkCreator()
  }, [userEmail])

  useEffect(() => {
    const loadName = async () => {
      const usersData = (await window.kv.get<Record<string, { fullName: string }>>('users')) || {}
      setCurrentUserName(usersData[userEmail]?.fullName || userEmail)
    }
    loadName()
  }, [userEmail])

  useEffect(() => {
    const loadOverviewData = async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const currentDate = new Date()
      
      const [assignments = [], roles = [], sickLeave = [], vacations = [], usersData = {}, weekMenus = [], shiftPatterns = []] = await Promise.all([
        window.kv.get<ShiftAssignment[]>('shift-assignments'),
        window.kv.get<ShiftRole[]>('shift-roles'),
        window.kv.get<SickLeaveEntry[]>('sick-leave-entries'),
        window.kv.get<VacationEntry[]>('vacation-entries'),
        window.kv.get<Record<string, { fullName: string }>>('users'),
        window.kv.get<WeekMenu[]>('meal-plan-weeks'),
        window.kv.get<ShiftPatternRule[]>('shift-patterns'),
      ])
      
      const isSickToday = (userEmail: string) => {
        return sickLeave.some(s => 
          s.userEmail === userEmail && 
          s.status === 'approved' && 
          isSameDay(parseISO(s.startDate), currentDate)
        )
      }
      
      const isOnVacationToday = (userEmail: string) => {
        return vacations.some(v => {
          if (v.userEmail !== userEmail || v.status !== 'approved') return false
          const start = parseISO(v.startDate)
          const end = parseISO(v.endDate)
          return (isSameDay(start, currentDate) || isSameDay(end, currentDate) || (start < currentDate && end > currentDate))
        })
      }
      
      // Gentagne vagter gemmes ikke som raekker - de skal udfoldes her, ellers
      // mangler personen bag et moenster i widgeten (opgaven vises, personen ikke).
      const todaysAssignments = [
        ...assignments.filter(a => a.date === today),
        ...expandShiftPatterns(shiftPatterns, assignments, today, email => isSickToday(email) || isOnVacationToday(email)),
      ]
      
      const taskPeopleMap: Record<string, { color: string; people: Array<{ name: string; comment?: string }>; roleId: string }> = {}
      
      roles.forEach(role => {
        taskPeopleMap[role.name] = {
          color: role.color,
          people: [],
          roleId: role.id
        }
      })
      
      todaysAssignments.forEach(assignment => {
        const role = roles.find(r => r.id === assignment.roleId)
        const roleName = role?.name || 'Unknown'
        
        const userEmail = Object.keys(usersData).find(email => usersData[email]?.fullName === assignment.employeeName)
        
        if (!userEmail) {
          return
        }
        
        if (isSickToday(userEmail) || isOnVacationToday(userEmail)) {
          return
        }
        
        if (taskPeopleMap[roleName]) {
          const existingPerson = taskPeopleMap[roleName].people.find(p => p.name === assignment.employeeName)
          if (!existingPerson) {
            taskPeopleMap[roleName].people.push({
              name: assignment.employeeName,
              comment: assignment.comment
            })
          }
        }
      })
      
      const teamTasksList = Object.entries(taskPeopleMap).map(([taskName, data]) => ({
        taskName,
        taskColor: data.color,
        people: data.people,
        roleId: data.roleId
      }))
      
      setTeamTasks(teamTasksList)
      
      const users = Object.entries(usersData).map(([email, data]) => ({
        email,
        name: data.fullName
      }))
      setAllEmployees(users)
      
      const todaySick = sickLeave
        .filter(s => s.status === 'approved' && isSameDay(parseISO(s.startDate), new Date()))
        .map(s => s.userName)
      setPeopleSick(todaySick)
      
      const todayOff: Array<{ name: string; type: 'vacation' | 'single' }> = []
      
      vacations.forEach(v => {
        if (v.status === 'approved') {
          const start = parseISO(v.startDate)
          const end = parseISO(v.endDate)
          const now = new Date()
          
          if (isSameDay(start, now) || isSameDay(end, now) || (start < now && end > now)) {
            const userName = usersData[v.userEmail]?.fullName || v.userEmail
            todayOff.push({ name: userName, type: 'vacation' })
          }
        }
      })
      
      setPeopleOff(todayOff)
      
      const getWeekNumber = (date: Date): number => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
        const dayNum = d.getUTCDay() || 7
        d.setUTCDate(d.getUTCDate() + 4 - dayNum)
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
      }
      
      const currentWeek = getWeekNumber(currentDate)
      const currentYear = currentDate.getFullYear()
      const currentWeekMenu = weekMenus.find(w => w.weekNumber === currentWeek && w.year === currentYear)
      
      if (currentWeekMenu) {
        const dayOfWeek = currentDate.getDay()
        const dayKeys: Array<keyof typeof currentWeekMenu.meals> = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          const dayKey = dayKeys[dayOfWeek - 1]
          setTodaysMeal(currentWeekMenu.meals[dayKey] || '')
        } else {
          setTodaysMeal('')
        }
      } else {
        setTodaysMeal('')
      }
    }
    
    loadOverviewData()

    const overviewKeys = ['shift-assignments', 'shift-roles', 'sick-leave-entries', 'vacation-entries', 'users', 'meal-plan-weeks']
    const unsubscribe = window.kv.subscribe((changedKeys) => {
      if (changedKeys.some((key) => overviewKeys.includes(key))) loadOverviewData()
    })
    // Langsomt fallback-interval så "i dag" ruller korrekt over ved midnat.
    const interval = setInterval(loadOverviewData, 5 * 60 * 1000)
    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [userEmail])

  const handleModuleClick = (moduleId: string) => {
    if (moduleId === 'manager' && !isAdminOrManager) {
      return
    }
    onNavigate(moduleId)
  }

  const handleQuickAssign = async (taskOverride?: { roleId: string; roleName: string }, employeeEmailOverride?: string) => {
    const task = taskOverride || selectedTaskForAssign
    const employeeEmailSel = employeeEmailOverride || selectedEmployeeForAssign
    if (!task || !employeeEmailSel) {
      toast.error(language === 'da' ? 'Vælg en medarbejder' : language === 'fi' ? 'Valitse työntekijä' : 'Select an employee')
      return
    }

    const today = format(new Date(), 'yyyy-MM-dd')
    const assignments = (await window.kv.get<ShiftAssignment[]>('shift-assignments')) || []
    const usersData = (await window.kv.get<Record<string, { fullName: string }>>('users')) || {}
    
    const selectedEmployee = allEmployees.find(e => e.email === employeeEmailSel)
    if (!selectedEmployee) {
      toast.error(language === 'da' ? 'Medarbejder ikke fundet' : language === 'fi' ? 'Työntekijää ei löytynyt' : 'Employee not found')
      return
    }

    const employeeName = selectedEmployee.name
    const employeeEmail = selectedEmployee.email

    const sickLeave = (await window.kv.get<SickLeaveEntry[]>('sick-leave-entries')) || []
    const vacations = (await window.kv.get<VacationEntry[]>('vacation-entries')) || []
    
    const isSickToday = sickLeave.some(s => 
      s.userEmail === employeeEmail && 
      s.status === 'approved' && 
      isSameDay(parseISO(s.startDate), new Date())
    )
    
    const isOnVacationToday = vacations.some(v => {
      if (v.userEmail !== employeeEmail || v.status !== 'approved') return false
      const start = parseISO(v.startDate)
      const end = parseISO(v.endDate)
      const now = new Date()
      return (isSameDay(start, now) || isSameDay(end, now) || (start < now && end > now))
    })

    if (isSickToday) {
      toast.error(language === 'da' ? `${employeeName} er syg i dag` : language === 'fi' ? `${employeeName} on sairas tänään` : `${employeeName} is sick today`)
      return
    }

    if (isOnVacationToday) {
      toast.error(language === 'da' ? `${employeeName} har fri i dag` : language === 'fi' ? `${employeeName} on vapaa tänään` : `${employeeName} is off today`)
      return
    }

    const alreadyAssigned = assignments.some(
      a => a.date === today && a.employeeName === employeeName && a.roleId === task.roleId
    )

    if (alreadyAssigned) {
      toast.error(language === 'da' ? `${employeeName} har allerede denne opgave` : language === 'fi' ? `${employeeName}:llä on jo tämä tehtävä` : `${employeeName} already has this task`)
      return
    }

    const newAssignment: ShiftAssignment = {
      id: `assignment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      employeeId: employeeEmail,
      employeeName: employeeName,
      roleId: task.roleId,
      date: today,
    }

    // Vis tildelingen straks og luk dialogen. Tidligere ventede UI'et paa
    // skrivningen OG en genindlaesning af seks noegler over netvaerket, saa der
    // gik lang tid foer noget skete. Genindlaesningen er unoedvendig: abonnementet
    // paa 'shift-assignments' (se effekten ovenfor) henter selv det friske billede.
    setTeamTasks(prev => prev.map(entry => entry.roleId === task.roleId
      ? { ...entry, people: [...entry.people, { name: employeeName }] }
      : entry))
    toast.success(language === 'da' ? `${employeeName} tildelt ${task.roleName}` : language === 'fi' ? `${employeeName} ${task.roleName}:lle osoitettu` : `${employeeName} assigned to ${task.roleName}`)
    setShowQuickAssignDialog(false)
    setSelectedTaskForAssign(null)
    setSelectedEmployeeForAssign('')

    try {
      await appendToKvArray<ShiftAssignment>('shift-assignments', [newAssignment])
    } catch (error) {
      console.error('Kunne ikke tildele opgaven:', error)
      setTeamTasks(prev => prev.map(entry => entry.roleId === task.roleId
        ? { ...entry, people: entry.people.filter(person => person.name !== employeeName) }
        : entry))
      toast.error(language === 'da' ? 'Tildelingen blev ikke gemt — prøv igen' : language === 'fi' ? 'Osoitusta ei tallennettu — yritä uudelleen' : 'The assignment was not saved — please try again')
    }
  }

  const handleAddOrUpdateComment = async () => {
    if (!selectedUserForComment) return

    const today = format(new Date(), 'yyyy-MM-dd')

    // Bruger uden opgave: kommentaren hoerer ikke til en vagtplan-tildeling,
    // saa den gemmes i det daglige bruger-note-lager i stedet.
    if (!selectedUserForComment.roleId && selectedUserForComment.email) {
      const noteKey = `${today}|${selectedUserForComment.email}`
      const text = newComment.trim()
      setTeamStatusNotes((current) => {
        const next = { ...(current || {}) }
        if (text) next[noteKey] = text
        else delete next[noteKey]
        return next
      })
      toast.success(language === 'da' ? 'Kommentar opdateret' : language === 'fi' ? 'Kommentti päivitetty' : 'Comment updated')
      setShowCommentDialog(false)
      setSelectedUserForComment(null)
      setNewComment('')
      return
    }

    const commentText = newComment || undefined
    const person = selectedUserForComment
    // Vis kommentaren straks og luk dialogen; resten sker i baggrunden.
    setTeamTasks(prev => prev.map(entry => entry.roleId === person.roleId
      ? { ...entry, people: entry.people.map(p => p.name === person.name ? { ...p, comment: commentText } : p) }
      : entry))
    toast.success(language === 'da' ? 'Kommentar opdateret' : language === 'fi' ? 'Kommentti päivitetty' : 'Comment updated')
    setShowCommentDialog(false)
    setSelectedUserForComment(null)
    setNewComment('')

    try {
      const assignments = (await window.kv.get<ShiftAssignment[]>('shift-assignments')) || []
      const matching = assignments.filter(a => a.date === today && a.employeeName === person.name && a.roleId === person.roleId)
      if (matching.length > 0) {
        await upsertInKvArray<ShiftAssignment>('shift-assignments', matching.map(a => ({ ...a, comment: commentText })))
      }
    } catch (error) {
      console.error('Kunne ikke gemme kommentaren:', error)
      toast.error(language === 'da' ? 'Kommentaren blev ikke gemt — prøv igen' : language === 'fi' ? 'Kommenttia ei tallennettu — yritä uudelleen' : 'The comment was not saved — please try again')
    }
  }

  // Tildeler den valgte rolle til den valgte bruger fra Team status-widgeten.
  const handleWidgetAssign = async () => {
    if (!widgetAssignUser || !widgetAssignRoleId) return
    const role = (teamTasks || []).find((tk) => tk.roleId === widgetAssignRoleId)
    if (!role) return
    await handleQuickAssign({ roleId: role.roleId, roleName: role.taskName }, widgetAssignUser.email)
    setShowWidgetAssignDialog(false)
    setWidgetAssignUser(null)
    setWidgetAssignRoleId('')
  }

  const handleRemoveUserFromTask = async (employeeName: string, roleId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    // Fjern personen fra widgeten straks; skrivningen sker i baggrunden, og
    // abonnementet paa 'shift-assignments' henter selv det friske billede.
    const previous = teamTasks
    setTeamTasks(prev => prev.map(entry => entry.roleId === roleId
      ? { ...entry, people: entry.people.filter(person => person.name !== employeeName) }
      : entry))
    toast.success(language === 'da' ? `${employeeName} fjernet fra opgaven` : language === 'fi' ? `${employeeName} poistettu tehtävästä` : `${employeeName} removed from task`)

    try {
      const assignments = (await window.kv.get<ShiftAssignment[]>('shift-assignments')) || []
      const matchingIds = assignments.filter(
        a => a.date === today && a.employeeName === employeeName && a.roleId === roleId
      ).map(a => a.id)
      await removeFromKvArray<ShiftAssignment>('shift-assignments', matchingIds)
    } catch (error) {
      console.error('Kunne ikke fjerne tildelingen:', error)
      setTeamTasks(previous)
      toast.error(language === 'da' ? 'Ændringen blev ikke gemt — prøv igen' : language === 'fi' ? 'Muutosta ei tallennettu — yritä uudelleen' : 'The change was not saved — please try again')
    }
  }

  type AnimationCategory = 'work' | 'social' | 'admin' | 'leisure'

  interface ModuleWithCategory extends HubModule {
    category: AnimationCategory
  }

  const modules: ModuleWithCategory[] = [
    {
      id: 'shifts',
      title: t.hub.modules.shifts,
      description: t.hub.descriptions.shifts,
      icon: <ClipboardText size={48} weight="duotone" />,
      color: 'oklch(0.42 0.19 270)',
      gradient: 'from-[oklch(0.42_0.19_270)] via-[oklch(0.50_0.16_265)] to-[oklch(0.38_0.19_272)]',
      available: true,
      category: 'work',
    },
    {
      id: 'calendar',
      title: t.hub.modules.calendar,
      description: t.hub.descriptions.calendar,
      icon: <Calendar size={48} weight="duotone" />,
      color: 'oklch(0.50 0.15 262)',
      gradient: 'from-[oklch(0.50_0.15_262)] via-[oklch(0.56_0.13_258)] to-[oklch(0.46_0.16_265)]',
      available: true,
      category: 'work',
    },
    {
      id: 'meals',
      title: t.hub.modules.meals,
      description: t.hub.descriptions.meals,
      icon: <ForkKnife size={48} weight="duotone" />,
      color: 'oklch(0.55 0.11 245)',
      gradient: 'from-[oklch(0.55_0.11_245)] via-[oklch(0.60_0.09_240)] to-[oklch(0.50_0.12_250)]',
      available: true,
      category: 'leisure',
    },
    {
      id: 'team',
      title: t.hub.modules.team,
      description: t.hub.descriptions.team,
      icon: <Users size={48} weight="duotone" />,
      color: 'oklch(0.52 0.13 252)',
      gradient: 'from-[oklch(0.52_0.13_252)] via-[oklch(0.58_0.11_248)] to-[oklch(0.47_0.14_256)]',
      available: true,
      category: 'social',
    },
    {
      id: 'email',
      title: t.hub.modules.email,
      description: t.hub.descriptions.email,
      icon: <Envelope size={48} weight="duotone" />,
      color: 'oklch(0.48 0.10 260)',
      gradient: 'from-[oklch(0.48_0.10_260)] via-[oklch(0.55_0.08_255)] to-[oklch(0.44_0.11_263)]',
      available: true,
      category: 'social',
    },
    {
      id: 'guides',
      title: t.hub.modules.guides,
      description: t.hub.descriptions.guides,
      icon: <Books size={48} weight="duotone" />,
      color: 'oklch(0.38 0.19 272)',
      gradient: 'from-[oklch(0.38_0.19_272)] via-[oklch(0.46_0.17_268)] to-[oklch(0.34_0.17_274)]',
      available: true,
      category: 'work',
    },
    {
      id: 'documents',
      title: t.hub.modules.documents,
      description: t.hub.descriptions.documents,
      icon: <FileText size={48} weight="duotone" />,
      color: 'oklch(0.50 0.09 255)',
      gradient: 'from-[oklch(0.50_0.09_255)] via-[oklch(0.56_0.07_250)] to-[oklch(0.46_0.10_258)]',
      available: false,
      category: 'work',
    },
    {
      id: 'projects',
      title: t.hub.modules.projects,
      description: t.hub.descriptions.projects,
      icon: <ListChecks size={48} weight="duotone" />,
      color: 'oklch(0.46 0.15 262)',
      gradient: 'from-[oklch(0.46_0.15_262)] via-[oklch(0.53_0.13_258)] to-[oklch(0.42_0.16_266)]',
      available: true,
      category: 'work',
    },
    {
      id: 'notebook',
      title: t.hub.modules.notebook,
      description: t.hub.descriptions.notebook,
      icon: <Notebook size={48} weight="duotone" />,
      color: 'oklch(0.53 0.12 240)',
      gradient: 'from-[oklch(0.53_0.12_240)] via-[oklch(0.58_0.10_236)] to-[oklch(0.48_0.13_244)]',
      available: true,
      category: 'work',
    },
    {
      id: 'chat',
      title: t.hub.modules.chat,
      description: t.hub.descriptions.chat,
      icon: <ChatCircle size={48} weight="duotone" />,
      color: 'oklch(0.45 0.13 268)',
      gradient: 'from-[oklch(0.45_0.13_268)] via-[oklch(0.52_0.11_263)] to-[oklch(0.41_0.14_270)]',
      available: false,
      category: 'social',
    },
    {
      id: 'games',
      title: t.hub.modules.games,
      description: t.hub.descriptions.games,
      icon: <GameController size={48} weight="duotone" />,
      color: 'oklch(0.45 0.17 278)',
      gradient: 'from-[oklch(0.45_0.17_278)] via-[oklch(0.52_0.15_272)] to-[oklch(0.41_0.17_280)]',
      available: true,
      category: 'leisure',
    },
    {
      id: 'manager',
      title: t.hub.modules.manager,
      description: isAdminOrManager ? t.hub.descriptions.manager : t.hub.descriptions.managerLocked,
      icon: <ShieldCheck size={48} weight="duotone" />,
      color: 'oklch(0.34 0.14 273)',
      gradient: 'from-[oklch(0.34_0.14_273)] via-[oklch(0.42_0.13_270)] to-[oklch(0.30_0.13_275)]',
      available: isAdminOrManager,
      category: 'admin',
    },
  ]

  const dashboardOptions: Array<{ id: DashboardWidgetId; label: string }> = [
    { id: 'teamTasks', label: t.hub.dashboard.widgets.teamTasks },
    { id: 'teamStatus', label: language === 'da' ? 'Team status i dag' : language === 'fi' ? 'Tiimin tilanne tänään' : 'Team status today' },
    { id: 'offToday', label: t.hub.dashboard.widgets.offToday },
    { id: 'todaysMeal', label: t.hub.dashboard.widgets.todaysMeal },
    { id: 'sickToday', label: t.hub.dashboard.widgets.sickToday },
    { id: 'supplyOff', label: t.hub.dashboard.widgets.supplyOff },
    { id: 'supplyHomeOffice', label: t.hub.dashboard.widgets.supplyHomeOffice },
    { id: 'supplySick', label: t.hub.dashboard.widgets.supplySick },
  ]

  const getIconAnimation = (category: AnimationCategory) => {
    switch (category) {
      case 'work':
        return {
          initial: {
            scale: 1,
            rotate: 0,
            y: 0,
          },
          hover: {
            scale: 1.15,
            rotate: [0, -5, 5, -5, 0],
            y: [-3, 0, -3],
          },
          transition: {
            duration: 0.5,
            ease: "easeInOut" as const
          }
        }
      case 'social':
        return {
          initial: {
            scale: 1,
            rotate: 0,
          },
          hover: {
            scale: [1, 1.2, 1.1],
            rotate: [0, 360],
          },
          transition: {
            duration: 0.6,
            ease: "easeInOut" as const
          }
        }
      case 'admin':
        return {
          initial: {
            scale: 1,
            rotateY: 0,
          },
          hover: {
            scale: 1.1,
            rotateY: [0, 180, 360],
          },
          transition: {
            duration: 0.7,
            ease: "easeInOut" as const
          }
        }
      case 'leisure':
        return {
          initial: {
            scale: 1,
            rotate: 0,
            y: 0,
          },
          hover: {
            scale: [1, 1.3, 1.15],
            rotate: [0, -15, 15, -10, 10, 0],
            y: [0, -8, 0],
          },
          transition: {
            duration: 0.8,
            ease: "easeInOut" as const
          }
        }
    }
  }

  const getCardAnimation = (category: AnimationCategory) => {
    switch (category) {
      case 'work':
        return {
          initial: {
            y: 0,
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
          },
          hover: {
            y: -8,
            boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.25)",
          },
          tap: { scale: 0.98 },
          transition: {
            duration: 0.3,
            ease: "easeInOut" as const
          }
        }
      case 'social':
        return {
          initial: {
            scale: 1,
            rotate: 0,
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
          },
          hover: {
            scale: 1.05,
            rotate: [0, -2, 2, 0],
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)",
          },
          tap: { scale: 0.95 },
          transition: {
            duration: 0.3,
            ease: "easeInOut" as const
          }
        }
      case 'admin':
        return {
          initial: {
            y: 0,
            x: 0,
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
          },
          hover: {
            y: -6,
            x: [0, -3, 3, 0],
            boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.25)",
          },
          tap: { scale: 0.97 },
          transition: {
            duration: 0.3,
            ease: "easeInOut" as const
          }
        }
      case 'leisure':
        return {
          initial: {
            scale: 1,
            y: 0,
            rotate: 0,
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
          },
          hover: {
            scale: 1.08,
            y: -10,
            rotate: [0, 3, -3, 0],
            boxShadow: "0 30px 60px -15px rgba(0, 0, 0, 0.35)",
          },
          tap: { scale: 0.92 },
          transition: {
            duration: 0.3,
            ease: "easeInOut" as const
          }
        }
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-6 right-6 left-6 z-20">
        <div className="hidden sm:flex flex-row items-center justify-end gap-4 pb-12">
          {onChooseAccessView && (
            <Button onClick={onChooseAccessView} size="lg" variant="outline" className="gap-2 bg-background/80">
              <UsersThree size={20} weight="duotone" />
              {language === 'da' ? 'Skift visning' : language === 'fi' ? 'Muuta näkymää' : 'Change view'}
            </Button>
          )}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
          >
            <ThemeToggle />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <LanguageToggle />
          </motion.div>
          {isAdminOrManager && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Button
                onClick={() => setShowEmailNotifications(true)}
                size="lg"
                variant="outline"
                className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold relative px-4 w-full sm:w-auto"
              >
                <Envelope size={20} weight="duotone" />
                {t.email.notifications}
                {unreadInboxCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 bg-[oklch(0.55_0.16_25)] text-white px-2 py-0.5 text-xs">
                    {unreadInboxCount}
                  </Badge>
                )}
              </Button>
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              onClick={() => setShowSickLeaveDialog(true)}
              size="lg"
              className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] hover:from-[oklch(0.38_0.19_272)] hover:to-[oklch(0.48_0.15_264)] text-white shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold w-full sm:w-auto px-6 py-3 text-base"
            >
              <FirstAidKit size={24} weight="duotone" />
              {t.shifts.sickLeave}
            </Button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
          >
            <NotificationCenter
              userEmail={userEmail}
              isAdminOrManager={isAdminOrManager}
              emails={emails}
              vacations={vacationsForBadge}
              sickLeave={sickLeaveForBadge}
              guides={guidesForAlerts}
              guideReviewRequests={guideReviewRequests}
              isGuideReviewer={isGuideReviewer}
              seenVacationRequestIds={seenVacationRequestIds}
              personalTodos={personalTodosForAlerts}
              projects={projectsForAlerts}
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <UserProfile 
              userEmail={userEmail} 
              onLogout={onLogout}
              showAdmin={isAdminOrManager}
              onAdminClick={() => onNavigate('admin')}
              showCreator={isCreator}
              onCreatorClick={() => onNavigate('creator')}
            />
          </motion.div>
        </div>

        <div className="flex sm:hidden items-center justify-between gap-2 pb-12">
          <div className="flex items-center gap-2">
            {onChooseAccessView && (
              <Button onClick={onChooseAccessView} size="lg" variant="outline" aria-label={language === 'da' ? 'Skift visning' : language === 'fi' ? 'Muuta näkymää' : 'Change view'}>
                <UsersThree size={20} weight="duotone" />
              </Button>
            )}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 }}
            >
              <ThemeToggle />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <LanguageToggle />
            </motion.div>
          </div>
          
          <div className="flex items-center gap-2">
            {isAdminOrManager && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Button
                  onClick={() => setShowEmailNotifications(true)}
                  size="lg"
                  variant="outline"
                  className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold relative px-4"
                >
                  <Envelope size={20} weight="duotone" />
                  {unreadInboxCount > 0 && (
                    <Badge className="absolute -top-2 -right-2 bg-[oklch(0.55_0.16_25)] text-white px-2 py-0.5 text-xs">
                      {unreadInboxCount}
                    </Badge>
                  )}
                </Button>
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Button
                onClick={() => setShowSickLeaveDialog(true)}
                size="lg"
                className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] hover:from-[oklch(0.38_0.19_272)] hover:to-[oklch(0.48_0.15_264)] text-white shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
              >
                <FirstAidKit size={24} weight="duotone" />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
      <SickLeaveDialog
        open={showSickLeaveDialog}
        onOpenChange={setShowSickLeaveDialog}
        userEmail={userEmail}
      />
      <EmailNotifications
        open={showEmailNotifications}
        onOpenChange={setShowEmailNotifications}
        userEmail={userEmail}
      />
      <div className="container mx-auto px-4 sm:px-6 pt-56 sm:pt-60 pb-12 sm:pb-20 max-w-7xl relative z-10">
        <motion.header 
          className="text-center mb-10 sm:mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative flex justify-center mb-6"
          >
            <img src={nexiLogo} alt="Nexi" className="relative h-10 sm:h-12 md:h-14 w-auto dark:hidden" />
            <img src={nexiLogoWhite} alt="Nexi" className="relative h-10 sm:h-12 md:h-14 w-auto hidden dark:block" />
          </motion.div>
          <motion.h1 
            className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1 mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >{teamName}</motion.h1>
        </motion.header>

        <AnnouncementsBoard userEmail={userEmail} userName={currentUserName} canPost={isAdminOrManager} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mb-10"
        >
          <div className="flex justify-end mb-4">
            <Button variant="outline" onClick={() => setShowDashboardEditor(true)} className="gap-2">
              <Gear size={18} weight="duotone" />
              {t.hub.dashboard.customize}
            </Button>
          </div>
          {dashboardWidget('teamTasks').visible && <Card className={cn("p-5 md:p-7 bg-card border-2 hover:border-primary/40 transition-all duration-300 mb-4 md:mb-6", dashboardSizeClass('teamTasks'))}>
            <div className="flex items-center gap-3 md:gap-4 mb-5 md:mb-7">
              <div className="p-2 md:p-2.5 rounded-lg bg-gradient-to-br from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)]">
                <Users size={24} weight="duotone" className="text-white md:hidden" />
                <Users size={28} weight="duotone" className="text-white hidden md:block" />
              </div>
              <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground text-center flex-1">{t.hub.overview.teamTasks || 'Team opgaver i dag'}</h3>
            </div>
            {teamTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm md:text-base text-center py-2">{t.hub.overview.noTasks}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {teamTasks.map((task, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={cn(
                      "flex flex-col gap-2 p-3 rounded-xl border-2 shadow-sm transition-all duration-300",
                      task.people.length === 0 
                        ? "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-400 dark:from-amber-950/40 dark:to-amber-900/30 dark:border-amber-600" 
                        : "bg-gradient-to-br from-card to-muted/30 border-border hover:border-primary/30 hover:shadow-md"
                    )}
                  >
                    <div className="flex items-center justify-center gap-3 pb-2 border-b-2"
                      style={{ borderColor: task.taskColor + '40' }}
                    >
                      <Badge
                        className="text-white text-xs md:text-sm font-bold px-3 py-1 shadow-sm"
                        style={{ 
                          backgroundColor: task.taskColor,
                          boxShadow: `0 2px 8px ${task.taskColor}40`
                        }}
                      >
                        {task.taskName}
                      </Badge>
                    </div>
                    {task.people.length === 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 py-1 justify-center">
                          <Warning size={16} weight="fill" />
                          <span className="text-xs md:text-sm font-semibold">{language === 'da' ? 'Ingen tildelt' : language === 'fi' ? 'Ketään ei ole määrätty.' : 'No one assigned'}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          onClick={() => {
                            setSelectedTaskForAssign({ roleId: task.roleId, roleName: task.taskName })
                            setShowQuickAssignDialog(true)
                          }}
                        >
                          <UserPlus size={14} weight="duotone" className="mr-1" />
                          {language === 'da' ? 'Tildel' : language === 'fi' ? 'Valitse' : 'Assign'}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {task.people.map((person, personIdx) => (
                          <motion.div
                            key={personIdx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 + personIdx * 0.05 }}
                            className="flex flex-col gap-1"
                          >
                            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg bg-background/60 hover:bg-background transition-colors duration-200">
                              <div 
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                                style={{ backgroundColor: task.taskColor }}
                              >
                                {person.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-xs md:text-sm text-foreground font-semibold flex-1 min-w-0 break-words leading-tight">{person.name}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 flex-shrink-0 hover:bg-primary/20 hover:text-primary"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedUserForComment({ name: person.name, roleId: task.roleId, currentComment: person.comment })
                                  setNewComment(person.comment || '')
                                  setShowCommentDialog(true)
                                }}
                                title={language === 'da' ? 'Tilføj kommentar' : language === 'fi' ? 'Lisää kommentti' : 'Add comment'}
                              >
                                <PencilSimple size={14} weight="bold" />
                              </Button>
                              {person.comment && (
                                <ChatText size={14} weight="fill" className="text-primary flex-shrink-0" />
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 flex-shrink-0 hover:bg-destructive/20 hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemoveUserFromTask(person.name, task.roleId)
                                }}
                              >
                                <X size={14} weight="bold" />
                              </Button>
                            </div>
                            {person.comment && (
                              <div className="ml-8 px-2 py-1 rounded bg-muted text-xs text-muted-foreground italic">
                                {person.comment}
                              </div>
                            )}
                          </motion.div>
                        ))}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          onClick={() => {
                            setSelectedTaskForAssign({ roleId: task.roleId, roleName: task.taskName })
                            setShowQuickAssignDialog(true)
                          }}
                        >
                          <UserPlus size={14} weight="duotone" className="mr-1" />
                          {language === 'da' ? 'Tilføj' : language === 'fi' ? 'Lisää' : 'Add'}
                        </Button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </Card>}

          {dashboardWidget('teamStatus').visible && <Card className={cn("p-5 md:p-7 bg-card border-2 hover:border-primary/40 transition-all duration-300 mb-4 md:mb-6", dashboardSizeClass('teamStatus'))}>
            <div className="flex items-center gap-3 md:gap-4 mb-5 md:mb-7">
              <div className="p-2 md:p-2.5 rounded-lg bg-gradient-to-br from-[oklch(0.50_0.15_262)] to-[oklch(0.58_0.12_255)]">
                <UsersThree size={24} weight="duotone" className="text-white md:hidden" />
                <UsersThree size={28} weight="duotone" className="text-white hidden md:block" />
              </div>
              <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground text-center flex-1">
                {language === 'da' ? 'Team status i dag' : language === 'fi' ? 'Tiimin tilanne tänään' : 'Team status today'}
              </h3>
            </div>
            {teamStatusRows.length === 0 ? (
              <p className="text-muted-foreground text-sm md:text-base text-center py-2">
                {language === 'da' ? 'Ingen brugere fundet' : language === 'fi' ? 'Ei käyttäjiä' : 'No users found'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {teamStatusRows.map((row) => {
                  const color = getEmployeeColorByEmail(row.email, colorOverrides)
                  const comments = row.tasks.filter((tk) => tk.comment && tk.comment.trim())
                  const todayStr = format(new Date(), 'yyyy-MM-dd')
                  const userNote = row.status === 'available' ? (teamStatusNotes?.[`${todayStr}|${row.email}`] || '') : ''
                  return (
                    <motion.div
                      key={row.email}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-2 p-3 rounded-xl border-2 border-border bg-gradient-to-br from-card to-muted/30 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: color.bg, color: color.text }}
                        >
                          {row.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-foreground flex-1 min-w-0 break-words leading-tight">{row.name}</span>
                        {row.status === 'working' && row.tasks.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 flex-shrink-0 hover:bg-primary/20 hover:text-primary"
                            title={language === 'da' ? 'Tilføj/rediger kommentar' : language === 'fi' ? 'Lisää/muokkaa kommenttia' : 'Add/edit comment'}
                            onClick={() => {
                              const tk = row.tasks[0]
                              setSelectedUserForComment({ name: row.name, roleId: tk.roleId, currentComment: tk.comment })
                              setNewComment(tk.comment || '')
                              setShowCommentDialog(true)
                            }}
                          >
                            <PencilSimple size={14} weight="bold" />
                          </Button>
                        )}
                        {row.status === 'vacation' && (
                          <Badge className="bg-[oklch(0.52_0.11_255)] text-white text-[10px] gap-1">
                            <Calendar size={12} weight="fill" />
                            {language === 'da' ? 'Ferie' : language === 'fi' ? 'Loma' : 'Vacation'}
                          </Badge>
                        )}
                        {row.status === 'sick' && (
                          <Badge className="bg-[oklch(0.55_0.16_25)] text-white text-[10px] gap-1">
                            <FirstAidKit size={12} weight="fill" />
                            {language === 'da' ? 'Syg' : language === 'fi' ? 'Sairas' : 'Sick'}
                          </Badge>
                        )}
                        {row.status === 'available' && (
                          <>
                            <Badge variant="secondary" className="text-[10px]">
                              {language === 'da' ? 'Ingen opgave' : language === 'fi' ? 'Ei tehtävää' : 'No task'}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 flex-shrink-0 hover:bg-primary/20 hover:text-primary"
                              title={language === 'da' ? 'Tilføj/rediger kommentar' : language === 'fi' ? 'Lisää/muokkaa kommenttia' : 'Add/edit comment'}
                              onClick={() => {
                                setSelectedUserForComment({ name: row.name, roleId: '', currentComment: userNote, email: row.email })
                                setNewComment(userNote)
                                setShowCommentDialog(true)
                              }}
                            >
                              <PencilSimple size={14} weight="bold" />
                            </Button>
                          </>
                        )}
                      </div>
                      {row.status === 'working' && row.tasks.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {row.tasks.map((tk, i) => (
                            <Badge key={i} className="text-white text-[10px] font-bold" style={{ backgroundColor: tk.taskColor }}>
                              {tk.taskName}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {comments.map((tk, i) => (
                        <div key={`comment-${i}`} className="flex items-start gap-1.5 px-2 py-1 rounded bg-muted text-xs text-muted-foreground italic">
                          <ChatText size={13} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />
                          <span className="break-words">{tk.comment}</span>
                        </div>
                      ))}
                      {userNote && (
                        <div className="flex items-start gap-1.5 px-2 py-1 rounded bg-muted text-xs text-muted-foreground italic">
                          <ChatText size={13} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />
                          <span className="break-words">{userNote}</span>
                        </div>
                      )}
                      {(row.status === 'working' || row.status === 'available') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs mt-0.5"
                          onClick={() => {
                            setWidgetAssignUser({ email: row.email, name: row.name })
                            setWidgetAssignRoleId('')
                            setShowWidgetAssignDialog(true)
                          }}
                        >
                          <UserPlus size={14} weight="duotone" className="mr-1" />
                          {language === 'da' ? 'Tilføj opgave' : language === 'fi' ? 'Lisää tehtävä' : 'Add task'}
                        </Button>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            )}
          </Card>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {dashboardWidget('offToday').visible && <Card className={cn("p-4 md:p-6 bg-card border-2 hover:border-primary/40 transition-all duration-300", dashboardSizeClass('offToday'))}>
              <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-4">
                <div className="p-1.5 md:p-2 rounded-lg bg-gradient-to-br from-[oklch(0.50_0.15_262)] to-[oklch(0.58_0.12_255)]">
                  <Calendar size={20} weight="duotone" className="text-white md:hidden" />
                  <Calendar size={24} weight="duotone" className="text-white hidden md:block" />
                </div>
                <h3 className="text-base md:text-lg font-semibold text-foreground">{t.hub.overview.offToday}</h3>
              </div>
              {peopleOff.length === 0 ? (
                <p className="text-muted-foreground text-xs md:text-sm text-center py-1">{t.hub.overview.noOneOff}</p>
              ) : (
                <div className="flex flex-col gap-1.5 md:gap-2 items-center">
                  {peopleOff.map((person, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <User size={14} className="text-muted-foreground md:hidden" />
                      <User size={16} className="text-muted-foreground hidden md:block" />
                      <span className="text-xs md:text-sm text-foreground">{person.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>}

            {dashboardWidget('todaysMeal').visible && <Card className={cn("p-4 md:p-6 bg-card border-2 hover:border-primary/40 transition-all duration-300", dashboardSizeClass('todaysMeal'))}>
              <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-4">
                <div className="p-1.5 md:p-2 rounded-lg bg-gradient-to-br from-[oklch(0.55_0.11_245)] to-[oklch(0.60_0.09_240)]">
                  <ForkKnife size={20} weight="duotone" className="text-white md:hidden" />
                  <ForkKnife size={24} weight="duotone" className="text-white hidden md:block" />
                </div>
                <h3 className="text-base md:text-lg font-semibold text-foreground">{t.hub.overview.todaysMeal}</h3>
              </div>
              {!todaysMeal ? (
                <p className="text-muted-foreground text-xs md:text-sm text-center py-1">{t.hub.overview.noMeal}</p>
              ) : (
                <p className="text-xs md:text-sm text-foreground leading-relaxed break-words overflow-wrap-anywhere text-center">{todaysMeal}</p>
              )}
            </Card>}

            {dashboardWidget('sickToday').visible && <Card className={cn("p-4 md:p-6 bg-card border-2 hover:border-primary/40 transition-all duration-300", dashboardSizeClass('sickToday'))}>
              <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-4">
                <div className="p-1.5 md:p-2 rounded-lg bg-gradient-to-br from-[oklch(0.55_0.16_25)] to-[oklch(0.60_0.13_30)]">
                  <FirstAidKit size={20} weight="duotone" className="text-white md:hidden" />
                  <FirstAidKit size={24} weight="duotone" className="text-white hidden md:block" />
                </div>
                <h3 className="text-base md:text-lg font-semibold text-foreground">{t.hub.overview.sickToday}</h3>
              </div>
              {peopleSick.length === 0 ? (
                <p className="text-muted-foreground text-xs md:text-sm text-center py-1">{t.hub.overview.noOneSick}</p>
              ) : (
                <div className="flex flex-col gap-1.5 md:gap-2 items-center">
                  {peopleSick.map((person, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <User size={14} className="text-muted-foreground md:hidden" />
                      <User size={16} className="text-muted-foreground hidden md:block" />
                      <span className="text-xs md:text-sm text-foreground">{person}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>}
          </div>

          {hasOtherTeams && (dashboardWidget('supplyOff').visible || dashboardWidget('supplyHomeOffice').visible || dashboardWidget('supplySick').visible) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-4 md:mt-6">
              {dashboardWidget('supplyOff').visible && <Card className={cn("p-4 md:p-6 bg-card border-2 hover:border-primary/40 transition-all duration-300", dashboardSizeClass('supplyOff'))}>
                <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-4">
                  <div className="p-1.5 md:p-2 rounded-lg bg-gradient-to-br from-[oklch(0.52_0.13_252)] to-[oklch(0.58_0.11_248)]">
                    <Buildings size={20} weight="duotone" className="text-white md:hidden" />
                    <Buildings size={24} weight="duotone" className="text-white hidden md:block" />
                  </div>
                  <h3 className="text-base md:text-lg font-semibold text-foreground">{t.hub.overview.offInSupplyChain}</h3>
                </div>
                {otherTeamsOff.length === 0 ? (
                  <p className="text-muted-foreground text-xs md:text-sm text-center py-1">{t.hub.overview.noOneOffSupplyChain}</p>
                ) : (
                  <div className="flex flex-col gap-1.5 md:gap-2 items-center">
                    {otherTeamsOff.map((person, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <User size={14} className="text-muted-foreground md:hidden" />
                        <User size={16} className="text-muted-foreground hidden md:block" />
                        <span className="text-xs md:text-sm text-foreground">{person.name} <span className="text-muted-foreground">({person.teamCode})</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>}

              {dashboardWidget('supplyHomeOffice').visible && <Card className={cn("p-4 md:p-6 bg-card border-2 hover:border-primary/40 transition-all duration-300", dashboardSizeClass('supplyHomeOffice'))}>
                <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-4">
                  <div className="p-1.5 md:p-2 rounded-lg bg-gradient-to-br from-[oklch(0.55_0.11_245)] to-[oklch(0.60_0.09_240)]">
                    <House size={20} weight="duotone" className="text-white md:hidden" />
                    <House size={24} weight="duotone" className="text-white hidden md:block" />
                  </div>
                  <h3 className="text-base md:text-lg font-semibold text-foreground">{t.hub.overview.homeOfficeInSupplyChain}</h3>
                </div>
                {otherTeamsHomeOffice.length === 0 ? (
                  <p className="text-muted-foreground text-xs md:text-sm text-center py-1">{t.hub.overview.noOneHomeOfficeSupplyChain}</p>
                ) : (
                  <div className="flex flex-col gap-1.5 md:gap-2 items-center">
                    {otherTeamsHomeOffice.map((person, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <User size={14} className="text-muted-foreground md:hidden" />
                        <User size={16} className="text-muted-foreground hidden md:block" />
                        <span className="text-xs md:text-sm text-foreground">{person.name} <span className="text-muted-foreground">({person.teamCode})</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>}

              {dashboardWidget('supplySick').visible && <Card className={cn("p-4 md:p-6 bg-card border-2 hover:border-primary/40 transition-all duration-300", dashboardSizeClass('supplySick'))}>
                <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-4">
                  <div className="p-1.5 md:p-2 rounded-lg bg-gradient-to-br from-[oklch(0.55_0.16_25)] to-[oklch(0.60_0.13_30)]">
                    <Buildings size={20} weight="duotone" className="text-white md:hidden" />
                    <Buildings size={24} weight="duotone" className="text-white hidden md:block" />
                  </div>
                  <h3 className="text-base md:text-lg font-semibold text-foreground">{t.hub.overview.sickInSupplyChain}</h3>
                </div>
                {otherTeamsSick.length === 0 ? (
                  <p className="text-muted-foreground text-xs md:text-sm text-center py-1">{t.hub.overview.noOneSickSupplyChain}</p>
                ) : (
                  <div className="flex flex-col gap-1.5 md:gap-2 items-center">
                    {otherTeamsSick.map((person, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <User size={14} className="text-muted-foreground md:hidden" />
                        <User size={16} className="text-muted-foreground hidden md:block" />
                        <span className="text-xs md:text-sm text-foreground">{person.name} <span className="text-muted-foreground">({person.teamCode})</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>}
            </div>
          )}
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          {modules.filter(module => module.available).map((module, index) => {
            const cardAnimation = getCardAnimation(module.category)
            const iconAnimation = getIconAnimation(module.category)
            
            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.05, duration: 0.4 }}
              >
                <motion.div
                  initial={cardAnimation.initial}
                  whileHover={cardAnimation.hover}
                  whileTap={cardAnimation.tap}
                  transition={cardAnimation.transition}
                >
                  <Card
                    className="relative overflow-hidden border-2 transition-all duration-300 group h-full min-h-[180px] sm:min-h-[220px] flex flex-col cursor-pointer hover:border-primary/40"
                    onClick={() => handleModuleClick(module.id)}
                  >
                    {module.id === 'email' && unreadInboxCount > 0 && (
                      <Badge className="absolute top-4 right-4 md:top-5 md:right-5 z-10 bg-[oklch(0.55_0.16_25)] text-white px-3 py-1.5 md:px-4 md:py-2 text-xs max-w-[calc(100%-2rem)] text-center whitespace-nowrap">
                        {unreadInboxCount} {unreadInboxCount > 1 ? t.hub.newMessagesPlural : t.hub.newMessages}
                      </Badge>
                    )}
                    {module.id === 'manager' && pendingVacationRequests > 0 && (
                      <Badge className="absolute top-4 right-4 md:top-5 md:right-5 z-10 bg-[oklch(0.55_0.16_25)] text-white px-3 py-1.5 md:px-4 md:py-2 text-xs max-w-[calc(100%-2rem)] text-center whitespace-nowrap">
                        {pendingVacationRequests} {pendingVacationRequests > 1 ? (language === 'da' ? 'anmodninger' : language === 'fi' ? 'pyynnöt' : 'requests') : (language === 'da' ? 'anmodning' : language === 'fi' ? 'pyyntö' : 'request')}
                      </Badge>
                    )}
                    {module.id === 'guides' && pendingGuideReviews > 0 && (
                      <Badge className="absolute top-4 right-4 md:top-5 md:right-5 z-10 bg-amber-600 text-white px-3 py-1.5 md:px-4 md:py-2 text-xs max-w-[calc(100%-2rem)] text-center whitespace-nowrap">
                        {pendingGuideReviews} {pendingGuideReviews === 1 ? (language === 'da' ? 'guide til review' : language === 'fi' ? 'opas tarkistettavana' : 'guide to review') : (language === 'da' ? 'guides til review' : language === 'fi' ? 'opasta tarkistettavana' : 'guides to review')}
                      </Badge>
                    )}
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-br"
                      style={{
                        background: `radial-gradient(circle at top right, ${module.color}25, transparent)`
                      }}
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                    
                    <div className="relative p-4 md:p-6 flex flex-col flex-1">
                      <motion.div 
                        className={cn(
                          "mb-3 md:mb-4 inline-flex items-center justify-center rounded-2xl p-2 md:p-3 shadow-lg group-hover:shadow-xl transition-shadow duration-300",
                          `bg-gradient-to-br ${module.gradient}`
                        )}
                        style={{ color: 'white' }}
                        initial={iconAnimation.initial}
                        whileHover={iconAnimation.hover}
                        transition={iconAnimation.transition}
                      >
                        <div className="[&>svg]:w-8 [&>svg]:h-8 md:[&>svg]:w-12 md:[&>svg]:h-12">
                          {module.icon}
                        </div>
                      </motion.div>

                      <h3 className="text-sm sm:text-base md:text-lg font-bold mb-1.5 md:mb-2 text-foreground text-center">
                        {module.title}
                      </h3>
                      
                      <p className="text-muted-foreground text-xs leading-relaxed mb-3 md:mb-4 flex-1 min-h-[2.5rem] line-clamp-2">
                        {module.description}
                      </p>
                    </div>
                  </Card>
                </motion.div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      {appVersion && (
        <div className="fixed bottom-3 left-3 z-10 text-[11px] font-medium text-muted-foreground/50 select-none pointer-events-none">
          v{appVersion}
        </div>
      )}

      <GuideReviewAlert onOpenGuideLibrary={() => onNavigate('guides')} guides={guidesForAlerts} userEmail={userEmail} />

      <Dialog open={showDashboardEditor} onOpenChange={setShowDashboardEditor}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.hub.dashboard.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t.hub.dashboard.description}</p>
          <div className="space-y-3 py-3">
            {dashboardOptions.map((widget) => {
              const settings = dashboardWidget(widget.id)
              return (
                <div key={widget.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4">
                  <label htmlFor={`dashboard-${widget.id}`} className="font-medium cursor-pointer">{widget.label}</label>
                  <div className="flex items-center gap-3">
                    <Select value={settings.size} onValueChange={(value) => updateDashboardWidget(widget.id, { size: value as DashboardWidgetSize })} disabled={!settings.visible}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compact">{t.hub.dashboard.sizes.compact}</SelectItem>
                        <SelectItem value="standard">{t.hub.dashboard.sizes.standard}</SelectItem>
                        <SelectItem value="large">{t.hub.dashboard.sizes.large}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch id={`dashboard-${widget.id}`} checked={settings.visible} onCheckedChange={(checked) => updateDashboardWidget(widget.id, { visible: checked })} />
                  </div>
                </div>
              )
            })}
          </div>
          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES)}>{t.hub.dashboard.reset}</Button>
            <Button onClick={() => setShowDashboardEditor(false)}>{t.hub.dashboard.done}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuickAssignDialog} onOpenChange={setShowQuickAssignDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-bold text-center">
              {language === 'da' ? 'Tildel opgave' : language === 'fi' ? 'Määrittele tehtävä' : 'Assign task'}
              {selectedTaskForAssign && (
                <span className="block text-sm text-muted-foreground font-normal mt-1">
                  {selectedTaskForAssign.roleName}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="employee-select">
                {language === 'da' ? 'Vælg medarbejder' : language === 'fi' ? 'Valitse työntekijä' : 'Select employee'}
              </Label>
              <Select value={selectedEmployeeForAssign} onValueChange={setSelectedEmployeeForAssign}>
                <SelectTrigger id="employee-select">
                  <SelectValue placeholder={language === 'da' ? 'Vælg medarbejder...' : language === 'fi' ? 'Valitse työntekijä...' : 'Select employee...'} />
                </SelectTrigger>
                <SelectContent>
                  {allEmployees.map((employee) => (
                    <SelectItem key={employee.email} value={employee.email}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickAssignDialog(false)}>
              {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : 'Cancel'}
            </Button>
            <Button
              onClick={() => handleQuickAssign()}
              className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] text-white"
            >
              {language === 'da' ? 'Tildel' : language === 'fi' ? 'Valitse' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWidgetAssignDialog} onOpenChange={setShowWidgetAssignDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-bold text-center">
              {language === 'da' ? 'Tilføj opgave' : language === 'fi' ? 'Lisää tehtävä' : 'Add task'}
              {widgetAssignUser && (
                <span className="block text-sm text-muted-foreground font-normal mt-1">{widgetAssignUser.name}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="widget-role-select">{language === 'da' ? 'Vælg opgave' : language === 'fi' ? 'Valitse tehtävä' : 'Select task'}</Label>
              <Select value={widgetAssignRoleId} onValueChange={setWidgetAssignRoleId}>
                <SelectTrigger id="widget-role-select">
                  <SelectValue placeholder={language === 'da' ? 'Vælg opgave...' : language === 'fi' ? 'Valitse tehtävä...' : 'Select task...'} />
                </SelectTrigger>
                <SelectContent>
                  {(teamTasks || []).map((tk) => (
                    <SelectItem key={tk.roleId} value={tk.roleId}>{tk.taskName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWidgetAssignDialog(false)}>
              {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : 'Cancel'}
            </Button>
            <Button
              onClick={handleWidgetAssign}
              disabled={!widgetAssignRoleId}
              className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] text-white"
            >
              {language === 'da' ? 'Tildel' : language === 'fi' ? 'Valitse' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-bold text-center">
              {language === 'da' ? 'Tilføj eller rediger kommentar' : language === 'fi' ? 'Lisää tai muokkaa kommenttia' : 'Add or edit comment'}
              {selectedUserForComment && (
                <span className="block text-sm text-muted-foreground font-normal mt-1">
                  {selectedUserForComment.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="comment-text">
                {language === 'da' ? 'Kommentar' : language === 'fi' ? 'Huomautus' : 'Comment'}
              </Label>
              <Textarea
                id="comment-text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={language === 'da' ? 'Skriv en kommentar...' : language === 'fi' ? 'Kirjoita kommentti...' : 'Write a comment...'}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {language === 'da' 
                  ? 'Tilføj information som fx "går tidligt" eller "kommer sent"' 
                  : language === 'fi' ? 'Lisää tietoa, kuten "lähteminen aikaisin" tai "meneminen myöhään"' : 'Add information like "leaving early" or "arriving late"'
                }
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCommentDialog(false)
              setSelectedUserForComment(null)
              setNewComment('')
            }}>
              {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : 'Cancel'}
            </Button>
            <Button
              onClick={handleAddOrUpdateComment}
              className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] text-white"
            >
              {language === 'da' ? 'Gem' : language === 'fi' ? 'Tallenna' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
