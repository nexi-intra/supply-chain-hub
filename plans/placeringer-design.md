# Placeringer i Lagerstyring – design

Status: design godkendt i brainstorm 20.10.2026 (afsnit 1–5); spec godkendt 20.10.2026. Delprojekt 1 + 2 bygget og lokalt committet 21.10.2026 (plan: `plans/placeringer-plan.md`); live-tjek mod M:/SAP er brugerens trin. Brugeren tjekker detaljerne mod hverdagen bagefter – derfor skal alt kunne rettes i Hubben efter importen (placeringer, formål, faste materialer, mærkater, paller).

> **Rettelse under implementeringen (20.10.2026):** i arket har 30 af 54 PLUK-pladser flere materialer (fx H1, F1.0). Derfor har en placering en **liste** af faste materialer (`fixedMaterials`), og pluk-status ("fyldt"/"løbet tør") gælder pr. plads **og** materiale.

## Formål

Placeringsarket (`M:\375750 - Terminal Configurations & Dispatch\4. Warehouse Management\1. Placeringer\Placeringsark_*.xlsm`)
bruges i dag til to ting: at **give en nyligt varemodtaget palle en plads** og at **finde den palle med et bestemt materiale,
der har stået længst (FIFO)**. Det bruges også til PLUK: når en kasse ved en arbejdsstation løber tør, skal man vide, hvor
pluk-pladsen er, og når pluk-pladsen løber tør, hvilken reservepalle (den ældste) den skal fyldes op med.

Placeringer bliver et værktøj i Lagerstyring (felt ved siden af Optælling), der gør det samme – men nemt og overskueligt,
uden at ligne Excel – og som senere bliver grundlaget for Optællings tællelister, så Hubben ikke behøver eksterne filer.

**Succes:** man kan registrere en hel varemodtagelse, tage en palle efter FIFO, fylde en pluk-plads op og finde et
materiale hurtigere end i arket; Hubert kan svare "hvor henter jeg X?"; TCD's data er importeret med korrekte
SAP-beskrivelser; TRR kan bygge sit lager op fra bunden.

## Delprojekter

| # | Delprojekt | Denne spec |
|---|---|---|
| 1 | **Placeringer (kerne):** pladser, paller, sæt på plads/tag/fyld op/flyt, søgning og FIFO, kapacitet, import af TCD's ark, historik | ja |
| 2 | **Hubert til Placeringer** (kun læsning + knapper) | ja |
| 3 | **Skift storage location i SAP (MIGO)** – Hubben udfylder, brugeren bekræfter selv i SAP | nej – senere, egen spec |
| 4 | **Optælling bruger Placeringer** i stedet for placeringsarket (arket forbliver reserve indtil I skifter) | nej – senere, egen spec |

Kernen gemmer storage location på hver palle og hver flytning som en hændelse (fra/til), så delprojekt 3 kan kobles på
uden at ændre modellen.

## Hvad placeringsarket indeholder (undersøgt 20.10.2026)

- **Data** (Excel-tabel `Table7`, 1.256 rækker): Lokation 1/0 (formel: optaget), Alder - dage (formel ud fra Dato),
  Område (formel: opslag på placeringens forbogstaver i skjult `Sheet2`), Placering, Type, Højde (tom overalt),
  SAP mat. No., SAP Description, Antal, Dato, Leverandør mat. no. (i praksis varemodtagelsens materialedokument,
  fx `5000032337 2026 0001`), Kommentarer.
- 869 placeringer i 12 områder (A, B, C, E, F, H, I, P, S, RE, PR, CW); typer Palle 669, Hylde 536, Reol 1/2, Bord, Swap.
  Navnemønstre: `A1.1` (gang.plads), `E9 H5`, `Reol X 1`, `F1.0`, `REOL`. 721 optagne, 311 materialer.
- **PLUK-kæden** (fx R162-0717): arbejdsstation **I8** (område I, uden antal) → pluk-plads **H26** (område H, med antal)
  → reserve **A2.1/A2.4** (paller med dato, "FAST PLADS").
- `999-999` (64 rækker, "TERMINAL REOL") = reserverede pladser. 110 rækker har materiale uden antal (faste pladser).
  Celle-kommentarer bærer viden ("incl. R133-0054 R162-0798").
- **Søg**-arket er en pivottabel med slicers (Område, Materiale, Beskrivelse) sorteret efter dato + kapacitet pr. type/område.
- Makroen `Update_pivots` opdaterer pivottabellerne og gemmer som `Placeringsark_dd_mm_yyyy_hh_mm` → én fil pr. dag.
- Fejl i arket: 13 rækker med område `#N/A` (præfiks K, Prep, REOL mangler i `Sheet2`), kapacitet for C viser `#REF!`.
- Arket ændres løbende: 30 ændringer 13.→20.10, 113 ændringer 01.→20.10 (modtagelser fylder tomme pladser, udtag tømmer rækken).

## 1. Model

**Placering** – navn (unikt pr. hub), område, type (Palle, Hylde, Reol, Bord, Swap, Gulv), kapacitet (palleplads 1 palle;
hylde/gulv flere), **formål**, eventuelt **fast materiale**, aktiv/deaktiveret, note.

