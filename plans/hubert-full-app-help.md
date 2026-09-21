# Hubert: fuld hjaelp i hele hubben (+ generel AI-tilstand)

Maal (brugerens ord): *"jeg vil bare have at hubert kan svare paa ALT i hubben, og
virkelig kan hjaelpe en igennem appen, saadan at man virkelig foeler at den kan
hjaelpe en"* — plus loesning A (eksplicit generel-tilstand ved siden af den
databaserede).

## Diagnose: hvorfor foeles Hubert uhjaelpsom i dag

Fire konkrete aarsager, alle i vores egen kode (ikke i modellen). Maalt
2026-09-21 mod de faktiske emne-regexer — se `hubert-test-questions.md`:

1. **"Hvordan goer jeg X?" bliver til et dataopslag.** Det stoerste problem:
   **12 af 14** how-to-spoergsmaal rammer et datamodul og ender i `mode: 'data'`,
   som returnerer en liste af *registreringer* i stedet for en vejledning — og
   `mode: 'data'` springer modellen over. De taeller som "besvaret".
2. **Fejlrutning paa noegleord.** *"opgave"* i et to-do-spoergsmaal rammer
   vagtplanen; *"besked"* i et spoergsmaal om en fejlbesked soeger i indbakken.
   Svaret bliver ikke bare ubrugeligt, men fra det forkerte modul.
3. **Emne-filteret afviser resten.** Rammer spoergsmaalet ingen af de ~17
   hardkodede emner, returneres en fast afvisning (`mode: 'unsupported'`) og
   modellen kaldes aldrig. Det rammer bl.a. *"Hvad kan du hjaelpe mig med?"* —
   det mest naturlige foerste spoergsmaal overhovedet.
4. **Modellen bruges naesten aldrig.** Den koerer kun paa hentet guide-tekst
   (`answer.sources.length > 0`). I praksis er "AI-assistenten" for det meste slet
   ikke AI — den er et opslagsvaerk.

Konsekvens: appen har en fuldt kapabel 8B-model liggende, som stort set aldrig
kommer i spil. Der er **ingen** begraensning i selve modellen.

Bemaerk ogsaa: `hubert-unanswered-questions` logger **kun** `mode: 'unsupported'`.
De fejlrutede dataopslag er derfor usynlige i loggen — den indeholdt kun 2 poster
paa tvaers af alle teams og undervurderer problemet kraftigt.

---

## Fase 1 — Udgangspunkt

Besluttet: arbejdet sker i **1.5.5**, som endnu ikke er udgivet til klienter
(manifestet peger fortsat paa 1.5.4). Ingen ny worktree, intet versionsbump.

- [x] Bekraeftet at vi retter direkte i `Supply-Chain-Hub 1.5.5` (`develop/1.5.5`)
- [x] Hentet de loggede ubesvarede spoergsmaal fra alle teams — kun 2 poster,
      fordi loggen kun daekker `mode: 'unsupported'` og dermed misser de
      fejlrutede dataopslag
- [x] Skrevet fast testliste paa 30 spoergsmaal: `plans/hubert-test-questions.md`
- [x] Maalt udgangspunkt mod de faktiske emne-regexer: 12/14 how-to fejlrutes til
      dataopslag, 6/30 afvises blankt, modellen kaldes stort set aldrig

**Anbefaling til fase 2:** udvid ogsaa loggen til at fange "besvaret, men
sandsynligvis ubrugeligt" (how-to der endte i `mode: 'data'`), saa vi kan maale
daekningen loebende i stedet for kun ved udgivelse.

## Fase 2 — Indbygget app-viden (stoerste gevinst)

Hubert manglede en beskrivelse af *appen selv*. Den er nu skrevet af os, foelger
koden og kan derfor ikke hallucineres.

- [x] Nyt modul `electron/assistantAppGuide.cjs` med struktureret viden pr. modul:
      hvad det er, hvor man finder det, og trin-for-trin til de almindeligste opgaver
