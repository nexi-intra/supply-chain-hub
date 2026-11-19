# Managere på tværs af teams (erstatter skrivebeskyttede samlehubs) - 1.6.4

Godkendt design 2026-10-16. Ingen build, release eller push.

## Beslutninger

- En person har ét hjem-team (brugerpost, adgangskode, profil). Creator kan give personen manager-adgang i andre teams.
- I et ekstra team er personen manager med præcis samme rettigheder som teamets egne managere, men er IKKE medlem
  (står ikke i vagtplan, ferie, teamlister).
- Har man flere hubs: "Vælg din hub" efter login (sidst valgte huskes lokalt), "Skift hub" i profilmenu og Ctrl+K uden logout.
- Personlige nøgler (sprog, tema, forside, egen To Do, favoritter, set-markeringer) ligger altid i hjem-teamets lager.
- Antal ventende godkendelser pr. hub vises på hub-vælgeren og ved "Skift hub" ("BPO · 2 venter").
- Samlehubs (access views / observer) fjernes helt fra koden. `access-views.json` på M: røres ikke. Johnny får adgang manuelt.
- Brugeren redigerer aldrig filer: alt styres i Creator Panel. Hubben gemmer selv i `_registry/manager-access.json`.
- I Manager Panel i det ekstra team vises "Managere fra andre teams" (kun læsning; kun creator kan fjerne).

## Teknisk model

- Aktiv hub = den globale aktive teammappe (`currentTeamFolder`) som i dag. Sessionen er stadig bundet til hjem-teamet.
- Aktøren får `activeTeam`, `teams` (hjem + ekstra) og en rolle beregnet for den aktive hub:
  creator overalt; hjem-team = brugerpostens rolle; ekstra team = manager; ellers ingen adgang.
- Tjek der i dag bruger `actor.home` bruger `actor.activeTeam` (securedIpc kv-gate, assign-user, switch-to-team, accountService, userPolicy).
- `registry:switch-to-team` tilladt for ikke-creator til teams i `actor.teams`.

## Fase 1 - Fjern samlehubs
- [x] Backend: registry (access views), authService (viewId/selectView), securedIpc, teamReadPolicy.readView, main IPC, preload, accountService (identity 'views'), userPolicy, improvements/links/highFives/multiplayer readOnly
- [x] Frontend: App.tsx picker/observer, ObserverWorkspace, ObserverVacationCalendar, AccessContextPicker (genbruges/omskrives i fase 3), Hub-knap, CreatorPanel-sektion, bridges, oversættelser, readOnly-flag
- [x] Hubert: assistantContext/Knowledge/Briefing/Worker/Planner/AppGuide(+I18n)/manifest/træning/unanswered-log
- [x] Tests opdateret; tsc + electron-tests + vitest grønne (2026-10-16: tsc 0, 1106 electron, 1405 vitest)

## Fase 2 - Backend: manager-adgang på tværs
- [x] registry: `manager-access.json` læs/skriv/valider (TDD), forgetUser, e-mailskift flytter adgangen
- [x] authService: aktør med `activeTeam`, `teams`, rolle pr. aktiv hub (TDD)
- [x] securedIpc: gates på aktiv hub; switch-to-team for egne hubs (TDD)
- [x] main: personlige nøgler til hjem-teamets lager; IPC til Creator Panel (list/set) og "mine hubs" med ventende antal
- [x] Hubert: aktiv hub i principal + fingerprint

## Fase 3 - Brugerflade
- [x] Creator Panel: sektion "Managere på tværs af teams" (liste, tilføj, rediger, fjern)
- [x] Login: "Vælg din hub" ved flere hubs, sidst valgte forvalgt
- [x] "Skift hub" i profilmenu + Ctrl+K, badge med aktiv hub, ventende antal
- [x] Manager Panel: "Managere fra andre teams"
- [x] Oversættelser da/en/fi/sv; Hubert app-guide-tekster

## Fase 4 - Verifikation
- [x] tsc, electron-tests (1118), vitest (1405; én ustabil Route Runner-spiltest består alene)
- [x] E2E `scripts/verify-multi-hub.cjs` mod midlertidigt lokalt lager: PASS (opret adgang, hub-vælger med "2 venter", manager-skrivning i BPO, Manager Panel-liste, personlige nøgler hjemme, skift uden logout, fjernet adgang sender hjem)
- [x] Changelog 1.6.4
- [x] Brugeren tester selv i dev-vinduet; derefter commit
- [ ] Efter udrulning: giv Johnny manager-adgang til TRR i Creator Panel
