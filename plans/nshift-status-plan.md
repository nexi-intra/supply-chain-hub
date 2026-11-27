# Status fra nShift i Finlandsforsendelser: implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opfølgning henter kollienes forløb fra nShift og foreslår Received, SLA, Terminal og Comment efter de godkendte regler, og Expected følger aftalens tabel over leveringstider.

**Architecture:** To rene moduler i `electron/warehouse/finland/core/` (leveringstider og nShift-regler), en nShift-klient i backend, fælles svar og nøgle i den fælles mappe via `shared.cjs`, nye service-metoder og kanaler via `handleTool(['finland'])`, og skærmændringer i Opfølgning og Administration.

**Tech Stack:** Electron (CommonJS i `electron/`), Node `fetch`, React + TypeScript, `node --test`, Vitest.

**Spec:** `plans/nshift-status-design.md` (bygger på `plans/finlandsforsendelser-design.md`).

## Global Constraints

- Intet fra nShift skrives i arket uden godkendelse: forslag bliver til ikke gemte ændringer først ved Enter/Næste eller "Ja, brug forslagene", og arket skrives kun ved "Gem i arket".
- Forslag overskriver aldrig et felt, der er udfyldt i arket eller ændret af personen.
- nShift-hemmeligheden må aldrig nå vinduet, loggen, git, testdata eller en fejltekst. Vinduet får kun `{ configured: boolean, clientIdEnding: string }` (de sidste 4 tegn af klient-id).
- Modtagerens navn og adresse fra nShift bruges og gemmes ikke. Et forløbs hændelse har kun `{ at, statusId, status, text, place }`, hvor `place` er stedets navn, by og land fra hændelsen.
- Token: `POST https://account.nshiftportal.com/idp/connect/token`, `application/x-www-form-urlencoded`, `grant_type=client_credentials&client_id=…&client_secret=…`. Svar `{ access_token, expires_in }` (3600).
- Opslag: `POST https://api.nshiftportal.com/track/shipmentdata/Operational/Shipments/Aggregated/ByBarcode`, header `Authorization: Bearer <token>`, body `{ query: <T&T>, startDate, endDate, pageSize: 5, pageIndex: 0, installationTags: [], actorTags: [], carrierTags: [] }`. Vindue: afhentningsdag minus 3 dage til plus 27 dage (højst 31 dage, ellers 400).
- Svarets hændelser: `shipment.events[]` (nShift og DHL) og `shipment.lines[].packages[].events[]` (PostNord); for PostNord bruges kun den pakke, hvis `number` er det opslåede T&T. Hver hændelse: `date`, `normalizedStatusId`, `normalizedStatusName`, `configurationName`, `addresses[]` (`name1`, `city`, `countryCode`). Hændelser med `normalizedStatusId < 2000` er nShifts egne og ignoreres.
- Første forsøg: statusId 3000, 2002, 5006, 6000 eller 6003. Afleveret: 3000 eller 2002. Dage for hændelser regnes i tidszonen `Europe/Helsinki`.
- Kommentarer og tekster præcis: `Forgotten in warehouse`, `stuck in Køge`, `1 ekstra day in Køge`, `Delay Finland, Vanta term`, `Delay Finland, Turku term`, `1st attempt within SLA (dd-mm)`, adskilt med `, ` i den rækkefølge.
- Kun én kald til nShift ad gangen pr. hub, med mindst 250 ms mellem opslag.
- Kode i `electron/`: CommonJS, ingen semikolon, 2 mellemrum, engelske kommentarer, fejl `KODE: dansk tekst`. Vinduet: `t(dansk, engelsk)`. Dansk tekst uden tankestreger som bindeled.
- Afprøvning mod nShift kun med læsning; mod arket kun på en kopi. `npm.cmd` på Windows.

## Review Focus

- Et kolli, som nShift ikke kender (fx bestilt uden om nShift): ingen forslag, en rolig tekst "Ikke fundet i nShift", resten af dagen hentes videre. Test i Task 3 (`a parcel nShift does not know gives null`) og Task 5 (`one failed parcel does not stop the day`).
- Forkert eller udløbet nøgle: en dansk fejl om nøglen, og hemmeligheden står ingen steder i fejlen. Test i Task 3 (`a refused secret never appears in the error`).
- Et kolli uden afleveringshændelse endnu: Received forblives tomt, SLA foreslås ikke, men forløbet vises. Test i Task 2 (`no delivery gives no Received and no SLA`).
- En hændelse sent om aftenen i Finland (efter 22.00 dansk tid): dagen regnes i finsk tid. Test i Task 2 (`days are counted in Helsinki time`).
- Bulk-godkendelse på en dag, hvor nogle kolli allerede er udfyldt: kun tomme felter udfyldes. Test i Task 5 (`apply suggestions never overwrites a filled field`).

