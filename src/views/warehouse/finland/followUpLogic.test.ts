import { afterEach, describe, expect, it } from 'vitest'
import { setWarehouseLanguage } from '@/lib/warehouse/text'
import type { FinlandFollowUpRow } from '@/types/finland'
import { applySuggestions, changeField, changesText, chooseDefaultDay, openForm, othersOnDay, othersOnParcel, savedLines, slaHint, statusLines, suggestionList, suggestionText, wantedOf } from './followUpLogic'

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

const NSHIFT = (suggestion: Partial<NonNullable<FinlandFollowUpRow['nshift']>['suggestion']> = {}, delivered: string | null = '2026-11-27'): FinlandFollowUpRow['nshift'] => ({
  fetchedAt: '2026-11-27T09:15:00.000Z',
  events: [],
  firstAttempt: '2026-11-25',
  delivered,
  suggestion: { received: delivered, sla: 'OK', terminal: 'Vantaa', comment: '1st attempt within SLA (25-11)', ...suggestion },
})

describe('Opfølgning: suggestions from nShift', () => {
  afterEach(() => setWarehouseLanguage('da'))

  it('nShift suggestions fill only empty fields', () => {
    const r = row({ nshift: NSHIFT() })
    expect(wantedOf(applySuggestions(openForm(r), r))).toEqual({
      expected: '2026-11-26', received: '2026-11-27', terminal: 'Vantaa', comment: '1st attempt within SLA (25-11)', sla: 'OK',
    })
    const values = { ...BLANK, received: '2026-11-26', terminal: 'Turku', comment: 'Ring' }
    const filled = row({ nshift: NSHIFT(), sheet: values, effective: values })
    expect(wantedOf(applySuggestions(openForm(filled), filled))).toEqual({ expected: '2026-11-26', sla: 'OK' })
    const typed = changeField(openForm(r), r, 'comment', 'Retur')
    expect(applySuggestions(typed, r).values.comment).toBe('Retur')
  })

  it('the nShift SLA wins over the date rule unless SLA is set by hand', () => {
    const r = row({ nshift: NSHIFT({ sla: 'OK' }) })
    // Delivered on the 27th, after Expected on the 26th: the date rule says NOK, but the first attempt was in time.
    expect(applySuggestions(openForm(r), r).values.sla).toBe('OK')
    expect(slaHint(applySuggestions(openForm(r), r), r)).toBe('forslag fra nShift')
    const byHand = changeField(openForm(r), r, 'sla', 'NOK')
    expect(applySuggestions(byHand, r).values.sla).toBe('NOK')
    // A Received the person chose that nShift did not see follows the date rule again.
    const own = changeField(openForm(r), r, 'received', '2026-11-28')
    expect(applySuggestions(own, r).values.sla).toBe('NOK')
    const values = { ...BLANK, expected: '2026-11-26', received: '2026-11-27', sla: 'NOK' }
    const inSheet = row({ nshift: NSHIFT(), sheet: values, effective: values })
    expect(wantedOf(applySuggestions(openForm(inSheet), inSheet))).toEqual({ terminal: 'Vantaa', comment: '1st attempt within SLA (25-11)' })
  })

  it('without nShift the old behaviour is unchanged', () => {
    const r = row()
    expect(wantedOf(applySuggestions(openForm(r), r))).toEqual({ expected: '2026-11-26' })
    const received = changeField(openForm(r), r, 'received', '2026-11-27')
    expect(wantedOf(applySuggestions(received, r))).toEqual({ received: '2026-11-27', expected: '2026-11-26', sla: 'NOK' })
    expect(slaHint(received, r)).toBe('beregnet')
  })

  it('the list for the whole day has only empty fields of delivered parcels', () => {
    const values = { ...BLANK, expected: '2026-11-25', comment: 'Ring' }
    const rows = [
      row({ nshift: NSHIFT() }),
      row({ key: 'k2', row: 6, delivery: '82100002', nshift: NSHIFT(), sheet: values, effective: values }),
      row({ key: 'k3', row: 7, delivery: '82100003', nshift: NSHIFT({}, null) }),
      row({ key: 'k4', row: 8, delivery: '82100004', nshift: NSHIFT(), duplicate: true }),
      row({ key: 'k5', row: 9, delivery: '82100005' }),
      row({ key: 'k6', row: 10, delivery: '82100006', nshift: NSHIFT(), pickedUp: '2026-11-25' }),
      row({ key: 'k7', row: 11, delivery: '82100007', nshift: NSHIFT(), pending: true, sheet: { ...BLANK, comment: 'Ring' }, effective: { ...BLANK } }),
    ]
    const list = suggestionList(rows, '2026-11-24')
    expect(list.map(x => x.row.delivery)).toEqual(['82100001', '82100002', '82100007'])
    expect(list[0].fields).toEqual({ expected: '2026-11-26', received: '2026-11-27', sla: 'OK', comment: '1st attempt within SLA (25-11)', terminal: 'Vantaa' })
    expect(list[1].fields).toEqual({ received: '2026-11-27', sla: 'OK', terminal: 'Vantaa' })
    // A comment the person cleared is their choice, as a field touched in the open form.
    expect(list[2].fields).toEqual({ expected: '2026-11-26', received: '2026-11-27', sla: 'OK', terminal: 'Vantaa' })
    const form = changeField(openForm(rows[0]), rows[0], 'terminal', '')
    expect(suggestionList(rows, '2026-11-24', form)[0].fields).not.toHaveProperty('terminal')
    expect(suggestionText({ received: '2026-11-27', sla: 'OK' })).toBe('Received 27-11-2026, SLA OK')
  })

  it('says what a status fetch did and when', () => {
    expect(statusLines({ fetched: 5, notFound: 0, failed: 0 })).toBe('5 kolli hentet.')
    expect(statusLines({ fetched: 3, notFound: 1, failed: 2 })).toBe('3 kolli hentet. 1 ikke fundet i nShift. 2 fejlede.')
    setWarehouseLanguage('en')
    expect(statusLines({ fetched: 0, notFound: 2, failed: 0 })).toBe('0 parcels fetched. 2 not found in nShift.')
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
