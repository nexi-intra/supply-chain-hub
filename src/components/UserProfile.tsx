import { useState, useEffect } from 'react'
import { NisseSpot } from '@/components/christmas/NisseSpot'
import { SignOut, User, UserGear, Gear, Crown, ArrowsLeftRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { hashPassword, verifyPassword } from '@/lib/passwords'
import { saveInBackground } from '@/lib/saveInBackground'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { useLanguage } from '@/contexts/LanguageContext'
import { DesktopNotificationsSetting } from '@/components/DesktopNotificationsSetting'
import { useMyHubs } from '@/hooks/useMyHubs'
import { getHubAccessLabels } from '@/lib/hubAccessLabels'
import { requestHubSwitch } from '@/lib/hubSwitch'

interface UserProfileProps {
  userEmail: string
  /** The user's full name; until it is known, a name is read from the e-mail ("jacob.remmer@..." -> "Jacob Remmer"). */
  displayName?: string
  onLogout: () => void
  onAdminClick?: () => void
  showAdmin?: boolean
  onCreatorClick?: () => void
  showCreator?: boolean
  hideEmail?: boolean
}

interface UserData {
  email: string
  password: string
  fullName: string
  phone?: string
  isManager?: boolean
}

/** The full name when known and not just the e-mail again, otherwise the e-mail's local part written as a name. */
export function shownName(email: string, fullName?: string): string {
  const name = fullName?.trim()
  if (name && name.toLowerCase() !== email.trim().toLowerCase()) return name
  return email.split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(' ')
}

export function UserProfile({ userEmail, displayName, onLogout, onAdminClick, showAdmin, onCreatorClick, showCreator, hideEmail = false }: UserProfileProps) {
  const { t, language } = useLanguage()
  const { hubs } = useMyHubs()
  const waitingElsewhere = hubs.filter(hub => !hub.active).reduce((sum, hub) => sum + hub.pending, 0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const handleOpenSettings = async () => {
    const usersData = (await window.kv.get<Record<string, UserData>>('users')) || {}
    const userData = usersData[userEmail]
    
    if (userData) {
      setPhoneNumber(userData.phone || '')
    }
    
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setSettingsOpen(true)
  }

  const handleSaveSettings = async () => {
    if (saving) return
    setSaving(true)
    try {
      const usersData = (await window.kv.get<Record<string, UserData>>('users')) || {}
      const userData = usersData[userEmail]

      if (!userData) {
        toast.error(t.profile.errors.userNotFound)
        return
      }

      if (newPassword) {
        if (!currentPassword) {
          toast.error(t.profile.errors.currentPasswordRequired)
          return
        }

        if (!window.electronAuth && !(await verifyPassword(currentPassword, userData.password))) {
          toast.error(t.profile.errors.currentPasswordWrong)
          return
        }

        if (newPassword.length < 6) {
          toast.error(t.profile.errors.passwordTooShort)
          return
        }

        if (newPassword !== confirmPassword) {
          toast.error(t.profile.errors.passwordMismatch)
          return
        }

        if (window.electronAuth) {
          try {
            await window.electronAuth.profile({ phone: phoneNumber || userData.phone || '', currentPassword, newPassword })
          } catch (error) {
            if (String(error).includes('AUTH_CREDENTIALS')) { toast.error(t.profile.errors.currentPasswordWrong); return }
            throw error
          }
          toast.success(t.profile.passwordUpdated)
          setSettingsOpen(false)
          onLogout()
          return
        }

        usersData[userEmail] = {
          ...userData,
          password: await hashPassword(newPassword),
          phone: phoneNumber || userData.phone,
        }

        await window.kv.set('users', usersData)
        toast.success(t.profile.passwordUpdated)
      } else if (phoneNumber !== userData.phone) {
        if (window.electronAuth) {
          // Only the phone number: nothing to check first, so the dialog closes at once and the save (up to 90 s on the
          // shared drive) runs in the background.
          void saveInBackground(trackPendingWrite(window.electronAuth.profile({ phone: phoneNumber })), { failure: t.profile.errors.generic })
          toast.success(t.profile.settingsUpdated)
          setSettingsOpen(false)
          return
        }
        usersData[userEmail] = {
          ...userData,
          phone: phoneNumber,
        }

        await window.kv.set('users', usersData)
        toast.success(t.profile.settingsUpdated)
      } else {
        toast.info(t.profile.noChanges)
      }

      setSettingsOpen(false)
    } catch (error) {
      console.error('Error in handleSaveSettings:', error)
      toast.error(t.profile.errors.generic)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="flex items-center gap-2 h-10 px-3 hover:bg-primary/10 transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <User size={18} weight="bold" className="text-primary-foreground" />
            </div>
            {!hideEmail && <span className="text-sm font-medium hidden sm:inline">{shownName(userEmail, displayName)}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex items-center justify-between">{t.profile.menuMyAccount}<NisseSpot spot="profile-menu" /></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-muted-foreground text-sm">
            {userEmail}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={handleOpenSettings}
            className="cursor-pointer"
          >
            <Gear size={16} className="mr-2" />
            {t.profile.menuSettings}
          </DropdownMenuItem>
          {hubs.length > 1 && (
            <DropdownMenuItem onClick={() => requestHubSwitch()} className="cursor-pointer">
              <ArrowsLeftRight size={16} className="mr-2" />
              <span className="flex-1">{getHubAccessLabels(language).switchHub}</span>
              {waitingElsewhere > 0 && <span className="ml-2 rounded-full bg-[oklch(0.55_0.16_25)] px-2 text-xs font-semibold text-white">{waitingElsewhere}</span>}
            </DropdownMenuItem>
          )}
          {showCreator && onCreatorClick && (
            <DropdownMenuItem 
              onClick={onCreatorClick}
              className="cursor-pointer"
            >
              <Crown size={16} className="mr-2" />
              {t.profile.menuCreatorPanel}
            </DropdownMenuItem>
          )}
          {showAdmin && onAdminClick && (
            <DropdownMenuItem 
              onClick={onAdminClick}
              className="cursor-pointer"
            >
              <UserGear size={16} className="mr-2" />
              {t.profile.menuAdminPanel}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={onLogout}
            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
          >
            <SignOut size={16} className="mr-2" />
            {t.profile.menuLogout}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.profile.menuSettings}</DialogTitle>
            <DialogDescription>
              {t.profile.settingsDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t.profile.phoneNumber}</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+45 12 34 56 78"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>

            <DesktopNotificationsSetting />

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-4">{t.profile.changePassword}</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">{t.profile.currentPassword}</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t.profile.newPassword}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t.profile.confirmPassword}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              {t.profile.cancel}
            </Button>
            <Button onClick={handleSaveSettings} loading={saving}>
              {t.profile.saveChanges}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