---

## Fase 1: Regler

### Task 1: Leveringstider

**Files:**
- Create: `electron/warehouse/finland/core/leadTimes.cjs`
- Modify: `electron/warehouse/finland/core/followUp.cjs` (`expectedSuggestion` bruger tabellen)
- Test: `electron/warehouse/finland/core/leadTimes.test.cjs`, og opdatér `followUp.test.cjs`

**Interfaces:**
- Produces: `LEAD_TIMES: Array<{ from: number, to: number, Postnord: number, DHL: number }>` (tabellen fra designets afsnit "Leveringstider", alle rækker inkl. *forslag*), `leadDays(courier: string, postalCode: string|number): number|null` (smalleste række vinder; postnummer fyldes op til 5 cifre; ukendt kurer eller postnummer giver `null`).
- `expectedSuggestion({ courier, postalCode, country, pickedUp })` beholder signaturen: ikke-FI eller `null` fra `leadDays` giver `null`, ellers `addWorkdays(pickedUp, leadDays(...))`.

- [ ] **Step 1: Skriv de fejlende tests:** `leadDays('Postnord','00100')` 2, `leadDays('DHL','100')` 1 (mistet nul), `leadDays('Postnord','22100')` 3 og `leadDays('DHL','22100')` 2 (Åland vinder over 20000 til 25999), `leadDays('Postnord','96100')` 4, `leadDays('DHL','96100')` 3, `leadDays('Postnord','93600')` 3, `leadDays('DHL','05800')` 1, `leadDays('Postnord','59100')` 2, `leadDays('DSV','00100')` null, `leadDays('Postnord','abc')` null. Ret de eksisterende `expectedSuggestion`-tests i `followUp.test.cjs` til tabellen (fx PostNord 96100 fra en mandag giver fredag samme uge).
- [ ] **Step 2: Kør:** `node --test electron/warehouse/finland/core/leadTimes.test.cjs electron/warehouse/finland/core/followUp.test.cjs`. Forventet: FAIL.
- [ ] **Step 3: Implementér.**
- [ ] **Step 4: Kør igen plus `npm.cmd run test:warehouse`.** Forventet: PASS (ret service-tests, hvis de afhang af den gamle regel).
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): Expected efter aftalens tabel over leveringstider`

### Task 2: nShift-regler

**Files:**
- Create: `electron/warehouse/finland/core/nshiftRules.cjs`
- Test: `electron/warehouse/finland/core/nshiftRules.test.cjs` med anonymiserede forløb (kun tider, statusId, tekster og stednavne som `KØGE PAKKETERMINAL Køge DNK`, `VANTAA Vantaa FIN`, `BRØNDBY TERMINAL Brøndby DNK`)

**Interfaces:**
- Produces:
  - `timelineFrom(shipment: object, tracking: string): Timeline | null` hvor `shipment` er ét element fra opslagets svar (`{ shipment, additionalInformation }`) og `Timeline = { tracking, carrier: string, events: Array<{ at: string, statusId: number, status: string, text: string, place: string }> }` sorteret efter tid; kun statusId ≥ 2000; PostNord kun pakken med det nummer.
  - `facts(timeline, pickedUp): { firstAttempt: string|null, delivered: string|null, terminal: 'Vantaa'|'Turku'|null, koegeHours: number|null, viaBrondby: boolean, terminalHours: number|null, firstScanWorkdays: number|null }` (datoer som `ÅÅÅÅ-MM-DD` i Helsinki-tid; definitioner som designets afsnit "Regler").
  - `suggest({ timeline, courier: 'Postnord'|'DHL', pickedUp, expected }): { received: string|null, sla: 'OK'|'NOK'|null, terminal: string|null, comment: string|null, firstAttempt, delivered }` efter designets tabel; Køge-, Brøndby-, terminal- og første-scanning-regler kun for `Postnord`; `1st attempt within SLA (dd-mm)` for begge; `Forgotten in warehouse` giver `sla: 'OK'`; `expected` tom giver ingen SLA og ingen forsøgs-kommentar.

- [ ] **Step 1: Skriv de fejlende tests** (ét forløb pr. regel): `delivered on time gives Received, SLA OK and the terminal`, `first attempt within Expected but delivered later gives SLA OK and the attempt comment` (kommentar `1st attempt within SLA (25-11)`), `late delivery without an attempt gives NOK`, `no delivery gives no Received and no SLA`, `48 hours or more in a Finnish terminal gives the delay comment` (49 t i Vantaa → `Delay Finland, Vanta term`), `45 to 66 hours in Køge gives one extra day`, `more than 66 hours in Køge or via Brøndby gives stuck`, `a first scan two workdays late gives Forgotten in warehouse and SLA OK`, `several comments are joined in the fixed order`, `Køge rules do not apply to DHL`, `days are counted in Helsinki time` (hændelse `2026-11-25T22:30:00+00:00` er den 26.), `PostNord uses only the package with the looked-up number`, `nShift's own events below 2000 are ignored`.
- [ ] **Step 2: Kør** `node --test electron/warehouse/finland/core/nshiftRules.test.cjs`. Forventet: FAIL.
- [ ] **Step 3: Implementér.** Arbejdsdage som `followUp.cjs`' `addWorkdays` (lørdag og søndag springes over).
- [ ] **Step 4: Kør igen.** Forventet: PASS.
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): regler for forslag ud fra nShifts forloeb`

## Fase 2: Backend

### Task 3: nShift-klient

**Files:**
- Create: `electron/warehouse/finland/nshift.cjs`
- Test: `electron/warehouse/finland/nshift.test.cjs` (falsk `fetch`, intet rigtigt netværk)

**Interfaces:**
- Consumes: `timelineFrom` (Task 2).
- Produces: `createNshiftClient({ credentials: () => Promise<{ clientId, clientSecret } | null>, fetch = globalThis.fetch, now = Date.now, pauseMs = 250 })` → `{ lookup(tracking: string, pickedUp: string): Promise<Timeline|null>, test(): Promise<true> }`.
  - Token genbruges til 60 s før udløb; en 401 på opslag henter nyt token én gang.
  - Kald køres ét ad gangen med `pauseMs` imellem.
  - Fejlkoder: `FINLAND_NSHIFT_NOT_SET: nShift er ikke sat op. En manager kan sætte det op under Administration.`, `FINLAND_NSHIFT_REFUSED: nShift afviste nøglen. Tjek klient-id og hemmelighed under Administration.`, `FINLAND_NSHIFT_FAILED: nShift svarer ikke lige nu. Prøv igen om lidt.`
  - Et tomt svar (`[]`) giver `null`.

- [ ] **Step 1: Skriv de fejlende tests:** `the token is reused until shortly before it expires`, `a 401 fetches a new token once`, `the search window is pickup minus 3 to plus 27 days` (tjek body), `a parcel nShift does not know gives null`, `a refused secret never appears in the error` (fejlteksten og `String(error)` indeholder ikke hemmeligheden), `calls run one at a time with a pause`, `no credentials gives FINLAND_NSHIFT_NOT_SET`.
- [ ] **Step 2: Kør** `node --test electron/warehouse/finland/nshift.test.cjs`. Forventet: FAIL.
- [ ] **Step 3: Implementér.**
- [ ] **Step 4: Kør igen.** Forventet: PASS.
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): nShift-klient med token og koe`

