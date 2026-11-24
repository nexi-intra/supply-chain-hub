# Optælling: admin-adgang, ens tal på alle klienter og notifikationer i hubben (1.6.8)

Oprettet 2026-11-18. Ønsket af Jacob. Værdi-opgaven (indkøbsværdi i stedet for salgspris) er parkeret, se fase 5.

## Hvad der er fundet

- **Deltagere.** "Anmod om at deltage" findes, men kun den ansvarlige kan godkende (`decideMember` i `electron/warehouse/countService.cjs`). Skrive-adgang kræver et godkendt medlemskab (`rightsOf`). En optællingsadmin (`countAdmin`, sat i Manager-modulets `WarehouseRolesCard`) må i dag kun hente SAP. Managere skal også anmode, selv om rollekortet siger "Managere har altid alle rettigheder".
- **Forskellige tal.** Når nogen trykker "Hent SAP igen", skrives et nyt SAP-snapshot og `meta.snapshotVersion` tælles op. Kun den klient, der hentede, skifter til det nye snapshot. Alle andre klienter, der har optællingen åben, beholder det gamle i main-processen (`opened`-cachen) og i skærmens `open`-data (materialer, tællelister), indtil appen genstartes. Det giver forskellige SAP-antal, differencer og værdier, og klienterne skriver hver deres `summary`, så listen af optællinger hopper. Undersøgt og udelukket: store-cachen (3 s uden watcher), fulde journal-stykker (ændres aldrig) og den optimistiske visning (ryddes ved næste poll).
- **Notifikationer.** Optælling er slet ikke koblet på hubbens klokke (`useHubNotificationItems`). Der kommer kun en toast, hvis man selv har optællingen åben.

## Beslutninger (mine, ud fra koden)

- "Optællingsadmin" er den eksisterende rolle `admin` i Lagerstyringsroller. Managere og status managere får de samme nye rettigheder, fordi Manager-modulet lover, at managere har alle rettigheder.
- Rolle-adgang skrives ikke ind i deltagerfilen på M:. Den beregnes ud fra rollen, så en ny admin straks har adgang til alle optællinger, også gamle, og mister den igen, hvis rollen fjernes.
- Notifikationerne beregnes ud fra optællingernes egne data (ventende anmodninger og indsendte materialer). Når én godkender, forsvinder notifikationen hos alle. Der skrives ikke noget ekstra på M:.
- Hubben spørger hvert minut, mens vinduet er synligt, og hvert andet minut, når det er skjult. Kun åbne optællinger læses.

## Fase 1 - samme tal på alle klienter

- [x] Test (fejler først): klient B, der har optællingen åben, får det nye SAP-snapshot efter klient A's "Hent SAP igen" (`countService.test.cjs`).
- [x] `refresh()` læser snapshot igen (uden cache), når `meta.fetchedAt` ikke passer med snapshottet, og bygger index og tællelister om. Et halvt skrevet snapshot (gammelt `fetchedAt`) prøves igen ved næste refresh, højst hvert 30. s.
- [x] Den lokale kopi (`localCache`) opdateres, så offline-start ikke falder tilbage til det gamle snapshot.
- [x] Skærmen henter `open` igen, når snapshottets `fetchedAt` ændrer sig (`snapshotFetchedAt` i `open` og `state`, `CountView.tsx`), så materialer og tællelister også følger med.

## Fase 2 - admin og manager: godkend deltagere og deltag i alle optællinger

- [x] Test (fejler først): en admin kan scanne i en optælling uden at anmode, og en admin og en manager kan godkende og afvise anmodninger. En almindelig bruger kan stadig ikke.
- [x] `rightsOf`: `canWrite` gælder også for managere og optællingsadmins (`byRole`). `me` får `canDecideMembers` og `byRole`, og `me.status` er `approved` for dem.
- [x] `decideMember`: den ansvarlige, en manager eller en optællingsadmin.
- [x] `requestJoin`: en med rolle-adgang skal ikke anmode.
- [x] UI: `MembersPanel`, `CountView` (fane-badge og toast for nye anmodninger), `Counts.tsx` (badge "X anmoder om at deltage") bruger `canDecideMembers`. Listen af optællinger får `canDecideMembers` fra `listCounts`.
- [x] Rollekortet i Manager-modulet: hjælpetekst og intro for admin på da/en/fi/sv.
- [x] Excel-rapportens deltagerliste tager også dem med, der har talt via deres rolle (`reportData`).

## Fase 3 - notifikationer fra Optælling til hubbens klokke og Windows

- [x] Test (fejler først): `notifications` giver de rigtige punkter til de rigtige personer (`countService.test.cjs`), og klokken laver de rigtige punkter (`hubNotifications.test.ts`).
- [x] `countService.notifications(user)`: for åbne optællinger i teamet
  - anmodning om at deltage, til dem der må godkende (ikke anmoderen selv)
  - materiale sendt til godkendelse, til managere (ikke afsenderen selv)
  - din anmodning er godkendt eller afvist, til anmoderen (14 dage)
  - dit materiale er sendt tilbage, til den der sendte det (14 dage). `setApproval` gemmer `submittedBy` ved "send tilbage".
- [x] IPC `warehouse:counts:notifications` og `electronWarehouse.counts.notifications()`. Teams uden Lagerstyring får ingen punkter. Handlinger på denne PC sender `warehouse:counts:changed`, så klokken læser igen med det samme.
- [x] Hook `useCountNotifications` og ny type `count` i `buildHubNotificationItems`, ikon i `NotificationCenter`. Windows-notifikationer kommer automatisk via `DesktopNotificationBridge`.
- [x] Klik åbner optællingen på den rigtige fane (Deltagere eller Godkendelse).

## Fase 4 - afslutning

- [x] Changelog 1.6.8 i `src/lib/changelog.ts`.
- [x] tsc 0 fejl, node-tests 1553/1553, vitest 1687 bestået (1 sprunget over).
- [x] Opdater `plans/development-1.6.8.md`.
- [x] Prøv det af i appen med to brugerprofiler (24.11.2026): to testvinduer med hver sin brugermappe på samme lokale kopi af TCD-data. "Hent SAP igen" i vindue 1 ("D005 terminaler") gav "SAP hentet 13:08" i vindue 2 uden at røre det. En scanning i vindue 2 (Ekstra / ukendte 1.081 til 1.082) og en fortrydelse (tilbage til 1.081) slog igennem i vindue 1. Klokken ved "anmod om at deltage" er ikke prøvet, fordi begge Jacobs konti er managere og derfor er med fra start. Det dækkes af enhedstestene og holdes øje med efter udrulningen.

## Fase 5 - parkeret: værdi fra SAP

- Værdien kommer i dag fra MB52 ("Value Unrestricted" + "Value Blocked") delt med antallet (`electron/warehouse/core/snapshot.cjs`). Det er SAP's egen lagerværdi, ikke en salgspris.
- Næste skridt, når opgaven tages op: et materialenummer med forkert værdi og den forventede værdi, så det kan tjekkes mod MB52 og materialets værdipris (MM03, fanen Regnskab).
