import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowsClockwise, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { confirmedSteps, finishTitle, isDeliberateConfirm, nextLongRunAsk, previewGroups, sapRunErrorMessage, targetLabel, TYPE_LABELS, type LongRunAsk } from '@/lib/softwareload'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { formatDuration } from '@/lib/timeclock'
import { t } from '@/lib/warehouse/text'
import type { SoftwareloadFinishResult, SoftwareloadPreview, SoftwareloadStopResult, SoftwareloadTaskView, WarehouseUser } from '@/types/warehouse'
import { ErrorLine, label, ProgressBlock, ResultCard, useReportBusy, useSoftwareloadProgress, WriteDisabledLine, type ReportBusy } from './common'
import { PlanCounts, PlanSummary } from './SoftwareloadPlan'
import { StopLaterButton } from './SoftwareloadStop'
import { LongRunDialog } from '../timeclock/LongRunDialog'

interface FinishProps {
  user: WarehouseUser
  task: SoftwareloadTaskView | null
  writeEnabled: boolean
  onBack: () => void
  onChanged: () => Promise<void>
  onOpenPending: () => void
  onBusy?: ReportBusy
}

/** Finishing the running task: the plan from SAP, a confirmation, the moves with progress and the result per serial. */
export function SoftwareloadFinish({ user, task: initial, writeEnabled, onBack, onChanged, onOpenPending, onBusy }: FinishProps) {
  // The running task disappears from the status when the time stops; the screen keeps showing what was finished.
  const [task] = useState(initial)
  const [preview, setPreview] = useState<SoftwareloadPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Worked out again at every 10-hour refusal (see nextLongRunAsk).
  const [ask, setAsk] = useState<LongRunAsk>(() => ({ open: false, key: 0, earliest: initial?.earliestEndAt }))
  const [moving, setMoving] = useState(false)
  const [result, setResult] = useState<SoftwareloadFinishResult | null>(null)
  const [finishError, setFinishError] = useState<{ text: string; stillRunning: boolean; alreadyFinished: boolean } | null>(null)
  const [stopped, setStopped] = useState<SoftwareloadStopResult | null>(null)
  // A finish refused because SAP had the terminals elsewhere has stopped the time: the task waits for SAP, and the screen
  // shows SAP's new plan, moved with "Fortsæt i SAP" once confirmed.
  const [handedOver, setHandedOver] = useState(false)
  const [openedAt, setOpenedAt] = useState(0)
  const [progress, resetProgress] = useSoftwareloadProgress(user.email)
  const inFlight = useRef(false)
  useReportBusy(onBusy, 'finish', moving)

  const loadPreview = useCallback(async (waiting = false) => {
    setPreviewError(null)
    setPreview(null)
    try {
      setPreview(waiting && task
        ? await window.electronWarehouse!.softwareload.pendingPreview({ taskId: task.id })
        : await window.electronWarehouse!.softwareload.preview())
    } catch (error) {
      setPreviewError(errorMessage(error))
    }
  }, [task])
  useEffect(() => { void loadPreview() }, [loadPreview])

  const groups = useMemo(() => (preview ? previewGroups(preview.outcomes) : null), [preview])
  const rowOf = useMemo(() => new Map((preview?.rows ?? []).map(row => [row.serial, row])), [preview])
  const notes = useMemo(() => Object.fromEntries((task?.terminals ?? []).map(terminal => [terminal.serial, terminal.failed?.note])), [task])

  const finish = async (endAt?: number) => {
    setConfirming(false)
    setAsk(current => nextLongRunAsk(current, { kind: 'close' }))
    // The dialog closes with an animation, so its button can be pressed twice; the second press must not touch this run.
    if (inFlight.current || !preview) return
    inFlight.current = true
    setFinishError(null)
    resetProgress()
    setMoving(true)
    try {
      // Only what this preview showed may be moved: the task, its choices and its SAP steps. A task edited since, or a plan
      // SAP no longer gives, is refused, and the new plan is shown instead.
      const planned = confirmedSteps(preview)
      setResult(handedOver
        ? await window.electronWarehouse!.softwareload.continueFinish({ taskId: preview.taskId, planned })
        : await window.electronWarehouse!.softwareload.finish({ taskId: preview.taskId, choice: preview.choice, planned, ...(endAt === undefined ? {} : { endAt }) }))
    } catch (error) {
      const code = errorCode(error)
      if (code === 'SOFTWARELOAD_CHANGED') {
        toast.warning(errorMessage(error))
        void loadPreview()
        return
      }
      if (code === 'SOFTWARELOAD_PLAN_CHANGED') {
        // Nothing moved. The time stopped at the confirmation and the task waits for SAP; its new plan is shown to be confirmed.
        toast.warning(errorMessage(error))
        setHandedOver(true)
        void loadPreview(true)
        return
      }
      // After more than 10 hours the time stops only when the person has said when the work really stopped. Nothing is moved yet.
      if (code === 'SOFTWARELOAD_LONG_RUN' || (endAt !== undefined && code === 'SOFTWARELOAD_INVALID')) {
        if (code === 'SOFTWARELOAD_INVALID') {
          toast.error(errorMessage(error))
          // The task may have been resumed elsewhere since the screen opened; the earliest end is asked again.
          const fresh = await window.electronWarehouse!.softwareload.status().catch(() => null)
          const earliest = fresh?.running && fresh.running.id === task?.id ? fresh.running.earliestEndAt : undefined
          setAsk(current => nextLongRunAsk(current, { kind: 'invalid', earliest }))
        } else {
          // A fresh dialog: its suggested end is worked out now, also when the screen has been open for long.
          setAsk(current => nextLongRunAsk(current, { kind: 'long-run', at: Date.now(), earliest: task?.earliestEndAt }))
        }
        return
      }
      // Some refusals come before the time stops; anything later leaves the task waiting for SAP. The status tells which.
      const now = await window.electronWarehouse!.softwareload.status().catch(() => null)
      setFinishError({ text: sapRunErrorMessage(error), stillRunning: now?.running?.id === task?.id, alreadyFinished: errorCode(error) === 'SOFTWARELOAD_ALREADY_FINISHED' })
    } finally {
      inFlight.current = false
      setMoving(false)
      void onChanged()
    }
  }

  if (!task) {
    return (
      <Card className="gap-4 px-6 py-8">
        <p className="text-sm text-muted-foreground">{t('Der kører ikke nogen softwareload-opgave.', 'No softwareload task is running.')}</p>
        <div><Button variant="outline" onClick={onBack}><ArrowLeft size={18} /> {t('Tilbage', 'Back')}</Button></div>
      </Card>
    )
  }
  // The plan was made with the choices the task had when SAP was asked; those are shown, confirmed and moved with.
  const shown = preview ? { ...task, ...preview.choice } : task

  if (result) {
    return (
      <div className="space-y-4">
        <ResultCard title={finishTitle(result.results)} counts={result.counts} results={result.results} notes={notes}>
          <p className="text-sm text-muted-foreground">{label(TYPE_LABELS[shown.type])} · {shown.kif ? t('I KIF', 'In KIF') : t('Uden for KIF', 'Outside KIF')} · {t('Mål', 'Target')} {targetLabel(shown.target)} · {t('Version', 'Version')} {shown.version}</p>
        </ResultCard>
        <Button onClick={onBack}><CheckCircle size={18} /> {t('Færdig', 'Done')}</Button>
      </div>
    )
  }

  if (stopped) {
    return (
      <Card className="gap-4 px-6 py-8">
        <h2 className="text-lg font-semibold">{t('Tiden er stoppet', 'The time is stopped')}</h2>
        <p className="text-sm text-muted-foreground">{t(`Opgaven er gemt med ${formatDuration(stopped.workedMs, 'da')} og ${stopped.count} terminaler. Intet er flyttet i SAP endnu. Når SAP er klar, viser Fortsæt i SAP under Venter på SAP planen, før noget flyttes.`, `The task is saved with ${formatDuration(stopped.workedMs, 'en')} and ${stopped.count} terminals. Nothing is moved in SAP yet. When SAP is ready, Continue in SAP under Waiting for SAP shows the plan before anything is moved.`)}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpenPending}>{t('Gå til Venter på SAP', 'Go to Waiting for SAP')}</Button>
          <Button variant="outline" onClick={onBack}><CheckCircle size={18} /> {t('Færdig', 'Done')}</Button>
        </div>
      </Card>
    )
  }

  if (finishError) {
    return (
      <Card className="gap-4 px-6 py-8">
        <ErrorLine text={finishError.text} />
        <p className="text-sm text-muted-foreground">{finishError.alreadyFinished
          ? t('Opgaven blev overdraget til SAP tidligere og flyttes ikke igen. Den står under Venter på SAP, eller du kan finde den under Søg serienummer.', 'The task was handed over to SAP earlier and is not moved again. It is under Waiting for SAP, or you can find it under Search serial number.')
          : finishError.stillRunning
          ? t('Opgaven kører stadig. Intet er flyttet.', 'The task is still running. Nothing was moved.')
          : t('Tiden er stoppet, og opgaven venter på SAP. Det der allerede er flyttet, er gemt. Fortsæt under Venter på SAP, når SAP er klar.', 'The time is stopped and the task waits for SAP. What was already moved is saved. Continue under Waiting for SAP when SAP is ready.')}</p>
        <div className="flex flex-wrap gap-2">
          {finishError.stillRunning
            ? <Button variant="outline" onClick={onBack}><ArrowLeft size={18} /> {t('Tilbage til opgaven', 'Back to the task')}</Button>
            : <Button onClick={onOpenPending}>{t('Gå til Venter på SAP', 'Go to Waiting for SAP')}</Button>}
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="gap-4 px-6 py-6">
        <div className="flex flex-wrap items-center gap-3">
          {handedOver
            ? <Button variant="outline" onClick={onOpenPending} disabled={moving}><ArrowLeft size={18} /> {t('Gå til Venter på SAP', 'Go to Waiting for SAP')}</Button>
            : <Button variant="outline" onClick={onBack} disabled={moving}><ArrowLeft size={18} /> {t('Tilbage til opgaven', 'Back to the task')}</Button>}
          <h2 className="text-lg font-semibold">{t('Afslut opgaven', 'Finish the task')}</h2>
          <span className="flex flex-wrap gap-2">
            <Badge variant="secondary">{label(TYPE_LABELS[shown.type])}</Badge>
            <Badge variant="outline">{shown.kif ? t('I KIF', 'In KIF') : t('Uden for KIF', 'Outside KIF')}</Badge>
            <Badge variant="outline">{t('Mål', 'Target')} {targetLabel(shown.target)}</Badge>
            <Badge variant="outline">{t('Version', 'Version')} {shown.version}</Badge>
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{handedOver
          ? t('Tiden er stoppet, og opgaven venter på SAP. SAP havde terminalerne et andet sted end i planen, du så, så intet er flyttet. Sådan bliver de flyttet nu.', 'The time is stopped and the task waits for SAP. SAP had the terminals elsewhere than in the plan you saw, so nothing was moved. This is how they will be moved now.')
          : t('Appen har slået terminalerne op i SAP. Sådan bliver de flyttet. Intet er flyttet endnu, og tiden kører stadig.', 'The app has looked up the terminals in SAP. This is how they will be moved. Nothing is moved yet and the time is still running.')}</p>
        {previewError && (
          <div className="space-y-2">
            <ErrorLine text={previewError} />
            {!handedOver && <p className="text-sm text-muted-foreground">{t('Kan SAP ikke svare nu, kan du stoppe tiden og flytte terminalerne senere.', 'If SAP cannot answer now, you can stop the time and move the terminals later.')}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadPreview(handedOver)}><ArrowsClockwise size={18} /> {t('Prøv igen', 'Try again')}</Button>
              {!handedOver && <StopLaterButton task={shown} writeEnabled={writeEnabled} onStopped={result => { setStopped(result); void onChanged() }} onChanged={onBack} />}
            </div>
            {!writeEnabled && <WriteDisabledLine />}
          </div>
        )}
        {!preview && !previewError && <Skeleton className="h-40 rounded-xl" />}
        {preview && groups && <PlanSummary preview={preview} groups={groups} task={shown} rowOf={rowOf} notes={notes} />}
        {moving && <ProgressBlock progress={progress} />}
        {preview && !moving && (
          <div className="space-y-2">
            {handedOver
              ? <Button size="lg" variant="outline" onClick={() => { setOpenedAt(Date.now()); setConfirming(true) }} disabled={!writeEnabled}><CheckCircle size={20} weight="fill" /> {t('Flyt i SAP', 'Move in SAP')}</Button>
              : <Button size="lg" onClick={() => { setOpenedAt(Date.now()); setConfirming(true) }} disabled={!writeEnabled}><CheckCircle size={20} weight="fill" /> {t('Afslut og flyt i SAP', 'Finish and move in SAP')}</Button>}
            {!writeEnabled && <WriteDisabledLine />}
          </div>
        )}
      </Card>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{handedOver ? t('Flyt i SAP efter den nye plan?', 'Move in SAP along the new plan?') : t('Afslut og flyt i SAP?', 'Finish and move in SAP?')}</AlertDialogTitle>
            <AlertDialogDescription>{handedOver
              ? t('Tiden er allerede stoppet. Appen flytter terminalerne i SAP, som den nye plan viser. Det kan ikke fortrydes.', 'The time is already stopped. The app moves the terminals in SAP as the new plan shows. It cannot be undone.')
              : t('Tiden stopper nu, og appen flytter terminalerne i SAP. Det kan ikke fortrydes.', 'The time stops now and the app moves the terminals in SAP. It cannot be undone.')}</AlertDialogDescription>
          </AlertDialogHeader>
          {groups && <PlanCounts groups={groups} task={shown} />}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Annullér', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={event => {
              // As in Venter på SAP: the second click of the double click that opened the dialog is not a confirmation of the new plan.
              if (handedOver && !isDeliberateConfirm({ detail: event.detail, sinceOpenMs: Date.now() - openedAt })) { event.preventDefault(); return }
              void finish()
            }}>{handedOver ? t('Flyt', 'Move') : t('Afslut og flyt', 'Finish and move')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LongRunDialog key={ask.key} open={ask.open} startedAt={task.startedAt} earliest={ask.earliest} taskName={t('softwareload-opgaven', 'the softwareload task')} onCancel={() => setAsk(current => nextLongRunAsk(current, { kind: 'close' }))} onStop={endAt => void finish(endAt)} busy={moving} />
    </div>
  )
}
