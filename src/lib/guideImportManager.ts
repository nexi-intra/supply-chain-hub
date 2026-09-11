// Global, komponent-uafhængig import-status. Selve Word-importen køres her (ikke
// inde i GuideLibrary), så den fortsætter uanset om brugeren navigerer væk fra
// Guide Biblioteket - fremdriften kan vises fra et komponent monteret på app-roden.

import type { GuideImportDraft, ImportProgress } from './docxImporter'

export interface ImportJobState {
  fileName: string
  startedAt: number
  progress: ImportProgress | null
}

export interface ImportCompletion {
  title?: string
  error?: string
}

type Listener = () => void

class GuideImportManager {
  private job: ImportJobState | null = null
  private pendingDraft: GuideImportDraft | null = null
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

  /** Hentes af GuideLibrary — udleveres kun til den instans der først spørger efter den. */
  takePendingDraft(): GuideImportDraft | null {
    const draft = this.pendingDraft
    this.pendingDraft = null
    return draft
  }

  /** Hentes af det globale statuspanel til at vise en afslutnings-toast, uanset hvor brugeren er. */
  takeLastCompletion(): ImportCompletion | null {
    const completion = this.lastCompletion
    this.lastCompletion = null
    return completion
  }

  async startImport(file: File): Promise<void> {
    if (this.job) {
      throw new Error('Der kører allerede en import — vent til den er færdig')
    }
    this.job = { fileName: file.name, startedAt: Date.now(), progress: null }
    this.notify()

    try {
      const { importGuideFromDocx } = await import('./docxImporter')
      const draft = await importGuideFromDocx(file, (progress) => {
        if (!this.job) return
        this.job = { ...this.job, progress }
        this.notify()
      })
      this.pendingDraft = draft
      this.lastCompletion = { title: draft.title }
    } catch (error) {
      console.error('Import af Word-dokument fejlede:', error)
      this.lastCompletion = { error: error instanceof Error ? error.message : 'Kunne ikke importere dokumentet' }
    } finally {
      this.job = null
      this.notify()
    }
  }
}

export const guideImportManager = new GuideImportManager()
