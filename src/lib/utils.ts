import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Kollisionssikkert ID (timestamp + tilfældigt suffiks) — brug ALTID denne frem for rå Date.now() i loops. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Giver kontrollen tilbage til browserens event loop et øjeblik, så UI'et (klik, scroll, animationer) forbliver responsivt under tunge synkrone loops. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

let particleIdCounter = 0
/** Monotont stigende numerisk id til kortlivede visuelle elementer (partikler, projektiler i spillene) — undgår kollisioner fra `Date.now() + Math.random()` når flere spawner i samme millisekund. */
export function nextParticleId(): number {
  particleIdCounter += 1
  return particleIdCounter
}
