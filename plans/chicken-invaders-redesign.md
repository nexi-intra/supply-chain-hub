# Chicken Invaders – redesign af spil og Arcade-menu

**Mål:** Erstat Chickeninvasion (`src/components/EndlessDodger.tsx`) med et nyt, langt federe "Chicken Invaders" og indfør et fælles, temabaseret menudesign, som de øvrige Arcade-spil får, når de redesignes.

**Arkitektur:** Ren spillogik i `src/games/chickenInvaders/` (testet med Vitest, ingen React/DOM), en canvas-renderer der tegner fra refs med fast tidstrin (60 Hz), og en tynd React-skal til menu, highscores og game over. Det fælles menudesign ligger i `src/components/arcade/` og får spil-specifikt tema via CSS-variabler og en "marquee"-tegnefunktion pr. spil.

**Godkendte beslutninger (bruger, 2026-10-01):**
- Navn: **Chicken Invaders**.
- Ny highscore-tavle (sæson 2): `chicken-invaders-global-leaderboard`. Den gamle `endless-dodger-global-leaderboard` røres ikke i storage.
- Spillede runder fortsætter på den eksisterende `endless-dodger-play-counts` (antal runder afhænger ikke af pointskala, så historikken bevares).
- Creator Panel viser de gamle highscores i en tydeligt markeret sektion ("Gammel version"), så de nemt kan ses og slettes – enkeltvis eller samlet.
- Lyd: syntetiske effekter via WebAudio, **slået fra som standard**, mute-knap.
- Menuer redesignes: fælles skelet, men hvert spil må stikke ud og bære præg af spillet. Chicken Invaders er første spil på det nye skelet; de andre spil beholder deres nuværende menu, indtil de selv redesignes.
- Ingen nye npm-afhængigheder. Ingen release, commit eller skrivning i produktionsdata uden godkendelse.

**Bevares fra i dag:** 4 sværhedsgrader med hver sin tavle, highscores på tværs af teams, klar-til-start-overlay, pause (P + auto-pause ved fokus-tab), "Spil igen" med mellemrum/Enter, `data-game-active` (sat af `Arcade.tsx`), atomare highscore-skrivninger via `submitHighscore`, repeat-key-guards, DA/EN/FI.

---

## Spildesign

**Styring:** ←/→ eller A/D flyt, mellemrum (hold) skyd, M missil, P pause. Mus: flyt over spillefladen styrer skibet, hold venstre knap for at skyde.

**Våben (niveau 1–5):** 1 enkelt skud → 2 dobbelt → 3 tredobbelt spredning → 4 femdobbelt spredning → 5 ionlaser (gennemborende stråle). Røde gaver fra døde høns giver +1 niveau (på max: +1.000 point). Mister du et liv, falder du ét niveau (ikke under 1).

**Varme:** Hvert skud giver varme; varmen falder løbende. Ved 100 % overophedes kanonen og låser i 1,2 s. Power-up "Køling" fjerner varmeopbygning i 8 s.

**Fjender:**
| Type | Liv | Point | Opførsel |
|---|---|---|---|
| Høne | 1 | 100 | Formation, taber æg |
| Hjelmhøne | 3 | 250 | Formation, hjelmen flækker synligt |
| Dykkerhøne | 1 | 200 | Forlader formationen og dykker i kurve mod skibet |
| Guldhøne | 1 | 1.000 | Flyver hurtigt tværs over toppen, skyder ikke |
| Meteor (lille/stor) | 1/3 | 50/150 | Meteorbølge; stor splittes i to små |
| Mor Høne (boss) | skalerer | 5.000 × bossnummer | Hver 5. bølge, tre faser |

**Bølgecyklus (gentages med stigende fart, ægfrekvens og rækker):** 1 klassisk formation med indflyvning i kurver → 2 formation + dykkere → 3 meteorregn → 4 hjelmformation + guldhøne → 5 Mor Høne.

**Mor Høne:** Livsbjælke øverst. Fase 1: side-til-side + vifte af æg. Fase 2 (under 66 %): ægregn + kalder 3 kyllinger. Fase 3 (under 33 %): varslet laser (advarselslinje i 1 s, derefter stråle). Kort "hit-stop" og stor eksplosion når hun dør.

**Point og combo:** Drab inden for 1,2 s af hinanden bygger en kæde; gange-faktor = 1 + ⌊kæde/5⌋, max ×5. Kyllingelår (fra døde høns) = 50 × faktor. Ryddet bølge = 500 × bølge; uden at blive ramt i bølgen: +1.000 ("Perfekt bølge"). Ekstra liv for hver 25.000 point (max 5 liv).

