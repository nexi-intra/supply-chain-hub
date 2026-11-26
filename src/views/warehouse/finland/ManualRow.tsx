import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { dateChoices, formatDate, isoOf, parseDate, shortChoice } from '@/lib/warehouse/finlandDates'
import { backendText } from '@/lib/warehouse/finlandText'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import type { FinlandManualCheck, FinlandManualInput } from '@/types/finland'
import { CourierTag, ParcelTable, type Working } from './common'

const COURIERS: [string, string][] = [['DSV', 'DSV'], ['Postnord', 'PostNord'], ['DHL', 'DHL']]

type Field = keyof FinlandManualInput
type Errors = Partial<Record<Field | 'form', string>>
type Preview = Extract<FinlandManualCheck, { ok: true }>['row']

/** As core/courier.cjs: the courier of a known T&T, or null. */
export function courierFromTracking(text: string): string | null {
  const x = String(text).replace(/\s+/g, '').toUpperCase().replace(/^JJD/, 'JD')
  if (/^JD\d{18}$/.test(x)) return 'DHL'
  if (/^00073215\d{12}$/.test(x)) return 'Postnord'
  if (/^00157145\d{12}$/.test(x)) return 'DSV'
  return null
}

const blank = (): FinlandManualInput => ({ delivery: '', orderType: '', postalCode: '', courier: 'DSV', tracking: '', pickedUp: isoOf(new Date()) })

interface ManualRowProps {
  /** The order types in the sheet, most used first, for quick choice. */
  orderTypes: string[]
  working: Working
  writeBlocked: boolean
  check: (values: FinlandManualInput) => Promise<FinlandManualCheck>
  /** Writes the row; resolves with the errors to show, or null when it is written (the tool closes the form). */
  write: (values: FinlandManualInput) => Promise<Errors | null>
  onClose: () => void
}

