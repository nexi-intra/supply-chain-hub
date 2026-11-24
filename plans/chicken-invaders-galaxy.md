# Chicken Invaders – "Galaksen" (variation: sektorer, formationer, fjender, meteorer, våben, bosser)

Brugerønske (2026-10-05): spillet er populært, men føles ensformigt. Flere baner, bosser, meteorbaner, våben og kyllinger. Valgt struktur: **C – hybrid** (faste sektorer med tema, boss og rytme; bølgerne i en sektor trækkes fra sektorens egen pulje med spillets seedede RNG).

Regler: TDD (RØD test først), ren logik i `src/games/chickenInvaders/` uden React/DOM, alle tekster på da/en/fi/sv, ingen nye npm-afhængigheder, intet release-build (kun tsc + vitest + dev-server), ingen skrivning til produktionsdata. Logisk spilleflade forbliver 960×600, fast tidstrin 60 Hz, deterministisk med seed.

Kommandoer (fra `Supply-Chain-Hub 1.6.0`):
- `.\node_modules\.bin\vitest.cmd run src/games/chickenInvaders`
- `.\node_modules\.bin\tsc.cmd -b --pretty false`
- Fuld suite: `.\node_modules\.bin\vitest.cmd run`

## Design

### Kampagne (ny `campaign.ts`)
- 5 sektorer á 8 bølger. Sektor-rytme (plads 1–8): `formation, formation, hazard, bonus, formation, miniboss, formation, boss`.
- Efter sektor 5 starter **Nyt+**: sektor 1 igen med `round + 1` (eksisterende skalering af fart/æg/rækker/boss-liv bruges stadig via `round`).
- Bølgenummer er stadig globalt (1, 2, 3 …), så score/HUD/stats fortsætter. `sector = ((wave-1) / 8) % 5`, `slot = (wave-1) % 8`, `round = floor((wave-1)/40)`.
- Hver sektor har en pulje af formationsbølger, hazard-bølger, bonusbaner og en mini-boss; plads 1/2/5/7 trækkes fra formationspuljen uden gentagelse i samme sektor (seedet), plads 3 fra hazard-puljen, plads 4 fra bonuspuljen, plads 6 er sektorens mini-boss, plads 8 er sektorens boss.
- Sværhedsgraden inden for en sektor stiger (plads 7 er hårdest); sektor 2+ er hårdere end sektor 1 (`sectorScaling = 1 + 0.08 * sector`).

| # | Tema (`ThemeId`) | Look | Typiske fjender | Hazard-pulje | Mini-boss | Boss |
|---|---|---|---|---|---|---|
| 1 | `farm` Hønsegården i rummet | lilla/blå (nuværende) | høne, hjelm, dykker, ballon | meteorregn, guldregn | Ægge-trioen | Mor Høne |
| 2 | `asteroids` Asteroidebæltet | brun/rav, asteroider | + snigskytte, ninja | asteroidebælte (sidelæns), metalmeteorer | Kyllingekrydseren | Æggeroiden |
| 3 | `ice` Isplaneten | cyan/is | + skjoldhøne, sygeplejerske | isklumper, kometstorm | UFO-moderskib | Isdronningen |
| 4 | `volcano` Vulkanmånen | rød/orange | + bombehøne, kamikaze-kalkun | ildmeteorer, sort hul | Ægge-trioen (ild) | Robo-Hanen |
| 5 | `mothership` Moderskibet | metal/grøn | alle + UFO-kylling | blanding + sort hul | Kyllingekrydseren (mk II) | Den Galaktiske Hane |

### Formationer og bevægelse (ny `formations.ts`)
Slot-generatorer (rene funktioner) + bevægelsesmønstre:
- Former: `grid` (nuværende), `vShape`, `ring`, `diamond`, `flanks` (to blokke), `columns`, `checker`, `arrow`.
- Bevægelse (`motion`): `sway` (nuværende side-til-side + nedrykning), `rotate` (ring roterer om et center der glider), `bob` (sinus op/ned + sway), `snake` (kæder af høns følger en sinusbane hen over skærmen i loop, ingen nedrykning), `pinball` (frie høns der hopper mod kanterne), `loopers` (grupper af 3 laver Galaga-loop-dyk).
- Indflyvning (`entrance`): `sides` (nuværende), `top` (falder ned i kolonner), `spiral`, `split` (fra begge sider samtidig).

### Nye kyllinger (ny `enemies.ts` – data-tabel + adfærd pr. type)
| Type | Liv | Point | Adfærd |
|---|---|---|---|
| `shield` Skjoldhøne | 1 + skjold 4 | 300 | Skjoldboble tager de første 4 træf (synligt revnende), derefter almindelig høne |
| `sniper` Snigskytte | 2 | 300 | Sigter sine æg mod skibet (skrå æg), skyder oftere når den står forrest |
| `bomber` Bombehøne | 2 | 350 | Taber et stort æg, der eksploderer i 6 splinter midt på skærmen |
| `ninja` Ninja-kylling | 1 | 300 | Fri, hurtig zigzag tværs over skærmen; flygter hvis ikke skudt |
| `balloon` Ballonhøne | 2 | 200 | Deler sig i 3 kyllinger, når den dør |
| `medic` Sygeplejerske | 2 | 400 | Heler hver 3. s +1 liv til nabo-hjelme/skjolde inden for 120 px |
| `ufo` UFO-kylling | 6 | 800 | Flyver over toppen; traktorstråle (varslet) stjæler ét våbenniveau, hvis skibet står i strålen i 1 s; dropper gaven igen ved død |
| `turkey` Kamikaze-kalkun | 3 | 450 | Vrikker 0,8 s (varsel) og styrtdykker lige mod skibets position |
| `rainbow` Regnbuehøne | 1 | 2.000 | Sjælden; dropper en tilfældig power-up |

