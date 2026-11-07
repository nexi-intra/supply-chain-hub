// Importerer eksisterende Word-guides (.docx) og konverterer dem til vores
// sektion/trin-model, så de automatisk følger det foruddefinerede layout
// (samme preview og DOCX-generator som alle andre guides). Bruger mammoth.js
// til at konvertere docx -> HTML (overskrifter bevares, billeder inlines som
// base64), som vi derefter parser til GuideSection/GuideStep. Det originale
// dokument gemmes som vedhæftning, så intet går tabt hvis parsingen misser noget.

import mammoth from 'mammoth'
import { fileStorage } from './fileStorage'
import { newId } from './guideTypes'
import type { GuideSection } from './guideTypes'
import { detectLanguage, type GuideLanguage } from './translator'
import { yieldToBrowser } from './utils'
import { validateDocx } from './validateDocx'

export interface GuideImportDraft {
  title: string
  language: GuideLanguage
  sections: GuideSection[]
  originalFile?: File
  preserveWordLayout?: boolean
  /** Already stored original of an imported PDF (Knowledge Base). */
  originalPdf?: { url: string; filename: string; size: number }
}

export type ImportStage = 'reading' | 'converting' | 'parsing' | 'uploading-images' | 'done'

export interface ImportProgress {
  stage: ImportStage
  message: string
  imagesUploaded: number
  imagesTotal: number
  /** 0-100, samlet fremdrift på tværs af alle stadier. */
  percent: number
}

type ProgressCallback = (progress: ImportProgress) => void

// Absolutte procent-checkpoints for de enkelte stadier (monotont stigende).
const STAGE_WEIGHTS: Record<Exclude<ImportStage, 'uploading-images'>, number> = {
  reading: 5,
  converting: 35,
  parsing: 40,
  done: 100,
}
const UPLOAD_STAGE_START = 40
const UPLOAD_STAGE_END = 95

const FALLBACK_HEADING = 'Importeret indhold'

// Appen bygger altid sin egen indholdsfortegnelse ud fra sektionerne. Tager vi
// dokumentets med, staar den samme oversigt to gange - én gang som rigtige trin.
const TOC_HEADING = /^(indholdsfortegnelse|indhold|table of contents|contents|sis[aä]llysluettelo|sis[aä]llys)$/i

/** Er overskriften dokumentets egen indholdsfortegnelse (evt. med nummerering/kolon)? */
export function isTocHeading(heading: string): boolean {
  return TOC_HEADING.test(heading.replace(/^[\d.\s]+/, '').replace(/[:\s]+$/, '').trim())
}

/** Word linker hver post i sin indholdsfortegnelse til et #_Toc-bogmaerke. */
function isTocEntry(el: Element): boolean {
  return el.querySelector('a[href^="#_Toc"]') !== null
}

function dataUriToFile(dataUri: string, filename: string): File | null {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUri)
  if (!match) return null
  const [, mime, base64] = match
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const extension = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  return new File([bytes], `${filename}.${extension}`, { type: mime })
}

// Billeder uploades samtidig (hver upload er en rundtur paa op til 90 s til M:), men hoejst
// saa mange ad gangen, at drevet og hukommelsen ikke overbelastes ved store dokumenter.
const PARALLEL_IMAGE_UPLOADS = 6

/** Unikke billeder (data-URI) fra <img>-elementer, i dokumentraekkefoelge. */
function imageSources(images: HTMLImageElement[]): string[] {
  return images.map((img) => img.getAttribute('src') || '').filter((src) => src.startsWith('data:image/'))
}

/** Uploader alle unikke billeder parallelt; dedupliserer identiske billeder (fx gentagne logoer). Fejlede billeder udelades. */
async function uploadImages(
  sources: string[],
  onProgress?: ProgressCallback,
): Promise<Map<string, string>> {
  const unique = [...new Set(sources)]
  const uploaded = new Map<string, string>()
  const progress = { uploaded: 0, total: unique.length }
  reportUploadProgress(progress, onProgress)
  let next = 0
  const worker = async () => {
    while (next < unique.length) {
      const src = unique[next++]
      const file = dataUriToFile(src, `import-${newId('img')}`)
      if (!file) continue
      try {
        const stored = await fileStorage.uploadImage(file)
        uploaded.set(src, stored.fileId)
      } catch (error) {
        console.error('Kunne ikke uploade billede fra importeret dokument:', error)
      }
      progress.uploaded++
      reportUploadProgress(progress, onProgress)
      // Giv UI'et luft mellem billederne, så appen forbliver klikbar under import af mange/store billeder.
      await yieldToBrowser()
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_IMAGE_UPLOADS, unique.length) }, worker))
  return uploaded
}

function reportUploadProgress(progress: { uploaded: number; total: number }, onProgress?: ProgressCallback) {
  if (!onProgress) return
  const ratio = progress.total > 0 ? progress.uploaded / progress.total : 1
  const percent = UPLOAD_STAGE_START + ratio * (UPLOAD_STAGE_END - UPLOAD_STAGE_START)
  onProgress({
    stage: 'uploading-images',
    message: progress.total > 0 ? `Uploader billede ${progress.uploaded} af ${progress.total}…` : 'Analyserer indhold…',
    imagesUploaded: progress.uploaded,
    imagesTotal: progress.total,
    percent: Math.round(percent),
  })
}

interface PlannedStep { text: string; sources: string[] }
interface PlannedSection { heading: string; steps: PlannedStep[]; implicit: boolean }

