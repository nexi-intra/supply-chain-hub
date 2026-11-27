import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { setWarehouseLanguage } from '@/lib/warehouse/text'
import type { FinlandFollowUpRow, FinlandFollowUpView } from '@/types/finland'
import { FollowUpCalendar } from './FollowUpCalendar'
import { FollowUpDetail, type FollowUpDetailProps } from './FollowUpDetail'
import { openForm } from './followUpLogic'
import { SaveAllConfirm, SuggestConfirm, SyncBar, type SyncBarProps } from './SaveConfirm'

const BLANK = { expected: '', received: '', sla: '', comment: '', terminal: '' }
const row = (extra: Partial<FinlandFollowUpRow> = {}): FinlandFollowUpRow => ({
  key: '82100001|00073215000000000001', row: 5, delivery: '82100001', orderType: 'ZRO', postalCode: '00100', courier: 'Postnord',
  tracking: '00073215000000000001', pickedUp: '2026-11-24', sheet: { ...BLANK }, effective: { ...BLANK }, pending: false, slaManual: false,
  othersPending: [], suggestedExpected: '2026-11-26', receivedChoices: ['2026-11-25', '2026-11-26'], duplicate: false, noTracking: false,
  conflicts: [], done: false, nshift: null, ...extra,
})

const noop = () => {}
const detail = (r: FinlandFollowUpRow, extra: Partial<FollowUpDetailProps> = {}) => renderToStaticMarkup(
  <FollowUpDetail row={r} form={openForm(r)} hasDay comments={['Retur']} onChange={noop} onDateError={noop} onResolve={noop} onTracking={noop} onPrevious={noop} onNext={noop} {...extra} />,
)
const button = (html: string, text: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${text}</button>`).exec(html)?.[0] ?? ''

describe('Finlandsforsendelser: Opfølgning', () => {
  afterEach(() => setWarehouseLanguage('da'))

  it('a parcel shows its fields, the suggestion and the keys', () => {
    const html = detail(row())
    expect(html).toContain('82100001 · ZRO · 00100 · afhentet ti 24 · række 5')
    expect(html).toContain('Åbn hos PostNord')
    expect(html).not.toContain('Ctrl+V')
    expect(html).toContain('placeholder="26-11-2026"')
    expect(html).toContain('forslag, bliver brugt når du går videre')
    expect(html).toContain('sættes når Received er udfyldt')
    expect(html).toContain('>Turku</button>')
    expect(html).toContain('Retur')
    expect(html).toContain('Taster: Enter næste, 1 Turku, 2 Vantaa, O OK, N NOK, T åbn tracking, pil op og ned skifter kolli.')
    expect(html).not.toContain('har en ændring på dette kolli')
  })

  it('DSV: the T&T is copied, and the terminal is set by itself', () => {
    const html = detail(row({ courier: 'DSV' }))
    expect(html).toContain('Åbn hos DSV')
    expect(html).toContain('T&amp;T bliver kopieret. Sæt det ind på siden med Ctrl+V.')
    expect(html).toContain('sættes når du går videre')
    expect(html).not.toContain('>Vantaa</button>')
  })

  it('warns when colleagues have a change on the parcel, without stopping the person', () => {
    const html = detail(row({ othersPending: ['Anna Holm', 'Bo Jensen'] }))
    expect(html).toContain('Anna Holm og Bo Jensen har en ændring på dette kolli, der ikke er gemt.')
    expect(button(html, 'Næste \\(Enter\\)')).not.toContain('disabled=""')
  })

  it('a parcel shows nShift\'s timeline and suggestions, and "Opdater status" only where nShift can look it up', () => {
    const nshift = {
      fetchedAt: '2026-11-27T09:15:00.000Z',
      events: [
        { at: '2026-11-27T10:05:00.000Z', statusId: 3000, status: 'Delivered', text: 'Delivered', place: 'Espoo FI' },
        { at: '2026-11-25T08:00:00.000Z', statusId: 5006, status: 'Failed delivery attempt', text: 'Recipient not home', place: 'Espoo FI' },
      ],
      firstAttempt: '2026-11-25',
      delivered: '2026-11-27',
      suggestion: { received: '2026-11-27', sla: 'OK' as const, terminal: 'Vantaa', comment: '1st attempt within SLA (25-11)' },
    }
    const html = detail(row({ nshift }), { onUpdateStatus: noop })
    expect(html).toContain('Første forsøg 25-11')
    expect(html).toContain('Afleveret 27-11')
    expect(html).toContain('Forløb i nShift (finsk tid)')
    expect(html).toContain('27-11 12.05')
    expect(html.indexOf('Recipient not home')).toBeLessThan(html.indexOf('Delivered'))
    expect(html).toContain('placeholder="27-11-2026"')
    expect(html).toContain('placeholder="1st attempt within SLA (25-11)"')
    expect(html).toContain('forslag fra nShift')
    expect(button(html, 'Opdater status')).not.toContain('disabled=""')
    expect(detail(row({ courier: 'DSV', nshift }), { onUpdateStatus: noop })).not.toContain('Opdater status')
  })

  it('a conflict offers the sheet\'s value or the person\'s own', () => {
    const conflict = { key: '82100001|00073215000000000001', field: 'received' as const, original: '', current: '2026-11-25', wanted: '2026-11-26' }
    const html = detail(row({ conflicts: [conflict] }))
    expect(html).toContain('Received er ændret i arket af en anden: der står 25-11-2026, du har 26-11-2026.')
    expect(html).toContain('Brug arkets')
    expect(html).toContain('Brug min')
  })

  it('a parcel twice in the sheet or without T&T cannot be followed up here', () => {
    expect(detail(row({ duplicate: true }))).toContain('Kolliet står to gange i arket. Ret det under Skriv ind først.')
    expect(detail(row({ duplicate: true }))).not.toContain('<input')
    expect(detail(row({ key: '', tracking: '', noTracking: true }))).toContain('Rækken har intet T&amp;T, så den kan ikke følges op her.')
  })

  it('the day\'s bar saves after a confirmation listing the changes, and waits for the lock', () => {
    const pending = [row({ pending: true, effective: { ...BLANK, expected: '2026-11-26', terminal: 'Turku' } })]
    const bar = (extra: Partial<SyncBarProps> = {}) => renderToStaticMarkup(
      <SyncBar day="2026-11-24" pending={pending} total={3} confirm={false} saving={false} busy={false} writeBlocked={false} onAsk={noop} onCancel={noop} onSave={noop} onAll={noop} {...extra} />,
    )
    const html = bar()
    expect(html).toContain('1 kolli på denne dag er ændret i appen og venter på at komme i arket. 3 i alt på alle dage.')
    expect(button(html, 'Gem 1 i arket')).not.toContain('disabled=""')
    expect(button(html, 'Gem alle 3')).not.toContain('disabled=""')
    const locked = bar({ writeBlocked: true })
    expect(button(locked, 'Gem 1 i arket')).toContain('disabled=""')
    expect(button(locked, 'Gem alle 3')).toContain('disabled=""')

    const confirm = bar({ confirm: true })
    expect(confirm).toContain('Dette bliver skrevet i arket for tirsdag 24. november:')
    expect(confirm).toContain('Expected 26-11-2026, Terminal Turku')
    expect(button(confirm, 'Ja, gem i arket')).not.toContain('disabled=""')
    expect(button(bar({ confirm: true, writeBlocked: true }), 'Ja, gem i arket')).toContain('disabled=""')
    expect(renderToStaticMarkup(<SyncBar {...{ day: '2026-11-24', pending: [], total: 0, confirm: false, saving: false, busy: false, writeBlocked: false, onAsk: noop, onCancel: noop, onSave: noop, onAll: noop }} />)).toBe('')
  })

  it('"Brug forslagene" lists the fields per parcel before anything is changed', () => {
    const list = [{ row: row(), fields: { expected: '2026-11-26', received: '2026-11-27', sla: 'OK' } }]
    const html = renderToStaticMarkup(<SuggestConfirm day="2026-11-24" list={list} applying={false} busy={false} onApply={noop} onCancel={noop} />)
    expect(html).toContain('Disse felter bliver udfyldt for tirsdag 24. november (1 kolli):')
    expect(html).toContain('Expected 26-11-2026, Received 27-11-2026, SLA OK')
    expect(button(html, 'Ja, brug forslagene')).not.toContain('disabled=""')
    expect(html).toContain('Fortryd')
  })

  it('"Gem alle" shows every change by day, and what is no longer in the sheet', () => {
    const rows = [
      row({ pending: true, pickedUp: '2026-11-25', effective: { ...BLANK, sla: 'OK' } }),
      row({ key: '82100002|00073215000000000002', row: 7, delivery: '82100002', pending: true, effective: { ...BLANK, comment: 'Retur' } }),
    ]
    const all = (writeBlocked: boolean) => renderToStaticMarkup(<SaveAllConfirm rows={rows} total={3} saving={false} busy={false} writeBlocked={writeBlocked} onSave={noop} onClose={noop} />)
    const html = all(false)
    expect(html).toContain('Dette bliver skrevet i arket (3 kolli):')
    expect(html.indexOf('Tirsdag 24. november')).toBeLessThan(html.indexOf('Onsdag 25. november'))
    expect(html).toContain('Comment Retur')
    expect(html).toContain('1 kolli findes ikke længere i arket og bliver ikke skrevet.')
    expect(button(html, 'Ja, gem alle i arket')).not.toContain('disabled=""')
    expect(button(all(true), 'Ja, gem alle i arket')).toContain('disabled=""')
    expect(renderToStaticMarkup(<SaveAllConfirm rows={[]} total={0} saving={false} busy={false} writeBlocked={false} onSave={noop} onClose={noop} />)).toContain('Luk')
  })

  it('the calendar shows each day\'s own and colleagues\' changes not in the sheet', () => {
    const view: FinlandFollowUpView = {
      days: [{ date: '2026-11-24', total: 4, done: 1, status: 'some' }, { date: '2026-11-25', total: 2, done: 2, status: 'done' }],
      rows: [],
      comments: [],
      pendingTotal: 2,
      pendingByDay: { '2026-11-24': 2 },
      othersByDay: { '2026-11-24': [{ name: 'Anna Holm', count: 3 }, { name: 'Bo Jensen', count: 1 }] },
    }
    const html = renderToStaticMarkup(<FollowUpCalendar view={view} today="2026-11-26" selected="2026-11-24" month={null} onSelect={noop} onMonth={noop} />)
    expect(html).toContain('November 2026')
    expect(html).toContain('aria-label="Tirsdag 24. november: 1 af 4 kolli fulgt op. Anna Holm har 3 kolli, der ikke er gemt. Bo Jensen har 1 kolli, der ikke er gemt."')
    expect(html).toContain('title="2 ændringer er ikke gemt i arket"')
    expect(html).toContain('title="Anna Holm har 3 kolli, der ikke er gemt. Bo Jensen har 1 kolli, der ikke er gemt."')
    expect(html).toContain('✓')
  })
})
