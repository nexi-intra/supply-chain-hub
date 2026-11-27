import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/warehouse/finlandDates'
import { t } from '@/lib/warehouse/text'
import type { FinlandFollowUpRow } from '@/types/finland'

export interface FollowUpNotSentProps {
  row: FinlandFollowUpRow
  /** Finland admin: the row in the sheet is deleted too (the main process checks again). */
  isAdmin: boolean
  /** Another action runs. */
  busy: boolean
  /** Someone else holds the write lock: deleting waits. */
  writeBlocked: boolean
  working: 'mark' | 'delete' | 'restore' | null
  /** Marks the parcel, and for an admin deletes its row after. */
  onConfirm: () => void
  onDelete: () => void
  onRestore: () => void
  onCancel: () => void
}

const FIELDS = [['Expected', 'expected'], ['Received', 'received'], ['SLA', 'sla'], ['Comment', 'comment'], ['Terminal', 'terminal']] as const

/**
 * "Ikke sendt" in Opfølgning: before marking, a red confirmation with what disappears; once marked (the row is still in
 * the sheet), the admin's "Slet række" and "Sæt ind igen", as under Skriv ind. `data-not-sent` keeps Enter on its
 * buttons from moving on to the next parcel.
 */
export function FollowUpNotSent({ row: r, isAdmin, busy, writeBlocked, working, onConfirm, onDelete, onRestore, onCancel }: FollowUpNotSentProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const filled = FIELDS.filter(([, key]) => r.sheet[key])
  const lost = filled.length > 0 && (
    <p className="text-xs">
      {t('I arket står: ', 'The sheet has: ')}
      {filled.map(([label, key]) => `${label} ${key === 'expected' || key === 'received' ? formatDate(r.sheet[key]) : r.sheet[key]}`).join(', ')}
      {t('. Det forsvinder sammen med rækken.', '. It disappears with the row.')}
    </p>
  )

  if (!r.notSent) {
    return (
      <section data-not-sent aria-label={t('Ikke sendt', 'Not sent')} className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-semibold">{t(`Er ${r.delivery} ikke sendt?`, `Was ${r.delivery} not sent?`)}</p>
        <p>
          {t('Kolliet bliver markeret som ikke sendt, så det aldrig bliver skrevet ind igen, når der hentes fra SAP.', 'The parcel is marked as not sent, so it is never written in again when SAP is fetched.')}
          {isAdmin
            ? t(` Række ${r.row} bliver også slettet i arket.`, ` Row ${r.row} is deleted in the sheet too.`)
            : t(` Række ${r.row} bliver stående i arket, til en admin sletter den.`, ` Row ${r.row} stays in the sheet until an admin deletes it.`)}
        </p>
        {isAdmin && lost}
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" disabled={busy || (isAdmin && writeBlocked)} loading={working === 'mark' || working === 'delete'} onClick={onConfirm}>
            {isAdmin ? t(`Ja, markér og slet række ${r.row}`, `Yes, mark and delete row ${r.row}`) : t('Ja, markér som ikke sendt', 'Yes, mark as not sent')}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onCancel}>{t('Fortryd', 'Cancel')}</Button>
        </div>
      </section>
    )
  }

  return (
    <section data-not-sent aria-label={t('Ikke sendt', 'Not sent')} className="space-y-3 rounded-lg border bg-muted/50 p-4 text-sm">
      <p className="font-semibold">{t('Markeret som ikke sendt', 'Marked as not sent')}</p>
      <p>
        {t(`Kolliet bliver ikke skrevet ind igen, men står stadig i række ${r.row} i arket.`, `The parcel will not be written in again, but is still on row ${r.row} in the sheet.`)}
        {!isAdmin && t(' En admin kan slette rækken.', ' An admin can delete the row.')}
      </p>
      {confirmDelete && lost}
      <div className="flex flex-wrap gap-2">
        {isAdmin && !confirmDelete && (
          <Button variant="destructive" disabled={busy || writeBlocked} onClick={() => setConfirmDelete(true)}>{t(`Slet række ${r.row} i arket`, `Delete row ${r.row} in the sheet`)}</Button>
        )}
        {isAdmin && confirmDelete && (
          <>
            <Button variant="destructive" disabled={busy || writeBlocked} loading={working === 'delete'} onClick={onDelete}>{t(`Ja, slet række ${r.row} i arket`, `Yes, delete row ${r.row} in the sheet`)}</Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>{t('Fortryd', 'Cancel')}</Button>
          </>
        )}
        {!confirmDelete && <Button variant="outline" disabled={busy} loading={working === 'restore'} onClick={onRestore}>{t('Sæt ind igen', 'Put back')}</Button>}
      </div>
    </section>
  )
}
