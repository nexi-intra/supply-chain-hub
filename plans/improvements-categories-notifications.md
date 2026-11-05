# Forslag, notifikationer og guide-sletning (2026-10-02)

Brugerønske:
1. Ved nyt forslag skal man kunne lave en ny kategori, hvis ingen af de eksisterende passer.
2. Creator-brugeren må ikke kunne inviteres til et forslag.
3. Forslagenes notifikationer skal også vises i hubbens notifikationsklokke, ikke kun inde i modulet.
4. Når en guide slettes via review, skal knappen sige "Godkend og slet" i stedet for "Godkend og udgiv".

## Design

- **Egne kategorier:** `category` er enten en fast kategori (process, automation …) eller en egen tekst (højst 60 tegn, uden kontroltegn). Egne kategorier, som andre allerede har oprettet, vises i listen, så de kan genbruges. Skriver man noget, der svarer til en eksisterende kategori (uanset store/små bogstaver eller det oversatte navn), genbruges den, så der ikke opstår dubletter. Electron validerer både nye kommandoer og gemte sager.
- **Creator:** Electron afviser invitation af creator-kontoen; snapshot markerer creator som `invitable: false`, så personen stadig kan vises med navn (fx "inviteret af"), men ikke står i invitationslisten.
- **Hub-notifikationer:** fælles ren funktion `unreadImprovementNotifications(cases, actorEmail)` bruges af både modulet og en ny hook i notifikationscentret, der læser snapshot og lytter på ændringer. Klik åbner modulet direkte på sagen.
- **Guide:** ren funktion `guideApproveLabel(action, language)`; sletning får "Godkend og slet" og rød knap.

## Faser
- [x] Fase 1 – Electron: egne kategorier, creator kan ikke inviteres (tests RØD først).
- [x] Fase 2 – Frontend-lib: kategori-hjælpere, notifikationsfunktion, guide-label (tests RØD først).
- [x] Fase 3 – UI: opret-dialog med "Ny kategori", visning af kategori, invitationsliste, hub-klokke, dyb-link til sag, guide-knap.
- [x] Fase 4 – Verifikation: tests, typecheck, build, e2e-tjek i appen på midlertidige data (`node scripts/verify-improvements.cjs --new-features`), genstart dev-vinduet.
