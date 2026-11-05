import type { BossId } from './bosses/core'
import type { Difficulty } from './config'
import { WAVES_PER_SECTOR } from './campaign'
import type { SpecialKind } from './enemies'
import type { ThemeId } from './themes'
import type { TemplateId } from './waveTemplates'
import type { TimedPowerup } from './powerups'
import type { WeaponFamily } from './weapons'
import type { Language } from '@/lib/translations'

type Lang = Language

export interface ChickenLabels {
  locale: string
  points: (value: number) => string
  percent: (value: number) => string
  wave: (wave: number) => string
  waveSubtitle: Record<TemplateId, string>
  /** Undertitel for en hazard-bølge; meteorregnen har sin egen pr. tema. */
  hazardSubtitle: (hazard: TemplateId, theme: ThemeId) => string
  bonus: { title: string; label: string; perfect: string; noHit: string; lost: string; locked: string; result: (points: number) => string }
  themeName: Record<ThemeId, string>
  /** HUD-linjen: sektor og plads (begge 0-baseret) samt Nyt+-runde. */
  sectorWave: (sector: number, slot: number, round: number) => string
  sectorTitle: (sector: number, theme: ThemeId) => string
  newPlus: (round: number) => string
  /** Undertitel på Nyt+-banneret. */
  newPlusSubtitle: string
  waveCleared: string
  perfectWave: string
  bossAngry: string
  bossLastStand: string
  bossDefeated: string
  bossName: Record<BossId, string>
  /** Kort replik under navnet, når bossen flyver ind. */
  bossIntro: Record<BossId, string>
  /** Bannerets navn med variant: "Ild-trioen", "Kyllingekrydseren MK II". */
  bossTitle: (id: BossId, variant: number) => string
  bossPhaseLine: (id: BossId, phase: number) => string
  bossDefeatedFor: (id: BossId, variant: number) => string
  shieldDown: string
  /** Game over: "3" eller "1 · Nyt+". */
  sectorReached: (sector: number, round: number) => string
  overheated: string
  weaponLevel: (level: number) => string
  extraLife: string
  shieldHeld: string
  missile: string
  goldenEscaped: string
  escaped: Record<'ninja' | 'ufo' | 'rainbow', string>
  enemyName: Record<SpecialKind, string>
  /** Kort tip på introkortet, første gang fjenden dukker op. */
  enemyHint: Record<SpecialKind, string>
  newEnemy: (kind: SpecialKind) => string
  weaponStolen: string
  pickup: { shield: string; coolant: string; missile: string; drone: string; slowmo: string; magnet: string; double: string; life: string }
  weaponName: Record<WeaponFamily, string>
  /** Teksten ved en gave: "Lyn 3". */
  weaponGift: (family: WeaponFamily, level: number) => string
  /** Korte navne til HUD'ens power-up-ure. */
  powerupName: Record<TimedPowerup | 'coolant', string>
  powerupOver: string
  hud: { score: string; wave: string; heat: string; weapon: string; missiles: string; boss: string; coolant: string }
  menu: {
    title: string
    tagline: string
    difficultyDetail: Record<Difficulty, string>
    controls: { move: string; fire: string; missile: string; pause: string; mouse: string }
    spaceKey: string
    mouseKey: string
  }
  stats: { wave: string; kills: string; accuracy: string; bestChain: string; bosses: string; sector: string }
}

interface LabelText
  extends Omit<
    ChickenLabels,
    'locale' | 'points' | 'percent' | 'wave' | 'weaponLevel' | 'weaponGift' | 'sectorWave' | 'sectorTitle' | 'newPlus' | 'newEnemy' | 'hazardSubtitle' | 'bonus' | 'bossTitle' | 'bossPhaseLine' | 'bossDefeatedFor' | 'sectorReached'
  > {
  locale: string
  bossPhaseText: Record<BossId, [string, string]>
  bossVariantName: Record<'eggTrio' | 'chickenCruiser', string>
  defeatedWord: string
  showerSubtitle: Record<ThemeId, string>
  bonusText: Omit<ChickenLabels['bonus'], 'result'> & { resultWord: string }
  newEnemyWord: string
  waveWord: string
  weaponWord: string
  sectorWord: string
  waveLower: string
  newPlusWord: string
}

