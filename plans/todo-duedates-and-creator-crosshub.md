# Plan: To-do datoer+notifikationer, og Creator-panel paa tvaers af hubs - FAERDIG

## Fase 1: Forfaldsdato paa to-do's (personlig + team)
- [x] `PersonalTodo` (src/lib/personalTodos.ts) og `Project` (ProjectBoard.tsx)
      faar et optionelt `dueDate?: string` (YYYY-MM-DD)
- [x] `createPersonalTodo` faar et optionelt `dueDate`-param
- [x] Ny `src/lib/todoDueDates.ts`: rene, testbare helpers
      (`todoDueStatus(dueDate, isCompleted, now)` -> 'overdue' | 'today' | 'upcoming' | null)
- [x] Opret/redigér-dialoger (begge to-do-typer) faar et dato-felt
- [x] To-do-kort viser forfaldsdato med farve (overskredet = roed, i dag =
      gul, fremtid = neutral)

## Fase 2: Notifikationer om forfaldsdatoen
- [x] Hub.tsx henter `projects` + personlige to-do's og sender til
      NotificationCenter
- [x] NotificationCenter viser en notifikation naar en to-do (personlig,
      eller team-to-do brugeren er tildelt/har oprettet) har forfaldsdato
      i dag eller er overskredet, og ikke er faerdig
- [x] Klik navigerer til to-do-listen (rigtig fane, team/personlig - Tabs er
      nu styret via navigations-parametre)

## Fase 3: Creator Panel - highscores paa tvaers af alle hubs
- [x] Ny `src/components/CrossHubHighscores.tsx`: skrivebeskyttet, bruger det
      EKSISTERENDE `useCrossTeamLeaderboard`-hook + merge-helpers (samme som
      spillenes egne "highscores paa tvaers"-visning) - ingen ny IPC, ingen
      skrivevej til andre hubs
- [x] Tilfoejet under hvert spils fane ved siden af den eksisterende
      `GameLeaderboardAdmin` (som fortsat KUN redigerer det AKTIVE hubs data)

## Fase 4: Creator Panel - alle brugere paa tvaers af alle hubs
- [x] CreatorPanel henter alle teams' 'users' via det eksisterende
      `readTeamsKeys` (samme mekanisme som `listUserOptions` allerede bruger
      til cross-team-opslag) og viser en samlet liste i Data Storage-fanen
- [x] Rent read-only overblik (email, navn, rolle, hub) - aendrer intet

## Fase 4b: Rettelse efter brugerfeedback - version-listen, ikke en separat liste
Brugeren praeciserede at det egentlige behov var den EKSISTERENDE
"brugernes app-versioner"-liste (ClientVersionManager) - ikke en ny,
separat brugerliste uden version-info. Den separate liste fra Fase 4 er
derfor fjernet igen og erstattet af:
- [x] `ClientVersionManager` henter nu ALLE andre hubs' `users` +
      `client-versions` (readTeamsKeys, kun ved mount, ingen polling - som
      `useCrossTeamLeaderboard`) og fletter dem ind i samme liste
- [x] Ny hub-filter-dropdown ("Alle hubs" + hvert hub) naar der er mere end
      ét hub
- [x] Tving-opdatering-knappen vises KUN for det AKTIVE hubs brugere (skriver
      kun til `force-update-requests` i det aktive hub - ingen ny skrivevej
      til andre hubs); andre hubs' raekker er markeret read-only med et
      forklarende hint

## Fase 5: Validering
- [x] `npx tsc --noEmit`
- [x] `npx vitest run` (102/102)
- [x] `node --test electron/*.test.cjs` (379/379, upaavirket)
