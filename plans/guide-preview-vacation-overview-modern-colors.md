# Guide-preview, feriedag-overblik, Modern-kortfarver

## Baggrund
Tre uafhængige forbedringer:
1. Guide Library: kunne se et preview af en guide FØR den gemmes/udgives, ikke først bagefter.
2. Feriekalender: når mange har fri samme dag, kan man kun se de første 3-4 + "+N" — ingen måde at se
   resten. Skal kunne "åbne" dagen og se den fulde liste.
3. Modern-modulet: Cube Basher og The Librarian har begge samme farve-gradient på deres kort — skal have
   hver sin farve, ligesom Arcades 5 spil-kort allerede gør. Skal huskes for fremtidige Modern-spil.

(Multiplayer-vurderingen er ren analyse, ingen kodeændringer — behandles separat efter denne plan.)

## Fase 1 — Guide-preview i GuideEditor
- [ ] `GuideEditor.tsx`: udtræk guide-konstruktions-logikken fra `handleSave` til en fælles helper der kan
      bygges BÅDE ved gem og ved preview (uden fil-upload/versionsbump/gem-kald)
- [ ] Tilføj en "Preview"-knap i editorens footer (ved siden af Gem/Annuller)
- [ ] Klik åbner en nestet `<GuideViewer>` med det aktuelle, IKKE-gemte udkast — samme mønster som den
      eksisterende viewer, blot uden `onEdit` (allerede i redigering)

## Fase 2 — Feriekalender: fuld dag-oversigt
- [ ] `VacationCalendar.tsx`: gør dag-cellen klikbar når `dayVacations.length > 0` (cursor-pointer, evt.
      hover-highlight)
- [ ] Nyt state: `selectedDayDetail: Date | null` + en simpel Dialog der viser FULD liste over
      `getDayVacations(day)` for den valgte dato (navn, farve, evt. noter) — genbruger eksisterende
      `getEmployeeColorByEmail`/`getFirstName`-helpers
- [ ] "+N"-teksten bliver til en rigtig klikbar affordance (fx "+N — se alle")

## Fase 3 — Modern: distinkte kortfarver
- [ ] `Modern.tsx`: giv Cube Basher og The Librarian hver sin OKLCH-farve/gradient (matcher Arcades
      `games[].color/gradient`-mønster) i stedet for det delte `oklch(0.55 0.19 25)`
- [ ] Opdater BÅDE kort-ikon-baggrund og header-titel-tekst-gradient til at bruge spillets egen farve
      (i stedet for et fast hardcodet header-farve delt af hele Modern-siden)
- [ ] Dokumentér konventionen (kommentar i Modern.tsx): fremtidige spil-kort SKAL have deres egen unikke
      farve, ikke genbruge en eksisterende

## Fase 4 — Verifikation & udrulning
- [ ] `npm run build` + `npm test`
- [ ] `npm run electron:build` (ingen dev-server kørende!) + smoke-test + robocopy til `TCD-Hub 1.4.3` +
      asar-verifikation
- [ ] git commit
