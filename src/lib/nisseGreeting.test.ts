import { describe, expect, it } from 'vitest'
import { shouldAnnounceFound, shouldGreet } from './nisseGreeting'
import type { NisseToday } from './nisse'

const hiding: NisseToday = { status: 'hiding', date: '2026-12-16', spot: 'meals' }
const found: NisseToday = { status: 'found', date: '2026-12-16', finder: { name: 'Lasse', email: 'lasse@x.dk', at: '2026-12-16T09:42:00.000Z' } }

describe('shouldGreet – the Christmas greeting at 10', () => {
  it('greets once on the front page from 10:00', () => {
    expect(shouldGreet({ state: hiding, view: 'hub', seasonOn: true, shownDate: null })).toBe(true)
    expect(shouldGreet({ state: found, view: 'hub', seasonOn: true, shownDate: '2026-12-15' })).toBe(true)
  })

  it('waits while someone plays, scans or works in a module', () => {
    for (const view of ['games', 'warehouse', 'calendar']) expect(shouldGreet({ state: hiding, view, seasonOn: true, shownDate: null }), view).toBe(false)
  })

  it('not before 10, not on days without a nisse, not twice the same day, not outside the season', () => {
    expect(shouldGreet({ state: { status: 'waiting', date: '2026-12-16', startsAt: 0 }, view: 'hub', seasonOn: true, shownDate: null })).toBe(false)
    expect(shouldGreet({ state: { status: 'off' }, view: 'hub', seasonOn: true, shownDate: null })).toBe(false)
    expect(shouldGreet({ state: hiding, view: 'hub', seasonOn: true, shownDate: '2026-12-16' })).toBe(false)
    expect(shouldGreet({ state: hiding, view: 'hub', seasonOn: false, shownDate: null })).toBe(false)
  })
})

describe('shouldAnnounceFound – everyone learns the nisse was found', () => {
  const base = { state: found, view: 'hub', active: true, announcedDate: null, userEmail: 'mia@x.dk' }

  it('tells players everywhere except in the games', () => {
    expect(shouldAnnounceFound(base)).toBe(true)
    expect(shouldAnnounceFound({ ...base, view: 'warehouse' })).toBe(true)
    expect(shouldAnnounceFound({ ...base, view: 'games' })).toBe(false)
  })

  it('not for those who do not play, not twice a day, not to the winner, not while it still hides', () => {
    expect(shouldAnnounceFound({ ...base, active: false })).toBe(false)
    expect(shouldAnnounceFound({ ...base, announcedDate: '2026-12-16' })).toBe(false)
    expect(shouldAnnounceFound({ ...base, userEmail: 'LASSE@x.dk' })).toBe(false)
    expect(shouldAnnounceFound({ ...base, state: hiding })).toBe(false)
  })
})
