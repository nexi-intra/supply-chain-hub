import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DatePickerField } from '@/components/DatePickerField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { House, Trash, Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useKV } from '@/hooks/useKV'
import { newId } from '@/lib/utils'
import { parseLocalDate } from '@/lib/dateUtils'
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
  const [patterns, setPatterns] = useKV<Record<string, HomeOfficePattern>>('home-office-patterns', {})
  const [exceptions, setExceptions] = useKV<HomeOfficeException[]>('home-office-exceptions', [])
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([])
  const [newExceptionDate, setNewExceptionDate] = useState('')
  const [newExceptionStatus, setNewExceptionStatus] = useState<'home' | 'office'>('home')

  // Synkroniser lokal knap-state med den gemte værdi hver gang dialogen åbnes.
  useEffect(() => {
    if (open) setSelectedWeekdays((patterns || {})[userEmail]?.weekdays || [])
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
    setPatterns(current => ({ ...(current || {}), [userEmail]: { weekdays: selectedWeekdays } }))
    toast.success(t.homeOfficeDialog.patternSaved)
  }

  const handleAddException = () => {
    if (!newExceptionDate) {
      toast.error(t.homeOfficeDialog.selectDateError)
      return
    }
    const entry: HomeOfficeException = {
      id: newId('homeoffice'),
      userEmail,
      date: newExceptionDate,
      isHomeOffice: newExceptionStatus === 'home',
    }
    setExceptions(current => [
      ...(current || []).filter(e => !(e.userEmail === userEmail && e.date === newExceptionDate)),
      entry,
    ])
    setNewExceptionDate('')
    toast.success(t.homeOfficeDialog.exceptionAdded)
  }

  const handleRemoveException = (id: string) => {
    setExceptions(current => (current || []).filter(e => e.id !== id))
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
