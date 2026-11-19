# Multiplayer-hastighed på M: (2026-11-05)

## Diagnose (målt på `\\VM-MSDK-2\org`)

Hver SMB-operation mod M: koster **100-350 ms** i latens, uanset filstørrelse:

| Trin | ms |
|---|---|
| open 'wx' (lås) | 250-450 |
| læs fil | 70-250 |
| skriv temp-fil (2 KB / 900 KB) | 270-360 / 510-580 |
| rename | 270-340 |
| læs låsefil + unlink (frigiv) | ~180 |

Én `updateAsync(compareAndSet)` = lås + læs + skriv temp + rename + frigiv ≈ **1,3-1,9 s**.

Et træk (`gameCommand`) laver serielt:
1. læs index (888 KB) - 1 rundtur
2. læs spilfil - 1 rundtur
3. CAS spilfil - ~6 rundture
4. læs index igen (`updateIndex`) - 1 rundtur
5. CAS index (888 KB) - ~6 rundture

**Målt end-to-end med den rigtige service (kopi i en midlertidig mappe, ingen andre klienter): 3,4-5,1 s pr. træk.**
I drift kommer lås-konkurrence fra ~40 klienter oveni.

Modstanderen ser først trækket efter: watcher-poll (op til 2 s) + 100 ms debounce + læs index (~200 ms)
+ 200 ms snapshot-debounce + snapshot/game (~350 ms) ≈ **1-3 s ekstra**. I alt **ca. 4-8 s fra klik til modstander**.

Index'et er svulmet op (`multiplayer-index.json` = 888 KB, krypteret):

| Felt | Antal | Tegn |
|---|---|---|
| notifications | 1420 (kun 33 ulæste) | 426 K |
| operations | 1000 | 198 K |
| games | 78 | 40 K |

Årsag: `NOTIFICATION_TTL_MS` = 30 dage, `NOTIFICATIONS_PER_RECIPIENT` = 200, `OPERATION_LIMIT` = 1000.
Der ligger desuden en forladt `multiplayer-index.json.*.tmp` (843 KB) fra 29-10 i `_shared`.

## Fase 1 - Hurtige gevinster for den der trækker (mål: < 1,5 s) ✅
- [x] Svar brugeren, så snart spilfilen er gemt, og opdatér index'et i baggrunden (`deferIndexWrites` i `main.cjs`). `heal()` dækker, hvis skrivningen fejler.
- [x] `store.mutateAsync(key, fn)`: læs, ændr og skriv under én lås. `updateIndex` bruger den, så den ekstra læsning og CAS-retries forsvinder.
- [x] Spilfil og index læses parallelt i `gameCommand`.
- [x] Index'et er skåret ned: læste notifikationer slettes efter 7 dage, og `OPERATION_LIMIT` er sat til 300. 666K → 180K tegn.
- [x] `sweepStaleTempFilesAsync` rydder forladte `*.tmp` (> 24 t efter både navn og mtime) i `_shared` og `_shared/multiplayer` ved opstart.
- [x] Tests: 5 nye, og 1373/1374 electron-tests består. Den ene fejl er en assistantWorker-timeout under belastning, som består alene, også uden ændringerne.

**Målt på M: efter fase 1:** den der trækker ser trækket efter 1,8-2,5 s (før 3,4-5,1 s). Index'et er synligt for modstanderen efter 3,4-4,2 s.

## Fase 2 - Modstanderen ser trækket hurtigere (mål: < 1 s) ✅ (se responsiv-app.md fase 5)
- [x] Et åbent spil stat'er sin spilfil hvert sekund, mens man venter (målt: 0,4-0,7 s efter at trækket er gemt).
- [x] Turen skifter med det samme på skærmen i skak, backgammon og ordspil (responsiv-app.md fase 4).
- [x] Det åbne spil genindlæser direkte ved ændret spilfil (uden om snapshot-debounce og watcher), og `game()` venter ikke længere på den trækkendes index-lås.

## Fase 3 - Arkitektur (valgfri)
- [ ] Vurdér en lille realtime-backend (fx WebSocket) til multiplayer i stedet for et SMB-filshare. Det fjerner låsefiler og polling helt.

**Anbefaling: start med fase 1.**
