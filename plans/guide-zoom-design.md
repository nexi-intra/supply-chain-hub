# Zoom i åbne guides (Guides og Knowledge Library) - design

Dato: 2026-11-25. Version: 1.6.9. Godkendt approach: A.

## Hvorfor

Teksten i en åben guide står småt (arket bruger 14 px tekst), og der er ingen måde at gøre den større på. Brugerne vil kunne zoome ind og ud, mens de læser. Guidekortene i listen er fine og skal ikke ændres.

## Mål

- Zoom ind og ud i en åben guide i både Guides og Knowledge Library. Begge bruger `GuideViewer.tsx`, så én ændring dækker begge.
- Tekst og billeder bliver større sammen, som i Word.
- Zoomniveauet huskes på PC'en til næste guide og næste opstart.

## Ikke mål

- Ingen zoom i listen med guidekort, søgning eller kategorier.
- Ingen zoom af hele appvinduet. Knapper, overskrift, sprogvalg og menuer i guidevinduet bliver i normal størrelse.
- Ingen zoom i guide-editoren.
- Zoom deles ikke mellem PC'er eller brugere (ingen data på M:).

## Anti mål

- Resten af appen må aldrig blive stående forstørret, efter en guide er lukket.
- Zoom må ikke ændre den DOCX eller PDF, der downloades eller eksporteres.

## Approaches

- **A. Zoom på selve arket (valgt).** Zoomknapper i guidevinduet, kun indholdsområdet skaleres, og PDF-visningerne får samme zoom med. Valgt fordi den forstørrer tekst og billeder uden at gøre resten af vinduet klodset, og den ligner Word og PDF. Pris: ved høj zoom bliver arket bredere end vinduet, og man scroller vandret.
- B. Electrons zoom af hele vinduet, mens guiden er åben. Fravalgt: knapper og overskrift vokser også, og zoom skal nulstilles præcist ved lukning.
- C. Kun større skrift. Fravalgt: billeder og skærmbilleder i guiden bliver ikke større, og det er ofte dem, der er svære at læse.

## Det, der er besluttet

- Kontrol i guidevinduets værktøjslinje: "−", den aktuelle procent og "+". Et klik på procenten sætter zoom tilbage til 100 %. Teksten oversættes som resten af guideviseren (da, en, fi, sv).
- Tastatur og mus, mens guidevinduet er åbent og fokus ikke er i et tekstfelt: Ctrl og musehjul, Ctrl +, Ctrl − og Ctrl 0.
- Faste trin (mit valg): 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250 og 300 %. Det er Chromes egne trin, så det føles som en browser.
- Gælder i alle fire visninger:
  - Tekstvisning (A4-arket med trin) og Original Word (HTML-visningen): hele arket skaleres, også billeder og sidehoved.
  - Word som PDF og original PDF (iframe med Chromes PDF-viser): PDF-viseren åbnes med samme zoom (`#zoom=<procent>`). PDF-viserens egne plus og minus virker stadig.
- Gemmes i `localStorage` pr. PC med en `try/catch`, ligesom lydindstillingen i `src/lib/warehouse/sound.ts`. En ugyldig eller manglende værdi giver 100 %.

## Overladt til den, der bygger

- Den præcise CSS-teknik (fx `zoom` på arkets container), så længe layoutet flyder rigtigt og den lodrette scroll passer til den forstørrede højde.
- Om iframe'en skal genindlæses for at tage en ny `#zoom` til sig.
- Placering af kontrollen i værktøjslinjen, så den også fungerer på smalle vinduer.
