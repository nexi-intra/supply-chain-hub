// Neural da↔en↔fi↔sv-oversættelse via Bergamot/Firefox Translations (WASM) — kører
// 100 % offline i appen. Modellerne ligger i <datamappe>/translation-models/
// (daen/, enda/, enfi/, fien/, ensv/, sven/), så én download på det delte drev tjener
// alle klienter. Par uden direkte model (fx dansk↔svensk) pivoterer neuralt gennem engelsk.
//
// Electron-produktionsappen kører under file://, hvor hverken fetch() eller
// Worker-URL'er virker — derfor bygges workeren som en Blob med et prelude,
// der udleverer WASM-binaren og emscripten-gluen fra IPC i stedet for netværk.
// Findes der ingen modeller (eller fejler WASM), falder translator.ts tilbage
// til ordbogs-oversætteren.

import type { GuideLanguage } from './translator'

type BergamotStatus = 'unavailable' | 'idle' | 'loading' | 'ready' | 'error'

interface TranslatorModule {
  translate(request: { from: string; to: string; text: string; html?: boolean }): Promise<{ target: { text: string } }>
  delete(): void | Promise<void>
}

let status: BergamotStatus = 'idle'
let translatorPromise: Promise<TranslatorModule | null> | null = null
let availablePairs: Set<string> | null = null

export function getBergamotStatus(): BergamotStatus {
  return status
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronTranslation
}

/** Sprogpar der har modeller på det delte drev (fx 'daen'). */
async function loadAvailablePairs(): Promise<Set<string>> {
  if (availablePairs) return availablePairs
  if (!isElectron()) {
    availablePairs = new Set()
    return availablePairs
  }
  try {
    const registry = await window.electronTranslation!.registry()
    availablePairs = new Set(registry.map((entry) => `${entry.from}${entry.to}`))
  } catch (error) {
    // Not cached: before login the registry answers AUTH_REQUIRED, and neural translation must still work after login.
    console.error('Kunne ikke læse oversættelses-registry:', error)
    return new Set()
  }
  return availablePairs
}

export async function hasBergamotModel(from: GuideLanguage, to: GuideLanguage): Promise<boolean> {
  const pairs = await loadAvailablePairs()
  return pairs.has(`${from}${to}`)
}

// Prelude der kører før pakkens worker-kode i samme Blob: udleverer WASM og
// glue-script uden netværksadgang. Pakkens kode kalder fetch('...wasm') og
// importScripts('bergamot-translator-worker.js') — begge omdirigeres her.
const WORKER_PRELUDE = `
let __assetsResolve;
const __assets = new Promise((resolve) => { __assetsResolve = resolve; });
self.addEventListener('message', function onInit(event) {
  if (event.data && event.data.type === '__bergamot_assets') {
    self.removeEventListener('message', onInit);
    __assetsResolve({ wasm: event.data.wasm, glueUrl: URL.createObjectURL(new Blob([event.data.glueJs], { type: 'text/javascript' })) });
  }
});
// self.location er en blob:-URL med uigennemsigtigt (opaque) origin, når workeren
// spawnes fra en file://-side — pakkens 'new URL(sti, self.location)' fejler derfor
// med "Invalid URL". Vi kan ikke rette self.location, så vi gør URL-konstruktøren
// fejltolerant: fejler den relative opløsning, prøves samme sti mod en fast base.
const __OrigURL = self.URL;
self.URL = function(url, base) {
  try {
    return new __OrigURL(url, base);
  } catch {
    return new __OrigURL(url, 'https://bergamot.invalid/');
  }
};
self.URL.createObjectURL = __OrigURL.createObjectURL.bind(__OrigURL);
self.URL.revokeObjectURL = __OrigURL.revokeObjectURL.bind(__OrigURL);
const __origFetch = self.fetch ? self.fetch.bind(self) : null;
self.fetch = async function(resource, init) {
  if (String(resource).includes('bergamot-translator-worker.wasm')) {
    const { wasm } = await __assets;
    return new Response(wasm, { headers: { 'Content-Type': 'application/wasm' } });
  }
  if (!__origFetch) throw new Error('fetch er ikke tilgængelig i denne worker');
  return __origFetch(resource, init);
};
const __origImportScripts = self.importScripts.bind(self);
self.importScripts = function(...urls) {
  // Glue-scriptet er allerede hentet via IPC — brug blob-URL'en synkront.
  // (__assets er altid resolved her, fordi fetch af wasm'en afventes først.)
  const mapped = urls.map((url) => String(url).includes('bergamot-translator-worker.js') ? self.__bergamotGlueUrl : url);
  return __origImportScripts(...mapped);
};
__assets.then((assets) => { self.__bergamotGlueUrl = assets.glueUrl; });
`

/**
 * Bygger BatchTranslator med custom backing: worker fra Blob, modeller via IPC.
 * Returnerer null hvis miljøet ikke understøtter det (browser/manglende filer).
 */
