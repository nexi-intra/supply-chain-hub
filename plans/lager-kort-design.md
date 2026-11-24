# Kort over lageret (Placeringer, fase 2) – design

Status: brainstorm 05.11.2026 (Hub 1.6.6); læst af en uafhængig bygherre-tjek 05.11.2026 (to fund – "ældste palle" og
pluk-pladser – afgjort nedenfor). Bygger på `plans/lager-tegning-design.md` (godkendt 02.11.2026), afsnit
"Kortet for alle" og "Faser" punkt 2. Fase 1 (tegning, afstemning, udgivelse) er færdig i 1.6.5.
Markeringen **(mit valg)** betyder: besluttet af AI'en, ikke aftalt med brugeren – kan rettes.
Skitse: `.superpowers/brainstorm/1603-1793867546/content/kort-layout.html` (variant A valgt).

## Formål og hvorfor

- I dag ser kun Placerings-admins tegningen (i editoren). En medarbejder, der skal finde en plads eller et materiale,
  har kun pladsens navn og skal kende hallen udenad.
- Fase 2 giver **alle i hubben** et kort, hvor man kan se, hvor en plads er, hvad der står på den, og hvor man henter
  et materiale – med den **ældste palle først**, så det passer med "tag ældste først" (FIFO) i Placeringer.

**Succes:**
- Alle kan åbne "Kort over lageret", søge/scanne en plads eller et materiale og se det fremhævet på kortet.
- Klik på en reol viser reolen forfra med **materialenummeret på hver plads**; klik på en plads åbner pladskortet.
- Fra pladskort, reolkort og søgeresultater kan man trykke "Vis på kort" og lande på pladsen.

## Mål, ikke-mål og anti-mål

**Mål**
1. "Kort over lageret" på Placeringers forside (alle i hubben, kun når tegningen er udgivet).
2. Reolen forfra med belægning og materialenummer pr. plads.
3. Søg på kortet efter plads eller materiale; ved materiale peges der på den ældste palle.
4. "Vis på kort" fra pladskort, reolkort og søgeresultater (plads).

**Ikke-mål** (egne runder senere)
- Fase 3: "Vis" ved forslag i "Sæt palle på plads" (kræver egen mockup).
- Hubert-svar med "Vis på kort"-knap. Kortets mål kan dog åbnes udefra (se Navigation), så det er let at tilføje.
- Ændringer i tegningen, i editoren eller i data på M:. Kortet er kun læsning.
- Vejvisning/rute til pladsen, afstand på kortet, forslag ud fra afstand.
- Kort før første udgivelse (ingen ser en kladde).

**Anti-mål** (ville være en fiasko, selv om det teknisk virker)
- Kortet gør Placeringer langsommere i hverdagen (forsiden, opgaverne, Admin må ikke hente mere end i dag).
- Kortet viser et andet indhold end pladskortet (fx et materiale, der ikke står der længere, efter en ændring på en anden PC).
- En medarbejder kan ændre noget fra kortet.

## Begrænsninger (fra projektet)

- React 19 + Vite + Tailwind 4, Electron-backend `electron/warehouse/locations/*.cjs`. **Ingen nye biblioteker.**
- Data læses krypteret fra M: via `repository.read(team)`; ingen nye nøgler.
- Opdatering: Placeringer (`Locations.tsx`) har allerede `version`, der stiger ved ændring på denne PC (`onChanged`) og
  på andre PC'er (poll af `stamp()` hvert 15. sekund). Kortet bruger samme `version`.
- Læsekald registreres i `LOCATION_READS` i `electron/warehouse/register.cjs` og bridges i preload/`src/types/warehouse.ts`
  (`WarehouseBridge.locations`).
- Materialebeskrivelser kommer fra `describe()` i `service.cjs` (SAP-katalog-cache).
- Tekster via `t(da, en)`.
- Tests: `node:test` (backend), vitest (rene TS-hjælpere), E2E `scripts/verify-layout.cjs` mod midlertidige data – aldrig M:.

## Tilgange (overvejet 05.11.2026)

| | Tilgang | Fordel | Ulempe |
|---|---|---|---|
| **1 (valgt af brugeren)** | Nyt læsekald "kortets indhold": hvad der står på hver plads i hubben i ét kald. Søgning på kortet sker i appen ud fra dette + tegningen. | Hurtigt kort; ingen andre skærme påvirkes; ældste palle kan findes uden flere kald | Et kald mere at vedligeholde |
| 2 | Udvid `list()` med materialer pr. plads | Intet nyt kald | Forside og Admin henter mere data uden at bruge det (strider mod anti-målet) |
| 3 | Hent `locationCard` pr. plads, når en reol åbnes | Intet nyt i backend | Mange kald mod M:, langsom reol; materialesøgning kræver alligevel et nyt kald – fravalgt |

