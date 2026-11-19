import { useEffect, useState } from 'react'
import { ArrowCounterClockwise, Check, CheckCircle, CircleNotch, FloppyDisk, PaperPlaneTilt, Trash, UserPlus, X } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePickerField } from '@/components/DatePickerField'
import {
  IMPROVEMENT_PRIORITIES, improvementCategoryLabel,
  type ImprovementActor, type ImprovementAssignmentKind, type ImprovementCase,
  type ImprovementCommand, type ImprovementProgressStatus, type ImprovementSnapshot,
} from '@/lib/improvements'
import type { ImprovementsLabels } from '@/lib/improvementsLabels'

type CommandInput<Command> = Command extends { operationId: string } ? Omit<Command, 'operationId'> : never
export type ImprovementCommandInput = CommandInput<ImprovementCommand>

export interface ImprovementActions {
  busy: boolean
  blocked: boolean
  error: string
  canRetry: boolean
  retry: () => void
  command: (input: ImprovementCommandInput, onSuccess?: () => void) => void
}

export function isImprovementDeletionReasonValid(reason: string): boolean {
  return reason.trim().length > 0 && reason.trim().length <= 1000
}

function DeletionReason({ id, value, onChange, label, language, rows = 3, disabled = false }: {
  id: string; value: string; onChange: (value: string) => void; label: string; language: string; rows?: number; disabled?: boolean
}) {
  const tooLong = value.trim().length > 1000
  const limitMessage = language === 'da' ? 'Begrundelsen m\u00e5 h\u00f8jst v\u00e6re 1000 tegn.'
    : language === 'fi' ? 'Perustelun enimm\u00e4ispituus on 1000 merkki\u00e4.' : language === 'sv' ? 'Motiveringen får vara högst 1000 tecken.' : 'The reason must be no longer than 1000 characters.'
  return <div className="space-y-1">
    <Label htmlFor={id}>{label}</Label>
    <Textarea id={id} value={value} onChange={event => onChange(event.target.value)} rows={rows} maxLength={1000}
      required disabled={disabled} aria-invalid={tooLong || undefined} aria-describedby={`${id}-limit`} />
    <p id={`${id}-limit`} role={tooLong ? 'alert' : undefined} className={tooLong ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
      {tooLong ? limitMessage : `${value.length}/1000`}
    </p>
  </div>
}

export function getImprovementPermissions(entry: ImprovementCase, actor: ImprovementActor) {
  const email = actor.email.trim().toLowerCase()
  const writable = Boolean(email) && !entry.deletedAt
  const leader = writable && (actor.role === 'manager' || actor.role === 'creator')
  const accepted = entry.assignments.filter(assignment =>
    assignment.status === 'accepted' && assignment.email.trim().toLowerCase() === email,
  )
  const frozen = ['ready-for-approval', 'completed', 'declined'].includes(entry.status)
  const progressStatuses: ImprovementProgressStatus[] = []
  if (writable && accepted.length && !frozen) {
    if (['new', 'assessment', 'planned', 'testing'].includes(entry.status)) progressStatuses.push('in-progress')
    if (entry.status === 'in-progress') progressStatuses.push('testing')
  }
  const leaderStatuses: ImprovementProgressStatus[] = []
  if (leader && !frozen) {
    if (['new', 'planned', 'on-hold'].includes(entry.status)) leaderStatuses.push('assessment')
    if (['new', 'assessment', 'on-hold'].includes(entry.status)) leaderStatuses.push('planned')
    if (entry.status !== 'on-hold') leaderStatuses.push('on-hold')
    leaderStatuses.push('declined')
  }
  return {
    canDelete: leader,
    canRequestDeletion: writable && !leader && !(entry.deletionRequests || []).some(request =>
      request.status === 'pending' && request.requestedBy.trim().toLowerCase() === email,
    ),
    canSetDeadlines: leader && !['completed', 'declined'].includes(entry.status),
    canComment: writable,
    canProgress: writable && accepted.length > 0 && progressStatuses.length > 0,
    canInvite: (leader && !frozen) || (writable && accepted.some(assignment => assignment.kind === 'owner')
      && !['ready-for-approval', 'completed', 'on-hold', 'declined'].includes(entry.status)),
    canInviteOwner: leader && !frozen,
    canPrioritize: leader && !frozen,
    canReview: leader && entry.status === 'ready-for-approval',
    canSubmit: writable && accepted.some(assignment => assignment.kind === 'owner')
      && ['in-progress', 'testing'].includes(entry.status),
    progressStatuses,
    leaderStatuses,
    pendingInvitations: writable && !frozen ? entry.assignments.filter(assignment =>
      assignment.status === 'pending' && assignment.email.trim().toLowerCase() === email,
    ) : [],
  }
}

function improvementErrorCode(error: unknown): string {
  const text = error && typeof error === 'object'
    ? `${'code' in error ? String(error.code) : ''} ${'message' in error ? String(error.message) : ''}`
    : String(error)
  return text.match(/AUTH_[A-Z_]+|IMPROVEMENTS_[A-Z_]+/)?.[0] || ''
}

export function isRetryableImprovementError(error: unknown): boolean {
  return !improvementErrorCode(error)
}

export function improvementError(error: unknown, labels: ImprovementsLabels): string {
  const code = improvementErrorCode(error)
  if (code === 'IMPROVEMENTS_CONFLICT') return labels.conflict
  if (code.includes('NOT_FOUND')) return labels.caseUnavailable
  if (code.startsWith('AUTH_') || code.includes('FORBIDDEN') || code.includes('PERMISSION')) return labels.permissionDenied
  if (code.includes('OWNER')) return labels.ownerConflict
  if (code === 'IMPROVEMENTS_INVALID') return labels.requiredFields
  return labels.saveError
}

export function ImprovementActionError({ actions, labels }: { actions: ImprovementActions; labels: ImprovementsLabels }) {
  if (!actions.error) return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <p className="min-w-0 flex-1 break-words">{actions.error}</p>
      {actions.canRetry && <Button type="button" variant="outline" size="sm" loading={actions.busy} onClick={actions.retry}>
        <ArrowCounterClockwise size={16} />{actions.busy ? labels.saving : labels.retry}
      </Button>}
    </div>
  )
}

