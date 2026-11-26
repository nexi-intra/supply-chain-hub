import { Check } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dayTitle, shortDay } from '@/lib/warehouse/finlandDates'
import { backendText, kolli } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import type { FinlandDay, FinlandNotSentRow, FinlandParcelRow, FinlandReviewRow, FinlandSnapshot } from '@/types/finland'
import { CourierTag, GroupTitle, PARCEL_HEAD, ParcelTable, writtenAt, type Working } from './common'
import { NotSentGroup } from './NotSentGroup'

export interface WriteDayProps {
  day: FinlandDay
  /** Who wrote the day last (dagslog), if anyone. */
  lastWrite: FinlandSnapshot['dayLog'][string] | undefined
  working: Working
  /** Someone else holds the write lock: the buttons that write the sheet wait. */
  writeBlocked: boolean
  /** Finland admin: only then is "Slet række N i arket" shown. */
  isAdmin: boolean
  confirmDelete: string | null
  onWrite: () => void
  onFix: (row: FinlandReviewRow) => void
  onMarkNotSent: (row: FinlandParcelRow) => void
  onRestore: (row: FinlandNotSentRow) => void
  onAskDelete: (key: string | null) => void
  onDelete: (row: FinlandNotSentRow, sheetRow: number) => void
}

const REASON_BY_ACTION: Record<string, [string, string]> = {
  add: ['Leveringen har et kolli mere i SAP', 'The delivery has one more parcel in SAP'],
  'replace-duplicate': ['Samme T&T står på to rækker', 'The same T&T is on two rows'],
  'replace-unknown': ['Arket har et T&T, SAP ikke kender', 'The sheet has a T&T that SAP does not know'],
}

const reasonText = (r: FinlandReviewRow) => (REASON_BY_ACTION[r.action.kind] ? t(...REASON_BY_ACTION[r.action.kind]) : backendText(r.reason))

