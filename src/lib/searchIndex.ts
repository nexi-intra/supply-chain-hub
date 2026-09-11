// Lokal søgemotor for guidebiblioteket: BM25 over chunks (guide-metadata,
// sektioner, trin) med dansk/engelsk stopord, let stemming, synonym-udvidelse
// og fuzzy-match (Levenshtein). Ingen ekstern AI-tjeneste — deterministisk og
// offline. Bruges af både bibliotekssøgningen og RAG-chatbotten.

import type { Guide } from './guideTypes'
import { migrateGuide } from './guideTypes'
import { getDictionaryPairs } from './translator'

export interface SearchChunk {
  guideId: string
  guideTitle: string
  /** '' for metadata-chunk (titel/tags/kategori), ellers fx "2.0" */
  sectionNumber: string
  /** Sat for trin-chunks, fx "2.3" */
  stepNumber?: string
  heading: string
  text: string
}

export interface SearchHit {
  chunk: SearchChunk
  /** Rå BM25-score */
  score: number
  /** 0-1 relativt til bedste hit — vises som relevans-% */
  normalizedScore: number
}

export interface GuideSearchResult {
  guideId: string
  score: number
  normalizedScore: number
  bestChunk: SearchChunk
}

const STOPWORDS = new Set([
  // dansk
  'og', 'i', 'jeg', 'det', 'at', 'en', 'den', 'til', 'er', 'som', 'på', 'de', 'med', 'han', 'af', 'for', 'ikke',
  'der', 'var', 'mig', 'sig', 'men', 'et', 'har', 'om', 'vi', 'min', 'havde', 'ham', 'hun', 'nu', 'over', 'da',
  'fra', 'du', 'ud', 'sin', 'dem', 'os', 'op', 'man', 'hans', 'hvor', 'eller', 'hvad', 'skal', 'selv', 'her',
  'alle', 'vil', 'blev', 'kunne', 'ind', 'når', 'være', 'dog', 'noget', 'ville', 'jo', 'deres', 'efter', 'ned',
  'skulle', 'denne', 'end', 'dette', 'mit', 'også', 'under', 'have', 'dig', 'anden', 'hende', 'mine', 'alt',
  'meget', 'sit', 'sine', 'vor', 'mod', 'disse', 'hvis', 'din', 'nogle', 'hos', 'blive', 'mange', 'ad', 'bliver',
  'hendes', 'været', 'thi', 'jer', 'sådan',
  // engelsk
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in',
  'on', 'at', 'by', 'it', 'its', 'this', 'that', 'with', 'as', 'from', 'you', 'your', 'will', 'can', 'do', 'does',
  'not', 'no', 'yes', 'we', 'they', 'them', 'their', 'has', 'have', 'had', 'when', 'where', 'how', 'what', 'which',
])

// Domæne-synonymer (begge retninger). Udvides løbende.
const SYNONYM_GROUPS: string[][] = [
  ['terminal', 'betalingsterminal', 'dankortterminal'],
  ['opsætning', 'setup', 'installation', 'installer', 'konfiguration', 'konfigurer'],
  ['label', 'etiket', 'mærkat'],
  ['print', 'udskriv', 'udskrivning', 'printer'],
  ['kvittering', 'bon', 'receipt'],
  ['fejl', 'error', 'fejlmeddelelse', 'problem'],
  ['ordre', 'order', 'bestilling'],
  ['levering', 'delivery', 'forsendelse'],
  ['scan', 'skan', 'indscan', 'scanning'],
  ['serienummer', 'serial', 'sn'],
  ['kabel', 'ledning', 'cable'],
  ['strøm', 'power', 'opladning'],
  ['guide', 'vejledning', 'manual', 'instruks'],
  ['retur', 'return', 'returnering'],
]

const SYNONYMS = new Map<string, string[]>()
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    SYNONYMS.set(word, group.filter((w) => w !== word))
  }
}
// Dansk↔engelsk ordbog fra oversætteren, så danske søgninger rammer engelske
// guides og omvendt (tosproget retrieval til søgning + chatbot).
for (const [da, en] of getDictionaryPairs()) {
  if (da === en) continue
  const existingDa = SYNONYMS.get(da) || []
  if (!existingDa.includes(en)) SYNONYMS.set(da, [...existingDa, en])
  const existingEn = SYNONYMS.get(en) || []
  if (!existingEn.includes(da)) SYNONYMS.set(en, [...existingEn, da])
}

/** Let suffiks-stemming for dansk/engelsk — bevidst konservativ. */
function stem(token: string): string {
  if (token.length <= 4) return token
  for (const suffix of ['ningerne', 'ningen', 'ninger', 'erne', 'ene', 'erne', 'heden', 'ing', 'ning', 'er', 'en', 'et', 'es', 'e', 's']) {
    if (token.length - suffix.length >= 3 && token.endsWith(suffix)) {
      return token.slice(0, token.length - suffix.length)
    }
  }
  return token
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9æøåü]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem)
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    let rowMin = row[0]
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = temp
      if (row[j] < rowMin) rowMin = row[j]
    }
    if (rowMin > max) return max + 1
  }
  return row[b.length]
}