async function createTranslator(): Promise<TranslatorModule | null> {
  if (!isElectron()) return null

  const pairs = await loadAvailablePairs()
  if (pairs.size === 0) return null

  status = 'loading'

  const assets = await window.electronTranslation!.workerAssets()
  const { BatchTranslator, TranslatorBacking } = await import('@browsermt/bergamot-translator/translator.js')

  class IpcBacking extends TranslatorBacking {
    // NB: stavefejlen "Registery" matcher pakkens API.
    async loadModelRegistery() {
      const registry = await window.electronTranslation!.registry()
      return registry.map(({ from, to }) => ({ from, to, files: {} }))
    }

    async loadTranslationModel({ from, to }: { from: string; to: string }) {
      const files = await window.electronTranslation!.modelFiles(`${from}${to}`)
      const config: Record<string, string> = {}
      if (files.gemmPrecision) config['gemm-precision'] = files.gemmPrecision
      return {
        model: files.model,
        shortlist: files.shortlist,
        vocabs: files.vocabs,
        qualityModel: null,
        config,
      }
    }

    async loadWorker() {
      const workerBlob = new Blob([WORKER_PRELUDE, '\n', assets.workerJs], { type: 'text/javascript' })
      const worker = new Worker(URL.createObjectURL(workerBlob))
      // Overfør WASM-binaren med det samme; prelude'et venter på den.
      const wasmCopy = assets.wasm.slice(0)
      worker.postMessage({ type: '__bergamot_assets', wasm: wasmCopy, glueJs: assets.glueJs }, [wasmCopy])

      // Resten er samme besked-plumbing som pakkens egen loadWorker.
      let serial = 0
      const pending = new Map<number, { accept: (v: unknown) => void; reject: (e: Error) => void }>()
      const call = (name: string, ...args: unknown[]) => new Promise((accept, reject) => {
        const id = ++serial
        pending.set(id, { accept, reject })
        worker.postMessage({ id, name, args })
      })
      worker.addEventListener('message', ({ data }: MessageEvent) => {
        if (!data || typeof data.id !== 'number' || !pending.has(data.id)) return
        const { accept, reject } = pending.get(data.id)!
        pending.delete(data.id)
        if (data.error !== undefined) reject(Object.assign(new Error(), data.error))
        else accept(data.result)
      })
      worker.addEventListener('error', (event) => {
        console.error('Bergamot worker-fejl:', event)
        // A dead worker never answers; fail the waiting calls so the queue and fallback move on.
        for (const { reject } of pending.values()) reject(new Error('Bergamot worker stoppede'))
        pending.clear()
      })

      await call('initialize', this.options)

      return {
        worker,
        exports: new Proxy({}, {
          get(_target, name) {
            if (name !== 'then') return (...args: unknown[]) => call(String(name), ...args)
          },
        }),
      }
    }
  }

  const backing = new IpcBacking({ cacheSize: 400, downloadTimeout: 0 })
  const translator = new BatchTranslator({ pivotLanguage: null, workers: 1 }, backing)
  return translator as unknown as TranslatorModule
}

/**
 * Bergamot's WASM worker never frees a loaded model, and its heap runs out after ~5 models
 * (verified: the 6th aborts with "Failed to allocate memory on CPU"). Keep at most this many;
 * a language switch beyond it starts a fresh engine.
 */
const MAX_LOADED_MODELS = 4
let loadedModels = new Set<string>()
// Translations run one at a time so an engine reset never cuts off a translation in flight.
let queue: Promise<unknown> = Promise.resolve()

export function planModelLoad(loaded: Set<string>, needed: string[], budget: number): { reset: boolean; loaded: Set<string> } {
  const merged = new Set([...loaded, ...needed])
  if (merged.size <= budget) return { reset: false, loaded: merged }
  return { reset: true, loaded: new Set(needed) }
}

/** Oversætter med Bergamot. Returnerer null hvis motoren/modellen ikke er tilgængelig. */
export function bergamotTranslate(text: string, from: GuideLanguage, to: GuideLanguage): Promise<string | null> {
  const run = queue.then(() => translateNow(text, from, to))
  queue = run.catch(() => undefined)
  return run
}

async function translateNow(text: string, from: GuideLanguage, to: GuideLanguage): Promise<string | null> {
  if (!text.trim()) return text
  try {
    const hasDirectModel = await hasBergamotModel(from, to)
    const canPivotThroughEnglish = from !== 'en' && to !== 'en'
      && await hasBergamotModel(from, 'en')
      && await hasBergamotModel('en', to)
    if (!hasDirectModel && !canPivotThroughEnglish) return null

    const plan = planModelLoad(loadedModels, hasDirectModel ? [`${from}${to}`] : [`${from}en`, `en${to}`], MAX_LOADED_MODELS)
    if (plan.reset && translatorPromise) {
      const previous = await translatorPromise
      translatorPromise = null
      await previous?.delete()
    }
    loadedModels = plan.loaded

    if (!translatorPromise) {
      translatorPromise = createTranslator()
        .then((translator) => {
          status = translator ? 'ready' : 'unavailable'
          return translator
        })
        .catch((error) => {
          console.error('Bergamot kunne ikke initialiseres:', error)
          status = 'error'
          return null
        })
    }

    const translator = await translatorPromise
    if (!translator) return null

    if (hasDirectModel) {
      const response = await translator.translate({ from, to, text, html: false })
      return response.target.text
    }

    const english = await translator.translate({ from, to: 'en', text, html: false })
    const response = await translator.translate({ from: 'en', to, text: english.target.text, html: false })
    return response.target.text
  } catch (error) {
    console.error('Bergamot-oversættelse fejlede:', error)
    // A crashed WASM worker cannot recover; the next translation starts a fresh engine.
    const failed = translatorPromise
    translatorPromise = null
    loadedModels = new Set()
    failed?.then((translator) => translator?.delete()).catch(() => undefined)
    return null
  }
}
