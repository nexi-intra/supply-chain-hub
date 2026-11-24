import { useMemo, useRef, useState } from 'react'
import { ArrowRight, ArrowsClockwise, Prohibit, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/warehouse/ui'
import { finishTitle, isDeliberateConfirm, pendingMovePlan, previewGroups, sapRunErrorMessage, targetLabel, type PendingMovePlan } from '@/lib/softwareload'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime } from '@/lib/warehouse/format'
import { t } from '@/lib/warehouse/text'
import type { SoftwareloadFinishResult, SoftwareloadPending as PendingTask, SoftwareloadPreview, WarehouseUser } from '@/types/warehouse'
import type { SoftwareloadStatus } from './Softwareload'
import { ErrorLine, ProgressBlock, ResultCard, useReportBusy, useSoftwareloadProgress, WriteDisabledLine, type ReportBusy } from './common'
import { PlanCounts, PlanSummary } from './SoftwareloadPlan'

const REASON_MAX = 200

/**
 * Finished tasks whose moves in SAP are not all done: the owner or a manager continues them, a manager can give them up.
 * "Fortsæt i SAP" looks the terminals up and shows SAP's plan first; only the plan confirmed in the dialog is moved.
 */
export function SoftwareloadPending({ user, status, reload, onBusy }: { user: WarehouseUser; status: SoftwareloadStatus; reload: () => Promise<void>; onBusy?: ReportBusy }) {
  const [looking, setLooking] = useState<string | null>(null)
  const [plan, setPlan] = useState<{ task: PendingTask; preview: SoftwareloadPreview } | null>(null)
  const [planError, setPlanError] = useState<{ id: string; text: string } | null>(null)
  // The confirmed plan stays set while the dialog closes, so it does not empty during the animation.
  const [confirm, setConfirm] = useState<{ task: PendingTask; plan: PendingMovePlan; openedAt: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const [abandoning, setAbandoning] = useState<PendingTask | null>(null)
  const [done, setDone] = useState<{ name: string; result: SoftwareloadFinishResult; abandoned: boolean } | null>(null)
  const [progress, resetProgress] = useSoftwareloadProgress(user.email)
  const inFlight = useRef(false)
  useReportBusy(onBusy, 'pending', moving !== null || looking !== null)

  const groups = useMemo(() => (plan ? previewGroups(plan.preview.outcomes) : null), [plan])
  const rowOf = useMemo(() => new Map((plan?.preview.rows ?? []).map(row => [row.serial, row])), [plan])

  /** Looks the task's terminals up in SAP and shows the plan; nothing moves yet. */
  const showPlan = async (task: PendingTask) => {
    if (inFlight.current) return
    inFlight.current = true
    setLooking(task.id)
    setPlan(null)
    setPlanError(null)
    setDone(null)
    try {
      setPlan({ task, preview: await window.electronWarehouse!.softwareload.pendingPreview({ taskId: task.id }) })
    } catch (error) {
      setPlanError({ id: task.id, text: errorMessage(error) })
    } finally {
      inFlight.current = false
      setLooking(null)
    }
  }

  const continueTask = async (task: PendingTask, confirmed: PendingMovePlan) => {
    setConfirming(false)
    // One SAP run at a time; a second press must not touch the state of the run in progress.
    if (inFlight.current) return
    inFlight.current = true
    resetProgress()
    setMoving(task.id)
    setPlanError(null)
    try {
      // Exactly the plan the dialog showed, copied when it opened.
      const result = await window.electronWarehouse!.softwareload.continueFinish(confirmed.request)
      setPlan(null)
      setDone({ name: task.name, result, abandoned: false })
    } catch (error) {
      if (errorCode(error) === 'SOFTWARELOAD_PLAN_CHANGED') {
        // Nothing moved: SAP has the terminals elsewhere than in the plan the person saw, so the new plan is shown to be checked again.
        toast.warning(errorMessage(error))
        const fresh = await window.electronWarehouse!.softwareload.pendingPreview({ taskId: task.id }).catch(() => null)
        setPlan(fresh ? { task, preview: fresh } : null)
      } else {
        setPlan(null)
        setPlanError({ id: task.id, text: sapRunErrorMessage(error) })
      }
    } finally {
      inFlight.current = false
      setMoving(null)
      void reload()
    }
  }

  const busy = moving !== null || looking !== null

  return (
    <div className="space-y-4">
      {done && (
        <ResultCard
          title={done.abandoned ? t(`${done.name}s opgave er opgivet`, `${done.name}'s task is given up`) : finishTitle(done.result.results, done.name)}
          counts={done.result.counts}
          results={done.result.results}
        >
          <div><Button size="sm" variant="outline" onClick={() => setDone(null)}>{t('Luk', 'Close')}</Button></div>
        </ResultCard>
      )}

      {status.pending.length === 0 ? (
        !done && <Card className="items-center border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t('Ingen opgaver venter på SAP.', 'No tasks are waiting for SAP.')}</Card>
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="space-y-1 border-b px-5 py-3">
            <h2 className="text-sm font-semibold">{t('Venter på SAP', 'Waiting for SAP')} ({status.pending.length})</h2>
            <p className="text-xs text-muted-foreground">{t('Tiden er stoppet, men ikke alle terminaler er flyttet. Det der er flyttet, er gemt og flyttes ikke igen. Fortsæt i SAP viser planen, før noget flyttes.', 'The time is stopped, but not every terminal is moved. What was moved is saved and is not moved again. Continue in SAP shows the plan before anything is moved.')}</p>
          </div>
          <ul className="divide-y">
            {status.pending.map(task => {
              const movedElsewhere = task.movingBy && moving !== task.id
              const shown = plan?.task.id === task.id ? plan : null
              return (
                <li key={task.id} className="space-y-3 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{task.name}</p>
                      <p className="text-xs text-muted-foreground">{t(`Afsluttet ${formatDateTime(task.endedAt)} · ${task.count} serienumre`, `Finished ${formatDateTime(task.endedAt)} · ${task.count} serial numbers`)}</p>
                      {movedElsewhere && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t(`${task.movingBy!.name} er ved at flytte opgaven i SAP. Stopper flytningen, kan den fortsættes efter 2 minutter.`, `${task.movingBy!.name} is moving the task in SAP. If that move stops, it can be continued after 2 minutes.`)}</p>}
                    </div>
                    {!shown && <Button onClick={() => showPlan(task)} loading={looking === task.id} disabled={busy || !status.writeEnabled || movedElsewhere}><ArrowsClockwise size={18} /> {t('Fortsæt i SAP', 'Continue in SAP')}</Button>}
                    {status.isManager && <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setAbandoning(task)} disabled={busy || movedElsewhere}><Prohibit size={18} /> {t('Opgiv', 'Give up')}</Button>}
                  </div>
                  {planError?.id === task.id && <ErrorLine text={planError.text} />}
                  {shown && groups && (
                    <div className="space-y-3 rounded-lg border bg-muted/20 px-4 py-3">
                      <p className="text-sm text-muted-foreground">{t('Appen har slået terminalerne op i SAP. Sådan bliver de flyttet. Intet er flyttet endnu.', 'The app has looked up the terminals in SAP. This is how they will be moved. Nothing is moved yet.')}</p>
                      <PlanSummary preview={shown.preview} groups={groups} task={shown.preview.choice} rowOf={rowOf} />
                      {moving === task.id ? <ProgressBlock progress={progress} /> : (
                        <div className="flex flex-wrap gap-2">
                          {/* Secondary on purpose: it only opens the confirmation, and must not look like the obvious target for Enter. */}
                          <Button size="lg" variant="outline" onClick={() => { setConfirm({ task, plan: pendingMovePlan(shown.preview), openedAt: Date.now() }); setConfirming(true) }} disabled={busy || !status.writeEnabled || movedElsewhere}><ArrowRight size={20} /> {t('Flyt i SAP', 'Move in SAP')}</Button>
                          <Button size="lg" variant="ghost" onClick={() => setPlan(null)} disabled={busy}><X size={18} /> {t('Luk planen', 'Close the plan')}</Button>
                        </div>
                      )}
                    </div>
                  )}
                  {moving === task.id && !shown && <ProgressBlock progress={progress} />}
                </li>
              )
            })}
          </ul>
          {!status.writeEnabled && <div className="border-t px-5 py-3"><WriteDisabledLine /></div>}
        </Card>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirm.plan.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirm.plan.count
                  ? t('Appen flytter terminalerne i SAP nu, som planen viser. Det kan ikke fortrydes.', 'The app moves the terminals in SAP now, as the plan shows. It cannot be undone.')
                  : t('Opgaven gemmes som afsluttet. Intet flyttes i SAP.', 'The task is saved as finished. Nothing is moved in SAP.')}</AlertDialogDescription>
              </AlertDialogHeader>
              {plan?.task.id === confirm.task.id && groups && <PlanCounts groups={groups} task={plan.preview.choice} />}
              {confirm.plan.steps.length > 0 && (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{t('Trin i SAP', 'Steps in SAP')}</p>
                  <ul className="space-y-1">
                    {confirm.plan.steps.map(step => (
                      <li key={step.key} className="flex justify-between gap-4">
                        <span>{step.material ? `MIGO 344 ${step.material}` : `${targetLabel(step.from!)} → ${targetLabel(step.to!)}`}</span>
                        <span className="font-semibold tabular-nums">{step.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>{t('Annullér', 'Cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={event => {
                  // The second click of the double click that opened the dialog, or a press right after it opened, is not a confirmation.
                  if (!isDeliberateConfirm({ detail: event.detail, sinceOpenMs: Date.now() - confirm.openedAt })) { event.preventDefault(); return }
                  void continueTask(confirm.task, confirm.plan)
                }}>{confirm.plan.count ? t('Flyt', 'Move') : t('Afslut', 'Finish')}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {abandoning && (
        <AbandonDialog
          task={abandoning}
          onClose={() => setAbandoning(null)}
          onDone={result => { setDone({ name: abandoning.name, result, abandoned: true }); setAbandoning(null); setPlan(null); void reload() }}
        />
      )}
    </div>
  )
}

/** A manager gives up the remaining moves with a reason; the terminals not moved stand as given up in the history. */
function AbandonDialog({ task, onClose, onDone }: { task: PendingTask; onClose: () => void; onDone: (result: SoftwareloadFinishResult) => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!reason.trim()) return
    setSaving(true)
    try {
      onDone(await window.electronWarehouse!.softwareload.abandon({ taskId: task.id, reason: reason.trim() }))
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`Opgiv flytningerne for ${task.name}s opgave`, `Give up the moves of ${task.name}'s task`)}</DialogTitle>
          <DialogDescription>{t('Terminaler der ikke er flyttet endnu, står som opgivet i historikken. Det der allerede er flyttet, bliver stående.', 'Terminals not moved yet stand as given up in the history. What is already moved stays.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="sl-abandon-reason">{t('Begrundelse', 'Reason')}</Label>
          <Textarea id="sl-abandon-reason" autoFocus value={reason} maxLength={REASON_MAX} onChange={event => setReason(event.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('Annullér', 'Cancel')}</Button>
          <Button variant="destructive" onClick={save} loading={saving} disabled={!reason.trim()}><Prohibit size={16} /> {t('Opgiv flytningerne', 'Give up the moves')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
