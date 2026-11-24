export const THEME_IDS = ['farm', 'asteroids', 'ice', 'volcano', 'mothership'] as const
export type ThemeId = (typeof THEME_IDS)[number]

/** Hvilken stor kulisse temaet tegner foran himlen. */
export type ThemeFeature = 'ringedPlanet' | 'asteroidBelt' | 'icePlanet' | 'lavaMoon' | 'hull'

export interface ThemeHalo {
  x: number
  y: number
  r: number
  color: string
  alpha: number
}

export interface ThemePalette {
  /** Nøgle til labels.themeName. */
  nameKey: ThemeId
  feature: ThemeFeature
  skyStops: [number, string][]
  halos: ThemeHalo[]
  planet: { inner: string; mid: string; outer: string; rim: string; accent: string }
  starTint: string
  /** Hønsenes dæmpede grundtone og kamfarve; hønsegården bevarer de oprindelige farver. */
  hen: { tint: string; accent: string }
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  farm: {
    nameKey: 'farm',
    feature: 'ringedPlanet',
    skyStops: [[0, '#120c2b'], [0.55, '#1b1042'], [1, '#0a0718']],
    halos: [
      { x: 170, y: 120, r: 330, color: '#7c3aed', alpha: 0.22 },
      { x: 790, y: 400, r: 360, color: '#0ea5e9', alpha: 0.13 },
      { x: 620, y: 70, r: 220, color: '#ef3b4f', alpha: 0.09 },
      { x: 300, y: 520, r: 260, color: '#ffc93c', alpha: 0.05 },
    ],
    planet: { inner: '#5b47a8', mid: '#2c2064', outer: '#140d33', rim: '#35e0f0', accent: '#ffc93c' },
    starTint: '#ffffff',
    hen: { tint: '#fff4dc', accent: '#ef3b4f' },
  },
  asteroids: {
    nameKey: 'asteroids',
    feature: 'asteroidBelt',
    skyStops: [[0, '#1c1008'], [0.55, '#2d1a0c'], [1, '#0b0603']],
    halos: [
      { x: 200, y: 140, r: 340, color: '#d97706', alpha: 0.2 },
      { x: 820, y: 330, r: 330, color: '#b45309', alpha: 0.16 },
      { x: 520, y: 560, r: 300, color: '#92400e', alpha: 0.14 },
      { x: 640, y: 60, r: 200, color: '#fbbf24', alpha: 0.07 },
    ],
    planet: { inner: '#a98462', mid: '#6b4d36', outer: '#2b1d14', rim: '#fbbf24', accent: '#f59e0b' },
    starTint: '#ffe8c2',
    hen: { tint: '#ffe2b8', accent: '#d97706' },
  },
  ice: {
    nameKey: 'ice',
    feature: 'icePlanet',
    skyStops: [[0, '#04142a'], [0.55, '#0a2a47'], [1, '#030d1b']],
    halos: [
      { x: 180, y: 110, r: 320, color: '#22d3ee', alpha: 0.18 },
      { x: 780, y: 420, r: 360, color: '#38bdf8', alpha: 0.16 },
      { x: 480, y: 40, r: 260, color: '#34d399', alpha: 0.1 },
      { x: 300, y: 540, r: 240, color: '#e0f2fe', alpha: 0.05 },
    ],
    planet: { inner: '#f0fbff', mid: '#8fd4ec', outer: '#2a6f93', rim: '#e0f7ff', accent: '#67e8f9' },
    starTint: '#d6f3ff',
    hen: { tint: '#e0f2fe', accent: '#38bdf8' },
  },
  volcano: {
    nameKey: 'volcano',
    feature: 'lavaMoon',
    skyStops: [[0, '#1d0505'], [0.55, '#350b08'], [1, '#0a0202']],
    halos: [
      { x: 160, y: 130, r: 330, color: '#dc2626', alpha: 0.2 },
      { x: 800, y: 380, r: 380, color: '#ea580c', alpha: 0.2 },
      { x: 560, y: 80, r: 220, color: '#f97316', alpha: 0.08 },
      { x: 330, y: 540, r: 280, color: '#fbbf24', alpha: 0.06 },
    ],
    planet: { inner: '#4a2a22', mid: '#241210', outer: '#0e0605', rim: '#ff5a1f', accent: '#ffb347' },
    starTint: '#ffd9bf',
    hen: { tint: '#ffd2b0', accent: '#f97316' },
  },
  mothership: {
    nameKey: 'mothership',
    feature: 'hull',
    skyStops: [[0, '#06130e'], [0.55, '#0c2219'], [1, '#030a07']],
    halos: [
      { x: 200, y: 150, r: 320, color: '#22c55e', alpha: 0.13 },
      { x: 780, y: 420, r: 340, color: '#16a34a', alpha: 0.12 },
      { x: 520, y: 70, r: 230, color: '#a3e635', alpha: 0.07 },
      { x: 330, y: 540, r: 260, color: '#64748b', alpha: 0.08 },
    ],
    planet: { inner: '#7b8a86', mid: '#3c4a46', outer: '#141c19', rim: '#86efac', accent: '#4ade80' },
    starTint: '#d4ffe6',
    hen: { tint: '#dcfce7', accent: '#4ade80' },
  },
}

const channel = (color: string, index: number) => parseInt(color.slice(1 + index * 2, 3 + index * 2), 16)

export function mixHex(from: string, to: string, amount: number): string {
  const part = (index: number) => Math.round(channel(from, index) * (1 - amount) + channel(to, index) * amount).toString(16).padStart(2, '0')
  return `#${part(0)}${part(1)}${part(2)}`
}

export interface HenColors {
  body: string
  shade: string
  belly: string
}

/** Skubber en hønsefarve diskret mod temaets tone og giver kammen temaets accent. */
export function tintHen(theme: ThemeId, look: HenColors): HenColors & { comb: string } {
  const { tint, accent } = THEMES[theme].hen
  if (theme === 'farm') return { ...look, comb: accent }
  return {
    body: mixHex(look.body, tint, 0.5),
    shade: mixHex(look.shade, accent, 0.28),
    belly: mixHex(look.belly, tint, 0.5),
    comb: accent,
  }
}
