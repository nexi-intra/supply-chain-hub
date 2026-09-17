import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import {
  ArrowClockwise, ArrowLeft, Books, Buildings, CalendarBlank, ClipboardText, Eye,
  FirstAidKit, House, MagnifyingGlass, User, Users, UsersThree,
} from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserProfile } from '@/components/UserProfile'
import { GuideViewer } from '@/components/GuideViewer'
import { CommandPalette, type CommandPaletteModule } from '@/components/CommandPalette'
import { ObserverVacationCalendar } from '@/components/ObserverVacationCalendar'
import { useLanguage } from '@/contexts/LanguageContext'
import { getHomeOfficeUsersForDate } from '@/lib/homeOffice'
import { guideExcerpt, guidePlainText } from '@/lib/guideTypes'
import { isAnyModalOpen } from '@/lib/modalStack'
import nexiLogo from '@/assets/images/nexi-logo.svg'
import nexiLogoWhite from '@/assets/images/nexi-logo-white.svg'
import type { AccessView, RegisteredTeam } from '@/lib/electronRegistryBridge'
import type { Guide } from '@/lib/guideTypes'
import type { BirthdayEntry, HomeOfficeException, HomeOfficePattern, ShiftAssignment, ShiftRole, SickLeaveEntry, VacationEntry } from '@/lib/types'

type ObserverUser = { email?: string; fullName?: string; phone?: string; role?: string; status?: string }
type ObserverModule = 'hub' | 'vacation' | 'shifts' | 'people' | 'guides'

interface ObserverTeamData {
  team: RegisteredTeam
  users: Record<string, ObserverUser>
  vacations: VacationEntry[]
  sickLeave: SickLeaveEntry[]
  patterns: Record<string, HomeOfficePattern>
  exceptions: HomeOfficeException[]
  roles: ShiftRole[]
  assignments: ShiftAssignment[]
  guides: Guide[]
  birthdays: BirthdayEntry[]
}

interface ObserverWorkspaceProps {
  userEmail: string
  view: AccessView
  allTeams: RegisteredTeam[]
  onChangeView: () => void
  onLogout: () => void
}

function isActiveRange(startDate: string, endDate: string | undefined, dateKey: string) {
  return startDate.slice(0, 10) <= dateKey && (endDate || startDate).slice(0, 10) >= dateKey
}

function personName(team: ObserverTeamData, email: string, fallback?: string) {
  return team.users[email]?.fullName || fallback || email
}

