import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage } from '@/lib/warehouse/errors'
import { fetchSteps, formatNumber } from '@/lib/warehouse/format'
import type { WarehouseBridge, FetchStep } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'

type RefetchPreview = Awaited<ReturnType<WarehouseBridge['counts']['refetchPreview']>>

export function RefetchDialog({ id, onClose, onApplied }: { id: string; onClose: () => void; onApplied: () => Promise<void> }) {
  const [step, setStep] = useState<FetchStep | null>('check')
  const [preview, setPreview] = useState<RefetchPreview | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    const unsubscribe = window.electronWarehouse!.sap.onFetchProgress(progress => setStep(progress.step))
    window.electronWarehouse!.counts.refetchPreview(id)
      .then(setPreview)
      .catch(error => setFailed(errorMessage(error, t('Hentningen fra SAP fejlede.', 'Fetching from SAP failed.'))))
      .finally(() => setStep(null))
    return unsubscribe
  }, [id])

  const apply = async () => {
    if (!preview) return
    setApplying(true)
    try {
      await window.electronWarehouse!.counts.refetchApply({ id, token: preview.token })
      toast.success(t('De nye SAP-data er taget i brug', 'The new SAP data is now in use'))
      await onApplied()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setApplying(false)
    }
  }

  const label = fetchSteps().find(item => item.step === step)?.label
  return (
    <Dialog open onOpenChange={value => { if (!value && !applying) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Hent SAP igen', 'Fetch SAP again')}</DialogTitle>
          <DialogDescription>{t('Se forskellene, før de nye tal tages i brug. Scanninger og tællinger bevares. Godkendte materialer beholder de tal, de blev godkendt med.', 'See the differences before the new figures are used. Scans and counts are kept. Approved materials keep the figures they were approved with.')}</DialogDescription>
        </DialogHeader>
        {!preview && !failed && <p className="text-sm text-muted-foreground">{label || t('Henter', 'Fetching')} …</p>}
        {failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}
        {preview && (
          <div className="space-y-3 text-sm">
            <p>{t('Serienumre:', 'Serial numbers:')} <strong>{formatNumber(preview.diff.serials.added)}</strong> {t('nye og', 'new and')} <strong>{formatNumber(preview.diff.serials.removed)}</strong> {t('forsvundet siden sidst.', 'gone since last time.')}</p>
            {preview.diff.changes.length === 0 ? <p>{t('Ingen ændringer i lagerantal.', 'No changes in stock quantity.')}</p> : (
              <div className="max-h-72 overflow-auto rounded-lg border">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{t('Materiale', 'Material')}</th><th className="px-3 py-2">Sloc</th><th className="px-3 py-2 text-right">{t('Unblocked før → nu', 'Unblocked before → now')}</th><th className="px-3 py-2 text-right">{t('Blocked før → nu', 'Blocked before → now')}</th></tr></thead>
                  <tbody>
                    {preview.diff.changes.map(change => (
                      <tr key={`${change.material}|${change.sloc}`} className="border-t">
                        <td className="px-3 py-1.5 font-mono">{change.material}{change.frozen && <span className="ml-2 font-sans text-xs text-emerald-700 dark:text-emerald-300">{t('Godkendt – beholder tallene', 'Approved – keeps its figures')}</span>}</td>
                        <td className="px-3 py-1.5 font-mono">{change.sloc}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(change.before.unrestricted)} → {formatNumber(change.after.unrestricted)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(change.before.blocked)} → {formatNumber(change.after.blocked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={applying}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => apply()} disabled={!preview} loading={applying}>{t('Tag de nye tal i brug', 'Use the new figures')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