export function improvementDate(value: string, language: string, withTime = false): string {
  if (!value) return ''
  const date = new Date(withTime ? value : `${value.slice(0, 10)}T12:00:00`)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat(language === 'da' ? 'da-DK' : language === 'fi' ? 'fi-FI' : language === 'sv' ? 'sv-SE' : 'en-GB',
    withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date)
}

export function isImprovementDeadlineOverdue(value: string | undefined, today = new Date()): boolean {
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value < todayKey)
}

function ImprovementDeadline({ value, language, labels, active = true }: {
  value?: string; language: string; labels: ImprovementsLabels; active?: boolean
}) {
  return <span className="inline-flex max-w-full flex-wrap items-center gap-2">
    {value ? <time dateTime={value}>{improvementDate(value, language)}</time> : labels.noDeadline}
    {active && isImprovementDeadlineOverdue(value) && <span className="rounded-sm border border-destructive/40 px-1.5 text-xs text-destructive">{labels.overdue}</span>}
  </span>
}

function ImprovementDateField({ id, value, onChange, language, labels, label, disabled }: {
  id: string; value: string; onChange: (value: string) => void; language: string;
  labels: ImprovementsLabels; label: string; disabled: boolean
}) {
  return <div className="min-w-0 space-y-1"><Label htmlFor={id}>{label}</Label>
    {language === 'da'
      ? <DatePickerField id={id} value={value} onChange={onChange} placeholder={labels.noDeadline} disabled={disabled} />
      : <Input type="date" id={id} lang={language} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />}
    <div className="flex flex-wrap items-center gap-2">
      {value && <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`${labels.clearDeadline}: ${label}`}
        onClick={() => onChange('')}><X size={14} />{labels.clearDeadline}</Button>}
      {isImprovementDeadlineOverdue(value) && <span className="rounded-sm border border-destructive/40 px-1.5 text-xs text-destructive">{labels.overdue}</span>}
    </div>
  </div>
}