/** One day of Skriv ind: what is missing, what needs a person, what was not sent and what is in the sheet. */
export function WriteDay({ day, lastWrite, working, writeBlocked, isAdmin, confirmDelete, onWrite, onFix, onMarkNotSent, onRestore, onAskDelete, onDelete }: WriteDayProps) {
  const busy = working !== null
  const bits = [
    t(`${kolli(day.total)} i SAP.`, `${kolli(day.total)} in SAP.`),
    t(`${day.inSheet.length} står i arket, ${day.missing.length} mangler.`, `${day.inSheet.length} in the sheet, ${day.missing.length} missing.`),
  ]
  if (day.review.length) bits.push(t(`${day.review.length} skal tjekkes.`, `${day.review.length} to be checked.`))
  if (day.notSent.length) bits.push(t(`${day.notSent.length} ikke sendt.`, `${day.notSent.length} not sent.`))

  const notSentButton = (r: FinlandParcelRow, hidden = false) => r.tracking ? (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      title={t('Kolliet blev aldrig sendt. Det bliver ikke skrevet i arket.', 'The parcel was never sent. It will not be written in the sheet.')}
      className={cn(hidden && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100')}
      onClick={() => onMarkNotSent(r)}
    >
      {t('Ikke sendt', 'Not sent')}
    </Button>
  ) : null

  const actionCell = (r: FinlandReviewRow) => {
    const a = r.action
    if (a.kind === 'add') return <Button size="sm" variant="outline" disabled={busy || writeBlocked} onClick={() => onFix(r)}>{t('Tilføj kolliet i arket', 'Add the parcel to the sheet')}</Button>
    if (a.kind === 'manual') {
      return (
        <span className="self-center whitespace-nowrap text-xs text-muted-foreground">
          {a.rows.length ? t(`Ret i hånden, række ${a.rows.join(', ')}`, `Correct by hand, row ${a.rows.join(', ')}`) : t('Ret i hånden', 'Correct by hand')}
        </span>
      )
    }
    const duplicate = a.kind === 'replace-duplicate'
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={busy || writeBlocked}
        onClick={() => onFix(r)}
        title={duplicate
          ? t(`Række ${a.row} har ${a.oldTracking}, som også står på en anden række`, `Row ${a.row} has ${a.oldTracking}, which is also on another row`)
          : t(`Række ${a.row} har ${a.oldTracking}, som SAP ikke kender`, `Row ${a.row} has ${a.oldTracking}, which SAP does not know`)}
      >
        {duplicate ? t(`Ret T&T i række ${a.row}`, `Correct T&T on row ${a.row}`) : t('Ret T&T i arket', 'Correct T&T in the sheet')}
      </Button>
    )
  }

  const cells = (r: FinlandParcelRow) => (
    <>
      <td className="px-3 py-2 font-mono tabular-nums">{r.delivery}</td>
      <td className="px-3 py-2">{r.orderType}</td>
      <td className="px-3 py-2">{r.postalCode}</td>
      <td className="px-3 py-2"><CourierTag courier={r.courier} /></td>
      <td className="px-3 py-2 font-mono tabular-nums">{r.tracking || t('intet T&T', 'no T&T')}</td>
    </>
  )

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{dayTitle(day.date)}</h2>
        <p className="text-sm text-muted-foreground">{bits.join(' ')}</p>
        {lastWrite && (
          <p className="text-xs text-muted-foreground">
            {t(`Sidst skrevet af ${lastWrite.byName} ${writtenAt(lastWrite.at)}`, `Last written by ${lastWrite.byName} ${writtenAt(lastWrite.at)}`)}
          </p>
        )}
      </div>

      {day.missing.length > 0 ? (
        <Button size="lg" disabled={busy || writeBlocked} loading={working === 'write'} onClick={onWrite}>
          {working === 'write'
            ? t(`Skriver ${kolli(day.missing.length)} ...`, `Writing ${kolli(day.missing.length)} ...`)
            : t(`Skriv ${kolli(day.missing.length)} i arket`, `Write ${kolli(day.missing.length)} in the sheet`)}
        </Button>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-ok/35 bg-ok-surface px-4 py-3 text-sm">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ok text-white" aria-hidden="true"><Check weight="bold" /></span>
          <div>
            <p className="font-semibold">{t(`${shortDay(day.date)} står allerede i arket.`, `${shortDay(day.date)} is already in the sheet.`)}</p>
            <p>
              {day.review.length
                ? t(`${kolli(day.inSheet.length)} er skrevet. ${kolli(day.review.length)} skal tjekkes nedenfor.`, `${kolli(day.inSheet.length)} written. ${kolli(day.review.length)} to be checked below.`)
                : t(`Alle ${kolli(day.inSheet.length)} er skrevet. Der er intet at gøre.`, `All ${kolli(day.inSheet.length)} are written. There is nothing to do.`)}
            </p>
          </div>
        </div>
      )}

      {day.missing.length > 0 && (
        <div className="space-y-2">
          <GroupTitle title={t('Mangler i arket', 'Missing in the sheet')} count={day.missing.length} />
          <ParcelTable head={[...PARCEL_HEAD, '']}>
            {day.missing.map((r, index) => (
              <tr key={`${r.delivery}|${r.tracking}|${index}`} className="bg-primary/5">
                {cells(r)}
                <td className="px-3 py-2 text-right">{notSentButton(r)}</td>
              </tr>
            ))}
          </ParcelTable>
        </div>
      )}

      {day.review.length > 0 && (
        <div className="space-y-2">
          <GroupTitle title={t('Skal tjekkes, bliver ikke skrevet', 'To be checked, will not be written')} count={day.review.length} />
          <ParcelTable head={[...PARCEL_HEAD, t('Hvorfor', 'Why'), '']}>
            {day.review.map((r, index) => (
              <tr key={`${r.delivery}|${r.tracking}|${index}`} className="border-l-[3px] border-l-attention">
                {cells(r)}
                <td className="px-3 py-2">{reasonText(r)}</td>
                <td className="px-3 py-2"><div className="flex flex-wrap justify-end gap-1.5">{actionCell(r)}{notSentButton(r)}</div></td>
              </tr>
            ))}
          </ParcelTable>
        </div>
      )}

      <NotSentGroup
        rows={day.notSent}
        confirmKey={confirmDelete}
        busy={busy}
        writeBlocked={writeBlocked}
        isAdmin={isAdmin}
        deleting={working === 'delete'}
        onAskDelete={onAskDelete}
        onDelete={onDelete}
        onRestore={onRestore}
      />

      {day.inSheet.length > 0 && (
        <div className="space-y-2">
          <GroupTitle title={t('Står i arket', 'In the sheet')} count={day.inSheet.length} />
          <ParcelTable head={[...PARCEL_HEAD, '']}>
            {day.inSheet.map((r, index) => (
              <tr key={`${r.delivery}|${r.tracking}|${index}`} className="group text-muted-foreground">
                {cells(r)}
                <td className="px-3 py-2 text-right">{notSentButton(r, true)}</td>
              </tr>
            ))}
          </ParcelTable>
        </div>
      )}
    </div>
  )
}