/** Parser den konverterede HTML til sektioner/trin ud fra overskrifter, afsnit, lister og tabeller. */
async function buildSectionsFromHtml(html: string, onProgress?: ProgressCallback): Promise<GuideSection[]> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Først struktureres dokumentet (uden netvaerk), derefter uploades alle billeder samtidig,
  // og til sidst bygges sektionerne med de faerdige billed-id'er.
  const planned: PlannedSection[] = []
  let current: PlannedSection | null = null
  let skippingToc = false

  const ensureSection = (keepIfEmpty = false) => {
    if (!current) {
      current = { heading: FALLBACK_HEADING, steps: [], implicit: !keepIfEmpty }
      planned.push(current)
    } else if (keepIfEmpty) {
      current.implicit = false
    }
    return current
  }

  for (const el of Array.from(doc.body.children)) {
    const tag = el.tagName.toLowerCase()

    if (/^h[1-4]$/.test(tag)) {
      const heading = el.textContent?.trim() || ''
      if (heading) {
        if (isTocHeading(heading)) { skippingToc = true; current = null; continue }
        skippingToc = false
        current = { heading, steps: [], implicit: false }
        planned.push(current)
      }
      continue
    }

    // Alt mellem "Indholdsfortegnelse" og naeste overskrift er selve listen.
    if (skippingToc || isTocEntry(el)) continue

    if (tag === 'p') {
      const text = el.textContent?.trim() || ''
      const sources = imageSources(Array.from(el.querySelectorAll('img')))
      if (!text && sources.length === 0) continue
      ensureSection().steps.push({ text, sources })
      continue
    }

    if (tag === 'ul' || tag === 'ol') {
      const section = ensureSection(true)
      for (const li of Array.from(el.children)) {
        const text = li.textContent?.trim() || ''
        const sources = imageSources(Array.from(li.querySelectorAll('img')))
        if (!text && sources.length === 0) continue
        section.steps.push({ text, sources })
      }
      continue
    }

    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'))
        .map((tr) => Array.from(tr.querySelectorAll('td,th')).map((cell) => cell.textContent?.trim() || '').join(' | '))
        .filter(Boolean)
      if (rows.length > 0) {
        ensureSection(true).steps.push({ text: rows.join('\n'), sources: [] })
      }
      continue
    }

    // Andre blokke (fx billede-wrapper uden <p>): tag billeder med hvis der er nogen.
    const looseSources = imageSources(Array.from(el.querySelectorAll('img')))
    if (looseSources.length > 0) {
      ensureSection().steps.push({ text: '', sources: looseSources })
    }
  }

  const uploaded = await uploadImages(planned.flatMap((section) => section.steps.flatMap((step) => step.sources)), onProgress)

  const sections: GuideSection[] = []
  for (const section of planned) {
    const steps = section.steps
      .map((step) => ({ id: newId('step'), text: step.text, imageIds: step.sources.flatMap((src) => uploaded.get(src) ?? []) }))
      .filter((step) => step.text || step.imageIds.length > 0)
    // Et afsnit oprettet alene for billeder, der alle fejlede, efterlades ikke som tomt afsnit.
    if (section.implicit && steps.length === 0) continue
    sections.push({ id: newId('sec'), heading: section.heading, steps })
  }
  return sections
}
/** Fjerner filtypen og erstatter understreger/bindestreger med mellemrum til et pænere gæt på titlen. */
function titleFromFilename(filename: string): string {
  return filename.replace(/\.(docx?|DOCX?)$/, '').replace(/[_-]+/g, ' ').trim() || 'Importeret guide'
}

/** Konverterer en uploadet .docx-fil til et redigerbart guide-udkast (sektioner/trin + sprog). */
export async function importGuideFromDocx(file: File, onProgress?: ProgressCallback, options?: { preserveOriginal?: boolean; language?: GuideLanguage }): Promise<GuideImportDraft> {
  if (!file.name.match(/\.docx$/i)) {
    throw new Error('Kun .docx-filer kan importeres (gamle .doc-filer understøttes ikke)')
  }

  if (options?.preserveOriginal) {
    await validateDocx(file)
    onProgress?.({ stage: 'done', message: 'Færdig!', imagesUploaded: 0, imagesTotal: 0, percent: STAGE_WEIGHTS.done })
    return { title: titleFromFilename(file.name), language: options.language || 'da', sections: [], originalFile: file, preserveWordLayout: true }
  }

  onProgress?.({ stage: 'reading', message: 'Læser dokument…', imagesUploaded: 0, imagesTotal: 0, percent: STAGE_WEIGHTS.reading })
  const arrayBuffer = await file.arrayBuffer()
  await yieldToBrowser()

  onProgress?.({ stage: 'converting', message: 'Konverterer indhold…', imagesUploaded: 0, imagesTotal: 0, percent: STAGE_WEIGHTS.converting })
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
  await yieldToBrowser()

  onProgress?.({ stage: 'parsing', message: 'Analyserer struktur…', imagesUploaded: 0, imagesTotal: 0, percent: STAGE_WEIGHTS.parsing })
  let sections = await buildSectionsFromHtml(html, onProgress)

  if (sections.length === 0) {
    const { value: rawText } = await mammoth.extractRawText({ arrayBuffer })
    const text = rawText.trim()
    if (text) {
      sections = [{ id: newId('sec'), heading: FALLBACK_HEADING, steps: [{ id: newId('step'), text, imageIds: [] }] }]
    }
  }

  const combinedText = sections.map((s) => `${s.heading} ${s.steps.map((st) => st.text).join(' ')}`).join(' ')
  const language = detectLanguage(combinedText, 'da')

  onProgress?.({ stage: 'done', message: 'Færdig!', imagesUploaded: 0, imagesTotal: 0, percent: STAGE_WEIGHTS.done })

  return {
    title: titleFromFilename(file.name),
    language,
    sections,
    originalFile: file,
  }
}
