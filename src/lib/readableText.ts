/**
 * Vaelger en laesbar tekstfarve oven paa en vilkaarlig baggrundsfarve.
 *
 * Baggrundene her er ikke vores egne: en manager vaelger selv farven paa en
 * rolle i vagtplanen, og den farve bliver brugt som baggrund bag initialer og
 * smaa maerkater. Tidligere stod der bare "text-white", hvilket gav 2,8:1 paa
 * de lyse farver i paletten - under WCAG AA. Her regner vi i stedet efter.
 */

const BLACK = 'oklch(0.14 0.03 274)'
const WHITE = 'oklch(0.99 0 0)'

/** Relativ luminans (WCAG) for en sRGB-kanaltrippel i 0-255. */
function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Luminans for en farvestreng, eller null hvis vi ikke kan laese den.
 * Vi daekker de former der faktisk optraeder i appen: oklch(), hex og rgb().
 */
export function colorLuminance(color: string): number | null {
  const value = color.trim().toLowerCase()

  const oklch = value.match(/^oklch\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+(-?[\d.]+)/)
  if (oklch) {
    const num = (raw: string, percentOf: number) =>
      raw.endsWith('%') ? (parseFloat(raw) / 100) * percentOf : parseFloat(raw)
    const lightness = num(oklch[1], 1)
    const chroma = num(oklch[2], 0.4)
    const hue = parseFloat(oklch[3])
    if (![lightness, chroma, hue].every(Number.isFinite)) return null

    // Oklab -> lineaer sRGB. Maetningen betyder noget: en kraftig blaaviolet
    // med samme L som en bleg okker har langt lavere luminans, og det er
    // netop forskellen paa om hvid eller sort tekst kan laeses.
    const radians = (hue * Math.PI) / 180
    const a = chroma * Math.cos(radians)
    const b = chroma * Math.sin(radians)

    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3

    const clamp = (x: number) => Math.min(1, Math.max(0, x))
    const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)

    // Vaerdierne er allerede lineaere, saa WCAG-vaegtningen kan bruges direkte.
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const digits = hex[1]
    const full = digits.length === 3 ? digits.split('').map(d => d + d).join('') : digits
    return relativeLuminance(
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    )
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (rgb) {
    return relativeLuminance(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]))
  }

  return null
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Returnerer den af vores to tekstfarver der giver bedst kontrast paa
 * baggrunden. Kan farven ikke laeses, falder vi tilbage til hvid - saa ser
 * det ud som foer i stedet for at knaekke.
 */
export function readableTextOn(background: string): string {
  const bg = colorLuminance(background)
  if (bg === null) return WHITE
  const onBlack = contrast(bg, colorLuminance(BLACK) as number)
  const onWhite = contrast(bg, colorLuminance(WHITE) as number)
  return onBlack >= onWhite ? BLACK : WHITE
}