**Power-ups:** Gave (våben +1), Skjold (tager ét træf), Køling (8 s uden varme), Missil (rydder skærmen og giver bossen 15 % skade; maks. 3 på lager).

**Liv:** 3 ved start. Træf → eksplosion, 2 s usårlighed (blinkende skib), våben −1. Når formationen når ned til skibets zone, koster det et liv, og formationen skubbes tilbage op.

**Sværhedsgrader** (alle tal i `config.ts`): Let / Mellem / Svær / Ekspert skalerer fjendefart, ægfrekvens og -fart, dykkerfrekvens og bossens liv. Logisk spilleflade er altid 960×600, skaleret til containeren, så skærmbredde ikke påvirker sværhedsgraden og tavlerne forbliver fair.

**Følelse og grafik:** Stjernehimmel i 3 parallakselag + farvet tåge, skib med motorglød og krængning, høns der basker og blinker og ser forskrækkede ud når de rammes, fjereksplosioner, æg der splatter, hvide hit-flash, skærmrystelse (dæmpet ved `prefers-reduced-motion`), flydende pointtal, combo-måler og varmemåler i en canvas-HUD. Sprites forhåndstegnes til offscreen-canvas for ydeevne.

## Fælles menudesign ("arkadekabinet")

**Koncept:** Hver spilmenu er et arkadekabinet. Øverst sidder en **marquee** – et levende, spil-specifikt canvas med titlen sat stort i spillets egen behandling. Under den et **kontrolpanel**: sværhedsgrad som fysiske vælgerknapper, styring vist som tastekapper, og én stor, oplyst startknap. Nederst **Hall of Fame**: én tavle ad gangen med faner pr. sværhedsgrad (følger den valgte sværhedsgrad), top 3 fremhævet, egen placering vist hvis man er uden for top 10. Skelettet er ens; marquee, palet og tekster er spillets egne.

```
+--------------------------------------------------------------+
| <- Arcade                                       [lyd fra/til] |
| MARQUEE (levende spil-art, ~220px)                            |
|   Chicken Invaders                         Din rekord  12.450 |
|   Mor Høne vil have sin flok tilbage.      Bedst: 48.200      |
+--------------------------------------------------------------+
| [Let] [Mellem] [Svær] [Ekspert]   <- vælgerknapper            |
| Kort beskrivelse af valgt sværhedsgrad                        |
| [<-][->] Flyt   [Mellemrum] Skyd   [M] Missil   [P] Pause     |
|                      (  Start spil  )                         |
+--------------------------------------------------------------+
| Hall of Fame   [Let][Mellem][Svær][Ekspert]                   |
|  1  Navn (team)                                      48.200   |
|  ...                                                          |
+--------------------------------------------------------------+
```

**Chicken Invaders-palet:** Rummørk `#120c2b`, Æggeblomme `#ffc93c`, Kam-rød `#ef3b4f`, Fjer `#fff4dc`, Plasma `#35e0f0`.
**Typografi:** Appens IBM Plex Sans; titel i 800-vægt med stram spatiering, tal med `tabular-nums`. Ingen nye skrifttyper.
**Principper:** Marqueen er det ene, der må være højt og vildt; kontrolpanel og Hall of Fame er rolige og bruger temaets tokens (virker i lys og mørk). Ingen versaler på labels, ingen dekorative nummereringer. Fuldt tastaturbetjent med synligt fokus; `prefers-reduced-motion` viser et stillbillede i marqueen. Ingen vandret scroll ned til 375 px.

**Game over:** Fælles overlay oven på spillefladen (canvas forbliver monteret): slutscore der tæller op, "Ny rekord"-bånd, spil-specifik statistik (her: bølge, høns skudt, træfsikkerhed, højeste combo, bosser besejret), "Spil igen" (mellemrum/Enter) og "Tilbage til menu".

---

## Filstruktur

