# Visuelt eftersyn af Supply Chain Hub (1.5.7)

## 1. Hvad er det egentlig, vi designer?

Skill'ens første krav er at forankre designet i emnet. Mit bud — sig til hvis det er skudt ved siden af:

- **Produktet:** det daglige udgangspunkt for Nexis supply chain-teams (TCD, TRR, SCT, SCN, PIM, BPO, TSS).
- **Brugerne:** kolleger på skiftehold, blandede aldre, dansk/engelsk/finsk, på arbejds-laptops med
  begrænset skærmhøjde. De åbner appen mange gange om dagen — ikke én gang som en hjemmeside.
- **Opgaven:** "vis mig hvad mit team laver i dag, og lad mig handle på det med det samme."

Det er altså et **vagtbord**, ikke en landingsside. Den skelnen afgør hver eneste beslutning nedenfor.

## 2. Hvad der er galt i dag

### Tre konkrete fejl (ikke smagsspørgsmål)

1. **`src/index.css` bliver aldrig indlæst.** `main.tsx` importerer kun `main.css`. Der ligger altså
   to komplette, modstridende sæt design-tokens i projektet — det døde sæt vil sende enhver, der
   prøver at rette "temaet", på vildspor. Det døde sæt sætter bl.a. `--font-sans: Quicksand` og alle
   overskrifter til Quicksand; den skrift bliver aldrig hentet nogen steder.
2. **Skrifterne hentes fra Google over nettet** (`fonts.googleapis.com` i `index.html`). Appen er en
   desktop-app, der udtrykkeligt er bygget til at overleve uden netværk. Uden net eller bag proxy
   falder den lydløst tilbage til systemskrift, og der er et glimt af uformateret tekst ved hver
   kold opstart.
3. **Overskrifter er gradient-tekst** (`bg-clip-text text-transparent`, 45 steder). Det giver dårlig
   kontrast, virker ikke i markering/udskrift, og er den mest udbredte "genereret af en maskine"-markør
   der findes.

### Pyntet er højlydt, og data er stille

Optalt i `src/views` og `src/components`:

| Element | Antal |
|---|---|
| `bg-gradient-to-*` | 280 |
| `border-2` | 177 |
| Store skygger (`shadow-lg/xl/2xl`) | 165 |
| `rounded-xl` / `rounded-2xl` | 96 |
| Gradient-overskrifter | 45 |
| `backdrop-blur` | 49 |
| Versal-labels (`uppercase` + `tracking-widest`) | 48 |

Det er præcis den "SaaS-kort-pakke", skill'en advarer imod: alt hakket op i ens afrundede kort med
samme skygge, gradienter som dekoration, og spærrede versaler over hver overskrift.

Det alvorlige er ikke, at det er grimt — det er at **farve ikke betyder noget mere**. Hver opgave i
vagtplanen har sin egen `taskColor`. Det er den eneste farve i appen, der bærer information, og den
drukner i gradienter, der ikke betyder noget som helst.

### Første skærmbillede viser branding, inden det viser noget som helst

Hubbens topområde er `pt-56` — 14rem, 224 px — fast toppolstring. Derunder: Nexi-logoet, og teamets
navn i op til 60 px gradient-tekst. På en 768 px høj laptop er der stort set ikke plads til indhold,
før man begynder at rulle. For et værktøj man åbner tyve gange om dagen, er teamnavnet i kæmpe typer
den mindst nyttige information på skærmen — man ved godt, hvilket team man er i.

## 3. Designplan

### Den bærende idé: **vagtbord, ikke reklame**

Vend forholdet om. Grænsefladen bliver rolig og struktureret; **farve reserveres til rigtige signaler**
— opgavefarver, fravær, uden bemanding, overskredet. Alt andet er papir, streger og tekst.

### Farve — 5 grundværdier + 3 signaler

Bygget på Nexis rigtige mærkefarve, som jeg fandt i logo-filen. Kun én mættet familie i grundpaletten,
så de brugervalgte opgavefarver aldrig støder sammen med den.

