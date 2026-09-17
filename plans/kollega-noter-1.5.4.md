# Plan: 4 kollega-noter (1.5.4)

Fire uafhaengige rettelser/features bedt om af kollegaer. Ingen af dem
overlapper i kode, saa de kan laves i vilkaarlig raekkefoelge - faserne herunder
er sorteret efter stigende kompleksitet/risiko, saa vi faar hurtige, synlige
resultater foerst.

**Anbefaling: start med Fase 1** (ren CSS-fix, ingen datamodel-aendring, 5 min).

---

## Fase 1 - Notesbog: lange noter skjuler Opret/Annuller-knapperne - FAERDIG

**Rodaarsag (bekraeftet):** `DialogContent` i opret/redigér-dialogen i
`src/views/VirtualNotebook.tsx` har ingen `max-h`, og indholdet (`<div
className="space-y-4">` med Titel + Textarea + Tags) er ikke scrollbart. Ved
lang tekst vokser hele dialogen ud over skaermen og `DialogFooter` (knapperne)
skubbes ned uden for synsfeltet, uden nogen scroll-mulighed. Appens EGEN
"vis note"-dialog (samme fil) har allerede det rigtige moenster:
`max-h-[80vh]` paa `DialogContent` + `overflow-y-auto max-h-[50vh]` paa
indholds-wrapperen, med header/footer udenfor som forbliver synlige.

- [x] Opret-dialogen: `DialogContent` -> `max-h-[85vh] flex flex-col`;
      Titel+Textarea+Tags-diven -> `overflow-y-auto pr-2 -mr-2 flex-1 min-h-0`;
      `DialogHeader`/`DialogFooter` -> `shrink-0`
- [x] Redigér-dialogen: identisk aendring
- [x] `npx tsc --noEmit` ren

---

## Fase 2 - To Do: redigering mangler helt (baade faelles og personlig)

**Rodaarsag (bekraeftet):** Der findes ingen redigerings-UI overhovedet i
`src/views/ProjectBoard.tsx` - hverken for team-to-do's (`Project`) eller
personlige to-do's (`PersonalTodo`). Kun opret/slet/status-skift findes. Det
er ikke en bug i eksisterende kode, men en manglende feature.

- [ ] Tilfoej redigerings-state: `editingProject`/`editingPersonalTodo` +
      `editTitle`/`editDescription` + `isEditProjectOpen`/`isEditTodoOpen`
- [ ] Blyant-ikon (`PencilSimple` fra `@phosphor-icons/react`) paa begge
      kort, ved siden af slet-knappen
- [ ] Team-to-do: kun opretteren (`project.createdBy === userEmail`) kan
      redigere titel/beskrivelse (samme afvejning som `canDelete`, men snaevrere
      - redigering af INDHOLD er mere folsomt end at forlade/slette)
- [ ] Personlig to-do: altid redigerbar (kun ejeren ser den overhovedet, da
      den ligger under `todos-personal-<email>`)
- [ ] Redigerings-dialog (kopi af opret-dialogens felter, forudfyldt) med
      Gem/Annuller
- [ ] `handleEditProject`/`handleEditTodo` via `updateKvArrayItem` (atomar,
      samme moenster som `handleJoinProject`/`handleStartTodo`)
- [ ] Anvend SAMME scroll-fix som fase 1 paa disse nye dialoger fra start
      (lang beskrivelse skal kunne redigeres uden samme knap-problem)
- [ ] `npx tsc --noEmit`, manuel test af begge lister

---

## Fase 3 - Guide-editor: automatisk kladde ved crash

**Rodaarsag (bekraeftet):** `GuideEditor.tsx` holder ALT indhold (titel,
sektioner, tags osv.) i ren React-state - intet skrives til KV foer brugeren
trykker eksplicit Gem/Send til review. En ny guide faar kun sit ID genereret
naar editoren aabner; findes ingen steder i KV foer foerste gem. Lukker
computeren midt i arbejdet, er ALT tabt.

- [ ] Ny type `GuideDraft` i `src/lib/guideTypes.ts` (kun de redigerbare
      felter + `lastAutoSavedAt`)
- [ ] Ny KV-noegle pr. guide: `guide-drafts-<guideId-eller-ny-id>` (adskilt
      fra `guide-review-requests` - en kladde er en privat arbejdskopi, ikke
      et review-forslag, og skal IKKE forstyrre godkendelsesflowet)
- [ ] I `GuideEditor.tsx`: debounced autosave (fx 4-5 sek. efter sidste
      aendring af titel/sektioner/tags/coverImageId/reviewInterval) skriver
      kladden til KV
- [ ] Ved editor-aabning: hvis en kladde findes for dette guide-id (eller en
      "ny guide" kladde), tilbyd at genskabe den (toast/lille banner: "Der
      blev fundet en ugemt kladde fra <tid> - Genskab / Forkast")
- [ ] Slet kladden ved succesfuldt Gem OG ved eksplicit Annuller/luk uden gem
      (saa gamle kladder ikke ophober sig)
- [ ] Tests: kladde gemmes efter debounce, genskabes ved genaabning, slettes
      ved gem, ingen interferens med review-workflowet
- [ ] `npx tsc --noEmit`, `npx vitest run`

---

## Fase 4 - Vagtplan: gentagelses-moenster ("hver anden/tredje/fjerde uge")

**Model:** genbruger IKKE hjemmearbejde-moensteret direkte (det er et simpelt
"disse ugedage, hver uge for evigt" - ingen interval-logik). Vagtplanen faar
sin egen, parallelle model, der matcher det oensskede "hver Nte uge":

- [ ] Ny type `ShiftPatternRule` i `src/lib/types.ts`: `{ id, employeeId,
      employeeName, roleId, weekdays: number[], intervalWeeks: 1|2|3|4,
      anchorDate: string, endDate?: string, comment?: string }`
- [ ] Ny KV-noegle `shift-patterns` (array, samme moenster som
      `shift-assignments`)
- [ ] Date-math: `matchesInterval(date, anchorDate, intervalWeeks)` i
      `src/lib/dateUtils.ts` - antal hele uger siden anchor modulo
      intervalWeeks === 0
- [ ] I `ShiftSchedule.tsx`: ny knap "Tildel gentaget vagt" ved siden af
      "Tilfoej Opgaver til Hel Uge" - dialog med medarbejder + rolle +
      ugedage (mandag-fredag afkrydsning) + interval-dropdown (hver uge/hver
      2./3./4. uge) + startdato + valgfri slutdato
      + valgfri kommentar
- [ ] Visning: moenstre "udfoldes" til konkrete `ShiftAssignment`-agtige
      celler ved rendering af den viste uge (samme respekt for
      ferie/sygdom/helligdage som `handleAssignWeek` allerede har) - IKKE
      permanent skrevet som tusindvis af raa assignments, kun beregnet for de
      uger der faktisk vises
- [ ] Mulighed for at slette/redigere selve moensteret (ikke kun enkelte
      celler) fra en "Moenstre"-oversigt/liste
- [ ] Tests: `matchesInterval` date-math (flere intervaller, kant-tilfaelde
      ved aarsskifte), moenster-udfoldning respekterer ferie/sygdom
- [ ] `npx tsc --noEmit`, `npx vitest run`, manuel test i vagtplanen

---

## Faellestraek for alle 4 faser

- Ingen data paa M: aendres foer koden er testet lokalt
- Hver fase committes for sig med en klar besked (samme stil som tidligere
  1.5.4-commits)
- Changelog-note tilfoejes for hver fase i `src/lib/changelog.ts`
