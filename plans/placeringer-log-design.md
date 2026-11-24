# Placeringer – log, fortryd og rollen Placerings admin

Status: design godkendt i brainstorm 21.10.2026 (afsnit 1–4). Bygger på `plans/placeringer-design.md` og den færdige
Placeringer-kerne (Lagerstyring > Placeringer, TCD og TRR).

## Formål

Alle i teamet skal kunne se, hvad der er sket i Placeringer (hvem satte på plads, tog, flyttede, rettede – hvornår), og
en manager eller en **Placerings admin** skal kunne **fortryde én handling ad gangen**, hvis noget går galt. Rollen
Placerings admin gives i **Manager Panel**, ligesom Optællings roller og Guide Admins.

## Beslutninger (fra brainstorm)

- Fortryd én handling ad gangen (ikke "rul tilbage til et tidspunkt"). En fortrydelse kommer selv i loggen.
- Fortryd laver den **modsatte handling ud fra et før-billede** gemt i hændelsen – kun hvis det, hændelsen rørte,
  stadig ser ud som efter handlingen. Andres senere arbejde rulles aldrig tilbage.
- **Alle** i teamet ser loggen; **kun managere og Placerings admins** fortryder.
- **Placerings admin er sin egen rolle**: vedligehold af placeringer (opret, ret, serier, (de)aktivér, mærkater,
  import) og fortryd. Optællings admin og status manager giver **ikke** længere rettigheder i Placeringer.
- Rollen gives **kun i Manager Panel**: kortet "Optællingsroller" omdøbes til **"Lagerstyringsroller"** med to valg
  pr. person: *Optælling* (Bruger/Admin/Status manager) og *Placeringer* (Bruger/Placerings admin).
- Antagelser (ikke modsagt): importen kan ikke fortrydes som én handling (brug "Erstat alt" før go-live); en
  fortrydelse kan ikke selv fortrydes; loggen viser de seneste 3 måneder.

## 1. Rollen Placerings admin

- Gemmes i Lagerstyrings roller pr. team (nøglen `roller` i `<team>\lagerstyring`) som ny liste
  `locationAdmins: { [email]: { name, by, at } }` – uafhængig af Optællings `admins`/`statusManagers`.
- `roles.isLocationAdmin(user)` / `roles.list` returnerer pr. bruger både Optællings rolle og `locationRole`
  ('user' | 'location-admin'); managere vises som "Automatisk via manager-rollen".
- `roles.setLocationAdmin(user, { email, admin })`: kun en (Hub-)manager; samme validering som `setRole` (bruger i
  teamet, ikke manager). Rolle-loggen får `location-admin-added` / `location-admin-removed`.
- Placeringers `requireAdmin` = manager/creator **eller** Placerings admin. `list()`s `canAdmin` følger det.
- Uden rollen vises "Administrér placeringer" og "Fortryd" ikke; backend afviser med `LOCATIONS_MANAGER_ONLY`.
- Manager Panel → Rettigheder: kortet "Lagerstyringsroller" (kun i TCD- og TRR-hubben) på 4 sprog; Hubert-guiden
  "Udnævn admin eller status manager" udvides med Placerings admin (4 sprog).

## 2. Loggen

- Lille knap **"Log"** på Placeringers forside ved "Administrér placeringer"; åbner for alle i teamet.
- Viser de seneste 3 måneder, nyeste først: tidspunkt · person · handling i klart sprog · materiale med beskrivelse.
  Hver linje åbner palle-, placerings- eller materialekortet.
- Fortrudte handlinger vises overstreget med "Fortrudt af X kl. HH:MM"; fortrydelsen er sin egen linje.
- Filtre: søg (materiale, placering, 49/50-nummer), person, type (sat på plads, taget, flyttet, fyldt op, storage
  location, rettet palle, placering ændret, import, fortrudt) og periode (i dag, 7 dage, 30 dage, 3 måneder).
