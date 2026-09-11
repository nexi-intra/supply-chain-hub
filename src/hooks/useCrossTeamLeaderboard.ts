import { useState, useEffect } from 'react'

export interface OtherTeamLeaderboardData<T> {
  teamCode: string
  users: Record<string, { fullName: string }>
  leaderboard: T | undefined
}

/**
 * Henter ALLE andre teams' rå data for én leaderboard-KV-nøgle (+ deres 'users' til
 * navne-opslag), til at flette highscores på tværs af Supply Chain (Fase 8 "Highscores
 * på tværs"). Highscore-skærme ses sjældent — genindlæses kun ved mount, ingen polling.
 */
export function useCrossTeamLeaderboard<T = unknown>(leaderboardKey: string) {
  const [otherTeams, setOtherTeams] = useState<Array<OtherTeamLeaderboardData<T>>>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!window.electronRegistry) {
        setIsLoading(false)
        return
      }
      const [allTeams, currentTeam] = await Promise.all([
        window.electronRegistry.listTeams(),
        window.electronRegistry.getCurrentTeam(),
      ])
      const others = allTeams.filter(team => team.teamId !== currentTeam?.teamId)
      const results = await Promise.all(others.map(async (team): Promise<OtherTeamLeaderboardData<T>> => {
        const [leaderboard, users] = await Promise.all([
          window.electronRegistry!.readTeamKey<T>(team.folderName, leaderboardKey),
          window.electronRegistry!.readTeamKey<Record<string, { fullName: string }>>(team.folderName, 'users'),
        ])
        return { teamCode: team.folderName, users: users || {}, leaderboard }
      }))
      if (!cancelled) {
        setOtherTeams(results)
        setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [leaderboardKey])

  return { otherTeams, isLoading }
}

interface RawEntry {
  id: string
  email: string
  score: number
  level?: number
  timestamp: number
}

export interface CrossTeamEntry extends RawEntry {
  displayName: string
  /** undefined = eget team (ingen tag vises). */
  teamCode?: string
}

/** Fletter en flad (ikke sværhedsgrad-opdelt) leaderboard, fx Tetris. */
export function mergeFlatLeaderboard(
  own: RawEntry[] | null | undefined,
  ownUsers: Record<string, { fullName: string }> | null | undefined,
  otherTeams: Array<OtherTeamLeaderboardData<RawEntry[]>>
): CrossTeamEntry[] {
  const merged: CrossTeamEntry[] = (own || []).map(e => ({ ...e, displayName: ownUsers?.[e.email]?.fullName || e.email }))
  for (const team of otherTeams) {
    for (const e of team.leaderboard || []) {
      merged.push({ ...e, displayName: team.users[e.email]?.fullName || e.email, teamCode: team.teamCode })
    }
  }
  return merged.sort((a, b) => b.score - a.score)
}

/** Fletter en sværhedsgrad-opdelt leaderboard (Brick Break/Neon Snake/Nexi Flyer/Endless Dodger). */
export function mergeNestedLeaderboard<D extends string>(
  own: Record<D, RawEntry[]> | null | undefined,
  ownUsers: Record<string, { fullName: string }> | null | undefined,
  otherTeams: Array<OtherTeamLeaderboardData<Record<D, RawEntry[]>>>,
  category: D
): CrossTeamEntry[] {
  const merged: CrossTeamEntry[] = (own?.[category] || []).map(e => ({ ...e, displayName: ownUsers?.[e.email]?.fullName || e.email }))
  for (const team of otherTeams) {
    for (const e of team.leaderboard?.[category] || []) {
      merged.push({ ...e, displayName: team.users[e.email]?.fullName || e.email, teamCode: team.teamCode })
    }
  }
  return merged.sort((a, b) => b.score - a.score)
}
