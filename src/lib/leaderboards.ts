// Fælles, hærdet lag for spillenes highscores.
//
// Baggrunden: hvert spil havde sin egen kopi af "læs leaderboard, migrér, gem",
// og ingen af dem kontrollerede at data rent faktisk havde den form koden
// forventede. Fik et spil et fladt array hvor der skulle stå et objekt opdelt
// pr. sværhedsgrad (hvilket skete, fordi den lokale kopi blev skrevet forkert),
// kaldte koden en array-metode på et enkelt highscore-objekt, og HELE appen
// faldt ned på den røde fejlskærm.
//
// Derfor: alt der læses udefra går gennem normaliseringen herunder. Den kan
// ikke kaste, og den returnerer altid den form kalderen forventer — uanset hvad
// der lå i data.

import { setKvObjectField, upsertInKvArray, upsertInNestedKvArray } from '@/lib/kvArrays'
import { getCreatorEmail } from '@/lib/userRoles'

export interface LeaderboardEntry {
  id: string
  email: string
  score: number
  /** Kun spil med baner (Brick Break) bruger denne. */
  level?: number
  timestamp: number
}

export type NestedLeaderboard<D extends string = string> = Record<D, LeaderboardEntry[]>

const MAX_ENTRIES_PER_BOARD = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Gør én række brugbar, eller kasserer den. En manglende `id` udfyldes fra
 * e-mailen (gamle rækker blev gemt uden), og en score der ikke er et rigtigt tal
 * kasseres i stedet for at ende som "NaN" på skærmen eller ødelægge sorteringen.
 */
function normalizeEntry(value: unknown): LeaderboardEntry | null {
  if (!isRecord(value)) return null
  const email = typeof value.email === 'string' ? value.email : null
  if (!email) return null
  const score = typeof value.score === 'number' && Number.isFinite(value.score) ? Math.trunc(value.score) : null
  if (score === null || score < 0) return null
  const id = typeof value.id === 'string' && value.id ? value.id : email
  const level = typeof value.level === 'number' && Number.isFinite(value.level) ? Math.trunc(value.level) : undefined
  const timestamp = typeof value.timestamp === 'number' && Number.isFinite(value.timestamp) ? value.timestamp : 0
  return level === undefined ? { id, email, score, timestamp } : { id, email, score, timestamp, level }
}

/** Højeste score først; ved lighed vinder den ældste (den blev sat først). */
function byScore(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || a.timestamp - b.timestamp
}

/**
 * Én række pr. spiller. Har samme spiller flere rækker (kunne ske når to
 * klienter gemte samtidig), beholdes den bedste.
 */
function bestPerPlayer(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>()
  for (const entry of entries) {
    const existing = best.get(entry.email)
    if (!existing || entry.score > existing.score) best.set(entry.email, entry)
  }
  return Array.from(best.values()).sort(byScore).slice(0, MAX_ENTRIES_PER_BOARD)
}

/** Læser en flad highscore-liste (fx Tetris) fra hvad som helst uden at kunne kaste. */
export function normalizeFlatLeaderboard(data: unknown): LeaderboardEntry[] {
  if (Array.isArray(data)) {
    return bestPerPlayer(data.map(normalizeEntry).filter((entry): entry is LeaderboardEntry => entry !== null))
  }
  // Gammel form: opdelt pr. sværhedsgrad. Slås sammen til spillerens bedste.
  if (!isRecord(data)) return []
  const flattened: LeaderboardEntry[] = []
  for (const board of Object.values(data)) {
    if (!Array.isArray(board)) continue
    for (const entry of board) {
      const normalized = normalizeEntry(entry)
      if (normalized) flattened.push(normalized)
    }
  }
  return bestPerPlayer(flattened)
}

/**
 * Læser en highscore-liste opdelt pr. sværhedsgrad. `categories` bestemmer hvilke
 * nøgler resultatet ALTID indeholder, så kalderen aldrig kan ramme en manglende.
 * Et fladt array (forkert gemt eller spejlet) lander i den første kategori i
 * stedet for at vælte skærmen.
 */
export function normalizeNestedLeaderboard<D extends string>(data: unknown, categories: readonly D[]): NestedLeaderboard<D> {
  const result = Object.fromEntries(categories.map((category) => [category, [] as LeaderboardEntry[]])) as NestedLeaderboard<D>
  if (Array.isArray(data)) {
    result[categories[0]] = normalizeFlatLeaderboard(data)
    return result
  }
  if (!isRecord(data)) return result
  for (const category of categories) {
    const board = data[category]
    if (!Array.isArray(board)) continue
    result[category] = bestPerPlayer(board.map(normalizeEntry).filter((entry): entry is LeaderboardEntry => entry !== null))
  }
  return result
}

