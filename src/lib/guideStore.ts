// Versionshistorik og oprydning for Guide Bibliotek 2.0.
// Historik gemmes i separat KV-nøgle pr. guide, så 'guides'-listen forbliver lille.

import { fileStorage } from './fileStorage'
import type { Guide, GuideVersionEntry } from './guideTypes'
import { collectImageIds } from './guideTypes'

const MAX_VERSION_ENTRIES = 50

export function versionsKey(guideId: string): string {
  return `guide-versions-${guideId}`
}

/** "1.02" -> "1.03". Ugyldige/gamle værdier bliver "1.00". */
export function bumpVersion(version?: string): string {
  const parsed = Number.parseFloat(version || '')
  if (Number.isNaN(parsed) || parsed <= 0) return '1.00'
  return ((Math.round(parsed * 100) + 1) / 100).toFixed(2)
}

export async function getVersionHistory(guideId: string): Promise<GuideVersionEntry[]> {
  return (await window.kv.get<GuideVersionEntry[]>(versionsKey(guideId))) || []
}

/** Gemmer et snapshot af guidens indhold som ny version (nyeste først, beskåret til 50). */
export async function saveVersionSnapshot(guide: Guide, savedBy: string, changeNote?: string): Promise<void> {
  const entry: GuideVersionEntry = {
    version: guide.version || '1.00',
    savedAt: Date.now(),
    savedBy,
    changeNote: changeNote?.trim() || undefined,
    snapshot: {
      title: guide.title,
      category: guide.category,
      tags: guide.tags,
      sections: guide.sections || [],
      coverImageId: guide.coverImageId,
    },
  }
  const history = await getVersionHistory(guide.id)
  await window.kv.set(versionsKey(guide.id), [entry, ...history].slice(0, MAX_VERSION_ENTRIES))
}

/** Sletter versionshistorik og alle billeder når en guide slettes. */
export async function deleteGuideArtifacts(guide: Guide): Promise<void> {
  try {
    await window.kv.delete(versionsKey(guide.id))
  } catch (error) {
    console.error('Kunne ikke slette versionshistorik:', error)
  }
  for (const imageId of collectImageIds(guide)) {
    try {
      await fileStorage.deleteFile(`kv://${imageId}`)
    } catch (error) {
      console.error(`Kunne ikke slette billede ${imageId}:`, error)
    }
  }
}
