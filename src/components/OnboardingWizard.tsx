import { useState, useEffect, useRef } from 'react'
import { UserPlus, UserMinus, ArrowRight, ArrowLeft, Check, Gift, ShieldCheck, User as UserIcon, Warning, CalendarBlank, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { hashPassword } from '@/lib/passwords'
import { getCreatorEmail, type UserRole } from '@/lib/userRoles'
import { newId } from '@/lib/utils'
import { appendToKvArray, upsertInKvArray, removeFromKvArray, setKvObjectField, deleteKvObjectField } from '@/lib/kvArrays'
import type { ShiftAssignment, VacationEntry, BirthdayEntry } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'

interface WizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** What the onboarding is creating, so the Manager Panel can show it at once (a write to M: takes 20-90 s). */
export interface OnboardedAccount {
  email: string
  fullName: string
  role: UserRole
  phone: string
}

interface OnboardingWizardProps extends WizardProps {
  /**
   * Called at once when the manager confirms: `accountSaved` resolves when the account is saved (false if it was not),
   * `birthday` is the birthday being saved with it, if one was given.
   */
  onCreating: (account: OnboardedAccount, accountSaved: Promise<boolean>, birthday?: { entry: BirthdayEntry & { id: string }; saved: Promise<boolean> }) => void
}

/** Trin-indikator (1 ● 2 ● 3) øverst i begge wizards. */
function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {labels.map((label, i) => {
        const step = i + 1
        const isActive = step === current
        const isDone = step < current
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-border" />}
            <div className="flex items-center gap-1.5">
              <div className={
                isDone
                  ? 'h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold'
                  : isActive
                    ? 'h-6 w-6 rounded-full border-2 border-primary text-primary flex items-center justify-center text-xs font-bold'
                    : 'h-6 w-6 rounded-full border-2 border-muted-foreground/30 text-muted-foreground flex items-center justify-center text-xs font-bold'
              }>
                {isDone ? <Check size={12} weight="bold" /> : step}
              </div>
              <span className={isActive ? 'text-xs font-semibold' : 'text-xs text-muted-foreground'}>{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onboarding: opret konto → fødselsdag (valgfri) → bekræft
// ---------------------------------------------------------------------------

export function OnboardingWizard({ open, onOpenChange, onCreating }: OnboardingWizardProps) {
  const { t } = useLanguage()
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [birthDate, setBirthDate] = useState('')
  // A failed save opens the wizard again on the summary with what was typed.
  const restoreForm = useRef<{ fullName: string; email: string; phone: string; password: string; role: UserRole; birthDate: string } | null>(null)

  useEffect(() => {
    if (open) {
      const form = restoreForm.current
      restoreForm.current = null
      setStep(form ? 3 : 1)
      setFullName(form?.fullName ?? '')
      setEmail(form?.email ?? '')
      setPhone(form?.phone ?? '')
      setPassword(form?.password ?? '')
      setRole(form?.role ?? 'user')
      setBirthDate(form?.birthDate ?? '')
    }
  }, [open])

  const validateStep1 = async (): Promise<boolean> => {
    if (!fullName.trim()) { toast.error(t.onboardingWizard.nameRequired); return false }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) { toast.error(t.managerPanel.validation.invalidEmail); return false }
    if (password.trim().length < 6) { toast.error(t.managerPanel.validation.passwordTooShort); return false }
    if (!phone.trim()) { toast.error(t.managerPanel.validation.createPhoneRequired); return false }
    const usersData = await window.kv.get<Record<string, unknown>>('users') || {}
    if (usersData[email.trim().toLowerCase()]) { toast.error(t.managerPanel.validation.emailExists); return false }
    return true
  }

  const handleNext = async () => {
    if (step === 1) {
      if (await validateStep1()) setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

  // The wizard closes and the person shows in the Manager Panel at once; the account is saved in the background, then the
  // birthday and the welcome mail at the same time.
  const handleConfirm = () => {
    const form = { fullName, email, phone, password, role, birthDate }
    const account: OnboardedAccount = { email: email.trim().toLowerCase(), fullName: fullName.trim(), role, phone: phone.trim() }
    let failure: unknown
    const accountSaved = (async () => {
      await setKvObjectField('users', account.email, {
        email: account.email,
        password: await hashPassword(password.trim()),
        fullName: account.fullName,
        role,
        isManager: role === 'manager' || role === 'creator',
        phone: account.phone,
        // Manager-oprettede konti springer godkendelses-flowet over.
        status: 'approved',
      })
      return true
    })().catch(error => { failure = error; return false })

    let birthday: { entry: BirthdayEntry & { id: string }; saved: Promise<boolean> } | undefined
    if (birthDate) {
      const [year, month, day] = birthDate.split('-')
      const entry = { id: account.email, email: account.email, fullName: account.fullName, birthday: `${month}-${day}`, birthYear: parseInt(year) }
      birthday = {
        entry,
        saved: accountSaved.then(saved => saved && upsertInKvArray('employee-birthdays', [entry]).then(() => true, error => {
          console.error('Onboarding: fødselsdagen blev ikke gemt:', error)
          toast.error(`${t.onboardingWizard.createFailedPrefix} ${error instanceof Error ? error.message : String(error)}`)
          return false
        })),
      }
    }

    onCreating(account, accountSaved, birthday)
    toast.success(`${account.fullName} ${t.onboardingWizard.createdSuffix}`)
    onOpenChange(false)

    void accountSaved.then(saved => {
      if (!saved) {
        console.error('Onboarding fejlede:', failure)
        toast.error(`${t.onboardingWizard.createFailedPrefix} ${failure instanceof Error ? failure.message : String(failure)}`)
        restoreForm.current = form
        onOpenChange(true)
        return
      }
      void appendToKvArray('emails', [{
        id: newId('email'),
        from: 'system@nexigroup.com',
        to: account.email,
        subject: 'Velkommen til Supply Chain Hub!',
        message: [
          `Hej ${account.fullName},`,
          '',
          'Din konto er blevet oprettet, og du kan nu logge ind på Supply Chain Hub.',
          '',
          'Her finder du bl.a. guides, vagtplan, feriekalender, madplan og meget mere.',
          '',
          'God fornøjelse!',
        ].join('\n'),
        timestamp: Date.now(),
        read: false,
      }]).catch(error => console.error('Onboarding: velkomstmailen blev ikke sendt:', error))
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={24} className="text-primary" weight="duotone" />
            {t.onboardingWizard.title}
          </DialogTitle>
          <DialogDescription>
            {t.onboardingWizard.description}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator current={step} labels={[t.onboardingWizard.steps.account, t.onboardingWizard.steps.birthday, t.onboardingWizard.steps.confirm]} />

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t.onboardingWizard.fullNameLabel}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t.onboardingWizard.fullNamePlaceholder} />
            </div>
            <div className="space-y-2">
              <Label>{t.onboardingWizard.workEmailLabel}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.onboardingWizard.workEmailPlaceholder} />
            </div>
            <div className="space-y-2">
              <Label>{t.onboardingWizard.phoneLabel}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+45 12 34 56 78" />
            </div>
            <div className="space-y-2">
              <Label>{t.onboardingWizard.tempPasswordLabel}</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.onboardingWizard.tempPasswordPlaceholder} />
            </div>
            <div className="space-y-2">
              <Label>{t.onboardingWizard.roleLabel}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2"><UserIcon size={16} />{t.teamOverview.userSingular}</div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center gap-2"><ShieldCheck size={16} />{t.teamOverview.roleManager}</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 border text-sm text-muted-foreground flex items-start gap-2">
              <Gift size={18} className="mt-0.5 shrink-0 text-accent" />
              {t.onboardingWizard.birthdayInfoText}
            </div>
            <div className="space-y-2">
              <Label>{t.onboardingWizard.birthdayDateLabel}</Label>
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-lg border divide-y">
              <div className="flex justify-between p-3 text-sm"><span className="text-muted-foreground">{t.onboardingWizard.summaryName}</span><span className="font-semibold">{fullName}</span></div>
              <div className="flex justify-between p-3 text-sm"><span className="text-muted-foreground">{t.onboardingWizard.summaryEmail}</span><span className="font-semibold">{email.trim().toLowerCase()}</span></div>
              <div className="flex justify-between p-3 text-sm"><span className="text-muted-foreground">{t.onboardingWizard.summaryPhone}</span><span className="font-semibold">{phone}</span></div>
              <div className="flex justify-between p-3 text-sm"><span className="text-muted-foreground">{t.onboardingWizard.summaryRole}</span><Badge variant="secondary">{role === 'manager' ? t.teamOverview.roleManager : t.teamOverview.userSingular}</Badge></div>
              <div className="flex justify-between p-3 text-sm">
                <span className="text-muted-foreground">{t.onboardingWizard.summaryBirthday}</span>
                <span className="font-semibold">{birthDate || t.onboardingWizard.notSpecified}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.onboardingWizard.confirmInfoText}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-2">
              <ArrowLeft size={16} />
              {t.common.back}
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={handleNext} className="gap-2">
              {step === 2 && !birthDate ? t.onboardingWizard.skip : t.onboardingWizard.next}
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={handleConfirm} className="gap-2">
              <Check size={16} weight="bold" />
              {t.onboardingWizard.createEmployee}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Offboarding: vælg medarbejder → forhåndsvis oprydning → bekræft
// ---------------------------------------------------------------------------

interface OffboardingWizardProps extends WizardProps {
  currentUserEmail: string
  /**
   * Called at once when the manager confirms, so the person, their birthday and pending requests leave the lists
   * straight away; `saved` resolves when the account and the clean-up are saved (false if not).
   */
  onRemoving: (email: string, saved: Promise<boolean>) => void
}

interface CleanupPreview {
  shiftAssignmentIds: string[]
  hasBirthday: boolean
  pendingVacations: number
  historicalEntries: number
}

export function OffboardingWizard({ open, onOpenChange, onRemoving, currentUserEmail }: OffboardingWizardProps) {
  const { t } = useLanguage()
  const [step, setStep] = useState(1)
  const [employees, setEmployees] = useState<Array<{ email: string; fullName: string }>>([])
  const [selectedEmail, setSelectedEmail] = useState('')
  const [preview, setPreview] = useState<CleanupPreview | null>(null)

  useEffect(() => {
    if (!open) return
    setStep(1)
    setSelectedEmail('')
    setPreview(null)
    const loadEmployees = async () => {
      const creatorEmail = await getCreatorEmail()
      const usersData = await window.kv.get<Record<string, { email: string; fullName: string }>>('users') || {}
      setEmployees(
        Object.values(usersData)
          .filter(u => u.email.toLowerCase() !== creatorEmail && u.email.toLowerCase() !== currentUserEmail.toLowerCase())
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'da'))
      )
    }
    loadEmployees()
  }, [open, currentUserEmail])

  const selectedEmployee = employees.find(e => e.email === selectedEmail)

  const buildPreview = async () => {
    if (!selectedEmployee) return
    // Parallelt: hver læsning er en rundtur til M:.
    const [assignments, vacations, birthdays] = await Promise.all([
      window.kv.get<ShiftAssignment[]>('shift-assignments').then(value => value || []),
      window.kv.get<VacationEntry[]>('vacation-entries').then(value => value || []),
      window.kv.get<BirthdayEntry[]>('employee-birthdays').then(value => value || []),
    ])

    const emailLower = selectedEmployee.email.toLowerCase()
    setPreview({
      // Historisk gemmes employeeId nogle steder som email og matches andre steder på navn — fang begge.
      shiftAssignmentIds: assignments
        .filter(a => a.employeeId?.toLowerCase() === emailLower || a.employeeName === selectedEmployee.fullName)
        .map(a => a.id),
      hasBirthday: birthdays.some(b => b.email.toLowerCase() === emailLower),
      pendingVacations: vacations.filter(v => v.userEmail.toLowerCase() === emailLower && v.status === 'pending').length,
      historicalEntries: vacations.filter(v => v.userEmail.toLowerCase() === emailLower && v.status !== 'pending').length,
    })
    setStep(2)
  }

  // The wizard closes and the person leaves the Manager Panel's lists at once; the account and the clean-up are saved in
  // the background (each write to M: takes 20-90 s).
  const handleConfirm = () => {
    if (!selectedEmployee || !preview) return
    const employee = selectedEmployee
    const plan = preview
    const emailLower = employee.email.toLowerCase()
    let failure: unknown
    const saved = (async () => {
      await Promise.all([
        deleteKvObjectField('users', employee.email),
        emailLower !== employee.email ? deleteKvObjectField('users', emailLower) : null,
      ])
      // When the account is gone: shifts, birthday and pending vacations are independent keys, removed at the same time.
      await Promise.all([
        plan.shiftAssignmentIds.length > 0 ? removeFromKvArray('shift-assignments', plan.shiftAssignmentIds) : null,
        plan.hasBirthday ? removeFromKvArray('employee-birthdays', [emailLower, employee.email]) : null,
        (async () => {
          // Afventende ferieanmodninger fjernes (giver ikke mening uden bruger);
          // godkendt/afvist historik bevares som dokumentation.
          const vacations = await window.kv.get<VacationEntry[]>('vacation-entries') || []
          const pendingIds = vacations
            .filter(v => v.userEmail.toLowerCase() === emailLower && v.status === 'pending')
            .map(v => v.id)
          if (pendingIds.length > 0) await removeFromKvArray('vacation-entries', pendingIds)
        })(),
      ])
      return true
    })().catch(error => { failure = error; return false })

    onRemoving(employee.email, saved)
    toast.success(`${employee.fullName} ${t.onboardingWizard.offboardedSuffix}`)
    onOpenChange(false)
    void saved.then(ok => {
      if (ok) return
      console.error('Offboarding fejlede:', failure)
      toast.error(`${t.onboardingWizard.offboardFailedPrefix} ${failure instanceof Error ? failure.message : String(failure)}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus size={24} className="text-destructive" weight="duotone" />
            {t.onboardingWizard.offboardTitle}
          </DialogTitle>
          <DialogDescription>
            {t.onboardingWizard.offboardDescription}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator current={step} labels={[t.onboardingWizard.offboardSteps.selectEmployee, t.onboardingWizard.offboardSteps.preview, t.onboardingWizard.offboardSteps.confirm]} />

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t.onboardingWizard.selectEmployeeToOffboardLabel}</Label>
              <Select value={selectedEmail} onValueChange={setSelectedEmail}>
                <SelectTrigger><SelectValue placeholder={t.onboardingWizard.selectEmployeePlaceholder} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.email} value={e.email}>{e.fullName} ({e.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 2 && preview && selectedEmployee && (
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-sm flex items-start gap-2">
              <Warning size={18} className="mt-0.5 shrink-0 text-destructive" weight="fill" />
              <span>{t.onboardingWizard.willCleanUpForPrefix} <strong>{selectedEmployee.fullName}</strong> {t.onboardingWizard.willCleanUpForSuffix}</span>
            </div>
            <div className="rounded-lg border divide-y text-sm">
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2"><Trash size={16} className="text-destructive" />{t.onboardingWizard.userAccountDeleted}</span>
                <Badge variant="destructive">{t.onboardingWizard.oneAccount}</Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2"><CalendarBlank size={16} className="text-destructive" />{t.onboardingWizard.shiftAssignmentsRemoved}</span>
                <Badge variant={preview.shiftAssignmentIds.length > 0 ? 'destructive' : 'secondary'}>
                  {preview.shiftAssignmentIds.length} {preview.shiftAssignmentIds.length === 1 ? t.onboardingWizard.shiftSingular : t.onboardingWizard.shiftPlural}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2"><Gift size={16} className="text-destructive" />{t.onboardingWizard.birthdayRemoved}</span>
                <Badge variant={preview.hasBirthday ? 'destructive' : 'secondary'}>{preview.hasBirthday ? t.onboardingWizard.yes : t.onboardingWizard.noneRegistered}</Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2"><Trash size={16} className="text-destructive" />{t.onboardingWizard.pendingVacationRequestsRemoved}</span>
                <Badge variant={preview.pendingVacations > 0 ? 'destructive' : 'secondary'}>{preview.pendingVacations}</Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2"><Check size={16} className="text-primary" />{t.onboardingWizard.vacationHistoryKept}</span>
                <Badge variant="secondary">{preview.historicalEntries} {t.onboardingWizard.entriesSuffix}</Badge>
              </div>
            </div>
          </div>
        )}

        {step === 3 && selectedEmployee && (
          <div className="p-4 rounded-md bg-destructive/10 border border-destructive/30 text-center space-y-2">
            <Warning size={32} className="text-destructive mx-auto" weight="fill" />
            <p className="font-semibold">{t.onboardingWizard.areYouSure}</p>
            <p className="text-sm text-muted-foreground">
              <strong>{selectedEmployee.fullName}</strong> {t.onboardingWizard.offboardConfirmSuffix}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-2">
              <ArrowLeft size={16} />
              {t.common.back}
            </Button>
          )}
          {step === 1 && (
            <Button onClick={buildPreview} disabled={!selectedEmail} className="gap-2">
              {t.onboardingWizard.next}
              <ArrowRight size={16} />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)} variant="destructive" className="gap-2">
              {t.onboardingWizard.continue}
              <ArrowRight size={16} />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleConfirm} variant="destructive" className="gap-2">
              <UserMinus size={16} weight="bold" />
              {t.onboardingWizard.offboardEmployee}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
