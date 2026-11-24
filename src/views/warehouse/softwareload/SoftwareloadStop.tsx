import { useRef, useState } from 'react'
import { Stop } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { nextLongRunAsk, targetLabel, TYPE_LABELS, type LongRunAsk } from '@/lib/softwareload'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import type { SoftwareloadStopResult, SoftwareloadTaskView } from '@/types/warehouse'
import { label } from './common'
import { LongRunDialog } from '../timeclock/LongRunDialog'

/** Refusals after which the task is no longer the one the screen shows (edited, finished or gone elsewhere). */
const TASK_CHANGED = ['SOFTWARELOAD_CHANGED', 'SOFTWARELOAD_NOT_RUNNING', 'SOFTWARELOAD_ALREADY_FINISHED']

interface StopLaterProps {
  /** The running task as the screen shows it; its four choices are what the person confirms. */
  task: SoftwareloadTaskView
  writeEnabled: boolean
  disabled?: boolean
  variant?: 'default' | 'outline'
  /** The time is stopped and the task waits under Venter på SAP. */
  onStopped: (result: SoftwareloadStopResult) => void
  /** The task is no longer the one shown; the screen shows it again. */
  onChanged: () => void
}

/**
 * "Stop tiden nu, flyt i SAP senere": the time stops without asking SAP, and the task waits under Venter på SAP. The
 * confirmation shows the four choices and the number of terminals; SAP's plan is shown later, before "Fortsæt i SAP" moves.
 */
export function StopLaterButton({ task, writeEnabled, disabled, variant = 'outline', onStopped, onChanged }: StopLaterProps) {
  const [confirming, setConfirming] = useState(false)
  // Worked out again at every 10-hour refusal (see nextLongRunAsk); this button lives as long as the task screen.
  const [ask, setAsk] = useState<LongRunAsk>(() => ({ open: false, key: 0, earliest: task.earliestEndAt }))
  const [stopping, setStopping] = useState(false)
  const inFlight = useRef(false)
  const failed = task.terminals.filter(terminal => terminal.failed).length

  const stop = async (endAt?: number) => {
    setConfirming(false)
    setAsk(current => nextLongRunAsk(current, { kind: 'close' }))
    // The dialog closes with an animation, so its button can be pressed twice; the second press must not stop again.
    if (inFlight.current) return
    inFlight.current = true
    setStopping(true)
    try {
      const choice = { type: task.type, kif: task.kif, target: task.target, version: task.version }
      onStopped(await window.electronWarehouse!.softwareload.stop({ taskId: task.id, choice, ...(endAt === undefined ? {} : { endAt }) }))
    } catch (error) {
      const code = errorCode(error)
      // After more than 10 hours the time stops only when the person has said when the work really stopped.
      if (code === 'SOFTWARELOAD_LONG_RUN' || (endAt !== undefined && code === 'SOFTWARELOAD_INVALID')) {
        if (code === 'SOFTWARELOAD_INVALID') {
          toast.error(errorMessage(error))
          const fresh = await window.electronWarehouse!.softwareload.status().catch(() => null)
          const earliest = fresh?.running && fresh.running.id === task.id ? fresh.running.earliestEndAt : undefined
          setAsk(current => nextLongRunAsk(current, { kind: 'invalid', earliest }))
        } else {
          setAsk(current => nextLongRunAsk(current, { kind: 'long-run', at: Date.now(), earliest: task.earliestEndAt }))
        }
        return
      }
      if (TASK_CHANGED.includes(code ?? '')) {
        toast.warning(errorMessage(error))
        onChanged()
      } else {
        toast.error(errorMessage(error))
      }
    } finally {
      inFlight.current = false
      setStopping(false)
    }
  }

  return (
    <>
      <Button size="lg" variant={variant} onClick={() => setConfirming(true)} loading={stopping} disabled={disabled || stopping || !writeEnabled}>
        <Stop size={18} weight="fill" /> {t('Stop tiden nu, flyt i SAP senere', 'Stop the time now, move in SAP later')}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Stop tiden nu, flyt i SAP senere?', 'Stop the time now, move in SAP later?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('Tiden stopper nu, og intet slås op eller flyttes i SAP. Opgaven venter under Venter på SAP. Når SAP er klar, viser Fortsæt i SAP planen, før noget flyttes.', 'The time stops now, and nothing is looked up or moved in SAP. The task waits under Waiting for SAP. When SAP is ready, Continue in SAP shows the plan before anything is moved.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t('Type', 'Type')}</dt><dd>{label(TYPE_LABELS[task.type])}</dd>
            <dt className="text-muted-foreground">KIF</dt><dd>{task.kif ? t('I KIF', 'In KIF') : t('Uden for KIF', 'Outside KIF')}</dd>
            <dt className="text-muted-foreground">{t('Mål', 'Target')}</dt><dd>{targetLabel(task.target)}</dd>
            <dt className="text-muted-foreground">{t('Version', 'Version')}</dt><dd>{task.version}</dd>
            <dt className="text-muted-foreground">{t('Terminaler', 'Terminals')}</dt>
            <dd className="tabular-nums">{task.terminals.length}{failed > 0 && ` (${t(`${failed} fejlet`, `${failed} failed`)})`}</dd>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Annullér', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void stop()}>{t('Stop tiden', 'Stop the time')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LongRunDialog key={ask.key} open={ask.open} startedAt={task.startedAt} earliest={ask.earliest} taskName={t('softwareload-opgaven', 'the softwareload task')} onCancel={() => setAsk(current => nextLongRunAsk(current, { kind: 'close' }))} onStop={endAt => void stop(endAt)} busy={stopping} />
    </>
  )
}
