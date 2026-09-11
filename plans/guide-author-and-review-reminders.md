# Guide-forfatter på kort + trinvis gennemgangs-påmindelse

## Baggrund
1. Guide-kort skal vise hvem der har lavet guiden.
2. Ny pop-up-baseret påmindelse i to trin, dismissable (ikke låst):
   - 10 dage før gennemgangsfristen: KUN forfatteren får en pop-up, én gang om dagen.
   - Fra selve fristen og til guiden opdateres: ALLE brugere får en pop-up, én gang om dagen.
   (Den overskredne-for-alle del findes delvist allerede i `GuideReviewAlert.tsx`, men lukker kun for
   sessionen/genindlæsning i stedet for reelt "én gang pr. dag" — opgraderes til samme dag-baserede
   sporing som den nye 10-dages-påmindelse, for konsekvent adfærd.)

## Teknisk grundlag (bekræftet)
- `Guide.author` findes allerede (sat fast ved oprettelse, ændres ikke ved senere redigeringer — det
  rette felt til "hvem har lavet guiden", modsat `updatedBy` som ændres hver gang).
- `getReviewStatus()` i `guideTypes.ts` har allerede et 14-dages "due-soon"-vindue til KORT-BADGET —
  det må IKKE ændres. Den nye 10-dages pop-up-grænse er et SEPARAT, nyt tjek, kun til selve pop-up'en.
- `GuideReviewAlert.tsx` findes allerede, monteret i Hub.tsx, modtager `guides` som prop (ingen ekstra
  KV-læsning) — udvides i stedet for at oprette en ny sideløbende komponent.
- Ingen delt "email → fulde navn"-hjælpefunktion findes i `lib/` — hvert sted der har brug for det
  (fx VacationCalendar) laver sin egen lille lokale resolver ud fra 'users'-KV'en. Følger samme mønster.
- `GuideLibrary.tsx` læser IKKE 'users' i dag — skal tilføjes (én gang, sendes ned til GuideCard).

## Fase 1 — Forfatter på guide-kort
- [ ] `GuideLibrary.tsx`: tilføj `useKV('users', ...)`-læsning (matcher mønster fra andre views)
- [ ] Send brugerdata ned til `GuideCard` som prop
- [ ] `GuideCard.tsx`: vis forfatterens navn (lille tekst/ikon ved siden af dato), resolvet fra
      `guide.author` via den modtagne brugerdata (fallback til e-mail hvis ikke fundet)

## Fase 2 — Dag-baseret "allerede vist i dag"-sporing
- [ ] Ny KV-nøgle `guide-review-notice-log`: `Record<userEmail, Record<guideId, 'YYYY-MM-DD'>>`
- [ ] Lille helper (i `GuideReviewAlert.tsx` eller `guideTypes.ts`): `wasNotifiedToday(log, userEmail, guideId)` +
      en opdaterings-funktion der sætter dagens dato ved lukning af pop-up'en

## Fase 3 — Udvid GuideReviewAlert med to sektioner
- [ ] Nyt tjek: guides hvor `guide.author === userEmail` OG `nextReviewAt` er inden for 10 dage (men ikke
      overskredet endnu) OG ikke allerede vist i dag → sektion "Du skal snart opdatere disse guides"
- [ ] Eksisterende overskredet-tjek opgraderes til at bruge samme dag-baserede log (i stedet for kun
      session-`dismissed`-state) → sektion "Disse guides er overskredet" (uændret: vises til ALLE)
- [ ] "Luk"-knappen skriver dagens dato til loggen for hver vist guide (både forfatter- og
      overskredet-sektionen), så pop-up'en ikke dukker op igen samme dag, men gør det igen i morgen
- [ ] Dialogen forbliver ikke-blokerende/dismissable (uændret fra i dag)

## Fase 4 — Verifikation & udrulning
- [ ] `npm run build` + `npm test`
- [ ] `npm run electron:build` (ingen dev-server kørende!) + smoke-test + robocopy til `TCD-Hub 1.4.3` +
      asar-verifikation
- [ ] git commit
