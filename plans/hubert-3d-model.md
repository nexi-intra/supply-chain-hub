# Hubert 3D - ny model fra Meshy (1.6.3)

Oprettet 2026-10-13. Kilde: `C:\TCD Tools\Supply Chain Hub\Hubert-model\*.glb` (Meshy, CC BY 4.0 - kreditering kræves).
Princip: Meshy-modellens krop + tekstur erstatter metaball-kroppen og den genererede pels i `scripts/blender/hubert.py`.
Huberts eget skelet, alle positurer, kurv, ben/godbid, kameraer, rammer og strimmelformat bevares, så `Hubert.tsx`,
`hubertMotion.ts` og `hubertRoutine.ts` ikke skal ændres.

## Fase 1 - modellen på Huberts skelet (test)
- [x] `--model <glb>`: importér Meshy-mesh, vend/skalér, flyt Meshy-skelettets led oven på Huberts led (retarget), overfør Meshys egne vægte til Huberts knogler.
- [x] Stå, gå, sidde, ligge i kurv renderet og vurderet (hofter, ben, hale, kurvkant).

## Fase 2 - alle animationer
- [x] Alle 45 strimler + `hubert.json` (samme navne, rammer, fps og ankre) renderet og pakket til `src/assets/multiplayer`.
- [x] Kontaktark gennemgået; ingen beskårne ører/haler, ingen ben gennem gulv eller kurv. (Halen hviler over kurvens bagkant i dele af "læg dig ned"/"rejs dig" - ser naturligt ud, accepteret.)

## Fase 3 - nyt chat-ikon (droppet 2026-10-13)
- [x] ~~Portræt af modellen som chat-ikon~~ - brugeren ville have det gamle robot-logo tilbage ("det ligner ham for meget"). `HubertIcon.tsx` er som i 1.6.2; portræt-PNG og `hubert-icon.py` er slettet.

## Fase 5 - realistisk liggestilling i kurven (brugerens feedback 2026-10-13)
- [x] Ny `MODEL_LIE`: brystet nede mellem underarmene, forbenene fladt frem på puden, hofterne rullet om på siden med bagbenene foldet (i stedet for en stiv sphinx, der "stod på knæ").
- [x] Sover med hovedet på forpoterne; tygger på et ben holdt op mellem poterne.
- [x] Læg dig ned: sidder først, skubber så forbenene frem og ruller om på hoften. Rejs dig: op i siddende, så op at stå. Små skridt mens han drejer, så poterne bliver i kurven.
- [x] Alle 8 kurv-animationer gen-renderet og pakket (`--posefile` + `top`-visning i look-mode til pose-arbejde).

## Fase 4 - ind i 1.6.3
- [x] Kreditering af Meshy-modellen (CC BY 4.0) i appen (Huberts indstillingsmenu + "Hvad er nyt").
- [x] tsc, vitest, Electron-tests, E2E (multiplayer, skak), skærmbillede af rummet. (tsc 0, Electron 1189/1189, vitest 1365 + 1 skip, alle 8 E2E bestået.)
- [x] Linje i "Hvad er nyt".
