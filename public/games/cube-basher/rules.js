// Cube Basher: rene spilregler uden three.js og DOM, så de kan testes (src/games/cubeBasher/rules.test.ts).

export const LANGS = ['da', 'en', 'fi', 'sv'];
export const WIN_TIME = 1800;
export const MAX_LEVEL = 8;
export const MAX_WEAPONS = 5;
export const BOSS_TIMES = [300, 600, 900, 1200, 1500];
export const BOSS_NAMES = ['MEGACUBE', 'GIGACUBE', 'TERACUBE', 'PETACUBE', 'OMEGACUBE'];

export function pickLanguage(search) {
  const lang = new URLSearchParams(search || '').get('lang');
  return LANGS.includes(lang) ? lang : 'en';
}

export function fmt(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

/* ---------- characters & permanent upgrades ---------- */
export const CHARACTERS = [
  { id: 'bonky', emoji: '🔨', name: 'BONKY', hp: 100, speed: 8.0, weapon: 'hammer', shirt: 0xe8642c, pants: 0x4a3b66, hair: 0x5a3413, band: 0xffd23e, build: 1.0 },
  { id: 'zippy', emoji: '🪃', name: 'ZIPPY', hp: 75, speed: 10.0, weapon: 'boomerang', shirt: 0x3aa8e8, pants: 0x2c3e66, hair: 0xf2e23e, band: 0xff5577, build: 0.9 },
  { id: 'chonk', emoji: '💀', name: 'CHONK', hp: 160, speed: 7.0, weapon: 'orbs', shirt: 0x8a93a8, pants: 0x3a3f52, hair: 0x2a2a33, band: 0x7dff6a, build: 1.18 },
];

export const META = [
  { id: 'dmg', emoji: '💪', max: 10, base: 30 },
  { id: 'hp', emoji: '❤️', max: 10, base: 25 },
  { id: 'speed', emoji: '👟', max: 8, base: 35 },
  { id: 'regen', emoji: '🌿', max: 8, base: 40 },
  { id: 'stamina', emoji: '⚡', max: 8, base: 30 },
  { id: 'gold', emoji: '💰', max: 8, base: 45 },
  { id: 'magnet', emoji: '🧲', max: 8, base: 30 },
  { id: 'xp', emoji: '📘', max: 8, base: 50 },
];

/* ---------- weapons ---------- */
export const WEAPON_IDS = ['hammer', 'orbs', 'fireball', 'lightning', 'boomerang', 'frost', 'rail', 'chain', 'blades', 'poison', 'meteor'];
export const WEAPON_EMOJI = {
  hammer: '🔨', orbs: '🪩', fireball: '🔥', lightning: '⚡', boomerang: '🪃', frost: '❄️',
  rail: '🔷', chain: '🌩️', blades: '🌀', poison: '☠️', meteor: '☄️',
};
export const EVOLUTION_EMOJI = {
  hammer: '🌋', orbs: '🌌', fireball: '🌞', lightning: '⛈️', boomerang: '🌪️', frost: '🏔️',
  rail: '💎', chain: '🕸️', blades: '⚙️', poison: '🦠', meteor: '🌠',
};

const BASE_STATS = {
  hammer: l => ({ dmg: 14 + l * 8, r: 3.4 + l * 0.5, cd: 1.7 - l * 0.12 }),
  orbs: l => ({ n: 1 + Math.ceil(l / 2), dmg: 10 + l * 6, r: 2.6 + l * 0.18, speed: 2.4 + l * 0.25 }),
  fireball: l => ({ n: l >= 4 ? 2 : 1, dmg: 18 + l * 10, cd: 1.5 - l * 0.1, boom: 2.6 + l * 0.3 }),
  lightning: l => ({ n: 1 + Math.floor(l / 2), dmg: 22 + l * 12, cd: 2.2 - l * 0.18 }),
  boomerang: l => ({ n: l >= 3 ? 2 : 1, dmg: 12 + l * 7, cd: 1.6 - l * 0.13, range: 11 + l * 1.2 }),
  frost: l => ({ dmg: 8 + l * 5, r: 4.2 + l * 0.45, slow: 2.2 + l * 0.25, cd: 4.2 - l * 0.32, slowMult: 0.55 }),
  rail: l => ({ n: l >= 5 ? 2 : 1, dmg: 22 + l * 12, range: 26, cd: 2.5 - l * 0.18 }),
  chain: l => ({ n: 1, dmg: 16 + l * 8, jumps: 2 + Math.ceil(l / 2), hop: 7, cd: 1.9 - l * 0.1 }),
  blades: l => ({ n: 2 + Math.floor(l / 2), dmg: 9 + l * 5, reach: 6 + l * 0.4, life: 1.6, cd: 2.4 - l * 0.12 }),
  poison: l => ({ n: 1 + Math.floor(l / 4), dmg: 6 + l * 3.5, r: 2.2 + l * 0.2, dur: 3 + l * 0.25, cd: 3.0 - l * 0.15 }),
  meteor: l => ({ n: 1 + Math.floor(l / 3), dmg: 40 + l * 18, r: 3 + l * 0.25, delay: 0.9, cd: 4.5 - l * 0.25 }),
};

const EVOLVED_STATS = {
  hammer: s => ({ ...s, dmg: s.dmg * 1.6, r: s.r * 1.35, stun: 0.8 }),
  orbs: s => ({ ...s, n: 8, dmg: s.dmg * 1.5, r: s.r + 1.2, speed: s.speed * 1.2 }),
  fireball: s => ({ ...s, n: 4, dmg: s.dmg * 1.4, boom: s.boom * 1.3, burn: 2.5 }),
  lightning: s => ({ ...s, n: s.n * 2, dmg: s.dmg * 1.4, chain: 2 }),
  boomerang: s => ({ ...s, n: 4, dmg: s.dmg * 1.4, range: s.range * 1.4 }),
  frost: s => ({ ...s, dmg: s.dmg * 1.6, r: s.r * 1.4, cd: s.cd * 0.7, slowMult: 0.2 }),
  rail: s => ({ ...s, n: 6, dmg: s.dmg * 1.4 }),
  chain: s => ({ ...s, n: 3, dmg: s.dmg * 1.3, jumps: s.jumps + 6 }),
  blades: s => ({ ...s, n: 8, dmg: s.dmg * 1.5, reach: s.reach * 1.3 }),
  poison: s => ({ ...s, dmg: s.dmg * 2, r: s.r * 1.5, dur: s.dur + 2 }),
  meteor: s => ({ ...s, n: s.n * 2, dmg: s.dmg * 1.3, cd: s.cd * 0.75 }),
};

const AREA_KEYS = ['r', 'boom', 'reach'];

/** Stats for a weapon level; `extra` adds projectiles, `area` scales radii (Extra Shot / Big Swing). */
export function weaponStats(id, level, { evolved = false, extra = 0, area = 1 } = {}) {
  let stats = BASE_STATS[id](level);
  if (evolved) stats = EVOLVED_STATS[id](stats);
  stats.dmg = Math.round(stats.dmg);
  if (stats.n !== undefined) stats.n += extra;
  for (const key of AREA_KEYS) if (stats[key] !== undefined) stats[key] *= area;
  return stats;
}

export function describeWeapon(lang, id, level, mods = {}) {
  const stats = weaponStats(id, level, mods);
  const vars = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value !== 'number') continue;
    vars[key] = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', lang === 'en' ? '.' : ',');
  }
  const t = text(lang);
  return fmt(mods.evolved ? t.evolutions[id].desc : t.weapons[id].desc, vars);
}

