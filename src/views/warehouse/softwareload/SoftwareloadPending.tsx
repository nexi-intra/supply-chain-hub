import { useRef, useState } from 'react'
import { ArrowsClockwise, Prohibit } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/warehouse/ui'
import { sapRunErrorMessage } from '@/lib/softwareload'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime } from '@/lib/warehouse/format'
import { t } from '@/lib/warehouse/text'
import type { SoftwareloadFinishResult, SoftwareloadPending as PendingTask, WarehouseUser } from '@/types/warehouse'
import type { SoftwareloadStatus } from './Softwareload'
import { ProgressBlock, ResultCard, useReportBusy, useSoftwareloadProgress, WriteDisabledLine, type ReportBusy } from './common'

const REASON_MAX = 200

/** Finished tasks whose moves in SAP are not all done: the owner or a manager continues them, a manager can give them up. */
export function SoftwareloadPending({ user, status, reload, onBusy }: { user: WarehouseUser; status: SoftwareloadStatus; reload: () => Promise<void>; onBusy?: ReportBusy }) {
  const [moving, setMoving] = useState<string | null>(null)
  const [abandoning, setAbandoning] = useState<PendingTask | null>(null)
  const [done, setDone] = useState<{ name: string; result: SoftwareloadFinishResult; abandoned: boolean } | null>(null)
  const [progress, resetProgress] = useSoftwareloadProgress(user.email)
  const inFlight = useRef(false)
  useReportBusy(onBusy, 'pending', moving !== null)

  const continueTask = async (task: PendingTask) => {
    // One SAP run at a time; a second press must not touch the state of the run in progress.
    if (inFlight.current) return
    inFlight.current = true
    resetProgress()
    setMoving(task.id)
    setDone(null)
    try {
      const result = await window.electronWarehouse!.softwareload.continueFinish({ taskId: task.id })
      setDone({ name: task.name, result, abandoned: false })
    } catch (error) {
      toast.error(sapRunErrorMessage(error))
    } finally {
      inFlight.current = false
      setMoving(null)
      void reload()
    }
  }

  return (
    <div className="space-y-4">
      {done && (
        <ResultCard
          title={done.abandoned ? t(`${done.name}s opgave er opgivet`, `${done.name}'s task is given up`) : t(`${done.name}s opgave er flyttet i SAP`, `${done.name}'s task is moved in SAP`)}
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
            <p className="text-xs text-muted-foreground">{t('Tiden er stoppet, men ikke alle terminaler er flyttet. Det der er flyttet, er gemt og flyttes ikke igen.', 'The time is stopped, but not every terminal is moved. What was moved is saved and is not moved again.')}</p>
          </div>
          <ul className="divide-y">
            {status.pending.map(task => (
              <li key={task.id} className="space-y-3 px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{task.name}</p>
                    <p className="text-xs text-muted-foreground">{t(`Afsluttet ${formatDateTime(task.endedAt)} · ${task.count} serienumre`, `Finished ${formatDateTime(task.endedAt)} · ${task.count} serial numbers`)}</p>
                  </div>
                  <Button onClick={() => continueTask(task)} loading={moving === task.id} disabled={moving !== null || !status.writeEnabled}><ArrowsClockwise size={18} /> {t('Fortsæt i SAP', 'Continue in SAP')}</Button>
                  {status.isManager && <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setAbandoning(task)} disabled={moving !== null}><Prohibit size={18} /> {t('Opgiv', 'Give up')}</Button>}
                </div>
                {moving === task.id && <ProgressBlock progress={progress} />}
              </li>
            ))}
          </ul>
          {!status.writeEnabled && <div className="border-t px-5 py-3"><WriteDisabledLine /></div>}
        </Card>
      )}

      {abandoning && (
        <AbandonDialog
          task={abandoning}
          onClose={() => setAbandoning(null)}
          onDone={result => { setDone({ name: abandoning.name, result, abandoned: true }); setAbandoning(null); void reload() }}
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
