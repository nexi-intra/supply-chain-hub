// Afgør om der lige nu er en åben Dialog/AlertDialog nogen steder i appen, ved
// at spørge DOM'en direkte (Radix fjerner altid Content-elementet fra DOM'en
// når en dialog lukkes, medmindre forceMount bruges — hvilket vi ikke gør). En
// DOM-forespørgsel er immun over for evt. modul-duplikering ved bundling/
// chunking, som en JS-tæller ellers kunne være sårbar over for.
export function isAnyDialogOpen(): boolean {
  return document.querySelector('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]') !== null
}

// Bruges af de globale/øverste Escape-lyttere (App.tsx m.fl.) til at afgøre om
// Escape skal navigere ét skridt tilbage, eller lade noget andet forbruge den
// først — enten en åben dialog, ELLER et modul med sit eget interne
// "tilbage"-niveau (fx GameCorner → Arcade: spil → spil-menu → Arcade-menu →
// main Hub, eller GameCorner → Modern → Cube Basher-iframe → Modern-menu →
// main Hub), signaleret
// via `data-game-active` på <body>. Moduler med deres eget interne niveau må
// IKKE selv bruge denne funktion til at afgøre om DE skal reagere (den vil jo
// altid være true mens deres eget niveau er aktivt) — brug isAnyDialogOpen().
export function isAnyModalOpen(): boolean {
  return isAnyDialogOpen() || document.body.hasAttribute('data-game-active')
}
