# Tegning af lageret i Placeringer – design

Status: brainstorm 29.–30.10.2026; tilgang A valgt af brugeren 30.10.2026; læst af en uafhængig bygherre-tjek 30.10.2026
(tre fund, afgjort som "mit valg" nedenfor). **Godkendt af brugeren 02.11.2026.** Plan: `plans/lager-tegning-plan.md`.
Spike (smides væk): `.superpowers/brainstorm/22024-1793349768/content/tegn-lageret.html` (version 18).
Brugerens tegning af TCD-hallen: `plans/lager-tegning-tcd.json` (49 ting, spike-format).
Markeringen **(mit valg)** betyder: besluttet af AI'en, ikke aftalt med brugeren – kan rettes.

## Formål og hvorfor

- I Placeringer er en plads i dag kun et navn i en liste (hentet fra Placeringsarket, rettet under Admin). Man kan ikke se,
  hvor pladsen er, i hvilken højde, eller hvad der står omkring den. Det koster mest ved **"Sæt palle på plads"** (den
  hyppigste opgave) og når man leder efter en plads.
- Lageret ændrer sig (reoler flyttes, niveauer ændres). Brugeren vil have et tegneværktøj **inde i appen**, så det er nemt
  at tegne og holde layoutet opdateret – og tegningen skal være **det ene sted**, hvor pladser oprettes, flyttes og nedlægges.
- **Skiltenes navne er sandheden** (bekræftet af brugeren): navnene i pladslisten er dem, der står på skiltene på lageret.
  Tegningen skal følge dem, også de skæve.

**Succes:**
- En Placerings-admin kan tegne og ændre hallen i appen og udgive den; pladslisten følger med, og ingen palle forsvinder.
- Alle kan åbne et kort, finde en plads og se reolen forfra med pladsen i den rigtige højde og naboerne omkring.
- Efter første afstemning har alle pladser i listen enten en plads på tegningen eller er bevidst markeret "uden for tegningen".

## Mål, ikke-mål og anti-mål

**Mål**
1. Tegneværktøj i appen for Placerings-admins (det, spiken kan, plus det afstemningen kræver – se "Tegneværktøjet").
2. Tegningen ejer de fysiske pladser (tilgang A): hver plads på tegningen har sit navn gemt; udgivelse viser ændringerne
   og opdaterer pladslisten først, når en admin har godkendt.
3. En engangs-afstemning mellem brugerens tegning og de 869 pladser i listen.
4. Et kort for alle i Placeringer (kun læsning) og "Vis på kort" fra plads, reol, søgning og forslag i "Sæt palle på plads".

**Ikke-mål** (egne runder senere)
- Ny "Sæt palle på plads"-formular og den øvrige oprydning i Placeringer (dobbelte tilbage-knapper, lang formular).
- Fjerne arbejdsstation-begrebet. I1–I13 dukker op i afstemningen, men selve fjernelsen er en egen runde.
- Optælling, Hubert, scanner-app/API.
- Pallehøjder og regler om hvilke paller der må stå hvor (Højde er tom i arket i dag). Modellen gemmer niveauet, så det kan
  tilføjes senere.
- TRR i Placeringer. TRR har ingen Placeringer-data i dag; deres pladser (pallerne i D og E) tegnes og vises grå.
- Forslag ud fra afstand på kortet.

**Anti-mål** (ville være en fiasko, selv om det teknisk virker)
- En plads med paller eller lagerlinjer forsvinder eller skifter navn, uden at en admin har set det og sagt ja.
- Navne på tegningen, der ikke svarer til skiltene.
- Et CAD-agtigt værktøj, som kun én person kan finde ud af.
- Kortet gør Placeringer langsommere i hverdagen.

## Begrænsninger (fra projektet)

- React 19 + Vite 7 + Tailwind 4 (`src/`), Electron-backend (`electron/warehouse/locations/*.cjs`). **Ingen nye biblioteker**;
  tegningen er SVG som i spiken **(mit valg)**.
