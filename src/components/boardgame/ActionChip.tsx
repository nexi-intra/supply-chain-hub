import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { CircleNotch } from '@phosphor-icons/react'
import { watchClickResult } from '@/lib/clickPending'

/**
 * A game chip (`bgr-chip`) that shows a spinner on itself while its action runs – a command to the shared drive can
 * take many seconds, and a chip that only dims does not show which one was pressed.
 */
export function ActionChip({ onAction, disabled, children, ...props }: Omit<ComponentProps<'button'>, 'onClick' | 'type'> & { onAction: () => unknown }) {
  const [working, setWorking] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || working}
      aria-busy={working || undefined}
      onClick={() => { void watchClickResult(onAction(), busy => { if (mounted.current) setWorking(busy) })?.catch(error => console.error('Handlingen fejlede:', error)) }}
    >
      {working && <CircleNotch size={16} weight="bold" aria-hidden="true" className="motion-safe:animate-spin" />}
      {children}
    </button>
  )
}
