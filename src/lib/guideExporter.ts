// Eksport af guides som DOCX til et lokalt/netværks-guidebibliotek med
// automatisk kategoristruktur: <rod>/<kategori>/<titel> vX.XX.docx.
// ExportTarget-interfacet gør det muligt senere at tilføje SharePoint/OneDrive/
// Teams-targets (Graph API) uden ændringer i UI- eller domænelaget.

import type { DocModel } from './docModel'

export interface GuideLibrarySettings {
  exportRoot: string | null
}

export const GUIDE_LIBRARY_SETTINGS_KEY = 'guide-library-settings'

export interface ExportTarget {
  /** Menneskelæsbart navn, fx 'Lokal mappe'. */
  readonly name: string
  chooseRoot(): Promise<string | null>
  exportDocx(root: string, category: string, fileName: string, blob: Blob): Promise<string>
}

/** Filsystem-target via Electron IPC. Ikke tilgængelig i ren browser. */
const fileSystemTarget: ExportTarget = {
  name: 'Lokal mappe',
  async chooseRoot() {
    if (!window.electronGuides) throw new Error('Eksport kræver desktop-appen')
    return window.electronGuides.chooseExportDir()
  },
  async exportDocx(root, category, fileName, blob) {
    if (!window.electronGuides) throw new Error('Eksport kræver desktop-appen')
    return window.electronGuides.exportDocx({
      root,
      category,
      fileName,
      data: await blob.arrayBuffer(),
    })
  },
}

export function getExportTarget(): ExportTarget {
  return fileSystemTarget
}

export function isExportAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electronGuides
}

export async function getExportRoot(): Promise<string | null> {
  const settings = await window.kv.get<GuideLibrarySettings>(GUIDE_LIBRARY_SETTINGS_KEY)
  return settings?.exportRoot || null
}

export async function setExportRoot(exportRoot: string | null): Promise<void> {
  await window.kv.set(GUIDE_LIBRARY_SETTINGS_KEY, { exportRoot } satisfies GuideLibrarySettings)
}

/** Åbner mappe-dialog og gemmer valget. Returnerer den nye rod eller null. */
export async function chooseAndSaveExportRoot(): Promise<string | null> {
  const root = await getExportTarget().chooseRoot()
  if (root) await setExportRoot(root)
  return root
}

/** Genererer og skriver én guide til biblioteket. Returnerer den fulde filsti. */
export async function exportGuideToLibrary(model: DocModel, authorName: string, root: string): Promise<string> {
  const { generateGuideDocx, guideDocxFileName } = await import('./docxGenerator')
  const blob = await generateGuideDocx(model, authorName)
  return getExportTarget().exportDocx(root, model.category, guideDocxFileName(model), blob)
}
