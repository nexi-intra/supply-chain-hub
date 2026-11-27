import { useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDate, parseDate, shortChoice } from '@/lib/warehouse/finlandDates'
import { t } from '@/lib/warehouse/text'
import type { FinlandFollowUpField, FinlandFollowUpRow } from '@/types/finland'
import { FIELD_NAMES, applySuggestions, dayMonth, eventTime, fetchedText, othersOnParcel, shownValue, slaHint, timelineRows, type FollowUpForm } from './followUpLogic'

export interface FollowUpDetailProps {
  row: FinlandFollowUpRow | null
  form: FollowUpForm | null
  /** A day is chosen (the empty text differs). */
  hasDay: boolean
  comments: string[]
  onChange: (field: FinlandFollowUpField, value: string) => void
  /** A date field's text could not be read (null: it could again). */
  onDateError: (field: FinlandFollowUpField | null) => void
  onResolve: (field: FinlandFollowUpField, choice: 'sheet' | 'mine') => void
  onTracking: () => void
  onPrevious: () => void
  onNext: () => void
  /** "Opdater status": fetches this parcel from nShift again. Left out, the button is not shown. */
  onUpdateStatus?: () => void
  /** Something is running: "Opdater status" waits. */
  busy?: boolean
  /** This parcel's status is being fetched. */
  updating?: boolean
  /** "Ikke sendt": asks to mark the parcel (and delete its row). Left out, the button is not shown. */
  onNotSent?: () => void
}

/** A text field that hands its value over on Enter and when it loses focus, as an input's change event. */
function CommitInput({ value, onCommit, className, ...props }: { value: string; onCommit: (text: string) => void } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value)
  // A new value from outside (a date button, the next parcel) replaces the text at once, before any blur can send the old one.
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setText(value)
  }
  const commit = () => { if (text !== value) onCommit(text) }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') commit() }
  return <Input {...props} className={className} value={text} onChange={event => setText(event.target.value)} onBlur={commit} onKeyDown={onKeyDown} />
}

function Choice({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition hover:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        on ? 'border-primary bg-primary/10 font-semibold text-primary' : 'bg-background',
      )}
    >
      {children}
    </button>
  )
}

