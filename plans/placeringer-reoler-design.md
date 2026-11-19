# Placeringer – reoler, hylder, gulvpladser og nem oprettelse/sletning

Status: design godkendt i brainstorm 22.10.2026 (afsnit 1–4). Bygger på `plans/placeringer-design.md`,
`plans/placeringer-log-design.md` og den færdige Placeringer-kerne med log og fortryd (Lagerstyring > Placeringer, TCD og TRR).

## Formål

Lageret har tre slags pladser, og Placeringer skal følge dem:

- **Pallepladser**: præcis én palle.
- **Gulvpladser**: mange paller, ingen grænse.
- **Reoler med hylder**: en reol oprettes med sine hylder, og på en hylde kan der stå flere forskellige materialer.

Samtidig skal det være nemt at **tilføje og slette** placeringer – i dag kan man kun deaktivere, og kun én ad gangen.

## Beslutninger (fra brainstorm)

- En "ting" på en hylde er **materiale + antal** (model C): samme materiale lægges sammen; ingen alder, FIFO, 49/50-nummer
  eller serienumre på hylder.
- En reol oprettes med **navn og antal hylder**; hylderne hedder `E9 H1` … `E9 H5` (som i arket). Hylder kan tilføjes og
  fjernes bagefter.
- En hylde er enten **lager** (hyldelager med antal) eller **pluk** (som pluk-pladser i dag, uden antal).
- **Gulvpladser** har ingen grænse; en **palleplads** er altid præcis 1 palle.
- Hylder er **almindelige placeringer** med `rack`/`shelf` på sig; reolen er gruppen af dens hylder (ingen ny
  reol-enhed). Hyldeindholdet er **ny slags data, "hyldelager"**, adskilt fra paller.
- Placeringer kan **slettes**, når de er tomme – én, en hel reol eller mange valgte på én gang – og sletning kan fortrydes.

## 1. Datamodel og regler

**Placering** (`Location`) får to valgfrie felter: `rack` (fx `"E9"`) og `shelf` (fx `5`) – kun for hylder i en reol.
Navnet er `${rack} H${shelf}`. Navne som `E9 H5` (mellemrum, `H` + tal til sidst) genkendes som reol `E9`, hylde `5` ved
import, omlægning og "Opret placering".

**Hyldelager** er en ny nøgle i staten, ved siden af `locations` og `pallets`:

```
stock: { [id]: { id, location, material, quantity, updatedAt, updatedBy, note } }   // id = `${location}|${material}`
```

- Én linje pr. hylde og materiale. At lægge samme materiale på igen lægger antallet til; ved antal 0 slettes linjen.
- `quantity` er et helt tal ≥ 1. `note` bruges til det, omlægningen ellers ville miste (49/50-numre og serienumre).

**Hvad må stå hvor** (styret af typen, ikke af et kapacitetstal):

| Type | Indhold | Grænse |
|---|---|---|
| Palle | paller | præcis 1 |
| Gulv | paller | ingen |
| Hylde, formål lager (`reserve`) | hyldelager | ingen grænse for antal materialer |
| Hylde, formål pluk (`pick`) / arbejdsstation | som i dag (faste materialer, intet antal) | – |
| Bord, Swap, den gamle "Reol"-type | paller | kapacitetstal som i dag |

- Paller kan ikke sættes på en lagerhylde (`LOCATION_IS_SHELF`); hyldelager kan ikke lægges på andet end en lagerhylde
  (`NOT_A_SHELF`).
- `occupancy`/`areaSummary` ("ledige pladser pr. område") tæller kun pallepladser (Palle, Bord, Swap, gammel Reol); en
  gulvplads vises med antal paller og er altid "ledig"; hylder vises med antal materialer.
- FIFO og "Tag en palle" handler fortsat kun om paller.

**Log og fortryd:** `stock` kommer med i transaktionernes før/efter-billede (`undo.cjs` `KINDS` får `['stock', 'stock']`,
repositoryets state-nøgler får `stock`). Alt på hylder logges og kan fortrydes. Et fortryd afvises (konflikt på
placeringen), hvis en hyldelinje skal tilbage på en hylde, der er slettet eller ikke længere er en lagerhylde.

**Omlægning af eksisterende data (én gang):** paller, der står på en placering af typen Hylde med formål `reserve`, bliver
til hyldelager (samme materiale på samme hylde lagt sammen). Eventuelle 49/50-numre og serienumre skrives i linjens `note`.
Hylder med navne som `E9 H5` får `rack`/`shelf`. Omlægningen kører i én transaktion, markeres i `meta`
(`shelvesMigratedAt`), så den aldrig kører to gange, og står i loggen som én handling (`type: 'migrate'`, kan ikke fortrydes).

## 2. Arbejdet med hylder

- **Forsiden:** ny knap **"Læg på hylde"** ved "Sæt palle på plads". Scan/skriv hylden (`E9 H5`) → materiale (forslag med
  beskrivelse mens man skriver) → antal → **Gem**. Står materialet der, vises "40 stk. → 50 stk." før man gemmer.
  - Et 49/50-nummer kan scannes: materiale og antal hentes fra SAP (som ved paller); nummeret gemmes ikke på hylden.
  - Forslag til hylde: hvor materialet allerede står, ellers en lagerhylde i samme reol, ellers samme område.
