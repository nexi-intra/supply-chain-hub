import { useEffect, useState } from 'react'
import { Flag, MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import { formatDateTime } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { SapCheckEntry } from '@/types/warehouse'

const QUARTERS = [1, 2, 3, 4]

export function StartStatusDialog({ onClose, onStarted, onOpenSapCheck }: { onClose: () => void; onStarted: () => void; onOpenSapCheck: () => void }) {
  const today = new Date()
  const [year, setYear] = useState(String(today.getFullYear()))
  const [quarter, setQuarter] = useState(Math.floor(today.getMonth() / 3) + 1)
  const [name, setName] = useState('')
  const [starting, setStarting] = useState(false)
  const [sapCheck, setSapCheck] = useState<SapCheckEntry | null | undefined>(undefined)
  const yearNumber = Number(year)
  const validYear = Number.isInteger(yearNumber) && yearNumber >= 2020 && yearNumber <= 2100
  const defaultName = `Status Q${quarter} ${validYear ? yearNumber : ''}`.trim()

  useEffect(() => {
    window.electronWarehouse!.sapCheck.latest().then(setSapCheck).catch(() => setSapCheck(null))
  }, [])

  const start = async () => {
    if (!validYear) return
    setStarting(true)
    try {
      const status = await window.electronWarehouse!.statuses.start({ year: yearNumber, quarter, name: name.trim() || undefined })
      toast.success(t(`"${status.name}" er startet`, `"${status.name}" has started`))
      onStarted()
    } catch (error) {
      toast.error(errorMessage(error))
      setStarting(false)
    }
  }

  return (
    <Dialog open onOpenChange={value => { if (!value && !starting) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Start ny status', 'Start new status')}</DialogTitle>
          <DialogDescription>
            {t('En status samler kvartalets optællinger. Når den er startet, kan alle i teamet oprette optællinger i den.', 'A status gathers the quarter’s counts. Once it has started, everyone in the team can create counts in it.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor="status-year">{t('År', 'Year')}</Label>
            <Input id="status-year" inputMode="numeric" value={year} onChange={event => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))} aria-invalid={!validYear} />
          </div>
          <div className="space-y-2">
            <Label id="status-quarter-label">{t('Kvartal', 'Quarter')}</Label>
            <div role="radiogroup" aria-labelledby="status-quarter-label" className="flex gap-2">
              {QUARTERS.map(value => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={quarter === value}
                  onClick={() => setQuarter(value)}
                  className={cn('h-9 flex-1 rounded-md border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    quarter === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary')}
                >
                  Q{value}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status-name">{t('Navn', 'Name')}</Label>
          <Input id="status-name" value={name} maxLength={80} placeholder={defaultName} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void start() }} />
        </div>
        {sapCheck !== undefined && (
          <div className={cn('flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm', sapCheck && sapCheck.summary.total === 0 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10')}>
            <MagnifyingGlass size={16} />
            <span className="flex-1">
              {sapCheck ? t(`Seneste SAP-tjek: ${formatDateTime(sapCheck.at)} – ${sapCheck.summary.total} fejl${sapCheck.mail ? ', mail lavet til SAP-teamet' : ''}.`, `Latest SAP check: ${formatDateTime(sapCheck.at)} – ${sapCheck.summary.total} errors${sapCheck.mail ? ', mail made for the SAP team' : ''}.`) : t('SAP er ikke tjekket for fejl endnu. Tjek gerne før statussen.', 'SAP has not been checked for errors yet. Consider checking before the status.')}
            </span>
            <Button size="sm" variant="link" className="h-auto px-0" onClick={onOpenSapCheck} disabled={starting}>{t('Tjek SAP-fejl', 'Check SAP errors')}</Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={starting}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void start()} disabled={!validYear} loading={starting}><Flag size={18} /> {t('Start status', 'Start status')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
