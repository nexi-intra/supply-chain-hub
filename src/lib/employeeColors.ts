const colorPalette = [
  { bg: 'oklch(0.60 0.24 340)', text: 'oklch(0.98 0.015 320)', name: 'Magenta' },
  { bg: 'oklch(0.55 0.26 270)', text: 'oklch(0.98 0.015 320)', name: 'Lilla' },
  { bg: 'oklch(0.58 0.25 230)', text: 'oklch(0.98 0.015 320)', name: 'Kongeblå' },
  { bg: 'oklch(0.65 0.22 200)', text: 'oklch(0.98 0.015 320)', name: 'Azurblå' },
  { bg: 'oklch(0.68 0.20 180)', text: 'oklch(0.12 0.04 280)', name: 'Cyan' },
  { bg: 'oklch(0.62 0.21 165)', text: 'oklch(0.98 0.015 320)', name: 'Teal' },
  { bg: 'oklch(0.58 0.22 150)', text: 'oklch(0.98 0.015 320)', name: 'Smaragd' },
  { bg: 'oklch(0.65 0.23 135)', text: 'oklch(0.12 0.04 280)', name: 'Græsgrøn' },
  { bg: 'oklch(0.72 0.20 115)', text: 'oklch(0.12 0.04 280)', name: 'Lime' },
  { bg: 'oklch(0.75 0.18 95)', text: 'oklch(0.12 0.04 280)', name: 'Citron' },
  { bg: 'oklch(0.70 0.20 60)', text: 'oklch(0.12 0.04 280)', name: 'Gylden' },
  { bg: 'oklch(0.65 0.22 35)', text: 'oklch(0.98 0.015 320)', name: 'Orange' },
  { bg: 'oklch(0.60 0.24 20)', text: 'oklch(0.98 0.015 320)', name: 'Rød' },
  { bg: 'oklch(0.58 0.23 355)', text: 'oklch(0.98 0.015 320)', name: 'Rose' },
  { bg: 'oklch(0.52 0.22 290)', text: 'oklch(0.98 0.015 320)', name: 'Dyb Lilla' },
  { bg: 'oklch(0.70 0.16 320)', text: 'oklch(0.98 0.015 320)', name: 'Pink' },
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export type EmployeeColor = { bg: string; text: string; name: string }

/** Manuelle farve-overstyringer sat af en manager: normaliseret email -> palette-indeks. */
export type EmployeeColorOverrides = Record<string, number>

/** KV-nøgle hvor manager-farveoverstyringer gemmes (delt, læsbar af alle). */
export const EMPLOYEE_COLOR_OVERRIDES_KEY = 'employee-color-overrides'

/** Hele farvepaletten, så manager-panelet kan vise valgmulighederne. */
export const EMPLOYEE_COLOR_PALETTE: EmployeeColor[] = colorPalette

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function getEmployeeColor(employeeId: string): EmployeeColor {
  const hash = hashString(employeeId)
  const index = hash % colorPalette.length
  return colorPalette[index]
}

export function getEmployeeColorByEmail(email: string, overrides?: EmployeeColorOverrides): EmployeeColor {
  const overrideIndex = overrides?.[normalizeEmail(email)]
  if (typeof overrideIndex === 'number' && overrideIndex >= 0 && overrideIndex < colorPalette.length) {
    return colorPalette[overrideIndex]
  }
  return getEmployeeColor(email)
}

export function getEmployeeColorByName(name: string): EmployeeColor {
  return getEmployeeColor(name)
}
