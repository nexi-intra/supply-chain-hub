# Release 1.4.0 (større version)

Status: **UNDER UDVIKLING — MÅ IKKE RELEASES ENDNU**. Vent med release/build til alle ønskede ændringer er lavet og godkendt.

## Fase 1 — Klargøring
- [x] Ny branch `feature/1.4.0` oprettet (fra `feature/1.2.2-background-updates`)
- [x] Version bumpet 1.3.0 → 1.4.0 i `package.json` / `package-lock.json`
- [ ] Aftale hvilke features/ændringer der skal med i 1.4.0

## Fase 2 — Ændringer
- [x] Fix: "g" i overskriften "Terminal Configuration & Dispatch Hub" blev klippet af (bg-clip-text + for tæt line-height) på Auth- og Hub-siden
- [x] Fix: navne/score passede ikke pænt ind i highscore-rækkerne i alle 5 spil (rank-badge og score kunne krympe/wrappe) - nu `shrink-0`/`tabular-nums`
- [x] Tetris: fjernet sværhedsgrads-valg og levels - ét samlet highscores; spillet bliver nu selv gradvist sværere (fart stiger ud fra linjer ryddet + forløbet spilletid), med automatisk migrering af gammel opdelt highscore-/spilstatistik-data
- [x] ManagerPanel: admin/manager kan sætte et valgfrit brugernavn på en bruger; login virker med både email og brugernavn
- [x] Sikkerhedsfix (fundet undervejs): manager-oprettede/-redigerede adgangskoder blev gemt i klartekst i stedet for hashet - rettet til at bruge `hashPassword`
- [x] **Guide Bibliotek 2.0** (stor ombygning) — se separat plan: `plans/guide-library-2.0.md` — Fase 1-6 implementeret (editor m. sektioner/trin + billeder + versionering, opdaterings-interval m. badges/filter/gennemgået, A4-preview, DOCX-generator efter DESK3500-template, eksport-bibliotek m. kategorimapper, BM25-søgning, RAG-chatbot m. citater). UDESTÅR: manuel smoke-test i Word + mod delt datamappe
- [x] **Hærdning (fra kodegennemgang):**
  - [x] Fix 1: Normalisér vacation-entries datoer til yyyy-MM-dd (éngangs-migrering ved login + fælles parseLocalDate/toIsoDateString i dateUtils; ManualVacationGrant/rediger-ferie skriver nu yyyy-MM-dd; alle parse-steder i VacationCalendar/ManagerPanel konverteret)
  - [x] Fix 2: Atomar `kv:update` (append/upsert/remove pr. element) i Electron-storen m. fil-lås på tværs af klienter (stale-lock-overtagelse), øjeblikkelig kv:changed-broadcast, kvArrays-helpers; konverteret: EmailSystem-send, ferie-anmodning/fridag/manuel tildeling, godkend/afvis/redigér/slet ferie, ferie-sletning m. manager-mails, delte noter (opret/redigér/slet), projekter (opret/tilmeld/forlad/færdig/slet) + 5 nye store-tests
  - [x] Fix 3: ID-kollisioner — central `newId()` (flyttet til utils, re-eksporteret fra guideTypes) bruges i alle konverterede flows
  - [x] Feature: Automatisk daglig backup til `<datamappe>/Backup/tcd-hub-auto-backup-YYYY-MM-DD.json` fra main-processen (exclusive-create så kun én klient skriver pr. dag, 14 dages rotation, timetjek dækker midnat)

## Fase 3 — Test & validering
- [x] `npm test` (10/10 bestået)
- [x] `npm run build` (ingen fejl)
- [ ] Manuel smoke-test af app (start, login, kerne-views)

## Fase 4 — Release
- [ ] Merge til release-branch `release/1.4.0`
- [ ] Kør `scripts/build-release-v2.ps1`
- [ ] Kopiér kildekode til `TCD-Hub 1.4.0/tcd-hub-1.4.0 - Source code/`
- [ ] Publish opdatering (manifest.json + zip) til `TCD HUB STORAGE/updates/`
