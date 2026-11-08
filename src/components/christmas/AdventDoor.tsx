import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { christmasLabels, doorMessage, openedDoors, rememberOpenedDoor } from '@/lib/christmas'
import { cn } from '@/lib/utils'

function wasOpened(day: number) {
  try { return openedDoors().includes(day) } catch { return false }
}

/** Today's door in the advent calendar on the front page. */
export function AdventDoor({ day, language }: { day: number; language: string }) {
  const labels = christmasLabels(language)
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(() => wasOpened(day))

  const openDoor = () => {
    setOpen(true)
    setOpened(true)
    try { rememberOpenedDoor(day) } catch { /* storage unavailable */ }
  }

  return (
    <>
      <button type="button" onClick={openDoor} className="xmas-door flex items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
        <span className={cn('xmas-hatch', opened && 'is-open')}>{day}</span>
        <span className="text-sm leading-snug">
          <span className="block font-semibold">{labels.door}</span>
          <span className="opacity-90">{labels.doorHint}</span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="xmas-hatch is-open" aria-hidden="true">{day}</span>
              {labels.doorTitle(day)}
            </DialogTitle>
            <DialogDescription className="pt-2 text-base leading-relaxed text-foreground">{doorMessage(day, language)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpen(false)} className="w-full">{labels.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
