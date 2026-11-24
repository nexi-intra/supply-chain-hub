import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatNumber } from '@/lib/warehouse/format'
import type { PanelProps } from './CountView'
import { t } from '@/lib/warehouse/text'

export function MovesPanel({ state }: PanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Skal flyttes', 'Must be moved')} ({formatNumber(state.movesTotal)})</CardTitle>
        <CardDescription>{t('Varer, der står på en forkert storage location, eller som SAP har et andet sted. Flytning og bogføring sker manuelt i SAP – Optælling ændrer intet.', 'Items on the wrong storage location, or that SAP has somewhere else. Moving and posting is done manually in SAP – Stock count changes nothing.')}</CardDescription>
      </CardHeader>
      <CardContent>
        {state.moves.length === 0 ? <p className="text-sm text-muted-foreground">{t('Intet at flytte endnu.', 'Nothing to move yet.')}</p> : (
          <div className="max-h-[600px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                  <th className="px-3 py-2">{t('Serienummer', 'Serial number')}</th>
                  <th className="px-3 py-2 text-right">{t('Antal', 'Quantity')}</th>
                  <th className="px-3 py-2">SAP sloc</th>
                  <th className="px-3 py-2">{t('Fundet', 'Found')}</th>
                  <th className="px-3 py-2">{t('Flyt til', 'Move to')}</th>
                  <th className="px-3 py-2">{t('Årsag', 'Reason')}</th>
                  <th className="px-3 py-2">{t('Af', 'By')}</th>
                </tr>
              </thead>
              <tbody>
                {state.moves.map((item, index) => (
                  <tr key={`${item.serial || item.material}-${index}`} className="border-t">
                    <td className="px-3 py-1.5"><div className="font-mono">{item.material || '–'}</div><div className="text-xs text-muted-foreground">{item.description}</div></td>
                    <td className="px-3 py-1.5 font-mono">{item.serial || '–'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(item.quantity)}</td>
                    <td className="px-3 py-1.5 font-mono">{item.sloc || '–'}</td>
                    <td className="px-3 py-1.5">{item.place || '–'}</td>
                    <td className="px-3 py-1.5 font-mono font-semibold">{item.suggestions.join(' / ') || (item.reason === 'other-sloc' ? t('Tjek i SAP', 'Check in SAP') : '–')}</td>
                    <td className="px-3 py-1.5 text-xs">{item.reason === 'other-sloc' ? t('SAP har den på en anden sloc', 'SAP has it on another sloc') : t('Hører ikke til her', 'Does not belong here')}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{item.byName} · {formatDateTime(item.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {state.movesTotal > state.moves.length && <p className="mt-2 text-xs text-muted-foreground">{t(`Viser ${formatNumber(state.moves.length)} af ${formatNumber(state.movesTotal)} – hele listen er i Excel-rapporten.`, `Showing ${formatNumber(state.moves.length)} of ${formatNumber(state.movesTotal)} – the full list is in the Excel report.`)}</p>}
      </CardContent>
    </Card>
  )
}
