import type { Language } from '@/lib/translations'

export interface WarehouseLabels {
  title: string
  hubDescription: string
}

const da: WarehouseLabels = { title: 'Lagerstyring', hubDescription: 'Lagerværktøjer for TCD og TRR' }
const en: WarehouseLabels = { title: 'Warehouse Management', hubDescription: 'Warehouse tools for TCD and TRR' }
const fi: WarehouseLabels = { title: 'Varastonhallinta', hubDescription: 'Varastotyökalut TCD:lle ja TRR:lle' }
const sv: WarehouseLabels = { title: 'Lagerstyrning', hubDescription: 'Lagerverktyg för TCD och TRR' }

export const WAREHOUSE_LABELS: Record<Language, WarehouseLabels> = { da, en, fi, sv }
export const getWarehouseLabels = (language: Language): WarehouseLabels => WAREHOUSE_LABELS[language] ?? en
/** Warehouse Management is a TCD and TRR module. */
export const WAREHOUSE_TEAMS = ['TCD', 'TRR'] as const
export const isWarehouseTeam = (teamId: string | null | undefined) => (WAREHOUSE_TEAMS as readonly string[]).includes(teamId ?? '')
