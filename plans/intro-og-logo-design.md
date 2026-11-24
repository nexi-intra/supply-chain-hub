# Intro ved start og nyt logo – design (1.6.7)

## Hvorfor

Når appen åbner, ser man en hvid skærm, indtil appen er indlæst (vinduet har ingen baggrundsfarve, og `index.html` er tom,
indtil koden kører). Jacob vil have en intro, der erstatter den hvide skærm og får det til at føles fedt at åbne appen – og
et nyt, mere eksklusivt logo, som introen ender i.

## Valgt (af Jacob i browser-gennemgangen 08.11)

- **Logo: nr. 9 "Kæde-H"** – tre guldkædeled danner bogstavet H (de to stående led er søjlerne, det liggende led binder
  dem sammen og hægter sig i begge), på en midnatsblå afrundet flise. Ordspil: Chain bliver til Hub.
- **Farver:** midnat `#0B1422`/`#1D2E47` (flise og baggrund), guld `#F8DC9C → #E6B04F → #C98A22`, navn i lys guld `#F7E7C4`.
- **Introen:** tingene flyver ind fra kanterne og bliver til hubben – fem betalingsterminaler (Lane/3600, Move/3500, N950,
  X70 med kundeskærm, P70) og de ting hubben samler (dokument, kalender, mail, guide, kolli). Tegnet i appens egen stil
  (ikke producenternes billeder).
- **Varighed:** introen erstatter kun den hvide skærm. Den kører, indtil appen er klar, og toner så ud. Ingen fast længde.

## Mål

- Ingen hvid skærm: fra første billede er vinduet midnatsblåt, og introen vises.
- Introen ser færdig og rolig ud, uanset hvornår den afbrydes (appen er ofte klar efter ~1 s).
- Logoet bruges overalt, hvor appen viser sit logo: introen, vinduets/proceslinjens ikon (`build/icon.ico`), favicon
  (`public/app-logo.svg`, `src/assets/images/app-logo.svg`).

## Ikke-mål

- Video eller lyd. Logo andre steder i brugerfladen (det gamle logo bruges ikke i selve UI'et).

## Anti-mål

- Appen må ikke starte langsommere på grund af introen.
- Introen må ikke hakke eller blive hængende efter appen er klar.
- Ingen hvidt blink mellem intro og app.

## Tilgange

- **Valgt: Ren HTML/CSS/SVG direkte i `index.html`.** Vises i samme øjeblik siden tegnes – før appens kode er indlæst –
  og koster ingen ekstra indlæsning.
- Fravalgt: video (skal selv indlæses først, fast længde), intro i React (vises først når koden er indlæst – for sent).

## Sådan

- **Vindue:** `BrowserWindow` får `backgroundColor: '#0B1422'`, så selv første billede før HTML er midnatsblåt.
- **Komposition (mit valg, så den ser rigtig ud uanset afbrydelse):** logoet er i midten fra start – de tre led glider
  sammen inden for ~0,6 s (søjlerne først, så hægter tværleddet sig i). Derefter strømmer tingene uafbrudt ind fra
  kanterne i en løkke, og hver gang én når midten, forsvinder den ind i logoet med et lille guldpuls. Under logoet:
  "Supply Chain Hub".
- **Klar-signal:** introen toner ud (~400 ms) i det øjeblik appen viser sin første rigtige skærm (login eller hub –
  ikke en indlæsnings-spinner), og fjernes derefter helt fra siden.
- **Reduceret bevægelse** (Windows-indstilling): logoet vises stille, ingen flyvende ting.
- **Skrift (mit valg):** Segoe UI Semibold til navnet – findes på alle Windows-pc'er, så intet skal hentes, og den vises
  fra første billede. (Mockups brugte Sora, som ville kræve en indbygget skriftfil.)
- **Ikon:** `build/icon.ico` genereres fra det nye logo i 16/24/32/48/64/128/256 px; favicon-SVG'erne erstattes.

## Overladt til bygger

- Præcise baner og tidspunkter for de flyvende ting; antal på skærmen ad gangen (rolig, ikke kaotisk).
- Hvor i React "første rigtige skærm" måles; hvordan ICO-filen laves (ingen billedværktøjer i projektet i dag).
- Test: en test for at introen fjernes når appen melder klar, og at den ikke bliver hængende; app-guidens dækningstest skal
  stadig bestå.
