import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSectionsFromPdfPages, importGuideFromPdf, type PdfPageText, type PdfTextItem } from './pdfImporter'

afterEach(() => vi.unstubAllGlobals())

const item = (str: string, x: number, y: number, fontSize = 8): PdfTextItem => ({ str, x, y, fontSize })

function baxiPage(number: number, body: PdfTextItem[]): PdfPageText {
  return { height: 842, items: [item('LM transaction result handling', 40, 810, 12), ...body, item(`Page ${number}`, 280, 20, 8)] }
}

const pages: PdfPageText[] = [
  baxiPage(1, [
    item('About', 40, 760, 14),
    item('LocalMode is the response to the financial transaction. Result code is used to find out the result of the', 40, 740),
    item('transaction, e.g. approved or declined.', 40, 730),
    item('Rejection Reason', 40, 690, 14),
    item('1:0', 60, 670), item('Busy', 140, 670),
    item('1:1', 60, 655), item('Busy Completing last', 140, 655),
    item('transaction', 140, 645),
  ]),
  baxiPage(2, [
    item('2:1', 60, 760), item('Cancelled by Cancel', 140, 760), item('When transaction initiated by ECR, is cancelled by terminal', 300, 760),
    item('Key Pressed', 140, 750),
    item('Samples', 40, 700, 14),
    item('RejectionSource: 03 = Terminal', 40, 680),
  ]),
]

describe('buildSectionsFromPdfPages', () => {
  const sections = buildSectionsFromPdfPages(pages, 'en')
  const texts = sections.flatMap((section) => section.steps.map((step) => step.text))

  it('uses the larger text as section headings and removes repeated headers and page numbers', () => {
    expect(sections.map((section) => section.heading)).toEqual(['About', 'Rejection Reason', 'Samples'])
    expect(texts.join('\n')).not.toMatch(/LM transaction result handling|Page \d/)
  })

  it('joins wrapped paragraph lines into one step', () => {
    expect(sections[0].steps.map((step) => step.text)).toEqual([
      'LocalMode is the response to the financial transaction. Result code is used to find out the result of the transaction, e.g. approved or declined.',
    ])
  })

  it('keeps table rows as separate pipe-separated steps, including wrapped cells and rows that continue on the next page', () => {
    expect(sections[1].steps.map((step) => step.text)).toEqual([
      '1:0 | Busy',
      '1:1 | Busy Completing last transaction',
      '2:1 | Cancelled by Cancel Key Pressed | When transaction initiated by ECR, is cancelled by terminal',
    ])
    expect(sections[2].steps.map((step) => step.text)).toEqual(['RejectionSource: 03 = Terminal'])
  })

  it('places text before the first heading in a localized overview section', () => {
    const result = buildSectionsFromPdfPages([{ height: 842, items: [item('Intro text', 40, 700), item('Details', 40, 650, 14), item('More', 40, 630)] }], 'da')
    expect(result.map((section) => section.heading)).toEqual(['Oversigt', 'Details'])
  })

  it('returns no sections when the PDF has no text', () => {
    expect(buildSectionsFromPdfPages([{ height: 842, items: [] }], 'en')).toEqual([])
  })
})

/** Builds a small but real PDF (Helvetica text) with a correct cross-reference table. */
function makePdf(pageContents: string[]): Uint8Array {
  const objects: string[] = []
  const pageIds = pageContents.map((_, index) => 4 + index * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  pageContents.forEach((content, index) => {
    const pageId = pageIds[index]
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`
    objects[pageId + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  })
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

const text = (size: number, x: number, y: number, value: string) => `BT /F1 ${size} Tf ${x} ${y} Td (${value}) Tj ET`

function kvFixture() {
  const store = new Map<string, unknown>()
  vi.stubGlobal('window', {
    kv: {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, value: unknown) => { store.set(key, value) }),
      delete: vi.fn(async (key: string) => { store.delete(key) }),
    },
  })
  return store
}

describe('importGuideFromPdf', () => {
  const pdfBytes = makePdf([
    [text(12, 40, 810, 'LM transaction result handling'), text(16, 40, 760, 'Rejection Reason'), text(9, 60, 730, '2:1'), text(9, 140, 730, 'Cancelled by Cancel Key Pressed'), text(9, 280, 20, 'Page 1')].join('\n'),
    [text(12, 40, 810, 'LM transaction result handling'), text(16, 40, 760, 'Samples'), text(9, 40, 730, 'RejectionSource: 05 = Host/PSP'), text(9, 280, 20, 'Page 2')].join('\n'),
  ])

  it('extracts sections from a real PDF and stores the original PDF', async () => {
    const store = kvFixture()
    const progress: number[] = []
    const draft = await importGuideFromPdf(new File([pdfBytes], 'LM_transaction-result.pdf', { type: '' }), (p) => progress.push(p.percent), { language: 'en' })
    expect(draft.title).toBe('LM transaction result')
    expect(draft.language).toBe('en')
    expect(draft.sections.map((section) => section.heading)).toEqual(['Rejection Reason', 'Samples'])
    expect(draft.sections[0].steps[0].text).toBe('2:1 | Cancelled by Cancel Key Pressed')
    expect(draft.sections[1].steps[0].text).toBe('RejectionSource: 05 = Host/PSP')
    expect(draft.originalPdf?.url).toMatch(/^kv:\/\/file_/)
    expect(draft.originalPdf?.filename).toBe('LM_transaction-result.pdf')
    const meta = store.get(`${draft.originalPdf!.url.slice(5)}_meta`) as { contentType: string }
    expect(meta.contentType).toBe('application/pdf')
    expect(progress[progress.length - 1]).toBe(100)
  }, 30_000) // real pdf.js parsing: ~1.5 s alone, can exceed 5 s while the full suite runs in parallel

  it('rejects files that are not PDFs without storing anything', async () => {
    const store = kvFixture()
    await expect(importGuideFromPdf(new File([new TextEncoder().encode('hello')], 'fake.pdf'), undefined, { language: 'en' })).rejects.toThrow('not a valid PDF')
    await expect(importGuideFromPdf(new File([pdfBytes], 'notes.docx'), undefined, { language: 'da' })).rejects.toThrow('PDF')
    expect(store.size).toBe(0)
  })

  it('explains that a PDF without text (e.g. a scan) must be created manually', async () => {
    const store = kvFixture()
    await expect(importGuideFromPdf(new File([makePdf([''])], 'scan.pdf'), undefined, { language: 'da' })).rejects.toThrow('ingen tekst')
    expect(store.size).toBe(0)
  })
})
