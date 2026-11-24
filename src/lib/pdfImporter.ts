// Imports a PDF into editable sections so search, Hubert and the translator can use the
// text, while the original PDF is stored unchanged and stays viewable.

import { fileStorage, type StoredFile } from './fileStorage'
import { newId, type GuideSection } from './guideTypes'
import type { GuideImportDraft, ImportProgress } from './docxImporter'
import { detectLanguage, type GuideLanguage } from './translator'
import { yieldToBrowser } from './utils'

export interface PdfTextItem {
  str: string
  x: number
  y: number
  fontSize: number
  width?: number
}

export interface PdfPageText {
  height: number
  items: PdfTextItem[]
}

interface Cell {
  x: number
  end: number
  text: string
}

interface Line {
  y: number
  fontSize: number
  cells: Cell[]
}

const LINE_TOLERANCE = 3
const CELL_GAP = 12
const HEADING_RATIO = 1.25
const MAX_PAGES = 500

const OVERVIEW_HEADING: Record<GuideLanguage, string> = { da: 'Oversigt', en: 'Overview', fi: 'Yleiskatsaus', sv: 'Översikt' }
const MESSAGES: Record<GuideLanguage, { onlyPdf: string; invalid: string; noText: string; reading: string; parsing: string; storing: string; done: string }> = {
  da: { onlyPdf: 'Kun PDF-filer kan importeres her', invalid: 'Filen er ikke en gyldig PDF (not a valid PDF)', noText: 'PDF\'en indeholder ingen tekst, der kan læses (fx en scannet side). Opret artiklen manuelt i stedet.', reading: 'Læser PDF…', parsing: 'Analyserer struktur…', storing: 'Gemmer original PDF…', done: 'Færdig!' },
  en: { onlyPdf: 'Only PDF files can be imported here', invalid: 'The file is not a valid PDF', noText: 'The PDF contains no readable text (for example a scanned page). Create the article manually instead.', reading: 'Reading PDF…', parsing: 'Analysing structure…', storing: 'Saving original PDF…', done: 'Done!' },
  fi: { onlyPdf: 'Tähän voi tuoda vain PDF-tiedostoja', invalid: 'Tiedosto ei ole kelvollinen PDF (not a valid PDF)', noText: 'PDF ei sisällä luettavaa tekstiä (esim. skannattu sivu). Luo artikkeli käsin.', reading: 'Luetaan PDF:ää…', parsing: 'Analysoidaan rakennetta…', storing: 'Tallennetaan alkuperäinen PDF…', done: 'Valmis!' },
  sv: { onlyPdf: 'Endast PDF-filer kan importeras här', invalid: 'Filen är inte en giltig PDF (not a valid PDF)', noText: 'PDF:en innehåller ingen läsbar text (t.ex. en skannad sida). Skapa artikeln manuellt i stället.', reading: 'Läser PDF…', parsing: 'Analyserar struktur…', storing: 'Sparar original-PDF…', done: 'Klart!' },
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

function toLines(page: PdfPageText): Line[] {
  const lines: Line[] = []
  const items = page.items.filter((entry) => clean(entry.str)).sort((a, b) => b.y - a.y || a.x - b.x)
  for (const entry of items) {
    const text = clean(entry.str)
    const cell = { x: entry.x, end: entry.x + (entry.width ?? text.length * entry.fontSize * 0.5), text }
    const line = lines.find((candidate) => Math.abs(candidate.y - entry.y) <= LINE_TOLERANCE)
    if (line) {
      line.cells.push(cell)
      line.fontSize = Math.max(line.fontSize, entry.fontSize)
    } else {
      lines.push({ y: entry.y, fontSize: entry.fontSize, cells: [cell] })
    }
  }
  for (const line of lines) {
    line.cells.sort((a, b) => a.x - b.x)
    // pdf.js splits one sentence into several items on font/kerning changes; close items form one cell.
    line.cells = line.cells.reduce<Cell[]>((cells, cell) => {
      const previous = cells[cells.length - 1]
      if (previous && cell.x - previous.end < CELL_GAP) {
        previous.text = `${previous.text} ${cell.text}`
        previous.end = Math.max(previous.end, cell.end)
      } else {
        cells.push({ ...cell })
      }
      return cells
    }, [])
  }
  return lines.sort((a, b) => b.y - a.y)
}

const lineText = (line: Line) => line.cells.map((cell) => cell.text).join(' ')
const normalizeRepeated = (text: string) => text.toLowerCase().replace(/\d+/g, '#')

/** Converts positioned PDF text into sections: larger text becomes headings, multi-column lines become table rows. */
export function buildSectionsFromPdfPages(pages: PdfPageText[], language: GuideLanguage): GuideSection[] {
  const pageLines = pages.map(toLines)
  const counts = new Map<string, number>()
  for (const lines of pageLines) for (const key of new Set(lines.map((line) => normalizeRepeated(lineText(line))))) counts.set(key, (counts.get(key) || 0) + 1)
  const repeatedThreshold = Math.max(2, Math.ceil(pages.length / 2))
  const isRunningText = (line: Line, index: number, lines: Line[]) => {
    const edge = index < 2 || index >= lines.length - 2
    const text = lineText(line)
    return edge && (/^(page|side|sivu|sida)\s*\d+(\s*(of|af|\/)\s*\d+)?$/i.test(text) || (pages.length > 1 && (counts.get(normalizeRepeated(text)) || 0) >= repeatedThreshold))
  }
  const body = pageLines.map((lines) => lines.filter((line, index) => !isRunningText(line, index, lines)))
  const sizes = body.flat().flatMap((line) => line.cells.map(() => line.fontSize)).sort((a, b) => a - b)
  if (sizes.length === 0) return []
  const bodySize = sizes[Math.floor(sizes.length / 2)]

  const sections: GuideSection[] = []
  let section: GuideSection | null = null
  let paragraph: { text: string; y: number } | null = null
  let row: Cell[] | null = null
  const current = (): GuideSection => {
    if (!section) {
      section = { id: newId('sec'), heading: OVERVIEW_HEADING[language], steps: [] }
      sections.push(section)
    }
    return section
  }
  const push = (text: string) => current().steps.push({ id: newId('step'), text, imageIds: [] })
  const flush = () => {
    if (paragraph) push(paragraph.text)
    if (row) push(row.map((cell) => cell.text).join(' | '))
    paragraph = null
    row = null
  }
  const column = (cells: Cell[], x: number) => cells.find((cell) => Math.abs(cell.x - x) <= CELL_GAP)

  for (const lines of body) {
    for (const line of lines) {
      if (line.fontSize >= bodySize * HEADING_RATIO && line.cells.length === 1) {
        flush()
        section = { id: newId('sec'), heading: lineText(line), steps: [] }
        sections.push(section)
        continue
      }
      const openRow: Cell[] | null = row
      // A wrapped table cell: the first column is empty and every fragment lines up with a later column.
      if (openRow && line.cells[0].x > openRow[0].x + CELL_GAP && line.cells.every((cell) => column(openRow.slice(1), cell.x))) {
        for (const cell of line.cells) {
          const target = column(openRow.slice(1), cell.x)!
          target.text = `${target.text} ${cell.text}`
        }
        continue
      }
      if (line.cells.length > 1) {
        flush()
        row = line.cells.map((cell) => ({ ...cell }))
        continue
      }
      const openParagraph: { text: string; y: number } | null = paragraph
      if (openParagraph && openParagraph.y - line.y <= line.fontSize * 1.6) {
        openParagraph.text = `${openParagraph.text} ${lineText(line)}`
        openParagraph.y = line.y
        continue
      }
      flush()
      paragraph = { text: lineText(line), y: line.y }
    }
    // A table may continue on the next page; a paragraph is closed at the page break.
    if (paragraph) {
      push((paragraph as { text: string }).text)
      paragraph = null
    }
  }
  flush()
  return sections
}

async function readPdfPages(data: Uint8Array): Promise<PdfPageText[]> {
  // The worker module registers globalThis.pdfjsWorker, so parsing runs in-process
  // without a worker URL (works in the packaged file:// app and in tests).
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, stopAtErrors: true })
  try {
    const document = await loadingTask.promise
    const pages: PdfPageText[] = []
    for (let number = 1; number <= Math.min(document.numPages, MAX_PAGES); number++) {
      const page = await document.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      pages.push({
        height: viewport.height,
        items: content.items.flatMap((entry) => 'str' in entry && entry.str.trim()
          ? [{ str: entry.str, x: entry.transform[4], y: entry.transform[5], fontSize: Math.hypot(entry.transform[2], entry.transform[3]) || entry.height, width: entry.width }]
          : []),
      })
      page.cleanup()
      await yieldToBrowser()
    }
    return pages
  } finally {
    await loadingTask.destroy()
  }
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
}

