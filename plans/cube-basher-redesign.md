# Cube Basher – redesign og nyt indhold

Brugerønske (2026-10-02): "Kan du give Cube Basher samme omgang, med et redesign af spillet så det kommer til at se meget flottere ud og måske også nogle nye powers osv osv".

Valg fra brugeren:
- Fantasy-verdenen beholdes, men gøres markant flottere.
- Nyt indhold: nye våben, nye passive powers, våben-evolutioner, nye fjendetyper, kister og events.
- Ingen fælles topliste i hubben (kun lokal rekord i spillet).

## Udgangspunkt

- Spillet er én three.js-fil (`public/games/cube-basher/index.html`, ca. 2600 linjer) i en iframe (`CubeBasherGame.tsx`). Den arkitektur beholdes: iframen rydder alt op ved afmontering.
- Gem-nøglen `cubebasher_v1` (mønter + permanente opgraderinger) beholdes og udvides bagudkompatibelt med en rekord.

## Arkitektur

- Ny ren ES-modulfil `public/games/cube-basher/rules.js` (ingen three.js, ingen DOM): tekster DA/EN/FI, våbenstatistik (også evolverede), passive powers med loft, evolutionsregler, kort-trækning, kiste-indhold, event-planlægning, døgnfaser, fjendevalg og rustning. Testes med vitest fra `src/games/cubeBasher/rules.test.ts`.
- `index.html` importerer `./rules.js` og står for grafik, fysik og UI.
- Sprog: wrapperen sender `?lang=da|en|fi` med i iframe-adressen.

## Nyt indhold

- **Nye våben (4):** Kædelyn (springer mellem fjender), Savklinger (spiraler udad og skærer igennem), Giftsky (efterlader giftpøl med skade over tid), Meteor (falder med varsel og stor eksplosion). Op til 5 våben pr. runde.
- **Nye passive powers (5):** Vampyrtand (heler ved drab), Tornehud (returnerer kontaktskade), Ekstra projektil (+1 projektil, maks. 2), Stort område (+12 % radius), Ekstra liv (genopstå én gang med 50 % liv, maks. 1).
- **Evolutioner (11):** Våben på max-niveau + bestemt passiv giver en super-version, som tilbydes på et gyldent kort og i kister.
- **Nye fjender (3):** Bombekube (tænder lunte og eksploderer), Panserkube (rustning trækker fast skade fra hvert slag), Blinkkube (teleporterer tæt på spilleren efter et varsel).
- **Kister:** elites og bosser taber en rigtig kiste; åbning giver evolution, hvis man kan, ellers opgraderinger + guld.
- **Events:** Meteorregn, Guldfeber, Sværm (ring af fjender) og Blodmåne (hurtigere fjender, dobbelt XP), cirka hvert 2.–4. minut og aldrig oven i en boss.

## Grafik

- Døgncyklus over de 30 minutter: daggry → dag → gyldne time → skumring → nat med stjerner (himmel, sol, tåge og lys glider mellem faserne).
- Farvegradering og vignet i efterbehandlingen; kraftigere glød på magi.
- Tegneserie-omrids på fjender, græs der bølger i vinden, glødende pickups, rigtig kiste-model, opstignings- og dødseffekter, nye projektil-effekter.
- Ny UI: menu med levende 3D-baggrund (kameraet kredser), nyt HUD (våben- og passiv-ikoner, liv/stamina, døgnfase, event-indikator), kort med sjældenhedsfarver og gyldne evolutionskort, kisteåbning, nye slutskærme med rekord.

## Fase 1 – Regler (TDD)
- [x] `rules.js` + `src/games/cubeBasher/rules.test.ts`: tekster, våbenstatistik, passive powers, evolutioner, kort, kister, events, døgnfaser, fjendevalg, rustning (RØD først).

## Fase 2 – Gameplay i spillet
- [x] Nye våben, passive powers, evolutioner, fjender, kister, events og ekstra liv koblet ind i `index.html`; sprog via `?lang=`.

## Fase 3 – Grafik og UI
- [x] Døgncyklus, farvegradering, omrids, græsvind, effekter og modeller.
- [x] Ny menu, HUD, kort, kisteåbning og slutskærme.
- [x] Ekstra grafisk løft (brugerønske): tegneserie-shading og blæk-omrids på hele verdenen, runde træer og grantræer, søer med vand-shader og åkander, bløde skyer, tættere græs og flere blomster, hvirvlende giftskyer.
- [x] Tre helt forskellige helte: Bonky (viking med hornhjelm og rune-hammer), Zippy (ræve-spejder med ører, hale, briller, halstørklæde og boomerang), Chonk (sten-paladin med spandhjelm, glødende øjne, skjold og stridskølle); 3D-portrætter på karakterkort og i HUD.

## Fase 4 – Hub
- [x] `CubeBasherGame.tsx` sender sproget med; kortteksten i `Modern.tsx` nævner det nye indhold.

## Fase 5 – Verifikation
- [x] Alle tests, typecheck, build; `scripts/verify-cube-basher.cjs` i Electron på midlertidige data (iframe, start, level-up, evolution, kiste, events, nye fjender, skærmbilleder, ingen fejl); kodereview; genstart dev-vinduet.

Start med fase 1.
