# Udrulning af det visuelle udtryk til hele appen

Udrulningen ligger på `develop/1.5.7`. Temabyggeren blev efterfølgende fjernet
helt; lys/mørk-temaskiftet er bevaret.

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

- [x] `ui/dialog`, `ui/sheet`, `ui/popover`, `ui/dropdown-menu`: radius og skygge
- [x] `ui/input`, `ui/textarea`, `ui/select`: samme kant og fokusring
- [x] `ui/tabs`, `ui/table`, `ui/tooltip`, `ui/alert`, `ui/separator`
- [x] Adskil `accent` som mærkefarve fra `secondary` som neutral hover-flade

## Fase B — de skærme man er i hver dag

- [x] `ShiftSchedule` (28) — her kommer tabeltal og opgavefarver for alvor til deres ret
- [x] `VacationCalendar` (9)
- [x] `TeamOverview` (11)
- [x] `MealPlan` (11)
- [x] `VirtualNotebook` (10)
- [x] `EmailSystem` (11)
- [x] `ProjectBoard` (27)
- [x] Understøttende: `AnnouncementsBoard`, `SickLeaveDialog`, `SickLeaveManager`,
      `VacationRequestDialog`, `ManualVacationGrant`, `ObserverVacationCalendar`

## Fase C — guides

- [x] `GuideLibrary` (49)
- [x] `GuideCard` (18)
- [x] `GuideEditor` (8), `GuideViewer` (4), `GuideChat` (4)
- [x] `GuideReviewDashboard` (5), `GuideImportStatus` (3)

## Fase D — paneler

- [x] `ManagerPanel` (51)
- [x] `AdminPanel` (32)
- [x] `CreatorPanel` (12)
- [x] `ObserverWorkspace` (20)
- [x] Temabyggeren og dens egne oversættelser/viden fjernet
- [x] `GameLeaderboardAdmin` (7), `DataStorageManager` (5), `ClientVersionManager` (2),
      `UpdateManager` (2), `CrossHubHighscores` (1)

## Fase E — spillehjørnet

Her må der godt være mere leg end i resten — men **rammen** skal være den samme:
menuer, highscore-lister og knapper ser ud som resten af appen. Selve spillefladen
er sit eget rum.

- [x] `Arcade` (37), `GameCorner` (17), `Modern` (17)
- [x] `EndlessDodger` (60), `NeonSnake` (59), `NexiFlyer` (56), `BrickBreak` (52), `Tetris` (46)
- [x] `CubeBasherGame`, `TheLibrarian2Game`, `PauseOverlay`

## Fase F — resten af de små

- [x] `HubAssistant` (6), `AssistantChatWindow` (3), `OnboardingWizard` (4),
      `AccessContextPicker` (4), `AccountMigrationRecovery` (2), `UserProfile` (1),
      `WhatsNewDialog` (1), `UpdateNotification` (1), `StorageConnectionBanner` (1),
      `EmailNotifications` (1), `LanguageToggle` (2), `ThemeToggle` (2)

## Fase G — kvalitetsgulv og bevis

- [x] `node scripts/design-inventory.cjs`: 27 bevidste valg-, overlay- og fokusmarkeringer tilbage; ingen gamle gradienter
- [x] 22 skærmbilleder af forside og 10 hovedskærme i lys og mørk tilstand (lokal QA-mappe)
- [x] Kontrast tjekket mod WCAG AA på synlig tekst på forside og hovedskærme i begge tilstande
- [ ] Synligt tastaturfokus kontrolleret på flere moduler (forsidens modulfelt verificeret)
- [x] `prefers-reduced-motion` respekteres
- [x] `tsc`, hele testsuiten og en produktionsbygning af den endelige version
- [x] Lokal ZIP bygget i Windows Temp og kontrolleret (exe og app.asar) uden publicering

## Rækkefølge og fortrydelse

Faserne er committet og fast-forwardet til `develop/1.5.7`; den oprindelige
designgren er bevaret til sammenligning. En ny ZIP bygges i en særskilt mappe,
så den gamle release ikke overskrives.