/* ---------- passives ---------- */
export const PASSIVES = [
  { id: 'hp', emoji: '❤️', max: null, apply(p) { p.maxhp += 25; p.hp += 25; } },
  { id: 'speed', emoji: '👟', max: null, apply(p) { p.speedMult += 0.08; } },
  { id: 'dmg', emoji: '💪', max: null, apply(p) { p.dmgMult += 0.12; } },
  { id: 'cd', emoji: '⏱️', max: null, apply(p) { p.cdMult *= 0.92; } },
  { id: 'magnet', emoji: '🧲', max: null, apply(p) { p.magnet *= 1.35; } },
  { id: 'armor', emoji: '🛡️', max: null, apply(p) { p.armor += 2; } },
  { id: 'regen', emoji: '🌿', max: null, apply(p) { p.regen += 0.8; } },
  { id: 'crit', emoji: '🎯', max: null, apply(p) { p.crit += 0.06; } },
  { id: 'sprint', emoji: '💨', max: null, apply(p) { p.sprintMult *= 1.12; } },
  { id: 'lungs', emoji: '🫁', max: null, apply(p) { p.staminaMax += 30; p.stamina += 30; } },
  { id: 'wind', emoji: '🌬️', max: null, apply(p) { p.staminaRegen *= 1.35; } },
  { id: 'vamp', emoji: '🧛', max: 3, apply(p) { p.lifesteal += 0.3; } },
  { id: 'thorns', emoji: '🌵', max: 3, apply(p) { p.thorns += 0.6; } },
  { id: 'multishot', emoji: '🎆', max: 2, apply(p) { p.extra += 1; } },
  { id: 'area', emoji: '🌀', max: 5, apply(p) { p.area += 0.12; } },
  { id: 'revive', emoji: '👼', max: 1, apply(p) { p.revives += 1; } },
];

export function passiveAvailable(id, passives) {
  const def = PASSIVES.find(entry => entry.id === id);
  return !!def && (def.max === null || (passives[id] || 0) < def.max);
}

/* ---------- evolutions, cards & chests ---------- */
export const EVOLUTIONS = {
  hammer: 'dmg', orbs: 'cd', fireball: 'area', lightning: 'crit', boomerang: 'speed', frost: 'armor',
  rail: 'multishot', chain: 'magnet', blades: 'sprint', poison: 'regen', meteor: 'hp',
};

export function readyEvolutions({ weapons, passives, evolved = {} }) {
  return WEAPON_IDS.filter(id => (weapons[id] || 0) >= MAX_LEVEL && (passives[EVOLUTIONS[id]] || 0) > 0 && !evolved[id]);
}

const take = (list, rng) => list.splice(Math.floor(rng() * list.length), 1)[0];

/** Level-up choices: a ready evolution is always the first card. */
export function rollCards(state, rng, count = 3) {
  const picks = [];
  const ready = readyEvolutions(state);
  if (ready.length) picks.push({ kind: 'evolution', id: ready[Math.floor(rng() * ready.length)] });
  const owned = Object.keys(state.weapons).length;
  const options = [];
  for (const id of WEAPON_IDS) {
    const current = state.weapons[id] || 0;
    if (current >= MAX_LEVEL || (!current && owned >= MAX_WEAPONS)) continue;
    options.push({ kind: 'weapon', id, level: current + 1 });
  }
  for (const passive of PASSIVES) if (passiveAvailable(passive.id, state.passives)) options.push({ kind: 'passive', id: passive.id });
  while (picks.length < count && options.length) picks.push(take(options, rng));
  return picks;
}

/** Chest contents: the evolution if ready, otherwise upgrades of things already owned. */
export function rollChest(state, rng, { boss = false } = {}) {
  const items = [];
  const ready = readyEvolutions(state);
  if (ready.length) items.push({ kind: 'evolution', id: ready[0] });
  const pool = [];
  for (const id of Object.keys(state.weapons)) if (state.weapons[id] < MAX_LEVEL) pool.push({ kind: 'weapon', id, level: state.weapons[id] + 1 });
  for (const id of Object.keys(state.passives)) if (passiveAvailable(id, state.passives)) pool.push({ kind: 'passive', id });
  while (items.length < (boss ? 3 : 1) && pool.length) items.push(take(pool, rng));
  const gold = Math.round(boss ? 60 + rng() * 40 : 15 + rng() * 15);
  return { items, gold };
}

/* ---------- world events ---------- */
export const EVENTS = [
  { id: 'meteor', emoji: '☄️', duration: 15 },
  { id: 'goldrush', emoji: '💰', duration: 20 },
  { id: 'swarm', emoji: '🐝', duration: 8 },
  { id: 'bloodmoon', emoji: '🌕', duration: 30, night: true },
];

export const firstEventTime = rng => 120 + rng() * 60;
export const nextEventTime = (t, rng) => t + 150 + rng() * 90;

export function chooseEvent(t, lastId, rng) {
  const phase = dayPhase(t).id;
  const options = EVENTS.filter(event => event.id !== lastId && (!event.night || phase === 'dusk' || phase === 'night'));
  return options[Math.floor(rng() * options.length)].id;
}

export function eventBlockedByBoss(t, id, bossTimes = BOSS_TIMES) {
  const event = EVENTS.find(entry => entry.id === id);
  return bossTimes.some(bossTime => bossTime >= t - 20 && bossTime <= t + event.duration + 10);
}

/* ---------- day cycle: dawn -> night over the 30 minute run ---------- */
export const DAY_PALETTES = {
  dawn: { at: 0, skyTop: 0x5a78c0, skyMid: 0xf2b8b0, skyBot: 0xfbe0c2, fog: 0xf0d8c8, sun: 0xffc8a0, sunIntensity: 2.3, hemiSky: 0xd8ccff, hemiGround: 0x7a7a60, hemiIntensity: 0.9, sunDir: [0.8, 0.3, 0.3], stars: 0, bloom: 0.32 },
  day: { at: 0.15, skyTop: 0x2f6fd6, skyMid: 0x86b9f0, skyBot: 0xd4e6f5, fog: 0xcfe0ee, sun: 0xfff1d6, sunIntensity: 2.6, hemiSky: 0xbfd8ff, hemiGround: 0x5a7a55, hemiIntensity: 0.8, sunDir: [0.35, 0.75, 0.3], stars: 0, bloom: 0.3 },
  golden: { at: 0.55, skyTop: 0x3a5fa8, skyMid: 0xf0b070, skyBot: 0xffd9a0, fog: 0xf0cfa0, sun: 0xffc070, sunIntensity: 2.4, hemiSky: 0xffd2a8, hemiGround: 0x6a5a40, hemiIntensity: 0.74, sunDir: [-0.6, 0.35, 0.35], stars: 0, bloom: 0.36 },
  dusk: { at: 0.72, skyTop: 0x2a2a6a, skyMid: 0xc0608a, skyBot: 0xff9a70, fog: 0x9a7a9a, sun: 0xff8a60, sunIntensity: 1.5, hemiSky: 0x9a8ad0, hemiGround: 0x4a3a4a, hemiIntensity: 0.64, sunDir: [-0.85, 0.15, 0.3], stars: 0.35, bloom: 0.45 },
  night: { at: 0.86, skyTop: 0x070b24, skyMid: 0x1a2350, skyBot: 0x2e3a6a, fog: 0x1c2448, sun: 0x9fb8ff, sunIntensity: 0.95, hemiSky: 0x6a7ad8, hemiGround: 0x1a2030, hemiIntensity: 0.58, sunDir: [0.3, 0.7, -0.4], stars: 1, bloom: 0.6 },
};
const PHASE_ORDER = ['dawn', 'day', 'golden', 'dusk', 'night'];
const COLOR_KEYS = ['skyTop', 'skyMid', 'skyBot', 'fog', 'sun', 'hemiSky', 'hemiGround'];

