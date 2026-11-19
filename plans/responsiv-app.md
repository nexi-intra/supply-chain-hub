# Responsiv app, ingen nedbrud, tydelig knap-feedback (2026-11-05)

## Beviser (målt live i brugernes 1.6.4 via inspector, ~7 min normal brug)

- **Main-tråden var blokeret i 107 s i alt.** Den længste enkelte frysning var **23 s**, og hele appen (alle knapper og IPC) stod stille imens.
- `chess-move` 33 s / 48 s · `acknowledge` 18-33 s · `kv:update client-versions` **77 s** · `registry:list-my-hubs` op til 36 s · `accounts:status` 8,7 s.
- CPU-profil: næsten al blokering er **synkrone SMB-læsninger** fra
  `securedIpc` → `authService.current()` → `resolveCurrent()`. Hver gang cachen misser, koster det ~8 synkrone læsninger: active-sessions, users, teams, user-directory, manager-access, creator-email og `mkdirSync` fra `createStore`.
  Den kaldes **før og efter hvert IPC-kald** med kun 500 ms cache. Oveni kommer `accountService.context()` (2 læsninger) og `assertReferences` (1-4 læsninger pr. skrivning).
  Én læsning tager 0,2-1,5 s under belastning, så hvert kald fryser appen 4-23 s, og alle andre kald venter i kø.
- **GPU slået fra**: kører appen to gange (der er ingen `requestSingleInstanceLock`), deler instanserne `%APPDATA%\tcd-hub`. Den anden instans mister GPU-cachen og tegner alt på CPU'en (`gpu_compositing: disabled_software`). Med egen profil: `enabled`.
- **Nedbrud efterlader intet spor**: ingen crashReporter, ingen logfil, `render-process-gone` logges kun i debug, og vinduet genindlæses ikke efter et renderer-nedbrud. `uncaughtException`-handleren kalder `console.error`, som kan kaste EPIPE i en uendelig løkke (målt: 15.000 exceptions og 931 MB på 1 minut).
- Windows viser "Svarer ikke", når main fryser i 8-23 s. Det er en sandsynlig forklaring på "appen lukker bare": brugeren eller Windows lukker den.

Rå data: session-filerne `live-1.6.4-measurement.log` og `live-1.6.4-idle.cpuprofile`.

---

## Fase 1 - Fjern frysningerne på main-tråden (størst effekt) ✅
- [x] `authService`: async `currentAsync()` med async læsninger. Det fulde actor-resultat caches pr. vindue i 15 s og invalideres straks, når watcheren ser `active-sessions`/`users` ændre sig eller ved login/logout/teamskift. Sync `current()` læser kun fra cachen (fallback som før).
- [x] `securedIpc`: brug `await currentAsync()` før kaldet. Efter-tjekket bruger cachen og laver ingen ny fuld resolve.
- [x] `registry.cjs`: cache teams / user-directory / manager-access / creator-email i 30 s. Ryd cachen ved alle registry-skrivninger. Tilføj async læsere.
- [x] `accountService.context()` og `assertReferences`: async læsning med 5 s cache. `retired-identities` læses én gang pr. skrivning i stedet for 1-4 gange.
- [x] Genbrug store-instanser i `openTeam`/`openSessions`/`teamStore` (ingen `mkdirSync` pr. kald).
- [x] Tests + live-måling: ingen main-blokering over 200 ms under normal brug.

## Fase 2 - Stabilitet og nedbrud ✅
- [x] `app.requestSingleInstanceLock()`: anden start fokuserer det eksisterende vindue (giver GPU tilbage, halv SMB-belastning).
- [x] Persistent log i `%APPDATA%\tcd-hub\logs\main.log` (roterende, sikker skriver uden console i exception-handlers).
- [x] `crashReporter.start({ uploadToServer: false })` → lokale dumps.
- [x] Altid: `render-process-gone` → log + genindlæs vinduet (maks. 3 gange pr. 5 min), `child-process-gone`, `unresponsive`/`responsive`, quit-årsager.
- [x] Renderer-fejl (uncaught errors og `console.error`) logges via `console-message` til main-log. Main-tråds-vagt logger frysninger over 2 s.

## Fase 3 - Færre IPC-kald fra renderer ✅
- [x] `useMyHubs`: én delt cache i stedet for 3 separate 60 s-polls, og pause når vinduet er skjult.
- [x] Hub-polls (5 min) pauser, når vinduet er skjult, og opdaterer ved fokus.
- [x] `client-versions`: skriv kun ved ny version/platform eller højst én gang i timen (før: hvert 5. min. fra alle ~40 klienter). Tjek hvert 15. min. og kun i synligt vindue.
- [x] Multiplayer-`acknowledge`: én fælles kø (`multiplayerAcknowledge.ts`). Id'er inden for 1,5 s sendes som én kommando, og allerede kvitterede id'er sendes aldrig igen.
- [x] `AccountMigrationRecovery`: tjek hvert 30. s i stedet for hvert 5. s + ved enhver ændring (målt 227 kald på 12 min); pauser i skjult vindue.

