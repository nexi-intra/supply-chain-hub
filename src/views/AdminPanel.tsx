import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, UserGear, Check, Crown, ShieldCheck, User as UserIcon, Trash, Plus, Tag, UserCircle, PencilSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserProfile } from '@/components/UserProfile'
import { toast } from 'sonner'
import { appendToKvArray, removeFromKvArray, setKvObjectField, deleteKvObjectField, replaceKvObjectField } from '@/lib/kvArrays'
import { isAnyModalOpen } from '@/lib/modalStack'
import { useOptimisticList } from '@/hooks/useOptimisticList'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { da, enUS, fi, sv } from 'date-fns/locale'
import { UserRole, hasManagerAccess, getCreatorEmail, getRoleDisplayName, getRoleDescription } from '@/lib/userRoles'
import { hashPassword } from '@/lib/passwords'
import { useLanguage } from '@/contexts/LanguageContext'
import type { ShiftRole } from '@/lib/types'

interface User {
  email: string
  fullName: string
  role: UserRole
}

const ROLE_ORDER: Record<UserRole, number> = { creator: 0, manager: 1, user: 2 }
const userKey = (user: User) => user.email.toLowerCase()
const roleKey = (role: ShiftRole) => role.id

interface AdminPanelProps {
  onNavigateBack: () => void
  onLogout: () => void
  userEmail: string
}