| Navn | Hex | Rolle |
|---|---|---|
| Nexi Indigo | `#2D32AA` | Mærkefarven. **Én ting pr. skærm** — den primære handling eller den aktive tilstand. Aldrig pynt. |
| Blæk | `#141A2E` | Tekst og streger. Et rigtigt mørkeblåt, ikke et tonet næsten-sort brugt som "look". |
| Papir | `#F7F8FA` | Appens baggrund. Kølig, næsten hvid. Ingen creme. |
| Kort | `#FFFFFF` | Flader. Adskilles af en streg, ikke af en skygge. |
| Streg | `#DCE0E9` | 1 px struktur. Erstatter de 165 skygger og 177 dobbeltkanter. |

Signaler — **kun** til status, aldrig til dekoration:

| Navn | Hex | Betydning |
|---|---|---|
| Rav | `#B45309` | Kræver handling (ingen tildelt, mangler svar) |
| Grøn | `#15803D` | Dækket, godkendt, klaret |
| Rød | `#B91C1C` | Fraværende, blokeret, afvist |

Ingen gradient i grundsystemet overhovedet.

### Typografi — én familie, ét skala, tabeltal

- **Én skriftfamilie** til alt. To familier ville kun være støj i et værktøj som dette.
- **Skrifterne pakkes med appen** i stedet for at blive hentet fra Google. Retter fejl 2 ovenfor.
- **Et rigtigt typeskala** i stedet for det nuværende `text-2xl sm:text-4xl md:text-5xl lg:text-6xl`,
  der er valgt på fri hånd fra skærm til skærm.
- **Tabeltal** (`font-variant-numeric: tabular-nums`) overalt hvor der står tal — klokkeslæt, datoer,
  antal, scorer. Så flugter kolonnerne. Det er det eneste rigtige typografiske greb i et vagtbord,
  og det koster ingenting.
- **Ingen gradient-overskrifter.** Vægt og størrelse bærer hierarkiet.

Om selve skriften: appen kører **Inter** i dag. Inter er et solidt arbejdsheste-snit — men det er
også *den* forvalgte grænseflade-skrift, og skill'en advarer netop mod at bruge sit frirum på
standardvalget. Alternativet jeg vil foreslå er **IBM Plex Sans**: tegnet til en industri-virksomhed,
fremragende nordiske accenttegn (æ ø å ä ö), åben licens, kan pakkes med. Det er et valg og ikke en
tilfældighed — men det er også et snit, der skal holde til dansk og finsk ved 13 px hos kolleger i
alle aldre, så **det er dit kald**. Begge dele er forsvarlige; jeg pakker skriften lokalt uanset hvad.

### Layout — forsiden

I dag:

```
+------------------------------------------+
|                                          |   14rem fast toppolstring
|                                          |
|                 [nexi]                   |
|        +-----------------------+         |
|        |  TCD   60px gradient  |         |   ingen information
|        +-----------------------+         |
|                                          |
+------------------------------------------+
|  [ Opslagstavle ................. ]      |
|  [ Team-opgaver i dag ........... ]      |   foerst her kommer indholdet
```

Foreslået — det mest karakteristiske i brugerens verden kommer oeverst:

```
+----------------------------------------------------------+
| nexi | TCD           tir. 23. sep.     [soeg]  [profil]   |  en enkelt linje, 56px
+----------------------------------------------------------+
| I DAG                                     8 paa arbejde   |
|  +---+----------------+----------------+---------------+  |
|  | | | Modtagelse     | Test           | Forsendelse   |  |  venstre kant =
|  | | | Rene M.        | Jens R.        | ! ingen       |  |  opgavens egen
|  | | | Lonny H.       |                |   tildelt     |  |  farve
|  +---+----------------+----------------+---------------+  |
|  Fravaer: Frank (ferie) . Sebastian (syg t.o.m. fredag)   |
+----------------------------------------------------------+
| Opslag                                                    |
| Moduler                                                   |
+----------------------------------------------------------+
```

Venstrestillet. Opgavefarven flyttes fra en badge-baggrund ud i **kortets kant** — som fanen på et
fysisk kartotekskort. Så kan navnet stå i almindelig sort på hvidt og være læsbart, mens farven
stadig kan ses på en armslængdes afstand.

