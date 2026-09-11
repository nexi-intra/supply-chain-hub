import { useEffect, useRef, useState } from 'react'
import { calculateVirtualRange } from '@/lib/virtualizeHelper'

interface VirtualizedTableProps<T> {
  rows: T[]
  rowHeight: number
  containerHeight: number
  renderRow: (row: T, index: number) => React.ReactNode
  renderHeader: () => React.ReactNode
  bufferRows?: number
  onScroll?: (scrollTop: number) => void
}

/**
 * Virtualized table component that renders only visible rows.
 * Reduces DOM nodes from O(rows × cols) to O(visible rows × cols).
 * 
 * Example: 30 days × 15 employees = 450 cells → ~100 cells visible
 */
export function VirtualizedTable<T>({
  rows,
  rowHeight,
  containerHeight,
  renderRow,
  renderHeader,
  bufferRows = 5,
  onScroll
}: VirtualizedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [localContainerHeight, setLocalContainerHeight] = useState(containerHeight)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const top = container.scrollTop
      setScrollTop(top)
      onScroll?.(top)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [onScroll])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      setLocalContainerHeight(container.clientHeight)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const virt = calculateVirtualRange(
    scrollTop,
    localContainerHeight,
    rowHeight,
    bufferRows,
    rows.length
  )

  const visibleRows = rows.slice(virt.startRow, virt.endRow)
  const topPaddingHeight = virt.startRow * rowHeight
  const bottomPaddingHeight = (rows.length - virt.endRow) * rowHeight

  return (
    <div
      ref={containerRef}
      className="overflow-auto relative"
      style={{
        maxHeight: containerHeight,
        maxWidth: '100%'
      }}
    >
      <div style={{ height: topPaddingHeight }}></div>
      <div>
        {renderHeader()}
        {visibleRows.map((row, idx) => renderRow(row, virt.startRow + idx))}
      </div>
      <div style={{ height: bottomPaddingHeight }}></div>
    </div>
  )
}