### Task 4: Fælles nøgle og svar

**Files:**
- Modify: `electron/warehouse/finland/shared.cjs`
- Test: `electron/warehouse/finland/shared.test.cjs`

**Interfaces:**
- Produces på `createFinlandShared`:
  - `nshift.credentials(): Promise<{ clientId, clientSecret } | null>` (kun til backend), `nshift.status(): Promise<{ configured: boolean, clientIdEnding: string }>`, `nshift.set(user, { clientId, clientSecret })` (kun manager/creator, ellers `MANAGER_ONLY`; tomme værdier giver `FINLAND_SETTINGS_INVALID`). Nøgle `nshift`.
  - `statuses.get(trackings: string[]): Promise<Record<string, Timeline & { fetchedAt: string }>>`, `statuses.put(timelines: Array<Timeline & { fetchedAt: string }>)` under nøglen `nshift-status` (én fil, `mutateAsync`, højst 4.000 forløb, ældste ryger først).

- [ ] **Step 1: Skriv de fejlende tests:** `only managers set the nShift key`, `the status never returns the secret` (deep-search i resultatet efter hemmeligheden), `timelines are shared between two PCs`, `the oldest timelines are dropped above 4000`.
- [ ] **Step 2: Kør** `node --test electron/warehouse/finland/shared.test.cjs`. Forventet: FAIL.
- [ ] **Step 3: Implementér.**
- [ ] **Step 4: Kør igen.** Forventet: PASS.
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): nShift-noegle og faelles forloeb`

### Task 5: Service

**Files:**
- Modify: `electron/warehouse/finland/service.cjs`
- Test: `electron/warehouse/finland/service.test.cjs`

**Interfaces:**
- Consumes: Task 2, 3, 4.
- Produces:
  - `createFinlandService({ …, nshift })` hvor `nshift` er klienten (Task 3); tests sender en falsk.
  - `fetchStatus(user, { date } | { key })`: slår op for kolli i opfølgningen (PostNord og DHL med T&T) på dagen, eller ét kolli; afleverede forløb i `statuses` springes over ved `{ date }`, men hentes altid ved `{ key }`; gemmer via `statuses.put`; fejl for ét kolli registreres som `failed` og stopper ikke resten. Returnerer snapshot plus `statusResult: { fetched: number, notFound: number, failed: number }`. Kører i servicens `exclusive('nshift')`.
  - Hver række i `followUp.rows` får `nshift: { fetchedAt, events, firstAttempt, delivered, suggestion: { received, sla, terminal, comment } } | null`, hvor `suggest` får `expected = effective.expected || suggestedExpected`.
  - `applySuggestions(user, { date })`: for hvert kolli på dagen med `nshift.delivered` laves en kladde (som `saveDraft`) med de foreslåede felter, kun hvor feltet er tomt i `effective`; returnerer snapshot plus `applied: number`.
  - `nshiftStatus()`, `setNshift(user, values)`, `testNshift(user)` (kun manager/creator) videre til shared og klienten.

- [ ] **Step 1: Skriv de fejlende tests:** `fetching a day stores timelines and gives suggestions on the rows`, `a delivered timeline is not fetched again for the day but is for one parcel`, `one failed parcel does not stop the day`, `apply suggestions never overwrites a filled field`, `apply suggestions makes drafts, never sheet writes` (falsk Excel fik intet skrive-kald), `DSV parcels are not looked up`.
- [ ] **Step 2: Kør** `node --test electron/warehouse/finland/service.test.cjs`. Forventet: FAIL.
- [ ] **Step 3: Implementér.**
- [ ] **Step 4: Kør igen plus `npm.cmd run test:warehouse`.** Forventet: PASS.
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): hent status fra nShift og brug forslagene`

