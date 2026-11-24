import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, CaretRight, ChatCircleText, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect, Textarea } from '@/components/warehouse/ui'
import { commentsFor, commentsOnTask, outcomeLabel, SOFTWARELOAD_TYPES as TYPES, summarizeByMaterial, summarizeTasks, targetLabel, taskForMaterial, taskLoadCounts, TYPE_LABELS } from '@/lib/softwareload'
import { formatDuration, periodRange, type PeriodKind } from '@/lib/timeclock'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime, formatTime } from '@/lib/warehouse/format'
import { currentWarehouseLanguage, t, warehouseLocale } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'
import type { SoftwareloadChoice, SoftwareloadComment, SoftwareloadTask } from '@/types/warehouse'
import { DeleteDialog, ErrorLine, isProblem, label } from './common'

type Period = PeriodKind | 'custom'

const POLL_MS = 60_000
const COMMENT_MAX = 1000
const PERIODS: { value: Period; label: () => string }[] = [
  { value: 'today', label: () => t('I dag', 'Today') },
  { value: 'week', label: () => t('Denne uge', 'This week') },
  { value: 'month', label: () => t('Denne måned', 'This month') },
  { value: 'lastMonth', label: () => t('Sidste måned', 'Last month') },
  { value: 'custom', label: () => t('Vælg periode', 'Choose period') },
]

