import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Plus, MagnifyingGlass, PencilSimple, Trash, X, Lock, LockOpen, Eye, Bell, PushPin, Tag, Notebook } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { AutoText } from '@/components/AutoText'
import { useLanguage } from '@/contexts/LanguageContext'
import { newId, cn } from '@/lib/utils'
import { appendToKvArray, upsertInKvArray, removeFromKvArray } from '@/lib/kvArrays'
import { isAnyModalOpen } from '@/lib/modalStack'
import { consumeNavigationParams } from '@/lib/appNavigation'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { da, enUS, fi } from 'date-fns/locale'
import { getUserRole, type UserRole } from '@/lib/userRoles'

interface Note {
  id: string
  title: string
  content: string
  creatorEmail: string
  creatorName: string
  createdAt: string
  updatedAt: string
  lastEditedBy?: string
  lastEditedByName?: string
  isPersonal: boolean
  tags?: string[]
  pinned?: boolean
}

interface Notification {
  id: string
  type: 'note-edited'
  noteId: string
  noteTitle: string
  editedBy: string
  editedByName: string
  originalCreator: string
  timestamp: string
  read: boolean
}

interface VirtualNotebookProps {
  onNavigateBack: () => void
  userEmail: string
}

const PREVIEW_LINES = 8

