# Supply Chain Hub 1.5.6

## Baseline

- Startpunkt: GitHub Release `v1.5.5`
- Baseline-commit: `dd1fb6c`
- Udviklingsbranch: `develop/1.5.6`
- Lokal worktree: `C:\TCD Tools\Supply Chain Hub\Supply-Chain-Hub 1.5.6`

Version 1.5.5 er en frossen release-baseline. Alle nye rettelser og funktioner til
1.5.6 laves i denne worktree og må ikke ændres direkte på `main` eller tagget
`v1.5.5`.

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
- AI-modellen er `4b` (Qwen3-VL-4B). Skiftes den igen, skal den gamle model
  fjernes fra allowlisten i `electron/aiModels.cjs`, saa oprydningen i
  `createLocalAI` selv frigiver disken hos brugerne — og de nye filer skal ligge
  paa det faelles drev FOER udgivelsen.

## Arbejdsgang

1. Lav ændringer i denne worktree.
2. Tilføj release-noter i `src/lib/changelog.ts`, når indholdet til 1.5.6 er kendt.
3. Kør `npx tsc --noEmit`, `node --test electron/*.test.cjs`, `npx vitest run`.
4. Kør `npm run electron:build` og verificér `Supply Chain Hub-1.5.6-win.zip`.
   Scriptet bygger kun zip — det er den eneste pakke opdateringen bruger.
5. Push `develop/1.5.6`, opret `release/1.5.6` og PR mod `main`.
6. Opret først GitHub Release `v1.5.6`, når PR'en er merged og pakken er testet.

## Gaeld overfoert fra 1.5.5

Fundet ved gennemgangen foer 1.5.5 blev frigivet, men bevidst ikke rettet der:

- [ ] **Én global skrivelaas.** `runWriteAsync` i `accountService.cjs` tager
      `account-operation.lock` ved HVER `kv:set`/`kv:update`, med kun 10 forsoeg
      à 150 ms (~1,5 s). Med ~40 brugere er det en flaskehals og forklarer
      stormen af `KV_LOCK_BUSY` i loggen. De fleste absorberes af de ydre
      gentagelser i `electronKvBridge.ts` og `preload.cjs`, saa de er formentlig
      ikke synlige for brugerne — men det er arkitektur der boer ses paa.
- [ ] **Laas med umulig alder.** Observeret live:
      `KV: fjerner forladt laas (549566974s gammel)` — 17 aar. Tidsstemplet var
      vroevl. Selvhelingen gjorde det rigtige, men den STOLER paa `mtime`.
      Laeses et tidsstempel forkert paa en laas en kollega holder lige nu,
      stjaeles den, og saa skriver to klienter samtidig. Samme kategori som
      TRR-datatabet. Boer undersoeges: er det en engangs-fejllaesning fra SMB?
- [ ] **Flaky test.** `offlineSync.test.cjs` "getAsync serves the local mirror"
      fejler ca. hver tredje koersel (aegte fs-timing, ikke en reel fejl).
- [ ] **"Annuller" sletter kladden** i `GuideEditor.tsx`. Uaendret adfaerd, men
      vaerd at genoverveje nu hvor kladder er en rigtig funktion.
- [ ] **Vision-encoderen kan halveres.** `mmproj` findes ogsaa i Q8_0 (433 MB mod
      797 MB). Ikke valgt i 1.5.5 for at holde opsaetningen identisk med den
      afproevede 8B-konfiguration.

## Ændringer til 1.5.6

- Ingen endnu — worktree og versionsbaseline er klargjort.
