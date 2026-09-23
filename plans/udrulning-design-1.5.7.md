# Udrulning af det visuelle udtryk til hele appen

Grundlaget og forsiden er på plads (grenen `design/visuelt-eftersyn`). Det her er
planen for at få resten med, så udtrykket er ens overalt.

## Omfang, målt — ikke gættet

`node scripts/design-inventory.cjs` tæller de mønstre, der skal ensrettes:

**751 forekomster fordelt på 54 filer.**

| Mønster | Antal | Skal blive til |
|---|---|---|
| `bg-gradient-to-*` | 265 | Flad flade, eller modulets egen farve |
| `border-2` | 177 | Almindelig 1 px streg |
| Store skygger (`shadow-lg/xl/2xl`) | 165 | Ingen — streg adskiller flader |
| `rounded-xl/2xl/3xl` | 96 | Én radius (`rounded-md`) |
| Versal-labels | 25 | Almindelig sætningsform |
| Gradient-overskrifter | 43 | Ren tekstfarve |

## Reglerne, der gælder hver eneste fil

1. **Farve betyder noget.** Er den ikke et signal (rav/grøn/rød), modulets egen
   farve eller mærkefarven, er den grå.
2. **Streger adskiller flader — ikke skygger.** Skygge findes kun til ting, der
   faktisk svæver: dialoger og menuer.
3. **Én radius** i hele appen.
4. **Ét fremhævet element pr. skærm.** Resten er stille.
5. **Bevægelse kun som svar på en handling.** Alle felter reagerer ens.
6. **Tal flugter altid** (tabeltal).
7. **Overskrifter er venstrestillet** og i almindelig sætningsform.

## Fase A — det delte lag

Rettes her, slår igennem overalt uden at røre en eneste skærm.

- [ ] `ui/dialog`, `ui/sheet`, `ui/popover`, `ui/dropdown-menu`: radius og skygge
- [ ] `ui/input`, `ui/textarea`, `ui/select`: samme kant og fokusring
- [ ] `ui/tabs`, `ui/table`, `ui/tooltip`, `ui/alert`, `ui/separator`
- [ ] Kontrollér at `accent` bruges konsekvent som rolig flade, ikke som mærkefarve

## Fase B — de skærme man er i hver dag

- [ ] `ShiftSchedule` (28) — her kommer tabeltal og opgavefarver for alvor til deres ret
- [ ] `VacationCalendar` (9)
- [ ] `TeamOverview` (11)
- [ ] `MealPlan` (11)
- [ ] `VirtualNotebook` (10)
- [ ] `EmailSystem` (11)
- [ ] `ProjectBoard` (27)
- [ ] Understøttende: `AnnouncementsBoard`, `SickLeaveDialog`, `SickLeaveManager`,
      `VacationRequestDialog`, `ManualVacationGrant`, `ObserverVacationCalendar`

## Fase C — guides

- [ ] `GuideLibrary` (49)
- [ ] `GuideCard` (18)
- [ ] `GuideEditor` (8), `GuideViewer` (4), `GuideChat` (4)
- [ ] `GuideReviewDashboard` (5), `GuideImportStatus` (3)

## Fase D — paneler

- [ ] `ManagerPanel` (51)
- [ ] `AdminPanel` (32)
- [ ] `CreatorPanel` (12)
- [ ] `ObserverWorkspace` (20)
- [ ] `ThemeBuilder` (8) — skal stadig virke oven på de nye tokens
- [ ] `GameLeaderboardAdmin` (7), `DataStorageManager` (5), `ClientVersionManager` (2),
      `UpdateManager` (2), `CrossHubHighscores` (1)

## Fase E — spillehjørnet

Her må der godt være mere leg end i resten — men **rammen** skal være den samme:
menuer, highscore-lister og knapper ser ud som resten af appen. Selve spillefladen
er sit eget rum.

- [ ] `Arcade` (37), `GameCorner` (17), `Modern` (17)
- [ ] `EndlessDodger` (60), `NeonSnake` (59), `NexiFlyer` (56), `BrickBreak` (52), `Tetris` (46)
- [ ] `CubeBasherGame`, `TheLibrarian2Game`, `PauseOverlay`

## Fase F — resten af de små

- [ ] `HubAssistant` (6), `AssistantChatWindow` (3), `OnboardingWizard` (4),
      `AccessContextPicker` (4), `AccountMigrationRecovery` (2), `UserProfile` (1),
      `WhatsNewDialog` (1), `UpdateNotification` (1), `StorageConnectionBanner` (1),
      `EmailNotifications` (1), `LanguageToggle` (2), `ThemeToggle` (2)

## Fase G — kvalitetsgulv og bevis

- [ ] `node scripts/design-inventory.cjs` skal vise nul tilbage i de mønstre, der skulle væk
- [ ] Skærmbilleder af hver hovedskærm i både lys og mørk tilstand
- [ ] Kontrast tjekket mod WCAG AA på tekst og knapper
- [ ] Synligt tastaturfokus overalt
- [ ] `prefers-reduced-motion` respekteres
- [ ] `tsc`, hele testsuiten og en produktionsbygning
- [ ] ThemeBuilder virker stadig med brugerdefinerede temaer

## Rækkefølge og fortrydelse

Hver fase bliver sin egen commit på `design/visuelt-eftersyn`, så en enkelt fase
kan rulles tilbage uden at tage resten med. `git checkout develop/1.5.7` fortryder
det hele.
