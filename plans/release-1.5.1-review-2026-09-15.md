# Gennemgang før Supply Chain Hub 1.5.1
Dato: 15. september 2026. Fokus: alle appens moduler, delte data, opdateringer og Hubert.

## Konklusion

Jeg anbefaler en stabiliseringsrunde før bred release. Der er konkrete fejl i adgangskontrol, samtidige gemninger, kontoflytning, guide-review og guidevisning. Hubert er fortsat kun aktiveret i udviklerappen og er ikke klar til almindelig distribution.

Gennemgangen har ikke ændret appens kode, driftsdata, EXE eller release-ZIP. Denne rapport er den eneste tilføjede projektfil.

### Evidens og afgrænsning

- 167 eksisterende backend- og migrationstests bestod: `node --test electron/*.test.cjs scripts/legacy-data-migration.test.cjs`.
- 38 eksisterende UI-/bibliotekstests bestod: `npm run test:unit`.
- Typekontrol bestod: `npx tsc --noEmit`.
- I alt 205 tests. De omfatter ikke en fuld flerbrugerprøve eller de to reelle installationsopdateringer.
- Offline-køens ombytning af gamle/nye ændringer og to problemer med Huberts faktasvar blev reproduceret med kunstige data i hukommelsen.
- Øvrige fund er baseret på gennemgang af kode og eksisterende tests. Ingen rigtige guides, medarbejderdata eller lagerfiler blev læst. Der er ikke lavet en visuel ende-til-ende-prøve af hvert modul eller målt på det rigtige netværksdrev.

## 1. Det vigtigste før release

### A. Håndhæv adgang i appens baggrundsdel

Flere API-kald mellem brugerfladen og Electron accepterer læsning, skrivning, teamskift og Creator-oplysninger uden at kontrollere en autentificeret session. Nogle kontroller sammenligner alene en mailadresse, som brugerfladen selv sender. En skrivebeskyttet brugerflade er derfor ikke en tilstrækkelig adgangsgrænse.

Det andet teams guidekatalog henter allerede komplette guides og adgangsanmodninger, selv om brugeren endnu ikke har fået adgang. At skjule Åbn-knappen beskytter ikke det indhold, som allerede ligger i appens hukommelse.

**Forslag:** Én fælles adgangskontrol i Electron. Identitet, team og rolle skal udledes af den validerede session; hvert læse-/skrivekald skal kontrolleres. Guidekataloget skal kun returnere tilladte metadata, indtil indholdet er godkendt til brugeren. Dette kan implementeres lokalt uden en IT-server.

Kilder: [electron/main.cjs:461](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:461>), [electron/main.cjs:494](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:494>), [electron/main.cjs:569](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:569>), [electron/main.cjs:654](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:654>), [src/views/GuideLibrary.tsx:145](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:145>).

### B. Beskyt samtidige ændringer og offline-synkronisering

Der er flere forskellige problemer:

1. `useKV` gemmer hele den nye værdi og venter ikke på, at skrivningen lykkes. Flere moduler opbygger denne værdi ud fra en tidligere indlæst liste.
2. Mailmodulet læser hvert femte sekund mails og kalder derefter en setter, der skriver hele listen tilbage. En ny mail mellem læsning og tilbageskrivning kan forsvinde.
3. Projekters medlemsopdatering læser det gamle element før den låste upsert. To samtidige tilmeldinger kan dermed stadig overskrive hinanden.
4. Offline-køen fortsætter efter en fejlet operation. **Reproduceret:** en ældre “afventer”-ændring fejler, en nyere “godkendt” lykkes, og et senere retry sætter status tilbage til “afventer”.
5. Registret tolker alle læse-/parsefejl som en tom liste. Hvis en efterfølgende skrivning lykkes, kan eksisterende team-/brugerregistreringer blive erstattet af et register opbygget fra den tomme fallback.

**Forslag:** Genindlæsning må kun opdatere visningen. Ændringer skal udføres atomart på den senest gemte post, med versionskontrol hvor relevant. En fejlet offline-operation må ikke overhales af nyere ændringer til samme data. Registerfejl skal stoppe skrivningen; kun en fil, der faktisk mangler, må behandles som ny.

Kilder: [src/hooks/useKV.ts:48](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/hooks/useKV.ts:48>), [src/views/EmailSystem.tsx:107](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/EmailSystem.tsx:107>), [src/views/EmailSystem.tsx:127](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/EmailSystem.tsx:127>), [src/components/AnnouncementsBoard.tsx:58](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/AnnouncementsBoard.tsx:58>), [src/lib/kvArrays.ts:30](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/kvArrays.ts:30>), [electron/offlineSync.cjs:81](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/offlineSync.cjs:81>), [electron/registry.cjs:31](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/registry.cjs:31>).

### C. Gør mailadresseændringer sikre

Manager-panelet tjekker mailformat og brugernavn, men ikke om den nye mailadresse allerede tilhører en anden konto. Den gamle konto slettes, og brugerobjektet skrives på den nye nøgle. Det kan overskrive en eksisterende konto. Henvisninger i ferie, hjemmeplan, mails, noter og projekter flyttes heller ikke samlet.

Admin-panelet har desuden en anden ændringsvej, hvor eksisterende password findes via den nye mailadresse. Ved mailændring uden nyt password kan det gamle password derfor gå tabt.

**Forslag:** Fælles kontoservice med unikhedstjek og samlet, kontrolleret flytning. På længere sigt et stabilt bruger-ID, så en ændret mailadresse ikke ændrer personens identitet i data.

Kilder: [src/views/ManagerPanel.tsx:390](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/ManagerPanel.tsx:390>), [src/views/ManagerPanel.tsx:446](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/ManagerPanel.tsx:446>), [src/views/AdminPanel.tsx:208](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/AdminPanel.tsx:208>).

