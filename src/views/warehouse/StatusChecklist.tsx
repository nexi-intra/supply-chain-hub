import { useCallback, useEffect, useState } from 'react'
import { ArrowsClockwise, CheckCircle, LockSimple, LockSimpleOpen, Trash, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/warehouse/ui'
import { errorMessage } from '@/lib/warehouse/errors'
import type { CountStatus, StatusChecklist } from '@/types/warehouse'
import { currentWarehouseLanguage, t } from '@/lib/warehouse/text'

const SHOWN_MATERIALS = 8

export function StatusChecklistCard({ status, canManage, onChanged }: { status: CountStatus; canManage: boolean; onChanged: () => Promise<void> }) {
  const [checklist, setChecklist] = useState<StatusChecklist | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setChecklist(await window.electronWarehouse!.statuses.checklist(status.id))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [status.id])

  useEffect(() => { void load() }, [load])

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{t('Tjekliste før godkendelse', 'Checklist before approval')}</CardTitle>
          <CardDescription>{t('Alle optællinger skal være afsluttet, og alle materialer godkendt eller bogført i SAP.', 'All counts must be closed, and all materials approved or posted in SAP.')}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => load()} loading={loading}><ArrowsClockwise size={16} /> {t('Opdatér', 'Refresh')}</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!checklist ? <Skeleton className="h-24 rounded-lg" /> : (
          <>
            {checklist.counts.length === 0 && <p className="text-sm text-muted-foreground">{t('Statussen har ingen optællinger endnu.', 'The status has no counts yet.')}</p>}
            {checklist.ready && (
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle size={18} weight="fill" /> {t('Alt er klar – alle optællinger er afsluttet, og alle materialer er godkendt eller bogført.', 'Everything is ready – all counts are closed, and all materials are approved or posted.')}
              </p>
            )}
            <ul className="space-y-3">
              {checklist.counts.filter(item => item.open || item.pending.length > 0).map(item => (
                <li key={item.id} className="rounded-lg border px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <WarningCircle size={18} className="text-amber-600 dark:text-amber-400" />
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-muted-foreground">· {item.owner.name}</span>
                    {item.open && <Badge variant="outline">{t('Åben – skal afsluttes', 'Open – must be closed')}</Badge>}
                    {item.pending.length > 0 && <Badge variant="outline">{t(`${item.pending.length} af ${item.materials} materialer mangler godkendelse`, `${item.pending.length} of ${item.materials} materials need approval`)}</Badge>}
                  </div>
                  {item.pending.length > 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {item.pending.slice(0, SHOWN_MATERIALS).map(entry => `${entry.material}${entry.status === 'returned' ? t(' (sendt tilbage)', ' (sent back)') : entry.status === 'submitted' ? t(' (sendt til godkendelse)', ' (sent for approval)') : ''}`).join(', ')}
                      {item.pending.length > SHOWN_MATERIALS ? t(` og ${item.pending.length - SHOWN_MATERIALS} mere`, ` and ${item.pending.length - SHOWN_MATERIALS} more`) : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {canManage && (
              <Button onClick={() => setConfirming(true)} disabled={!checklist.ready || loading}>
                <LockSimple size={18} weight="bold" /> {t('Godkend og lås status', 'Approve and lock status')}
              </Button>
            )}
          </>
        )}
      </CardContent>
      {confirming && <LockDialog status={status} onClose={() => setConfirming(false)} onLocked={async () => { setConfirming(false); await onChanged() }} />}
    </Card>
  )
}

function LockDialog({ status, onClose, onLocked }: { status: CountStatus; onClose: () => void; onLocked: () => Promise<void> }) {
  const [locking, setLocking] = useState(false)
  const lock = async () => {
    setLocking(true)
    try {
      const locked = await window.electronWarehouse!.statuses.lock(status.id, currentWarehouseLanguage())
      const report = locked.reports?.[locked.reports.length - 1]
      toast.success(t(`"${locked.name}" er godkendt og låst`, `"${locked.name}" is approved and locked`), { description: report ? t(`Endelig rapport version ${report.version} er gemt.`, `Final report version ${report.version} is saved.`) : undefined })
      await onLocked()
    } catch (error) {
      toast.error(errorMessage(error))
      setLocking(false)
    }
  }
  return (
    <Dialog open onOpenChange={value => { if (!value && !locking) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`Godkend og lås "${status.name}"`, `Approve and lock "${status.name}"`)}</DialogTitle>
          <DialogDescription>
            {t('Der dannes en endelig statusrapport og en rapport pr. optælling. Bagefter kan intet i statussen ændres, før en manager låser den op med en begrundelse.', 'A final status report and a report per count are made. Afterwards nothing in the status can be changed until a manager unlocks it with a reason.')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={locking}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => lock()} loading={locking}><LockSimple size={18} /> {t('Godkend og lås', 'Approve and lock')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteStatusDialog({ status, onClose, onDeleted }: { status: CountStatus; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const matches = typed.trim() === status.name.trim()
  const remove = async () => {
    setDeleting(true)
    try {
      const result = await window.electronWarehouse!.statuses.remove(status.id)
      toast.success(t(`"${status.name}" er slettet`, `"${status.name}" has been deleted`), { description: t(`${result.counts} ${result.counts === 1 ? 'optælling' : 'optællinger'} blev slettet med den.`, `${result.counts} ${result.counts === 1 ? 'count was' : 'counts were'} deleted with it.`) })
      onDeleted()
    } catch (error) {
      toast.error(errorMessage(error))
      setDeleting(false)
    }
  }
  return (
    <Dialog open onOpenChange={value => { if (!value && !deleting) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Slet status', 'Delete status')}</DialogTitle>
          <DialogDescription>
            {t(`Statussen og alle dens ${status.counts.length} ${status.counts.length === 1 ? 'optælling' : 'optællinger'} slettes for alle: SAP-billeder, scanninger, tællelinjer, deltagere, godkendelser og historik. Det kan ikke fortrydes. Allerede gemte Excel-rapporter bliver liggende.`, `The status and all its ${status.counts.length} ${status.counts.length === 1 ? 'count' : 'counts'} are deleted for everyone: SAP snapshots, scans, count lines, participants, approvals and history. It cannot be undone. Excel reports already saved are kept.`)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-status-confirm">{t('Skriv statussens navn for at bekræfte:', 'Type the name of the status to confirm:')} <strong>{status.name}</strong></Label>
          <Input id="delete-status-confirm" value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && matches) void remove() }} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>{t('Annullér', 'Cancel')}</Button>
          <Button variant="destructive" onClick={() => remove()} disabled={!matches} loading={deleting}><Trash size={18} /> {t('Slet status', 'Delete status')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UnlockDialog({ status, onClose, onUnlocked }: { status: CountStatus; onClose: () => void; onUnlocked: () => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const valid = reason.trim().length >= 3
  const unlock = async () => {
    setUnlocking(true)
    try {
      await window.electronWarehouse!.statuses.unlock({ id: status.id, reason })
      toast.success(t(`"${status.name}" er låst op`, `"${status.name}" is unlocked`))
      await onUnlocked()
    } catch (error) {
      toast.error(errorMessage(error))
      setUnlocking(false)
    }
  }
  return (
    <Dialog open onOpenChange={value => { if (!value && !unlocking) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`Lås "${status.name}" op`, `Unlock "${status.name}"`)}</DialogTitle>
          <DialogDescription>
            {t('Optællingerne kan derefter genåbnes og rettes. Begrundelsen gemmes i historikken og kommer med i næste endelige rapport.', 'The counts can then be reopened and corrected. The reason is saved in the history and included in the next final report.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="unlock-reason">{t('Begrundelse', 'Reason')}</Label>
          <Textarea id="unlock-reason" value={reason} maxLength={300} onChange={event => setReason(event.target.value)} placeholder={t('Fx: R162-0717 skal tælles om på A1.2', 'E.g.: R162-0717 must be recounted on A1.2')} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={unlocking}>{t('Annullér', 'Cancel')}</Button>
          <Button variant="destructive" onClick={() => unlock()} disabled={!valid} loading={unlocking}><LockSimpleOpen size={18} /> {t('Lås op', 'Unlock')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
