// Typet adgang til opdaterings-API'et fra electron/preload.cjs.
// Findes kun i desktop-appen (window.electronUpdates er undefined i browseren).

export interface UpdateManifest {
  version: string
  file: string
  sha256: string
  size: number
  notes: string
  publishedAt: string
  publishedBy: string
}

export interface UpdateStatus {
  currentVersion: string
  isPackaged: boolean
  manifest: UpdateManifest | null
  updateAvailable: boolean
}

export interface SelectedZip {
  path: string
  fileName: string
  size: number
  version: string | null
}

export type UpdatePhase = 'comparing' | 'downloading' | 'verifying' | 'extracting' | 'ready' | 'restarting' | 'error'

export interface UpdateProgress {
  phase: UpdatePhase
  percent: number
  message?: string
  /** Only present while transferring changed files. */
  transferredBytes?: number
  totalBytes?: number
  fileCount?: number
}

export type PublishPhase = 'hashing-source' | 'uploading' | 'verifying' | 'extracting' | 'indexing'

export interface PublishProgress {
  phase: PublishPhase
  percent: number
}

export interface ElectronUpdatesApi {
  getStatus(): Promise<UpdateStatus>
  check(): Promise<UpdateManifest | null>
  history(): Promise<UpdateManifest[]>
  selectZip(): Promise<SelectedZip | null>
  publish(payload: { zipPath: string; version: string; notes: string; publishedBy: string; skipDelta?: boolean }): Promise<UpdateManifest>
  install(version?: string): Promise<void>
  onUpdateAvailable(callback: (manifest: UpdateManifest) => void): () => void
  onProgress(callback: (progress: UpdateProgress) => void): () => void
  onPublishProgress(callback: (progress: PublishProgress) => void): () => void
}