### D. Ret guide-review ved samtidig redigering

Editoren tager udgangspunkt i den guideversion, der blev åbnet, men indsendelsen stempler anmodningen med den version, som er nyest på indsendelsestidspunktet. Eksempel: A åbner 1.00, B udgiver 1.01, og A indsender sin gamle redigering med baseversion 1.01. Konfliktkontrollen kan dermed acceptere overskrivningen.

En allerede konstateret konflikt kan omvendt fastholde forfatteren i en anmodning med forældet baseversion. Retur, genindsendelse og tilbagetrækning giver ikke en klar vej til at oprette en ny revision fra den aktuelle guide.

**Forslag:** Bevar den oprindelige baseversion og indholdshash fra editorens åbning. Godkendelse skal læse både anmodning og guide på ny og gemme under samme versionskontrol. Tilføj “Opret ny revision fra seneste version”, som bevarer forfatterens rettelser til sammenligning.

Kilder: [src/components/GuideEditor.tsx:207](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/GuideEditor.tsx:207>), [src/components/GuideEditor.tsx:485](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/GuideEditor.tsx:485>), [src/views/GuideLibrary.tsx:317](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:317>), [src/views/GuideLibrary.tsx:343](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:343>), [src/views/GuideLibrary.tsx:379](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:379>), [src/views/GuideLibrary.tsx:480](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:480>), [src/lib/guideReview.ts:12](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/guideReview.ts:12>).

Managerens mulighed for egen godkendelse og Guide Admins begrænsning er til stede i det almindelige workflow. Disse regler skal også håndhæves i baggrundsdelen.

### E. Få tværgående guides, billeder og historik til at hænge sammen

- På fanen for et andet team sætter Vis-knappen `viewerOpen`, men den visningsgren indeholder ingen `GuideViewer`. Derfor åbnes den godkendte guide ikke.
- Delte guides gemmes fælles, mens deres billed-/Word-filer og historik ligger i det oprettende teams lager. Standardvisningen leder efter filerne i den aktuelle brugers eget team.
- Billedændringer i review vises hovedsageligt som antal. Et udskiftet billede kan fremstå som “1 billede → 1 billede”.
- Almindelige brugere kan nulstille den periodiske reviewdato via “Marker som gennemgået”.

**Forslag:** Fælles guide-dialog, eksplicit ejerteam på vedhæftninger og en autoriseret fil-loader i alle visninger. Samme ejerskab skal gælde historik, eksport og Hubert. Vis før/efter-billeder i review og lad manager/Guide Admin attestere den periodiske gennemgang.

Kilder: [src/views/GuideLibrary.tsx:666](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:666>), [src/views/GuideLibrary.tsx:728](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:728>), [src/views/GuideLibrary.tsx:1072](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:1072>), [src/views/GuideLibrary.tsx:296](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:296>), [src/lib/fileStorage.ts:119](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/fileStorage.ts:119>), [src/lib/guideStore.ts:25](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/guideStore.ts:25>), [src/components/GuideReviewDashboard.tsx:94](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/GuideReviewDashboard.tsx:94>), [src/views/GuideLibrary.tsx:275](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/GuideLibrary.tsx:275>).

### F. Flyt resterende tung filbehandling væk fra appens hovedproces

Huberts opslag har en separat proces, men almindelig datalæsning, skrivning, låse, backup og indlæsning af oversættelsesmodeller udføres fortsat synkront i Electron-main. Et langsomt netværksdrev kan derfor stadig få appen til at virke frosset.

**Forslag:** En baggrundsproces til fælles datalagring, backup og store modelindlæsninger. UI skal vise en kort status og kunne modtage klik imens. Afprøv med simuleret forsinkelse og afbrudt forbindelse.

Kilder: [electron/store.cjs:80](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/store.cjs:80>), [electron/store.cjs:164](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/store.cjs:164>), [electron/main.cjs:253](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:253>), [electron/main.cjs:708](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:708>).

## 2. Modul for modul

Nedenstående blander konkrete rettelser og produktforslag; “overvej” markerer nye funktioner.

