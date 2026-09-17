# Lokal assistent — dataadgang og afprøvning

Udviklerfunktion, ikke en ny release eller ændring af EXE/release-ZIP.
Modellen er fortsat den installerede Qwen3-VL-2B; ingen cloud-inference.
Virkelige hubdata må ikke kopieres til Codex-værktøjsoutput eller UI-snapshots.
Alle automatiske fixtures er kunstige.

## Modulkort

| Modul | Datakilder | Afgrænsning |
| --- | --- | --- |
| Vagtplan | shift-assignments, shift-roles | Aktivt tilladte teams/personer, konkrete datoer. Ingen kommentarer i AI-kontekst. |
| Feriekalender | vacation-entries | Godkendte perioder; egne/manageranmodninger via fraværsadapter. |
| Hjemmearbejde | home-office-patterns, home-office-exceptions | Mønstre og undtagelser; godkendt ferie udelades. Kun eksisterende offentligt overblik krydser normal teamscope. |
| Madplan | meal-plan-weeks | Gemte uger, år og mandag–fredag. Manglende måltid markeres, aldrig opfundet. |
| Projekter | projects | Titel, beskrivelse, status, deltagere og oprettelse/afslutning. Periodefilter betyder registreret aktivitet, ikke en opdigtet deadline. |
| Notesbog | notebook-notes | Fælles noter + egne personlige noter. Manager får ikke andre personlige noter. |
| Beskeder | emails, email-folders | Kun egne indgående/udgående beskeder og egne mapper, også for managers. |
| Notifikationer | egne ulæste emails/notebook-notifications, manager/reviewkøer | Kun autoriserede events; ikke midlertidige UI-dismissed markører. |
| Opslagstavle | announcements | Teamopslag, forfatter og tidspunkt. |
| Teamoversigt | users, employee-birthdays | Godkendte navne, arbejds-kontakt, brugernavn, managerrolle og fødselsdag. Ingen passwords. |
| Fravær | vacation-entries, sick-leave-entries | Godkendte datoer offentligt i teamet; egne/managerpending; andres noter/årsager kun egentlig manager. Observer aldrig managerrettigheder. |
| Guidebibliotek | guides, shared-guides | Udgivne tilgængelige sektioner/trin; guidebilleder gennem særskilt reautoriseret billed-API. |
| Midlertidig guideadgang | guide-access-requests | Kun konkrete godkendte personbevillinger med gyldig expiresAt. Kilde/billede valideres igen. Observer forbliver i tildelte teams. |
| Guide-review | guide-review-requests | Egne indsendelser; reviewer/manager autoriserede kladder. Tydeligt markeret som KLADDE, ikke udgivet viden. |
| Guidearkiv/historik | archived-guides, guide-versions-* | Kun guide-reviewer/manager; versionsnøgle afledes af en faktisk tilgængelig guide. |
| Manager/Admin | users, shift-roles, guide-admin-emails, guide-access-requests | Kun faktisk manager i aktivt team eller Creator; ingen loginhemmeligheder. |
| Dashboard/Tema | hub-dashboard-[konto], active-theme-[konto], custom-themes | Egne widgetindstillinger/aktivt tema og tilgængelige temafarver. |
| Spil | fem offentlige leaderboards, egne play-counts, Modern-katalog | Samme scoreboardadgang som appen, egen statistik, ingen adgang til runtime-spiltilstand. |
| App/datalagring | appversion, forbindelsesstatus, syncantal | Ingen fil-/backupdump, tokens eller sikkerhedsomgåelse. Datasti kun egentlig manager/Creator. |
| Dokumentbibliotek/Teamchat | ingen | Kortene i Hub er available:false; modulerne er endnu ikke implementeret. Det siges åbent. |

Creatoradministration ændres ikke. Ingen nye rettigheder, godkendelser,
dataændringer, firewallregler eller ekstern service er aktiveret.

## Spørgsmålsbehandling

1. Session, godkendt konto og aktive/tildelte teams valideres i main.
2. Direkte opslag, periodefortolkning og tælling bruger applikationens kode.
3. Frie søgninger kombinerer kun adgangsfiltrerede modul-/guidekilder.
4. Ukendt formulering kan klassificeres af den lokale 2B-model til højst seks
   kendte moduler og ti søgeord. JSON-planen valideres. Ingen modelvalgte stier,
   KV-nøgler, roller eller skrivehandlinger accepteres.
5. Forklaringer/sammenfatninger bruger kun de fundne kilder. Ved manglende RAM
   vises kilder/direkte opslag; der foretages ingen cloud-fallback.
6. Adgang genvalideres efter AI-kørsel og når en kilde åbnes. Hubskift/logud/ryd
   chat rydder kontekst. Korte kalender-/scoreopfølgninger bevarer kun seneste opslag.

Svar viser samlet antal og højst otte poster per side. "Vis flere resultater"
kan fortsætte listen. Klik en kilde for mere indhold; en fjernet kilde eller
tilbagekaldt adgang må aldrig udlevere gammelt indhold.

## Manuel test i udviklerappen (Ctrl+S)

- "Hvordan så madplanen ud i uge 36?" → sammenlign med år/uge i Madplan.
- "Og uge 37?" → anden uge, ikke den gamle liste.
- "Madplan uge 36 2025" → historisk år; ingen data skal siges ærligt.
- "Hvilke projekter er åbne?" / "Hvor mange åbne projekter har vi?"
- "Mine projekter" / "Projekter uge 36".
- "Hvem er manageren i teamet?" / "Fødselsdage" / "Kontakt [navn]".
- "Ulæste beskeder" / "Sendte beskeder" / "Beskeder om [emne]".
- "Fælles noter" / "Mine personlige noter" / "Opslagstavle uge 36".
- "Hvornår har [navn] ferie?" / "Fravær" / "Ferieanmodninger afventer".
- "Guide review" som forfatter, Guide Admin, manager og observer.
- "Dashboard widgets" / "App version" / "Spilhjørnet".
- Kombinér to moduler; åbn kilder, bladre en lang liste og skift hub under svar.
- Afprøv frie omformuleringer, og registrér dem der endnu ikke forstås. Perfekt
  forståelse af vilkårlig dansk/finsk/engelsk eller alle billeder er ikke garanteret.

Modelkvalitet skal vurderes separat på rigtige guides lokalt af brugeren. En
bestået unit-test er ikke dokumentation for at 2B forstår enhver formulering.
