// SAP's material descriptions, shared by TCD and TRR (SAP texts are the same for both; no team data). Learned from
// every MB52 fetch and material document lookup, and asked for on purpose through MM60. Never from the placement sheet.
const CATALOG_KEY = 'materialtekster'
const RETRY_MS = 10 * 60000

const codeOf = material => String(material || '').trim().toUpperCase()

function createMaterialCatalog({ sharedStore, fetcher, now = Date.now }) {
  const load = async () => (await sharedStore.getAsync(CATALOG_KEY)) || {}
  // Materials MM60 was asked about lately, so a material SAP does not know is not asked for on every action.
  const tried = new Map()

  /** The stored descriptions of these materials; unknown ones are left out. */
  async function describe(materials) {
    const stored = await load()
    const result = {}
    for (const material of materials || []) {
      const code = codeOf(material)
      if (stored[code]?.description) result[code] = stored[code].description
    }
    return result
  }

  /** Stores new or changed texts in one write; nothing is written when nothing changed. */
  async function learn(entries) {
    const stored = await load()
    let changed = false
    for (const entry of entries || []) {
      const material = codeOf(entry?.material)
      const description = String(entry?.description || '').replace(/\s+/g, ' ').trim()
      if (!material || !description || stored[material]?.description === description) continue
      stored[material] = { description, source: entry.source, at: now() }
      changed = true
    }
    if (changed) await sharedStore.setAsync(CATALOG_KEY, stored)
  }

  /** Fresh texts from SAP: MB52 for everything in stock, MM60 for the rest. `unknown` is what SAP does not know. */
  async function describeFromSap(materials, { onProgress } = {}) {
    const progress = step => { try { onProgress?.(step) } catch {} }
    const wanted = [...new Set((materials || []).map(codeOf).filter(Boolean))]
    // MB52 only (serial numbers are not needed for descriptions); its steps are passed on, 'done' is said once at the end.
    const { mb52 = [] } = await fetcher.fetchStock({ onProgress: step => { if (step !== 'done') progress(step) } })
    const texts = {}
    for (const row of mb52) if (row.material && row.description && !texts[row.material]) texts[row.material] = row.description
    const entries = Object.entries(texts).map(([material, description]) => ({ material, description, source: 'mb52' }))
    const rest = wanted.filter(material => !texts[material])
    let unchecked = []
    let mm60Error = null
    if (rest.length) {
      progress('mm60')
      try {
        for (const row of await fetcher.fetchMaterialTexts({ materials: rest })) {
          texts[row.material] = row.description
          entries.push({ material: row.material, description: row.description, source: 'mm60' })
        }
      } catch (error) {
        // MM60 failing does not stop the caller: what MB52 knew is kept, the rest is reported as not checked.
        unchecked = rest
        mm60Error = String(error?.message || error?.code || 'MM60')
      }
    }
    await learn(entries)
    progress('done')
    const result = { texts: Object.fromEntries(wanted.filter(material => texts[material]).map(material => [material, texts[material]])), unknown: wanted.filter(material => !texts[material] && !unchecked.includes(material)) }
    return unchecked.length ? { ...result, unchecked, mm60Error } : result
  }

  /**
   * In the background: SAP's text for materials the catalog does not know yet (typed by hand, no stock in MB52).
   * Never throws; when SAP is not ready it is simply tried again next time.
   */
  async function describeMissing(materials) {
    try {
      const stored = await load()
      const wanted = [...new Set((materials || []).map(codeOf).filter(Boolean))]
        .filter(material => !stored[material]?.description && !(tried.has(material) && now() - tried.get(material) < RETRY_MS))
      if (!wanted.length) return
      // One material at a time as an argument: a background lookup never overwrites the person's clipboard.
      const rows = await fetcher.fetchMaterialTexts({ materials: wanted.slice(0, 5), useClipboard: false })
      for (const material of wanted.slice(0, 5)) tried.set(material, now())
      await learn(rows.map(row => ({ material: row.material, description: row.description, source: 'mm60' })))
    } catch {}
  }

  return { describe, learn, describeFromSap, describeMissing }
}

/** The fetcher Optælling and Placeringer use: same answers, and the catalog learns the descriptions on the way. */
function withLearning(fetcher, catalog) {
  const quietly = entries => { Promise.resolve().then(() => catalog.learn(entries)).catch(() => {}) }
  return {
    ...fetcher,
    async fetchPlant(...args) {
      const result = await fetcher.fetchPlant(...args)
      quietly((result?.mb52 || []).map(row => ({ material: row.material, description: row.description, source: 'mb52' })))
      return result
    },
    async fetchStock(...args) {
      const result = await fetcher.fetchStock(...args)
      quietly((result?.mb52 || []).map(row => ({ material: row.material, description: row.description, source: 'mb52' })))
      return result
    },
    async fetchMatdoc(...args) {
      const result = await fetcher.fetchMatdoc(...args)
      quietly((result?.rows || []).map(row => ({ material: row.material, description: row.description, source: 'matdoc' })))
      return result
    },
  }
}

module.exports = { createMaterialCatalog, withLearning, CATALOG_KEY }
