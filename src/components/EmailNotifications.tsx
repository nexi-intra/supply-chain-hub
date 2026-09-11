import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Envelope, Trash, ArrowBendUpLeft, PaperPlaneTilt, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { da, enUS } from 'date-fns/locale'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Email } from '@/lib/types'

interface EmailNotificationsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
}

export function EmailNotifications({ open, onOpenChange, userEmail }: EmailNotificationsProps) {
  const { t, language } = useLanguage()
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [users, setUsers] = useState<Record<string, { fullName: string; email: string }>>({})
  const [isReplying, setIsReplying] = useState(false)
  const [replyMessage, setReplyMessage] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    if (open) {
      loadEmails()
      loadUsers()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setIsReplying(false)
      setReplyMessage('')
    }
  }, [open])

  const loadUsers = async () => {
    const usersData = await window.kv.get<Record<string, { email: string; fullName: string }>>('users') || {}
    setUsers(usersData)
  }

  const loadEmails = async () => {
    const allEmails = await window.kv.get<Email[]>('emails') || []
    const userEmails = allEmails
      .filter(email => email.to === userEmail)
      .sort((a, b) => b.timestamp - a.timestamp)
    setEmails(userEmails)
  }

  const handleSelectEmail = (email: Email) => {
    setSelectedEmail(email)
  }

  const handleMarkAsRead = async (id: string) => {
    const allEmails = await window.kv.get<Email[]>('emails') || []
    const updatedEmails = allEmails.map(e => 
      e.id === id ? { ...e, read: true } : e
    )
    await window.kv.set('emails', updatedEmails)
    
    setEmails(prevEmails => prevEmails.filter(e => e.id !== id))
    
    if (selectedEmail?.id === id) {
      setSelectedEmail(null)
    }
    
    toast.success(language === 'da' ? 'Markeret som læst' : 'Marked as read')
  }

  const handleDelete = async (id: string) => {
    const allEmails = await window.kv.get<Email[]>('emails') || []
    const updatedEmails = allEmails.filter(e => e.id !== id)
    await window.kv.set('emails', updatedEmails)
    
    setEmails(prevEmails => prevEmails.filter(e => e.id !== id))
    
    if (selectedEmail?.id === id) {
      setSelectedEmail(null)
    }
    toast.success(t.emailNotifications.deleted)
  }

  const handleSendReply = async () => {
    if (!selectedEmail || !replyMessage.trim()) {
      toast.error(language === 'da' ? 'Skriv en besked' : 'Write a message')
      return
    }

    setIsSending(true)
    
    try {
      const allEmails = await window.kv.get<Email[]>('emails') || []
      const newEmail: Email = {
        id: `${Date.now()}-${Math.random()}`,
        from: userEmail,
        to: selectedEmail.from,
        subject: `Re: ${selectedEmail.subject}`,
        message: replyMessage,
        timestamp: Date.now(),
        read: false
      }
      
      await window.kv.set('emails', [...allEmails, newEmail])
      
      toast.success(language === 'da' ? 'Svar sendt' : 'Reply sent')
      setReplyMessage('')
      setIsReplying(false)
      
      await loadEmails()
    } catch (error) {
      toast.error(language === 'da' ? 'Kunne ikke sende svar' : 'Failed to send reply')
    } finally {
      setIsSending(false)
    }
  }

  const getSenderName = (email: string) => {
    return users[email]?.fullName || email.split('@')[0]
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return language === 'da' ? 'Lige nu' : 'Just now'
    if (diffMins < 60) return language === 'da' ? `${diffMins} min siden` : `${diffMins} min ago`
    if (diffHours < 24) return language === 'da' ? `${diffHours} time${diffHours > 1 ? 'r' : ''} siden` : `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return language === 'da' ? `${diffDays} dag${diffDays > 1 ? 'e' : ''} siden` : `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    
    return format(date, 'd. MMM yyyy', { locale: language === 'da' ? da : enUS })
  }

  const unreadCount = emails.filter(e => !e.read).length
  const unreadEmails = emails.filter(e => !e.read)

  const dateLocale = language === 'da' ? da : enUS

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] flex items-center justify-center">
              <Envelope size={24} weight="duotone" className="text-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl">{t.emailNotifications.title}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? t.emailNotifications.unreadCount.replace('{count}', unreadCount.toString()) : t.emailNotifications.noUnread}
              </p>
            </div>
          </div>
        </DialogHeader>

        {unreadCount === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Envelope size={64} weight="duotone" className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">{language === 'da' ? 'Ingen nye beskeder' : 'No new messages'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-2">
                {unreadEmails.map((email) => (
                  <div
                    key={email.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                      selectedEmail?.id === email.id
                        ? 'bg-primary/5 border-primary'
                        : 'bg-card border-border'
                    }`}
                    onClick={() => handleSelectEmail(email)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{getSenderName(email.from)}</p>
                        <p className="text-xs text-muted-foreground truncate">{email.from}</p>
                      </div>
                      <Badge variant="secondary" className="bg-[oklch(0.42_0.19_270)] text-white shrink-0">
                        {t.emailNotifications.new}
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-sm mb-1 line-clamp-1">{email.subject}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{email.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(email.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="border rounded-lg p-6 bg-card">
              {selectedEmail ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{t.emailNotifications.from || 'Fra'}</p>
                    <p className="font-semibold">{getSenderName(selectedEmail.from)}</p>
                    <p className="text-xs text-muted-foreground">{selectedEmail.from}</p>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{t.emailNotifications.subject}</p>
                    <p className="font-semibold">{selectedEmail.subject}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-2">{t.emailNotifications.sent || 'Sendt'}</p>
                    <p className="text-sm">{format(new Date(selectedEmail.timestamp), 'd. MMMM yyyy \'kl.\' HH:mm', { locale: dateLocale })}</p>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-sm text-muted-foreground mb-2">{t.emailNotifications.message}</p>
                    <ScrollArea className="h-[150px] w-full rounded-md border p-4 bg-muted/30">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{selectedEmail.message}</div>
                    </ScrollArea>
                  </div>

                  <Button
                    onClick={() => handleMarkAsRead(selectedEmail.id)}
                    className="w-full gap-2 bg-[oklch(0.42_0.19_270)] hover:bg-[oklch(0.38_0.19_272)]"
                    size="lg"
                  >
                    <CheckCircle size={20} weight="duotone" />
                    {language === 'da' ? 'Marker som læst' : 'Mark as read'}
                  </Button>

                  {isReplying ? (
                    <div className="space-y-3 pt-2">
                      <Separator />
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <ArrowBendUpLeft size={16} className="text-muted-foreground" />
                          <p className="text-sm font-medium">{language === 'da' ? 'Svar til' : 'Reply to'} {getSenderName(selectedEmail.from)}</p>
                        </div>
                        <Textarea
                          placeholder={language === 'da' ? 'Skriv dit svar her...' : 'Write your reply here...'}
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          className="min-h-[120px] resize-none"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleSendReply}
                          disabled={isSending || !replyMessage.trim()}
                          className="flex-1 gap-2"
                        >
                          <PaperPlaneTilt size={18} />
                          {isSending ? (language === 'da' ? 'Sender...' : 'Sending...') : (language === 'da' ? 'Send svar' : 'Send reply')}
                        </Button>
                        <Button
                          onClick={() => {
                            setIsReplying(false)
                            setReplyMessage('')
                          }}
                          variant="outline"
                        >
                          {language === 'da' ? 'Annuller' : 'Cancel'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => setIsReplying(true)}
                        className="flex-1 gap-2"
                        variant="default"
                      >
                        <ArrowBendUpLeft size={18} />
                        {language === 'da' ? 'Svar' : 'Reply'}
                      </Button>
                      <Button
                        onClick={() => handleDelete(selectedEmail.id)}
                        variant="destructive"
                        size="icon"
                      >
                        <Trash size={18} />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Envelope size={64} weight="duotone" className="mx-auto mb-4 opacity-20" />
                    <p>{t.emailNotifications.selectNotification}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
