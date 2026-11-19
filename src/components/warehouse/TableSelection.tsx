import { useEffect, useRef, useState } from 'react'
import { Copy, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/warehouse/text'

const ATTR = 'data-cell-selected'
const INTERACTIVE = 'input, button, select, textarea, a, label, summary, [role="button"], [role="radio"], [role="checkbox"], [contenteditable="true"]'

interface Point { row: number; col: number }

function cellOf(target: EventTarget | null): HTMLTableCellElement | null {
  if (!(target instanceof Element) || target.closest(INTERACTIVE)) return null
  const cell = target.closest('td')
  return cell?.closest('tbody') ? cell : null
}

const pointOf = (cell: HTMLTableCellElement): Point => ({ row: (cell.parentElement as HTMLTableRowElement).sectionRowIndex, col: cell.cellIndex })
const textOf = (cell: HTMLTableCellElement) => cell.innerText.replace(/\s*\n\s*/g, ' ').trim()

/** Column selection in every table: drag down a column (or a block), Ctrl+C copies only those cells, one row per line. */
export function TableSelection() {
  const [count, setCount] = useState(0)
  const copyRef = useRef<() => void>(() => {})
  const clearRef = useRef<() => void>(() => {})

  useEffect(() => {
    let body: HTMLTableSectionElement | null = null
    let start: Point | null = null
    let end: Point | null = null
    let dragging = false
    let grid: HTMLTableCellElement[][] = []

    const clear = () => {
      for (const cell of grid.flat()) cell.removeAttribute(ATTR)
      grid = []
      body = null
      start = end = null
      setCount(0)
    }

    const paint = () => {
      for (const cell of grid.flat()) cell.removeAttribute(ATTR)
      grid = []
      if (!body || !start || !end) return
      const [r1, r2] = [Math.min(start.row, end.row), Math.max(start.row, end.row)]
      const [c1, c2] = [Math.min(start.col, end.col), Math.max(start.col, end.col)]
      for (let r = r1; r <= r2; r++) {
        const row = body.rows[r]
        if (!row) continue
        const cells: HTMLTableCellElement[] = []
        for (let c = c1; c <= c2; c++) {
          const cell = row.cells[c]
          if (!cell) continue
          cell.setAttribute(ATTR, '')
          cells.push(cell)
        }
        if (cells.length) grid.push(cells)
      }
      setCount(grid.reduce((sum, cells) => sum + cells.length, 0))
    }

    const copy = () => {
      const rows = grid.filter(cells => cells.every(cell => cell.isConnected))
      if (!rows.length) { clear(); return }
      const text = rows.map(cells => cells.map(textOf).join('\t')).join('\r\n')
      const cells = rows.reduce((sum, row) => sum + row.length, 0)
      window.electronWarehouse!.app.copyText(text)
        .then(() => toast.success(t(`${cells} ${cells === 1 ? 'celle' : 'celler'} kopieret`, `${cells} ${cells === 1 ? 'cell' : 'cells'} copied`)))
        .catch(() => toast.error(t('Kunne ikke kopiere til udklipsholderen', 'Could not copy to the clipboard')))
    }
    copyRef.current = copy
    clearRef.current = clear

    const onDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      const cell = cellOf(event.target)
      if (!cell) {
        if (!(event.target instanceof Element && event.target.closest('[data-table-selection-bar]'))) { if (grid.length) clear() }
        return
      }
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      const section = cell.closest('tbody')!
      if (event.shiftKey && body === section && start) end = pointOf(cell)
      else { body = section; start = end = pointOf(cell) }
      dragging = true
      paint()
    }
    const onMove = (event: MouseEvent) => {
      if (!dragging) return
      const cell = cellOf(event.target)
      if (!cell || cell.closest('tbody') !== body) return
      const point = pointOf(cell)
      if (end && point.row === end.row && point.col === end.col) return
      end = point
      paint()
    }
    const onUp = () => { dragging = false }
    const onKey = (event: KeyboardEvent) => {
      if (!grid.length) return
      if (event.key === 'Escape') { clear(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        const active = document.activeElement
        if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && (active.selectionEnd ?? 0) > (active.selectionStart ?? 0)) return
        if (window.getSelection()?.toString()) return
        event.preventDefault()
        copy()
      }
    }
    // Rows disappear when the view changes or the list is filtered: drop a selection that is gone.
    const timer = window.setInterval(() => { if (grid.length && !grid.some(cells => cells.some(cell => cell.isConnected))) clear() }, 1000)

    document.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keydown', onKey)
      window.clearInterval(timer)
    }
  }, [])

  if (!count) return null
  return (
    <div data-table-selection-bar className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-background/95 px-4 py-2 text-sm shadow-lg backdrop-blur">
      <span><strong className="tabular-nums">{count}</strong> {count === 1 ? t('celle markeret', 'cell selected') : t('celler markeret', 'cells selected')} · {t('Ctrl+C kopierer', 'Ctrl+C copies')}</span>
      <Button size="sm" className="h-7 rounded-full px-3" onClick={() => copyRef.current()}><Copy size={14} /> {t('Kopiér', 'Copy')}</Button>
      <Button size="icon" variant="ghost" className="size-7 rounded-full" onClick={() => clearRef.current()} aria-label={t('Fjern markering', 'Clear selection')}><X size={14} /></Button>
    </div>
  )
}
