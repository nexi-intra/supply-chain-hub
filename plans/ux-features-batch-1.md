# Store UX-features: tværgående + email/notesbog + manager-værktøjer

## Fase 1 — Navigations-infrastruktur (deep-links)
- [x] `src/lib/appNavigation.ts`: `navigateTo(view, params)` via CustomEvent + one-shot params (tab/search)
- [x] App.tsx: lyt på navigations-event og skift view
- [x] ManagerPanel: understøt `initialTab`-param (åbn direkte på fx Anmodninger)
- [x] EmailSystem/GuideLibrary/VirtualNotebook/ProjectBoard: forudfyld søgefelt fra nav-param

## Fase 2 — Email: tråde + ferieanmodnings-knap
- [x] `Email`-typen: tilføj `threadId?` og `actionLink?`
- [x] Svar sætter `threadId` (original-mailens id); indbakke/sendt grupperes pr. tråd med antal-badge
- [x] Detalje-visning viser hele samtalen kronologisk (udvidelig)
- [x] Ferieanmodnings-mails får `actionLink` → knap "Gå til ferieanmodninger" (kun managere) → Manager Panel/Anmodninger

## Fase 3 — Notesbog: tags + pinning
- [x] `Note`-typen: `tags?: string[]`, `pinned?: boolean`
- [x] Tag-input i opret/redigér-dialog, tag-badges på kort, klikbar tag-filterrække
- [x] Pin-knap på kort; fastgjorte noter sorteres først med pin-badge

## Fase 4 — Manager Panel: bulk-godkendelse + sygefraværs-analyse + on-/offboarding
- [x] Anmodninger: checkbox pr. anmodning + "Vælg alle" + "Godkend valgte"/"Afvis valgte" (batch m. notifikationer)
- [x] Sygemeldinger: ugedags-heatmap (seneste 90 dage) + alarmliste ved ≥3 sygemeldinger på 30 dage
- [x] Onboarding-wizard: opret bruger → rolle → fødselsdag → bekræft (guidet dialog)
- [x] Offboarding-wizard: vælg medarbejder → forhåndsvis oprydning (vagter/fødselsdag/konto) → bekræft

## Fase 5 — Fælles notifikationscenter (Hub)
- [x] `NotificationCenter.tsx`: klokke-ikon m. samlet ulæst-badge på Hub
- [x] Aggregerer: ulæste emails, email-notifikationer, notesbog-notifikationer, afventende ferieanmodninger (managere), guides til revision, fødselsdage i dag
- [x] Klik på notifikation → deep-link til relevant view; markér som læst

## Fase 6 — "Siden sidst"-digest ved login
- [x] KV `last-seen-user_{email}`: tidsstempel opdateres efter visning
- [x] Digest-dialog efter login: nye emails, ferie-afgørelser, nye/redigerede delte noter, nye opslag
- [x] Vises kun hvis der faktisk er noget nyt

## Fase 7 — Opslagstavle (announcements) på Hub
- [x] KV `announcements`: {id, title, message, createdBy, createdByName, createdAt}
- [x] Hub-kort øverst med aktive opslag; luk/afvis pr. bruger (KV pr. bruger)
- [x] Managere/admins kan oprette og slette opslag direkte fra kortet

## Fase 8 — "Nyheder i denne version"-popup
- [x] `src/lib/changelog.ts`: dansk changelog pr. version
- [x] Efter login: hvis app-version ≠ sidst sete version → vis "Nyheder i vX.Y.Z"-dialog én gang
- [x] Gem sidst sete version pr. maskine (localStorage)

## Fase 9 — Command palette (Ctrl+K)
- [x] `CommandPalette.tsx` (shadcn Command): åbnes med Ctrl+K overalt efter login
- [x] Kilder: moduler (navigér), guides, noter, projekter, kolleger, email-emner
- [x] Valg navigerer til modulet og forudfylder søgning hvor muligt

## Fase 10 — Verifikation & udrulning
- [x] `npm run build` + alle tests
- [x] `npm run electron:build` + deploy til `TCD-Hub 1.4.2`
- [x] Commit
