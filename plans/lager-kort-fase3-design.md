# Kortet i "Sæt palle på plads" (Placeringer, fase 3) – design

Status: brainstorm 05.11.2026 (Hub 1.6.6). Bygger på `plans/lager-tegning-design.md` ("Kortet for alle", "Faser" punkt 3)
og fase 2 (`plans/lager-kort-design.md`, færdig 05.11.2026).
Markeringen **(mit valg)** betyder: besluttet af AI'en, ikke aftalt med brugeren – kan rettes.
Skitse: `.superpowers/brainstorm/124-1793877076/content/saet-paa-plads.html` (variant B valgt).

## Formål og hvorfor

- "Sæt palle på plads" er Placeringers hyppigste opgave. I dag får medarbejderen kun et pladsnavn (fx `C16.3`) og
  skal selv vide, hvor reolen står, og hvilket niveau det er.
- Medarbejderen står **ved en arbejdsstation (PC)**, når pallen registreres, og kører derefter ud med den. Skærmen er det
  sidste, de ser, før de kører – derfor skal den vise **hvor i hallen** og **hvor i reolen** pladsen er.

**Succes:** Når en plads er valgt i "Sæt palle på plads", kan medarbejderen uden at klikke se reolens placering i hallen,
niveauet i klar tekst og naboerne – og kan kigge på et andet forslag med ét klik uden at vælge det.

## Mål, ikke-mål og anti-mål

**Mål**
1. Under feltet "Plads" vises af sig selv en lille visning af den valgte plads, så snart pladsen er valgt eller skrevet.
2. Hvert forslag får "Vis", der viser forslaget i samme visning uden at vælge det.
3. Visningen = overskrift med plads, reol og niveau i klar tekst + lille kort over hallen med tingen fremhævet + reolen
   forfra skåret ned til pladsen og ét fag på hver side + link "Vis på kort".

**Ikke-mål**
- "Du står her" / arbejdsstationens placering på kortet (brugeren: "det behøves ikke").
- Forslag ud fra afstand; ny rækkefølge af forslag; ændringer i hvordan forslag laves (`rules.suggestSlots`).
- Visningen i andre opgaver (Flyt, Tag, Fyld op, Læg på hylde) – kan komme senere med samme komponent.
- Ændringer i backend eller data på M:.

**Anti-mål**
- "Sæt palle på plads" bliver langsommere at åbne eller bruge (fx ventetid ved hvert "Vis").
- Visningen viser en anden plads, end der faktisk gemmes.
- Formularen virker ikke, når tegningen ikke er udgivet eller M: driller.

## Begrænsninger (fra projektet)

- React 19 + Tailwind 4; ingen nye biblioteker. Tekster via `t(da, en)`.
- `PutAway.tsx` (`src/views/warehouse/locations/PutAway.tsx`) har en eller flere paller (`Draft`), hver med `location`
  (fri tekst, store bogstaver) og `slots: SlotSuggestion[]` (op til 8; `reason` fast/nær/ledig).
- Fase 2 giver: `LayoutCanvas` (readOnly, `highlight`), `RackFront mode="view"` (`status`, `content`, `highlight`),
  `src/lib/warehouse/layout/map.ts` (`contextOf`, `findSlot`, `placeOfSlot`, `slotStatus`, `cellText`, `contentTitle`),
  bridge-kald `layout()`, `list()`, `mapContents()`, og målet `{ kind: 'map', id }`.
- `Locations.tsx` har allerede `drawing` (fra `overview()`) for alle.
- Tests: vitest (rene hjælpere, node-miljø), E2E `scripts/verify-layout.cjs` mod midlertidige data – aldrig M:.

## Tilgange (overvejet 05.11.2026)

| | Tilgang | Fordel | Ulempe |
|---|---|---|---|
| **1 (valgt af brugeren)** | Ny lille komponent "pladsens visning" (mini-kort + udsnit af reolen forfra), data hentet én gang i "Sæt palle på plads" med eksisterende kald | Ingen ventetid ved "Vis"; samme farver/regler som kortet; ingen backend | `RackFront` skal kunne vise et udsnit |
| 2 | Indlejre hele kort-skærmen fra fase 2 | Næsten intet nyt | Bygget til hel skærm (søg, filtre, zoom) – alt for stor i en formular med flere paller |
| 3 | Nyt backend-kald, der giver et færdigt udsnit pr. plads | – | Ventetid mod M: ved hvert "Vis"; giver intet ud over 1 |

## Afgørelser fra brainstormen (brugerens)

- Medarbejderen står ved en arbejdsstation (PC), før de kører ud.
- Visningen kommer **af sig selv** for den valgte plads; forslagene har **"Vis"**.
- **Variant B:** reolen forfra **og** et lille kort over hallen med reolen fremhævet.
- **Ingen "du står her".**

