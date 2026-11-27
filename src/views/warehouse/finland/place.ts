/**
 * Where the person was in Finlandsforsendelser. It lives outside the components, so leaving the tool and coming back
 * (or switching hub) opens the same tab, day and month; the data itself comes back from the main process (`current`).
 */
export const finlandPlace: {
  tab: 'write' | 'follow'
  selected: string | null
  month: number | null
  followDay: string | null
  followMonth: number | null
  followFilter: 'all' | 'missing' | 'done' | 'late' | 'blocked'
} = { tab: 'write', selected: null, month: null, followDay: null, followMonth: null, followFilter: 'all' }
