import type { Language } from '@/lib/translations'

export interface WarehouseLabels {
  title: string
  hubDescription: string
}

// The module was Lagerstyring; with Stempelkort it holds more than warehouse tools, so it is Arbejdsværktøjer.
const da: WarehouseLabels = { title: 'Arbejdsværktøjer', hubDescription: 'Stempelkort, placeringer og optælling for TCD og TRR' }
const en: WarehouseLabels = { title: 'Work Tools', hubDescription: 'Time card, locations and stock count for TCD and TRR' }
const fi: WarehouseLabels = { title: 'Työkalut', hubDescription: 'Leimauskortti, sijainnit ja inventointi TCD:lle ja TRR:lle' }
const sv: WarehouseLabels = { title: 'Arbetsverktyg', hubDescription: 'Stämpelkort, placeringar och inventering för TCD och TRR' }

export const WAREHOUSE_LABELS: Record<Language, WarehouseLabels> = { da, en, fi, sv }
export const getWarehouseLabels = (language: Language): WarehouseLabels => WAREHOUSE_LABELS[language] ?? en
/** Warehouse Management is a TCD and TRR module. */
export const WAREHOUSE_TEAMS = ['TCD', 'TRR'] as const
export const isWarehouseTeam = (teamId: string | null | undefined) => (WAREHOUSE_TEAMS as readonly string[]).includes(teamId ?? '')
