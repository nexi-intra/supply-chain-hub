import { useState, useEffect, useRef } from 'react'
import { NisseSpot } from '@/components/christmas/NisseSpot'
import { motion } from 'framer-motion'
import { ArrowLeft, Plus, User, CheckCircle, Circle, Clock, FolderOpen, MagnifyingGlass, Funnel, Trash, X, UserPlus, PencilSimple, CalendarBlank } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { AutoText } from '@/components/AutoText'
import { TranslationNote, TranslationScope } from '@/components/TranslationScope'
import { useKV } from '@/hooks/useKV'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/contexts/LanguageContext'
import { newId } from '@/lib/utils'
import { updateKvArrayItem, removeFromKvArray } from '@/lib/kvArrays'
import { createTeamTodo } from '@/lib/moduleWrites'
import { saveInBackground } from '@/lib/saveInBackground'
import { createPersonalTodo, personalTodoScheduleProblem, personalTodosKey, type PersonalTodo } from '@/lib/personalTodos'
import { formatShiftTime, resolveShiftTime, toShiftTime } from '@/lib/shiftTimes'
import { TimeRangeFields } from '@/components/TimeRangeFields'
import { todoDueStatus } from '@/lib/todoDueDates'
import { DatePickerField } from '@/components/DatePickerField'
import { isAnyModalOpen } from '@/lib/modalStack'
import { consumeNavigationParams, peekNavigationParams } from '@/lib/appNavigation'
import { format } from 'date-fns'
import { da, enUS, fi, sv } from 'date-fns/locale'

interface ProjectBoardProps {
  onNavigateBack: () => void
  userEmail: string
}

export type ProjectStatus = 'open' | 'in-progress' | 'completed'

export interface TeamMember {
  email: string
  name: string
  assignedAt: string
}

export interface Project {
  id: string
  title: string
  description: string
  createdBy: string
  createdByName: string
  createdAt: string
  status: ProjectStatus
  teamMembers?: TeamMember[]
  completedAt?: string
  /** Valgfri forfaldsdato (YYYY-MM-DD) - naar opgaven skal vaere lavet. */
  dueDate?: string
  /** Valgfrit 'HH:mm' paa dueDate. */
  startTime?: string
  endTime?: string
}

// Personlig to-do-liste pr. bruger (todos-personal-<email>) - kun ejeren kan skrive.
// (PersonalTodo-typen er delt via src/lib/personalTodos.ts - se dens brug i HubAssistant.tsx)

