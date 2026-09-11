# App-wide indholdsoversættelse (Bergamot)

Mål: Sprogvælgeren i hovedhubben (DA/EN) skal ikke kun skifte UI-tekster, men også
automatisk oversætte brugerens frie tekst-indhold (projekter, madplan, e-mails,
notesbog, ferienoter, vagtkommentarer osv.) via samme neurale Bergamot-motor som
guiderne bruger. Original tekst ændres ALDRIG i lageret — kun visningen oversættes.

## Fase 1 — Fundament
- [x] `src/lib/useAutoTranslate.ts`: hook der detekterer kildesprog, sammenligner med
      valgt app-sprog, og kalder `translateTextAsync` hvis de er forskellige. In-memory
      cache (`Map`) deler resultater på tværs af hele appen.
- [x] `src/components/AutoText.tsx`: lille wrapper-komponent til at droppe direkte i JSX
      (`<AutoText text={project.title} />`), understøtter `as`-prop for tag/element.

## Fase 2 — Projekter
- [x] `src/views/ProjectBoard.tsx`: titel + beskrivelse på projektkort/-liste bruger `AutoText`.

## Fase 3 — Madplan
- [x] `src/views/MealPlan.tsx`: de 5 ugedags-tekstfelter bruger `AutoText`.

## Fase 4 — E-mail
- [x] `src/views/EmailSystem.tsx`: emne + besked i mail-visning bruger `AutoText`.

## Fase 5 — Notesbog
- [x] `src/views/VirtualNotebook.tsx`: note-titel + indhold bruger `AutoText`.

## Fase 6 — Ferie & vagter
- [x] `src/views/VacationCalendar.tsx`: valgfri notes-felt bruger `AutoText`.
- [x] `src/views/ShiftSchedule.tsx`: vagtkommentar + rollenavn bruger `AutoText`.

## Fase 7 — Validering
- [x] `npm run build` + `npm test`
- [x] Pak + deploy til `TCD-Hub 1.4.0` (samme pipeline som guide-oversættelsen)
- [x] Manuel test (BRUGER): sprogtoggle oversætter brugerindhold (projekter, madplan m.fl.)

## Fase 8 — Statiske UI-tekster (overskrifter/knapper) der IKKE er del af `translations.ts`
Flere views bruger hardkodede danske strenge i stedet for `t.xxx`-ordbogen (fx Madplan,
Ferie-fanen). Frem for at udvide den store `translations.ts`-fil for hvert view, bruger vi
samme `AutoText`-mekanisme på de statiske strenge — hurtigere og kræver ingen ekstra
vedligeholdelse af to sprogfiler i sync.
- [x] `MealPlan.tsx`: alle overskrifter/knapper/labels + placeholder.
- [x] `VacationCalendar.tsx`: fane-labels, "Mine Ferier"/"Alle Team Medlemmer" m.fl.
- [x] `ProjectBoard.tsx`: allerede fuldt internationaliseret via `language === 'da' ? ... : ...` — ingen ændring nødvendig.
- [x] `VirtualNotebook.tsx`: allerede fuldt internationaliseret via `t.notebook.*` — ingen ændring nødvendig.
- [x] `EmailSystem.tsx`: alle resterende statiske strenge koblet til eksisterende `t.email.*`-ordbog (den fandtes allerede men blev ikke brugt); et par uden ordbog-nøgle fik `AutoText`.
- [x] `ShiftSchedule.tsx`: alle resterende statiske strenge (dialogtitler, knapper, placeholders, fanetekster) fik `AutoText`/`useAutoTranslate`.
- [x] `Hub.tsx` (forsiden): allerede fuldt internationaliseret — ingen ændring nødvendig.
