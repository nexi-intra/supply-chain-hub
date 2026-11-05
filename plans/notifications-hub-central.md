# Notifikationer styres kun fra klokken på Hubben (1.6.2)

Oprettet: 2026-10-12. Ønske fra brugeren: en notifikation fra Forbedringer og forslag gik ikke væk, hverken ved klik eller "slet". Alle notifikationer skal kunne fjernes ved klik eller sletning, og modulerne må ikke have deres egne notifikationslister.

## Årsag (fundet)

- Klokken (`NotificationCenter.tsx`) huskede "skjul" kun i komponentens hukommelse. Forlader man Hubben, er det glemt, og notifikationen kommer igen.
- Klik på en notifikation åbnede kun modulet; intet blev markeret som læst.
- Forbedringer-notifikationer (`readAt: null` i `improvement-cases`) kan kun markeres læst med kommandoen `acknowledge`. Ingen skærm i appen sender den, så de blev aldrig læst.

## Fase 1 - klokken er det ene sted, og alt kan fjernes

- [x] Personlig, varig liste over fjernede notifikationer: `hub-notifications-dismissed-<email>` (maks. 500 id'er), kun ejeren må skrive den (`securedIpc` PERSONAL_KEY), og den følger med ved e-mail-skift (`accountReferences`).
- [x] Klik på en notifikation = fjern den + åbn modulet. Krydset ("Slet") = fjern den. Ny knap "Ryd alle".
- [x] Forbedringer og Multiplayer får også besked (`acknowledge`), så notifikationen er læst i selve modulet og på andre maskiner.
- [x] Klik på en Windows-notifikation fjerner også den i klokken.
- [x] Tests: liste-logik, kvitteringsfelter, sikkerhed for nøglen, desktop-klik.
- [x] Fundet undervejs: views der læste navigationsparametre med `consumeNavigationParams()` i `useState` mistede dem, når React kasserede et render (klokkens opdatering udløste det, og Forbedringer åbnede så ikke sagen). Rettet i E-mail, Guides/Knowledge Base, Forbedringer, Leder-panel, To Do og Notesbog: `peek` i render, `consume` i en effect.
- [x] Hubert-guiden til klokken (da/en/fi/sv) beskriver klik, slet og "Ryd alle".

## Fase 2 - ingen notifikationer inde i Multiplayer

- [x] Fjern "Nyt"-listen med "Markér som læst" i Word-Puzzle- og skak-lobbyen.
- [x] Fjern pop-up-toasts for Multiplayer (MultiplayerToaster). Klokken og Windows-notifikationen bliver tilbage.
- [x] Opdater E2E (`verify-multiplayer.cjs`): træk via klokken i stedet for toast, og tjek at notifikationen er væk efter klik. `verify-improvements.cjs --new-features`: klik og slet fjerner og kvitterer.

## Fase 3 - gennemgang af de andre moduler (aftales)

- [ ] Notesbog: egen notifikationsliste med "Markér alle som læst" (`VirtualNotebook.tsx`).
- [ ] E-mail: `EmailNotifications.tsx`.
- [ ] Øvrige moduler: find egne lister/pop-ups, og flyt dem til klokken.

## Verifikation

- [x] tsc 0, vitest 1253, Electron-tests 1089/1089, E2E Word-Puzzle 18/18, skak 14/14, Forbedringer (begge kørsler) grøn.
