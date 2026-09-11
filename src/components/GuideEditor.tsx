import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus, X, ArrowUp, ArrowDown, Image as ImageIcon, Timer,
  ClockCounterClockwise, ArrowCounterClockwise, FileDoc, Upload, Trash, Eye, Buildings,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fileStorage } from '@/lib/fileStorage'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import type { Guide, GuideSection, GuideVersionEntry } from '@/lib/guideTypes'
import {
  REVIEW_INTERVAL_CHOICES, newId, migrateGuide, computeNextReviewAt, guidePlainText,
} from '@/lib/guideTypes'
import { detectLanguage, type GuideLanguage } from '@/lib/translator'
import { bumpVersion, saveVersionSnapshot, getVersionHistory } from '@/lib/guideStore'
import type { GuideImportDraft } from '@/lib/docxImporter'
import { useLanguage } from '@/contexts/LanguageContext'
import { GuideViewer } from '@/components/GuideViewer'

interface GuideEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (guide: Guide) => void
  editGuide?: Guide
  categories: string[]
  /** Opretter en ny kategori i det delte kategorisæt og returnerer om det lykkedes. */
  onCreateCategory?: (category: string) => boolean
  /** Forudsætter en ny guide med indhold parset fra et importeret Word-dokument. */
  importDraft?: GuideImportDraft | null
  userEmail: string
}

function emptySection(): GuideSection {
  return { id: newId('sec'), heading: '', steps: [{ id: newId('step'), text: '', imageIds: [] }] }
}

/** Miniature af et gemt billede (loader objekt-URL fra chunked KV). */
function ImageThumb({ imageId, onRemove }: { imageId: string; onRemove?: () => void }) {
  const { t } = useLanguage()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fileStorage.getImageObjectUrl(imageId)
      .then((u) => { if (!cancelled) setUrl(u) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [imageId])

  return (
    <div className="relative group/thumb h-20 w-20 rounded-lg border-2 border-border overflow-hidden bg-muted/50 flex items-center justify-center shrink-0">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={24} className={cn('text-muted-foreground', failed && 'text-destructive')} />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
          aria-label={t.guideEditor.removeImage}
        >
          <X size={12} weight="bold" />
        </button>
      )}
    </div>
  )
}

/** Drop-zone + fil-vælger, der uploader billeder til fileStorage og returnerer fileIds. */
function ImageDropZone({ onUploaded, compact }: { onUploaded: (fileIds: string[]) => void; compact?: boolean }) {
  const { t } = useLanguage()
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name))
    if (images.length === 0) {
      toast.error(t.guideEditor.onlyImagesAllowed)
      return
    }
    setIsUploading(true)
    const ids: string[] = []
    for (const file of images) {
      try {
        const stored = await fileStorage.uploadImage(file)
        ids.push(stored.fileId)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t.guideEditor.uploadImageFailed)
      }
    }
    setIsUploading(false)
    if (ids.length > 0) onUploaded(ids)
  }, [onUploaded])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        uploadFiles(Array.from(e.dataTransfer.files))
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'rounded-lg border-2 border-dashed transition-all cursor-pointer flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary',
        compact ? 'h-20 w-20 shrink-0' : 'h-20 px-4',
        isDragging && 'border-primary bg-primary/5 text-primary',
        isUploading && 'opacity-50 pointer-events-none'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) uploadFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
      <ImageIcon size={compact ? 22 : 20} />
      {!compact && <span className="text-xs font-medium">{isUploading ? t.guideEditor.uploading : t.guideEditor.dropImagesHint}</span>}
    </div>
  )
}

