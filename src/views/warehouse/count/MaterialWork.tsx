import { useState } from 'react'
import { HandWaving, LockKey, PaperPlaneTilt, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import type { CountState, MaterialLock } from '@/types/warehouse'
import type { PanelProps } from './CountView'
import { answerRequest, askToCount, releaseLock, takeLock, withApprovals, withMaterialLock } from './optimisticState'
import { sinceTime } from './since'
import { t } from '@/lib/warehouse/text'

/** What a material action needs from the count: it shows the change at once and saves in the background. */
export type CountActions = Pick<PanelProps, 'id' | 'state' | 'optimistic' | 'person'>

/** The submit dialog again, after the drive found a difference the screen did not show yet. */
export interface SubmitRetry { comment: string; serverDiff: string }

export const lockOf = (state: CountState, material: string) => state.materialLocks.find(lock => lock.material === material) || null
/** The holder or one of the helpers. */
export const countsOn = (lock: MaterialLock | null, email: string) => Boolean(lock && (lock.holder.email === email || lock.helpers.some(helper => helper.email === email)))
/** Free, idle for an hour (anyone may take it over), or the user's own. */
export const mayCount = (lock: MaterialLock | null, email: string) => !lock || Boolean(lock.idleSince) || countsOn(lock, email)
export const hasAsked = (lock: MaterialLock | null, email: string) => Boolean(lock?.requests.some(request => request.email === email))
export const isApproved = (state: CountState, material: string) => ['approved', 'posted'].includes(state.approvals[material]?.status || '')
export const isSubmitted = (state: CountState, material: string) => state.approvals[material]?.status === 'submitted'

export function materialTotals(state: CountState, material: string) {
  const rows = state.rows.filter(row => row.material === material)
  return {
    description: rows[0]?.description || '',
    sapQty: rows.reduce((sum, row) => sum + row.sapQty, 0),
    counted: rows.reduce((sum, row) => sum + row.counted, 0),
    diff: rows.reduce((sum, row) => sum + row.diff, 0),
  }
}

export function RequestButton({ id, material, state, optimistic, person }: CountActions & { material: string }) {
  const lock = lockOf(state, material)
  if (hasAsked(lock, state.me.email)) return <Badge variant="outline">{t(`Anmodning sendt til ${lock!.holder.name}`, `Request sent to ${lock!.holder.name}`)}</Badge>
  // Shown at once as "Anmodning sendt"; a material that became free meanwhile is taken instead (as the drive does).
  const ask = () => {
    toast.success(t(`Anmodning sendt til ${lock?.holder.name || 'den, der tæller'}`, `Request sent to ${lock?.holder.name || 'the person counting'}`))
    void optimistic(current => (lockOf(current, material) ? askToCount(material, person) : takeLock(material, person))(current), () => window.electronWarehouse!.counts.requestMaterial({ id, material }))
  }
  return <Button size="sm" variant="outline" onClick={() => ask()} aria-label={t(`Anmod om at tælle med på ${material}`, `Ask to help count ${material}`)}><HandWaving size={16} /> {t('Anmod om at tælle med', 'Ask to help count')}</Button>
}

export function SubmitDialog({ id, material, state, optimistic, person, retry, onClose, onServerDiff }: CountActions & { material: string; retry?: SubmitRetry | null; onClose: () => void; onServerDiff: (retry: SubmitRetry) => void }) {
  const totals = materialTotals(state, material)
  const [comment, setComment] = useState(retry?.comment ?? '')
  const serverDiff = retry?.serverDiff ?? null
  const hasDiff = totals.diff !== 0 || serverDiff !== null

  // The dialog closes at once and the material shows "Sendt til godkendelse"; the write runs in the background. If the
  // drive finds a difference the screen did not show yet, the dialog comes back with it.
  const send = () => {
    const acceptDiff = hasDiff
    const text = comment.trim().slice(0, 300)
    onClose()
    toast.success(t(`${material} er sendt til godkendelse`, `${material} was sent for approval`), { description: hasDiff ? t('Med difference – manageren får besked.', 'With a difference – the manager is notified.') : t('Manageren får besked.', 'The manager is notified.') })
    const value = { status: 'submitted' as const, by: person, at: Date.now(), sapQty: totals.sapQty, counted: totals.counted, diff: totals.diff, comment: text }
    void optimistic(
      current => withMaterialLock(material, () => null)(withApprovals({ [material]: value })(current)),
      () => window.electronWarehouse!.counts.submitMaterial({ id, material, comment, acceptDiff }),
      { onError: error => { if (errorCode(error) !== 'SUBMIT_HAS_DIFF') return false; toast.error(errorMessage(error)); onServerDiff({ comment, serverDiff: errorMessage(error) }); return true } },
    )
  }

  return (
    <Dialog open onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`Send ${material} til godkendelse`, `Send ${material} for approval`)}</DialogTitle>
          <DialogDescription>{totals.description} – {t('manageren får besked og kan godkende tallene. Låsen på materialet slippes.', 'the manager is notified and can approve the figures. The lock on the material is released.')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border p-3"><div className="text-xs uppercase text-muted-foreground">SAP</div><div className="text-xl font-semibold tabular-nums">{formatNumber(totals.sapQty)}</div></div>
          <div className="rounded-lg border p-3"><div className="text-xs uppercase text-muted-foreground">{t('Fundet', 'Found')}</div><div className="text-xl font-semibold tabular-nums">{formatNumber(totals.counted)}</div></div>
          <div className="rounded-lg border p-3"><div className="text-xs uppercase text-muted-foreground">Difference</div><div className={totals.diff === 0 ? 'text-xl font-semibold text-emerald-600' : 'text-xl font-semibold text-red-600'}>{totals.diff > 0 ? '+' : ''}{formatNumber(totals.diff)}</div></div>
        </div>
        {hasDiff && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Warning size={18} className="mt-0.5 shrink-0" />
            <span>{serverDiff || t(`Der er en difference på ${totals.diff > 0 ? '+' : ''}${formatNumber(totals.diff)} stk. på ${material}.`, `There is a difference of ${totals.diff > 0 ? '+' : ''}${formatNumber(totals.diff)} pcs on ${material}.`)} {t('Er du sikker på, at alt er talt? Skriv gerne hvorfor.', 'Are you sure everything is counted? Please say why.')}</span>
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="submit-comment">{t('Kommentar til manageren', 'Comment for the manager')} {hasDiff ? t('(anbefales)', '(recommended)') : t('(valgfri)', '(optional)')}</Label>
          <Input id="submit-comment" value={comment} maxLength={300} onChange={event => setComment(event.target.value)} placeholder={hasDiff ? t('Fx 3 stk. ligger til reparation', 'E.g. 3 pcs are in repair') : ''} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => send()} variant={hasDiff ? 'destructive' : 'default'}><PaperPlaneTilt size={18} /> {hasDiff ? t('Send med difference', 'Send with difference') : t('Send til godkendelse', 'Send for approval')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The materials being counted right now: mine (release, send to approval), requests to answer, and the others' locks. */
export function MaterialsInProgress({ id, state, optimistic, person, isOwner }: CountActions & { isOwner: boolean }) {
  const [submitting, setSubmitting] = useState<{ material: string; retry?: SubmitRetry } | null>(null)
  const email = state.me.email
  // The owner, a manager or an Optælling admin answers and releases for others too (as the drive allows).
  const manages = isOwner || state.me.byRole
  const mine = state.materialLocks.filter(lock => countsOn(lock, email))
  const others = state.materialLocks.filter(lock => !countsOn(lock, email))
  const toAnswer = state.materialLocks.filter(lock => (lock.holder.email === email || manages) && lock.requests.length > 0)

  // Shown at once; the write to M: (15–90 s) runs in the background and is taken back if it fails.
  const answer = (material: string, asker: { email: string; name: string }, allow: boolean) => {
    if (allow) toast.success(t(`${asker.name} må nu tælle med`, `${asker.name} may now help count`))
    void optimistic(answerRequest(material, asker.email, allow), () => window.electronWarehouse!.counts.answerMaterialRequest({ id, material, email: asker.email, allow }))
  }
  const release = (material: string) => {
    toast.success(t(`${material} er frigivet`, `${material} is released`))
    void optimistic(releaseLock(material, email), () => window.electronWarehouse!.counts.releaseMaterial({ id, material }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Materialer i gang', 'Materials in progress')}</CardTitle>
        <CardDescription>{t('Et materiale låses til den, der tæller det. Låsen slippes med "Frigiv", med "Send til godkendelse" eller efter en time uden tællelinjer og scanninger.', 'A material is locked to the person counting it. The lock is released with "Release", with "Send for approval" or after an hour without count lines and scans.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {toAnswer.map(lock => lock.requests.map(request => (
          <div key={`${lock.material}-${request.email}`} className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p><strong>{request.name}</strong> {t('vil tælle med på', 'wants to help count')} <span className="font-mono">{lock.material}</span></p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => answer(lock.material, request, true)}>{t('Tillad', 'Allow')}</Button>
              <Button size="sm" variant="ghost" onClick={() => answer(lock.material, request, false)}>{t('Afvis', 'Reject')}</Button>
            </div>
          </div>
        )))}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Mine', 'Mine')} ({mine.length})</p>
          {mine.length === 0 && <p className="text-muted-foreground">{t('Vælg et materiale for at låse det til dig.', 'Choose a material to lock it to you.')}</p>}
          {mine.map(lock => {
            const totals = materialTotals(state, lock.material)
            return (
              <div key={lock.material} className="space-y-1.5 rounded-lg border p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono font-medium">{lock.material}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{formatNumber(totals.counted)}/{formatNumber(totals.sapQty)}</span>
                </div>
                {lock.holder.email !== email && <p className="text-xs text-muted-foreground">{t(`Du tæller med hos ${lock.holder.name}`, `You are helping ${lock.holder.name}`)}</p>}
                {lock.idleSince && <p className="text-xs text-amber-700 dark:text-amber-300">{t(`inaktiv siden ${sinceTime(lock.idleSince)}`, `idle since ${sinceTime(lock.idleSince)}`)}</p>}
                {lock.helpers.length > 0 && lock.holder.email === email && <p className="text-xs text-muted-foreground">{t('Tæller med', 'Helping')}: {lock.helpers.map(helper => helper.name).join(', ')}</p>}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setSubmitting({ material: lock.material })} aria-label={t(`Send ${lock.material} til godkendelse`, `Send ${lock.material} for approval`)}><PaperPlaneTilt size={14} /> {t('Send til godkendelse', 'Send for approval')}</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => release(lock.material)} aria-label={t(`Frigiv ${lock.material}`, `Release ${lock.material}`)}>{t('Frigiv', 'Release')}</Button>
                </div>
              </div>
            )
          })}
        </div>

        {others.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Andre tæller', 'Others counting')}</p>
            {others.map(lock => (
              <div key={lock.material} className="flex flex-wrap items-center gap-2">
                <LockKey size={14} className="text-muted-foreground" />
                <span className="font-mono">{lock.material}</span>
                <span className="text-muted-foreground">{lock.holder.name}</span>
                {lock.idleSince && <span className="text-xs text-amber-700 dark:text-amber-300">{t(`inaktiv siden ${sinceTime(lock.idleSince)}`, `idle since ${sinceTime(lock.idleSince)}`)}</span>}
                <span className="ml-auto flex gap-1">
                  {!lock.idleSince && <RequestButton id={id} material={lock.material} state={state} optimistic={optimistic} person={person} />}
                  {manages && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => release(lock.material)} aria-label={t(`Frigiv ${lock.material}`, `Release ${lock.material}`)}>{t('Frigiv', 'Release')}</Button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {submitting && <SubmitDialog key={submitting.retry?.serverDiff ?? 'new'} id={id} material={submitting.material} state={state} optimistic={optimistic} person={person} retry={submitting.retry} onClose={() => setSubmitting(null)} onServerDiff={retry => setSubmitting({ material: submitting.material, retry })} />}
    </Card>
  )
}