function Segments({ options, value, suggested, onPick }: { options: string[]; value: string; suggested?: string; onPick: (value: string) => void }) {
  return (
    <div role="group" className="inline-flex overflow-hidden rounded-md border">
      {options.map(option => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          title={!value && suggested === option ? t('Forslag, bliver brugt når du går videre', 'Suggestion, used when you move on') : undefined}
          onClick={() => onPick(value === option ? '' : option)}
          className={cn(
            'px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 border-l first:border-l-0',
            value === option ? 'bg-primary text-primary-foreground' : !value && suggested === option ? 'bg-muted text-muted-foreground' : 'bg-background hover:bg-secondary',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** The parcel's timeline from nShift as a short list (time in Finnish time, place, text), with the first attempt and delivery marked. */
function Timeline({ nshift }: { nshift: NonNullable<FinlandFollowUpRow['nshift']> }) {
  const events = timelineRows(nshift.events)
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b className="text-xs">{t('Forløb i nShift (finsk tid)', 'Timeline in nShift (Finnish time)')}</b>
        {nshift.firstAttempt && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{t(`Første forsøg ${dayMonth(nshift.firstAttempt)}`, `First attempt ${dayMonth(nshift.firstAttempt)}`)}</span>}
        {nshift.delivered && <span className="rounded bg-ok-surface px-1.5 py-0.5 text-xs font-semibold">{t(`Afleveret ${dayMonth(nshift.delivered)}`, `Delivered ${dayMonth(nshift.delivered)}`)}</span>}
        <span className="text-xs text-muted-foreground">{fetchedText(nshift.fetchedAt)}</span>
      </div>
      {events.length ? (
        <ol className="max-h-48 space-y-0.5 overflow-auto">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className={cn('grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 text-xs', (e.firstAttempt || e.delivered) ? 'font-semibold' : 'text-muted-foreground')}>
              <span className="tabular-nums">{eventTime(e.at)}</span>
              <span className="min-w-0">
                {e.place && <span>{e.place}: </span>}
                {e.text || e.status}
                {e.firstAttempt && <span className="ml-1 text-primary">({t('første forsøg', 'first attempt')})</span>}
                {e.delivered && !e.firstAttempt && <span className="ml-1">({t('afleveret', 'delivered')})</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">{t('nShift har ingen hændelser for kolliet endnu.', 'nShift has no events for the parcel yet.')}</p>
      )}
    </div>
  )
}

/** One parcel of Opfølgning: Expected, Received, SLA, Terminal and Comment, as Finland T&T's form. */
export function FollowUpDetail({ row: r, form, hasDay, comments, onChange, onDateError, onResolve, onTracking, onPrevious, onNext, onUpdateStatus, busy = false, updating = false, onNotSent }: FollowUpDetailProps) {
  if (!r || !form) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{hasDay ? t('Vælg et kolli i listen.', 'Choose a parcel in the list.') : ''}</p>
  }
  const v = form.values
  const head = (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {t(`${r.delivery} · ${r.orderType} · ${r.postalCode} · afhentet ${shortChoice(r.pickedUp)} · række ${r.row}`, `${r.delivery} · ${r.orderType} · ${r.postalCode} · picked up ${shortChoice(r.pickedUp)} · row ${r.row}`)}
      </p>
      <p className="font-mono text-lg font-semibold tracking-wide">{r.tracking || t('Intet T&T', 'No T&T')}</p>
    </div>
  )
  if (r.notSent) return head
  if (r.duplicate || r.noTracking) {
    return (
      <div className="space-y-4">
        {head}
        <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          {r.duplicate
            ? t('Kolliet står to gange i arket. Ret det under Skriv ind først.', 'The parcel is in the sheet twice. Correct it under Write in first.')
            : t('Rækken har intet T&T, så den kan ikke følges op her.', 'The row has no T&T, so it cannot be followed up here.')}
        </p>
      </div>
    )
  }

  const courierName = ({ DHL: 'DHL', DSV: 'DSV' } as Record<string, string>)[r.courier] || 'PostNord'
  const fixedTerminal = r.courier === 'DHL' || r.courier === 'DSV'
  const othersWarning = othersOnParcel(r.othersPending)
  // What Enter would fill in, shown grey in the empty fields.
  const preview = applySuggestions(form, r).values
  const canUpdate = !!onUpdateStatus && (r.courier === 'Postnord' || r.courier === 'DHL')

  const dateField = (field: 'expected' | 'received', suggestion: string, autofocus = false) => (
    <CommitInput
      key={`${form.id}-${field}`}
      value={formatDate(v[field])}
      onCommit={text => {
        const parsed = parseDate(text, new Date())
        if (parsed === null) { onDateError(field); return }
        onDateError(null)
        onChange(field, parsed)
      }}
      inputMode="numeric"
      aria-label={FIELD_NAMES[field]}
      aria-invalid={form.error === field || undefined}
      placeholder={suggestion ? formatDate(suggestion) : t('dd-mm-åååå', 'dd-mm-yyyy')}
      data-autofocus={autofocus || undefined}
      className="w-40"
    />
  )

  return (
    <div className="space-y-4">
      {head}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" title="T" onClick={onTracking}>{t(`Åbn hos ${courierName}`, `Open at ${courierName}`)}</Button>
        {canUpdate && (
          <Button variant="outline" size="sm" disabled={busy} loading={updating} onClick={onUpdateStatus}>
            {updating ? t('Henter status ...', 'Fetching status ...') : t('Opdater status', 'Update status')}
          </Button>
        )}
        {r.courier === 'DSV' && <span className="text-xs text-muted-foreground">{t('T&T bliver kopieret. Sæt det ind på siden med Ctrl+V.', 'The T&T is copied. Paste it on the page with Ctrl+V.')}</span>}
        {onNotSent && (
          <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" disabled={busy} title={t('Kolliet blev aldrig sendt. Det bliver markeret, så det ikke bliver skrevet ind igen.', 'The parcel was never sent. It is marked so it is not written in again.')} onClick={onNotSent}>
            {t('Ikke sendt', 'Not sent')}
          </Button>
        )}
      </div>

      {r.nshift && <Timeline nshift={r.nshift} />}

      {othersWarning && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-attention/40 bg-attention-surface px-3 py-2 text-sm">
          <Warning aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{othersWarning}
        </p>
      )}

      {r.conflicts.map(c => (
        <div key={c.field} role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p>
            {t(
              `${FIELD_NAMES[c.field]} er ændret i arket af en anden: der står ${shownValue(c.field, c.current)}, du har ${shownValue(c.field, c.wanted)}.`,
              `${FIELD_NAMES[c.field]} was changed in the sheet by someone else: it says ${shownValue(c.field, c.current)}, you have ${shownValue(c.field, c.wanted)}.`,
            )}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onResolve(c.field, 'sheet')}>{t('Brug arkets', "Use the sheet's")}</Button>
            <Button size="sm" variant="outline" onClick={() => onResolve(c.field, 'mine')}>{t('Brug min', 'Use mine')}</Button>
          </div>
        </div>
      ))}

      <Field label="Expected delivery" hint={!v.expected && r.suggestedExpected ? t('forslag, bliver brugt når du går videre', 'suggestion, used when you move on') : undefined}>
        {dateField('expected', r.suggestedExpected || '')}
      </Field>

      <Field label="Received / attempt" hint={!v.received && preview.received ? t('forslag fra nShift, bliver brugt når du går videre', 'suggestion from nShift, used when you move on') : undefined}>
        {dateField('received', preview.received || '', true)}
        <div className="flex flex-wrap gap-1.5">
          {r.receivedChoices.map(d => <Choice key={d} on={v.received === d} onClick={() => onChange('received', v.received === d ? '' : d)}>{shortChoice(d)}</Choice>)}
        </div>
      </Field>

      <Field label="Transport SLA" hint={slaHint(form, r)}>
        <div><Segments options={['OK', 'NOK']} value={v.sla} suggested={form.slaManual ? undefined : preview.sla} onPick={value => onChange('sla', value)} /></div>
      </Field>

      {fixedTerminal ? (
        <Field label="Terminal" hint={v.terminal ? undefined : t('sættes når du går videre', 'set when you move on')}>
          <span className="inline-block rounded-md border bg-muted/40 px-3 py-1.5 text-sm">{v.terminal || r.courier}</span>
        </Field>
      ) : (
        <Field label="Terminal" hint={!v.terminal && preview.terminal ? t('forslag fra nShift, bliver brugt når du går videre', 'suggestion from nShift, used when you move on') : undefined}>
          <div><Segments options={['Turku', 'Vantaa']} value={v.terminal} suggested={preview.terminal} onPick={value => onChange('terminal', value)} /></div>
        </Field>
      )}

      <Field label="Comment" hint={!v.comment && preview.comment ? t('forslag fra nShift, bliver brugt når du går videre', 'suggestion from nShift, used when you move on') : undefined}>
        <div className="flex flex-wrap gap-1.5">
          {comments.map(c => <Choice key={c} on={v.comment === c} onClick={() => onChange('comment', v.comment === c ? '' : c)}>{c}</Choice>)}
        </div>
        <CommitInput key={`${form.id}-comment`} value={v.comment || ''} onCommit={text => onChange('comment', text.trim())} aria-label="Comment" maxLength={300} placeholder={!v.comment ? preview.comment || undefined : undefined} />
      </Field>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onPrevious}>{t('Forrige', 'Previous')}</Button>
        <Button onClick={onNext}>{t('Næste (Enter)', 'Next (Enter)')}</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('Taster: Enter næste, 1 Turku, 2 Vantaa, O OK, N NOK, T åbn tracking, pil op og ned skifter kolli.', 'Keys: Enter next, 1 Turku, 2 Vantaa, O OK, N NOK, T open tracking, arrow up and down change parcel.')}
      </p>
    </div>
  )
}
