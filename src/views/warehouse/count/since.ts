import { formatDateTime, formatTime } from '@/lib/warehouse/format'
import { t } from '@/lib/warehouse/text'

/** "10:42" today, otherwise with the date: a lock can be idle since Friday. */
export function sinceTime(ms: number, today = Date.now()): string {
  return new Date(ms).toDateString() === new Date(today).toDateString() ? formatTime(ms) : formatDateTime(ms)
}

/** Danish genitive: "Bos", but "Lars'". */
const genitive = (name: string) => (/[sxz]$/i.test(name) ? `${name}'` : `${name}s`)

/** "Bos PC har ikke sendt siden 10:42": the PC may still hold scans that are not on M:. */
export function unsentPcText(pc: { name: string; since: number }, today = Date.now()): string {
  const when = sinceTime(pc.since, today)
  return t(`${genitive(pc.name)} PC har ikke sendt siden ${when}`, `${pc.name}'s PC has not sent since ${when}`)
}

export const unsentHint = () => t('Scanninger derfra kan mangle i tallene.', 'Scans from there may be missing from the figures.')
