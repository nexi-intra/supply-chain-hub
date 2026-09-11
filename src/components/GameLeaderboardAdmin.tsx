import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Trophy, PencilSimple, Trash, Check } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { upsertInKvArray, upsertInNestedKvArray, removeFromKvArray } from '@/lib/kvArrays'
import { useLanguage } from '@/contexts/LanguageContext'

type Difficulty = string

interface ScoreEntry {
  email: string
  score: number
  level?: number
  timestamp: number
}

type Leaderboard = Record<Difficulty, ScoreEntry[]>
type PlayCounts = Record<string, Record<Difficulty, number>>

interface CategorySetting {
  label: string
  color: string
  bg: string
  border: string
  statBg: string
  statBorder: string
  statText: string
}

interface GameLeaderboardAdminProps {
  gameTitle: string
  icon: ReactNode
  /** KV-nøgle for spillets globale leaderboard, fx 'tetris-global-leaderboard'. */
  leaderboardKey: string
  /** KV-nøgle for spillets play counts, fx 'tetris-play-counts'. */
  playCountsKey: string
  /** Spil med levels (Brick Break) viser og redigerer også level. */
  hasLevel?: boolean
  /** Overstyr kategorierne (default: easy/medium/hard/expert). Brug fx ['all'] for et samlet highscores uden sværhedsgrader. */
  categories?: Difficulty[]
  /** Overstyr visuel opsætning pr. kategori (default: DIFFICULTY_SETTINGS). */
  categorySettings?: Record<Difficulty, CategorySetting>
  users: Array<{ email: string; fullName: string }>
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

function getDifficultySettings(t: ReturnType<typeof useLanguage>['t']): Record<Difficulty, { label: string; color: string; bg: string; border: string; statBg: string; statBorder: string; statText: string }> {
  return {
    easy: { label: t.gameLeaderboardAdmin.difficultyEasy, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30', statBg: 'bg-green-500/10', statBorder: 'border-green-500/20', statText: 'text-green-600' },
    medium: { label: t.gameLeaderboardAdmin.difficultyMedium, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', statBg: 'bg-yellow-500/10', statBorder: 'border-yellow-500/20', statText: 'text-yellow-600' },
    hard: { label: t.gameLeaderboardAdmin.difficultyHard, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', statBg: 'bg-red-500/10', statBorder: 'border-red-500/20', statText: 'text-red-600' },
    expert: { label: t.gameLeaderboardAdmin.difficultyExpert, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30', statBg: 'bg-purple-500/10', statBorder: 'border-purple-500/20', statText: 'text-purple-600' },
  }
}

// Manager-administration af ét spils highscores og spil-statistik.
// Erstatter de fem næsten identiske sektioner, der tidligere lå i ManagerPanel.
export function GameLeaderboardAdmin({ gameTitle, icon, leaderboardKey, playCountsKey, hasLevel = false, categories = DIFFICULTIES, categorySettings, users }: GameLeaderboardAdminProps) {
  const { t } = useLanguage()
  const resolvedCategorySettings = categorySettings || getDifficultySettings(t)
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null)
  const [playCounts, setPlayCounts] = useState<PlayCounts | null>(null)
  const [editingEntry, setEditingEntry] = useState<{ difficulty: Difficulty; email: string } | null>(null)
  const [newScore, setNewScore] = useState('')
  const [newLevel, setNewLevel] = useState('')

  const isFlatMode = categories.length === 1

  const load = useCallback(async () => {
    const raw = await window.kv.get<unknown>(leaderboardKey)
    const board: Leaderboard = isFlatMode
      ? { [categories[0]]: Array.isArray(raw) ? raw as ScoreEntry[] : [] }
      : (raw as Leaderboard) || Object.fromEntries(categories.map(c => [c, []])) as Leaderboard
    setLeaderboard(board)
    const counts = await window.kv.get<PlayCounts>(playCountsKey)
    setPlayCounts(counts || {})
  }, [leaderboardKey, playCountsKey, categories, isFlatMode])

  useEffect(() => {
    load()
  }, [load])

  const getUserName = (email: string) => {
    const user = users.find(u => u.email === email)
    return user ? user.fullName : email
  }

  const totalPlays = (counts: Record<Difficulty, number>) =>
    categories.reduce((sum, c) => sum + (counts[c] || 0), 0)

  const openEditDialog = (difficulty: Difficulty, entry: ScoreEntry) => {
    setEditingEntry({ difficulty, email: entry.email })
    setNewScore(entry.score.toString())
    setNewLevel(entry.level?.toString() || '')
  }

  const closeEditDialog = () => {
    setEditingEntry(null)
    setNewScore('')
    setNewLevel('')
  }

  const handleSaveScore = async () => {
    if (!editingEntry) return

    const scoreValue = parseInt(newScore)
    if (isNaN(scoreValue) || scoreValue < 0) {
      toast.error(t.gameLeaderboardAdmin.invalidScore)
      return
    }
    const levelValue = parseInt(newLevel)
    if (hasLevel && (isNaN(levelValue) || levelValue < 0)) {
      toast.error(t.gameLeaderboardAdmin.invalidScoreOrLevel)
      return
    }

    const board = await window.kv.get<Leaderboard>(leaderboardKey)
    if (!board) {
      toast.error(t.gameLeaderboardAdmin.leaderboardNotFound)
      return
    }

    const entries = board[editingEntry.difficulty] || []
    const existing = entries.find(entry => entry.email === editingEntry.email)
    if (!existing) {
      toast.error(t.gameLeaderboardAdmin.scoreEntryNotFound)
      return
    }

    const updatedEntry = {
      ...existing,
      score: scoreValue,
      ...(hasLevel ? { level: levelValue } : {}),
      timestamp: Date.now(),
    }

    if (isFlatMode) {
      await upsertInKvArray(leaderboardKey, [{ ...updatedEntry, id: updatedEntry.email }])
    } else {
      await upsertInNestedKvArray(leaderboardKey, [editingEntry.difficulty], [{ ...updatedEntry, id: updatedEntry.email }])
    }
    await load()
    closeEditDialog()
    toast.success(t.gameLeaderboardAdmin.scoreUpdated)
  }

  const handleDeleteScore = async (difficulty: Difficulty, email: string) => {
    if (isFlatMode) {
      await removeFromKvArray(leaderboardKey, [email])
      await load()
      toast.success(t.gameLeaderboardAdmin.scoreDeleted)
      return
    }

    await window.kv.update(leaderboardKey, { op: 'remove', ids: [email], path: [difficulty] })
    await load()
    toast.success(t.gameLeaderboardAdmin.scoreDeleted)
  }

  return (
    <>
      <Card className="p-6 border-2">
        <div className="flex items-center gap-3 mb-6">
          {icon}
          <h2 className="text-2xl font-bold">{gameTitle} {t.gameLeaderboardAdmin.statsTitleSuffix}</h2>
        </div>

        {playCounts && Object.keys(playCounts).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {Object.entries(playCounts)
              .sort(([, a], [, b]) => totalPlays(b) - totalPlays(a))
              .map(([email, counts]) => (
                <motion.div
                  key={email}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl border-2 bg-gradient-to-br from-card to-muted/30 hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-lg truncate">{getUserName(email)}</div>
                      <div className="text-xs text-muted-foreground truncate">{email}</div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 shrink-0">
                      <Trophy size={18} weight="fill" className="text-primary" />
                      <span className="font-bold text-lg text-primary">{totalPlays(counts)}</span>
                      <span className="text-xs text-muted-foreground">{t.gameLeaderboardAdmin.playsUnit}</span>
                    </div>
                  </div>
                  {categories.length > 1 && (
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map((difficulty) => (
                        <div key={difficulty} className={`p-2 rounded-lg text-center ${resolvedCategorySettings[difficulty].statBg} border ${resolvedCategorySettings[difficulty].statBorder}`}>
                          <div className="text-[11px] text-muted-foreground mb-0.5 truncate">{resolvedCategorySettings[difficulty].label}</div>
                          <div className={`font-bold ${resolvedCategorySettings[difficulty].statText}`}>{counts[difficulty] || 0}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Trophy size={64} className="text-muted-foreground/30 mx-auto mb-4" weight="duotone" />
            <p className="text-muted-foreground">{t.gameLeaderboardAdmin.noStatsYet}</p>
            <p className="text-sm text-muted-foreground mt-2">{t.gameLeaderboardAdmin.statsWillShowPrefix} {gameTitle}</p>
          </div>
        )}
      </Card>

      <Card className="p-6 border-2">
        <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
          <p className="text-sm text-muted-foreground">
            {t.gameLeaderboardAdmin.manageDescriptionPrefix} {gameTitle}{t.gameLeaderboardAdmin.manageDescriptionMiddle}{hasLevel ? t.gameLeaderboardAdmin.manageDescriptionLevelInsert : ''} {t.gameLeaderboardAdmin.manageDescriptionSuffix}
          </p>
        </div>

        {!leaderboard ? (
          <div className="text-center py-12">
            <Trophy size={64} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
            <p className="text-muted-foreground">{t.gameLeaderboardAdmin.loadingHighscores}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((difficulty) => {
              const board = leaderboard[difficulty] || []
              const setting = resolvedCategorySettings[difficulty]

              return (
                <div key={difficulty} className="space-y-3">
                  <div className={`p-4 rounded-lg ${setting.bg} border ${setting.border}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Trophy size={24} weight="duotone" className={setting.color} />
                        <div>
                          <h3 className="font-bold text-lg">{setting.label}</h3>
                          <p className="text-xs text-muted-foreground">
                            {board.length} {board.length === 1 ? t.gameLeaderboardAdmin.scoreSingular : t.gameLeaderboardAdmin.scorePlural}
                          </p>
                        </div>
                      </div>
                    </div>

                    {board.length === 0 ? (
                      <div className="text-center py-6">
                        <Trophy size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{t.gameLeaderboardAdmin.noScoresYet}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {board.map((entry, index) => (
                          <motion.div
                            key={entry.email}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-between p-3 rounded-lg bg-card border hover:shadow-sm transition-all group"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 font-bold text-sm">
                                #{index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">{getUserName(entry.email)}</div>
                                <div className="text-xs text-muted-foreground">{entry.email}</div>
                              </div>
                              {hasLevel ? (
                                <div className="text-right">
                                  <div className="text-lg font-bold text-primary">{entry.score}</div>
                                  <div className="text-xs text-muted-foreground">{t.gameLeaderboardAdmin.levelPrefix} {entry.level}</div>
                                </div>
                              ) : (
                                <div className="text-lg font-bold text-primary">{entry.score}</div>
                              )}
                            </div>
                            <div className="ml-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(difficulty, entry)}
                                className="hover:bg-primary/10"
                              >
                                <PencilSimple size={20} />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash size={20} />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t.gameLeaderboardAdmin.deleteTitle}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t.gameLeaderboardAdmin.deleteConfirmPrefix} <strong>{getUserName(entry.email)}</strong>{t.gameLeaderboardAdmin.deleteConfirmSuffix}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteScore(difficulty, entry.email)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {t.gameLeaderboardAdmin.deleteAction}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Dialog open={!!editingEntry} onOpenChange={(open) => { if (!open) closeEditDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.gameLeaderboardAdmin.editTitlePrefix} {gameTitle} {t.gameLeaderboardAdmin.editTitleSuffix}</DialogTitle>
            <DialogDescription>
              {t.gameLeaderboardAdmin.editDescriptionPrefix}{hasLevel ? ` ${t.gameLeaderboardAdmin.editDescriptionLevelInsert}` : ''} {t.gameLeaderboardAdmin.editDescriptionMiddle} {editingEntry?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`edit-score-${leaderboardKey}`}>{t.gameLeaderboardAdmin.scoreLabel}</Label>
              <Input
                id={`edit-score-${leaderboardKey}`}
                type="number"
                value={newScore}
                onChange={(e) => setNewScore(e.target.value)}
                placeholder={t.gameLeaderboardAdmin.scorePlaceholder}
                min="0"
              />
            </div>
            {hasLevel && (
              <div className="space-y-2">
                <Label htmlFor={`edit-level-${leaderboardKey}`}>{t.gameLeaderboardAdmin.levelLabel}</Label>
                <Input
                  id={`edit-level-${leaderboardKey}`}
                  type="number"
                  value={newLevel}
                  onChange={(e) => setNewLevel(e.target.value)}
                  placeholder={t.gameLeaderboardAdmin.levelPlaceholder}
                  min="0"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSaveScore} className="gap-2">
              <Check size={18} weight="bold" />
              {t.gameLeaderboardAdmin.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