- [x] Daekker alle 12 modulfelter paa forsiden (inkl. de to der endnu ikke er
      bygget) plus 7 tvaergaaende emner: navigation, forsidens widgets, tema og
      sprog, profil, roller og rettigheder, drev/offline, opdateringer, samt hvad
      Hubert selv kan
- [x] Rettighedsbevidst: manager-opgaver skjules for almindelige brugere — men
      uden at efterlade dem i en blindgyde (spoerger man hvorfor et felt er laast,
      faar man rolle-forklaringen)
- [x] `matchAppGuide()` scorer paa noegleord med **praefiks-match**, saa danske
      sammensatte og boejede ord rammer (ferie*anmodning*, vagtplan*en*)
- [x] 12 tests i `electron/assistantAppGuide.test.cjs`, heriblandt en der laeser
      modul-felterne i `Hub.tsx` og fejler hvis et nyt modul mangler app-viden
- [x] Valideret: tsc ren, 105/105 vitest, 12/12 nye tests

**Resultat maalt mod fase 1-udgangspunktet: 20 af 20** tidligere fejlende
spoergsmaal rammer nu det rigtige modul eller emne — inklusive de fejlrutede
("opgave" -> To Do i stedet for Vagtplan, "besked" -> drev/offline i stedet for
indbakken) og det tidligere blankt afviste *"Hvad kan du hjaelpe mig med?"*.

Sprogvalg: indholdet skrives **kun paa dansk**. Hubert svarer altid paa
spoergsmaalets sprog, og modellen oversaetter evidensen undervejs — samme
princip som guider skrevet paa ét sprog. Det holder app-viden i én vedligeholdt
kilde i stedet for tre der driver fra hinanden.

**Bemaerk:** app-viden er endnu ikke koblet paa svarvejen — det sker i fase 3.
Modulet er additivt og aendrer derfor ikke Huberts opfoersel endnu.

## Fase 3 — Skeln mellem "hvordan" og "hvad"

- [x] Detekter procedure-spoergsmaal (hvordan/hvor finder jeg/kan jeg/how do I/miten)
- [x] Rut dem til app-viden i stedet for et raat dataopslag — ny tilstand
      `mode: 'app-guide'` i `assistantContext.cjs`, indsat efter handlings-
      genkendelsen og foer dataopslagene
- [x] **Send dem gennem modellen** — `app-guide` staar bevidst IKKE paa
      main.cjs' liste over tilstande der springer modellen over, og leveres med
      en kilde, saa evidens-porten passeres. En test laeser `main.cjs` og fejler
      hvis nogen tilfoejer den til listen
- [x] Faktuelle opslag beholder den nuvaerende datavej (regressionsgruppe B)
- [x] Manager-opgaver forklares som rettighedskrav i stedet for at blive
      erstattet af en tilfaeldig anden opgave fra samme modul
- [x] Valideret: tsc ren, 105/105 vitest, 402/403 electron-tests

**To aegte fejl fundet og rettet undervejs:**

1. Opgaver arvede modulets score, saa et loest ord som "uge" kunne goere
   *"hvordan ser min uge ud?"* til en vejledning. Opgaver skal nu ramme paa
   deres EGNE ord.
2. Min foerste how-to-detektion indeholdt "skal jeg" og kaprede dermed
   *"hvilke opgaver skal jeg lave naeste uge"* — et rent dataspoergsmaal.
   Fanget af den eksisterende testsuite. Spoergsmaal der starter med
   hvilke/hvem/hvornaar/hvor mange regnes nu altid som dataspoergsmaal.

**Hvis modellen er utilgaengelig** (RAM-graensen) returneres app-vejledningen
uaendret med nummererede trin — `conciseGuideFallback` roerer kun guide-kilder.
Det kraevede ingen kodeaendring.

**Kendt, ikke-relateret:** `assistantKnowledge.test.cjs` fejler paa en
haardkodet dato (`2026-09-22` + "naeste uge"). Den bestod i sidste uge og
raadnede denne uge. Uafhaengig af dette arbejde.

