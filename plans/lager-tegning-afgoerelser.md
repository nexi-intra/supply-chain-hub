# Tegning af lageret – afgørelser og udskudte småting

Samlet 02.11.2026 fra udførelsens ledger (Fase 1, Task 1–16 + afsluttende review), før arbejdsmappen blev slettet.
Hver afgørelse står som: hvad – hvorfor – hvad det koster, hvis den er forkert. Historik: skygge-repoet
`C:\Supply Chain Tools\.hub-shadow.git` (baseline 856f75d; brug `$env:GIT_DIR='C:\Supply Chain Tools\.hub-shadow.git'`).

## Afgørelser

### Opsætning
- Arbejdet foregik direkte i app-mappen (ingen worktree), fordi projektets `.git` peger på en slettet worktree – koster: ingen isolation; skygge-repoet giver diffs og mulighed for at rulle tilbage.
- Skygge-repo uden for mappen (`.superpowers/` ekskluderet) til commits og review-diffs – koster: `GIT_DIR` skal sættes før git-kommandoer.
- Alle hjælpeagenter (implementering og review) kørte på Claude Opus 5.5 efter brugerens ønske – koster: pris/tid.
- `[x]` i planen blev sat af controlleren efter godkendt review.

### Før start (planrettelser)
- R1: `admin.test.cjs` føjet til Task 1's filer – koster: intet.
- R2: `normalizeLayout` bevarer slot `manual` og positionsfelter – ellers tabes håndrettede navne ved gem – koster: intet.
- R3: `linked` sorteres dansk/numerisk – deterministisk – koster: intet.
- R4: tjek i Task 12–15 udført med playwright mod `scripts/verify-layout.cjs` (midlertidige data) med screenshots – koster: lidt mere arbejde pr. UI-task.
- R5: commits i skygge-repoet; `[x]` sættes af controlleren.

### Undervejs
- T1: Rigtige data har 25 Palle-pladser med kapacitet > 1 (S0–S21: 2, A.Gulv: 2, P.GULV: 4, F1.1: 3); de tager nu det antal paller. Accepteret, fordi S og gulvpladser rummer flere paller; F1.1 vises som 3→1 ved første udgivelse – koster: F1.1 kan få 3 paller indtil da.
- T1: En Palle beholder sin kapacitet, når noten m.m. rettes (ellers faldt S0 til 1) – koster: lille ekstra ændring.
- T4: En almindelig slot, der adopterer en Reol/Bord/Swap-plads, ændrer typen (vises i oversigten) – tegningen ejer typen; kun særlige slots beholder listens type – koster: admin skal se ændringen.
- T4: reserve→pluk med paller på pladsen blokerer udgivelsen (TYPE_REFUSED) – ellers står paller på en plukplads uden for FIFO – koster: én regel.
- T4/T5: Omdøbning oven på et navn, der fjernes i samme udgivelse, er tilladt; udførelsen sletter først, omdøber bagefter (i to trin), opretter og ændrer til sidst – koster: rækkefølgen er bindende.
- T5: En Palle uden kapacitetsændring beholder sin kapacitet (= den tegnede) – koster: intet.
- T6: En kladde, der bygger på en ældre udgivelse, afvises (LAYOUT_STALE) – også ved overtag – så en forældet editor ikke kan udgive oven på en nyere tegning – koster: editoren henter en ny kladde.
- T6: Udgivet version læses fra `meta.layout.version` – koster: intet (kun udgivelse skriver tegningen).
- T9: En gulvrækkes kapacitet følger altid dybden (1–6) – koster: intet.
- T9: Pladsholderen `{udtraek}` (ASCII) er standard; `{udtræk}` accepteres også – koster: intet.
- T9/T11: "Navngiv igen" og cyklus giver den valgte slot et frisk navn og fjerner "håndrettet"; køregang/spærret/pluk uden navn markeres aldrig som håndrettet – koster: intet.
- T13: Navne på højst 30 tegn håndhæves alle steder i editoren (advarsel + afkortning) – koster: intet.
- T14: Udgiv og kassér kræver, at man selv redigerer kladden; editoren gemmer altid før oversigt og udgivelse – koster: ekstra skrivninger.
- T16: Oprydningen (slette kopier af rigtige data i brainstorm-mappen og `%TEMP%\hub-compare`) blev gjort af controlleren – koster: intet.

### Afsluttende review
- Kladden har en revision (`rev`): et gem fra en anden PC med en ældre revision afvises; overtag tager den gemte kladde over (ikke ens egen gamle kopi); udgivelsen er bundet til den revision, oversigten blev lavet på; editoren viser "Redigeres af X siden hh:mm" – koster: register.cjs/preload/typer ændret.
- "Find på tegningen" virker efter første udgivelse: et navn på en plads uden for tegningen bliver adopteret; slottens gamle plads fjernes (blokerer hvis der står varer) – koster: ny gren i udgivelsesplanen.
- "Uden for tegningen"-valg gemmes på den udgivne tegning og følger med ind i næste kladde (rettelse af en mangel i planen) – koster: intet.
- En tegning uden pladser kan ikke udgives, når hubben har pladser; første udgivelse får en ekstra bekræftelseslinje – koster: en tom hub kan stadig udgive en tom tegning (ufarligt).
- Med i samme bølge: Palle-hint viser kapacitet, R/Delete virker kun fra tegningen, én fælles `DRAWN_PURPOSES`, changelog-tekst, test af hylde-ombytning.

## Udskudte småting (bør tages op i Fase 2 eller senere)

Vigtigst først (fra det afsluttende review):
- Revisionen starter forfra på 1 efter "Kassér kladde" – en anden PC med samme admin og rev 1 kan stille genskabe den kasserede kladde. Løsning: en revision, der kun stiger (fx tid eller tæller i meta).
- Blokeringen "tegning uden pladser" vises først efter "Udgiv" – læg den ind i oversigtens blokeringer.
- `layout(user)` læser også kladde og versioner – ret før kortet for alle (Fase 2).
- En gemt kladde, der ikke længere består valideringen, blokerer alle gem (kun "Kassér" hjælper).
- R/Delete virker ikke efter klik på en værktøjsknap, før man klikker på tegningen.
- Ændringer i type/kapacitet på pladser med varer viser ikke varerne i oversigten; "brug listens" mangler.
- Strukturændringer (reolnavn, første nr., niveauer) omdøber pladser uden forudgående visning (ses i oversigten og kan fortrydes).
- Udgivelses-hændelsen kan ikke findes ved søgning på et pladsnavn i loggen.
- Fortryd i editoren gemmer op til 200 hele kopier (~20–30 MB med den rigtige tegning).
- `LayoutEditor.tsx` (~560 linjer) og `scripts/verify-layout.cjs` (~600 linjer) er store.
- Ingen E2E med to admins (dækket af node-tests).

Øvrige (sikre eller kosmetiske): tynde afvisnings- og randtests (T2–T5, T8–T10), stille afkortning ved import af spike-filen, a11y på lærred og "reolen forfra", ekstra `list()`-kald på forsiden, hint-tekster i Admin/forside, flaky screenshot-trin i E2E, `fillPattern` med `{constructor}`, cut-celler ved klemt rotation/hal.
