# GDPR og datasikkerhed - Supply Chain Hub (review 2026-10-14)

Kilde: kodegennemgang af 1.6.3 + read-only tjek af rettigheder paa M:.
Ikke juridisk raadgivning - fund og prioritering skal vendes med Nexi's DPO / Group Privacy.

## Fase 1 - Hurtige rettelser i den nuvaerende arkitektur (faerdig, ikke committet)
- [x] DevTools (F12 / Ctrl+Shift+I) kun for creator i pakkede builds (`electron/main.cjs`)
- [x] Laesefilter i main-processen (`electron/privateViews.cjs`): `emails` kun egne, `notebook-notes`
      delte + egne, `sick-leave-entries` uden `reason` for andre end personen/indmelder/managere,
      `email-notifications` kan ikke laeses; skrivninger oversaettes fra personens visning
      (useKV-gem bevarer andres poster); hel-noegle-sletning afvist
- [x] `todos-personal-*` og `hub-notifications-dismissed-*` kan kun laeses af ejeren (`securedIpc.cjs`)
- [x] Krypter automatiske backups (samme AES-GCM som storen; laeses med `parseFileContents`)
- [x] Sygdom: bemaerkningen kopieres ikke ind i beskeden; feltet beder om kun praktiske oplysninger
      (hardkodet modtager i `src/lib/sickLeave.ts` - outboxen har ingen laeser i appen)
- [x] Slet bruger: backend fjerner vagter, fravaer, indbakke, personlige noter, mapper,
      foedselsdag, indstillinger og personlige noegler (`electron/userErasure.cjs`)
- [x] Klartekst-adgangskoder: `scripts/hash-legacy-passwords.cjs` - dry run 2026-10-14: 0 i alle teams
- [ ] Udgiv 1.6.3 (sygdoms-sletning + ovenstaaende) + skrub gamle backups

## Fase 2 - Opbevaring og rettigheder
- [x] Oprydning naar en bruger slettes - ogsaa faelles data (`electron/sharedErasure.cjs`): high-fives
      til/fra personen slettes; spil, Top 10 og forbedringer beholdes under pseudonym "Slettet bruger";
      adressen fjernes fra team-registret og samlevisninger (`registry.forgetUser`). Springes over hvis
      personen stadig har en konto i et andet team. E2E: `scripts/verify-account-erasure.cjs`
- [ ] Opbevaringsregler: beskeder, noter, ferie, multiplayer-chat, high-fives (aftales med HR/DPO)
- [ ] Privatlivstekst i appen (art. 13) + "Download mine data" (art. 15/20)
- [ ] Fortegnelse (art. 30) og evt. konsekvensanalyse (DPIA) med DPO
- [ ] IT: adgang til M:-mappen kun for de afdelinger der bruger appen; helst pr. team-mappe

## Fase 3 - Rigtig adgangsgraense (arkitektur)
- [ ] Beslut: lille intern server (anbefalet) / Microsoft 365 / kryptering pr. bruger
- [ ] Flyt electron/*.cjs-servicerne til serveren; kun serverens servicekonto har adgang til data
- [ ] Login via Windows/Entra ID i stedet for egne adgangskoder