| Modul | Anbefaling |
|---|---|
| Main Hub/dashboard | Ret prioriteten mellem ferie, sygdom og hjemmemønster. Hjemmearbejdskortet skal også kunne vises ved kun ét team. Vis opdateringstid; overvej at flytte widgets med træk-og-slip. |
| Vagtplan | Brug samme kontrol for ferie/sygdom og dubletter i dialog, celle- og ugehandlinger. Kontroller ændringer atomart. |
| Feriekalender og sygdom | Centraliser godkendelser og beskyt samtidige ændringer. Gennemgå overlap, tilbagekaldelse og finske dialog-/fejltekster. |
| Hjemmearbejde | Brug samme fraværsprioritet i hub, samlehub og Hubert; en fast hjemmedag skal ikke vinde over godkendt ferie. |
| Teamoversigt | Filtrér ikke-godkendte brugere fra medarbejdervisningen. Opdatér ved fokus; overvej søgning og teamfilter. |
| Madplan | Brug ISO-ugeår sammen med ugenummer. Ret arkivnavigation, der antager 52 uger pr. år. Overvej kladdebeskyttelse ved skift af uge. |
| Projekter | Ret samtidige til-/frameldinger. Overvej ansvarlig, deadline og arkiv; det giver Hubert faktiske projektfrister at svare ud fra. |
| Notesbog | Personlig læst-status på fælles notifikationer, live-opdatering af noter og konfliktkontrol ved redigering. |
| Intern mail | Fjern tilbageskrivning ved refresh. Mapper, læst-status og sletning skal være pr. bruger; modtagers flytning må ikke fjerne mailen fra afsenders Sendt. |
| Opslagstavle | Fjern hel-liste-skrivning efter atomare ændringer. Overvej udløbsdato og mulighed for at fortryde sletning. |
| Notifikationscenter | Brug lokal dato til fødselsdage. Åbn den konkrete mail/note/anmodning frem for kun modulets startside. |
| Manager/Admin | Fælles kontoændringer med kollisions- og relationskontrol. Fælles håndhævelse af roller og guide-review. |
| Creator | Teamnavn/forkortelse, manageroversigt og generiske samlehubs findes. Prioritér sikre registerændringer og adgang frem for flere indstillinger. |
| Samlehub | Automatisk, rolig opdatering og “opdateret kl.”. Vagtmodulet viser nu kun dagens opgaver; giv det samme uge-/datovalg som almindelig hub. |
| Guidebibliotek, editor og review | Ret samtidighed, anden-team-visning og delte assets. Billeddiff og tydelig konflikthåndtering er de vigtigste kvalitetsforbedringer. |
| Finsk/Bergamot | Samme motor bruges, men forbedr timeout, retry og lokal modelcache. Gennemgå hårdkodede fejltekster og finsk søgning. |
| Arcade/GameCorner/Modern | Lavere prioritet. Bevar eksisterende lazy-loading. Afprøv pause ved fokustab, finsk og genveje, især når et iframe-spil har fokus. |
| Temaer | ThemeBuilder ser ikke aktivt tilgængelig ud. Hvis den aktiveres, valider temaimport og ejerskab. Dette er ikke en påvist blokering i et aktivt modul. |
| Datalagring/backup/opdatering | Fejl skal være synlige og kunne genforsøges. Test gendannelse samt begge reelle opdateringsveje før release. |

Supplerende kodehenvisninger:

- Vagtvalidering: [src/views/ShiftSchedule.tsx:281](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/ShiftSchedule.tsx:281>), [src/views/ShiftSchedule.tsx:411](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/ShiftSchedule.tsx:411>).
- Madplanens ugeår/arkiv: [src/views/MealPlan.tsx:42](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/MealPlan.tsx:42>), [src/views/MealPlan.tsx:437](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/MealPlan.tsx:437>). Hubben bruger tilsvarende opslag: [src/views/Hub.tsx:371](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/Hub.tsx:371>).
- Projekter: [src/views/ProjectBoard.tsx:106](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/ProjectBoard.tsx:106>), [src/lib/kvArrays.ts:30](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/kvArrays.ts:30>).
- Noter: [src/views/VirtualNotebook.tsx:78](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/VirtualNotebook.tsx:78>), [src/views/VirtualNotebook.tsx:123](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/VirtualNotebook.tsx:123>).
- Personlige mailmapper/sletning: [src/views/EmailSystem.tsx:190](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/EmailSystem.tsx:190>), [src/views/EmailSystem.tsx:320](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/EmailSystem.tsx:320>), [src/views/EmailSystem.tsx:491](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/EmailSystem.tsx:491>).
- Samlehub: [src/views/ObserverWorkspace.tsx:116](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/ObserverWorkspace.tsx:116>), [src/views/ObserverWorkspace.tsx:158](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/ObserverWorkspace.tsx:158>).
- Hjemmearbejde: [src/lib/homeOffice.ts:9](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/homeOffice.ts:9>), [src/views/Hub.tsx:202](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/Hub.tsx:202>), [src/views/Hub.tsx:1424](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/Hub.tsx:1424>).
- Teamoversigt: [src/views/TeamOverview.tsx:32](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/TeamOverview.tsx:32>), [src/lib/userRoles.ts:97](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/userRoles.ts:97>).
- Notifikationer: [src/components/NotificationCenter.tsx:75](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/NotificationCenter.tsx:75>), [src/components/NotificationCenter.tsx:152](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/NotificationCenter.tsx:152>).
- Danske resttekster: [src/views/ShiftSchedule.tsx:237](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/ShiftSchedule.tsx:237>), [src/views/VacationCalendar.tsx:115](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/views/VacationCalendar.tsx:115>), [src/lib/kvErrorToast.ts:18](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/kvErrorToast.ts:18>).

### Finsk og oversættelse

Finsk går gennem samme Bergamot-motor; dansk ↔ finsk går via engelsk. Jeg ville bevare den fælles motor og gøre fejlforløbet robust: worker-fejl skal afvise ventende kald, en timeout skal kunne genforsøges, og en midlertidigt tom modelliste må ikke caches permanent.

Bibliotekets tekstsøgning splitter ord med en tegnliste, der udelader finske ä/ö. Brug Unicode-baseret ordopdeling og tilføj finske søgeprøver. En test af oversættelsesnøgler beviser ikke, at alle toasts eller fejlbeskeder er oversat.

Kilder: [src/lib/bergamotTranslator.ts:35](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/bergamotTranslator.ts:35>), [src/lib/bergamotTranslator.ts:145](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/bergamotTranslator.ts:145>), [src/lib/bergamotTranslator.ts:181](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/bergamotTranslator.ts:181>), [src/lib/searchIndex.ts:108](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/searchIndex.ts:108>).

## 3. Hubert: vigtigste forbedringer

### Før Hubert indgår i release

**Aktivering og installation.** Både UI og Electron-handlers er DEV-only. Model og runtime ligger separat under brugerens lokale appdata og er ikke med som release-assets. Der skal være en konkret distributionsvej, verificerede filer, installationsstatus og en prøve på en ren tilsvarende pc. Bevar lokal behandling.

