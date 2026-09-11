// Typer for window.electronGuides (preload.cjs) — guide-eksport til filsystem.

export interface GuideExportPayload {
  root: string
  category: string
  fileName: string
  data: ArrayBuffer
}

export interface ElectronGuidesApi {
  /** Åbner mappe-dialog; returnerer valgt sti eller null ved annullering. */
  chooseExportDir(): Promise<string | null>
  /** Skriver DOCX til <root>/<kategori>/<filnavn>; returnerer den fulde sti. */
  exportDocx(payload: GuideExportPayload): Promise<string>
}

// Typer for window.electronTranslation (preload.cjs) — Bergamot-assets og modeller.
export interface ElectronTranslationApi {
  workerAssets(): Promise<{ workerJs: string; glueJs: string; wasm: ArrayBuffer }>
  registry(): Promise<Array<{ from: string; to: string }>>
  modelFiles(pair: string): Promise<{ model: ArrayBuffer; shortlist: ArrayBuffer; vocabs: ArrayBuffer[]; gemmPrecision?: string }>
}

// Typer for window.electronShell (preload.cjs) — åbner lokale fil/mappe-stier i OS'et.
export interface ElectronShellApi {
  /** Åbner en fil eller mappe i standardprogrammet/Stifinder; kaster hvis stien er ugyldig. */
  openPath(path: string): Promise<void>
}
