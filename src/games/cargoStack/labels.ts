import type { Difficulty } from './config'
import type { Language } from '@/lib/translations'

type Lang = Language

export interface CargoLabels {
  locale: string
  points: (value: number) => string
  level: (level: number) => string
  combo: (combo: number) => string
  clears: Record<1 | 2 | 3 | 4, string>
  tspin: string
  miniTspin: string
  backToBack: string
  perfect: string
  hud: { score: string; level: string; lines: string; hold: string; next: string }
  menu: {
    title: string
    tagline: string
    difficultyDetail: Record<Difficulty, string>
    controls: { move: string; rotate: string; softDrop: string; hardDrop: string; hold: string; pause: string }
    spaceKey: string
  }
  stats: { level: string; lines: string; tetrises: string; tspins: string; maxCombo: string; pieces: string }
}

interface LabelText extends Omit<CargoLabels, 'points' | 'level' | 'combo'> {
  levelWord: string
  comboWord: string
}

const TEXT: Record<Lang, LabelText> = {
  da: {
    locale: 'da-DK',
    levelWord: 'Niveau',
    comboWord: 'Kombo',
    clears: { 1: 'Enkelt', 2: 'Dobbelt', 3: 'Tredobbelt', 4: 'Fuld last!' },
    tspin: 'T-spin',
    miniTspin: 'Mini T-spin',
    backToBack: 'Back-to-back',
    perfect: 'Tom container!',
    hud: { score: 'Point', level: 'Niveau', lines: 'Rækker', hold: 'Hold', next: 'Næste' },
    menu: {
      title: 'Cargo Stack',
      tagline: 'Læs godset tæt i containeren. Fulde rækker bliver kørt væk – fire på én gang er en fuld last.',
      difficultyDetail: { easy: 'Starter på niveau 1', medium: 'Starter på niveau 3', hard: 'Starter på niveau 6', expert: 'Niveau 9 og kun tre næste' },
      controls: { move: 'Flyt', rotate: 'Drej', softDrop: 'Blødt drop', hardDrop: 'Hårdt drop', hold: 'Hold', pause: 'Pause' },
      spaceKey: 'Mellemrum',
    },
    stats: { level: 'Niveau', lines: 'Rækker', tetrises: 'Fulde læs', tspins: 'T-spins', maxCombo: 'Største kombo', pieces: 'Kolli' },
  },
  en: {
    locale: 'en-GB',
    levelWord: 'Level',
    comboWord: 'Combo',
    clears: { 1: 'Single', 2: 'Double', 3: 'Triple', 4: 'Full load!' },
    tspin: 'T-spin',
    miniTspin: 'Mini T-spin',
    backToBack: 'Back-to-back',
    perfect: 'Empty container!',
    hud: { score: 'Score', level: 'Level', lines: 'Lines', hold: 'Hold', next: 'Next' },
    menu: {
      title: 'Cargo Stack',
      tagline: 'Pack the cargo tight in the container. Full rows get shipped out – four at once is a full load.',
      difficultyDetail: { easy: 'Starts at level 1', medium: 'Starts at level 3', hard: 'Starts at level 6', expert: 'Level 9 and only three next' },
      controls: { move: 'Move', rotate: 'Rotate', softDrop: 'Soft drop', hardDrop: 'Hard drop', hold: 'Hold', pause: 'Pause' },
      spaceKey: 'Space',
    },
    stats: { level: 'Level', lines: 'Lines', tetrises: 'Full loads', tspins: 'T-spins', maxCombo: 'Best combo', pieces: 'Parcels' },
  },
  fi: {
    locale: 'fi-FI',
    levelWord: 'Taso',
    comboWord: 'Kombo',
    clears: { 1: 'Yksi', 2: 'Kaksi', 3: 'Kolme', 4: 'Täysi lasti!' },
    tspin: 'T-spin',
    miniTspin: 'Mini T-spin',
    backToBack: 'Back-to-back',
    perfect: 'Tyhjä kontti!',
    hud: { score: 'Pisteet', level: 'Taso', lines: 'Rivit', hold: 'Pidä', next: 'Seuraava' },
    menu: {
      title: 'Cargo Stack',
      tagline: 'Pakkaa lasti tiiviisti konttiin. Täydet rivit lähetetään matkaan – neljä kerralla on täysi lasti.',
      difficultyDetail: { easy: 'Alkaa tasolta 1', medium: 'Alkaa tasolta 3', hard: 'Alkaa tasolta 6', expert: 'Taso 9 ja vain kolme seuraavaa' },
      controls: { move: 'Liiku', rotate: 'Käännä', softDrop: 'Pehmeä pudotus', hardDrop: 'Kova pudotus', hold: 'Pidä', pause: 'Tauko' },
      spaceKey: 'Välilyönti',
    },
    stats: { level: 'Taso', lines: 'Rivit', tetrises: 'Täydet lastit', tspins: 'T-spinit', maxCombo: 'Paras kombo', pieces: 'Kollit' },
  },
  sv: {
    locale: 'sv-SE',
    levelWord: 'Nivå',
    comboWord: 'Kombo',
    clears: { 1: 'Enkel', 2: 'Dubbel', 3: 'Trippel', 4: 'Full last!' },
    tspin: 'T-spin',
    miniTspin: 'Mini T-spin',
    backToBack: 'Back-to-back',
    perfect: 'Tom container!',
    hud: { score: 'Poäng', level: 'Nivå', lines: 'Rader', hold: 'Spara', next: 'Nästa' },
    menu: {
      title: 'Cargo Stack',
      tagline: 'Packa godset tätt i containern. Fulla rader skeppas iväg – fyra på en gång är en full last.',
      difficultyDetail: { easy: 'Startar på nivå 1', medium: 'Startar på nivå 3', hard: 'Startar på nivå 6', expert: 'Nivå 9 och bara tre nästa' },
      controls: { move: 'Flytta', rotate: 'Rotera', softDrop: 'Mjukt släpp', hardDrop: 'Hårt släpp', hold: 'Spara', pause: 'Paus' },
      spaceKey: 'Mellanslag',
    },
    stats: { level: 'Nivå', lines: 'Rader', tetrises: 'Fulla laster', tspins: 'T-spins', maxCombo: 'Bästa kombo', pieces: 'Kolli' },
  },
}

export function cargoLabels(language: string): CargoLabels {
  const { levelWord, comboWord, ...text } = TEXT[(language in TEXT ? language : 'da') as Lang]
  const formatter = new Intl.NumberFormat(text.locale)
  return {
    ...text,
    points: (value) => formatter.format(value),
    level: (level) => `${levelWord} ${level}`,
    combo: (combo) => `${comboWord} ×${combo}`,
  }
}
