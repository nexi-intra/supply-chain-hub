import { useEffect, useCallback, useRef } from 'react'

interface UseUnsavedChangesOptions {
  hasUnsavedChanges: boolean
  onConfirmedExit: () => void
  enabled?: boolean
}

export function useUnsavedChanges({
  hasUnsavedChanges,
  onConfirmedExit,
  enabled = true
}: UseUnsavedChangesOptions) {
  const confirmDialogShownRef = useRef(false)

  const handleEscapeKey = useCallback((event: KeyboardEvent) => {
    if (!enabled) return
    
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()

      if (hasUnsavedChanges && !confirmDialogShownRef.current) {
        confirmDialogShownRef.current = true
        
        const shouldExit = window.confirm(
          'Du har ugemte ændringer. Er du sikker på at du vil lukke uden at gemme?'
        )
        
        confirmDialogShownRef.current = false

        if (shouldExit) {
          onConfirmedExit()
        }
      } else if (!hasUnsavedChanges) {
        onConfirmedExit()
      }
    }
  }, [hasUnsavedChanges, onConfirmedExit, enabled])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleEscapeKey, true)
    return () => window.removeEventListener('keydown', handleEscapeKey, true)
  }, [handleEscapeKey, enabled])
}
