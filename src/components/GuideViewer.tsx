import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DownloadSimple, FileDoc, Timer, Image as ImageIcon, FileArrowDown, FolderOpen, PencilSimple } from '@phosphor-icons/react'
import { Guide } from '@/lib/types'
import { getReviewStatus, REVIEW_INTERVAL_CHOICES, guidePlainText } from '@/lib/guideTypes'
import { guideToDocModel, resolveAuthorName, type DocModel } from '@/lib/docModel'
import { detectLanguage, translateTextAsync, type GuideLanguage, type TranslationEngine } from '@/lib/translator'
import { isExportAvailable, getExportRoot, chooseAndSaveExportRoot, exportGuideToLibrary, exportOriginalGuideToLibrary } from '@/lib/guideExporter'
import { fileStorage } from '@/lib/fileStorage'
import { linkifyText } from '@/lib/linkify'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import headerLogoUrl from '@/assets/images/docx/header-logo.png'
import { useLanguage } from '@/contexts/LanguageContext'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  setTimeout(() => {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, 100)
}

interface GuideViewerProps {
  guide: Guide | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (guide: Guide) => void
  /** Optional reader for guides opened from another team's read-only storage. */
  fileLoader?: (fileUrl: string) => Promise<Blob>
  /** Source reference from the assistant, e.g. 2.3 (same version only). */
  targetReference?: string
}

const categoryColors: Record<string, string> = {
  Procedures: 'bg-primary/10 text-primary border-primary/20',
  Technical: 'bg-accent/10 text-accent-foreground border-accent/20',
  HR: 'bg-secondary/20 text-secondary-foreground border-secondary/30',
  Safety: 'bg-destructive/10 text-destructive border-destructive/20',
  General: 'bg-muted text-muted-foreground border-border',
}

/** Billede i preview — loader objekt-URL fra chunked KV. */
function StepImage({ imageId, className, fileLoader }: { imageId: string; className?: string; fileLoader?: (fileUrl: string) => Promise<Blob> }) {
  const { t } = useLanguage()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    const load = fileLoader
      ? fileLoader(`kv://${imageId}`).then((blob) => URL.createObjectURL(blob))
      : fileStorage.getImageObjectUrl(imageId)
    load.then((u) => {
      if (fileLoader) createdUrl = u
      if (!cancelled) setUrl(u)
    })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [imageId, fileLoader])

  if (failed) {
    return (
      <div className="h-24 rounded border bg-gray-100 flex items-center justify-center px-4 gap-2 text-gray-400">
        <ImageIcon size={20} />
        <span className="text-xs">{t.guideViewer.imageLoadFailed}</span>
      </div>
    )
  }
  if (!url) {
    return <div className="h-24 w-32 rounded border bg-gray-100 animate-pulse" />
  }
  return <img src={url} alt="" className={cn('max-h-96 rounded border border-gray-200 shadow-sm object-contain mx-auto', className)} />
}

