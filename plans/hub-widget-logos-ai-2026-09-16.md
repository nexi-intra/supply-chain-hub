# Plan: Widget-handlinger, nye logoer og flersproget AI (2026-09-16)

Fire oensker fra brugeren, opdelt i faser. Start med Fase 1.

## Fase 1 - Handlinger i Team status-widgeten
Goer det muligt at tilfoeje kommentar og tilfoeje opgave direkte fra "Team status"-widgeten paa Hub'en.
- [x] Kommentar-knap pr. opgave i widgeten (genbruger eksisterende kommentar-dialog + handleAddOrUpdateComment)
- [x] "Tilfoej opgave"-knap pr. bruger der aabner en rolle-vaelger og tildeler brugeren (genbruger tildel-logik)
- [x] Refaktorer handleQuickAssign til at kunne tage eksplicitte parametre (task + email)
- [x] Typecheck + genstart dev-server

## Fase 2 - AI-assistenten forstaar og svarer paa engelsk og finsk
- [x] Kortlaeg assistantContext.cjs keyword-matching (i dag primaert danske ord)
- [x] Detekter spoergsmaalets sprog naar det afviger fra app-sproget (fald tilbage til app-sprog)
- [x] Udvid keyword-regex med engelske + finske synonymer (allerede daekket + sprogdetektion)
- [x] Sikre at TEXT/EXTRA/TASK_TEXT har fyldestgoerende en + fi svar
- [x] Test: assistant-suiterne groenne (36/36)

## Fase 3 - Nyt Hubert-ikon (robot + golden retriever)
Easter egg: Hubert er brugerens hund (golden retriever). Bland robot- og hundehoved.
- [x] Lav en custom SVG-komponent HubertIcon (robot-hoved med hunde-oerer/snude, golden farve)
- [x] Erstat <Robot>-ikonet i HubAssistant.tsx (knap + velkomst)
- [x] Behold size/weight-lignende API saa den passer ind

## Fase 4 - Nyt app-logo (ikke Electrons standard)
- [x] Design et SVG-app-logo (Supply Chain Hub hub-and-spoke)
- [x] Generer PNG + ICO via System.Drawing (build/app-logo.png + build/icon.ico)
- [x] Wire som BrowserWindow icon i electron/main.cjs (dev) + favicon i index.html
- [x] Verificer i vinduet

Miljoe: efter hver aendring genstartes dev-serveren (stop 1.5.1 Electron + relaunch npm run electron:dev), og det verificeres at vinduet er aabent.
