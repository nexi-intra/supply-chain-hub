import { useEffect, useMemo, useRef, useState } from 'react'
import { getCreatorEmail } from '@/lib/userRoles'
import type { CommandSearchSources, SearchFolder, SearchGuide, SearchNote, SearchUsers } from '@/lib/commandSearch'

// Only these keys are read here; everything else comes from the already-mounted hub notification sources.
const KV_KEYS = ['shared-guides', 'knowledge-articles', 'shared-knowledge-articles', 'users', 'notebook-notes', 'email-folders'] as const
const TEAM_DATA_TTL_MS = 5 * 60 * 1000

export type RemoteSearchSources = Pick<CommandSearchSources, 'teamCode' | 'teamLabel' | 'creatorEmail' | 'sharedGuides' | 'articles' | 'sharedArticles' | 'users' | 'otherTeams' | 'notes' | 'folders'>

interface TeamData {
  at: number
  teamCode?: string
  teamLabel?: string
  creatorEmail: string | null
  otherTeams: NonNullable<CommandSearchSources['otherTeams']>
}

async function loadTeamData(): Promise<TeamData> {
  const creatorEmail = await getCreatorEmail().catch(() => null)
  const registry = window.electronRegistry
  if (!registry) return { at: Date.now(), creatorEmail, otherTeams: [] }
  const [allTeams, current] = await Promise.all([registry.listTeams(), registry.getCurrentTeam()])
  const others = allTeams.filter(team => team.teamId !== current?.teamId).slice(0, 20)
  const results = others.length ? await registry.readTeamsKeys(others.map(team => ({ folderName: team.folderName, keys: ['users'] }))) : []
  return {
    at: Date.now(),
    teamCode: current?.folderName,
    teamLabel: current ? current.abbreviation || current.name : undefined,
    creatorEmail,
    otherTeams: others.map((team, index) => ({ label: team.abbreviation || team.name, users: (results[index]?.[0] ?? null) as SearchUsers })),
  }
}

/**
 * The few sources the hub notification state does not already hold. Read once per palette opening in a single
 * batched KV call, kept until the key changes, and never read while typing.
 */
export function useCommandSearchRemoteSources(userEmail: string, open: boolean, enabled: boolean): { sources: RemoteSearchSources; loading: boolean } {
  const values = useRef(new Map<string, unknown>())
  const teamData = useRef<TeamData | null>(null)
  const [version, setVersion] = useState(0)
  const [invalidations, setInvalidations] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    values.current.clear()
    teamData.current = null
    setVersion(current => current + 1)
  }, [userEmail])

  useEffect(() => {
    if (!enabled || !window.kv) return
    const watched = new Set<string>(KV_KEYS)
    return window.kv.subscribe(changedKeys => {
      let changed = false
      for (const key of changedKeys) {
        if (!watched.has(key)) continue
        values.current.delete(key)
        changed = true
        if (key === 'users') teamData.current = null
      }
      if (changed) setInvalidations(count => count + 1)
    })
  }, [enabled])

  useEffect(() => {
    if (!open || !enabled || !window.kv) return
    const missing = KV_KEYS.filter(key => !values.current.has(key))
    const needsTeams = !teamData.current || Date.now() - teamData.current.at > TEAM_DATA_TTL_MS
    if (!missing.length && !needsTeams) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const tasks: Array<Promise<unknown>> = []
    if (missing.length) {
      tasks.push(Promise.allSettled(missing.map(key => window.kv.get(key))).then(settled => {
        if (cancelled) return
        settled.forEach((result, index) => { if (result.status === 'fulfilled') values.current.set(missing[index], result.value) })
        setVersion(current => current + 1)
      }))
    }
    if (needsTeams) {
      tasks.push(loadTeamData().then(data => {
        if (cancelled) return
        teamData.current = data
        setVersion(current => current + 1)
      }).catch(error => console.error('Could not load team data for the search palette:', error)))
    }
    void Promise.allSettled(tasks).then(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, enabled, invalidations, userEmail])

  const sources = useMemo<RemoteSearchSources>(() => {
    const read = <T,>(key: string): T | undefined => values.current.get(key) as T | undefined
    const team = teamData.current
    return {
      teamCode: team?.teamCode,
      teamLabel: team?.teamLabel,
      creatorEmail: team?.creatorEmail,
      otherTeams: team?.otherTeams,
      sharedGuides: read<SearchGuide[]>('shared-guides'),
      articles: read<SearchGuide[]>('knowledge-articles'),
      sharedArticles: read<SearchGuide[]>('shared-knowledge-articles'),
      users: read<SearchUsers>('users'),
      notes: read<SearchNote[]>('notebook-notes'),
      folders: read<SearchFolder[]>('email-folders'),
    }
  }, [version])
  return { sources, loading }
}