const TEXT: Record<Lang, LabelText> = {
  da: {
    locale: 'da-DK',
    waveWord: 'Bølge',
    weaponWord: 'Våben niveau',
    sectorWord: 'Sektor',
    waveLower: 'bølge',
    newPlusWord: 'Nyt+',
    newPlusSubtitle: 'Galaksen forfra – hårdere end før!',
    themeName: {
      farm: 'Hønsegården i rummet',
      asteroids: 'Asteroidebæltet',
      ice: 'Isplaneten',
      volcano: 'Vulkanmånen',
      mothership: 'Moderskibet',
    },
    waveSubtitle: {
      classic: 'Hønsene kommer!',
      divers: 'Pas på dykkerne!',
      armored: 'Hjelmhøns og en guldhøne!',
      meteorShower: 'Meteorregn!',
      goldRush: 'Guldregn – skyd guldmeteorerne!',
      asteroidBelt: 'Asteroidebæltet – hold øje med banerne!',
      cometStorm: 'Kometstorm fra hjørnerne!',
      blackHole: 'Sort hul – kæmp imod suget!',
      drumstickRain: 'Kyllingelårsregn – saml dem alle!',
      shootingGallery: 'Skydebane – skyd guldhønsene!',
      eggDodge: 'Æggeregn – undvig uden at blive ramt!',
      motherHen: 'Mor Høne nærmer sig!',
      vSquadron: 'V-eskadrillen angriber!',
      carousel: 'Karrusellen drejer rundt!',
      conga: 'Hønse-conga på himlen!',
      pinballFlock: 'Pas på – de preller rundt!',
      diamondDance: 'Diamantdansen!',
      loopSquad: 'Loop-eskadrillen dykker!',
      twinFlanks: 'Angreb fra begge flanker!',
      checkerWall: 'Skakbrætmuren – hjelme på hvert andet felt!',
      columnDrop: 'Søjlerne falder ned!',
      arrowhead: 'Pilespidsen går lige mod dig!',
      sniperNest: 'Snigskytterne har dig i sigtekornet!',
      medicSquad: 'Sygeplejerskerne lapper hjelmene!',
      turkeyRaid: 'Kalkunerne går til angreb!',
      ufoAmbush: 'UFO-baghold – pas på strålen!',
      eggeroid: 'Æggeroiden driver ind i sektoren!',
      iceQueen: 'Isdronningen kræver sin trone!',
      roboRooster: 'Robo-Hanen er bygget til krig!',
      galacticRooster: 'Den Galaktiske Hane venter for enden!',
      eggTrio: 'Ægge-trioen flyver i formation!',
      eggTrioFire: 'Ild-trioen – pas på de glødende æg!',
      chickenCruiser: 'Kyllingekrydseren krydser banen!',
      chickenCruiserMk2: 'Kyllingekrydseren MK II – hurtigere kanoner!',
      ufoMothership: 'UFO-moderskibet – hold dig ude af strålen!',
    },
    showerSubtitle: {
      farm: 'Meteorregn!',
      asteroids: 'Metalregn – de pansrede sten tåler 6 skud!',
      ice: 'Isklumper fra himlen – de store splintrer!',
      volcano: 'Ildregn – de glødende er lynhurtige!',
      mothership: 'Kaosregn – alt på én gang!',
    },
    bonusText: {
      title: 'BONUSBANE',
      label: 'Bonus',
      perfect: 'Perfekt!',
      noHit: 'Ingen træf – fuld bonus!',
      lost: 'Bonus tabt!',
      locked: 'Våben låst',
      resultWord: 'Bonus',
    },
    newEnemyWord: 'NY',
    enemyName: {
      shield: 'Skjoldhøne',
      sniper: 'Snigskytte',
      bomber: 'Bombehøne',
      ninja: 'Ninja-kylling',
      balloon: 'Ballonhøne',
      medic: 'Sygeplejerske',
      ufo: 'UFO-kylling',
      turkey: 'Kamikaze-kalkun',
      rainbow: 'Regnbuehøne',
    },
    enemyHint: {
      shield: 'Boblen tager 4 skud, før hønen kan rammes',
      sniper: 'Sigter efter dig – bliv ved med at bevæge dig',
      bomber: 'Bomben sprænger i 6 splinter midt på skærmen',
      ninja: 'Lynhurtig zigzag – skyd den, før den smutter',
      balloon: 'Bliver til 3 kyllinger, når ballonen springer',
      medic: 'Heler hjelme og skjolde – skyd hende først',
      ufo: 'Stjæler et våbenniveau – kom ud af strålen!',
      turkey: 'Vrikker som varsel – og styrtdykker mod dig',
      rainbow: 'Sjælden gæst – skyd den for en power-up',
    },
    weaponStolen: 'Våben stjålet!',
    escaped: { ninja: 'Ninjaen smuttede', ufo: 'UFO\'en fløj væk', rainbow: 'Regnbuehønen forsvandt' },
    waveCleared: 'Bølge ryddet',
    perfectWave: 'Perfekt bølge!',
    bossAngry: 'Mor Høne bliver vred!',
    bossLastStand: 'Sidste kræfter!',
    bossDefeated: 'Mor Høne besejret!',
    bossName: {
      motherHen: 'Mor Høne',
      eggeroid: 'Æggeroiden',
      iceQueen: 'Isdronningen',
      roboRooster: 'Robo-Hanen',
      galacticRooster: 'Den Galaktiske Hane',
      eggTrio: 'Ægge-trioen',
      chickenCruiser: 'Kyllingekrydseren',
      ufoMothership: 'UFO-moderskibet',
    },
    bossIntro: {
      motherHen: 'Hun vil have sin flok tilbage!',
      eggeroid: 'Et kæmpeæg af sten – skyd det i stykker!',
      iceQueen: 'Hold dig ude af frostlaserens bane!',
      roboRooster: 'Skyd kanontårnene af – så falder skjoldet!',
      galacticRooster: 'Herskeren over hele galaksen!',
      eggTrio: 'Tre store høns – én ad gangen!',
      chickenCruiser: 'Skroget er pansret – sigt på tårnene!',
      ufoMothership: 'Den brede stråle stjæler dit våben!',
    },
    bossPhaseText: {
      motherHen: ['Mor Høne bliver vred!', 'Sidste kræfter!'],
      eggeroid: ['Skallen revner!', 'Æggeroiden sprækker!'],
      iceQueen: ['Dronningen kalder sin garde!', 'Snestorm!'],
      roboRooster: ['Overophedning!', 'Lasergitter aktiveret!'],
      galacticRooster: ['Hanen samler kræfterne!', 'Sort hul!'],
      eggTrio: ['Trioen bliver sur!', 'Alle på én gang!'],
      chickenCruiser: ['Alle kanoner klar!', 'Krydseren synker!'],
      ufoMothership: ['Moderskibet er i alarm!', 'Sidste stråle!'],
    },
    bossVariantName: { eggTrio: 'Ild-trioen', chickenCruiser: 'Kyllingekrydseren MK II' },
    defeatedWord: 'besejret!',
    shieldDown: 'Skjoldet er nede!',
    overheated: 'Overophedet!',
    extraLife: '+1 liv',
    shieldHeld: 'Skjoldet holdt!',
    missile: 'Missil!',
    goldenEscaped: 'Guldhønen slap væk',
    pickup: { shield: 'Skjold!', coolant: 'Køling!', missile: '+1 missil', drone: 'Drone!', slowmo: 'Slowmo!', magnet: 'Magnet!', double: '×2 point!', life: '+1 liv' },
    weaponName: { blaster: 'Ionkanon', lightning: 'Lyn', laser: 'Laser', spread: 'Fjer-hagl', homing: 'Raketter' },
    powerupName: { drone: 'Drone', slowmo: 'Slowmo', magnet: 'Magnet', double: '×2', coolant: 'Køling' },
    powerupOver: 'slut',
    hud: { score: 'Point', wave: 'Bølge', heat: 'Varme', weapon: 'Våben', missiles: 'Missiler', boss: 'Mor Høne', coolant: 'Køling' },
    menu: {
      title: 'Chicken Invaders',
      tagline: 'Mor Høne vil have sin flok tilbage – og hele galaksen er med. Fem sektorer, bonusbaner, fem våbentyper og otte bosser venter.',
      difficultyDetail: {
        easy: 'Rolig flok, langsomme æg',
        medium: 'Den klassiske invasion',
        hard: 'Hurtige dyk og æggeregn',
        expert: 'Kun for rumpiloter',
      },
      controls: { move: 'Flyt (hele skærmen)', fire: 'Skyd', missile: 'Missil', pause: 'Pause', mouse: 'Skibet følger musen · klik skyder' },
      spaceKey: 'Mellemrum',
      mouseKey: 'Mus',
    },
    stats: { wave: 'Bølge', kills: 'Skudt ned', accuracy: 'Træfsikkerhed', bestChain: 'Længste combo', bosses: 'Bosser besejret', sector: 'Sektor nået' },
  },
  en: {
    locale: 'en-GB',
    waveWord: 'Wave',
    weaponWord: 'Weapon level',
    sectorWord: 'Sector',
    waveLower: 'wave',
    newPlusWord: 'New+',
    newPlusSubtitle: 'The galaxy again – tougher than before!',
    themeName: {
      farm: 'Space Farm',
      asteroids: 'Asteroid Belt',
      ice: 'Ice Planet',
      volcano: 'Volcano Moon',
      mothership: 'The Mothership',
    },
    waveSubtitle: {
      classic: 'The hens are coming!',
      divers: 'Watch out for divers!',
      armored: 'Helmet hens and a golden hen!',
      meteorShower: 'Meteor shower!',
      goldRush: 'Gold rush – shoot the gold meteors!',
      asteroidBelt: 'Asteroid belt – watch the lanes!',
      cometStorm: 'Comet storm from the corners!',
      blackHole: 'Black hole – fight the pull!',
      drumstickRain: 'Drumstick rain – catch them all!',
      shootingGallery: 'Shooting gallery – bag the golden hens!',
      eggDodge: 'Egg rain – dodge without a scratch!',
      motherHen: 'Mother Hen approaches!',
      vSquadron: 'The V squadron attacks!',
      carousel: 'The carousel is spinning!',
      conga: 'Chicken conga line in space!',
      pinballFlock: 'Watch out – they ricochet!',
      diamondDance: 'The diamond dance!',
      loopSquad: 'The loop squad dives!',
      twinFlanks: 'Attack from both flanks!',
      checkerWall: 'Checker wall – helmets on every other square!',
      columnDrop: 'The columns are dropping!',
      arrowhead: 'The arrowhead heads straight for you!',
      sniperNest: 'The snipers have you in their sights!',
      medicSquad: 'The nurses keep patching the helmets!',
      turkeyRaid: 'Turkey raid incoming!',
      ufoAmbush: 'UFO ambush – mind the beam!',
      eggeroid: 'The Eggsteroid drifts into the sector!',
      iceQueen: 'The Ice Queen claims her throne!',
      roboRooster: 'Robo-Rooster is built for war!',
      galacticRooster: 'The Galactic Rooster awaits!',
      eggTrio: 'The Egg Trio flies in formation!',
      eggTrioFire: 'The Fire Trio – watch the glowing eggs!',
      chickenCruiser: 'The Chicken Cruiser crosses the field!',
      chickenCruiserMk2: 'Chicken Cruiser MK II – faster guns!',
      ufoMothership: 'The UFO Mothership – stay out of the beam!',
    },
    showerSubtitle: {
      farm: 'Meteor shower!',
      asteroids: 'Metal storm – armoured rocks take 6 shots!',
      ice: 'Ice chunks from the sky – the big ones shatter!',
      volcano: 'Fire rain – the glowing ones are fast!',
      mothership: 'Chaos shower – everything at once!',
    },
    bonusText: {
      title: 'BONUS STAGE',
      label: 'Bonus',
      perfect: 'Perfect!',
      noHit: 'Not a scratch – full bonus!',
      lost: 'Bonus lost!',
      locked: 'Weapon locked',
      resultWord: 'Bonus',
    },
    newEnemyWord: 'NEW',
    enemyName: {
      shield: 'Shield Hen',
      sniper: 'Sniper Hen',
      bomber: 'Bomber Hen',
      ninja: 'Ninja Chick',
      balloon: 'Balloon Hen',
      medic: 'Nurse Hen',
      ufo: 'UFO Chicken',
      turkey: 'Kamikaze Turkey',
      rainbow: 'Rainbow Hen',
    },
    enemyHint: {
      shield: 'The bubble soaks up 4 shots before the hen',
      sniper: 'Aims right at you – keep moving',
      bomber: 'The bomb bursts into 6 shards mid-screen',
      ninja: 'Lightning-fast zigzag – shoot it before it escapes',
      balloon: 'Pops into 3 chicks when the balloon bursts',
      medic: 'Heals helmets and shields – take her out first',
      ufo: 'Steals a weapon level – get out of the beam!',
      turkey: 'Wobbles as a warning – then dives at you',
      rainbow: 'Rare visitor – shoot it for a power-up',
    },
    weaponStolen: 'Weapon stolen!',
    escaped: { ninja: 'The ninja got away', ufo: 'The UFO flew off', rainbow: 'The rainbow hen vanished' },
    waveCleared: 'Wave cleared',
    perfectWave: 'Perfect wave!',
    bossAngry: 'Mother Hen is getting angry!',
    bossLastStand: 'Last stand!',
    bossDefeated: 'Mother Hen defeated!',
    bossName: {
      motherHen: 'Mother Hen',
      eggeroid: 'The Eggsteroid',
      iceQueen: 'The Ice Queen',
      roboRooster: 'Robo-Rooster',
      galacticRooster: 'The Galactic Rooster',
      eggTrio: 'The Egg Trio',
      chickenCruiser: 'The Chicken Cruiser',
      ufoMothership: 'The UFO Mothership',
    },
    bossIntro: {
      motherHen: 'She wants her flock back!',
      eggeroid: 'A giant egg of rock – blast it apart!',
      iceQueen: 'Stay out of the frost laser’s path!',
      roboRooster: 'Shoot off the turrets – then the shield drops!',
      galacticRooster: 'Ruler of the whole galaxy!',
      eggTrio: 'Three big hens – one at a time!',
      chickenCruiser: 'The hull is armoured – aim for the turrets!',
      ufoMothership: 'The wide beam steals your weapon!',
    },
    bossPhaseText: {
      motherHen: ['Mother Hen is getting angry!', 'Last stand!'],
      eggeroid: ['The shell is cracking!', 'The Eggsteroid splits open!'],
      iceQueen: ['The queen calls her guard!', 'Blizzard!'],
      roboRooster: ['Overheating!', 'Laser grid online!'],
      galacticRooster: ['The rooster gathers its power!', 'Black hole!'],
      eggTrio: ['The trio is getting cross!', 'All at once!'],
      chickenCruiser: ['All guns ready!', 'The cruiser is sinking!'],
      ufoMothership: ['Mothership on alert!', 'Final beam!'],
    },
    bossVariantName: { eggTrio: 'The Fire Trio', chickenCruiser: 'The Chicken Cruiser MK II' },
    defeatedWord: 'defeated!',
    shieldDown: 'Shield down!',
    overheated: 'Overheated!',
    extraLife: '+1 life',
    shieldHeld: 'Shield held!',
    missile: 'Missile!',
    goldenEscaped: 'The golden hen got away',
    pickup: { shield: 'Shield!', coolant: 'Coolant!', missile: '+1 missile', drone: 'Drone!', slowmo: 'Slow-mo!', magnet: 'Magnet!', double: 'Double points!', life: '+1 life' },
    weaponName: { blaster: 'Ion Blaster', lightning: 'Lightning', laser: 'Laser', spread: 'Feather Spread', homing: 'Rockets' },
    powerupName: { drone: 'Drone', slowmo: 'Slow-mo', magnet: 'Magnet', double: '×2', coolant: 'Coolant' },
    powerupOver: 'over',
    hud: { score: 'Score', wave: 'Wave', heat: 'Heat', weapon: 'Weapon', missiles: 'Missiles', boss: 'Mother Hen', coolant: 'Coolant' },
    menu: {
      title: 'Chicken Invaders',
      tagline: 'Mother Hen wants her flock back – and the whole galaxy has joined in. Five sectors, bonus stages, five weapon types and eight bosses await.',
      difficultyDetail: {
        easy: 'Calm flock, slow eggs',
        medium: 'The classic invasion',
        hard: 'Fast dives and egg rain',
        expert: 'Space aces only',
      },
      controls: { move: 'Move (whole screen)', fire: 'Fire', missile: 'Missile', pause: 'Pause', mouse: 'Ship follows the mouse · click fires' },
      spaceKey: 'Space',
      mouseKey: 'Mouse',
    },
    stats: { wave: 'Wave', kills: 'Shot down', accuracy: 'Accuracy', bestChain: 'Longest combo', bosses: 'Bosses defeated', sector: 'Sector reached' },
  },
  fi: {
    locale: 'fi-FI',
    waveWord: 'Aalto',
    weaponWord: 'Asetaso',
    sectorWord: 'Sektori',
    waveLower: 'aalto',
    newPlusWord: 'Uusi+',
    newPlusSubtitle: 'Galaksi alusta – entistä vaikeampi!',
    themeName: {
      farm: 'Avaruuskanala',
      asteroids: 'Asteroidivyöhyke',
      ice: 'Jääplaneetta',
      volcano: 'Tulivuorikuu',
      mothership: 'Emoalus',
    },
    waveSubtitle: {
      classic: 'Kanat saapuvat!',
      divers: 'Varo syöksyjiä!',
      armored: 'Kypäräkanat ja kultakana!',
      meteorShower: 'Meteorisade!',
      goldRush: 'Kultasade – ammu kultameteorit!',
      asteroidBelt: 'Asteroidivyö – tarkkaile kaistoja!',
      cometStorm: 'Komeettamyrsky kulmista!',
      blackHole: 'Musta aukko – taistele imua vastaan!',
      drumstickRain: 'Koipisade – kerää ne kaikki!',
      shootingGallery: 'Ampumarata – ammu kultakanat!',
      eggDodge: 'Munasade – väistä ilman osumaa!',
      motherHen: 'Emokana lähestyy!',
      vSquadron: 'V-parvi hyökkää!',
      carousel: 'Karuselli pyörii!',
      conga: 'Kanojen konga avaruudessa!',
      pinballFlock: 'Varo – ne kimpoilevat!',
      diamondDance: 'Timanttitanssi!',
      loopSquad: 'Silmukkaparvi syöksyy!',
      twinFlanks: 'Hyökkäys molemmilta sivuilta!',
      checkerWall: 'Shakkilautamuuri – kypärät joka toisella ruudulla!',
      columnDrop: 'Pylväät putoavat!',
      arrowhead: 'Nuolenkärki suuntaa suoraan sinua kohti!',
      sniperNest: 'Tarkka-ampujat tähtäävät sinua!',
      medicSquad: 'Hoitajat paikkaavat kypäriä!',
      turkeyRaid: 'Kalkkunat hyökkäävät!',
      ufoAmbush: 'UFO-väijytys – varo sädettä!',
      eggeroid: 'Munasteroidi ajelehtii sektoriin!',
      iceQueen: 'Jääkuningatar vaatii valtaistuimensa!',
      roboRooster: 'Robokukko on rakennettu sotaan!',
      galacticRooster: 'Galaktinen Kukko odottaa!',
      eggTrio: 'Munatrio lentää muodostelmassa!',
      eggTrioFire: 'Tulitrio – varo hehkuvia munia!',
      chickenCruiser: 'Kanaristeilijä ylittää kentän!',
      chickenCruiserMk2: 'Kanaristeilijä MK II – nopeammat tykit!',
      ufoMothership: 'UFO-emoalus – pysy poissa säteestä!',
    },
    showerSubtitle: {
      farm: 'Meteorisade!',
      asteroids: 'Metallimyrsky – panssarikivet kestävät 6 osumaa!',
      ice: 'Jäälohkareita taivaalta – isot hajoavat!',
      volcano: 'Tulisade – hehkuvat ovat salamannopeita!',
      mothership: 'Kaaossade – kaikkea kerralla!',
    },
    bonusText: {
      title: 'BONUSRATA',
      label: 'Bonus',
      perfect: 'Täydellinen!',
      noHit: 'Ei osumaa – täysi bonus!',
      lost: 'Bonus menetetty!',
      locked: 'Ase lukittu',
      resultWord: 'Bonus',
    },
    newEnemyWord: 'UUSI',
    enemyName: {
      shield: 'Kilpikana',
      sniper: 'Tarkka-ampujakana',
      bomber: 'Pommikana',
      ninja: 'Ninjatipu',
      balloon: 'Ilmapallokana',
      medic: 'Hoitajakana',
      ufo: 'UFO-kana',
      turkey: 'Kamikazekalkkuna',
      rainbow: 'Sateenkaarikana',
    },
    enemyHint: {
      shield: 'Kupla kestää 4 osumaa ennen kanaa',
      sniper: 'Tähtää suoraan sinuun – pysy liikkeessä',
      bomber: 'Pommi hajoaa 6 sirpaleeksi keskellä ruutua',
      ninja: 'Salamannopea siksak – ammu ennen kuin se karkaa',
      balloon: 'Puhkeaa kolmeksi tipuksi, kun pallo poksahtaa',
      medic: 'Parantaa kypäriä ja kilpiä – ammu hänet ensin',
      ufo: 'Varastaa asetason – pois säteestä!',
      turkey: 'Heiluu varoitukseksi – ja syöksyy sinua kohti',
      rainbow: 'Harvinainen vieras – ammu se ja saat lisävoiman',
    },
    weaponStolen: 'Ase varastettu!',
    escaped: { ninja: 'Ninja livahti karkuun', ufo: 'UFO lensi pois', rainbow: 'Sateenkaarikana katosi' },
    waveCleared: 'Aalto selvitetty',
    perfectWave: 'Täydellinen aalto!',
    bossAngry: 'Emokana suuttuu!',
    bossLastStand: 'Viimeiset voimat!',
    bossDefeated: 'Emokana voitettu!',
    bossName: {
      motherHen: 'Emokana',
      eggeroid: 'Munasteroidi',
      iceQueen: 'Jääkuningatar',
      roboRooster: 'Robokukko',
      galacticRooster: 'Galaktinen Kukko',
      eggTrio: 'Munatrio',
      chickenCruiser: 'Kanaristeilijä',
      ufoMothership: 'UFO-emoalus',
    },
    bossIntro: {
      motherHen: 'Se haluaa parvensa takaisin!',
      eggeroid: 'Jättimäinen kivimuna – räjäytä se!',
      iceQueen: 'Pysy poissa jäälaserin radalta!',
      roboRooster: 'Ammu tykkitornit – sitten kilpi putoaa!',
      galacticRooster: 'Koko galaksin hallitsija!',
      eggTrio: 'Kolme isoa kanaa – yksi kerrallaan!',
      chickenCruiser: 'Runko on panssaroitu – tähtää torneihin!',
      ufoMothership: 'Leveä säde varastaa aseesi!',
    },
    bossPhaseText: {
      motherHen: ['Emokana suuttuu!', 'Viimeiset voimat!'],
      eggeroid: ['Kuori halkeilee!', 'Munasteroidi murtuu!'],
      iceQueen: ['Kuningatar kutsuu vartijansa!', 'Lumimyrsky!'],
      roboRooster: ['Ylikuumeneminen!', 'Laserverkko päällä!'],
      galacticRooster: ['Kukko kerää voimansa!', 'Musta aukko!'],
      eggTrio: ['Trio suuttuu!', 'Kaikki kerralla!'],
      chickenCruiser: ['Kaikki tykit valmiina!', 'Risteilijä uppoaa!'],
      ufoMothership: ['Emoalus hälytystilassa!', 'Viimeinen säde!'],
    },
    bossVariantName: { eggTrio: 'Tulitrio', chickenCruiser: 'Kanaristeilijä MK II' },
    defeatedWord: 'voitettu!',
    shieldDown: 'Kilpi alhaalla!',
    overheated: 'Ylikuumentunut!',
    extraLife: '+1 elämä',
    shieldHeld: 'Kilpi kesti!',
    missile: 'Ohjus!',
    goldenEscaped: 'Kultakana pääsi karkuun',
    pickup: { shield: 'Kilpi!', coolant: 'Jäähdytys!', missile: '+1 ohjus', drone: 'Lennokki!', slowmo: 'Hidastus!', magnet: 'Magneetti!', double: '×2 pisteet!', life: '+1 elämä' },
    weaponName: { blaster: 'Ionitykki', lightning: 'Salama', laser: 'Laser', spread: 'Sulkahaulikko', homing: 'Raketit' },
    powerupName: { drone: 'Lennokki', slowmo: 'Hidastus', magnet: 'Magneetti', double: '×2', coolant: 'Jäähdytys' },
    powerupOver: 'loppui',
    hud: { score: 'Pisteet', wave: 'Aalto', heat: 'Lämpö', weapon: 'Ase', missiles: 'Ohjukset', boss: 'Emokana', coolant: 'Jäähdytys' },
    menu: {
      title: 'Chicken Invaders',
      tagline: 'Emokana haluaa parvensa takaisin – ja koko galaksi on mukana. Viisi sektoria, bonuskenttiä, viisi asetyyppiä ja kahdeksan pomoa odottaa.',
      difficultyDetail: {
        easy: 'Rauhallinen parvi, hitaat munat',
        medium: 'Klassinen hyökkäys',
        hard: 'Nopeat syöksyt ja munasade',
        expert: 'Vain avaruusässille',
      },
      controls: { move: 'Liiku (koko ruutu)', fire: 'Ammu', missile: 'Ohjus', pause: 'Tauko', mouse: 'Alus seuraa hiirtä · klikkaus ampuu' },
      spaceKey: 'Välilyönti',
      mouseKey: 'Hiiri',
    },
    stats: { wave: 'Aalto', kills: 'Ammuttu alas', accuracy: 'Osumatarkkuus', bestChain: 'Pisin kombo', bosses: 'Pomoja voitettu', sector: 'Sektori saavutettu' },
  },
  sv: {
    locale: 'sv-SE',
    waveWord: 'Våg',
    weaponWord: 'Vapennivå',
    sectorWord: 'Sektor',
    waveLower: 'våg',
    newPlusWord: 'Nytt+',
    newPlusSubtitle: 'Galaxen från början – svårare än förut!',
    themeName: {
      farm: 'Rymdgården',
      asteroids: 'Asteroidbältet',
      ice: 'Isplaneten',
      volcano: 'Vulkanmånen',
      mothership: 'Moderskeppet',
    },
    waveSubtitle: {
      classic: 'Hönsen kommer!',
      divers: 'Se upp för dykarna!',
      armored: 'Hjälmhöns och en guldhöna!',
      meteorShower: 'Meteorregn!',
      goldRush: 'Guldregn – skjut guldmeteorerna!',
      asteroidBelt: 'Asteroidbältet – håll koll på banorna!',
      cometStorm: 'Kometstorm från hörnen!',
      blackHole: 'Svart hål – kämpa mot suget!',
      drumstickRain: 'Kycklinglårsregn – samla alla!',
      shootingGallery: 'Skjutbana – skjut guldhönsen!',
      eggDodge: 'Äggregn – undvik utan en skråma!',
      motherHen: 'Mamma Höna närmar sig!',
      vSquadron: 'V-skvadronen anfaller!',
      carousel: 'Karusellen snurrar!',
      conga: 'Hönskonga i rymden!',
      pinballFlock: 'Se upp – de studsar runt!',
      diamondDance: 'Diamantdansen!',
      loopSquad: 'Loopskvadronen dyker!',
      twinFlanks: 'Anfall från båda flankerna!',
      checkerWall: 'Schackbrädesmuren – hjälmar på varannan ruta!',
      columnDrop: 'Pelarna faller!',
      arrowhead: 'Pilspetsen går rakt mot dig!',
      sniperNest: 'Prickskyttarna har dig i siktet!',
      medicSquad: 'Sköterskorna lappar ihop hjälmarna!',
      turkeyRaid: 'Kalkonerna anfaller!',
      ufoAmbush: 'UFO-bakhåll – akta strålen!',
      eggeroid: 'Äggsteroiden driver in i sektorn!',
      iceQueen: 'Isdrottningen kräver sin tron!',
      roboRooster: 'Robotuppen är byggd för krig!',
      galacticRooster: 'Den Galaktiska Tuppen väntar!',
      eggTrio: 'Äggtrion flyger i formation!',
      eggTrioFire: 'Eldtrion – akta de glödande äggen!',
      chickenCruiser: 'Kycklingkryssaren korsar banan!',
      chickenCruiserMk2: 'Kycklingkryssaren MK II – snabbare kanoner!',
      ufoMothership: 'UFO-moderskeppet – håll dig ur strålen!',
    },
    showerSubtitle: {
      farm: 'Meteorregn!',
      asteroids: 'Metallstorm – pansarstenarna tål 6 skott!',
      ice: 'Isblock från himlen – de stora splittras!',
      volcano: 'Eldregn – de glödande är blixtsnabba!',
      mothership: 'Kaosregn – allt på en gång!',
    },
    bonusText: {
      title: 'BONUSBANA',
      label: 'Bonus',
      perfect: 'Perfekt!',
      noHit: 'Inte en skråma – full bonus!',
      lost: 'Bonusen förlorad!',
      locked: 'Vapnet låst',
      resultWord: 'Bonus',
    },
    newEnemyWord: 'NY',
    enemyName: {
      shield: 'Sköldhöna',
      sniper: 'Prickskyttehöna',
      bomber: 'Bombhöna',
      ninja: 'Ninjakyckling',
      balloon: 'Ballonghöna',
      medic: 'Sjuksköterskehöna',
      ufo: 'UFO-kyckling',
      turkey: 'Kamikazekalkon',
      rainbow: 'Regnbågshöna',
    },
    enemyHint: {
      shield: 'Bubblan tål 4 skott innan hönan kan träffas',
      sniper: 'Siktar rakt på dig – fortsätt röra dig',
      bomber: 'Bomben spricker i 6 splitter mitt på skärmen',
      ninja: 'Blixtsnabb sicksack – skjut den innan den smiter',
      balloon: 'Blir till 3 kycklingar när ballongen spricker',
      medic: 'Lagar hjälmar och sköldar – skjut henne först',
      ufo: 'Stjäl en vapennivå – ta dig ur strålen!',
      turkey: 'Vickar som varning – och störtdyker mot dig',
      rainbow: 'Sällsynt gäst – skjut den för en power-up',
    },
    weaponStolen: 'Vapen stulet!',
    escaped: { ninja: 'Ninjan smet', ufo: 'UFO:t flög iväg', rainbow: 'Regnbågshönan försvann' },
    waveCleared: 'Vågen avklarad',
    perfectWave: 'Perfekt våg!',
    bossAngry: 'Mamma Höna blir arg!',
    bossLastStand: 'Sista striden!',
    bossDefeated: 'Mamma Höna besegrad!',
    bossName: {
      motherHen: 'Mamma Höna',
      eggeroid: 'Äggsteroiden',
      iceQueen: 'Isdrottningen',
      roboRooster: 'Robotuppen',
      galacticRooster: 'Den Galaktiska Tuppen',
      eggTrio: 'Äggtrion',
      chickenCruiser: 'Kycklingkryssaren',
      ufoMothership: 'UFO-moderskeppet',
    },
    bossIntro: {
      motherHen: 'Hon vill ha tillbaka sin flock!',
      eggeroid: 'Ett jätteägg av sten – skjut sönder det!',
      iceQueen: 'Håll dig borta från frostlaserns bana!',
      roboRooster: 'Skjut bort kanontornen – då faller skölden!',
      galacticRooster: 'Härskaren över hela galaxen!',
      eggTrio: 'Tre stora hönor – en i taget!',
      chickenCruiser: 'Skrovet är pansrat – sikta på tornen!',
      ufoMothership: 'Den breda strålen stjäl ditt vapen!',
    },
    bossPhaseText: {
      motherHen: ['Mamma Höna blir arg!', 'Sista striden!'],
      eggeroid: ['Skalet spricker!', 'Äggsteroiden brister!'],
      iceQueen: ['Drottningen kallar sin vakt!', 'Snöstorm!'],
      roboRooster: ['Överhettning!', 'Lasernät aktiverat!'],
      galacticRooster: ['Tuppen samlar kraft!', 'Svart hål!'],
      eggTrio: ['Trion blir sur!', 'Alla på en gång!'],
      chickenCruiser: ['Alla kanoner redo!', 'Kryssaren sjunker!'],
      ufoMothership: ['Moderskeppet i larmläge!', 'Sista strålen!'],
    },
    bossVariantName: { eggTrio: 'Eldtrion', chickenCruiser: 'Kycklingkryssaren MK II' },
    defeatedWord: 'besegrad!',
    shieldDown: 'Skölden är nere!',
    overheated: 'Överhettad!',
    extraLife: '+1 liv',
    shieldHeld: 'Skölden höll!',
    missile: 'Missil!',
    goldenEscaped: 'Guldhönan kom undan',
    pickup: { shield: 'Sköld!', coolant: 'Kylning!', missile: '+1 missil', drone: 'Drönare!', slowmo: 'Slowmotion!', magnet: 'Magnet!', double: '×2 poäng!', life: '+1 liv' },
    weaponName: { blaster: 'Jonkanon', lightning: 'Blixt', laser: 'Laser', spread: 'Fjäderhagel', homing: 'Raketer' },
    powerupName: { drone: 'Drönare', slowmo: 'Slowmotion', magnet: 'Magnet', double: '×2', coolant: 'Kylning' },
    powerupOver: 'slut',
    hud: { score: 'Poäng', wave: 'Våg', heat: 'Värme', weapon: 'Vapen', missiles: 'Missiler', boss: 'Mamma Höna', coolant: 'Kylning' },
    menu: {
      title: 'Chicken Invaders',
      tagline: 'Mamma Höna vill ha tillbaka sin flock – och hela galaxen är med. Fem sektorer, bonusbanor, fem vapentyper och åtta bossar väntar.',
      difficultyDetail: {
        easy: 'Lugn flock, långsamma ägg',
        medium: 'Den klassiska invasionen',
        hard: 'Snabba dyk och äggregn',
        expert: 'Bara för rymdpiloter',
      },
      controls: { move: 'Flytta (hela skärmen)', fire: 'Skjut', missile: 'Missil', pause: 'Paus', mouse: 'Skeppet följer musen · klick skjuter' },
      spaceKey: 'Mellanslag',
      mouseKey: 'Mus',
    },
    stats: { wave: 'Våg', kills: 'Nedskjutna', accuracy: 'Träffsäkerhet', bestChain: 'Längsta kombo', bosses: 'Bossar besegrade', sector: 'Sektor nådd' },
  },
}

