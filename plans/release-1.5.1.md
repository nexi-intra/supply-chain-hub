# Supply Chain Hub 1.5.1

## Baseline

- Startpunkt: GitHub Release `v1.5.0`
- Baseline-merge: `e1d2ba5c5c36096e00519f6642c2035b3e4d9f1a`
- Udviklingsbranch: `develop/1.5.1`
- Lokal worktree: `C:\TCD Tools\Supply Chain Hub\Supply-Chain-Hub 1.5.1`

Version 1.5.0 er en frossen release-baseline. Alle nye rettelser og funktioner til
1.5.1 laves i denne worktree og må ikke ændres direkte på `main` eller tagget
`v1.5.0`.

## Kompatibilitet der skal bevares

- Det interne pakkenavn forbliver `tcd-hub`.
- Electron app-id forbliver `com.nexigroup.tcdhub`.
- Configfilen hedder fra 1.5.1 `supply-chan-hub.config`; det gamle navn læses kun som fallback under migrering.
- Miljøvariablen forbliver `TCD_HUB_DATA_DIR`.
- Eksisterende data i platformroden, `_registry`, `_shared` og teammapper må ikke
  overskrives eller slettes af migreringer.
- Opdateringspakken skal fortsat indeholde `Supply Chain Hub.exe` i ZIP-roden.

## Arbejdsgang

1. Lav ændringer i denne worktree.
2. Tilføj release-noter i appens changelog, når indholdet til 1.5.1 er kendt.
3. Kør `npm test`.
4. Kør `node --test scripts/legacy-data-migration.test.cjs`, hvis storage eller
   migrering berøres.
5. Kør `npm run build`.
6. Byg og verificér `Supply Chain Hub-1.5.1-win.zip`.
7. Push `develop/1.5.1` og opret PR mod `main`.
8. Opret først GitHub Release `v1.5.1`, når PR'en er merged og pakken er testet.

## Ændringer til 1.5.1

- Ingen endnu — worktree og versionsbaseline er klargjort.