### Meteorer og hazards (ny `hazards.ts`)
- Meteor-varianter (`meteorType`): `rock` (nuværende), `fire` (hurtig, flammehale), `ice` (langsom, stor splittes i 3 isskår), `metal` (6 liv, 300 point, 15 % gave), `gold` (point + kyllingelår), `comet` (skråt fra hjørnerne med hale).
- Hazard-bølger: `meteorShower` (temaets blanding), `asteroidBelt` (vandrette baner af asteroider fra siden), `cometStorm`, `goldRush` (guldmeteorer + rock), `blackHole` (sort hul trækker skibet vandret mod sig, sluger æg og skud der rører det, mens meteorer kredser; varer til meteorerne er væk).

### Bonusbaner (plads 4, ny `bonusStages.ts`)
- `drumstickRain` – 20 s regn af kyllingelår og mønter, ingen fjender; saml så mange som muligt.
- `shootingGallery` – 20 s guldhøner i mønstre, ingen æg.
- `eggDodge` – 20 s, våbnet er låst, undvig ægregn; overlever du uden træf: stor bonus.
- Bonusbaner koster ikke liv (undtagen `eggDodge`, hvor træf kun fjerner bonussen – ikke liv). Timer vises i HUD. Resultat-banner: "Bonus: 12.400".

### Våben (udvid `weapons.ts`) – som det originale Chicken Invaders
Gaver har farve = våbenfamilie. Samme farve: +1 niveau. Anden farve: skift våben, behold niveau. Gave-farven er 60 % dit nuværende våben, 40 % et andet (seedet).
| Familie | Farve | Niv. 1 → 5 |
|---|---|---|
| `blaster` (nuværende ion) | rød | 1→2→3→5 skud → ionstråle |
| `lightning` Lyn | blå | kædelyn mod nærmeste fjende, kæder 1→5 fjender (hitscan, kort bue-effekt) |
| `laser` Laser | grøn | uafbrudt stråle lige op, gennemborer; bredde/skade stiger; mere varme |
| `spread` Fjer-hagl | orange | 3→11 haglkorn i bred vifte, kortere rækkevidde |
| `homing` Raketter | lilla | 1→4 målsøgende raketter (skade 2), langsommere skudtakt |
Nye power-ups: `drone` (kammerat-drone 15 s), `slowmo` (fjender/æg 50 % i 6 s), `magnet` (trækker pickups 10 s), `double` (×2 point 10 s), `life` (sjælden: +1 liv). Eksisterende `shield`, `coolant`, `missile` bevares.

### Bosser (generaliser `boss.ts` til `bosses/`-register)
Fælles: liv-bjælke med navn, 3 faser, varslede angreb, skalerer med `round`.
1. **Mor Høne** – uændret.
2. **Æggeroiden** – kæmpe ægformet asteroide; fase 1 kaster meteor-klumper, fase 2 roterende spiral af æg, fase 3 skallen revner og den skyder skår i alle retninger.
3. **Isdronningen** – isfan, fejende frostlaser (bevæger sig hen over skærmen), indkalder skjoldhøns; fase 3 snestorm (skrå æg med vind).
4. **Robo-Hanen** – to kanontårne (egne livspoint) skal skydes af før kernen kan rammes; sigtede salver, langsomme "målsøgende" æg, fase 3 lasergitter (2–3 varslede lasere).
5. **Den Galaktiske Hane** – teleporterer, kombinerer angreb fra de andre bosser pr. fase, indkalder UFO-kyllinger.
Mini-bosser (plads 6) bygget som store fjender: **Ægge-trioen** (3 store høns á ~25 liv i formation, vifte-æg), **Kyllingekrydseren** (bredt skib der krydser skærmen med 3 tårne), **UFO-moderskib** (stor UFO med bred traktorstråle).

### Grafik, lyd, HUD
- Én forhåndstegnet baggrund pr. tema (cache), stjernefarve og hønsepalet pr. tema.
- Sektor-banner ved sektorstart ("SEKTOR 2 · ASTEROIDEBÆLTET"), boss-intro med navn, bonus-timer.
- HUD: "Sektor 2 – bølge 3/8", våbenikon i familiefarve, aktive power-up-timere.
- Lyd: nye syntetiske effekter for nye våben, boss-intro, bonus, sort hul (stadig slået fra som standard).
- Game over-statistik: + sektor nået, bosser besejret (unikke).

### Highscore
Samme tavle (`chicken-invaders-global-leaderboard`). **Åbent spørgsmål til brugeren:** skal der startes en ny sæson, da point vil ligge højere?

## Faser

### Fase 1 – Kampagne og temaer (fundament)
- [x] RØD: `campaign.test.ts` – sektor/plads/round-beregning, 5 temaer, rytmen pr. sektor, ingen gentagelse af formationsbølger i en sektor, deterministisk pr. seed, Nyt+ efter bølge 40.
- [x] `campaign.ts` + udvid `WaveSpec` (`sector`, `theme`, `slot`, `layout`, `motion`, `entrance`, `enemyMix`, `hazard`, `bonus`, `bossType`, `miniBoss`); `waves.ts` bygger spec ud fra kampagnen; engine bruger den (eksisterende formation/divers/meteors/armored/boss mappes ind som puljeindhold, så spillet virker hele vejen).
- [x] `themes.ts` (paletter) + baggrund pr. tema i `sprites.ts`/`render.ts` + sektor-banner + HUD "Sektor x – bølge y/8".
- [x] Labels da/en/fi/sv for temaer/sektorer.

