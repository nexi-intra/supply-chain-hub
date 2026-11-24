import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ImprovementActor, ImprovementCase, ImprovementStatus } from '@/lib/improvements'
import { ImprovementCaseDialog, getImprovementPermissions, improvementDate, improvementError, isImprovementDeadlineOverdue, isImprovementDeletionReasonValid, isRetryableImprovementError, type ImprovementActions } from './ImprovementCaseDialog'
import { getImprovementsLabels } from '@/lib/improvementsLabels'

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogHeader: ({ children }: { children: ReactNode }) => createElement('header', null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement('h2', null, children),
}))

const actor: ImprovementActor = {
  email: 'worker@example.test', fullName: 'Worker', teamCode: 'operations', role: 'user',
}
const entry: ImprovementCase = {
  id: 'case-1', revision: 2, title: 'Reduce handovers', problem: 'Repeated manual checks',
  proposal: '', category: 'process', originTeamCode: 'operations', affectedTeamCodes: [],
  createdBy: actor.email, createdByName: actor.fullName, createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z', priority: 'medium', status: 'new', nextAction: '',
  assignments: [], history: [], notifications: [],
}
function assigned(status: ImprovementStatus = 'new', kind: 'owner' | 'contributor' = 'owner'): ImprovementCase {
  return { ...entry, status, assignments: [{
    id: 'invite-1', email: ' WORKER@EXAMPLE.TEST ', name: 'Worker', teamCode: 'operations',
    kind, status: 'accepted', invitedBy: 'leader@example.test', invitedAt: entry.createdAt,
  }] }
}

function renderCase(caseEntry = entry, caseActor = actor, language = 'en', busy = false) {
  const actions: ImprovementActions = { busy, blocked: false, error: '', canRetry: false, retry: () => {}, command: () => {} }
  return renderToStaticMarkup(createElement(ImprovementCaseDialog, {
    entry: caseEntry, snapshot: { cases: [caseEntry], actor: caseActor, people: [], teams: [] },
    labels: getImprovementsLabels(language), language, actions, open: true, onOpenChange: () => {},
  }))
}

