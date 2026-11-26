import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { backendText } from '@/lib/warehouse/finlandText'
import { t } from '@/lib/warehouse/text'
import type { FinlandSnapshot } from '@/types/finland'

export type NoticeTone = 'success' | 'error' | 'info'
export interface Notice { tone: NoticeTone; lines: string[] }

/** What the tool is doing; the buttons that would start something else wait meanwhile. */
export type Working = null | 'load' | 'sheet' | 'write' | 'fix' | 'mark' | 'restore' | 'delete' | 'manual' | 'followup'

/**
 * The write's warnings (e.g. rows written but not logged on M:), then the Danish lines on how the sheet was opened after
 * the first ("Arket er åbent i Excel"), as Finland T&T shows them.
 */
export const sheetNotes = (snapshot: FinlandSnapshot) => [
  ...(snapshot.warnings ?? []).map(backendText),
  ...(snapshot.sheet && snapshot.sheet.texts.length > 1 ? snapshot.sheet.texts.slice(1).map(backendText) : []),
]

const TAG: Record<string, string> = {
  DHL: 'bg-[#ffcc00] text-[#b0141a]',
  POSTNORD: 'bg-[#00a0d6] text-white',
  DSV: 'bg-[#002664] text-white',
}

export function CourierTag({ courier }: { courier: string }) {
  return <span className={cn('inline-block rounded px-2 py-0.5 text-[11.5px] font-bold', TAG[String(courier).toUpperCase()] ?? 'bg-muted text-muted-foreground')}>{courier}</span>
}

const NOTICE: Record<NoticeTone, string> = {
  success: 'border-ok/35 bg-ok-surface',
  error: 'border-destructive/40 bg-destructive/5 text-destructive',
  info: 'border-border bg-muted/50',
}

export function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <div role={notice.tone === 'error' ? 'alert' : 'status'} className={cn('space-y-1 rounded-lg border px-4 py-3 text-sm', NOTICE[notice.tone])}>
      {notice.lines.map((line, index) => <p key={index}>{line}</p>)}
    </div>
  )
}

/** A table of parcels with the sheet's column names, as in the sheet. */
export function ParcelTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>{head.map((label, index) => <th key={index} className="px-3 py-2 font-medium">{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  )
}

export const PARCEL_HEAD = ['Delivery', 'Order type', 'Postal code', 'Courier', 'T&T']

export function GroupTitle({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      {title}
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
    </h3>
  )
}

/** "kl. 14.05" for a time today, otherwise with the day and month. */
export function writtenAt(at: number, now: Date = new Date()): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const da = `kl. ${pad(d.getHours())}.${pad(d.getMinutes())}`
  const en = `at ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return sameDay ? t(da, en) : t(`${d.getDate()}.${d.getMonth() + 1} ${da}`, `on ${d.getDate()}/${d.getMonth() + 1} ${en}`)
}
