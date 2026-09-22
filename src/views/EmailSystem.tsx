import { useState, useEffect, useMemo, type ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vacationApprovedEmail, vacationRejectedEmail } from '@/lib/emailTemplates'
import { 
  ArrowLeft, 
  PaperPlaneTilt, 
  Envelope, 
  EnvelopeOpen, 
  MagnifyingGlass,
  Trash,
  X,
  User,
  Clock,
  Paperclip,
  Funnel,
  CalendarBlank,
  Check,
  Umbrella,
  Folder,
  FolderOpen,
  Plus,
  Pencil,
  ChatCircle
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useKV } from '@/hooks/useKV'
import { UserProfile } from '@/components/UserProfile'
import { toast } from 'sonner'
import { AutoText } from '@/components/AutoText'
import { cn, newId } from '@/lib/utils'
import { appendToKvArray } from '@/lib/kvArrays'
import { isAnyModalOpen } from '@/lib/modalStack'
import { consumeNavigationParams, navigateTo, type AppViewId } from '@/lib/appNavigation'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Email, EmailFolder, VacationEntry, VacationStatus } from '@/lib/types'

interface EmailSystemProps {
  onNavigateBack: () => void
  onLogout: () => void
  userEmail: string
}

export function EmailSystem({ onNavigateBack, onLogout, userEmail: propUserEmail }: EmailSystemProps) {
  const { t, language } = useLanguage()
  const [emails, setEmails] = useKV<Email[]>('emails', [])
  const [folders, setFolders] = useKV<EmailFolder[]>('email-folders', [])
  const [vacations, setVacations] = useKV<VacationEntry[]>('vacation-entries', [])
  const [users, setUsers] = useState<Array<{ email: string; name: string }>>([])
  const [isManager, setIsManager] = useState(false)
  const userEmail = propUserEmail
  const [view, setView] = useState<'inbox' | 'sent' | 'compose' | 'vacation-requests' | 'folder'>('inbox')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedVacation, setSelectedVacation] = useState<VacationEntry | null>(null)
  const [showCalendarPreview, setShowCalendarPreview] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [searchQuery, setSearchQuery] = useState(() => consumeNavigationParams()?.search ?? '')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [senderFilter, setSenderFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [editingFolder, setEditingFolder] = useState<EmailFolder | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderColor, setFolderColor] = useState('#8B5CF6')
  const [showMoveToFolderDialog, setShowMoveToFolderDialog] = useState(false)
  const [emailToMove, setEmailToMove] = useState<Email | null>(null)
  const [draggedEmail, setDraggedEmail] = useState<Email | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [composeData, setComposeData] = useState({
    to: '',
    subject: '',
    message: ''
  })
  // Sættes ved "Svar" så den sendte mail bliver del af samme samtale-tråd.
  const [composeThreadId, setComposeThreadId] = useState<string | null>(null)

  useEffect(() => {
    const loadUserAndData = async () => {
      const usersData = await window.kv.get<Record<string, { email: string; fullName: string; isManager: boolean }>>('users')
    
      if (usersData && typeof usersData === 'object' && !Array.isArray(usersData)) {
        const userList = Object.values(usersData).map(user => ({
          email: user.email,
          name: user.fullName
        }))
        setUsers(userList)
        
        if (usersData[userEmail]) {
          setIsManager(usersData[userEmail].isManager || false)
        }
      } else if (Array.isArray(usersData)) {
        setUsers(usersData as Array<{ email: string; name: string }>)
      }

      // useKV subscribes to emails. Refreshing contacts must not write an old
      // snapshot of the mailbox back over newly arrived messages.
    }
    
    loadUserAndData()
  }, [refreshTrigger, setEmails, userEmail])

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

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const getInitials = (email: string) => {
    const name = email.split('@')[0]
    const parts = name.split('.')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return language === 'da' ? 'Lige nu' : language === 'fi' ? 'Juuri nyt' : 'Just now'
    if (diffMins < 60) return language === 'da' ? `${diffMins} min siden` : language === 'fi' ? `${diffMins} min sitten` : `${diffMins} min ago`
    if (diffHours < 24) return language === 'da' ? `${diffHours} time${diffHours > 1 ? 'r' : ''} siden` : language === 'fi' ? `${diffHours} tuntia sitten` : `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return language === 'da' ? `${diffDays} dag${diffDays > 1 ? 'e' : ''} siden` : language === 'fi' ? `${diffDays} päivää sitten` : `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    
    return date.toLocaleDateString(language === 'da' ? 'da-DK' : language === 'fi' ? 'fi-FI' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filterByDate = (email: Email) => {
    if (dateFilter === 'all') return true
    
    const now = Date.now()
    const emailDate = email.timestamp
    const dayInMs = 86400000
    
    switch (dateFilter) {
      case 'today':
        return now - emailDate < dayInMs
      case 'week':
        return now - emailDate < dayInMs * 7
      case 'month':
        return now - emailDate < dayInMs * 30
      default:
        return true
    }
  }

  const filterBySender = (email: Email) => {
    if (senderFilter === 'all') return true
    return view === 'inbox' ? email.from === senderFilter : email.to === senderFilter
  }

  const uniqueSenders = Array.from(
    new Set(
      (emails || [])
        .filter(email => view === 'inbox' ? email.to === userEmail : email.from === userEmail)
        .map(email => view === 'inbox' ? email.from : email.to)
    )
  )

  const userFolders = (folders || []).filter(folder => folder.userId === userEmail)

  const inboxEmails = (emails || [])
    .filter(email => email.to === userEmail && !email.folderId)
    .filter(email => 
      searchQuery === '' || 
      email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.message.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(filterByDate)
    .filter(filterBySender)
    .sort((a, b) => b.timestamp - a.timestamp)

  const sentEmails = (emails || [])
    .filter(email => email.from === userEmail && !email.folderId)
    .filter(email => 
      searchQuery === '' || 
      email.to.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.message.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(filterByDate)
    .filter(filterBySender)
    .sort((a, b) => b.timestamp - a.timestamp)

  const folderEmails = (emails || [])
    .filter(email => email.folderId === selectedFolderId && (email.to === userEmail || email.from === userEmail))
    .filter(email => 
      searchQuery === '' || 
      email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.to.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.message.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(filterByDate)
    .filter(filterBySender)
    .sort((a, b) => b.timestamp - a.timestamp)

  const unreadCount = inboxEmails.filter(email => !email.read).length

  // ---- Samtale-tråde: svar bærer threadId = original-mailens id ----
  const threadKeyOf = (email: Email) => email.threadId ?? email.id

  // Bygges ÉN gang pr. emails/userEmail-ændring (ikke pr. render/pr. række) —
  // undgår O(tråde × alle-emails) genberegning ved hvert 5-sekunders auto-refresh.
  const conversationsByThreadKey = useMemo(() => {
    const map = new Map<string, Email[]>()
    for (const e of (emails || [])) {
      if (e.to !== userEmail && e.from !== userEmail) continue
      const key = threadKeyOf(e)
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    for (const list of map.values()) list.sort((a, b) => a.timestamp - b.timestamp)
    return map
  }, [emails, userEmail])

  /** Alle mails i samme tråd som given mail, hvor jeg er afsender eller modtager. */
  const getConversation = (email: Email): Email[] => {
    return conversationsByThreadKey.get(threadKeyOf(email)) || [email]
  }

  /** Reducerer en synlig mail-liste til én række pr. tråd (nyeste mail vinder). */
  const groupByThread = (list: Email[]): Email[] => {
    const newestPerThread = new Map<string, Email>()
    for (const email of list) {
      const key = threadKeyOf(email)
      const existing = newestPerThread.get(key)
      if (!existing || email.timestamp > existing.timestamp) {
        newestPerThread.set(key, email)
      }
    }
    return Array.from(newestPerThread.values()).sort((a, b) => b.timestamp - a.timestamp)
  }

  const handleSendEmail = async () => {
    if (!composeData.to || !composeData.subject || !composeData.message) {
      toast.error(t.email.fillAllFields)
      return
    }

    const userExists = (users || []).some(u => u.email === composeData.to)
    if (!userExists) {
      toast.error(t.email.userNotFound)
      return
    }

    const newEmail: Email = {
      id: newId('email'),
      from: userEmail,
      to: composeData.to,
      subject: composeData.subject,
      message: composeData.message,
      timestamp: Date.now(),
      read: false,
      ...(composeThreadId ? { threadId: composeThreadId } : {})
    }

    // Atomar append — to brugere der sender samtidig taber ikke længere hinandens mails.
    await appendToKvArray('emails', [newEmail])

    const notification = {
      id: newId('notif'),
      type: 'email' as const,
      message: `Ny email fra ${userEmail}: ${composeData.subject}`,
      timestamp: Date.now(),
      read: false,
      from: userEmail,
      emailId: newEmail.id
    }

    await appendToKvArray('email-notifications', [notification])

    toast.success(t.email.emailSent)
    setComposeData({ to: '', subject: '', message: '' })
    setComposeThreadId(null)
    setView('sent')
  }

  const handleMarkAsRead = (emailId: string) => {
    setEmails(currentEmails =>
      (currentEmails || []).map(email =>
        email.id === emailId ? { ...email, read: true } : email
      )
    )
  }

  const handleDeleteEmail = (emailId: string) => {
    setEmails(currentEmails => (currentEmails || []).filter(email => email.id !== emailId))
    setSelectedEmail(null)
    toast.success(t.email.emailDeleted)
  }

  const handleEmailClick = (email: Email) => {
    setSelectedEmail(email)
    // Markér hele samtalens ulæste indbakke-mails som læst på én gang.
    const unreadInThread = getConversation(email).filter(e => !e.read && e.to === userEmail)
    if (unreadInThread.length > 0) {
      const ids = new Set(unreadInThread.map(e => e.id))
      setEmails(currentEmails =>
        (currentEmails || []).map(e => (ids.has(e.id) ? { ...e, read: true } : e))
      )
    }
  }

  const pendingVacationRequests = (vacations || []).filter(v => v.status === 'pending')

  const handleApproveVacation = async (vacation: VacationEntry) => {
    setVacations((current) =>
      (current || []).map((v) =>
        v.id === vacation.id
          ? { ...v, status: 'approved' as VacationStatus, reviewedBy: userEmail, reviewedAt: new Date().toISOString() }
          : v
      )
    )
    toast.success(t.email.vacationApproved)

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

      setEmails(currentEmails => [...(currentEmails || []), newEmail])

      const notification = {
        id: Date.now().toString(),
        type: 'email' as const,
        message: `Din ferieansøgning blev godkendt!`,
        timestamp: Date.now(),
        read: false,
        from: userEmail,
        emailId: newEmail.id
      }

      await appendToKvArray('email-notifications', [notification])
    } catch (emailError) {
      console.error('Error sending vacation approval email:', emailError)
    }

    setSelectedVacation(null)
    setShowCalendarPreview(false)
  }

  const handleRejectVacation = async (vacation: VacationEntry) => {
    setVacations((current) =>
      (current || []).map((v) =>
        v.id === vacation.id
          ? { ...v, status: 'rejected' as VacationStatus, reviewedBy: userEmail, reviewedAt: new Date().toISOString() }
          : v
      )
    )
    toast.error(t.email.vacationRejected)

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

      setEmails(currentEmails => [...(currentEmails || []), newEmail])

      const notification = {
        id: Date.now().toString(),
        type: 'email' as const,
        message: `Din ferieansøgning blev afvist`,
        timestamp: Date.now(),
        read: false,
        from: userEmail,
        emailId: newEmail.id
      }

      await appendToKvArray('email-notifications', [notification])
    } catch (emailError) {
      console.error('Error sending vacation rejection email:', emailError)
    }

    setSelectedVacation(null)
    setShowCalendarPreview(false)
  }

  const handleCreateFolder = () => {
    if (!folderName.trim()) {
      toast.error(t.email.enterFolderName)
      return
    }

    const newFolder: EmailFolder = {
      id: Date.now().toString(),
      name: folderName.trim(),
      userId: userEmail,
      createdAt: Date.now(),
      color: folderColor
    }

    setFolders(current => [...(current || []), newFolder])
    toast.success(t.email.folderCreated)
    setFolderName('')
    setFolderColor('#8B5CF6')
    setShowFolderDialog(false)
  }

  const handleUpdateFolder = () => {
    if (!editingFolder || !folderName.trim()) {
      toast.error(t.email.enterFolderName)
      return
    }

    setFolders(current =>
      (current || []).map(folder =>
        folder.id === editingFolder.id
          ? { ...folder, name: folderName.trim(), color: folderColor }
          : folder
      )
    )

    toast.success(t.email.folderUpdated)
    setFolderName('')
    setFolderColor('#8B5CF6')
    setEditingFolder(null)
    setShowFolderDialog(false)
  }

  const handleDeleteFolder = (folderId: string) => {
    setEmails(current =>
      (current || []).map(email =>
        email.folderId === folderId
          ? { ...email, folderId: undefined }
          : email
      )
    )

    setFolders(current => (current || []).filter(folder => folder.id !== folderId))
    
    if (selectedFolderId === folderId) {
      setView('inbox')
      setSelectedFolderId(null)
    }

    toast.success(t.email.folderDeleted)
  }

  const handleMoveToFolder = (folderId: string | null) => {
    if (!emailToMove) return

    setEmails(current =>
      (current || []).map(email =>
        email.id === emailToMove.id
          ? { ...email, folderId: folderId || undefined }
          : email
      )
    )

    if (folderId) {
      const folder = userFolders.find(f => f.id === folderId)
      toast.success(t.email.movedToFolder.replace('{folder}', folder?.name || ''))
    } else {
      toast.success(t.email.movedToInbox)
    }

    setShowMoveToFolderDialog(false)
    setEmailToMove(null)
  }

  const handleDragStart = (e: React.DragEvent, email: Email) => {
    setDraggedEmail(email)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', email.id)
  }

  const handleDragEnd = () => {
    setDraggedEmail(null)
    setDragOverFolder(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnterFolder = (folderId: string | null) => {
    setDragOverFolder(folderId)
  }

  const handleDragLeaveFolder = () => {
    setDragOverFolder(null)
  }

  const handleDropOnFolder = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!draggedEmail) return

    setEmails(current =>
      (current || []).map(email =>
        email.id === draggedEmail.id
          ? { ...email, folderId: folderId || undefined }
          : email
      )
    )

    if (folderId) {
      const folder = userFolders.find(f => f.id === folderId)
      toast.success(t.email.movedToFolder.replace('{folder}', folder?.name || ''))
    } else {
      toast.success(t.email.movedToInbox)
    }

    setDraggedEmail(null)
    setDragOverFolder(null)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(language === 'da' ? 'da-DK' : language === 'fi' ? 'fi-FI' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay()
  }

  const isDateInRange = (day: number, month: number, year: number, startDate: string, endDate: string) => {
    const currentDate = new Date(year, month, day)
    const start = new Date(startDate)
    const end = new Date(endDate)
    return currentDate >= start && currentDate <= end
  }

  const renderCalendarPreview = () => {
    if (!selectedVacation) return null

    const today = new Date()
    const startDate = new Date(selectedVacation.startDate)
    const endDate = new Date(selectedVacation.endDate)
    
    const monthToShow = startDate.getMonth()
    const yearToShow = startDate.getFullYear()

    const daysInMonth = getDaysInMonth(monthToShow, yearToShow)
    const firstDay = getFirstDayOfMonth(monthToShow, yearToShow)
    const monthName = new Date(yearToShow, monthToShow).toLocaleDateString(language === 'da' ? 'da-DK' : language === 'fi' ? 'fi-FI' : 'en-US', { month: 'long', year: 'numeric' })

    const weekdays = language === 'da'
      ? ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør']
      : language === 'fi'
        ? ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La']
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const days: ReactElement[] = []

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10" />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(yearToShow, monthToShow, day)
      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6
      const isInVacationRange = isDateInRange(day, monthToShow, yearToShow, selectedVacation.startDate, selectedVacation.endDate)
      const isApprovedVacation = (vacations || []).some(v => 
        v.status === 'approved' && 
        v.id !== selectedVacation.id &&
        isDateInRange(day, monthToShow, yearToShow, v.startDate, v.endDate)
      )
      const isToday = 
        day === today.getDate() && 
        monthToShow === today.getMonth() && 
        yearToShow === today.getFullYear()

      days.push(
        <div
          key={day}
          className={cn(
            "h-10 flex items-center justify-center rounded-md text-sm transition-colors relative",
            isWeekend && "text-muted-foreground bg-muted/30",
            isInVacationRange && !isWeekend && "bg-secondary text-secondary-foreground font-semibold ring-2 ring-secondary",
            isApprovedVacation && !isWeekend && "bg-accent/20 text-accent-foreground",
            isToday && "ring-2 ring-primary"
          )}
        >
          {day}
          {isInVacationRange && !isWeekend && (
            <div className="absolute -top-1 -right-1">
              <Umbrella size={12} weight="fill" className="text-accent" />
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-center text-lg">{monthName}</h3>
        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekdays.map((day) => (
            <div key={day} className="text-xs font-medium text-center text-muted-foreground">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">{days}</div>
        <div className="flex items-start gap-4 text-xs text-muted-foreground mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-secondary ring-2 ring-secondary"></div>
            <span>Anmodet ferie</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-accent/20"></div>
            <span>Godkendt ferie</span>
          </div>
        </div>
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
                className="pointer-events-auto bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
              >
                <ArrowLeft size={20} />
                {t.email.back}
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
            <div>
              <h1 className="text-4xl font-bold leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1">
                {t.email.title}
              </h1>
              <p className="text-muted-foreground mt-2">{t.email.sendAndReceive}</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3"
          >
            <Card className="p-4 space-y-2">
              <Button
                onClick={() => {
                  setComposeThreadId(null)
                  setView('compose')
                }}
                className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white gap-2"
                size="lg"
              >
                <PaperPlaneTilt size={20} weight="bold" />
                {t.email.newEmail}
              </Button>

              <Separator className="my-4" />

              <div
                onDragOver={handleDragOver}
                onDragEnter={() => handleDragEnterFolder(null)}
                onDragLeave={handleDragLeaveFolder}
                onDrop={(e) => handleDropOnFolder(e, null)}
                className={cn(
                  "rounded-lg transition-all duration-200",
                  dragOverFolder === null && draggedEmail && "ring-2 ring-primary bg-primary/5"
                )}
              >
                <Button
                  variant={view === 'inbox' ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setView('inbox')
                    setSelectedEmail(null)
                  }}
                >
                  <Envelope size={20} weight={view === 'inbox' ? 'fill' : 'regular'} />
                  {t.email.inbox}
                  {unreadCount > 0 && (
                    <Badge className="ml-auto bg-primary text-primary-foreground">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </div>

              <Button
                variant={view === 'sent' ? 'secondary' : 'ghost'}
                className="w-full justify-start gap-2"
                onClick={() => {
                  setView('sent')
                  setSelectedEmail(null)
                }}
              >
                <PaperPlaneTilt size={20} weight={view === 'sent' ? 'fill' : 'regular'} />
                {t.email.sent}
              </Button>

              {isManager && (
                <>
                  <Separator className="my-2" />
                  <Button
                    variant={view === 'vacation-requests' ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setView('vacation-requests')
                      setSelectedEmail(null)
                      setSelectedVacation(null)
                    }}
                  >
                    <Umbrella size={20} weight={view === 'vacation-requests' ? 'fill' : 'regular'} />
                    {t.email.vacationRequests}
                    {pendingVacationRequests.length > 0 && (
                      <Badge className="ml-auto bg-accent text-accent-foreground">
                        {pendingVacationRequests.length}
                      </Badge>
                    )}
                  </Button>
                </>
              )}

              <Separator className="my-2" />

              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-sm font-semibold text-muted-foreground">{t.email.folders}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    setEditingFolder(null)
                    setFolderName('')
                    setFolderColor('#8B5CF6')
                    setShowFolderDialog(true)
                  }}
                >
                  <Plus size={16} weight="bold" />
                </Button>
              </div>

              {userFolders.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4 px-2">
                  {t.email.noFolders}
                </div>
              ) : (
                <div className="space-y-1">
                  {userFolders.map(folder => {
                    const folderEmailCount = (emails || []).filter(e => e.folderId === folder.id).length
                    return (
                      <div
                        key={folder.id}
                        className="group relative"
                        onDragOver={handleDragOver}
                        onDragEnter={() => handleDragEnterFolder(folder.id)}
                        onDragLeave={handleDragLeaveFolder}
                        onDrop={(e) => handleDropOnFolder(e, folder.id)}
                      >
                        <Button
                          variant={view === 'folder' && selectedFolderId === folder.id ? 'secondary' : 'ghost'}
                          className={cn(
                            "w-full justify-start gap-2 pr-16 transition-all duration-200",
                            dragOverFolder === folder.id && draggedEmail && "ring-2 ring-primary bg-primary/5"
                          )}
                          onClick={() => {
                            setView('folder')
                            setSelectedFolderId(folder.id)
                            setSelectedEmail(null)
                          }}
                        >
                          <div className="relative">
                            {view === 'folder' && selectedFolderId === folder.id ? (
                              <FolderOpen size={20} weight="fill" style={{ color: folder.color || '#8B5CF6' }} />
                            ) : (
                              <Folder size={20} weight="regular" style={{ color: folder.color || '#8B5CF6' }} />
                            )}
                          </div>
                          <span className="truncate flex-1 text-left">{folder.name}</span>
                          {folderEmailCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {folderEmailCount}
                            </Badge>
                          )}
                        </Button>
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingFolder(folder)
                              setFolderName(folder.name)
                              setFolderColor(folder.color || '#8B5CF6')
                              setShowFolderDialog(true)
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteFolder(folder.id)
                            }}
                          >
                            <Trash size={14} />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4 mt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <User size={18} />
                {t.email.users}
              </h3>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {(users || []).filter(u => u.email !== userEmail).map(user => (
                    <button
                      key={user.email}
                      onClick={() => {
                        setComposeThreadId(null)
                        setView('compose')
                        setComposeData(prev => ({ ...prev, to: user.email }))
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {getInitials(user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="text-sm font-medium truncate">{user.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-9"
          >
            <Card className="p-6 min-h-[600px]">
              <AnimatePresence mode="wait">
                {view === 'compose' && (
                  <motion.div
                    key="compose"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-4"
                  >
                    <h2 className="text-2xl font-bold mb-6">{t.email.newEmail}</h2>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t.email.to}</label>
                      <Input
                        placeholder={t.email.recipientEmail}
                        value={composeData.to}
                        onChange={(e) => setComposeData(prev => ({ ...prev, to: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t.email.subject}</label>
                      <Input
                        placeholder={t.email.emailSubject}
                        value={composeData.subject}
                        onChange={(e) => setComposeData(prev => ({ ...prev, subject: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t.email.message}</label>
                      <Textarea
                        placeholder={t.email.writeMessage}
                        value={composeData.message}
                        onChange={(e) => setComposeData(prev => ({ ...prev, message: e.target.value }))}
                        rows={12}
                        className="resize-none"
                      />
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        onClick={handleSendEmail}
                        className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white gap-2"
                        size="lg"
                      >
                        <PaperPlaneTilt size={20} weight="bold" />
                        {t.email.sendEmail}
                      </Button>
                      <Button
                        onClick={() => setView('inbox')}
                        variant="outline"
                        size="lg"
                      >
                        {t.email.cancel}
                      </Button>
                    </div>
                  </motion.div>
                )}

                {(view === 'inbox' || view === 'sent' || view === 'folder') && !selectedEmail && (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <div className="space-y-4 mb-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">
                          {view === 'inbox' && t.email.inbox}
                          {view === 'sent' && t.email.sent}
                          {view === 'folder' && (userFolders.find(f => f.id === selectedFolderId)?.name || t.email.folder)}
                        </h2>
                        <div className="flex items-center gap-2">
                          <Popover open={showFilters} onOpenChange={setShowFilters}>
                            <PopoverTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className={cn(
                                  "gap-2",
                                  (dateFilter !== 'all' || senderFilter !== 'all') && "border-primary bg-primary/5"
                                )}
                              >
                                <Funnel size={18} weight={dateFilter !== 'all' || senderFilter !== 'all' ? 'fill' : 'regular'} />
                                {t.email.filters}
                                {(dateFilter !== 'all' || senderFilter !== 'all') && (
                                  <Badge className="ml-1 h-5 px-1.5 bg-primary text-primary-foreground">
                                    {(dateFilter !== 'all' ? 1 : 0) + (senderFilter !== 'all' ? 1 : 0)}
                                  </Badge>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80" align="end">
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                      <CalendarBlank size={16} />
                                      {t.email.date}
                                    </label>
                                    {dateFilter !== 'all' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => setDateFilter('all')}
                                      >
                                        {t.email.clear}
                                      </Button>
                                    )}
                                  </div>
                                  <Select value={dateFilter} onValueChange={setDateFilter}>
                                    <SelectTrigger>
                                      <SelectValue placeholder={t.email.selectPeriod} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">{t.email.all}</SelectItem>
                                      <SelectItem value="today">{t.email.today}</SelectItem>
                                      <SelectItem value="week">{t.email.lastWeek}</SelectItem>
                                      <SelectItem value="month">{t.email.lastMonth}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <Separator />
                                
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                      <User size={16} />
                                      {view === 'inbox' ? t.email.sender : t.email.recipient}
                                    </label>
                                    {senderFilter !== 'all' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => setSenderFilter('all')}
                                      >
                                        {t.email.clear}
                                      </Button>
                                    )}
                                  </div>
                                  <Select value={senderFilter} onValueChange={setSenderFilter}>
                                    <SelectTrigger>
                                      <SelectValue placeholder={view === 'inbox' ? t.email.selectSender : t.email.selectRecipient} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">{t.email.all}</SelectItem>
                                      {uniqueSenders.map(sender => {
                                        const user = users.find(u => u.email === sender)
                                        return (
                                          <SelectItem key={sender} value={sender}>
                                            {user ? user.name : sender}
                                          </SelectItem>
                                        )
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {(dateFilter !== 'all' || senderFilter !== 'all') && (
                                  <>
                                    <Separator />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full"
                                      onClick={() => {
                                        setDateFilter('all')
                                        setSenderFilter('all')
                                      }}
                                    >
                                      <X size={16} />
                                      {t.email.clearAllFilters}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          
                          <div className="relative">
                            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <Input
                              placeholder={t.email.searchEmails}
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="pl-10 w-[300px]"
                            />
                          </div>
                        </div>
                      </div>

                      {(dateFilter !== 'all' || senderFilter !== 'all') && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-muted-foreground">Aktive filtre:</span>
                          {dateFilter !== 'all' && (
                            <Badge variant="secondary" className="gap-2">
                              <CalendarBlank size={14} />
                              {dateFilter === 'today' && 'I dag'}
                              {dateFilter === 'week' && 'Seneste uge'}
                              {dateFilter === 'month' && 'Seneste måned'}
                              <button
                                onClick={() => setDateFilter('all')}
                                className="ml-1 hover:text-foreground transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </Badge>
                          )}
                          {senderFilter !== 'all' && (
                            <Badge variant="secondary" className="gap-2">
                              <User size={14} />
                              {users.find(u => u.email === senderFilter)?.name || senderFilter}
                              <button
                                onClick={() => setSenderFilter('all')}
                                className="ml-1 hover:text-foreground transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    <ScrollArea className={cn(
                      "transition-all duration-200",
                      dateFilter !== 'all' || senderFilter !== 'all' ? "h-[430px]" : "h-[480px]"
                    )}>
                      <div className="space-y-2">
                        {(view === 'inbox' ? inboxEmails : view === 'sent' ? sentEmails : folderEmails).length === 0 ? (
                          <div className="text-center py-16 text-muted-foreground">
                            <Envelope size={64} className="mx-auto mb-4 opacity-50" />
                            <p className="text-lg">
                              {searchQuery || dateFilter !== 'all' || senderFilter !== 'all' 
                                ? t.email.noEmailsMatch 
                                : t.email.noEmailsToShow}
                            </p>
                            {(searchQuery || dateFilter !== 'all' || senderFilter !== 'all') && (
                              <Button
                                variant="link"
                                className="mt-2"
                                onClick={() => {
                                  setSearchQuery('')
                                  setDateFilter('all')
                                  setSenderFilter('all')
                                }}
                              >
                                {t.email.clearAllFilters}
                              </Button>
                            )}
                          </div>
                        ) : (
                          groupByThread(view === 'inbox' ? inboxEmails : view === 'sent' ? sentEmails : folderEmails).map((email) => {
                            const conversation = getConversation(email)
                            const conversationCount = conversation.length
                            const hasUnreadInThread = conversation.some(e => !e.read && e.to === userEmail)
                            return (
                            <motion.div
                              key={email.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e as any, email)}
                              onDragEnd={handleDragEnd}
                              onClick={() => handleEmailClick(email)}
                              className={cn(
                                "w-full text-left p-4 rounded-lg border transition-all duration-200",
                                "hover:bg-muted hover:border-primary/40 cursor-move",
                                hasUnreadInThread && view === 'inbox' && "bg-primary/5 border-primary/20 font-semibold",
                                draggedEmail?.id === email.id && "opacity-50"
                              )}
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                            >
                              <div className="flex items-start gap-3">
                                <Avatar className="h-10 w-10 mt-1">
                                  <AvatarFallback className={cn(
                                    "text-sm",
                                    hasUnreadInThread && view === 'inbox' ? "bg-primary text-primary-foreground" : "bg-muted"
                                  )}>
                                    {getInitials(view === 'inbox' ? email.from : email.to)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className={cn(
                                      "text-sm truncate min-w-0",
                                      hasUnreadInThread && view === 'inbox' && "font-bold"
                                    )}>
                                      {view === 'inbox' ? email.from : email.to}
                                    </span>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                                      <Clock size={14} />
                                      {formatTimestamp(email.timestamp)}
                                    </div>
                                  </div>
                                  <div className={cn(
                                    "text-sm mb-1 truncate flex items-center gap-2",
                                    hasUnreadInThread && view === 'inbox' ? "font-semibold" : "font-medium"
                                  )}>
                                    <span className="truncate"><AutoText text={email.subject} /></span>
                                    {conversationCount > 1 && (
                                      <Badge variant="secondary" className="shrink-0 h-5 px-1.5 text-xs gap-1">
                                        <ChatCircle size={12} />
                                        {conversationCount}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground truncate">
                                    <AutoText text={email.message} />
                                  </p>
                                </div>
                                {hasUnreadInThread && view === 'inbox' && (
                                  <EnvelopeOpen size={20} className="text-primary flex-shrink-0" weight="fill" />
                                )}
                              </div>
                            </motion.div>
                            )
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </motion.div>
                )}

                {selectedEmail && (() => {
                  const conversation = getConversation(selectedEmail)
                  const original = conversation[0] ?? selectedEmail
                  const latest = conversation[conversation.length - 1] ?? selectedEmail
                  // Ældre ferieanmodnings-mails (før actionLink fandtes) genkendes på type-markøren.
                  const detailActionLink = selectedEmail.actionLink
                    ?? ((selectedEmail.type === 'vacation-request' || selectedEmail.type === 'single-day-off-request') && isManager
                      ? { view: 'manager', tab: 'vacation-requests', label: 'Gå til ferieanmodninger' }
                      : undefined)
                  return (
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <Button
                        onClick={() => setSelectedEmail(null)}
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                      >
                        <ArrowLeft size={18} />
                        {t.email.back}
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setEmailToMove(selectedEmail)
                            setShowMoveToFolderDialog(true)
                          }}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <Folder size={18} />
                          {t.email.moveToFolder}
                        </Button>
                        <Button
                          onClick={() => {
                            setComposeThreadId(threadKeyOf(selectedEmail))
                            setView('compose')
                            setComposeData({
                              to: latest.from === userEmail ? latest.to : latest.from,
                              subject: original.subject.startsWith('Re: ') ? original.subject : `Re: ${original.subject}`,
                              message: ''
                            })
                            setSelectedEmail(null)
                          }}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <PaperPlaneTilt size={18} />
                          {t.email.reply}
                        </Button>
                        <Button
                          onClick={() => handleDeleteEmail(selectedEmail.id)}
                          variant="destructive"
                          size="sm"
                          className="gap-2"
                        >
                          <Trash size={18} />
                          {t.email.delete}
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-2xl font-bold"><AutoText text={original.subject} /></h2>
                        {conversation.length > 1 && (
                          <Badge variant="secondary" className="gap-1">
                            <ChatCircle size={14} />
                            {conversation.length} beskeder
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-4">
                        {conversation.map((msg, index) => {
                          const isMine = msg.from === userEmail
                          const senderName = users.find(u => u.email === msg.from)?.name || msg.from
                          return (
                            <div
                              key={msg.id}
                              className={cn(
                                "rounded-lg border p-4",
                                isMine ? "bg-primary/5 border-primary/20" : "bg-card",
                                index === conversation.length - 1 && conversation.length > 1 && "ring-1 ring-primary/30"
                              )}
                            >
                              <div className="flex items-start gap-3 mb-3">
                                <Avatar className="h-10 w-10">
                                  <AvatarFallback className={cn(isMine ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground")}>
                                    {getInitials(msg.from)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="font-semibold truncate">{isMine ? 'Dig' : senderName}</div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-1 shrink-0">
                                      <Clock size={14} />
                                      {formatTimestamp(msg.timestamp)}
                                    </div>
                                  </div>
                                  <div className="text-sm text-muted-foreground truncate">
                                    til {msg.to === userEmail ? 'dig' : (users.find(u => u.email === msg.to)?.name || msg.to)}
                                  </div>
                                </div>
                              </div>
                              <p className="whitespace-pre-wrap text-foreground leading-relaxed text-sm">
                                <AutoText text={msg.message} />
                              </p>
                            </div>
                          )
                        })}
                      </div>

                      {detailActionLink && (
                        <>
                          <Separator className="my-6" />
                          <Button
                            onClick={() => navigateTo(detailActionLink.view as AppViewId, { tab: detailActionLink.tab })}
                            className="gap-2 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white"
                            size="lg"
                          >
                            <Umbrella size={20} weight="bold" />
                            {detailActionLink.label}
                          </Button>
                        </>
                      )}
                    </div>
                  </motion.div>
                  )
                })()}

                {view === 'vacation-requests' && (
                  <motion.div
                    key="vacation-requests"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <h2 className="text-2xl font-bold mb-6">{t.email.vacationRequests}</h2>

                    {pendingVacationRequests.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground">
                        <Umbrella size={64} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg">{t.email.noPendingRequests}</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[580px]">
                        <div className="space-y-4">
                          {pendingVacationRequests.map((vacation) => {
                            const user = users.find(u => u.email === vacation.userEmail)
                            return (
                              <Card key={vacation.id} className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex items-start gap-3">
                                    <Avatar className="h-12 w-12">
                                      <AvatarFallback className="bg-primary text-primary-foreground">
                                        {getInitials(vacation.userEmail)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="font-semibold text-lg">{user?.name || vacation.userEmail}</div>
                                      <div className="text-sm text-muted-foreground">{vacation.userEmail}</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="gap-1">
                                    <Clock size={14} />
                                    {t.email.pending}
                                  </Badge>
                                </div>

                                <Separator className="my-4" />

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                  <div>
                                    <div className="text-sm text-muted-foreground mb-1"><AutoText text="Start Dato" /></div>
                                    <div className="font-medium">{formatDate(vacation.startDate)}</div>
                                  </div>
                                  <div>
                                    <div className="text-sm text-muted-foreground mb-1"><AutoText text="Slut Dato" /></div>
                                    <div className="font-medium">{formatDate(vacation.endDate)}</div>
                                  </div>
                                </div>

                                {vacation.notes && (
                                  <div className="mb-4">
                                    <div className="text-sm text-muted-foreground mb-1">{t.email.notes}</div>
                                    <div className="text-sm bg-muted p-3 rounded-lg"><AutoText text={vacation.notes} /></div>
                                  </div>
                                )}

                                <div className="flex gap-2 mt-4">
                                  <Button
                                    onClick={() => {
                                      setSelectedVacation(vacation)
                                      setShowCalendarPreview(true)
                                    }}
                                    variant="outline"
                                    className="flex-1 gap-2"
                                  >
                                    <CalendarBlank size={18} />
                                    {t.email.previewCalendar}
                                  </Button>
                                  <Button
                                    onClick={() => handleApproveVacation(vacation)}
                                    variant="default"
                                    className="flex-1 gap-2 bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90"
                                  >
                                    <Check size={18} weight="bold" />
                                    {t.email.approve}
                                  </Button>
                                  <Button
                                    onClick={() => handleRejectVacation(vacation)}
                                    variant="destructive"
                                    className="flex-1 gap-2"
                                  >
                                    <X size={18} weight="bold" />
                                    {t.email.reject}
                                  </Button>
                                </div>
                              </Card>
                            )
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        </div>

        <Dialog open={showCalendarPreview} onOpenChange={setShowCalendarPreview}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle><AutoText text="Feriekalender Forhåndsvisning" /></DialogTitle>
            </DialogHeader>
            {selectedVacation && (
              <div className="space-y-6">
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {getInitials(selectedVacation.userEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">{users.find(u => u.email === selectedVacation.userEmail)?.name || selectedVacation.userEmail}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(selectedVacation.startDate)} - {formatDate(selectedVacation.endDate)}
                      </div>
                    </div>
                  </div>
                  {selectedVacation.notes && (
                    <div className="text-sm text-muted-foreground">
                      <strong>{t.email.notes}:</strong> <AutoText text={selectedVacation.notes} />
                    </div>
                  )}
                </div>

                <div className="border rounded-lg p-4">
                  {renderCalendarPreview()}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    onClick={() => {
                      setShowCalendarPreview(false)
                      setSelectedVacation(null)
                    }}
                    variant="outline"
                  >
                    {t.common.close}
                  </Button>
                  <Button
                    onClick={() => handleApproveVacation(selectedVacation)}
                    className="gap-2 bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90"
                  >
                    <Check size={18} weight="bold" />
                    {t.email.approve}
                  </Button>
                  <Button
                    onClick={() => handleRejectVacation(selectedVacation)}
                    variant="destructive"
                    className="gap-2"
                  >
                    <X size={18} weight="bold" />
                    {t.email.reject}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingFolder ? t.email.editFolder : t.email.createFolder}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t.email.folderName}</label>
                <Input
                  placeholder={t.email.enterFolderName}
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      editingFolder ? handleUpdateFolder() : handleCreateFolder()
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t.email.folderColor}</label>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="color"
                      value={folderColor}
                      onChange={(e) => setFolderColor(e.target.value)}
                      className="h-10 w-20 rounded-md border border-input cursor-pointer"
                    />
                  </div>
                  <div className="flex-1 grid grid-cols-6 gap-2">
                    {['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#84CC16', '#A855F7', '#06B6D4'].map(color => (
                      <button
                        key={color}
                        onClick={() => setFolderColor(color)}
                        className={cn(
                          "h-8 w-8 rounded-md border-2 transition-all",
                          folderColor === color ? "border-foreground scale-110" : "border-transparent hover:border-muted-foreground/50"
                        )}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  onClick={() => {
                    setShowFolderDialog(false)
                    setEditingFolder(null)
                    setFolderName('')
                    setFolderColor('#8B5CF6')
                  }}
                  variant="outline"
                >
                  {t.email.cancel}
                </Button>
                <Button
                  onClick={editingFolder ? handleUpdateFolder : handleCreateFolder}
                  className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white"
                >
                  {editingFolder ? t.common.save : <AutoText text="Opret" />}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showMoveToFolderDialog} onOpenChange={setShowMoveToFolderDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle><AutoText text="Flyt Email til Mappe" /></DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {userFolders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Folder size={48} className="mx-auto mb-3 opacity-50" />
                  <p><AutoText text="Du har ingen mapper endnu." /></p>
                  <Button
                    onClick={() => {
                      setShowMoveToFolderDialog(false)
                      setShowFolderDialog(true)
                    }}
                    variant="link"
                    className="mt-2"
                  >
                    <AutoText text="Opret din første mappe" />
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground"><AutoText text="Vælg en mappe at flytte emailen til:" /></p>
                  <div className="space-y-2">
                    {emailToMove?.folderId && (
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2"
                        onClick={() => handleMoveToFolder(null)}
                      >
                        <Envelope size={18} />
                        {t.email.moveToInbox}
                      </Button>
                    )}
                    {userFolders.map(folder => (
                      <Button
                        key={folder.id}
                        variant={emailToMove?.folderId === folder.id ? 'secondary' : 'outline'}
                        className="w-full justify-start gap-2"
                        onClick={() => handleMoveToFolder(folder.id)}
                        disabled={emailToMove?.folderId === folder.id}
                      >
                        <Folder size={18} style={{ color: folder.color || '#8B5CF6' }} />
                        {folder.name}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
