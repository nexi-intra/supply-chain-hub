import { useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import { deleteInBackground } from '../pendingDeletes'

export function DeleteCountDialog({ id, name, onClose, onDeleted }: { id: string; name: string; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim() === name.trim()

  // Gone at once from every list; the delete on M: runs in the background, and the count comes back if it fails.
  const remove = () => {
    if (!matches) return
    toast.success(t(`Optællingen "${name}" er slettet`, `The count "${name}" has been deleted`))
    onDeleted()
    deleteInBackground({ counts: [id] }, () => window.electronWarehouse!.counts.remove(id))
      .catch(error => toast.error(t(`Optællingen "${name}" blev ikke slettet`, `The count "${name}" was not deleted`), { description: errorMessage(error) }))
  }

  return (
    <Dialog open onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Slet optælling', 'Delete count')}</DialogTitle>
          <DialogDescription>
            {t('Alt i optællingen slettes for alle: SAP-billedet, scanninger, tællelinjer, deltagere og godkendelser. Det kan ikke fortrydes. Allerede gemte Excel-rapporter bliver liggende.', 'Everything in the count is deleted for everyone: the SAP snapshot, scans, count lines, participants and approvals. It cannot be undone. Excel reports already saved are kept.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-confirm">{t('Skriv optællingens navn for at bekræfte:', 'Type the name of the count to confirm:')} <strong>{name}</strong></Label>
          <Input id="delete-confirm" value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && matches) remove() }} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button variant="destructive" onClick={() => remove()} disabled={!matches}><Trash size={18} /> {t('Slet optælling', 'Delete count')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