- Data ligger krypteret på M: (`electron/store.cjs` → `createStore`), pr. hub i `<team>\lagerstyring\placeringer\`
  (`locations`, `pallets`, `stock`, `tags`, `meta`, `history-YYYY-MM`). Udvikling er **ikke isoleret** fra M:;
  tests og E2E kører mod midlertidige data som `scripts/verify-locations.cjs`, aldrig mod M:.
- Pladsens id er navnet normaliseret (`locationKey` i `model.cjs`: trim, ét mellemrum, store bogstaver). Paller
  (`pallet.location`) og lagerlinjer peger på id. `editLocation` i `service.cjs` kan allerede omdøbe en plads, så paller
  og lager følger med – den mekanisme genbruges ved udgivelse.
- Ændringer skrives atomisk med `repository.transact` (låste nøgler) og registreres som hændelser i historikken.
  `meta.changedAt` får andre PC'er til at læse igen (poll hvert 15. sekund + `onChanged`).
- Placeringer har en offline-kø (`outbox.cjs`) til daglige handlinger. **Tegning og udgivelse kræver M:** og køes ikke **(mit valg)**.
- Rettigheder: Hub-managers og Placerings-admins (`roles.cjs`, `requireAdmin` i `service.cjs`). Kun de kan tegne og udgive.
- Tekster via `t(da, en)` som resten af Placeringer.
- Ingen Node på udviklings-PC'en; tests køres med Electron som node (se `/memories/repo/supply-chain-hub.md`).

## Tilgange (overvejet 30.10.2026)

| | Tilgang | Fordel | Ulempe |
|---|---|---|---|
| **A** | **Tegningen ejer pladserne; navnet gemmes pr. plads.** Regler foreslår navne, når der tegnes nyt; bagefter er navnet bare gemt tekst, der kan rettes enkeltvis eller i bunker. | Ét sted at vedligeholde; skiltenes skæve navne bevares præcist | Første afstemning tager tid; Admin-siden skal ombygges |
| B | Listen ejer pladserne; tegningen kortlægger kun, hvor listens pladser står. | Mindst ændring; ingen risiko for navne og paller | To steder at vedligeholde – det brugeren ville undgå; ny reol skal både tegnes og oprettes |
| C | Navne beregnes altid af regler (som spiken). | Hurtigt at tegne nyt | Hvert skævt skilt kræver en ny regel; ét flueben kan omdøbe pladser med paller |

**Valgt: A** (brugeren, 30.10.2026). Skiltenes navne er fulde af undtagelser (`S31 GULV`, `Reol X 1`, `A.Gulv`, `F1.0`,
`K1.GULV`, `E9 H1`); når navnet gemmes pr. plads, bevares de præcist, og reglerne bliver kun en hjælp.

## Afgørelser fra brainstormen (brugerens)

- Tegningen bestemmer, **hvilke pladser der findes og hvor**; Placeringer holder styr på, **hvad der står på dem**
  (paller, FIFO, faste materialer, historik).
- Når en admin gemmer/udgiver, vises først en oversigt ("12 nye, 2 fjernes, 1 kan ikke fjernes – der står en palle");
  intet ændres før godkendelse. En plads med paller slettes aldrig automatisk. Pladser i listen, der ikke er på tegningen,
  markeres – de slettes ikke.
- TRR: én fælles tegning af hallen; TRR's pallepladser i D og E vises grå og foreslås aldrig til TCD. Udtræksreolerne
  under E (`E0 H1` …) er TCD's.
- Pladser, der kun er visuelle: hyldereoler "kun visuelt – ikke lagerført" (printerpapir, papkasser …), stationer, sluse,
  kontor osv.
- Plukplads uden navn under P22 hedder "Pluk under P22" og er ikke en plads (tæller ikke i nummereringen).
- Køregange i en reol: gulvniveauet er spærret, og pladsen over beholder fagets nummer (`A10.2`).

## Model

### Tegningen (ét dokument pr. hub)

Gemmes i hubbens placeringer-store som nye nøgler **(mit valg)**, så udgivelse kan skrive tegning og pladser i samme
transaktion:
- `layout` – den udgivne tegning: `{ version, hall: { w, h }, items: [...], publishedAt, publishedBy }`
- `layout-draft` – kladden: samme form + `basedOn` (version af den udgivne), `editedBy`, `editedAt`
- `layout-versions` – de seneste 20 udgivne versioner (til at gå tilbage) **(mit valg)**

`items` er tingene på tegningen med de typer, spiken har: pallereol, gulvpladser i række, hyldereol, gulvområde, sluse,
station, varemodtagelse, port, PC, rum/kontor, tekst. Hver ting har position, størrelse, rotation, form (fjernede ruder),
navn, etage (gulv/ovenpå) og ejer (TCD/TRR/Andet).

### Pladser på tegningen (slots)

Alt, der kan blive en plads, er en **slot** med et fast `slotId`, der aldrig ændres ved omdøbning, flytning eller rotation.
En slot gemmer: `slotId`, `name` (gemt tekst), `kind`, `capacity`, `level` (fysisk rum nedefra), og arver ejer og etage fra
sin ting.

| Ting | Slots |
|---|---|
| Pallereol | én pr. fag × niveau. `kind`: palleplads, plukplads med navn, plukplads uden navn, reolsystem (hylder under pallerne), køregang, spærret |
| Udtræksreoler under en pallereol | én pr. udtræk × hylde (`E9 H1`, H1 øverst) |
| Hyldereol (ikke "kun visuelt") | **nyt ift. spiken:** sektioner × hylder, én slot pr. hylde med gemt navn (`H1`…`H50`, `Reol X 1`…, `Prep1`…, `CW1`…) |
| Gulvpladser i række (S ovenpå) | **én slot pr. position med kapacitet = dybde** (`S0` rummer 2 paller), ikke `S0.1/S0.2` – sådan står de i listen **(mit valg ud fra listen)** |
| Gulvområde | én slot (`A.Gulv`, `P.GULV`, `Pap plukpladser`) |
| Særlig plads | én slot, der kan sættes på en station, et bord eller en ting; bruges til listens pladser af typen Reol, Bord, Swap og formålet station (I1–I25, `REOL`) **(mit valg)** |
| Kun visuelt, station, sluse, port, PC, rum, tekst | ingen slots (medmindre der sættes en særlig plads på) |

Alle slots, der bliver pladser (palle, hylde, gulv), kan være **pluk eller reserve** – listen har fx `H1` som Hylde/pick og
`F1.0` som Gulv/pick **(mit valg ud fra listen)**.

**Navnehjælp:** Når en reol tegnes, eller en admin trykker "Navngiv igen", foreslås navne ud fra et mønster med
pladsholdere, fx `{reol}{fag}.{n}` (standard, tæller nedefra og springer pluk uden navn og spærret over) eller
`{reol}{fag} GULV` for niveau 1. Derefter er navnene almindelig tekst. Man kan rette én plads eller en markering. Ændres et
mønster, vises først hvilke navne der skifter, og om der står paller på dem.

### Fra slot til plads i Placeringer

| Slot | Placering: type / formål / kapacitet |
|---|---|
| Palleplads | Palle / reserve eller pick / 1 (gulvrække: dybden) |
| Plukplads med navn | Palle / pick / 1 |
| Reolsystem, udtrækshylde, hylde i hyldereol | Hylde / reserve eller pick / 0 (lagerlinjer) |
| Gulvområde | Gulv / reserve eller pick / ubegrænset |
| Særlig plads | **beholder listens type og formål** (Reol, Bord, Swap, station); tegningen bestemmer kun, at den findes, navn og placering. Kan kun kobles til en eksisterende plads, ikke oprette nye **(mit valg)** |
| Plukplads uden navn, køregang, spærret | ingen plads (vises kun på kortet) |
| Slot på en TRR-ting | ingen plads i TCD's liste (vises grå) |

En ny plukplads oprettes uden fast materiale og vises som "mangler materiale" i Admin, indtil en admin tilføjer det
**(mit valg – reglen om at pick kræver fast materiale lempes for pladser oprettet af tegningen)**.

### Hvem ejer hvilket felt

- **Tegningen:** om pladsen findes, navn, type, kapacitet, pluk eller reserve, position (ting, fag, niveau), ejer, etage.
  For særlige pladser kun: findes, navn og position.
- **Placeringer:** faste materialer, note, "reserveret" (foreslås aldrig), aktiv/deaktiveret, mærkater og alt om paller og lager.
- Admin-siden viser tegningens felter skrivebeskyttet med "Ret på tegningen". Opret plads, serie, reol og nedlæg flyttes
  til tegningen. Placeringsark-importen skjules, når tegningen er udgivet første gang **(mit valg)**.

## Udgivelse

1. Admin arbejder i **kladden**, der gemmes automatisk på M:. Der er én kladde pr. hub; den viser, hvem der redigerer og
   siden hvornår. En anden admin kan overtage med en advarsel **(mit valg)**.
2. "Udgiv" beregner forskellen mellem kladden og den udgivne tegning + den nuværende pladsliste:
   - **Nye** pladser (opret)
   - **Omdøbte** (samme `slotId`, nyt navn) – paller og lager følger med (som `editLocation`)
   - **Ændrede** (type, kapacitet, pluk/reserve)
   - **Fjernede**: tomme nedlægges; **med paller eller lagerlinjer blokerer udgivelsen**, til de er flyttet, eller sloten
     beholdes
   - **I listen uden slot** ("uden for tegningen"): røres ikke, vises som oplysning
   - **Navnekonflikter** (to slots med samme navn, eller et navn der tilhører en anden plads): blokerer
3. Admin ser tal + liste og godkender. Alt skrives i **én** `transact` (locations, pallets, stock, layout, meta) og
   registreres som én hændelse i historikken: "Tegning udgivet: 12 nye, 3 omdøbt, 2 nedlagt" med detaljer.
4. Er tegningen udgivet af en anden, siden kladden blev startet (`basedOn` ≠ udgivet version), afvises udgivelsen:
   "Tegningen er ændret af X – hent den nye". Ingen sammenfletning **(mit valg)**.
5. En udgivelse kan ikke fortrydes med den almindelige fortryd (som importen). I stedet kan en tidligere version åbnes som
   kladde og udgives igen; oversigten viser, hvad det vil gøre **(mit valg)**.

## Første afstemning (engangs)

- Brugerens tegning (`plans/lager-tegning-tcd.json`) hentes ind som første kladde. Ved konverteringen bliver spikens
  beregnede navne til gemte navne pr. slot; gulvrækker bliver én slot pr. position med kapacitet = dybde; hyldereolerne
  H, I og X får sektioner/hylder, som admin udfylder.
- Slots, hvis navn findes i listen, kobles straks (633 af 869 den 30.10.2026).
- En **afstemningsvisning** bruges, indtil der ikke er noget åbent:
  1. **Kun i listen** (236): "Find på tegningen" (klik en slot → den får navnet), "Uden for tegningen" (bliver i listen
     uden plads på kortet) eller "Nedlæg" (kun hvis tom).
  2. **Kun på tegningen** (107 der ville blive pladser; derudover 120 TRR-pladser, 10 køregange og 2 pluk uden navn, der
     ikke tæller): "Opret ved udgivelse" (standard) eller "Ikke en plads" (bliver spærret).
  3. **Forskellig type/kapacitet**: brug tegningens, eller ret tegningen til listens (altid muligt, fordi slots kan være
     palle/hylde/gulv × pluk/reserve). Kan tegningens type ikke bruges, fordi der står paller eller lager på pladsen
     (`editLocation` afviser fx Reol→Hylde med paller), vises det med grunden, og tegningen skal rettes.
- Første udgivelse må gerne ske, selv om pladser **med paller eller lager** står som "uden for tegningen" – de røres ikke
  og virker som i dag, de er bare ikke på kortet endnu. De vises i en liste "Ikke på kortet endnu" **(mit valg)**.
  Det, der blokerer, er kun navnekonflikter og typeskift, der ville blive afvist.

**Kendte forskelle (sammenligning 30.10.2026, kun læst):**
1. Navneregler i S: listen `S0`–`S26` (én plads, op til 2 paller) og `S31` + `S31 GULV`; tegningen `S0.1/S0.2` og `S31.1/S31.2` (34 paller).
2. Gulvpladser: `A.Gulv`, `P.GULV`, `K1.GULV`, `F1.0` findes ikke på tegningen.
3. Nummererede hylder: `H1`–`H50`, `Reol X 1`–`16`, `Prep1`–`10`, `CW1`–`10`, K (35), `I1`–`I25` (heraf stationer I1–I13);
   tegningen har ét navn pr. hyldereol, og K, Prep og CW er ikke tegnet.
4. Niveauer: `.6` i tegningen men ikke i listen (fx A1–A4, A7, A14, B6, B16, C7, C17), `.4/.5` i listen men ikke i
   tegningen (C1–C7 m.fl.), `P2.3`–`P5.3`, `F16.5`–`F18.5`; E21–E23 har flere udtrækshylder i tegningen.
5. 47 af 322 paller står på pladser, tegningen ikke kender (S 34, P 12, A.Gulv 1).

## Tegneværktøjet

Placeringer → Admin → **Tegning** (kun Placerings-admins; backend tjekker med `requireAdmin`).

Fra spiken (bygges om i React, kopieres ikke):
- Tegn, flyt, skift størrelse, rotér 90°, kopiér/indsæt, fortryd, fjern/tilføj ruder (form), etagefilter (gulv/ovenpå).
- Pallereol: navn, første fag-nummer, fag-retning, antal fag og niveauer, niveauer pr. fag, tomme fag, køregange,
  "Reolen forfra" med klik for at skifte slot-type, reolsystem i fag, udtræksreoler med hylder pr. udtræk, ejer.
- Gulvpladser i række (første nummer, antal, dybde, retning), hyldereol (inkl. "kun visuelt"), gulvområde, sluse, station,
  port, PC, rum, tekst.

Nyt ift. spiken:
- Gemte navne pr. slot, navnemønstre, ret ét/flere navne.
- Hyldereol med sektioner × hylder og navne pr. hylde; gulvpladser i række med kapacitet = dybde.
- Pluk/reserve på alle slots, der bliver pladser; særlige pladser (Reol, Bord, Swap, station fra listen).
- Farve på slots efter kobling: passer / kun på tegningen / navnekonflikt; og efter indhold (paller/lager på).
- Afstemningsvisningen og "Udgiv" med oversigt.
- Eksport/import af tegningen som fil (backup) **(mit valg)**.

## Kortet for alle

- Placeringer-forsiden får **"Kort over lageret"**: hele hallen, kun læsning, etagefilter, søgefelt (plads eller materiale)
  der fremhæver.
- Klik en reol → **reolen forfra** med pladserne farvet: tom / optaget / pluk / reserveret / TRR (grå) / ingen plads.
  Klik en plads → pladskortet (`LocationCard`).
- **"Vis på kort"** på pladskort, reolkort og søgeresultater (plads): åbner kortet med pladsen fremhævet og reolen forfra.
- **"Sæt palle på plads":** hvert forslag og den valgte plads får "Vis", der åbner en lille forfra-visning af reolen med
  pladsen fremhævet, niveauet ("3. niveau fra gulvet") og naboerne. Det præcise udseende mockes i brainstorm-vinduet,
  før fase 3 bygges.
- Tegningen læses én gang pr. udgivet version og caches; belægning kommer fra de data, Placeringer allerede henter.

## Faser

Kortet for alle kommer først, når tegningen er udgivet første gang – så ingen ser en halvfærdig kladde, og der findes kun
én slags udgivelse **(mit valg)**.

1. **Tegning, afstemning og første udgivelse (kun admins).** Datamodel med slots og gemte navne; editor med kladde på M:;
   import af brugerens tegning; navnemønstre, hyldereol med hylder, gulvpladser, særlige pladser; afstemningsvisningen;
   udgiv med oversigt; Admin-siden skrivebeskyttes for tegningens felter. Den største fase.
2. **Kortet for alle.** "Kort over lageret", reolen forfra med belægning, "Vis på kort" fra pladskort, reolkort og søgning.
3. **Kortet i hverdagen.** Forfra-visning af forslag og valgt plads i "Sæt palle på plads" (efter mockup).

## Overladt til bygherren

- Komponent- og filopdeling, IPC-kanalnavne (følg `reads`/`writes`-mønstret i `register.cjs`), TS-typer i `src/types/warehouse.ts`.
- SVG-detaljer, farver (følg spiken), tastaturgenveje.
- Testopdeling: rene funktioner (navngivning, slots, forskel/udgivelse) i `node:test`; E2E-udvidelse af
  `scripts/verify-locations.cjs` mod midlertidige data.