export function ObserverWorkspace({ userEmail, view, allTeams, onChangeView, onLogout }: ObserverWorkspaceProps) {
  const { language } = useLanguage()
  const da = language === 'da'
  const fi = language === 'fi'
  const [activeModule, setActiveModule] = useState<ObserverModule>('hub')
  const [selectedTeamId, setSelectedTeamId] = useState('all')
  const [teamData, setTeamData] = useState<ObserverTeamData[]>([])
  const [sharedGuides, setSharedGuides] = useState<Guide[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    if (!window.electronRegistry) return
    setIsLoading(true)
    setError('')
    try {
      const [loaded, platformSharedGuides] = await Promise.all([
        Promise.all(view.teamIds.map(async (teamId) => {
        const team = allTeams.find((candidate) => candidate.teamId === teamId)
        if (!team) throw new Error(`Team ${teamId} findes ikke`)
        const [users, vacations, sickLeave, patterns, exceptions, roles, assignments, guides, birthdays] = await Promise.all([
          window.electronRegistry!.readAccessViewKey<Record<string, ObserverUser>>(userEmail, view.viewId, teamId, 'users'),
          window.electronRegistry!.readAccessViewKey<VacationEntry[]>(userEmail, view.viewId, teamId, 'vacation-entries'),
          window.electronRegistry!.readAccessViewKey<SickLeaveEntry[]>(userEmail, view.viewId, teamId, 'sick-leave-entries'),
          window.electronRegistry!.readAccessViewKey<Record<string, HomeOfficePattern>>(userEmail, view.viewId, teamId, 'home-office-patterns'),
          window.electronRegistry!.readAccessViewKey<HomeOfficeException[]>(userEmail, view.viewId, teamId, 'home-office-exceptions'),
          window.electronRegistry!.readAccessViewKey<ShiftRole[]>(userEmail, view.viewId, teamId, 'shift-roles'),
          window.electronRegistry!.readAccessViewKey<ShiftAssignment[]>(userEmail, view.viewId, teamId, 'shift-assignments'),
          window.electronRegistry!.readAccessViewKey<Guide[]>(userEmail, view.viewId, teamId, 'guides'),
          window.electronRegistry!.readAccessViewKey<BirthdayEntry[]>(userEmail, view.viewId, teamId, 'employee-birthdays'),
        ])
        return {
          team,
          users: users || {},
          vacations: vacations || [],
          sickLeave: sickLeave || [],
          patterns: patterns || {},
          exceptions: exceptions || [],
          roles: roles || [],
          assignments: assignments || [],
          guides: guides || [],
          birthdays: birthdays || [],
        }
        })),
        window.kv.get<Guide[]>('shared-guides'),
      ])
      setTeamData(loaded)
      setSharedGuides(platformSharedGuides || [])
    } catch (loadError) {
      console.error('Kunne ikke indlæse samlehub:', loadError)
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setActiveModule('hub')
    setSelectedTeamId('all')
    load()
  }, [view.viewId, userEmail])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || activeModule === 'hub' || isAnyModalOpen()) return
      event.preventDefault()
      setActiveModule('hub')
    }

    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [activeModule])

  const visibleTeams = useMemo(
    () => selectedTeamId === 'all' ? teamData : teamData.filter((entry) => entry.team.teamId === selectedTeamId),
    [selectedTeamId, teamData]
  )
  const todayKey = format(new Date(), 'yyyy-MM-dd')

  const people = visibleTeams.flatMap((entry) => Object.entries(entry.users)
    .filter(([, user]) => user.status !== 'rejected')
    .map(([email, user]) => ({ team: entry.team, email, name: user.fullName || email, role: user.role })))
  const vacations = visibleTeams.flatMap((entry) => entry.vacations
    .filter((vacation) => vacation.status !== 'rejected')
    .map((vacation) => ({ ...vacation, team: entry.team, name: personName(entry, vacation.userEmail) })))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  const activeVacations = vacations.filter((vacation) => vacation.status === 'approved' && isActiveRange(vacation.startDate, vacation.endDate, todayKey))
  const activeSick = visibleTeams.flatMap((entry) => entry.sickLeave
    .filter((sick) => sick.status === 'approved' && isActiveRange(sick.startDate, sick.endDate, todayKey))
    .map((sick) => ({ ...sick, team: entry.team, name: personName(entry, sick.userEmail, sick.userName) })))
  const homeOffice = visibleTeams.flatMap((entry) => {
    const activeEmails = Object.entries(entry.users)
      .filter(([, user]) => user.status !== 'rejected')
      .map(([email]) => email)
    return getHomeOfficeUsersForDate(activeEmails, new Date(), entry.patterns, entry.exceptions)
      .map((email) => ({ team: entry.team, email, name: personName(entry, email) }))
  })
  const todaysAssignments = visibleTeams.flatMap((entry) => entry.assignments
    .filter((assignment) => assignment.date.slice(0, 10) === todayKey)
    .map((assignment) => ({
      ...assignment,
      team: entry.team,
      roleName: entry.roles.find((role) => role.id === assignment.roleId)?.name || assignment.roleId,
      roleColor: entry.roles.find((role) => role.id === assignment.roleId)?.color || 'oklch(0.42 0.19 270)',
    })))
  const unavailableToday = new Set([
    ...activeVacations.map((entry) => `${entry.team.teamId}:${entry.userEmail}`),
    ...activeSick.map((entry) => `${entry.team.teamId}:${entry.userEmail}`),
  ])
  const taskGroups = visibleTeams.flatMap((entry) => entry.roles.map((role) => ({
    team: entry.team,
    role,
    people: entry.assignments.filter((assignment) => {
      if (assignment.date.slice(0, 10) !== todayKey || assignment.roleId !== role.id) return false
      const employeeEmail = assignment.employeeId || Object.keys(entry.users)
        .find((email) => entry.users[email]?.fullName === assignment.employeeName) || ''
      return !unavailableToday.has(`${entry.team.teamId}:${employeeEmail}`)
    }),
  })))
  const observerGuides = useMemo(() => {
    const byGuideId = new Map<string, { guide: Guide; teams: RegisteredTeam[] }>()
    for (const entry of visibleTeams) {
      for (const guide of entry.guides) {
        const existing = byGuideId.get(guide.id)
        if (existing) existing.teams.push(entry.team)
        else byGuideId.set(guide.id, { guide, teams: [entry.team] })
      }
    }
    for (const guide of sharedGuides) {
      const guideTeams = visibleTeams
        .filter((entry) => guide.sharedWithTeamCodes?.includes(entry.team.folderName))
        .map((entry) => entry.team)
      if (guideTeams.length === 0) continue
      const existing = byGuideId.get(guide.id)
      if (existing) {
        for (const team of guideTeams) {
          if (!existing.teams.some((item) => item.teamId === team.teamId)) existing.teams.push(team)
        }
      } else {
        byGuideId.set(guide.id, { guide, teams: guideTeams })
      }
    }
    return Array.from(byGuideId.values()).sort((a, b) => a.guide.title.localeCompare(b.guide.title))
  }, [visibleTeams, sharedGuides])

  const teamBadge = (team: RegisteredTeam) => <Badge variant="outline">{team.abbreviation || team.teamId}</Badge>
  const modules = [
    {
      id: 'vacation' as const,
      title: da ? 'Ferieoversigt' : fi ? 'Lomakatsaus' : 'Vacation overview',
      description: da ? 'Se ferie og fravær på tværs af de valgte teams' : fi ? 'Näytä valittujen tiimien lomat ja poissaolot' : 'View vacation and absence across the selected teams',
      icon: CalendarBlank,
      color: 'oklch(0.50 0.15 262)',
      gradient: 'from-[oklch(0.50_0.15_262)] via-[oklch(0.56_0.13_258)] to-[oklch(0.46_0.16_265)]',
    },
    {
      id: 'shifts' as const,
      title: da ? 'Vagtplan' : fi ? 'Vuorosuunnitelma' : 'Shift schedule',
      description: da ? 'Se dagens opgaver og bemanding fra alle teams i hubben' : fi ? 'Näytä hubin kaikkien tiimien päivän tehtävät ja miehitys' : "View today's tasks and staffing from every team in the hub",
      icon: ClipboardText,
      color: 'oklch(0.42 0.19 270)',
      gradient: 'from-[oklch(0.42_0.19_270)] via-[oklch(0.50_0.16_265)] to-[oklch(0.38_0.19_272)]',
    },
    {
      id: 'guides' as const,
      title: da ? 'Guidebibliotek' : fi ? 'Opaskirjasto' : 'Guide library',
      description: da ? 'Læs guides og procedurer fra alle teams i hubben' : fi ? 'Lue hubin kaikkien tiimien oppaita ja ohjeita' : 'Read guides and procedures from every team in the hub',
      icon: Books,
      color: 'oklch(0.38 0.19 272)',
      gradient: 'from-[oklch(0.38_0.19_272)] via-[oklch(0.46_0.17_268)] to-[oklch(0.34_0.17_274)]',
    },
    {
      id: 'people' as const,
      title: da ? 'Teamoversigt' : fi ? 'Ryhmän yleiskatsaus' : 'Team overview',
      description: da ? 'Se kontaktoplysninger og teamtilhørsforhold' : fi ? 'Näytä yhteystiedot ja ryhmän jäsenyys' : 'View contact information and team membership',
      icon: Users,
      color: 'oklch(0.52 0.13 252)',
      gradient: 'from-[oklch(0.52_0.13_252)] via-[oklch(0.58_0.11_248)] to-[oklch(0.47_0.14_256)]',
    },
  ]
  const commandModules: CommandPaletteModule[] = [
    { id: 'hub', icon: House, label: da ? 'Forside' : fi ? 'Alkuun' : 'Home' },
    ...modules.map((module) => ({ id: module.id, icon: module.icon, label: module.title })),
    { id: 'change-hub', icon: UsersThree, label: da ? 'Skift hub' : fi ? 'Vaihda hubia' : 'Change hub' },
  ]

  const handleCommandNavigation = (destination: string) => {
    if (destination === 'change-hub') {
      onChangeView()
      return
    }
    if (destination === 'hub' || modules.some((module) => module.id === destination)) {
      setActiveModule(destination as ObserverModule)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <CommandPalette
        userEmail={userEmail}
        modulesOverride={commandModules}
        onNavigateOverride={handleCommandNavigation}
      />
      <div className="absolute top-6 right-6 left-6 z-20">
        <div className="hidden sm:flex items-center justify-end gap-3 pb-12">
          <Badge variant="secondary" className="h-10 px-4 gap-2 text-sm"><Eye size={18} />{da ? 'Kun læsning' : fi ? 'Vain luku' : 'Read only'}</Badge>
          <Button onClick={onChangeView} size="lg" variant="outline" className="gap-2 bg-background/80">
            <UsersThree size={20} weight="duotone" />{da ? 'Skift hub' : fi ? 'Vaihda hubia' : 'Change hub'}
          </Button>
          <ThemeToggle />
          <LanguageToggle />
          <UserProfile userEmail={userEmail} onLogout={onLogout} />
        </div>
        <div className="flex sm:hidden items-center justify-between gap-2 pb-12">
          <div className="flex items-center gap-2">
            <Button onClick={onChangeView} size="lg" variant="outline" aria-label={da ? 'Skift hub' : fi ? 'Vaihda hubia' : 'Change hub'}>
              <UsersThree size={20} weight="duotone" />
            </Button>
            <ThemeToggle />
            <LanguageToggle />
          </div>
          <UserProfile userEmail={userEmail} onLogout={onLogout} hideEmail />
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 pt-44 sm:pt-48 pb-12 sm:pb-20 max-w-7xl relative z-10">
        <motion.header className="text-center mb-10 sm:mb-12" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }} className="relative flex justify-center mb-6">
            <img src={nexiLogo} alt="Nexi" className="relative h-10 sm:h-12 md:h-14 w-auto dark:hidden" />
            <img src={nexiLogoWhite} alt="Nexi" className="relative h-10 sm:h-12 md:h-14 w-auto hidden dark:block" />
          </motion.div>
          <motion.h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1 mb-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
            {view.name}
          </motion.h1>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {teamData.map((entry) => <span key={entry.team.teamId}>{teamBadge(entry.team)}</span>)}
            <Badge variant="secondary" className="gap-1"><Eye size={14} />{da ? 'Skrivebeskyttet hub' : fi ? 'Vain luku -hubi' : 'Read-only hub'}</Badge>
          </div>
        </motion.header>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          {activeModule === 'hub' ? <div /> : (
            <Button variant="outline" onClick={() => setActiveModule('hub')} className="fixed top-6 left-4 sm:left-6 z-30 gap-2 w-fit bg-background/80 backdrop-blur-sm shadow-lg">
              <ArrowLeft size={18} />{da ? `Tilbage til ${view.name}` : fi ? `Takaisin hubiin ${view.name}` : `Back to ${view.name}`}
            </Button>
          )}
          <div className="flex gap-2 self-stretch sm:self-auto">
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-full sm:w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{da ? 'Alle teams i hubben' : fi ? 'Kaikki hubin tiimit' : 'All teams in the hub'}</SelectItem>
                {teamData.map((entry) => <SelectItem key={entry.team.teamId} value={entry.team.teamId}>{entry.team.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={load} disabled={isLoading} aria-label={da ? 'Genindlæs' : fi ? 'Lataa uudelleen' : 'Reload'}>
              <ArrowClockwise size={18} className={isLoading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {error ? (
          <Card className="p-6 border-destructive text-destructive">{error}</Card>
        ) : isLoading ? (
          <Card className="p-12 text-center text-muted-foreground">{da ? 'Indlæser hub…' : fi ? 'Ladataan hubia…' : 'Loading hub…'}</Card>
        ) : activeModule === 'hub' ? (
          <HubOverview da={da} fi={fi} taskGroups={taskGroups} activeVacations={activeVacations} activeSick={activeSick} homeOffice={homeOffice} teamBadge={teamBadge} modules={modules} onOpenModule={setActiveModule} />
        ) : activeModule === 'vacation' ? (
          <ObserverVacationCalendar view={view} teams={visibleTeams} vacations={vacations} />
        ) : activeModule === 'shifts' ? (
          <ShiftsModule da={da} fi={fi} assignments={todaysAssignments} teamBadge={teamBadge} />
        ) : activeModule === 'people' ? (
          <PeopleModule da={da} fi={fi} people={people} teamBadge={teamBadge} />
        ) : (
          <GuidesModule da={da} fi={fi} guides={observerGuides} teamBadge={teamBadge} userEmail={userEmail} viewId={view.viewId} />
        )}
      </div>
    </div>
  )
}

interface TaskGroup {
  team: RegisteredTeam
  role: ShiftRole
  people: ShiftAssignment[]
}

interface TodayPerson {
  team: RegisteredTeam
  name: string
}

function HubOverview({ da, fi, taskGroups, activeVacations, activeSick, homeOffice, teamBadge, modules, onOpenModule }: {
  da: boolean
  fi: boolean
  taskGroups: TaskGroup[]
  activeVacations: TodayPerson[]
  activeSick: TodayPerson[]
  homeOffice: TodayPerson[]
  teamBadge: (team: RegisteredTeam) => React.ReactNode
  modules: Array<{ id: Exclude<ObserverModule, 'hub'>; title: string; description: string; icon: React.ElementType; color: string; gradient: string }>
  onOpenModule: (module: ObserverModule) => void
}) {
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-10">
        <Card className="p-5 md:p-7 bg-card border-2 hover:border-primary/40 transition-all duration-300 mb-4 md:mb-6">
          <div className="flex items-center gap-3 md:gap-4 mb-5 md:mb-7">
            <div className="p-2 md:p-2.5 rounded-lg bg-gradient-to-br from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)]"><Users size={28} weight="duotone" className="text-white" /></div>
            <h2 className="text-lg md:text-2xl font-bold text-foreground text-center flex-1">{da ? 'Teamopgaver i dag' : fi ? 'Tiimin tehtävät tänään' : 'Team tasks today'}</h2>
          </div>
          {taskGroups.length === 0 ? <p className="text-muted-foreground text-center py-2">{da ? 'Ingen opgaver i dag' : fi ? 'Ei tehtäviä tänään' : 'No tasks today'}</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {taskGroups.map((group) => (
                <div key={`${group.team.teamId}-${group.role.id}`} className="flex flex-col gap-2 p-3 rounded-xl border-2 bg-gradient-to-br from-card to-muted/30">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b">
                    <Badge className="text-white" style={{ backgroundColor: group.role.color }}>{group.role.name}</Badge>{teamBadge(group.team)}
                  </div>
                  {group.people.length === 0 ? <div className="text-xs text-muted-foreground text-center py-1">{da ? 'Ingen tildelt' : fi ? 'Ketään ei ole määrätty.' : 'No one assigned'}</div> : group.people.map((person) => (
                    <div key={person.id} className="flex items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: group.role.color }}>{person.employeeName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
                      <span className="text-sm font-medium min-w-0 break-words">{person.employeeName}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <TodayCard title={da ? 'Fri i dag' : fi ? 'Poissa tänään' : 'Off today'} empty={da ? 'Ingen har fri i dag' : fi ? 'Kukaan ei ole poissa tänään' : 'No one is off today'} icon={CalendarBlank} people={activeVacations} teamBadge={teamBadge} gradient="from-[oklch(0.50_0.15_262)] to-[oklch(0.58_0.12_255)]" />
          <TodayCard title={da ? 'Hjemmearbejde i dag' : fi ? 'Etätöissä tänään' : 'Working from home today'} empty={da ? 'Ingen arbejder hjemme i dag' : fi ? 'Kukaan ei työskentele etänä tänään' : 'No one is working from home today'} icon={House} people={homeOffice} teamBadge={teamBadge} gradient="from-[oklch(0.55_0.11_245)] to-[oklch(0.60_0.09_240)]" />
          <TodayCard title={da ? 'Syge i dag' : fi ? 'Sairaana tänään' : 'Sick today'} empty={da ? 'Ingen er syge i dag' : fi ? 'Kukaan ei ole sairaana tänään' : 'No one is sick today'} icon={FirstAidKit} people={activeSick} teamBadge={teamBadge} gradient="from-[oklch(0.55_0.16_25)] to-[oklch(0.60_0.13_30)]" />
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
        {modules.map((module, index) => (
          <motion.div key={module.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + index * 0.08 }} whileHover={{ y: -8 }} whileTap={{ scale: 0.98 }}>
            <Card className="relative overflow-hidden border-2 group min-h-[220px] cursor-pointer hover:border-primary/40" onClick={() => onOpenModule(module.id)}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `radial-gradient(circle at top right, ${module.color}25, transparent)` }} />
              <div className="relative p-6 flex flex-col flex-1">
                <div className={`mb-4 inline-flex items-center justify-center rounded-2xl p-3 shadow-lg bg-gradient-to-br ${module.gradient}`}><module.icon size={48} weight="duotone" className="text-white" /></div>
                <h3 className="text-lg font-bold mb-2 text-center">{module.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed flex-1">{module.description}</p>
                <Badge variant="secondary" className="mt-4 self-start gap-1"><Eye size={13} />{da ? 'Kun læsning' : fi ? 'Vain luku' : 'Read only'}</Badge>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </>
  )
}

function TodayCard({ title, empty, icon: Icon, people, teamBadge, gradient }: {
  title: string
  empty: string
  icon: React.ElementType
  people: TodayPerson[]
  teamBadge: (team: RegisteredTeam) => React.ReactNode
  gradient: string
}) {
  return (
    <Card className="p-4 md:p-6 bg-card border-2 hover:border-primary/40 transition-all duration-300">
      <div className="flex items-center justify-center gap-3 mb-4"><div className={`p-2 rounded-lg bg-gradient-to-br ${gradient}`}><Icon size={24} weight="duotone" className="text-white" /></div><h3 className="text-base md:text-lg font-semibold">{title}</h3></div>
      {people.length === 0 ? <p className="text-muted-foreground text-sm text-center py-1">{empty}</p> : (
        <div className="flex flex-col gap-2">
          {people.map((person, index) => <div key={`${person.team.teamId}-${person.name}-${index}`} className="flex items-center justify-center gap-2 text-sm"><User size={16} className="text-muted-foreground" /><span>{person.name}</span>{teamBadge(person.team)}</div>)}
        </div>
      )}
    </Card>
  )
}

function ShiftsModule({ da, fi, assignments, teamBadge }: {
  da: boolean
  fi: boolean
  assignments: Array<ShiftAssignment & { team: RegisteredTeam; roleName: string; roleColor: string }>
  teamBadge: (team: RegisteredTeam) => React.ReactNode
}) {
  return (
    <Card className="p-5 md:p-7 border-2">
      <div className="flex items-center gap-3 mb-6"><ClipboardText size={30} weight="duotone" className="text-primary" /><h2 className="text-2xl font-bold">{da ? 'Dagens vagtplan' : fi ? "Tämän päivän vuoroaikataulu" : "Today's shift schedule"}</h2></div>
      {assignments.length === 0 ? <p className="text-muted-foreground py-8 text-center">{da ? 'Ingen vagter i dag' : fi ? 'Ei vuoroja tänään' : 'No shifts today'}</p> : (
        <div className="divide-y">
          {assignments.map((item) => <div key={`${item.team.teamId}-${item.id}`} className="py-4 flex items-center justify-between gap-3"><div><div className="font-medium">{item.employeeName}</div><div className="text-sm text-muted-foreground">{item.roleName}{item.comment ? ` · ${item.comment}` : ''}</div></div><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.roleColor }} />{teamBadge(item.team)}</div></div>)}
        </div>
      )}
    </Card>
  )
}

function PeopleModule({ da, fi, people, teamBadge }: {
  da: boolean
  fi: boolean
  people: Array<{ team: RegisteredTeam; email: string; name: string; role?: string }>
  teamBadge: (team: RegisteredTeam) => React.ReactNode
}) {
  return (
    <Card className="p-5 md:p-7 border-2">
      <div className="flex items-center gap-3 mb-6"><Buildings size={30} weight="duotone" className="text-primary" /><h2 className="text-2xl font-bold">{da ? 'Personer i teamene' : fi ? 'Joukkueen jäsenet' : 'People in the teams'}</h2></div>
      {people.length === 0 ? <p className="text-muted-foreground py-8 text-center">{da ? 'Ingen personer fundet' : fi ? 'Ei löytynyt ketään' : 'No people found'}</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {people.map((item) => <div key={`${item.team.teamId}-${item.email}`} className="rounded-xl border p-4"><div className="font-medium">{item.name}</div><div className="text-sm text-muted-foreground truncate">{item.email}</div><div className="mt-3 flex gap-2">{teamBadge(item.team)}{item.role === 'manager' && <Badge variant="secondary">Manager</Badge>}</div></div>)}
        </div>
      )}
    </Card>
  )
}

function GuidesModule({ da, fi, guides, teamBadge, userEmail, viewId }: {
  da: boolean
  fi: boolean
  guides: Array<{ guide: Guide; teams: RegisteredTeam[] }>
  teamBadge: (team: RegisteredTeam) => React.ReactNode
  userEmail: string
  viewId: string
}) {
  const [search, setSearch] = useState('')
  const [selectedGuide, setSelectedGuide] = useState<{ guide: Guide; teams: RegisteredTeam[] } | null>(null)
  const query = search.trim().toLowerCase()
  const filtered = query ? guides.filter(({ guide }) => guidePlainText(guide).toLowerCase().includes(query)) : guides

  const loadGuideFile = useCallback(async (fileUrl: string): Promise<Blob> => {
    if (!selectedGuide || !window.electronRegistry) throw new Error('Guide file is unavailable')
    const fileId = fileUrl.replace(/^kv:\/\//, '')
    for (const team of selectedGuide.teams) {
      const metadata = await window.electronRegistry.readAccessViewKey<{
        contentType?: string
        chunkCount?: number
      } | undefined>(userEmail, viewId, team.teamId, `${fileId}_meta`)
      if (!metadata?.chunkCount) continue
      const chunks: string[] = []
      for (let index = 0; index < metadata.chunkCount; index++) {
        const chunk = await window.electronRegistry.readAccessViewKey<string>(userEmail, viewId, team.teamId, `${fileId}_chunk_${index}`)
        if (!chunk) throw new Error(`Missing guide file chunk ${index}`)
        chunks.push(chunk)
      }
      const binary = atob(chunks.join(''))
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
      return new Blob([bytes], { type: metadata.contentType || 'application/octet-stream' })
    }
    throw new Error('Guide file was not found in the selected teams')
  }, [selectedGuide, userEmail, viewId])

  return (
    <>
      <Card className="p-5 md:p-7 border-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3"><Books size={30} weight="duotone" className="text-primary" /><h2 className="text-2xl font-bold">{da ? 'Guidebibliotek' : fi ? 'Opaskirjasto' : 'Guide library'}</h2></div>
          <div className="relative w-full md:w-80"><MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={da ? 'Søg i guides…' : fi ? 'Etsi oppaita...' : 'Search guides…'} className="pl-10" /></div>
        </div>
        {filtered.length === 0 ? <p className="text-muted-foreground py-8 text-center">{da ? 'Ingen guides fundet' : fi ? 'Oppaat eivät löytyneet' : 'No guides found'}</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(({ guide, teams }) => (
              <button key={guide.id} type="button" onClick={() => setSelectedGuide({ guide, teams })} className="text-left rounded-xl border-2 bg-card p-5 hover:border-primary/50 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3"><Books size={25} weight="duotone" className="text-primary shrink-0" /><Badge variant="secondary">{guide.category}</Badge></div>
                <h3 className="font-bold text-lg mt-4">{guide.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{guideExcerpt(guide, 180) || (da ? 'Ingen beskrivelse' : fi ? 'Ei kuvausta' : 'No description')}</p>
                <div className="flex flex-wrap gap-2 mt-4">{teams.map((team) => <span key={team.teamId}>{teamBadge(team)}</span>)}</div>
              </button>
            ))}
          </div>
        )}
      </Card>
      <GuideViewer guide={selectedGuide?.guide || null} open={selectedGuide !== null} onOpenChange={(open) => { if (!open) setSelectedGuide(null) }} fileLoader={loadGuideFile} />
    </>
  )
}