### Task 6: Kanaler, preload og typer

**Files:**
- Modify: `electron/warehouse/finland/register.cjs` (opretter klienten med `credentials: shared.nshift.credentials`), `electron/preload.cjs`, `src/types/finland.ts`, `src/lib/warehouse/errors.ts` (da/en for de tre `FINLAND_NSHIFT_*`)
- Test: `electron/warehouse/finland/register.test.cjs`

**Interfaces:**
- Produces: kanalerne `finland:fetch-status` (`{ date }` eller `{ key }`, valideret som andre dato- og nøgle-input), `finland:apply-suggestions` (`{ date }`), `finland:nshift-settings`, `finland:set-nshift-settings` (`{ clientId, clientSecret }`, strenge ≤ 200 tegn), `finland:test-nshift`; preload `fetchStatus`, `applySuggestions`, `nshiftSettings`, `setNshiftSettings`, `testNshift`. Typer: `FinlandTimeline`, `FinlandNshiftRow` (rækkens `nshift`), `FinlandStatusResult`, `FinlandNshiftStatus`.
- `waitsForSap` i `electron/warehouse/register.cjs` får `finland:(fetch-status|test-nshift)`.

- [ ] **Step 1: Skriv de fejlende tests:** kanalerne findes (opdatér kanal-listen), `TRR is refused the nShift channels`, `only managers set and test the nShift key`, `the nShift settings never carry the secret`, `invalid dates and keys are refused before the service`.
- [ ] **Step 2: Kør** `node --test electron/warehouse/finland/register.test.cjs`. Forventet: FAIL.
- [ ] **Step 3: Implementér.**
- [ ] **Step 4: Kør `npm.cmd run test:warehouse` og `npx.cmd vitest run src/lib/warehouse`** (errorCoverage). Forventet: PASS.
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): kanaler til status fra nShift`

## Fase 3: Skærmene

### Task 7: Opfølgning

**Files:**
- Modify: `src/views/warehouse/finland/FollowUp.tsx`, `FollowUpDetail.tsx`, `followUpLogic.ts`, `SaveConfirm.tsx` (eller ny `SuggestConfirm.tsx`)
- Test: `src/views/warehouse/finland/followUpLogic.test.ts`

**Interfaces:**
- Consumes: rækkens `nshift`, `fetchStatus`, `applySuggestions` (Task 6).
- Produces: `applySuggestions(form, r)` i `followUpLogic.ts` tager også `r.nshift?.suggestion` for Received, Terminal og Comment, kun når feltet er tomt; SLA følger `nshift.suggestion.sla`, når den findes og SLA ikke er sat i hånden, ellers den nuværende regel.

Indhold: knappen `Hent status fra nShift` ved dagen og `Opdater status` på kolliet; tekst `Status hentet kl. hh.mm` og efter en hentning `N kolli hentet. M ikke fundet i nShift. K fejlede.`; forløbet på kolliet som en kort liste (tid, sted, tekst) med `Første forsøg dd-mm` og `Afleveret dd-mm` fremhævet; grå forslag i felterne; knappen `Brug forslagene for alle leverede kolli på dagen` med en liste pr. kolli over felterne, der udfyldes, og knapperne `Ja, brug forslagene` og `Fortryd`. Knapperne er slået fra, når nShift ikke er sat op, med teksten `nShift er ikke sat op endnu.`

- [ ] **Step 1: Skriv de fejlende tests** i `followUpLogic.test.ts`: `nShift suggestions fill only empty fields`, `the nShift SLA wins over the date rule unless SLA is set by hand`, `without nShift the old behaviour is unchanged`.
- [ ] **Step 2: Kør** `npx.cmd vitest run src/views/warehouse/finland`. Forventet: FAIL.
- [ ] **Step 3: Implementér logikken, derefter skærmen.**
- [ ] **Step 4: Kør vitest og `npm.cmd run build`.** Forventet: PASS.
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): status fra nShift og forslag i Opfoelgning`