## Fase 4 — Fjern blindgyden

- [x] Den faste `unsupported`-afvisning er vaek. Rammer spoergsmaalet et kendt
      emne, svares der ud fra app-viden; ellers faar brugeren et overblik over
      hvad Hubert rent faktisk kan — og begge dele gaar gennem modellen
- [x] Sikkerhedsklausulerne er uroerte: systemprompten, rettighedstjek og
      kilde-revalidering er ikke aendret
- [x] Valideret: tsc ren, 105/105 vitest, 406/407 electron-tests

**Tre faelder fundet undervejs — alle fanget af den eksisterende testsuite:**

1. **Den semantiske planlaegger doede naesten.** Den udloeses af
   `mode === 'unsupported'`. Da tilstanden forsvandt, ville planlaeggeren aldrig
   koere igen. Nu udloeses den ogsaa af `unmatched`, saa et ukendt spoergsmaal
   stadig faar et forsoeg paa at finde det rigtige modul foer vi giver op.
2. **Daeknings-maalingen doede naesten.** Loggen over ubesvarede spoergsmaal
   lyttede kun efter `unsupported`. Naar brugeren altid faar ET svar, bliver
   manglende daekning usynlig. `unmatched` logges derfor nu, og log-kaldet er
   flyttet, saa det ogsaa rammer app-guide-svar.
3. **Et enkelt loest modulord var nok til at "besvare" et spoergsmaal.**
   Ordet "uge" i *"hvad serverede koekkenet uge 36?"* gav en app-forklaring i
   stedet for madplanen. Der kraeves nu enten et konkret opgave-traef eller en
   score over en taerskel.

Desuden justeret: en worker-test kraevede `sources.length === 0` efter at guider
blev slettet. Den tjekker nu praeciseret at intet GUIDE-indhold overlever —
staerkere end foer, da den ogsaa kontrollerer selve teksten.

## Fase 5 — Generel tilstand (loesning A)

- [x] Tilstandsvaelger i chatten: **Hub** (standard, databaseret) / **Generelt** (fri)
- [x] Egen systemprompt uden krav om evidens (`buildGeneralSystemPrompt`)
- [x] Tydelig, vedvarende maerkat paa generelle svar:
      *"AI-genereret — ikke fra hub-data, kan indeholde fejl"* med advarselsikon
- [x] Visuelt adskilt: generelle svar har ravfarvet ramme i stedet for den
      neutrale boble, saa de aldrig forveksles med citerede svar
- [x] Placeholder skifter ogsaa, saa tilstanden er tydelig FOER man spoerger
- [x] Valideret: tsc ren, 105/105 vitest, 409/410 electron-tests

**Hub-data sendes aldrig med i generel tilstand.** Anmodningen udelader bevidst
samtalehistorik, `includeImages` og personvalg, og backend henter slet ingen
evidens — kun spoergsmaalet naar modellen. Login kraeves stadig, og adgangen
revalideres efter svaret som alle andre steder.

**Det farligste ved generel tilstand er ikke forkerte Excel-formler,** men at
modellen opfinder virksomhedens regler og lyder autoritativ. Prompten forbyder
derfor eksplicit at udtale sig om interne regler, politikker, loen, bemanding og
procedurer, og henviser i stedet til leder, guides eller det rigtige modul.
Spoerger man om hub-data i generel tilstand, bliver man bedt om at skifte
tilbage i stedet for at faa et gaet. Fire tests laaser det fast.

**Sidegevinst:** modellens svarlaengde var haardt begraenset til 384 tokens, hvilket
afskar trinvise vejledninger midt i en saetning. Loftet er haevet til 1536, og
`temperature` kan nu saettes pr. kald — generel tilstand bruger 0.6, mens
databaserede svar beholder 0 (deterministisk). Det var planlagt til fase 6, men
generel tilstand var ubrugelig uden.

