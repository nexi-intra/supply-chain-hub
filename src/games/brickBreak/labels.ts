import type { Difficulty } from './config'
import type { PowerKind } from './engine'
import type { Language } from '@/lib/translations'

type Lang = Language

export interface PrismLabels {
  locale: string
  points: (value: number) => string
  level: (level: number) => string
  levelCleared: string
  perfectLevel: string
  lifeLost: string
  extraLife: string
  shieldHeld: string
  chainReaction: string
  serveHint: string
  powers: Record<PowerKind, string>
  hud: { score: string; level: string; lives: string; chain: string }
  menu: {
    title: string
    tagline: string
    difficultyDetail: Record<Difficulty, string>
    controls: { move: string; launch: string; pause: string; mouse: string }
    spaceKey: string
    mouseKey: string
  }
  stats: { level: string; destroyed: string; returns: string; bestChain: string; perfect: string }
}

interface LabelText extends Omit<PrismLabels, 'points' | 'level'> {
  levelWord: string
}

const TEXT: Record<Lang, LabelText> = {
  da: {
    locale: 'da-DK',
    levelWord: 'Vindue',
    levelCleared: 'Vindue knust',
    perfectLevel: 'Perfekt vindue!',
    lifeLost: 'Bolden er tabt',
    extraLife: '+1 liv',
    shieldHeld: 'Skjoldet holdt!',
    chainReaction: 'Kædereaktion!',
    serveHint: 'Mellemrum eller klik for at affyre',
    powers: { wide: 'Bred prisme', multiball: 'Tre bolde', fireball: 'Ildkugle', laser: 'Laser', magnet: 'Magnet', slow: 'Langsom tid', shield: 'Skjold', life: '+1 liv' },
    hud: { score: 'Point', level: 'Vindue', lives: 'Liv', chain: 'Kæde' },
    menu: {
      title: 'Prism Break',
      tagline: 'Knus glasmosaikkerne, saml lyset og hold bolden i luften. Hvert vindue er sværere end det forrige.',
      difficultyDetail: { easy: 'Rolig bold, bred prisme', medium: 'Det klassiske tempo', hard: 'Hurtig bold, smal prisme', expert: 'Kun for glasmestre' },
      controls: { move: 'Flyt', launch: 'Affyr og skyd', pause: 'Pause', mouse: 'Styr og affyr' },
      spaceKey: 'Mellemrum',
      mouseKey: 'Mus',
    },
    stats: { level: 'Vindue', destroyed: 'Knuste ruder', returns: 'Redninger', bestChain: 'Længste kæde', perfect: 'Perfekte vinduer' },
  },
  en: {
    locale: 'en-GB',
    levelWord: 'Window',
    levelCleared: 'Window smashed',
    perfectLevel: 'Perfect window!',
    lifeLost: 'Ball lost',
    extraLife: '+1 life',
    shieldHeld: 'Shield held!',
    chainReaction: 'Chain reaction!',
    serveHint: 'Space or click to launch',
    powers: { wide: 'Wide prism', multiball: 'Triple ball', fireball: 'Fireball', laser: 'Laser', magnet: 'Magnet', slow: 'Slow time', shield: 'Shield', life: '+1 life' },
    hud: { score: 'Score', level: 'Window', lives: 'Lives', chain: 'Chain' },
    menu: {
      title: 'Prism Break',
      tagline: 'Smash the stained glass, catch the light and keep the ball alive. Every window is harder than the last.',
      difficultyDetail: { easy: 'Calm ball, wide prism', medium: 'The classic pace', hard: 'Fast ball, narrow prism', expert: 'Glass masters only' },
      controls: { move: 'Move', launch: 'Launch and fire', pause: 'Pause', mouse: 'Steer and launch' },
      spaceKey: 'Space',
      mouseKey: 'Mouse',
    },
    stats: { level: 'Window', destroyed: 'Panes smashed', returns: 'Saves', bestChain: 'Longest chain', perfect: 'Perfect windows' },
  },
  fi: {
    locale: 'fi-FI',
    levelWord: 'Ikkuna',
    levelCleared: 'Ikkuna murskattu',
    perfectLevel: 'Täydellinen ikkuna!',
    lifeLost: 'Pallo menetetty',
    extraLife: '+1 elämä',
    shieldHeld: 'Kilpi kesti!',
    chainReaction: 'Ketjureaktio!',
    serveHint: 'Laukaise välilyönnillä tai napsauttamalla',
    powers: { wide: 'Leveä prisma', multiball: 'Kolme palloa', fireball: 'Tulipallo', laser: 'Laser', magnet: 'Magneetti', slow: 'Hidas aika', shield: 'Kilpi', life: '+1 elämä' },
    hud: { score: 'Pisteet', level: 'Ikkuna', lives: 'Elämät', chain: 'Ketju' },
    menu: {
      title: 'Prism Break',
      tagline: 'Murskaa lasimaalaukset, kerää valo ja pidä pallo ilmassa. Jokainen ikkuna on edellistä vaikeampi.',
      difficultyDetail: { easy: 'Rauhallinen pallo, leveä prisma', medium: 'Klassinen tahti', hard: 'Nopea pallo, kapea prisma', expert: 'Vain lasimestareille' },
      controls: { move: 'Liiku', launch: 'Laukaise ja ammu', pause: 'Tauko', mouse: 'Ohjaa ja laukaise' },
      spaceKey: 'Välilyönti',
      mouseKey: 'Hiiri',
    },
    stats: { level: 'Ikkuna', destroyed: 'Särjetyt ruudut', returns: 'Pelastukset', bestChain: 'Pisin ketju', perfect: 'Täydelliset ikkunat' },
  },
  sv: {
    locale: 'sv-SE',
    levelWord: 'Fönster',
    levelCleared: 'Fönstret krossat',
    perfectLevel: 'Perfekt fönster!',
    lifeLost: 'Bollen tappad',
    extraLife: '+1 liv',
    shieldHeld: 'Skölden höll!',
    chainReaction: 'Kedjereaktion!',
    serveHint: 'Tryck mellanslag eller klicka för att skjuta ut',
    powers: { wide: 'Brett prisma', multiball: 'Tre bollar', fireball: 'Eldboll', laser: 'Laser', magnet: 'Magnet', slow: 'Långsam tid', shield: 'Sköld', life: '+1 liv' },
    hud: { score: 'Poäng', level: 'Fönster', lives: 'Liv', chain: 'Kedja' },
    menu: {
      title: 'Prism Break',
      tagline: 'Krossa glasmosaiken, fånga ljuset och håll bollen i luften. Varje fönster är svårare än det förra.',
      difficultyDetail: { easy: 'Lugn boll, brett prisma', medium: 'Det klassiska tempot', hard: 'Snabb boll, smalt prisma', expert: 'Bara för glasmästare' },
      controls: { move: 'Flytta', launch: 'Skjut ut och skjut', pause: 'Paus', mouse: 'Styr och skjut ut' },
      spaceKey: 'Mellanslag',
      mouseKey: 'Mus',
    },
    stats: { level: 'Fönster', destroyed: 'Krossade rutor', returns: 'Räddningar', bestChain: 'Längsta kedja', perfect: 'Perfekta fönster' },
  },
}

export function prismLabels(language: string): PrismLabels {
  const { levelWord, ...text } = TEXT[(language in TEXT ? language : 'da') as Lang]
  const formatter = new Intl.NumberFormat(text.locale)
  return {
    ...text,
    points: (value) => formatter.format(value),
    level: (level) => `${levelWord} ${level}`,
  }
}
