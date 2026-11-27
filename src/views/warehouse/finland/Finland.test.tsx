import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { setWarehouseLanguage } from '@/lib/warehouse/text'
import type { FinlandDay, FinlandNotSentRow } from '@/types/finland'
import { FinlandMarks, lockText } from './Finland'
import { NotSentGroup } from './NotSentGroup'
import { WriteDay, type WriteDayProps } from './WriteDay'

const parcel = (delivery: number, tracking: string) => ({ delivery, orderType: 'ZRO', postalCode: '00100', courier: 'Postnord' as const, tracking, pickedUp: '2026-11-24' })
const notSent = (sheetRows: FinlandNotSentRow['sheetRows']): FinlandNotSentRow => ({ ...parcel(82100003, '00073215000000000003'), key: '82100003|00073215000000000003', markedBy: 'Bo Jensen', sheetRows })
const sheetRow = (row: number, shared = false): FinlandNotSentRow['sheetRows'][number] => ({
  row, pickedUp: '2026-11-24', orderType: 'ZRO', postalCode: '00100', courier: 'Postnord', trackingText: '00073215000000000003', shared,
  followUp: { expected: '2026-11-26', received: '', sla: '', comment: '', terminal: '' },
})

const DAY: FinlandDay = {
  date: '2026-11-24',
  total: 4,
  status: 'partial',
  missing: [parcel(82100001, '00073215000000000001'), parcel(82100002, '00073215000000000002')],
  review: [],
  inSheet: [parcel(82100004, '00073215000000000004')],
  notSent: [],
}

const noop = () => {}
const props = (extra: Partial<WriteDayProps> = {}): WriteDayProps => ({
  day: DAY, lastWrite: undefined, working: null, writeBlocked: false, isAdmin: true, confirmDelete: null,
  onWrite: noop, onFix: noop, onMarkNotSent: noop, onRestore: noop, onAskDelete: noop, onDelete: noop, ...extra,
})
const writeButton = (html: string) => /<button[^>]*>(?:(?!<\/button>).)*Skriv 2 kolli i arket<\/button>/.exec(html)?.[0] ?? ''

describe('Finlandsforsendelser: Skriv ind', () => {
  afterEach(() => setWarehouseLanguage('da'))

  it('shows the day with its write button, groups and who wrote it last', () => {
    const at = new Date()
    at.setHours(14, 5)
    const html = renderToStaticMarkup(<WriteDay {...props({ lastWrite: { byName: 'Anna Holm', at: at.getTime(), count: 3 } })} />)
    expect(html).toContain('Tirsdag 24. november')
    expect(html).toContain('4 kolli i SAP. 1 står i arket, 2 mangler.')
    expect(html).toContain('Sidst skrevet af Anna Holm kl. 14.05')
    expect(html).toContain('Mangler i arket')
    expect(html).toContain('Står i arket')
    expect(writeButton(html)).not.toContain('disabled=""')
  })

  it('the write button waits while someone else holds the lock', () => {
    const html = renderToStaticMarkup(<WriteDay {...props({ writeBlocked: true })} />)
    expect(writeButton(html)).toContain('disabled=""')
    expect(lockText({ byName: 'Anna Holm', day: '2026-11-19', action: 'skriver' })).toBe('Anna Holm skriver 19. november i arket lige nu.')
    expect(lockText({ byName: 'Anna Holm', day: '', action: 'skriver' })).toBe('Anna Holm skriver i arket lige nu.')
  })

  it('the lock line says what the colleague is doing', () => {
    expect(lockText({ byName: 'Ada Admin', day: '2026-11-20', action: 'sletter række' })).toBe('Ada Admin sletter en række i arket lige nu.')
    expect(lockText({ byName: 'Anna Holm', day: '2026-11-19', action: 'retter' })).toBe('Anna Holm retter 19. november i arket lige nu.')
    expect(lockText({ byName: 'Anna Holm', day: '2026-11-19', action: 'gemmer opfølgning' })).toBe('Anna Holm gemmer opfølgning i arket lige nu.')
    setWarehouseLanguage('en')
    expect(lockText({ byName: 'Ada Admin', day: '2026-11-20', action: 'sletter række' })).toBe('Ada Admin is deleting a row in the sheet right now.')
  })

  it('only an admin sees the delete button and its confirmation', () => {
    const group = (isAdmin: boolean, confirmKey: string | null = null) => renderToStaticMarkup(
      <NotSentGroup rows={[notSent([sheetRow(5)])]} confirmKey={confirmKey} busy={false} writeBlocked={false} isAdmin={isAdmin} deleting={false} onAskDelete={noop} onDelete={noop} onRestore={noop} />,
    )
    expect(group(true)).toContain('Slet række 5 i arket')
    const plain = group(false, '82100003|00073215000000000003')
    expect(plain).not.toContain('Slet række')
    expect(plain).not.toContain('bliver slettet i arket')
    expect(plain).toContain('Sæt ind igen')
  })

  it('a not-sent parcel on one row of its own can be deleted after a confirmation showing the whole row', () => {
    const group = (rows: FinlandNotSentRow[], confirmKey: string | null = null) => renderToStaticMarkup(
      <NotSentGroup rows={rows} confirmKey={confirmKey} busy={false} writeBlocked={false} isAdmin deleting={false} onAskDelete={noop} onDelete={noop} onRestore={noop} />,
    )
    expect(group([notSent([sheetRow(5)])])).toContain('Slet række 5 i arket')
    expect(group([notSent([sheetRow(5, true)])])).toContain('Slet rækken i hånden')
    expect(group([notSent([])])).toContain('Står ikke i arket')
    const confirm = group([notSent([sheetRow(5)])], '82100003|00073215000000000003')
    expect(confirm).toContain('Række 5 bliver slettet i arket:')
    expect(confirm).toContain('26-11-2026')
    expect(confirm).toContain('Rækken er fulgt op, og det forsvinder også.')
    expect(confirm).toContain('Ja, slet række 5 i arket')
  })

  it('the title bar marks unsaved changes, and the shared sheet has no badge', () => {
    expect(renderToStaticMarkup(<FinlandMarks pending={0} />)).toBe('')
    const html = renderToStaticMarkup(<FinlandMarks pending={3} />)
    expect(html).toContain('3 kolli er ikke gemt i arket')
    expect(html).not.toContain('Testark')
    setWarehouseLanguage('en')
    expect(renderToStaticMarkup(<FinlandMarks pending={1} />)).toContain('1 parcel not saved in the sheet')
  })

  it('the title bar says local copy when the Hub was started with one', () => {
    expect(renderToStaticMarkup(<FinlandMarks pending={0} localCopy />)).toContain('Lokal kopi')
  })
})
