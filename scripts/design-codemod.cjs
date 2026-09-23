// Ensretter de visuelle moenstre der optraeder ordret mange steder.
//
// Bevidst KUN praecise streng-erstatninger - ingen gaet, intet regex der kan
// ramme ved siden af. Hver linje i MAP er en beslutning, der kan laeses og
// efterproeves i diffen bagefter.
//
//   node scripts/design-codemod.cjs          <- proevekoersel, skriver ikke
//   node scripts/design-codemod.cjs --apply  <- gennemfoerer
const fs = require('fs')
const path = require('path')

const apply = process.argv.includes('--apply')

const MAP = [
  // Tilbage-knappen i toppen af hver skaerm
  [
    'pointer-events-auto bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4',
    'pointer-events-auto bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4',
  ],
  [
    'pointer-events-auto bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold',
    'pointer-events-auto bg-background/90 hover:bg-background transition-colors gap-2 font-semibold',
  ],
  [
    'bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4',
    'bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4',
  ],

  // Raekker i lister: doble kanter og svaevende skygge -> streg og farvet kant ved hover
  [
    'flex items-center justify-between p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all group',
    'flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors group',
  ],
  [
    'flex items-center justify-between p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all cursor-pointer',
    'flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors cursor-pointer',
  ],
  [
    'flex items-center justify-between p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all',
    'flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors',
  ],
  [
    'flex items-center justify-between p-4 rounded-xl border-2 bg-card hover:shadow-md transition-all group',
    'flex items-center justify-between p-4 rounded-md border bg-card hover:border-primary/40 transition-colors group',
  ],
  [
    'flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border-2 bg-card',
    'flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-md border bg-card',
  ],
  [
    'flex flex-col gap-4 p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all',
    'flex flex-col gap-4 p-5 rounded-md border bg-card hover:border-primary/40 transition-colors',
  ],
  [
    'p-4 rounded-xl border-2 bg-card hover:shadow-md transition-all group relative',
    'p-4 rounded-md border bg-card hover:border-primary/40 transition-colors group relative',
  ],
  [
    'p-4 rounded-xl border-2 bg-card flex items-center justify-between gap-4',
    'p-4 rounded-md border bg-card flex items-center justify-between gap-4',
  ],

  // Kort: Card har selv en kant, saa border-2 gav en dobbelt streg
  ['<Card className="p-6 border-2">', '<Card className="p-6">'],
  ['<Card className="p-6 border-2 bg-muted/30">', '<Card className="p-6 bg-muted/30">'],
  ['<Card className="p-8 max-w-md relative z-10 border-2">', '<Card className="p-8 max-w-md relative z-10">'],
  ['<Card className="p-5 border-2', '<Card className="p-5'],

  // Knapper med gradient -> maerkefarven
  ['gap-2 bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90', 'gap-2'],
  ['gap-2 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90', 'gap-2'],
  ['gap-2 bg-gradient-to-r from-primary to-accent', 'gap-2'],
  ['flex-1 gap-2 bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90', 'flex-1 gap-2'],

  // Maerkater
  ['<Badge className="bg-gradient-to-r from-primary to-accent text-white">', '<Badge>'],
  ['<Badge className="bg-gradient-to-r from-accent via-primary to-accent text-white">', '<Badge variant="secondary">'],

  // Runde ikon-/initialfelter
  [
    'w-12 h-12 rounded-xl bg-gradient-to-br from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] flex items-center justify-center text-white font-bold text-lg shadow-lg',
    'w-12 h-12 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg',
  ],
  [
    'w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center text-white font-bold text-lg shadow-lg',
    'w-12 h-12 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg',
  ],
  [
    'w-12 h-12 rounded-xl flex items-center justify-center shadow-md',
    'w-12 h-12 rounded-md flex items-center justify-center',
  ],
  [
    'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shadow-md border-2 border-transparent hover:border-primary/40 transition-colors',
    'w-10 h-10 rounded-md flex items-center justify-center font-bold text-sm border border-transparent hover:border-primary/40 transition-colors',
  ],

  // Statistik-kort: gradient-vask -> flad tone
  ['p-4 bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20', 'p-4 bg-blocked-surface border-blocked/25'],
  ['p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20', 'p-4 bg-attention-surface border-attention/25'],
  ['p-4 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20', 'p-4 bg-accent/10 border-accent/25'],
  ['p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20', 'p-4 bg-primary/10 border-primary/25'],
  [
    'flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-destructive/20 to-destructive/10 text-destructive font-bold text-sm',
    'flex items-center justify-center w-8 h-8 rounded-full bg-blocked-surface text-blocked font-bold text-sm',
  ],

  // Advarselsflader
  [
    'p-6 border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 dark:border-amber-600',
    'p-6 border-attention/40 bg-attention-surface',
  ],
  [
    'p-4 rounded-lg border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600/60',
    'p-4 rounded-md border border-attention/40 bg-attention-surface',
  ],

  // Diverse enkeltstaaende
  ['<div className="border-2 rounded-lg p-4">', '<div className="border rounded-md p-4">'],
  ['<Card className="p-5 md:p-7 border-2">', '<Card className="p-5 md:p-7">'],
  // Farvefelter beholder den kraftige kant - den viser valget - men faar samme radius
  ['"p-4 rounded-lg border-2 cursor-pointer transition-colors"', '"p-4 rounded-md border-2 cursor-pointer transition-colors"'],
  ['p-4 rounded-lg border-2 border-border hover:border-primary/50 cursor-pointer transition-colors', 'p-4 rounded-md border-2 border-border hover:border-primary/50 cursor-pointer transition-colors'],
  [
    "flex items-center justify-between gap-4 rounded-xl border p-4",
    "flex items-center justify-between gap-4 rounded-md border p-4",
  ],

  // ---------------------------------------------------------------
  // Spillehjoernet. Rammen (menuer, highscores, slutskaerm) skal se ud
  // som resten af appen. Selve spillefladen faar lov at vaere moerk og
  // sin egen verden - men uden gradient-tekst og svaevende skygger.
  // ---------------------------------------------------------------
  ['p-6 bg-gradient-to-br from-card via-primary/5 to-accent/5 border-2', 'p-6'],
  ['p-6 bg-gradient-to-br from-accent/5 via-primary/5 to-card border-2 border-accent/20', 'p-6'],
  ['p-6 text-center bg-gradient-to-br from-primary/10 via-accent/10 to-background border-2 border-primary/20', 'p-6 text-center'],
  ['p-3 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg', 'p-3 rounded-full bg-primary'],
  ['p-3 rounded-full bg-gradient-to-br from-accent to-primary shadow-lg', 'p-3 rounded-full bg-primary'],
  ['text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent', 'text-2xl font-semibold text-foreground'],
  ['text-2xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent', 'text-2xl font-semibold mb-2 text-foreground'],
  ['text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent', 'text-4xl font-semibold text-foreground'],
  ['text-xl font-bold bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent', 'text-xl font-semibold text-foreground'],
  ['text-center p-4 rounded-lg bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/20', 'text-center p-4 rounded-md bg-secondary border'],
  ['px-8 bg-gradient-to-r from-primary to-accent hover:opacity-90', 'px-8'],
  ['bg-gradient-to-r from-primary to-accent hover:opacity-90', ''],
  ['shadow-xl hover:shadow-2xl transition-shadow font-bold', 'font-bold'],
  ['bg-background shadow-lg gap-2 font-semibold', 'bg-background gap-2 font-semibold'],
  [
    'relative overflow-hidden border-2 transition-all duration-300 group h-full min-h-[180px] sm:min-h-[220px] flex flex-col cursor-pointer hover:border-primary/40',
    'relative overflow-hidden transition-colors group h-full flex flex-col cursor-pointer hover:border-primary/40',
  ],

  // Spillefladens ramme og HUD: solid moerk flade frem for gradient og glød
  ['p-0 overflow-hidden border-2 border-primary/30 shadow-2xl', 'p-0 overflow-hidden'],
  ['relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 border-b-2 border-primary/30', 'relative bg-slate-900 p-6 border-b border-slate-700'],
  ['absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/10 to-primary/5', 'hidden'],
  ['absolute inset-0 bg-gradient-to-br from-primary to-accent blur-xl opacity-30 group-hover:opacity-50 transition-opacity', 'hidden'],
  ['rounded-lg shadow-2xl border-2 border-primary/20', 'rounded-md border border-white/15'],
  ['p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-xl', 'p-3 rounded-md bg-white/15'],
  ['text-2xl sm:text-3xl font-bold text-white drop-shadow-lg', 'text-2xl sm:text-3xl font-semibold text-white'],
  ['text-4xl font-black bg-gradient-to-br from-white to-primary-foreground bg-clip-text text-transparent drop-shadow-lg', 'text-4xl font-bold text-white'],
  ['text-3xl font-black bg-gradient-to-br from-white to-primary-foreground bg-clip-text text-transparent drop-shadow-lg', 'text-3xl font-bold text-white'],
  ['text-4xl font-black text-yellow-400 drop-shadow-lg', 'text-4xl font-bold text-yellow-400'],
  ['text-3xl font-black text-white drop-shadow-lg', 'text-3xl font-bold text-white'],
  [
    'relative px-5 py-3 rounded-xl bg-gradient-to-br from-accent/20 to-yellow-500/20 border-2 border-accent/40 backdrop-blur-sm',
    'relative px-5 py-3 rounded-md bg-white/10 border border-white/20',
  ],
  [
    'relative px-6 py-3 rounded-xl bg-gradient-to-br from-primary/20 to-accent/30 border-2 border-primary/40 backdrop-blur-sm',
    'relative px-6 py-3 rounded-md bg-white/10 border border-white/20',
  ],
  [
    'relative px-5 py-3 rounded-xl bg-gradient-to-br from-primary/20 to-accent/30 border-2 border-primary/40 backdrop-blur-sm',
    'relative px-5 py-3 rounded-md bg-white/10 border border-white/20',
  ],
  [
    'relative px-5 py-3 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-primary/40 backdrop-blur-sm',
    'relative px-5 py-3 rounded-md bg-white/10 border border-white/20',
  ],
  [
    'flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/50 text-cyan-500 animate-pulse',
    'flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-500/15 border border-cyan-500/50 text-cyan-500',
  ],
  [
    'p-6 rounded-3xl bg-gradient-to-br from-[oklch(0.42_0.19_270)] via-[oklch(0.50_0.16_265)] to-[oklch(0.38_0.19_272)] shadow-2xl',
    'p-6 rounded-md bg-primary',
  ],
  [
    'text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight bg-gradient-to-br from-[oklch(0.42_0.19_270)] via-[oklch(0.50_0.16_265)] to-[oklch(0.38_0.19_272)] bg-clip-text text-transparent mb-4',
    'text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-4',
  ],
  [
    'mb-3 md:mb-4 inline-flex items-center justify-center rounded-2xl p-2 md:p-3 shadow-lg bg-gradient-to-br from-[oklch(0.55_0.19_25)] via-[oklch(0.58_0.17_35)] to-[oklch(0.48_0.20_15)]',
    'mb-3 inline-flex items-center justify-center rounded-md p-2 bg-secondary text-primary',
  ],

  // Svaerhedsgrad-vaelgeren og highscore-fanerne - ens i alle fem spil
  [
    'group relative cursor-pointer rounded-xl p-6 transition-all duration-300 min-w-[140px] ',
    'group relative cursor-pointer rounded-md p-6 transition-colors min-w-[140px] ',
  ],
  [
    '`bg-gradient-to-br ${setting.bgGradient} border-2 ${setting.borderColor} shadow-lg ${setting.glowColor}`',
    '`bg-secondary border-2 ${setting.borderColor}`',
  ],
  [
    "'bg-card border-2 border-border hover:border-border/60 hover:shadow-md'",
    "'bg-card border-2 border-border hover:border-primary/40'",
  ],
  ['p-4 rounded-lg border-2 transition-all ', 'p-4 rounded-md border-2 transition-colors '],
  ["'border-accent bg-gradient-to-br from-accent/10 to-primary/10 shadow-lg'", "'border-primary bg-primary/10'"],
  ["'border-border bg-gradient-to-br from-card to-muted/20'", "'border-border bg-card'"],
  ["'bg-gradient-to-br from-green-500/20 to-green-600/20'", "'bg-green-500/15'"],
  ["'bg-gradient-to-br from-yellow-500/20 to-yellow-600/20'", "'bg-yellow-500/15'"],
  ["'bg-gradient-to-br from-red-500/20 to-red-600/20'", "'bg-red-500/15'"],
  ["'bg-gradient-to-br from-purple-500/20 to-purple-600/20'", "'bg-purple-500/15'"],
  ['p-4 rounded-lg border-2 border-border bg-gradient-to-br from-card to-muted/20', 'p-4 rounded-md border bg-card'],
  ['px-3 py-2 rounded-xl bg-slate-950/60 border-2 border-primary/30', 'px-3 py-2 rounded-md bg-slate-950/60 border border-white/15'],
  [
    'relative px-5 py-3 rounded-xl bg-gradient-to-br from-destructive/20 to-red-500/20 border-2 border-destructive/40 backdrop-blur-sm',
    'relative px-5 py-3 rounded-md bg-white/10 border border-white/20',
  ],
  [
    'text-5xl font-black bg-gradient-to-r from-yellow-300 via-white to-yellow-300 bg-clip-text text-transparent drop-shadow-lg',
    'text-5xl font-bold text-yellow-300',
  ],

  // Spillehjoernets bannere: een solid farve pr. spil i stedet for tre-trins gradient
  ['relative bg-gradient-to-r from-[oklch(0.50_0.14_275)] via-[oklch(0.56_0.12_262)] to-[oklch(0.46_0.15_276)] py-8 shadow-xl border-b-4 border-white/10', 'relative bg-[oklch(0.50_0.14_275)] py-8 border-b border-white/15'],
  ['relative bg-gradient-to-r from-[oklch(0.52_0.12_330)] via-[oklch(0.55_0.11_305)] to-[oklch(0.48_0.12_332)] py-8 shadow-xl border-b-4 border-white/10', 'relative bg-[oklch(0.52_0.12_330)] py-8 border-b border-white/15'],
  ['relative bg-gradient-to-r from-[oklch(0.68_0.11_80)] via-[oklch(0.72_0.10_65)] to-[oklch(0.64_0.11_82)] py-8 shadow-xl border-b-4 border-white/10', 'relative bg-[oklch(0.68_0.11_80)] py-8 border-b border-white/15'],
  ['relative bg-gradient-to-r from-[oklch(0.52_0.13_248)] via-[oklch(0.56_0.11_240)] to-[oklch(0.48_0.13_250)] py-8 shadow-xl border-b-4 border-white/10', 'relative bg-[oklch(0.52_0.13_248)] py-8 border-b border-white/15'],
  ['relative bg-gradient-to-r from-[oklch(0.56_0.12_155)] via-[oklch(0.60_0.10_170)] to-[oklch(0.52_0.12_157)] py-8 shadow-xl border-b-4 border-white/10', 'relative bg-[oklch(0.56_0.12_155)] py-8 border-b border-white/15'],
  ['className="absolute inset-0 bg-gradient-to-br"', 'className="absolute inset-0"'],
  [
    '"mb-3 md:mb-4 inline-flex items-center justify-center rounded-2xl p-2 md:p-3 shadow-lg",\n                          `bg-gradient-to-br ${game.gradient}`',
    '"mb-3 inline-flex items-center justify-center rounded-md p-2 bg-secondary text-primary"',
  ],
  [
    'mb-3 md:mb-4 inline-flex items-center justify-center rounded-2xl p-2 md:p-3 shadow-lg bg-gradient-to-br from-[oklch(0.45_0.17_278)] via-[oklch(0.52_0.15_272)] to-[oklch(0.41_0.17_280)]',
    'mb-3 inline-flex items-center justify-center rounded-md p-2 bg-secondary text-primary',
  ],
  [
    'mb-3 md:mb-4 inline-flex items-center justify-center rounded-2xl p-2 md:p-3 shadow-lg bg-gradient-to-br from-[oklch(0.50_0.18_295)] via-[oklch(0.55_0.16_305)] to-[oklch(0.42_0.19_285)]',
    'mb-3 inline-flex items-center justify-center rounded-md p-2 bg-secondary text-primary',
  ],
  ['p-6 rounded-3xl bg-gradient-to-br from-[oklch(0.45_0.15_240)] via-[oklch(0.50_0.13_255)] to-[oklch(0.40_0.16_230)] shadow-2xl', 'p-6 rounded-md bg-primary'],
  [
    'text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight bg-gradient-to-br from-[oklch(0.45_0.15_240)] via-[oklch(0.50_0.13_255)] to-[oklch(0.40_0.16_230)] bg-clip-text text-transparent mb-4',
    'text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-4',
  ],
  ['border-2 border-border rounded-lg bg-gradient-to-b from-gray-900 to-gray-800', 'border border-border rounded-md bg-gray-900'],
  ['text-4xl font-black text-white drop-shadow-lg', 'text-4xl font-bold text-white'],
  ['text-3xl font-black text-yellow-400 drop-shadow-lg', 'text-3xl font-bold text-yellow-400'],
  ['font-bold shadow-xl', 'font-bold'],
  ['h-14 w-[2px] bg-gradient-to-b from-transparent via-border to-transparent', 'h-14 w-px bg-border'],

  // Brick Breaks powerup-liste: hver powerup beholder sin egen farve, men som
  // een flad tone i stedet for en gradient
  ['p-2 rounded-lg bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/20', 'p-2 rounded-md bg-green-500/10 border border-green-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-cyan-500/10 to-blue-600/10 border border-cyan-500/20', 'p-2 rounded-md bg-cyan-500/10 border border-cyan-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-red-500/10 to-orange-600/10 border border-red-500/20', 'p-2 rounded-md bg-red-500/10 border border-red-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/20', 'p-2 rounded-md bg-purple-500/10 border border-purple-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border border-yellow-500/20', 'p-2 rounded-md bg-yellow-500/10 border border-yellow-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-indigo-500/10 to-purple-600/10 border border-indigo-500/20', 'p-2 rounded-md bg-indigo-500/10 border border-indigo-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-pink-500/10 to-red-600/10 border border-pink-500/20', 'p-2 rounded-md bg-pink-500/10 border border-pink-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-cyan-500/10 to-teal-600/10 border border-cyan-500/20', 'p-2 rounded-md bg-teal-500/10 border border-teal-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-lime-500/10 to-green-600/10 border border-lime-500/20', 'p-2 rounded-md bg-lime-500/10 border border-lime-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-orange-500/10 to-red-600/10 border border-orange-500/20', 'p-2 rounded-md bg-orange-500/10 border border-orange-500/25'],
  ['p-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-600/10 border border-amber-500/20', 'p-2 rounded-md bg-amber-500/10 border border-amber-500/25'],

  // Aktive powerups i spillet: samme farve, uden puls og dobbeltkant
  ['px-3 py-1 rounded-lg bg-gradient-to-r from-red-500/20 to-orange-500/20 border-2 border-red-500/50 text-red-500 animate-pulse', 'px-3 py-1 rounded-md bg-red-500/15 border border-red-500/50 text-red-500'],
  ['px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500/20 to-red-600/20 border-2 border-orange-500/50 text-orange-500 animate-pulse', 'px-3 py-1 rounded-md bg-orange-500/15 border border-orange-500/50 text-orange-500'],
  ['px-3 py-1 rounded-lg bg-gradient-to-r from-lime-500/20 to-green-500/20 border-2 border-lime-500/50 text-lime-500 animate-pulse', 'px-3 py-1 rounded-md bg-lime-500/15 border border-lime-500/50 text-lime-500'],
  ['px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-2 border-amber-500/50 text-amber-500 animate-pulse', 'px-3 py-1 rounded-md bg-amber-500/15 border border-amber-500/50 text-amber-500'],

  // Sidste rester: forsidens knapper og widget-kort
  [
    'bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold relative px-4 w-full sm:w-auto',
    'bg-background/90 hover:bg-background transition-colors gap-2 font-semibold relative px-4 w-full sm:w-auto',
  ],
  [
    'bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold relative px-4',
    'bg-background/90 hover:bg-background transition-colors gap-2 font-semibold relative px-4',
  ],
  [
    'bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] hover:from-[oklch(0.38_0.19_272)] hover:to-[oklch(0.48_0.15_264)] text-white shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold w-full sm:w-auto px-6 py-3 text-base',
    'gap-2 font-semibold w-full sm:w-auto px-6 py-3 text-base',
  ],
  [
    'bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] hover:from-[oklch(0.38_0.19_272)] hover:to-[oklch(0.48_0.15_264)] text-white shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4',
    'gap-2 font-semibold px-4',
  ],
  ['className="bg-gradient-to-r from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] text-white"', ''],
  [
    'p-5 md:p-7 bg-card border-2 hover:border-primary/40 transition-all duration-300 mb-4 md:mb-6',
    'p-5 md:p-7 bg-card hover:border-primary/40 transition-colors mb-4 md:mb-6',
  ],
  [
    'flex flex-col gap-2 p-3 rounded-xl border-2 border-border bg-gradient-to-br from-card to-muted/30 shadow-sm',
    'flex flex-col gap-2 p-3 rounded-md border border-border bg-card',
  ],
  [
    'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4',
    'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-4',
  ],

  // De sidste smaa komponenter: ikon-felter, knapper og svaevende flader
  ['h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] flex items-center justify-center', 'h-12 w-12 rounded-md bg-secondary text-primary flex items-center justify-center'],
  ['h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.34_0.14_273)] to-[oklch(0.42_0.13_270)] flex items-center justify-center', 'h-12 w-12 rounded-md bg-secondary text-primary flex items-center justify-center'],
  ['h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.50_0.14_275)] to-[oklch(0.56_0.12_262)] flex items-center justify-center', 'h-12 w-12 rounded-md bg-secondary text-primary flex items-center justify-center'],
  ['h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.55_0.16_25)] to-[oklch(0.62_0.13_30)] flex items-center justify-center', 'h-12 w-12 rounded-md bg-blocked-surface text-blocked flex items-center justify-center'],
  ['h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center', 'h-12 w-12 rounded-md bg-blocked-surface text-blocked flex items-center justify-center'],
  ['h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center', 'h-8 w-8 rounded-full bg-primary flex items-center justify-center'],
  [
    'bg-gradient-to-r from-[oklch(0.55_0.16_25)] to-[oklch(0.62_0.13_30)] hover:from-[oklch(0.50_0.16_25)] hover:to-[oklch(0.58_0.13_30)] text-white gap-2',
    'bg-blocked text-white hover:bg-blocked/90 gap-2',
  ],
  ['w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90', 'w-full'],
  [
    'gap-2 font-semibold bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 w-full sm:w-auto px-4',
    'gap-2 font-semibold bg-background/90 hover:bg-background transition-colors w-full sm:w-auto px-4',
  ],
  ['p-4 border-2 border-accent/40 bg-gradient-to-br from-accent/10 to-primary/5', 'p-4 border-accent/40 bg-accent/10'],
  ['p-2 rounded-lg bg-gradient-to-br from-accent to-primary shrink-0', 'p-2 rounded-md bg-primary shrink-0'],
  ['p-4 rounded-xl border-2 bg-gradient-to-br from-card to-muted/30 hover:shadow-lg transition-all', 'p-4 rounded-md border bg-card hover:border-primary/40 transition-colors'],
  ['flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 font-bold text-sm', 'flex items-center justify-center w-8 h-8 rounded-full bg-secondary font-bold text-sm'],
  ['text-4xl sm:text-5xl font-bold bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-2', 'text-2xl sm:text-3xl font-semibold tracking-tight text-foreground pb-2'],
  ['w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl space-y-4', 'w-full max-w-lg rounded-lg border bg-card p-6 shadow-xl space-y-4'],
  ['fixed bottom-5 right-5 z-40 rounded-full shadow-xl gap-2', 'fixed bottom-5 right-5 z-40 rounded-full shadow-lg gap-2'],
  ['rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs space-y-2', 'rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-2'],
  ['rounded-2xl bg-primary/10 p-3 text-primary', 'rounded-md bg-primary/10 p-3 text-primary'],
  ['ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words', 'ml-auto max-w-[88%] rounded-md bg-primary/15 px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words'],
  ["'mr-3 rounded-2xl rounded-bl-md px-3.5 py-3 text-sm space-y-3'", "'mr-3 rounded-md px-3.5 py-3 text-sm space-y-3'"],
  ['rounded-xl bg-destructive/10 p-3 text-xs text-destructive whitespace-pre-wrap break-words', 'rounded-md bg-destructive/10 p-3 text-xs text-destructive whitespace-pre-wrap break-words'],
  ['fixed bottom-5 right-5 z-40 flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-popover text-popover-foreground shadow-[0_20px_70px_rgba(0,0,0,0.35)]', 'fixed bottom-5 right-5 z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl'],
  ['absolute right-3 top-12 z-10 w-56 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl', 'absolute right-3 top-12 z-10 w-56 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg'],

  // VERSAL-labels med spaerring er en af de tydeligste skabelon-markoerer.
  // Almindelig saetningsform i stedet - laeses ogsaa lettere ved 10-11 px.
  ['text-[10px] text-primary-foreground/70 uppercase tracking-widest font-bold mb-1 flex items-center gap-1', 'text-[11px] text-primary-foreground/70 font-semibold mb-1 flex items-center gap-1'],
  ['text-[10px] text-accent-foreground/70 uppercase tracking-widest font-bold mb-1 flex items-center gap-1', 'text-[11px] text-accent-foreground/70 font-semibold mb-1 flex items-center gap-1'],
  ['text-[10px] text-primary-foreground/70 uppercase tracking-widest font-bold mb-1 text-center', 'text-[11px] text-primary-foreground/70 font-semibold mb-1 text-center'],
  ['text-[10px] text-primary-foreground/70 uppercase tracking-widest font-bold mb-1', 'text-[11px] text-primary-foreground/70 font-semibold mb-1'],
  ['text-[10px] text-accent-foreground/70 uppercase tracking-widest font-bold mb-1', 'text-[11px] text-accent-foreground/70 font-semibold mb-1'],
  ['text-[10px] text-destructive-foreground/70 uppercase tracking-widest font-bold mb-1', 'text-[11px] text-destructive-foreground/70 font-semibold mb-1'],
  ['text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1', 'text-xs font-semibold text-muted-foreground mb-1'],
  ['text-xs font-semibold text-muted-foreground uppercase tracking-wide', 'text-xs font-semibold text-muted-foreground'],
  ['text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2', 'text-xs font-semibold text-muted-foreground mb-2'],

  // Sidste doble kanter paa kort
  ['<Card className="p-6 border-2 hover:border-primary/50 transition-colors ', '<Card className="p-6 hover:border-primary/50 transition-colors '],
  ['<Card key={view.viewId} className="p-6 border-2 hover:border-primary/50 ', '<Card key={view.viewId} className="p-6 hover:border-primary/50 '],
  ['<Card className="p-4 sm:p-6 border-2">', '<Card className="p-4 sm:p-6">'],
  ['<Card className="p-5 sm:p-6 border-2">', '<Card className="p-5 sm:p-6">'],
  ['<Card key={request.id} className="p-5 border-2 space-y-4">', '<Card key={request.id} className="p-5 space-y-4">'],
  ['rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3', 'rounded-md border border-destructive/40 bg-destructive/10 p-4 flex gap-3'],
  ['p-4 rounded-lg bg-destructive/10 border-2 border-destructive', 'p-4 rounded-md bg-destructive/10 border border-destructive'],
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const root = path.join(__dirname, '..', 'src')
const totals = new Map()
let changedFiles = 0

for (const file of walk(root)) {
  const before = fs.readFileSync(file, 'utf8')
  let after = before
  for (const [from, to] of MAP) {
    if (!after.includes(from)) continue
    const count = after.split(from).length - 1
    totals.set(from, (totals.get(from) || 0) + count)
    after = after.split(from).join(to)
  }
  if (after !== before) {
    changedFiles++
    console.log(`${path.relative(root, file)}`)
    if (apply) fs.writeFileSync(file, after)
  }
}

console.log('\n--- erstatninger ---')
let sum = 0
for (const [from, count] of [...totals].sort((a, b) => b[1] - a[1])) {
  sum += count
  console.log(String(count).padStart(4) + '  ' + from.slice(0, 84))
}
console.log(`\n${apply ? 'Udfoert' : 'Proevekoersel'}: ${sum} erstatninger i ${changedFiles} filer.`)
if (!apply) console.log('Koer med --apply for at gennemfoere.')
