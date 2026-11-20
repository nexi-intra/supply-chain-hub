import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowsClockwise, CheckCircle } from '@phosphor-icons/react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { finishTitle, previewGroups, sapRunErrorMessage, targetLabel, TYPE_LABELS, type PreviewGroups } from '@/lib/softwareload'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadFinishResult, SoftwareloadPreview, SoftwareloadSapRow, SoftwareloadTaskView, WarehouseUser } from '@/types/warehouse'
import { ErrorLine, label, ProgressBlock, ResultCard, useReportBusy, useSoftwareloadProgress, WriteDisabledLine, type ReportBusy } from './common'

type GroupKey = keyof PreviewGroups

/** The groups of the confirmation, in the order of the design; the problems are marked. */
const GROUPS: { key: GroupKey; title: (task: { kif: boolean; target: string }) => string; problem?: boolean }[] = [
  { key: 'toTarget', title: task => (task.kif && task.target !== 'D005' ? t(`Til målet ${targetLabel(task.target)} via D005`, `To the target ${targetLabel(task.target)} via D005`) : t(`Til målet ${targetLabel(task.target)}`, `To the target ${targetLabel(task.target)}`)) },
  { key: 'toBlocked', title: task => (task.kif ? t('Fejlede nye (-0) til D000 og blocked stock via D005', 'Failed new (-0) to D000 and blocked stock via D005') : t('Fejlede nye (-0) til D000 og blocked stock', 'Failed new (-0) to D000 and blocked stock')) },
  { key: 'toD002', title: task => (task.kif ? t('Fejlede brugte (-R) til D002 via D005', 'Failed used (-R) to D002 via D005') : t('Fejlede brugte (-R) til D002', 'Failed used (-R) to D002')) },
  { key: 'notFound', title: () => t('Ikke fundet i SAP. Flyttes ikke', 'Not found in SAP. Not moved'), problem: true },
  { key: 'blockedStock', title: () => t('Står i blocked stock og kan ikke flyttes', 'In blocked stock and cannot be moved'), problem: true },
  { key: 'skipped', title: () => t('Står allerede på målet og springes over', 'Already on the target and skipped') },
  { key: 'manual', title: () => t('Fejlede, men materialet er hverken -0 eller -R. Kræver manuel håndtering', 'Failed, but the material is neither -0 nor -R. Needs manual handling'), problem: true },
  { key: 'alreadyBlocked', title: () => t('Fejlede og står allerede i blocked stock', 'Failed and already in blocked stock') },
]

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
  const [moving, setMoving] = useState(false)
  const [result, setResult] = useState<SoftwareloadFinishResult | null>(null)
  const [finishError, setFinishError] = useState<{ text: string; stillRunning: boolean } | null>(null)
  const [progress, resetProgress] = useSoftwareloadProgress(user.email)
  const inFlight = useRef(false)
  useReportBusy(onBusy, 'finish', moving)

  const loadPreview = useCallback(async () => {
    setPreviewError(null)
    setPreview(null)
    try {
      setPreview(await window.electronWarehouse!.softwareload.preview())
    } catch (error) {
      setPreviewError(errorMessage(error))
    }
  }, [])
  useEffect(() => { void loadPreview() }, [loadPreview])

  const groups = useMemo(() => (preview ? previewGroups(preview.outcomes) : null), [preview])
  const rowOf = useMemo(() => new Map((preview?.rows ?? []).map(row => [row.serial, row])), [preview])
  const notes = useMemo(() => Object.fromEntries((task?.terminals ?? []).map(terminal => [terminal.serial, terminal.failed?.note])), [task])

  const finish = async () => {
    setConfirming(false)
    // The dialog closes with an animation, so its button can be pressed twice; the second press must not touch this run.
    if (inFlight.current) return
    inFlight.current = true
    setFinishError(null)
    resetProgress()
    setMoving(true)
    try {
      setResult(await window.electronWarehouse!.softwareload.finish())
    } catch (error) {
      // Some refusals come before the time stops; anything later leaves the task waiting for SAP. The status tells which.
      const now = await window.electronWarehouse!.softwareload.status().catch(() => null)
      setFinishError({ text: sapRunErrorMessage(error), stillRunning: now?.running?.id === task?.id })
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

  if (result) {
    return (
      <div className="space-y-4">
        <ResultCard title={finishTitle(result.results)} counts={result.counts} results={result.results} notes={notes}>
          <p className="text-sm text-muted-foreground">{label(TYPE_LABELS[task.type])} · {task.kif ? t('I KIF', 'In KIF') : t('Uden for KIF', 'Outside KIF')} · {t('Mål', 'Target')} {targetLabel(task.target)} · {t('Version', 'Version')} {task.version}</p>
        </ResultCard>
        <Button onClick={onBack}><CheckCircle size={18} /> {t('Færdig', 'Done')}</Button>
      </div>
    )
  }

  if (finishError) {
    return (
      <Card className="gap-4 px-6 py-8">
        <ErrorLine text={finishError.text} />
        <p className="text-sm text-muted-foreground">{finishError.stillRunning
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
          <Button variant="outline" onClick={onBack} disabled={moving}><ArrowLeft size={18} /> {t('Tilbage til opgaven', 'Back to the task')}</Button>
          <h2 className="text-lg font-semibold">{t('Afslut opgaven', 'Finish the task')}</h2>
          <span className="flex flex-wrap gap-2">
            <Badge variant="secondary">{label(TYPE_LABELS[task.type])}</Badge>
            <Badge variant="outline">{task.kif ? t('I KIF', 'In KIF') : t('Uden for KIF', 'Outside KIF')}</Badge>
            <Badge variant="outline">{t('Mål', 'Target')} {targetLabel(task.target)}</Badge>
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t('Appen har slået terminalerne op i SAP. Sådan bliver de flyttet. Intet er flyttet endnu, og tiden kører stadig.', 'The app has looked up the terminals in SAP. This is how they will be moved. Nothing is moved yet and the time is still running.')}</p>
        {previewError && (
          <div className="space-y-2">
            <ErrorLine text={previewError} />
            <Button variant="outline" onClick={loadPreview}><ArrowsClockwise size={18} /> {t('Prøv igen', 'Try again')}</Button>
          </div>
        )}
        {!preview && !previewError && <Skeleton className="h-40 rounded-xl" />}
        {preview && groups && <PlanSummary preview={preview} groups={groups} task={task} rowOf={rowOf} notes={notes} />}
        {moving && <ProgressBlock progress={progress} />}
        {preview && !moving && (
          <div className="space-y-2">
            <Button size="lg" onClick={() => setConfirming(true)} disabled={!writeEnabled}><CheckCircle size={20} weight="fill" /> {t('Afslut og flyt i SAP', 'Finish and move in SAP')}</Button>
            {!writeEnabled && <WriteDisabledLine />}
          </div>
        )}
      </Card>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Afslut og flyt i SAP?', 'Finish and move in SAP?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('Tiden stopper nu, og appen flytter terminalerne i SAP. Det kan ikke fortrydes.', 'The time stops now and the app moves the terminals in SAP. It cannot be undone.')}</AlertDialogDescription>
          </AlertDialogHeader>
          {groups && (
            <ul className="space-y-1 text-sm">
              {GROUPS.filter(group => groups[group.key].length).map(group => (
                <li key={group.key} className="flex justify-between gap-4">
                  <span className={cn(group.problem && 'text-destructive')}>{group.title(task)}</span>
                  <span className="font-semibold tabular-nums">{groups[group.key].length}</span>
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Annullér', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void finish()}>{t('Afslut og flyt', 'Finish and move')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PlanSummary({ preview, groups, task, rowOf, notes }: { preview: SoftwareloadPreview; groups: PreviewGroups; task: SoftwareloadTaskView; rowOf: Map<string, SoftwareloadSapRow>; notes: Record<string, string | undefined> }) {
  const shown = GROUPS.filter(group => groups[group.key].length)
  return (
    <div className="space-y-3">
      {shown.length === 0 && <p className="text-sm text-muted-foreground">{t('Opgaven har ingen serienumre. Der flyttes intet, og kun tiden gemmes.', 'The task has no serial numbers. Nothing is moved and only the time is saved.')}</p>}
      {shown.map(group => (
        <details key={group.key} className="rounded-lg border px-4 py-3" open={group.problem}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
            <span className={cn(group.problem && 'text-destructive')}>{group.title(task)}</span>
            <Badge variant={group.problem ? 'destructive' : 'secondary'}>{groups[group.key].length}</Badge>
          </summary>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {groups[group.key].map(serial => {
              const row = rowOf.get(serial)
              return (
                <li key={serial} className="flex flex-wrap gap-x-2">
                  <span className="font-mono">{serial}</span>
                  {row && <span className="text-muted-foreground">{row.material} · {row.sloc}{row.blocked ? ' · blocked' : ''}</span>}
                  {notes[serial] && <span className="w-full text-xs text-muted-foreground">{t('Note', 'Note')}: {notes[serial]}</span>}
                </li>
              )
            })}
          </ul>
        </details>
      ))}
      {(preview.transfers.length > 0 || preview.blocks.length > 0) && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium">{t('Trin i SAP', 'Steps in SAP')}</p>
          <ul className="flex flex-wrap gap-2">
            {preview.transfers.map(move => <li key={`${move.wave}-${move.from}-${move.to}`} className="rounded border px-2 py-0.5">{targetLabel(move.from)} → {targetLabel(move.to)} ({move.serials.length})</li>)}
            {preview.blocks.map(block => <li key={`344-${block.material}`} className="rounded border px-2 py-0.5 font-mono">MIGO 344 {block.material} ({block.serials.length})</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
