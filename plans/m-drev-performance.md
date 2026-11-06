# M:-drev performance (SCH skriver langsomt)

Status: diagnose færdig 06.11.2026 – ingen kodeændringer endnu. Start med fase 1.

## Målinger (06.11.2026, kørende version 1.6.6, PID 31888)

| Måling | Resultat |
|---|---|
| Ping til `VM-MSDK-2` (M: = `\\VM-MSDK-2\org`) | 12 ms – netværket er fint |
| Lille fil skriv+slet på M: | ~280 ms pr. fil (C: ~7 ms) |
| 5 MB skrivning på M: | ~420 ms – båndbredden er fin, det er rundture der koster |
| Læs `_shared/multiplayer-index.json` (257 KB) | ~430 ms |
| SCH main-proces, I/O på 30 s | ~35.500 metadata-ops (~1.200/s) + ~5.000 læs/skriv |
| Defender (MsMpEng) samme 30 s | ~21.000 ops (scanner det SCH rører) |
| Orbit samme 30 s | ~2.000 ops – Orbit cacher i `%LOCALAPPDATA%\Orbit`, **ikke synderen** |
| `main.log` 05.–06.11 | 11× `MAIN BLOCKED` (7–20 s), 32× `LANGSOM gemning` (7–53 s) |

Langsomste gemninger: `multiplayer:command` (17×, snit 21 s, max 51 s), `kv:update client-versions` (9×, snit 16 s, max 53 s), `digest-last-seen-*` (snit 14 s).

## Årsager

1. **Watcher-polling**: `store.watch()` laver `readdir` + `stat` af alle filer i team-mappen hvert 2. s (TCD 730, TRR 1.478 filer) + `_shared`. ~0,5–0,7 s pr. scan → appen poller M: ~25–35 % af tiden. Ganget med alle kolleger, der kører SCH, får SMB-serveren tusindvis af metadata-ops/s, hvilket gør M: langsom for alle.
2. **Hotspot-filer alle klienter skriver i**: `client-versions.json` (pr. team), `_shared/multiplayer-index.json` (257 KB, hele indekset omskrives ved hvert træk), `active-sessions.json`, `digest-last-seen-*`. Låsekø med 100 ms jitter × op til 50 forsøg → 20–50 s ventetid.
3. **Synkrone låse på main-tråden**: `withFileLock` (`Atomics.wait`) bruges stadig i `store.set/update/mutate`, `registry.cjs` og `accountService.cjs` (fx logout → `KV_LOCK_BUSY` + `MAIN BLOCKED 7567 ms`). Mens den venter, fryser hele appen.
4. **Skrald på M:**: ~28 forældreløse `*.tmp` (mest `client-versions.json.*.tmp`, 0 bytes) og en gammel `TSS/client-versions.json.lock` fra 04.11 – tegn på afbrudte skrivninger.

## Fase 1 – Hurtige gevinster (lav risiko)

> Erstattet af den godkendte plan: [m-drev-performance-plan.md](./m-drev-performance-plan.md) (design: [m-drev-performance-design.md](./m-drev-performance-design.md)). Faserne herunder er den oprindelige skitse.

- [x] Hæv `DEFAULT_WATCH_INTERVAL_MS` fra 2 s til 10 s og pause watcheren når vinduet er skjult/minimeret
- [ ] Skriv `client-versions` kun ved opstart/versionsskift (ikke periodisk) og sammenlign før skrivning – skip hvis uændret
- [ ] Skriv `digest-last-seen-*` kun når værdien faktisk ændres (debounce)
- [ ] Ryd forældreløse `*.tmp` og døde `.lock`-filer på M: (via eksisterende `sweepStaleTempFilesAsync`, kør for alle teams)
- [ ] Mål igen: I/O pr. 30 s og antal `LANGSOM gemning` i `main.log`

## Fase 2 – Ingen frys af main-tråden

- [x] Flyt `accountService` (`withAccountLock`/`withAuthenticationLock`) til `withFileLockAsync`
- [x] Flyt `registry.cjs` mutationer til async lås
- [x] Find resterende IPC-handlere der kalder sync `store.set/update/mutate` og skift til `*Async`
- [ ] Verificér: ingen `MAIN BLOCKED` i `main.log` over en arbejdsdag

## Fase 3 – Færre delte hotspot-filer

- [ ] Del `multiplayer-index` op (fx én lille fil pr. spil/bruger) så et træk ikke omskriver 257 KB delt indeks
- [ ] Gør `client-versions` og `active-sessions` til én fil pr. bruger (ingen lås nødvendig) og saml ved læsning
- [ ] Watcher: brug én samlet "change-stamp"-fil pr. team i stedet for at stat'e alle filer

## Fase 4 – Miljø (IT)

- [ ] Spørg IT om Defender-udelukkelse/lavere scanning for `Supply Chain Hub Storage` på `\\VM-MSDK-2\org`
- [ ] Spørg IT om belastning/SMB-latens på `VM-MSDK-2` (280 ms pr. fil-oprettelse er højt ved 12 ms ping)

## Efter (1.6.7, målt 06.11.2026)

- Watcher-måling på den rigtige TCD-mappe på M: (kun watcher, 30 s, samme tidspunkt):
  - 1.6.6 → 2.940 fil-stat + 14 mappelister, 26.564 I/O-operationer på 25 s.
  - 1.6.7 → 860 fil-stat + 4 mappelister (3 ændrings-/sikkerheds-scans), 11.142 I/O-operationer på 25 s.
  - Dvs. −71 % fil-stat og −58 % I/O-operationer.
- Målet "< 10 %" nås ikke midt på dagen: andre klienters gemninger (lås-fil, tmp-fil, rename) ændrer TCD-mappens mtime ca. hvert 10. s, og hver ændring udløser en scan af ~210 filer. Næste skridt kræver en lille ændrings-markør pr. mappe (nyt format = "mulighed 2" i designet).
- Frys: login/resume/renew/logout, handlere, registry-læsning, sygefravær-oprydning og ventetid på optagede låse kører nu async. `MAIN BLOCKED`-linjer i `main.log` viser nu hvilken handling der frøs.
- Mangler (kræver login/anden PC – brugerens tjek): 0 × `MAIN BLOCKED` over en arbejdsdag, to-klient-test (ændring vises inden for ~2 s), minimeret vindue, spil-UI ("Sender…").