// Reads a clock time out of a short text ("Ring til DHL kl. 10:30", "Møde kl. 13-14"). Same rules as electron/assistantTimeText.cjs.

export interface TimeText {
  title: string
  startTime?: string
  endTime?: string
}

const PREFIX = '(?<![\\p{L}\\d])(?:fra\\s+)?(?:kl\\.?|klo\\.?|klockan|at)\\s*'
const HOUR_MIN = '(\\d{1,2})(?:[:.](\\d{2}))?'
const PATTERNS = [
  new RegExp(`${PREFIX}${HOUR_MIN}\\s*(?:-|–|til|to)\\s*(?:kl\\.?\\s*)?${HOUR_MIN}(?![\\d:])`, 'iu'),
  /(?<![\d:./-])(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2})(?::(\d{2}))?(?![\d:])/u,
  new RegExp(`${PREFIX}${HOUR_MIN}(?![\\d:])`, 'iu'),
  /(?<![\d:./-])(\d{1,2}):(\d{2})(?![\d:])/u,
]

const clock = (hour: string | undefined, minute: string | undefined): string | null => {
  const h = Number(hour)
  const m = Number(minute ?? '0')
  if (!hour || h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function parseTimeText(text: string): TimeText {
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text)
    if (!match) continue
    const startTime = clock(match[1], match[2])
    if (!startTime) continue
    const hasEnd = match[3] !== undefined
    const end = hasEnd ? clock(match[3], match[4]) : null
    if (hasEnd && !end) continue
    const title = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
      .replace(/\s+/g, ' ')
      .replace(/^[\s,:–-]+|[\s,:–-]+$/g, '')
    return end && end > startTime ? { title, startTime, endTime: end } : { title, startTime }
  }
  return { title: text }
}
