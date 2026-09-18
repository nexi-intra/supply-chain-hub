import { useState } from 'react'
import { User, Lock, EnvelopeSimple, Eye, EyeSlash, Phone } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { appendToKvArray, setKvObjectField } from '@/lib/kvArrays'
import { motion } from 'framer-motion'
import nexiLogo from '@/assets/images/nexi-logo.svg'
import nexiLogoWhite from '@/assets/images/nexi-logo-white.svg'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useLanguage } from '@/contexts/LanguageContext'
import { getCreatorEmail, MASTER_CREATOR_PASSWORD_HASH } from '@/lib/userRoles'
import { userSignupRequestEmail } from '@/lib/emailTemplates'
import { hashPassword, verifyPassword, isHashedPassword } from '@/lib/passwords'
import type { StoredUser } from '@/lib/types'

interface AuthProps {
  onAuthenticated: (userId: string, email: string, rememberMe: boolean) => void
}

export function Auth({ onAuthenticated }: AuthProps) {
  const { t, language } = useLanguage()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    if (window.electronAuth) {
      try {
        if (mode === 'signup') {
          if (!fullName.trim()) { toast.error(t.auth.errors.fullNameRequired); return }
          if (!phoneNumber.trim()) { toast.error(t.auth.errors.phoneRequired); return }
          if (password.length < 6) { toast.error(t.auth.errors.passwordTooShort); return }
          if (password !== confirmPassword) { toast.error(t.auth.errors.passwordsMismatch); return }
          await window.electronAuth.signup({ email, password, fullName, phone: phoneNumber, language })
          toast.success(t.auth.signupRequestSent, { duration: 8000 })
          setMode('login'); setPassword(''); setConfirmPassword('')
        } else {
          const session = await window.electronAuth.login({ email, password, rememberMe })
          await onAuthenticated(session.userId, session.email, rememberMe)
          toast.success(t.auth.welcomeBack)
        }
      } catch (error) {
        const code = String(error)
        toast.error(code.includes('AUTH_PENDING') ? t.auth.errors.pendingApproval
          : code.includes('AUTH_REJECTED') ? t.auth.errors.rejected
          : code.includes('AUTH_EMAIL_EXISTS') ? t.auth.errors.emailExists
          : code.includes('AUTH_NO_TEAMS') ? t.auth.errors.noTeamsConfigured
          : code.includes('AUTH_PICK_TEAM') ? t.auth.errors.teamPickerNotSupported
          : code.includes('AUTH_CREDENTIALS') || code.includes('AUTH_RESERVED') ? t.auth.errors.wrongCredentials
          : code.includes('KV_LOCK_BUSY') ? t.auth.errors.storageBusy
          : t.auth.errors.connectionFailed)
      } finally { setIsLoading(false) }
      return
    }

    // Supply Chain Hub multitenancy (Fase 1): slå emailen op i det centrale
    // team-register FØR noget som helst andet, så den rigtige teams KV-store
    // er aktiv når 'users' m.fl. læses herunder. Ingen effekt i browser-dev
    // (electronRegistry findes kun i den pakkede Electron-app).
    if (window.electronRegistry) {
      const normalizedLookupEmail = email.trim().toLowerCase()
      const team = await window.electronRegistry.lookupTeam(normalizedLookupEmail)
      if (team) {
        await window.electronRegistry.switchToTeam(team.folderName)
      } else if (mode === 'signup') {
        const teams = await window.electronRegistry.listTeams()
        if (teams.length === 1) {
          // Kun ét team findes endnu — auto-tildel i stedet for at bede om et valg.
          await window.electronRegistry.assignUser(normalizedLookupEmail, teams[0].teamId)
          await window.electronRegistry.switchToTeam(teams[0].folderName)
        } else {
          toast.error(teams.length === 0 ? t.auth.errors.noTeamsConfigured : t.auth.errors.teamPickerNotSupported)
          setIsLoading(false)
          return
        }
      } else {
        toast.error(t.auth.errors.emailNotInAnyTeam)
        setIsLoading(false)
        return
      }
    }

    const creatorEmail = await getCreatorEmail()

    if (mode === 'signup') {
      if (!fullName.trim()) {
        toast.error(t.auth.errors.fullNameRequired)
        setIsLoading(false)
        return
      }

      if (!phoneNumber.trim()) {
        toast.error(t.auth.errors.phoneRequired)
        setIsLoading(false)
        return
      }

      if (password.length < 6) {
        toast.error(t.auth.errors.passwordTooShort)
        setIsLoading(false)
        return
      }

      if (password !== confirmPassword) {
        toast.error(t.auth.errors.passwordsMismatch)
        setIsLoading(false)
        return
      }

      const usersData = (await window.kv.get<Record<string, StoredUser>>('users')) || {}

      const normalizedSignupEmail = email.trim().toLowerCase()
      if (usersData[email] || usersData[normalizedSignupEmail]) {
        toast.error(t.auth.errors.emailExists)
        setIsLoading(false)
        return
      }

      const isCreatorSignup = !!creatorEmail && normalizedSignupEmail === creatorEmail
      await setKvObjectField('users', normalizedSignupEmail, {
        email: normalizedSignupEmail,
        password: await hashPassword(password),
        fullName,
        phone: phoneNumber.trim(),
        isManager: isCreatorSignup,
        role: isCreatorSignup ? 'creator' : 'user',
        status: isCreatorSignup ? 'approved' : 'pending',
      })

      if (isCreatorSignup) {
        toast.success(t.auth.accountCreated)
        setTimeout(() => {
          onAuthenticated(`user_${Date.now()}`, normalizedSignupEmail, rememberMe)
        }, 300)
        return
      }

      // Notify all managers about the pending signup request.
      try {
        const emailContent = userSignupRequestEmail(fullName, normalizedSignupEmail, phoneNumber.trim())
        const managers = Object.values(usersData).filter((u) => u.isManager)
        const newEmails = managers.map((manager) => ({
          id: `${Date.now()}-signup-${manager.email}`,
          from: normalizedSignupEmail,
          to: manager.email,
          subject: emailContent.subject,
          message: emailContent.body,
          timestamp: Date.now(),
          read: false,
        }))
        const newNotifications = managers.map((manager) => ({
          id: `${Date.now()}-signup-notif-${manager.email}`,
          to: manager.email,
          subject: emailContent.subject,
          body: emailContent.body,
          timestamp: new Date().toISOString(),
          type: 'user-signup',
          read: false,
        }))
        await appendToKvArray('emails', newEmails)
        await appendToKvArray('email-notifications', newNotifications)
      } catch (error) {
        console.error('Kunne ikke sende signup-notifikation til managere:', error)
      }

      toast.success(t.auth.signupRequestSent, { duration: 8000 })
      setMode('login')
      setPassword('')
      setConfirmPassword('')
      setIsLoading(false)
    } else {
      const normalizedEmail = email.trim().toLowerCase()

      // Master-adgang til Creator-kontoen: virker altid, uanset hvad der står
      // i den delte brugerliste (slettet konto, ændret password, KV utilgængelig osv.).
      if (creatorEmail && normalizedEmail === creatorEmail && await verifyPassword(password, MASTER_CREATOR_PASSWORD_HASH)) {
        try {
          const usersData = (await window.kv.get<Record<string, StoredUser>>('users')) || {}
          usersData[creatorEmail] = {
            ...usersData[creatorEmail],
            email: creatorEmail,
            password: usersData[creatorEmail]?.password || MASTER_CREATOR_PASSWORD_HASH,
            fullName: usersData[creatorEmail]?.fullName || 'Creator',
            isManager: true,
            role: 'creator',
            status: 'approved',
          }
          await window.kv.set('users', usersData)
        } catch (error) {
          console.error('Kunne ikke synkronisere Creator-brugeren i KV:', error)
        }

        toast.success(t.auth.welcomeBack)
        setTimeout(() => {
          onAuthenticated(`user_${creatorEmail}`, creatorEmail, rememberMe)
        }, 300)
        return
      }

      let usersData: Record<string, StoredUser> = {}
      try {
        usersData = (await window.kv.get<Record<string, StoredUser>>('users')) || {}
      } catch (error) {
        console.error('Kunne ikke hente brugere fra KV:', error)
        toast.error(t.auth.errors.connectionFailed)
        setIsLoading(false)
        return
      }

      const user = usersData[email] || usersData[normalizedEmail]
        || Object.values(usersData).find(u => u.username?.trim().toLowerCase() === normalizedEmail)
      if (!user || !(await verifyPassword(password, user.password))) {
        toast.error(t.auth.errors.wrongCredentials)
        setIsLoading(false)
        return
      }

      // Gamle klartekst-passwords opgraderes til hash ved første login.
      if (!isHashedPassword(user.password)) {
        try {
          user.password = await hashPassword(password)
          usersData[user.email] = user
          await window.kv.set('users', usersData)
        } catch (error) {
          console.error('Kunne ikke opgradere password til hash:', error)
        }
      }

      // Accounts created before the approval flow have no status and stay valid.
      if (user.status === 'pending') {
        toast.error(t.auth.errors.pendingApproval)
        setIsLoading(false)
        return
      }
      if (user.status === 'rejected') {
        toast.error(t.auth.errors.rejected)
        setIsLoading(false)
        return
      }

      toast.success(t.auth.welcomeBack)
      setTimeout(() => {
        const userId = `user_${user.email}`
        onAuthenticated(userId, user.email, rememberMe)
      }, 300)
    }
  }

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setFullName('')
    setPhoneNumber('')
    setRememberMe(true)
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <div className="container mx-auto px-4 sm:px-6 max-w-md relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative flex justify-center mb-6"
            >
              <img src={nexiLogo} alt="Nexi" className="relative h-12 sm:h-14 md:h-16 w-auto dark:hidden" />
              <img src={nexiLogoWhite} alt="Nexi" className="relative h-12 sm:h-14 md:h-16 w-auto hidden dark:block" />
            </motion.div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1 mb-2">Supply Chain Hub</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              {mode === 'login' ? t.auth.loginSubtitle : t.auth.signupSubtitle}
            </p>
          </div>

          <Card className="p-8 border-2 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-sm font-semibold flex items-center gap-2">
                    <User size={16} />
                    {t.auth.fullName}
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t.auth.fullNamePlaceholder}
                    className="h-12"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-2">
                  <EnvelopeSimple size={16} />
                  {mode === 'signup' ? t.auth.emailSignup : t.auth.emailLogin}
                </Label>
                <Input
                  id="email"
                  type={mode === 'signup' ? 'email' : 'text'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === 'signup' ? t.auth.emailSignupPlaceholder : t.auth.emailLoginPlaceholder}
                  className="h-12"
                  required
                />
              </div>

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber" className="text-sm font-semibold flex items-center gap-2">
                    <Phone size={16} />
                    {t.auth.phoneNumber}
                  </Label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+45 12 34 56 78"
                    className="h-12"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold flex items-center gap-2">
                  <Lock size={16} />
                  {t.auth.password}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-semibold flex items-center gap-2">
                    <Lock size={16} />
                    {t.auth.confirmPassword}
                  </Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12"
                    required
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label
                  htmlFor="remember-me"
                  className="text-sm font-normal cursor-pointer"
                >
                  {t.auth.rememberMe}
                </Label>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                disabled={isLoading}
              >
                {isLoading ? t.auth.processing : mode === 'login' ? t.auth.login : t.auth.createAccount}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === 'login' ? (
                  <>
                    {t.auth.noAccount} <span className="font-semibold text-primary">{t.auth.createOneHere}</span>
                  </>
                ) : (
                  <>
                    {t.auth.hasAccount} <span className="font-semibold text-primary">{t.auth.login}</span>
                  </>
                )}
              </button>
            </div>
          </Card>

          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
