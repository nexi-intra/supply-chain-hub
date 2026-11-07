import { useEffect, useState } from 'react'
import { CircleNotch } from '@phosphor-icons/react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useStorageConnection } from '@/hooks/useStorageConnection'
import { pendingWriteCount, subscribePendingWrites } from '@/lib/pendingWrites'

// Shown only when a save takes a while, so quick saves do not flicker.
const SHOW_AFTER_MS = 600

/**
 * A small "Gemmer …" in the corner while changes are on their way to the shared drive. Most screens show a change at
 * once and save it in the background (a write to M: takes up to 30 s), so this is how you see that the app is working.
 */
export function SavingIndicator() {
  const { language } = useLanguage()
  const status = useStorageConnection()
  const [count, setCount] = useState(pendingWriteCount())
  const [visible, setVisible] = useState(false)

  useEffect(() => subscribePendingWrites(setCount), [])
  useEffect(() => {
    if (count === 0) { setVisible(false); return }
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [count > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Offline the connection banner takes this corner, and changes are queued locally.
  if (!visible || count === 0 || (status && !status.connected)) return null
  const text = language === 'en' ? 'Saving to the shared drive …' : language === 'fi' ? 'Tallennetaan jaetulle asemalle …' : language === 'sv' ? 'Sparar på den delade enheten …' : 'Gemmer på det fælles drev …'
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 left-4 z-[100] flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-lg backdrop-blur-sm">
      <CircleNotch size={14} className="motion-safe:animate-spin" weight="bold" />
      {text}
      {count > 1 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>}
    </div>
  )
}
