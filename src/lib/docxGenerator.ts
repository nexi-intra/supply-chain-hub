// DOCX-generator efter DESK3500-template-spec (se plans/guide-library-2.0.md):
// A4, 1,27 cm marginer, Calibri/Calibri Light, TOC-felt på side 1, centreret
// forsidebillede, sektioner "1.0" (Heading3, #1F3763), trin "X.Y" via ét
// multilevel-nummereringsformat, header m. logo/forfatter/titel/version,
// sidetal i footer (tilføjelse ift. template, jf. krav) og updateFields så
// Word selv beregner indholdsfortegnelsens sidetal ved åbning.

import {
  AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat,
  PageBreak, PageNumber, Packer, Paragraph, TabStopType, TableOfContents, TextRun,
} from 'docx'
import { fileStorage } from './fileStorage'
import type { DocModel } from './docModel'
import headerLogoUrl from '@/assets/images/docx/header-logo.png'

const PAGE_WIDTH_TWIP = 11906
const PAGE_HEIGHT_TWIP = 16838
const MARGIN_TWIP = 720
// Brugbar bredde i punkter (twip/20) til at skalere billeder.
const USABLE_WIDTH_PT = (PAGE_WIDTH_TWIP - 2 * MARGIN_TWIP) / 20
const MAX_IMAGE_WIDTH_PX = Math.floor((USABLE_WIDTH_PT * 96) / 72)
const MAX_COVER_HEIGHT_PX = 540
const HEADING_COLOR = '1F3763'
const NUMBERING_REF = 'guide-steps'

interface LoadedImage {
  data: Uint8Array
  width: number
  height: number
  type: 'png' | 'jpg' | 'gif' | 'bmp'
}

async function loadStoredImage(imageId: string, maxWidthPx: number, maxHeightPx?: number): Promise<LoadedImage | null> {
  try {
    const blob = await fileStorage.downloadFile(`kv://${imageId}`)
    const bitmap = await createImageBitmap(blob)
    let { width, height } = bitmap
    bitmap.close()

    const widthScale = width > maxWidthPx ? maxWidthPx / width : 1
    const heightScale = maxHeightPx && height > maxHeightPx ? maxHeightPx / height : 1
    const scale = Math.min(widthScale, heightScale)
    width = Math.round(width * scale)
    height = Math.round(height * scale)

    const mime = blob.type
    const type: LoadedImage['type'] = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
      : mime.includes('gif') ? 'gif'
      : mime.includes('bmp') ? 'bmp'
      : 'png'

    return { data: new Uint8Array(await blob.arrayBuffer()), width, height, type }
  } catch (error) {
    console.error(`Kunne ikke indlæse billede ${imageId} til DOCX:`, error)
    return null
  }
}

async function loadHeaderLogo(): Promise<LoadedImage | null> {
  try {
    const response = await fetch(headerLogoUrl)
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)
    // Logo skaleres til ~24 px højde som i templatens header.
    const targetHeight = 24
    const width = Math.round((bitmap.width / bitmap.height) * targetHeight)
    const height = targetHeight
    bitmap.close()
    return { data: new Uint8Array(await blob.arrayBuffer()), width, height, type: 'png' }
  } catch (error) {
    console.error('Kunne ikke indlæse header-logo:', error)
    return null
  }
}

function imageParagraph(image: LoadedImage, alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.CENTER): Paragraph {
  return new Paragraph({
    alignment,
    spacing: { before: 120, after: 120 },
    children: [
      new ImageRun({
        data: image.data as unknown as ArrayBuffer,
        transformation: { width: image.width, height: image.height },
        type: image.type,
      }),
    ],
  })
}

