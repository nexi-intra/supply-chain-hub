# Word-Puzzle word lists

Offline word validation for the Word-Puzzle game. Checking runs in a `worker_threads` worker (`wordCheckWorker.cjs`), never on the Electron main thread; `wordChecker.cjs` is the main-thread client.

| Language | Source | Version | Licence | Loaded as |
| --- | --- | --- | --- | --- |
| da | npm `dictionary-da` (Stavekontrolden `da_DK`, Foreningen for frit tilgængelige sprogværktøjer, stavekontrolden.dk) | 6.0.0 (Stavekontrolden 2.8.034, 173,515 entries) | GPL-2.0 OR LGPL-2.1 OR MPL-1.1 (we use it under MPL-1.1/LGPL-2.1 terms) | Hunspell `index.aff`/`index.dic` via `nspell` |
| en | npm `dictionary-en` (SCOWL `en_US`, size 60, American spelling) | 4.0.0 (dictionary 2020.12.07, 49,568 entries) | MIT AND BSD | Hunspell via `nspell` |
| sv | npm `dictionary-sv` (Den stora svenska ordlistan, via LibreOffice extensions) | 4.0.0 (153,714 entries) | LGPL-3.0 | Hunspell via `nspell` |
| fi | fginter/hunspell-fi (https://github.com/fginter/hunspell-fi), built from TurkuNLP's Finnish parsebank and filtered with Voikko; expanded to every word form | release 0.2, Dec 2023 (476,291 stems, 1,457,117 game words after filtering) | CC0 (README "License" section) | `wordlists/fi.txt.gz`, built by `scripts/build-finnish-wordlist.cjs`; binary search |
| fi | Kotus "Nykysuomen sanalista" (Kotimaisten kielten keskus), base forms | 2024 file `nykysuomensanalista2024.txt` (104,743 entries, adds 18,997 game words) | CC BY 4.0 | merged into the same `wordlists/fi.txt.gz` (1,476,114 words) |
| - | npm `nspell` (spell-check engine) | 2.1.5 | MIT | `require('nspell')` |

## How it is loaded

- Versions are pinned exactly in `package.json`. The dictionary packages are ESM-only, so the worker finds `node_modules/dictionary-<lang>/index.aff|dic` by walking up from `__dirname` and reads them with `fs.readFileSync` (works inside `app.asar`).
- Each language is loaded lazily on its first request. The input word is upper case; the lower-case form is checked with `spell.correct()`, so words that exist only with a capital letter (proper nouns such as `KØBENHAVN`) are rejected.
- A word must be 2-15 letters and use only letters of that language's tile set (`tileSets.cjs`), otherwise it is `false`.
- Licence note: the da/sv dictionaries are (L)GPL/MPL data files read at runtime, not linked code. Keep their licence files (shipped in `node_modules/dictionary-*/license`) with the app, and do not modify the dictionaries without re-checking the terms.

## Finnish

There is no npm Hunspell package for Finnish. `wordlists/fi.txt.gz` (gzip, about 4 MB; 19 MB unpacked) is generated from the hunspell-fi 0.2 release `fi-spell-0.2.xpi` (zip containing `dictionaries/fi_FI/fi_FI.aff|dic`):

```
node scripts/build-finnish-wordlist.cjs --hunspell <dir with fi_FI.aff/.dic> [--kotus nykysuomensanalista2024.txt]
```

The script expands every stem with its suffix/prefix rules (incl. cross products) and keeps a form only if:
- the source spells it all lowercase (drops proper nouns and capitalised abbreviations);
- it has 2-15 letters, all in the `fi` tile set (so no Q, X, Z, Å) and at least one vowel;
- two-letter forms are on a fixed list of real words (`TWO_LETTER_WORDS`), and a short blocklist (`BLOCKED`) removes lowercase abbreviations such as `alv`, `atk`, `klo`.

Output: one upper-case NFC word per line, deduplicated, sorted by UTF-16 code unit, gzip level 9. The worker gunzips it once on first use (about 130 ms) and binary-searches it.

Kotus supplement (included): the "Nykysuomen sanalista 2024" (https://kotus.fi/sanakirjat/kielitoimiston-sanakirja/nykysuomen-sana-aineistot/nykysuomen-sanalista/, CC BY 4.0) adds base forms missing from hunspell-fi. Its download is behind a Cloudflare browser check, so it must be saved from a browser (Ctrl+S on the TXT page) and passed with `--kotus`. Columns are tab-separated (Hakusana, Homonymia, Sanaluokka, Taivutustiedot); entries with inflection type 100 (misspellings such as `alppinismi`) are skipped. Attribution: "Nykysuomen sanalista. Kotimaisten kielten keskus. Updated 30.4.2024. CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: filtered to single words valid in the Word-Puzzle tile set and merged with hunspell-fi."

Words not on the list are not rejected outright: like the other languages, a `false` word goes to opponent approval.
