# Min uge / Min kalender - tider paa vagter og egne punkter

Besluttet 2026-10-14:
- Tid i to lag, begge valgfrie: standardtid paa rollen + egen tid paa den enkelte vagt / det gentagne moenster.
- Mest specifikke vinder: vagtens tid > moenstrets tid > rollens standardtid > "Hele dagen".
- Gamle data uden tid virker uaendret (ingen migrering).

## Fase 1 - Tider i vagtplanen + Min uge (faerdig, ikke committet)
- [x] `src/lib/shiftTimes.ts`: validering, opslag af gaeldende tid, formatering (+ test)
- [x] Typer: `startTime`/`endTime` paa `ShiftRole`, `ShiftAssignment`, `ShiftPatternRule`
- [x] `expandShiftPatterns` tager moenstrets tid med (+ test)
- [x] Vagtplan: standardtid i rolle-dialogen
- [x] Vagtplan: tid i "Tildel vagt" og "Gentagne vagter"
- [x] Vagtplan: klik paa en vagt i cellen -> saet/ryd tid for netop den vagt; tiden vises i cellen (slet-knap flyttet til hjoernet)
- [x] Min uge: tid foran punktet, "Hele dagen"-punkter oeverst, derefter efter klokken (+ test)
- [x] Validering: tsc, vitest, electron-tests, `scripts/verify-my-week.cjs` udvidet

## Fase 2 - Egne punkter (faerdig, ikke committet)
- [x] Valg: to-dos med tid + aftaler (uden flueben); gentagelse udskudt
- [x] `PersonalTodo`: `kind: 'event'`, `startTime`/`endTime`; `personalTodoScheduleProblem` (+ test)
- [x] Team to-dos: valgfri tid (`createTeamTodo`, opret/rediger)
- [x] To Do: type-vaelger To-do/Aftale, tidsfelter, tid paa kortet, aftaler uden status-knapper
- [x] `timeText.ts` + `electron/assistantTimeText.cjs` (paritetstest): "kl. 13-14" i tekst
- [x] Hurtig tilfoejelse fra Min uge (+ ved hver dag fra i dag)
- [x] Min uge: aftaler paa egen dag, to-do-tid (ikke ved overfoerte frister)
- [x] Klokken: aftaler giver ingen "forfalder"-notifikation
- [x] Hubert: "opret en to-do: ring til DHL i morgen kl. 10" (+ test), guide-tekst da/en/fi/sv
- [x] Validering: tsc, vitest, electron-tests, alle 9 E2E (verify-my-week udvidet)

## Fase 3 - Min kalender-visning
- [ ] Dag/uge med tidslinje, hele-dagen-raekke, nu-streg
- [ ] Klik i tomt felt for at oprette; overlap-advarsel

## Fase 4 - Senere
- [ ] Paamindelser og .ics-eksport