- Knappen **"Fortryd"** (kun managere/Placerings admins) med bekræftelse, der siger hvad der sker ("Pallen får 10 stk.
  igen"). Kan den ikke fortrydes, er knappen grå med årsagen.
- Hubert (kun læsning): "hvad er der sket med A1.1 i dag?", "hvem flyttede pallen fra C1.3?" → svar fra loggen med en
  knap til loggen (`tab: 'locations'`, `itemId: 'log'` eller `log:<placering>`).

## 3. Hvad kan fortrydes

Hver ny hændelse gemmer `before` og `after`: kopier af de paller og placeringer, den ændrede
(`{ pallets: { [id]: Pallet | null }, locations: { [id]: Location | null } }` – `null` = fandtes ikke).

| Handling (type) | Fortryd | Spærres (UNDO_CONFLICT) hvis |
|---|---|---|
| Sat på plads (`putaway`) | Fjerner pallerne fra samme indtastning (samme action) | En af dem er ændret, taget eller flyttet siden |
| Taget (`take`) | Pallen tilbage med det gamle antal på sin plads | Pallen findes igen / er ændret siden |
| Fyldt op (`refill`) | Som `take` for reservepallen | Som ovenfor |
| Flyttet (`move`) | Pallen tilbage; brugt op på pluk-plads → genskabes | Pallen er ændret igen |
| Storage location (`sloc`) | Gammel storage location | Ændret igen |
| Rettet palle (`edit-pallet`) | Gamle værdier | Pallen er ændret igen |
| Placering oprettet / serie (`location`) | Placeringen(e) slettes | Der står paller på dem, eller de er ændret |
| Placering rettet / (de)aktiveret (`location`) | Gamle værdier og formål; paller brugt op som pluk-palle genskabes | Placeringen er ændret igen |
| Import (`import`) | Kan ikke fortrydes (`UNDO_NOT_POSSIBLE`) | – |

- "Ser ud som efter handlingen" = de berørte poster er lig `after` (sammenlignet på indhold).
- En fuld plads spærrer ikke: pallen kommer tilbage, pladsen står som fuld.
- Hændelser fra før denne ændring har ingen `before`/`after` → vises, men kan ikke fortrydes (`UNDO_NOT_POSSIBLE`).
- En hændelse kan fortrydes én gang (`UNDO_ALREADY`); en `undo`-hændelse kan ikke fortrydes.
- Fejlteksten i `UNDO_CONFLICT` nævner den senere hændelse, der rørte det samme ("Bo tog 5 stk. kl. 10:02 – fortryd
  den først").

## 4. Opbygning, fejl og test

- **Data:** hændelser i `history-YYYY-MM` får `before`, `after`, og ved fortrydelse `undoneBy`/`undoneAt` (den
  oprindelige hændelse markeres i samme transaktion – dens månedsfil låses og skrives med, også når den er fra en
  tidligere måned). Hver hændelse gemmer også handlingens `actionId`, så "samme indtastning" kan findes. Fortrydelsen er en ny hændelse `{ type: 'undo', undoes: id }`.
  Ingen nye filer på M:.
- **Backend:**
  - `electron/warehouse/locations/undo.cjs` (rent): `canUndo(event, state)` og `undoPlan(event, state)` →
    ændringer at skrive eller en konflikt med årsag.
  - `repository`: hændelser kan markeres fortrudt i transaktionen; `history` kan læse over flere måneder med filtre.
  - `service`: alle skrivende handlinger gemmer `before`/`after`; nye `log(user, { query, person, type, days })` og
    `undo(user, { eventId, actionId })` (admin, går gennem køen med action-id → aldrig to gange).
  - `roles.cjs`: `locationAdmins`, `setLocationAdmin`; Placeringers `roleOf`-brug ændres til manager/Placerings admin.
- **IPC:** `warehouse:locations:log`, `warehouse:locations:undo`, `warehouse:roles:set-location-admin`.
- **Skærme:** `src/views/warehouse/locations/LocationsLog.tsx` (log + fortryd-dialog); `WarehouseRolesCard.tsx` →
  "Lagerstyringsroller" med kolonnen Placeringer.
- **Fejlkoder** (da/en i `errors.ts`): `UNDO_CONFLICT`, `UNDO_NOT_POSSIBLE`, `UNDO_ALREADY`, `UNDO_NOT_FOUND`.
- **Test:**
  - Hver handlingstype fortrydes og gendanner præcis før-billedet; fortrydelsen står i loggen, originalen er markeret.
  - Konflikt når en senere handling har rørt det samme (og teksten nævner den).
  - To fortryder samtidig → kun én lykkes (`UNDO_ALREADY`).
  - Gamle hændelser og import → `UNDO_NOT_POSSIBLE`.
  - Roller: Optællings admin/status manager er ikke admin i Placeringer; Placerings admin og manager er; kun
    managere kan give rollen; rolle-loggen.
  - Hubert-svar om loggen (4 sprog), og at Hubert aldrig fortryder.
  - E2E (`scripts/verify-locations.cjs`): manager gør en bruger til Placerings admin i Manager Panel; brugeren tager en
    palle; Placerings admin fortryder i loggen → pallen er tilbage; loggen viser begge linjer; en almindelig bruger
    ser ingen Fortryd-knap.

## Uden for denne spec

- Rul tilbage til et tidspunkt; fortryd af import; at fortryde en fortrydelse.
- Selv-fortryd for almindelige brugere lige efter en handling.
