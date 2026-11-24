import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AutoText as DetectedText } from '@/components/AutoText'
import { TimeRangeFields } from '@/components/TimeRangeFields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { shiftTimeError, toShiftTime } from '@/lib/shiftTimes'
import { useAutoTranslate } from '@/lib/useAutoTranslate'
import { cn } from '@/lib/utils'
import type { ShiftRole } from '@/lib/types'

export const SHIFT_ROLE_COLORS = [
  { name: 'Lilla', value: '#a855f7' },
  { name: 'Blå', value: '#3b82f6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Grøn', value: '#10b981' },
  { name: 'Gul', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Rød', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Amber', value: '#f59e0b' },
]

const DEFAULT_COLOR = '#8b5cf6'
const Text = ({ text }: { text: string }) => <DetectedText text={text} from="da" />

/**
 * Creates or edits a task of the shift schedule (KV 'shift-roles'). Used by Vagtplan and Stempelkort, so a task is
 * made the same way in both. `onSave` gets the whole role (a new one with a new id) and saves it.
 */
export function ShiftRoleDialog({ open, onOpenChange, role, onSave }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The role being edited, or null for a new one. */
  role: ShiftRole | null
  onSave: (role: ShiftRole) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [onlyWhenAssigned, setOnlyWhenAssigned] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const placeholder = useAutoTranslate('F.eks. Supervisor, Tekniker, Support', 'da')

  useEffect(() => {
    if (!open) return
    setName(role?.name ?? '')
    setColor(role?.color ?? DEFAULT_COLOR)
    setOnlyWhenAssigned(role?.onlyWhenAssigned === true)
    setStart(role?.startTime ?? '')
    setEnd(role?.endTime ?? '')
  }, [open, role])

  const save = () => {
    if (!name.trim()) {
      toast.error('Indtast et rolle navn')
      return
    }
    const timeError = shiftTimeError(start, end)
    if (timeError) {
      toast.error(timeError)
      return
    }
    const times = toShiftTime(start, end)
    onSave(role
      ? { ...role, name: name.trim(), color, onlyWhenAssigned, ...times }
      : { id: Date.now().toString(), name: name.trim(), color, onlyWhenAssigned, ...times })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle><Text text={role ? 'Rediger Rolle' : 'Tilføj Ny Rolle'} /></DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label htmlFor="role-name"><Text text="Rolle Navn" /></Label>
            <Input id="role-name" value={name} onChange={event => setName(event.target.value)} placeholder={placeholder} />
          </div>
          <div>
            <Label><Text text="Vælg Farve" /></Label>
            <div className="grid grid-cols-4 gap-3 mt-3">
              {SHIFT_ROLE_COLORS.map(preset => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setColor(preset.value)}
                  className={cn('relative flex flex-col items-center gap-2 p-3 rounded-md border-2 transition-colors', color === preset.value ? 'border-foreground' : 'border-border hover:border-muted-foreground')}
                >
                  <div className="w-10 h-10 rounded-full" style={{ backgroundColor: preset.value }} />
                  <span className="text-xs font-medium">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id="role-only-when-assigned" checked={onlyWhenAssigned} onCheckedChange={checked => setOnlyWhenAssigned(checked === true)} />
            <Label htmlFor="role-only-when-assigned"><Text text="Vis kun i Hub, når nogen er sat på opgaven" /></Label>
          </div>
          <TimeRangeFields
            id="role-time"
            label={<Text text="Standardtid (valgfri)" />}
            start={start}
            end={end}
            onStart={setStart}
            onEnd={setEnd}
            hint={<Text text="Bruges på alle vagter med denne rolle, medmindre vagten har sin egen tid." />}
          />
          <Button onClick={save} className="w-full">
            <Text text={role ? 'Gem Ændringer' : 'Opret Rolle'} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