export function mixHex(a, b, k) {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 255, cb = (b >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * k) << shift;
  }
  return out;
}

/** Current phase plus the blend toward the next one (smoothstep). */
export function dayPhase(t, total = WIN_TIME) {
  const f = Math.min(1, Math.max(0, t / total));
  for (let i = PHASE_ORDER.length - 1; i >= 0; i--) {
    const from = PHASE_ORDER[i];
    if (f < DAY_PALETTES[from].at) continue;
    const to = PHASE_ORDER[i + 1];
    if (!to) return { id: from, from, to: from, mix: 0 };
    const linear = (f - DAY_PALETTES[from].at) / (DAY_PALETTES[to].at - DAY_PALETTES[from].at);
    const mix = linear * linear * (3 - 2 * linear);
    return { id: linear < 0.5 ? from : to, from, to, mix };
  }
  return { id: 'dawn', from: 'dawn', to: 'dawn', mix: 0 };
}

export function paletteAt(t, total = WIN_TIME) {
  const { from, to, mix } = dayPhase(t, total);
  const a = DAY_PALETTES[from], b = DAY_PALETTES[to];
  const out = {};
  for (const key of Object.keys(a)) {
    if (key === 'at') continue;
    if (COLOR_KEYS.includes(key)) out[key] = mixHex(a[key], b[key], mix);
    else if (Array.isArray(a[key])) out[key] = a[key].map((value, i) => value + (b[key][i] - value) * mix);
    else out[key] = a[key] + (b[key] - a[key]) * mix;
  }
  return out;
}

/* ---------- enemies ---------- */
export const ENEMY_TYPES = {
  grunt: { hp: 22, speed: 3.6, dmg: 7, r: 0.7, scale: 1.0, color: 0x6fbf3f, xp: 1, shape: 'box' },
  runner: { hp: 13, speed: 6.2, dmg: 6, r: 0.55, scale: 0.75, color: 0x52a8e8, xp: 1, shape: 'ico' },
  brute: { hp: 95, speed: 2.9, dmg: 20, r: 1.15, scale: 1.7, color: 0xd45252, xp: 3, shape: 'box' },
  spitter: { hp: 34, speed: 3.4, dmg: 12, r: 0.8, scale: 1.05, color: 0x9a5ce8, xp: 2, shape: 'box', ranged: true },
  bomber: { hp: 16, speed: 5.2, dmg: 0, r: 0.65, scale: 0.9, color: 0xff7a3d, xp: 2, shape: 'bomb', bomber: true, blast: 3.4, blastDmg: 24 },
  armored: { hp: 70, speed: 2.7, dmg: 15, r: 0.95, scale: 1.3, color: 0x8ea2c4, xp: 3, shape: 'box', armor: 8 },
  blinker: { hp: 30, speed: 3.3, dmg: 10, r: 0.7, scale: 0.95, color: 0x3fe0d0, xp: 2, shape: 'ico', blink: true },
  elite: { hp: 750, speed: 3.4, dmg: 26, r: 1.7, scale: 2.6, color: 0xc05ce8, xp: 12, shape: 'box', elite: true },
  boss: { hp: 4200, speed: 3.0, dmg: 34, r: 2.6, scale: 4.0, color: 0xff9b2e, xp: 40, shape: 'box', boss: true },
};
export const ENEMY_POOL_MAX = { grunt: 420, runner: 260, brute: 190, spitter: 150, bomber: 80, armored: 120, blinker: 80, elite: 40, boss: 8 };

/** Horde mix over time; `r2` only reshuffles the grunt share so the original mix is kept. */
export function pickEnemyType(t, r, r2) {
  let type = 'grunt';
  if (t > 40 && r < 0.28) type = 'runner';
  if (t > 360 && r >= 0.62 && r < 0.76) type = 'spitter';
  if (t > 120 && r > (t > 900 ? 0.78 : 0.84)) type = 'brute';
  if (type === 'grunt') {
    if (t > 180 && r2 < 0.12) type = 'bomber';
    else if (t > 480 && r2 >= 0.12 && r2 < 0.22) type = 'armored';
    else if (t > 600 && r2 >= 0.22 && r2 < 0.29) type = 'blinker';
  }
  return type;
}

export const armorDamage = (amount, armor) => Math.max(1, Math.round(amount - armor));

export function updateRecord(save, run) {
  const best = save.best || { time: 0, kills: 0, level: 0 };
  const beaten = { time: run.time > best.time, kills: run.kills > best.kills, level: run.level > best.level };
  save.best = { time: Math.max(best.time, run.time), kills: Math.max(best.kills, run.kills), level: Math.max(best.level, run.level) };
  return beaten;
}

