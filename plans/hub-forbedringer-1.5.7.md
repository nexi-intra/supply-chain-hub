# Hub-forbedringer 1.5.7

Godkendt af bruger: sjaldne opgaver genbruges; ferie-preview viser afventende og
godkendte i samme team; billedrotation gemmes og eksporteres; Word-layout bevares
via original DOCX, der redigeres i Word og genindlaeses i Hub. Ingen demo-data.

## Fase 1 - planlaegning og ferie

- [x] Giv vagtplanroller en valgfri 'kun ved tildeling'-egenskab; bevar gamle rollers adfaerd.
- [x] Skjul denne rolle i Hub-widgeten, naar ingen er tildelt i dag; test arbejdsflowet.
- [x] Vis godkendte og afventende anmodninger i lederens ferie-preview med tydelig status, uden dubletter og uden data fra andre teams.
- [x] Gennemgaa adgangskontrol, datakonsistens og fokuserede tests.

## Fase 2 - guidebilleder

- [x] Indsaet billede fra clipboard ved almindelig Ctrl+V i editorens billedfelt.
- [x] Roter gemte og importerede guidebilleder med vedvarende aendring i visning og DOCX-eksport.
- [ ] Test billedehandlinger, filstorrelse, format og versions-/kladdeopfoersel.

## Fase 3 - originalt Word-layout

- [x] Tilfoej importvalg for original DOCX uden layoutkonvertering.
- [x] Aabn originalfilen lokalt i Word til redigering og lad brugeren genindlaese den rettede fil i Hub.
- [x] Bevar versionshistorik, guidevisning og DOCX-eksport af originalen uden tab af tabeller.
- [ ] Test import, afbrydelse, gensendelse og sikker filhaandtering.

## Fase 4 - samlet kvalitet

- [x] Koer typecheck, relevante tests, fuld suite og produktionsbygning.
- [x] Code-review nye flows for rettigheder, race conditions og M:-drevs-adfaerd.
- [ ] Verificer i live Electron-udviklingsvinduet uden at skrive demo-data paa M:.

Fokuserede tests og samlet suite er koert uden live-data: 428 Electron-tests og
169 Vitest-tests bestod. Produktionsbygning, encoding og git diff --check bestod.
Manuel kontrol af clipboard/rotation, original-DOCX i Word og autosave/afbrudt
genindlaesning i live Electron mangler; test ikke mod M: uden aftalt testmiljoe.