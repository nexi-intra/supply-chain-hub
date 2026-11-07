import { useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createPersonalTodo } from '@/lib/personalTodos'
import { parseTimeText } from '@/lib/timeText'
import type { MyWeekLabels } from '@/lib/myWeekLabels'
import { cn } from '@/lib/utils'

/** "+" on a day in Min uge: a personal to-do or appointment on that date; a time in the text ("kl. 13-14") becomes its time. */
export function MyWeekQuickAdd({ userEmail, date, dayName, labels, className }: { userEmail: string; date: string; dayName: string; labels: MyWeekLabels; className?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'todo' | 'event'>('todo')
  const [saving, setSaving] = useState(false)
  const parsed = parseTimeText(text.trim())
  const preview = parsed.startTime ? (parsed.endTime ? `${parsed.startTime}–${parsed.endTime}` : parsed.startTime) : ''

  const save = async () => {
    if (saving) return
    if (!parsed.title) {
      toast.error(labels.quickAdd.missingTitle)
      return
    }
    setSaving(true)
    try {
      await createPersonalTodo(userEmail, parsed.title, undefined, date, undefined, { kind, startTime: parsed.startTime, endTime: parsed.endTime })
      toast.success(labels.quickAdd.saved)
      setText('')
      setKind('todo')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error && error.message === 'INVALID_TIME' ? labels.quickAdd.invalidTime : labels.quickAdd.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-my-week-add={date}
          aria-label={labels.quickAdd.open(dayName)}
          title={labels.quickAdd.open(dayName)}
          className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary', className)}
        >
          <Plus size={14} weight="bold" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start" data-my-week-quick-add>
        <p className="mb-2 text-sm font-semibold first-letter:uppercase">{dayName}</p>
        <div role="radiogroup" className="mb-2 grid grid-cols-2 gap-2">
          {(['todo', 'event'] as const).map(value => (
            <Button key={value} type="button" size="sm" role="radio" aria-checked={kind === value} variant={kind === value ? 'default' : 'outline'} onClick={() => setKind(value)}>
              {value === 'todo' ? labels.quickAdd.todo : labels.quickAdd.event}
            </Button>
          ))}
        </div>
        <Input
          autoFocus
          value={text}
          disabled={saving}
          placeholder={labels.quickAdd.placeholder}
          aria-label={labels.quickAdd.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }}
        />
        <p className="mt-1 min-h-4 text-xs text-muted-foreground" aria-live="polite">
          {preview ? <span className="font-medium tabular-nums text-foreground">{preview}</span> : labels.quickAdd.hint}
        </p>
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => save()} loading={saving}>{labels.quickAdd.save}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
