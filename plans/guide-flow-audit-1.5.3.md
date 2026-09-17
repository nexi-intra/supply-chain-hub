# Guide-flow total gennemgang (1.5.3)

Anledning: Guiden "hej med dig" fejler med versions-boevl ved udgivelse af ny
version. Brugeren vil have HELE guide-processen gennemgaaet og sikret:
opret -> kladde -> review -> godkend -> udgiv -> ny version -> historik ->
gendan -> arkiver -> slet. Alt skal virke.

## Fase 1 - Kortlaegning + diagnose af den konkrete fejl
- [x] Kortlaeg alle guide-filer (views, components, lib, electron) og dataflow
- [x] Laes guideStore.ts (bumpVersion, versionshistorik) og guideReview-logik
- [x] Undersoeg "hej med dig"-guidens faktiske data paa M: (guides, review requests, versions-noegler)
- [x] Identificer den praecise fejl ("versions boevl") og aarsag

### DIAGNOSE (fundet)
Guiden 'hej med dig' (team TRR) ER udgivet (v1.00), men dens create-request
staar stadig som PENDING. handleApproveReview skriver publish -> snapshot ->
luk-request som 3 separate KV-skrivninger uden recovery; luk-requesten fejlede
(flaky M:). Derefter: godkend igen -> create+published = "versionskonflikt";
rediger -> blokeret af aaben revision. Permanent fastlaast.
Samme latente klasse: delete (arkiveret+fjernet men request aaben -> !published
= konflikt) og restore. Desuden: resubmit refresher aldrig baseVersion, saa en
returneret request kan aldrig godkendes hvis den udgivne aendrede sig imens.

## Fase 2 - Fix af fundne fejl
- [x] Idempotent godkendelse: opdag "allerede anvendt" foer konflikt-tjek (create/update/restore: published.version == proposed.version -> luk requesten; delete: !published + arkivpost for request.id -> luk requesten)
- [x] try/catch om luk-request med praecis fejlbesked ("tryk Godkend igen")
- [x] Resubmit refresher baseVersion/baseGuide fra den aktuelt udgivne guide + re-bumper forslagets version (aldrig baglaens)
- [x] Reparer den fastlaaste 'hej med dig'-request paa M: (backup: guide-review-requests-before-hejmeddig-20260917085140.json)

## Fase 3 - Verifikation
- [x] Nye tests for isGuideReviewAlreadyApplied (7 cases) - 15/15 guide-tests OK
- [x] Fuld renderer-suite 69/69 + tsc exit 0
- [ ] Manuel gennemgang i dev (bruger tester: opret/rediger/review/udgiv/gendan/arkiver/slet)

## Fase 4 - Forbedringsforslag (SPOERG FOERST)
- [x] Forslag fremlagt; brugeren valgte nr. 1
- [x] 1. "Kassér anmodning": forfatter (egne aabne) + manager (alle aabne, ogsaa i review-koeen) kan fjerne en request helt via bekraeftelsesdialog. Udgivet guide roeres ikke.
- [ ] 2. Konflikt-banner i review-kortet (fravalgt indtil videre)
- [ ] 3. Auto-oprydning af gamle godkendte requests (fravalgt indtil videre)

## Driftshaendelser undervejs
- [x] KV_LOCK_BUSY ved login: foraeldet account-operation.lock efterladt af draebt proces (PID 20736) - fjernet efter ejer/alder-verifikation; efterfoelgende EPERM var SMB delete-pending og drev over. Genstart loeste det.
