import { CheckCircle, FilePlus, ListChecks, Printer, Question, Trash, Warning } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatNumber } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { PiDoc, PiDocList, PiDocResolution, PiDocStatus } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'

const statusMap = (): Record<PiDocStatus, { label: string; className: string }> => ({
  creating: { label: t('Oprettes …', 'Being created …'), className: 'border-sky-500 text-sky-700 dark:text-sky-300' },
  created: { label: t('Oprettet', 'Created'), className: 'border-sky-500 text-sky-700 dark:text-sky-300' },
  printed: { label: t('Printet', 'Printed'), className: 'border-violet-500 text-violet-700 dark:text-violet-300' },
  counted: { label: t('Antal lagt på', 'Quantity entered'), className: 'border-amber-500 text-amber-700 dark:text-amber-300' },
  posted: { label: t('Bogført', 'Posted'), className: 'border-emerald-500 text-emerald-700 dark:text-emerald-300' },
  deleted: { label: t('Slettet', 'Deleted'), className: 'text-muted-foreground' },
  unknown: { label: t('Ukendt i SAP', 'Unknown in SAP'), className: 'border-red-500 text-red-700 dark:text-red-300' },
})

const stepText = (): Record<string, string> => ({ create: t('oprettelsen (MI31)', 'the creation (MI31)'), count: t('antallet (MI04/ZMS_COUNT_SERIAL)', 'the quantity (MI04/ZMS_COUNT_SERIAL)'), post: t('bogføringen (MI20)', 'the posting (MI20)') })
const outcomeText = (resolution: PiDocResolution) => resolution.outcome === 'saved'
  ? t(`fandtes i SAP${resolution.docNo ? ` (${resolution.docNo})` : ''}`, `was in SAP${resolution.docNo ? ` (${resolution.docNo})` : ''}`)
  : resolution.outcome === 'superseded'
    ? t(`blev aldrig afklaret, fordi dokumentet blev ${resolution.status ? statusMap()[resolution.status]?.label.toLowerCase() ?? resolution.status : 'ændret'}`, `was never resolved, because the document became ${resolution.status ? statusMap()[resolution.status]?.label.toLowerCase() ?? resolution.status : 'changed'}`)
    : t('fandtes ikke i SAP', 'was not in SAP')

const waitingFor = (): Record<string, string> => ({ print: t('Venter på print (manager)', 'Waiting for print (manager)'), count: t('Venter på en admin', 'Waiting for an admin'), post: t('Venter på bogføring (manager)', 'Waiting for posting (manager)') })

interface PiDocsSectionProps {
  list: PiDocList
  selected: { materials: string[]; sloc: string; stockType: string } | null
  busy: string | null
  /** When the SAP figures of the day were fetched; "Læg antal på" needs them from today. */
  figuresAt: number | null
  onCreate: () => void
  onPrint: (doc: PiDoc) => void
  onCount: (doc: PiDoc) => void
  onPost: (docs: PiDoc[]) => void
  onDelete: (doc: PiDoc) => void
  onResolve: (doc: PiDoc) => void
  qtyOf: (doc: PiDoc, material: string) => number | null
}

const kindText = (): Record<string, string> => ({ new: t('Nye terminaler', 'New terminals'), used: t('Brugte terminaler', 'Used terminals'), accessory: t('Tilbehør', 'Accessories'), terminal: t('Terminaler', 'Terminals') })

const busyTexts = (): Record<string, string> => ({
  create: t('Tjek felterne i SAP-vinduet (MI31) og tryk F8. Luk vinduet for at fortryde.', 'Check the fields in the SAP window (MI31) and press F8. Close the window to cancel.'),
  print: t('Tjek printvinduet i SAP (MI21) og tryk Print. Annullér for at fortryde.', 'Check the print window in SAP (MI21) and press Print. Cancel to undo.'),
  count: t('SAP-vinduet åbner: ZMS_COUNT_SERIAL (tryk Update Count, når Check er uden fejl) og/eller MI04 (tryk Gem). Luk vinduet for at fortryde.', 'The SAP window opens: ZMS_COUNT_SERIAL (press Update Count when Check has no errors) and/or MI04 (press Save). Close the window to cancel.'),
  post: t('Tjek differencerne i MI20 (dokumenterne er krydset af), tryk Post Difference og Gem for hvert dokument. Luk vinduet for at fortryde.', 'Check the differences in MI20 (the documents are ticked), press Post Difference and Save for each document. Close the window to cancel.'),
  delete: t('MI02 er åbnet med dokumentet udfyldt: tryk på skraldespanden (Delete) og bekræft. Luk vinduet for at fortryde.', 'MI02 is open with the document filled in: press the bin (Delete) and confirm. Close the window to cancel.'),
})

