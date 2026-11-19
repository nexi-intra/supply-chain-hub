# Skak i Multiplayer

Mål: Skak som spil nr. 2 i Multiplayer-modulet. Samme ramme som Word-Puzzle (udfordring, invitation, tur-notifikationer, chat, Hubert, hyggeligt rum, "Dine opgør", rangliste), men med et smukt skakbræt, flotte brikker og lækre animationer.

## Arkitektur (genbrug)
- Samme service (`electron/multiplayer.cjs`), samme index/filer på M:, samme IPC. Spillet får `type: 'chess'` på index-entry; alt eksisterende Word-Puzzle-data er uændret (manglende type = word-puzzle).
- Regelmotor: `chess.js` (BSD-2, velafprøvet) i main-processen er autoritativ. Klienten får lovlige træk i projektionen, så den aldrig selv afgør reglerne.
- Fælles kommandoer genbruges: challenge (nu med `gameType`), respond, cancel, resign, remind, chat, acknowledge, hubert.
- Nye skak-kommandoer: `chess-move { from, to, promotion? }`, `offer-draw`, `respond-draw { accept }`.
- Resultater: skakmat, opgivet, remis aftalt, pat, trefoldig gentagelse, 50-træksreglen, utilstrækkeligt materiale. Ingen ur (korrespondanceskak, som Word-Puzzle).
- Stillinger: resultater gemmes allerede pr. spiltype, så "Dine opgør" og ranglisten for skak kommer gratis.
- Visuelt: præcis samme ramme som Word-Puzzle – stuen, bordet og Hubert (`BoardGameRoom`, `RoomScene`, `Hubert`, papirer/notesblok, godbidder og kødben) genbruges uændret. Kun brættet på bordet, brikkerne og de skak-specifikke sidepaneler er nye.

## Fase 1: Regler og service (Sonnet)
- [x] `chess.js` tilføjet (fastlåst version, licens noteret)
- [x] `electron/games/chess/` med oprettelse, træk, remis-tilbud, slutstillinger og projektion (FEN, min farve, lovlige træk, trækhistorik med SAN, slåede brikker, skak/mat-flag, sidste træk)
- [x] Servicen generaliseret til flere spiltyper uden at ændre Word-Puzzle-adfærd
- [x] Udfordring vælger spil; skak: udfordrer vælger hvid/sort/tilfældig
- [x] Notifikationstekster pr. spiltype
- [x] Node-tests: lovlige/ulovlige træk, rokade, en passant, forvandling, mat, pat, remis-regler, remis-tilbud, opgiv, revision/konflikter, idempotens, Word-Puzzle uændret

## Fase 2: Lobby og hub (Opus)
- [x] Skak-kort i Multiplayer-hubben
- [x] Skak-lobby i samme stil som Word-Puzzle (marquee med skak-motiv), "Dine opgør" og rangliste for skak
- [x] Udfordringsdialog med farvevalg for skak

## Fase 3: Bræt, brikker og animationer (Opus)
- [x] Smukt bræt (træ/marmor, koordinater, lys der passer til dag/aften i rummet)
- [x] Flotte brikker (egne SVG eller renderede), tydelige på bordet
- [x] Animationer: løft (brikken hæver sig med skygge), glid/hop til feltet, slag (brikken væltes/skubbes af brættet til siden), rokade, en passant, forvandling, skak-markering, mat-afslutning
- [x] Træk via klik og træk-og-slip, lovlige felter vises, sidste træk markeret, forvandlingsvalg
- [x] Slåede brikker står ved siden af brættet; trækliste i notesblok-stil; chat og Hubert som i Word-Puzzle
- [x] Reduceret bevægelse respekteres; dansk/engelsk/svensk/finsk tekster

## Fase 4: Verifikation
- [x] tsc, vitest, node-tests, Word-Puzzle E2E stadig grøn
- [x] Skak E2E: udfordring → accept → træk → slag → mat i isoleret Electron (`scripts/verify-chess.cjs`)
- [x] Skærmbilleder (lys/mørk) og test i sandbox-vinduer
