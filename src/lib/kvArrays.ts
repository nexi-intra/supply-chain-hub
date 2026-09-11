// Fælles helpers for delte KV-arrays. Bruger den atomare kv:update-operation
// (fil-lås i desktop-appen), så to klienter der skriver samtidig ikke taber
// hinandens elementer — i modsætning til det gamle mønster "læs hele arrayet,
// ændr, skriv hele arrayet".

export async function appendToKvArray<T extends { id: string }>(key: string, items: T[]): Promise<T[]> {
  if (items.length === 0) return (await window.kv.get<T[]>(key)) || []
  return window.kv.update<T>(key, { op: 'append', items })
}

export async function upsertInKvArray<T extends { id: string }>(key: string, items: T[]): Promise<T[]> {
  if (items.length === 0) return (await window.kv.get<T[]>(key)) || []
  return window.kv.update<T>(key, { op: 'upsert', items })
}

export async function removeFromKvArray<T extends { id: string }>(key: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return (await window.kv.get<T[]>(key)) || []
  return window.kv.update<T>(key, { op: 'remove', ids })
}

/**
 * Læser det friske element, anvender ændringen og gemmer atomart.
 * Returnerer null hvis elementet ikke findes (fx slettet af anden klient).
 */
export async function updateKvArrayItem<T extends { id: string }>(
  key: string,
  id: string,
  updater: (current: T) => T,
): Promise<T | null> {
  const list = (await window.kv.get<T[]>(key)) || []
  const current = list.find((entry) => entry?.id === id)
  if (!current) return null
  const updated = updater(current)
  await window.kv.update<T>(key, { op: 'upsert', items: [updated] })
  return updated
}

/**
 * Samme atomare upsert som `upsertInKvArray`, men for et array der ligger nested
 * i et objekt (fx et leaderboard opdelt pr. sværhedsgrad: { easy: [...], hard: [...] }).
 * Kun arrayet på `path` opdateres — resten af objektet bevares uændret.
 */
export async function upsertInNestedKvArray<T extends { id: string }>(
  key: string,
  path: string[],
  items: T[],
): Promise<T[]> {
  return window.kv.update<T>(key, { op: 'upsert', items, path })
}

/**
 * Atomar opdatering af ét felt i et objekt (fx 'users', keyet pr. email) under
 * samme fil-lås som array-helperne ovenfor — bruges hvor data ikke er et array
 * af {id}-objekter, men et opslagsobjekt.
 */
export async function setKvObjectField(key: string, field: string, value: unknown): Promise<Record<string, unknown>> {
  return window.kv.updateField(key, { op: 'setField', field, value })
}

/** Fjerner ét felt (fx én bruger) fra et opslagsobjekt under fil-lås. */
export async function deleteKvObjectField(key: string, field: string): Promise<Record<string, unknown>> {
  return window.kv.updateField(key, { op: 'deleteField', field })
}