const formatRate = (value: number) => value.toLocaleString(warehouseLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** An outcome label inside a sentence: "SAP afviste" stays, "Opgivet" becomes "opgivet". */
const inSentence = (text: string) => (/^\p{Lu}{2}/u.test(text) ? text : text.charAt(0).toLocaleLowerCase(warehouseLocale()) + text.slice(1))
const byNewest = (a: string, b: string) => b.localeCompare(a, 'da', { numeric: true })

/** A whole calendar month `YYYY-MM` as `YYYY-MM-DD` days. */
const monthRange = (month: string) => {
  const [year, number] = month.split('-').map(Number)
  return { from: `${month}-01`, to: `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, '0')}` }
}
const isWholeMonth = ({ from, to }: { from: string; to: string }) => from.slice(0, 7) === to.slice(0, 7) && monthRange(from.slice(0, 7)).from === from && monthRange(from.slice(0, 7)).to === to
const dayDate = (day: string) => { const [year, month, date] = day.split('-').map(Number); return new Date(year, month - 1, date) }
/** "november 2026" for a whole month, otherwise "1. nov. 2026 – 15. nov. 2026". */
function periodText(period: { from: string; to: string }): string {
  if (isWholeMonth(period)) return dayDate(period.from).toLocaleDateString(warehouseLocale(), { month: 'long', year: 'numeric' })
  const day = (value: string) => dayDate(value).toLocaleDateString(warehouseLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
  return period.from === period.to ? day(period.from) : `${day(period.from)} – ${day(period.to)}`
}
/** The comment texts for a marker's tooltip. */
const commentTitle = (comments: SoftwareloadComment[]) => comments.map(comment => `${periodText(comment)}: ${comment.text}`).join('\n\n')

/**
 * Times and pace per person and type and per material, with the managers' comments on the period. Only managers see
 * the tab; the main process refuses anyone else.
 */
export function SoftwareloadStats() {
  const [period, setPeriod] = useState<Period>('week')
  const [custom, setCustom] = useState(() => periodRange('month', new Date()))
  const { from, to } = period === 'custom' ? custom : periodRange(period, new Date())
  const [tasks, setTasks] = useState<SoftwareloadTask[] | null>(null)
  const [comments, setComments] = useState<SoftwareloadComment[]>([])
  const [commentsFailed, setCommentsFailed] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [person, setPerson] = useState('')
  const [type, setType] = useState('')
  const [version, setVersion] = useState('')
  const [material, setMaterial] = useState('')
  const [deleting, setDeleting] = useState<SoftwareloadTask | null>(null)
  const [writing, setWriting] = useState<SoftwareloadComment | 'new' | null>(null)
  const [deletingComment, setDeletingComment] = useState<SoftwareloadComment | null>(null)
  const language = currentWarehouseLanguage()

  // Only the newest request may fill the screen: a slow answer for an earlier period must not replace a newer one. The
  // comments are read apart, so a comment file that cannot be read never hides the numbers.
  const latest = useRef(0)
  const load = useCallback(async () => {
    const request = ++latest.current
    const bridge = window.electronWarehouse!.softwareload
    const readTasks = async () => {
      try {
        const next = await bridge.tasks({ from, to })
        if (request !== latest.current) return
        setTasks(next)
        setFailed(null)
      } catch (error) {
        if (request === latest.current) setFailed(errorMessage(error))
      }
    }
    const readComments = async () => {
      try {
        const next = await bridge.comments({ from, to })
        if (request !== latest.current) return
        setComments(next)
        setCommentsFailed(null)
      } catch (error) {
        if (request === latest.current) setCommentsFailed(errorMessage(error))
      }
    }
    await Promise.all([readTasks(), readComments()])
  }, [from, to])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const all = useMemo(() => tasks ?? [], [tasks])
  const filtered = useMemo(() => all
    .filter(task => (!person || task.email === person) && (!type || task.type === type) && (!version || task.version === version))
    .flatMap(task => {
      if (!material) return [task]
      const part = taskForMaterial(task, material)
      return part ? [part] : []
    }), [all, person, type, version, material])
  const rows = useMemo(() => summarizeTasks(filtered), [filtered])
  const materialRows = useMemo(() => summarizeByMaterial(filtered), [filtered])
  const people = useMemo(() => [...new Map(all.map(task => [task.email, task.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'da')), [all])
  const versions = useMemo(() => [...new Set(all.map(task => task.version))].sort(byNewest), [all])
  const materials = useMemo(() => summarizeByMaterial(all).map(row => row.material).filter(Boolean), [all])
  const totals = useMemo(() => rows.reduce((sum, row) => ({ moved: sum.moved + row.moved, failed: sum.failed + row.failed, sapFailed: sum.sapFailed + row.sapFailed, workedMs: sum.workedMs + row.workedMs }), { moved: 0, failed: 0, sapFailed: 0, workedMs: 0 }), [rows])
  const pace = totals.workedMs > 0 ? Math.round((totals.moved / (totals.workedMs / 3_600_000)) * 10) / 10 : 0

  // A comment on a material or a version shows when it is the one chosen; under other filters, when it is among the numbers shown.
  const shown = useMemo(() => {
    const shownMaterials = materialRows.map(row => row.material).filter(Boolean)
    const shownVersions = [...new Set(filtered.map(task => task.version))]
    return commentsFor(comments, {
      material: material || (person || type || version ? shownMaterials : undefined),
      version: version || (person || type || material ? shownVersions : undefined),
    })
  }, [comments, filtered, materialRows, material, person, type, version])

  const deleteTask = async (task: SoftwareloadTask) => {
    try {
      await window.electronWarehouse!.softwareload.deleteTask({ taskId: task.id })
      toast.success(t('Opgaven er slettet', 'The task is deleted'))
      setDeleting(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
    void load()
  }

  const deleteComment = async (comment: SoftwareloadComment) => {
    try {
      await window.electronWarehouse!.softwareload.deleteComment({ id: comment.id })
      toast.success(t('Kommentaren er slettet', 'The comment is deleted'))
      setDeletingComment(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
    void load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
          {PERIODS.map(item => (
            <Button key={item.value} size="sm" variant={period === item.value ? 'default' : 'ghost'} onClick={() => setPeriod(item.value)}>{item.label()}</Button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label htmlFor="sl-from">{t('Fra', 'From')}</Label><Input id="sl-from" type="date" value={custom.from} max={custom.to} onChange={event => event.target.value && setCustom(current => ({ ...current, from: event.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="sl-to">{t('Til', 'To')}</Label><Input id="sl-to" type="date" value={custom.to} min={custom.from} onChange={event => event.target.value && setCustom(current => ({ ...current, to: event.target.value }))} /></div>
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <NativeSelect aria-label={t('Person', 'Person')} value={person} onChange={event => setPerson(event.target.value)}>
            <option value="">{t('Alle personer', 'Everyone')}</option>
            {people.map(([email, name]) => <option key={email} value={email}>{name}</option>)}
          </NativeSelect>
          <NativeSelect aria-label={t('Type', 'Type')} value={type} onChange={event => setType(event.target.value)}>
            <option value="">{t('Alle typer', 'All types')}</option>
            {TYPES.map(item => <option key={item} value={item}>{label(TYPE_LABELS[item])}</option>)}
          </NativeSelect>
          <NativeSelect aria-label={t('Softwareversion', 'Software version')} value={version} onChange={event => setVersion(event.target.value)}>
            <option value="">{t('Alle versioner', 'All versions')}</option>
            {versions.map(item => <option key={item} value={item}>{item}</option>)}
          </NativeSelect>
          <NativeSelect aria-label={t('Materiale', 'Material')} value={material} onChange={event => setMaterial(event.target.value)}>
            <option value="">{t('Alle materialer', 'All materials')}</option>
            {materials.map(item => <option key={item} value={item}>{item}</option>)}
          </NativeSelect>
        </div>
      </div>

      {failed && <ErrorLine text={failed} />}
      {!tasks && !failed && <Skeleton className="h-64 rounded-xl" />}

      {tasks && (
        <>
          <CommentList comments={shown} failed={commentsFailed} onAdd={() => setWriting('new')} onEdit={setWriting} onDelete={setDeletingComment} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label={t('Opgaver', 'Tasks')} value={String(filtered.length)} />
            <Figure label={t('Loadet', 'Loaded')} value={String(totals.moved)} note={totals.sapFailed ? t(`${totals.sapFailed} afvist af SAP`, `${totals.sapFailed} refused by SAP`) : undefined} />
            <Figure label={t('Fejlede', 'Failed')} value={String(totals.failed)} />
            <Figure label={t('Terminaler i timen', 'Terminals per hour')} value={formatRate(pace)} note={formatDuration(totals.workedMs, language)} />
          </div>

          {filtered.length === 0 ? (
            <Card className="items-center border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t('Ingen afsluttede opgaver i perioden.', 'No finished tasks in the period.')}</Card>
          ) : (
            <>
              <SummaryTable rows={rows} />
              <MaterialTable rows={materialRows} tasks={filtered} comments={shown} />
              <TaskList tasks={filtered} comments={shown} onDelete={task => setDeleting(all.find(item => item.id === task.id) ?? task)} />
            </>
          )}
        </>
      )}

      {deleting && (
        <DeleteDialog
          title={t('Slet opgaven?', 'Delete the task?')}
          what={t(
            `Opgaven fra ${deleting.name}, startet ${formatDateTime(deleting.startedAt)}, med ${Object.keys(deleting.terminals).length} terminaler slettes fra statistikken og søgningen.`,
            `The task by ${deleting.name}, started ${formatDateTime(deleting.startedAt)}, with ${Object.keys(deleting.terminals).length} terminals is deleted from the statistics and the search.`,
          )}
          onCancel={() => setDeleting(null)}
          onDelete={() => deleteTask(deleting)}
        />
      )}
      {deletingComment && (
        <DeleteDialog
          title={t('Slet kommentaren?', 'Delete the comment?')}
          what={t(
            `Kommentaren til ${periodText(deletingComment)} fra ${deletingComment.by.name} slettes. Hvem der slettede den og hvornår, bliver gemt.`,
            `The comment on ${periodText(deletingComment)} by ${deletingComment.by.name} is deleted. Who deleted it and when is saved.`,
          )}
          aboutSap={false}
          onCancel={() => setDeletingComment(null)}
          onDelete={() => deleteComment(deletingComment)}
        />
      )}
      {writing && (
        <CommentDialog
          comment={writing === 'new' ? null : writing}
          month={from.slice(0, 7)}
          materials={material ? [material] : materialRows.map(row => row.material).filter(Boolean)}
          onClose={() => setWriting(null)}
          onSaved={() => { setWriting(null); void load() }}
        />
      )}
    </div>
  )
}

/** The managers' comments on the period that fit the filters, above the numbers they explain. */
function CommentList({ comments, failed, onAdd, onEdit, onDelete }: { comments: SoftwareloadComment[]; failed: string | null; onAdd: () => void; onEdit: (comment: SoftwareloadComment) => void; onDelete: (comment: SoftwareloadComment) => void }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{t('Kommentarer', 'Comments')} ({comments.length})</h2>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onAdd}><Plus size={16} /> {t('Tilføj kommentar', 'Add comment')}</Button>
      </div>
      {failed && <ErrorLine text={t(`Kommentarerne kunne ikke læses: ${failed}`, `The comments could not be read: ${failed}`)} className="mx-5 my-3" />}
      {comments.length === 0 ? (!failed &&
        <p className="px-5 py-3 text-sm text-muted-foreground">{t('Ingen kommentarer til perioden. Skriv en, hvis tallene skal forklares, fx at ny software til et materiale tog længere tid at loade.', 'No comments on the period. Write one if the numbers need explaining, e.g. that new software for a material took longer to load.')}</p>
      ) : (
        <ul className="divide-y">
          {comments.map(comment => (
            <li key={comment.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3">
              <ChatCircleText size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{periodText(comment)}</span>
                  {comment.material && <Badge variant="outline">{t('Materiale', 'Material')} {comment.material}</Badge>}
                  {comment.version && <Badge variant="outline">{t('Version', 'Version')} {comment.version}</Badge>}
                  {!comment.material && !comment.version && <span className="text-xs text-muted-foreground">{t('Hele perioden', 'The whole period')}</span>}
                </div>
                <p className="whitespace-pre-line break-words text-sm">{comment.text}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`Skrevet af ${comment.by.name} ${formatDateTime(comment.at)}`, `Written by ${comment.by.name} ${formatDateTime(comment.at)}`)}
                  {comment.editedBy && comment.editedAt != null && t(`, rettet af ${comment.editedBy.name} ${formatDateTime(comment.editedAt)}`, `, edited by ${comment.editedBy.name} ${formatDateTime(comment.editedAt)}`)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => onEdit(comment)}><PencilSimple size={16} /> {t('Ret', 'Edit')}</Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(comment)}><Trash size={16} /> {t('Slet', 'Delete')}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Writes or rewrites a comment. A new one covers the month of the period shown; a whole month or own from and to dates
 * can be chosen. The material list is the materials in the tasks shown, the version list the hub's latest versions.
 */
function CommentDialog({ comment, month, materials, onClose, onSaved }: { comment: SoftwareloadComment | null; month: string; materials: string[]; onClose: () => void; onSaved: () => void }) {
  const start = comment ? { from: comment.from, to: comment.to } : monthRange(month)
  const [wholeMonth, setWholeMonth] = useState(() => isWholeMonth(start))
  const [chosenMonth, setChosenMonth] = useState(start.from.slice(0, 7))
  const [range, setRange] = useState(start)
  const [material, setMaterial] = useState(comment?.material ?? '')
  const [version, setVersion] = useState(comment?.version ?? '')
  const [text, setText] = useState(comment?.text ?? '')
  const [versions, setVersions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let current = true
    window.electronWarehouse!.softwareload.versions().then(list => { if (current) setVersions(list) }, () => {})
    return () => { current = false }
  }, [])

  const period = wholeMonth ? monthRange(chosenMonth) : range
  const validPeriod = Boolean(period.from && period.to && period.from <= period.to)
  const save = async () => {
    if (!text.trim() || !validPeriod) return
    setSaving(true)
    const request = { ...period, material: material.trim(), version: version.trim(), text }
    try {
      const bridge = window.electronWarehouse!.softwareload
      if (comment) await bridge.updateComment({ id: comment.id, ...request })
      else await bridge.addComment(request)
      toast.success(comment ? t('Kommentaren er rettet', 'The comment is updated') : t('Kommentaren er gemt', 'The comment is saved'))
      onSaved()
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{comment ? t('Ret kommentaren', 'Edit the comment') : t('Tilføj en kommentar til perioden', 'Add a comment on the period')}</DialogTitle>
          <DialogDescription>{t('Forklar tallene i en periode. Uden materiale og version gælder kommentaren hele perioden. Hvem der skrev og rettede den og hvornår, bliver gemt.', 'Explain the numbers of a period. Without a material and a version the comment concerns the whole period. Who wrote and edited it and when is saved.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('Periode', 'Period')}</Label>
            <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
              <Button size="sm" variant={wholeMonth ? 'default' : 'ghost'} onClick={() => setWholeMonth(true)}>{t('Hel måned', 'Whole month')}</Button>
              <Button size="sm" variant={wholeMonth ? 'ghost' : 'default'} onClick={() => { if (wholeMonth) setRange(monthRange(chosenMonth)); setWholeMonth(false) }}>{t('Egne datoer', 'Own dates')}</Button>
            </div>
            {wholeMonth ? (
              <Input aria-label={t('Måned', 'Month')} type="month" value={chosenMonth} onChange={event => event.target.value && setChosenMonth(event.target.value)} />
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label htmlFor="sl-comment-from">{t('Fra', 'From')}</Label><Input id="sl-comment-from" type="date" value={range.from} max={range.to} onChange={event => event.target.value && setRange(current => ({ ...current, from: event.target.value }))} /></div>
                <div className="space-y-1"><Label htmlFor="sl-comment-to">{t('Til', 'To')}</Label><Input id="sl-comment-to" type="date" value={range.to} min={range.from} onChange={event => event.target.value && setRange(current => ({ ...current, to: event.target.value }))} /></div>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sl-comment-material">{t('Materiale (valgfrit)', 'Material (optional)')}</Label>
              <Input id="sl-comment-material" list="sl-comment-materials" value={material} maxLength={40} onChange={event => setMaterial(event.target.value.toUpperCase())} />
              <datalist id="sl-comment-materials">{materials.map(item => <option key={item} value={item} />)}</datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-comment-version">{t('Softwareversion (valgfri)', 'Software version (optional)')}</Label>
              <Input id="sl-comment-version" list="sl-comment-versions" value={version} maxLength={60} onChange={event => setVersion(event.target.value)} />
              <datalist id="sl-comment-versions">{versions.map(item => <option key={item} value={item} />)}</datalist>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sl-comment-text">{t('Kommentar', 'Comment')}</Label>
            <Textarea id="sl-comment-text" autoFocus rows={5} value={text} maxLength={COMMENT_MAX} onChange={event => setText(event.target.value)} />
            <p className="text-right text-xs text-muted-foreground tabular-nums">{text.length}/{COMMENT_MAX}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={save} loading={saving} disabled={!text.trim() || !validPeriod}><ChatCircleText size={16} /> {comment ? t('Gem rettelsen', 'Save the change') : t('Gem kommentaren', 'Save the comment')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A speech bubble on a row that comments concern; the tooltip shows their texts. */
function CommentMarker({ comments }: { comments: SoftwareloadComment[] }) {
  if (!comments.length) return null
  const title = commentTitle(comments)
  return (
    <span role="img" title={title} aria-label={t(`${comments.length} kommentar(er): ${title}`, `${comments.length} comment(s): ${title}`)} className="ml-1.5 inline-flex align-middle text-primary">
      <ChatCircleText size={15} weight="fill" aria-hidden />
    </span>
  )
}

function Figure({ label: title, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </Card>
  )
}

function SummaryTable({ rows }: { rows: ReturnType<typeof summarizeTasks> }) {
  const language = currentWarehouseLanguage()
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <h2 className="border-b px-5 py-3 text-sm font-semibold">{t('Pr. person og type', 'Per person and type')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t('Person', 'Person')}</th>
              <th className="px-4 py-2 font-medium">{t('Type', 'Type')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Opgaver', 'Tasks')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Loadet', 'Loaded')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Fejlede', 'Failed')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('SAP afviste', 'Refused by SAP')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Tid', 'Time')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Pr. time', 'Per hour')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(row => (
              <tr key={row.key}>
                <td className="px-4 py-2">{row.name}</td>
                <td className="px-4 py-2">{label(TYPE_LABELS[row.type])}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.tasks}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.moved}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums', row.failed > 0 && 'text-destructive')}>{row.failed}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums', row.sapFailed > 0 && 'text-destructive')}>{row.sapFailed}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatDuration(row.workedMs, language)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{formatRate(row.perHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-5 py-2 text-xs text-muted-foreground">{t('Tempoet tæller terminaler pr. arbejdstime. Kun dem, der er markeret som fejlet, tæller ikke med. Dem SAP afviste, tæller med og vises også for sig.', 'The pace counts terminals per working hour. Only those marked as failed are left out. Those SAP refused are counted and also shown apart.')}</p>
    </Card>
  )
}

/** Terminals, failed ones and pace per material; a task's time is shared out on its materials by their number of terminals. */
function MaterialTable({ rows, tasks, comments }: { rows: ReturnType<typeof summarizeByMaterial>; tasks: SoftwareloadTask[]; comments: SoftwareloadComment[] }) {
  const language = currentWarehouseLanguage()
  // A comment on a material and a version marks the row only when a shown task loaded that material with that version.
  const concerns = (comment: SoftwareloadComment, material: string) => comment.material === material
    && (!comment.version || tasks.some(task => task.version === comment.version && taskForMaterial(task, material)))
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <h2 className="border-b px-5 py-3 text-sm font-semibold">{t('Pr. materiale', 'Per material')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t('Materiale', 'Material')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Opgaver', 'Tasks')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Loadet', 'Loaded')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Fejlede', 'Failed')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Tid', 'Time')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Pr. time', 'Per hour')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(row => (
              <tr key={row.material || '-'}>
                <td className="px-4 py-2">
                  {row.material || <span className="text-muted-foreground">{t('Ukendt', 'Unknown')}</span>}
                  {row.material && <CommentMarker comments={comments.filter(comment => concerns(comment, row.material))} />}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{row.tasks}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.moved}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums', row.failed > 0 && 'text-destructive')}>{row.failed}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatDuration(row.workedMs, language)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{formatRate(row.perHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-5 py-2 text-xs text-muted-foreground">{t('Har en opgave flere materialer, fordeles tiden efter antal terminaler.', 'When a task has several materials, its time is shared out by the number of terminals.')}</p>
    </Card>
  )
}

/** Every task in the period; a task opens to its serials with the outcome and the note, and to "Slet". */
function TaskList({ tasks, comments, onDelete }: { tasks: SoftwareloadTask[]; comments: SoftwareloadComment[]; onDelete: (task: SoftwareloadTask) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const language = currentWarehouseLanguage()
  const toggle = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <h2 className="border-b px-5 py-3 text-sm font-semibold">{t('Opgaver', 'Tasks')} ({tasks.length})</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-4 py-2 font-medium">{t('Start', 'Start')}</th>
              <th className="px-4 py-2 font-medium">{t('Person', 'Person')}</th>
              <th className="px-4 py-2 font-medium">{t('Type', 'Type')}</th>
              <th className="px-4 py-2 font-medium">{t('Version', 'Version')}</th>
              <th className="px-4 py-2 font-medium">{t('Mål', 'Target')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Loadet', 'Loaded')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Pause', 'Break')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('Tid', 'Time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks.map(task => {
              const isOpen = open.has(task.id)
              const { loaded, failed, problems } = taskLoadCounts(task)
              // Loadet as in "Pr. person og type"; failed terminals and problem outcomes in red, e.g. "10 (1 SAP afviste)".
              const notes = [...(failed > 0 ? [t(`${failed} fejlet`, `${failed} failed`)] : []), ...problems.map(([outcome, count]) => `${count} ${inSentence(label(outcomeLabel(outcome)))}`)]
              return (
                <Fragment key={task.id}>
                  <tr className="cursor-pointer hover:bg-muted/30" onClick={() => toggle(task.id)}>
                    <td className="px-2 py-2">
                      <Button size="icon" variant="ghost" className="size-7" aria-expanded={isOpen} aria-label={isOpen ? t('Skjul serienumre', 'Hide serial numbers') : t('Vis serienumre', 'Show serial numbers')} onClick={event => { event.stopPropagation(); toggle(task.id) }}>
                        {isOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                      </Button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatDateTime(task.startedAt)}<span className="text-muted-foreground"> → {formatTime(task.endedAt)}</span>{task.endCorrected && <Badge variant="outline" className="ml-2">{t('sluttid valgt', 'end chosen')}</Badge>}<CommentMarker comments={commentsOnTask(comments, task)} /></td>
                    <td className="px-4 py-2">{task.name}</td>
                    <td className="px-4 py-2">{label(TYPE_LABELS[task.type])}{task.kif && <Badge variant="outline" className="ml-2">KIF</Badge>}</td>
                    <td className="px-4 py-2">{task.version}</td>
                    <td className="whitespace-nowrap px-4 py-2">{targetLabel(task.target)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                      {loaded}
                      {notes.length > 0 && <span className="ml-1 text-destructive">({notes.join(', ')})</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{task.pausedMs >= 60_000 ? formatDuration(task.pausedMs, language) : '–'}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatDuration(task.workedMs, language)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-muted/20">
                      <td />
                      <td colSpan={8} className="px-4 py-3">
                        {task.abandoned && <p className="mb-2 text-xs text-destructive">{t(`Flytningerne blev opgivet af ${task.abandoned.by}: ${task.abandoned.reason}`, `The moves were given up by ${task.abandoned.by}: ${task.abandoned.reason}`)}</p>}
                        {task.edits?.map(item => (
                          <p key={item.at} className="mb-2 text-xs text-muted-foreground">{t(`Rettet kl. ${formatTime(item.at)}: ${choiceText(item.from)} → ${choiceText(item.to)}`, `Edited at ${formatTime(item.at)}: ${choiceText(item.from)} → ${choiceText(item.to)}`)}</p>
                        ))}
                        <SerialList task={task} />
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onDelete(task)}><Trash size={16} /> {t('Slet', 'Delete')}</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** One set of choices in a line, e.g. "Softwareload, I KIF, D006 · Forecast Prep (TCD), 2.4.1". */
const choiceText = (choice: SoftwareloadChoice) => [label(TYPE_LABELS[choice.type]), choice.kif ? t('I KIF', 'In KIF') : t('uden for KIF', 'outside KIF'), targetLabel(choice.target), choice.version].join(', ')

function SerialList({ task }: { task: SoftwareloadTask }) {
  const serials = Object.keys(task.terminals).sort((a, b) => task.terminals[a].at - task.terminals[b].at)
  if (!serials.length) return <p className="text-xs text-muted-foreground">{t('Opgaven har ingen serienumre.', 'The task has no serial numbers.')}</p>
  return (
    <ul className="grid gap-x-6 gap-y-1 text-sm lg:grid-cols-2">
      {serials.map(serial => {
        const result = task.results[serial]
        const note = task.terminals[serial].failed?.note
        return (
          <li key={serial} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono">{serial}</span>
            {result && <span className={cn('text-xs', isProblem(result.outcome) ? 'font-medium text-destructive' : 'text-muted-foreground')}>{label(outcomeLabel(result.outcome))}</span>}
            {result?.message && <span className="w-full text-xs text-destructive">SAP: {result.message}</span>}
            {note && <span className="w-full text-xs text-muted-foreground">{t('Note', 'Note')}: {note}</span>}
          </li>
        )
      })}
    </ul>
  )
}