/** "Tilføj række i hånden": a row not in SAP (e.g. DSV), checked, shown and written only after a yes. */
export function ManualRow({ orderTypes, working, writeBlocked, check, write, onClose }: ManualRowProps) {
  const [values, setValues] = useState<FinlandManualInput>(blank)
  const [errors, setErrors] = useState<Errors>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dateText, setDateText] = useState<string | null>(null)
  const writing = working === 'manual'

  const type = (field: Field, value: string) => {
    setValues(current => ({ ...current, [field]: value }))
    setPreview(null)
  }

  // Checks run when a field is left, so typing is never interrupted.
  const set = (field: Field, value: string) => {
    setValues(current => {
      const next = { ...current, [field]: value }
      const courier = field === 'tracking' ? courierFromTracking(value) : null
      return courier ? { ...next, courier } : next
    })
    setErrors(current => {
      const next = { ...current }
      delete next[field]
      return next
    })
    setPreview(null)
  }

  const runCheck = async () => {
    // A date that cannot be read keeps its error until it is typed again.
    if (dateText !== null) return
    try {
      const result = await check(values)
      if (result.ok) { setErrors({}); setPreview(result.row) } else { setErrors(result.errors); setPreview(null) }
    } catch (error) {
      setErrors({ form: errorMessage(error) })
    }
  }

  const runWrite = async () => {
    const result = await write(values)
    if (result) { setErrors(result); setPreview(null) }
  }

  const error = (field: Field) => (errors[field] ? backendText(errors[field]!) : null)

  const field = (name: Field, label: string, input: ReactNode, help?: string) => (
    <div className="space-y-1.5">
      <label className="block text-xs text-muted-foreground" htmlFor={`finland-manual-${name}`}>{label}</label>
      {input}
      {error(name) ? <p className="text-xs text-destructive">{error(name)}</p> : help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  )

  const text = (name: Field, options: { maxLength: number; list?: string; inputMode?: 'numeric' } = { maxLength: 40 }) => (
    <Input
      id={`finland-manual-${name}`}
      value={values[name]}
      aria-invalid={!!errors[name] || undefined}
      maxLength={options.maxLength}
      list={options.list}
      inputMode={options.inputMode}
      onChange={event => type(name, event.target.value)}
      onBlur={event => set(name, event.target.value.trim())}
    />
  )

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t('Tilføj række i hånden', 'Add a row by hand')}</h2>
        <p className="text-sm text-muted-foreground">{t('Til kolli, der ikke står i SAP, fx DSV. Rækken sættes ind ved sin dato og kan følges op bagefter.', 'For parcels that are not in SAP, e.g. DSV. The row is put in at its date and can be followed up afterwards.')}</p>
      </div>
      {errors.form && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errors.form}</p>}

      <div className="grid max-w-3xl gap-x-7 gap-y-4 sm:grid-cols-2">
        {field('tracking', 'T&T', text('tracking'), t('DSV og PostNord: 20 cifre. DHL: JD og 18 cifre.', 'DSV and PostNord: 20 digits. DHL: JD and 18 digits.'))}
        {field('courier', 'Courier', (
          <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Courier">
            {COURIERS.map(([value, name], index) => (
              <button
                key={value}
                type="button"
                aria-pressed={values.courier === value}
                onClick={() => set('courier', value)}
                className={cn('px-4 py-2 text-sm font-semibold transition', index > 0 && 'border-l', values.courier === value ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
              >
                {name}
              </button>
            ))}
          </div>
        ))}
        {field('delivery', 'Delivery Nr', text('delivery', { maxLength: 12, inputMode: 'numeric' }))}
        {field('orderType', 'Order type', (
          <>
            {text('orderType', { maxLength: 10, list: 'finland-order-types' })}
            <datalist id="finland-order-types">{orderTypes.map(type => <option key={type} value={type} />)}</datalist>
          </>
        ), orderTypes.length ? t(`Fx ${orderTypes.slice(0, 5).join(', ')}`, `E.g. ${orderTypes.slice(0, 5).join(', ')}`) : undefined)}
        {field('postalCode', 'Postal code', text('postalCode', { maxLength: 12 }))}
        {field('pickedUp', 'Date picked up', (
          <div className="space-y-2">
            <Input
              id="finland-manual-pickedUp"
              className="max-w-40"
              value={dateText ?? formatDate(values.pickedUp)}
              aria-invalid={!!errors.pickedUp || undefined}
              onChange={event => setDateText(event.target.value)}
              onBlur={event => {
                const parsed = parseDate(event.target.value, new Date())
                if (parsed === null) {
                  setErrors(current => ({ ...current, pickedUp: t('Datoen kan ikke læses. Skriv fx 24-11-2026.', 'The date cannot be read. Type e.g. 24-11-2026.') }))
                  setPreview(null)
                  return
                }
                setDateText(null)
                set('pickedUp', parsed)
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {dateChoices().map(day => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={values.pickedUp === day}
                  onClick={() => { setDateText(null); set('pickedUp', day) }}
                  className={cn('rounded-full border px-2.5 py-1 text-xs transition', values.pickedUp === day ? 'border-primary bg-primary/10 font-semibold text-primary' : 'bg-background hover:bg-muted')}
                >
                  {shortChoice(day)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {preview ? (
        <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-semibold">{t('Denne række bliver skrevet i arket, ved datoen for afhentning:', 'This row will be written in the sheet, at the pick-up date:')}</p>
          <ParcelTable head={['Delivery', 'Order type', 'Postal code', 'Courier', 'T&T', 'Date picked up']}>
            <tr>
              <td className="px-3 py-2 font-mono tabular-nums">{preview.delivery}</td>
              <td className="px-3 py-2">{preview.orderType}</td>
              <td className="px-3 py-2">{preview.postalCode}</td>
              <td className="px-3 py-2"><CourierTag courier={preview.courier} /></td>
              <td className="px-3 py-2 font-mono tabular-nums">{preview.tracking}</td>
              <td className="px-3 py-2">{formatDate(preview.pickedUp)}</td>
            </tr>
          </ParcelTable>
          <div className="flex flex-wrap gap-2">
            <Button disabled={working !== null || writeBlocked} loading={writing} onClick={runWrite}>
              {writing ? t('Skriver ...', 'Writing ...') : working ? t('Vent, programmet arbejder ...', 'Wait, the program is working ...') : t('Ja, skriv rækken i arket', 'Yes, write the row in the sheet')}
            </Button>
            <Button variant="outline" disabled={writing} onClick={() => setPreview(null)}>{t('Ret', 'Edit')}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={runCheck}>{t('Tjek rækken', 'Check the row')}</Button>
          <Button variant="outline" disabled={writing} onClick={onClose}>{t('Fortryd', 'Cancel')}</Button>
        </div>
      )}
    </div>
  )
}
