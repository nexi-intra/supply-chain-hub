import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Crown, Buildings, Plus, UserPlus, GameController, HardDrives,
  WaveSine, RocketLaunch, Cube, Bird, SquaresFour, ShieldCheck,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserProfile } from '@/components/UserProfile'
import { DataStorageManager } from '@/components/DataStorageManager'
import { UpdateManager } from '@/components/UpdateManager'
import { ClientVersionManager } from '@/components/ClientVersionManager'
import { GameLeaderboardAdmin } from '@/components/GameLeaderboardAdmin'
import { toast } from 'sonner'
import { hasCreatorAccess } from '@/lib/userRoles'
import { hashPassword } from '@/lib/passwords'
import { setKvObjectField } from '@/lib/kvArrays'
import { isAnyModalOpen } from '@/lib/modalStack'
import { useLanguage } from '@/contexts/LanguageContext'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'

interface CreatorPanelProps {
  onNavigateBack: () => void
  onLogout: () => void
  userEmail: string
}

/** Kun synligt for Creator: team-oprettelse, bruger-oprettelse på tværs af teams, Arcade-highscores, Datalagring. */
export function CreatorPanel({ onNavigateBack, onLogout, userEmail }: CreatorPanelProps) {
  const { t, language } = useLanguage()
  const [isLoading, setIsLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [teams, setTeams] = useState<RegisteredTeam[]>([])
  const [users, setUsers] = useState<Array<{ email: string; fullName: string }>>([])

  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamCode, setNewTeamCode] = useState('')

  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
  const [newUserTeamId, setNewUserTeamId] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<'user' | 'manager'>('manager')

  useEffect(() => {
    const check = async () => {
      const access = await hasCreatorAccess(userEmail)
      setHasAccess(access)
      if (access) {
        await Promise.all([loadTeams(), loadUsers()])
      }
      setIsLoading(false)
    }
    check()
  }, [userEmail])

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

  const loadTeams = async () => {
    const list = (await window.electronRegistry?.listTeams()) || []
    setTeams(list.sort((a, b) => a.name.localeCompare(b.name)))
  }

  const loadUsers = async () => {
    const usersData = (await window.kv.get<Record<string, { email: string; fullName: string }>>('users')) || {}
    setUsers(Object.values(usersData))
  }

  const handleCreateTeam = async () => {
    const name = newTeamName.trim()
    const code = newTeamCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    if (!name || !code) {
      toast.error(t.creatorPanel.teams.fieldsRequired)
      return
    }
    try {
      await window.electronRegistry?.createTeam({ teamId: code, name, folderName: code })
      toast.success(t.creatorPanel.teams.createdToast)
      setIsCreateTeamOpen(false)
      setNewTeamName('')
      setNewTeamCode('')
      loadTeams()
    } catch {
      toast.error(t.creatorPanel.teams.codeExists)
    }
  }

  const handleCreateUser = async () => {
    const name = newUserName.trim()
    const email = newUserEmail.trim().toLowerCase()
    if (!newUserTeamId || !name || !email || !newUserPassword.trim()) {
      toast.error(t.creatorPanel.createUserDialog.fieldsRequired)
      return
    }
    const targetTeam = teams.find(team => team.teamId === newUserTeamId)
    if (!targetTeam || !window.electronRegistry) return

    // Skift midlertidigt til måltets team for at skrive brugeren i DET teams
    // egen datamappe, og skift altid tilbage til Creators eget team bagefter.
    const homeTeam = await window.electronRegistry.lookupTeam(userEmail)
    try {
      await window.electronRegistry.switchToTeam(targetTeam.folderName)
      await window.electronRegistry.assignUser(email, targetTeam.teamId)
      await setKvObjectField('users', email, {
        email,
        password: await hashPassword(newUserPassword),
        fullName: name,
        role: newUserRole,
        isManager: newUserRole === 'manager',
        status: 'approved',
      })
      toast.success(t.creatorPanel.createUserDialog.created)
      setIsCreateUserOpen(false)
      setNewUserTeamId('')
      setNewUserName('')
      setNewUserEmail('')
      setNewUserPassword('')
      setNewUserRole('manager')
    } finally {
      if (homeTeam) await window.electronRegistry.switchToTeam(homeTeam.folderName)
      loadUsers()
    }
  }

  if (isLoading) return null

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <Card className="p-8 max-w-md relative z-10 border-2">
          <div className="text-center space-y-4">
            <Crown size={64} className="text-destructive mx-auto" weight="duotone" />
            <h2 className="text-2xl font-bold">{t.creatorPanel.noAccess.title}</h2>
            <p className="text-muted-foreground">{t.creatorPanel.noAccess.description}</p>
            <Button onClick={onNavigateBack} className="w-full">
              <ArrowLeft size={20} className="mr-2" />
              {t.creatorPanel.noAccess.backToHub}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-6 right-6 left-6 z-20">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-16">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}>
            <Button
              variant="outline"
              size="lg"
              onClick={onNavigateBack}
              className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
            >
              <ArrowLeft size={20} />
              {t.common.back}
            </Button>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <UserProfile userEmail="" onLogout={onLogout} hideEmail={true} />
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-12 sm:pb-20 max-w-5xl relative z-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="flex items-center gap-3">
            <Crown size={36} className="text-accent" weight="fill" />
            <h1 className="text-4xl sm:text-5xl font-bold leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1">
              {t.creatorPanel.title}
            </h1>
          </div>
        </motion.div>

        <Tabs defaultValue="teams" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="teams" className="gap-2">
              <Buildings size={18} />
              {t.creatorPanel.tabs.teams}
            </TabsTrigger>
            <TabsTrigger value="games" className="gap-2">
              <GameController size={18} />
              {t.managerPanel.tabs.games}
            </TabsTrigger>
            <TabsTrigger value="data-storage" className="gap-2">
              <HardDrives size={18} />
              {t.managerPanel.tabs.dataStorage}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="space-y-6">
            <Card className="p-6 border-2">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Buildings size={28} className="text-primary" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.creatorPanel.teams.overviewTitle}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => setIsCreateUserOpen(true)} variant="outline" className="gap-2">
                    <UserPlus size={18} weight="bold" />
                    {t.creatorPanel.teams.createUser}
                  </Button>
                  <Button onClick={() => setIsCreateTeamOpen(true)} className="gap-2">
                    <Plus size={18} weight="bold" />
                    {t.creatorPanel.teams.createTeam}
                  </Button>
                </div>
              </div>

              {teams.length === 0 ? (
                <p className="text-muted-foreground text-center py-12">{t.creatorPanel.teams.noneFound}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {teams.map(team => (
                    <div key={team.teamId} className="p-4 rounded-xl border-2 bg-card">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck size={18} className="text-primary" weight="duotone" />
                        <div className="font-bold">{team.name}</div>
                      </div>
                      <div className="text-sm text-muted-foreground">{team.folderName}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="games" className="space-y-6">
            <Tabs defaultValue="neon-snake-scores" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5 max-w-4xl">
                <TabsTrigger value="neon-snake-scores" className="gap-2">
                  <WaveSine size={18} />
                  Neon Snake
                </TabsTrigger>
                <TabsTrigger value="dodger-scores" className="gap-2">
                  <RocketLaunch size={18} />
                  Chickeninvasion
                </TabsTrigger>
                <TabsTrigger value="brick-break-scores" className="gap-2">
                  <Cube size={18} />
                  Brick Break
                </TabsTrigger>
                <TabsTrigger value="nexiflyer-scores" className="gap-2">
                  <Bird size={18} />
                  Nexi Flyer
                </TabsTrigger>
                <TabsTrigger value="tetris-scores" className="gap-2">
                  <SquaresFour size={18} />
                  Tetris
                </TabsTrigger>
              </TabsList>

              <TabsContent value="neon-snake-scores" className="space-y-6">
                <GameLeaderboardAdmin
                  gameTitle="Neon Snake"
                  icon={<WaveSine size={28} className="text-primary" weight="duotone" />}
                  leaderboardKey="neon-snake-global-leaderboard"
                  playCountsKey="neon-snake-play-counts"
                  users={users}
                />
              </TabsContent>

              <TabsContent value="dodger-scores" className="space-y-6">
                <GameLeaderboardAdmin
                  gameTitle="Chickeninvasion"
                  icon={<RocketLaunch size={28} className="text-primary" weight="duotone" />}
                  leaderboardKey="endless-dodger-global-leaderboard"
                  playCountsKey="endless-dodger-play-counts"
                  users={users}
                />
              </TabsContent>

              <TabsContent value="brick-break-scores" className="space-y-6">
                <GameLeaderboardAdmin
                  gameTitle="Brick Break"
                  icon={<Cube size={28} className="text-primary" weight="duotone" />}
                  leaderboardKey="brickbreak-global-leaderboard"
                  playCountsKey="brickbreak-play-counts"
                  hasLevel
                  users={users}
                />
              </TabsContent>

              <TabsContent value="nexiflyer-scores" className="space-y-6">
                <GameLeaderboardAdmin
                  gameTitle="Nexi Flyer"
                  icon={<Bird size={28} className="text-primary" weight="duotone" />}
                  leaderboardKey="nexi-flyer-global-leaderboard"
                  playCountsKey="nexi-flyer-play-counts"
                  users={users}
                />
              </TabsContent>

              <TabsContent value="tetris-scores" className="space-y-6">
                <GameLeaderboardAdmin
                  gameTitle="Tetris"
                  icon={<SquaresFour size={28} className="text-primary" weight="duotone" />}
                  leaderboardKey="tetris-global-leaderboard"
                  playCountsKey="tetris-play-counts"
                  categories={['all']}
                  categorySettings={{ all: { label: t.managerPanel.games.highscores, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', statBg: 'bg-primary/10', statBorder: 'border-primary/20', statText: 'text-primary' } }}
                  users={users}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="data-storage" className="space-y-6">
            <UpdateManager userEmail={userEmail} />
            <ClientVersionManager managerEmail={userEmail} users={users} />
            <DataStorageManager />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isCreateTeamOpen} onOpenChange={setIsCreateTeamOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.creatorPanel.teams.createTeam}</DialogTitle>
            <DialogDescription>{t.creatorPanel.teams.codeHint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">{t.creatorPanel.teams.nameLabel}</Label>
              <Input id="team-name" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder={t.creatorPanel.teams.namePlaceholder} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-code">{t.creatorPanel.teams.codeLabel}</Label>
              <Input id="team-code" value={newTeamCode} onChange={e => setNewTeamCode(e.target.value)} placeholder={t.creatorPanel.teams.codePlaceholder} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateTeamOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleCreateTeam} className="gap-2">
              <Plus size={18} weight="bold" />
              {t.creatorPanel.teams.createTeam}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.creatorPanel.createUserDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-team">{t.creatorPanel.createUserDialog.teamLabel}</Label>
              <Select value={newUserTeamId} onValueChange={setNewUserTeamId}>
                <SelectTrigger id="new-user-team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.teamId} value={team.teamId}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-name">{t.creatorPanel.createUserDialog.nameLabel}</Label>
              <Input id="new-user-name" value={newUserName} onChange={e => setNewUserName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-email">{t.creatorPanel.createUserDialog.emailLabel}</Label>
              <Input id="new-user-email" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-password">{t.creatorPanel.createUserDialog.passwordLabel}</Label>
              <Input id="new-user-password" type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-role">{t.creatorPanel.createUserDialog.roleLabel}</Label>
              <Select value={newUserRole} onValueChange={value => setNewUserRole(value as 'user' | 'manager')}>
                <SelectTrigger id="new-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">{t.teamOverview.roleManager}</SelectItem>
                  <SelectItem value="user">{t.teamOverview.userSingular}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateUserOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleCreateUser} className="gap-2">
              <UserPlus size={18} weight="bold" />
              {t.creatorPanel.createUserDialog.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