describe('improvement case presentation', () => {
  it('gives an unassigned leader a feedback deadline and an optional invitation response deadline', () => {
    const html = renderCase(entry, { ...actor, role: 'manager' })
    expect(html).toContain('id="improvement-feedback-due-date"')
    expect(html).toContain('id="improvement-invite-response-due-date"')
    expect(html).toContain('Feedback deadline')
    expect(html).toContain('Invitation response deadline')
    expect(html).not.toContain('id="improvement-next-action"')
  })
  it('keeps feedback deadline controls on ready-for-approval cases but not completed cases', () => {
    expect(renderCase({ ...entry, status: 'ready-for-approval' }, { ...actor, role: 'manager' }))
      .toContain('id="improvement-feedback-due-date"')
    expect(renderCase({ ...entry, status: 'completed' }, { ...actor, role: 'manager' }))
      .not.toContain('id="improvement-feedback-due-date"')
  })
  it('edits and clears stored invitation deadlines only while an invitation is pending', () => {
    const datedAssignment = { ...assigned().assignments[0], responseDueDate: '2026-10-05' }
    const pending = { ...entry, assignments: [{ ...datedAssignment, status: 'pending' as const }] }
    const html = renderCase(pending, { ...actor, role: 'manager' })
    expect(html).toContain('id="improvement-response-due-date-invite-1"')
    expect(html).toContain('value="2026-10-05"')
    expect(html).toContain('aria-label="Clear deadline: Invitation response deadline"')
    expect(renderCase({ ...entry, assignments: [datedAssignment] }, { ...actor, role: 'manager' }))
      .not.toContain('id="improvement-response-due-date-invite-1"')
    expect(renderCase({ ...entry, assignments: [{ ...datedAssignment, status: 'declined' }] }, { ...actor, role: 'manager' }))
      .not.toContain('id="improvement-response-due-date-invite-1"')
  })
  it('only displays invitation response actions for the authenticated recipient', () => {
    const pending = { ...entry, assignments: [{ ...assigned().assignments[0], status: 'pending' as const }] }
    expect(renderCase(pending)).toContain('Accept invitation')
    expect(renderCase(pending, { ...actor, email: 'other@example.test', role: 'manager' })).not.toContain('Accept invitation')
  })
  it('offers regular users a reason-required deletion request on completed cases, never direct deletion', () => {
    const html = renderCase({ ...entry, status: 'completed' })
    expect(html).toMatch(/id="improvement-deletion-request-reason"[^>]*required/)
    expect(html).toContain('data-testid="improvement-request-deletion"')
    expect(html).not.toContain('data-testid="improvement-delete"')
  })
  it('shows destructive leader controls but not the regular user request form', () => {
    const html = renderCase(entry, { ...actor, role: 'creator' })
    expect(html).toContain('data-testid="improvement-delete"')
    expect(html).toContain('aria-label="Delete improvement"')
    expect(html).not.toContain('id="improvement-deletion-request-reason"')
  })
  it('shows pending deletion requests and required leader rejection feedback', () => {
    const requested = { ...entry, deletionRequests: [{ id: 'request-1', requestedBy: actor.email,
      requestedByName: actor.fullName, requestedAt: entry.createdAt, message: 'Remove outdated case', status: 'pending' as const }] }
    const html = renderCase(requested, { ...actor, role: 'manager' })
    expect(html).toContain('Remove outdated case')
    expect(html).toMatch(/id="improvement-reject-reason-request-1"[^>]*required/)
    expect(html).toContain('data-testid="improvement-reject-deletion-request-1"')
    expect(html).toContain('data-testid="improvement-approve-deletion-request-1"')
    expect(renderCase(requested)).not.toContain('data-testid="improvement-request-deletion"')
  })
  it('renders independent overdue dates for readers without writable controls', () => {
    const dated = { ...entry, dueDate: '2000-01-01', feedbackDueDate: '2000-01-02', assignments: [{
      ...assigned().assignments[0], status: 'pending' as const, responseDueDate: '2000-01-03',
    }] }
    const html = renderCase(dated, { ...actor, email: '' })
    expect(html).toContain('Work deadline')
    expect(html).toContain('Feedback deadline')
    expect(html).toContain('Invitation response deadline')
    expect(html.match(/>Overdue</g)).toHaveLength(3)
    expect(html).not.toContain('improvement-request-deletion')
    expect(html).not.toContain('improvement-delete')
    expect(html).not.toContain('id="improvement-feedback-due-date"')
  })
  it('disables new write controls while busy', () => {
    const html = renderCase(entry, actor, 'en', true)
    expect(html).toMatch(/<fieldset disabled=""/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="improvement-request-deletion"/)
    expect(renderCase(entry, { ...actor, role: 'manager' }, 'en', true))
      .toMatch(/<button[^>]*disabled=""[^>]*data-testid="improvement-delete"/)
  })
  it.each(['en', 'fi'])('uses native date inputs for %s with no minimum date', language => {
    const html = renderCase(entry, { ...actor, role: 'manager' }, language)
    expect(html).toMatch(/<input[^>]*type="date"[^>]*id="improvement-feedback-due-date"/)
    expect(html).not.toContain(' min=')
  })
  it('uses the Danish date picker and the explicit owner completion CTA', () => {
    const html = renderCase(assigned('testing'), { ...actor, role: 'manager' }, 'da')
    expect(html).toContain('Meld færdig (til godkendelse)')
    expect(html).toContain('Opgavefrist')
    expect(html).toContain('Frist for tilbagemelding')
    expect(html).not.toContain('type="date"')
  })
})

