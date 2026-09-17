import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, UserCircle, EnvelopeSimple, Crown, ShieldCheck, Phone, Buildings } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { UserProfile } from '@/components/UserProfile'
import { UserRole, getRoleDisplayName, excludeCreator } from '@/lib/userRoles'
import { getEmployeeColorByEmail, EMPLOYEE_COLOR_OVERRIDES_KEY, type EmployeeColorOverrides } from '@/lib/employeeColors'
import { isAnyModalOpen } from '@/lib/modalStack'
import { useLanguage } from '@/contexts/LanguageContext'
import { useKV } from '@/hooks/useKV'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'

export interface TeamEmployee {
  id: string
  name: string
  email: string
  phone: string
  role?: UserRole
}

interface TeamOverviewProps {
  onNavigateBack: () => void
  onLogout: () => void
}

type RawUser = { email: string; fullName: string; role?: UserRole; phone?: string }

/** Normaliserer et teams rå users-KV-værdi til en sorteret, Creator-fri liste. */
async function toEmployeeList(usersData: Record<string, RawUser> | null | undefined): Promise<TeamEmployee[]> {
  if (!usersData || typeof usersData !== 'object' || Array.isArray(usersData)) return []
  const filtered = await excludeCreator(Object.values(usersData))
  return filtered.map(user => ({
    id: user.email,
    name: user.fullName,
    email: user.email,
    phone: user.phone || '',
    role: user.role || 'user'
  })).sort((a, b) => a.name.localeCompare(b.name))
}

export function TeamOverview({ onNavigateBack, onLogout }: TeamOverviewProps) {
  const { t } = useLanguage()
  const [colorOverrides] = useKV<EmployeeColorOverrides>(EMPLOYEE_COLOR_OVERRIDES_KEY, {})
  const [employees, setEmployees] = useState<TeamEmployee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [otherTeams, setOtherTeams] = useState<Array<{ team: RegisteredTeam; employees: TeamEmployee[] }>>([])
  const [isLoadingOtherTeams, setIsLoadingOtherTeams] = useState(true)

  useEffect(() => {
    loadRegisteredUsers()
    loadOtherTeams()
  }, [])

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

  const loadRegisteredUsers = async () => {
    setIsLoading(true)
    const usersData = await window.kv.get<Record<string, RawUser>>('users')
    setEmployees(await toEmployeeList(usersData))
    setIsLoading(false)
  }

  // Tværgående (Fase 8): læser hvert ANDET teams 'users'-nøgle read-only via
  // registry:read-team-key, uden at skifte den aktive store. Lav frekvens (kun
  // ved mount) er fint her — en medarbejderliste ændrer sig sjældent.
  const loadOtherTeams = async () => {
    if (!window.electronRegistry) {
      setIsLoadingOtherTeams(false)
      return
    }
    setIsLoadingOtherTeams(true)
    try {
      const [allTeams, currentTeam] = await Promise.all([
        window.electronRegistry.listTeams(),
        window.electronRegistry.getCurrentTeam(),
      ])
      const others = allTeams.filter(team => team.teamId !== currentTeam?.teamId)
      const withEmployees = await Promise.all(others.map(async (team) => {
        const usersData = await window.electronRegistry!.readTeamKey<Record<string, RawUser>>(team.folderName, 'users')
        return { team, employees: await toEmployeeList(usersData) }
      }))
      setOtherTeams(withEmployees)
    } catch (error) {
      console.error('Kunne ikke hente andre teams til Team Oversigt:', error)
    }
    setIsLoadingOtherTeams(false)
  }

  const getRoleBadge = (role?: UserRole) => {
    switch (role) {
      case 'creator':
        return (
          <Badge className="bg-gradient-to-r from-accent via-primary to-accent text-white">
            <Crown size={14} className="mr-1" weight="fill" />
            {t.teamOverview.roleCreator}
          </Badge>
        )
      case 'manager':
        return (
          <Badge className="bg-gradient-to-r from-primary to-accent text-white">
            <ShieldCheck size={14} className="mr-1" weight="fill" />
            {t.teamOverview.roleManager}
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            <UserCircle size={14} className="mr-1" />
            {t.teamOverview.userSingular}
          </Badge>
        )
    }
  }

  const renderEmployeeGrid = (list: TeamEmployee[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map((employee) => {
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
                {getRoleBadge(employee.role)}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <EnvelopeSimple size={16} className="flex-shrink-0" />
                <a 
                  href={`mailto:${employee.email}`}
                  className="hover:text-primary transition-colors truncate"
                >
                  {employee.email}
                </a>
              </div>
              {employee.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone size={16} className="flex-shrink-0" />
                  <a 
                    href={`tel:${employee.phone}`}
                    className="hover:text-primary transition-colors"
                  >
                    {employee.phone}
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
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
                {t.common.back}
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 pt-36 pb-12 sm:pb-20 max-w-7xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-4xl sm:text-5xl font-bold leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1">
              {t.teamOverview.title}
            </h1>
          </div>
        </motion.div>

        <Card className="p-6 border-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <UserCircle size={28} className="text-primary" weight="duotone" />
              <h2 className="text-2xl font-bold">{t.teamOverview.registeredUsers}</h2>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm">
                {employees.length} {employees.length === 1 ? t.teamOverview.userSingular : t.teamOverview.userPlural}
              </Badge>
            </div>
          </div>

          <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
            <p className="text-sm text-muted-foreground">
              {t.teamOverview.description}
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <UserCircle size={48} className="text-muted-foreground mx-auto mb-4 animate-pulse" weight="duotone" />
              <p className="text-muted-foreground">{t.teamOverview.loadingUsers}</p>
            </div>
          ) : !employees.length ? (
            <div className="text-center py-12">
              <UserCircle size={48} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
              <p className="text-muted-foreground">{t.teamOverview.noUsers}</p>
              <p className="text-sm text-muted-foreground mt-2">{t.teamOverview.noUsersHint}</p>
            </div>
          ) : renderEmployeeGrid(employees)}
        </Card>

        {(isLoadingOtherTeams || otherTeams.length > 0) && (
          <Card className="p-6 border-2 mt-6">
            <div className="flex items-center gap-2 mb-6">
              <Buildings size={28} className="text-primary" weight="duotone" />
              <h2 className="text-2xl font-bold">{t.teamOverview.otherTeamsTitle}</h2>
            </div>

            {isLoadingOtherTeams ? (
              <p className="text-muted-foreground text-center py-8">{t.teamOverview.loadingUsers}</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {otherTeams.map(({ team, employees: teamEmployees }) => (
                  <AccordionItem key={team.teamId} value={team.teamId}>
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{team.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {teamEmployees.length} {teamEmployees.length === 1 ? t.teamOverview.userSingular : t.teamOverview.userPlural}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {teamEmployees.length === 0 ? (
                        <p className="text-muted-foreground text-sm py-4">{t.teamOverview.noUsers}</p>
                      ) : renderEmployeeGrid(teamEmployees)}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

