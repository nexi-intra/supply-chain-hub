import { useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDate, parseDate, shortChoice } from '@/lib/warehouse/finlandDates'
import { t } from '@/lib/warehouse/text'
import type { FinlandFollowUpField, FinlandFollowUpRow } from '@/types/finland'
import { FIELD_NAMES, computedSla, othersOnParcel, shownValue, slaHint, type FollowUpForm } from './followUpLogic'

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

function Segments({ options, value, onPick }: { options: string[]; value: string; onPick: (value: string) => void }) {
  return (
    <div role="group" className="inline-flex overflow-hidden rounded-md border">
      {options.map(option => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onPick(value === option ? '' : option)}
          className={cn(
            'px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 border-l first:border-l-0',
            value === option ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary',
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

/** One parcel of Opfølgning: Expected, Received, SLA, Terminal and Comment, as Finland T&T's form. */
export function FollowUpDetail({ row: r, form, hasDay, comments, onChange, onDateError, onResolve, onTracking, onPrevious, onNext }: FollowUpDetailProps) {
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
        {r.courier === 'DSV' && <span className="text-xs text-muted-foreground">{t('T&T bliver kopieret. Sæt det ind på siden med Ctrl+V.', 'The T&T is copied. Paste it on the page with Ctrl+V.')}</span>}
      </div>

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

      <Field label="Received / attempt">
        {dateField('received', '', true)}
        <div className="flex flex-wrap gap-1.5">
          {r.receivedChoices.map(d => <Choice key={d} on={v.received === d} onClick={() => onChange('received', v.received === d ? '' : d)}>{shortChoice(d)}</Choice>)}
        </div>
      </Field>

      <Field label="Transport SLA" hint={slaHint(form, r)}>
        <div><Segments options={['OK', 'NOK']} value={v.sla} onPick={value => onChange('sla', value)} /></div>
      </Field>

      {fixedTerminal ? (
        <Field label="Terminal" hint={v.terminal ? undefined : t('sættes når du går videre', 'set when you move on')}>
          <span className="inline-block rounded-md border bg-muted/40 px-3 py-1.5 text-sm">{v.terminal || r.courier}</span>
        </Field>
      ) : (
        <Field label="Terminal">
          <div><Segments options={['Turku', 'Vantaa']} value={v.terminal} onPick={value => onChange('terminal', value)} /></div>
        </Field>
      )}

      <Field label="Comment">
        <div className="flex flex-wrap gap-1.5">
          {comments.map(c => <Choice key={c} on={v.comment === c} onClick={() => onChange('comment', v.comment === c ? '' : c)}>{c}</Choice>)}
        </div>
        <CommitInput key={`${form.id}-comment`} value={v.comment || ''} onCommit={text => onChange('comment', text.trim())} aria-label="Comment" maxLength={300} />
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
