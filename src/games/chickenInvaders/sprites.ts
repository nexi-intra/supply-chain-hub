import { drawBackground } from './backgrounds'
import type { PickupKind } from './engine'
import type { MeteorType } from './hazards'
import { createRng } from './rng'
import { THEMES, mixHex, tintHen, type ThemeId } from './themes'
import { WEAPON_FAMILIES, type WeaponFamily } from './weapons'
import { BEAK, circle, drawHen, ellipse, FRAMES, halo, make, PALETTE, type Sprite } from './spriteKit'
import { drawMeteor, drawFireMeteor, drawIceMeteor, drawMetalMeteor, drawMetalCracks, drawGoldMeteor, drawComet } from './meteorSprites'
import {
  drawGift,
  drawWeaponIcon,
  drawDroneOrb,
  drawSlowmoOrb,
  drawMagnetOrb,
  drawDoubleOrb,
  drawLifeOrb,
  drawDrone,
  drawRocket,
  drawCoin,
  orb,
  drawDrumstick,
} from './pickupSprites'

export * from './spriteKit'
export { crackLines, strokeLines } from './meteorSprites'
export { getSpecialSprites, type SpecialSprites } from './specialSprites'

function drawHelmet(c: CanvasRenderingContext2D, hp: number, accent?: string) {
  c.save()
  if (hp <= 1) {
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(25, 0)
    c.lineTo(23, 6)
    c.lineTo(26, 9)
    c.lineTo(23, 13)
    c.lineTo(25, 20)
    c.lineTo(0, 20)
    c.closePath()
    c.clip()
  }
  const tone = (color: string, amount: number) => (accent ? mixHex(color, accent, amount) : color)
  const metal = c.createLinearGradient(14, 2, 34, 16)
  metal.addColorStop(0, tone('#e2e8f0', 0.15))
  metal.addColorStop(0.5, tone('#94a3b8', 0.18))
  metal.addColorStop(1, tone('#475569', 0.2))
  c.beginPath()
  c.arc(24, 13.5, 11.5, Math.PI, Math.PI * 2)
  c.closePath()
  c.fillStyle = metal
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 2
  c.stroke()
  c.beginPath()
  c.roundRect(11, 12, 26, 4, 2)
  c.fillStyle = '#64748b'
  c.fill()
  c.stroke()
  c.beginPath()
  c.moveTo(18, 5.5)
  c.quadraticCurveTo(21, 3, 25, 3)
  c.strokeStyle = 'rgba(255,255,255,0.7)'
  c.lineWidth = 1.4
  c.stroke()
  if (hp <= 2) {
    c.beginPath()
    c.moveTo(27, 3)
    c.lineTo(25.5, 6.5)
    c.lineTo(28, 8.5)
    c.lineTo(26, 12)
    c.moveTo(28, 8.5)
    c.lineTo(31, 9.5)
    c.strokeStyle = '#1e1b2e'
    c.lineWidth = 1.1
    c.stroke()
  }
  c.restore()
}

function drawGoggles(c: CanvasRenderingContext2D, strap = PALETTE.comb) {
  c.save()
  c.strokeStyle = '#3b2f5c'
  c.lineWidth = 2.2
  c.beginPath()
  c.moveTo(14, 13)
  c.lineTo(34, 13)
  c.stroke()
  for (const x of [20, 28]) {
    const lens = c.createRadialGradient(x - 1, 12, 0.5, x, 13, 4.5)
    lens.addColorStop(0, '#e0fbff')
    lens.addColorStop(0.5, PALETTE.plasma)
    lens.addColorStop(1, '#0e7490')
    circle(c, x, 13, 4.2)
    c.fillStyle = lens
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 1.6
    c.stroke()
  }
  c.beginPath()
  c.moveTo(17, 23)
  c.quadraticCurveTo(24, 26, 31, 23)
  c.strokeStyle = strap
  c.lineWidth = 3
  c.stroke()
  c.beginPath()
  c.moveTo(30, 24)
  c.quadraticCurveTo(36, 27, 38, 24)
  c.stroke()
  c.restore()
}

