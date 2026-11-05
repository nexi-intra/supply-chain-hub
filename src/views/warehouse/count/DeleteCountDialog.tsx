import { useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'

export function DeleteCountDialog({ id, name, onClose, onDeleted }: { id: string; name: string; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const matches = typed.trim() === name.trim()

  const remove = async () => {
    setDeleting(true)
    try {
      await window.electronWarehouse!.counts.remove(id)
      toast.success(t(`Optællingen "${name}" er slettet`, `The count "${name}" has been deleted`))
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
          <DialogTitle>{t('Slet optælling', 'Delete count')}</DialogTitle>
          <DialogDescription>
            {t('Alt i optællingen slettes for alle: SAP-billedet, scanninger, tællelinjer, deltagere og godkendelser. Det kan ikke fortrydes. Allerede gemte Excel-rapporter bliver liggende.', 'Everything in the count is deleted for everyone: the SAP snapshot, scans, count lines, participants and approvals. It cannot be undone. Excel reports already saved are kept.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-confirm">{t('Skriv optællingens navn for at bekræfte:', 'Type the name of the count to confirm:')} <strong>{name}</strong></Label>
          <Input id="delete-confirm" value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && matches) void remove() }} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>{t('Annullér', 'Cancel')}</Button>
          <Button variant="destructive" onClick={() => void remove()} disabled={!matches} loading={deleting}><Trash size={18} /> {t('Slet optælling', 'Delete count')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