describe('improvement UI permissions', () => {
  it('uses the server-compatible deletion reason boundary', () => {
    expect(isImprovementDeletionReasonValid(' ')).toBe(false)
    expect(isImprovementDeletionReasonValid('Duplicate')).toBe(true)
    expect(isImprovementDeletionReasonValid('x'.repeat(1000))).toBe(true)
    expect(isImprovementDeletionReasonValid('x'.repeat(1001))).toBe(false)
  })
  it('allows a new deletion request after rejection and does not confuse authorship with the creator role', () => {
    const rejected = { ...entry, deletionRequests: [{ id: 'request-1', requestedBy: actor.email,
      requestedByName: actor.fullName, requestedAt: entry.createdAt, message: 'Old case', status: 'rejected' as const }] }
    expect(getImprovementPermissions(rejected, actor)).toMatchObject({ canRequestDeletion: true, canDelete: false })
  })
  it('does not automatically respond or complete cases when optional deadlines have passed', () => {
    const pending = { ...entry, feedbackDueDate: '2000-01-01', assignments: [{ ...assigned().assignments[0], status: 'pending' as const, responseDueDate: '2000-01-01' }] }
    expect(getImprovementPermissions(pending, actor).pendingInvitations).toHaveLength(1)
    expect(getImprovementPermissions(pending, actor).canSubmit).toBe(false)
    expect(pending.assignments[0].status).toBe('pending')
    expect(pending.status).toBe('new')
  })
  it.each(['manager', 'creator'] as const)('allows an unassigned %s to delete and set independent deadlines', role => {
    expect(getImprovementPermissions(entry, { ...actor, role })).toMatchObject({
      canDelete: true, canRequestDeletion: false, canSetDeadlines: true, canProgress: false,
    })
  })
  it('allows regular users to request deletion on completed cases but not duplicate their pending request', () => {
    const completed = { ...entry, status: 'completed' as const }
    expect(getImprovementPermissions(completed, actor)).toMatchObject({
      canDelete: false, canRequestDeletion: true, canSetDeadlines: false,
    })
    const requested = { ...completed, deletionRequests: [{ id: 'request-1', requestedBy: ' WORKER@EXAMPLE.TEST ',
      requestedByName: 'Worker', requestedAt: entry.createdAt, message: 'Old case', status: 'pending' as const }] }
    expect(getImprovementPermissions(requested, actor)).toMatchObject({ canRequestDeletion: false })
    expect(getImprovementPermissions(requested, { ...actor, email: 'other@example.test' })).toMatchObject({ canRequestDeletion: true })
  })
  it.each(['ready-for-approval', 'completed', 'declined'] as const)('separates deadline and deletion permissions for %s', status => {
    expect(getImprovementPermissions({ ...entry, status }, { ...actor, role: 'manager' })).toMatchObject({
      canDelete: true, canSetDeadlines: status === 'ready-for-approval',
    })
  })
  it('blocks the new permissions for unauthenticated actors', () => {
    for (const blocked of [{ ...actor, email: '' }]) {
      expect(getImprovementPermissions(entry, blocked)).toMatchObject({ canDelete: false, canRequestDeletion: false, canSetDeadlines: false })
      expect(getImprovementPermissions(entry, { ...blocked, role: 'manager' })).toMatchObject({ canDelete: false, canRequestDeletion: false, canSetDeadlines: false })
    }
  })
  it('blocks every action and invitation on a tombstone', () => {
    const deleted = { ...assigned('in-progress'), deletedAt: entry.updatedAt }
    for (const role of ['user', 'manager', 'creator'] as const) {
      expect(getImprovementPermissions(deleted, { ...actor, role })).toMatchObject({
        canComment: false, canProgress: false, canInvite: false, canPrioritize: false,
        canSubmit: false, canReview: false, canDelete: false, canRequestDeletion: false, canSetDeadlines: false,
        pendingInvitations: [], leaderStatuses: [], progressStatuses: [],
      })
    }
  })

  it('does not infer assignment from authorship or leadership', () => {
    expect(getImprovementPermissions(entry, actor).progressStatuses).toEqual([])
    expect(getImprovementPermissions(entry, { ...actor, role: 'manager' }).progressStatuses).toEqual([])
  })
  it('does not infer acceptance from a pending invitation', () => {
    const pending = assigned()
    pending.assignments[0] = { ...pending.assignments[0], status: 'pending' }
    expect(getImprovementPermissions(pending, actor).canProgress).toBe(false)
    expect(getImprovementPermissions(pending, actor).pendingInvitations).toHaveLength(1)
    expect(getImprovementPermissions(pending, { ...actor, email: 'other@example.test' }).pendingInvitations).toEqual([])
  })
  it.each(['new', 'assessment', 'planned'] as const)('allows an accepted assignee to start from %s', status => {
    expect(getImprovementPermissions(assigned(status, 'contributor'), actor).progressStatuses).toEqual(['in-progress'])
  })
  it('allows testing and return to progress, but only the owner submits', () => {
    expect(getImprovementPermissions(assigned('in-progress'), actor).progressStatuses).toEqual(['testing'])
    expect(getImprovementPermissions(assigned('testing'), actor).progressStatuses).toEqual(['in-progress'])
    expect(getImprovementPermissions(assigned('testing'), actor).canSubmit).toBe(true)
    expect(getImprovementPermissions(assigned('testing', 'contributor'), actor).canSubmit).toBe(false)
  })
  it('only leaders resume on-hold cases', () => {
    expect(getImprovementPermissions(assigned('on-hold'), actor).canProgress).toBe(false)
    expect(getImprovementPermissions(entry, { ...actor, role: 'manager' }).leaderStatuses).toEqual(['assessment', 'planned', 'on-hold', 'declined'])
    expect(getImprovementPermissions({ ...entry, status: 'on-hold' }, { ...actor, role: 'creator' }).leaderStatuses).toEqual(['assessment', 'planned', 'declined'])
  })
  it('lets the accepted owner invite contributors to an active case, but only leaders invite an owner', () => {
    expect(getImprovementPermissions(assigned('in-progress'), actor)).toMatchObject({ canInvite: true, canInviteOwner: false })
    expect(getImprovementPermissions(assigned('in-progress', 'contributor'), actor).canInvite).toBe(false)
    expect(getImprovementPermissions(assigned('on-hold'), actor).canInvite).toBe(false)
    expect(getImprovementPermissions(entry, actor).canInvite).toBe(false)
    expect(getImprovementPermissions(entry, { ...actor, role: 'manager' })).toMatchObject({ canInvite: true, canInviteOwner: true })
    const markup = renderCase(assigned('in-progress'))
    expect(markup).toContain('improvement-invite-kind')
    expect(markup).not.toContain('value="owner"')
  })
  it.each(['ready-for-approval', 'completed', 'declined'] as const)('freezes edits for %s', status => {
    const permissions = getImprovementPermissions(assigned(status), { ...actor, role: 'manager' })
    expect(permissions.canProgress).toBe(false)
    expect(permissions.canInvite).toBe(false)
    expect(permissions.canPrioritize).toBe(false)
    expect(permissions.canReview).toBe(status === 'ready-for-approval')
    expect(permissions.canComment).toBe(true)
  })
})