**Udrulning:** tilstanden er tilgaengelig for alle. Skal den begraenses til
managere/creator i foerste omgang, er det en enkelt betingelse omkring
tilstandsvaelgeren.

## Fase 6 — Lad modellen faa plads

- [x] Sampling pr. tilstand i stedet for een fast: data/how-to beholder
      `temperature: 0`; generel tilstand bruger 0.6 *(gjort i fase 5)*
- [x] Haev `max_tokens`-loftet fra 384 til 1536 *(gjort i fase 5)*
- [x] **Kontekstvindue: beholdt paa 4096 efter beregning, ikke aendret.**
      Systemprompt ~700 tokens + app-viden ~500 + spoergsmaal ~50 + svar op til
      1536 = ~2800. Med et billede (+512 billedtokens) ~3300. Der er altsaa
      plads. Et stoerre vindue ville koste ekstra RAM til KV-cachen - praecis
      den ressource der allerede er flaskehalsen. Haeves foerst hvis et reelt
      svar bliver afkortet.
- [x] ~~RAM-graensen: fald tilbage til en mindre model~~ **DROPPET 2026-09-21
      efter beslutning.** Punktet byggede paa en forkert antagelse fra mine egne
      noter — der findes INGEN 2B-model i koden. Se modelafsnittet nedenfor.
- [x] Generel tilstand ved RAM-graense: kastede foer modellens raa fejl videre,
      som slutter med "Dataopslag kan stadig bruges" — direkte misvisende i en
      tilstand der IKKE har dataopslag. Svarer nu med en brugbar besked paa
      brugerens sprog om at skifte til Hub-tilstand.
- [x] RAM-graensen kan nu overstyres til test via `TCD_HUB_AI_MIN_FREE_GIB`
      (0 = ingen graense). Standarden i `aiModels.cjs` er uaendret.

### Modelvalg (undersoegt 2026-09-21)

`aiModels.cjs` indeholder kun `8b` (Qwen3-VL-8B, Q4_K_M 4,68 GB + mmproj 1,08 GB,
kraever 7 GB fri RAM). Den er afproevet live og er for tung.

Officielle GGUF-udgaver i samme familie, fra Qwen selv:

| Model | Q4_K_M | Vurdering |
| --- | --- | --- |
| Qwen3-VL-2B | ~1,2-1,5 GB | Letteste, men ogsaa svagest |
| **Qwen3-VL-4B** | **2,5 GB** | **Mellemvejen — halvdelen af 8B** |
| Qwen3-VL-8B | 4,68 GB | Nuvaerende, for tung |

4B er derfor et bedre valg end 2B: markant mere kapabel, og stadig ~halvdelen af
8B's hukommelsesbehov. Samme arkitektur (`qwen3vl`) og samme llama.cpp-runtime,
saa der skal ikke aendres i selve inferensen.

Ekstra besparelse: vision-encoderen (`mmproj`) findes ogsaa i Q8_0 og ikke kun
F16. Billedforstaaelse er en sekundaer funktion, saa Q8_0 er rigeligt og sparer
yderligere plads.

**Besluttet og gennemfoert 2026-09-21: 4B erstatter 8B.**

Hentet og verificeret mod Qwen's egne sha256-checksummer (revision
`1cd86afb9a95c410a6038ab3b40d8b578c892266`): modellen fylder 2,33 GB og
vision-encoderen 797 MB — i alt ~3,1 GB mod 8B's ~5,9 GB. RAM-kravet er sat til
4,5 GB (5,5 GB med billeder) mod 8B's 7/8,5 GB.

Maalt paa de scenarier der faktisk kan opstaa i appen:

| Test | Resultat |
| --- | --- |
| Dataopslag ("hvem har aftenvagt fredag?") | Korrekt, identisk i 2/2 koersler |
| App-vejledning omskrevet fra kurateret tekst | Korrekt, alle trin bevaret |
| Samme evidens besvaret paa engelsk | Korrekt oversaettelse |
| Fravaer ≠ fridag | Korrekt forbehold med |
| Generel tilstand afviser hub-data | Korrekt afvisning |

