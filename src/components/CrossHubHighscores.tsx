import { useEffect, useMemo, useState } from 'react'
import { Trophy } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { useLanguage } from '@/contexts/LanguageContext'
import { normalizeFlatLeaderboard, normalizeNestedLeaderboard } from '@/lib/leaderboards'
import { useCrossTeamLeaderboard, mergeFlatLeaderboard, mergeNestedLeaderboard, type CrossTeamEntry, type OtherTeamLeaderboardData } from '@/hooks/useCrossTeamLeaderboard'

type Difficulty = string
interface ScoreEntry { id: string; email: string; score: number; level?: number; timestamp: number }
type Leaderboard = Record<Difficulty, ScoreEntry[]>

interface CrossHubHighscoresProps {
  gameTitle: string
  /** KV-nøgle for spillets globale leaderboard, fx 'tetris-global-leaderboard'. */
  leaderboardKey: string
  /** Brug fx ['all'] for et samlet leaderboard uden sværhedsgrader (som GameLeaderboardAdmin). */
  categories?: Difficulty[]
  categoryLabels?: Record<Difficulty, string>
  /** Det AKTIVE hubs brugere - andre hubs' navne kommer fra deres egne 'users' (via hooket). */
  users: Array<{ email: string; fullName: string }>
}

const DEFAULT_CATEGORIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

/**
 * Skrivebeskyttet: fletter det AKTIVE hubs eget leaderboard med ALLE andre hubs'
 * samme leaderboard-nøgle til én samlet, sorteret top-liste pr. kategori - så
 * Creatoren kan se highscores på tværs af alle hubs uden at skifte aktivt hub.
 * Genbruger det EKSISTERENDE useCrossTeamLeaderboard-hook (samme mekanisme som
 * spillenes egen "highscores på tværs"-visning for almindelige spillere) -
 * skriver ALDRIG noget. Redigering sker fortsat kun via GameLeaderboardAdmin,
 * og kun for det aktive hub - skrivegrænsen mod andre hubs flyttes ikke.
 */
export function CrossHubHighscores({ gameTitle, leaderboardKey, categories = DEFAULT_CATEGORIES, categoryLabels, users }: CrossHubHighscoresProps) {
  const { t, language } = useLanguage()
  const isFlatMode = categories.length === 1
  const [ownRaw, setOwnRaw] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    window.kv.get<unknown>(leaderboardKey).then(value => { if (!cancelled) setOwnRaw(value) })
    return () => { cancelled = true }
  }, [leaderboardKey])

  const { otherTeams } = useCrossTeamLeaderboard<Leaderboard | ScoreEntry[]>(leaderboardKey)
  const ownUsers = useMemo(() => Object.fromEntries(users.map(u => [u.email, { fullName: u.fullName }])), [users])

  const defaultLabels: Record<Difficulty, string> = {
    easy: t.gameLeaderboardAdmin.difficultyEasy,
    medium: t.gameLeaderboardAdmin.difficultyMedium,
    hard: t.gameLeaderboardAdmin.difficultyHard,
    expert: t.gameLeaderboardAdmin.difficultyExpert,
    all: t.managerPanel.games.highscores,
  }
  const labels = categoryLabels || defaultLabels

  const merged = useMemo(() => {
    // Egne data normaliseres, og fletningen tåler selv forkert formede data fra
    // andre hubs — denne skærm må aldrig kunne vælte manager-panelet.
    const ownBoard: Leaderboard = isFlatMode
      ? { [categories[0]]: normalizeFlatLeaderboard(ownRaw) }
      : normalizeNestedLeaderboard(ownRaw, categories)
    const flatOtherTeams = otherTeams as unknown as OtherTeamLeaderboardData<ScoreEntry[]>[]
    const nestedOtherTeams = otherTeams as unknown as OtherTeamLeaderboardData<Leaderboard>[]
    const result: Record<Difficulty, CrossTeamEntry[]> = {}
    for (const category of categories) {
      result[category] = isFlatMode
        ? mergeFlatLeaderboard(ownBoard[category], ownUsers, flatOtherTeams)
        : mergeNestedLeaderboard(ownBoard, ownUsers, nestedOtherTeams, category)
    }
    return result
  }, [categories, isFlatMode, ownRaw, ownUsers, otherTeams])

  return (
    <Card className="p-6 border-2">
      <div className="flex items-center gap-3 mb-4">
        <Trophy size={24} weight="duotone" className="text-accent" />
        <div>
          <h3 className="text-lg font-bold">
            {language === 'da' ? `${gameTitle} — highscores på tværs af alle hubs` : language === 'fi' ? `${gameTitle} — ennätykset kaikissa hubeissa` : `${gameTitle} — highscores across all hubs`}
          </h3>
          <p className="text-xs text-muted-foreground">
            {language === 'da' ? 'Skrivebeskyttet overblik — redigér scores under det aktive hub ovenfor' : language === 'fi' ? 'Vain luku — muokkaa pisteitä aktiivisen hubin kohdalla yllä' : 'Read-only overview — edit scores under the active hub above'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map(category => {
          const entries = merged[category] || []
          return (
            <div key={category} className="rounded-lg border p-3">
              <div className="text-sm font-semibold mb-2">{labels[category] || category}</div>
              {entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t.gameLeaderboardAdmin.noScoresYet}</p>
              ) : (
                <div className="space-y-1">
                  {entries.slice(0, 5).map((entry, index) => (
                    <div key={`${entry.teamCode || 'own'}-${entry.id}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-muted-foreground shrink-0">#{index + 1}</span>
                        <span className="truncate">{entry.displayName}{entry.teamCode && <span className="text-muted-foreground"> ({entry.teamCode})</span>}</span>
                      </span>
                      <span className="font-bold shrink-0">{entry.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
