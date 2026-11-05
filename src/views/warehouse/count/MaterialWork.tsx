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
import { t } from '@/lib/warehouse/text'

export const lockOf = (state: CountState, material: string) => state.materialLocks.find(lock => lock.material === material) || null
export const mayCount = (lock: MaterialLock | null, email: string) => !lock || lock.holder.email === email || lock.helpers.some(helper => helper.email === email)
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

export function RequestButton({ id, material, state, refresh }: { id: string; material: string; state: CountState; refresh: () => Promise<void> }) {
  const lock = lockOf(state, material)
  const [busy, setBusy] = useState(false)
  if (hasAsked(lock, state.me.email)) return <Badge variant="outline">{t(`Anmodning sendt til ${lock!.holder.name}`, `Request sent to ${lock!.holder.name}`)}</Badge>
  const ask = async () => {
    setBusy(true)
    try {
      await window.electronWarehouse!.counts.requestMaterial({ id, material })
      toast.success(t(`Anmodning sendt til ${lock?.holder.name || 'den, der tæller'}`, `Request sent to ${lock?.holder.name || 'the person counting'}`))
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return <Button size="sm" variant="outline" loading={busy} onClick={() => void ask()} aria-label={t(`Anmod om at tælle med på ${material}`, `Ask to help count ${material}`)}><HandWaving size={16} /> {t('Anmod om at tælle med', 'Ask to help count')}</Button>
}

export function SubmitDialog({ id, material, state, onClose, onSent }: { id: string; material: string; state: CountState; onClose: () => void; onSent: () => Promise<void> }) {
  const totals = materialTotals(state, material)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [serverDiff, setServerDiff] = useState<string | null>(null)
  const hasDiff = totals.diff !== 0 || serverDiff !== null

  const send = async () => {
    setSending(true)
    try {
      await window.electronWarehouse!.counts.submitMaterial({ id, material, comment, acceptDiff: hasDiff })
      toast.success(t(`${material} er sendt til godkendelse`, `${material} was sent for approval`), { description: hasDiff ? t('Med difference – manageren får besked.', 'With a difference – the manager is notified.') : t('Manageren får besked.', 'The manager is notified.') })
      await onSent()
    } catch (error) {
      if (errorCode(error) === 'SUBMIT_HAS_DIFF') setServerDiff(errorMessage(error))
      else toast.error(errorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open onOpenChange={value => { if (!value && !sending) onClose() }}>
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
          <Button variant="ghost" onClick={onClose} disabled={sending}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void send()} loading={sending} variant={hasDiff ? 'destructive' : 'default'}><PaperPlaneTilt size={18} /> {hasDiff ? t('Send med difference', 'Send with difference') : t('Send til godkendelse', 'Send for approval')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The materials being counted right now: mine (release, send to approval), requests to answer, and the others' locks. */
export function MaterialsInProgress({ id, state, refresh, isOwner }: { id: string; state: CountState; refresh: () => Promise<void>; isOwner: boolean }) {
  const [submitting, setSubmitting] = useState<string | null>(null)
  const email = state.me.email
  const mine = state.materialLocks.filter(lock => mayCount(lock, email))
  const others = state.materialLocks.filter(lock => !mayCount(lock, email))
  const toAnswer = state.materialLocks.filter(lock => (lock.holder.email === email || isOwner) && lock.requests.length > 0)

  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action()
      if (done) toast.success(done)
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Materialer i gang', 'Materials in progress')}</CardTitle>
        <CardDescription>{t('Et materiale låses til den, der tæller det. Låsen slippes med "Frigiv" eller "Send til godkendelse".', 'A material is locked to the person counting it. The lock is released with "Release" or "Send for approval".')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {toAnswer.map(lock => lock.requests.map(request => (
          <div key={`${lock.material}-${request.email}`} className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p><strong>{request.name}</strong> {t('vil tælle med på', 'wants to help count')} <span className="font-mono">{lock.material}</span></p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void run(() => window.electronWarehouse!.counts.answerMaterialRequest({ id, material: lock.material, email: request.email, allow: true }), t(`${request.name} må nu tælle med`, `${request.name} may now help count`))}>{t('Tillad', 'Allow')}</Button>
              <Button size="sm" variant="ghost" onClick={() => void run(() => window.electronWarehouse!.counts.answerMaterialRequest({ id, material: lock.material, email: request.email, allow: false }))}>{t('Afvis', 'Reject')}</Button>
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
                {lock.helpers.length > 0 && lock.holder.email === email && <p className="text-xs text-muted-foreground">{t('Tæller med', 'Helping')}: {lock.helpers.map(helper => helper.name).join(', ')}</p>}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setSubmitting(lock.material)} aria-label={t(`Send ${lock.material} til godkendelse`, `Send ${lock.material} for approval`)}><PaperPlaneTilt size={14} /> {t('Send til godkendelse', 'Send for approval')}</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void run(() => window.electronWarehouse!.counts.releaseMaterial({ id, material: lock.material }), t(`${lock.material} er frigivet`, `${lock.material} is released`))} aria-label={t(`Frigiv ${lock.material}`, `Release ${lock.material}`)}>{t('Frigiv', 'Release')}</Button>
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
                <span className="ml-auto flex gap-1">
                  <RequestButton id={id} material={lock.material} state={state} refresh={refresh} />
                  {isOwner && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void run(() => window.electronWarehouse!.counts.releaseMaterial({ id, material: lock.material }), t(`${lock.material} er frigivet`, `${lock.material} is released`))}>{t('Frigiv', 'Release')}</Button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {submitting && <SubmitDialog id={id} material={submitting} state={state} onClose={() => setSubmitting(null)} onSent={async () => { setSubmitting(null); await refresh() }} />}
    </Card>
  )
}
