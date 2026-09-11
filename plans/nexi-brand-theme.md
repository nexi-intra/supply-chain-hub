# Professionelt Nexi-brand visuelt udtryk

## Mål
Omdanne appens legende lilla/pink/teal-udtryk til et professionelt corporate-udtryk,
der matcher nexigroup.com: Nexi-blå som primærfarve, rene hvide flader, navy-mørke
kontraster, afdæmpede accenter, professionel typografi (Inter) og det rigtige Nexi-logo.

## Fase 1: Brand-fundament
- [x] Hent/genskab det rigtige Nexi-logo (SVG-wordmark) og erstat `nexi-logo.svg`.
- [x] Skift typografi til Inter (Google Fonts + font-family i CSS).
- [x] Omlæg tema-tokens i `main.css` (lys + mørk): Nexi-blå primær, navy foreground,
      rene baggrunde, afdæmpet accent — rammer alle `bg-primary`/`text-primary`/
      `from-primary to-accent`-brug i hele appen på én gang.

## Fase 2: Globale baggrunde
- [x] `AnimatedBackground`: afdæmpet, subtil professionel baggrund (bløde blå toner).
- [x] Auth-skærmen: rent corporate-udtryk med det nye logo.

## Fase 3: Hub
- [x] Header/logo-område og titel i brand-stil.
- [x] Modulkort: ensartet professionel stil (navy/blå nuancer i stedet for regnbue-gradienter).
- [x] Oversigtskort (Team Opgaver, Fri/Syge I Dag, Dagens Måltid) strammes op.

## Fase 4: Views og Game Corner
- [x] Alle modul-headere: ensartet Nexi-navy gradient i stedet for lilla/pink pr. modul.
- [x] GameCorner: professionel ramme (spillene selv beholder deres personlighed).

## Fase 5: Verificering
- [x] Playwright-screenshots af alle views (lys + mørk) til visuel kontrol.
- [x] Build + typecheck uden nye fejl; commit til PR #19.

---
**Forslag:** Start med Fase 1 (temaet løfter 80 % af appen alene), derefter 2-4, så 5.
