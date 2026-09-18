# Spil-responsivitet (1.5.3)

Problem: spillene foeles ikke glidende/responsive laengere. Aarsag: alle loops
flytter FAST pr. frame uden delta-tid, saa ved svingende FPS bliver alt for
hurtigt/langsomt og hakkende. Input-modellerne (holdt-tast / input-koe) er OK.

Loesning: fast-timestep-akkumulator (kald fysik-skridt i faste 60Hz-trin, tegn
en gang pr. frame). Bevarer kollisions-matematik praecist, men afkobler fra
skaermens opdateringsrate -> korrekt hastighed + glidende ved alle FPS.

## Fase 1 - Pilot
- [x] BrickBreak: akkumulator om updatePaddleFromKeys + gameLoop, draw 1x/frame
- [ ] Verificer i dev (paddle foeles glat, bold korrekt hastighed) <- BRUGER TESTER

## Fase 2 - Resten af Arcade-spillene
- [ ] EndlessDodger: adskil update/draw, akkumulator
- [ ] NexiFlyer: akkumulator paa step
- [ ] Tetris: bekraeft/normaliser gravity-timing (bruger allerede timestamp)
- [ ] NeonSnake: partikler/flash delta-normaliseres (tick er allerede tidsbaseret)

## Fase 3 - Faelles
- [ ] Overvej delt hook useFixedTimestep til fremtidige spil
- [ ] Endelig test af alle inputs i alle spil
