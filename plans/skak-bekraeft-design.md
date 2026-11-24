# Skak: bekræft trækket før det sendes – kort design

Status: brainstorm 05.11.2026 (Hub 1.6.6). Lille ændring – kort design, ingen bygherre-tjek.
Markeringen **(mit valg)** betyder: besluttet af AI'en, ikke aftalt med brugeren – kan rettes.

## Hvorfor
I skak sendes et træk, så snart brikken slippes på et lovligt felt – et fejlklik koster trækket. I backgammon
står trækkene kun på ens egen skærm, til man trykker "Bekræft", og "Fortryd" sætter brikkerne tilbage. Brugeren vil
have det samme i skak.

## Hvad (brugerens valg)
- **Ét træk ad gangen, som i backgammon:** man rykker sit træk; brikken står på brættet hos én selv; modstanderen ser
  intet. Under brættet: **"Fortryd"** (brikken tilbage, man kan rykke igen) og **"Bekræft"** (trækket sendes; nu er
  det modstanderens tur).
- **Altid slået til** for alle – ingen indstilling til at slå det fra.

## Detaljer (mit valg)
- Mens et træk venter: brættet tager ikke imod flere træk; "Fortryd"/"Bekræft" står samme sted og i samme stil som i
  backgammon (`bgr-chip`, ikonerne `ArrowCounterClockwise` og `Check`, tekster fra de eksisterende labels hvis de
  findes – ellers "Fortryd"/"Bekræft" og "Undo"/"Confirm").
- Bondeforvandling: valget (dronning, tårn …) træffes som i dag, når brikken slippes; det er en del af det ventende træk.
- Tastatur: **Enter** bekræfter, **Escape** fortryder (før Escape fjerner en løftet brik/går til lobbyen).
- Lyd: brikkens lande-lyd kommer, når brikken slippes (som i dag – man mærker trækket); "skak"-lyden og
  skærmlæser-meddelelsen kommer først, når trækket er bekræftet og modtaget (som i dag efter et sendt træk).
- Nulstilling: kommer der en ny stilling fra modstanderen/tjenesten, mens et træk venter (fx opgivet, remis-tilbud
  besvaret, spillet slut), fjernes det ventende træk, og brættet viser den nye stilling. Afvises "Bekræft" (fx træk
  ikke længere lovligt), går brikken tilbage som i dag ved et afvist træk.
- Forlader man spillet med et ventende træk, sendes det ikke.

## Ikke-mål
- Frit "tænke-bræt" med flere træk eller modstanderens brikker.
- Ændringer i skakreglerne (`electron/games/chess/rules.cjs`), i det, der gemmes, eller i backgammon.

## Tilgange
| | Tilgang | Valg |
|---|---|---|
| **1** | Det ventende træk holdes i skak-skærmen (`ChessGame.tsx`) som i backgammon; brættets eksisterende "vis trækket med det samme" og `syncKey`-nulstilling genbruges | **Valgt** |
| 2 | Brættet (`ChessBoard.tsx`) holder selv det ventende træk | Fravalgt – blander "hvad står der" og "hvad er sendt"; sværere at nulstille ved nyt fra modstanderen |
| 3 | Det ventende træk gemmes i tjenesten/på M: | Fravalgt – modstanderen kunne se det, og det strider mod "intet sendes før Bekræft" |

## Test
- E2E `scripts/verify-chess.cjs` opdateres: et træk efterfølges af "Bekræft"; nyt tjek: et træk + "Fortryd" sætter
  brikken tilbage og sender intet (modstanderens stilling uændret); Enter bekræfter.
- Rene hjælpere (hvis der kommer nogen, fx "skal det ventende træk nulstilles") testes med vitest.
- Changelog 1.6.6: "Skak: et træk sendes først, når du trykker Bekræft – Fortryd sætter brikken tilbage (som i backgammon)".

## Overladt til bygherren
Præcis placering af knapperne i skak-layoutet, hvordan "ventende træk" holdes i state, og hvordan `interactive`
slås fra, mens et træk venter.
