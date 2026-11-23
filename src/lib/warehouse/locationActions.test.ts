import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocationList, MapContents, MaterialCard, RackCard, StockLineView } from '@/types/warehouse'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { pendingWriteCount } from '@/lib/pendingWrites'
import {
  addToStock, countedInCard, isPlaceHidden, locationActionsInFlight, matdocOf, movedInList, moveTargetCheck, palletEdit, predictedRack, sendLocationAction, startLocationsRead,
  takeFromCard, takeFromCardShelf, withPutAway, withStockQuantity,
} from './locationActions'
import { errorCode } from './errors'
import { setWarehouseLanguage } from './text'

type Listed = LocationList['locations'][number]

afterEach(() => { vi.clearAllMocks(); setWarehouseLanguage('da') })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

const listed = (id: string, extra: Partial<Listed> = {}): Listed => ({
  id, name: id, area: 'A', type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '', updatedAt: 0, updatedBy: { email: '', name: '' }, used: 0, stockCount: 0, ...extra,
})

describe('sendLocationAction', () => {
  it('shows the result at once, writes in the background and reads again when M: has answered', async () => {
    const write = deferred<{ pallet: null }>()
    const confirmed = vi.fn()
    const settled = vi.fn()
    const done = sendLocationAction(() => write.promise, { success: 'Pallen står nu på A1.1', confirmed, settled })
    expect(toast.success).toHaveBeenCalledWith('Pallen står nu på A1.1')
    expect([locationActionsInFlight(), pendingWriteCount()]).toEqual([1, 1])
    expect(settled).not.toHaveBeenCalled()
    write.resolve({ pallet: null })
    await expect(done).resolves.toBe(true)
    expect(confirmed).toHaveBeenCalledWith({ pallet: null })
    expect(settled).toHaveBeenCalledTimes(1)
    expect([locationActionsInFlight(), pendingWriteCount()]).toEqual([0, 0])
  })

  it('rolls back and says why when M: refuses the action', async () => {
    const rollback = vi.fn()
    const settled = vi.fn()
    const refused = Object.assign(new Error('LOCATION_FULL: A1.1 er fuld'), { code: 'LOCATION_FULL' })
    await expect(sendLocationAction(() => Promise.reject(refused), { success: 'ok', rollback, failure: () => 'A1.1 er fuld – vælg en anden plads', settled })).resolves.toBe(false)
    expect(rollback).toHaveBeenCalledWith(refused)
    expect(toast.error).toHaveBeenCalledWith('A1.1 er fuld – vælg en anden plads')
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('a refusal can offer to send again: the screen is rolled back and the error toast gets the button', async () => {
    const rollback = vi.fn()
    const again = vi.fn()
    const offer = (error: unknown) => (errorCode(error) === 'STOCK_CHANGED' ? { label: 'Gem alligevel', onClick: again } : null)
    const refused = new Error('STOCK_CHANGED: Antallet er ændret til 30 af Ole kl. 10:12. Tæl igen, eller gem alligevel.')
    await expect(sendLocationAction(() => Promise.reject(refused), { rollback, offer, settled: () => {} })).resolves.toBe(false)
    expect(rollback).toHaveBeenCalledWith(refused)
    expect(toast.error).toHaveBeenCalledWith('Antallet er ændret til 30 af Ole kl. 10:12. Tæl igen, eller gem alligevel.', expect.objectContaining({ action: { label: 'Gem alligevel', onClick: again } }))
    expect(again).not.toHaveBeenCalled()
    toast.error.mockClear()
    await sendLocationAction(() => Promise.reject(new Error('STOCK_TOO_LOW: Der er kun 5')), { rollback, offer, settled: () => {} })
    expect(toast.error).toHaveBeenCalledWith('Der er kun 5')
  })

  it('hands every action to the Hub at once, without waiting for the one before (the Hub keeps the order and the outbox)', async () => {
    const first = deferred<object>()
    const second = deferred<object>()
    const sent: string[] = []
    const one = sendLocationAction(() => { sent.push('first'); return first.promise }, { settled: () => {} })
    const two = sendLocationAction(() => { sent.push('second'); return second.promise }, { settled: () => {} })
    expect(sent).toEqual(['first', 'second'])
    expect([locationActionsInFlight(), pendingWriteCount()]).toEqual([2, 2])
    second.resolve({})
    first.resolve({})
    await expect(Promise.all([one, two])).resolves.toEqual([true, true])
    expect([locationActionsInFlight(), pendingWriteCount()]).toEqual([0, 0])
  })

  it('with several actions on their way, a refusal rolls back only its own change and the screen reads again when all are done', async () => {
    const first = deferred<object>()
    const second = deferred<object>()
    const rollbacks = [vi.fn(), vi.fn()]
    const confirmed = [vi.fn(), vi.fn()]
    const settled = vi.fn()
    const one = sendLocationAction(() => first.promise, { rollback: rollbacks[0], confirmed: confirmed[0], settled })
    const two = sendLocationAction(() => second.promise, { rollback: rollbacks[1], confirmed: confirmed[1], settled })
    const during = startLocationsRead()
    first.reject(Object.assign(new Error('PALLET_GONE'), { code: 'PALLET_GONE' }))
    await expect(one).resolves.toBe(false)
    expect(rollbacks[0]).toHaveBeenCalledTimes(1)
    expect(rollbacks[1]).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
    const afterFirst = startLocationsRead()
    second.resolve({ pallet: null })
    await expect(two).resolves.toBe(true)
    expect(confirmed[1]).toHaveBeenCalledWith({ pallet: null })
    expect(confirmed[0]).not.toHaveBeenCalled()
    expect(settled).toHaveBeenCalledTimes(2)
    expect([during(), afterFirst()]).toEqual([false, false])
    expect(startLocationsRead()()).toBe(true)
  })

  it('an action kept on this PC (M: down) says so and is not confirmed', async () => {
    const confirmed = vi.fn()
    await sendLocationAction(() => Promise.resolve({ queued: true as const }), { confirmed, settled: () => {} })
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(confirmed).not.toHaveBeenCalled()
  })

  it('a write that throws at once is a refusal, not an uncaught error', async () => {
    const rollback = vi.fn()
    await expect(sendLocationAction(() => { throw new Error('boom') }, { rollback, settled: () => {} })).resolves.toBe(false)
    expect(rollback).toHaveBeenCalled()
  })

  it('hides deleted places and shows a created rack only while the action is on its way', async () => {
    const write = deferred<object>()
    const rack: RackCard = { rack: 'E9', area: 'E', purpose: 'reserve', shelves: [], history: [] }
    const done = sendLocationAction(() => write.promise, { hides: ['E9 H1'], rack, settled: () => {} })
    expect([isPlaceHidden('E9 H1'), isPlaceHidden('E9 H2'), predictedRack('E9')]).toEqual([true, false, rack])
    write.resolve({})
    await done
    expect([isPlaceHidden('E9 H1'), predictedRack('E9')]).toEqual([false, null])
  })
})

describe('startLocationsRead', () => {
  it('a read that overlaps one of this PC\'s actions may not replace the screen; a read after it may', async () => {
    const quiet = startLocationsRead()
    expect(quiet()).toBe(true)

    const startedBefore = startLocationsRead()
    const write = deferred<object>()
    const done = sendLocationAction(() => write.promise, { settled: () => {} })
    expect(startedBefore()).toBe(false)
    const startedDuring = startLocationsRead()
    write.resolve({})
    await done
    expect(startedDuring()).toBe(false)
    expect(startLocationsRead()()).toBe(true)
  })
})

describe('optimistic changes', () => {
  const card: MaterialCard = {
    material: 'R162-0717', description: '', stations: [], pickPlaces: [], refillShelf: null, history: [], total: 160,
    reserve: [
      { id: 'p1', location: 'A1.1', material: 'R162-0717', quantity: 100, receivedAt: 1, document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: 1, createdBy: { email: '', name: '' }, ageDays: 3 },
      { id: 'p2', location: 'A1.2', material: 'R162-0717', quantity: null, receivedAt: 2, document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: 2, createdBy: { email: '', name: '' }, ageDays: 2 },
    ],
    shelves: [{ location: 'E9 H1', name: 'E9 H1', quantity: 60 }],
  }

  it('takeFromCard takes part of a pallet, or all of it (also with a quantity at least what is there)', () => {
    expect(takeFromCard(card, 'p1', 30)).toMatchObject({ total: 130, reserve: [{ id: 'p1', quantity: 70 }, { id: 'p2' }] })
    expect(takeFromCard(card, 'p1')).toMatchObject({ total: 60, reserve: [{ id: 'p2' }] })
    expect(takeFromCard(card, 'p1', 100).reserve.map(item => item.id)).toEqual(['p2'])
    expect(takeFromCard(card, 'p2').reserve.map(item => item.id), 'a pallet without a quantity is taken whole on "take all"').toEqual(['p1'])
    expect(takeFromCard(card, 'gone')).toBe(card)
  })

  it('takeFromCard keeps a pallet with an unknown quantity when some pieces are taken (mirrors takeFrom)', () => {
    expect(takeFromCard(card, 'p2', 5)).toMatchObject({ total: 160, reserve: [{ id: 'p1', quantity: 100 }, { id: 'p2', quantity: null }] })
  })

  it('countedInCard gives a pallet with an unknown quantity its count and adds it to the total', () => {
    expect(countedInCard(card, 'p2', 40)).toMatchObject({ total: 200, reserve: [{ id: 'p1', quantity: 100 }, { id: 'p2', quantity: 40 }] })
    expect(countedInCard(card, 'gone', 40)).toBe(card)
  })

  it('palletEdit sends only the changed fields, each with the value the dialog showed (expected)', () => {
    const [shown] = card.reserve
    expect(palletEdit(shown, { material: 'R162-0717', quantity: 100, receivedAt: 1, document: null, serials: [], tags: [], note: 'Hjørne skadet' }))
      .toEqual({ changes: { note: 'Hjørne skadet' }, expected: { note: '' } })
    expect(palletEdit(shown, { quantity: 90, tags: ['Brandskab'], document: null })).toEqual({ changes: { quantity: 90, tags: ['Brandskab'] }, expected: { quantity: 100, tags: [] } })
    expect(palletEdit(card.reserve[1], { quantity: 40 })).toEqual({ changes: { quantity: 40 }, expected: { quantity: null } })
    expect(palletEdit(shown, { quantity: 100 })).toEqual({ changes: {}, expected: {} })
  })

  it('takeFromCardShelf lowers the line and drops it at 0', () => {
    expect(takeFromCardShelf(card, 'E9 H1', 20)).toMatchObject({ total: 140, shelves: [{ location: 'E9 H1', quantity: 40 }] })
    expect(takeFromCardShelf(card, 'E9 H1')).toMatchObject({ total: 100, shelves: [] })
  })

  it('withStockQuantity and addToStock change, add and remove a shelf line', () => {
    const lines: StockLineView[] = [{ id: 'E9 H1|M1', location: 'E9 H1', material: 'M1', description: 'Kabel', quantity: 5, note: '', updatedAt: 0, updatedBy: { email: '', name: '' } }]
    expect(withStockQuantity(lines, lines[0], 8)[0].quantity).toBe(8)
    expect(withStockQuantity(lines, lines[0], 0)).toEqual([])
    expect(addToStock(lines, lines[0], -2)[0].quantity).toBe(3)
    expect(addToStock(lines, { location: 'E9 H1', material: 'M2', description: '' }, 4).map(line => [line.id, line.quantity])).toEqual([['E9 H1|M1', 5], ['E9 H1|M2', 4]])
  })

  it('moveTargetCheck says what the backend would refuse, and warns about a pick place', () => {
    const full = listed('A1.1', { used: 1 })
    expect(moveTargetCheck('', null, 'A1.2')).toEqual({ note: null, blocked: true })
    expect(moveTargetCheck('z9', null, 'A1.2')).toEqual({ note: 'Z9 findes ikke', blocked: true })
    expect(moveTargetCheck('A1.2', listed('A1.2'), 'A1.2').blocked).toBe(true)
    expect(moveTargetCheck('A1.1', full, 'A1.2')).toEqual({ note: 'A1.1 er fuld – vælg en anden plads', blocked: true })
    expect(moveTargetCheck('A1.3', listed('A1.3', { active: false }), 'A1.2').blocked).toBe(true)
    expect(moveTargetCheck('S1', listed('S1', { purpose: 'station' }), 'A1.2').blocked).toBe(true)
    expect(moveTargetCheck('E9 H1', listed('E9 H1', { type: 'Hylde' }), 'A1.2').blocked).toBe(true)
    expect(moveTargetCheck('H26', listed('H26', { purpose: 'pick', used: 3 }), 'A1.2')).toMatchObject({ blocked: false })
    expect(moveTargetCheck('G1', listed('G1', { type: 'Gulv', used: 9 }), 'A1.2')).toEqual({ note: null, blocked: false })
    setWarehouseLanguage('en')
    expect(moveTargetCheck('z9', null, 'A1.2').note).toBe('Z9 does not exist')
  })

  it('movedInList moves one pallet between the counts (nothing is added on a pick place)', () => {
    const places = { 'A1.1': listed('A1.1', { used: 1 }), 'A1.2': listed('A1.2'), H26: listed('H26', { purpose: 'pick' }) }
    expect([movedInList(places, 'A1.1', 'A1.2')['A1.1'].used, movedInList(places, 'A1.1', 'A1.2')['A1.2'].used]).toEqual([0, 1])
    expect(movedInList(places, 'A1.1', 'H26').H26.used).toBe(0)
  })

  it('withPutAway counts the new pallets on their places and shows what stands there', () => {
    const data = { list: { locations: [listed('A1.1'), listed('G1', { type: 'Gulv', used: 1 }), listed('H26', { purpose: 'pick' })], tags: [], canAdmin: false, imported: true, live: true, drawing: null } as LocationList, contents: { places: { G1: { materials: [{ material: 'M1', description: 'Kabel', pallets: 1, quantity: 5, oldestAt: 50, fixed: false }] } }, oldest: {} } as MapContents }
    const next = withPutAway(data, [
      { location: 'a1.1', material: 'm2', quantity: 10, receivedAt: 100 },
      { location: 'G1', material: 'M1', quantity: 3, receivedAt: 40 },
      { location: 'H26', material: 'M3', quantity: 1 },
    ])
    expect(next.list.locations.map(location => location.used)).toEqual([1, 2, 0])
    expect(next.contents.places['A1.1'].materials).toEqual([{ material: 'M2', description: '', pallets: 1, quantity: 10, oldestAt: 100, fixed: false }])
    expect(next.contents.places.G1.materials[0]).toMatchObject({ pallets: 2, quantity: 8, oldestAt: 40, description: 'Kabel' })
    expect(next.contents.places.H26).toBeUndefined()
    expect(data.list.locations[0].used, 'the old view is left as it was').toBe(0)
  })

  it('matdocOf reads a 49/50 number like the backend', () => {
    expect(matdocOf(' 5000032337  2026 0001 ')).toBe('5000032337 2026 0001')
    expect(matdocOf('5000032337')).toBe('5000032337')
    expect(matdocOf('50000-32337')).toBeNull()
  })
})
