import { describe, expect, it } from 'vitest'
import type { CountLine, CountState, MaterialLock, ResultRow } from '@/types/warehouse'
import { answerRequest, askToCount, createOverlays, releaseLock, takeLock, withApprovals, withClaim, withLine, withMember, withoutLine } from './optimisticState'

const ANNA = { email: 'anna@x', name: 'Anna' }
const BO = { email: 'bo@x', name: 'Bo' }

const row = (material: string, sapQty: number, counted: number, unitPrice: number | null = 2): ResultRow => ({
  material, description: '', kind: 'accessory', sloc: 'D000', stockType: 'unrestricted', serialManaged: false, unitPrice, sapQty, sapSerials: 0,
  countedSerials: 0, countedLines: counted, counted, diff: counted - sapQty, valueDiff: unitPrice === null ? null : (counted - sapQty) * unitPrice, misplaced: false, suggestions: [], sapMismatch: false,
})
const line = (lineId: string, qty: number, extra: Partial<CountLine> = {}): CountLine => ({ lineId, place: 'A1', area: 'A', material: 'R1', sloc: 'D000', stockType: 'unrestricted', qty, status: 'counted', comment: '', by: ANNA.email, byName: ANNA.name, at: 1, ...extra })
const lock = (holder: typeof ANNA, extra: Partial<MaterialLock> = {}): MaterialLock => ({ material: 'R1', holder, at: 1, helpers: [], requests: [], ...extra })

function state(changes: Partial<CountState> = {}): CountState {
  return {
    meta: { status: 'open' }, statusLocked: false, me: { email: ANNA.email, isOwner: false, isManager: true, canFetchSap: false, status: 'approved', canWrite: true, byRole: true, canDecideMembers: true },
    rows: [row('R1', 10, 4)], lines: [line('l1', 4)], members: [], claims: [], materialLocks: [], approvals: {},
    ...changes,
  } as unknown as CountState
}

describe('overlays over the state read from the drive', () => {
  it('shows a change on every read until a read started after the write was done', () => {
    const overlays = createOverlays()
    const overlay = overlays.add(withApprovals({ R1: { status: 'approved' } }))
    const stale = state()
    expect(overlays.apply(stale).approvals.R1.status).toBe('approved')
    overlays.received(100)
    expect(overlays.size()).toBe(1)
    overlays.settle(overlay, 200)
    overlays.received(150)
    expect(overlays.apply(stale).approvals.R1.status).toBe('approved')
    overlays.received(200)
    expect(overlays.size()).toBe(1)
    overlays.received(201)
    expect(overlays.size()).toBe(0)
  })

  it('a failed write is taken back: the state read from the drive shows again, other changes stay', () => {
    const overlays = createOverlays()
    const failed = overlays.add(withApprovals({ R1: { status: 'approved' } }))
    overlays.add(withApprovals({ R2: { status: 'returned' } }))
    overlays.remove(failed)
    const shown = overlays.apply(state())
    expect(shown.approvals.R1).toBeUndefined()
    expect(shown.approvals.R2.status).toBe('returned')
  })
})

describe('changes of a count', () => {
  it('a member decision changes the member and, for oneself, my status', () => {
    const shown = withMember({ email: ANNA.email, name: 'Anna', role: 'participant', status: 'requested' })(state({ me: { ...state().me, status: null } }))
    expect(shown.members).toHaveLength(1)
    expect(shown.me.status).toBe('requested')
  })

  it('claims an area and releases it in place', () => {
    const claim = { area: 'A', email: ANNA.email, name: 'Anna', at: 1, lastActivity: 1 }
    const claimed = withClaim('A', claim)(state({ claims: [{ ...claim, area: 'B' }] }))
    expect(claimed.claims.map(item => item.area)).toEqual(['B', 'A'])
    expect(withClaim('B', null)(claimed).claims.map(item => item.area)).toEqual(['A'])
  })

  it('material locks: take a free one, ask, answer and release like the drive does', () => {
    const taken = takeLock('R1', ANNA)(state())
    expect(taken.materialLocks[0].holder).toEqual(ANNA)
    expect(takeLock('R1', BO)(taken).materialLocks[0].holder).toEqual(ANNA)
    const asked = askToCount('R1', BO)(taken)
    expect(asked.materialLocks[0].requests.map(item => item.email)).toEqual([BO.email])
    expect(askToCount('R1', BO)(asked)).toBe(asked)
    const allowed = answerRequest('R1', BO.email, true)(asked)
    expect([allowed.materialLocks[0].requests.length, allowed.materialLocks[0].helpers.map(item => item.email)]).toEqual([0, [BO.email]])
    expect(answerRequest('R1', BO.email, false)(asked).materialLocks[0].helpers).toEqual([])
    expect(releaseLock('R1', BO.email)(allowed).materialLocks[0].helpers).toEqual([])
    expect(releaseLock('R1', ANNA.email)(allowed).materialLocks).toEqual([])
    expect(releaseLock('R1', 'owner@x')(state({ materialLocks: [lock(BO)] })).materialLocks).toEqual([])
  })

  it('an idle material lock is taken over, except by its own holder and helpers', () => {
    const idle = state({ materialLocks: [lock(BO, { idleSince: 5, helpers: [{ email: 'cara@x', name: 'Cara', at: 2 }] })] })
    const taken = takeLock('R1', ANNA)(idle).materialLocks[0]
    expect([taken.holder, taken.idleSince ?? null, taken.helpers]).toEqual([ANNA, null, []])
    expect(takeLock('R1', BO)(idle)).toBe(idle)
    expect(takeLock('R1', { email: 'cara@x', name: 'Cara' })(idle)).toBe(idle)
  })

  it('a saved line changes the list and the counted quantity of its row once, also when shown again', () => {
    const changed = withLine(line('l1', 7))(state())
    expect([changed.lines[0].qty, changed.rows[0].counted, changed.rows[0].countedLines, changed.rows[0].diff, changed.rows[0].valueDiff]).toEqual([7, 7, 7, -3, -6])
    expect(withLine(line('l1', 7))(changed).rows[0].counted).toBe(7)
    const added = withLine(line('l2', 3, { sloc: '' }))(changed)
    expect([added.lines.length, added.lines[0].sloc, added.rows[0].counted]).toEqual([2, 'D000', 10])
    const removed = withoutLine('l1')(added)
    expect([removed.lines.map(item => item.lineId), removed.rows[0].counted]).toEqual([['l2'], 3])
    expect(withoutLine('l1')(removed)).toBe(removed)
  })

  it('a line for a material SAP does not list only changes the list of lines', () => {
    const shown = withLine(line('l9', 2, { material: 'X9' }))(state())
    expect([shown.lines.length, shown.rows]).toEqual([2, state().rows])
  })
})