- **"Tag en palle" hedder "Tag":** materialets reservepaller (ældste først) som i dag, og under dem **"På hylder"** med
  linjer (`E9 H5 · 40 stk.`) og knapperne **"Tag X stk."** og **"Tag alt"**.
- **"Fyld pluk-plads op":** forslaget er stadig den ældste reservepalle; uden palle med materialet foreslås hylden med
  materialet, og man skriver antal.
- **"Flyt palle" hedder "Flyt":** flytter også X stk. fra én lagerhylde til en anden (lægges sammen på modtager-hylden).
- **Kort:**
  - **Reolkort** (`E9`): hylderne oppefra og ned (højeste nummer øverst) med indhold; **"Tilføj hylde"** og **"Fjern hylde"**
    (kun admins).
  - **Hyldekort** (`E9 H5`): linjerne med **"Tag"**, **"Flyt"** og **"Ret antal"** (optælling/rettelser).
  - **Materialekortet** får **"På hylder"** (antal pr. hylde); hylderne tælles med i det samlede antal.
  - **"Hvor henter jeg?"** viser også hylderne.
- **Søgning** finder reoler (`E9` → reolkortet) og hylder (`E9 H5`).
- Nye IPC-metoder (alle skrivende kommer i den lokale kø, som de andre): `shelfPut`, `shelfTake`, `shelfMove`,
  `shelfSet` (ret antal); læsende: `rackCard`. Kø-metoderne får `actionId`, så de anvendes én gang.

## 3. Tilføje og slette placeringer

Alt i **"Administrér placeringer"** (kun managere og Placerings admins).

- **"Opret placering"** som i dag; typen styrer felterne (Palle uden kapacitet, Gulv uden grænse, hylde med reol/hylde).
- **"Opret serie"** som i dag (gang.plads); typen Gulv kan vælges.
- **"Opret reol"** (ny): navn (fx `E9`), antal hylder (1–20), område og formål (lager/pluk) → `E9 H1`…`E9 Hn` i én handling.
- **Reolkortet:** "Tilføj hylde" (næste nummer) og "Fjern hylde" (kun en tom hylde).
- **"Slet"** på en placering: kun når den er tom (ingen paller og intet hyldelager); ellers `LOCATION_NOT_EMPTY` med hvad
  der står ("Der står 2 paller på A1.1").
- **"Slet reol":** alle hylderne, hvis alle er tomme; ellers vises hylderne med indhold, og intet slettes.
- **Vælg flere i listen:** afkrydsning pr. række og **"Vælg alle i søgningen"** → **"Slet valgte"** / **"Deaktivér valgte"**.
  Tomme slettes; resten vises med begrundelse – intet forsvinder i stilhed. Højst 500 ad gangen.
- Hver sletning (også mange på én gang) er **én handling** i loggen og kan fortrydes (`type: 'location'`,
  `changes: { deleted: … }`).
- "Deaktivér" findes stadig til pladser, der skal hvile.
- **Listen** kan filtreres på område, type og "tomme".
- Nye IPC-metoder: `createRack`, `addShelf`, `deleteLocations` (én eller mange; svarer `{ deleted, kept: [{ name, reason }] }`),
  `setActiveMany`.

## 4. Import, Hubert, roller og tests

- **Import af placeringsarket:** Hylde-rækker, der ikke er PLUK og har antal, bliver hyldelager (samme materiale på samme
  hylde lagt sammen); forhåndsvisningen viser det. `E9 H5`-navne får `rack`/`shelf`. En palleplads med flere rækker
  importeres som før med advarslen `PALLET_PLACE_MANY` ("flere paller på en palleplads – ret typen til Gulv eller flyt
  pallerne"); arkets data smides aldrig væk.
- **Hubert** (kun læsning, 4 sprog): "hvor henter jeg …?" nævner hylderne med antal; "hvad står på E9 H5?" og "hvad står
  i reol E9?" svarer med en knap til kortet. Ønsker om at lægge på, tage eller slette får "jeg kan kun læse". Guiden får
  "Læg på hylde", "Opret reol" og "Slet placeringer" (4 sprog).
- **Roller:** opret/slet/reol/hylder kræver manager eller Placerings admin; lægge på og tage fra hylder må alle i teamet.
- **Tests:**
  - Enhed: palleplads præcis 1, gulv ingen grænse; hyldelager lægges sammen og forsvinder ved 0; palle på lagerhylde og
    hyldelager på palleplads afvises; slet afvises når ikke tom; slet mange giver deleted/kept; fortryd af sletning og af
    hyldelager; konflikt når hylden er slettet; omlægningen (sammenlægning, note med 49/50/serienumre, kører én gang);
    importens hyldelager og advarsel.
  - E2E (`scripts/verify-locations.cjs`): manageren opretter reol E9 med 3 hylder; Anna lægger 40 stk. på `E9 H2` og så
    10 til → 50; Anna tager 5 stk.; "Hvor henter jeg?" viser hylden; manageren sletter en tom hylde, sletning af hylden
    med indhold afvises med begrundelse; manageren vælger flere tomme pladser og sletter dem.
  - Fuld kørsel: electron-tests (PowerShell), vitest, tsc, begge E2E.

## Uden for denne spec

- Maks. antal på en hylde, alder/FIFO, 49/50-nummer og serienumre på hylder.
- Reolen som sin egen enhed (ud over gruppen af hylder).
- Et grafisk kort over lageret (næste brainstorm).