function drawChick(c: CanvasRenderingContext2D, wings: 'up' | 'down', scared: boolean) {
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.5
  for (const side of [-1, 1]) {
    ellipse(c, 14 + side * 9, wings === 'up' ? 13 : 18, 4, 2.6, side * (wings === 'up' ? -0.6 : 0.4))
    c.fillStyle = '#f5c400'
    c.fill()
    c.stroke()
  }
  const g = c.createRadialGradient(11, 12, 1, 14, 16, 11)
  g.addColorStop(0, '#fffbd0')
  g.addColorStop(0.5, '#fff06a')
  g.addColorStop(1, '#f5c400')
  circle(c, 14, 16, 9.5)
  c.fillStyle = g
  c.fill()
  c.stroke()
  c.beginPath()
  c.moveTo(13, 6.8)
  c.quadraticCurveTo(12, 3, 14.5, 3.5)
  c.moveTo(15, 6.8)
  c.quadraticCurveTo(17, 3.5, 18, 5)
  c.stroke()
  for (const x of [10.8, 17.2]) {
    circle(c, x, 13.5, scared ? 2.3 : 1.5)
    c.fillStyle = scared ? '#ffffff' : '#140d2e'
    c.fill()
    if (scared) {
      c.stroke()
      circle(c, x, 13.8, 0.8)
      c.fillStyle = '#140d2e'
      c.fill()
    }
  }
  c.beginPath()
  c.moveTo(12.3, 16.5)
  c.lineTo(15.7, 16.5)
  c.lineTo(14, scared ? 20 : 18.8)
  c.closePath()
  c.fillStyle = BEAK
  c.fill()
  c.lineWidth = 1
  c.stroke()
}

/** Akkretionsskiven set lige oppefra; den trykkes flad og drejes, når den tegnes. */
function drawAccretionDisk(c: CanvasRenderingContext2D, size: number) {
  const center = size / 2
  const outer = size / 2 - 4
  const base = c.createRadialGradient(center, center, outer * 0.3, center, center, outer)
  base.addColorStop(0, 'rgba(255, 244, 214, 0)')
  base.addColorStop(0.08, 'rgba(255, 244, 214, 0.9)')
  base.addColorStop(0.25, 'rgba(255, 179, 71, 0.75)')
  base.addColorStop(0.55, 'rgba(244, 63, 133, 0.42)')
  base.addColorStop(0.8, 'rgba(124, 58, 237, 0.18)')
  base.addColorStop(1, 'rgba(124, 58, 237, 0)')
  circle(c, center, center, outer)
  c.fillStyle = base
  c.fill()
  const rng = createRng(4242)
  const colors = ['#fff4d6', '#ffd18a', '#ff9a4d', '#ff5a8a', '#c084fc']
  for (let i = 0; i < 150; i++) {
    const band = rng() ** 0.8
    const radius = outer * (0.34 + band * 0.62)
    const start = rng() * Math.PI * 2
    c.globalAlpha = (0.25 + rng() * 0.45) * (1 - band * 0.6)
    c.strokeStyle = colors[Math.min(colors.length - 1, Math.floor(band * colors.length))]
    c.lineWidth = 0.8 + rng() * 2.4
    c.beginPath()
    c.arc(center, center, radius, start, start + 0.3 + rng() * 1.1)
    c.stroke()
  }
  c.globalAlpha = 1
}

function drawShip(c: CanvasRenderingContext2D) {
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 2
  const hull = c.createLinearGradient(0, 2, 0, 54)
  hull.addColorStop(0, '#ffffff')
  hull.addColorStop(0.55, '#d6dcff')
  hull.addColorStop(1, '#8f9bd6')
  c.beginPath()
  c.moveTo(28, 2)
  c.lineTo(33, 16)
  c.lineTo(35, 30)
  c.lineTo(52, 42)
  c.lineTo(52, 48)
  c.lineTo(36, 46)
  c.lineTo(33, 54)
  c.lineTo(23, 54)
  c.lineTo(20, 46)
  c.lineTo(4, 48)
  c.lineTo(4, 42)
  c.lineTo(21, 30)
  c.lineTo(23, 16)
  c.closePath()
  c.fillStyle = hull
  c.fill()
  c.stroke()
  c.fillStyle = PALETTE.comb
  for (const side of [-1, 1]) {
    c.beginPath()
    c.moveTo(28 + side * 9, 37)
    c.lineTo(28 + side * 20, 44)
    c.lineTo(28 + side * 20, 46.5)
    c.lineTo(28 + side * 9, 41)
    c.closePath()
    c.fill()
    c.fillStyle = PALETTE.plasma
    c.fillRect(side < 0 ? 4 : 50, 40, 2, 8)
    c.fillStyle = PALETTE.comb
  }
  const cockpit = c.createLinearGradient(24, 14, 32, 30)
  cockpit.addColorStop(0, '#e0fbff')
  cockpit.addColorStop(0.45, PALETTE.plasma)
  cockpit.addColorStop(1, '#0e5a70')
  ellipse(c, 28, 22, 4.6, 8.5)
  c.fillStyle = cockpit
  c.fill()
  c.lineWidth = 1.5
  c.stroke()
  ellipse(c, 26.8, 19, 1.2, 3)
  c.fillStyle = 'rgba(255,255,255,0.85)'
  c.fill()
  c.fillStyle = '#475569'
  c.fillRect(22, 52, 4, 4)
  c.fillRect(30, 52, 4, 4)
}

