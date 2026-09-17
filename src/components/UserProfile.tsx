import { useState, useEffect } from 'react'
import { SignOut, User, UserGear, Gear, Crown } from '@phosphor-icons/react'
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
import { useLanguage } from '@/contexts/LanguageContext'

interface UserProfileProps {
  userEmail: string
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

export function UserProfile({ userEmail, onLogout, onAdminClick, showAdmin, onCreatorClick, showCreator, hideEmail = false }: UserProfileProps) {
  const { t } = useLanguage()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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
          await window.electronAuth.profile({ phone: phoneNumber })
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
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <User size={18} weight="bold" className="text-primary-foreground" />
            </div>
            {!hideEmail && <span className="text-sm font-medium hidden sm:inline">{userEmail}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t.profile.menuMyAccount}</DropdownMenuLabel>
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
            <Button onClick={handleSaveSettings}>
              {t.profile.saveChanges}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
