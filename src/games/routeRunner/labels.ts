import type { Difficulty } from './config'
import type { Language } from '@/lib/translations'

type Lang = Language

export interface RouteLabels {
  locale: string
  points: (value: number) => string
  time: (seconds: number) => string
  combo: (combo: number) => string
  express: string
  crashed: string
  readyHint: string
  hud: { score: string; length: string; combo: string }
  menu: {
    title: string
    tagline: string
    difficultyDetail: Record<Difficulty, string>
    controls: { steer: string; start: string; pause: string }
    spaceKey: string
  }
  stats: { parcels: string; express: string; longest: string; bestCombo: string; time: string }
}

interface LabelText extends Omit<RouteLabels, 'points' | 'time' | 'combo'> {
  comboWord: string
}

const TEXT: Record<Lang, LabelText> = {
  da: {
    locale: 'da-DK',
    comboWord: 'Kombo',
    express: 'Ekspres!',
    crashed: 'Kollision!',
    readyHint: 'Drej eller tryk mellemrum for at køre',
    hud: { score: 'Point', length: 'Vogne', combo: 'Kombo' },
    menu: {
      title: 'Route Runner',
      tagline: 'Kør lagertoget rundt og saml pakkerne op. Hver pakke bliver en ny vogn – undgå væggen, dine egne vogne og pallerne.',
      difficultyDetail: { easy: 'Roligt tempo, frit gulv', medium: 'Lidt hurtigere, få paller', hard: 'Hurtigt med reoler', expert: 'Fuld fart gennem et fyldt lager' },
      controls: { steer: 'Styr', start: 'Kør', pause: 'Pause' },
      spaceKey: 'Mellemrum',
    },
    stats: { parcels: 'Pakker', express: 'Ekspres', longest: 'Længste tog', bestCombo: 'Bedste kombo', time: 'Tid' },
  },
  en: {
    locale: 'en-GB',
    comboWord: 'Combo',
    express: 'Express!',
    crashed: 'Collision!',
    readyHint: 'Turn or press Space to drive',
    hud: { score: 'Score', length: 'Carts', combo: 'Combo' },
    menu: {
      title: 'Route Runner',
      tagline: 'Drive the warehouse train and pick up the parcels. Every parcel adds a cart – avoid the walls, your own carts and the pallets.',
      difficultyDetail: { easy: 'Calm pace, clear floor', medium: 'A bit faster, a few pallets', hard: 'Fast with racks', expert: 'Full speed through a packed warehouse' },
      controls: { steer: 'Steer', start: 'Drive', pause: 'Pause' },
      spaceKey: 'Space',
    },
    stats: { parcels: 'Parcels', express: 'Express', longest: 'Longest train', bestCombo: 'Best combo', time: 'Time' },
  },
  fi: {
    locale: 'fi-FI',
    comboWord: 'Kombo',
    express: 'Pikalähetys!',
    crashed: 'Törmäys!',
    readyHint: 'Käänny tai paina välilyöntiä ajaaksesi',
    hud: { score: 'Pisteet', length: 'Vaunut', combo: 'Kombo' },
    menu: {
      title: 'Route Runner',
      tagline: 'Aja varastojunaa ja kerää paketit. Jokainen paketti lisää vaunun – vältä seiniä, omia vaunujasi ja lavoja.',
      difficultyDetail: { easy: 'Rauhallinen tahti, tyhjä lattia', medium: 'Hieman nopeampi, muutama lava', hard: 'Nopea, hyllyjä', expert: 'Täysillä täyden varaston läpi' },
      controls: { steer: 'Ohjaa', start: 'Aja', pause: 'Tauko' },
      spaceKey: 'Välilyönti',
    },
    stats: { parcels: 'Paketit', express: 'Pikalähetykset', longest: 'Pisin juna', bestCombo: 'Paras kombo', time: 'Aika' },
  },
  sv: {
    locale: 'sv-SE',
    comboWord: 'Kombo',
    express: 'Express!',
    crashed: 'Krock!',
    readyHint: 'Sväng eller tryck mellanslag för att köra',
    hud: { score: 'Poäng', length: 'Vagnar', combo: 'Kombo' },
    menu: {
      title: 'Route Runner',
      tagline: 'Kör lagertåget och plocka upp paketen. Varje paket ger en ny vagn – undvik väggarna, dina egna vagnar och pallarna.',
      difficultyDetail: { easy: 'Lugnt tempo, fritt golv', medium: 'Lite snabbare, några pallar', hard: 'Snabbt med hyllor', expert: 'Full fart genom ett fullpackat lager' },
      controls: { steer: 'Styr', start: 'Kör', pause: 'Paus' },
      spaceKey: 'Mellanslag',
    },
    stats: { parcels: 'Paket', express: 'Express', longest: 'Längsta tåg', bestCombo: 'Bästa kombo', time: 'Tid' },
  },
}

export function routeLabels(language: string): RouteLabels {
  const { comboWord, ...text } = TEXT[(language in TEXT ? language : 'da') as Lang]
  const formatter = new Intl.NumberFormat(text.locale)
  return {
    ...text,
    points: (value) => formatter.format(value),
    time: (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,
    combo: (combo) => `${comboWord} ×${combo}`,
  }
}
