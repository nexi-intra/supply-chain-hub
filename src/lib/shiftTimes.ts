// Optional clock times on shifts: a role default and a per-shift (or per-pattern) time. The most specific wins.

export interface ShiftTime {
  /** 'HH:mm' */
  startTime?: string
  /** 'HH:mm', only together with startTime and after it. */
  endTime?: string
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const isTime = (value: string | undefined): value is string => typeof value === 'string' && TIME.test(value)

/** Danish message for the shift schedule form, or null when the pair can be saved. */
export function shiftTimeError(start: string, end: string): string | null {
  const from = start.trim()
  const to = end.trim()
  if ((from && !isTime(from)) || (to && !isTime(to))) return 'Ugyldigt klokkeslæt'
  if (to && !from) return 'Angiv en starttid, før du angiver en sluttid'
  if (from && to && to <= from) return 'Sluttiden skal ligge efter starttiden'
  return null
}

export function toShiftTime(start: string, end: string): ShiftTime {
  return { startTime: start.trim() || undefined, endTime: end.trim() || undefined }
}

const valid = (time: ShiftTime | undefined): ShiftTime | null => {
  if (!isTime(time?.startTime)) return null
  return { startTime: time.startTime, endTime: isTime(time.endTime) && time.endTime > time.startTime ? time.endTime : undefined }
}

/** The time that applies to a shift: its own, else the role default, else none (all day). */
export function resolveShiftTime(own: ShiftTime | undefined, role: ShiftTime | undefined): ShiftTime | null {
  return valid(own) ?? valid(role)
}

export function formatShiftTime(time: ShiftTime | null | undefined): string {
  if (!time?.startTime) return ''
  return time.endTime ? `${time.startTime}–${time.endTime}` : time.startTime
}