## Visningen ("pladsens visning")

Vises under rækken med "Plads"-feltet og forslagene i hver palles kort.

**Hvilken plads:** den viste plads er den, man sidst trykkede "Vis" på; ellers den valgte (`draft.location`). Når
`draft.location` ændres (skrevet, valgt forslag), viser den igen den valgte **(mit valg)**. "Vis" på forslaget, der
allerede er valgt, gør ingenting ekstra. Det viste forslags "Vis" er markeret (`aria-pressed`).

**Overskrift:** `<plads> · <ting> · <niveau-tekst>` og, når den viste plads ikke er den valgte, en tydelig tekst
"Forslag – ikke valgt" / "Suggestion – not chosen" og en knap "Vælg" **(mit valg – så man ikke tror, det er den
valgte)**.

**Niveau-tekst (mit valg):**
- Pallereol (slot med `level`): `level === 1` → "gulvniveau"; ellers "`level`. niveau fra gulvet".
- Hylde i udtræk (slot med `unit`) og hyldereol (slot med `section`): "hylde `shelf` fra oven".
- Gulvrække (`floorrow`): "gulvplads (plads til `capacity` paller)" (1 → "1 palle").
- Gulvområde (`floor`): "gulvområde". Særlig plads (`special`): ingen niveau-tekst.
- Tingens navn: "Reol C" for pallereol, ellers tingens navn ("S", "H-reol 1" …).

**Mini-kort:** `LayoutCanvas` readOnly med hele hallen, `floorView` = tingens etage (gulv/ovenpå, så en ting ovenpå
ikke er skjult), `highlight=[itemId]`, fast bredde ca. 240 px **(mit valg)**, ingen klik.

**Reolen forfra (udsnit):** `RackFront mode="view"` med `status`/`content` som på kortet (samme `map.ts`-regler), den
viste plads `highlight`, og kun **pladsens fag ± 1** (pallereol: fag; udtræk: udtræk; hyldereol: sektion; gulvrække:
position) **(mit valg ud fra skitsen)**. Klik på en plads i udsnittet gør ingenting **(mit valg – formularen skal ikke
forlades midt i en registrering)**.

**Link "Vis på kort":** åbner `{ kind: 'map', id }`. Teksten i formularen går tabt, så linket åbner ikke direkte, hvis
der er indtastet noget: det spørger først "Forlad uden at gemme?" **(mit valg)**.

**Tomme tilstande:**
- Ingen udgivet tegning: ingen visning, ingen "Vis"-knapper; formularen som i dag.
- Pladsen findes ikke på tegningen (eller er stavet forkert): lille tekst "Pladsen er ikke på kortet" /
  "The place is not on the map".
- Tomt plads-felt: ingen visning.
- Data kunne ikke hentes: ingen visning og ingen fejl-toast ud over én stille linje "Kortet kunne ikke hentes"
  **(mit valg – formularen skal kunne bruges uden kortet)**.

## Data

- `PutAway` får `drawing` fra `Locations.tsx` (som de andre skærme) og henter, når `drawing` findes, **én gang** (og igen
  når Placeringers `version` eller `drawing.version` ændres): `layout()`, `list()`, `mapContents()`.
- `contextOf(list, contents, team)` og `findSlot(layout, placeId, ctx)` finder ting og slot.
- Visningen er kun læsning.

## Test

- Rene hjælpere (vitest) **(mit valg)** i `src/lib/warehouse/layout/peek.ts`: `levelText(item, slot)` for alle typer
  ovenfor; `neighbourWindow(item, slot)` (hvilke fag/udtræk/sektioner/positioner der vises, ved kanterne kun én nabo).
- E2E: udvid `scripts/verify-layout.cjs` (som almindelig medarbejder): "Sæt palle på plads" → skriv materiale →
  forslag vises; skriv en plads på tegningen → visningen dukker op med niveau-tekst, mini-kort og fremhævet celle;
  "Vis" på et andet forslag → overskriften skifter og viser "Forslag – ikke valgt"; "Vælg" sætter pladsen; skriv en
  plads uden for tegningen → "Pladsen er ikke på kortet"; ingen fejl, når der gemmes.
- Changelog 1.6.6 (tilføj til den eksisterende 1.6.6-post) + `plans/development-1.6.6.md`.

## Overladt til bygherren

- Komponent- og filnavne (fx `src/views/warehouse/locations/map/PlacePeek.tsx`), hvordan `RackFront` får et udsnit
  (fx en prop med de positioner, der vises), præcise størrelser og farver (følg skitsen og fase 2).
