import { CheckCircle, FilePlus, ListChecks, Printer, Trash, Warning } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime, formatNumber } from '@/lib/warehouse/format'
import type { PiDoc, PiDocList, PiDocStatus } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'

const statusMap = (): Record<PiDocStatus, { label: string; className: string }> => ({
  creating: { label: t('Oprettes …', 'Being created …'), className: 'border-sky-500 text-sky-700 dark:text-sky-300' },
  created: { label: t('Oprettet', 'Created'), className: 'border-sky-500 text-sky-700 dark:text-sky-300' },
  printed: { label: t('Printet', 'Printed'), className: 'border-violet-500 text-violet-700 dark:text-violet-300' },
  counted: { label: t('Antal lagt på', 'Quantity entered'), className: 'border-amber-500 text-amber-700 dark:text-amber-300' },
  posted: { label: t('Bogført', 'Posted'), className: 'border-emerald-500 text-emerald-700 dark:text-emerald-300' },
  deleted: { label: t('Slettet', 'Deleted'), className: 'text-muted-foreground' },
})

const waitingFor = (): Record<string, string> => ({ print: t('Venter på print (manager)', 'Waiting for print (manager)'), count: t('Venter på en admin', 'Waiting for an admin'), post: t('Venter på bogføring (manager)', 'Waiting for posting (manager)') })

interface PiDocsSectionProps {
  list: PiDocList
  selected: { materials: string[]; sloc: string; stockType: string } | null
  busy: string | null
  onCreate: () => void
  onPrint: (doc: PiDoc) => void
  onCount: (doc: PiDoc) => void
  onPost: (docs: PiDoc[]) => void
  onDelete: (doc: PiDoc) => void
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
export function PiDocsSection({ list, selected, busy, onCreate, onPrint, onCount, onPost, onDelete, qtyOf }: PiDocsSectionProps) {
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
          <Button size="sm" variant="outline" className="ml-auto" disabled={busy !== null} loading={busy === 'post'} onClick={() => onPost(postable)}>
            <CheckCircle size={16} /> {t('Bogfør alle', 'Post all')} ({postable.length})
          </Button>
        )}
        {list.canCreate && (
          <Button size="sm" className={postable.length > 1 ? '' : 'ml-auto'} disabled={!selected || busy !== null} loading={busy === 'create'} onClick={onCreate}>
            <FilePlus size={16} /> {selected ? t(`Opret SAP-dokument (${selected.materials.length}${selected.materials.length > 1 ? ' af maks. 20' : ''})`, `Create SAP document (${selected.materials.length}${selected.materials.length > 1 ? ' of max. 20' : ''})`) : t('Vælg materialer i tabellen', 'Choose materials in the table')}
          </Button>
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
              <span className="font-mono font-semibold">{doc.docNo || '–'}</span>
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
                ? <Button size="sm" variant="outline" disabled={busy !== null} loading={busy === doc.id} onClick={() => onPrint(doc)}><Printer size={16} /> Print</Button>
                : doc.next === 'count' && doc.canNext
                  ? <Button size="sm" variant="outline" disabled={busy !== null} loading={busy === doc.id} onClick={() => onCount(doc)}><ListChecks size={16} /> {t('Læg antal på', 'Enter quantity')}</Button>
                  : doc.next === 'post' && doc.canNext
                    ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => onPost([doc])}><CheckCircle size={16} /> {t('Bogfør', 'Post')}</Button>
                    : doc.next && <span className="text-xs text-muted-foreground">{waitingFor()[doc.next]}</span>}
              {doc.canDelete && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy !== null} loading={busy === `delete:${doc.id}`} onClick={() => onDelete(doc)}><Trash size={16} /> {t('Slet i SAP', 'Delete in SAP')}</Button>}
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