export function drawEgg(c: CanvasRenderingContext2D) {
  const g = c.createRadialGradient(7, 8, 1, 9, 11, 10)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.6, '#fdf6e3')
  g.addColorStop(1, '#e6d6ad')
  ellipse(c, 9, 11, 7, 9)
  c.fillStyle = g
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.3
  c.stroke()
  c.fillStyle = 'rgba(176, 150, 100, 0.6)'
  for (const [x, y] of [[6, 13], [11, 9], [10, 15], [7.5, 8]]) {
    circle(c, x, y, 0.8)
    c.fill()
  }
}

const BACKGROUND_SCALE = 2
/** En baggrund fylder ca. 9 MB; vi beholder kun den aktuelle og den næste. */
const MAX_BACKGROUNDS = 2
const backgrounds = new Map<string, Sprite>()

/** Én forhåndstegnet baggrund pr. tema, bygget første gang temaet vises. */
export function getBackground(theme: ThemeId, width: number, height: number): Sprite {
  const key = `${theme}:${width}x${height}`
  let sprite = backgrounds.get(key)
  if (sprite) {
    if (backgrounds.size > 1) {
      backgrounds.delete(key)
      backgrounds.set(key, sprite)
    }
    return sprite
  }
  sprite = make(width, height, (c) => drawBackground(c, width, height, THEMES[theme]), BACKGROUND_SCALE)
  if (backgrounds.size >= MAX_BACKGROUNDS) backgrounds.delete(backgrounds.keys().next().value!)
  backgrounds.set(key, sprite)
  return sprite
}

export interface Sprites {
  hens: Sprite[][]
  divers: Sprite[]
  golden: Sprite[]
  helmets: Sprite[]
  chicks: Sprite[]
  meteorsLarge: Sprite[]
  meteorsSmall: Sprite[]
  /** Små og store udgaver pr. meteortype (metal, guld og komet har kun én størrelse). */
  meteors: Record<MeteorType, { small: Sprite[]; large: Sprite[] }>
  /** Revner i metalmeteoren: 0 = få, 2 = næsten knust. */
  metalCracks: Sprite[]
  accretionDisk: Sprite
  boss: Sprite[]
  ship: Sprite
  egg: Sprite
  bolt: Sprite
  ion: Sprite
  pellet: Sprite
  rocket: Sprite
  droneBolt: Sprite
  drone: Sprite
  pickups: Record<PickupKind, Sprite>
  /** Gaver i våbenfamiliens farve med familiens tegn. */
  gifts: Record<WeaponFamily, Sprite>
  weaponIcons: Record<WeaponFamily, Sprite>
}

const HEN_VARIANTS = [
  { body: PALETTE.feather, shade: '#e9c98f', belly: '#ffffff' },
  { body: '#ffffff', shade: '#cfc7e8', belly: '#fff4dc' },
  { body: '#ffe2b8', shade: '#d9a066', belly: '#fff4dc' },
]
const DIVER_LOOK = { body: '#ebe3ff', shade: '#a996e6', belly: '#ffffff' }
const GOLDEN_LOOK = { body: '#ffd447', shade: '#d98c00', belly: '#fff0b3' }

/** Henter alle sprites én gang; de deles af spillet og menuens marquee. */
let cached: Sprites | null = null

const henFrames = (look: { body: string; shade: string; belly: string; comb?: string }) =>
  FRAMES.map((frame) => make(48, 48, (c) => drawHen(c, { ...look, ...frame })))

export interface HenSprites {
  hens: Sprite[][]
  divers: Sprite[]
  helmets: Sprite[]
}

const themeHens = new Map<ThemeId, HenSprites>()

/** Høns, dykkere og hjelme i temaets toner; bygges første gang temaet vises. Hønsegården bruger de oprindelige. */
export function getHenSprites(theme: ThemeId): HenSprites {
  let sprites = themeHens.get(theme)
  if (sprites) return sprites
  if (theme === 'farm') {
    const base = getSprites()
    sprites = { hens: base.hens, divers: base.divers, helmets: base.helmets }
  } else {
    const accent = THEMES[theme].hen.accent
    sprites = {
      hens: HEN_VARIANTS.map((variant) => henFrames(tintHen(theme, variant))),
      divers: FRAMES.map((frame) => make(48, 48, (c) => {
        drawHen(c, { ...tintHen(theme, DIVER_LOOK), ...frame })
        drawGoggles(c, accent)
      })),
      helmets: [1, 2, 3].map((hp) => make(48, 48, (c) => drawHelmet(c, hp, accent))),
    }
  }
  themeHens.set(theme, sprites)
  return sprites
}

