# Stempelkort: felter pr. opgave og fælles opgaver – design (1.6.8)

Oprettet 2026-11-19 efter brainstorm med Jacob. Bygger oven på `plans/stempelkort-plan.md` (stempelkortet som det er i dag).

Rettet 2026-11-20: Softwareload er flyttet til sit eget modul (`plans/softwareload-design.md`). Stempelkortet har derfor ingen terminalliste, ingen kobling til materialekataloget og ingen softwarevalg. Felterne er generelle.

## Hvorfor

Stempelkortet måler i dag kun tid. Jacob vil også kunne måle, hvad tiden gik til, fx hvor mange kasser der blev pakket eller hvilken kunde opgaven var for. Hvad der er værd at måle, er forskelligt fra opgave til opgave. Derfor skal hver opgave kunne have sine egne felter.

Mange opgaver laves af to eller tre sammen. Man skal kunne hoppe med på en opgave, en kollega er i gang med. Tiden er stadig personlig, så managerne kan se tid pr. medarbejder, mens tallene (fx antal pakkede kasser) gælder for holdet.

## Mål

- Managere kan give hver opgave felter, der kun gælder i stempelkortet. Vagtplanen ser aldrig felterne, og deres opgaver ændres ikke.
- Felttyper: tal, valgliste og tekst. Et felt kan være påkrævet.
- En valgliste er en liste, manageren skriver selv (fx kunder eller pakketyper).
- En opgave, der er i gang, står på en liste, og kolleger kan hoppe med. Hver person har sit eget ur med egne pauser.
- Den sidste, der stopper, afslutter opgaven og udfylder tallene for holdet.
- Managerne ser de afsluttede opgaver med felter, deltagere og tider, og statistik pr. opgave: tallene lagt sammen, fordelingen pr. valg og antal pr. mandetime.

## Ikke-mål

- Tal pr. person. Tallene er for holdet (besluttet med Jacob).
- Softwareload: terminaler, serienumre, software og flytning i SAP hører til Softwareload-modulet, ikke stempelkortet (besluttet med Jacob 2026-11-19).
- Kobling til appens materialekatalog. Valglister er managerens egne lister.
- Excel-eksport og stempelkort for andre teams end TCD og TRR (står allerede som "senere").

## Anti-mål

- Kolleger må aldrig kunne se hinandens tider. Listen over igangværende opgaver viser opgave, valg og navne, men ingen tider og intet starttidspunkt.
- Opsætningen af felter må aldrig skrive i vagtplanens data (`shift-roles`).
- To, der trykker Stop i samme sekund, må aldrig ende med, at ingen eller begge skriver tallene.

## Begrænsninger

- Data ligger på M: i krypterede filer og skal virke med langsomme skrivninger (sekunder). Al adgangskontrol ligger i main-processen (`electron/warehouse/timeclockService.cjs`), ikke i skærmen.
- Opgaverne (navn og farve) kommer fortsat fra vagtplanens `shift-roles`.
- Det eksisterende stempelkort fortsætter med at virke: registreringer uden opgave-forløb vises som i dag.

## Tilgange (valgt med Jacob: A)

- **A. En fil pr. igangværende opgave (valgt).** Opgaven har sin egen fil med felterne og hvem der er på. Hver person har stadig sit eget ur og egne tider. Ved Stop fjerner man sig selv fra opgavefilen under dens lås. Er man den sidste, afsluttes opgaven med tallene. Fordel: "den sidste" kan aldrig gå galt. Ulempe: holdet deler én lille fil, men skriver kun ved start, hop med og stop.
- **B. Ingen fælles fil.** Hvert ur har et opgave-id, og listen bygges af alles ure. Fravalgt: to samtidige Stop kan give ingen eller to afslutninger, og felterne gemmes flere gange.
- **C. Ét fælles ur for holdet.** Fravalgt: bryder med personlig tid, og alle skriver i samme fil hele tiden.

## Besluttet med Jacob

- Managere sætter felterne op, medarbejderne udfylder dem.
- Softwareload er sit eget modul og ikke en del af stempelkortet.
- Tallene er for holdet, tiden er personlig.
- Pause er personlig: holder én pause, kører de andre videre.
- Den sidste, der stopper, afslutter opgaven og skriver tallene.
- **Afslut for holdet:** Trykker man Stop, mens andre stadig står på opgaven, kan man vælge "Stop kun mig" eller "Afslut opgaven for holdet". Det sidste stopper alles ure på samme tidspunkt og beder om tallene. Det løser, at en kollega har glemt at stoppe.
- **Managere kan rette sluttidspunktet** for den enkeltes tid, hvis det ikke er noteret korrekt (fx for en kollega, hvis ur blev stoppet af "Afslut for holdet" længe efter, at personen gik).

## Mine beslutninger (kan rettes)

