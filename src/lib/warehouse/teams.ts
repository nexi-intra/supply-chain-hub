import type { TeamId } from '@/types/warehouse'

/** The storage locations of each team in plant D301, as in electron/warehouse/teams.cjs. */
export const TEAM_SLOCS: Readonly<Record<TeamId, readonly string[]>> = {
  TCD: ['D000', 'D004', 'D005', 'D006', 'D102', 'D103', 'D104', 'D105', 'D106'],
  TRR: ['D001', 'D002', 'D003'],
}
