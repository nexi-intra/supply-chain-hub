import { useEffect, useRef } from 'react'
import { isAnyDialogOpen } from '@/lib/modalStack'

export function isRetryKey(code: string, repeat: boolean): boolean {
  return !repeat && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')
}

/** Use the same restart action as the visible button on an arcade end screen. */
export function useGameOverRetry(gameOver: boolean, onRetry: () => void): void {
  const retryRef = useRef(onRetry)
  retryRef.current = onRetry

  useEffect(() => {
    if (!gameOver) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isRetryKey(event.code, event.repeat) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (isAnyDialogOpen()) return
      // Let keyboard users operate a focused button, link or input normally.
      if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [role="button"], [contenteditable]')) return

      event.preventDefault()
      // A restarted game must not consume this same press as its first move.
      event.stopImmediatePropagation()
      retryRef.current()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [gameOver])
}