Kilder: [src/components/HubAssistant.tsx:53](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/HubAssistant.tsx:53>), [electron/main.cjs:500](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:500>), [electron/localAI.cjs:10](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/localAI.cjs:10>), [package.json:41](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/package.json:41>).

**Mere pålidelige faktasvar.** To fejl blev reproduceret med kunstige data:
- Guide-søgningen tager kun tre hits og returnerer ikke det fulde antal til den korte faktasvar-funktion. Tre guides med samme adresse og en fjerde med en anden gav et entydigt svar, selv om kilderne var i konflikt.
- En adresse med et almindeligt punktum efter sidste ciffer blev ikke genkendt af den direkte IP-udtrækning. Det sender unødigt arbejdet videre til model/fallback.

Kilder: [electron/assistantContext.cjs:322](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/assistantContext.cjs:322>), [electron/assistantAnswers.cjs:17](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/assistantAnswers.cjs:17>), [electron/assistantAnswers.cjs:37](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/assistantAnswers.cjs:37>).

**Forslag:** Ét fælles søgeresultatformat med antal, dækningsgrad, guide-ID, ejerteam og version. Kontroller alle relevante kandidater før et entydigt faktasvar; bind historiske sammenligninger til samme guide. Test tegnsætning og flere forskellige fakta, ikke kun IP-adresser.

### Derefter, i prioriteret rækkefølge

1. **Ét fælles, lokalt søgeindeks.** Biblioteket har allerede en mere avanceret søgning end dele af Hubert. Saml dem, og gem et versionsstyret indeks lokalt, så det kan genbruges efter genstart. Opdatér kun ændrede guides. Rettigheder skal kontrolleres ved hvert opslag, og indekset skal være afgrænset til brugerens adgang.
2. **Billeder skal kunne findes via deres tekst.** Den aktuelle forberedelse indekserer guidetekst; den tager kun første billedreference pr. trin, og modellen får højst ét valgt guidebillede. Lokal tekstgenkendelse i baggrunden vil gøre skærmbilleder søgbare. Begræns belastningen og vis adgang til originalbilledet som kilde.
3. **Samtalekontekst som emne, person, periode og kilder.** De seneste seks spørgsmål er nyttige, men “hvor står det?” og “hvad med ham?” kræver også, at relevante personer/kilder fra svaret huskes som referencer. Hent fakta på ny; markér tvetydighed og nulstil ved adgangs-/hubskift.
4. **Progressiv visning af svaret.** Modelkald bruger `stream: false`, og brugeren kan vente længe på hele resultatet. Vis en kort fase som “Søger i guides” eller “Formulerer svar”, og skriv svaret frem løbende. Bevar den kompakte chat.
5. **Forståelig kapacitetsstatus.** “Guidesøgning klar” siger ikke, om modellen kan starte med den aktuelle RAM. Skeln mellem klar søgning, tilgængelig AI og midlertidigt begrænset drift uden at fylde chatten med teknik.
6. **Forslag til adgangsanmodning.** Lad Hubert søge i et godkendt katalog over andre teams guide-titler, emner og ejere og tilbyde “Anmod om adgang”. Indhold og billeder må først hentes efter adgang. Dette kræver, at katalog-/adgangsfejlen i afsnit 1A løses.
7. **Saml guidechat og Hubert.** Der er stadig to separate chatimplementeringer. Lad guidebibliotekets chat åbne Hubert med den relevante guide som kontekst.
8. **Fast sæt samtaleprøver.** Brug kunstige opgaver, madplaner, guides og billeder til en repræsentativ samling spørgsmål på dansk, engelsk og finsk. Medtag opfølgninger, konflikter, manglende data, tilbagekaldt adgang, lav RAM, stop og langsomt drev. Mål både korrekthed og tid til første svar.

Kilder: [electron/assistantReadCache.cjs:5](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/assistantReadCache.cjs:5>), [electron/assistantGuideIndex.cjs:20](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/assistantGuideIndex.cjs:20>), [electron/assistantContext.cjs:327](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/assistantContext.cjs:327>), [electron/main.cjs:545](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:545>), [electron/localAI.cjs:168](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/localAI.cjs:168>), [electron/assistantConversation.cjs:2](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/assistantConversation.cjs:2>), [src/components/HubAssistant.tsx:115](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/HubAssistant.tsx:115>), [src/components/GuideChat.tsx:1](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/components/GuideChat.tsx:1>), [src/lib/searchIndex.ts:1](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/src/lib/searchIndex.ts:1>).

Jeg ville forbedre søgning, dataadgang og samtalekontekst før et skift til en større model. Det hjælper både svartid og kvalitet på de pc'er, appen skal køre på.

## 4. Release og opdatering

- Prøv de faktiske pakker i begge forløb: **TCD Hub 1.4.3 → Supply Chain Hub 1.5.1** og **Supply Chain Hub 1.5.0 → 1.5.1**. Kontroller eksisterende data, config, genstart, frakobling og genoprettelse.
- De eksisterende updater-tests bruger små kunstige pakker. Beståede unit tests beviser ikke, at den endelige EXE/ZIP virker på medarbejdernes pc'er.
- Delta-opdateringens oprydning finder alle filer, som ikke står i den nye pakke, og sletter dem. Begræns oprydning til filer, den tidligere apppakke ejede, så lokale tilføjelser ikke rammes.
- Projektets byggekommando producerer også portable output, men updateren tager installationsstien fra den kørende EXE. Afklar/supportér den variant eller blokér opdatering i den; distributionsvejledningen skal være entydig.
- Opdatér releaseplan og changelog til de faktisk færdige funktioner. Releaseplanen siger fortsat “Ingen endnu”.
- Når der efterfølgende bygges, skal EXE og release-ZIP komme fra samme godkendte kodetilstand, som brugeren tidligere har krævet.