export function chickenLabels(language: string): ChickenLabels {
  const { waveWord, weaponWord, sectorWord, waveLower, newPlusWord, newEnemyWord, showerSubtitle, bonusText, bossPhaseText, bossVariantName, defeatedWord, ...text } = TEXT[(language in TEXT ? language : 'da') as Lang]
  const { resultWord, ...bonus } = bonusText
  const formatter = new Intl.NumberFormat(text.locale)
  const percentFormatter = new Intl.NumberFormat(text.locale, { style: 'percent', maximumFractionDigits: 0 })
  const newPlus = (round: number) => (round <= 1 ? newPlusWord : `${newPlusWord} ${round}`)
  const bossTitle = (id: BossId, variant: number) => (variant > 0 && (id === 'eggTrio' || id === 'chickenCruiser') ? bossVariantName[id] : text.bossName[id])
  return {
    ...text,
    bossTitle,
    bossPhaseLine: (id, phase) => bossPhaseText[id][phase >= 3 ? 1 : 0],
    bossDefeatedFor: (id, variant) => `${bossTitle(id, variant)} ${defeatedWord}`,
    sectorReached: (sector, round) => (round > 0 ? `${sector} · ${newPlus(round)}` : String(sector)),
    points: (value) => formatter.format(value),
    percent: (value) => percentFormatter.format(value),
    wave: (wave) => `${waveWord} ${wave}`,
    weaponLevel: (level) => `${weaponWord} ${level}`,
    weaponGift: (family, level) => `${text.weaponName[family]} ${level}`,
    newEnemy: (kind) => `${newEnemyWord}: ${text.enemyName[kind]}`,
    hazardSubtitle: (hazard, theme) => (hazard === 'meteorShower' ? showerSubtitle[theme] : text.waveSubtitle[hazard]),
    bonus: { ...bonus, result: (value) => `${resultWord}: ${formatter.format(value)}` },
    newPlus,
    sectorWave: (sector, slot, round) =>
      `${round > 0 ? `${newPlus(round)} · ` : ''}${sectorWord} ${sector + 1} – ${waveLower} ${slot + 1}/${WAVES_PER_SECTOR}`,
    sectorTitle: (sector, theme) =>
      `${sectorWord} ${sector + 1} · ${text.themeName[theme]}`.toLocaleUpperCase(text.locale),
  }
}
