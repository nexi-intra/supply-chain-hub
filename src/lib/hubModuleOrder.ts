/** Columns of the Hub's module grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) at a window width. */
export function moduleGridColumns(width: number): number {
  return width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1
}

/**
 * Puts the module `id` first in the last row of a grid with `columns` columns, i.e. in the bottom-left corner,
 * whatever number of modules the user sees (Lagerstyring and Manager are not shown to everyone).
 */
export function withModuleInCorner<T extends { id: string }>(modules: readonly T[], id: string, columns: number): T[] {
  const corner = modules.find(module => module.id === id)
  if (!corner) return [...modules]
  const others = modules.filter(module => module !== corner)
  const lastRowStart = Math.floor(others.length / Math.max(1, columns)) * Math.max(1, columns)
  return [...others.slice(0, lastRowStart), corner, ...others.slice(lastRowStart)]
}