- **Hvornår felterne udfyldes.** Valglister udfyldes ved Start (så listen over igangværende opgaver viser valgene). Tal og tekst udfyldes ved afslutningen af den sidste. Valglister husker sidste valg pr. opgave på denne PC.
- **Valg kan rettes undervejs.** Alle på opgaven kan rette valglisterne, mens den er i gang (fx forkert kunde valgt).
- **Alle starter et forløb.** Hver Start opretter et opgave-forløb, også for opgaver uden felter, så alle opgaver kan hoppes med på.
- **Hop med, mens ens eget ur kører,** virker som "Skift opgave": man forlader sin nuværende opgave (og afslutter den, hvis man er den sidste) og hopper med på den nye.
- **Annullér ur** fjerner én fra opgaven uden at gemme vedkommendes tid. Er man den sidste, og har andre allerede gemt tid på opgaven, beder appen om tallene og afslutter opgaven for holdet. Kun hvis ingen andre har gemt tid på den, forsvinder opgaven uden afslutning.
- **Afslut for holdet i praksis:** De andres ure stoppes på tidspunktet for afslutningen. Holder en af dem pause, slutter vedkommendes tid ved pausens start (pausen tæller ikke). Deres tider gemmes som almindelige registreringer med `endedByTeam` (hvem der afsluttede), så managerne kan se, at sluttiden ikke er sat af personen selv. Deres skærm viser næste gang, den spørger, at opgaven er afsluttet af en kollega. Det er den eneste handling, hvor én person skriver i en kollegas filer; det sker under filernes låse.
- **Rettelse af sluttid:** Managerens eksisterende "Ret" på en registrering bruges. Varigheden af en afsluttet opgave (første start til sidste stop) og antal pr. mandetime regnes ud fra deltagernes registreringer, når de vises, så en rettelse slår igennem med det samme.
- **Deltagere der ikke er der:** Står en person på opgaven, men vedkommendes personlige ur er væk eller kører på en anden opgave, fjernes personen fra opgaven ved næste handling på den. Så kan en opgave ikke hænge på en, der reelt er gået.
- **Antal pr. time** regnes pr. mandetime: tal delt med summen af deltagernes arbejdstid (uden pauser). Varigheden fra første start til sidste stop vises også.
- **Felter ændres eller slettes:** et felt har et fast id. Afsluttede opgaver gemmer feltets navn og værdien, så gamle opgaver vises rigtigt, selvom feltet senere omdøbes eller slettes.
- **Managerens rettelser:** en manager kan rette en afsluttet opgaves valg og tal og slette en afsluttet opgave. Personlige tider ændres ikke af det (de rettes og slettes som i dag). Rettelser gemmes med managerens navn.
- **Glemt stop (over 10 timer)** virker som i dag pr. person. Er man den sidste, kommer tallene i samme dialog.

## Data på M: (`<team>\lagerstyring\stempelkort`)

- `opsaetning`: felter pr. opgave. `{ tasks: { [taskId]: { fields: [{ id, label, type: 'number' | 'choice' | 'text', required, options: [{ value, label }] (kun valgliste) }] } } }`. Kun managere skriver.
- `forloeb-<id>`: en igangværende opgave. `{ id, taskId, taskName, taskColor, choices: { [fieldId]: { value, label } }, participants: { [email]: { name, joinedAt } }, startedBy, startedAt }`. Skrives under filens lås ved start, hop med, rettelse af valg og stop.
- `forloeb-afsluttet-<åååå-mm>`: afsluttede opgaver i måneden for deres start. Opgaven får `endedAt`, `endedBy`, `values` (alle felter med navn og værdi) og `people: [{ email, name }]`. Skrives af den sidste ved afslutning.
- `aktiv-<skriver>` (personligt ur) og `tider-<skriver>-<åååå-mm>` (personlige registreringer) får `jobId`, så managerne kan koble personlige tider til opgaven.

## Skærme

- **Stempelkort (alle):** "Igangværende opgaver" over uret med opgave, valg og navne og en knap "Hop med". Start spørger om valglisterne, hvis opgaven har nogen. Stop, når andre stadig er på, giver valget "Stop kun mig" eller "Afslut opgaven for holdet". Stop som den sidste (eller Afslut for holdet) spørger om tal og tekst (påkrævede felter skal udfyldes). Mens uret kører, kan valglisterne rettes.
- **Opsætning (managere):** ny fane i Stempelkort. Vælg en opgave fra vagtplanen og tilføj, omdøb, flyt og slet felter. For en valgliste skrives linjerne.
- **Oversigt og statistik (managere):** ny sektion "Afsluttede opgaver" med opgave, valg, tal, deltagere, tid pr. person og i alt, og antal pr. mandetime. Vælges én opgave, vises tallene lagt sammen og fordelingen pr. valg (fx kasser pr. kunde).

## Overladt til den, der bygger

- Præcis udformning af skærmene, så længe de følger stempelkortets nuværende stil.
- Hvordan listen over igangværende opgaver holdes frisk (polling som resten af stempelkortet er fint).
- Grænser for antal felter, længde af navne og antal egne linjer.
- Hvordan et opgave-forløb, hvis fil er væk (fx slettet ved en fejl), håndteres for dem, der stadig har et ur på det: uret skal kunne stoppes som en almindelig registrering.

## Næste skridt

Når Jacob har godkendt dette design, skrives en plan i faser med afkrydsning i `plans/stempelkort-felter-og-hold-plan.md`, startende med fase 1.
