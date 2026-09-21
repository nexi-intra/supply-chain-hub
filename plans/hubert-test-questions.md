# Hubert testliste og udgangspunkt (fase 1)

Fast spoergsmaalssaet vi maaler paa **foer og efter**.

Udgangspunktet blev maalt 2026-09-21 ved at koere de faktiske emne-regexer fra
`electron/assistantKnowledge.cjs` mod hvert spoergsmaal. Efter-maalingen blev
koert samme dag gennem den RIGTIGE svarvej (`createAssistantContext.query`) med
et syntetisk datasaet.

## Resultat (fase 7)

| | Foer | Efter |
| --- | --- | --- |
| Blanke afvisninger | 6 af 30 | **0** |
| How-to med trin-for-trin | 0 af 14 | **13 af 14** |
| Dataopslag intakte (gruppe B) | 6 af 6 | **6 af 6** |
| Modellen involveret | ~0 | app-guide + generel tilstand |

Bemaerk: maalingen daekker RUTNINGEN — altsaa hvilken slags svar man faar.
Selve svarkvaliteten afhaenger af modellen og skal vurderes live.

Det ene resterende how-to-spoergsmaal er *"Hvad kan jeg bruge projekttavlen
til?"*. Ordet "projekttavle" findes ikke i appen — modulet hedder "To Do" — saa
det er mit eget spoergsmaal der er forkert stillet, ikke rutningen.

## Hovedfund ved udgangspunktet

| Fejltype | Antal | Hvad brugeren oplever |
| --- | --- | --- |
| Fejlrutet til dataopslag | 12 af 14 how-to | Faar en liste af registreringer i stedet for en vejledning |
| Blank afvisning (intet modultraef) | 6 af 30 | "Jeg fandt ikke et underbygget svar ..." |
| Modellen kaldt overhovedet | ~0 | Svar er opslag, ikke AI |

**Vigtigste enkeltfund:** kun 6 ud af 30 spoergsmaal bliver decideret afvist —
problemet er langt stoerre end afvisningerne. De fleste "hvordan goer jeg X?"
*rammer* et modul og bliver derfor besvaret med et **dataudtraek**, hvor
modellen springes over. De taeller som "besvaret" og bliver derfor heller ikke
logget i `hubert-unanswered-questions` (den logger kun `mode: 'unsupported'`).
Derfor stod der kun 2 poster i loggen paa tvaers af alle teams.

**Fejlrutning paa noegleord** er en selvstaendig fejlkilde:

- *"Hvordan tilfoejer jeg en opgave til min to-do?"* -> rammer **shifts**
  (ordet "opgave") -> viser vagtplans-tildelinger
- *"Hvad betyder beskeden om at lageret er optaget?"* -> rammer **messages**
  (ordet "besked") -> soeger i brugerens indbakke
- *"Hvordan opretter jeg en guide?"* -> rammer **intet** modul; reddes kun af en
  saerregel paa ordet "guide" og ender i guide-soegning
- *"Hvad kan du hjaelpe mig med?"* -> **blank afvisning**. Det mest naturlige
  foerste spoergsmaal overhovedet.

---

## Saettet

Notation: `MISS` = intet modultraef i dag (afvisning). `->` viser hvilke moduler
spoergsmaalet rutes til i dag.

### A. Hvordan / navigation (her er den store mangel)

Forventet efter: konkrete trin fra app-viden, i brugerens sprog.

1. Hvordan opretter jeg en ferieanmodning? -> absence, vacation
2. Hvor finder jeg vagtplanen? -> shifts
3. Hvordan melder jeg mig syg? -> absence
4. Hvordan laver jeg en gentagen vagt? -> shifts
5. Hvordan tilfoejer jeg en note i notesbogen? -> notes
6. Hvordan opretter jeg en guide? -> MISS
7. Hvordan skifter jeg til moerkt tema? -> settings
8. Hvordan sender jeg en besked til en kollega? -> messages, people
9. Hvordan godkender jeg en ferieanmodning? -> absence, vacation
10. Hvordan tilfoejer jeg en opgave til min to-do? -> shifts (forkert modul)
11. Kan jeg aendre en vagt efter den er oprettet? -> shifts
12. Hvordan registrerer jeg hjemmearbejde? -> homeOffice
13. Hvad kan jeg bruge projekttavlen til? -> projects
14. Hvordan faar jeg adgang til en guide jeg ikke kan se? -> MISS

### B. Dataopslag (virker i dag — maa ikke gaa i stykker)

Forventet efter: uaendret, praecise tal og datoer med kilder.

15. Hvem har ferie i uge 40? -> vacation
16. Hvad er der paa madplanen i dag? -> meals
17. Hvem er syge i dag? -> absence
18. Hvilke opgaver har jeg i denne uge? -> shifts
19. Hvem arbejder hjemme paa fredag? -> homeOffice
20. Hvad er telefonnummeret paa Christian Frederiksen? -> people

### C. App-forstaaelse / meta

Forventet efter: forklaring af appen, ikke et dataopslag.

21. Hvad kan du hjaelpe mig med? -> MISS
22. Hvilke moduler findes der i appen? -> modules
23. Hvad er forskellen paa en kladde og en udgivet guide? -> reviews
24. Hvorfor kan jeg ikke se managerpanelet? -> people, administration
25. Hvad betyder beskeden om at lageret er optaget? -> messages (forkert modul)
26. Hvordan virker opdateringer af appen? -> system

### D. Kombineret (kraever at data saettes sammen)

Forventet efter: uaendret eller bedre; disse er allerede en styrke.

27. Er der nogen der har vagt samtidig med at de har ferie? -> shifts, vacation
28. Hvor mange i mit team er vaek i naeste uge? -> MISS

### E. Generelt, uden for appen (fase 5)

Forventet efter: besvares i **Generelt**-tilstand med tydelig maerkat.

29. Hvordan laver jeg en SUM-formel i Excel? -> MISS
30. Kan du oversaette "vi mangler reservedele" til engelsk? -> MISS

---

## Saadan maaler vi i fase 7

For hvert spoergsmaal noteres: gav Hubert **et brugbart svar** (ja/nej), kom
svaret fra **app-viden / data / guide / generel**, og blev **modellen** brugt.
Gruppe B maa ikke blive daarligere — den er vores regressionstest.
