import { describe, expect, it } from 'vitest'
import { predictLinksCommand, type LibraryLink, type LinksSnapshot } from './links'

const link = (id: string, fields: Partial<LibraryLink> = {}): LibraryLink => ({
  id, url: `https://${id}.test`, domain: `${id}.test`, title: id, description: 'd', category: '', ownerTeamCode: 'SC',
  sharedWithTeamCodes: [], status: 'approved', hidden: false, createdByName: 'Bo', createdAt: '', updatedAt: '',
  mine: false, canManage: true, warnings: [], myReport: null, mySuggestionPending: false, ...fields,
})

const snapshot = (): LinksSnapshot => ({
  actor: { teamCode: 'SC', fullName: 'Me', isManager: true },
  teams: [],
  links: [link('a'), link('p', { status: 'pending' }), link('r', { openReports: 1, openSuggestions: 1 })],
  review: {
    pending: [link('p', { status: 'pending' })],
    suggestions: [{ id: 's1', linkId: 'r', linkTitle: 'r', current: { url: 'https://r.test', title: 'r', description: 'd', category: '' }, title: 'Better', note: '', byName: 'Bo', at: '', warnings: [] }],
    reports: [{ id: 'x1', linkId: 'r', linkTitle: 'r', url: 'https://r.test', reason: 'dead', note: '', byName: 'Bo', at: '' }],
  },
})

describe('what the link library shows before the save is on the shared drive', () => {
  it('approving moves the link out of the review list and shows it as approved', () => {
    const next = predictLinksCommand(snapshot(), { type: 'approve', linkId: 'p' })
    expect(next.review.pending).toEqual([])
    expect(next.links.find(entry => entry.id === 'p')?.status).toBe('approved')
  })

  it('rejecting keeps the reason on the link', () => {
    const next = predictLinksCommand(snapshot(), { type: 'reject', linkId: 'p', note: 'Duplicate' })
    expect(next.review.pending).toEqual([])
    expect(next.links.find(entry => entry.id === 'p')).toMatchObject({ status: 'rejected', reviewNote: 'Duplicate' })
  })

  it('deleting removes the link and everything waiting for it', () => {
    const next = predictLinksCommand(snapshot(), { type: 'delete', linkId: 'r' })
    expect(next.links.map(entry => entry.id)).toEqual(['a', 'p'])
    expect(next.review.suggestions).toEqual([])
    expect(next.review.reports).toEqual([])
  })

  it('an accepted suggestion changes the link; a dismissed report only leaves the list', () => {
    const accepted = predictLinksCommand(snapshot(), { type: 'resolve-suggestion', linkId: 'r', suggestionId: 's1', accept: true })
    expect(accepted.links.find(entry => entry.id === 'r')).toMatchObject({ title: 'Better', openSuggestions: 0 })
    expect(accepted.review.suggestions).toEqual([])
    const dismissed = predictLinksCommand(snapshot(), { type: 'resolve-report', linkId: 'r', reportId: 'x1', action: 'dismiss' })
    expect(dismissed.links.find(entry => entry.id === 'r')).toMatchObject({ title: 'r', openReports: 0 })
    expect(dismissed.review.reports).toEqual([])
  })

  it('a suggestion or report from the user is marked on the link', () => {
    expect(predictLinksCommand(snapshot(), { type: 'suggest', linkId: 'a', title: 'New' }).links[0].mySuggestionPending).toBe(true)
    expect(predictLinksCommand(snapshot(), { type: 'report', linkId: 'a', reason: 'dead' }).links[0].myReport).toBe('dead')
  })
})