## Afgørelser fra brainstormen (brugerens)

- **Layout A:** kortet øverst i fuld bredde; klik på en reol → reolen forfra vises **under** kortet.
- **Reolen forfra viser materialet** på hver plads (ikke kun en farve).
- **Flere materialer på én plads:** det første materiale + "+N" (fx `R330-0001 +2`).
- **Søgning efter materiale peger på den ældste palle** (FIFO): alle steder markeres, den ældste fremhæves særskilt, og
  reolen forfra åbnes på den.

## Skærmen "Kort over lageret"

`LocationsTarget { kind: 'map'; id?: string }` – `id` er et plads-id (fremhæv den plads) **(mit valg)**.

Øverst (én linje, brydes på smal skærm):
- Søg/scan-felt: plads eller materiale (samme felt som skitsen).
- Etagefilter: Alle / Gulv / Ovenpå (som editoren, `FloorView`).
- Zoom − / + (som editoren).

Kortet: `LayoutCanvas` med `readOnly`, `team` = hubben, fuld bredde. TRR-ting grå og skraverede som i editoren.
- Klik på en ting med pladser (pallereol, gulvrække, hyldereol) vælger den → reolen forfra under kortet.
- Klik på et gulvområde eller en særlig plads (én plads) åbner pladskortet direkte **(mit valg)**.
- Klik på ting uden pladser (kontor, port, tekst …) gør intet.

Reolen forfra (under kortet): overskrift "Reol A · 6 fag · 4 niveauer · 17 af 22 pladser optaget" + `RackFront mode="view"`
+ forklaring af farverne.

## Reolen forfra – hver plads

Hver celle viser **pladsens navn** og under det **indholdet**:
- Tom: "tom".
- Ét materiale: materialenummeret (`R162-0717`).
- Flere materialer: det første + `+N`. "Første" = materialet med pladsens ældste palle; ellers største lagerlinje;
  ellers første faste materiale **(mit valg)**.
- **Pluk-pladser og stationer** har ingen paller (en palle sat på en pluk-plads bliver brugt op), så de viser deres
  **faste materialer** (`fixedMaterials`) – det er det, man henter dér **(mit valg, som materialekortets "pluk-pladser")**.
- Køregang / spærret / pluk uden navn: som i dag ("kør", "—", "pluk"), ingen indhold.

Farve (status), i denne rækkefølge **(mit valg ud fra designets liste)**:
1. Slot på en ting, der ejes af et andet team → `other-team` (grå).
2. Slot uden plads i listen (pluk uden navn, køregang, spærret, eller navn ikke i listen) → `none`.
3. Plads deaktiveret → `none` **(mit valg)**.
4. Formål `reserved` → `reserved` (lilla).
5. Formål `pick` → `pick` (orange), uanset om den er tom.
6. Paller eller lagerlinjer på pladsen → `used` (blå).
7. Ellers → `empty` (grøn).

