import { zoneTheme, type Difficulty, type Zone } from './config'
import type { Language } from '@/lib/translations'

type Lang = Language

export interface ParcelLabels {
  locale: string
  points: (value: number) => string
  zone: (zone: number) => string
  zoneShort: (zone: number) => string
  perfect: string
  shieldGained: string
  shieldBroken: string
  crashed: string
  readyHint: string
  hud: { score: string; zone: string }
  menu: {
    title: string
    tagline: string
    difficultyDetail: Record<Difficulty, string>
    controls: { lift: string; pause: string; mouse: string }
    spaceKey: string
    mouseKey: string
  }
  stats: { zone: string; gates: string; parcels: string; perfect: string; bestStreak: string }
}

interface LabelText extends Omit<ParcelLabels, 'points' | 'zone' | 'zoneShort'> {
  zoneWord: string
  zones: Record<Zone, string>
}

const TEXT: Record<Lang, LabelText> = {
  da: {
    locale: 'da-DK',
    zoneWord: 'Zone',
    zones: { harbour: 'Havnen', terminal: 'Terminalen', aurora: 'Nordlys', storm: 'Stormen' },
    perfect: 'Perfekt',
    shieldGained: 'Skjold!',
    shieldBroken: 'Skjoldet tog stødet!',
    crashed: 'Styrt!',
    readyHint: 'Mellemrum eller klik for at lette',
    hud: { score: 'Point', zone: 'Zone' },
    menu: {
      title: 'Parcel Pilot',
      tagline: 'Flyv pakken gennem containerhavnen om natten. Ram midten af hullerne for at bygge en række op, og saml pakker på vejen.',
      difficultyDetail: { easy: 'Brede huller, roligt tempo', medium: 'Det klassiske tempo', hard: 'Smalle huller, kraner i bevægelse', expert: 'Kun for erfarne piloter' },
      controls: { lift: 'Løft dronen', pause: 'Pause', mouse: 'Klik for at løfte' },
      spaceKey: 'Mellemrum',
      mouseKey: 'Mus',
    },
    stats: { zone: 'Zone', gates: 'Porte', parcels: 'Pakker', perfect: 'Perfekte', bestStreak: 'Længste række' },
  },
  en: {
    locale: 'en-GB',
    zoneWord: 'Zone',
    zones: { harbour: 'The Harbour', terminal: 'The Terminal', aurora: 'Northern Lights', storm: 'The Storm' },
    perfect: 'Perfect',
    shieldGained: 'Shield!',
    shieldBroken: 'The shield took the hit!',
    crashed: 'Crash!',
    readyHint: 'Space or click to take off',
    hud: { score: 'Score', zone: 'Zone' },
    menu: {
      title: 'Parcel Pilot',
      tagline: 'Fly the parcel through the container port at night. Hit the centre of the gaps to build a streak, and grab parcels on the way.',
      difficultyDetail: { easy: 'Wide gaps, calm pace', medium: 'The classic pace', hard: 'Narrow gaps, moving cranes', expert: 'Seasoned pilots only' },
      controls: { lift: 'Lift the drone', pause: 'Pause', mouse: 'Click to lift' },
      spaceKey: 'Space',
      mouseKey: 'Mouse',
    },
    stats: { zone: 'Zone', gates: 'Gates', parcels: 'Parcels', perfect: 'Perfect', bestStreak: 'Longest streak' },
  },
  fi: {
    locale: 'fi-FI',
    zoneWord: 'Vyöhyke',
    zones: { harbour: 'Satama', terminal: 'Terminaali', aurora: 'Revontulet', storm: 'Myrsky' },
    perfect: 'Täydellinen',
    shieldGained: 'Kilpi!',
    shieldBroken: 'Kilpi otti iskun!',
    crashed: 'Törmäys!',
    readyHint: 'Nouse välilyönnillä tai napsauttamalla',
    hud: { score: 'Pisteet', zone: 'Vyöhyke' },
    menu: {
      title: 'Parcel Pilot',
      tagline: 'Lennätä paketti yöllisen konttisataman läpi. Osu aukkojen keskelle kerätäksesi putken ja poimi paketteja matkalla.',
      difficultyDetail: { easy: 'Leveät aukot, rauhallinen tahti', medium: 'Klassinen tahti', hard: 'Kapeat aukot, liikkuvat nosturit', expert: 'Vain kokeneille lentäjille' },
      controls: { lift: 'Nosta droonia', pause: 'Tauko', mouse: 'Nosta napsauttamalla' },
      spaceKey: 'Välilyönti',
      mouseKey: 'Hiiri',
    },
    stats: { zone: 'Vyöhyke', gates: 'Portit', parcels: 'Paketit', perfect: 'Täydelliset', bestStreak: 'Pisin putki' },
  },
  sv: {
    locale: 'sv-SE',
    zoneWord: 'Zon',
    zones: { harbour: 'Hamnen', terminal: 'Terminalen', aurora: 'Norrsken', storm: 'Stormen' },
    perfect: 'Perfekt',
    shieldGained: 'Sköld!',
    shieldBroken: 'Skölden tog smällen!',
    crashed: 'Krasch!',
    readyHint: 'Tryck mellanslag eller klicka för att lyfta',
    hud: { score: 'Poäng', zone: 'Zon' },
    menu: {
      title: 'Parcel Pilot',
      tagline: 'Flyg paketet genom containerhamnen på natten. Träffa mitten av luckorna för att bygga en svit och plocka paket på vägen.',
      difficultyDetail: { easy: 'Breda luckor, lugnt tempo', medium: 'Det klassiska tempot', hard: 'Smala luckor, rörliga kranar', expert: 'Bara för erfarna piloter' },
      controls: { lift: 'Lyft drönaren', pause: 'Paus', mouse: 'Klicka för att lyfta' },
      spaceKey: 'Mellanslag',
      mouseKey: 'Mus',
    },
    stats: { zone: 'Zon', gates: 'Portar', parcels: 'Paket', perfect: 'Perfekta', bestStreak: 'Längsta svit' },
  },
}

export function parcelLabels(language: string): ParcelLabels {
  const { zoneWord, zones, ...text } = TEXT[(language in TEXT ? language : 'da') as Lang]
  const formatter = new Intl.NumberFormat(text.locale)
  return {
    ...text,
    points: (value) => formatter.format(value),
    zone: (zone) => `${zoneWord} ${zone} · ${zones[zoneTheme(zone)]}`,
    zoneShort: (zone) => zones[zoneTheme(zone)],
  }
}
