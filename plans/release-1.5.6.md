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

- [x] **Én global skrivelaas — LØST 2026-09-22, og det var hovedaarsagen til at
      gemninger tog minutter.** `runWriteAsync` tog `account-operation.lock` ved
      HVER `kv:set`/`kv:update`. Det er ÉN fil for hele platformen, saa alle
      brugeres skrivninger paa tvaers af alle teams stod i samme koe.
      Maalt mod produktionsdrevet:

      | samtidige gemninger | med laasen | uden |
      | --- | --- | --- |
      | 8 | 5 af 8 fejlede, 1,2/sek | 0 fejlede, 3,1/sek |
      | 16 | 14 af 16 fejlede, 1,7/sek | 0 fejlede, 3,6/sek |

      Ved 16 brugere fejlede altsaa 87% af alle gemninger. Hver fejl udloeste
      gen-forsoeg i renderer'en, og fejlede de ogsaa, skete der "ingenting" i
      minutter. Laasen beskyttede ikke data - migreringen laaser hver beroert
      noegle via `withLockedKeys`, og det goer almindelige skrivninger ogsaa.
      Den var udelukkende en PORT mod skrivninger under migrering, og den
      kontrol laver `context()` allerede lock-free (cachet). `runWrite` (sync,
      auth/sessioner) beholder sin laas - den er ikke paa den varme vej.
- [x] **Laas med umulig alder — LØST 2026-09-22.** Observeret live:
      `KV: fjerner forladt laas (549628504s gammel)` — 17 aar. En laasefil der
      netop var oprettet af en anden klient rapporterede et vanvittigt mtime,
      fordi SMB ikke naaede at skrive metadata. Enhver klient betragtede derfor
      en LEVENDE laas som forladt og slettede den. mtime bruges nu kun naar
      alderen er trovaerdig (< 30 dage); ellers skal klienten selv have set
      laasen uroert i staleMs, maalt paa sin egen klokke.
- [ ] **Flaky test.** `offlineSync.test.cjs` "getAsync serves the local mirror"
      fejler ca. hver tredje koersel (aegte fs-timing, ikke en reel fejl).
- [ ] **"Annuller" sletter kladden** i `GuideEditor.tsx`. Uaendret adfaerd, men
      vaerd at genoverveje nu hvor kladder er en rigtig funktion.
- [ ] **Vision-encoderen kan halveres.** `mmproj` findes ogsaa i Q8_0 (433 MB mod
      797 MB). Ikke valgt i 1.5.5 for at holde opsaetningen identisk med den
      afproevede 8B-konfiguration.

## Ændringer til 1.5.6

- Ingen endnu — worktree og versionsbaseline er klargjort.