/** Genererer guiden som DOCX-blob efter den fælles dokumentmodel. */
export async function generateGuideDocx(model: DocModel, authorName: string): Promise<Blob> {
  const logo = await loadHeaderLogo()

  const bodyChildren: Paragraph[] = []

  // Side 1: indholdsfortegnelse + forsidebillede (som templaten).
  const tocHeading = new Paragraph({
    children: [new TextRun({ text: 'Indholdsfortegnelse', bold: true, size: 32, font: 'Calibri Light', color: HEADING_COLOR })],
    spacing: { after: 240 },
  })

  const coverChildren: Paragraph[] = []
  if (model.coverImageId) {
    const cover = await loadStoredImage(model.coverImageId, MAX_IMAGE_WIDTH_PX - 120, MAX_COVER_HEIGHT_PX)
    if (cover) coverChildren.push(imageParagraph(cover))
  }
  coverChildren.push(new Paragraph({ children: [new PageBreak()] }))

  // Sektioner + trin.
  for (const section of model.sections) {
    bodyChildren.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      numbering: { reference: NUMBERING_REF, level: 0 },
      children: [new TextRun({ text: ` ${section.heading}`, font: 'Calibri Light', size: 24, color: HEADING_COLOR })],
      spacing: { before: 240, after: 80 },
      keepNext: true,
    }))

    for (const step of section.steps) {
      if (step.text) {
        bodyChildren.push(new Paragraph({
          numbering: { reference: NUMBERING_REF, level: 1 },
          children: [new TextRun({ text: ` ${step.text}`, font: 'Calibri', size: 22 })],
          spacing: { after: 60 },
        }))
      }
      for (const imageId of step.imageIds) {
        const image = await loadStoredImage(imageId, MAX_IMAGE_WIDTH_PX - 120)
        if (image) bodyChildren.push(imageParagraph(image))
      }
    }
  }

  const headerParagraphs: Paragraph[] = []
  if (logo) {
    headerParagraphs.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new ImageRun({
          data: logo.data as unknown as ArrayBuffer,
          transformation: { width: logo.width, height: logo.height },
          type: logo.type,
        }),
      ],
      spacing: { after: 40 },
    }))
  }
  headerParagraphs.push(new Paragraph({
    children: [new TextRun({ text: authorName, font: 'Calibri', size: 18 })],
    spacing: { after: 0 },
  }))
  headerParagraphs.push(new Paragraph({
    children: [
      new TextRun({ text: `${model.title}, Merchant Services `, font: 'Calibri', size: 18 }),
      new TextRun({ text: `Version ${model.version}`, font: 'Calibri', size: 18, bold: true }),
    ],
    spacing: { after: 0 },
    border: { bottom: { style: 'single', size: 4, color: 'D0D0D0', space: 2 } },
  }))

  const pageFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ children: ['Side ', PageNumber.CURRENT, ' af ', PageNumber.TOTAL_PAGES], font: 'Calibri', size: 18, color: '808080' }),
        ],
      }),
    ],
  })

  const doc = new Document({
    creator: authorName,
    title: model.title,
    description: `${model.category} · Version ${model.version}`,
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    numbering: {
      config: [
        {
          reference: NUMBERING_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.0',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } }, run: { font: 'Calibri Light', size: 24, color: HEADING_COLOR, bold: true } },
            },
            {
              level: 1,
              format: LevelFormat.DECIMAL,
              text: '%1.%2',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIP, height: PAGE_HEIGHT_TWIP },
            margin: { top: MARGIN_TWIP, right: MARGIN_TWIP, bottom: MARGIN_TWIP, left: MARGIN_TWIP, header: 708, footer: 708 },
          },
          titlePage: true,
        },
        headers: {
          default: new Header({ children: headerParagraphs }),
          first: new Header({ children: [new Paragraph({ text: '' })] }),
        },
        footers: {
          default: pageFooter,
          first: new Footer({ children: [new Paragraph({ text: '' })] }),
        },
        children: [
          tocHeading,
          new TableOfContents('Indholdsfortegnelse', {
            hyperlink: true,
            headingStyleRange: '1-3',
          }),
          ...coverChildren,
          ...bodyChildren,
        ],
      },
    ],
  })

  return Packer.toBlob(doc)
}

/** Filnavn efter konventionen "<Titel> vX.XX.docx" (uden ulovlige filsystem-tegn). */
export function guideDocxFileName(model: DocModel): string {
  const safeTitle = model.title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Guide'
  return `${safeTitle} v${model.version}.docx`
}