### Task 8: Administration

**Files:**
- Modify: `src/views/warehouse/admin/FinlandAdmin.tsx`
- Test: `src/views/warehouse/admin/FinlandAdmin.test.tsx`

Indhold: afsnittet `nShift`: status (`Sat op, klient-id slutter på …` eller `Ikke sat op`), felterne `Klient-id` og `Hemmelighed` (password-felt, tømmes efter gem), knapperne `Gem` og `Test forbindelsen` med svaret `Forbindelsen virker.` eller fejlteksten.

- [ ] **Step 1: Skriv den fejlende test:** `shows whether nShift is set up without the secret`.
- [ ] **Step 2: Kør** `npx.cmd vitest run src/views/warehouse/admin`. Forventet: FAIL.
- [ ] **Step 3: Implementér.**
- [ ] **Step 4: Kør vitest og `npm.cmd run build`.** Forventet: PASS.
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): nShift-noegle under Administration`

## Fase 4: Afprøvning

### Task 9: Afprøvning og changelog

- [ ] **Step 1: `npm.cmd run test:warehouse`, `npx.cmd vitest run src`, `npm.cmd run build`.** Forventet: alt PASS ud over de kendte fejl fra før grenen.
- [ ] **Step 2: Med Jacob i dev-hubben:** sæt nShift-nøglen under Administration, `Test forbindelsen`, hent status for en dag i testarket, kontrollér forslagene på 5 kolli mod PostNords og DHL's sider, prøv `Brug forslagene for alle leverede kolli på dagen`, og gem i testarket.
- [ ] **Step 3: `src/lib/changelog.ts`:** punkt under 1.6.9 om status fra nShift og Expected efter aftalen. Commit `docs(1.6.9): changelog for status fra nShift`.
