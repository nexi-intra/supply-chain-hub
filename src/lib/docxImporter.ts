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

export interface GuideImportDraft {
  title: string
  language: GuideLanguage
  sections: GuideSection[]
  originalFile: File
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

/** Uploader <img>-elementers base64-data til fileStorage; dedupliserer identiske billeder (fx gentagne logoer). */
async function uploadImages(
  images: HTMLImageElement[],
  cache: Map<string, string>,
  progress: { uploaded: number; total: number },
  onProgress?: ProgressCallback,
): Promise<string[]> {
  const ids: string[] = []
  for (const img of images) {
    const src = img.getAttribute('src') || ''
    if (!src.startsWith('data:image/')) continue
    const cached = cache.get(src)
    if (cached) { ids.push(cached); continue }
    const file = dataUriToFile(src, `import-${newId('img')}`)
    if (!file) continue
    try {
      const stored = await fileStorage.uploadImage(file)
      cache.set(src, stored.fileId)
      ids.push(stored.fileId)
      progress.uploaded++
      reportUploadProgress(progress, onProgress)
      // Giv UI'et luft mellem hvert billede, så appen forbliver klikbar under import af mange/store billeder.
      await yieldToBrowser()
    } catch (error) {
      console.error('Kunne ikke uploade billede fra importeret dokument:', error)
    }
  }
  return ids
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

/** Parser den konverterede HTML til sektioner/trin ud fra overskrifter, afsnit, lister og tabeller. */
async function buildSectionsFromHtml(html: string, onProgress?: ProgressCallback): Promise<GuideSection[]> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const imageCache = new Map<string, string>()
  const sections: GuideSection[] = []
  let current: GuideSection | null = null

  const totalImages = doc.body.querySelectorAll('img').length
  const progress = { uploaded: 0, total: totalImages }
  reportUploadProgress(progress, onProgress)

  const ensureSection = () => {
    if (!current) {
      current = { id: newId('sec'), heading: FALLBACK_HEADING, steps: [] }
      sections.push(current)
    }
    return current
  }

  for (const el of Array.from(doc.body.children)) {
    const tag = el.tagName.toLowerCase()

    if (/^h[1-4]$/.test(tag)) {
      const heading = el.textContent?.trim() || ''
      if (heading) {
        current = { id: newId('sec'), heading, steps: [] }
        sections.push(current)
      }
      continue
    }

    if (tag === 'p') {
      const text = el.textContent?.trim() || ''
      const imageIds = await uploadImages(Array.from(el.querySelectorAll('img')), imageCache, progress, onProgress)
      if (!text && imageIds.length === 0) continue
      ensureSection().steps.push({ id: newId('step'), text, imageIds })
      continue
    }

    if (tag === 'ul' || tag === 'ol') {
      const section = ensureSection()
      for (const li of Array.from(el.children)) {
        const text = li.textContent?.trim() || ''
        const imageIds = await uploadImages(Array.from(li.querySelectorAll('img')), imageCache, progress, onProgress)
        if (!text && imageIds.length === 0) continue
        section.steps.push({ id: newId('step'), text, imageIds })
      }
      continue
    }

    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'))
        .map((tr) => Array.from(tr.querySelectorAll('td,th')).map((cell) => cell.textContent?.trim() || '').join(' | '))
        .filter(Boolean)
      if (rows.length > 0) {
        ensureSection().steps.push({ id: newId('step'), text: rows.join('\n'), imageIds: [] })
      }
      continue
    }

    // Andre blokke (fx billede-wrapper uden <p>): tag billeder med hvis der er nogen.
    const looseImages = await uploadImages(Array.from(el.querySelectorAll('img')), imageCache, progress, onProgress)
    if (looseImages.length > 0) {
      ensureSection().steps.push({ id: newId('step'), text: '', imageIds: looseImages })
    }
  }

  return sections
}

/** Fjerner filtypen og erstatter understreger/bindestreger med mellemrum til et pænere gæt på titlen. */
function titleFromFilename(filename: string): string {
  return filename.replace(/\.(docx?|DOCX?)$/, '').replace(/[_-]+/g, ' ').trim() || 'Importeret guide'
}

/** Konverterer en uploadet .docx-fil til et redigerbart guide-udkast (sektioner/trin + sprog). */
export async function importGuideFromDocx(file: File, onProgress?: ProgressCallback): Promise<GuideImportDraft> {
  if (!file.name.match(/\.docx$/i)) {
    throw new Error('Kun .docx-filer kan importeres (gamle .doc-filer understøttes ikke)')
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
