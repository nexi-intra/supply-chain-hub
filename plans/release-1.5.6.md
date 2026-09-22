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

## Regler for baggrundsarbejde — skrevet efter fejlen i 1.5.5

Time-backuppen blev indfoert i 1.5.5 og gjorde appen naesten ubrugelig for alle.
Én daglig kopi blev til ti i timen, PR. KLIENT, mod ét delt drev med ~40
brugere. Appen er latens-bundet: **det er antallet af rundture der koster, ikke
antallet af bytes.**

Foer der tilfoejes periodisk eller baggrundsarbejde, skal alle fire besvares:

1. **Hvad sker der naar 40 klienter goer det samtidig?** Standardsvaret er: drevet
   knaekker. Regn rundturene ud pr. klient pr. time FOER koden skrives.
2. **Skal kun ÉN klient goere det?** Saa skal pladsen KRAEVES foerst (laas eller
   markoer) — og derefter laves det dyre. Aldrig omvendt. Det var praecis fejlen:
   indholdet blev bygget foerst, og foerst bagefter afgjorde `wx` hvem der vandt.
3. **Konkurrerer det med brugerens egne handlinger?** Opstart er det VAERSTE
   tidspunkt — det er netop dér brugeren klikker. Udskyd til efter foerste
   indlaesning, og skru ned (parallelisme 1 + pause mellem hver post).
   `scheduleMirrorWarmUp` startede efter 1,5 s, tog 103 s, og fik hver gemning
   til at tage 30-55 s.
4. **Hvordan ville jeg OPDAGE at det gik galt igen?** Findes der ingen log eller
   maaling, skal den bygges foerst. Advarslerne `LANGSOM gemning`,
   `LANGSOM baggrundsopdatering` og `LANGSOM backup` er altid slaaet til —
   bevidst, for de laa tidligere bag `TCD_HUB_DEBUG`, og derfor var det brugerne
   der opdagede problemet foer os.

## Ændringer til 1.5.6

Se `src/lib/changelog.ts` for den brugervendte liste. Teknisk overblik — alt i
denne version handler om at gemninger kunne tage minutter:

- **Global skrivelaas fjernet.** `runWriteAsync` tog `account-operation.lock`
  ved hver kv-skrivning. Maalt: ved 16 samtidige gemninger fejlede 14.
- **Spejl-varmningen genhentede alle billeders `_meta`.** Filteret udelukkede
  kun `_chunk_`. Maalt live: 95 af 104 langsomme laesninger var netop dem.
- **Backup-stormen.** Pladsen kraeves nu FOER dumpen, saa kun én klient dumper.
  Timefilen springer uforanderlige billeder over: 1 MB mod 40 MB.
- **Efterladte laase blokerede permanent.** Synkrone skrivninger havde ingen
  `staleMs`. Fundet live: `shift-assignments.json.lock` 48 min gammel.
- **Laas dateret i fremtiden** blev aldrig ryddet (negativ alder). Haandteres nu
  af den observationsbaserede model.
- **Ingen stoerrelsesgraense** paa dokumenter/billeder i guides.
- **`LANGSOM gemning`-log** over 4 sekunder, saa naeste gang kan maales.

### Vigtigt ved udrulning

1.5.5 er det der ligger i hubben nu, og 1.5.5 INDFOERTE time-backuppen. Hver
1.5.5-klient forsoeger en fuld 650-fils dump hver time. Opdateringen gaar kun
FREMAD (`isNewerVersion` i updater.cjs), saa et tilbagerul af manifestet til
1.5.4 ville IKKE flytte nogen. 1.5.6 skal derfor udgives for at faa klienterne
vaek fra den adfaerd.
