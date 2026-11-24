// "Hvad skete der, mens du var væk" stores when you last saw it. Saving it is a write to M: (15-25 s), and it used to
// happen on every start. Without anything shown, an unsaved timestamp changes nothing about what is shown next time.
const SAVE_AFTER_MS = 24 * 60 * 60 * 1000

export function shouldSaveDigestLastSeen({ lastSeen, now, shown }: { lastSeen: number | undefined | null; now: number; shown: number }): boolean {
  if (!lastSeen) return true
  return shown > 0 || now - lastSeen > SAVE_AFTER_MS
}