/* ---------- texts ---------- */
export const TEXT = {
  en: {
    subtitle: "~ they're evil cubes. you have a hammer. ~",
    coins: '{n} coins',
    start: 'BASH!',
    upgrades: 'UPGRADES',
    controls: 'WASD — move · SHIFT — sprint · SPACE — jump over enemies & up ledges · drag mouse — orbit camera · scroll — zoom',
    controls2: 'Smash glowing pots for food · open chests · survive 30 minutes from dawn till night',
    hint: 'WASD move · SHIFT sprint · SPACE jump · drag = camera · scroll = zoom · P pause · M mute',
    best: 'Best run: {time} · {kills} cubes · level {level}',
    noBest: 'No record yet — go bash!',
    levelUp: 'LEVEL UP!',
    levelUpMulti: 'LEVEL UP! (×{n})',
    cardNew: 'NEW!',
    cardLevel: 'LV {from} → {to}',
    cardOwned: 'owned ×{n}',
    cardMax: 'max {n}',
    tagWeapon: 'WEAPON',
    tagPassive: 'PASSIVE',
    tagEvolution: 'EVOLUTION',
    evolveHint: 'Max {weapon} + {passive}',
    evolvesWith: 'Evolves with {passive}',
    chestTitle: 'TREASURE CHEST!',
    chestBossTitle: 'BOSS TREASURE!',
    chestGold: '+{n} gold',
    chestTake: 'COLLECT',
    dead: 'YOU GOT BASHED',
    win: 'YOU BASHED THE WORLD',
    retry: 'TRY AGAIN',
    oneMore: 'ONE MORE RUN',
    menu: 'MENU',
    shopTitle: 'UPGRADE LAB',
    back: 'BACK',
    maxed: 'MAXED',
    resetSave: 'reset all progress',
    resetConfirm: 'Reset ALL progress (coins, upgrades and record)?',
    paused: 'PAUSED',
    resume: 'press P or Esc to resume',
    statSurvived: 'survived',
    statLevel: 'level',
    statKills: 'cubes bashed',
    statGems: 'gems eaten',
    statBanked: 'coins banked',
    statTotal: 'total',
    statEvolutions: 'evolutions',
    newRecord: 'NEW RECORD!',
    eliteIncoming: 'ELITE CUBE INCOMING',
    bossAwakens: '{name} AWAKENS',
    newEnemy: 'NEW: {name}',
    rampage: 'RAMPAGE +{n}g',
    chest: 'CHEST!',
    gemRush: 'GEM RUSH!',
    food: 'FOOD!',
    blocked: 'BLOCKED',
    outOfBounds: 'OUT OF BOUNDS!',
    revived: 'SECOND LIFE!',
    eventEnds: '{name} is over',
    phases: { dawn: 'Dawn', day: 'Day', golden: 'Golden hour', dusk: 'Dusk', night: 'Night' },
    events: {
      meteor: { name: 'METEOR SHOWER', desc: 'Watch the sky — rocks hit everything!' },
      goldrush: { name: 'GOLD RUSH', desc: 'Cubes drop gold like crazy' },
      swarm: { name: 'SWARM', desc: 'They have you surrounded!' },
      bloodmoon: { name: 'BLOOD MOON', desc: 'Faster cubes · double XP' },
    },
    enemies: { grunt: 'Grunt Cube', runner: 'Spider Cube', brute: 'Brute Cube', spitter: 'Spitter Cube', bomber: 'Bomb Cube', armored: 'Armor Cube', blinker: 'Blink Cube', elite: 'Elite Cube', boss: 'Boss Cube' },
    heroTitles: { bonky: 'Viking Basher', zippy: 'Fox Scout', chonk: 'Stone Paladin' },
    characters: {
      bonky: 'The classic. Balanced stats.<br>Starts with Basher Hammer.',
      zippy: '+25% move speed, fragile.<br>Starts with Boomerang.',
      chonk: '+60 max HP, a bit slow.<br>Starts with Bash Orbs.',
    },
    meta: {
      dmg: { name: 'Power', desc: '+5% damage per level' },
      hp: { name: 'Vitality', desc: '+10 max HP per level' },
      speed: { name: 'Swiftness', desc: '+3% move speed per level' },
      regen: { name: 'Recovery', desc: '+0.15 HP/s regen per level' },
      stamina: { name: 'Endurance', desc: '+12 max stamina per level' },
      gold: { name: 'Greed', desc: '+10% gold found per level' },
      magnet: { name: 'Magnetism', desc: '+8% pickup radius per level' },
      xp: { name: 'Wisdom', desc: '+6% XP gained per level' },
    },
    weapons: {
      hammer: { name: 'Basher Hammer', desc: 'Slams the ground around you.<br>DMG {dmg} · radius {r}' },
      orbs: { name: 'Bash Orbs', desc: '{n} orbs circle you and swat<br>enemies and shots. DMG {dmg}' },
      fireball: { name: 'Fireball', desc: 'Hurls {n}× exploding fireballs at<br>the nearest enemy. DMG {dmg}' },
      lightning: { name: 'Sky Zapper', desc: 'Lightning strikes {n} random<br>enemies. DMG {dmg}' },
      boomerang: { name: 'Boomerang', desc: 'Throws {n}× piercing boomerangs<br>that fly out and return. DMG {dmg}' },
      frost: { name: 'Frost Nova', desc: 'Icy pulse: DMG {dmg} and slows<br>cubes for {slow}s' },
      rail: { name: 'Cube Cannon', desc: 'Fires {n}× piercing bolts straight<br>through the horde. DMG {dmg}' },
      chain: { name: 'Chain Spark', desc: 'A spark jumps between {jumps}<br>enemies. DMG {dmg}' },
      blades: { name: 'Spin Blades', desc: '{n} blades spiral out and slice<br>everything. DMG {dmg}' },
      poison: { name: 'Toxic Cloud', desc: 'Leaves {n}× poison clouds that<br>hurt {dmg}/s for {dur}s' },
      meteor: { name: 'Meteor', desc: 'Calls down {n}× meteors on the<br>horde. DMG {dmg} · radius {r}' },
    },
    evolutions: {
      hammer: { name: 'Earthshaker', desc: 'Huge quakes that stun every cube<br>nearby. DMG {dmg} · radius {r}' },
      orbs: { name: 'Galaxy Orbs', desc: '{n} orbs in a wide orbit.<br>DMG {dmg}' },
      fireball: { name: 'Inferno', desc: '{n} fireballs that leave burning<br>ground. DMG {dmg}' },
      lightning: { name: 'Thunder God', desc: '{n} strikes that chain onward.<br>DMG {dmg}' },
      boomerang: { name: 'Twin Cyclone', desc: '{n} giant boomerangs.<br>DMG {dmg} · range {range}' },
      frost: { name: 'Blizzard', desc: 'Freezes cubes almost solid for {slow}s.<br>DMG {dmg} · radius {r}' },
      rail: { name: 'Prism Cannon', desc: 'Bolts in {n} directions at once.<br>DMG {dmg}' },
      chain: { name: 'Storm Web', desc: '{n} sparks × {jumps} jumps.<br>DMG {dmg}' },
      blades: { name: 'Saw Storm', desc: '{n} blades tear through the horde.<br>DMG {dmg}' },
      poison: { name: 'Plague', desc: 'Huge clouds: {dmg}/s for {dur}s.<br>radius {r}' },
      meteor: { name: 'Starfall', desc: '{n} meteors rain down.<br>DMG {dmg} · radius {r}' },
    },
    passives: {
      hp: { name: 'Big Heart', desc: '+25 max HP (and heal 25)' },
      speed: { name: 'Zoomies', desc: '+8% move speed' },
      dmg: { name: 'Protein Shake', desc: '+12% damage' },
      cd: { name: 'Caffeine', desc: '-8% weapon cooldowns' },
      magnet: { name: 'Gem Magnet', desc: '+35% pickup radius' },
      armor: { name: 'Thick Skin', desc: '-2 damage taken per hit' },
      regen: { name: 'Salad (gross)', desc: '+0.8 HP/sec regen' },
      crit: { name: 'Lucky Bash', desc: '+6% crit chance (2× dmg)' },
      sprint: { name: 'Afterburner', desc: '+12% sprint speed' },
      lungs: { name: 'Big Lungs', desc: '+30 max stamina' },
      wind: { name: 'Second Wind', desc: '+35% stamina regen' },
      vamp: { name: 'Vampire Fangs', desc: 'Heal 0.3 HP per kill' },
      thorns: { name: 'Cactus Skin', desc: 'Return 60% of contact damage' },
      multishot: { name: 'Extra Shot', desc: '+1 projectile for every weapon' },
      area: { name: 'Big Swing', desc: '+12% weapon area' },
      revive: { name: 'Guardian Angel', desc: 'Revive once with 50% HP' },
    },
  },
  da: {
    subtitle: '~ de er onde terninger. du har en hammer. ~',
    coins: '{n} mønter',
    start: 'BANK LØS!',
    upgrades: 'OPGRADERINGER',
    controls: 'WASD — bevæg · SHIFT — spurt · MELLEMRUM — hop over fjender og op på kanter · træk med musen — drej kamera · scroll — zoom',
    controls2: 'Smadr glødende krukker for mad · åbn kister · overlev 30 minutter fra daggry til nat',
    hint: 'WASD bevæg · SHIFT spurt · MELLEMRUM hop · træk = kamera · scroll = zoom · P pause · M lyd',
    best: 'Bedste runde: {time} · {kills} terninger · niveau {level}',
    noBest: 'Ingen rekord endnu — kom i gang!',
    levelUp: 'NIVEAU OP!',
    levelUpMulti: 'NIVEAU OP! (×{n})',
    cardNew: 'NY!',
    cardLevel: 'NV {from} → {to}',
    cardOwned: 'har ×{n}',
    cardMax: 'maks. {n}',
    tagWeapon: 'VÅBEN',
    tagPassive: 'PASSIV',
    tagEvolution: 'EVOLUTION',
    evolveHint: 'Maks. {weapon} + {passive}',
    evolvesWith: 'Udvikler sig med {passive}',
    chestTitle: 'SKATTEKISTE!',
    chestBossTitle: 'BOSSENS SKAT!',
    chestGold: '+{n} guld',
    chestTake: 'TAG DET',
    dead: 'DU BLEV BANKET',
    win: 'DU BANKEDE VERDEN',
    retry: 'PRØV IGEN',
    oneMore: 'EN RUNDE TIL',
    menu: 'MENU',
    shopTitle: 'OPGRADERINGS-LAB',
    back: 'TILBAGE',
    maxed: 'MAKS',
    resetSave: 'nulstil alle fremskridt',
    resetConfirm: 'Nulstil ALLE fremskridt (mønter, opgraderinger og rekord)?',
    paused: 'PAUSE',
    resume: 'tryk P eller Esc for at fortsætte',
    statSurvived: 'overlevede',
    statLevel: 'niveau',
    statKills: 'terninger banket',
    statGems: 'krystaller spist',
    statBanked: 'mønter tjent',
    statTotal: 'i alt',
    statEvolutions: 'evolutioner',
    newRecord: 'NY REKORD!',
    eliteIncoming: 'ELITE-TERNING PÅ VEJ',
    bossAwakens: '{name} VÅGNER',
    newEnemy: 'NY: {name}',
    rampage: 'AMOK +{n}g',
    chest: 'KISTE!',
    gemRush: 'KRYSTALSTORM!',
    food: 'MAD!',
    blocked: 'BLOKERET',
    outOfBounds: 'UDEN FOR BANEN!',
    revived: 'ANDET LIV!',
    eventEnds: '{name} er slut',
    phases: { dawn: 'Daggry', day: 'Dag', golden: 'Gyldne time', dusk: 'Skumring', night: 'Nat' },
    events: {
      meteor: { name: 'METEORREGN', desc: 'Hold øje med himlen — sten rammer alt!' },
      goldrush: { name: 'GULDFEBER', desc: 'Terningerne taber guld i stride strømme' },
      swarm: { name: 'SVÆRM', desc: 'Du er omringet!' },
      bloodmoon: { name: 'BLODMÅNE', desc: 'Hurtigere terninger · dobbelt XP' },
    },
    enemies: { grunt: 'Fodterning', runner: 'Edderkopterning', brute: 'Bølleterning', spitter: 'Spytterning', bomber: 'Bombeterning', armored: 'Panserterning', blinker: 'Blinkterning', elite: 'Eliteterning', boss: 'Bossterning' },
    heroTitles: { bonky: 'Viking-banker', zippy: 'Ræve-spejder', chonk: 'Sten-paladin' },
    characters: {
      bonky: 'Klassikeren. Balancerede evner.<br>Starter med Basher-hammeren.',
      zippy: '+25 % fart, men skrøbelig.<br>Starter med boomerangen.',
      chonk: '+60 maks. liv, lidt langsom.<br>Starter med Bash-kuglerne.',
    },
    meta: {
      dmg: { name: 'Kraft', desc: '+5 % skade pr. niveau' },
      hp: { name: 'Livskraft', desc: '+10 maks. liv pr. niveau' },
      speed: { name: 'Hurtighed', desc: '+3 % fart pr. niveau' },
      regen: { name: 'Restitution', desc: '+0,15 liv/s pr. niveau' },
      stamina: { name: 'Udholdenhed', desc: '+12 maks. stamina pr. niveau' },
      gold: { name: 'Grådighed', desc: '+10 % guld pr. niveau' },
      magnet: { name: 'Magnetisme', desc: '+8 % opsamlingsradius pr. niveau' },
      xp: { name: 'Visdom', desc: '+6 % XP pr. niveau' },
    },
    weapons: {
      hammer: { name: 'Basher-hammer', desc: 'Banker jorden rundt om dig.<br>SKADE {dmg} · radius {r}' },
      orbs: { name: 'Bash-kugler', desc: '{n} kugler kredser om dig og slår<br>fjender og skud væk. SKADE {dmg}' },
      fireball: { name: 'Ildkugle', desc: 'Kaster {n}× eksploderende ildkugler<br>mod nærmeste fjende. SKADE {dmg}' },
      lightning: { name: 'Himmelzapper', desc: 'Lynet rammer {n} tilfældige<br>fjender. SKADE {dmg}' },
      boomerang: { name: 'Boomerang', desc: 'Kaster {n}× gennemborende boomeranger,<br>der flyver ud og tilbage. SKADE {dmg}' },
      frost: { name: 'Frostnova', desc: 'Iskold puls: SKADE {dmg} og bremser<br>terninger i {slow} s' },
      rail: { name: 'Terningkanon', desc: 'Skyder {n}× gennemborende skud lige<br>gennem horden. SKADE {dmg}' },
      chain: { name: 'Kædelyn', desc: 'En gnist springer mellem {jumps}<br>fjender. SKADE {dmg}' },
      blades: { name: 'Savklinger', desc: '{n} klinger spiraler ud og skærer<br>alt over. SKADE {dmg}' },
      poison: { name: 'Giftsky', desc: 'Efterlader {n}× giftskyer, der gør<br>{dmg}/s i {dur} s' },
      meteor: { name: 'Meteor', desc: 'Kalder {n}× meteorer ned over<br>horden. SKADE {dmg} · radius {r}' },
    },
    evolutions: {
      hammer: { name: 'Jordskælvshammer', desc: 'Kæmpe skælv, der lammer alle terninger<br>tæt på. SKADE {dmg} · radius {r}' },
      orbs: { name: 'Galaksekugler', desc: '{n} kugler i en bred bane.<br>SKADE {dmg}' },
      fireball: { name: 'Inferno', desc: '{n} ildkugler, der efterlader brændende<br>jord. SKADE {dmg}' },
      lightning: { name: 'Tordengud', desc: '{n} lynnedslag, der kæder videre.<br>SKADE {dmg}' },
      boomerang: { name: 'Tvillingecyklon', desc: '{n} kæmpe boomeranger.<br>SKADE {dmg} · rækkevidde {range}' },
      frost: { name: 'Snestorm', desc: 'Fryser terninger næsten fast i {slow} s.<br>SKADE {dmg} · radius {r}' },
      rail: { name: 'Prismekanon', desc: 'Skud i {n} retninger på én gang.<br>SKADE {dmg}' },
      chain: { name: 'Stormnet', desc: '{n} gnister × {jumps} spring.<br>SKADE {dmg}' },
      blades: { name: 'Savstorm', desc: '{n} klinger flår gennem horden.<br>SKADE {dmg}' },
      poison: { name: 'Pest', desc: 'Kæmpe skyer: {dmg}/s i {dur} s.<br>radius {r}' },
      meteor: { name: 'Stjerneregn', desc: '{n} meteorer regner ned.<br>SKADE {dmg} · radius {r}' },
    },
    passives: {
      hp: { name: 'Stort hjerte', desc: '+25 maks. liv (og hel 25)' },
      speed: { name: 'Turbo-ben', desc: '+8 % fart' },
      dmg: { name: 'Proteinshake', desc: '+12 % skade' },
      cd: { name: 'Koffein', desc: '-8 % våben-nedkøling' },
      magnet: { name: 'Krystalmagnet', desc: '+35 % opsamlingsradius' },
      armor: { name: 'Tyk hud', desc: '-2 skade pr. slag' },
      regen: { name: 'Salat (bvadr)', desc: '+0,8 liv/s' },
      crit: { name: 'Heldigt slag', desc: '+6 % kritisk chance (2× skade)' },
      sprint: { name: 'Efterbrænder', desc: '+12 % spurtfart' },
      lungs: { name: 'Store lunger', desc: '+30 maks. stamina' },
      wind: { name: 'Frisk pust', desc: '+35 % stamina-genopladning' },
      vamp: { name: 'Vampyrtand', desc: 'Hel 0,3 liv pr. drab' },
      thorns: { name: 'Tornehud', desc: 'Returnér 60 % af kontaktskade' },
      multishot: { name: 'Ekstra skud', desc: '+1 projektil til alle våben' },
      area: { name: 'Stort sving', desc: '+12 % våbenområde' },
      revive: { name: 'Skytsengel', desc: 'Genopstå én gang med 50 % liv' },
    },
  },
  fi: {
    subtitle: '~ ne ovat pahoja kuutioita. sinulla on vasara. ~',
    coins: '{n} kolikkoa',
    start: 'MURSKAA!',
    upgrades: 'PÄIVITYKSET',
    controls: 'WASD — liiku · SHIFT — juokse · VÄLILYÖNTI — hyppää vihollisten yli ja reunoille · vedä hiirellä — käännä kameraa · rulla — zoomaa',
    controls2: 'Riko hehkuvat ruukut ruoan takia · avaa arkut · selviydy 30 minuuttia aamunkoitosta yöhön',
    hint: 'WASD liiku · SHIFT juokse · VÄLILYÖNTI hyppää · vedä = kamera · rulla = zoom · P tauko · M ääni',
    best: 'Paras kierros: {time} · {kills} kuutiota · taso {level}',
    noBest: 'Ei vielä ennätystä — aloita!',
    levelUp: 'TASO NOUSI!',
    levelUpMulti: 'TASO NOUSI! (×{n})',
    cardNew: 'UUSI!',
    cardLevel: 'TASO {from} → {to}',
    cardOwned: 'omistat ×{n}',
    cardMax: 'enint. {n}',
    tagWeapon: 'ASE',
    tagPassive: 'PASSIIVI',
    tagEvolution: 'EVOLUUTIO',
    evolveHint: 'Maksimi {weapon} + {passive}',
    evolvesWith: 'Kehittyy: {passive}',
    chestTitle: 'AARREARKKU!',
    chestBossTitle: 'POMON AARRE!',
    chestGold: '+{n} kultaa',
    chestTake: 'OTA',
    dead: 'SINUT MURSKATTIIN',
    win: 'MURSKASIT MAAILMAN',
    retry: 'YRITÄ UUDELLEEN',
    oneMore: 'VIELÄ YKSI KIERROS',
    menu: 'VALIKKO',
    shopTitle: 'PÄIVITYSLABRA',
    back: 'TAKAISIN',
    maxed: 'MAKSIMI',
    resetSave: 'nollaa kaikki edistyminen',
    resetConfirm: 'Nollataanko KAIKKI edistyminen (kolikot, päivitykset ja ennätys)?',
    paused: 'TAUKO',
    resume: 'jatka painamalla P tai Esc',
    statSurvived: 'selvisit',
    statLevel: 'taso',
    statKills: 'kuutioita murskattu',
    statGems: 'kristalleja kerätty',
    statBanked: 'kolikoita ansaittu',
    statTotal: 'yhteensä',
    statEvolutions: 'evoluutiot',
    newRecord: 'UUSI ENNÄTYS!',
    eliteIncoming: 'ELIITTIKUUTIO TULOSSA',
    bossAwakens: '{name} HERÄÄ',
    newEnemy: 'UUSI: {name}',
    rampage: 'RIEHUNTA +{n}k',
    chest: 'ARKKU!',
    gemRush: 'KRISTALLIMYRSKY!',
    food: 'RUOKAA!',
    blocked: 'TORJUTTU',
    outOfBounds: 'ALUEEN ULKOPUOLELLA!',
    revived: 'TOINEN ELÄMÄ!',
    eventEnds: '{name} päättyi',
    phases: { dawn: 'Aamunkoitto', day: 'Päivä', golden: 'Kultainen tunti', dusk: 'Hämärä', night: 'Yö' },
    events: {
      meteor: { name: 'METEORISADE', desc: 'Katso taivaalle — kivet osuvat kaikkeen!' },
      goldrush: { name: 'KULTAKUUME', desc: 'Kuutiot pudottavat kultaa valtoimenaan' },
      swarm: { name: 'PARVI', desc: 'Olet saarrettu!' },
      bloodmoon: { name: 'VERIKUU', desc: 'Nopeammat kuutiot · tuplasti XP:tä' },
    },
    enemies: { grunt: 'Peruskuutio', runner: 'Hämähäkkikuutio', brute: 'Jörökuutio', spitter: 'Sylkijäkuutio', bomber: 'Pommikuutio', armored: 'Panssarikuutio', blinker: 'Välkekuutio', elite: 'Eliittikuutio', boss: 'Pomokuutio' },
    heroTitles: { bonky: 'Viikinkimurskaaja', zippy: 'Kettutiedustelija', chonk: 'Kivipaladiini' },
    characters: {
      bonky: 'Klassikko. Tasapainoiset kyvyt.<br>Aloittaa murskausvasaralla.',
      zippy: '+25 % nopeus, mutta hauras.<br>Aloittaa bumerangilla.',
      chonk: '+60 maks. HP, hieman hidas.<br>Aloittaa iskupalloilla.',
    },
    meta: {
      dmg: { name: 'Voima', desc: '+5 % vahinkoa per taso' },
      hp: { name: 'Elinvoima', desc: '+10 maks. HP per taso' },
      speed: { name: 'Ketteryys', desc: '+3 % nopeutta per taso' },
      regen: { name: 'Palautuminen', desc: '+0,15 HP/s per taso' },
      stamina: { name: 'Kestävyys', desc: '+12 maks. kestävyyttä per taso' },
      gold: { name: 'Ahneus', desc: '+10 % kultaa per taso' },
      magnet: { name: 'Magnetismi', desc: '+8 % keräyssäde per taso' },
      xp: { name: 'Viisaus', desc: '+6 % XP per taso' },
    },
    weapons: {
      hammer: { name: 'Murskausvasara', desc: 'Iskee maahan ympärilläsi.<br>VAHINKO {dmg} · säde {r}' },
      orbs: { name: 'Iskupallot', desc: '{n} palloa kiertää sinua ja lyö<br>vihollisia ja ammuksia. VAHINKO {dmg}' },
      fireball: { name: 'Tulipallo', desc: 'Heittää {n}× räjähtävää tulipalloa<br>lähimpään viholliseen. VAHINKO {dmg}' },
      lightning: { name: 'Taivaansalama', desc: 'Salama iskee {n} satunnaiseen<br>viholliseen. VAHINKO {dmg}' },
      boomerang: { name: 'Bumerangi', desc: 'Heittää {n}× läpäisevää bumerangia,<br>jotka palaavat. VAHINKO {dmg}' },
      frost: { name: 'Pakkasnova', desc: 'Jäinen pulssi: VAHINKO {dmg} ja hidastaa<br>kuutioita {slow} s' },
      rail: { name: 'Kuutiotykki', desc: 'Ampuu {n}× läpäisevää ammusta suoraan<br>lauman läpi. VAHINKO {dmg}' },
      chain: { name: 'Ketjusalama', desc: 'Kipinä hyppii {jumps}<br>vihollisen välillä. VAHINKO {dmg}' },
      blades: { name: 'Pyörivät terät', desc: '{n} terää kiertyy ulospäin ja viiltää<br>kaiken. VAHINKO {dmg}' },
      poison: { name: 'Myrkkypilvi', desc: 'Jättää {n}× myrkkypilveä, jotka tekevät<br>{dmg}/s {dur} s ajan' },
      meteor: { name: 'Meteori', desc: 'Kutsuu {n}× meteoria lauman<br>päälle. VAHINKO {dmg} · säde {r}' },
    },
    evolutions: {
      hammer: { name: 'Maanjäristäjä', desc: 'Valtavat järistykset tainnuttavat lähellä<br>olevat kuutiot. VAHINKO {dmg} · säde {r}' },
      orbs: { name: 'Galaksipallot', desc: '{n} palloa laajalla radalla.<br>VAHINKO {dmg}' },
      fireball: { name: 'Inferno', desc: '{n} tulipalloa, jotka jättävät palavaa<br>maata. VAHINKO {dmg}' },
      lightning: { name: 'Ukkosen jumala', desc: '{n} iskua, jotka ketjuuntuvat.<br>VAHINKO {dmg}' },
      boomerang: { name: 'Kaksoissykloni', desc: '{n} jättibumerangia.<br>VAHINKO {dmg} · kantama {range}' },
      frost: { name: 'Lumimyrsky', desc: 'Jäädyttää kuutiot lähes paikoilleen {slow} s.<br>VAHINKO {dmg} · säde {r}' },
      rail: { name: 'Prismatykki', desc: 'Ammuksia {n} suuntaan kerralla.<br>VAHINKO {dmg}' },
      chain: { name: 'Myrskyverkko', desc: '{n} kipinää × {jumps} hyppyä.<br>VAHINKO {dmg}' },
      blades: { name: 'Sahamyrsky', desc: '{n} terää repii lauman läpi.<br>VAHINKO {dmg}' },
      poison: { name: 'Rutto', desc: 'Valtavat pilvet: {dmg}/s {dur} s ajan.<br>säde {r}' },
      meteor: { name: 'Tähtisade', desc: '{n} meteoria sataa alas.<br>VAHINKO {dmg} · säde {r}' },
    },
    passives: {
      hp: { name: 'Iso sydän', desc: '+25 maks. HP (ja parantaa 25)' },
      speed: { name: 'Vauhtijalat', desc: '+8 % nopeutta' },
      dmg: { name: 'Proteiinipirtelö', desc: '+12 % vahinkoa' },
      cd: { name: 'Kofeiini', desc: '-8 % aseiden latausaika' },
      magnet: { name: 'Kristallimagneetti', desc: '+35 % keräyssäde' },
      armor: { name: 'Paksu nahka', desc: '-2 vahinkoa per osuma' },
      regen: { name: 'Salaatti (yäk)', desc: '+0,8 HP/s' },
      crit: { name: 'Onnenisku', desc: '+6 % kriittinen mahdollisuus (2× vahinko)' },
      sprint: { name: 'Jälkipoltin', desc: '+12 % juoksunopeus' },
      lungs: { name: 'Isot keuhkot', desc: '+30 maks. kestävyyttä' },
      wind: { name: 'Toinen tuuli', desc: '+35 % kestävyyden palautuminen' },
      vamp: { name: 'Vampyyrinhampaat', desc: 'Parantaa 0,3 HP per tappo' },
      thorns: { name: 'Kaktusnahka', desc: 'Palauttaa 60 % kosketusvahingosta' },
      multishot: { name: 'Lisäammus', desc: '+1 ammus kaikille aseille' },
      area: { name: 'Iso heilautus', desc: '+12 % aseiden alue' },
      revive: { name: 'Suojelusenkeli', desc: 'Herää kerran henkiin 50 % HP:lla' },
    },
  },
  sv: {
    subtitle: '~ de är onda kuber. du har en hammare. ~',
    coins: '{n} mynt',
    start: 'KROSSA!',
    upgrades: 'UPPGRADERINGAR',
    controls: 'WASD — gå · SHIFT — spring · MELLANSLAG — hoppa över fiender och upp på kanter · dra med musen — vrid kameran · scrolla — zooma',
    controls2: 'Slå sönder glödande krukor för mat · öppna kistor · överlev 30 minuter från gryning till natt',
    hint: 'WASD gå · SHIFT spring · MELLANSLAG hoppa · dra = kamera · scrolla = zoom · P paus · M ljud',
    best: 'Bästa runda: {time} · {kills} kuber · nivå {level}',
    noBest: 'Inget rekord än — kör!',
    levelUp: 'NIVÅ UPP!',
    levelUpMulti: 'NIVÅ UPP! (×{n})',
    cardNew: 'NY!',
    cardLevel: 'NIVÅ {from} → {to}',
    cardOwned: 'äger ×{n}',
    cardMax: 'max {n}',
    tagWeapon: 'VAPEN',
    tagPassive: 'PASSIV',
    tagEvolution: 'EVOLUTION',
    evolveHint: 'Max {weapon} + {passive}',
    evolvesWith: 'Utvecklas med {passive}',
    chestTitle: 'SKATTKISTA!',
    chestBossTitle: 'BOSSENS SKATT!',
    chestGold: '+{n} guld',
    chestTake: 'TA',
    dead: 'DU BLEV KROSSAD',
    win: 'DU KROSSADE VÄRLDEN',
    retry: 'FÖRSÖK IGEN',
    oneMore: 'EN RUNDA TILL',
    menu: 'MENY',
    shopTitle: 'UPPGRADERINGSLABB',
    back: 'TILLBAKA',
    maxed: 'MAX',
    resetSave: 'återställ alla framsteg',
    resetConfirm: 'Återställa ALLA framsteg (mynt, uppgraderingar och rekord)?',
    paused: 'PAUS',
    resume: 'tryck P eller Esc för att fortsätta',
    statSurvived: 'överlevde',
    statLevel: 'nivå',
    statKills: 'kuber krossade',
    statGems: 'kristaller insamlade',
    statBanked: 'mynt intjänade',
    statTotal: 'totalt',
    statEvolutions: 'evolutioner',
    newRecord: 'NYTT REKORD!',
    eliteIncoming: 'ELITKUB PÅ VÄG',
    bossAwakens: '{name} VAKNAR',
    newEnemy: 'NY: {name}',
    rampage: 'AMOK +{n}g',
    chest: 'KISTA!',
    gemRush: 'KRISTALLRUSH!',
    food: 'MAT!',
    blocked: 'BLOCKERAD',
    outOfBounds: 'UTANFÖR BANAN!',
    revived: 'ANDRA LIVET!',
    eventEnds: '{name} är över',
    phases: { dawn: 'Gryning', day: 'Dag', golden: 'Gyllene timmen', dusk: 'Skymning', night: 'Natt' },
    events: {
      meteor: { name: 'METEORREGN', desc: 'Håll koll på himlen — stenarna träffar allt!' },
      goldrush: { name: 'GULDRUSCH', desc: 'Kuberna släpper guld som galningar' },
      swarm: { name: 'SVÄRM', desc: 'Du är omringad!' },
      bloodmoon: { name: 'BLODMÅNE', desc: 'Snabbare kuber · dubbel XP' },
    },
    enemies: { grunt: 'Fotkub', runner: 'Spindelkub', brute: 'Bjässekub', spitter: 'Spottkub', bomber: 'Bombkub', armored: 'Pansarkub', blinker: 'Blinkkub', elite: 'Elitkub', boss: 'Bosskub' },
    heroTitles: { bonky: 'Vikingakrossare', zippy: 'Rävspanare', chonk: 'Stenpaladin' },
    characters: {
      bonky: 'Klassikern. Balanserade egenskaper.<br>Börjar med Krosshammaren.',
      zippy: '+25 % fart, men ömtålig.<br>Börjar med Bumerangen.',
      chonk: '+60 max HP, lite långsam.<br>Börjar med Krossklotet.',
    },
    meta: {
      dmg: { name: 'Kraft', desc: '+5 % skada per nivå' },
      hp: { name: 'Vitalitet', desc: '+10 max HP per nivå' },
      speed: { name: 'Snabbhet', desc: '+3 % fart per nivå' },
      regen: { name: 'Återhämtning', desc: '+0,15 HP/s per nivå' },
      stamina: { name: 'Uthållighet', desc: '+12 max uthållighet per nivå' },
      gold: { name: 'Girighet', desc: '+10 % mer guld per nivå' },
      magnet: { name: 'Magnetism', desc: '+8 % upplockningsradie per nivå' },
      xp: { name: 'Visdom', desc: '+6 % XP per nivå' },
    },
    weapons: {
      hammer: { name: 'Krosshammare', desc: 'Slår i marken runt dig.<br>SKADA {dmg} · radie {r}' },
      orbs: { name: 'Krossklot', desc: '{n} klot cirklar runt dig och slår<br>fiender och skott. SKADA {dmg}' },
      fireball: { name: 'Eldklot', desc: 'Kastar {n}× exploderande eldklot mot<br>närmaste fiende. SKADA {dmg}' },
      lightning: { name: 'Himlablixt', desc: 'Blixten slår ner i {n} slumpmässiga<br>fiender. SKADA {dmg}' },
      boomerang: { name: 'Bumerang', desc: 'Kastar {n}× genomborrande bumeranger<br>som flyger ut och tillbaka. SKADA {dmg}' },
      frost: { name: 'Frostnova', desc: 'Iskall puls: SKADA {dmg} och saktar ner<br>kuberna i {slow} s' },
      rail: { name: 'Kubkanon', desc: 'Skjuter {n}× genomborrande skott rakt<br>genom horden. SKADA {dmg}' },
      chain: { name: 'Kedjegnista', desc: 'En gnista hoppar mellan {jumps}<br>fiender. SKADA {dmg}' },
      blades: { name: 'Snurrblad', desc: '{n} blad spiralerar ut och skär<br>sönder allt. SKADA {dmg}' },
      poison: { name: 'Giftmoln', desc: 'Lämnar {n}× giftmoln som<br>gör {dmg}/s i {dur} s' },
      meteor: { name: 'Meteor', desc: 'Kallar ner {n}× meteorer över<br>horden. SKADA {dmg} · radie {r}' },
    },
    evolutions: {
      hammer: { name: 'Jordskalvshammare', desc: 'Enorma skalv som bedövar alla kuber<br>i närheten. SKADA {dmg} · radie {r}' },
      orbs: { name: 'Galaxklot', desc: '{n} klot i en vid bana.<br>SKADA {dmg}' },
      fireball: { name: 'Inferno', desc: '{n} eldklot som lämnar brinnande<br>mark. SKADA {dmg}' },
      lightning: { name: 'Åskguden', desc: '{n} nedslag som kedjar vidare.<br>SKADA {dmg}' },
      boomerang: { name: 'Tvillingcyklon', desc: '{n} jättebumeranger.<br>SKADA {dmg} · räckvidd {range}' },
      frost: { name: 'Snöstorm', desc: 'Fryser kuberna nästan helt i {slow} s.<br>SKADA {dmg} · radie {r}' },
      rail: { name: 'Prismakanon', desc: 'Skott i {n} riktningar på en gång.<br>SKADA {dmg}' },
      chain: { name: 'Stormnät', desc: '{n} gnistor × {jumps} hopp.<br>SKADA {dmg}' },
      blades: { name: 'Sågstorm', desc: '{n} blad river genom horden.<br>SKADA {dmg}' },
      poison: { name: 'Pest', desc: 'Enorma moln: {dmg}/s i {dur} s.<br>radie {r}' },
      meteor: { name: 'Stjärnfall', desc: '{n} meteorer regnar ner.<br>SKADA {dmg} · radie {r}' },
    },
    passives: {
      hp: { name: 'Stort hjärta', desc: '+25 max HP (och läker 25)' },
      speed: { name: 'Snabba fötter', desc: '+8 % fart' },
      dmg: { name: 'Proteinshake', desc: '+12 % skada' },
      cd: { name: 'Koffein', desc: '-8 % nedkylning på vapen' },
      magnet: { name: 'Kristallmagnet', desc: '+35 % upplockningsradie' },
      armor: { name: 'Tjock hud', desc: '-2 skada per träff' },
      regen: { name: 'Sallad (usch)', desc: '+0,8 HP/s' },
      crit: { name: 'Turslag', desc: '+6 % chans till kritisk träff (2× skada)' },
      sprint: { name: 'Efterbrännare', desc: '+12 % springfart' },
      lungs: { name: 'Stora lungor', desc: '+30 max uthållighet' },
      wind: { name: 'Andra andningen', desc: '+35 % återhämtning av uthållighet' },
      vamp: { name: 'Vampyrtänder', desc: 'Läker 0,3 HP per kross' },
      thorns: { name: 'Kaktushud', desc: 'Returnerar 60 % av kontaktskadan' },
      multishot: { name: 'Extraskott', desc: '+1 projektil till alla vapen' },
      area: { name: 'Stort sving', desc: '+12 % vapenområde' },
      revive: { name: 'Skyddsängel', desc: 'Återuppstå en gång med 50 % HP' },
    },
  },
};

export const text = lang => TEXT[lang] || TEXT.en;
