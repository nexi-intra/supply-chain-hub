import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { radioKeyTarget } from '@/components/arcade/arcadeCabinet'
import { PIECE_IMAGES } from '@/components/chess/pieces'
import {
  MULTIPLAYER_LANGUAGES, type MultiplayerChessColor, type MultiplayerGameType, type MultiplayerLanguage, type MultiplayerPerson, type MultiplayerTeam,
} from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'
import { matchesPerson } from '@/lib/multiplayerView'
import { LanguageFlag } from './LanguageFlag'
import './multiplayer.css'
import '@/components/chess/chess.css'
import '@/components/backgammon/backgammon.css'

export type ChessColorChoice = MultiplayerChessColor | 'random'
export interface ChallengeChoice { language: MultiplayerLanguage; color: ChessColorChoice }

const COLOR_CHOICES: readonly ChessColorChoice[] = ['white', 'black', 'random']

export interface ChallengeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Word-Puzzle asks for a language, chess for a colour. */
  gameType: MultiplayerGameType
  people: readonly MultiplayerPerson[]
  teams: readonly MultiplayerTeam[]
  defaultLanguage: MultiplayerLanguage
  /** Opponent picked in advance, for a rematch. */
  initialEmail?: string | null
  /** Colour picked in advance, for a chess rematch. */
  initialColor?: ChessColorChoice
  busy: boolean
  labels: MultiplayerLabels
  /** The parent runs the command and closes the dialog when it succeeds. */
  onSubmit: (person: MultiplayerPerson, choice: ChallengeChoice) => void
}

export function ChallengeDialog({
  open, onOpenChange, gameType, people, teams, defaultLanguage, initialEmail = null, initialColor = 'random', busy, labels, onSubmit,
}: ChallengeDialogProps) {
  const l = labels.challenge
  const backgammon = gameType === 'backgammon'
  const chess = gameType === 'chess' || backgammon
  const colorTexts = backgammon ? labels.backgammon : labels.chess
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const [language, setLanguage] = useState<MultiplayerLanguage>(defaultLanguage)
  const [color, setColor] = useState<ChessColorChoice>(initialColor)
  const options = useRef<Array<HTMLButtonElement | null>>([])
  const languageButtons = useRef<Array<HTMLButtonElement | null>>([])
  const colorButtons = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setEmail(initialEmail)
    setLanguage(defaultLanguage)
    setColor(initialColor)
  }, [open, defaultLanguage, initialEmail, initialColor])

  const teamName = (code: string) => teams.find(team => team.folderName === code)?.name ?? code
  const sorted = useMemo(() => [...people].sort((a, b) => a.fullName.localeCompare(b.fullName)), [people])
  const visible = useMemo(
    () => sorted.filter(person => matchesPerson(person, teams.find(team => team.folderName === person.teamCode)?.name ?? person.teamCode, query)),
    [sorted, teams, query],
  )
  const chosen = visible.find(person => person.email === email) ?? null
  const focusIndex = Math.max(0, visible.findIndex(person => person.email === email))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{l.title}</DialogTitle>
          <DialogDescription>{chess ? colorTexts.challenge.description : l.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <label htmlFor="wp-challenge-search" className="text-sm font-medium">{l.search}</label>
          <Input id="wp-challenge-search" value={query} placeholder={l.searchPlaceholder} autoComplete="off" onChange={event => setQuery(event.target.value)} />
          <div className="wp-person-list" role="radiogroup" aria-label={l.search}>
            {visible.length === 0 && <p className="p-3 text-sm text-muted-foreground">{l.noPeople}</p>}
            {visible.map((person, index) => (
              <button
                key={person.email}
                ref={node => { options.current[index] = node }}
                type="button"
                role="radio"
                aria-checked={person.email === email}
                tabIndex={index === focusIndex ? 0 : -1}
                className="wp-person"
                onClick={() => setEmail(person.email)}
                onKeyDown={event => {
                  const target = radioKeyTarget(index, event.key, visible.length)
                  if (target === null) return
                  event.preventDefault()
                  setEmail(visible[target].email)
                  options.current[target]?.focus()
                }}
              >
                <span className="font-semibold">{person.fullName}</span>
                <small>{teamName(person.teamCode)}</small>
              </button>
            ))}
          </div>
        </div>

        {chess ? (
          <div className="grid gap-2">
            <span id="wp-challenge-color" className="text-sm font-medium">{colorTexts.challenge.color}</span>
            <div className="cx-color-grid" role="radiogroup" aria-labelledby="wp-challenge-color">
              {COLOR_CHOICES.map((choice, index) => (
                <button
                  key={choice}
                  ref={node => { colorButtons.current[index] = node }}
                  type="button"
                  role="radio"
                  aria-checked={choice === color}
                  tabIndex={choice === color ? 0 : -1}
                  className="cx-color"
                  data-color={choice}
                  onClick={() => setColor(choice)}
                  onKeyDown={event => {
                    const target = radioKeyTarget(index, event.key, COLOR_CHOICES.length)
                    if (target === null) return
                    event.preventDefault()
                    setColor(COLOR_CHOICES[target])
                    colorButtons.current[target]?.focus()
                  }}
                >
                  <span className="cx-color__art" aria-hidden="true">
                    {backgammon ? (
                      <>
                        {choice !== 'black' && <span className="bgm-chip-checker" data-color="white" />}
                        {choice !== 'white' && <span className="bgm-chip-checker" data-color="black" />}
                      </>
                    ) : (
                      <>
                        {choice !== 'black' && <img src={PIECE_IMAGES.wk} alt="" draggable={false} />}
                        {choice !== 'white' && <img src={PIECE_IMAGES.bk} alt="" draggable={false} />}
                      </>
                    )}
                  </span>
                  <span className="cx-color__name">{colorTexts.colors[choice]}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{colorTexts.challenge.colorHint}</p>
          </div>
        ) : (
        <div className="grid gap-2">
          <span id="wp-challenge-language" className="text-sm font-medium">{l.language}</span>
          <div className="wp-lang-grid" role="radiogroup" aria-labelledby="wp-challenge-language">
            {MULTIPLAYER_LANGUAGES.map((code, index) => (
              <button
                key={code}
                ref={node => { languageButtons.current[index] = node }}
                type="button"
                role="radio"
                aria-checked={code === language}
                tabIndex={code === language ? 0 : -1}
                className="wp-lang"
                onClick={() => setLanguage(code)}
                onKeyDown={event => {
                  const target = radioKeyTarget(index, event.key, MULTIPLAYER_LANGUAGES.length)
                  if (target === null) return
                  event.preventDefault()
                  setLanguage(MULTIPLAYER_LANGUAGES[target])
                  languageButtons.current[target]?.focus()
                }}
              >
                <LanguageFlag language={code} />
                {labels.languageNames[code]}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{l.languageHint}</p>
        </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{chosen ? labels.lobby.challengeHint : l.pickPerson}</p>
          <Button type="button" disabled={!chosen || busy} onClick={() => chosen && onSubmit(chosen, { language, color })}>
            {busy ? l.sending : l.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