export function ProjectBoard({ onNavigateBack, userEmail }: ProjectBoardProps) {
  const { t, language } = useLanguage()
  // Skrivninger sker via atomare kvArrays-helpers; useKV holder listen synkroniseret.
  const [projects] = useKV<Project[]>('projects', [])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const pendingProject = useRef<{ id: string; createdAt: string } | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editProjectTitle, setEditProjectTitle] = useState('')
  const [editProjectDescription, setEditProjectDescription] = useState('')
  const [editProjectDueDate, setEditProjectDueDate] = useState('')
  const [editProjectStart, setEditProjectStart] = useState('')
  const [editProjectEnd, setEditProjectEnd] = useState('')
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false)
  const [initialNavParams] = useState(() => peekNavigationParams())
  useEffect(() => { consumeNavigationParams() }, [])
  const [activeTab, setActiveTab] = useState<'team' | 'personal'>(() => initialNavParams?.tab === 'personal' ? 'personal' : 'team')
  const [searchQuery, setSearchQuery] = useState(() => initialNavParams?.search ?? '')
  const [filterUser, setFilterUser] = useState<'all' | 'my' | 'unassigned'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest')
  const [currentUserName, setCurrentUserName] = useState('')
  // Personlige to-do's ligger under en per-bruger-noegle, adskilt fra team-to-do's.
  const personalKey = personalTodosKey(userEmail)
  const [personalTodos] = useKV<PersonalTodo[]>(personalKey, [])
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [newTodoDescription, setNewTodoDescription] = useState('')
  const [newTodoDueDate, setNewTodoDueDate] = useState('')
  const [newTodoKind, setNewTodoKind] = useState<'todo' | 'event'>('todo')
  const [newTodoStart, setNewTodoStart] = useState('')
  const [newTodoEnd, setNewTodoEnd] = useState('')
  const [isPersonalCreateOpen, setIsPersonalCreateOpen] = useState(false)
  const pendingPersonalTodo = useRef<{ id: string; createdAt: string } | null>(null)
  const [editingTodo, setEditingTodo] = useState<PersonalTodo | null>(null)
  const [editTodoTitle, setEditTodoTitle] = useState('')
  const [editTodoDescription, setEditTodoDescription] = useState('')
  const [editTodoDueDate, setEditTodoDueDate] = useState('')
  const [editTodoKind, setEditTodoKind] = useState<'todo' | 'event'>('todo')
  const [editTodoStart, setEditTodoStart] = useState('')
  const [editTodoEnd, setEditTodoEnd] = useState('')
  const [isEditTodoOpen, setIsEditTodoOpen] = useState(false)
  const tr = (daText: string, en: string, fiText: string, svText: string) => language === 'da' ? daText : language === 'fi' ? fiText : language === 'sv' ? svText : en
  const scheduleMessage = (problem: 'MISSING_DATE' | 'INVALID_TIME') => problem === 'MISSING_DATE'
    ? tr('Vælg en dato - et tidspunkt eller en aftale skal ligge på en dag', 'Choose a date - a time or an appointment needs a day', 'Valitse päivä - kellonaika tai tapaaminen tarvitsee päivän', 'Välj ett datum - en tid eller ett möte behöver en dag')
    : tr('Sluttiden skal ligge efter starttiden', 'The end time must be after the start time', 'Päättymisajan on oltava alkamisajan jälkeen', 'Sluttiden måste vara efter starttiden')
  const renderTimeFields = (id: string, start: string, setStart: (value: string) => void, end: string, setEnd: (value: string) => void, disabled?: boolean) => (
    <TimeRangeFields
      id={id}
      label={tr('Tidspunkt (valgfrit)', 'Time (optional)', 'Kellonaika (valinnainen)', 'Tid (valfritt)')}
      start={start}
      end={end}
      onStart={setStart}
      onEnd={setEnd}
      disabled={disabled}
      hint={tr('Ligger på datoen ovenfor. Sluttid er valgfri.', 'On the date above. The end time is optional.', 'Yllä olevana päivänä. Päättymisaika on valinnainen.', 'På datumet ovan. Sluttid är valfritt.')}
      clearText={tr('Ryd', 'Clear', 'Tyhjennä', 'Rensa')}
      startLabel={tr('Starttid', 'Start time', 'Alkamisaika', 'Starttid')}
      endLabel={tr('Sluttid', 'End time', 'Päättymisaika', 'Sluttid')}
    />
  )
  const renderKindToggle = (id: string, kind: 'todo' | 'event', setKind: (value: 'todo' | 'event') => void, disabled?: boolean) => (
    <div role="radiogroup" aria-label={tr('Type', 'Type', 'Tyyppi', 'Typ')} className="grid grid-cols-2 gap-2" data-todo-kind={id}>
      {(['todo', 'event'] as const).map(value => (
        <Button
          key={value}
          type="button"
          role="radio"
          aria-checked={kind === value}
          variant={kind === value ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => setKind(value)}
        >
          {value === 'todo' ? 'To-do' : tr('Aftale', 'Appointment', 'Tapaaminen', 'Möte')}
        </Button>
      ))}
    </div>
  )
  const dateLabel = (kind: 'todo' | 'event') => kind === 'event'
    ? `${tr('Dato', 'Date', 'Päivä', 'Datum')} *`
    : language === 'da' ? 'Forfaldsdato (valgfri)' : language === 'fi' ? 'Määräaika (valinnainen)' : language === 'sv' ? 'Förfallodatum (valfritt)' : 'Due date (optional)'

  useEffect(() => {
    const loadUserName = async () => {
      const users = await window.kv.get<Record<string, { fullName: string }>>('users') || {}
      const userName = users[userEmail]?.fullName || userEmail
      setCurrentUserName(userName)
    }
    loadUserName()
  }, [userEmail])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isCreateDialogOpen) { setIsCreateDialogOpen(false); return }
      if (isPersonalCreateOpen) { setIsPersonalCreateOpen(false); return }
      if (isEditProjectOpen) { setIsEditProjectOpen(false); return }
      if (isEditTodoOpen) { setIsEditTodoOpen(false); return }
      if (isAnyModalOpen()) return
      onNavigateBack()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onNavigateBack, isCreateDialogOpen, isPersonalCreateOpen, isEditProjectOpen, isEditTodoOpen])

  const handleCreateProject = () => {
    if (!newTitle.trim()) {
      toast.error(language === 'da' ? 'Titel er påkrævet' : language === 'fi' ? 'Otsikko vaaditaan' : language === 'sv' ? 'Titel krävs' : 'Title is required')
      return
    }
    const createProblem = personalTodoScheduleProblem(newDueDate, { startTime: newStart, endTime: newEnd })
    if (createProblem) {
      toast.error(scheduleMessage(createProblem))
      return
    }

    // A retry after a failed save reuses the identity, so a write that did reach the drive is not added twice.
    const creation = pendingProject.current || { id: newId('project'), createdAt: new Date().toISOString() }
    pendingProject.current = null
    const draft = { title: newTitle, description: newDescription, dueDate: newDueDate, start: newStart, end: newEnd }
    // Lukker og kvitterer straks: listen viser den nye to-do med det samme (kvArrays). Fejler gemningen, åbnes dialogen igen med teksten.
    setIsCreateDialogOpen(false)
    setNewTitle('')
    setNewDescription('')
    setNewDueDate('')
    setNewStart('')
    setNewEnd('')
    toast.success(language === 'da' ? 'To-do oprettet' : language === 'fi' ? 'To-do luotu' : language === 'sv' ? 'Uppgift skapad' : 'To-do created')
    void createTeamTodo({ userEmail, userName: currentUserName, title: draft.title, description: draft.description, dueDate: draft.dueDate, startTime: draft.start, endTime: draft.end, identity: creation }).catch(error => {
      console.error('Kunne ikke oprette to-do:', error)
      setNewTitle(current => current || draft.title)
      setNewDescription(current => current || draft.description)
      setNewDueDate(current => current || draft.dueDate)
      setNewStart(current => current || draft.start)
      setNewEnd(current => current || draft.end)
      pendingProject.current = creation
      setIsCreateDialogOpen(true)
      toast.error(language === 'da' ? 'To-do blev ikke gemt — prøv igen' : language === 'fi' ? 'To-do ei tallentunut — yritä uudelleen' : language === 'sv' ? 'Uppgiften sparades inte — försök igen' : 'To-do was not saved — please try again')
    })
  }

  const failedSave = () => tr('Ændringen blev ikke gemt — prøv igen', 'The change was not saved — please try again', 'Muutosta ei tallennettu — yritä uudelleen', 'Ändringen sparades inte — försök igen')

  const handleJoinProject = (projectId: string) => {
    // Atomar pr.-projekt-opdatering — to samtidige tilmeldinger taber ikke hinanden. Listen opdateres straks (kvArrays).
    void saveInBackground(updateKvArrayItem<Project>('projects', projectId, (p) => {
      const teamMembers = p.teamMembers || []
      if (teamMembers.some((m) => m.email === userEmail)) return p
      return {
        ...p,
        status: 'in-progress' as ProjectStatus,
        teamMembers: [...teamMembers, { email: userEmail, name: currentUserName, assignedAt: new Date().toISOString() }],
      }
    }), { success: tr('Du er nu med i projektet', 'You joined the project', 'Liityit projektiin.', 'Du är nu med i projektet'), failure: failedSave() })
  }

  const handleLeaveProject = (projectId: string) => {
    void saveInBackground(updateKvArrayItem<Project>('projects', projectId, (p) => {
      const updatedMembers = (p.teamMembers || []).filter((m) => m.email !== userEmail)
      return {
        ...p,
        teamMembers: updatedMembers,
        status: updatedMembers.length === 0 ? ('open' as ProjectStatus) : p.status,
      }
    }), { success: tr('Du har forladt projektet', 'You left the project', 'Lähdit projektista.', 'Du har lämnat projektet'), failure: failedSave() })
  }

  const handleRemoveProject = (projectId: string) => {
    void saveInBackground(removeFromKvArray('projects', [projectId]), { success: tr('Projekt slettet', 'Project deleted', 'Projekti poistettu', 'Projektet har tagits bort'), failure: failedSave() })
  }

  const handleCompleteProject = (projectId: string) => {
    void saveInBackground(updateKvArrayItem<Project>('projects', projectId, (p) => ({
      ...p,
      status: 'completed' as ProjectStatus,
      completedAt: new Date().toISOString(),
    })), { success: tr('Projekt markeret som færdigt', 'Project marked as completed', 'Projekti merkitty valmiiksi', 'Projektet har markerats som klart'), failure: failedSave() })
  }

  const openEditProject = (project: Project) => {
    setEditingProject(project)
    setEditProjectTitle(project.title)
    setEditProjectDescription(project.description)
    setEditProjectDueDate(project.dueDate || '')
    setEditProjectStart(project.startTime || '')
    setEditProjectEnd(project.endTime || '')
    setIsEditProjectOpen(true)
  }

  const handleEditProject = async () => {
    if (!editingProject) return
    if (!editProjectTitle.trim()) {
      toast.error(language === 'da' ? 'Titel er påkrævet' : language === 'fi' ? 'Otsikko vaaditaan' : language === 'sv' ? 'Titel krävs' : 'Title is required')
      return
    }
    const editProblem = personalTodoScheduleProblem(editProjectDueDate, { startTime: editProjectStart, endTime: editProjectEnd })
    if (editProblem) {
      toast.error(scheduleMessage(editProblem))
      return
    }
    // Dialogen lukker straks; listen viser ændringen med det samme (kvArrays), gemningen melder sig selv.
    setIsEditProjectOpen(false)
    setEditingProject(null)
    void saveInBackground(updateKvArrayItem<Project>('projects', editingProject.id, (p) => ({
      ...p,
      title: editProjectTitle.trim(),
      description: editProjectDescription.trim(),
      dueDate: editProjectDueDate.trim() || undefined,
      ...toShiftTime(editProjectStart, editProjectEnd),
    })), { success: tr('To-do opdateret', 'To-do updated', 'To-do päivitetty', 'Uppgift uppdaterad'), failure: failedSave() })
  }

  const getFilteredProjects = () => {
    const projectList = projects || []
    let filtered = [...projectList]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.createdByName.toLowerCase().includes(query) ||
          (p.teamMembers || []).some((m) => m.name.toLowerCase().includes(query))
      )
    }

    if (filterUser === 'my') {
      filtered = filtered.filter((p) => (p.teamMembers || []).some((m) => m.email === userEmail) || p.createdBy === userEmail)
    } else if (filterUser === 'unassigned') {
      filtered = filtered.filter((p) => (p.teamMembers || []).length === 0)
    }

    return filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB
    })
  }

  const openProjects = getFilteredProjects().filter((p) => p.status === 'open')
  const inProgressProjects = getFilteredProjects().filter((p) => p.status === 'in-progress')
  const completedProjects = getFilteredProjects().filter((p) => p.status === 'completed')

  const handleAddTodo = () => {
    const title = newTodoTitle.trim()
    if (!title) {
      toast.error(language === 'da' ? 'Titel er påkrævet' : language === 'fi' ? 'Otsikko vaaditaan' : language === 'sv' ? 'Titel krävs' : 'Title is required')
      return
    }
    const schedule = { kind: newTodoKind, startTime: newTodoStart, endTime: newTodoEnd }
    const addProblem = personalTodoScheduleProblem(newTodoDueDate, schedule)
    if (addProblem) {
      toast.error(scheduleMessage(addProblem))
      return
    }
    const creation = pendingPersonalTodo.current || { id: newId('todo'), createdAt: new Date().toISOString() }
    pendingPersonalTodo.current = null
    const draft = { title: newTodoTitle, description: newTodoDescription, dueDate: newTodoDueDate, kind: newTodoKind, start: newTodoStart, end: newTodoEnd }
    // Lukker og kvitterer straks (listen viser to-do'en med det samme); fejler gemningen, åbnes dialogen igen med teksten.
    setIsPersonalCreateOpen(false)
    setNewTodoTitle('')
    setNewTodoDescription('')
    setNewTodoDueDate('')
    setNewTodoKind('todo')
    setNewTodoStart('')
    setNewTodoEnd('')
    toast.success(language === 'da' ? 'To-do oprettet' : language === 'fi' ? 'To-do luotu' : language === 'sv' ? 'Uppgift skapad' : 'To-do created')
    void createPersonalTodo(userEmail, title, draft.description, draft.dueDate, creation, schedule).catch(error => {
      console.error('Kunne ikke tilføje to-do:', error)
      setNewTodoTitle(current => current || draft.title)
      setNewTodoDescription(current => current || draft.description)
      setNewTodoDueDate(current => current || draft.dueDate)
      setNewTodoKind(draft.kind)
      setNewTodoStart(current => current || draft.start)
      setNewTodoEnd(current => current || draft.end)
      pendingPersonalTodo.current = creation
      setIsPersonalCreateOpen(true)
      toast.error(language === 'da' ? 'Kunne ikke tilføje to-do' : language === 'fi' ? 'Lisäys epäonnistui' : language === 'sv' ? 'Det gick inte att lägga till uppgiften' : 'Could not add to-do')
    })
  }
  const todoStatus = (todo: PersonalTodo): ProjectStatus => todo.status ?? (todo.done ? 'completed' : 'open')
  const handleStartTodo = (id: string) => {
    void saveInBackground(updateKvArrayItem<PersonalTodo>(personalKey, id, (todo) => ({ ...todo, status: 'in-progress', done: false, completedAt: undefined })), { failure: failedSave() })
  }
  const handleCompleteTodo = (id: string) => {
    void saveInBackground(updateKvArrayItem<PersonalTodo>(personalKey, id, (todo) => ({ ...todo, status: 'completed', done: true, completedAt: new Date().toISOString() })), { success: tr('To-do markeret som færdig', 'To-do marked as completed', 'To-do merkitty valmiiksi', 'Uppgift markerad som klar'), failure: failedSave() })
  }
  const handleReopenTodo = (id: string) => {
    void saveInBackground(updateKvArrayItem<PersonalTodo>(personalKey, id, (todo) => ({ ...todo, status: 'open', done: false, completedAt: undefined })), { failure: failedSave() })
  }
  const handleDeleteTodo = (id: string) => {
    void saveInBackground(removeFromKvArray<PersonalTodo>(personalKey, [id]), { success: tr('To-do slettet', 'To-do deleted', 'To-do poistettu', 'Uppgift borttagen'), failure: failedSave() })
  }
  const openEditTodo = (todo: PersonalTodo) => {
    setEditingTodo(todo)
    setEditTodoTitle(todo.title)
    setEditTodoDescription(todo.description || '')
    setEditTodoDueDate(todo.dueDate || '')
    setEditTodoKind(todo.kind === 'event' ? 'event' : 'todo')
    setEditTodoStart(todo.startTime || '')
    setEditTodoEnd(todo.endTime || '')
    setIsEditTodoOpen(true)
  }
  const handleEditTodo = async () => {
    if (!editingTodo) return
    if (!editTodoTitle.trim()) {
      toast.error(language === 'da' ? 'Titel er påkrævet' : language === 'fi' ? 'Otsikko vaaditaan' : language === 'sv' ? 'Titel krävs' : 'Title is required')
      return
    }
    const editTodoProblem = personalTodoScheduleProblem(editTodoDueDate, { kind: editTodoKind, startTime: editTodoStart, endTime: editTodoEnd })
    if (editTodoProblem) {
      toast.error(scheduleMessage(editTodoProblem))
      return
    }
    setIsEditTodoOpen(false)
    setEditingTodo(null)
    void saveInBackground(updateKvArrayItem<PersonalTodo>(personalKey, editingTodo.id, (todo) => ({
      ...todo,
      title: editTodoTitle.trim(),
      description: editTodoDescription.trim(),
      dueDate: editTodoDueDate.trim() || undefined,
      kind: editTodoKind === 'event' ? 'event' : undefined,
      ...toShiftTime(editTodoStart, editTodoEnd),
    })), { success: tr('To-do opdateret', 'To-do updated', 'To-do päivitetty', 'Uppgift uppdaterad'), failure: failedSave() })
  }
  const renderPersonalTodoCard = (todo: PersonalTodo) => {
    const status = todoStatus(todo)
    const isEvent = todo.kind === 'event'
    return (
      <motion.div
        key={todo.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <TranslationScope>
        <Card className="p-5 transition-colors hover:border-primary/40" data-personal-todo={todo.id}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground mb-2"><AutoText text={todo.title} /></h3>
              {isEvent ? (
                <Badge variant="outline" className="text-xs font-semibold">{tr('Aftale', 'Appointment', 'Tapaaminen', 'Möte')}</Badge>
              ) : (
                <Badge className={`${getStatusColor(status)} text-xs font-semibold`}>
                  {getStatusLabel(status)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => openEditTodo(todo)}
                title={language === 'da' ? 'Redigér' : language === 'fi' ? 'Muokkaa' : language === 'sv' ? 'Redigera' : 'Edit'}
              >
                <PencilSimple size={16} weight="duotone" />
              </Button>
              <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash size={16} weight="duotone" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{language === 'da' ? 'Slet to-do?' : language === 'fi' ? 'Poista to-do?' : language === 'sv' ? 'Ta bort uppgiften?' : 'Delete to-do?'}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {language === 'da'
                      ? 'Er du sikker på, at du vil slette denne to-do? Denne handling kan ikke fortrydes.'
                      : language === 'fi' ? 'Haluatko varmasti poistaa tämän to-do:n? Tätä toimintaa ei voida perua.' : language === 'sv' ? 'Är du säker på att du vill ta bort den här uppgiften? Åtgärden kan inte ångras.' : 'Are you sure you want to delete this to-do? This action cannot be undone.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : language === 'sv' ? 'Avbryt' : 'Cancel'}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {language === 'da' ? 'Slet' : language === 'fi' ? 'Poista' : language === 'sv' ? 'Ta bort' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          </div>

          {todo.description && (
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed"><AutoText text={todo.description} /></p>
          )}
          <TranslationNote className="-mt-2 mb-4" />

          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock size={14} weight="duotone" />
              <span>
                {language === 'da' ? 'Oprettet' : language === 'fi' ? 'Luotu' : language === 'sv' ? 'Skapad' : 'Created'}: {formatDate(todo.createdAt)}
              </span>
            </div>
            {renderDueDate(todo.dueDate, status === 'completed', todo, isEvent)}
            {todo.completedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle size={14} weight="duotone" />
                <span>
                  {language === 'da' ? 'Færdiggjort' : language === 'fi' ? 'Valmis' : language === 'sv' ? 'Slutförd' : 'Completed'}: {formatDate(todo.completedAt)}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!isEvent && status === 'open' && (
              <Button
                onClick={() => handleStartTodo(todo.id)}
                className="flex-1"
                size="sm"
              >
                <Clock size={16} weight="duotone" className="mr-2" />
                {language === 'da' ? 'Start' : language === 'fi' ? 'Aloita' : language === 'sv' ? 'Starta' : 'Start'}
              </Button>
            )}
            {!isEvent && status === 'in-progress' && (
              <Button
                onClick={() => handleCompleteTodo(todo.id)}
                className="flex-1 bg-ok text-white hover:bg-ok/90"
                size="sm"
              >
                <CheckCircle size={16} weight="duotone" className="mr-2" />
                {language === 'da' ? 'Marker som færdig' : language === 'fi' ? 'Merkitse valmis' : language === 'sv' ? 'Markera som klar' : 'Mark as completed'}
              </Button>
            )}
            {!isEvent && status === 'completed' && (
              <Button
                onClick={() => handleReopenTodo(todo.id)}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                <Circle size={16} weight="duotone" className="mr-2" />
                {language === 'da' ? 'Genåbn' : language === 'fi' ? 'Avaa uudelleen' : language === 'sv' ? 'Öppna igen' : 'Reopen'}
              </Button>
            )}
          </div>
        </Card>
        </TranslationScope>
      </motion.div>
    )
  }
  const renderPersonalTodos = () => {
    const sorted = [...(personalTodos || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    // An appointment has no status: it is open until its day has passed.
    const today = format(new Date(), 'yyyy-MM-dd')
    const column = (todo: PersonalTodo): ProjectStatus => todo.kind === 'event' ? ((todo.dueDate || '') < today ? 'completed' : 'open') : todoStatus(todo)
    const openTodos = sorted.filter((todo) => column(todo) === 'open')
    const inProgressTodos = sorted.filter((todo) => column(todo) === 'in-progress')
    const completedTodos = sorted.filter((todo) => column(todo) === 'completed')
    return (
      <div>
        <div className="mb-6">
          <Dialog open={isPersonalCreateOpen} onOpenChange={(open) => { if (open) pendingPersonalTodo.current = null; setIsPersonalCreateOpen(open) }}>
            <DialogTrigger asChild>
              <Button
                size="lg"
              >
                <Plus size={20} weight="bold" className="mr-2" />
                {language === 'da' ? 'Opret to-do' : language === 'fi' ? 'Luo to-do' : language === 'sv' ? 'Skapa uppgift' : 'Create to-do'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  {language === 'da' ? 'Opret ny to-do' : language === 'fi' ? 'Luo uusi to-do' : language === 'sv' ? 'Skapa ny uppgift' : 'Create new to-do'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {renderKindToggle('new', newTodoKind, value => { pendingPersonalTodo.current = null; setNewTodoKind(value) })}
                <div className="space-y-2">
                  <Label htmlFor="todo-title">{language === 'da' ? 'Titel' : language === 'fi' ? 'Otsikko' : language === 'sv' ? 'Titel' : 'Title'} *</Label>
                  <Input
                    id="todo-title"
                    value={newTodoTitle}
                    onChange={(e) => { pendingPersonalTodo.current = null; setNewTodoTitle(e.target.value) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddTodo() } }}
                    placeholder={language === 'da' ? 'Indtast to-do titel' : language === 'fi' ? 'Anna to-do nimi' : language === 'sv' ? 'Ange uppgiftens titel' : 'Enter to-do title'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="todo-description">{language === 'da' ? 'Beskrivelse' : language === 'fi' ? 'Kuvaus' : language === 'sv' ? 'Beskrivning' : 'Description'}</Label>
                  <Textarea
                    id="todo-description"
                    value={newTodoDescription}
                    onChange={(e) => { pendingPersonalTodo.current = null; setNewTodoDescription(e.target.value) }}
                    placeholder={language === 'da' ? 'Indtast to-do beskrivelse' : language === 'fi' ? 'Anna to-do kuvaus' : language === 'sv' ? 'Ange uppgiftens beskrivning' : 'Enter to-do description'}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="todo-due-date">{dateLabel(newTodoKind)}</Label>
                  <DatePickerField
                    id="todo-due-date"
                    value={newTodoDueDate}
                    onChange={(date) => { pendingPersonalTodo.current = null; setNewTodoDueDate(date) }}
                  />
                </div>
                {renderTimeFields('todo-time', newTodoStart, value => { pendingPersonalTodo.current = null; setNewTodoStart(value) }, newTodoEnd, value => { pendingPersonalTodo.current = null; setNewTodoEnd(value) })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsPersonalCreateOpen(false)}>
                  {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : language === 'sv' ? 'Avbryt' : 'Cancel'}
                </Button>
                <Button
                  onClick={() => handleAddTodo()}
                >
                  {language === 'da' ? 'Opret' : language === 'fi' ? 'Luo' : language === 'sv' ? 'Skapa' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditTodoOpen} onOpenChange={setIsEditTodoOpen}>
            <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle className="text-2xl font-bold">
                  {language === 'da' ? 'Redigér to-do' : language === 'fi' ? 'Muokkaa to-do' : language === 'sv' ? 'Redigera uppgift' : 'Edit to-do'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0 pr-2 -mr-2">
                {renderKindToggle('edit', editTodoKind, setEditTodoKind)}
                <div className="space-y-2">
                  <Label htmlFor="edit-todo-title">{language === 'da' ? 'Titel' : language === 'fi' ? 'Otsikko' : language === 'sv' ? 'Titel' : 'Title'} *</Label>
                  <Input
                    id="edit-todo-title"
                    value={editTodoTitle}
                    onChange={(e) => setEditTodoTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleEditTodo() } }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-todo-description">{language === 'da' ? 'Beskrivelse' : language === 'fi' ? 'Kuvaus' : language === 'sv' ? 'Beskrivning' : 'Description'}</Label>
                  <Textarea
                    id="edit-todo-description"
                    value={editTodoDescription}
                    onChange={(e) => setEditTodoDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-todo-due-date">{dateLabel(editTodoKind)}</Label>
                  <DatePickerField
                    id="edit-todo-due-date"
                    value={editTodoDueDate}
                    onChange={setEditTodoDueDate}
                  />
                </div>
                {renderTimeFields('edit-todo-time', editTodoStart, setEditTodoStart, editTodoEnd, setEditTodoEnd)}
              </div>
              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={() => setIsEditTodoOpen(false)}>
                  {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : language === 'sv' ? 'Avbryt' : 'Cancel'}
                </Button>
                <Button
                  onClick={() => handleEditTodo()}
                >
                  {language === 'da' ? 'Gem' : language === 'fi' ? 'Tallenna' : language === 'sv' ? 'Spara' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-md bg-secondary text-primary">
                <FolderOpen size={24} weight="duotone" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {language === 'da' ? 'Åbne' : language === 'fi' ? 'Avaa' : language === 'sv' ? 'Öppna' : 'Open'} ({openTodos.length})
              </h2>
            </div>
            <div className="space-y-4">{openTodos.map((todo) => renderPersonalTodoCard(todo))}</div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-md bg-attention-surface text-attention">
                <Clock size={24} weight="duotone" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {language === 'da' ? 'I gang' : language === 'fi' ? 'Edistyminen' : language === 'sv' ? 'Pågående' : 'In Progress'} ({inProgressTodos.length})
              </h2>
            </div>
            <div className="space-y-4">{inProgressTodos.map((todo) => renderPersonalTodoCard(todo))}</div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-md bg-ok-surface text-ok">
                <CheckCircle size={24} weight="duotone" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {language === 'da' ? 'Færdige' : language === 'fi' ? 'Valmis' : language === 'sv' ? 'Klara' : 'Completed'} ({completedTodos.length})
              </h2>
            </div>
            <div className="space-y-4">{completedTodos.map((todo) => renderPersonalTodoCard(todo))}</div>
          </div>
        </div>
      </div>
    )
  }

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'open':
        return 'bg-[oklch(0.52_0.11_255)] text-white'
      case 'in-progress':
        return 'bg-[oklch(0.65_0.13_75)] text-white'
      case 'completed':
        return 'bg-[oklch(0.55_0.13_150)] text-white'
    }
  }

  const getStatusLabel = (status: ProjectStatus) => {
    if (language === 'da') {
      switch (status) {
        case 'open':
          return 'Åben'
        case 'in-progress':
          return 'I gang'
        case 'completed':
          return 'Færdig'
      }
    } else if (language === 'fi') {
      switch (status) {
        case 'open':
          return 'Avoin'
        case 'in-progress':
          return 'Käynnissä'
        case 'completed':
          return 'Valmis'
      }
    } else if (language === 'sv') {
      switch (status) {
        case 'open':
          return 'Öppen'
        case 'in-progress':
          return 'Pågående'
        case 'completed':
          return 'Klar'
      }
    } else {
      switch (status) {
        case 'open':
          return 'Open'
        case 'in-progress':
          return 'In Progress'
        case 'completed':
          return 'Completed'
      }
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return format(date, 'dd MMM yyyy, HH:mm', { locale: language === 'da' ? da : language === 'fi' ? fi : language === 'sv' ? sv : enUS })
  }

  const renderDueDate = (dueDate: string | undefined, isCompleted: boolean, time?: { startTime?: string; endTime?: string }, isEvent = false) => {
    if (!dueDate) return null
    const status = isEvent ? 'upcoming' : todoDueStatus(dueDate, isCompleted)
    const colorClass = status === 'overdue' ? 'text-destructive' : status === 'today' ? 'text-amber-600' : 'text-muted-foreground'
    const statusText = status === 'overdue'
      ? (language === 'da' ? ' (overskredet)' : language === 'fi' ? ' (myöhässä)' : language === 'sv' ? ' (försenad)' : ' (overdue)')
      : status === 'today' ? (language === 'da' ? ' (i dag)' : language === 'fi' ? ' (tänään)' : language === 'sv' ? ' (idag)' : ' (today)') : ''
    const clockText = formatShiftTime(resolveShiftTime(time, undefined))
    const label = isEvent ? tr('Dato', 'Date', 'Päivä', 'Datum') : language === 'da' ? 'Forfalder' : language === 'fi' ? 'Määräaika' : language === 'sv' ? 'Förfaller' : 'Due'
    return (
      <div className={`flex items-center gap-2 text-xs ${colorClass}`} data-todo-due>
        <CalendarBlank size={14} weight="duotone" />
        <span>{label}: {dueDate}{clockText ? ` ${tr('kl.', 'at', 'klo', 'kl.')} ${clockText}` : ''}{statusText}</span>
      </div>
    )
  }

  const renderProjectCard = (project: Project) => {
    const teamMembers = project.teamMembers || []
    const isOnTeam = teamMembers.some((m) => m.email === userEmail)
    const isCreatedByMe = project.createdBy === userEmail
    const canDelete = isCreatedByMe || isOnTeam

    return (
      <motion.div
        key={project.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <TranslationScope>
        <Card
          className={`p-5 transition-colors ${
            isOnTeam ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground mb-2"><AutoText text={project.title} /></h3>
              <Badge className={`${getStatusColor(project.status)} text-xs font-semibold`}>
                {getStatusLabel(project.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {isOnTeam && (
                <Badge className="text-xs font-semibold">
                  {language === 'da' ? 'Dit projekt' : language === 'fi' ? 'Projekti' : language === 'sv' ? 'Ditt projekt' : 'Your project'}
                </Badge>
              )}
              {isCreatedByMe && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => openEditProject(project)}
                  title={language === 'da' ? 'Redigér' : language === 'fi' ? 'Muokkaa' : language === 'sv' ? 'Redigera' : 'Edit'}
                >
                  <PencilSimple size={16} weight="duotone" />
                </Button>
              )}
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash size={16} weight="duotone" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{language === 'da' ? 'Slet projekt?' : language === 'fi' ? 'Poista projekti?' : language === 'sv' ? 'Ta bort projektet?' : 'Delete project?'}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {language === 'da' 
                          ? 'Er du sikker på, at du vil slette dette projekt? Denne handling kan ikke fortrydes.'
                          : language === 'fi' ? 'Haluatko varmasti poistaa tämän projektin? Tätä toimintaa ei voida perua.' : language === 'sv' ? 'Är du säker på att du vill ta bort det här projektet? Åtgärden kan inte ångras.' : 'Are you sure you want to delete this project? This action cannot be undone.'}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : language === 'sv' ? 'Avbryt' : 'Cancel'}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemoveProject(project.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {language === 'da' ? 'Slet' : language === 'fi' ? 'Poista' : language === 'sv' ? 'Ta bort' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>

          {project.description && (
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed"><AutoText text={project.description} /></p>
          )}
          <TranslationNote className="-mt-2 mb-4" />

          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User size={14} weight="duotone" />
              <span>
                {language === 'da' ? 'Oprettet af' : language === 'fi' ? 'Luonut' : language === 'sv' ? 'Skapad av' : 'Created by'}: <strong className="text-foreground">{project.createdByName}</strong>
              </span>
            </div>

            {teamMembers.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <UserPlus size={14} weight="duotone" />
                  <span className="font-semibold">
                    {language === 'da' ? 'Teammedlemmer' : language === 'fi' ? 'Ryhmän jäsenet' : language === 'sv' ? 'Teammedlemmar' : 'Team Members'} ({teamMembers.length}):
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 pl-5">
                  {teamMembers.map((member) => (
                    <Badge key={member.email} variant="secondary" className="text-xs">
                      {member.name}
                      {member.email === userEmail && (
                        <button
                          onClick={() => handleLeaveProject(project.id)}
                          className="ml-1 hover:text-destructive transition-colors"
                          title={language === 'da' ? 'Forlad projekt' : language === 'fi' ? 'Jätä projekti' : language === 'sv' ? 'Lämna projektet' : 'Leave project'}
                        >
                          <X size={12} weight="bold" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock size={14} weight="duotone" />
              <span>
                {language === 'da' ? 'Oprettet' : language === 'fi' ? 'Luotu' : language === 'sv' ? 'Skapad' : 'Created'}: {formatDate(project.createdAt)}
              </span>
            </div>
            {renderDueDate(project.dueDate, project.status === 'completed', project)}

            {project.completedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle size={14} weight="duotone" />
                <span>
                  {language === 'da' ? 'Færdiggjort' : language === 'fi' ? 'Valmis' : language === 'sv' ? 'Slutförd' : 'Completed'}: {formatDate(project.completedAt)}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!isOnTeam && project.status !== 'completed' && (
              <Button
                onClick={() => handleJoinProject(project.id)}
                className="flex-1"
                size="sm"
              >
                <UserPlus size={16} weight="duotone" className="mr-2" />
                {language === 'da' ? 'Deltag i projekt' : language === 'fi' ? 'Liity projektiin' : language === 'sv' ? 'Gå med i projektet' : 'Join project'}
              </Button>
            )}

            {project.status === 'in-progress' && isOnTeam && (
              <Button
                onClick={() => handleCompleteProject(project.id)}
                className="flex-1 bg-ok text-white hover:bg-ok/90"
                size="sm"
              >
                <CheckCircle size={16} weight="duotone" className="mr-2" />
                {language === 'da' ? 'Marker som færdig' : language === 'fi' ? 'Merkitse valmis' : language === 'sv' ? 'Markera som klar' : 'Mark as completed'}
              </Button>
            )}
          </div>
        </Card>
        </TranslationScope>
      </motion.div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={onNavigateBack}
              className="bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4"
            >
              <ArrowLeft size={20} />
              {language === 'da' ? 'Tilbage til Hub' : language === 'fi' ? 'Takaisin Hubiin' : language === 'sv' ? 'Tillbaka till Hub' : 'Back to Hub'}
            </Button>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2.5">
                <FolderOpen size={26} weight="duotone" className="text-primary" />
                To Do
                <NisseSpot spot="todo" pose="stand" className="ml-1" />
              </h1>
            </div>
            <div className="w-[140px]"></div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-10">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'team' | 'personal')}>
          <TabsList className="mb-6">
            <TabsTrigger value="team">{language === 'da' ? "Team-to-do's" : language === 'fi' ? "Tiimin to-do't" : language === 'sv' ? "Teamets uppgifter" : "Team to-do's"}</TabsTrigger>
            <TabsTrigger value="personal">{language === 'da' ? "Personlige to-do's" : language === 'fi' ? "Omat to-do't" : language === 'sv' ? "Personliga uppgifter" : "Personal to-do's"}</TabsTrigger>
          </TabsList>
          <TabsContent value="team">
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { if (open) pendingProject.current = null; setIsCreateDialogOpen(open) }}>
            <DialogTrigger asChild>
              <Button
                size="lg"
              >
                <Plus size={20} weight="bold" className="mr-2" />
                {language === 'da' ? 'Opret to-do' : language === 'fi' ? 'Luo to-do' : language === 'sv' ? 'Skapa uppgift' : 'Create to-do'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  {language === 'da' ? 'Opret ny to-do' : language === 'fi' ? 'Luo uusi to-do' : language === 'sv' ? 'Skapa ny uppgift' : 'Create new to-do'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">{language === 'da' ? 'Titel' : language === 'fi' ? 'Osasto' : language === 'sv' ? 'Titel' : 'Title'} *</Label>
                  <Input
                    id="title"
                    value={newTitle}
                    onChange={(e) => { pendingProject.current = null; setNewTitle(e.target.value) }}
                    placeholder={language === 'da' ? 'Indtast to-do titel' : language === 'fi' ? 'Anna to-do nimi' : language === 'sv' ? 'Ange uppgiftens titel' : 'Enter to-do title'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{language === 'da' ? 'Beskrivelse' : language === 'fi' ? 'Tavaran kuvaus' : language === 'sv' ? 'Beskrivning' : 'Description'}</Label>
                  <Textarea
                    id="description"
                    value={newDescription}
                    onChange={(e) => { pendingProject.current = null; setNewDescription(e.target.value) }}
                    placeholder={language === 'da' ? 'Indtast to-do beskrivelse' : language === 'fi' ? 'Anna to-do kuvaus' : language === 'sv' ? 'Ange uppgiftens beskrivning' : 'Enter to-do description'}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due-date">{language === 'da' ? 'Forfaldsdato (valgfri)' : language === 'fi' ? 'Määräaika (valinnainen)' : language === 'sv' ? 'Förfallodatum (valfritt)' : 'Due date (optional)'}</Label>
                  <DatePickerField
                    id="due-date"
                    value={newDueDate}
                    onChange={(date) => { pendingProject.current = null; setNewDueDate(date) }}
                  />
                </div>
                {renderTimeFields('due-time', newStart, value => { pendingProject.current = null; setNewStart(value) }, newEnd, value => { pendingProject.current = null; setNewEnd(value) })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : language === 'sv' ? 'Avbryt' : 'Cancel'}
                </Button>
                <Button
                  onClick={handleCreateProject}
                >
                  {language === 'da' ? 'Opret' : language === 'fi' ? 'Luo' : language === 'sv' ? 'Skapa' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditProjectOpen} onOpenChange={setIsEditProjectOpen}>
            <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle className="text-2xl font-bold">
                  {language === 'da' ? 'Redigér to-do' : language === 'fi' ? 'Muokkaa to-do' : language === 'sv' ? 'Redigera uppgift' : 'Edit to-do'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0 pr-2 -mr-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">{language === 'da' ? 'Titel' : language === 'fi' ? 'Otsikko' : language === 'sv' ? 'Titel' : 'Title'} *</Label>
                  <Input
                    id="edit-title"
                    value={editProjectTitle}
                    onChange={(e) => setEditProjectTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">{language === 'da' ? 'Beskrivelse' : language === 'fi' ? 'Kuvaus' : language === 'sv' ? 'Beskrivning' : 'Description'}</Label>
                  <Textarea
                    id="edit-description"
                    value={editProjectDescription}
                    onChange={(e) => setEditProjectDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-due-date">{language === 'da' ? 'Forfaldsdato (valgfri)' : language === 'fi' ? 'Määräaika (valinnainen)' : language === 'sv' ? 'Förfallodatum (valfritt)' : 'Due date (optional)'}</Label>
                  <DatePickerField
                    id="edit-due-date"
                    value={editProjectDueDate}
                    onChange={setEditProjectDueDate}
                  />
                </div>
                {renderTimeFields('edit-due-time', editProjectStart, setEditProjectStart, editProjectEnd, setEditProjectEnd)}
              </div>
              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={() => setIsEditProjectOpen(false)}>
                  {language === 'da' ? 'Annuller' : language === 'fi' ? 'Peruuta' : language === 'sv' ? 'Avbryt' : 'Cancel'}
                </Button>
                <Button
                  onClick={() => handleEditProject()}
                >
                  {language === 'da' ? 'Gem' : language === 'fi' ? 'Tallenna' : language === 'sv' ? 'Spara' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <MagnifyingGlass
                size={20}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'da' ? 'Søg projekter...' : language === 'fi' ? 'Etsi hankkeita...' : language === 'sv' ? 'Sök projekt...' : 'Search projects...'}
                className="pl-10"
              />
            </div>

            <Select value={filterUser} onValueChange={(value: any) => setFilterUser(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Funnel size={16} className="mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'da' ? 'Alle projekter' : language === 'fi' ? 'Kaikki hankkeet' : language === 'sv' ? 'Alla projekt' : 'All projects'}</SelectItem>
                <SelectItem value="my">{language === 'da' ? 'Mine projekter' : language === 'fi' ? 'Minun projektini' : language === 'sv' ? 'Mina projekt' : 'My projects'}</SelectItem>
                <SelectItem value="unassigned">{language === 'da' ? 'Ikke tildelt' : language === 'fi' ? 'Määräämättä' : language === 'sv' ? 'Ej tilldelade' : 'Unassigned'}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{language === 'da' ? 'Nyeste' : language === 'fi' ? 'Uusin' : language === 'sv' ? 'Nyast' : 'Newest'}</SelectItem>
                <SelectItem value="oldest">{language === 'da' ? 'Ældste' : language === 'fi' ? 'Vanhin' : language === 'sv' ? 'Äldst' : 'Oldest'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-md bg-secondary text-primary">
                <FolderOpen size={24} weight="duotone" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {language === 'da' ? 'Åbne' : language === 'fi' ? 'Avaa' : language === 'sv' ? 'Öppna' : 'Open'} ({openProjects.length})
              </h2>
            </div>
            <div className="space-y-4">{openProjects.map((project) => renderProjectCard(project))}</div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-md bg-attention-surface text-attention">
                <Clock size={24} weight="duotone" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {language === 'da' ? 'I gang' : language === 'fi' ? 'Edistyminen' : language === 'sv' ? 'Pågående' : 'In Progress'} ({inProgressProjects.length})
              </h2>
            </div>
            <div className="space-y-4">{inProgressProjects.map((project) => renderProjectCard(project))}</div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-md bg-ok-surface text-ok">
                <CheckCircle size={24} weight="duotone" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {language === 'da' ? 'Færdige' : language === 'fi' ? 'Valmis' : language === 'sv' ? 'Klara' : 'Completed'} ({completedProjects.length})
              </h2>
            </div>
            <div className="space-y-4">{completedProjects.map((project) => renderProjectCard(project))}</div>
          </div>
        </div>
          </TabsContent>
          <TabsContent value="personal">
            {renderPersonalTodos()}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
