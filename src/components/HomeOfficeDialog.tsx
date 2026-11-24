import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePickerField } from '@/components/DatePickerField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { House, Trash, Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useKV } from '@/hooks/useKV'
import { appendToKvArray, removeFromKvArray, setKvObjectField, upsertInKvArray } from '@/lib/kvArrays'
import { saveInBackground } from '@/lib/saveInBackground'
import { newId } from '@/lib/utils'
import { parseLocalDate, toIsoDateString } from '@/lib/dateUtils'
import { format } from 'date-fns'
import type { HomeOfficePattern, HomeOfficeException } from '@/lib/types'

interface HomeOfficeDialogProps {
  userEmail: string
}

// Date.getDay()-konvention (0=søndag..6=lørdag) — matcher lib/homeOffice.ts.
const WEEKDAY_ORDER: Array<{ day: number; key: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' }> = [
  { day: 1, key: 'monday' },
  { day: 2, key: 'tuesday' },
  { day: 3, key: 'wednesday' },
  { day: 4, key: 'thursday' },
  { day: 5, key: 'friday' },
]

/** Selv-rapporteret hjemmearbejde: fast ugentligt mønster + enkelt-dags-undtagelser. Ingen godkendelse. */
export function HomeOfficeDialog({ userEmail }: HomeOfficeDialogProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [patterns] = useKV<Record<string, HomeOfficePattern>>('home-office-patterns', {})
  const [exceptions] = useKV<HomeOfficeException[]>('home-office-exceptions', [])
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([])
  const [weekIntervals, setWeekIntervals] = useState<Record<number, string>>({})
  const [firstDates, setFirstDates] = useState<Record<number, string>>({})
  const [newExceptionDate, setNewExceptionDate] = useState('')
  const [newExceptionStatus, setNewExceptionStatus] = useState<'home' | 'office'>('home')

  const nextOccurrence = (day: number) => {
    const next = new Date()
    next.setDate(next.getDate() + (day - next.getDay() + 7) % 7)
    return toIsoDateString(next)
  }

  useEffect(() => {
    if (!open) return
    const saved = (patterns || {})[userEmail]
    setSelectedWeekdays(saved?.weekdays || [])
    setWeekIntervals(Object.fromEntries(WEEKDAY_ORDER.map(({ day }) => [day, String(saved?.repeat?.[day]?.intervalWeeks || 1)])))
    setFirstDates(Object.fromEntries(WEEKDAY_ORDER.map(({ day }) => [day, saved?.repeat?.[day]?.startDate || nextOccurrence(day)])))
  }, [open, patterns, userEmail])

  const myExceptions = useMemo(() => {
    return (exceptions || [])
      .filter(e => e.userEmail === userEmail)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [exceptions, userEmail])

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays(current => current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort())
  }

  const handleSavePattern = () => {
    const repeat: NonNullable<HomeOfficePattern['repeat']> = {}
    for (const day of selectedWeekdays) {
      const intervalWeeks = Number(weekIntervals[day] ?? '1')
      if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > 52) {
        toast.error(t.homeOfficeDialog.invalidInterval)
        return
      }
      if (intervalWeeks > 1) {
        const startDate = firstDates[day]
        if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
            toIsoDateString(parseLocalDate(startDate)) !== startDate || parseLocalDate(startDate).getDay() !== day) {
          toast.error(t.homeOfficeDialog.invalidFirstDate.replace('{day}', t.homeOfficeDialog.weekdays[WEEKDAY_ORDER.find(entry => entry.day === day)!.key]))
          return
        }
        repeat[day] = { intervalWeeks, startDate }
      }
    }
    const pattern: HomeOfficePattern = { weekdays: selectedWeekdays, ...(Object.keys(repeat).length ? { repeat } : {}) }
    // Only this user's field, under the file lock: every open view (calendar, hub) shows it at once.
    void saveInBackground(setKvObjectField('home-office-patterns', userEmail, pattern), { failure: t.profile.errors.generic })
    toast.success(t.homeOfficeDialog.patternSaved)
  }

  const handleAddException = () => {
    if (!newExceptionDate) {
      toast.error(t.homeOfficeDialog.selectDateError)
      return
    }
    // The user's old exception for the day is replaced in place, any further ones removed.
    const stale = (exceptions || []).filter(e => e.userEmail === userEmail && e.date === newExceptionDate).map(e => e.id)
    const entry: HomeOfficeException = {
      id: stale[0] || newId('homeoffice'),
      userEmail,
      date: newExceptionDate,
      isHomeOffice: newExceptionStatus === 'home',
    }
    const write = stale.length
      ? Promise.all([upsertInKvArray('home-office-exceptions', [entry]), removeFromKvArray('home-office-exceptions', stale.slice(1))])
      : appendToKvArray('home-office-exceptions', [entry])
    void saveInBackground(write, { failure: t.profile.errors.generic })
    setNewExceptionDate('')
    toast.success(t.homeOfficeDialog.exceptionAdded)
  }

  const handleRemoveException = (id: string) => {
    void saveInBackground(removeFromKvArray('home-office-exceptions', [id]), { failure: t.profile.errors.generic })
    toast.success(t.homeOfficeDialog.exceptionRemoved)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <House size={20} weight="bold" />
          {t.homeOfficeDialog.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{t.homeOfficeDialog.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t.homeOfficeDialog.description}</p>

        <div className="space-y-3 mt-2">
          <div>
            <Label>{t.homeOfficeDialog.patternTitle}</Label>
            <p className="text-xs text-muted-foreground mb-2">{t.homeOfficeDialog.patternHint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_ORDER.map(({ day, key }) => (
              <Button
                key={day}
                type="button"
                variant={selectedWeekdays.includes(day) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleWeekday(day)}
                className="gap-1.5"
              >
                <House size={14} weight={selectedWeekdays.includes(day) ? 'fill' : 'regular'} />
                {t.homeOfficeDialog.weekdays[key]}
              </Button>
            ))}
          </div>
          {WEEKDAY_ORDER.filter(({ day }) => selectedWeekdays.includes(day)).map(({ day, key }) => (
            <div key={day} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
              <div className="space-y-1.5">
                <Label htmlFor={`home-office-interval-${day}`}>{t.homeOfficeDialog.weekdays[key]} · {t.homeOfficeDialog.intervalLabel}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`home-office-interval-${day}`}
                    type="number"
                    min={1}
                    max={52}
                    step={1}
                    value={weekIntervals[day] ?? '1'}
                    onChange={event => setWeekIntervals(current => ({ ...current, [day]: event.target.value }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">{Number(weekIntervals[day] ?? '1') === 1 ? t.homeOfficeDialog.weekUnit : t.homeOfficeDialog.weeksUnit}</span>
                </div>
              </div>
              {Number(weekIntervals[day] ?? '1') > 1 && (
                <div className="space-y-1.5">
                  <Label>{t.homeOfficeDialog.firstOccurrence}</Label>
                  <DatePickerField value={firstDates[day] || ''} onChange={value => setFirstDates(current => ({ ...current, [day]: value }))} />
                </div>
              )}
            </div>
          ))}
          <Button size="sm" onClick={handleSavePattern}>
            {t.homeOfficeDialog.savePattern}
          </Button>
        </div>

        <div className="space-y-3 mt-6 pt-6 border-t">
          <div>
            <Label>{t.homeOfficeDialog.exceptionsTitle}</Label>
            <p className="text-xs text-muted-foreground mb-2">{t.homeOfficeDialog.exceptionsHint}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <DatePickerField
              value={newExceptionDate}
              onChange={setNewExceptionDate}
              className="flex-1"
            />
            <Select value={newExceptionStatus} onValueChange={(v) => setNewExceptionStatus(v as 'home' | 'office')}>
              <SelectTrigger className="sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="home">{t.homeOfficeDialog.statusHomeOffice}</SelectItem>
                <SelectItem value="office">{t.homeOfficeDialog.statusOffice}</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" onClick={handleAddException} className="gap-2">
              <Plus size={16} weight="bold" />
              {t.homeOfficeDialog.addException}
            </Button>
          </div>

          {myExceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t.homeOfficeDialog.noExceptions}</p>
          ) : (
            <div className="space-y-2">
              {myExceptions.map((exception) => (
                <div key={exception.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-card text-sm">
                  <span className="font-medium">
                    {format(parseLocalDate(exception.date), 'dd/MM/yyyy')} — {exception.isHomeOffice ? t.homeOfficeDialog.statusHomeOffice : t.homeOfficeDialog.statusOffice}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 hover:bg-destructive/20 hover:text-destructive"
                    onClick={() => handleRemoveException(exception.id)}
                  >
                    <Trash size={14} weight="bold" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
