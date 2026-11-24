# Link Library

Besluttet 2026-10-14:
- Alle kan oprette links (URL, titel, beskrivelse, kategori). Nye links afventer godkendelse og ses kun
  af opretteren og managere i ejer-afdelingen. Managere godkendes automatisk.
- Én manager i ejer-afdelingen godkender; godkendte links ses af ejer-afdelingen og de afdelinger de er
  delt med.
- Alle kan foreslaa en aendring og rapportere et link (doedt / forkert / mistaenkeligt). Mistaenkeligt
  skjuler linket for alle undtagen managere i ejer-afdelingen. Managere kan rette og slette direkte.
- Aabning sker i standardbrowseren via backenden, kun http/https, ud fra linkets id.
- Hubert og Ctrl+K kender kun godkendte links, man selv kan se.

## Fase 1 - Backend og regler
- [x] `electron/links.cjs`: service (snapshot/command) i `_shared/link-library`, synlighed, roller,
      godkendelse, forslag, rapporter, favoritter, operation-id (idempotens), CAS-skrivning
- [x] `electron/linkSafety.cjs`: URL-validering + advarsler (http, IP, kort-link, punycode, login i URL)
- [x] `links:open` aabner kun gemte, synlige, godkendte http(s)-links; `setWindowOpenHandler` kun http/https/mailto
- [x] IPC + preload (`window.electronLinks`), tests

## Fase 2 - Modulet paa Hubben
- [x] Flise "Link Library", visning med soegning, kategorier, favoritter, opret/foreslaa/rapporter, aabn

## Fase 3 - Managere
- [x] Godkendelse ligger i modulet (fanen "Til godkendelse") i stedet for en fane i Manager Panel:
      godkend/afvis med advarsler, forslag med foer/efter, rapporter
- [x] Klokken: ventende links, forslag og rapporter til managere, godkendt/afvist til opretteren

## Fase 4 - Hubert og Ctrl+K
- [x] Hubert svarer ud fra beskrivelsen med "Aabn link"; Ctrl+K finder links; app-guide da/en/fi/sv

## Fase 5 - Validering
- [x] E2E `scripts/verify-link-library.cjs`, fuld validering, linje i "Hvad er nyt"
- [x] Flisen ligger efter Spil Hjoernet, saa Spil Hjoernet bliver nederst til venstre for medarbejdere
      (managere faar Manager Panel paa sin egen raekke) - besluttet 2026-10-14
