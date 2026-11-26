import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/warehouse/finlandDates'
import { t } from '@/lib/warehouse/text'
import type { FinlandNotSentRow, FinlandNotSentSheetRow } from '@/types/finland'
import { CourierTag, GroupTitle, PARCEL_HEAD, ParcelTable } from './common'

interface NotSentGroupProps {
  rows: FinlandNotSentRow[]
  /** The parcel whose delete confirmation is open. */
  confirmKey: string | null
  /** Another action runs: every button waits. */
  busy: boolean
  /** The sheet may not be written now (an action runs, or someone else holds the write lock). */
  writeBlocked: boolean
  deleting: boolean
  onAskDelete: (key: string | null) => void
  onDelete: (row: FinlandNotSentRow, sheetRow: number) => void
  onRestore: (row: FinlandNotSentRow) => void
}

const sheetPlace = (r: FinlandNotSentRow) => (r.sheetRows.length
  ? t(`Står i række ${r.sheetRows.map(s => s.row).join(', ')}`, `On row ${r.sheetRows.map(s => s.row).join(', ')}`)
  : t('Står ikke i arket', 'Not in the sheet'))

/** The day's parcels marked "Ikke sendt": never written; a row already in the sheet can be deleted after a red confirmation. */
export function NotSentGroup({ rows, confirmKey, busy, writeBlocked, deleting, onAskDelete, onDelete, onRestore }: NotSentGroupProps) {
  if (!rows.length) return null
  const confirming = rows.find(r => r.key === confirmKey && r.sheetRows.length === 1)
  return (
    <div className="space-y-2">
      <GroupTitle title={t('Ikke sendt, bliver ikke skrevet', 'Not sent, will not be written')} count={rows.length} />
      <ParcelTable head={[...PARCEL_HEAD, t('I arket', 'In the sheet'), '']}>
        {rows.map(r => {
          const one = r.sheetRows.length === 1 && !r.sheetRows[0].shared ? r.sheetRows[0] : null
          return (
            <tr key={r.key} className="text-muted-foreground">
              <td className="px-3 py-2 font-mono tabular-nums line-through">{r.delivery}</td>
              <td className="px-3 py-2">{r.orderType}</td>
              <td className="px-3 py-2">{r.postalCode}</td>
              <td className="px-3 py-2"><CourierTag courier={r.courier} /></td>
              <td className="px-3 py-2 font-mono tabular-nums line-through">{r.tracking}</td>
              <td className="whitespace-nowrap px-3 py-2">
                {sheetPlace(r)}
                {r.markedBy && <span className="block text-xs">{t(`Markeret af ${r.markedBy}`, `Marked by ${r.markedBy}`)}</span>}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap justify-end gap-1.5">
                  {one && (
                    <Button size="sm" variant="destructive" disabled={busy || writeBlocked} onClick={() => onAskDelete(r.key)}>
                      {t(`Slet række ${one.row} i arket`, `Delete row ${one.row} in the sheet`)}
                    </Button>
                  )}
                  {r.sheetRows.length > 0 && !one && <span className="self-center whitespace-nowrap text-xs">{t('Slet rækken i hånden', 'Delete the row by hand')}</span>}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onRestore(r)}>{t('Sæt ind igen', 'Put back')}</Button>
                </div>
              </td>
            </tr>
          )
        })}
      </ParcelTable>
      {confirming && (
        <DeleteConfirm
          parcel={confirming}
          sheetRow={confirming.sheetRows[0]}
          disabled={busy || writeBlocked}
          deleting={deleting}
          onDelete={() => onDelete(confirming, confirming.sheetRows[0].row)}
          onCancel={() => onAskDelete(null)}
        />
      )}
    </div>
  )
}

interface DeleteConfirmProps {
  parcel: FinlandNotSentRow
  sheetRow: FinlandNotSentSheetRow
  disabled: boolean
  deleting: boolean
  onDelete: () => void
  onCancel: () => void
}

/** Shows the whole row, follow-up included, before anything is deleted. */
export function DeleteConfirm({ parcel, sheetRow: s, disabled, deleting, onDelete, onCancel }: DeleteConfirmProps) {
  const f = s.followUp
  const date = (value: string | undefined) => (value ? formatDate(value) : '')
  const followedUp = !!f && (['expected', 'received', 'sla', 'comment', 'terminal'] as const).some(k => f[k])
  const cols: [string, string][] = [
    ['Date picked up', date(s.pickedUp)], ['Delivery', String(parcel.delivery)], ['Order type', String(s.orderType ?? '')], ['Postal code', String(s.postalCode ?? '')],
    ['Courier', s.courier], ['T&T', s.trackingText], ['Expected', date(f?.expected)], ['Received', date(f?.received)],
    ['SLA', f?.sla ?? ''], ['Comment', f?.comment ?? ''], ['Terminal', f?.terminal ?? ''],
  ]
  return (
    <section aria-label={t(`Slet række ${s.row}`, `Delete row ${s.row}`)} className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-semibold">{t(`Række ${s.row} bliver slettet i arket:`, `Row ${s.row} will be deleted in the sheet:`)}</p>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-2">
        {cols.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={value ? 'break-words font-semibold' : 'text-muted-foreground'}>{value || t('tom', 'empty')}</dd>
          </div>
        ))}
      </dl>
      <p>
        {t('Hele rækken forsvinder fra arket.', 'The whole row disappears from the sheet.')}
        {followedUp && t(' Rækken er fulgt op, og det forsvinder også.', ' The row has been followed up, and that disappears too.')}
        {t(' Trykker du senere "Sæt ind igen", kan kolliet skrives ind igen, men ikke opfølgningen.', ' If you press "Put back" later, the parcel can be written in again, but not the follow-up.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={disabled} loading={deleting} onClick={onDelete}>
          {deleting ? t('Sletter ...', 'Deleting ...') : t(`Ja, slet række ${s.row} i arket`, `Yes, delete row ${s.row} in the sheet`)}
        </Button>
        <Button variant="outline" disabled={deleting} onClick={onCancel}>{t('Fortryd', 'Cancel')}</Button>
      </div>
    </section>
  )
}
