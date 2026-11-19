# Svensk sprog i Supply Chain Hub (1.6.0)

Brugerønske (2026-10-02): "sætte svensk sprog aktivt i hubben, sådan at man kan vælge svensk i appen. Samt oversætteren i guide biblioteket kan oversætte til og fra svensk."

Regler: TDD (RØD test først), alle eksisterende tests forbliver grønne, ingen skrivning til produktionsdata (M:) uden eksplicit ja – det gælder også nye oversættelsesmodeller i `translation-models/`.

## Udgangspunkt (kortlagt)
- `Language` udledes af `translations` (da og en inline, fi fra `translations.fi.json`). Tilføjes `sv`, fanger TypeScript de fleste `Record<Language,…>`-steder.
- ~48 filer i `src/` har egne da/en/fi-tekster (objekter eller ternaries `language === 'da' ? … : language === 'fi' ? … : en`). Ternaries falder stille til engelsk – kræver gennemgang.
- Datoformat: `'da-DK' | 'fi-FI' | 'en-GB'` og date-fns-locales flere steder.
- Hubert: 12 electron-filer med da/en/fi-tekster, sprogkendelse og intent-regexes. I dag tvinges `'sv'` til dansk.
- Guide-oversætter (Bergamot): sprogpar findes som mapper i `<data>/translation-models/` (daen, enda, enfi, fien). Mozilla har `sven` og `ensv`; da↔sv og fi↔sv går via engelsk (understøttes allerede generelt). `translator.ts` (sprogtype, sprogkendelse, ordbogs-fallback) og GuideViewer/GuideEditor kender kun da/en/fi.

## Fase 1 – Fundament: svensk kan vælges
- [x] RØD: paritetstest for alle sprog (fi og sv) – samme nøgler og `{pladsholdere}` som en.
- [x] `src/lib/translations.sv.json` (alle ~1.640 tekster, oversat fra dansk/engelsk – produktnavne bevares).
- [x] `translations.ts`: `sv` tilføjes; sprogvælgeren viser "Svenska".
- [x] `sv-SE`/date-fns `sv` alle steder med datoformat (håndhæves af `swedishCoverage.test.ts`).
- [x] tsc/vitest grønne.

## Fase 2 – Alle hardkodede tekster i appen
- [x] Gennemgå de ~48 filer med egne sprogobjekter/ternaries og tilføj svensk.
- [x] Test der fejler, hvis en sprogliste/`Record` mangler `sv` (`swedishCoverage.test.ts` + labels-tests).

## Fase 3 – Hubert på svensk
- [x] `main.cjs` accepterer `sv`; persona-prompt svarer på svensk (og General-tilstand).
- [x] Svensk sprogkendelse (adskilt fra dansk – kun ord der ikke også er danske, fx ikke "var", "ledig", "flest").
- [x] Svenske tekster i alle assistant-moduler; intents forstår svenske spørgsmål (semester, sjuk, hemifrån, pass, idag/imorgon, nästa vecka, vecka 36, måndag …), handlinger (semesteransökan, att göra), guard, opfølgninger, guide-søgning (svensk ordliste) og app-guide.
- [x] Svensk spørgsmålsbank `electron/assistantSwedish.test.cjs` (13 tests) + `electron/swedishCoverage.test.cjs` – RØD først, nu grønne; 598/598 electron-tests.

## Fase 4 – Guide-oversætteren til/fra svensk
- [x] `translator.ts`: `GUIDE_LANGUAGES` med `sv`, sprogkendelse der skelner svensk fra dansk/finsk, sikker ordbogs-fallback (svensk forbliver uændret i stedet for at blive til engelsk) – `translator.test.ts`.
- [x] GuideViewer viser "Svenska" som visningssprog; GuideEditor kan markere en guide som svensk.
- [x] Hent `sven` og `ensv` lokalt (temp-mappe, SHA-256 kontrolleret af scriptet) og verificér med rigtig Bergamot: en↔sv, da↔sv via engelsk.
- [x] Fundet ved verifikation: Bergamot-WASM frigiver aldrig modeller og løber tør for hukommelse ved model nr. 6. Appen holder nu højst 4 modeller og starter en frisk motor ved sprogskift; døde workers afviser ventende kald (`bergamotTranslator.test.ts`).
- [x] **Kopiér modellerne til det fælles drev (`translation-models/`) – kræver brugerens ja.** Brugeren valgte (2026-10-02): vent til 1.6.0 udgives. Verificerede modeller ligger i `%TEMP%\sch-sv-models\translation-models\{ensv,sven}`; ellers `npm run translation:models -- --pairs ensv,sven`.

## Fase 5 – Spil, changelog og afslutning
- [x] Spil-labels og Cube Basher på svensk (`rules.js` TEXT.sv, `sv-SE` talformat, pladsholder-test for alle sprog).
- [x] "Hvad er nyt" for 1.6.0.
- [x] Guide-oversætterens ordbogs-fallback har svensk (en↔sv ordliste, da/fi↔sv via engelsk) ligesom finsk.
- [x] Fuld verifikation (tsc 0, vitest 684/684, electron 598/598); dev-vindue genstartet på port 5020. Release-build laves først, når brugeren beder om det.

Anbefalet start: Fase 1.