Kilder: [electron/updater.test.cjs:9](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/updater.test.cjs:9>), [electron/updater.cjs:349](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/updater.cjs:349>), [electron/updater.cjs:507](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/updater.cjs:507>), [electron/main.cjs:837](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/electron/main.cjs:837>), [package.json:19](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/package.json:19>), [plans/release-1.5.1.md:38](<C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.1/plans/release-1.5.1.md:38>).

## 5. Foreslået arbejdsrækkefølge

1. Fælles adgangskontrol, sikre kontoændringer og beskyttelse mod tab af samtidige/offline ændringer.
2. Guide-review, ekstern guidevisning, delte billeder/historik og konflikthåndtering.
3. Responsiv datalagring samt konkrete kalender-, madplan-, mail- og finskfejl.
4. Hubert: korrekte søgeresultater, adgangsafgrænset indeks, samtalekontekst, billedtekst og releaseinstallation.
5. Samlet prøve med mindst to testkonti/to klienter, alle relevante roller og begge opdateringsveje. Derefter endelig EXE, release-ZIP, changelog og release.

Deadline/ansvarlig på projekter, flytbare widgets, mere avancerede temaer og spilforbedringer kan vente, hvis de ikke er nødvendige for den aftalte 1.5.1.

## 6. Implementeringsstatus — 15. september 2026

Fase 1 er **påbegyndt, ikke afsluttet**. Ændringerne nedenfor er kildekodeændringer. Der er ikke bygget, opdateret release-ZIP eller publiceret noget i dette forløb, og 1.5.1 er ikke frigivelsesklar alene på grund af disse rettelser.

### Implementeret i første del af fase 1

- Samme ejerskabskontrollerede lås bruges af datalagerets set/delete/update og registerets muterende operationer. En langsom klient mister ikke sin lås, blot fordi ti sekunder er gået.
- Eksisterende, ulæselige registre/browserdata giver en fejl frem for at blive behandlet som manglende/tomme data. Registertildeling kan ikke flytte en eksisterende e-mail til et andet team ved et uheld. Teamoprettelse afviser genbrug af samme mappe og usikre mappenavne.
- `compareAndSet` kontrollerer en hel gemnings forventede udgangspunkt. `replaceItem` kontrollerer det berørte element, mens andre elementer bevares. Funktionelle ændringer genberegnes på friske data ved konflikt, med højst fem forsøg.
- `useKV` kølægger egne gemninger, bevarer hurtig lokal feedback og genindlæser gemte data ved slutfejl. Subscription-svar må ikke erstatte nyere ventende input, og kølagte gemninger annulleres efter komponentens cleanup. Dette er ikke i sig selv en backend-garanti ved hubskift.
- Offline-køen holder rækkefølgen pr. nøgle: Efter en fejlet operation må en nyere operation på samme nøgle ikke overhale. Uafhængige nøgler kan stadig synkroniseres. Ny online-gemning på en nøgle med ventende operationer går bag dem i køen.
- Forsinket cachespejling/sletning må ikke overskrive nyere lokale ændringer. Ægte konflikter, ugyldige operationer og optagede låse bliver ikke skjult som nye offline-gemninger.
- Tilføjelser med identisk id/indhold kan genforsøges uden dubletter; samme id med andet indhold giver konflikt. En allerede udført sammenlign-og-gem med uændret slutværdi kan genforsøges uden at skrive igen.
- Kontoens flytning i `users` er én atomar, konfliktkontrolleret operation (`renameField`) i stedet for slet-og-opret. Navne-/profilgemninger kontrollerer også den tidligere konto. Manager-panelet afviser en anden kontos e-mail; AdminPanel bevarer adgangskode og øvrige lagrede felter ved tomt adgangskodefelt/e-mailskift. **Tilknyttede data er endnu ikke migreret.**
- EmailSystem laver ikke længere en ekstra, gammelt-snapshot-gemning ved indlæsning. AnnouncementsBoard laver ikke en redundant hel-array-gemning efter append/remove.
- Det gamle migrationsværktøj bruger nu datalagerets betroede, synkrone `mutate`-transaktion. Genlæsning, backup og bevarende sammenfletning er under samme lås; dobbelte låse er fjernet. Mål-data bevares stadig ved konflikter.

### Verifikation og afgrænsning

Der er kun anvendt kildekode og syntetiske fixtures i isolerede testmapper/hukommelseslagre. Ingen faktiske hubregistre, konfigurationer eller brugerdata er indlæst til gennemgangen.

Der er tilføjet prøver af to datalagerinstanser, forventede gemningskonflikter, konto-flytning, beskadiget register/browserlager, offline-rækkefølge, dubletter ved usikkert netværksresultat, lock-ejerskab og backupfejl. Hook-prøverne bruger en simuleret React-livscyklus; de erstatter ikke en rigtig Electron/React-prøve med to klienter.

Verificeret ved afslutningen af første del, før native-loginændringerne i afsnit 7: `npx tsc --noEmit` bestået; 186 Electron-tests og 55 frontend-tests bestået; de fire migrationsprøver bestået. I alt 245 automatiske prøver. `git diff --check` for de berørte eksisterende filer bestået. Den målrettede migrationskørsel omfattede også 23 datalagerprøver (27 prøver i den kommando); de 23 tælles ikke dobbelt i totalen.

### Næste del — fortsæt her

