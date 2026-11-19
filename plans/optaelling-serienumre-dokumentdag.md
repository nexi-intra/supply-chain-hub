# Serienumre på dokumentdagen (CountPoint / optælling)

## Hvorfor
En godkendt optælling (fx Lasses terminal-scanning) bliver ofte først til et SAP-optællingsdokument dage senere.
Antal virker allerede: `Antal til dokument = SAP i dag + godkendt difference`. Men for serienummer-materialer
blev de serienumre, der blev scannet på optællingsdagen, sendt ind i SAP (`ZMS_COUNT_SERIAL`) og kopieret. Hvis
der er sendt terminaler ud eller kommet nye ind siden, passer listen ikke længere.

## Besluttet (med Jacob, 2026-11-06)
- Materialer uden serienumre: uændret (SAP i dag + difference).
- Materialer med serienumre: **listen til dokumentet = SAP's serienumre i dag − de serienumre, der manglede ved godkendelsen**.
  - Nul-diff ⇒ listen er bare SAP's live-liste.
  - Ekstra fundne numre (ukendte i SAP / andet sted) indgår ikke, ligesom i dag. De hører ikke til materialets linje i SAP.
- **Listen bestemmer**: antal til dokument = antal numre på listen. Hvis det afviger fra "SAP i dag + difference", vises en advarsel (ingen blokering).
- Ved godkendelse gemmes de manglende serienumre pr. linje (`frozen[].missingSerials`), så godkendelsen ligger fast.
- Godkendelser fra før ændringen: de manglende numre genskabes ud fra scanningstidspunkterne (fundet senest ved godkendelsen).
  Det er pålideligt, fordi scanninger ikke kan fjernes efter godkendelse.
- "Hent dagens SAP-tal" henter nu også serienumre. En hentning fra før ændringen (uden serienumre) giver ikke antal for
  serienummer-materialer. Du bliver bedt om at hente igen.
- Kopiknappen i Oversigt kopierer stadig de fundne numre. Dokumentfanen og den automatiske indtastning i SAP bruger dokumentlisten.

## Fase 1 – Kerne (rene funktioner + tests)
- [x] `freezeRows` gemmer `missingSerials` for serienummer-linjer
- [x] `docLinesFromSnapshot` tager dagens serienumre med pr. linje
- [x] `missingAtApproval` (gemt liste eller genskabt ud fra scanningstider)
- [x] `buildCountDoc`: dokumentliste, antal = listens længde, `expectedQty` og `needsSerials`
- [x] Unit tests i `countState.test.cjs` / `countDoc.test.cjs`

## Fase 2 – Service + SAP-indtastning
- [x] `setApproval` / `approveAllWithoutDifference` gemmer manglende serienumre
- [x] `fetchDocStock` henter serienumre og gemmer `withSerials`
- [x] `copySerials(..., { forDoc: true })` returnerer dokumentlisten (kræver dagens SAP-tal)
- [x] `piDocService.count` bruger dokumentlisten til `ZMS_COUNT_SERIAL`
- [x] IPC (`register.cjs`) sender `forDoc` videre
- [x] Service-tests: nul-diff + nye/udgåede terminaler, difference, gammel godkendelse, gammel hentning

## Fase 3 – Skærm (dokumentfanen)
- [x] Typer (`CountDocRow.expectedQty`, `needsSerials`)
- [x] Hubert-guiden (da/en/fi/sv) nævner dagens serienummerliste
- [x] Advarsel når listen ≠ SAP i dag + difference
- [x] "Hent igen" når serienumre mangler i hentningen
- [x] Advarsel når dagens SAP-tal ikke er hentet i dag
- [x] Kopiér-knap bruger dokumentlisten
- [x] Hjælpetekst opdateret

## Fase 5 – Admins kan hente dagens SAP-tal (tilføjet 2026-11-06)
- [x] Optællings-admins markeres `countAdmin` ved login (`register.cjs` serviceUser), ligesom status managers
- [x] "Hent dagens SAP-tal" må bruges af ansvarlig, admin og manager (`canFetchDoc` i `countService.cjs`)
- [x] Test: admin kan hente, almindelig bruger kan stadig ikke
- [x] "Hent SAP igen" (ny SAP-data til selve optællingen) må også bruges af admin og manager (`sapAction`), knappen styres af `me.canFetchSap`
- [x] Test: admin kan hente og anvende; kun den, der hentede, kan anvende forhåndsvisningen; almindelig bruger kan ikke

## Fase 4 – Verifikation
- [x] Alle lager- og guide-tests (255/255), vitest (1526/1526) og typecheck (`tsc -b`). Lint: projektet har ingen eslint.config, så den kan ikke køre.