export function VirtualNotebook({ onNavigateBack, userEmail }: VirtualNotebookProps) {
  const { t, language } = useLanguage()
  const [notes, setNotes] = useState<Note[]>([])
  const [searchQuery, setSearchQuery] = useState(() => consumeNavigationParams()?.search ?? '')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteTags, setNoteTags] = useState('')
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'shared' | 'personal'>('shared')
  const [isCreatingPersonal, setIsCreatingPersonal] = useState(false)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<UserRole>('user')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    loadNotes()
    loadUserInfo()
    loadNotifications()
  }, [userEmail])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showNotifications) { setShowNotifications(false); return }
      if (showCreateDialog) { setShowCreateDialog(false); return }
      if (showEditDialog) { setShowEditDialog(false); return }
      if (showViewDialog) { setShowViewDialog(false); setSelectedNote(null); return }
      if (isAnyModalOpen()) return
      onNavigateBack()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onNavigateBack, showNotifications, showCreateDialog, showEditDialog, showViewDialog])

  const loadNotes = async () => {
    const allNotes = (await window.kv.get<Note[]>('notebook-notes')) || []
    setNotes(allNotes)
  }

  const loadUserInfo = async () => {
    const users = (await window.kv.get<Record<string, { fullName: string }>>('users')) || {}
    const user = users[userEmail]
    const name = user?.fullName || userEmail
    const role = await getUserRole(userEmail)
    setUserName(name)
    setUserRole(role)
  }

  const loadNotifications = async () => {
    const allNotifications = (await window.kv.get<Notification[]>('notebook-notifications')) || []
    const userNotifications = allNotifications.filter(n => 
      n.editedBy !== userEmail && 
      (n.originalCreator === userEmail || activeTab === 'shared')
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    
    setNotifications(userNotifications)
    setUnreadCount(userNotifications.filter(n => !n.read).length)
  }

  // Notifikationerne opdateres lokalt med det samme og skrives i baggrunden.
  // Tidligere kostede hvert klik tre netvaerksrundture (laes, skriv, genlaes)
  // foer der skete noget paa skaermen.
  const markNotificationAsRead = async (notificationId: string) => {
    setNotifications(current => current.map(n => n.id === notificationId ? { ...n, read: true } : n))
    setUnreadCount(current => Math.max(0, current - 1))
    try {
      await upsertInKvArray<Notification>('notebook-notifications', [{ ...(notifications.find(n => n.id === notificationId) as Notification), read: true }])
    } catch (error) {
      console.error('Kunne ikke markere notifikationen som laest:', error)
      void loadNotifications()
    }
  }

  const markAllAsRead = async () => {
    const mine = notifications.filter(n => !n.read)
    if (!mine.length) return
    setNotifications(current => current.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
    toast.success(language === 'da' ? 'Alle notifikationer markeret som læst' : language === 'fi' ? 'Kaikki tiedoksi merkityt ilmoitukset' : 'All notifications marked as read')
    try {
      await upsertInKvArray<Notification>('notebook-notifications', mine.map(n => ({ ...n, read: true })))
    } catch (error) {
      console.error('Kunne ikke markere notifikationerne som laest:', error)
      void loadNotifications()
    }
  }

  const deleteNotification = async (notificationId: string) => {
    const previous = notifications
    setNotifications(current => current.filter(n => n.id !== notificationId))
    setUnreadCount(current => Math.max(0, current - (previous.find(n => n.id === notificationId)?.read ? 0 : 1)))
    try {
      await removeFromKvArray<Notification>('notebook-notifications', [notificationId])
    } catch (error) {
      console.error('Kunne ikke slette notifikationen:', error)
      setNotifications(previous)
      void loadNotifications()
    }
  }

  /** Parser komma-separeret tag-input til en unik, trimmet liste. */
  const parseTags = (input: string): string[] => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const raw of input.split(',')) {
      const tag = raw.trim()
      if (!tag) continue
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push(tag)
    }
    return result
  }

  const handleCreateNote = async () => {
    if (!noteTitle.trim()) {
      toast.error(t.notebook.titleRequired)
      return
    }
    if (!noteContent.trim()) {
      toast.error(t.notebook.contentRequired)
      return
    }

    const tags = parseTags(noteTags)
    const newNote: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: noteTitle.trim(),
      content: noteContent.trim(),
      creatorEmail: userEmail,
      creatorName: userName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPersonal: isCreatingPersonal,
      ...(tags.length > 0 ? { tags } : {}),
    }

    // Vis noten og luk dialogen straks; skrivningen sker i baggrunden.
    setNotes(current => [...current, newNote])
    setNoteTitle('')
    setNoteContent('')
    setNoteTags('')
    setShowCreateDialog(false)
    toast.success(t.notebook.noteCreated)

    try {
      await appendToKvArray('notebook-notes', [newNote])
    } catch (error) {
      console.error('Kunne ikke oprette noten:', error)
      setNotes(current => current.filter(note => note.id !== newNote.id))
      toast.error(language === 'da' ? 'Noten blev ikke gemt — prøv igen' : language === 'fi' ? 'Muistiinpanoa ei tallennettu — yritä uudelleen' : 'The note was not saved — please try again')
    }
  }

  const handleEditNote = async () => {
    if (!selectedNote) return
    // Fastholdes foer dialogen lukkes, saa baggrundsarbejdet ikke laeser null.
    const selectedNoteSnapshot = selectedNote
    if (!noteTitle.trim()) {
      toast.error(t.notebook.titleRequired)
      return
    }
    if (!noteContent.trim()) {
      toast.error(t.notebook.contentRequired)
      return
    }

    const tags = parseTags(noteTags)
    const updatedNote: Note = {
      ...selectedNote,
      title: noteTitle.trim(),
      content: noteContent.trim(),
      tags: tags.length > 0 ? tags : undefined,
      updatedAt: new Date().toISOString(),
      lastEditedBy: userEmail,
      lastEditedByName: userName,
    }

    // Vis aendringen og luk dialogen straks; resten sker i baggrunden.
    const previousNotes = notes
    setNotes(current => current.map(note => note.id === updatedNote.id ? updatedNote : note))
    setNoteTitle('')
    setNoteContent('')
    setNoteTags('')
    setSelectedNote(null)
    setShowEditDialog(false)
    toast.success(t.notebook.noteUpdated)

    try {
      // Atomar pr.-note-opdatering — to brugere der redigerer forskellige noter samtidig taber ikke hinandens ændringer.
      await upsertInKvArray('notebook-notes', [updatedNote])
    } catch (error) {
      console.error('Kunne ikke gemme noten:', error)
      setNotes(previousNotes)
      toast.error(language === 'da' ? 'Noten blev ikke gemt — prøv igen' : language === 'fi' ? 'Muistiinpanoa ei tallennettu — yritä uudelleen' : 'The note was not saved — please try again')
      return
    }

    if (!selectedNoteSnapshot.isPersonal) {
      const notification = {
        id: newId('notification'),
        type: 'note-edited' as const,
        noteId: selectedNoteSnapshot.id,
        noteTitle: updatedNote.title,
        editedBy: userEmail,
        editedByName: userName,
        originalCreator: selectedNoteSnapshot.creatorEmail,
        timestamp: new Date().toISOString(),
        read: false,
      }
      await appendToKvArray('notebook-notifications', [notification]).catch(err => console.error('Kunne ikke sende notifikationen:', err))

      if (selectedNoteSnapshot.creatorEmail !== userEmail) {
        toast.info(
          language === 'da'
            ? `${userName} redigerede noten "${updatedNote.title}"`
            : language === 'fi' ? `${userName} muokattu huomautus "${updatedNote.title}"` : `${userName} edited the note "${updatedNote.title}"`
        )
      }
    }
  }

  const handleDeleteNote = async () => {
    if (!selectedNote) return
    const doomed = selectedNote
    const previousNotes = notes

    setNotes(current => current.filter(note => note.id !== doomed.id))
    setSelectedNote(null)
    setShowDeleteDialog(false)
    toast.success(t.notebook.noteDeleted)

    try {
      await removeFromKvArray<Note>('notebook-notes', [doomed.id])
    } catch (error) {
      console.error('Kunne ikke slette noten:', error)
      setNotes(previousNotes)
      toast.error(language === 'da' ? 'Noten blev ikke slettet — prøv igen' : language === 'fi' ? 'Muistiinpanoa ei poistettu — yritä uudelleen' : 'The note was not deleted — please try again')
    }
  }

  const openCreateDialog = (isPersonal: boolean) => {
    setIsCreatingPersonal(isPersonal)
    setNoteTitle('')
    setNoteContent('')
    setNoteTags('')
    setShowCreateDialog(true)
  }

  const openEditDialog = (note: Note) => {
    const isManager = userRole === 'creator' || userRole === 'manager'
    const isOwner = note.creatorEmail === userEmail
    const isSharedNote = !note.isPersonal

    if (!isSharedNote && !isOwner && !isManager) {
      toast.error(t.notebook.onlyCreatorCanEdit)
      return
    }
    
    setSelectedNote(note)
    setNoteTitle(note.title)
    setNoteContent(note.content)
    setNoteTags((note.tags || []).join(', '))
    setShowEditDialog(true)
  }

  const openDeleteDialog = (note: Note) => {
    const isManager = userRole === 'creator' || userRole === 'manager'
    const isOwner = note.creatorEmail === userEmail
    const isSharedNote = !note.isPersonal

    if (!isSharedNote && !isOwner && !isManager) {
      toast.error(t.notebook.onlyCreatorCanEdit)
      return
    }
    
    setSelectedNote(note)
    setShowDeleteDialog(true)
  }

  const openViewDialog = (note: Note) => {
    setSelectedNote(note)
    setShowViewDialog(true)
  }

  /** Pin/unpin — fælles "vigtig note"-markør (ingen redigerings-notifikation). */
  const togglePin = async (note: Note) => {
    if (!canEditNote(note)) return
    const updatedNotes = await upsertInKvArray('notebook-notes', [{ ...note, pinned: !note.pinned }])
    setNotes(updatedNotes)
    toast.success(
      note.pinned
        ? (language === 'da' ? 'Note frigjort' : language === 'fi' ? 'Muistiinpano ilman pinnoitusta' : 'Note unpinned')
        : (language === 'da' ? 'Note fastgjort' : language === 'fi' ? 'Huomautus kiinnitetty' : 'Note pinned')
    )
  }

  const filteredNotes = notes
    .filter(note => {
      const matchesSearch = searchQuery.trim() === '' ||
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (note.tags || []).some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesTab = activeTab === 'shared' ? !note.isPersonal : (note.isPersonal && note.creatorEmail === userEmail)

      const matchesTag = !activeTagFilter ||
        (note.tags || []).some(tag => tag.toLowerCase() === activeTagFilter.toLowerCase())

      return matchesSearch && matchesTab && matchesTag
    })
    // Fastgjorte først, derefter senest opdaterede.
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

  /** Alle unikke tags i den aktive fane (til filterrækken). */
  const availableTags = Array.from(
    new Map(
      notes
        .filter(note => (activeTab === 'shared' ? !note.isPersonal : (note.isPersonal && note.creatorEmail === userEmail)))
        .flatMap(note => note.tags || [])
        .map(tag => [tag.toLowerCase(), tag] as const)
    ).values()
  ).sort((a, b) => a.localeCompare(b, 'da'))

  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString)
      return format(date, 'PPp', { locale: language === 'da' ? da : language === 'fi' ? fi : enUS })
    } catch {
      return dateString
    }
  }

  const formatShortDate = (dateString: string) => {
    try {
      const date = parseISO(dateString)
      return format(date, 'PP', { locale: language === 'da' ? da : language === 'fi' ? fi : enUS })
    } catch {
      return dateString
    }
  }

  const getTruncatedContent = (content: string): { preview: string; isTruncated: boolean } => {
    const lines = content.split('\n')
    const previewLines = lines.slice(0, PREVIEW_LINES)
    const isTruncated = lines.length > PREVIEW_LINES || previewLines.some(line => line.length > 80)
    
    return {
      preview: previewLines.join('\n'),
      isTruncated: isTruncated || lines.length > PREVIEW_LINES
    }
  }

  const canEditNote = (note: Note) => {
    const isManager = userRole === 'creator' || userRole === 'manager'
    const isOwner = note.creatorEmail === userEmail
    const isSharedNote = !note.isPersonal
    
    if (isSharedNote) {
      return true
    }
    
    return isOwner || isManager
  }

  const isTagActive = (tag: string) => activeTagFilter?.toLowerCase() === tag.toLowerCase()

  /** Fælles note-kort for begge faner (delte + personlige). */
  const renderNoteCard = (note: Note) => {
    const { preview, isTruncated } = getTruncatedContent(note.content)

    return (
      <motion.div
        key={note.id}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative"
      >
        <Card className={cn(
          "p-3 h-[280px] flex flex-col hover:border-primary/40 transition-colors group",
          note.pinned && "border-primary/50 bg-primary/[0.04]"
        )}>
          <div className="flex justify-between items-start mb-1.5 gap-2 flex-shrink-0">
            <h3 className="font-semibold text-sm line-clamp-2 flex-1">
              {note.pinned && (
                <PushPin size={13} weight="fill" className="text-primary inline-block mr-1 align-[-1px]" />
              )}
              <AutoText text={note.title} />
            </h3>
            {canEditNote(note) && (
              <div className={cn(
                "flex gap-1 transition-opacity",
                note.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-6 w-6", note.pinned && "text-primary")}
                  onClick={() => togglePin(note)}
                  title={note.pinned ? (language === 'da' ? 'Frigør note' : language === 'fi' ? 'Avaa viesti' : 'Unpin note') : (language === 'da' ? 'Fastgør note' : language === 'fi' ? 'Pin note' : 'Pin note')}
                >
                  <PushPin size={12} weight={note.pinned ? 'fill' : 'regular'} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => openEditDialog(note)}
                >
                  <PencilSimple size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => openDeleteDialog(note)}
                >
                  <Trash size={12} />
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 mb-1.5 overflow-hidden relative">
            <p className="text-xs leading-[1.4] text-muted-foreground whitespace-pre-wrap line-clamp-[12]">
              <AutoText text={preview} />
            </p>
            {isTruncated && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/95">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-7 text-xs"
                  onClick={() => openViewDialog(note)}
                >
                  <Eye size={12} />
                  {language === 'da' ? 'Læs mere' : language === 'fi' ? 'Lue lisää' : 'Read More'}
                </Button>
              </div>
            )}
          </div>

          {note.tags && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5 flex-shrink-0">
              {note.tags.map(tag => (
                <Badge
                  key={tag}
                  variant={isTagActive(tag) ? 'default' : 'outline'}
                  className="text-[10px] h-4 px-1.5 cursor-pointer"
                  onClick={() => setActiveTagFilter(isTagActive(tag) ? null : tag)}
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-0.5 text-xs text-muted-foreground border-t pt-1.5 flex-shrink-0">
            {!note.isPersonal && (
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="text-xs h-4 px-1.5">
                  {note.creatorName}
                </Badge>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="font-medium">{language === 'da' ? 'Oprettet:' : language === 'fi' ? 'Luotu:' : 'Created:'}</span>
              <span>{formatShortDate(note.createdAt)}</span>
            </div>
            {note.lastEditedBy && note.createdAt !== note.updatedAt && (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="font-medium">{language === 'da' ? 'Redigeret af:' : language === 'fi' ? 'Muokkaa:' : 'Edited by:'}</span>
                  <span>{note.lastEditedByName || note.lastEditedBy}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{language === 'da' ? 'Dato:' : language === 'fi' ? 'Päiväys:' : 'Date:'}</span>
                  <span>{formatShortDate(note.updatedAt)}</span>
                </div>
              </div>
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
              className="bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4"
            >
              <ArrowLeft size={20} />
              {language === 'da' ? 'Tilbage til Hub' : language === 'fi' ? 'Takaisin Hubiin' : 'Back to Hub'}
            </Button>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2.5">
                <Notebook size={26} weight="duotone" className="text-primary" />
                {t.notebook.title}
              </h1>
            </div>
            <Button
              onClick={() => setShowNotifications(true)}
              variant="outline"
              size="lg"
              className="relative"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-10">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'shared' | 'personal')}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <TabsList>
              <TabsTrigger value="shared" className="gap-2">
                <LockOpen size={16} weight="bold" />
                {t.notebook.sharedNotes}
              </TabsTrigger>
              <TabsTrigger value="personal" className="gap-2">
                <Lock size={16} weight="bold" />
                {t.notebook.personalNotes}
              </TabsTrigger>
            </TabsList>

            <Button
              onClick={() => openCreateDialog(activeTab === 'personal')}
              size="lg"
              className="gap-2"
            >
              <Plus size={20} weight="bold" />
              {t.notebook.addNote}
            </Button>
          </div>

              <div className="relative mb-6">
                <MagnifyingGlass
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="text"
                  placeholder={t.notebook.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery('')}
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>

              {availableTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <Tag size={16} className="text-muted-foreground shrink-0" />
                  {availableTags.map(tag => (
                    <Badge
                      key={tag}
                      variant={isTagActive(tag) ? 'default' : 'secondary'}
                      className="cursor-pointer select-none"
                      onClick={() => setActiveTagFilter(isTagActive(tag) ? null : tag)}
                    >
                      #{tag}
                    </Badge>
                  ))}
                  {activeTagFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setActiveTagFilter(null)}
                    >
                      <X size={12} className="mr-1" />
                      {language === 'da' ? 'Ryd tag-filter' : language === 'fi' ? 'Tyhjennä tagisuodin' : 'Clear tag filter'}
                    </Button>
                  )}
                </div>
              )}

              <TabsContent value="shared" className="mt-0">
                {filteredNotes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {searchQuery ? t.notebook.noSearchResults : t.notebook.noSharedNotes}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {filteredNotes.map(renderNoteCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="personal" className="mt-0">
                {filteredNotes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {searchQuery ? t.notebook.noSearchResults : t.notebook.noPersonalNotes}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {filteredNotes.map(renderNoteCard)}
                  </div>
                )}
              </TabsContent>
            </Tabs>
        </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t.notebook.addNote}</DialogTitle>
            <DialogDescription>
              {isCreatingPersonal ? t.notebook.personalNotes : t.notebook.sharedNotes}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2 -mr-2 flex-1 min-h-0">
            <div>
              <Input
                placeholder={t.notebook.enterTitle}
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
            </div>
            <div>
              <Textarea
                placeholder={t.notebook.enterContent}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={12}
                className="resize-none"
              />
            </div>
            <div>
              <Input
                placeholder={language === 'da' ? 'Tags adskilt med komma — fx procedure, onboarding' : language === 'fi' ? 'Tunnisteet erotettu pilkulla ' : 'Tags separated by comma — e.g. procedure, onboarding'}
                value={noteTags}
                onChange={(e) => setNoteTags(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t.notebook.cancel}
            </Button>
            <Button onClick={handleCreateNote}>
              {t.notebook.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t.notebook.editNote}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2 -mr-2 flex-1 min-h-0">
            <div>
              <Input
                placeholder={t.notebook.enterTitle}
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
            </div>
            <div>
              <Textarea
                placeholder={t.notebook.enterContent}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={12}
                className="resize-none"
              />
            </div>
            <div>
              <Input
                placeholder={language === 'da' ? 'Tags adskilt med komma — fx procedure, onboarding' : language === 'fi' ? 'Tunnisteet erotettu pilkulla ' : 'Tags separated by comma — e.g. procedure, onboarding'}
                value={noteTags}
                onChange={(e) => setNoteTags(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t.notebook.cancel}
            </Button>
            <Button onClick={handleEditNote}>
              {t.notebook.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl"><AutoText text={selectedNote?.title} /></DialogTitle>
            <DialogDescription className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{selectedNote?.creatorName}</Badge>
              <span>•</span>
              <span>{selectedNote && formatDate(selectedNote.createdAt)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh] pr-2">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              <AutoText text={selectedNote?.content} />
            </p>
          </div>
          {selectedNote?.tags && selectedNote.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedNote.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs">#{tag}</Badge>
              ))}
            </div>
          )}
          {selectedNote && selectedNote.lastEditedBy && selectedNote.createdAt !== selectedNote.updatedAt && (
            <div className="text-xs text-muted-foreground border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{language === 'da' ? 'Sidst redigeret af:' : language === 'fi' ? 'Viimeksi muokannut:' : 'Last edited by:'}</span>
                <span>{selectedNote.lastEditedByName || selectedNote.lastEditedBy}</span>
                <span>•</span>
                <span>{formatDate(selectedNote.updatedAt)}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {selectedNote && canEditNote(selectedNote) && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowViewDialog(false)
                    setTimeout(() => openEditDialog(selectedNote), 100)
                  }}
                  className="gap-2"
                >
                  <PencilSimple size={16} />
                  {language === 'da' ? 'Rediger' : language === 'fi' ? 'Muokkaa' : 'Edit'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowViewDialog(false)
                    setTimeout(() => openDeleteDialog(selectedNote), 100)
                  }}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash size={16} />
                  {language === 'da' ? 'Slet' : language === 'fi' ? 'Poista' : 'Delete'}
                </Button>
              </>
            )}
            <Button onClick={() => setShowViewDialog(false)}>
              {language === 'da' ? 'Luk' : language === 'fi' ? 'Sulje' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.notebook.deleteNote}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.notebook.deleteConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.notebook.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNote} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.notebook.deleteNote}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {language === 'da' ? 'Notifikationer' : language === 'fi' ? 'Ilmoitukset' : 'Notifications'}
              </DialogTitle>
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs"
                >
                  {language === 'da' ? 'Markér alle som læst' : language === 'fi' ? 'Merkitse kaikki luetuiksi' : 'Mark all as read'}
                </Button>
              )}
            </div>
            <DialogDescription>
              {language === 'da' ? 'Se hvem der har redigeret delte noter' : language === 'fi' ? 'Katso kuka on muokannut jaettuja muistiinpanoja' : 'See who has edited shared notes'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto max-h-[50vh] space-y-2">
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {language === 'da' ? 'Ingen notifikationer' : language === 'fi' ? 'Ei ilmoituksia' : 'No notifications'}
              </div>
            ) : (
              <AnimatePresence>
                {notifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <Card 
                      className={`p-4 ${!notification.read ? 'bg-accent/10 border-accent' : ''}`}
                      onClick={() => !notification.read && markNotificationAsRead(notification.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {!notification.read && (
                              <div className="w-2 h-2 rounded-full bg-accent"></div>
                            )}
                            <p className="font-medium text-sm">
                              {notification.editedByName}
                            </p>
                            <Badge variant="secondary" className="text-xs">
                              {language === 'da' ? 'Redigeret' : language === 'fi' ? 'Muokattu' : 'Edited'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {language === 'da' 
                              ? `redigerede noten "${notification.noteTitle}"`
                              : language === 'fi' ? `muokattu huomautus "${notification.noteTitle}"` : `edited the note "${notification.noteTitle}"`
                            }
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(parseISO(notification.timestamp), {
                              addSuffix: true,
                              locale: language === 'da' ? da : language === 'fi' ? fi : enUS
                            })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNotification(notification.id)
                          }}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowNotifications(false)}>
              {language === 'da' ? 'Luk' : language === 'fi' ? 'Sulje' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