1. Flyt credential-validering og sessionsoprettelse til backend, bind den verificerede identitet til vinduet og stop tillid til caller-supplied e-mail. Gennemgå alle IPC-endpoints, ikke kun Hubert.
2. Implementér rolle-/række-/guideadgang i backend, herunder et begrænset katalog for andre teams. Et e-mailskift skal have en genoptagelig konto-transaktion, der flytter referencer, registeropslag, samlevisninger og personlige data samt håndterer aktive sessioner. Den atomare `users`-flytning ovenfor løser kun ét trin.
3. Gennemgå resterende rå set/upsert/delete-forløb og offline-konflikter. Vis et sikkert konfliktløsningsforløb; konflikter ligger indtil videre bevaret i køen. Aftal/genbrug forsvarlig genopretning af låse efter et faktisk klientnedbrud — låse må ikke stjæles automatisk på alder alene. Låsegarantien kræver klienter med samme skriveprotokol; prøv også blandede versioner før rollout.
4. Foretag den samlede fase-1-prøve med to testkonti og to klienter, inklusive logout/hubskift under ventende I/O. Først derefter fortsættes til fase 2 om guides.

Fase 2–5 i afsnit 5 er fortsat åbne. Hubert er ikke gjort releaseaktiv, en større model er ikke indført, og alle nye runtime-tests har kørt lokalt uden ekstern behandling af hubdata.

## 7. Native identitet og adgangsgrundlag — fortsættelse 15. september 2026

Fase 1 er stadig **ikke afsluttet**. Følgende er implementeret i udviklingskoden, ikke i en ny EXE/release-ZIP:

- Desktop-login og tilmelding valideres i backend via `electronAuth`. PBKDF2-hashing er asynkron; gamle klartekstadgangskoder opgraderes efter korrekt login. Tilmelding kan kun oprette en almindelig, afventende bruger, uanset de privilegier/statusfelter der sendes fra formularen.
- Verificeret identitet bindes til Electron-vinduet og platformroden. Tilfældige bearer-tokens gemmes kun som hashes i det fælles sessionslager; sessionsregistreringer signeres med en lokal enhedsnøgle og bindes til kontoens aktuelle adgangskode. Normal konto-/rolle-/godkendelsesstatus kontrolleres igen ved brug. Ny login-session og fjernelse af den tidligere session sker under samme lås.
- Vinduesvalideringen accepterer kun appens egen hovedframe. Alle registrerede IPC-handlere går gennem en fælles gate; nye kanaler kræver en verificeret session som standard. Rolle må aldrig gives ud fra en indsendt e-mail. Creator-operationer, managernes kontoskrivninger, teamvalg, skrivebeskyttede samlevisninger og Huberts token/hub-kontekst kontrolleres i backend.
- Ændring af adgangskode kræver den gamle adgangskode i backend. Profilændringer kan kun ændre egen telefon/adgangskode, ikke rolle/e-mail. En adgangskodeændring ugyldiggør de tidligere native sessioner. Logout under et asynkront login kan ikke blive efterfulgt af et sent, nyt login.
- Normale `users`-læsninger sender ikke adgangskoder/hashes til frontend. Kontogemninger bevarer den private adgangskode ved tomt felt. Eksisterende kontoredigeringer sammenligner deres offentlige udgangspunkt; oprettelse må ikke erstatte en allerede oprettet konto. **Sletning og flytning af tilknyttede data kræver stadig den fælles kontotransaktion.**
- Tværgående læsninger accepterer kun registrerede, validerede teammapper og en eksplicit liste over oversigts-/highscore-/guidekatalogdata. Kontakttelefoner bevares, fordi de allerede er en bevidst funktion i Team Oversigt; hashes, ekstra private profilfelter, ferie-noter og sygdomsårsager følger ikke med denne offentlige oversigt. Kun godkendt fravær sendes i tilstedeværelsesoversigten.
- Et andet teams guidekatalog indeholder metadata, ikke indhold, Word-data eller billed-id'er. Guideindhold kræver egen gyldig adgangsanmodning; filnøgler skal tilhøre en tilgængelig offentliggjort guide. Samlevisningens guide-/kalenderlæsninger kræver netop den aktuelt valgte, tildelte visning. Guidekataloget læser grantlisten én gang pr. forespørgsel, også med 400 guides.
- Hubert og guidekataloget bruger samme grantfunktion: En nyere afvisning/afventende anmodning erstatter en ældre godkendelse; en anden konto/hjemmehub eller en udløbet/ugyldig udløbsdato giver ingen adgang. Ældre godkendelser uden udløbsdato beholder bibliotekets tidligere adfærd. Tests i en rigtig guide-worker kontrollerer, at en opvarmet guide ikke overlever tilbagekaldelse.
- Creatorens eksplicitte, teamafgrænsede backupeksport har sin egen backendvej, så konto-adgangskoder ikke forsvinder på grund af de sanitiserede profillæsninger. Sessions-/interne nøgler eksporteres ikke. Ulæselige eller forsvundne datasæt stopper eksporten. Eksporten er endnu ikke et konsistent multi-fil/platform-snapshot.
- **Desktop-backupgendannelse er midlertidigt blokeret før første skrivning**, indtil en valideret, genoptagelig backendtransaktion er klar. Dette forhindrer den gamle nøgle-for-nøgle-gendannelse i at ændre nogle data og derefter fejle på den nu beskyttede `users`-nøgle. Browser-testforløbet er ikke berørt.
- Loginfladen kan stadig hente status og installere den creator-publicerede, seneste opdatering. Valg af en eksplicit historisk/forceret version kræver en session. En bruger kan kun forbruge sin egen tvungne opdateringsanmodning; oprettelse/ændring kræver manageradgang. Udgiverens identitet tages fra backend-sessionen, ikke payloaden.

### Verificeret efter denne fortsættelse

