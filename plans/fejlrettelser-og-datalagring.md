# Fejlrettelser + datalagring der overlever opdateringer

## Mål
1. Gennemgå hele koden og rette småfejl, så appen kører stabilt.
2. Gøre det nemt at opdatere appen UDEN at miste data (vagtplan, ferie, brugere osv.):
   - Manager Panel får en "Datalagring"-fane: vis hvor data ligger, vælg datamappe
     (desktop-appen), og eksportér/importér backup som én fil.
   - Passwords hashes (gemmes aldrig i klartekst), og desktop-appens datafiler
     krypteres på disken.

## Sådan hænger det sammen (den simple model)
- Desktop-appen gemmer alle data som filer i ÉN mappe. Vælger man en fast mappe
  (fx et netværksdrev), læser enhver ny version af appen bare samme mappe —
  data følger automatisk med. Ingen synkronisering nødvendig.
- Backup-filen er en ekstra sikkerhed og bruges også til browser→desktop-flytning.

## Fase 1: Typefejl (småfejl fanget af TypeScript)
- [x] BrickBreak: manglende argument i funktionskald.
- [x] EmailSystem: `never[]`-arrays uden type (2 steder).
- [x] Hub: framer-motion `ease`-typer (2 steder).
- [x] ShiftSchedule: `never[]`-arrays uden type (7 steder).
- [x] Slå fuld typecheck til i build igen (`tsc -b` uden `--noCheck`),
      så fremtidige fejl fanges.

## Fase 2: Kodegennemgang for runtime-fejl
- [x] Uge-nummer-beregning (ISO-uger) og uge-dato-beregning i vagtplanen efterses.
- [x] Danske helligdage: 2027 + 2028 tilføjes (ellers låser weekender/helligdage forkert).
- [x] Død kode fjernes (ubrugt gammel vagtplan-tabel, ubrugt PageHeader/designSystem).
- [x] Generel gennemgang: null-håndtering, useEffect-oprydning, event-lyttere.

## Fase 3: Password-sikkerhed
- [x] Nye passwords gemmes som PBKDF2-hash (Web Crypto) med salt — aldrig klartekst.
- [x] Eksisterende brugere migreres automatisk ved næste login.

## Fase 4: "Datalagring"-fane i Manager Panel
- [x] Vis hvor data ligger lige nu (browser eller desktop + mappesti).
- [x] Desktop: "Vælg datamappe"-knap med mappevælger; alle eksisterende data
      kopieres automatisk til den nye mappe; appen husker valget.
- [x] Letforståelig dansk forklaring direkte i UI'et.

## Fase 5: Backup og versionsmigrering
- [x] "Eksportér backup": alle data samles i én fil (dato i filnavnet).
- [x] "Importér backup": genskab alle data fra filen (med bekræftelse).
- [x] Virker i både browser og desktop-app.

## Fase 6: Kryptering på disken (desktop)
- [x] Datafiler krypteres med AES-256-GCM; gamle ukrypterede filer læses stadig.

## Fase 7: Verifikation
- [x] Playwright-gennemgang af berørte views + fuld build.
- [x] Commit + push til PR #19.