Mouse-over (og `title`/`aria-label`): pladsens navn, alle materialer med beskrivelse og antal ("1 palle", "40 stk på
hylden"), og "Klik → pladskortet" **(mit valg)**.

Klik på en plads → `LocationCard` (`{ kind: 'location', id }`). Slots uden plads kan ikke klikkes.

Cellerne bliver bredere end i editoren (plads til to linjer); reolen kan rulles vandret som i dag. Editorens udseende
(`mode="edit"`) ændres ikke.

## Søgning på kortet

Sker i appen, uden kald, ud fra tegningen + kortets indhold. Mindst 2 tegn **(mit valg)**.
- **Plads:** pladsnavne (normaliseret som `locationKeyOf`), der starter med teksten. Præcist match foretrækkes.
- **Materiale:** materialenummer, der starter med teksten, eller beskrivelse, der indeholder den – på paller,
  lagerlinjer og pluk-pladsers/stationers faste materialer.
- Resultat på kortet: alle ting med et træf får gul ramme (`highlight`); ting uden træf dæmpes ikke **(mit valg)**.
- Under søgefeltet en kort linje med træffene, fx "R162-0717 · Universal RJ45 kabel: **A1.3 (ældste, 14.09)**, C4.2, S4".
  Klik på et træf → reolen forfra med pladsen fremhævet.
- **Ældste palle:** ved et materialetræf vælges automatisk pladsen med materialets ældste palle efter **præcis samme
  regel som "Tag"** (`rules.fifo` i `rules.cjs`: kun paller på aktive pladser med formål `reserve`, laveste
  `receivedAt`, derefter `createdAt`). Den får "Ældste" i linjen og gul ramme i reolen forfra. Har materialet ingen
  reservepalle, vælges dets pluk-plads; ellers den største lagerlinje **(mit valg – så kortet aldrig peger på en
  reserveret eller deaktiveret plads og aldrig er uenig med "Tag")**.
- Rammer teksten flere materialer (fx "R162"), vises op til 8 træf i linjen; man vælger selv **(mit valg)**.
- Ingen træf: "Ingen plads eller materiale på kortet matcher".
- Plads/materiale, der findes i Placeringer men ikke på tegningen (pladser "uden for tegningen"): vises i linjen som
  "ikke på kortet" med link til pladskortet **(mit valg)**.

## "Vis på kort"

Knap på:
- `LocationCard` – kun hvis pladsen er på den udgivne tegning (`drawing.linked`).
- `RackCard` – kun hvis mindst én af reolens hylder er på tegningen; fremhæver reolen (første hylde).
- `SearchResults` (plads-træf) – samme regel som pladskortet.

Åbner `{ kind: 'map', id }`: kortet vælger tingen med pladsen, viser reolen forfra og fremhæver pladsen.
Knappen vises ikke, når hubben ikke har en udgivet tegning.

## Navigation

- Forsiden: nyt felt "Kort over lageret" (ikon `MapTrifold`) blandt opgaverne, vist når `drawing` findes – for alle.
  Admins' eksisterende knap "Tegning af lageret" bliver (det er editoren).
- `targetFromItem` kender `map` og `map:<plads-id>`, så Hubert og andre links kan åbne kortet senere.
- Escape går tilbage til forsiden som de øvrige mål.

## Data: nyt læsekald `mapContents`

`locations.mapContents(): Promise<MapContents>` – registreres i `LOCATION_READS` som `'map-contents': 'mapContents'`.

```ts
interface MapPlaceContent {
  /**
   * Paller, lagerlinjer og faste materialer slået sammen pr. materiale. Første = den med ældste palle, ellers største
   * antal, ellers første faste. `fixed`: materialet er fast på pladsen (pluk-plads/station) – også når der intet står.
   */
  materials: { material: string; description: string; pallets: number; quantity: number | null; oldestAt: number | null; fixed: boolean }[]
}
interface MapContents {
  /** Pr. plads-id; pladser med paller, lagerlinjer eller faste materialer på en pluk-plads/station. */
  places: Record<string, MapPlaceContent>
  /** Pr. materiale: plads-id'et for den ældste palle efter `rules.fifo` (samme som "Tag"); kun materialer med en. */
  oldest: Record<string, string>
}
```

- Læser `repository.read(team)` én gang; `describe()` for alle materialer i ét hug.
- Faste materialer tages kun med for pladser med formål `pick` eller `station` (på en reserveplads betyder "fast" kun,
  hvor materialet hører til, og vises ikke som indhold) **(mit valg)**.
- Kræver kun hub-adgang (som `list()`), ikke admin.
- Ingen M:-skrivning, ingen historik.
- Kortet henter: `layout()` når `drawing.version` ændres (cache i komponenten), `list()` og `mapContents()` når
  Placeringers `version` ændres.

## Fejl og tomme tilstande

- Ingen udgivet tegning: feltet vises ikke; åbnes `map` alligevel (link), vises "Tegningen er ikke udgivet endnu".
- M: svarer ikke: samme fejltekst som resten af Placeringer (`errorMessage`), kortet vises ikke halvt.
- En plads på tegningen, der ikke findes i listen: `none` (kan ske et øjeblik mellem udgivelse og genlæsning).

## Test

- Backend `node:test`: `mapContents` – sammenlægning pr. materiale, `oldest` = samme palle som `rules.fifo`
  (reserveret/deaktiveret plads tæller ikke), faste materialer på pluk-plads/station, hylde-linjer, tomme pladser
  udeladt, andet team ser kun sit.
- Rene TS-hjælpere (vitest) i `src/lib/warehouse/layout/map.ts` **(mit valg)**: status pr. slot, celletekst
  ("+N"), søgning (plads/materiale/ældste), "Vis på kort"-regler.
- E2E: udvid `scripts/verify-layout.cjs` efter udgivelsen: åbn kortet som almindelig bruger, søg materiale → ældste
  fremhævet, klik reol → materialenummer i cellen, klik plads → pladskortet, "Vis på kort" fra pladskortet.
- Changelog 1.6.6 + `plans/development-1.6.6.md`.

## Overladt til bygherren

- Komponent- og filopdeling (fx `src/views/warehouse/locations/map/LocationsMap.tsx`), præcise farver og celle-størrelser
  (følg skitsen og `STATUS_FILL`), hvordan `RackFront` får indholdet ind (ny prop) uden at ændre editoren.
- Om reolen forfra ruller i syne, når den åbnes.
