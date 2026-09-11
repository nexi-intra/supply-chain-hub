// Dato-vælger med ugestart mandag (i modsætning til nativ <input type="date">,
// hvis kalender følger OS-locale og typisk viser søndag først). Bruges alle
// steder man vælger fridag/ferie, så ugedagene altid vises Ma-Sø.

import { useState } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { da } from 'date-fns/locale'
import { CalendarBlank } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerFieldProps {
  id?: string
  /** ISO-dato "yyyy-MM-dd", eller tom streng for "ikke valgt". */
  value: string
  onChange: (value: string) => void
  /** ISO-dato "yyyy-MM-dd" — dage før denne er deaktiveret. */
  min?: string
  /** ISO-dato "yyyy-MM-dd" — dage efter denne er deaktiveret. */
  max?: string
  placeholder?: string
  disabled?: boolean
  /** Måned/år-dropdowns i stedet for kun pile — til datoer langt tilbage (fx fødselsdage). */
  enableYearDropdown?: boolean
  className?: string
}

function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined
  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : undefined
}

export function DatePickerField({ id, value, onChange, min, max, placeholder, disabled, enableYearDropdown, className }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = parseIsoDate(value)
  const minDate = parseIsoDate(min || '')
  const maxDate = parseIsoDate(max || '')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal h-10',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <CalendarBlank size={18} className="mr-2 shrink-0" />
          {selected ? format(selected, 'PPP', { locale: da }) : (placeholder || 'Vælg dato')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={1}
          ISOWeek
          showWeekNumber
          locale={da}
          captionLayout={enableYearDropdown ? 'dropdown' : 'label'}
          startMonth={enableYearDropdown ? new Date(1940, 0) : undefined}
          endMonth={enableYearDropdown ? new Date() : undefined}
          disabled={(date) => (minDate ? date < minDate : false) || (maxDate ? date > maxDate : false)}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, 'yyyy-MM-dd'))
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
