# Optælling: scanneren svarer med det samme

Status: diagnose 06.11.2026 (systematic-debugging). Brugeren: "når man scanner en terminal skal den læse serienummeret med det samme og give en status … det dur ikke at den er så langsom". Start med fase 1.

## Diagnose (målt 06.11 mod TCD-optælling på M:)

- Selve svaret (fundet / dublet / ukendt / anden lagerplacering) beregnes i hukommelsen (`matchSerial`) på få ms, og den lokale journal-skrivning tager ~2 ms.
- **Årsag 1 (hovedårsag):** `journal.append` og `journal.flush` deler én kø (`serial` i `electron/warehouse/journal.cjs`). 2 s efter en scanning uploader `flush` journal-chunken til M: (lås-fil + tmp + rename, ~1–3 s, mere ved kø). Kommer næste scanning imens, venter den på hele uploaden.
- **Årsag 2:** hver scanning læser 7 nøgler fra M: **efter hinanden** (`requireWriter` → `isDeleted`, `getMembers`, `getStatus`; `areaContext` → `getOwnPlacements`, `getClaims`; ved fund `materialLocks`, `getApprovals`). Lagerstyringens stores er ikke watched (3 s cache), så ved normalt scan-tempo går de til drevet hver gang: 230–555 ms i roligt vejr, sekunder under belastning (loggen viser 1–5 s pr. læsning). Parallelt tager de samme læsninger 57 ms.
- Sekundært: efter hver scanning henter skærmen hele optællingens tilstand (`refresh`), som konkurrerer om drevet; genberegning af 66.000 serienumre tager ~70 ms CPU.

## Fase 1 – Scanning venter aldrig på M:

- [ ] **Task 1 – Journal:** `append` må ikke vente på en igangværende upload. To køer: en lokal (append + lokal omskrivning i `syncFromRemote`) og en upload-kø (`flush`). Upload tager et øjebliksbillede af `events` og skriver kun lokalt inde i den lokale kø. Test: `append` resolver hurtigt, mens `remote.setAsync` hænger; hændelsen ligger lokalt og uploades bagefter; append under `syncFromRemote` mister intet lokalt.
- [ ] **Task 2 – Scan-kontekst:** `scan` bruger en cachet kontekst pr. åben optælling (rettigheder, slettet, status låst, egne placeringer, claims, materiale-låse, godkendelser): frisk ≤ 5 s bruges direkte; ældre bruges straks og opfriskes i baggrunden (én ad gangen); mangler den, hentes alle dele **parallelt**. Afvisninger (låst status, afsluttet, ikke medlem, slettet) virker som før, blot med højst ~5 s forsinkelse – samme princip som journalen, der allerede tillader offline-scanning. Andre handlinger (fjern serienummer, godkend, fortryd …) er uændrede. Test: to scanninger inden for 5 s laver 0 drevlæsninger i anden scanning; forældet kontekst giver svar uden at vente og opfriskes i baggrunden; en låst status opdaget ved opfriskning afviser næste scanning.

## Fase 2 – Verifikation

- [ ] `npm.cmd test` + `npx.cmd vitest run`; måling: scan-handlerens tid med kold/varm kontekst mod den rigtige TCD-mappe (kun læsning).
- [ ] Brugerens tjek: scan 20 terminaler i træk på lageret – status skal komme med det samme.
- [ ] Changelog 1.6.7: "Optælling: scanneren giver status med det samme – også når drevet er travlt".
