import type { Language } from '@/lib/translations'

export interface WarehouseLabels {
  title: string
  hubDescription: string
}

// The module was Lagerstyring; with Stempelkort it holds more than warehouse tools, so it is Arbejdsværktøjer.
// Every team opens it and sees only its own tools, so the description names no team.
const da: WarehouseLabels = { title: 'Arbejdsværktøjer', hubDescription: 'Værktøjer til dit teams daglige arbejde' }
const en: WarehouseLabels = { title: 'Work Tools', hubDescription: "Tools for your team's daily work" }
const fi: WarehouseLabels = { title: 'Työkalut', hubDescription: 'Työkalut tiimisi päivittäiseen työhön' }
const sv: WarehouseLabels = { title: 'Arbetsverktyg', hubDescription: 'Verktyg för ditt teams dagliga arbete' }

export const WAREHOUSE_LABELS: Record<Language, WarehouseLabels> = { da, en, fi, sv }
export const getWarehouseLabels = (language: Language): WarehouseLabels => WAREHOUSE_LABELS[language] ?? en
/** The teams of the first four tools (Stempelkort, Placeringer, Optælling, Softwareload). The module itself is open to every team. */
export const WAREHOUSE_TEAMS = ['TCD', 'TRR'] as const
export const isWarehouseTeam = (teamId: string | null | undefined) => (WAREHOUSE_TEAMS as readonly string[]).includes(teamId ?? '')