const amount = (doc: PiDoc) => (doc.differences || []).reduce((sum, item) => sum + item.amount * Math.sign(item.diff || 0), 0)

/** The SAP documents of the count and the step each one waits for. */
export function PiDocsSection({ list, selected, busy, figuresAt, onCreate, onPrint, onCount, onPost, onDelete, onResolve, qtyOf }: PiDocsSectionProps) {
  const figuresToday = figuresAt !== null && new Date(figuresAt).toDateString() === new Date().toDateString()
  const busyDoc = list.docs.find(doc => doc.id === busy || `delete:${doc.id}` === busy)
  const BUSY_TEXT = busyTexts()
  const busyText = busy === 'create' ? BUSY_TEXT.create : busy === 'post' ? BUSY_TEXT.post : busy?.startsWith('delete:') ? BUSY_TEXT.delete : busyDoc?.next ? BUSY_TEXT[busyDoc.next] : null
  const postable = list.docs.filter(doc => doc.next === 'post' && doc.canNext)
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={t('SAP-dokumenter', 'SAP documents')}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">{t('SAP-dokumenter', 'SAP documents')}</h3>
        {list.system !== 'PS4' && <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">Test-SAP {list.system}</Badge>}
        {postable.length > 1 && (
          <SapActionButton size="sm" variant="outline" className="ml-auto" disabled={busy !== null} loading={busy === 'post'} onAction={() => onPost(postable)}>
            <CheckCircle size={16} /> {t('Bogfør alle', 'Post all')} ({postable.length})
          </SapActionButton>
        )}
        {list.canCreate && (
          <SapActionButton size="sm" className={postable.length > 1 ? '' : 'ml-auto'} disabled={!selected || busy !== null} loading={busy === 'create'} onAction={onCreate}>
            <FilePlus size={16} /> {selected ? t(`Opret SAP-dokument (${selected.materials.length}${selected.materials.length > 1 ? ' af maks. 20' : ''})`, `Create SAP document (${selected.materials.length}${selected.materials.length > 1 ? ' of max. 20' : ''})`) : t('Vælg materialer i tabellen', 'Choose materials in the table')}
          </SapActionButton>
        )}
      </div>
      {!list.writeEnabled && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t(`Optællingsdokumenter i ${list.system} er ikke slået til i Optælling endnu. Lav dem i SAP som i dag.`, `Count documents in ${list.system} are not switched on in Stock count yet. Make them in SAP as today.`)}
        </p>
      )}
      {busyText && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-100">
          <Warning size={16} /> {busyText}
        </p>
      )}
      {list.docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{list.canCreate ? t('Ingen SAP-dokumenter endnu. Sæt flueben ved godkendte materialer og opret et dokument.', 'No SAP documents yet. Tick approved materials and create a document.') : t('Ingen SAP-dokumenter endnu.', 'No SAP documents yet.')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {list.docs.map(doc => (
            <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <span className="font-mono font-semibold">{doc.docNo || (doc.status === 'unknown' ? doc.reference : '–')}</span>
              <span className="font-mono">{doc.sloc}</span>
              {doc.stockType === 'blocked' && <Badge className="bg-orange-500 text-white">Blocked</Badge>}
              <Badge variant="outline" className={statusMap()[doc.status].className}>{statusMap()[doc.status].label}</Badge>
              <span className="min-w-0 flex-1 text-muted-foreground">
                {kindText()[doc.kind] || ''} · {doc.lines.length === 1 ? t('1 materiale', '1 material') : t(`${doc.lines.length} materialer`, `${doc.lines.length} materials`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`Oprettet af ${doc.createdBy.name} ${formatDateTime(doc.createdBy.at)}`, `Created by ${doc.createdBy.name} ${formatDateTime(doc.createdBy.at)}`)}
                {doc.printedBy && t(` · printet af ${doc.printedBy.name}`, ` · printed by ${doc.printedBy.name}`)}
                {doc.countedBy && t(` · antal lagt på af ${doc.countedBy.name}`, ` · quantity entered by ${doc.countedBy.name}`)}
                {doc.postedBy && t(` · bogført af ${doc.postedBy.name}${doc.materialDoc ? ` (mat.dok. ${doc.materialDoc})` : ''} · difference ${formatNumber(amount(doc))} DKK`, ` · posted by ${doc.postedBy.name}${doc.materialDoc ? ` (mat. doc. ${doc.materialDoc})` : ''} · difference ${formatNumber(amount(doc))} DKK`)}
              </span>
              {doc.next === 'print' && doc.canNext
                ? <SapActionButton size="sm" variant="outline" disabled={busy !== null} loading={busy === doc.id} onAction={() => onPrint(doc)}><Printer size={16} /> Print</SapActionButton>
                : doc.next === 'count' && doc.canNext
                  ? (
                    <span className="flex items-center gap-2">
                      <span className={cn('text-xs', figuresToday ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300')}>
                        {figuresAt === null ? t('Dagens SAP-tal er ikke hentet', "Today's SAP figures are not fetched") : t(`SAP-tal fra ${formatDateTime(figuresAt)}`, `SAP figures from ${formatDateTime(figuresAt)}`)}
                      </span>
                      <SapActionButton size="sm" variant="outline" disabled={busy !== null} loading={busy === doc.id} onAction={() => onCount(doc)}><ListChecks size={16} /> {t('Læg antal på', 'Enter quantity')}</SapActionButton>
                    </span>
                  )
                  : doc.next === 'post' && doc.canNext
                    ? <SapActionButton size="sm" variant="outline" disabled={busy !== null} onAction={() => onPost([doc])}><CheckCircle size={16} /> {t('Bogfør', 'Post')}</SapActionButton>
                    : doc.next && <span className="text-xs text-muted-foreground">{waitingFor()[doc.next]}</span>}
              {doc.canDelete && <SapActionButton size="sm" variant="ghost" className="text-destructive" disabled={busy !== null} loading={busy === `delete:${doc.id}`} onAction={() => onDelete(doc)}><Trash size={16} /> {t('Slet i SAP', 'Delete in SAP')}</SapActionButton>}
              {doc.status === 'unknown' && (
                <span className="flex basis-full flex-wrap items-center gap-2">
                  <span role="alert" className="flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300">
                    <Warning size={14} /> {errorMessage('PIDOC_UNKNOWN')}
                    {doc.sapUnknown && t(` Gælder ${stepText()[doc.sapUnknown.step]}, ${doc.sapUnknown.by.name} ${formatDateTime(doc.sapUnknown.by.at)}.`, ` Concerns ${stepText()[doc.sapUnknown.step]}, ${doc.sapUnknown.by.name} ${formatDateTime(doc.sapUnknown.by.at)}.`)}
                    {doc.sapUnknown?.materials?.length ? t(` Materialer: ${doc.sapUnknown.materials.map(entry => entry.material).join(', ')}.`, ` Materials: ${doc.sapUnknown.materials.map(entry => entry.material).join(', ')}.`) : null}
                    {!doc.docNo && t(` Søg i MI22 på referencen ${doc.reference}.`, ` Search MI22 for the reference ${doc.reference}.`)}
                  </span>
                  {doc.canResolve
                    ? <Button size="sm" variant="outline" disabled={busy !== null} loading={busy === `resolve:${doc.id}`} onClick={() => onResolve(doc)}><Question size={16} /> {t('Afklar', 'Resolve')}</Button>
                    : <span className="text-xs text-muted-foreground">{t('Venter på en manager', 'Waiting for a manager')}</span>}
                </span>
              )}
              {doc.sapResolutions?.map((item, index) => {
                const who = item.resolvedBy?.name ? t(` af ${item.resolvedBy.name}`, ` by ${item.resolvedBy.name}`) : ''
                const when = item.resolvedBy?.at ? ` ${formatDateTime(item.resolvedBy.at)}` : ''
                return (
                  <span key={`${index}-${item.step}`} className="basis-full text-xs text-muted-foreground">
                    {t(`Afklaret${who}${when}: ${stepText()[item.step]} ${outcomeText(item)}. ${item.reason}`, `Resolved${who}${when}: ${stepText()[item.step]} ${outcomeText(item)}. ${item.reason}`)}
                  </span>
                )
              })}
              {doc.status !== 'deleted' && (
                <table className="mt-1 w-full basis-full text-xs">
                  <tbody>
                    {doc.lines.map(line => {
                      const qty = qtyOf(doc, line.material)
                      return (
                        <tr key={line.material} className="border-t border-dashed">
                          <td className="w-48 py-1 pr-3 font-mono">{line.material}</td>
                          <td className="py-1 pr-3 text-muted-foreground">{line.description}</td>
                          <td className="w-28 py-1 text-right tabular-nums">{qty === null ? '–' : t(`${formatNumber(qty)} stk.`, `${formatNumber(qty)} pcs`)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