### Fase 2 – Formationer og bevægelse
- [x] RØD: `formations.test.ts` – hver form giver gyldige slots inden for feltet, ingen overlap; hver bevægelse holder fjender på skærmen og er deterministisk.
- [x] `formations.ts` + integration i `startWave`/`updateFormation`/`moveEnemies`; indflyvningsvarianter; `loopers`-dyk.

### Fase 3 – Nye kyllinger
- [x] RØD: `enemies.test.ts` – tabel (liv/point/radius) og adfærd for hver ny type (skjold, sigtede æg, bombe-splinter, ballon-split, heling, UFO-stjæl/returnér, kalkun-dyk, ninja, regnbue-drop).
- [x] `enemies.ts` + engine-integration + sprites + feathers/effekter + labels; fjenderne indgår i sektorernes puljer.

Noter fra fase 3:
- `enemies.ts` ejer tabellen (`ENEMY_DEFS`: radius, liv, point, `requiredForClear`, `shootsEggs`, skjold) og al adfærd; motoren dispatcher kun (`updateSpecials`, `stepTurkey`, `moveFlyby`, `launchFlyby`, `onKilled`, `absorbShield`, `burstBomb`). Nye felter på `Enemy`: `shield`, `cooldown`, `stage`, `stageT`, `beam`, `stolen`; nye modes `wobble`/`kamikaze`. `Egg.kind` = `aimed | bomb | shard` (+ `burstY`).
- Bølgerne: `SectorDef.mix` (andel pr. plads `front/back/any`, `min/max`) og `SectorDef.flybys`; `sectorMix`/`sectorFlybys` giver Nyt+ alle kyllinger fra start (+15 % andel pr. runde). `assignKinds` erstatter kun almindelige høns (hjelme/dykkere står fast), garanterer `min` og holder specialkyllinger ≤ 35 % (+5 %/runde). Bølge 1 er ren. Regnbuehønen: 10 % af formationsbølgerne, seedet via `CampaignWave.variety`.
- Nye skabeloner: `sniperNest` (asteroider, moderskib), `medicSquad` (is, moderskib), `turkeyRaid` (vulkan, moderskib – erstatter `armored` i vulkanens pulje), `ufoAmbush` (moderskib). Moderskibets pulje er nu de 4 hårde + de 4 nye.
- Introkort "NY: Snigskytte" + tip (én gang pr. type pr. spil, køet), lyde til alle nye hændelser, fjer i temaets/typens farver (Opus-anbefalingen), sigtelinje før snigskud, blinkende bombe med sprængring, vrikke-"!" og fartstriber på kalkunen, UFO-varsel + stråle med stjæle-ring om skibet.
- Balance: højst 3 sigtede æg og 2 bomber i luften, højst 2 kalkuner styrtdykker ad gangen, kalkun varsler 0,8 s og dykker ikke når den står lavt, UFO stjæler kun ét niveau (aldrig under 1) og dropper altid en gave. Rytmerne skalerer med bølgens æggerate (×0,6–×2).

Til fase 4–6:
- Bombens splinter og sigtede æg er gode byggesten til bosserne (Æggeroidens skår, Robo-Hanens sigtede salver) – genbrug `burstBomb`/`aimVelocity`.
- UFO-moderskibet (mini-boss) kan bygge på UFO'ens strålefaser; Isdronningen kan indkalde skjoldhøns via `spawnEnemy('shield', …)`.
- Fase 5's farvede gaver: UFO'ens gave bør returnere det stjålne våbens familie; `onKilled` er stedet.
- `sides`-indflyvningen klumper stadig ved 35–40 høns (Opus-anbefaling, ikke rørt).

### Fri bevægelse (brugerønske)
- [x] RØD: engine-tests for 2D-tastatur (diagonal normaliseret, klemt til banen), mus i 2D med fartloft, skud fra skibets position, sammenstød med høne/Mor Høne, laserens højde, invasion uafhængig af skibets y, frirum ved indflyvning; `pointer.test.ts` for mus → banekoordinater.
- [x] Motor: `GameInput.up/down/pointerY`, `ship.vy`, skibet holdes i `SHIP_MIN_Y` (120, under HUD) – `SHIP_MAX_Y` (startpladsen). Alle levende kyllinger og Mor Hønes krop koster et liv ved sammenstød (skjold tager det som før); indflyvende høns først efter `ENTRY_CONTACT_GRACE_SECONDS` (0,6 s) på banen, Mor Høne ikke mens hun flyver ind. Laseren rammer kun fra hendes underside og ned. Farezonen måles stadig ved bunden.
- [x] Skal: WASD/piletaster i 2D, musen følger i 2D via `pointerToField`; menu "WASD ←↑↓→ – Flyt (hele skærmen)" og "Mus – Skibet følger musen · klik skyder" på da/en/fi/sv. Tegning: længere flamme ved stigning, kortere ved dyk; snigskyttens sigte tegnes aldrig opad.

### Fase 4 – Meteorer, hazards og bonusbaner
- [x] RØD: `hazards.test.ts` + `bonusStages.test.ts` (+ kampagne-, bølge-, label-, lyd- og motortests).
- [x] Meteor-varianter, asteroidebælte, kometstorm, guldregn, sort hul; tre bonusbaner med timer og resultat.

