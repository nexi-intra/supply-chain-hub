# Juletema – design og plan

**Hemmeligt:** temaet er en overraskelse. Det må ikke nævnes i ændringsloggen, i "Nyheder i Supply Chain Hub" eller
nogen andre steder, brugerne kan se, før det tænder af sig selv 1. december.

## Hvorfor
Jacob vil have "fuld skrald" julestemning i hubben i december: sne, pynt og hygge – som en overraskelse for alle.
Den der ikke vil have det, skal kunne slå det fra.

## Aftalt med Jacob
- Tænder **automatisk 1. december** og slukker efter nytår. Ingen må vide det på forhånd.
- Kan slås til/fra pr. bruger.
- **Fuld pakke** på forsiden, login og hub-vælgeren: snefald, sne på modulkortene med istapper, lyskæde, grangrene,
  julekugler, julekalender i dagens tavle, nissehue på logoet, snedrive, nissen der kigger frem, julehilsen.
- **Rolig pynt** på arbejdsskærme (Optælling, Placeringer, Guides, Knowledge Base og alle andre moduler): intet der
  bevæger sig.
- **Intet** i spillene.
- **Realistisk:** lysene sidder fast på ledningen, sneen ligger på kortene, kuglerne hænger i en snor.

## Mine valg (kan rettes)
- **Periode:** 1. december 00:00 til og med 1. januar. Dagens tavle: 1.–23. december nedtælling og låge; 24. december
  "Glædelig jul"; 25.–30. december "Glædelig jul"; 31. december–1. januar "Godt nytår".
- **Til/fra:** et punkt "Juletema" i Lys/Mørk-menuen – vises kun i perioden. Valget gemmes pr. bruger som lys/mørk.
- **Spil Hjørnet:** helt uden pynt (også menuen), så grænsen er enkel og sikker.
- **Rolig pynt** = sne langs vinduets øverste kant med istapper + en lyskæde, der lyser uden at blinke.
- **Lågen:** én lille hilsen/julefakta pr. dag 1.–24. december (dansk og engelsk; finsk/svensk får engelsk). Hvilke låger
  man har åbnet, huskes på pc'en (ikke på M:).
- **Lyst tema:** sneen får en blød blågrå kant, så den kan ses på lys baggrund.
- **Pc'er uden grafikkort og "reducer bevægelse":** sneen ligger stille, lysene blinker ikke, intet svinger.
- **Skjult forhåndsvisning:** sæt `localStorage['tcd-hub:christmas-preview'] = '2026-12-16'` (en dato) i DevTools
  (kun skaberen kan åbne dem) for at se temaet før tid; slet nøglen for at slukke.
- Lagene er `pointer-events: none` og ligger under dialoger, så intet kan blokere et klik.

## Fase 1 – Kerne (ren logik, testet)
- [ ] `src/lib/christmas.ts`: sæson (`christmasDay(date)`), tilstand pr. skærm (`christmasMode(view)`), lyskædens
  geometri (pærer sidder præcist på ledningen), snehættens form, lågernes tekster, labels i 4 sprog.
- [ ] `src/contexts/ChristmasContext.tsx`: sæson (genberegnes løbende, så den tænder ved midnat), brugerens valg,
  `data-christmas` på `<html>`.

## Fase 2 – Fuld pakke
- [ ] `src/components/christmas/`: snefald (canvas, pause når vinduet er skjult), lyskæde, grangrene, snedrive + nisse,
  sne langs toppen.
- [ ] Forsiden: sne på modulkort + istapper + kugler + drys ved hover; julekalender og låge i dagens tavle; julehilsen.
- [ ] Nissehue på Kæde-H; login og hub-vælger får laget.

## Fase 3 – Rolig pynt og til/fra
- [ ] App vælger fuld/rolig/ingen efter skærm; "Juletema" i Lys/Mørk-menuen i perioden.
- [ ] Lyst tema, software-tegning og reduceret bevægelse.

## Fase 4 – Levering
- [ ] Fuld verifikation, visuelt tjek (lyst/mørkt, forside, arbejdsskærm, spil uden pynt), code review, byg.
- [ ] **Ingen** linje i ændringsloggen.

Start med fase 1.
