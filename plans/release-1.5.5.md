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

- Ingen endnu — worktree og versionsbaseline er klargjort.
