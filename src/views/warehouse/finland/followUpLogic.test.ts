import { afterEach, describe, expect, it } from 'vitest'
import { setWarehouseLanguage } from '@/lib/warehouse/text'
import type { FinlandFollowUpRow } from '@/types/finland'
import { applySuggestions, changeField, changesText, chooseDefaultDay, openForm, othersOnDay, othersOnParcel, savedLines, slaHint, wantedOf } from './followUpLogic'

const BLANK = { expected: '', received: '', sla: '', comment: '', terminal: '' }
const row = (extra: Partial<FinlandFollowUpRow> = {}): FinlandFollowUpRow => ({
  key: '82100001|00073215000000000001', row: 5, delivery: '82100001', orderType: 'ZRO', postalCode: '00100', courier: 'Postnord',
  tracking: '00073215000000000001', pickedUp: '2026-11-24', sheet: { ...BLANK }, effective: { ...BLANK }, pending: false, slaManual: false,
  othersPending: [], suggestedExpected: '2026-11-26', receivedChoices: [], duplicate: false, noTracking: false, conflicts: [], done: false, nshift: null, ...extra,
})

describe('Opfølgning: the form', () => {
  afterEach(() => setWarehouseLanguage('da'))

  it('a Received date keeps the suggested Expected and works out SLA', () => {
    const r = row()
    const form = changeField(openForm(r), r, 'received', '2026-11-27')
    expect(wantedOf(form)).toEqual({ received: '2026-11-27', expected: '2026-11-26', sla: 'NOK' })
    expect(slaHint(form, r)).toBe('beregnet')
    const onTime = changeField(form, r, 'received', '2026-11-26')
    expect(onTime.values.sla).toBe('OK')
  })

  it('SLA chosen by hand stays, also when a date changes', () => {
    const r = row()
    let form = changeField(openForm(r), r, 'sla', 'OK')
    expect(form.slaManual).toBe(true)
    form = changeField(form, r, 'received', '2026-11-30')
    expect(form.values.sla).toBe('OK')
    expect(form.values.expected).toBe('')
    expect(slaHint(form, r)).toBe('valgt i hånden, beregnet ville være NOK')
    expect(wantedOf(applySuggestions(form, r))).toEqual({ sla: 'OK', received: '2026-11-30', expected: '2026-11-26' })
  })

  it('suggestions are only taken when the person moves on, and only where nothing is filled in', () => {
    const plain = row()
    expect(wantedOf(openForm(plain))).toEqual({})
    expect(wantedOf(applySuggestions(openForm(plain), plain))).toEqual({ expected: '2026-11-26' })

    const dhl = row({ courier: 'DHL' })
    expect(wantedOf(applySuggestions(openForm(dhl), dhl))).toEqual({ expected: '2026-11-26', terminal: 'DHL' })

    const filled = row({ sheet: { ...BLANK, expected: '2026-11-25', terminal: 'Vantaa' }, effective: { ...BLANK, expected: '2026-11-25', terminal: 'Vantaa' } })
    expect(wantedOf(applySuggestions(openForm(filled), filled))).toEqual({})
  })

  it('an SLA already in the sheet is kept unless a date was changed now', () => {
    const values = { ...BLANK, expected: '2026-11-25', received: '2026-11-27', sla: 'OK' }
    const r = row({ sheet: values, effective: values })
    expect(wantedOf(applySuggestions(openForm(r), r))).toEqual({})
    const changed = changeField(openForm(r), r, 'comment', 'Retur')
    expect(wantedOf(applySuggestions(changed, r))).toEqual({ comment: 'Retur' })
    const empty = { ...values, sla: '' }
    const noSla = row({ sheet: empty, effective: empty })
    expect(wantedOf(applySuggestions(openForm(noSla), noSla))).toEqual({ sla: 'NOK' })
  })

  it('the confirmation lists what will be written', () => {
    const r = row({ sheet: { ...BLANK, comment: 'Ring' }, effective: { ...BLANK, expected: '2026-11-26', sla: 'OK', comment: '' } })
    expect(changesText(r)).toBe('Expected 26-11-2026, SLA OK, Comment tom')
    setWarehouseLanguage('en')
    expect(changesText(r)).toBe('Expected 26-11-2026, SLA OK, Comment empty')
  })

  it('the default day is the newest open day before today', () => {
    const days = [
      { date: '2026-11-20', total: 2, done: 1, status: 'some' as const },
      { date: '2026-11-23', total: 2, done: 2, status: 'done' as const },
      { date: '2026-11-26', total: 2, done: 0, status: 'open' as const },
    ]
    expect(chooseDefaultDay(days, '2026-11-26')).toBe('2026-11-20')
    expect(chooseDefaultDay(days.slice(1, 2), '2026-11-26')).toBe('2026-11-23')
    expect(chooseDefaultDay([], '2026-11-26')).toBe(null)
  })
})

describe('Opfølgning: colleagues and saving', () => {
  afterEach(() => setWarehouseLanguage('da'))

  it('names colleagues with changes not in the sheet', () => {
    expect(othersOnDay([{ name: 'Anna Holm', count: 3 }, { name: 'Bo Jensen', count: 1 }])).toEqual([
      'Anna Holm har 3 kolli, der ikke er gemt.',
      'Bo Jensen har 1 kolli, der ikke er gemt.',
    ])
    expect(othersOnDay(undefined)).toEqual([])
    expect(othersOnParcel([])).toBe(null)
    expect(othersOnParcel(['Anna Holm'])).toBe('Anna Holm har en ændring på dette kolli, der ikke er gemt.')
    expect(othersOnParcel(['Anna Holm', 'Bo Jensen'])).toBe('Anna Holm og Bo Jensen har en ændring på dette kolli, der ikke er gemt.')
    setWarehouseLanguage('en')
    expect(othersOnParcel(['Anna Holm', 'Bo Jensen'])).toBe('Anna Holm and Bo Jensen have a change on this parcel that is not saved.')
  })

  it('says what the save did', () => {
    expect(savedLines({ written: 2, moved: 0, conflicts: 0, notFound: 0 })).toEqual({ tone: 'success', lines: ['2 kolli er skrevet i arket, og arket er gemt.'] })
    expect(savedLines({ written: 0, moved: 1, conflicts: 1, notFound: 1 })).toEqual({
      tone: 'info',
      lines: [
        'Der var intet nyt at skrive i arket.',
        '1 kolli er ændret i arket af en anden. De er ikke skrevet. Se dem i listen.',
        '2 kolli blev ikke fundet i arket. Tryk "Hent igen".',
      ],
    })
  })
})
