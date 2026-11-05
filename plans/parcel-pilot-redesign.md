# Parcel Pilot – redesign af Nexi Flyer

Brugerønske (2026-10-01): "fortsæt redesign nu nexi flyer, find på et nyt navn". Samme proces som Chicken Invaders og Prism Break: ren motor med TDD, forudtegnede sprites, fælles arkadekabinet, fordybet spilleflade, ny highscoretavle, gammel tavle markeret i Creator Panel.

## Navn og idé

**Parcel Pilot** (samme navn på DA/EN/FI). Man flyver en fragtdrone med en pakke gennem en containerhavn om natten. Containerstakke står på kajen, og kraner hænger containere ned fra oven. Mellem dem skal dronen igennem. Det passer til Supply Chain Hub og erstatter fuglen og rørene.

## Spildesign

- Felt 960x600 (samme format som de andre spil), fast tidstrin 1/120 s, seeded rng.
- Ét-knaps-styring som før: hvert tryk giver et løft (Mellemrum, pil op, W, klik/tryk). P pauser.
- Fysik i px/s: tyngde 1700, løft sætter vy til -500, maks faldfart 720. Loftet stopper dronen uden skade; vandet og containerne er dødelige.
- Porte: par af containerstakke med et hul. Bredde 84. Hul og fart pr. sværhedsgrad (let 215/210, mellem 185/250, svær 158/290, ekspert 138/330), afstand 340/320/300/285, maks spring mellem huller som før.
- Zoner hver 10. port: Havnen (skumring), Terminalen (nat), Nordlys, Stormen (regn og lyn); derefter forfra med højere fart (+4 % pr. zone, loft +24 %).
- Bevægelige porte: svær/ekspert fra zone 2, mellem fra zone 3; lodret sving 36-60 px.
- Point: port 10 x gange-faktor. Perfekt passage (midt i hullet, inden for 22 % af hullets højde fra midten) øger rækken; faktor = 1 + floor(række/3), maks x5. Ikke-perfekt nulstiller rækken.
- Pakker i ca. 40 % af mellemrummene: 25 x faktor. Én gylden pakke pr. zone giver et skjold, der tager ét sammenstød (kort usårlighed 1,2 s).
- Styrt: dronen tumler ned i vandet (status `crashed`), derefter `over`.
- Statistik: point, porte, pakker, perfekte, længste række, zone. Highscore gemmes med `level` = zone.

## Grafik og lyd

- Parallakse: himmel pr. zone (stjerner, nordlys, stormskyer), fjern skyline med oplyste vinduer, kraner, vand med spejlinger, kaj.
- Containere med bølgeplader, døre og mærker i hubbens farver; hængende stakke med kabler og spreder.
- Drone med roterende propeller, LED-lys, pakke under sig, hældning efter fart. Skyggestrøg, støv fra rotorerne, gnister ved styrt, plask, regn og lynglimt i stormzonen.
- HUD: point, faktor-chip, zone, skjold. Bannere ved ny zone. Reduceret bevægelse dæmper rystelser og partikler.
- Lyd via fælles `createSynth`: løft, port, perfekt (stiger med rækken), pakke, skjold, skjold brudt, zone, styrt, plask.

## Lagring

- Ny tavle `parcel-pilot-global-leaderboard` (sværhedsgrader som kategorier, `{score, level}`); runder tælles fortsat på `nexi-flyer-play-counts`.
- Gammel `nexi-flyer-global-leaderboard` vises i Creator Panel som "Gammel version" med slet-knapper.
- `teamReadPolicy` får den nye nøgle; assistenten svarer på "Parcel Pilot" og "Nexi Flyer" fra den nye tavle.

## Fase 1 – Motor (TDD)
- [x] `config.ts`: felt, tidstrin, sværhedsgrader, nøgler; test.
- [x] `engine.ts`: klar-tilstand med svæv, løft, tyngde, loft, vand; test RØD/GRØN.
- [x] Porte: generering med seeded rng, maks spring, bevægelige porte, kollision med cirkel mod rektangler; test.
- [x] Point, perfekt række og faktor, pakker, gylden pakke og skjold; test.
- [x] Zoner, fartstigning, styrt, game over én gang, determinisme og lang simulation med autopilot; test.

## Fase 2 – Grafik, effekter, lyd og tekster
- [x] `labels.ts` DA/EN/FI (test).
- [x] `effects.ts` med levetider og lofter, reduceret bevægelse (test).
- [x] `audio.ts` med hændelse til lyd (test).
- [x] `sprites.ts` + `render.ts`: parallakse, containere, drone, pakker, HUD, bannere, regn og lyn.
- [x] `ParcelMarquee.tsx`: motoren spiller selv bag menuen.
- [x] Skærmbilleder gennemses og poleres.

## Fase 3 – Skal og Arcade
- [x] `ParcelPilot.tsx` som Prism Break: menu, fordybet spilleflade, pause, game over, genstart, gem score og runde.
- [x] Kabinet-tema `parcel` (CSS-tokens og titel med eget præg).
- [x] `Arcade.tsx`: flise "Parcel Pilot", beskrivelse DA/EN/FI, slank tilbage-bjælke.
- [ ] Slet `NexiFlyer.tsx` og `src/lib/nexiFlyerControls.ts` (+ test): afventer brugeren, da filerne har ucommittede ændringer / aldrig er committet.

## Fase 4 – Creator Panel, Electron og assistent
- [x] Creator Panel: ny tavle + tværgående highscores, gammel Nexi Flyer-tavle markeret som gammel.
- [x] `teamReadPolicy.cjs`, `assistantContext.cjs`, `assistantKnowledge.cjs`, `assistantAppGuide.cjs` + tests (RØD først).

## Fase 5 – Verifikation
- [x] `vitest run`, Electron-tests, `tsc -b`, `npm run build`.
- [x] `scripts/verify-parcel-pilot.cjs` på midlertidige data (dev og produktionsbuild), og de to andre spils verifikationer igen.
- [x] Kodereview og ret fund.
- [x] Opdatér planen, genstart dev-vinduet pænt.

## Fejlrettelse – tryk på ekspert (brugerfejl 2026-10-01)
- [x] Målt i appen: alle tryk modtages; tabte løft skyldtes tryk lagt i samme billede under hak (kø med loft 2, trin lige efter hinanden) og styrt der ikke ses ved reduceret bevægelse.
- [x] `input.ts` `scheduleLifts`: hvert tryk får sit eget trin efter sit tidsstempel; tryk gemmes til næste billede, når der ikke er trin nok (test).
- [x] Tydeligt "Styrt!" og stoppede propeller ved styrt, også ved reduceret bevægelse (test).

Start med fase 1.
