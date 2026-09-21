# Supply Chain Hub 1.5.5

## Baseline

- Startpunkt: GitHub Release `v1.5.4`
- Baseline-commit: `24de8b1`
- Udviklingsbranch: `develop/1.5.5`
- Lokal worktree: `C:\TCD Tools\Supply Chain Hub\Supply-Chain-Hub 1.5.5`

Version 1.5.4 er en frossen release-baseline. Alle nye rettelser og funktioner til
1.5.5 laves i denne worktree og må ikke ændres direkte på `main` eller tagget
`v1.5.4`.

## Kompatibilitet der skal bevares

- Det interne pakkenavn forbliver `tcd-hub`.
- Configfilen forbliver `supply-chan-hub.config`.
- Miljøvariablen forbliver `TCD_HUB_DATA_DIR`.
- Eksisterende data i platformroden, `_registry`, `_shared` og teammapper må ikke
  overskrives eller slettes af migreringer.
- Opdateringspakken skal fortsat indeholde `Supply Chain Hub.exe` i ZIP-roden
  (se 1.5.4-fixet der forklarer omdøbnings-fejlen for klienter der stadig har
  den ældre `TCD Hub.exe` installeret — de kan kun opdateres via en manuel
  engangs-geninstallation, aldrig via auto-opdatering).

## Arbejdsgang

1. Lav ændringer i denne worktree.
2. Tilføj release-noter i `src/lib/changelog.ts`, når indholdet til 1.5.5 er kendt.
3. Kør `npx tsc --noEmit`, `node --test electron/*.test.cjs`, `npx vitest run`.
4. Kør `npm run electron:build` og verificér `Supply Chain Hub-1.5.5-win.zip`.
5. Push `develop/1.5.5`, opret `release/1.5.5` og PR mod `main`.
6. Opret først GitHub Release `v1.5.5`, når PR'en er merged og pakken er testet.

## Ændringer til 1.5.5

Se `src/lib/changelog.ts` for den brugervendte liste. Teknisk overblik:

**Vagtplan / Hub**
- Gentagne vagter kan redigeres, filtreres og faa interval op til 6 uger
- Forældreløse opgaver vises som "Ukendt opgave" i stedet for at forsvinde
- Hub-widgets viser nu ogsaa gentagne vagter (`src/lib/shiftPatterns.ts`, delt
  med ShiftSchedule saa de to visninger ikke kan naa at vaere uenige)

**Hubert (AI)**
- App-vejledning: `electron/assistantAppGuide.cjs` (ny) daekker alle Hub-moduler
- Ny "Generelt"-tilstand uden hub-data, tydeligt markeret i UI'et
- 8B udskiftet med 4B: RAM-krav 7 GB -> 4,5 GB, download 6 GB -> 3 GB
- Svar afkortes ikke laengere (max_tokens 384 -> 1536)

**Lager og stabilitet**
- EPERM fra SMB "delete pending" behandles nu som laasekoe, ikke som fejl
- Offline-koe kasserer permanent fejlede aendringer i stedet for at blokere
- Automatiske backups: én pr. time i dag, én pr. afsluttet dag, 14 dage

**Guide Bibliotek**
- Gem som kladde + kladdeoversigt, saa paabegyndt arbejde ikke gaar tabt
- Word-import henter ikke laengere dokumentets egen indholdsfortegnelse
- Import er markant hurtigere: ét KV-skriv pr. billede i stedet for ét pr. 256 KB

## Udrulning - rækkefølgen betyder noget

- [ ] **Commit og push.** ALT ovenstaaende laa ucommittet 2026-09-21.
- [ ] Byg zip. Bemærk: `npm run electron:build` HÆNGER paa `portable`-maalet
      (electron-builder kan ikke hente NSIS-vaerktoejer gennem proxy).
      Zip'en bliver faerdig FOER det sker. Opdateringen bruger kun zip'en
      (`electron/updater.cjs`), saa portable er ikke noedvendig - overvej at
      fjerne `portable` fra scriptet.
- [ ] 4B-modelfilerne skal ligge i `<drev>/ai-model/` FOER udgivelsen (gjort).
- [ ] 8B-filerne paa drevet maa FOERST slettes NAAR 1.5.5 er udrullet.
      1.5.4 forventer 8B og mister ellers muligheden for at hente modellen.
- [ ] Efter udrulning: slet `Qwen3VL-8B-Instruct-Q4_K_M.gguf` og
      `mmproj-Qwen3VL-8B-Instruct-F16.gguf` fra drevet (~5,9 GB).