export function GuideEditor({ open, onOpenChange, onSave, editGuide, categories, onCreateCategory, importDraft, userEmail }: GuideEditorProps) {
  const { t, language: appLanguage } = useLanguage()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(categories[0] || 'General')
  const [tags, setTags] = useState('')
  const [language, setLanguage] = useState<GuideLanguage | 'auto'>('auto')
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [sections, setSections] = useState<GuideSection[]>([emptySection()])
  const [coverImageId, setCoverImageId] = useState<string | undefined>()
  const [reviewInterval, setReviewInterval] = useState<number | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [wordFile, setWordFile] = useState<File | null>(null)
  const [removeWordAttachment, setRemoveWordAttachment] = useState(false)
  const [history, setHistory] = useState<GuideVersionEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Tværgående deling (Fase 3): andre teams denne guide skal ligge hos, ud over eget team.
  // `otherTeamCodes` er ALTID "andre" (eget team indgår aldrig i checkbox-listen `allTeams`
  // nedenfor), så der er ingen tvetydighed om retning uanset hvem der redigerer guiden.
  const [allTeams, setAllTeams] = useState<RegisteredTeam[]>([])
  const [currentTeamCode, setCurrentTeamCode] = useState<string | undefined>()
  const [otherTeamCodes, setOtherTeamCodes] = useState<string[]>([])
  // Billeder uploadet i denne session — slettes igen hvis brugeren annullerer.
  const sessionImagesRef = useRef<string[]>([])
  const wordInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!window.electronRegistry) return
    Promise.all([
      window.electronRegistry.listTeams(),
      window.electronRegistry.getCurrentTeam(),
    ]).then(([teams, current]) => {
      setCurrentTeamCode(current?.folderName)
      setAllTeams(teams.filter((team) => team.teamId !== current?.teamId))
    })
  }, [])

  const migrated = useMemo(() => (editGuide ? migrateGuide(editGuide) : undefined), [editGuide])

  useEffect(() => {
    if (!open) return
    if (migrated) {
      setTitle(migrated.title)
      setCategory(migrated.category)
      setTags(migrated.tags.join(', '))
      setLanguage(migrated.language || 'auto')
      setSections(migrated.sections && migrated.sections.length > 0
        ? migrated.sections.map((s) => ({ ...s, steps: s.steps.map((st) => ({ ...st, imageIds: [...st.imageIds] })) }))
        : [emptySection()])
      setCoverImageId(migrated.coverImageId)
      setReviewInterval(migrated.reviewIntervalMonths ?? null)
      getVersionHistory(migrated.id).then(setHistory).catch(() => setHistory([]))
    } else {
      setTitle(importDraft?.title || '')
      setCategory(categories[0] || 'General')
      setTags('')
      setLanguage(importDraft?.language || 'auto')
      setSections(importDraft?.sections.length ? importDraft.sections : [emptySection()])
      setCoverImageId(undefined)
      setReviewInterval(null)
      setHistory([])
    }
    setChangeNote('')
    setWordFile(importDraft?.originalFile || null)
    setRemoveWordAttachment(false)
    setShowHistory(false)
    setIsCreatingCategory(false)
    setNewCategoryName('')
    setOtherTeamCodes((migrated?.sharedWithTeamCodes || []).filter((code) => code !== currentTeamCode))
    // Billeder fra et importeret dokument uploades allerede før editoren \u00e5bner \u2014
    // de skal ryddes op p\u00e5 lige fod med session-billeder, hvis brugeren fortryder.
    sessionImagesRef.current = importDraft ? importDraft.sections.flatMap((s) => s.steps.flatMap((st) => st.imageIds)) : []
  }, [open, migrated, categories, importDraft, currentTeamCode])

  const hasUnsavedChanges = useMemo(() => {
    if (!open) return false
    if (migrated) {
      return title !== migrated.title
        || category !== migrated.category
        || tags !== migrated.tags.join(', ')
        || language !== (migrated.language || 'auto')
        || JSON.stringify(sections) !== JSON.stringify(migrated.sections?.length ? migrated.sections : [emptySection()])
        || coverImageId !== migrated.coverImageId
        || reviewInterval !== (migrated.reviewIntervalMonths ?? null)
        || wordFile !== null
        || removeWordAttachment
        || JSON.stringify([...otherTeamCodes].sort()) !== JSON.stringify([...(migrated.sharedWithTeamCodes || []).filter((code) => code !== currentTeamCode)].sort())
    }
    return title.trim() !== '' || tags.trim() !== '' || wordFile !== null || otherTeamCodes.length > 0
      || sections.some((s) => s.heading.trim() || s.steps.some((st) => st.text.trim() || st.imageIds.length > 0))
  }, [open, migrated, title, category, tags, sections, coverImageId, reviewInterval, wordFile, removeWordAttachment, otherTeamCodes, currentTeamCode])

  const cleanupSessionImages = useCallback(async () => {
    for (const id of sessionImagesRef.current) {
      try { await fileStorage.deleteFile(`kv://${id}`) } catch { /* allerede væk */ }
    }
    sessionImagesRef.current = []
  }, [])

  useUnsavedChanges({
    hasUnsavedChanges,
    onConfirmedExit: () => {
      cleanupSessionImages()
      onOpenChange(false)
    },
    enabled: open,
  })

  const updateSection = (sectionId: string, patch: Partial<GuideSection>) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)))
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const removeSection = (sectionId: string) => {
    setSections((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== sectionId) : prev))
  }

  const updateStep = (sectionId: string, stepId: string, text: string) => {
    setSections((prev) => prev.map((s) => s.id === sectionId
      ? { ...s, steps: s.steps.map((st) => (st.id === stepId ? { ...st, text } : st)) }
      : s))
  }

  const moveStep = (sectionId: string, stepIndex: number, direction: -1 | 1) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s
      const steps = [...s.steps]
      const target = stepIndex + direction
      if (target < 0 || target >= steps.length) return s
      ;[steps[stepIndex], steps[target]] = [steps[target], steps[stepIndex]]
      return { ...s, steps }
    }))
  }

  const removeStep = (sectionId: string, stepId: string) => {
    setSections((prev) => prev.map((s) => s.id === sectionId && s.steps.length > 1
      ? { ...s, steps: s.steps.filter((st) => st.id !== stepId) }
      : s))
  }

  const addStep = (sectionId: string) => {
    setSections((prev) => prev.map((s) => s.id === sectionId
      ? { ...s, steps: [...s.steps, { id: newId('step'), text: '', imageIds: [] }] }
      : s))
  }

  const addStepImages = (sectionId: string, stepId: string, fileIds: string[]) => {
    sessionImagesRef.current.push(...fileIds)
    setSections((prev) => prev.map((s) => s.id === sectionId
      ? { ...s, steps: s.steps.map((st) => (st.id === stepId ? { ...st, imageIds: [...st.imageIds, ...fileIds] } : st)) }
      : s))
  }

  const removeStepImage = async (sectionId: string, stepId: string, imageId: string) => {
    setSections((prev) => prev.map((s) => s.id === sectionId
      ? { ...s, steps: s.steps.map((st) => (st.id === stepId ? { ...st, imageIds: st.imageIds.filter((i) => i !== imageId) } : st)) }
      : s))
    // Kun billeder fra denne session slettes fysisk — gemte billeder kan indgå i versionshistorik.
    if (sessionImagesRef.current.includes(imageId)) {
      sessionImagesRef.current = sessionImagesRef.current.filter((i) => i !== imageId)
      try { await fileStorage.deleteFile(`kv://${imageId}`) } catch { /* ignorér */ }
    }
  }

  const restoreVersion = (entry: GuideVersionEntry) => {
    setTitle(entry.snapshot.title)
    setCategory(entry.snapshot.category)
    setTags(entry.snapshot.tags.join(', '))
    setSections(entry.snapshot.sections.length > 0
      ? entry.snapshot.sections.map((s) => ({ ...s, steps: s.steps.map((st) => ({ ...st, imageIds: [...st.imageIds] })) }))
      : [emptySection()])
    setCoverImageId(entry.snapshot.coverImageId)
    setChangeNote(`${t.guideEditor.restoredFromVersionPrefix} ${entry.version}`)
    setShowHistory(false)
    toast.success(`${t.guideEditor.versionRestoredPrefix} ${entry.version} ${t.guideEditor.versionRestoredSuffix}`)
  }

  const handleCreateCategory = () => {
    const name = newCategoryName.trim()
    if (!name) {
      toast.error(t.guideEditor.categoryNameEmpty)
      return
    }
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast.error(t.guideEditor.categoryExists)
      return
    }
    if (onCreateCategory?.(name)) {
      setCategory(name)
      setIsCreatingCategory(false)
      setNewCategoryName('')
      toast.success(`${t.guideEditor.categoryCreatedPrefix} "${name}" ${t.guideEditor.categoryCreatedSuffix}`)
    }
  }

  // Bygger den endelige sharedWithTeamCodes-liste (ALLE deltagende teams inkl. eget) ud fra
  // de valgte "andre teams" — undefined når ingen andre teams er valgt (normal lokal guide).
  const resolveSharedWithTeamCodes = (): string[] | undefined => {
    if (otherTeamCodes.length === 0) return undefined
    const codes = currentTeamCode ? [currentTeamCode, ...otherTeamCodes] : [...otherTeamCodes]
    return Array.from(new Set(codes))
  }

  // Bygger et Guide-objekt af den aktuelle, endnu IKKE gemte formular-tilstand — bruges
  // til preview, så man kan se guiden som den vil se ud, før man trykker Gem.
  const buildDraftGuide = (): Guide => {
    const cleanedSections = sections
      .map((s) => ({
        ...s,
        heading: s.heading.trim(),
        steps: s.steps
          .map((st) => ({ ...st, text: st.text.trim() }))
          .filter((st) => st.text || st.imageIds.length > 0),
      }))
      .filter((s) => s.heading || s.steps.length > 0)
    const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean)
    const now = Date.now()
    const resolvedLanguage: GuideLanguage = language === 'auto'
      ? detectLanguage(guidePlainText({ title, tags: tagArray, category, sections: cleanedSections, content: migrated?.content || '', id: '', createdAt: 0, updatedAt: 0 } as Guide), 'da')
      : language
    return {
      id: migrated?.id || 'preview',
      schemaVersion: 2,
      title: title.trim() || t.guideEditor.untitledPreview,
      category,
      tags: tagArray,
      language: resolvedLanguage,
      content: migrated?.content || '',
      sections: cleanedSections,
      coverImageId,
      version: migrated ? migrated.version : '1.00',
      author: migrated?.author || userEmail,
      createdBy: migrated?.createdBy || userEmail,
      updatedBy: userEmail,
      createdAt: migrated?.createdAt || now,
      updatedAt: now,
      reviewIntervalMonths: reviewInterval,
      nextReviewAt: computeNextReviewAt(now, reviewInterval),
      lastReviewedAt: now,
      fileUrl: removeWordAttachment ? undefined : migrated?.fileUrl,
      wordFileName: removeWordAttachment ? undefined : migrated?.wordFileName,
      fileSize: removeWordAttachment ? undefined : migrated?.fileSize,
      sharedWithTeamCodes: resolveSharedWithTeamCodes(),
    }
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t.guideEditor.titleRequired)
      return
    }
    const cleanedSections = sections
      .map((s) => ({
        ...s,
        heading: s.heading.trim(),
        steps: s.steps
          .map((st) => ({ ...st, text: st.text.trim() }))
          .filter((st) => st.text || st.imageIds.length > 0),
      }))
      .filter((s) => s.heading || s.steps.length > 0)

    if (cleanedSections.length === 0 && !wordFile && !migrated?.fileUrl) {
      toast.error(t.guideEditor.atLeastOneSectionRequired)
      return
    }

    setIsSaving(true)
    try {
      const now = Date.now()
      const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean)

      let fileUrl = removeWordAttachment ? undefined : migrated?.fileUrl
      let wordFileName = removeWordAttachment ? undefined : migrated?.wordFileName
      let fileSize = removeWordAttachment ? undefined : migrated?.fileSize
      if (wordFile) {
        const stored = await fileStorage.uploadFile(wordFile)
        if (migrated?.fileUrl) {
          try { await fileStorage.deleteFile(migrated.fileUrl) } catch { /* ignorér */ }
        }
        fileUrl = stored.url
        wordFileName = stored.filename
        fileSize = stored.size
      } else if (removeWordAttachment && migrated?.fileUrl) {
        try { await fileStorage.deleteFile(migrated.fileUrl) } catch { /* ignorér */ }
      }

      const version = migrated ? bumpVersion(migrated.version) : '1.00'
      const resolvedLanguage: GuideLanguage = language === 'auto'
        ? detectLanguage(guidePlainText({ ...(migrated || {}), title, tags: tagArray, category, sections: cleanedSections, content: migrated?.content || '', id: '', createdAt: 0, updatedAt: 0 } as Guide), 'da')
        : language
      const guide: Guide = {
        id: migrated?.id || Date.now().toString(),
        schemaVersion: 2,
        title: title.trim(),
        category,
        tags: tagArray,
        language: resolvedLanguage,
        content: migrated?.content || '',
        sections: cleanedSections,
        coverImageId,
        version,
        author: migrated?.author || userEmail,
        createdBy: migrated?.createdBy || userEmail,
        updatedBy: userEmail,
        createdAt: migrated?.createdAt || now,
        updatedAt: now,
        reviewIntervalMonths: reviewInterval,
        nextReviewAt: computeNextReviewAt(now, reviewInterval),
        lastReviewedAt: now,
        fileUrl,
        wordFileName,
        fileSize,
        sharedWithTeamCodes: resolveSharedWithTeamCodes(),
      }

      await saveVersionSnapshot(guide, userEmail, changeNote)
      sessionImagesRef.current = []
      onSave(guide)
      onOpenChange(false)
    } catch (error) {
      console.error('Kunne ikke gemme guide:', error)
      toast.error(error instanceof Error ? error.message : t.guideEditor.saveFailed)
    } finally {
      setIsSaving(false)
    }
  }

  const nextVersion = migrated ? bumpVersion(migrated.version) : '1.00'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && hasUnsavedChanges) return; if (!o) cleanupSessionImages(); onOpenChange(o) }}>
      <DialogContent className="max-w-[96vw] xl:max-w-[1400px] w-[96vw] h-[94vh] max-h-[94vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-xl">
                {migrated ? t.guideEditor.editTitle : t.guideEditor.newTitle}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {migrated
                  ? <>Version {migrated.version || '1.00'} {t.guideEditor.versionArrowSuffix} <Badge variant="secondary" className="font-mono">{nextVersion}</Badge></>
                  : t.guideEditor.newGuideDescription}
              </DialogDescription>
            </div>
            {migrated && history.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowHistory((v) => !v)} className="gap-2 shrink-0">
                <ClockCounterClockwise size={16} />
                {t.guideEditor.historyButtonPrefix} ({history.length})
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5 space-y-6">
            {showHistory && (
              <div className="rounded-xl border-2 border-border bg-muted/30 p-4 space-y-2">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <ClockCounterClockwise size={16} />
                  {t.guideEditor.versionHistory}
                </h4>
                {history.map((entry) => (
                  <div key={`${entry.version}-${entry.savedAt}`} className="flex items-center gap-3 p-2 rounded-lg bg-card border">
                    <Badge variant="outline" className="font-mono shrink-0">v{entry.version}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {new Date(entry.savedAt).toLocaleString(appLanguage === 'en' ? 'en-US' : 'da-DK')} · {entry.savedBy}
                      </div>
                      {entry.changeNote && <div className="text-xs text-muted-foreground truncate">{entry.changeNote}</div>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => restoreVersion(entry)} className="gap-1.5 shrink-0">
                      <ArrowCounterClockwise size={14} />
                      {t.guideEditor.restore}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                <Label htmlFor="guide-title">{t.guideEditor.titleLabel}</Label>
                <Input
                  id="guide-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.guideEditor.titlePlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.guideEditor.categoryLabel}</Label>
                {isCreatingCategory ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }}
                      placeholder={t.guideEditor.newCategoryPlaceholder}
                      autoFocus
                    />
                    <Button size="icon" className="shrink-0 h-9 w-9" onClick={handleCreateCategory} aria-label={t.guideEditor.createCategoryAriaLabel}>
                      <Plus size={16} weight="bold" />
                    </Button>
                    <Button size="icon" variant="ghost" className="shrink-0 h-9 w-9" onClick={() => { setIsCreatingCategory(false); setNewCategoryName('') }} aria-label={t.common.cancel}>
                      <X size={16} />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {onCreateCategory && (
                      <Button size="icon" variant="outline" className="shrink-0 h-9 w-9" onClick={() => setIsCreatingCategory(true)} title={t.guideEditor.createNewCategoryTitle}>
                        <Plus size={16} weight="bold" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guide-tags">{t.guideEditor.tagsLabel}</Label>
                <Input
                  id="guide-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder={t.guideEditor.tagsPlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.guideEditor.guideLanguageLabel}</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as GuideLanguage | 'auto')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t.guideEditor.languageAuto}</SelectItem>
                    <SelectItem value="da">{t.guideEditor.languageDanish}</SelectItem>
                    <SelectItem value="en">{t.guideEditor.languageEnglish}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Timer size={16} />
                  {t.guideEditor.reviewIntervalLabel}
                </Label>
                <Select
                  value={reviewInterval === null ? 'none' : String(reviewInterval)}
                  onValueChange={(v) => setReviewInterval(v === 'none' ? null : Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REVIEW_INTERVAL_CHOICES.map((choice) => (
                      <SelectItem key={choice.label} value={choice.value === null ? 'none' : String(choice.value)}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {reviewInterval
                    ? `${t.guideEditor.reviewIntervalHintPrefix} ${REVIEW_INTERVAL_CHOICES.find((c) => c.value === reviewInterval)?.label.toLowerCase()} ${t.guideEditor.reviewIntervalHintSuffix}`
                    : t.guideEditor.reviewIntervalHintNone}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t.guideEditor.coverImageLabel}</Label>
              <div className="flex items-center gap-3">
                {coverImageId ? (
                  <ImageThumb imageId={coverImageId} onRemove={() => setCoverImageId(undefined)} />
                ) : (
                  <ImageDropZone compact onUploaded={(ids) => { sessionImagesRef.current.push(...ids); setCoverImageId(ids[0]) }} />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-bold">{t.guideEditor.sectionsLabel}</Label>
                <span className="text-xs text-muted-foreground">{t.guideEditor.numberingHint}</span>
              </div>

              {sections.map((section, sIndex) => (
                <div key={section.id} className="rounded-xl border-2 border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono shrink-0">{sIndex + 1}.0</Badge>
                    <Input
                      value={section.heading}
                      onChange={(e) => updateSection(section.id, { heading: e.target.value })}
                      placeholder={t.guideEditor.sectionHeadingPlaceholder}
                      className="font-semibold"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={sIndex === 0} onClick={() => moveSection(sIndex, -1)}>
                        <ArrowUp size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={sIndex === sections.length - 1} onClick={() => moveSection(sIndex, 1)}>
                        <ArrowDown size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={sections.length === 1} onClick={() => removeSection(section.id)}>
                        <Trash size={16} />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 pl-2 border-l-2 border-primary/20 ml-3">
                    {section.steps.map((step, stIndex) => (
                      <div key={step.id} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Badge variant="secondary" className="font-mono mt-2 shrink-0">{sIndex + 1}.{stIndex + 1}</Badge>
                          <Textarea
                            value={step.text}
                            onChange={(e) => updateStep(section.id, step.id, e.target.value)}
                            placeholder={t.guideEditor.stepPlaceholder}
                            rows={2}
                            className="resize-y min-h-[60px]"
                          />
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={stIndex === 0} onClick={() => moveStep(section.id, stIndex, -1)}>
                              <ArrowUp size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={stIndex === section.steps.length - 1} onClick={() => moveStep(section.id, stIndex, 1)}>
                              <ArrowDown size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={section.steps.length === 1 && !step.text && step.imageIds.length === 0} onClick={() => removeStep(section.id, step.id)}>
                              <X size={14} />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap ml-10">
                          {step.imageIds.map((imageId) => (
                            <ImageThumb
                              key={imageId}
                              imageId={imageId}
                              onRemove={() => removeStepImage(section.id, step.id, imageId)}
                            />
                          ))}
                          <ImageDropZone compact onUploaded={(ids) => addStepImages(section.id, step.id, ids)} />
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addStep(section.id)} className="gap-1.5 ml-10">
                      <Plus size={14} weight="bold" />
                      {t.guideEditor.addStep}
                    </Button>
                  </div>
                </div>
              ))}

              <Button variant="outline" onClick={() => setSections((prev) => [...prev, emptySection()])} className="w-full gap-2 border-dashed">
                <Plus size={18} weight="bold" />
                {t.guideEditor.addSection}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t.guideEditor.wordAttachmentLabel}</Label>
              {wordFile ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <FileDoc size={22} className="text-primary shrink-0" />
                  <span className="text-sm truncate flex-1">{wordFile.name}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => setWordFile(null)}>
                    <X size={16} />
                  </Button>
                </div>
              ) : migrated?.fileUrl && !removeWordAttachment ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <FileDoc size={22} className="text-primary shrink-0" />
                  <span className="text-sm truncate flex-1">{migrated.wordFileName}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => setRemoveWordAttachment(true)}>
                    <Trash size={16} />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => wordInputRef.current?.click()} className="gap-2">
                  <Upload size={16} />
                  {t.guideEditor.attachWordFile}
                </Button>
              )}
              {(wordFile || (migrated?.fileUrl && !removeWordAttachment)) && (
                <p className="text-xs text-muted-foreground">{t.guideEditor.wordAttachmentHint}</p>
              )}
              <input
                ref={wordInputRef}
                type="file"
                accept=".doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) { setWordFile(file); setRemoveWordAttachment(false) }
                  e.target.value = ''
                }}
              />
            </div>

            {allTeams.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Buildings size={16} />
                  {t.guideEditor.shareWithTeamsLabel}
                </Label>
                <p className="text-xs text-muted-foreground">{t.guideEditor.shareWithTeamsHint}</p>
                <div className="flex flex-wrap gap-3 rounded-lg border p-3 bg-muted/20">
                  {allTeams.map((team) => (
                    <label key={team.teamId} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <Checkbox
                        checked={otherTeamCodes.includes(team.folderName)}
                        onCheckedChange={(checked) => {
                          setOtherTeamCodes((prev) => checked
                            ? [...prev, team.folderName]
                            : prev.filter((code) => code !== team.folderName))
                        }}
                      />
                      {team.folderName}
                    </label>
                  ))}
                </div>
                {otherTeamCodes.length > 0 && (
                  <p className="text-xs font-medium text-accent-foreground bg-accent/10 rounded px-2 py-1 inline-block">
                    {t.guideEditor.sharedWithSummaryPrefix} {otherTeamCodes.join(', ')}
                  </p>
                )}
              </div>
            )}

            {migrated && (
              <div className="space-y-2">
                <Label htmlFor="guide-changenote">{t.guideEditor.versionNoteLabel}</Label>
                <Input
                  id="guide-changenote"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder={t.guideEditor.versionNotePlaceholder}
                />
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => { cleanupSessionImages(); onOpenChange(false) }} disabled={isSaving}>
            {t.common.cancel}
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={isSaving} className="gap-2">
            <Eye size={16} />
            {t.guideEditor.preview}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? t.guideEditor.saving : migrated ? `${t.guideEditor.saveAsVersionPrefix}${nextVersion}` : t.guideEditor.createGuide}
          </Button>
        </DialogFooter>
      </DialogContent>

      <GuideViewer
        guide={previewOpen ? buildDraftGuide() : null}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </Dialog>
  )
}