Svartid 27-44 s pr. spoergsmaal paa CPU.

**Én reel svaghed, men den er ikke naabar:** med *tom* evidens opfandt 4B et
"Ferie"-modul (reproducerbart 2/2). Det kan ikke ske i appen, fordi
`main.cjs` allerede stopper foer modelkaldet:
`if (!answer.sources.length && !request.image) return answer` — uden kilder
bliver svaret aldrig AI-genereret. Vaernet er verificeret, ikke antaget.

**Mindre forbehold:** dansk i *generel* tilstand er sjusket ("godshaven",
"letare", "kontakta"). Indholdet er rigtigt, sproget ikke altid. Generelle svar
er markeret som AI-genererede i UI'et, saa det er acceptabelt — men det er den
funktion der taber mest ved at gaa fra 8B til 4B.

Migrering af dem der allerede har 8B: 8B er fjernet fra allowlisten, saa
oprydningen i `createLocalAI` sletter de gamle filer og frigiver 5,7 GB.
`status().installed` bliver derved `false`, og brugeren bliver bedt om at hente
4B fra drevet én gang. Daekket af testen "a retired model is deleted locally and
the current model is offered from the share".

**Bemaerk ved udrulning:** 8B-filerne ligger stadig paa det faelles drev med
vilje. Den udgivne version er 1.5.4, som forventer 8B — de maa foerst fjernes
naar 1.5.5 er udrullet.

Yderligere besparelse mulig senere: vision-encoderen findes ogsaa i Q8_0
(433 MB mod 797 MB). Ikke valgt nu, for at holde opsaetningen identisk med den
afproevede 8B-konfiguration.
- [ ] Maal svartid — laengere svar paa CPU koster tid; find et fornuftigt leje

## Fase 7 — Validering og udrulning

- [x] Testlisten fra fase 1 koert igen gennem den RIGTIGE svarvej og sammenlignet
- [x] `npx tsc --noEmit` ren, `npx vitest run` 105/105
- [x] `node --test electron/*.test.cjs`: 408/410
- [x] Sikkerhedstestene eksplicit verificeret: 113/113 groenne
      (assistantContext, assistantWorker, securedIpc, teamReadPolicy,
      assistantPersona, assistantAppGuide)
- [x] `src/lib/changelog.ts` opdateret med de fire brugervendte aendringer
- [ ] **Afproev live** — intet af dette er testet med den rigtige model endnu
- [ ] Byg 1.5.5 og rul foerst ud naar den foeles rigtig

### Maalt resultat

| | Foer | Efter |
| --- | --- | --- |
| Blanke afvisninger | 6 af 30 | **0** |
| How-to med trin-for-trin | 0 af 14 | **13 af 14** |
| Dataopslag intakte (gruppe B) | 6 af 6 | **6 af 6** |

Maalingen daekker RUTNINGEN — hvilken slags svar man faar. Selve svarkvaliteten
afhaenger af modellen og kan kun vurderes live.

### To kendte, ikke-relaterede testfejl

1. `assistantKnowledge.test.cjs` — haardkodet dato (`2026-09-22` + "naeste uge").
   Bestod i sidste uge, raadnede denne uge. Vil blive ved med at fejle.
2. `offlineSync.test.cjs` "getAsync serves the local mirror" — reel
   timing-flakiness mod filsystemet; bestaar ca. 2 ud af 3 koersler.

Ingen af dem roerer dette arbejde. Begge boer rettes, men hoerer ikke til her.

---

## Afklaringer undervejs

- Skal generel tilstand vaere for alle fra start, eller manager/creator foerst?
- Accepteres det at generelle svar er svagere/langsommere end ChatGPT (lokal
  CPU-model)?
- Skal ubesvarede spoergsmaal fortsat logges, saa vi kan maale om daekningen
  bliver bedre over tid? (anbefales)