const BM25_K1 = 1.5
const BM25_B = 0.75

interface IndexedChunk {
  chunk: SearchChunk
  termFreq: Map<string, number>
  length: number
}

export class GuideSearchIndex {
  private docs: IndexedChunk[] = []
  private docFreq = new Map<string, number>()
  private avgLength = 0
  private vocabulary: string[] = []

  build(guides: Guide[]): void {
    this.docs = []
    this.docFreq = new Map()

    for (const raw of guides) {
      const guide = migrateGuide(raw)
      const chunks: SearchChunk[] = []

      chunks.push({
        guideId: guide.id,
        guideTitle: guide.title,
        sectionNumber: '',
        heading: guide.title,
        text: `${guide.title} ${guide.category} ${guide.tags.join(' ')}`,
      })

      const sections = guide.sections || []
      sections.forEach((section, sIndex) => {
        const sectionNumber = `${sIndex + 1}.0`
        if (section.heading) {
          chunks.push({
            guideId: guide.id,
            guideTitle: guide.title,
            sectionNumber,
            heading: section.heading,
            text: section.heading,
          })
        }
        section.steps.forEach((step, stIndex) => {
          if (!step.text) return
          chunks.push({
            guideId: guide.id,
            guideTitle: guide.title,
            sectionNumber,
            stepNumber: `${sIndex + 1}.${stIndex + 1}`,
            heading: section.heading,
            text: step.text,
          })
        })
      })

      if (sections.length === 0 && guide.content) {
        chunks.push({
          guideId: guide.id,
          guideTitle: guide.title,
          sectionNumber: '',
          heading: guide.title,
          text: guide.content,
        })
      }

      for (const chunk of chunks) {
        const tokens = tokenize(chunk.text)
        if (tokens.length === 0) continue
        const termFreq = new Map<string, number>()
        for (const token of tokens) {
          termFreq.set(token, (termFreq.get(token) || 0) + 1)
        }
        for (const term of termFreq.keys()) {
          this.docFreq.set(term, (this.docFreq.get(term) || 0) + 1)
        }
        this.docs.push({ chunk, termFreq, length: tokens.length })
      }
    }

    this.avgLength = this.docs.length > 0
      ? this.docs.reduce((sum, d) => sum + d.length, 0) / this.docs.length
      : 0
    this.vocabulary = [...this.docFreq.keys()]
  }

  get chunkCount(): number {
    return this.docs.length
  }

  /** Udvider query-tokens med synonymer og fuzzy-matches fra ordforrådet. */
  private expandQuery(queryTokens: string[]): Map<string, number> {
    const weighted = new Map<string, number>()
    for (const token of queryTokens) {
      weighted.set(token, Math.max(weighted.get(token) || 0, 1))

      for (const synonym of SYNONYMS.get(token) || []) {
        const stemmed = stem(synonym)
        weighted.set(stemmed, Math.max(weighted.get(stemmed) || 0, 0.8))
      }

      // Fuzzy kun for ukendte tokens, så stavefejl stadig rammer.
      if (!this.docFreq.has(token) && token.length >= 4) {
        const maxDistance = token.length >= 7 ? 2 : 1
        for (const term of this.vocabulary) {
          if (levenshtein(token, term, maxDistance) <= maxDistance) {
            weighted.set(term, Math.max(weighted.get(term) || 0, 0.6))
          }
        }
      }
    }
    return weighted
  }

  search(query: string, limit = 10): SearchHit[] {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0 || this.docs.length === 0) return []

    const weightedTerms = this.expandQuery(queryTokens)
    const totalDocs = this.docs.length
    const hits: Array<{ doc: IndexedChunk; score: number }> = []

    for (const doc of this.docs) {
      let score = 0
      for (const [term, weight] of weightedTerms) {
        const tf = doc.termFreq.get(term)
        if (!tf) continue
        const df = this.docFreq.get(term) || 1
        const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5))
        const norm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.length / this.avgLength)))
        score += idf * norm * weight
      }
      if (score > 0) hits.push({ doc, score })
    }

    hits.sort((a, b) => b.score - a.score)
    const top = hits.slice(0, limit)
    const maxScore = top.length > 0 ? top[0].score : 1
    return top.map(({ doc, score }) => ({
      chunk: doc.chunk,
      score,
      normalizedScore: score / maxScore,
    }))
  }

  /** Guide-niveau-resultater: bedste chunk-score pr. guide, rangeret. */
  searchGuides(query: string, limit = 20): GuideSearchResult[] {
    const hits = this.search(query, 100)
    const byGuide = new Map<string, GuideSearchResult>()
    for (const hit of hits) {
      const existing = byGuide.get(hit.chunk.guideId)
      if (!existing || hit.score > existing.score) {
        byGuide.set(hit.chunk.guideId, {
          guideId: hit.chunk.guideId,
          score: hit.score,
          normalizedScore: hit.normalizedScore,
          bestChunk: hit.chunk,
        })
      }
    }
    return [...byGuide.values()].sort((a, b) => b.score - a.score).slice(0, limit)
  }
}