export function getSprites(): Sprites {
  if (cached) return cached

  cached = {
    hens: HEN_VARIANTS.map(henFrames),
    divers: FRAMES.map((frame) => make(48, 48, (c) => {
      drawHen(c, { ...DIVER_LOOK, ...frame })
      drawGoggles(c)
    })),
    golden: FRAMES.map((frame) => make(64, 64, (c) => {
      halo(c, 32, 32, 32, PALETTE.yolk, 0.55)
      c.translate(8, 8)
      drawHen(c, { ...GOLDEN_LOOK, ...frame })
    })),
    helmets: [1, 2, 3].map((hp) => make(48, 48, (c) => drawHelmet(c, hp))),
    chicks: FRAMES.map((frame) => make(28, 28, (c) => drawChick(c, frame.wings, frame.scared))),
    meteorsLarge: [11, 12].map((seed) => make(64, 64, (c) => drawMeteor(c, 64, seed))),
    meteorsSmall: [21, 22].map((seed) => make(32, 32, (c) => drawMeteor(c, 32, seed))),
    meteors: {
      rock: { small: [], large: [] },
      fire: {
        small: [31, 32].map((seed) => make(30, 30, (c) => drawFireMeteor(c, 30, seed))),
        large: [33, 34].map((seed) => make(54, 54, (c) => drawFireMeteor(c, 54, seed))),
      },
      ice: {
        small: [41, 42].map((seed) => make(28, 28, (c) => drawIceMeteor(c, 28, seed))),
        large: [43, 44].map((seed) => make(68, 68, (c) => drawIceMeteor(c, 68, seed))),
      },
      metal: { small: [51, 52].map((seed) => make(50, 50, (c) => drawMetalMeteor(c, 50, seed))), large: [] },
      gold: { small: [61, 62].map((seed) => make(40, 40, (c) => drawGoldMeteor(c, 40, seed))), large: [] },
      comet: { small: [71].map((seed) => make(32, 32, (c) => drawComet(c, 32, seed))), large: [] },
    },
    metalCracks: [0, 1, 2].map((level) => make(50, 50, (c) => drawMetalCracks(c, 50, level))),
    accretionDisk: make(260, 260, (c) => drawAccretionDisk(c, 260), 2),
    boss: [false, true].flatMap((angry) => (['up', 'down'] as const).map((wings) => make(240, 220, (c) => {
      const s = 4.4
      c.translate(120 - 24 * s, 9.5)
      c.scale(s, s)
      drawHen(c, { ...HEN_VARIANTS[0], wings, scared: false, angry, outline: 0.75 })
      c.lineWidth = 0.6
      c.strokeStyle = PALETTE.ink
      const plate = c.createLinearGradient(16, 26, 32, 40)
      plate.addColorStop(0, '#e2e8f0')
      plate.addColorStop(1, '#64748b')
      c.beginPath()
      c.roundRect(16.5, 27.5, 15, 11, 3)
      c.fillStyle = plate
      c.fill()
      c.stroke()
      c.fillStyle = PALETTE.plasma
      circle(c, 24, 33, 1.8)
      c.fill()
      c.fillStyle = '#94a3b8'
      for (const [x, y] of [[18.5, 29.5], [29.5, 29.5], [18.5, 36.5], [29.5, 36.5]]) {
        circle(c, x, y, 0.6)
        c.fill()
      }
      c.beginPath()
      c.moveTo(16.5, 6)
      c.lineTo(17.5, 0.5)
      c.lineTo(20.5, 3.5)
      c.lineTo(24, -0.8)
      c.lineTo(27.5, 3.5)
      c.lineTo(30.5, 0.5)
      c.lineTo(31.5, 6)
      c.closePath()
      const crown = c.createLinearGradient(0, -1, 0, 6)
      crown.addColorStop(0, '#fff3b0')
      crown.addColorStop(1, '#e8a317')
      c.fillStyle = crown
      c.fill()
      c.stroke()
      c.fillStyle = PALETTE.comb
      for (const x of [20.5, 24, 27.5]) {
        circle(c, x, 4.2, 0.9)
        c.fill()
      }
    }))),
    ship: make(56, 58, drawShip),
    egg: make(18, 22, drawEgg),
    bolt: make(12, 28, (c) => {
      halo(c, 6, 14, 14, PALETTE.plasma, 0.6)
      ellipse(c, 6, 14, 2.4, 10)
      c.fillStyle = '#ffffff'
      c.fill()
    }),
    ion: make(24, 48, (c) => {
      ellipse(c, 12, 24, 11, 24)
      c.fillStyle = 'rgba(53, 224, 240, 0.35)'
      c.fill()
      ellipse(c, 12, 24, 6, 22)
      c.fillStyle = 'rgba(165, 243, 252, 0.8)'
      c.fill()
      ellipse(c, 12, 24, 2.8, 21)
      c.fillStyle = '#ffffff'
      c.fill()
    }),
    pellet: make(14, 24, (c) => {
      halo(c, 7, 9, 9, '#fb923c', 0.85)
      // En lille glødende fjer: spids foran, fanen spreder sig bagud.
      c.beginPath()
      c.moveTo(7, 2)
      c.quadraticCurveTo(11, 10, 8.4, 21)
      c.lineTo(5.6, 21)
      c.quadraticCurveTo(3, 10, 7, 2)
      c.closePath()
      const vane = c.createLinearGradient(0, 2, 0, 21)
      vane.addColorStop(0, '#fffbeb')
      vane.addColorStop(0.45, '#fdba74')
      vane.addColorStop(1, 'rgba(234, 88, 12, 0)')
      c.fillStyle = vane
      c.fill()
      c.strokeStyle = 'rgba(255, 251, 235, 0.9)'
      c.lineWidth = 0.8
      c.beginPath()
      c.moveTo(7, 3)
      c.lineTo(7, 20)
      c.stroke()
    }),
    rocket: make(12, 22, drawRocket),
    droneBolt: make(8, 16, (c) => {
      halo(c, 4, 8, 8, PALETTE.plasma, 0.7)
      ellipse(c, 4, 8, 1.6, 5.5)
      c.fillStyle = '#e0fbff'
      c.fill()
    }),
    drone: make(30, 24, drawDrone),
    gifts: Object.fromEntries(WEAPON_FAMILIES.map((family) => [family, make(36, 36, (c) => drawGift(c, family))])) as Record<WeaponFamily, Sprite>,
    weaponIcons: Object.fromEntries(WEAPON_FAMILIES.map((family) => [family, make(26, 26, (c) => drawWeaponIcon(c, family))])) as Record<WeaponFamily, Sprite>,
    pickups: {
      gift: make(36, 36, (c) => drawGift(c)),
      drone: make(36, 36, drawDroneOrb),
      slowmo: make(36, 36, drawSlowmoOrb),
      magnet: make(36, 36, drawMagnetOrb),
      double: make(36, 36, drawDoubleOrb),
      life: make(36, 36, drawLifeOrb),
      shield: make(36, 36, (c) => {
        orb(c, '#bfdbfe', '#1d4ed8', '#60a5fa')
        c.beginPath()
        c.moveTo(18, 11)
        c.lineTo(24, 13.5)
        c.quadraticCurveTo(24, 22, 18, 25.5)
        c.quadraticCurveTo(12, 22, 12, 13.5)
        c.closePath()
        c.stroke()
      }),
      coolant: make(36, 36, (c) => {
        orb(c, '#e0fbff', '#0891b2', PALETTE.plasma)
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI) / 3
          c.beginPath()
          c.moveTo(18 - Math.cos(a) * 7, 18 - Math.sin(a) * 7)
          c.lineTo(18 + Math.cos(a) * 7, 18 + Math.sin(a) * 7)
          c.stroke()
        }
      }),
      missile: make(36, 36, (c) => {
        orb(c, '#fed7aa', '#c2410c', '#fb923c')
        c.beginPath()
        c.moveTo(18, 10)
        c.quadraticCurveTo(22, 14, 21, 22)
        c.lineTo(23.5, 26)
        c.lineTo(12.5, 26)
        c.lineTo(15, 22)
        c.quadraticCurveTo(14, 14, 18, 10)
        c.closePath()
        c.fill()
      }),
      drumstick: make(30, 30, drawDrumstick),
      coin: make(28, 28, drawCoin),
    },
  }
  const { meteors } = cached
  meteors.rock = { small: cached.meteorsSmall, large: cached.meteorsLarge }
  for (const type of ['metal', 'gold', 'comet'] as const) meteors[type].large = meteors[type].small
  return cached
}