const progress = (stage: ImportProgress['stage'], message: string, percent: number): ImportProgress => ({ stage, message, imagesUploaded: 0, imagesTotal: 0, percent })

export async function importGuideFromPdf(file: File, onProgress?: (progress: ImportProgress) => void, options?: { language?: GuideLanguage }): Promise<GuideImportDraft> {
  const messages = MESSAGES[options?.language || 'da']
  if (!/\.pdf$/i.test(file.name)) throw new Error(messages.onlyPdf)
  onProgress?.(progress('reading', messages.reading, 5))
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error(messages.invalid)

  let pages: PdfPageText[]
  try {
    pages = await readPdfPages(bytes.slice())
  } catch (error) {
    console.error('PDF-import kunne ikke læse filen:', error)
    throw new Error(messages.invalid)
  }

  onProgress?.(progress('parsing', messages.parsing, 50))
  const provisional = buildSectionsFromPdfPages(pages, options?.language || 'da')
  if (provisional.length === 0) throw new Error(messages.noText)
  const text = provisional.map((section) => `${section.heading} ${section.steps.map((step) => step.text).join(' ')}`).join(' ')
  const language = detectLanguage(text, options?.language || 'da')
  const sections = language === (options?.language || 'da') ? provisional : buildSectionsFromPdfPages(pages, language)

  onProgress?.(progress('converting', messages.storing, 80))
  const stored: StoredFile = await fileStorage.uploadPdf(new File([bytes], file.name, { type: 'application/pdf' }))
  onProgress?.(progress('done', messages.done, 100))
  return { title: titleFromFilename(file.name) || file.name, language, sections, originalPdf: { url: stored.url, filename: file.name, size: stored.size } }
}