**Nye filer**
- `src/games/chickenInvaders/config.ts` – sværhedsgrader, konstanter, point.
- `src/games/chickenInvaders/rng.ts` – seedet tilfældighed (deterministiske tests).
- `src/games/chickenInvaders/scoring.ts` – combo, gange-faktor, bonusser, ekstra liv.
- `src/games/chickenInvaders/weapons.ts` – våbenniveauer, skudmønstre, varme.
- `src/games/chickenInvaders/waves.ts` – bølgeplan og fjendeopsætning.
- `src/games/chickenInvaders/boss.ts` – Mor Høne-tilstandsmaskine.
- `src/games/chickenInvaders/engine.ts` – `createGame`, `stepGame` (fast tidstrin), kollisioner, power-ups, liv; returnerer events.
- `src/games/chickenInvaders/render.ts` + `sprites.ts` – canvas-tegning og sprite-cache.
- `src/games/chickenInvaders/effects.ts` – partikler, rystelse, flash, flydende tal (drevet af events).
- `src/games/chickenInvaders/audio.ts` – WebAudio-effekter; mute gemt i `localStorage` (`arcade-sound-enabled`, fælles for Arcade).
- `src/games/chickenInvaders/labels.ts` – DA/EN/FI-tekster.
- `src/games/chickenInvaders/ChickenMarquee.tsx` – levende menu-art.
- `src/games/chickenInvaders/ChickenInvaders.tsx` – React-skal (erstatter `EndlessDodger.tsx`).
- `src/components/arcade/ArcadeCabinetMenu.tsx`, `ArcadeDifficultyPicker.tsx`, `ArcadeHallOfFame.tsx`, `ArcadeGameOver.tsx`, `ArcadeSoundToggle.tsx`, `arcadeCabinet.css`.
- Tests: `*.test.ts` ved siden af hvert logikmodul + `src/components/arcade/arcadeHallOfFame.test.ts` for ren sorterings-/placeringslogik.
- Verifier: `scripts/verify-chicken-invaders.cjs` (playwright-core, midlertidig datamappe).