- 267 backend-tests bestået på den endelige kildekodetilstand (`node --test electron/*.test.cjs`).
- 59 frontend-tests bestået (`vitest run`, via `npm test`).
- 4 migrationsprøver bestået. **I alt 330 automatiske tests**; målrettede genkørsler tælles ikke ekstra.
- `npx tsc --noEmit`, Node-syntaxkontrol og `git diff --check` for de berørte eksisterende filer bestået.
- `npm run test:electron-auth`: **17 kontrolpunkter bestået i rigtig Electron**, med to samtidig autentificerede, skjulte vinduer og den rigtige preload/contextBridge/vinduesgate. Prøven tester bl.a. falsk creator-e-mail, privat sessionslæsning, uregistreret mappe, read-only-skrivning, credential-backup, profilens rolleafgrænsning og logout-isolation.
- Electron-prøven bruger et særskilt entrypoint og en frisk midlertidig platform/userData-mappe. Den indlæser aldrig den faktiske `main.cjs`, eksisterende config, brugerregistre eller hubdata. Den er ikke en fuld React-UI-, netværksdrev-, to-pc- eller opgraderingsprøve. Chromium kan beholde handles til sin isolerede testcache; kun en sådan midlertidig testmappe kan efterlades ved exit.

### Fortsæt her — nødvendigt før fase 1 kan afsluttes

1. Implementér backend-regler på de enkelte rækker/handlinger for mail, noter, ferie/sygdom, shifts, projekter og guides. Den fælles gate er et identitets-/rollegrundlag, **ikke færdig autorisation af alle KV-operationer**. Gennemgå også øvrige fil-/eksportkanalers mål og personlige læsninger. Den generiske `shared-guides`-vej kræver fortsat adgangsprojektion og kontrollerede skrivninger.
2. Implementér den genoptagelige kontotransaktion for e-mailskift/sletning: referencer i alle relevante datasæt, registeropslag, samlevisninger, personlige nøgler, aktive sessioner og kontrolleret genopretning efter fejl. Saml alle creator-/manager-/onboardingforløb. Et atomart `users`-rename er kun ét trin.
3. Implementér backend-backupgendannelse med validering, konflikter og recovery **før desktop-import igen åbnes**. Bevar private kontofelter sikkert og håndtér platform/shared-data eksplicit. Gennemgå også lagersti-skiftets platform/team-semantik, så kontovalidering og faktisk datasti ikke divergerer.
4. Afslut resterende rå set/upsert/delete- og offline-konfliktforløb samt forsvarlig låserecovery. Native godkendelser/privilegier bruger friske autoritative læsninger, ikke et offline privilegie-fallback; offline-login er derfor ikke givet. Flyt blokerende netværks-I/O uden for UI/main-sporet, uden at svække disse kontroller.
5. Test de fulde UI-forløb, cold-start/bootstrap og recovery af creator-kontoen. Desktop-login bruger kontoens gemte adgangskode; den indbyggede nødhash og hardcodede manager-e-mails er **ikke** autorisationsgenveje i native-loginvejen. Det gamle browser/dev-fallback er endnu ikke fjernet og er ikke en desktop-sikkerhedsgrænse.
6. Test blandede gamle/nye klienter. Gamle remember-tokens er ikke gyldige native sessioner, så brugere skal logge ind igen én gang. Ældre klienters skrivninger til den fælles sessionsfil og andre datanøgler skal prøves som en del af rollout, ikke antages kompatible.

Fase 2–5 er fortsat åbne. Ingen rigtige brugerdata er rørt, ingen hubdata er sendt til eksterne tjenester, ingen større AI-model er indført, og der er ikke bygget eller publiceret noget. Når der faktisk bygges, skal release-ZIP opdateres fra samme godkendte kildekodetilstand som EXE'en.

## 8. Genoptagelig e-mailflytning — fortsættelse 15. september 2026

Fase 1 er fortsat **ikke afsluttet**. Den tidligere enkeltfil-flytning i afsnit 6–7 er nu erstattet i native-kontoredigering med en journalført backendflytning. Sikker kontosletning og fuld autorisation pr. modul er stadig åbne.

### Implementeret