| Formål | Betydning |
|---|---|
| Reserve | Almindelige paller; FIFO gælder. Kan have fast materiale (foretrækkes ved sæt på plads) |
| Pluk-plads | Fast materiale; status **fyldt / løbet tør** (+ hvem/hvornår); intet antal, ingen FIFO |
| Arbejdsstation | Kasser ved bordene; fast materiale; ingen antal, ingen status |
| Reserveret | Foreslås aldrig til nye paller (fx terminalreol); note forklarer hvorfor |

**Palle** (én palle = ét materiale) – placering, materiale, antal, modtagelsesdato (FIFO), 49/50-nummer
(materialedokument), serienumre (valgfri), storage location (fx D000), mærkater, note.

**Mærkater** – fast liste pr. hub (start: PLUK-relaterede ord fra arket som "Retur til Ingenico block stock", "Brandskab",
"Husk serienr.", "Sluse oppe"…), vedligeholdes af managere; erstatter fritekst-kommentarer.

**Materialekatalog** pr. hub – materialenummer → SAP-beskrivelse (+ hvornår/hvorfra hentet). **Beskrivelser kommer altid
fra SAP**, aldrig fra arket (se afsnit 6). Alle materialenumre vises med beskrivelse overalt (lister, kort, forslag, Hubert).

**Historik** – hver handling er en hændelse med hvem/hvornår: oprettet, sat på plads, taget (helt/delvist), flyttet,
storage location skiftet, løbet tør, fyldt op, rettet, placering oprettet/rettet/deaktiveret.

**Pr. hub:** data i `<team>\lagerstyring\placeringer\` – TCD og TRR ser aldrig hinandens data. Kun TCD og TRR har Lagerstyring.

**Roller:** alle i teamet sætter på plads, tager, fylder op, flytter og søger. Managere og Optællings admins/status managers
opretter/retter/deaktiverer placeringer, formål, faste materialer og mærkater, og kører importen.

## 2. Skærme og daglige handlinger

**Forside – opgave-først:** søgefelt øverst (materiale, beskrivelse, placering, 49/50-nummer, serienummer); fire store
knapper **Sæt palle på plads**, **Tag en palle**, **Fyld pluk-plads op**, **Find materiale**; listen **Løbet tør** med
forslaget til påfyldning pr. pluk-plads. Kapacitet pr. område vises som en lille række kort (optaget/ledige).

**Sæt palle på plads** (ved PC'en efter varemodtagelse, flere paller i ét flow)
- Scan/skriv 49/50-nummer → opslag i SAP (kun læsning, samme som Optællings materialedokument-import) udfylder materiale,
  antal og serienumre. Uden SAP: tast materiale og antal.
- Forslag til plads: ledige pladser med samme faste materiale → ledige pladser nær paller med samme materiale (samme
  område/gang) → øvrige ledige pladser. Reserverede og deaktiverede pladser foreslås aldrig. Bruger vælger og bekræfter.
  Dato = i dag (kan rettes).
- Er materialets pluk-plads løbet tør: "H26 er løbet tør – sæt pallen direkte der?"
- "Tilføj næste palle" holder flowet åbent.

**Tag en palle** – søg/scan materiale → paller med ældste først (plads, alder, antal). **Tag hele pallen** eller
**Tag X stk.** Vælges ikke den ældste: mild advarsel med den ældre palle, men man kan fortsætte.

**Fyld pluk-plads op** – listen over løbet tør (eller markér "Løbet tør" fra søgning/pladsen); forslaget er den ældste
reservepalle med samme materiale; **Fyldt op fra A2.4** tager pallen helt eller delvist og sætter pluk-pladsen til fyldt.

**Find materiale (opslagsværk)**
- **Materialekort:** beskrivelse, arbejdsstation(er), pluk-plads(er) med status, reservepaller ældste først, samlet antal.
- **Placeringskort:** indhold, alder, formål, historik.
- **Pallekort:** materiale, antal, dato, 49/50-nummer, serienumre, storage location, historik; knapper **Ret** (alle felter, med historik), **Flyt** (anden
  placering) og **Skift storage location** (registreres i Hubben nu; MIGO i delprojekt 3).

Sprog: dansk og engelsk som Optælling (`t(da, en)`; sv/fi får engelsk); feltet på Lagerstyring-siden på 4 sprog.

## 3. Import af TCD's placeringsark og opsætning

**Import** (manager, knap "Importér placeringsark"): læser det nyeste `Placeringsark_*.xlsm` i den konfigurerede mappe
(kun læsning, ingen makroer), kræver SAP klar (PS4) til beskrivelser, og viser **forhåndsvisning** før noget gemmes:
placeringer pr. område og formål, paller, materialer, beskrivelsesforskelle (ark vs. SAP), og rækker der kræver opmærksomhed.

| I arket | Bliver i Hubben |
|---|---|
| "PLUK" i område I | Arbejdsstation med fast materiale |
| "PLUK" i andre områder | Pluk-plads med fast materiale; status fyldt, hvis rækken har antal, ellers løbet tør (antallet gemmes ikke – pluk-pladser har intet antal) |
| "FAST PLADS" | Reserveplads med fast materiale; rækkens antal/dato bliver en palle |
| `999-999` | Reserveret placering; beskrivelsen ("TERMINAL REOL") som note |
| Række med materiale og antal | Palle (materiale, antal, Dato → modtagelsesdato, "Leverandør mat. no." → 49/50-nummer hvis det ligner et materialedokument, ellers note) |
| Tom række | Ledig placering |
| Flere rækker på samme placering | Flere paller på placeringen (kapacitet = antal rækker, mindst 1) |
| Kendte kommentarer | Mærkater; resten + celle-kommentarer → note |
| Område `#N/A` | Område ud fra navnet (K, Prep, REOL …), vist i forhåndsvisningen |
| Type, Højde | Type overføres; Højde er tom og springes over |

