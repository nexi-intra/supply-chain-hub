# Route Runner – redesign af Neon Snake

Brugerønske (2026-10-01): "Så mangler vi blot at redesigne snake". Navn valgt af brugeren: **Route Runner**. Samme proces som de fire andre spil.

## Idé

Du kører et lagertog (truck med vogne) rundt på lagergulvet. Hver pakke bliver en ny vogn, så toget vokser. Væggen, dine egne vogne og (på de svære niveauer) paller og reoler på gulvet afslutter spillet.

## Spildesign

- Gitter 30x18, fast tidstrin 1/120 s, seeded rng. Toget flytter én celle pr. "tick"; renderen glider blødt mellem cellerne.
- Tick-tid pr. sværhedsgrad (let 0,15 s, mellem 0,12 s, svær 0,095 s, ekspert 0,075 s); 1,2 % hurtigere pr. pakke, højst 45 % hurtigere.
- Drejninger køes (højst 3) og udføres én pr. tick; 180°-vending og gentagelser ignoreres, så hurtige dobbeltdrej aldrig går tabt.
- Klar-tilstand: toget venter, til spilleren drejer eller trykker mellemrum.
- Pakke: +1 vogn, 10 point x faktor. Kombo: pakker inden for 3 s af hinanden; faktor = 1 + floor((kombo-1)/2), højst x5.
- Ekspres-pakke (18 % chance efter en pakke): 50 point x faktor, forsvinder efter 6 s.
- Forhindringer: let 0, mellem 4, svær 6, ekspert 9 paller/reoler, aldrig i startbanen, aldrig ved kanten, aldrig klods op ad hinanden.
- Statistik: point, pakker, ekspres, længste tog, bedste kombo, tid.

## Grafik og lyd

- Betongulv med malede kørebaner, sikkerhedsbarriere som kant, paller og reoler som forhindringer.
- Trækker med lygtekegle og blinkende orange lampe; vogne med kasser i forskellige farver, koblinger og blød drejning.
- Pakker med hop og glød; ekspres med lyn og nedtællingsring. Effekter: glimt og tekst ved opsamling, vragdele og kasser ved styrt.
- HUD: point, togets længde, kombo-måler. Lyd via fælles `createSynth`.

## Lagring

- Ny tavle `route-runner-global-leaderboard` (sværhedsgrader); runder tælles fortsat på `neon-snake-play-counts` (samme form).
- Gammel `neon-snake-global-leaderboard` markeres i Creator Panel; assistenten svarer på "Route Runner" og "Neon Snake" fra den nye tavle.

## Fase 1 – Motor (TDD)
- [x] `config.ts`, `engine.ts`: start, bevægelse, drejekø, vækst, kombo, ekspres, kollisioner, fart, forhindringer; test.
- [x] `autoplay.ts`: BFS-autopilot til demo og lang simulation; test.

## Fase 2 – Grafik, effekter, lyd og tekster
- [x] `labels.ts`, `effects.ts`, `audio.ts` (test); `sprites.ts`, `render.ts`, `RouteMarquee.tsx`; skærmbilleder.

## Fase 3 – Skal og Arcade
- [x] `RouteRunner.tsx`, kabinet-tema `route`, Arcade-flise.

## Fase 4 – Creator Panel, Electron og assistent
- [x] Creator Panel + `teamReadPolicy`/assistent + tests (RØD først).

## Fase 5 – Verifikation
- [x] Alle tests, build, `scripts/verify-route-runner.cjs` (dev og produktion), de andre spils verifikationer, kodereview, genstart dev-vinduet.

Start med fase 1.

## Status
- [x] Lange simulationstests har nu eksplicit tidsgrænse (de overskred 5 s under fuld parallel testkørsel).
- [x] Assistentens spil-guide kender nu både nye og gamle spilnavne (test).
- [ ] Slet det gamle `src/components/NeonSnake.tsx`: afventer brugeren.
