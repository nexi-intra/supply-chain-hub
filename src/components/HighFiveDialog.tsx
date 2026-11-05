import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { radioKeyTarget } from '@/components/arcade/arcadeCabinet'
import {
  DEFAULT_HIGH_FIVE_EMOJI, HIGH_FIVE_EMOJIS, HIGH_FIVE_MESSAGE_LIMIT, highFiveMessageProblem, sortPeople,
  type HighFiveEmoji, type HighFivePerson, type HighFiveTeam,
} from '@/lib/highFives'
import type { HighFiveLabels } from '@/lib/highFivesLabels'
import { matchesPerson } from '@/lib/multiplayerView'
import { cn } from '@/lib/utils'

export interface HighFiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  people: readonly HighFivePerson[]
  teams: readonly HighFiveTeam[]
  labels: HighFiveLabels
  /** The parent runs the command and closes the dialog straight away. */
  onSubmit: (person: HighFivePerson, emoji: HighFiveEmoji, message: string) => void
}

export function HighFiveDialog({ open, onOpenChange, people, teams, labels, onSubmit }: HighFiveDialogProps) {
  const l = labels.dialog
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const [emoji, setEmoji] = useState<HighFiveEmoji>(DEFAULT_HIGH_FIVE_EMOJI)
  const [message, setMessage] = useState('')
  const personButtons = useRef<Array<HTMLButtonElement | null>>([])
  const emojiButtons = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setEmail(null)
    setEmoji(DEFAULT_HIGH_FIVE_EMOJI)
    setMessage('')
  }, [open])

  const teamName = (code: string) => teams.find(team => team.folderName === code)?.name ?? code
  const sorted = useMemo(() => sortPeople(people), [people])
  const visible = useMemo(() => sorted.filter(person => matchesPerson(person, teamName(person.teamCode), query)), [sorted, teams, query])
  const chosen = visible.find(person => person.email === email) ?? null
  const focusIndex = Math.max(0, visible.findIndex(person => person.email === email))
  const problem = message ? highFiveMessageProblem(message) : null
  const canSend = Boolean(chosen) && highFiveMessageProblem(message) === null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{l.title}</DialogTitle>
          <DialogDescription>{l.description}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault()
            if (chosen && canSend) onSubmit(chosen, emoji, message.trim())
          }}
        >
          <div className="grid gap-2">
            <label htmlFor="high-five-search" className="text-sm font-medium">{l.search}</label>
            <Input id="high-five-search" value={query} placeholder={l.searchPlaceholder} autoComplete="off" onChange={event => setQuery(event.target.value)} />
            <div className="grid max-h-52 gap-1 overflow-y-auto rounded-md border p-1" role="radiogroup" aria-label={l.search}>
              {visible.length === 0 && <p className="p-3 text-sm text-muted-foreground">{l.noPeople}</p>}
              {visible.map((person, index) => (
                <button
                  key={person.email}
                  ref={node => { personButtons.current[index] = node }}
                  type="button"
                  role="radio"
                  aria-checked={person.email === email}
                  tabIndex={index === focusIndex ? 0 : -1}
                  className={cn(
                    'flex items-baseline justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    person.email === email && 'border-primary bg-primary/10',
                  )}
                  onClick={() => setEmail(person.email)}
                  onKeyDown={keyEvent => {
                    const target = radioKeyTarget(index, keyEvent.key, visible.length)
                    if (target === null) return
                    keyEvent.preventDefault()
                    setEmail(visible[target].email)
                    personButtons.current[target]?.focus()
                  }}
                >
                  <span className="font-semibold">{person.fullName}</span>
                  <small className="text-muted-foreground">{teamName(person.teamCode)}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span id="high-five-emoji" className="text-sm font-medium">{l.emoji}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="high-five-emoji">
              {HIGH_FIVE_EMOJIS.map((option, index) => (
                <button
                  key={option}
                  ref={node => { emojiButtons.current[index] = node }}
                  type="button"
                  role="radio"
                  aria-checked={option === emoji}
                  aria-label={labels.emojiNames[option]}
                  title={labels.emojiNames[option]}
                  tabIndex={option === emoji ? 0 : -1}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-md border text-2xl hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    option === emoji && 'border-primary bg-primary/10',
                  )}
                  onClick={() => setEmoji(option)}
                  onKeyDown={keyEvent => {
                    const target = radioKeyTarget(index, keyEvent.key, HIGH_FIVE_EMOJIS.length)
                    if (target === null) return
                    keyEvent.preventDefault()
                    setEmoji(HIGH_FIVE_EMOJIS[target])
                    emojiButtons.current[target]?.focus()
                  }}
                >
                  <span aria-hidden="true">{option}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="high-five-message" className="text-sm font-medium">{l.message}</label>
            <Input
              id="high-five-message"
              value={message}
              placeholder={l.messagePlaceholder}
              maxLength={HIGH_FIVE_MESSAGE_LIMIT}
              autoComplete="off"
              aria-invalid={problem !== null}
              aria-describedby="high-five-message-hint"
              onChange={event => setMessage(event.target.value)}
            />
            <p id="high-five-message-hint" className={cn('flex justify-between gap-3 text-xs', problem ? 'text-destructive' : 'text-muted-foreground')}>
              <span>{problem ? l.problems[problem] : null}</span>
              <span>{l.count(message.length, HIGH_FIVE_MESSAGE_LIMIT)}</span>
            </p>
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{chosen ? null : l.pickPerson}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{l.cancel}</Button>
              <Button type="submit" disabled={!canSend}>{l.send}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