export interface ImprovementCaseDialogProps {
  entry: ImprovementCase
  snapshot: ImprovementSnapshot
  labels: ImprovementsLabels
  language: string
  actions: ImprovementActions
  open: boolean
  onOpenChange: (open: boolean) => void
}

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function ImprovementCaseDialog({ entry, snapshot, labels, language, actions, open, onOpenChange }: ImprovementCaseDialogProps) {
  const permissions = getImprovementPermissions(entry, snapshot.actor)
  const [comment, setComment] = useState('')
  const [nextAction, setNextAction] = useState(entry.nextAction)
  const [dueDate, setDueDate] = useState(entry.dueDate || '')
  const [progressStatus, setProgressStatus] = useState('')
  const [leaderStatus, setLeaderStatus] = useState('')
  const [priority, setPriority] = useState(entry.priority)
  const [feedback, setFeedback] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteKind, setInviteKind] = useState<ImprovementAssignmentKind>('contributor')
  const [peopleSearch, setPeopleSearch] = useState('')
  const [inviteResponseDueDate, setInviteResponseDueDate] = useState('')
  const [feedbackDueDate, setFeedbackDueDate] = useState(entry.feedbackDueDate || '')
  const [responseDueDates, setResponseDueDates] = useState<Record<string, string>>({})
  const [requestReason, setRequestReason] = useState('')
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletionReason, setDeletionReason] = useState('')
  // Which button started the running command, so only that one shows a spinner.
  const [pendingKey, setPendingKey] = useState('')
  const disabled = actions.busy || actions.blocked
  const run = (key: string, input: ImprovementCommandInput, onSuccess?: () => void) => {
    if (disabled) return
    setPendingKey(key)
    actions.command(input, onSuccess)
  }
  const loadingFor = (key: string) => actions.busy && pendingKey === key

  useEffect(() => {
    setNextAction(entry.nextAction)
    setDueDate(entry.dueDate || '')
    setPriority(entry.priority)
    setProgressStatus('')
    setLeaderStatus('')
    setFeedback('')
    setFeedbackDueDate(entry.feedbackDueDate || '')
    setResponseDueDates({})
  }, [entry.id, entry.revision, entry.nextAction, entry.dueDate, entry.priority, entry.feedbackDueDate])

  const teamName = (code: string) => snapshot.teams.find(team => team.folderName === code)?.name || code
  const personName = (email: string) => snapshot.people.find(person => person.email.toLowerCase() === email.toLowerCase())?.fullName || email
  const ownerBlocked = entry.assignments.some(assignment => assignment.kind === 'owner' && assignment.status !== 'declined')
  const people = snapshot.people.filter(person => {
    const search = peopleSearch.trim().toLowerCase()
    return person.invitable !== false
      && (!search || [person.fullName, person.email, teamName(person.teamCode)].some(value => value.toLowerCase().includes(search)))
      && !entry.assignments.some(assignment => assignment.email.trim().toLowerCase() === person.email.trim().toLowerCase()
        && assignment.status !== 'declined')
  })
  const selectedPersonAvailable = people.some(person => person.email === inviteEmail)
  const comments = entry.history.filter(event => event.type === 'comment')
  const hasProgressChanges = nextAction !== entry.nextAction || dueDate !== (entry.dueDate || '') || Boolean(progressStatus)
  const progressValid = !progressStatus || permissions.progressStatuses.includes(progressStatus as ImprovementProgressStatus)
  const leaderValid = !leaderStatus || permissions.leaderStatuses.includes(leaderStatus as ImprovementProgressStatus)
  const requiresReason = leaderStatus === 'on-hold' || leaderStatus === 'declined'
  const hasLeaderChanges = priority !== entry.priority || Boolean(leaderStatus)
  const deletionRequests = entry.deletionRequests || []
  const hasOwnPendingDeletion = deletionRequests.some(request => request.status === 'pending'
    && request.requestedBy.trim().toLowerCase() === snapshot.actor.email.trim().toLowerCase())
  const activeDeadline = !['completed', 'declined'].includes(entry.status)

  const updateProgress = () => {
    if (!permissions.canProgress || !hasProgressChanges || !progressValid) return
    run('progress', { type: 'update', caseId: entry.id, expectedRevision: entry.revision,
      nextAction: nextAction.trim(), dueDate,
      ...(progressStatus ? { status: progressStatus as ImprovementProgressStatus } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!actions.busy) onOpenChange(value) }}>
      <DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-5xl sm:p-6 [&>button:last-child]:hidden [&_button]:max-w-full [&_button]:whitespace-normal [&_button:not([aria-label])]:h-auto [&_button:not([aria-label])]:min-h-9">
        <DialogHeader className="min-w-0 pr-10 text-left">
          <DialogTitle className="break-words text-lg leading-snug">{entry.title}</DialogTitle>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{labels.status}: {labels.statuses[entry.status]}</span>
            <span>{labels.priority}: {labels.priorities[entry.priority]}</span>
            <span>{labels.category}: {improvementCategoryLabel(entry.category, labels.categories)}</span>
          </div>
        </DialogHeader>
        <Button type="button" variant="ghost" size="icon" title={labels.close} aria-label={labels.close}
          className="absolute right-3 top-3" disabled={actions.busy} onClick={() => onOpenChange(false)}><X size={20} /></Button>
        <ImprovementActionError actions={actions} labels={labels} />
        {actions.busy && <p role="status" className="text-sm text-muted-foreground">{labels.saving}</p>}
        {entry.status === 'ready-for-approval' && <p role="status" className="border-l-2 border-primary pl-3 text-sm">{labels.approvalRequired}</p>}
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-5">
            <section aria-label={labels.details} className="space-y-3">
              <h3 className="text-sm font-semibold">{labels.details}</h3>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-muted-foreground">{labels.problem}</dt><dd className="whitespace-pre-wrap break-words">{entry.problem}</dd></div>
                <div><dt className="text-muted-foreground">{labels.proposal}</dt><dd className="whitespace-pre-wrap break-words">{entry.proposal || '-'}</dd></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">{labels.author}</dt><dd className="break-words">{entry.createdByName || entry.createdBy}</dd></div>
                  <div><dt className="text-muted-foreground">{labels.originTeam}</dt><dd className="break-words">{teamName(entry.originTeamCode)}</dd></div>
                  <div><dt className="text-muted-foreground">{labels.createdAt}</dt><dd>{improvementDate(entry.createdAt, language, true)}</dd></div>
                  <div><dt className="text-muted-foreground">{labels.updatedAt}</dt><dd>{improvementDate(entry.updatedAt, language, true)}</dd></div>
                </div>
                <div><dt className="text-muted-foreground">{labels.affectedTeams}</dt><dd className="break-words">{entry.affectedTeamCodes.map(teamName).join(', ') || '-'}</dd></div>
              </dl>
            </section>
            <section aria-label={labels.progress} className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">{labels.progress}</h3>
              {permissions.canProgress ? <form onSubmit={event => { event.preventDefault(); updateProgress() }}>
                <fieldset disabled={disabled} className="space-y-3">
                  <div className="space-y-1"><Label htmlFor="improvement-next-action">{labels.nextAction}</Label>
                    <Textarea id="improvement-next-action" value={nextAction} onChange={event => setNextAction(event.target.value)} rows={3} maxLength={4000} /></div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1"><Label htmlFor="improvement-progress-status">{labels.status}</Label>
                      <select id="improvement-progress-status" className={selectClass} value={progressStatus} onChange={event => setProgressStatus(event.target.value)}>
                        <option value="">{labels.statuses[entry.status]}</option>
                        {permissions.progressStatuses.map(status => <option key={status} value={status}>{labels.statuses[status]}</option>)}
                      </select></div>
                    <ImprovementDateField id="improvement-due-date" value={dueDate} onChange={setDueDate}
                      language={language} labels={labels} label={labels.dueDate} disabled={disabled} />
                  </div>
                  <Button type="submit" disabled={disabled || !hasProgressChanges || !progressValid} loading={loadingFor('progress')}><FloppyDisk size={16} />{labels.updateProgress}</Button>
                </fieldset>
              </form> : <dl className="space-y-2 text-sm">
                <div><dt className="text-muted-foreground">{labels.nextAction}</dt><dd className="whitespace-pre-wrap break-words">{entry.nextAction || '-'}</dd></div>
                <div><dt className="text-muted-foreground">{labels.dueDate}</dt><dd><ImprovementDeadline value={entry.dueDate} language={language} labels={labels} active={activeDeadline} /></dd></div>
              </dl>}
              {permissions.canSubmit && <Button disabled={disabled || hasProgressChanges} variant="outline" loading={loadingFor('submit')}
                onClick={() => run('submit', { type: 'submit', caseId: entry.id, expectedRevision: entry.revision })}>
                <PaperPlaneTilt size={16} />{labels.submitForApproval}</Button>}
            </section>
            <section aria-label={labels.comments} className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">{labels.comments} ({comments.length})</h3>
              {comments.length ? <ol className="space-y-3">{comments.map(event => <li key={event.id} className="text-sm">
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span>{event.actorName || event.actorEmail}</span><time dateTime={event.at}>{improvementDate(event.at, language, true)}</time></p>
                <p className="whitespace-pre-wrap break-words">{event.message}</p>
              </li>)}</ol> : <p className="text-sm text-muted-foreground">{labels.noComments}</p>}
              {permissions.canComment && <form onSubmit={event => {
                event.preventDefault()
                if (comment.trim()) run('comment', { type: 'comment', caseId: entry.id, message: comment.trim() }, () => setComment(''))
              }}><fieldset disabled={disabled} className="space-y-2">
                <Label htmlFor="improvement-comment">{labels.comment}</Label>
                <Textarea id="improvement-comment" value={comment} onChange={event => setComment(event.target.value)} placeholder={labels.commentPlaceholder} rows={3} maxLength={8000} required />
                <Button type="submit" disabled={disabled || !comment.trim()} loading={loadingFor('comment')}><PaperPlaneTilt size={16} />{labels.addComment}</Button>
              </fieldset></form>}
            </section>
            <section aria-label={labels.history} className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">{labels.history}</h3>
              {entry.history.length ? <ol className="space-y-3">{[...entry.history].reverse().map(event => <li key={event.id} className="border-l-2 border-border pl-3 text-sm">
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span>{event.actorName || event.actorEmail}</span><time dateTime={event.at}>{improvementDate(event.at, language, true)}</time></p>
                <p className="whitespace-pre-wrap break-words">{event.message}</p>
              </li>)}</ol> : <p className="text-sm text-muted-foreground">{labels.noHistory}</p>}
            </section>
          </div>
          <div className="min-w-0 space-y-5 lg:border-l lg:pl-6">
            <section aria-label={labels.deadlines} className="space-y-3">
              <h3 className="text-sm font-semibold">{labels.deadlines}</h3>
              {permissions.canSetDeadlines ? <form onSubmit={event => {
                event.preventDefault()
                if (disabled || feedbackDueDate === (entry.feedbackDueDate || '')) return
                run('deadlines', { type: 'set-deadlines', caseId: entry.id, expectedRevision: entry.revision, feedbackDueDate })
              }}><fieldset disabled={disabled} className="space-y-2">
                <ImprovementDateField id="improvement-feedback-due-date" value={feedbackDueDate} onChange={setFeedbackDueDate}
                  language={language} labels={labels} label={labels.feedbackDueDate} disabled={disabled} />
                <Button type="submit" disabled={disabled || feedbackDueDate === (entry.feedbackDueDate || '')} loading={loadingFor('deadlines')}><FloppyDisk size={16} />{labels.saveDeadlines}</Button>
              </fieldset></form> : <dl className="text-sm"><dt className="text-muted-foreground">{labels.feedbackDueDate}</dt>
                <dd><ImprovementDeadline value={entry.feedbackDueDate} language={language} labels={labels} active={activeDeadline} /></dd></dl>}
            </section>
            <section aria-label={labels.assignments} className="space-y-3">
              <h3 className="text-sm font-semibold">{labels.assignments}</h3>
              {!entry.assignments.some(assignment => assignment.kind === 'owner' && assignment.status === 'accepted') && <p className="text-sm text-muted-foreground">{labels.unassigned}</p>}
              {!entry.assignments.some(assignment => assignment.kind === 'contributor' && assignment.status === 'accepted') && <p className="text-sm text-muted-foreground">{labels.noContributors}</p>}
              <ul className="divide-y">{entry.assignments.map(assignment => <li key={assignment.id} className="space-y-1 py-3 text-sm">
                <p className="break-words font-medium">{assignment.name || personName(assignment.email)}</p>
                <p className="break-words text-xs text-muted-foreground">{labels.assignmentKinds[assignment.kind]} / {teamName(assignment.teamCode)}</p>
                <p className={assignment.status === 'pending' ? 'text-sm text-primary' : 'text-sm text-muted-foreground'}>{labels.assignmentStatuses[assignment.status]}</p>
                <p className="break-words text-xs text-muted-foreground">{labels.invitedBy}: {personName(assignment.invitedBy)}</p>
                <p className="text-xs text-muted-foreground">{labels.invitedAt}: {improvementDate(assignment.invitedAt, language, true)}</p>
                {assignment.respondedAt && <p className="text-xs text-muted-foreground">{labels.respondedAt}: {improvementDate(assignment.respondedAt, language, true)}</p>}
                <dl className="text-xs"><dt className="text-muted-foreground">{labels.responseDueDate}</dt>
                  <dd><ImprovementDeadline value={assignment.responseDueDate} language={language} labels={labels} active={activeDeadline && assignment.status === 'pending'} /></dd></dl>
                {permissions.canSetDeadlines && assignment.status === 'pending' && <form className="space-y-2 pt-2" onSubmit={event => {
                  event.preventDefault()
                  const responseDueDate = responseDueDates[assignment.id] ?? assignment.responseDueDate ?? ''
                  if (disabled || responseDueDate === (assignment.responseDueDate || '')) return
                  run(`response-${assignment.id}`, { type: 'set-deadlines', caseId: entry.id, expectedRevision: entry.revision, assignmentId: assignment.id, responseDueDate })
                }}><fieldset disabled={disabled} className="space-y-2">
                  <ImprovementDateField id={`improvement-response-due-date-${assignment.id}`} value={responseDueDates[assignment.id] ?? assignment.responseDueDate ?? ''}
                    onChange={value => setResponseDueDates(current => ({ ...current, [assignment.id]: value }))}
                    language={language} labels={labels} label={labels.responseDueDate} disabled={disabled} />
                  <Button type="submit" size="sm" loading={loadingFor(`response-${assignment.id}`)} disabled={disabled || (responseDueDates[assignment.id] ?? assignment.responseDueDate ?? '') === (assignment.responseDueDate || '')}><FloppyDisk size={16} />{labels.saveDeadlines}</Button>
                </fieldset></form>}
                {permissions.pendingInvitations.some(pending => pending.id === assignment.id) && <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" disabled={disabled} loading={loadingFor(`accept-${assignment.id}`)} onClick={() => run(`accept-${assignment.id}`, { type: 'respond', caseId: entry.id, assignmentId: assignment.id, accept: true })}><Check size={16} />{labels.acceptInvitation}</Button>
                  <Button size="sm" variant="outline" disabled={disabled} loading={loadingFor(`decline-${assignment.id}`)} onClick={() => run(`decline-${assignment.id}`, { type: 'respond', caseId: entry.id, assignmentId: assignment.id, accept: false })}><X size={16} />{labels.declineInvitation}</Button>
                </div>}
              </li>)}</ul>
              {permissions.canInvite && <form onSubmit={event => {
                event.preventDefault()
                if (selectedPersonAvailable && !(inviteKind === 'owner' && ownerBlocked)) run('invite', { type: 'invite', caseId: entry.id, expectedRevision: entry.revision, email: inviteEmail, kind: inviteKind,
                  ...(inviteResponseDueDate ? { responseDueDate: inviteResponseDueDate } : {}),
                }, () => { setInviteEmail(''); setInviteResponseDueDate('') })
              }}><fieldset disabled={disabled} className="space-y-3 border-t pt-3">
                <div className="space-y-1"><Label htmlFor="improvement-invite-kind">{labels.inviteKind}</Label>
                  <select id="improvement-invite-kind" className={selectClass} value={inviteKind} onChange={event => { setInviteKind(event.target.value as ImprovementAssignmentKind); setInviteEmail('') }}>
                    <option value="contributor">{labels.assignmentKinds.contributor}</option>{permissions.canInviteOwner && <option value="owner" disabled={ownerBlocked}>{labels.assignmentKinds.owner}</option>}
                  </select></div>
                <div className="space-y-1"><Label htmlFor="improvement-people-search">{labels.search}</Label>
                  <Input id="improvement-people-search" value={peopleSearch} onChange={event => { setPeopleSearch(event.target.value); setInviteEmail('') }} /></div>
                <div className="space-y-1"><Label htmlFor="improvement-invite-person">{labels.invitePerson}</Label>
                  <select id="improvement-invite-person" className={selectClass} value={inviteEmail} required onChange={event => setInviteEmail(event.target.value)}>
                    <option value="">{labels.selectPerson}</option>
                    {people.map(person => <option key={person.email} value={person.email}>{person.fullName} / {teamName(person.teamCode)} / {person.email}</option>)}
                  </select></div>
                {!people.length && <p className="text-sm text-muted-foreground">{labels.noPeople}</p>}
                {ownerBlocked && permissions.canInviteOwner && <p className="text-xs text-muted-foreground">{labels.ownerConflict}</p>}
                <ImprovementDateField id="improvement-invite-response-due-date" value={inviteResponseDueDate} onChange={setInviteResponseDueDate}
                  language={language} labels={labels} label={labels.responseDueDate} disabled={disabled} />
                <Button type="submit" loading={loadingFor('invite')} disabled={disabled || !selectedPersonAvailable || (inviteKind === 'owner' && ownerBlocked)}><UserPlus size={16} />{labels.invite}</Button>
              </fieldset></form>}
            </section>
            {permissions.canPrioritize && <section aria-label={labels.priority} className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">{labels.priority} / {labels.status}</h3>
              <form onSubmit={event => {
                event.preventDefault()
                if (!hasLeaderChanges || !leaderValid || (requiresReason && !feedback.trim())) return
                run('leader', { type: 'update', caseId: entry.id, expectedRevision: entry.revision,
                  ...(priority !== entry.priority ? { priority } : {}),
                  ...(leaderStatus ? { status: leaderStatus as ImprovementProgressStatus } : {}),
                  ...(feedback.trim() ? { message: feedback.trim() } : {}),
                })
              }}><fieldset disabled={disabled} className="space-y-3">
                <div className="space-y-1"><Label htmlFor="improvement-priority">{labels.priority}</Label>
                  <select id="improvement-priority" className={selectClass} value={priority} onChange={event => setPriority(event.target.value as typeof priority)}>
                    {IMPROVEMENT_PRIORITIES.map(value => <option key={value} value={value}>{labels.priorities[value]}</option>)}
                  </select></div>
                <div className="space-y-1"><Label htmlFor="improvement-leader-status">{labels.status}</Label>
                  <select id="improvement-leader-status" className={selectClass} value={leaderStatus} onChange={event => setLeaderStatus(event.target.value)}>
                    <option value="">{labels.statuses[entry.status]}</option>
                    {permissions.leaderStatuses.map(value => <option key={value} value={value}>{labels.statuses[value]}</option>)}
                  </select></div>
                <div className="space-y-1"><Label htmlFor="improvement-leader-feedback">{labels.reviewFeedback}{requiresReason ? ' *' : ''}</Label>
                  <Textarea id="improvement-leader-feedback" value={feedback} onChange={event => setFeedback(event.target.value)} required={requiresReason} rows={3} maxLength={8000} /></div>
                <Button type="submit" loading={loadingFor('leader')} disabled={disabled || !hasLeaderChanges || !leaderValid || (requiresReason && !feedback.trim())}><FloppyDisk size={16} />{labels.save}</Button>
              </fieldset></form>
            </section>}
            {permissions.canReview && <section aria-label={labels.readyForApproval} className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">{labels.readyForApproval}</h3>
              <fieldset disabled={disabled} className="space-y-3">
                <Label htmlFor="improvement-review-feedback">{labels.reviewFeedback}</Label>
                <Textarea id="improvement-review-feedback" value={feedback} onChange={event => setFeedback(event.target.value)} rows={4} maxLength={8000} />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={disabled} loading={loadingFor('approve')} onClick={() => run('approve', { type: 'approve', caseId: entry.id, expectedRevision: entry.revision, ...(feedback.trim() ? { message: feedback.trim() } : {}) })}><CheckCircle size={16} />{labels.approve}</Button>
                  <Button variant="outline" disabled={disabled || !feedback.trim()} loading={loadingFor('return')} onClick={() => run('return', { type: 'return', caseId: entry.id, expectedRevision: entry.revision, message: feedback.trim() })}><ArrowCounterClockwise size={16} />{labels.returnForChanges}</Button>
                </div>
                {!feedback.trim() && <p className="text-xs text-muted-foreground">{labels.feedbackRequired}</p>}
              </fieldset>
            </section>}
            <section aria-label={labels.deletion} className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">{labels.deletion}</h3>
              {permissions.canRequestDeletion && <form onSubmit={event => {
                event.preventDefault()
                if (disabled || !isImprovementDeletionReasonValid(requestReason)) return
                run('request-deletion', { type: 'request-deletion', caseId: entry.id, message: requestReason.trim() }, () => setRequestReason(''))
              }}><fieldset disabled={disabled} className="space-y-2">
                <DeletionReason id="improvement-deletion-request-reason" value={requestReason} onChange={setRequestReason} label={labels.deletionReason} language={language} />
                <Button type="submit" variant="outline" disabled={disabled || !isImprovementDeletionReasonValid(requestReason)} loading={loadingFor('request-deletion')} data-testid="improvement-request-deletion" aria-label={labels.requestDeletion}>
                  <Trash size={16} />{labels.requestDeletion}</Button>
              </fieldset></form>}
              {hasOwnPendingDeletion && <p role="status" className="text-sm text-muted-foreground">{labels.deletionPending}</p>}
              {permissions.canDelete && <Button type="button" variant="destructive" disabled={disabled} data-testid="improvement-delete" aria-label={labels.deleteCase}
                onClick={() => { setDeletionReason(''); setDeleteOpen(true) }}><Trash size={16} />{labels.deleteCase}</Button>}
              <h4 className="text-sm font-medium">{labels.deletionRequests} ({deletionRequests.filter(request => request.status === 'pending').length})</h4>
              {deletionRequests.length ? <ul className="divide-y">{deletionRequests.map(request => <li key={request.id} className="space-y-2 py-3 text-sm">
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span className="break-words">{request.requestedByName || request.requestedBy}</span>
                  <time dateTime={request.requestedAt}>{improvementDate(request.requestedAt, language, true)}</time></p>
                <p className="whitespace-pre-wrap break-words">{request.message}</p>
                <p className={request.status === 'pending' ? 'text-primary' : 'text-muted-foreground'}>{labels.deletionStatuses[request.status]}</p>
                {request.reviewedBy && <p className="break-words text-xs text-muted-foreground">{personName(request.reviewedBy)}</p>}
                {request.reviewedAt && <time className="text-xs text-muted-foreground" dateTime={request.reviewedAt}>{improvementDate(request.reviewedAt, language, true)}</time>}
                {request.reviewMessage && <p className="whitespace-pre-wrap break-words">{request.reviewMessage}</p>}
                {permissions.canDelete && request.status === 'pending' && <form onSubmit={event => {
                  event.preventDefault()
                  const message = (rejectionReasons[request.id] || '').trim()
                  if (disabled || !isImprovementDeletionReasonValid(message)) return
                  run(`reject-${request.id}`, { type: 'reject-deletion', caseId: entry.id, expectedRevision: entry.revision, requestId: request.id, message },
                    () => setRejectionReasons(current => ({ ...current, [request.id]: '' })))
                }}><fieldset disabled={disabled} className="space-y-2">
                  <DeletionReason id={`improvement-reject-reason-${request.id}`} value={rejectionReasons[request.id] || ''}
                    onChange={value => setRejectionReasons(current => ({ ...current, [request.id]: value }))} rows={2} label={labels.rejectionReason} language={language} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="outline" size="sm" disabled={disabled || !isImprovementDeletionReasonValid(rejectionReasons[request.id] || '')} loading={loadingFor(`reject-${request.id}`)}
                      data-testid={`improvement-reject-deletion-${request.id}`} aria-label={labels.rejectDeletion}><X size={16} />{labels.rejectDeletion}</Button>
                    <Button type="button" variant="destructive" size="sm" disabled={disabled}
                      data-testid={`improvement-approve-deletion-${request.id}`} aria-label={labels.approveDeletion}
                      onClick={() => { setDeletionReason(request.message); setDeleteOpen(true) }}><Trash size={16} />{labels.approveDeletion}</Button>
                  </div>
                  {!(rejectionReasons[request.id] || '').trim() && <p className="text-xs text-muted-foreground">{labels.rejectionRequired}</p>}
                </fieldset></form>}
              </li>)}</ul> : <p className="text-sm text-muted-foreground">{labels.noDeletionRequests}</p>}
            </section>
          </div>
        </div>
        <AlertDialog open={deleteOpen && permissions.canDelete} onOpenChange={value => { if (!actions.busy) setDeleteOpen(value) }}>
          <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{labels.deleteConfirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{labels.deleteConfirmDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <p className="break-words text-sm font-medium">{entry.title}</p>
            <ImprovementActionError actions={actions} labels={labels} />
            <DeletionReason id="improvement-delete-reason" value={deletionReason} onChange={setDeletionReason} label={labels.deletionReason} language={language} disabled={disabled} />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actions.busy}>{labels.cancel}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 whitespace-normal" disabled={disabled || !isImprovementDeletionReasonValid(deletionReason)}
                data-testid="improvement-confirm-delete" aria-label={labels.confirmDelete} aria-busy={loadingFor('delete') || undefined} onClick={event => {
                  event.preventDefault()
                  if (!permissions.canDelete || disabled || !isImprovementDeletionReasonValid(deletionReason)) return
                  run('delete', { type: 'delete', caseId: entry.id, expectedRevision: entry.revision, message: deletionReason.trim() }, () => setDeleteOpen(false))
                }}>{loadingFor('delete') ? <CircleNotch size={16} className="motion-safe:animate-spin" /> : <Trash size={16} />}{labels.confirmDelete}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}