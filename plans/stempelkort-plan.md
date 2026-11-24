# Stempelkort i Arbejdsværktøjer (1.6.8)

Oprettet 2026-11-18 efter brainstorm med Jacob.

## Formål

I TCD og TRR laves mange opgaver, som ikke registreres i noget system. Stempelkortet giver tider på dem: vælg opgave, start, pause, stop. Managere får fuld adgang til tiderne og statistik, kolleger ser aldrig hinandens tider.

## Besluttet med Jacob

- Lagerstyring-kortet på forsiden hedder nu **Arbejdsværktøjer**. Stempelkort er et værktøj derinde ved siden af Placeringer og Optælling (TCD og TRR).
- Opgaverne er vagtplanens opgaver (`shift-roles`). Ens opgave i dag ifølge vagtplanen er valgt på forhånd, man kan vælge en anden.
- Man kan oprette en opgave i stempelkortet med samme dialog og regler som i vagtplanen, og den kommer også i vagtplanen.
- Start, pause (flere gange), fortsæt og stop.
- Gemte tider er skjulte for andre. Kun managere ser tiderne og har fuld adgang til statistik.

## Mine beslutninger (kan rettes)

- Når der er trykket stop, ser medarbejderen ikke registreringen igen; kun managere gør. Har uret kørt over 10 timer, spørger appen ved stop, hvornår man reelt stoppede (glemt stop).
- "Manager" er hubbens manager eller creator. En status manager fra Optælling er ikke manager her.
- Et kørende ur gemmes på M: med det samme, så det overlever, at appen lukkes, og man kan stoppe det fra en anden PC.
- Tiderne sættes af programmet ud fra uret, ikke af brugeren. Kun sluttiden ved glemt stop kan vælges (mellem seneste handling og nu). Managere kan rette og slette registreringer, og det logges hvem der rettede.
- "Skift opgave" stopper den igangværende og starter den nye i ét tryk. "Annullér" smider et ur væk, der er startet ved en fejl.
- Hemmeligholdelsen ligger i baggrunden (main-processen): skærmen kan kun spørge om sit eget kørende ur; registreringer og statistik svarer kun til managere.

## Lagring

Mappe: `<team>\lagerstyring\stempelkort` (krypterede filer som resten af appen).

- `aktiv-<skriver>`: brugerens kørende ur (opgave, start, pauser).
- `tider-<skriver>-<åååå-mm>`: brugerens registreringer i måneden (efter startdato).
- `<skriver>` er et hash af e-mailen. Hver person skriver kun sine egne filer, så kolleger aldrig venter på hinandens låse.

## Fase 1 - Arbejdsværktøjer og stempelkort for medarbejderen

- [x] Test først: `timeclockService` start, pause, fortsæt, stop, skift opgave, annullér, glemt stop over 10 timer, uret findes på tværs af PC'er, ingen kan læse andres tider.
- [x] `electron/warehouse/timeclockService.cjs` + IPC `warehouse:timeclock:*` + preload `electronWarehouse.timeclock`.
- [x] Omdøb Lagerstyring til Arbejdsværktøjer (da/en/fi/sv) og tilføj Stempelkort-kortet. SAP-status hentes ikke i Stempelkort.
- [x] Fælles `ShiftRoleDialog` brugt af vagtplanen og stempelkortet.
- [x] Skærm: dagens opgave fra vagtplanen, vælg opgave, ny opgave, stort ur, pause/fortsæt, stop, skift opgave, annullér, dialog ved glemt stop.

## Fase 2 - managere: registreringer og statistik

- [x] Test først: kun managere får registreringer; rettelser og sletning logges.
- [x] Periode (i dag, uge, måned, sidste måned, valgfri), filter på person og opgave.
- [x] Nøgletal: samlet tid, antal registreringer, personer, gennemsnit.
- [x] Tid pr. opgave, pr. person og pr. dag.
- [x] Hvem er i gang lige nu.
- [x] Liste over registreringer med ret og slet.

## Fase 3 - afslutning

- [x] Changelog 1.6.8.
- [x] tsc, node-tests og vitest grønne.
- [x] Dev-vindue åbent til Jacob.

## Også lavet

- [x] Hubert (app-guiden) kender Stempelkort og det nye navn Arbejdsværktøjer på dansk, engelsk, finsk og svensk.
- [x] Rollekortet i Manager-modulet hedder "Roller i Arbejdsværktøjer".

## Senere (ikke bygget)

- Excel-eksport af registreringer.
- Stempelkort for andre teams end TCD og TRR.
