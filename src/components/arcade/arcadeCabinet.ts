import type { CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'
import type { Language } from '@/lib/translations'

export type ArcadeDifficulty = 'easy' | 'medium' | 'hard' | 'expert'

export interface HallOfFameRow extends CrossTeamEntry {
  rank: number
  isCurrentUser: boolean
}

const isOwnEntry = (entry: CrossTeamEntry, userEmail: string | undefined) => !entry.teamCode && !!userEmail && entry.email === userEmail

/** Forventer en tavle sorteret med højeste score først (som `mergeNestedLeaderboard` giver). */
export function hallOfFameRows(board: CrossTeamEntry[], userEmail: string | undefined, limit = 10): { top: HallOfFameRow[]; own: HallOfFameRow | null } {
  const rows = board.map((entry, index) => ({ ...entry, rank: index + 1, isCurrentUser: isOwnEntry(entry, userEmail) }))
  const top = rows.slice(0, limit)
  const ownRow = rows.find((row) => row.isCurrentUser) ?? null
  return { top, own: ownRow && ownRow.rank > limit ? ownRow : null }
}

export function personalBest(board: CrossTeamEntry[], userEmail: string | undefined): number | null {
  let best: number | null = null
  for (const entry of board) if (isOwnEntry(entry, userEmail) && (best === null || entry.score > best)) best = entry.score
  return best
}

export function radioKeyTarget(index: number, key: string, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

export function countUpValue(target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return target
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs))
  return Math.round(target * (1 - (1 - t) ** 3))
}

const STAGE_MIN_WIDTH = 280

/** Største spilleflade med spillets format, der kan være i det tilgængelige område. */
export function fitStage(available: { width: number; height: number }, aspect: number): { width: number; height: number } {
  const width = Number.isFinite(available.width) ? available.width : 0
  const height = Number.isFinite(available.height) ? available.height : 0
  const fitted = Math.max(STAGE_MIN_WIDTH, Math.floor(Math.min(width, height * aspect)))
  return { width: fitted, height: Math.round(fitted / aspect) }
}

export interface ArcadeLabels {
  difficulty: string
  difficulties: Record<ArcadeDifficulty, string>
  controls: string
  start: string
  personalBest: string
  topScore: string
  noneYet: string
  highscores: string
  highscoresHint: string
  noScoresYet: string
  rank: (rank: number) => string
  you: string
  sound: string
  soundOn: string
  soundOff: string
  gameOver: string
  finalScore: string
  newRecord: string
  playAgain: string
  backToMenu: string
  retryHint: string
  quit: string
}

const LABELS: Record<Language, Omit<ArcadeLabels, 'rank'> & { rankWord: string }> = {
  da: {
    difficulty: 'Sværhedsgrad',
    difficulties: { easy: 'Let', medium: 'Mellem', hard: 'Svær', expert: 'Ekspert' },
    controls: 'Styring',
    start: 'Start spil',
    personalBest: 'Din rekord',
    topScore: 'Bedste',
    noneYet: 'Ingen endnu',
    highscores: 'Highscores',
    highscoresHint: 'Spillere fra alle teams',
    noScoresYet: 'Ingen point endnu. Sæt den første rekord.',
    rankWord: 'Plads',
    you: 'dig',
    sound: 'Lyd',
    soundOn: 'Lyd til',
    soundOff: 'Lyd fra',
    gameOver: 'Spillet er slut',
    finalScore: 'Slutscore',
    newRecord: 'Ny rekord!',
    playAgain: 'Spil igen',
    backToMenu: 'Tilbage til menu',
    retryHint: 'Tryk mellemrum eller Enter for at spille igen',
    quit: 'Stop',
  },
  en: {
    difficulty: 'Difficulty',
    difficulties: { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' },
    controls: 'Controls',
    start: 'Start game',
    personalBest: 'Your best',
    topScore: 'Top score',
    noneYet: 'None yet',
    highscores: 'Highscores',
    highscoresHint: 'Players from every team',
    noScoresYet: 'No scores yet. Set the first record.',
    rankWord: 'Rank',
    you: 'you',
    sound: 'Sound',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    gameOver: 'Game over',
    finalScore: 'Final score',
    newRecord: 'New record!',
    playAgain: 'Play again',
    backToMenu: 'Back to menu',
    retryHint: 'Press Space or Enter to play again',
    quit: 'Quit',
  },
  fi: {
    difficulty: 'Vaikeustaso',
    difficulties: { easy: 'Helppo', medium: 'Keskitaso', hard: 'Vaikea', expert: 'Asiantuntija' },
    controls: 'Ohjaus',
    start: 'Aloita peli',
    personalBest: 'Oma ennätys',
    topScore: 'Paras tulos',
    noneYet: 'Ei vielä',
    highscores: 'Huipputulokset',
    highscoresHint: 'Pelaajat kaikista tiimeistä',
    noScoresYet: 'Ei vielä tuloksia. Tee ensimmäinen ennätys.',
    rankWord: 'Sija',
    you: 'sinä',
    sound: 'Ääni',
    soundOn: 'Ääni päällä',
    soundOff: 'Ääni pois',
    gameOver: 'Peli päättyi',
    finalScore: 'Lopputulos',
    newRecord: 'Uusi ennätys!',
    playAgain: 'Pelaa uudelleen',
    backToMenu: 'Takaisin valikkoon',
    retryHint: 'Pelaa uudelleen painamalla välilyöntiä tai Enteriä',
    quit: 'Lopeta',
  },
  sv: {
    difficulty: 'Svårighetsgrad',
    difficulties: { easy: 'Lätt', medium: 'Medel', hard: 'Svår', expert: 'Expert' },
    controls: 'Kontroller',
    start: 'Starta spel',
    personalBest: 'Ditt rekord',
    topScore: 'Bäst',
    noneYet: 'Inga ännu',
    highscores: 'Highscores',
    highscoresHint: 'Spelare från alla team',
    noScoresYet: 'Inga poäng ännu. Sätt det första rekordet.',
    rankWord: 'Plats',
    you: 'du',
    sound: 'Ljud',
    soundOn: 'Ljud på',
    soundOff: 'Ljud av',
    gameOver: 'Spelet är slut',
    finalScore: 'Slutpoäng',
    newRecord: 'Nytt rekord!',
    playAgain: 'Spela igen',
    backToMenu: 'Tillbaka till menyn',
    retryHint: 'Tryck på mellanslag eller Enter för att spela igen',
    quit: 'Avsluta',
  },
}

export function arcadeLabels(language: string): ArcadeLabels {
  const { rankWord, ...labels } = LABELS[(language in LABELS ? language : 'da') as keyof typeof LABELS]
  return { ...labels, rank: (rank) => `${rankWord} ${rank}` }
}