### Principper, der skal kunne bruges som facitliste

1. Farve betyder noget. Er den ikke et signal eller mærkefarven, er den grå.
2. Streger adskiller flader — ikke skygger. Én skyggeværdi findes, og kun til ting der svæver
   (dialoger, menuer).
3. Én radius i hele appen. Kortstørrelse, ikke avispapir.
4. Ét fremhævet element pr. skærm. Resten er stille.
5. Bevægelse kun som svar på en handling. Ingen indflyvning af hver sektion.
6. Tal flugter altid.

## 4. Selvkritik mod skill'ens liste over standardsvar

Skill'en beder mig tjekke min egen plan mod de kendetegn, der afslører maskingenereret design:

| Kendetegn | Mit design |
|---|---|
| Creme baggrund + serif + terrakotta (#D97757) | Bruges ikke. Køligt papir, ét sans-snit, indigo. |
| Næsten-sort med én syrefarvet accent | Bruges ikke. |
| Avis-layout: hårfine streger, nul radius, tætte spalter | **Her ligger jeg tættest.** Modtræk: 6 px radius beholdes (kartotekskort, ikke avispapir), rigelig rækkehøjde så det kan skimtes, og indigoen får rigtig vægt ét sted pr. skærm i stedet for hårfine streger overalt. |
| SaaS-kort-pakken: ens kort, samme skygge, gradient-vask | Angribes direkte. Streger erstatter skygger, én radius, farve kun på kanten. |
| Skabelon-pynt: VERSAL-labels, `A · B · C`, `→` på knapper, mono til småtekst | Fjernes. De 48 versal-labels ryger. Mono kun til rigtige koder; tabeltal i stedet for et mono-snit til data. |

Ét punkt kræver en ærlig bemærkning: mono-skrift til små datalabels står på skill'ens liste over
skabelon-pynt. Derfor bruger jeg **ikke** et mono-snit til labels — jeg bruger tabeltal i det
almindelige snit. Det løser den funktionelle opgave (kolonner der flugter) uden at hente udseendet.

## 5. Faser

### Fase 1 — fundamentet (ændrer hver eneste skærm)
- [ ] Slet `src/index.css`, så der kun findes ét sæt design-tokens
- [ ] Pak skrifterne med appen og fjern Google Fonts-hentningen
- [ ] Læg den nye palette og typeskalaen ind som tokens i `main.css` (lys + mørk)
- [ ] Tabeltal som standard
- [ ] Ret de delte primitiver: `card`, `button`, `badge`, `dialog`, `input` — streg frem for skygge, én radius
- [ ] Kontrollér at ThemeBuilder stadig virker oven på de nye tokens

### Fase 2 — forsiden
- [ ] Erstat det 14rem høje bannerområde med én tynd linje med rigtig information
- [ ] "I dag"-bordet som det første man ser
- [ ] Opgavefarven flyttes ud i kortets kant
- [ ] Fjern gradient-overskrifterne

### Fase 3 — de skærme man er i hver dag
- [ ] Vagtplan
- [ ] Feriekalender
- [ ] Teamoverblik
- [ ] Sygemelding og fridage

### Fase 4 — resten
- [ ] Guides, noter, projekter, e-mail, madplan
- [ ] Manager- og admin-paneler
- [ ] Spillehjørnet (her MÅ der godt være mere leg — det er et andet rum)

### Fase 5 — kvalitetsgulv
- [ ] Synligt tastaturfokus overalt
- [ ] Kontrast tjekket mod WCAG AA
- [ ] `prefers-reduced-motion` respekteres
- [ ] Skærmbilleder før/efter af hver hovedskærm
- [ ] Fuld testkørsel og ny pakke

## 6. Det, jeg gerne vil have svar på, før jeg bygger

1. Rammer beskrivelsen af produktet og brugerne rigtigt?
2. **Inter eller IBM Plex Sans?**
3. Er "vagtbord, ikke reklame" den rigtige retning — eller vil I gerne beholde noget af det farverige?
4. Må forsidens store banner ryge?
