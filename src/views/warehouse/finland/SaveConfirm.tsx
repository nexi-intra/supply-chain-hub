import { Button } from '@/components/ui/button'
import { dayTitle } from '@/lib/warehouse/finlandDates'
import { kolli } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import type { FinlandFollowUpRow } from '@/types/finland'
import { changesText } from './followUpLogic'

function ChangeList({ rows }: { rows: FinlandFollowUpRow[] }) {
  return (
    <ul className="mt-2 max-h-56 list-disc space-y-0.5 overflow-auto pl-5">
      {rows.map(r => <li key={`${r.key}|${r.row}`}><span className="font-mono text-xs">{r.delivery}</span> {changesText(r)}</li>)}
    </ul>
  )
}

export interface SyncBarProps {
  day: string
  /** The person's own changes on the day. */
  pending: FinlandFollowUpRow[]
  /** The person's own changes on every day. */
  total: number
  /** "Gem N i arket" was pressed: the bar shows what will be written. */
  confirm: boolean
  saving: boolean
  /** Something else is running. */
  busy: boolean
  /** Someone else holds the write lock. */
  writeBlocked: boolean
  onAsk: () => void
  onCancel: () => void
  onSave: () => void
  onAll: () => void
}

/** Under the day's list: the changes waiting for the sheet, "Gem N i arket" with its confirmation, and "Gem alle N". */
export function SyncBar({ day, pending, total, confirm, saving, busy, writeBlocked, onAsk, onCancel, onSave, onAll }: SyncBarProps) {
  if (!pending.length && !total) return null
  if (confirm && pending.length) {
    return (
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-attention/40 bg-attention-surface px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <b>{t(`Dette bliver skrevet i arket for ${dayTitle(day).toLowerCase()}:`, `This will be written in the sheet for ${dayTitle(day)}:`)}</b>
          <ChangeList rows={pending} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || writeBlocked} loading={saving} onClick={onSave}>{saving ? t('Gemmer ...', 'Saving ...') : t('Ja, gem i arket', 'Yes, save in the sheet')}</Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={onCancel}>{t('Fortryd', 'Cancel')}</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        {pending.length
          ? t(`${kolli(pending.length)} på denne dag er ændret i appen og venter på at komme i arket.`, `${kolli(pending.length)} on this day were changed in the app and wait to go into the sheet.`)
          : t('Ingen ændringer på denne dag venter.', 'No changes on this day are waiting.')}
        {total > pending.length && t(` ${total} i alt på alle dage.`, ` ${total} in all on every day.`)}
      </span>
      {pending.length > 0 && <Button size="sm" disabled={busy || writeBlocked} onClick={onAsk}>{t(`Gem ${pending.length} i arket`, `Save ${pending.length} in the sheet`)}</Button>}
      {total > pending.length && <Button size="sm" variant="outline" disabled={busy || writeBlocked} onClick={onAll}>{t(`Gem alle ${total}`, `Save all ${total}`)}</Button>}
    </div>
  )
}

export interface SaveAllConfirmProps {
  /** Every row with one of the person's changes, on every day. */
  rows: FinlandFollowUpRow[]
  /** The person's changes in all; more than `rows` when some parcels are no longer in the sheet. */
  total: number
  saving: boolean
  busy: boolean
  writeBlocked: boolean
  onSave: () => void
  onClose: () => void
}

/** Every change in the app that is not in the sheet yet, by day, with one "yes" for all of it. */
export function SaveAllConfirm({ rows, total, saving, busy, writeBlocked, onSave, onClose }: SaveAllConfirmProps) {
  const sorted = [...rows].sort((a, b) => a.pickedUp.localeCompare(b.pickedUp) || a.row - b.row)
  const days = [...new Set(sorted.map(r => r.pickedUp))]
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-attention/40 bg-attention-surface px-4 py-3 text-sm" role="region" aria-label={t('Gem alle i arket', 'Save all in the sheet')}>
      <div className="min-w-0 flex-1 space-y-2">
        <b>{total ? t(`Dette bliver skrevet i arket (${kolli(total)}):`, `This will be written in the sheet (${kolli(total)}):`) : t('Der er ingen ændringer, der venter.', 'There are no changes waiting.')}</b>
        {days.map(day => (
          <div key={day}>
            <p className="mt-2 font-semibold">{dayTitle(day)}</p>
            <ChangeList rows={sorted.filter(r => r.pickedUp === day)} />
          </div>
        ))}
        {total > rows.length && (
          <p className="text-destructive">{t(`${kolli(total - rows.length)} findes ikke længere i arket og bliver ikke skrevet.`, `${kolli(total - rows.length)} are no longer in the sheet and will not be written.`)}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {total > 0 && (
          <Button size="sm" disabled={busy || writeBlocked} loading={saving} onClick={onSave}>{saving ? t('Gemmer ...', 'Saving ...') : t('Ja, gem alle i arket', 'Yes, save all in the sheet')}</Button>
        )}
        <Button size="sm" variant="outline" disabled={saving} onClick={onClose}>{total ? t('Fortryd', 'Cancel') : t('Luk', 'Close')}</Button>
      </div>
    </div>
  )
}
