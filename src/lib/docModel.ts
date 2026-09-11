// Fælles dokumentmodel for HTML-preview og DOCX-generator — én kilde til
// nummerering og struktur, så preview og genereret fil altid matcher.

import type { Guide } from './guideTypes'
import { migrateGuide } from './guideTypes'

export interface DocStep {
  number: string
  text: string
  imageIds: string[]
}

export interface DocSection {
  number: string
  heading: string
  steps: DocStep[]
}

export interface DocModel {
  title: string
  version: string
  authorEmail: string
  category: string
  coverImageId?: string
  sections: DocSection[]
  updatedAt: number
}

export function guideToDocModel(guide: Guide): DocModel {
  const migrated = migrateGuide(guide)
  return {
    title: migrated.title,
    version: migrated.version || '1.00',
    authorEmail: migrated.author || migrated.createdBy || '',
    category: migrated.category,
    coverImageId: migrated.coverImageId,
    updatedAt: migrated.updatedAt,
    sections: (migrated.sections || []).map((section, sIndex) => ({
      number: `${sIndex + 1}.0`,
      heading: section.heading,
      steps: section.steps.map((step, stIndex) => ({
        number: `${sIndex + 1}.${stIndex + 1}`,
        text: step.text,
        imageIds: step.imageIds,
      })),
    })),
  }
}

/** Slår forfatterens fulde navn op i users-KV'en; falder tilbage til email-prefiks. */
export async function resolveAuthorName(email: string): Promise<string> {
  if (!email) return ''
  try {
    const users = await window.kv.get<Record<string, { fullName?: string }>>('users')
    const user = users?.[email] || users?.[email.toLowerCase()]
    if (user?.fullName) return user.fullName
  } catch {
    // KV utilgængelig — brug fallback
  }
  return email.split('@')[0]
}
