import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { setWarehouseLanguage } from '@/lib/warehouse/text'
import { FINLAND_STANDARD_SHEET, type FinlandDraftsCleared, type FinlandDraftsPerson } from '@/types/finland'
import { danishGenitive, draftDays, FinlandDrafts, FinlandNshiftSettings, FinlandSheetSettings, leftBehindText, nshiftKeyProblem } from './FinlandAdmin'

const REAL = { workbookUrl: 'https://christianiabpos.sharepoint.com/sites/NordicSupplyChain/Shared Documents/Ordre.xlsx', sheetName: 'Sheet1', tableName: 'Table2', isTest: false }
const noop = () => {}

describe('Finlandsforsendelser in Administration', () => {
  afterEach(() => setWarehouseLanguage('da'))

  it('the standard sheet is the one the main process starts with', () => {
    const { STANDARD_WORKBOOK_URL } = createRequire(import.meta.url)('../../../../electron/warehouse/finland/shared.cjs')
    expect(FINLAND_STANDARD_SHEET.workbookUrl).toBe(STANDARD_WORKBOOK_URL)
  })

  it('shows the standard sheet as the sheet in use, without a badge or a way back to itself', () => {
    const html = renderToStaticMarkup(<FinlandSheetSettings settings={{ ...FINLAND_STANDARD_SHEET, isTest: false }} onSaved={noop} />)
    expect(html).toContain('Værktøjet skriver i')
    expect(html).toContain('Testark - Ordre sendt til Finland fra Danmark.xlsx')
    expect(html).toContain('Fane Sheet1, tabel Table2')
    expect(html).not.toContain('Testark</span>')
    expect(html).not.toContain('rigtige ark')
    expect(html).toContain('Arkets adresse')
    expect(html).not.toContain('Brug standardarket igen')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Gem<\/button>/)
  })

  it('another sheet offers the standard sheet again, a local copy does not', () => {
    const html = renderToStaticMarkup(<FinlandSheetSettings settings={REAL} onSaved={noop} />)
    expect(html).toContain('Ordre.xlsx')
    expect(html).toContain('Brug standardarket igen')
    const copy = renderToStaticMarkup(<FinlandSheetSettings settings={{ ...REAL, workbookUrl: 'C:\\Dev\\Kopi.xlsx', isTest: true, localCopy: true }} onSaved={noop} />)
    expect(copy).toContain('Lokal kopi')
    expect(copy).not.toContain('Brug standardarket igen')
  })

  it('lists each person with count, days, last change and a delete button', () => {
    const person: FinlandDraftsPerson = { email: 'jens@x.dk', name: 'Jens Hansen', count: 3, byDay: { '2026-11-25': 1, '2026-11-24': 2 }, updatedAt: new Date(2026, 10, 26, 14, 5).toISOString() }
    const html = renderToStaticMarkup(<FinlandDrafts people={[person, { ...person, email: 'anna@x.dk', name: 'Anna Holm' }]} onCleared={async () => {}} />)
    expect(html).toContain('3 kolli')
    expect(html).toContain('24.11, 25.11')
    expect(html).toContain('26.11.2026 14:05')
    expect(html).toContain('Slet Anna Holms ændringer')
    expect(html).toContain('Slet Jens Hansens ændringer')
    expect(renderToStaticMarkup(<FinlandDrafts people={[{ ...person, name: 'Lars Jens' }]} onCleared={async () => {}} />)).toContain('Slet Lars Jens&#x27; ændringer')
    setWarehouseLanguage('en')
    expect(renderToStaticMarkup(<FinlandDrafts people={[]} onCleared={async () => {}} />)).toContain('Nobody has changes that are not saved in the sheet.')
  })

  it('days are d.m oldest first, and names in s take only an apostrophe', () => {
    expect(draftDays({ '2026-12-01': 1, '2026-11-05': 4 })).toBe('5.11, 1.12')
    expect(draftDays({})).toBe('')
    expect(danishGenitive('Anna')).toBe('Annas')
    expect(danishGenitive('Jens')).toBe("Jens'")
  })

  it('the sheet switch says what stays behind in the current sheet', () => {
    expect(leftBehindText({ drafts: 3, notSent: 2 })).toBe('Der er 3 ikke gemte ændringer og 2 kolli markeret som ikke sendt i det nuværende ark. De bliver ikke taget med til det nye ark.')
    expect(leftBehindText({ drafts: 1, notSent: 0 })).toBe('Der er 1 ikke gemt ændring og 0 kolli markeret som ikke sendt i det nuværende ark. De bliver ikke taget med til det nye ark.')
    expect(leftBehindText({ drafts: 0, notSent: 0 })).toBeNull()
    setWarehouseLanguage('en')
    expect(leftBehindText({ drafts: 1, notSent: 1 })).toBe('There is 1 unsaved change and 1 parcel marked as not sent in the current sheet. They are not taken along to the new sheet.')
  })

  it('lists who deleted whose changes under the overview, newest first as given', () => {
    const at = new Date(2026, 10, 26, 14, 5).getTime()
    const cleared: FinlandDraftsCleared[] = [
      { by: 'mona@x.dk', byName: 'Mona Berg', email: 'jens@x.dk', name: 'Jens', count: 3, at },
      { by: 'mona@x.dk', byName: 'Mona Berg', email: 'anna@x.dk', name: 'Anna Holm', count: 1, at: at - 60000 },
    ]
    const html = renderToStaticMarkup(<FinlandDrafts people={[]} cleared={cleared} onCleared={async () => {}} />)
    expect(html).toContain('Slettede ændringer')
    expect(html.indexOf('Mona Berg slettede Jens&#x27; ændringer (3 kolli)')).toBeGreaterThan(-1)
    expect(html.indexOf('Mona Berg slettede Jens&#x27; ændringer (3 kolli)')).toBeLessThan(html.indexOf('Mona Berg slettede Anna Holms ændringer (1 kolli)'))
    expect(html).toContain('26.11.2026 14:05')
    expect(renderToStaticMarkup(<FinlandDrafts people={[]} onCleared={async () => {}} />)).not.toContain('Slettede ændringer')
  })

  it('shows whether nShift is set up without the secret', () => {
    const html = renderToStaticMarkup(<FinlandNshiftSettings status={{ configured: true, clientIdEnding: 'ab12' }} onSaved={noop} />)
    expect(html).toContain('nShift')
    expect(html).toContain('Sat op, klient-id slutter på ab12')
    expect(html).toContain('Klient-id')
    expect(html).toContain('Hemmelighed')
    expect(html).toMatch(/<input[^>]*type="password"[^>]*>/)
    expect(html).not.toMatch(/<input[^>]*type="password"[^>]*value="[^"]/)
    expect(html).toMatch(/<button[^>]*>Gem<\/button>/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Test forbindelsen<\/button>/)
    const unset = renderToStaticMarkup(<FinlandNshiftSettings status={{ configured: false, clientIdEnding: '' }} onSaved={noop} />)
    expect(unset).toContain('Ikke sat op')
    expect(unset).not.toContain('slutter på')
    expect(unset).toMatch(/<button[^>]*disabled=""[^>]*>Test forbindelsen<\/button>/)
    setWarehouseLanguage('en')
    expect(renderToStaticMarkup(<FinlandNshiftSettings status={{ configured: true, clientIdEnding: 'ab12' }} onSaved={noop} />)).toContain('Set up, client id ends in ab12')
  })

  it('the nShift key needs both fields, each at most 200 characters after trimming', () => {
    const problem = 'Udfyld klient-id og hemmelighed (højst 200 tegn).'
    expect(nshiftKeyProblem({ clientId: 'client', clientSecret: 'secret' })).toBeNull()
    expect(nshiftKeyProblem({ clientId: '  ', clientSecret: 'secret' })).toBe(problem)
    expect(nshiftKeyProblem({ clientId: 'client', clientSecret: '' })).toBe(problem)
    expect(nshiftKeyProblem({ clientId: 'x'.repeat(200), clientSecret: ` ${'y'.repeat(200)} ` })).toBeNull()
    expect(nshiftKeyProblem({ clientId: 'x'.repeat(201), clientSecret: 'secret' })).toBe(problem)
    setWarehouseLanguage('en')
    expect(nshiftKeyProblem({ clientId: '', clientSecret: '' })).toBe('Fill in client id and secret (at most 200 characters).')
  })
})
