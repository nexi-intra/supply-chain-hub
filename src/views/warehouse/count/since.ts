import { formatDateTime, formatTime } from '@/lib/warehouse/format'

/** "10:42" today, otherwise with the date: a lock can be idle since Friday. */
export function sinceTime(ms: number, today = Date.now()): string {
  return new Date(ms).toDateString() === new Date(today).toDateString() ? formatTime(ms) : formatDateTime(ms)
}