export interface HighscoreResult {
  /** True hvis scoren blev gemt; false hvis den ikke slog spillerens egen rekord. */
  saved: boolean
  /** Spillerens gældende rekord efter forsøget. */
  best: number
}

const SUBMIT_ATTEMPTS = 4

/**
 * Gemmer en score, men kun hvis den slår spillerens egen rekord — og gør det
 * sikkert når flere spiller samtidig.
 *
 * Det gamle mønster var "læs listen, sammenlign, skriv". Sluttede to spillere
 * i samme øjeblik, kunne den ene skrive oven i den andens rekord. Her læses
 * altid den friske liste umiddelbart før skrivningen, og en afvist skrivning
 * (en anden nåede at ændre nøglen) prøves forfra med de nye data. Dermed kan en
 * rekord aldrig sættes NED, og ingen andres rekord forsvinder.
 *
 * `path` angiver sværhedsgraden for de spil der er opdelt; udelades den, er
 * listen flad.
 *
 * Creator-kontoen bruges til at afprøve spillene, så dens scorer holdes helt
 * ude af listerne.
 */
export async function submitHighscore(
  key: string,
  entry: Omit<LeaderboardEntry, 'id'> & { id?: string },
  options: { path?: string[]; categories?: readonly string[] } = {},
): Promise<HighscoreResult> {
  const candidate: LeaderboardEntry = { ...entry, id: entry.id || entry.email }
  const category = options.path?.[0]

  if (await isCreatorAccount(candidate.email)) return { saved: false, best: candidate.score }

  for (let attempt = 0; attempt < SUBMIT_ATTEMPTS; attempt++) {
    const stored = await window.kv.get<unknown>(key)
    const board = category
      ? normalizeNestedLeaderboard(stored, options.categories && options.categories.length > 0 ? options.categories : [category])[category] || []
      : normalizeFlatLeaderboard(stored)
    const existing = board.find((item) => item.email === candidate.email)

    if (existing && existing.score >= candidate.score) return { saved: false, best: existing.score }

    try {
      if (options.path) await upsertInNestedKvArray<LeaderboardEntry>(key, options.path, [candidate])
      else await upsertInKvArray<LeaderboardEntry>(key, [candidate])
      return { saved: true, best: candidate.score }
    } catch (error) {
      const conflict = String(error).includes('KV_CONFLICT')
      if (!conflict || attempt === SUBMIT_ATTEMPTS - 1) throw error
    }
  }

  return { saved: false, best: candidate.score }
}

async function isCreatorAccount(email: string): Promise<boolean> {
  try {
    const creatorEmail = await getCreatorEmail()
    return !!creatorEmail && email.trim().toLowerCase() === creatorEmail.trim().toLowerCase()
  } catch {
    return false
  }
}

/**
 * Besked til spilleren når en score IKKE kunne gemmes. Før stod fejlen kun i
 * loggen, så spilleren troede rekorden var registreret.
 */
export function scoreSaveFailedMessage(language: string): string {
  if (language === 'da') return 'Din score kunne ikke gemmes. Tjek forbindelsen til det delte drev.'
  if (language === 'fi') return 'Tulostasi ei voitu tallentaa. Tarkista yhteys jaettuun asemaan.'
  return 'Your score could not be saved. Check the connection to the shared drive.'
}

/**
 * Tæller ét spillet spil for én spiller.
 *
 * Før blev hele tælle-objektet læst og skrevet tilbage, så sluttede to kolleger
 * et spil samtidig, forsvandt den enes tælling. Her skrives kun spillerens eget
 * felt — under samme fillås — så ingen andres tal kan overskrives.
 *
 * Creator-kontoen tælles ikke med, ligesom den holdes ude af alle andre lister.
 */
export async function recordGamePlay(key: string, email: string, category?: string): Promise<void> {
  if (!email) return
  if (await isCreatorAccount(email)) return
  const counts = await window.kv.get<Record<string, unknown>>(key)
  const mine = isRecord(counts?.[email]) ? (counts![email] as Record<string, unknown>) : {}
  const field = category || 'all'
  const current = numberOrNull(mine[field]) ?? (field === 'all' ? legacyTotal(mine) : 0)
  await setKvObjectField(key, email, { ...mine, [field]: current + 1 })
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Tetris talte før pr. sværhedsgrad og blev siden slået sammen til ét tal. Uden
 * dette ville en spillers gamle runder pludselig tælle fra nul igen.
 */
function legacyTotal(counts: Record<string, unknown>): number {
  let total = 0
  for (const value of Object.values(counts)) total += numberOrNull(value) ?? 0
  return total
}
