# Fix performance-fund i Game Corner + generel smoothness

## Fase 1 — BrickBreak: fjern unødvendig re-render på paddle-bevægelse
- [x] Fjern `setPaddle(...)`-kald ved tastatur/muse-bevægelse (behold kun `paddleRef.current`)
- [x] Flyt tastatur-baseret paddle-opdatering ind i det eksisterende rAF-loop (fjern separat `setInterval(16ms)`)
- [x] Behold `setPaddle` de steder det reelt bruges til UI (powerup-resize m.m.), kun fjern det fra bevægelses-hot-path

## Fase 2 — GuideLibrary tom-tilstand: fjern dyrt blur+animation-mønster
- [x] Erstat `blur-2xl` + `animate-pulse` + framer-motion `repeat: Infinity` med et billigere alternativ (ren CSS transform/opacity, ingen blur)

## Fase 3 — Lazy-load individuelle spil i Game Corner
- [x] Konvertér de 5 spil-imports i GameCorner.tsx til `React.lazy()` + `Suspense`
- [x] Verificér med build at hvert spil får sit eget chunk

## Fase 4 — Hønseinvasionen (EndlessDodger.tsx): omskriv rendering til canvas
- [x] Tilføj `<canvas>`-element, fjern DOM-baseret rendering af chickens/eggs/bullets/particles/powerups
- [x] Tegn alle spil-objekter imperativt på canvas i rAF-loopet (samme mønster som Tetris/NexiFlyer/NeonSnake)
- [x] Fjern `setChickens/setEggs/setBullets/setPowerUps/setParticles`-kald fra loopet — brug kun refs
- [x] Behold UI-elementer der IKKE er spil-objekter (score, liv, wave-banner, shake-effekt) som React/framer-motion, kun spil-objekterne flyttes til canvas
- [x] Test grundigt: kollisioner, powerups, partikel-effekter, wave-progression skal se ens ud som før
- [x] Fjern det duplikerede SVG-gradient-id samtidig (løses automatisk når det bliver canvas-tegning)

## Efter hver fase
- `npm run build` + `npm run electron:build` for at verificere
- Deploy til `TCD-Hub 1.4.2`
- Commit med beskrivende besked

## Bonusfund undervejs (fase 4)
Under omskrivningen til canvas blev en ekstra, hidtil ukendt bug fundet og rettet som
naturlig konsekvens af omstruktureringen: `startGame()` målte spilområdets bredde
(`gameAreaRef.current.getBoundingClientRect()`) FØR React havde nået at montere
spil-visningen — ref'en var derfor altid `null` på præcis det tidspunkt. Konsekvens:
skibet startede altid i venstre side (x=0) i stedet for centreret, og bølge 1 blev
sprunget helt over (spillet startede reelt på bølge 2). Løst ved at flytte
"centrér skib + spawn bølge 1"-logikken ind i `runGameLoop`'s første tick (styret af
et `pendingFirstSpawnRef`-flag), hvor `gameAreaRef.current` garanteret er sat.