export function AdminPanel({ onNavigateBack, onLogout, userEmail: currentUserEmail }: AdminPanelProps) {
  const { t, language } = useLanguage()
  const dateLocale = language === 'en' ? enUS : language === 'fi' ? fi : language === 'sv' ? sv : da
  // A write to M: takes 20-90 s, so changes show at once in these lists (and stay shown while they are saved).
  const [userItems, userList] = useOptimisticList<User>(userKey)
  const users = useMemo(() => [...userItems].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]), [userItems])
  const [isLoading, setIsLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null)
  // Which save/delete is running, so that button shows a spinner and can't be pressed twice.
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const runBusy = async (key: string, action: () => Promise<void>) => {
    if (busyAction) return
    setBusyAction(key)
    try {
      await action()
    } catch (error) {
      console.error('Admin action failed:', error)
      toast.error(t.profile.errors.generic)
    } finally {
      setBusyAction(null)
    }
  }
  const [shiftRoles, roleList] = useOptimisticList<ShiftRole>(roleKey)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleColor, setNewRoleColor] = useState('#8b5cf6')

  const [showEmployeeDialog, setShowEmployeeDialog] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null)
  const [employeeForm, setEmployeeForm] = useState({
    email: '',
    fullName: '',
    password: '',
    role: 'user' as UserRole
  })

  useEffect(() => {
    const loadUserAndCheckAdmin = async () => {
      if (!currentUserEmail) return
      setUserEmail(currentUserEmail)
      // Parallelt: hver læsning er en rundtur til M:.
      const [creator, access] = await Promise.all([getCreatorEmail(), hasManagerAccess(currentUserEmail)])
      setCreatorEmail(creator)
      setHasAccess(access)
      if (access) {
        loadUsers()
        loadShiftRoles()
      }
    }
    loadUserAndCheckAdmin()
  }, [currentUserEmail])

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
    try {
      // Parallelt: hver læsning er en rundtur til M:.
      const [creator, usersData] = await Promise.all([getCreatorEmail(), window.kv.get<Record<string, { email: string; password: string; fullName: string; role?: UserRole; isManager?: boolean }>>('users')])
      if (usersData) {
        userList.show(Object.values(usersData)
          .filter((u) => !creator || u.email.toLowerCase() !== creator)
          .map(u => {
          let role: UserRole = 'user'
          if (creator && u.email.toLowerCase() === creator) {
            role = 'creator'
          } else if (u.role) {
            role = u.role
          } else if (u.isManager) {
            role = 'manager'
          }

          return {
            email: u.email,
            fullName: u.fullName,
            role
          }
        }))
      }
    } finally {
      setIsLoading(false)
    }
  }

  const loadShiftRoles = async () => {
    roleList.show(await window.kv.get<ShiftRole[]>('shift-roles') || [])
  }

  const isCreator = (email: string) => !!creatorEmail && email.toLowerCase() === creatorEmail

  /** The account shows the change at once; it is saved in the background and a failed save undoes it. */
  const changeUser = (user: User, next: User | null, write: Promise<boolean>) =>
    userList.change([[userKey(user), next]], write.catch(error => {
      console.error('Kunne ikke gemme brugeren:', error)
      toast.error(t.profile.errors.generic)
      return false
    }))

  // Shown and closed at once; a write to M: takes 20-90 s. A failed save takes the role away again.
  const handleAddRole = () => {
    if (!newRoleName.trim()) {
      toast.error(t.adminPanel.roles.nameRequired)
      return
    }

    const newRole: ShiftRole = {
      id: Date.now().toString(),
      name: newRoleName.trim(),
      color: newRoleColor
    }

    setNewRoleName('')
    setNewRoleColor('#8b5cf6')
    setShowRoleDialog(false)
    toast.success(t.adminPanel.roles.added)
    void roleList.change([[newRole.id, newRole]], appendToKvArray<ShiftRole>('shift-roles', [newRole]))
      .then(saved => { if (!saved) toast.error(t.profile.errors.generic) })
  }

  const handleDeleteRole = (roleId: string) => {
    toast.success(t.adminPanel.roles.deleted)
    // The role and its shift assignments are independent keys: removed at the same time.
    const assignmentsRemoved = window.kv.get<{ id: string; roleId: string }[]>('shift-assignments').then(assignments =>
      removeFromKvArray('shift-assignments', (assignments || []).filter(a => a.roleId === roleId).map(a => a.id)))
    void roleList.change([[roleId, null]], removeFromKvArray<ShiftRole>('shift-roles', [roleId]))
      .then(saved => { if (!saved) toast.error(t.profile.errors.generic) })
    assignmentsRemoved.catch(error => console.error('Kunne ikke fjerne rollens vagter:', error))
  }

  const openEmployeeDialog = (employee?: User) => {
    if (employee) {
      setEditingEmployee(employee)
      setEmployeeForm({
        email: employee.email,
        fullName: employee.fullName,
        password: '',
        role: employee.role
      })
    } else {
      setEditingEmployee(null)
      setEmployeeForm({
        email: '',
        fullName: '',
        password: '',
        role: 'user'
      })
    }
    setShowEmployeeDialog(true)
  }

  const handleSaveEmployee = async () => {
    if (!employeeForm.email.trim() || !employeeForm.fullName.trim()) {
      toast.error(t.adminPanel.employees.emailNameRequired)
      return
    }

    if (!editingEmployee && !employeeForm.password.trim()) {
      toast.error(t.adminPanel.employees.passwordRequired)
      return
    }

    const normalizedEmail = employeeForm.email.trim().toLowerCase()
    const emailChanged = !!editingEmployee && editingEmployee.email !== normalizedEmail
    // Checked at once against the accounts on screen; the save checks again against the stored ones.
    if ((!editingEmployee || emailChanged) && (userList.items.some(u => userKey(u) === normalizedEmail && u.email !== editingEmployee?.email) || isCreator(normalizedEmail))) {
      toast.error(t.adminPanel.employees.emailExists)
      return
    }

    const form = { ...employeeForm }
    const trimmedPassword = form.password.trim()
    const shown: User = { email: normalizedEmail, fullName: form.fullName, role: form.role }

    if (!editingEmployee || !emailChanged) {
      // A new account, or name/password/role of an existing one: shown and closed at once, saved in the background.
      const editing = editingEmployee
      setShowEmployeeDialog(false)
      toast.success(editing ? t.adminPanel.employees.updated : t.adminPanel.employees.created)
      void changeUser(editing || shown, shown, (async () => {
        const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: UserRole; isManager: boolean }>>('users') || {}
        const existingEmail = Object.keys(usersData).find(email => email.trim().toLowerCase() === normalizedEmail && email !== editing?.email)
        if (existingEmail) {
          toast.error(t.adminPanel.employees.emailExists)
          return false
        }
        // Ny bruger kræver en frisk tildeling i det centrale register — ellers kan personen slet ikke logge ind
        // (registret ved ikke hvilket team den oprettede email hører til).
        const assigned = !editing && window.electronRegistry ? (async () => {
          const currentTeam = await window.electronRegistry!.getCurrentTeam()
          if (currentTeam) await window.electronRegistry!.assignUser(normalizedEmail, currentTeam.teamId)
        })() : undefined
        const [password] = await Promise.all([trimmedPassword ? hashPassword(trimmedPassword) : usersData[editing?.email || form.email]?.password || '', assigned])
        const updatedEmployee = {
          ...usersData[editing?.email || form.email],
          email: normalizedEmail,
          password,
          fullName: form.fullName,
          role: form.role,
          isManager: form.role === 'manager' || form.role === 'creator'
        }
        if (editing) {
          await window.kv.updateField('users', { op: 'renameField', field: editing.email, newField: normalizedEmail, expected: usersData[editing.email], value: updatedEmployee })
        } else {
          await setKvObjectField('users', normalizedEmail, updatedEmployee)
        }
        return true
      })())
      return
    }

    // A new e-mail moves the account and everything that refers to it; the backend may refuse, so this waits (spinner).
    const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: UserRole; isManager: boolean }>>('users') || {}
    if (Object.keys(usersData).some(email => email.trim().toLowerCase() === normalizedEmail && email !== editingEmployee.email)) {
      toast.error(t.adminPanel.employees.emailExists)
      return
    }

    // En ændret email kræver en frisk tildeling i det centrale register — ellers kan personen slet ikke logge ind.
    if (!window.electronAuth && window.electronRegistry) {
      const currentTeam = await window.electronRegistry.getCurrentTeam()
      if (currentTeam) await window.electronRegistry.assignUser(normalizedEmail, currentTeam.teamId)
    }

    const updatedEmployee = {
      ...usersData[editingEmployee.email],
      email: normalizedEmail,
      password: trimmedPassword ? await hashPassword(trimmedPassword) : usersData[editingEmployee.email]?.password || '',
      fullName: form.fullName,
      role: form.role,
      isManager: form.role === 'manager' || form.role === 'creator'
    }
    await window.kv.updateField('users', { op: 'renameField', field: editingEmployee.email, newField: normalizedEmail, expected: usersData[editingEmployee.email], value: updatedEmployee })

    if (window.electronAuth && editingEmployee.email.toLowerCase() === userEmail.toLowerCase()) {
      onLogout()
      return
    }
    // The list shows the new e-mail at once and is read again without the dialog waiting for it.
    void userList.change([[userKey(editingEmployee), null], [normalizedEmail, shown]], Promise.resolve(true))
    void loadUsers()
    setShowEmployeeDialog(false)
    toast.success(t.adminPanel.employees.updated)
  }

  /** The person leaves the list at once; the account is deleted on the shared drive in the background. */
  const removeUser = (email: string, deletedMessage: string) => {
    if (isCreator(email)) {
      toast.error(t.adminPanel.users.cannotDeleteAdmin)
      return
    }
    const user = userList.items.find(u => u.email === email)
    if (!user) return

    toast.success(deletedMessage)
    void changeUser(user, null, (async () => {
      const usersData = await window.kv.get<Record<string, unknown>>('users')
      if (usersData && usersData[email]) await deleteKvObjectField('users', email)
      return true
    })())
  }

  const handleDeleteEmployee = (email: string) => removeUser(email, t.adminPanel.employees.deleted)

  const changeUserRole = (email: string, newRole: UserRole) => {
    if (isCreator(email)) {
      toast.error('Kan ikke ændre Creator-brugerens rettigheder')
      return
    }
    const user = userList.items.find(u => u.email === email)
    if (!user) return

    toast.success(`${t.adminPanel.users.roleChangedPrefix} ${getRoleDisplayName(newRole, language)}`)
    void changeUser(user, { ...user, role: newRole }, (async () => {
      const usersData = await window.kv.get<Record<string, { email: string; password: string; fullName: string; role: UserRole; isManager: boolean }>>('users')
      if (!usersData || !usersData[email]) throw new Error('USER_NOT_FOUND')
      await replaceKvObjectField('users', email, usersData[email], {
        ...usersData[email],
        role: newRole,
        isManager: newRole === 'manager' || newRole === 'creator',
      })
      return true
    })())
  }

  const deleteUser = (email: string) => removeUser(email, t.adminPanel.users.deleted)

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'creator':
        return (
          <Badge variant="secondary">
            <Crown size={14} className="mr-1" weight="fill" />
            {t.teamOverview.roleCreator}
          </Badge>
        )
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
            <h2 className="text-2xl font-bold">{t.adminPanel.noAccess.title}</h2>
            <p className="text-muted-foreground">{t.adminPanel.noAccess.description}</p>
            <Button onClick={onNavigateBack} className="w-full">
              <ArrowLeft size={20} className="mr-2" />
              {t.adminPanel.noAccess.backToHub}
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
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <UserProfile userEmail="" onLogout={onLogout} hideEmail={true} />
            </motion.div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-12 sm:pb-20 max-w-5xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-6">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              {t.adminPanel.title}
            </h1>
          </div>
        </motion.div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-2xl">
            <TabsTrigger value="users" className="gap-2">
              <UserGear size={18} />
              {t.adminPanel.tabs.users}
            </TabsTrigger>
            <TabsTrigger value="shift-management" className="gap-2">
              <UserIcon size={18} />
              {t.adminPanel.tabs.shiftManagement}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <UserGear size={28} className="text-primary" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.adminPanel.users.overview}</h2>
                </div>
                <Badge variant="outline" className="text-sm">
                  {users.length} {users.length === 1 ? t.teamOverview.userSingular : t.teamOverview.userPlural}
                </Badge>
              </div>

            {isLoading ? (
              <p className="text-muted-foreground text-center py-12">{t.adminPanel.users.loading}</p>
            ) : users.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">{t.adminPanel.users.noneFound}</p>
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
                      <div className={`w-12 h-12 rounded-md flex items-center justify-center text-white font-bold text-lg ${
                        user.role === 'creator' 
                          ? 'bg-accent' 
                          : user.role === 'manager'
                          ? 'bg-primary'
                          : 'bg-muted-foreground'
                      }`}>
                        {user.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-bold text-lg">{user.fullName}</div>
                          {user.role === 'creator' && (
                            <Crown size={18} className="text-accent" weight="fill" />
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                        <div className="text-xs text-muted-foreground mt-1">{getRoleDescription(user.role, language)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getRoleBadge(user.role)}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      {user.email.toLowerCase() !== creatorEmail ? (
                        <>
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
                                <AlertDialogTitle>{t.adminPanel.users.deleteTitle}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t.adminPanel.users.deleteConfirmPrefix} <strong>{user.fullName}</strong>{t.adminPanel.users.deleteConfirmSuffix}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteUser(user.email)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t.adminPanel.users.deleteAction}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      ) : (
                        <Badge variant="outline" className="ml-2">
                          {t.adminPanel.users.permanentAdmin}
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6 bg-muted/30">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Crown size={24} className="text-accent mt-0.5" weight="fill" />
                <div>
                  <h3 className="font-bold text-lg mb-1">{t.teamOverview.roleCreator}</h3>
                  <p className="text-sm text-muted-foreground">{getRoleDescription('creator', language)}</p>
                </div>
              </div>
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

          <TabsContent value="shift-management" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <UserCircle size={28} className="text-primary" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.adminPanel.employees.title}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-sm">
                    {users.length} {users.length === 1 ? t.adminPanel.employees.singular : t.adminPanel.employees.plural}
                  </Badge>
                  <Button
                    onClick={() => openEmployeeDialog()}
                    size="sm"
                    className="gap-2"
                  >
                    <Plus size={16} />
                    {t.adminPanel.employees.add}
                  </Button>
                </div>
              </div>

              {isLoading ? (
                <p className="text-muted-foreground text-center py-12">{t.adminPanel.employees.loading}</p>
              ) : users.length === 0 ? (
                <div className="text-center py-12">
                  <UserCircle size={48} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                  <p className="text-muted-foreground mb-4">{t.adminPanel.employees.none}</p>
                  <Button
                    onClick={() => openEmployeeDialog()}
                    className="gap-2"
                  >
                    <Plus size={20} />
                    {t.adminPanel.employees.addFirst}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {users.map((user) => (
                    <motion.div
                      key={user.email}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 rounded-md border bg-card hover:border-primary/40 transition-colors group relative"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-md flex items-center justify-center text-white font-bold ${
                          user.role === 'creator' 
                            ? 'bg-accent' 
                            : user.role === 'manager'
                            ? 'bg-primary'
                            : 'bg-muted-foreground'
                        }`}>
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{user.fullName}</div>
                          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        {getRoleBadge(user.role)}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-primary/10"
                            onClick={() => openEmployeeDialog(user)}
                          >
                            <PencilSimple size={16} />
                          </Button>
                          {user.email.toLowerCase() !== creatorEmail && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash size={16} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t.adminPanel.employees.deleteTitle}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t.adminPanel.employees.deleteConfirmPrefix} <strong>{user.fullName}</strong>{t.adminPanel.employees.deleteConfirmSuffix}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteEmployee(user.email)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {t.adminPanel.employees.deleteAction}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Tag size={28} className="text-accent" weight="duotone" />
                  <h2 className="text-2xl font-bold">{t.adminPanel.roles.title}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-sm">
                    {shiftRoles.length} {shiftRoles.length === 1 ? t.adminPanel.roles.singular : t.adminPanel.roles.plural}
                  </Badge>
                  <Button
                    onClick={() => setShowRoleDialog(true)}
                    size="sm"
                    className="gap-2"
                  >
                    <Plus size={16} />
                    {t.adminPanel.roles.add}
                  </Button>
                </div>
              </div>

              <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  {t.adminPanel.roles.description}
                </p>
              </div>

              {shiftRoles.length === 0 ? (
                <div className="text-center py-12">
                  <Tag size={48} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                  <p className="text-muted-foreground mb-4">{t.adminPanel.roles.none}</p>
                  <Button
                    onClick={() => setShowRoleDialog(true)}
                    className="gap-2"
                  >
                    <Plus size={20} />
                    {t.adminPanel.roles.addFirst}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {shiftRoles.map((role) => (
                    <motion.div
                      key={role.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-4 rounded-md border bg-card hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div
                          className="w-12 h-12 rounded-md flex items-center justify-center"
                          style={{ 
                            backgroundColor: `${role.color}30`,
                            border: `2px solid ${role.color}`
                          }}
                        >
                          <Tag size={24} style={{ color: role.color }} weight="duotone" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-lg">{role.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {t.adminPanel.roles.colorPrefix}: <span className="font-mono">{role.color}</span>
                          </div>
                        </div>
                        <div
                          className="px-4 py-2 rounded-lg font-semibold"
                          style={{ 
                            backgroundColor: `${role.color}20`,
                            color: role.color,
                            border: `2px solid ${role.color}`
                          }}
                        >
                          {t.adminPanel.roles.example}
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 aria-busy:opacity-100 transition-opacity"
                          >
                            <Trash size={20} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t.adminPanel.roles.deleteTitle}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.adminPanel.roles.deleteConfirmPrefix} <strong>{role.name}</strong>{t.adminPanel.roles.deleteConfirmSuffix}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteRole(role.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t.adminPanel.roles.deleteAction}
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
        </Tabs>

        <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.adminPanel.roleDialog.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="role-name">{t.adminPanel.roleDialog.nameLabel}</Label>
                <Input
                  id="role-name"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder={t.adminPanel.roleDialog.namePlaceholder}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                />
              </div>
              <div>
                <Label htmlFor="role-color">{t.adminPanel.roleDialog.colorLabel}</Label>
                <div className="flex gap-2">
                  <Input
                    id="role-color"
                    type="color"
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                    className="w-20 h-10"
                  />
                  <Input
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                    className="flex-1 font-mono"
                  />
                </div>
              </div>
              <Button onClick={handleAddRole} className="w-full gap-2">
                <Plus size={20} />
                {t.adminPanel.roleDialog.submit}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showEmployeeDialog} onOpenChange={setShowEmployeeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEmployee ? t.adminPanel.employeeDialog.editTitle : t.adminPanel.employeeDialog.addTitle}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="employee-name">{t.adminPanel.employeeDialog.fullNameLabel}</Label>
                <Input
                  id="employee-name"
                  value={employeeForm.fullName}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, fullName: e.target.value })}
                  placeholder={t.adminPanel.employeeDialog.fullNamePlaceholder}
                />
              </div>
              <div>
                <Label htmlFor="employee-email">{t.adminPanel.employeeDialog.emailLabel}</Label>
                <Input
                  id="employee-email"
                  type="email"
                  value={employeeForm.email}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                  placeholder={t.adminPanel.employeeDialog.emailPlaceholder}
                  disabled={!!editingEmployee}
                />
                {editingEmployee && (
                  <p className="text-xs text-muted-foreground mt-1">{t.adminPanel.employeeDialog.emailImmutableHint}</p>
                )}
              </div>
              <div>
                <Label htmlFor="employee-password">{t.adminPanel.employeeDialog.passwordLabel} {editingEmployee && t.adminPanel.employeeDialog.passwordKeepHint}</Label>
                <Input
                  id="employee-password"
                  type="password"
                  value={employeeForm.password}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                  placeholder={editingEmployee ? t.adminPanel.employeeDialog.passwordPlaceholderKeep : t.adminPanel.employeeDialog.passwordPlaceholderNew}
                />
              </div>
              <div>
                <Label htmlFor="employee-role">{t.adminPanel.employeeDialog.roleLabel}</Label>
                <Select
                  value={employeeForm.role}
                  onValueChange={(value) => setEmployeeForm({ ...employeeForm, role: value as UserRole })}
                >
                  <SelectTrigger id="employee-role">
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
              </div>
              <Button onClick={() => runBusy('save-employee', handleSaveEmployee)} loading={busyAction === 'save-employee'} className="w-full gap-2">
                {editingEmployee ? (
                  <>
                    <PencilSimple size={20} />
                    {t.adminPanel.employeeDialog.saveChanges}
                  </>
                ) : (
                  <>
                    <Plus size={20} />
                    {t.adminPanel.employeeDialog.createEmployee}
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
