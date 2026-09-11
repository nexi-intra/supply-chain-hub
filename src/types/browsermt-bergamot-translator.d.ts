// Minimal typedeklaration for @browsermt/bergamot-translator (skibsserveres uden typer).
declare module '@browsermt/bergamot-translator/translator.js' {
  export interface TranslationRequest {
    from: string
    to: string
    text: string
    html?: boolean
    qualityScores?: boolean
    priority?: number
  }

  export interface TranslationResponse {
    request: TranslationRequest
    target: { text: string }
  }

  export class TranslatorBacking {
    constructor(options?: Record<string, unknown>)
    options: Record<string, unknown>
    registry: Promise<Array<{ from: string; to: string }>>
    loadModelRegistery(): Promise<Array<{ from: string; to: string; files?: unknown }>>
    loadTranslationModel(pair: { from: string; to: string }, options?: unknown): Promise<{
      model: ArrayBuffer
      shortlist: ArrayBuffer
      vocabs: ArrayBuffer[]
      qualityModel?: ArrayBuffer | null
      config?: Record<string, string>
    }>
    loadWorker(): Promise<{ worker: Worker; exports: unknown }>
    getModels(request: { from: string; to: string }): Promise<unknown[]>
    getTranslationModel(pair: { from: string; to: string }, options?: unknown): Promise<unknown>
  }

  export class BatchTranslator {
    constructor(options?: Record<string, unknown>, backing?: TranslatorBacking)
    translate(request: TranslationRequest): Promise<TranslationResponse>
    delete(): void
  }

  export class LatencyOptimisedTranslator {
    constructor(options?: Record<string, unknown>, backing?: TranslatorBacking)
    translate(request: TranslationRequest): Promise<TranslationResponse>
    delete(): void
  }
}
