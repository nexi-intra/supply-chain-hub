# Finsk ordliste til Word-Puzzle

Mål: finske ord (også bøjede) godkendes automatisk som på dansk/engelsk/svensk.
Kilder: fginter/hunspell-fi (CC0, bøjede former) + Kotus Nykysuomen sanalista 2024 (CC BY 4.0, grundformer).
Workeren læser allerede `electron/games/wordPuzzle/wordlists/fi.txt` (binærsøgning) – ingen ny runtime-kode nødvendig.

## Fase 1: Hent og undersøg kilderne
- [x] Hent hunspell-fi release (.xpi → fi_FI.aff/.dic) – Kotus 2024 blokeres af Cloudflare (403), skal hentes i browser
- [x] Undersøg format: stammer med numeriske affix-flag (FLAG num), ingen continuation classes

## Fase 2: Byg fi.txt.gz
- [x] `scripts/build-finnish-wordlist.cjs`: udvid hunspell-fi til ordformer (1.457.117 ord), Kotus via `--kotus`
- [x] Filtre: kun små bogstaver i kilden, kun fi-brikkebogstaver, 2-15 bogstaver, mindst én vokal, 2-bogstavsord fra fast liste, blokliste for forkortelser
- [x] Output gzip (4 MB, 19 MB udpakket); workeren gunzipper ved første brug (~130 ms)
- [x] Stikprøver: talo/talossa/kissoille/juoksisimme godkendt; Helsinki, km, atk afvist
- [x] Kotus 2024 som supplement: hentet i browser, genbygget med `--kotus` (+18.997 grundformer, i alt 1.476.114 ord; kode 100-fejlstavninger udeladt)

## Fase 3: Tests og dokumentation
- [x] wordChecker-test: bøjede former true, egennavn/forkortelse/nonsens false (130/130 grønne)
- [x] WORDLISTS.md: kilder, licenser, kildeangivelse, genbygningsvejledning
- [x] Opdater plans/multiplayer-word-puzzle.md (finsk punkt afkrydset)
- [x] tsc + vitest for multiplayer (67/67)