## Fase 4 - Knapper der tydeligt kvitterer ✅
- [x] `Button loading` viser nu en roterende spinner (gælder alle steder, der allerede brugte `loading`).
- [x] Multiplayer: Acceptér/Afvis/Træk tilbage/Påmind viser "Accepterer…" med spinner på den knap, der blev trykket (da/en/sv/fi).
- [x] Skak/backgammon/ordspil: turen skifter på skærmen med det samme ("Sender din tur…" + modstanderen "Har turen"), og rulles tilbage ved fejl.
- [x] Chat: beskeden vises straks som "Sender…"-boble, og teksten kommer tilbage i feltet ved fejl.
- [x] Gennemgået: Hub (tildel opgave), ferieanmodning, forbedringer, guides (godkend/returnér/gendan…), lager (optælling + placeringer), profil, Admin- og Manager-panel. Spinner på den trykkede knap, dobbeltklik-værn og fejl-toast hvor fejl før var tavse.

## Fase 5 - Glat fornemmelse ved software-rendering + hurtigere modstander ✅
- [x] `src/lib/renderMode.ts`: rendereren tjekker før første tegning, om WebGL mangler eller kører på SwiftShader/Basic Render Driver/llvmpipe, og sætter `<html data-render-mode="software|gpu">`.
- [x] `main.css`: i software-tilstand slås al `backdrop-filter`/`backdrop-blur` fra. Rummets stemningsanimationer (solstråler, ildskær, damp, puls) står stille, de store `drop-shadow`-filtre på bord og bræt fjernes, og glas-knapperne får tættere baggrund. Spinnere, tryk-feedback og brikkernes små skygger bevares.
- [x] Verificeret live: normal start giver `gpu` (uændret), `--disable-gpu` giver `software` med effekterne slået fra.
- [x] Modstanderen ser trækket hurtigere: det åbne spil poller `multiplayer:game-stamp` (kun mtime+størrelse på spilfilen), hvert sekund mens man venter og hvert 5. s ellers, aldrig i skjult vindue (`useGameChangeWatch`).
- [x] `game()` viser spilfilen med det samme, når index'et halter (den trækkendes skrivning er på vej), og reparerer først efter 15 s. Før ventede modstanderen på den trækkendes index-lås.
- [x] Målt på M:: modstanderen ser trækket **0,4-0,7 s efter**, at det er gemt (2,2-3,3 s fra klik). Den gamle vej (index + watcher + læsninger) gav ca. 4,6-6,7 s.

## Resultat efter fase 1+2 (målt live i 1.6.6)
- Main-tråden: 120 s aktiv brug gav **~1,4 s synkron I/O i alt** (1.6.4: 107 s frysning på 7 min, op til 23 s ad gangen).
- Opstart 903 ms (før 1971 ms). Et skaktræk i en rolig periode: **1,5 s** (1.6.4: 33-48 s).
- Ny log: `%APPDATA%\tcd-hub\logs\main.log` (+ `main.1.log`), crash-dumps i `%APPDATA%\tcd-hub\Crashpad`.

## ⚠️ Fund til IT: filserveren `\\VM-MSDK-2` er periodisk meget langsom til at OPRETTE filer
- Målt samtidigt fra en separat proces uden app-kode: oprettelse af en ny fil i `Supply Chain Hub Storage` tog **5-9 s** i perioder, mens læsning, åbning og rename tog 40-300 ms.
- Hver gemning opretter en låsefil og en temp-fil, så i de perioder koster én gemning 10 s+ uanset hvad appen gør.
- Typisk årsag: server-side antivirus eller FSRM-filscreening, der scanner hver ny fil. **Anbefaling: bed IT om at undtage `...\ai Tools\Supply Chain Hub Storage\` (`*.lock`, `*.tmp`, `*.json`) fra on-access-scanning på VM-MSDK-2 og tjekke serverbelastningen.**
- I koden: fase 3 (færre skrivninger) og fase 4 (optimistisk UI) gør, at brugeren ikke mærker serverens ventetid.

**Fase 1-5 er færdige.** Tests: vitest 1524/1524, electron 1388/1389 (den ene er en kendt timeout, der består alene). Næste: udgiv 1.6.6 + IT-sagen om VM-MSDK-2. Den fjerner de 4-23 s frysninger, som er rodårsagen til både "langsom", "minut-lange klik" og formentlig "lukker ned".