export function GuideViewer({ guide, open, onOpenChange, onEdit, fileLoader, targetReference }: GuideViewerProps) {
  const { t, language: appLanguage } = useLanguage()
  const [authorName, setAuthorName] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isOpeningInWord, setIsOpeningInWord] = useState(false)
  const [viewLanguage, setViewLanguage] = useState<GuideLanguage | null>(null)
  // "Original formatering"-visning (Fase 2, guide-library-cross-team-links-format.md): viser den
  // vedhæftede originale Word-fils rige HTML (fed/kursiv/tabeller bevaret) i stedet for den flade
  // sektions/trin-visning. Kun relevant når guiden HAR både sektioner og en vedhæftet original.
  const [viewMode, setViewMode] = useState<'sections' | 'original' | 'file'>('sections')
  const [originalHtml, setOriginalHtml] = useState<string | null>(null)
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null)
  useEffect(() => {
    if (!open || !targetReference || !/^\d+\.\d+$/.test(targetReference)) return
    if (!guide?.preserveWordLayout) setViewMode('sections')
    const timer = setTimeout(() => {
      document.querySelector(`[data-guide-step="${targetReference}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 350)
    return () => clearTimeout(timer)
  }, [open, guide?.id, guide?.preserveWordLayout, targetReference])

  const guideLanguage: GuideLanguage = useMemo(
    () => guide?.language || (guide ? detectLanguage(guidePlainText(guide), 'da') : 'da'),
    [guide]
  )
  const languageLabel = (language: GuideLanguage) => ({
    da: t.guideEditor.languageDanish,
    en: t.guideEditor.languageEnglish,
    fi: t.guideEditor.languageFinnish,
  })[language]

  useEffect(() => {
    setViewLanguage(null)
    setViewMode(guide?.preserveWordLayout ? 'file' : 'sections')
    setOriginalHtml(null)
  }, [guide?.id, guide?.fileUrl, guide?.preserveWordLayout])

  const baseModel = useMemo(() => (guide ? guideToDocModel(guide) : null), [guide])

  const isTranslated = viewLanguage !== null && viewLanguage !== guideLanguage

  // Oversat model bygges async: Bergamot (neural) hvis modeller findes, ellers ordbog.
  const [translatedModel, setTranslatedModel] = useState<DocModel | null>(null)
  const [translationEngine, setTranslationEngine] = useState<TranslationEngine>('dictionary')
  const [isTranslating, setIsTranslating] = useState(false)

  useEffect(() => {
    if (!baseModel || !isTranslated || !viewLanguage) {
      setTranslatedModel(null)
      return
    }
    let cancelled = false
    setIsTranslating(true)
    const run = async () => {
      try {
        const engines = new Set<TranslationEngine>()
        const translate = async (text: string) => {
          const result = await translateTextAsync(text, guideLanguage, viewLanguage)
          engines.add(result.engine)
          return result.text
        }
        const title = await translate(baseModel.title)
        const sections: DocModel['sections'] = []
        for (const section of baseModel.sections) {
          const heading = await translate(section.heading)
          const steps: DocModel['sections'][number]['steps'] = []
          for (const step of section.steps) {
            steps.push({ ...step, text: step.text ? await translate(step.text) : step.text })
          }
          sections.push({ ...section, heading, steps })
        }
        if (cancelled) return
        setTranslatedModel({ ...baseModel, title, sections })
        setTranslationEngine(engines.has('neural') ? 'neural' : 'dictionary')
      } catch (error) {
        console.error('Oversættelse af guide fejlede:', error)
        if (!cancelled) setTranslatedModel(null)
      } finally {
        if (!cancelled) setIsTranslating(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [baseModel, isTranslated, viewLanguage, guideLanguage])

  const model = isTranslated ? (translatedModel ?? baseModel) : baseModel

  useEffect(() => {
    if (!model?.authorEmail) { setAuthorName(''); return }
    let cancelled = false
    resolveAuthorName(model.authorEmail).then((name) => { if (!cancelled) setAuthorName(name) })
    return () => { cancelled = true }
  }, [model?.authorEmail])

  const handleDownloadDocx = async () => {
    if (!model) return
    setIsGenerating(true)
    try {
      // docx-pakken (~350 KB) hentes først når der faktisk genereres.
      const { guideDocxFileName } = await import('@/lib/docxGenerator')
      const blob = guide?.preserveWordLayout && hasOriginalFile
        ? await getAttachedWordBlob()
        : await (await import('@/lib/docxGenerator')).generateGuideDocx(model, authorName || model.authorEmail, fileLoader)
      downloadBlob(blob, guide?.preserveWordLayout && guide.wordFileName || guideDocxFileName(model))
      toast.success(t.guideViewer.docxGenerated)
    } catch (error) {
      console.error('DOCX-generering fejlede:', error)
      toast.error(t.guideViewer.docxGenerationFailed)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleExportToLibrary = async () => {
    if (!model) return
    setIsExporting(true)
    try {
      let root = await getExportRoot()
      if (!root) {
        root = await chooseAndSaveExportRoot()
        if (!root) return
      }
      const filePath = guide?.preserveWordLayout
        ? await exportOriginalGuideToLibrary(guide, root)
        : await exportGuideToLibrary(model, authorName || model.authorEmail, root)
      toast.success(`${t.guideViewer.exportedToPrefix} ${filePath}`)
    } catch (error) {
      console.error('Eksport fejlede:', error)
      toast.error(error instanceof Error ? error.message : t.guideViewer.exportFailed)
    } finally {
      setIsExporting(false)
    }
  }

  // Henter den vedhæftede originale Word-fil som en Blob — delt af download-knappen og
  // "Original formatering"-visningen (Fase 2). Kaster hvis intet er vedhæftet.
  const getAttachedWordBlob = async (): Promise<Blob> => {
    if (guide?.fileUrl) {
      return fileLoader ? fileLoader(guide.fileUrl) : fileStorage.downloadFile(guide.fileUrl)
    }
    if (guide?.wordFileData) {
      const binaryString = atob(guide.wordFileData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      return new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
    }
    throw new Error('no-word-file-attached')
  }

  const handleDownload = async () => {
    if (!guide?.wordFileName) {
      toast.error(t.guideViewer.wordFileUnavailable)
      return
    }

    try {
      const blob = await getAttachedWordBlob()
      downloadBlob(blob, guide.wordFileName)
      toast.success(t.guideViewer.wordFileDownloaded)
    } catch (error) {
      console.error('Error downloading Word file:', error)
      toast.error(t.guideViewer.wordDownloadFailed)
    }
  }

  const handleOpenInWord = async () => {
    if (!guide?.wordFileName || !window.electronGuides?.openInWord) return
    setIsOpeningInWord(true)
    try {
      const blob = await getAttachedWordBlob()
      await window.electronGuides.openInWord({ fileName: guide.wordFileName, data: await blob.arrayBuffer() })
    } catch (error) {
      console.error('Kunne ikke aabne guide i Word:', error)
      toast.error(error instanceof Error ? error.message : t.guideViewer.wordDownloadFailed)
    } finally {
      setIsOpeningInWord(false)
    }
  }

  const hasOriginalFile = Boolean(guide?.fileUrl || guide?.wordFileData)

  useEffect(() => {
    if (!open || viewMode !== 'file' || !guide?.preserveWordLayout || !hasOriginalFile) return
    let cancelled = false
    let objectUrl: string | null = null
    setPdfPreviewUrl(null)
    setPdfPreviewError(null)
    const load = async () => {
      let blob: Blob
      if (guide.previewPdfUrl) {
        blob = fileLoader ? await fileLoader(guide.previewPdfUrl) : await fileStorage.downloadFile(guide.previewPdfUrl)
      } else {
        if (!window.electronGuides?.renderPdf) throw new Error('PDF-visning er ikke tilgængelig på denne computer')
        const docx = await getAttachedWordBlob()
        const pdf = await window.electronGuides.renderPdf({ data: await docx.arrayBuffer() })
        blob = new Blob([pdf], { type: 'application/pdf' })
      }
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }))
      setPdfPreviewUrl(objectUrl)
    }
    void load().catch((error) => { if (!cancelled) setPdfPreviewError(error instanceof Error ? error.message : t.guideViewer.originalFormatFailed) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, viewMode, guide?.id, guide?.fileUrl, guide?.wordFileData, guide?.previewPdfUrl, guide?.preserveWordLayout, hasOriginalFile, fileLoader, t.guideViewer.originalFormatFailed])

  useEffect(() => {
    if (viewMode !== 'original' || !hasOriginalFile || originalHtml !== null) return
    let cancelled = false
    setIsLoadingOriginal(true)
    const run = async () => {
      try {
        const blob = await getAttachedWordBlob()
        const arrayBuffer = await blob.arrayBuffer()
        // mammoth (~250 KB) hentes først når brugeren faktisk beder om original formatering.
        const mammoth = (await import('mammoth')).default
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
        if (cancelled) return
        setOriginalHtml(sanitizeHtml(html))
      } catch (error) {
        console.error('Kunne ikke indlæse original formatering:', error)
        if (!cancelled) {
          toast.error(t.guideViewer.originalFormatFailed)
          if (guide?.preserveWordLayout) setOriginalHtml('')
          else setViewMode('sections')
        }
      } finally {
        if (!cancelled) setIsLoadingOriginal(false)
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, hasOriginalFile, originalHtml, guide?.id])

  if (!guide || !model) return null

  const hasSections = model.sections.length > 0
  const reviewStatus = getReviewStatus(guide)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] xl:max-w-[1400px] w-[96vw] h-[94vh] max-h-[94vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-border">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-start justify-between gap-2 mb-3">
                <DialogTitle className="text-xl sm:text-2xl break-words pr-2">
                  {guide.title}
                </DialogTitle>
                <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                  <kbd className="px-2 py-1 bg-muted rounded border border-border font-mono text-xs">ESC</kbd>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={cn('text-xs font-medium', categoryColors[guide.category])}
                >
                  {guide.category}
                </Badge>
                {guide.version && (
                  <Badge variant="secondary" className="text-xs font-mono">v{guide.version}</Badge>
                )}
                {guide.reviewIntervalMonths ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-medium gap-1',
                      reviewStatus === 'overdue' && 'bg-destructive/10 text-destructive border-destructive/30',
                      reviewStatus === 'due-soon' && 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
                    )}
                  >
                    <Timer size={12} />
                    {reviewStatus === 'overdue'
                      ? t.guideCard.overdueBadge
                      : guide.nextReviewAt
                        ? `${t.guideCard.dueSoonPrefix} ${new Date(guide.nextReviewAt).toLocaleDateString(appLanguage === 'en' ? 'en-US' : appLanguage === 'fi' ? 'fi-FI' : 'da-DK')}`
                        : REVIEW_INTERVAL_CHOICES.find((c) => c.value === guide.reviewIntervalMonths)?.label}
                  </Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {t.guideViewer.updatedPrefix}: {new Date(guide.updatedAt).toLocaleDateString(appLanguage === 'en' ? 'en-US' : appLanguage === 'fi' ? 'fi-FI' : 'da-DK', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
              {guide.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {guide.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    onEdit(guide)
                  }}
                  className="w-full sm:w-auto gap-2"
                >
                  <PencilSimple size={16} weight="bold" />
                  {t.guideViewer.edit}
                </Button>
              )}
              {guide.preserveWordLayout && hasOriginalFile && (
                <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-muted/40 self-stretch sm:self-end">
                  <Button variant={viewMode === 'file' ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5 text-xs flex-1" onClick={() => setViewMode('file')}>
                    {t.guideViewer.originalFileTab}
                  </Button>
                  <Button variant={viewMode === 'original' ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5 text-xs flex-1" onClick={() => setViewMode('original')}>
                    {t.guideViewer.originalFormatTab}
                  </Button>
                </div>
              )}
              {!guide.preserveWordLayout && hasSections && hasOriginalFile && (
                <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-muted/40 self-stretch sm:self-end">
                  <Button
                    variant={viewMode === 'sections' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2.5 text-xs flex-1"
                    onClick={() => setViewMode('sections')}
                  >
                    {t.guideViewer.editableViewTab}
                  </Button>
                  <Button
                    variant={viewMode === 'original' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2.5 text-xs flex-1"
                    onClick={() => setViewMode('original')}
                  >
                    {t.guideViewer.originalFormatTab}
                  </Button>
                </div>
              )}
              {hasSections && (
                <div className="flex flex-wrap items-center gap-1 rounded-lg border p-0.5 bg-muted/40 self-stretch sm:self-end">
                  {(['da', 'en', 'fi'] as GuideLanguage[]).map((targetLanguage) => (
                    <Button
                      key={targetLanguage}
                      variant={targetLanguage === guideLanguage ? (!isTranslated ? 'default' : 'ghost') : (viewLanguage === targetLanguage ? 'default' : 'ghost')}
                      size="sm"
                      className="h-7 px-2.5 text-xs flex-1"
                      onClick={() => setViewLanguage(targetLanguage === guideLanguage ? null : targetLanguage)}
                    >
                      {languageLabel(targetLanguage)}{targetLanguage === guideLanguage ? ` (${t.guideViewer.originalSuffix})` : ''}
                    </Button>
                  ))}
                </div>
              )}
              {hasSections && isTranslated && (
                <p
                  className={cn(
                    'text-xs font-medium text-center sm:text-right px-1.5 py-0.5 rounded',
                    isTranslating
                      ? 'text-muted-foreground'
                      : translationEngine === 'neural'
                        ? 'text-emerald-700 bg-emerald-50'
                        : 'text-amber-700 bg-amber-50',
                  )}
                >
                  {isTranslating
                    ? t.guideViewer.translating
                    : translationEngine === 'neural'
                      ? `${t.guideViewer.neuralTranslationPrefix} ${languageLabel(guideLanguage).toLowerCase()}`
                      : `${t.guideViewer.dictionaryTranslationPrefix} ${languageLabel(guideLanguage).toLowerCase()}`}
                </p>
              )}
              {(hasSections || guide.preserveWordLayout && hasOriginalFile) && (
                <Button
                  size="sm"
                  onClick={handleDownloadDocx}
                  disabled={isGenerating}
                  className="w-full sm:w-auto gap-2"
                >
                  <FileArrowDown size={16} weight="bold" />
                  {isGenerating ? t.guideViewer.generating : t.guideViewer.downloadDocx}
                </Button>
              )}
              {(hasSections || guide.preserveWordLayout && hasOriginalFile) && !fileLoader && isExportAvailable() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToLibrary}
                  disabled={isExporting}
                  className="w-full sm:w-auto gap-2"
                >
                  <FolderOpen size={16} weight="regular" />
                  {isExporting ? t.guideViewer.exporting : t.guideViewer.exportToLibrary}
                </Button>
              )}
              {(guide.fileUrl || guide.wordFileData) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="w-full sm:w-auto gap-2"
                >
                  <DownloadSimple size={16} weight="regular" />
                  {t.guideViewer.attachedWord}
                </Button>
              )}
              {guide.preserveWordLayout && hasOriginalFile && window.electronGuides?.openInWord && (
                <Button variant="outline" size="sm" onClick={handleOpenInWord} disabled={isOpeningInWord} className="w-full sm:w-auto gap-2">
                  <FileDoc size={16} />
                  {t.guideViewer.openInWord}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 py-4 sm:py-6 bg-muted/40">
          {viewMode === 'file' && guide.preserveWordLayout && hasOriginalFile ? (
            <div className="mx-auto h-full min-h-[65vh] max-w-[1200px]">
              {pdfPreviewUrl ? (
                <iframe src={pdfPreviewUrl} title={guide.title} className="h-full min-h-[65vh] w-full border-0 bg-white" />
              ) : (
                <div className="flex min-h-[65vh] flex-col items-center justify-center gap-4 text-center">
                  <FileDoc size={48} className="text-primary" />
                  <p className="text-sm text-muted-foreground">{pdfPreviewError || t.guideViewer.loadingOriginalFormat}</p>
                  {pdfPreviewError && <Button onClick={window.electronGuides?.openInWord ? handleOpenInWord : handleDownload} disabled={isOpeningInWord} className="gap-2">
                    <FileDoc size={18} />{window.electronGuides?.openInWord ? t.guideViewer.openInWord : t.guideViewer.downloadWordDocument}
                  </Button>}
                </div>
              )}
            </div>
          ) : viewMode === 'original' && hasOriginalFile ? (
            <div className="max-w-[1000px] mx-auto">
              {guide.preserveWordLayout && <p className="text-sm text-muted-foreground mb-3">{t.guideViewer.simplifiedPreviewHint}</p>}
              <div className="bg-white text-gray-900 rounded-sm shadow-xl border border-gray-300 overflow-hidden px-10 py-8">
              {isLoadingOriginal || originalHtml === null ? (
                <p className="text-sm text-muted-foreground text-center py-12">{t.guideViewer.loadingOriginalFormat}</p>
              ) : originalHtml === '' ? (
                <p className="text-sm text-destructive text-center py-12">{t.guideViewer.originalFormatFailed}</p>
              ) : (
                <div
                  className="docx-original-preview text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-bold [&_h1]:mb-3 [&_h2]:mb-3 [&_h3]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_ul]:mb-3 [&_ol]:mb-3 [&_table]:border-collapse [&_table]:w-full [&_table]:mb-4 [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_img]:max-w-full [&_a]:text-primary [&_a]:underline"
                  style={{ fontFamily: 'Calibri, sans-serif' }}
                  dangerouslySetInnerHTML={{ __html: originalHtml }}
                />
              )}
              </div>
            </div>
          ) : hasSections ? (
            // A4-lignende ark der spejler den genererede DOCX (lys uanset tema, som Word).
            <div className="max-w-[1000px] mx-auto bg-white text-gray-900 rounded-sm shadow-xl border border-gray-300 overflow-hidden">
              <div className="px-10 pt-6 pb-2 border-b border-gray-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-[11px] leading-snug text-gray-500">
                    <div>{authorName || model.authorEmail}</div>
                    <div>
                      {model.title}, Merchant Services{' '}
                      <span className="font-semibold text-gray-700">Version {model.version}</span>
                    </div>
                  </div>
                  <img src={headerLogoUrl} alt="Nexi" className="h-6 w-auto shrink-0" />
                </div>
              </div>

              <div className="px-10 py-8 space-y-8">
                <div>
                  <h2 className="text-xl font-bold mb-3" style={{ color: '#1F3763', fontFamily: "'Calibri Light', Calibri, sans-serif" }}>
                    {t.guideViewer.tableOfContents}
                  </h2>
                  <ol className="space-y-1.5">
                    {model.sections.map((section) => (
                      <li key={section.number} className="flex items-baseline gap-2 text-sm">
                        <span className="font-semibold text-gray-700 shrink-0">{section.number}</span>
                        <span className="flex-1 border-b border-dotted border-gray-300 pb-0.5">{section.heading}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {model.coverImageId && (
                  <div className="flex justify-center">
                    <StepImage imageId={model.coverImageId} className="max-h-[480px]" fileLoader={fileLoader} />
                  </div>
                )}

                <div className="border-t border-dashed border-gray-200 -mx-10 px-10 pt-6 text-[11px] text-gray-400 text-center">
                  {t.guideViewer.pageBreak}
                </div>

                {model.sections.map((section) => (
                  <section key={section.number}>
                    <h3
                      className="text-base font-bold mb-3 pb-1 border-b border-gray-100"
                      style={{ color: '#1F3763', fontFamily: "'Calibri Light', Calibri, sans-serif" }}
                    >
                      {section.number} {section.heading}
                    </h3>
                    <ol className="space-y-3">
                      {section.steps.map((step) => (
                        <li key={step.number} data-guide-step={step.number} className={cn('flex gap-3 scroll-mt-6', targetReference === step.number && 'bg-amber-100 ring-2 ring-amber-400 rounded p-2')}>
                          <span className="font-semibold text-sm text-gray-600 shrink-0 w-9 tabular-nums">
                            {step.number}
                          </span>
                          <div className="flex-1 min-w-0 space-y-3">
                            {step.text && (
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ fontFamily: 'Calibri, sans-serif' }}>
                                {linkifyText(step.text)}
                              </p>
                            )}
                            {step.imageIds.map((imageId) => (
                              <StepImage key={imageId} imageId={imageId} fileLoader={fileLoader} />
                            ))}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            </div>
          ) : (guide.fileUrl || guide.wordFileData) ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
              <div className="max-w-2xl w-full space-y-4 sm:space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-md bg-primary/10 flex items-center justify-center">
                    <FileDoc size={40} weight="duotone" className="text-primary sm:w-12 sm:h-12" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">
                      {t.guideViewer.wordDocumentAttached}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-1 break-all">
                      {guide.wordFileName || t.guideViewer.defaultDocumentName}
                    </p>
                    {guide.fileSize && (
                      <p className="text-xs text-muted-foreground mb-1">
                        {t.guideViewer.sizePrefix}: {(guide.fileSize / 1024).toFixed(2)} KB
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {t.guideViewer.downloadHint}
                    </p>
                  </div>
                  <Button
                    size="lg"
                    onClick={handleDownload}
                    className="mt-4 w-full sm:w-auto"
                  >
                    <DownloadSimple size={20} weight="bold" className="mr-2" />
                    {t.guideViewer.downloadWordDocument}
                  </Button>
                </div>

                {guide.content && guide.content !== 'Se vedhæftet Word-dokument' && (
                  <div className="pt-6 border-t border-border">
                    <h4 className="text-sm font-semibold text-foreground mb-3">{t.guideViewer.extraNotes}</h4>
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="whitespace-pre-wrap break-words text-sm">{linkifyText(guide.content)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-none bg-background rounded-lg shadow-sm border border-border p-6 sm:p-8 lg:p-12">
              <p className="whitespace-pre-wrap break-words">{linkifyText(guide.content)}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