describe('improvement deadline dates', () => {
  it('compares against the local calendar day, not UTC timestamps', () => {
    const today = new Date(2026, 9, 1, 0, 1)
    expect(isImprovementDeadlineOverdue('2026-09-30', today)).toBe(true)
    expect(isImprovementDeadlineOverdue('2026-10-01', today)).toBe(false)
    expect(isImprovementDeadlineOverdue('2026-10-02', today)).toBe(false)
  })
  it('does not flag absent or malformed deadlines', () => {
    for (const value of [undefined, '', 'not-a-date']) expect(isImprovementDeadlineOverdue(value)).toBe(false)
  })
  it.each(['da', 'en', 'fi', 'sv'])('formats date-only values consistently in %s without UTC shifts', language => {
    const locale = language === 'da' ? 'da-DK' : language === 'fi' ? 'fi-FI' : language === 'sv' ? 'sv-SE' : 'en-GB'
    expect(improvementDate('2026-10-01', language)).toBe(new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(2026, 9, 1, 12)))
  })
})

describe('improvement UI error handling', () => {
  const labels = getImprovementsLabels('en')
  it('localizes serialized IPC errors without displaying raw server text', () => {
    expect(improvementError(new Error('Error invoking remote method: IMPROVEMENTS_CONFLICT: changed'), labels)).toBe(labels.conflict)
    expect(improvementError({ code: 'AUTH_REQUIRED' }, labels)).toBe(labels.permissionDenied)
    expect(improvementError(new Error('IMPROVEMENTS_NOT_FOUND'), labels)).toBe(labels.caseUnavailable)
    expect(improvementError(new Error('EPERM: secret path'), labels)).toBe(labels.saveError)
  })
  it('retains retries for uncertain transport failures but not rejected commands', () => {
    expect(isRetryableImprovementError(new Error('IPC disconnected'))).toBe(true)
    for (const code of ['AUTH_REQUIRED', 'IMPROVEMENTS_CONFLICT', 'IMPROVEMENTS_INVALID', 'IMPROVEMENTS_NOT_FOUND']) {
      expect(isRetryableImprovementError({ code })).toBe(false)
    }
  })
})