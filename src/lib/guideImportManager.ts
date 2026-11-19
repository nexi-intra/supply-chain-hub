// Global, komponent-uafhængig import-status. Selve Word-importen køres her (ikke
// inde i GuideLibrary), så den fortsætter uanset om brugeren navigerer væk fra
// Guide Biblioteket - fremdriften kan vises fra et komponent monteret på app-roden.

import type { GuideImportDraft, ImportProgress } from './docxImporter'
import type { Language } from './translations'
import type { LibraryKind } from './libraryConfig'

export interface ImportJobState {
  fileName: string
  startedAt: number
  progress: ImportProgress | null
  kind: LibraryKind
}

export interface ImportCompletion {
  title?: string
  error?: string
  kind: LibraryKind
}

type Listener = () => void

class GuideImportManager {
  private job: ImportJobState | null = null
  private pendingDraft: { draft: GuideImportDraft; kind: LibraryKind } | null = null
  private lastCompletion: ImportCompletion | null = null
  private listeners = new Set<Listener>()

  private notify() {
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getJob = (): ImportJobState | null => this.job

  isBusy(): boolean {
    return this.job !== null
  }

  /** Hentes af biblioteket af samme type — udleveres kun til den instans der først spørger efter den. */
  takePendingDraft(kind: LibraryKind = 'guides'): GuideImportDraft | null {
    if (this.pendingDraft?.kind !== kind) return null
    const { draft } = this.pendingDraft
    this.pendingDraft = null
    return draft
  }

  /** Hentes af det globale statuspanel til at vise en afslutnings-toast, uanset hvor brugeren er. */
  takeLastCompletion(): ImportCompletion | null {
    const completion = this.lastCompletion
    this.lastCompletion = null
    return completion
  }

  async startImport(file: File, options?: { preserveOriginal?: boolean; language?: Language; kind?: LibraryKind }): Promise<void> {
    if (this.job) {
      throw new Error('Der kører allerede en import — vent til den er færdig')
    }
    const kind = options?.kind ?? 'guides'
    this.job = { fileName: file.name, startedAt: Date.now(), progress: null, kind }
    this.notify()

    try {
      const onProgress = (progress: ImportProgress) => {
        if (!this.job) return
        this.job = { ...this.job, progress }
        this.notify()
      }
      const draft = /\.pdf$/i.test(file.name)
        ? await (await import('./pdfImporter')).importGuideFromPdf(file, onProgress, { language: options?.language })
        : await (await import('./docxImporter')).importGuideFromDocx(file, onProgress, options)
      this.pendingDraft = { draft, kind }
      this.lastCompletion = { title: draft.title, kind }
    } catch (error) {
      console.error('Import af dokument fejlede:', error)
      this.lastCompletion = { error: error instanceof Error ? error.message : 'Kunne ikke importere dokumentet', kind }
    } finally {
      this.job = null
      this.notify()
    }
  }
}

export const guideImportManager = new GuideImportManager()
