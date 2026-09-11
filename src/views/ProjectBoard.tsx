import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Plus, User, CheckCircle, Clock, FolderOpen, MagnifyingGlass, Funnel, Trash, X, UserPlus } from '@phosphor-icons/react'
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
import { useKV } from '@/hooks/useKV'
import { useLanguage } from '@/contexts/LanguageContext'
import { newId } from '@/lib/utils'
import { appendToKvArray, updateKvArrayItem, removeFromKvArray } from '@/lib/kvArrays'
import { isAnyModalOpen } from '@/lib/modalStack'
import { consumeNavigationParams } from '@/lib/appNavigation'
import { format } from 'date-fns'
import { da, enUS } from 'date-fns/locale'

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
}

export function ProjectBoard({ onNavigateBack, userEmail }: ProjectBoardProps) {
  const { t, language } = useLanguage()
  // Skrivninger sker via atomare kvArrays-helpers; useKV holder listen synkroniseret.
  const [projects] = useKV<Project[]>('projects', [])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [searchQuery, setSearchQuery] = useState(() => consumeNavigationParams()?.search ?? '')
  const [filterUser, setFilterUser] = useState<'all' | 'my' | 'unassigned'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest')
  const [currentUserName, setCurrentUserName] = useState('')

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
      if (isAnyModalOpen()) return
      onNavigateBack()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onNavigateBack, isCreateDialogOpen])

  const handleCreateProject = async () => {
    if (!newTitle.trim()) {
      toast.error(language === 'da' ? 'Titel er påkrævet' : 'Title is required')
      return
    }

    const newProject: Project = {
      id: newId('project'),
      title: newTitle.trim(),
      description: newDescription.trim(),
      createdBy: userEmail,
      createdByName: currentUserName,
      createdAt: new Date().toISOString(),
      status: 'open',
      teamMembers: [],
    }

    await appendToKvArray('projects', [newProject])

    setNewTitle('')
    setNewDescription('')
    setIsCreateDialogOpen(false)
    toast.success(language === 'da' ? 'Projekt oprettet' : 'Project created')
  }

  const handleJoinProject = async (projectId: string) => {
    // Atomar pr.-projekt-opdatering — to samtidige tilmeldinger taber ikke hinanden.
    await updateKvArrayItem<Project>('projects', projectId, (p) => {
      const teamMembers = p.teamMembers || []
      if (teamMembers.some((m) => m.email === userEmail)) return p
      return {
        ...p,
        status: 'in-progress' as ProjectStatus,
        teamMembers: [...teamMembers, { email: userEmail, name: currentUserName, assignedAt: new Date().toISOString() }],
      }
    })
    toast.success(language === 'da' ? 'Du er nu med i projektet' : 'You joined the project')
  }

  const handleLeaveProject = async (projectId: string) => {
    await updateKvArrayItem<Project>('projects', projectId, (p) => {
      const updatedMembers = (p.teamMembers || []).filter((m) => m.email !== userEmail)
      return {
        ...p,
        teamMembers: updatedMembers,
        status: updatedMembers.length === 0 ? ('open' as ProjectStatus) : p.status,
      }
    })
    toast.success(language === 'da' ? 'Du har forladt projektet' : 'You left the project')
  }

  const handleRemoveProject = async (projectId: string) => {
    await removeFromKvArray('projects', [projectId])
    toast.success(language === 'da' ? 'Projekt slettet' : 'Project deleted')
  }

  const handleCompleteProject = async (projectId: string) => {
    await updateKvArrayItem<Project>('projects', projectId, (p) => ({
      ...p,
      status: 'completed' as ProjectStatus,
      completedAt: new Date().toISOString(),
    }))
    toast.success(language === 'da' ? 'Projekt markeret som færdigt' : 'Project marked as completed')
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
    return format(date, 'dd MMM yyyy, HH:mm', { locale: language === 'da' ? da : enUS })
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
        <Card
          className={`p-5 border-2 transition-all duration-300 hover:shadow-lg ${
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
                <Badge className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] text-white text-xs font-semibold">
                  {language === 'da' ? 'Dit projekt' : 'Your project'}
                </Badge>
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
                      <AlertDialogTitle>{language === 'da' ? 'Slet projekt?' : 'Delete project?'}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {language === 'da' 
                          ? 'Er du sikker på, at du vil slette dette projekt? Denne handling kan ikke fortrydes.'
                          : 'Are you sure you want to delete this project? This action cannot be undone.'}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{language === 'da' ? 'Annuller' : 'Cancel'}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemoveProject(project.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {language === 'da' ? 'Slet' : 'Delete'}
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

          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User size={14} weight="duotone" />
              <span>
                {language === 'da' ? 'Oprettet af' : 'Created by'}: <strong className="text-foreground">{project.createdByName}</strong>
              </span>
            </div>

            {teamMembers.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <UserPlus size={14} weight="duotone" />
                  <span className="font-semibold">
                    {language === 'da' ? 'Teammedlemmer' : 'Team Members'} ({teamMembers.length}):
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
                          title={language === 'da' ? 'Forlad projekt' : 'Leave project'}
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
                {language === 'da' ? 'Oprettet' : 'Created'}: {formatDate(project.createdAt)}
              </span>
            </div>

            {project.completedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle size={14} weight="duotone" />
                <span>
                  {language === 'da' ? 'Færdiggjort' : 'Completed'}: {formatDate(project.completedAt)}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!isOnTeam && project.status !== 'completed' && (
              <Button
                onClick={() => handleJoinProject(project.id)}
                className="flex-1 bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] hover:from-[oklch(0.38_0.19_272)] hover:to-[oklch(0.48_0.15_264)] text-white"
                size="sm"
              >
                <UserPlus size={16} weight="duotone" className="mr-2" />
                {language === 'da' ? 'Deltag i projekt' : 'Join project'}
              </Button>
            )}

            {project.status === 'in-progress' && isOnTeam && (
              <Button
                onClick={() => handleCompleteProject(project.id)}
                className="flex-1 bg-gradient-to-r from-[oklch(0.55_0.13_150)] to-[oklch(0.60_0.11_160)] hover:from-[oklch(0.50_0.13_150)] hover:to-[oklch(0.55_0.11_160)] text-white"
                size="sm"
              >
                <CheckCircle size={16} weight="duotone" className="mr-2" />
                {language === 'da' ? 'Marker som færdig' : 'Mark as completed'}
              </Button>
            )}
          </div>
        </Card>
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
              className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
            >
              <ArrowLeft size={20} />
              {language === 'da' ? 'Tilbage til Hub' : 'Back to Hub'}
            </Button>
            <div className="flex-1 text-center">
              <h1 className="text-2xl sm:text-3xl font-bold leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1 flex items-center gap-3 justify-center">
                <FolderOpen size={32} weight="duotone" className="text-primary" />
                {language === 'da' ? 'Projekt Tavle' : 'Project Board'}
              </h1>
            </div>
            <div className="w-[140px]"></div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] hover:from-[oklch(0.38_0.19_272)] hover:to-[oklch(0.48_0.15_264)] text-white shadow-lg"
              >
                <Plus size={20} weight="bold" className="mr-2" />
                {language === 'da' ? 'Opret projekt' : 'Create project'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  {language === 'da' ? 'Opret nyt projekt' : 'Create new project'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">{language === 'da' ? 'Titel' : 'Title'} *</Label>
                  <Input
                    id="title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={language === 'da' ? 'Indtast projekt titel' : 'Enter project title'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{language === 'da' ? 'Beskrivelse' : 'Description'}</Label>
                  <Textarea
                    id="description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder={language === 'da' ? 'Indtast projekt beskrivelse' : 'Enter project description'}
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {language === 'da' ? 'Annuller' : 'Cancel'}
                </Button>
                <Button
                  onClick={handleCreateProject}
                  className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] text-white"
                >
                  {language === 'da' ? 'Opret' : 'Create'}
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
                placeholder={language === 'da' ? 'Søg projekter...' : 'Search projects...'}
                className="pl-10"
              />
            </div>

            <Select value={filterUser} onValueChange={(value: any) => setFilterUser(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Funnel size={16} className="mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'da' ? 'Alle projekter' : 'All projects'}</SelectItem>
                <SelectItem value="my">{language === 'da' ? 'Mine projekter' : 'My projects'}</SelectItem>
                <SelectItem value="unassigned">{language === 'da' ? 'Ikke tildelt' : 'Unassigned'}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{language === 'da' ? 'Nyeste' : 'Newest'}</SelectItem>
                <SelectItem value="oldest">{language === 'da' ? 'Ældste' : 'Oldest'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)]">
                <FolderOpen size={24} weight="duotone" className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {language === 'da' ? 'Åbne' : 'Open'} ({openProjects.length})
              </h2>
            </div>
            <div className="space-y-4">{openProjects.map((project) => renderProjectCard(project))}</div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[oklch(0.65_0.13_75)] to-[oklch(0.70_0.11_70)]">
                <Clock size={24} weight="duotone" className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {language === 'da' ? 'I gang' : 'In Progress'} ({inProgressProjects.length})
              </h2>
            </div>
            <div className="space-y-4">{inProgressProjects.map((project) => renderProjectCard(project))}</div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[oklch(0.55_0.13_150)] to-[oklch(0.60_0.11_160)]">
                <CheckCircle size={24} weight="duotone" className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {language === 'da' ? 'Færdige' : 'Completed'} ({completedProjects.length})
              </h2>
            </div>
            <div className="space-y-4">{completedProjects.map((project) => renderProjectCard(project))}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
