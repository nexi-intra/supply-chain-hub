# Barsel i Manager-panelet + "tilbage"-dato i widgets

Mål: En manager kan registrere barsel direkte (ingen ansøgning). Personer på barsel vises som "(barsel)" i widgets i stedet for blot "fri", og for alle der er fri vises hvornår de er tilbage.

## Beslutninger
- Barsel gemmes i samme nøgle som ferie (`vacation-entries`) med nyt felt `type: 'parental'`. Manglende `type` = ferie, så gamle data og ældre klienter virker uændret (de viser bare "ferie").
- Barsel er altid godkendt (`status: 'approved'`, `manuallyGranted: true`) og kræver start- og slutdato (slutdato = sidste barselsdag; kan rettes senere).
- "Tilbage"-dato = første arbejdsdag efter slutningen af den sammenhængende fraværsperiode (sammenhængende/overlappende perioder slås sammen; weekender og danske helligdage springes over).
- Barsel blokerer stadig vagter/opgaver ligesom ferie.
- Eksisterende forkert registrerede barsler (fx Xuan Nguyen) rettes af manageren via "Rediger" i ferieoversigten, hvor typen kan skiftes mellem ferie og barsel. Ingen automatisk ændring af produktionsdata.

## Fase 1: Datamodel og hjælpefunktioner
- [x] `VacationEntry.type?: 'vacation' | 'parental'` i `src/lib/types.ts`
- [x] `nextWorkingDay()` + funktion der finder sammenhængende fraværsperiode og tilbage-dato (`src/lib/absence.ts`) med tests
- [x] Tværgående læsning: `type` med i allowlisten i `electron/teamReadPolicy.cjs` (+ test, `notes` stadig skjult)

## Fase 2: Manager-panelet
- [x] Ny "Registrer barsel"-knap + dialog (medarbejder, fra, til, note) ved siden af "Tildel ferie"
- [x] "Barsel"-mærke i ferieoversigten; rediger-dialog kan skifte type
- [x] In-app notifikation til medarbejderen med barsel-ordlyd (ingen ferie-mails for barsel)
- [x] Oversættelser da/en/fi/sv (paritet testet)

## Fase 3: Widgets
- [x] "Fri i dag", "Fri i andre teams", teamstatus og "Fraværende": "(barsel)" og "tilbage <dato>" for alle der er fri
- [x] Tåler gamle cachede data uden tilbage-dato

## Fase 4: Øvrige visninger
- [x] Feriekalender, observatør-visning og vagtplan viser "Barsel" i stedet for "Ferie"
- [x] Medarbejder kan ikke selv slette/ændre en barsel; login-digest tæller ikke barsel som godkendt ferie

## Fase 5: Hubert
- [x] Hubert siger "på barsel" og bruger korrekt tilbage-dato (næste arbejdsdag); barsel tælles ikke som kommende ferie

## Fase 6: Verifikation
- [x] tsc, vitest, electron node-tests, visuelt tjek af hubben i isoleret Electron-instans (barsel + ferie + andet team)
