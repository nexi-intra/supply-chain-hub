import { useMemo, useState } from 'react'
import { FileXls } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/warehouse/ui'
import { errorMessage } from '@/lib/warehouse/errors'
import { currentWarehouseLanguage, t } from '@/lib/warehouse/text'
import type { CountState } from '@/types/warehouse'
import type { PanelProps } from './CountView'

/** The count's materials with serial numbers, once each, sorted by material. */
export function exportMaterials(state: CountState): { material: string; description: string }[] {
  const byMaterial = new Map<string, string>()
  for (const row of state.rows) if (row.serialManaged && !byMaterial.has(row.material)) byMaterial.set(row.material, row.description)
  return [...byMaterial].map(([material, description]) => ({ material, description })).sort((a, b) => a.material.localeCompare(b.material))
}

/** One material's serial numbers to a new Excel file (Found and Missing), saved in the team's reports folder and opened. */
export function ExportPanel({ id, state }: PanelProps) {
  const materials = useMemo(() => exportMaterials(state), [state])
  const [material, setMaterial] = useState('')
  const [busy, setBusy] = useState(false)

  const exportSerials = async () => {
    setBusy(true)
    try {
      const result = await window.electronWarehouse!.counts.serialExport(id, material, currentWarehouseLanguage())
      await window.electronWarehouse!.counts.openReport(result.file)
      toast.success(t('Filen er gemt', 'The file is saved'), { description: result.name })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('Eksportér serienumre', 'Export serial numbers')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'Vælg et materiale med serienumre. Excel-filen har fanerne Fundet og Mangler med serienummeret i kolonne A, så det kan kopieres direkte ind i SAP.',
            'Choose a material with serial numbers. The Excel file has the sheets Found and Missing with the serial number in column A, so it can be copied straight into SAP.',
          )}
        </p>
        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('Optællingen har ingen materialer med serienumre.', 'The count has no materials with serial numbers.')}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect value={material} onChange={event => setMaterial(event.target.value)} className="min-w-0 flex-1" aria-label={t('Vælg materiale', 'Choose material')}>
              <option value="">{t('Vælg et materiale …', 'Choose a material …')}</option>
              {materials.map(option => (
                <option key={option.material} value={option.material}>{option.description ? `${option.material} · ${option.description}` : option.material}</option>
              ))}
            </NativeSelect>
            <Button onClick={() => exportSerials()} disabled={!material} loading={busy}><FileXls size={18} /> {t('Eksportér til Excel', 'Export to Excel')}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
