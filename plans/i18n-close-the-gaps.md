# Luk sprog-hullerne: gør ALT hardcoded tekst oversætteligt via t.xxx

## Baggrund (research)
14 view-filer og komponenter bruger **slet ikke** `useLanguage()`/`t.xxx` — al tekst i dem
er hardcoded dansk og skifter ikke sprog i dag. Estimeret omfang (talt via grundig
gennemgang af hver fil):

| Fil | ca. antal strenge |
|---|---|
| ManagerPanel.tsx | ~190 |
| AdminPanel.tsx | ~80 |
| GuideLibrary.tsx | ~50 |
| GuideEditor.tsx | ~35 |
| Auth.tsx | ~34 |
| DataStorageManager.tsx | ~38 |
| UpdateManager.tsx | ~26 |
| MealPlan.tsx | ~26 |
| GameLeaderboardAdmin.tsx | ~20 |
| GuideViewer.tsx | ~18 |
| CategoryManager.tsx | ~18 |
| ManualVacationGrant.tsx | ~17 |
| SickLeaveManager.tsx | ~16 |
| UserProfile.tsx | ~15 |
| ClientVersionManager.tsx | ~12 |
| TeamOverview.tsx | ~11 |
| GuideCard.tsx | ~11 |
| OnboardingWizard.tsx | ~32 |
| GuideImportStatus.tsx | ~7 |
| StorageConnectionBanner.tsx | ~9 |
| ThemeBuilder.tsx | ~75 (er 100% ENGELSK i dag — mangler dansk, ikke engelsk) |

**Samlet ca. 750-800 strenge på tværs af 21 filer.** Dette er et stort, flerfaset arbejde.

## Fælles fremgangsmåde pr. fil
1. Tilføj en ny navnerum-nøgle i BEGGE `da`/`en`-blokke i `src/lib/translations.ts` (fx `managerPanel: {...}`)
2. Genbrug `t.common.xxx` (back/close/save/cancel/delete/edit/add/search/loading) hvor det passer — undgå dubletter
3. Tilføj `import { useLanguage } from '@/contexts/LanguageContext'` + `const { t, language } = useLanguage()` i filen
4. Erstat hver hardcoded streng med `t.xxx.yyy` (statisk tekst) eller behold `language === 'da' ? ... : ...` for tekst med dynamisk indhold der ikke fint kan ligge i en ordbog (fx `${navn} tildelt ${opgave}`)
5. `get_errors` + visuel sanity-check af diff

## Fase 1 — Højst synlighed: login + konto-menu (vises af ALLE, hele tiden)
- [x] Auth.tsx (~34 strenge) — login/signup-skærmen, det første alle ser
- [x] UserProfile.tsx (~15 strenge) — konto-dropdown, vises øverst på HVER skærm

## Fase 2 — Hurtige gevinster (små, selvstændige views)
- [x] TeamOverview.tsx (~11 strenge)
- [x] MealPlan.tsx (~26 strenge)

## Fase 3 — AdminPanel.tsx (~80 strenge)
- [x] AdminPanel.tsx + getRoleDisplayName/getRoleDescription i userRoles.ts gjort sprog-parameteriseret

## Fase 4 — ManagerPanel.tsx (~190 strenge, splittes i under-faser efter fane)
- [x] 4a: Rettigheder + Fødselsdage faner
- [x] 4b: Sygemeldinger + Anmodninger faner
- [x] 4c: Ferie Oversigt + Spil + Datalagring faner + delte dialoger

## Fase 5 — Guide-bibliotek (browsing)
- [x] GuideLibrary.tsx (~50 strenge)
- [x] GuideCard.tsx (~11 strenge)
- [x] GuideImportStatus.tsx (~7 strenge)

## Fase 6 — Guide-redigering
- [x] GuideEditor.tsx (~35 strenge)
- [x] GuideViewer.tsx (~18 strenge)
- [x] CategoryManager.tsx (~18 strenge)

## Fase 7 — Manager-værktøjer (Datalagring-fanens undersider)
- [x] UpdateManager.tsx (~26 strenge)
- [x] ClientVersionManager.tsx (~12 strenge)
- [x] DataStorageManager.tsx (~38 strenge)
- [x] GameLeaderboardAdmin.tsx (~20 strenge)

## Fase 8 — Resterende mindre komponenter
- [x] ManualVacationGrant.tsx (~17 strenge)
- [x] SickLeaveManager.tsx (~16 strenge)
- [x] OnboardingWizard.tsx (~32 strenge)
- [x] StorageConnectionBanner.tsx (~9 strenge)

## Fase 9 — ThemeBuilder.tsx (~75 strenge, tilføj DANSK — filen er i dag kun engelsk)
- [x] ThemeBuilder.tsx: dansk tilføjet til alle labels/beskrivelser/knapper/toasts

## Efter hver fase (eller hver 2-3 faser givet omfanget)
- `npm run build` + `npm test` for hurtig verifikation
- For faser med main-process-ændringer (ingen forventet her): smoke-test pakket app
- `npm run electron:build` + deploy til `TCD-Hub 1.4.2` + commit ved naturlige stop
