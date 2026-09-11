/// Virtualized row rendering for large schedules
/// Instead of rendering all 30 rows at once, only render visible + buffer rows
/// This reduces DOM node count from ~450 to ~50-100

export function createVirtualizedRows(
  startRow: number,
  visibleCount: number,
  bufferRows: number = 5
) {
  return {
    startRow,
    endRow: startRow + visibleCount + bufferRows,
    visibleStartRow: Math.max(0, startRow - bufferRows),
    visibleEndRow: Math.min(30, startRow + visibleCount + bufferRows),
    isRowVisible: (rowIndex: number) => {
      return rowIndex >= startRow && rowIndex < startRow + visibleCount
    },
    getRowOffset: (rowIndex: number, rowHeight: number) => {
      return rowIndex * rowHeight
    }
  }
}

/**
 * Simple scroll-based row virtualization helper.
 * Pass containerHeight and estimate the number of visible rows.
 * Typical row height: 60px for shift schedule cells
 */
export function calculateVirtualRange(
  scrollTop: number,
  containerHeight: number,
  rowHeight: number = 60,
  bufferRows: number = 5,
  totalRows: number = 30
) {
  const visibleCount = Math.ceil(containerHeight / rowHeight) + 1
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferRows)
  const endRow = Math.min(totalRows, startRow + visibleCount + bufferRows * 2)

  return {
    startRow,
    endRow,
    visibleStartRow: startRow,
    visibleEndRow: endRow,
    totalVisible: endRow - startRow,
    offsetPx: startRow * rowHeight
  }
}