**Ændrede filer**
- `src/views/Arcade.tsx` – titel, beskrivelse, lazy import, slank tilbage-bjælke for redesignede spil.
- `src/views/arcade.css` – accent for `endlessdodger` (bevar id'et, så navigation og CSS ikke brydes).
- `src/views/CreatorPanel.tsx` – ny tavle + markeret "Gammel version"-sektion.
- `src/components/GameLeaderboardAdmin.tsx` – `legacy`-prop: badge pr. række, synlige slet-knapper, "Slet alle gamle highscores" med bekræftelse.
- `src/lib/translations.ts` + `src/lib/translations.fi.json` – nye admin-tekster.
- `electron/teamReadPolicy.cjs` (+ test) – tillad `chicken-invaders-global-leaderboard` på tværs.
- `electron/assistantContext.cjs` (+ test), `electron/assistantKnowledge.cjs` – nyt navn og nøgle.
- `src/lib/changelog.ts` – 1.5.9-linje.
- Slettes: `src/components/EndlessDodger.tsx` (efter at det nye spil er verificeret).

---

## Fase 1 – Spillogik (TDD, ingen UI)
Kommando: `.\node_modules\.bin\vitest.cmd run src/games/chickenInvaders`

- [x] `rng.ts`: test at samme seed giver samme sekvens; implementér.
- [x] `config.ts`: sværhedsgrader og konstanter; test at alle 4 findes og at værdier stiger fra Let til Ekspert.
- [x] `scoring.ts`: tests for kæde inden for 1,2 s, nulstilling efter pause, faktor maks ×5, bølgebonus, perfekt bølge, ekstra liv ved 25.000-grænser (også ved spring over flere grænser) og maks 5 liv; implementér.
- [x] `weapons.ts`: tests for skudmønster pr. niveau (antal/vinkler), opgradering/nedgradering med grænser, varme pr. skud, afkøling, overophedning låser 1,2 s, Køling stopper varme; implementér.
- [x] `waves.ts`: tests for bølgecyklus (1–5 og gentagelse), skalering pr. runde, boss hver 5. bølge, rækker/kolonner inden for spillefladen; implementér.
- [x] `boss.ts`: tests for livsskalering, faseskift ved 66 %/33 %, laser varsles før den rammer, missil giver 15 % skade; implementér.
- [x] `engine.ts` del 1: tests for skibsbevægelse inden for kanter (tastatur og pointer), skud respekterer varme, kugle rammer høne → drab, point og events; implementér.
- [x] `engine.ts` del 2: tests for æg/dykker/laser rammer skib → liv −1, usårlighed 2 s, våben −1; skjold tager ét træf; formation i skibszonen koster liv og skubbes op; game over ved 0 liv; implementér.
- [x] `engine.ts` del 3: tests for drops (seedet), opsamling af gave/skjold/køling/missil, missil rydder skærmen, bølge ryddet → næste bølge, statistik (skud, træf, drab, højeste combo, bosser); implementér.
- [x] Kør hele mappen grøn + `npx tsc -b` uden fejl.

**Fase 1 resultat (2026-10-01):** 71 tests grønne i `src/games/chickenInvaders` (inkl. en simuleret gennemspilning af bølge 1–5 + Mor Høne på let og ekspert uden NaN-positioner), `tsc -b` uden fejl. Mutationstjek: slås usårlighed fra, fejler 2 tests som forventet.
**Note til fase 4:** Musen styrer kun skibet, når ingen piletast er nede. Skallen skal derfor sætte `pointerX` til `null`, når en bevægelsestast trykkes, så skibet ikke trækkes tilbage mod en gammel museposition.

## Fase 2 – Grafik, effekter og lyd
- [x] `sprites.ts`: forhåndstegnede sprites (høns i 2 baskeframes + forskrækket ansigt, hjelm i 3 skadestrin, dykker med flyverbriller, guldhøne, kyllinger, meteorer, Mor Høne med krone/rustning, skib, gaver/power-ups, kyllingelår, æg, baggrund med tåge og ringplanet).
- [x] `effects.ts` (TDD for ren logik): partikler lever/dør, rystelse dæmpes, deaktiveres ved reduced motion; flydende tal forsvinder efter levetid.
- [x] `render.ts`: parallakse-stjerner + tåge, alle objekter, HUD på canvas (point, faktor, varme, våbenniveau, liv, missiler, bosslivsbjælke), bølge-/boss-bannere, DPR-skalering af logisk 960×600.
- [x] `audio.ts`: korte synth-effekter (skud, træf, kluk, eksplosion, opsamling, overophedning, laser, boss); ingen lyd før brugeren slår den til; test at mute-tilstand gemmes/læses.
- [x] `labels.ts`: spillets tekster på DA/EN/FI med sprogets talformat (flyttet frem fra fase 4).

**Fase 2 resultat (2026-10-01):** 92 tests grønne, `tsc -b` uden fejl. Visuelt tjek i Edge via en midlertidig preview-side (slettet igen): indflyvning, kamp med combo, meteorregn, hjelmbølge, Mor Høne, laservarsel og -skud, spredeskud med skjold og ionlaser. Fundne fejl rettet: Mor Hønes krone blev klippet, og hun dækkede sin livsbjælke (nu `BOSS_Y = 150`). 10 sekunders simulation koster ~3 ms.

## Fase 3 – Fælles arkadekabinet-menu
- [x] `arcadeCabinet.css`: skelet + tema-tokens via `[data-arcade-theme]`; lys/mørk; fokus; reduced motion; 375 px.
- [x] `ArcadeCabinetMenu.tsx`: marquee-slot, titel/tagline, egen rekord + bedste score, sværhedsvælger, tastekapper, startknap, lydknap.
- [x] `ArcadeDifficultyPicker` (i `ArcadeCabinetMenu.tsx`): radiogruppe med piletaster/Home/End, `aria-checked`, roving tabindex, synligt fokus.
- [x] `ArcadeHallOfFame.tsx`: faner pr. sværhedsgrad (følger valget), top 10, top 3 fremhævet, teamkode, egen placering uden for top 10; ren sorteringslogik testet.
- [x] `ArcadeGameOver.tsx`: overlay, tæller op (springes over ved reduced motion), "Ny rekord", statistik, knapper; virker med `useGameOverRetry`.
- [x] `ChickenMarquee.tsx`: høns der flyver i V-formation forbi titlen, skib der skyder; stillbillede ved reduced motion; mindre flok højt oppe på smalle skærme.
- [x] Fælles logik og tekster i `src/components/arcade/arcadeCabinet.ts` (DA/EN/FI) + `src/hooks/usePrefersReducedMotion.ts`.

**Fase 3 resultat (2026-10-01):** 8 nye logiktests; hele frontend-suiten 445 tests grønne; `tsc -b` uden fejl. Visuelt tjek i Edge via midlertidig preview-side (slettet igen) i lys/mørk ved 1280 og 375 px og med reduced motion: ingen vandret overflow, ingen konsolfejl, piletast skifter sværhedsgrad og highscore-fanen følger med. Rettet undervejs: høns dækkede taglinen på mobil, og game over-statistikken brød skævt.
**Designvalg:** "Spil igen"-knappen får ikke autofokus ved game over. En spiller, der holder mellemrum nede (skyder) i det øjeblik spillet slutter, ville ellers starte et nyt spil, når tasten slippes. Tastaturet virker via `useGameOverRetry`, og knappen kan nås med Tab.

## Fase 4 – Chicken Invaders-skal og Arcade-integration
- [x] `ChickenInvaders.tsx`: tilstande menu/ready/playing/paused/ended, rAF-løkke med fast tidstrin (maks 5 trin pr. frame), input-refs, repeat-guards, `useAutoPauseOnBlur`, `PauseOverlay`, `ArcadeReadyOverlay`, `useGameOverRetry`; ingen React-state pr. frame.
- [x] Highscore: `submitHighscore('chicken-invaders-global-leaderboard', …, { path: [difficulty] })`, derefter `refresh()`; `recordGamePlay('endless-dodger-play-counts', …)`; tavle via `useNestedLeaderboard` + `useCrossTeamLeaderboard`.
- [x] `labels.ts` DA/EN/FI for menu, HUD, bannere, game over, styring.
- [x] `Arcade.tsx`: titel "Chicken Invaders", ny beskrivelse (DA/EN/FI), lazy import af `ChickenInvaders`, slank tilbage-bjælke i stedet for det dobbelte banner; behold view-id `endlessdodger`.
- [x] Slet `src/components/EndlessDodger.tsx` når intet længere importerer den.

## Fase 5 – Creator Panel, Electron og tekster
- [x] `GameLeaderboardAdmin.tsx`: `legacy`-prop med "Gammel version"-badge på hver række, forklarende banner ("Highscores fra den gamle Chickeninvasion. De vises ikke længere i spillet og kan slettes."), altid synlige slet-knapper og "Slet alle gamle highscores" med bekræftelsesdialog (fjerner alle rækker i alle sværhedsgrader i det aktive hub via eksisterende `remove`-operation).
- [x] `CreatorPanel.tsx`: fanen hedder "Chicken Invaders"; ny tavle + `CrossHubHighscores` for ny nøgle; derunder legacy-sektionen for `endless-dodger-global-leaderboard` (uden statistikkort, så runder ikke vises dobbelt).
- [x] `translations.ts` / `translations.fi.json`: nye admin-tekster DA/EN/FI.
- [x] `teamReadPolicy.cjs`: tilføj ny nøgle; test at den kan læses på tværs.
- [x] `assistantContext.cjs` / `assistantKnowledge.cjs`: "Chicken Invaders" (mønster matcher også "chickeninvasion"), ny tavlenøgle, play counts uændret; opdatér tests.
- [ ] `changelog.ts`: linje om nyt Chicken Invaders og ny menu. (Udskudt til release, sammen med Prism Break.)

## Fase 6 – Verifikation og review
- [x] `npx tsc -b`, `vitest run`, `node --test electron/*.test.cjs`, `npm run build` – alle grønne.
- [x] `scripts/verify-chicken-invaders.cjs` mod midlertidig datamappe (`TCD_HUB_DATA_DIR`/`TCD_HUB_USER_DATA_DIR`): menu (lys/mørk, 375 px), tastaturvalg af sværhedsgrad, start, spil i nogle sekunder, pause/genoptag, game over, highscore skrevet til ny nøgle, runde talt på gammel nøgle, Creator Panel viser markeret gammel sektion og kan slette. Skærmbilleder gennemses.
- [x] Føleskontrol i produktionsbuild (60 Hz og høj opdateringsfrekvens kører samme hastighed).
- [x] Kodereview (code-reviewer-skill) og ret fund.
- [x] Genstart dev-vinduet pænt (CloseMainWindow) og bed brugeren prøve.

**Næste spil efter godkendelse:** Brick Break, Neon Snake, Nexi Flyer og Tetris – hver med egen plan på det fælles kabinet-skelet.

## Fase 7 – Fordybet spilleflade (brugerønske 2026-10-01)
- [x] Fælles `ArcadeStage`: fuldt vindue (portal til `body`, fixed), kun en slank bjælke (titel, sværhedsgrad, lyd, stop); scroll låst mens der spilles.
- [x] Canvas skaleres til den største størrelse der passer (ren `fitStage`-funktion, testet); intet loft på 960 px.
- [x] Highscores vises kun i menuen, ikke under spillet.
- [x] Verifieren tjekker at spillefladen dækker vinduet, at canvas er stor, og at highscores er skjult under spil.

**Anbefaling: start med fase 1.**
