# Visuelt tekst-overflow tjek af hele appen

## Mål
Gennemgå alle views i appen for tekst, der bliver klippet/forvrænget fordi
boksen er for lille, og rette det (mindre tekst, wrapping eller truncation),
så alt indhold kan være i sine bokse.

## Fase 1: Automatisk scanning
- [x] Playwright-script der logger ind, besøgte alle views (Hub + alle moduler,
      Manager Panel-faner, Admin Panel-faner, Game Corner-menuer, 6 dialoger,
      profil-dropdown) i 1280x720, 1366x768 og 1920x1080 med seeded stress-data
      (meget lange navne/emner) og programmatisk overflow-detektion.
- [x] Screenshots af alle views til visuel gennemgang (25+ skærme).

## Fase 2: Analyse og rettelser
- [x] Gennemgang: bevidste `truncate`-designs (lange navne i kalenderchips, team-kort,
      leaderboards, tabelheadere) og hub-knappens notifikations-badge var falske positiver.
- [x] **Reelt fund 1 (centralt):** Radix ScrollArea-viewportens `display: table` fik indhold
      til at vokse forbi containeren, så `truncate` aldrig aktiverede — email-rækker og
      brugerlisten blev hårdt klippet ved kortkanten. Rettet i `ui/scroll-area.tsx`
      (gavner også ChatAssistant + EmailNotifications).
- [x] **Reelt fund 2:** Email-rækkens afsender/emne manglede truncate + min-w-0 og
      tidsstemplet kunne klemmes — rettet i `EmailSystem.tsx`.
- [x] **Forbedring:** "Mest Sygemeldinger"-kortet viser nu navnet på 2 linjer med mindre
      skrift (line-clamp-2 + title) i stedet for hård afkortning på én linje.

## Fase 3: Verificering
- [x] Genkørt scanning — 0 reelle overflow-fund; alle tilbageværende er bevidst ellipsis
      på vilkårligt langt brugerindhold + hub-badgen (bevidst design).
- [x] Build OK; kun de kendte præeksisterende TS-baseline-fejl (linjenumre flyttet).
- [x] Commit på feature-branch (indgår i PR #19).

---
**Forslag:** Start med Fase 1 (scanningen afgør omfanget).
