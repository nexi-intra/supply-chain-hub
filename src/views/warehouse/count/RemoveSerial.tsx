import { useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatTime } from '@/lib/warehouse/format'
import { t } from '@/lib/warehouse/text'

/** Removes a found serial (logged, undoable) and offers "Fortryd" in the toast. */
export async function removeFoundSerial(id: string, serial: string, refresh: () => Promise<void>) {
  try {
    const result = await window.electronWarehouse!.counts.removeSerial({ id, serial })
    toast.success(t(`${result.serial} er fjernet fra fundne`, `${result.serial} was removed from found`), {
      description: t(`Var fundet af ${result.previous.byName} kl. ${formatTime(result.previous.at)}${result.previous.place ? ` på ${result.previous.place}` : ''}.`, `Was found by ${result.previous.byName} at ${formatTime(result.previous.at)}${result.previous.place ? ` in ${result.previous.place}` : ''}.`),
      action: { label: t('Fortryd', 'Undo'), onClick: () => { window.electronWarehouse!.counts.undo({ id, eventId: result.eventId }).then(() => refresh()).catch(error => toast.error(errorMessage(error))) } },
      duration: 6000,
    })
    await refresh()
    return true
  } catch (error) {
    toast.error(errorMessage(error))
    return false
  }
}

export function RemoveSerialButton({ id, serial, refresh }: { id: string; serial: string; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    if (!window.confirm(t(`Fjern ${serial} fra fundne serienumre?\n\nDet kan fortrydes bagefter.`, `Remove ${serial} from found serial numbers?\n\nIt can be undone afterwards.`))) return
    setBusy(true)
    await removeFoundSerial(id, serial, refresh)
    setBusy(false)
  }
  return <Button size="icon" variant="ghost" className="size-7" loading={busy} onClick={() => void remove()} aria-label={t(`Fjern ${serial}`, `Remove ${serial}`)} title={t('Fjern fra fundne', 'Remove from found')}><Trash size={14} /></Button>
}

/** "Fjern serienummer": scan or type the serial that should not count after all. */
export function RemoveSerialDialog({ id, refresh, onClose }: { id: string; refresh: () => Promise<void>; onClose: () => void }) {
  const [serial, setSerial] = useState('')
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    if (!serial.trim()) return
    setBusy(true)
    if (await removeFoundSerial(id, serial.trim(), refresh)) setSerial('')
    setBusy(false)
  }
  return (
    <Dialog open onOpenChange={value => { if (!value && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Fjern serienummer', 'Remove serial number')}</DialogTitle>
          <DialogDescription>{t('Scan eller skriv et serienummer, der ikke skal tælle med alligevel (fx scannet ved en fejl). Det fjernes fra fundne og kan fortrydes bagefter.', 'Scan or type a serial number that should not count after all (e.g. scanned by mistake). It is removed from found and can be undone afterwards.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="remove-serial">{t('Serienummer', 'Serial number')}</Label>
          <Input id="remove-serial" autoFocus value={serial} autoComplete="off" spellCheck={false} onChange={event => setSerial(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void remove() } }} className="font-mono" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Luk', 'Close')}</Button>
          <Button variant="destructive" onClick={() => void remove()} loading={busy} disabled={!serial.trim()}><Trash size={16} /> {t('Fjern', 'Remove')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
