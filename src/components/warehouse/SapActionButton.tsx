import { useState, type ComponentProps } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSapStatus } from '@/components/warehouse/SapStatusContext'
import { describeSapState } from '@/lib/warehouse/sapStatus'

type SapActionButtonProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  onAction: () => void | Promise<void>
}

/** A button for anything that talks to SAP: disabled with an explanation until SAP is ready, and re-checked right before it runs. */
export function SapActionButton({ onAction, children, disabled, ...props }: SapActionButtonProps) {
  const { status, refresh } = useSapStatus()
  const [running, setRunning] = useState(false)
  const ready = status?.ready === true

  const handleClick = async () => {
    setRunning(true)
    try {
      const latest = await refresh(true)
      if (!latest.ready) {
        const description = describeSapState(latest)
        toast.warning(description.label, { description: description.help })
        return
      }
      await onAction()
    } finally {
      setRunning(false)
    }
  }

  const button = (
    <Button {...props} disabled={disabled || !ready} loading={running} onClick={() => handleClick()}>
      {children}
    </Button>
  )
  if (ready) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">{button}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{describeSapState(status).help}</TooltipContent>
    </Tooltip>
  )
}
