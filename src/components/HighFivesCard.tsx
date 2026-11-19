import { useEffect, useMemo, useState } from 'react'
import { HandsClapping } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HighFiveDialog } from '@/components/HighFiveDialog'
import { useLanguage } from '@/contexts/LanguageContext'
import { useHighFives } from '@/hooks/useHighFives'
import {
  HIGH_FIVE_VISIBLE, highFiveErrorCode, mergeTeamFeed,
  type HighFiveEmoji, type HighFivePerson, type HighFiveTeamEntry,
} from '@/lib/highFives'
import { getHighFiveLabels, highFiveErrorText } from '@/lib/highFivesLabels'
import { newOperationId, relativeTime } from '@/lib/multiplayerView'
import { cn } from '@/lib/utils'

const CLOCK_TICK_MS = 60 * 1000
const LOCAL_LIMIT = 20

/** Hub card: the high-fives I received, the latest in my team, and a button to send one. */
export function HighFivesCard({ userEmail, className }: { userEmail: string; className?: string }) {
  const { language } = useLanguage()
  const labels = getHighFiveLabels(language)
  const { available, snapshot, state } = useHighFives(userEmail)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Own just-sent entries, shown at once and replaced by the saved ones.
  const [local, setLocal] = useState<HighFiveTeamEntry[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const received = useMemo(() => (snapshot?.received ?? []).slice(0, HIGH_FIVE_VISIBLE), [snapshot])
  const team = useMemo(() => mergeTeamFeed(snapshot?.team ?? [], local, HIGH_FIVE_VISIBLE), [snapshot, local])

  if (!available) return null

  async function send(person: HighFivePerson, emoji: HighFiveEmoji, message: string) {
    const api = window.electronHighFives
    if (!api || !snapshot) return
    const operationId = newOperationId()
    const pending: HighFiveTeamEntry = {
      id: `pending-${operationId}`, senderName: snapshot.actor.fullName, senderTeamCode: snapshot.actor.teamCode,
      recipientName: person.fullName, recipientTeamCode: person.teamCode, emoji, message, at: new Date().toISOString(),
    }
    setDialogOpen(false)
    setLocal(current => [pending, ...current].slice(0, LOCAL_LIMIT))
    toast.success(labels.sent(person.fullName))
    try {
      const saved = await api.command({ operationId, type: 'send', recipientEmail: person.email, emoji, message })
      setLocal(current => [saved, ...current.filter(entry => entry.id !== pending.id)].slice(0, LOCAL_LIMIT))
    } catch (error) {
      setLocal(current => current.filter(entry => entry.id !== pending.id))
      toast.error(highFiveErrorText(labels, highFiveErrorCode(error)))
    }
  }

  const canSend = snapshot?.actor.canSend === true
  return (
    <Card id="high-fives-card" className={cn('p-5 md:p-7 bg-card hover:border-primary/40 transition-colors mb-4 md:mb-6', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 md:p-2 rounded-md bg-secondary text-primary">
            <HandsClapping size={24} weight="duotone" aria-hidden="true" />
          </div>
          <h3 className="text-base md:text-lg font-semibold text-foreground">{labels.title}</h3>
        </div>
        <Button type="button" size="sm" disabled={!canSend} onClick={() => setDialogOpen(true)}>
          <HandsClapping size={16} weight="duotone" className="mr-1.5" aria-hidden="true" />
          {labels.send}
        </Button>
      </div>

      {!snapshot ? (
        <p role="status" className="text-xs md:text-sm text-muted-foreground">{state.loaded ? labels.unavailable : labels.loading}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <section aria-labelledby="high-fives-received-heading">
            <h4 id="high-fives-received-heading" className="mb-2 text-sm font-semibold text-foreground">{labels.receivedHeading}</h4>
            {received.length === 0 ? (
              <p className="text-xs md:text-sm text-muted-foreground">{labels.emptyReceived}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-list="received">
                {received.map(item => (
                  <li key={item.id} data-high-five-id={item.id} className="flex items-start gap-2.5">
                    <span className="text-xl leading-none" aria-hidden="true">{item.emoji}</span>
                    <span className="min-w-0 text-xs md:text-sm text-foreground">
                      <span className="font-medium">{labels.from(item.senderName)}</span>
                      {item.readAt === null && <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">{labels.newBadge}</Badge>}
                      <span className="ml-2 text-[11px] text-muted-foreground">{relativeTime(item.at, now, language)}</span>
                      <span className="block break-words text-muted-foreground">{item.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="high-fives-team-heading">
            <h4 id="high-fives-team-heading" className="mb-2 text-sm font-semibold text-foreground">{labels.teamHeading}</h4>
            {team.length === 0 ? (
              <p className="text-xs md:text-sm text-muted-foreground">{labels.emptyTeam}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-list="team">
                {team.map(item => (
                  <li key={item.id} data-high-five-id={item.id} className="flex items-start gap-2.5">
                    <span className="text-xl leading-none" aria-hidden="true">{item.emoji}</span>
                    <span className="min-w-0 text-xs md:text-sm text-foreground">
                      <span className="font-medium">{labels.fromTo(item.senderName, item.recipientName)}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">{relativeTime(item.at, now, language)}</span>
                      <span className="block break-words text-muted-foreground">{item.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {snapshot && (
        <HighFiveDialog open={dialogOpen} onOpenChange={setDialogOpen} people={snapshot.people} teams={snapshot.teams} labels={labels} onSubmit={send} />
      )}
    </Card>
  )
}
