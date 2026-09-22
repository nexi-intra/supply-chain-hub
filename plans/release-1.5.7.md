# Supply Chain Hub 1.5.7

## Baseline

- Startpunkt: GitHub Release `v1.5.6`
- Baseline-commit: `f815f7d`
- Udviklingsbranch: `develop/1.5.7`
- Lokal worktree: `C:\TCD Tools\Supply Chain Hub\Supply-Chain-Hub 1.5.7`

Version 1.5.6 er en frossen release-baseline. Alle nye rettelser og funktioner til
1.5.7 laves i denne worktree og må ikke ændres direkte på `main` eller tagget
`v1.5.6`.

## Kompatibilitet der skal bevares

- Det interne pakkenavn forbliver `tcd-hub`.
- Configfilen forbliver `supply-chan-hub.config`.
- Miljøvariablen forbliver `TCD_HUB_DATA_DIR`.
- Eksisterende data i platformroden, `_registry`, `_shared` og teammapper må ikke
  overskrives eller slettes af migreringer.
- Opdateringspakken skal fortsat indeholde `Supply Chain Hub.exe` i ZIP-roden.
- AI-modellen er `4b` (Qwen3-VL-4B). Skiftes den, skal den gamle fjernes fra
  allowlisten i `electron/aiModels.cjs`, saa oprydningen i `createLocalAI` selv
  frigiver disken hos brugerne — og de nye filer skal ligge paa det faelles drev
  FOER udgivelsen.

## Regler for baggrundsarbejde — den dyrest laerte lektie

1.5.5 indfoerte time-backuppen og gjorde appen naesten ubrugelig for alle. Én
daglig kopi blev til ti i timen, PR. KLIENT, mod ét delt drev med ~40 brugere.
Appen er latens-bundet: **det er antallet af rundture der koster, ikke antallet
af bytes.**

Foer der tilfoejes periodisk eller baggrundsarbejde, skal alle fire besvares:

1. **Hvad sker der naar 40 klienter goer det samtidig?** Standardsvaret er: drevet
   knaekker. Regn rundturene ud pr. klient pr. time FOER koden skrives.
2. **Skal kun ÉN klient goere det?** Saa skal pladsen KRAEVES foerst (laas eller
   markoer), og derefter laves det dyre. Aldrig omvendt.
3. **Konkurrerer det med brugerens egne handlinger?** Opstart er det VAERSTE
   tidspunkt. Udskyd, og skru ned (parallelisme 1 + pause mellem hver post).
4. **Hvordan ville jeg OPDAGE at det gik galt igen?** Findes der ingen log eller
   maaling, skal den bygges foerst.

Advarslerne `LANGSOM gemning`, `LANGSOM baggrundsopdatering` og `LANGSOM backup`
er derfor ALTID slaaet til — de laa tidligere bag `TCD_HUB_DEBUG`, og derfor var
det brugerne der opdagede problemet foer os.

## Og om tests

En suite der raaber ulv skjuler de aegte fejl. I 1.5.6 tilfoejede jeg
`assert.rejects` uden `await` i en synkron test, og afskrev derefter fejlen som
"den kendte flaky" i flere koersler. Den var min egen.

- En fejlende test skal identificeres ved NAVN foer den afskrives.
- Asynkrone assertions SKAL afventes; ellers koerer de efter oprydningen.
- Vent paa en betingelse med deadline, ikke paa et antal event-loop-tick, naar
  det der testes laver rigtig I/O.

## Arbejdsgang

1. Lav ændringer i denne worktree.
2. Tilføj release-noter i `src/lib/changelog.ts`, når indholdet til 1.5.7 er kendt.
3. Kør `npx tsc --noEmit`, `node --test electron/*.test.cjs`, `npx vitest run`.
4. Kør `npm run electron:build` og verificér `Supply Chain Hub-1.5.7-win.zip`.
   Scriptet bygger kun zip — det er den eneste pakke opdateringen bruger.
5. Push `develop/1.5.7`, opret `release/1.5.7` og PR mod `main`.
6. Opret først GitHub Release `v1.5.7`, når PR'en er merged og pakken er testet.
   Flyttes release-grenen bagefter, skal pakken BYGGES OM — tags flytter sig ikke
   med grenen, og i 1.5.6 manglede den foerste pakke to advarsler af den grund.

## Gaeld overfoert fra 1.5.6

- [ ] **"Annuller" sletter kladden** i `GuideEditor.tsx`. Uaendret adfaerd, men
      vaerd at genoverveje nu hvor kladder er en rigtig funktion.
- [ ] **Vision-encoderen kan halveres.** `mmproj` findes ogsaa i Q8_0 (433 MB mod
      797 MB). Ikke valgt endnu for at holde opsaetningen identisk med den
      afproevede konfiguration.
- [ ] **Brugerfladen venter paa netvaerket ved gemninger.** Fx
      `await appendToKvArray(...)` i `VirtualNotebook.tsx` — noten vises foerst
      naar drevet svarer. Kommentaren i `electronKvBridge.ts` paastaar allerede
      at UI'et er optimistisk; det passer ikke alle steder. Skal det foles
      oejeblikkeligt uanset drevets hastighed, skal aendringen vises med det samme
      og rulles tilbage ved fejl.

## Ændringer til 1.5.7

- Ingen endnu — worktree og versionsbaseline er klargjort.
