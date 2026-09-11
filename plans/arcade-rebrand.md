# Rebrand: Hønseinvasionen → Chickeninvasion, Game Corner får nyt undermodul "Arcade"

## Baggrund
- Spillet "Hønseinvasionen" (EndlessDodger.tsx) skal have et ikke-dansk navn: "Chickeninvasion".
- Alle spil i "Game Corner" skal samles i et NYT undermodul kaldet "Arcade", som ligger INDE I Game Corner.
  Game Corner forbliver selv det øverste hub-modul (uændret navn); det er først når man åbner Game Corner,
  at man ser et enkelt kort "Arcade", som fører ind til spillene.

## Fase 1 — Chickeninvasion
- [x] `src/components/EndlessDodger.tsx`: in-game header "Hønseinvasionen" → "Chickeninvasion"
- [x] Spilkortets `title` inde i spilliste → "Chickeninvasion"
- [x] `src/views/ManagerPanel.tsx`: inder-fane-label + `gameTitle`-prop → "Chickeninvasion"

## Fase 2 — Game Corner → Arcade (FLAD omdøbning — VISTE SIG FORKERT, se Fase 4)
- [x] ~~Omdøb fil `src/views/GameCorner.tsx` → `src/views/Arcade.tsx` osv.~~ (rullet tilbage i fase 4)
- [x] ~~Hovedtitel i selve viewet ændret til "Arcade"~~ (rullet tilbage i fase 4)
- [x] ~~`App.tsx`/`appNavigation.ts`/`Hub.tsx`/`CommandPalette.tsx`/`translations.ts` omdøbt til `arcade`~~ (rullet tilbage i fase 4)

**Brugerens korrektion:** "Det er forkert, når man åbner gamecorner modulet ude fra main hubben, så skal der
game corner hubben åbne, det er DERINDE at der skal oprettes et modul der hedder Arcade som skal indeholde
de spil der er lavet." → Game Corner skal IKKE omdøbes; Arcade skal være et NYT undermodul indeni.

## Fase 4 — Korrektion: nestet struktur (main Hub → Game Corner → Arcade → spil)
- [x] `src/App.tsx`: revert import/`View`-type/routing tilbage til `games` → `GameCorner`
- [x] `src/lib/appNavigation.ts`: `AppViewId` revert `arcade` → `games`
- [x] `src/views/Hub.tsx`: modul-id + title/description-reference revert → `games`
- [x] `src/components/CommandPalette.tsx`: modul-id + label revert → "Spilhjørnet"/"Game Corner"
- [x] `src/lib/translations.ts`: `hub.modules.arcade`→`hub.modules.games` (da: "Spil Hjørnet", en: "Game Corner"),
      `hub.descriptions.arcade`→`hub.descriptions.games` (revert); `managerPanel.tabs.games`-værdi bevaret som
      "Arcade" (samme spil-administrations-fane, nu under Arcade-branding)
- [x] `src/lib/modalStack.ts`: kommentar opdateret til 3-niveaus nesting (GameCorner → Arcade → spil)
- [x] Nyt `src/views/GameCorner.tsx` oprettet: landing-side med "Spilhjørnet"/"Game Corner"-header og ét
      kort "Arcade" (Joystick-ikon), som skifter til nestet `<Arcade>`-komponent
- [x] `src/views/Arcade.tsx`: bevaret som nestet component (uændret spil-logik), tilbage-knap opdateret til
      "Tilbage til Spilhjørnet"/"Back to Game Corner" (går nu til GameCorner's `view='hub'`, ikke main Hub)
- [x] Escape-håndtering: `GameCorner.tsx` tjekker `isAnyModalOpen()` + `view !== 'hub'` før den kalder
      `onNavigateBack()`, så `Arcade.tsx`'s egen Escape-håndtering (kun `isAnyDialogOpen()`) får lov at styre
      tilbage-navigation mens Arcade er vist

## Fase 5 — Verifikation & udrulning
- [x] `npm run build` + `npm test` (67/67 grønne)
- [x] `npm run electron:build` + smoke-test + robocopy til `TCD-Hub 1.4.2` + asar-verifikation
- [x] git commit (`bf8f79e`)