Noter fra fase 4:
- `hazards.ts` ejer meteorerne: `METEOR_STATS` (sten, ild, is, metal, guld, komet), `HAZARD_SPEED` og `BLACK_HOLE` (al fart/kraft ét sted – fase 5's slowmo skal skalere herfra), temablandingen `meteorMix` og `planHazard`, der planlægger hele bølgen ved start med `state.rng` (kø af meteorer + varsler). Motoren dispatcher kun: `updateHazards`, `moveMeteor`, `splitMeteor`, `meteorDrops`, `meteorHitEvent`, `blackHoleCatches`/`ejectShip`. `Enemy.meteorType`; `meteorsToSpawn` spejler køen (sæt til 0 = stop planen, som testene gør).
- Hazard-skabeloner: `meteorShower` (temaets blanding: sten/guld, metal-tung, is, ild, kaos), `goldRush`, `asteroidBelt`, `cometStorm`, `blackHole`. `meteorCount` er tætheden. Sektor 4–5 og Nyt+ får 1–2 ninjaer som krydderi.
- Fairness: kometer varsles 0,9 s (stiplet bane + nedtællingsring + pil, flyttet ind under HUD'en) og halvdelen sigter mod skibet, når varslet tændes; bæltets baner varsles 1,3 s, er svagt markeret mens stenene passerer, højst 3 af 5 baner er optaget, og første puls tager altid den nederste bane (man kan ikke gemme sig på startpladsen). Det sorte hul trækker højst 80 px/s (skibet flyver 480), vokser ind over 1,2 s, sluger æg/skud/meteorer uden point, kernen koster et liv og spytter skibet ud nederst, og det kollapser når meteorerne er væk.
- Puljer (data i `SECTORS`): 1 `meteorShower`/`goldRush`, 2 `asteroidBelt`/`meteorShower` (metal), 3 `meteorShower` (is)/`cometStorm`, 4 `meteorShower` (ild)/`blackHole`, 5 alle fem. Bonus: 1 regn/skydebane, 2 skydebane/æggeregn, 3 æggeregn/regn, 4–5 alle tre. `planRound` + `coverPick` vælger seedet blandt kombinationerne, så hver runde møder alle 5 hazards og alle 3 bonusbaner (cache pr. seed/runde).
- `bonusStages.ts`: 20 s timer, nedtælling 3-2-1, faste point uden combo (`BONUS_POINTS` × `bonusScale` = 1 + 0,25/sektor + 0,5/runde), ingen bølgebonus – i stedet `bonusResult` + 3,2 s resultat-banner med optælling ("Bonus: 12.400", "Perfekt!", ellers "49/50"). Bonusbaner koster aldrig liv; i æggeregnen er våben og missiler låst, og et æg fjerner kun den store overlevelsesbonus (`bonusMiss`). `galleryHen` er en ny `EnemyKind` (ikke krævet for at rydde). `beginWave(state, spec)` er ny eksport, så tests kan tvinge en skabelon.
- Grafik: egne sprites pr. meteortype (glødende revner, facetteret is med glimt, nittet metal med revner efter skade, guldklump med glimt, kometkerne med lang hale), ildhale, svag kant-glød + støvstriber, så spillets sten skiller sig ud fra asteroide-baggrunden, sort hul med fladtrykt akkretionsskive (for- og bagside), lysring, bøjet lys over toppen og spiralpartikler. Bonus: gylden ramme, gylden score, timer-ring, tæller og point i HUD, større pickups, mønt der snurrer, hængelås ved "Våben låst". Nye lyde: komet-varsel, banevarsel, sort huls brum (svagt), slugning, prel, is-knas, metalbrud, mønt, bonus start/tik/miss/optælling.

Til fase 5–6:
- Slowmo/magnet: skalér `HAZARD_SPEED` og bonusbanernes `RAIN_SPEED`/`GALLERY_SPEED` ét sted; magneten bør også virke på bonusregnen (det er dér, den giver mest glæde). Det sorte hul trækker ikke i pickups i dag.
- Farvede gaver: metalmeteorens gave (15 %) går gennem `meteorDrops` – stedet at vælge familie. Guldmeteor/bonus-mønter er `coin` (250 point).
- Bosser: Æggeroiden kan genbruge `planHazard`-køen (meteor-klumper) og `splitMeteor` (skår); Isdronningens snestorm kan låne kometvarslet; det sorte hul (`updateBlackHole`/`pullShip`) passer til Den Galaktiske Hane.
- Balance at holde øje med i brugertest: æggeregnens rate (1,8 → 5,0 æg/s på mellem), kometernes sigte på ekspert, og om kyllingelårsregnens "Perfekt" er for svær.

### Fase 5 – Våben og power-ups
- [x] RØD: udvid `weapons.test.ts` (familier, skift/opgrader, mønstre, varme pr. familie) + nye `shots.test.ts` (lyn-kæde, laser-kolonne, haglrækkevidde, målsøgning/nyt mål/fordeling) og `powerups.test.ts` (ure, slowmo, magnet, ×2, drone, liv, drop-vægte) + UFO-familie, labels, lyd, effekter og en hel runde (bølge 1–41) med hver familie og alle power-ups.
- [x] Implementér familier, farvede gaver, drone, slowmo, magnet, ×2, ekstra liv; HUD-ikoner.

Noter fra fase 5:
- Struktur: `weapons.ts` = familier, mønstre, skudtakt, varme, gaveregler (`collectGift`, `rollGiftFamily` 60/40). `shots.ts` = lynkæde (`findChain`), laserens kolonne-tik, projektiler (`advanceProjectile`: haglrækkevidde, raketstyring). `powerups.ts` = ure, `timeScale`, `pointsFactor`, magnet, drone, drop-vægte. Motoren dispatcher kun (`fireShots`, `damageEnemy`, `updatePowerups`); `damageEnemy` er nu fælles for skud, lyn og laser.
- Familier (niveau 1→5): blaster uændret. Lyn: 1+N mål (N = niveau), 1 skade pr. led, kegle ±0,7 rad, rækkevidde 350→430 px, hop 170 px, rammer Mor Høne, slår ud i luften uden mål. Laser: tik hver 0,16→0,075 s (1 skade pr. tik på alt i kolonnen over skibet, også Mor Høne), halv bredde 5→18 px, 60 varme/s. Fjer-hagl: 3→11 korn, vifte ±0,32→0,64 rad, 420 px. Raketter: 1,2,2,3,4 stk., skade 2, drejer 5 rad/s, 300→640 px/s, 3,2 s levetid, fordeler salven på forskellige mål og finder nyt mål når målet dør.
- Varme: alle familier kan overophede ved konstant skydning (< 20 s); laseren hurtigst (~3,3 s), men aldrig under 2 s. Skudtakt for laseren er kvantiseret til 60 Hz, så varmen er sat efter de faktiske tik.
- Gaver: `Pickup.family`; alle gaver uden fast familie (høns, guldhøne, metalmeteor, Mor Høne, regnbue) ruller farve i `spawnPickup`. UFO'en gemmer `stolenFamily` og dens gave giver den familie tilbage. Liv tabt: −1 niveau, samme familie.
- Power-ups: drone 15 s (kredser om skibet, 0,3 s mellem små skud mod nærmeste mål inden for 480 px, tæller ikke i træfsikkerheden, skyder ikke i æggeregnen), slowmo 6 s (verdens `dt` × 0,5: fjender, æg, meteorer, hazards, Mor Høne, bonusregn og pickups – ikke skib, skud eller drone), magnet 10 s (320 px, også i bonusregnen), ×2 10 s (drab, kyllingelår, mønter og bonusbanernes point), liv (+1 op til 5, ellers 2.500 point). Samme power-up igen genstarter uret. Drop-vægte: skjold 20, køling 16, missil 14, drone 13, ×2 13, magnet 12, slowmo 11, liv 1. Regnbuehønen: drone/×2 16, slowmo/magnet 14, liv/skjold 12, missil/gave 8. Mor Høne dropper gave + liv + skjold.
- Grafik/lyd: gaver i familiefarve med tegn (ionskud, lyn, stråle, vifte, raket), HUD med familieikon, navn og niveau-pips i familiefarven, power-up-ure nederst til højre med nedtællingsringe (blinker de sidste 2 s, køling vises også), ×2-mærke ved scoren, indigo-tone ved slowmo, magnetfelt med trækstreger, drone-sprite, takkede lynbuer, pulserende laserstråle med strømmende striber, glødende fjer-hagl der falmer, raketter med flamme og røgspor (`rocketTrails`). Egne lyde: zap, laser-summen, hagl, raket, våbenskift, drone, slowmo, magnet, ×2, liv og "power-up slut".

Til fase 6–7:
- Bosser: lyn og laser rammer allerede Mor Høne via `ShotWorld.hitBoss`; nye bosser skal give et mål-punkt (`bossPoint`) og en hitbox til laseren. Robo-Hanens tårne kan være almindelige `Enemy`'er, så lyn/raketter automatisk vælger dem.
- Laseren og lynet er stærke mod skjoldhøns (hvert tik/led tager et skjold-træf); hold øje i brugertest. Lynets auto-sigte gør det let på let – overvej færre led på ekspert, hvis det bliver for nemt.
- Slowmo bremser også bosserne via `worldDt`; boss-varsler bliver dermed længere (godt), men tidsbaserede faser i `boss.ts` bruger `boss.time`, så de følger med.

### Fase 6 – Bosser og mini-bosser
- [x] RØD: `bosses/registry.test.ts`, `bosses/bosses.test.ts`, `bosses/simulation.test.ts` (+ migreret `bosses/motherHen.test.ts`) – register, faser, angreb pr. boss, tårne på Robo-Hanen, mini-bosser, kontakt, belønning, varsler ≥ 0,6 s, niveau 1-bot og hele kampagnen.
- [x] Generaliseret boss-ramme + 4 nye bosser + 3 mini-bosser + sprites + labels.

Noter fra fase 6:
- Struktur: `bosses/core.ts` (BossState, faser, skade, varsel/tempo, stråler, hitbox, dele, angrebsrække `runAttacks`/`stepBoss`), `bosses/attacks.ts` (genbrugelige angreb: vifte, meteor-klumper, spiral, skår, fejende stråle, lasergitter, sigtede salver, målsøgende æg, snestorm, indkald, UFO'er, teleport, sort hul, traktorstråle), én fil pr. boss (`motherHen`, `eggeroid`, `iceQueen`, `roboRooster`, `galacticRooster`, `eggTrio`, `chickenCruiser`, `ufoMothership`) og `bosses/index.ts` (registret `BOSS_DEFS`). Motoren dispatcher kun: `createBossFor`/`setupBoss`/`updateBossState`/`settleBoss`/`bossPoints`/`bossDrops`. `boss.ts` er flyttet til `bosses/motherHen.ts` uden adfærdsændring (testene migreret 1:1).
- Kampagne: boss-pladsen = `motherHen`, `eggeroid`, `iceQueen`, `roboRooster`, `galacticRooster`; mini-boss = `eggTrio`, `chickenCruiser`, `ufoMothership`, `eggTrioFire` (variant 1), `chickenCruiserMk2` (variant 1). Ny `WaveKind` `miniBoss`, `WaveSpec.bossVariant`. Boss-bølger har ingen tilfældige flyvere. Nyt+: liv ×(1 + 0,5·runde), tempo ×(1 + 0,2·runde), varsler ×(1 − 0,06·runde) men aldrig under 0,4 s.
- Fælles: liv-bjælke med navn i bossens farve (mini-bosser mindre), fasestreger ved 1/3 og 2/3, 3 faser med egen replik, intro-banner med navn og replik + egen synth-sting pr. boss, alle angreb varsles (`bossCharge`, 0,8–1,0 s grundvarsel; ekspert ×0,78 ≥ 0,62 s). Nederlag: hit-stop, vrag der ryster/synker, kæde af eksplosioner, stort brag med konfetti, fanfare; hjælpere sprænger med point, æg ryddes. Belønning: bosser gave + liv + skjold, mini-bosser gave + power-up (UFO-moderskibet giver stjålne niveauer tilbage som gaver). Point: Mor Høne 5.000·niveau, Æggeroiden 12.000, Isdronningen 15.000, Robo-Hanen 18.000, Den Galaktiske Hane 25.000, trioen 4.000, Krydseren 5.000 (MK II 7.000), UFO-moderskibet 6.000 – ×(1 + runde).
- Dele (`EnemyKind` `bossPart`): Robo-Hanens 2 tårne, trioens 3 høns og Krydserens 3 tårne er almindelige fjender, så lyn, raketter, laser og drone vælger dem; de kan ikke rammes under indflyvningen, dør ikke ved sammenstød (men koster et liv), og et missil tager 25 % af hver. Robo-Hanens kerne og Krydserens skrog er skærmet (skud prelle af med `bossDeflect`), lyn/raketter sigter kun på en sårbar krop (`bossAimPoint`).
- Bosser: Æggeroiden (driver langsomt, revner i 3 trin + glødende blomme; f1 meteor-klumper som rigtige meteorer + vifte, f2 roterende 3-armet spiral, f3 skår-ringe). Isdronningen (isvifte, frostlaser der fejer en varslet kile på ~42 % af gulvet fra hendes ædelsten, f2 indkalder 2–3 skjoldhøns som vagter (højst 4), f3 snestorm med vind-varsel »»» og søjle-fordelte isæg). Robo-Hanen (skjold til begge tårne er nede, sigtede salver med sigtelinjer, målsøgende æg der drejer 1,4 rad/s i 4,5 s og aldrig vender opad, f3 lasergitter 2–3 linjer – én lodret og én vandret gennem skibets plads + én lodret ≥ 260 px væk). Den Galaktiske Hane (varslet teleport med spøgelse/ring ≥ 240 px fra skibet, f1 vifte/klumper/UFO, f2 ild-spiral/plasma-fejestråle/salver, f3 sort hul med sug ≤ 80 px/s + æggeringe, lasergitter, skår).
- Mini-bosser: Ægge-trioen (3 store høns á 25 liv på mellem i roterende trekant, lukker rækkerne, vifte på skift / alle på én gang; Ild-trioen med ildæg 15 % hurtigere). Kyllingekrydseren (glider ind fra siden, krydser skærmen, 3 tårne: sigtede par/vifte, luge-bredside; MK II: 7 luger, tredobbelte salver, kortere pauser, 25 % mere liv). UFO-moderskibet (bred varslet traktorstråle: 1 s i strålen = ét niveau stjålet, højst én gang pr. stråle, aldrig under 1; ring af æg; sender 1–2 UFO-kyllinger).
- Balance (bot med niveau 1-ionkanon, ingen død, sekunder let/mellem/svær/ekspert): trio 17/20/27/34, Krydser 20/27/35/45, UFO-moderskib 20/28/36/46, MK II 26/34/44/57, Mor Høne 34/45/60/77, Æggeroiden 39/53/71/90, Isdronningen 41/59/77/106, Robo-Hanen 51/67/89/113, Den Galaktiske Hane 54/75/94/125. Testen kræver < 150 s (let) og < 240 s (ekspert).
- Grafik/lyd: `bossSprites.ts` (cachede 2×-sprites pr. boss: æg-klippe med ansigt og 3 revnetrin, isdronning med iskrave/krone/ædelsten, mech-hane med skadetrin + tårne, kosmisk hane med tågehale/stjernekrop/krone, tre triohøns med pandebånd + ild-udgave, krydser med bro og luger + MK II, moderskib med kaptajnshøne; ild-, is- og målsøger-æg), `bossRender.ts` (krop, dele med små liv-bjælker, ladnings-ringe, sigtelinjer, kile-varsel og fejende stråler, sort hul med akkretionsskive, snestorm-striber, traktorstråle med stjæle-ring, skjold-boble, liv-bjælke, vrag). Skærmrystelse går gennem `shake()` og respekterer reduceret bevægelse.
- Game over: "Sektor nået" (fx "2 · Nyt+") og "Bosser besejret" = antal forskellige bosser/mini-bosser (højst 8); `getStats` giver `distinctBosses`, `sector`, `round` (og stadig `bossesDefeated` i alt).

Til fase 7:
- Brugertest: Isdronningens skjoldvagter + Robo-Hanens tårne gør kampene længere på ekspert med svage våben; Galaktiske Hanes fase 3 (sort hul + gitter) er den sværeste. Hold øje med Krydserens sideflytning ved tårnene (botten må sigte foran).
- Spritene er gode, men Kyllingekrydserens skrog kunne få en hønse-gallionsfigur, og triohønsene kunne have hver sin personlighed (ansigtsudtryk).
- Boss-intro-stingene spilles sammen med den gamle `waveStart`-lyd (`bossPhase`) – overvej at lade stingen stå alene.
- Changelog 1.6.0-linje og evt. en visuel playwright-tur gennem en boss i det rigtige spil.

### Fase 7 – Balance, polish og verifikation
- [x] Simulations-test: hele kampagnen (bølge 1–48) på let og ekspert med "snyde-bot" der kan rydde bølger – ingen NaN/hæng (`bosses/simulation.test.ts`), og de første 40 bølger viser alle 5 temaer, ≥ 8 formationstyper, alle 5 hazards og 5 forskellige bosser for 60 seeds (`campaign.test.ts`).
- [x] Lyd-events (boss-stingen spiller alene, ny Nyt+-fanfare), changelog 1.6.0 (6 Chicken Invaders-linjer).
- [x] Åbne punkter fra fase 1–6: sting alene, Kyllingekrydserens gallionsfigur, trioens tre ansigter, `sides`-indflyvningen spredt, Nyt+ som et skridt op med eget banner.
- [x] Balance-bot (`balanceKit.ts`) + altid-kørende balancetests (`balance.test.ts`) + fuld rapport på bestilling (`balance.sim.test.ts`); tuning ud fra tallene (se noter).
- [x] HUD/feel-gennemgang ved 960×600 og 480×300, læsbarhed på alle 5 baggrunde, ydelse målt, reduceret bevægelse/pause/blur/game over gennemgået.
- [x] Menu: tagline på da/en/fi/sv nævner sektorer, bonusbaner, våben og bosser; marqueen viser hver tredje gang en boss-silhuet i stedet for flokken.
- [x] Verifikationsscript (`scripts/verify-chicken-invaders.cjs`): 2D-flyvning i en formationsbølge + øvelsestur via udviklerhop (hazard, bonusbane, mini-boss, Krydseren, Isdronningen, Den Galaktiske Hane, Nyt+) – 14 tjek, ingen konsolfejl.
- [x] Kodekvalitet: `sprites.ts` delt i `spriteKit`/`specialSprites`/`meteorSprites`/`pickupSprites`, `render.ts` i `hudRender`/`hazardRender`, `engine.ts`'s typer i `gameTypes.ts`; ubrugte eksporter gjort lokale.
- [x] tsc + fuld vitest grøn; dev-serveren (5020 + Electron) er ikke rørt og kører til brugertest.

Noter fra fase 7:
- Udviklerhop: `jumpToWave(state, n)` i motoren sætter `state.practice = true`; komponenten gemmer hverken score eller runde for et øvelsesspil. `window.__chickenInvadersDev` (`jumpToWave`, `invulnerable`, `snapshot`) findes kun når `import.meta.env.DEV` er sand, så produktionsbygget har det ikke.
- Nyt+: `sectorScaling` bruger `sektor + 4 · runde`, så Nyt+ starter på sektor 5's niveau og rundeskaleringen lægger oveni (æg ×1,2, fart ×1,15 – max ×1,4 æg i forhold til sektor 5). Hazard-tætheden (`TemplateContext.density`) følger kun den rigtige sektor, så Nyt+-meteorer bliver hurtigere, ikke tættere. Mor Hønes liv og fart følger nu runden som de andre bosser (før: niveau 6 = ×3,5 liv – en mur). Banner "NYT+" i guld med "Galaksen forfra – hårdere end før!" og egen fanfare.
- Balance-botten undviger ud fra det, den kan se (lineær fremskrivning, dykkernes rigtige bane, kometvarsler, bæltebaner, stråler og kiler), samler gaver/power-ups og regn, og sigter med forspring. Rapporterne kørt med 150 ms reaktionstid ("menneskelig"), 2 seeds, naturlig våbenudvikling (gaver op, træf ned).
- Tuning: første hazard-bølge 70 % tæthed; kometer højst 500 px/s og 40 % sigtede (før 50–55 %, ingen loft); Isdronningen kalder 1/2 skjoldvagter (højst 3, før 2–3/4); Den Galaktiske Hane liv 1,4 (før 1,5) og sort hul 3,4 s (før 4,2); ekspertens boss-liv 250 (før 270); snestormens tæthed højst ×1,1 tempo; Mor Høne fase 2 regner 6 æg (før 7), fase 3 hvert 1,4 s (før 1,3); det sorte hul sender hver 4. meteor løst ned langt fra hullet; æggeregnen 1,6 → 4,2 æg/s på mellem (før 1,8 → 5,0); kyllingelårsregnen planlægges, så alt kan nås med tastaturet (én fart pr. regn, mønstre der kan "fejes", ventetid efter afstand) og tæller ikke kyllingelår fra bølgen før.
- Våben: lynet "jorder" sine ubrugte led i en boss/et boss-tårn (1/2/3 skade på niveau 1/3/5) og rækker 460 px (niveau 1 når en boss fra bunden); laseren brænder dobbelt på bosser og deres dele. Lynets auto-sigte gjorde ikke let for let – tværtimod var lynet langt det svageste mod bosser (timeouts på ekspert). Laser/lyn mod skjoldhøns: målt uden problemer (laserens 4 tik ≈ 0,3–0,6 s mod ionkanonens ≈ 0,9 s) – ingen ændring.
- Endelige tal (bot, 150 ms, blaster, naturlig våbenudvikling, gennemsnit af 2 seeds, træf pr. minut pr. sektor 1–5 | Nyt+ sektor 1): let 0,8 / 1,2 / 1,4 / 0,0 / 2,1 | 2,2 · mellem 2,1 / 1,4 / 2,1 / 0,6 / 1,3 | 2,5 · svær 2,0 / 0,0 / 1,4 / 0,7 / 1,8 | 4,3 · ekspert 2,1 / 1,4 / 2,3 / 0,8 / 1,9 | 2,2. Formationsbølger 0–0,4 træf; Mor Høne let 23–31 s/0–1 træf, ekspert 36–62 s/4 træf; Nyt+-Mor Høne mellem 31–71 s (før 140–153 s/12–17 træf), ekspert 60–72 s (før timeout). Kyllingelårsregn: "Perfekt" i alle kørsler (før aldrig, 77–95 %).
- Bosser med fast våben (niveau 2 + sektor, højst 5), sekunder let | ekspert: ionkanon Mor Høne 28 | 55, Æggeroiden 19 | 39, Isdronningen 14 | 36, Robo-Hanen 24 | 53, Galaktiske Hane 24 | 57; lyn 31–34 | 46–70 (før 59–91 | 123–timeout); laser 19–21 | 36–47 (før 36–46 | 74–115); hagl og raketter 14–28 | 30–63. Testen kræver ekspert med niveau 2-våben < 90 s og ≤ 6 træf pr. hovedboss.
- Sektor 4 måler lavest for botten (det sorte hul og kalkunerne er bot-venlige, og våbnet er typisk fuldt opgraderet her); sektor 1 måler højere end forventet, fordi våbnet er svagt (niveau 1,4–2,2) mod Mor Høne. Hold øje i brugertest.
- Ydelse (headless Edge, 600 billeder i travle bølger på ekspert: hagl 5 + alle power-ups, laser 5, raketter mod Den Galaktiske Hane, kometstorm, Nyt+): motortrin 0,04–0,08 ms i snit (p95 ≤ 0,2 ms), tegning 1,6–4,6 ms i snit (p95 ≤ 2,5 ms). Første tegning af en ny baggrund/boss koster 30–70 ms; nu "varmes" næste bølges baggrund og boss op i pausen (`warmNextWave`). Partiklerne pakkes på stedet (ingen nyt array pr. billede).
- HUD: "Bølge N" ved boss-bjælken står nu til højre for bjælken, så en lang score med ×2-mærke aldrig rammer den.

Til brugertest:
- Prøv Nyt+-overgangen (bølge 40 → 41), en kyllingelårsregn ("Perfekt" skal kunne nås), Isdronningen og Den Galaktiske Hane på ekspert, og lyn/laser mod en boss.

## Review (Opus) af fase 1–2

Rettet (TDD, røde tests først):
- [x] Skakbrætmuren var vandrette striber (hjelm-reglen brugte kun kolonnen på et i forvejen skråt layout). Nu fuldt gitter med hjelm på `(række + kolonne) % 2`, rækker begrænset til 40 høns.
- [x] Loop-dykket var en dråbe med en lille cirkel (r 42) og et knæk på ~5 px radius. Nu ægte Galaga-loop: bue op og udad (r 28), blødt styrtdyk, 1,5 omgang i en cirkel med r 60, hjem nedefra. Jævn fart via buelængde-tabeller (ingen allokering pr. frame), varighed = længde / 330 px/s, ægget tabes præcis i bunden (`loopEggAt`).
- [x] Pinball-høns fløj ind i hinanden: elastisk stød (`separatePinball`, 3 gennemløb, energibevarende), og de holder sig under HUD-linjen.
- [x] Fart skalerede lige så hårdt som æg pr. sektor (×1,56 i sektor 5) – nu stiger farten kun halvt så meget (×1,28), æggene bærer sværheden, så mønstrene kan læses.
- [x] Sektorstart har egen lyd (fanfare), banneret får temaets farve med accentlinjer og et kort farvet blink.

Forbedret:
- [x] HUD viser det globale bølgenummer i en lille temafarvet pille ved sektorlinjen (og ved boss-bjælken).
- [x] Temaatmosfære: rav-støv (asteroider), sne (is), gløder (vulkan), scanner-bånd og datapunkter (moderskib); stille ved reduceret bevægelse.
- [x] Moderskibets lamper var lyse grønne streger der lignede skud/gaver – dæmpet.
- [x] Baggrundscachen holdt alle 5 temaer (~9 MB hver) – nu højst 2, og næste sektors baggrund tegnes i pausen mellem bølgerne, så temaskiftet ikke hakker.

Anbefalinger til fase 3–7:
- Nyt+ falder i sværhed (sektor 5 → sektor 1 runde 2); overvej at lade runde-skaleringen tage over med ca. ×1,4 eller give Nyt+ en ny fjendetype fra start.
- Fjerene ved drab er stadig hvide i alle temaer; giv `kill`-hændelsen temaet eller farve fjerene fra `tintHen`.
- Indflyvning `sides` med 35–40 høns samler sig i en klump på samme bane; spred kontrolpunktet pr. række.
- Lav loop-varianter (dobbeltloop, spejlede par) til de sene sektorer, når nye fjender kommer i fase 3.

Anbefalet start: Fase 1.
