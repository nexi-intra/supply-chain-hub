// Backup af hele KV-storen som én JSON-fil. Bruges til versionsmigrering
// (gammel version → eksportér, ny version → importér) og som sikkerhedskopi.

export interface BackupFile {
  app: 'tcd-hub'
  formatVersion: 1
  exportedAt: string
  data: Record<string, unknown>
}

export async function createBackup(): Promise<BackupFile> {
  const keys = await window.kv.keys()
  const data: Record<string, unknown> = {}
  for (const key of keys) {
    const value = await window.kv.get(key)
    if (value !== undefined) data[key] = value
  }
  return {
    app: 'tcd-hub',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
}

export function downloadBackup(backup: BackupFile): string {
  const date = backup.exportedAt.slice(0, 10)
  const filename = `tcd-hub-backup-${date}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text)
  if (parsed?.app !== 'tcd-hub' || parsed?.formatVersion !== 1 || typeof parsed?.data !== 'object' || parsed.data === null) {
    throw new Error('Filen er ikke en gyldig TCD Hub-backup')
  }
  return parsed as BackupFile
}

/** Skriver alle keys fra backuppen ind i storen (overskriver eksisterende). */
export async function restoreBackup(backup: BackupFile): Promise<number> {
  const entries = Object.entries(backup.data)
  for (const [key, value] of entries) {
    await window.kv.set(key, value)
  }
  return entries.length
}