- Native ManagerPanel/AdminPanel lader backend samle e-mailskiftets kontorække, privat adgangskode, registeropslag, samlevisningsadgang, kendte strukturerede kontoreferencer og personlige nøgler. Frontend forhåndstildeler ikke længere den nye e-mail eller laver en separat guide-admin-flytning ved kontoredigering.
- Det verificerede manager-hjemmeteam eller Creator afgør målteamet. Skrivebeskyttede visninger og omdøbning af Creator-kontoen er afvist. Afvigelse mellem aktiv lagersti og registreret teamsti stopper flytningen, så et tidligere lagersti-skift ikke får flytningen til at ramme et andet datasæt end panelet viser.
- Før første datasæt ændres, kontrolleres det offentlige konto-udgangspunkt, eksisterende konti på tværs af registrerede teams, personlige målnøgler, rodnøgler og læsbarheden af de berørte data. Konti/personlige måldata må ikke overskrives. En kendt lokal offline-kø skal tømmes før flytning.
- Berørte filer deler den normale ejerskabskontrollerede datalager-/registerlås. Den fælles kontogate serialiserer almindelige native KV-/registerskrivninger, credential-commits og offline-replay mod flytningen. En optaget kontogate fejler straks i stedet for at vente i en main-thread-løkke; låsen stjæles ikke.
- Referencemapping dækker de kendte e-mail-/bruger-id-felter i bl.a. ferie, shifts, mails/mapper, projekter, personlige/delte noter, guidenes forfatter/reviewer/claim/archive/history og adgangsanmodninger. Fødselsdagens kontoafledte id flyttes, men opake hændelses-/record-id'er bevares. Guide-/notetekst, kommentarer, billeder/fildata og private adgangskoder ændres ikke som en generel tekstsøg-og-erstat.
- Sprog, tema/dashboard, afviste opslag, sete ferieanmodninger, fødselsdagsmarkering og guide-review-påmindelseslog følger identiteten. Eksisterende personlige målindstillinger giver konflikt i stedet for overskrivning.
- Kontoens tidligere native/legacy sessionsregistreringer fjernes som en afgrænset sessionsændring. Andre kontis nye/fornyede sessioner bevares under recovery. Selv-omdøbning får et valideret success-svar og logger personen ud; efterfølgende login bruger den nye e-mail og bevarede adgangskode.
- Et backend-ejet kontinuitets-id og register over tidligere e-mails forhindrer almindelig nyoprettelse på en pensioneret identitet. Formularer kan ikke sætte eller erstatte dette kontinuitets-id. Gamle kontoreferencer i nye KV-/offline-operationer bliver afvist frem for at genopstå efter flytning. Ældre klienter uden den nye protokol er **ikke** dækket af denne garanti.
- Første journal gemmer krypterede før-/efter-snapshots én gang. Fremdrift og den normale læse-/skrivegate bruger en lille atomar kontrolfil; den store journal bliver ikke genlæst ved hvert normalt opslag eller omskrevet efter hvert trin. Generisk KV/listning og almindelig backupeksport afviser interne `account-*`-nøgler.
- Ved ufuldstændig flytning spærres normale hubopslag/skrivninger. Resultater fra ventende asynkrone opslag afvises, hvis migrationskonteksten er ændret. En genopretningsvisning findes uafhængigt af det valgte modul, på dansk/engelsk/finsk. Creator kan genoptage eller vælge en bekræftet rollback via særskilte backendkanaler.
- Recovery undersøger samtlige planlagte nøgler før første recovery-skrivning. En tredjepartsændring uden for før-/efter-tilstanden giver konflikt uden automatisk overskrivning. En skrivning, der nåede disken før en fejl, bliver genkendt og ikke gentaget. Creator-login under recovery opgraderer ikke private kontosnapshots og rydder ikke den berørte kontos ventende sessionssnapshot.
- Forsinket cachespejling fra før flytningen annulleres, aktive caches ugyldiggøres, og Huberts worker/kontekst geninitialiseres efter fuldført flytning/recovery.

### Verificeret og afgrænset

- 309 backend-tests og 68 frontend-tests bestået via `npm test`; 4 syntetiske legacy-migrationsprøver bestået. **381 automatiske tests i alt**, uden dobbelttælling af genkørsler.
- 25 målrettede slutprøver af IPC-/backupfilteret bestået efter tilføjelsen af interne kontonøgler; disse tælles ikke ekstra. `npx tsc --noEmit`, Node-syntaks for Electron-modulerne og diff-kontrol af de berørte eksisterende kildefiler bestået.
- Den separate, skjulte Electron-prøve har **35 beståede kontrolpunkter** med to autentificerede vinduer og rigtig preload/IPC: succesfuldt e-mailskift, bevaret sprog/adgangskode/samlevisningsadgang, tilbagekaldt gammel session, afvist pensioneret tilmelding, afbrudt flytning, spærring af normalt opslag, afvist bruger-recovery, nyt Creator-login og genoptagelse.
- Recovery-visningens 9 frontendprøver bruger en isoleret hook-harness/SSR med mocks, ikke en rigtig DOM eller komplet app-UI. Ingen faktisk `main.cjs`, eksisterende config, hubregistre, logs eller brugerdata er indlæst til gennemgangen. Chromium kan efterlade kun sin navngivne, isolerede testcache ved exit.
- Genopretning er prøvet ved syntetiske I/O-fejl/undtagelser, også efter en vellykket diskskrivning. **Et faktisk proces-/pc-nedbrud med efterladte låse er ikke løst eller prøvet**; ejerskabssikker låserecovery og blandede klientversioner er stadig nødvendige før rollout.
- Kontoflytningens snapshot-/fil-I/O er fortsat synkront i backend. Den lille kontrolfil fjerner en ny unødvendig journal-overhead, men løser **ikke** appens samlede risiko for blokerende netværks-I/O. Worker-flytning og belastningsprøver er stadig åbne.

### Fortsæt her

1. Færdiggør autorisation på de enkelte rækker/handlinger: mail/noter, ferie/sygdom, shifts/projekter, guides/review, delte guides og fil-/eksportmål. Identitetsgaten og kontoflytningen er ikke en garanti for alle generiske KV-operationer.
2. Saml kontooprettelse/onboarding og sikker kontosletning i tilsvarende recoverable backendforløb. Nyoprettelse og registertildeling har stadig separate commits; sletning flytter/rydder endnu ikke alle referencer og private data.
3. Færdiggør konflikthåndtering/offline-UI, ejerskabssikker recovery af nedbrudslåse og kompatibilitetsprøver med gamle klienters ventende operationer. Kontoflytning må ikke antages sikker i et blandet gammelt/nyt skriveprotokolmiljø.
4. Gendan desktop-backupimport først efter valideret backend-recovery og ret lagersti-skiftets platform/team-semantik. Flyt tung fil-/netværks-I/O uden for UI/main-sporet.
5. Kør den fulde React/Electron-UI-prøve, cold-start/bootstrap, selv-omdøbning, Creator-recovery og to-pc/netværksdrevforløb. Derefter kan fase 1 vurderes afsluttet og fase 2–5 fortsættes.

Der er ikke lavet build, ændret EXE/release-ZIP eller publiceret noget. Hubert er fortsat ikke releaseaktiveret, ingen større model er hentet, og ingen hubdata er behandlet eksternt.