Importen kan gentages med **Erstat alt**, indtil den første registrering efter import er sket ("go-live"); derefter låst.

**Vedligehold** (managere/admins): opret én placering eller **en serie** (fx C1.1–C20.6, med område, type, formål), ret,
deaktivér (ikke muligt med paller på). TRR starter sådan fra bunden.

**Sameksistens:** Hubben ændrer aldrig placeringsarket. Optælling læser fortsat arket som i dag (`core/placements.cjs`),
indtil delprojekt 4.

## 4. Hubert (kun læsning)

Samme mønster som Optællings live-svar (`assistantWarehouse.cjs`): læser gennem Placeringers service som Hub-brugeren,
kun eget team, kun TCD/TRR, 4 sprog, svar med knap der åbner materiale/placering/palle. Hubert ændrer intet; han viser
knappen, hvor man selv trykker. Spørgsmål:

- "Hvor henter jeg R162-0717?" / "hvor henter jeg ethernet-kabler?" → arbejdsstation, pluk-plads + status, reserve ældste først.
- "H26 er tom" / "hvad skal jeg fylde H26 op med?" → ældste reservepalle.
- "Hvor er der en ledig plads til INT4300-4921-0?" → samme forslag som Sæt palle på plads.
- "Hvad står der på C16.2?" → indhold.
- "Hvor står 5000032337?" / serienummer → pallen.
- "Hvilke pluk-pladser er løbet tør?" → liste med forslag.

Søgning på beskrivelse (fx "bonruller", "simkort"). Senere (ikke nu): handlingsforslag med bekræft-knap.

## 5. Opbygning, fejl og test

- Backend: `electron/warehouse/placements/` (lager, regler: pladsforslag, FIFO, kapacitet, import-oversættelse,
  materialekatalog) og IPC `warehouse:placements:*` registreret i `register.cjs` med samme `serviceUser` og teamtjek.
- Skærme: `src/views/warehouse/placements/`; nyt felt i `WarehouseHome.tsx`; deep links med `tab: 'placements'` (+ `itemId` for placering/palle/materiale) via `navigateTo('warehouse', …)`.
- Lager: hændelseslog pr. hub i `<team>\lagerstyring\placeringer\` + afledt tilstand; skrivning med Hubbens
  `store.cjs`/`fileLock.cjs`. Samtidighed: tager to den samme palle, vinder den første; den anden får besked.
- Offline: handlinger gemmes lokalt og sendes, når M: er tilbage (som Optællings scanninger).
- SAP kun til opslag (materialedokument, beskrivelser). Uden SAP kan man stadig arbejde manuelt.
- Test: regler og import med det rigtige ark som fixture (kopi, originalen røres ikke); tests for FIFO, pladsforslag,
  løbet tør/fyld op, delvist udtag, samtidighed, teamadskillelse og at Hubert aldrig skriver; E2E med to brugere mod
  midlertidige data og falsk SAP (import → sæt på plads → løbet tør → fyld op → tag → flyt → Hubert); til sidst
  brugerens live-tjek.

## 6. Materialebeskrivelser fra SAP

- Ved import: **MB52** for hele D301 (findes i Optællings `export.vbs`/`sapParsers.cjs`) giver beskrivelsen for alt med
  lager; materialer uden lager slås op i materialelisten **MM60** (kun visning) i ét kald – bekræftet af brugeren 20.10.2026.
- Arkets "SAP Description" bruges kun til at vise forskelle i forhåndsvisningen; den gemmes aldrig som beskrivelse.
- Numre, SAP ikke kender (fx `999-999`), markeres "findes ikke i SAP" og importeres ikke som materiale.
- Kataloget opdateres automatisk ved Optællings SAP-hentninger og ved hvert 49/50-opslag. Ukendte numre får beskrivelse
  fra SAP ved første brug; manuel beskrivelse kun hvis SAP ikke kender nummeret, og den markeres som manuel.

## Uden for denne spec

MIGO-overførsel (delprojekt 3), Optællings skift fra ark til Placeringer (delprojekt 4), Hubert-handlinger med bekræft,
stregkode-labels til placeringer, kort/plantegning af lageret, moduler Lager og Varemodtagelse.
