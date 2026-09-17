# Plan: 1.5.2 - LLM (Hubert) tilgaengelig for alle 40 klienter (2026-09-16)

## Problemet
Hubert er nu aktiveret i koden, men den lokale LLM (Qwen3-VL-8B) fungerer kun paa
maskiner hvor modelfilerne allerede ligger i `%LOCALAPPDATA%\SupplyChainHub\ai`.
De 40 klienter har den IKKE. Modellen kan ikke bundtes i exe'en:
- Modelfiler: ~6 GB (4.8 GB hovedmodel + 1.1 GB vision-projector + ~40 MB runtime).
- En 6 GB installer er upraktisk, og HVER opdatering ville betyde 6 GB igen.

## Haarde begraensninger (vigtige)
- **RAM**: `start()` kraever mindst **7 GB LEDIG RAM** (8.5 GB til billeder). Paa
  klienter med 8-16 GB total RAM vil LLM'en ofte IKKE kunne starte. Den
  regelbaserede Hubert (opgaver, madplan, ferie, personer, highscores,
  guide-soegning) virker uden LLM paa ALLE klienter uanset RAM.
- LLM'en bruges KUN til at sammenfatte guide-svar til proesa. Alt andet er
  deterministisk og kraever ingen model.
- M:-drevet er ustabilt (laase-timeouts) - 40 klienter der kopierer 6 GB derfra
  skal ske EN gang pr. maskine og helst udloest af brugeren, ikke ved opstart.

## Anbefalet loesning: delt-drev-provisionering (som oversaettelsesmodellerne)
Appen bruger allerede dette moenster for Bergamot-oversaettelse: modeller ligger i
den delte datamappe og hentes derfra. Samme tilgang for LLM'en:

### Fase 1 - Del modellen paa det delte drev (EN gang)
- [ ] Kopier `runtime/` + de 2 GGUF-filer fra min `%LOCALAPPDATA%\SupplyChainHub\ai`
      til `<platformRoot>\ai-model\` paa M:-drevet (ca. 6 GB, engangs).

### Fase 2 - App henter modellen lokalt ved foerste brug
- [ ] Tilfoej `sharedAssetDir` til `createLocalAI` (peger paa `<platformRoot>\ai-model`).
- [ ] Ny `provision()`: hvis modellen mangler lokalt, kopier fra delt drev til
      `%LOCALAPPDATA%\SupplyChainHub\ai` med fremgangs-rapportering. Verificer
      SHA256 (findes allerede i aiModels.cjs) foer brug.
- [ ] Udloes provisionering naar brugeren AABNER Hubert (ikke ved opstart), med en
      "henter AI-model (X%)"-tilstand i chat-vinduet.
- [ ] `status()` udvides med provisioning-tilstand + om delt model findes.

### Fase 3 - Version, changelog, build, udrulning
- [ ] Bump `package.json` 1.5.1 -> 1.5.2.
- [ ] Changelog 1.5.2: "Hubert AI-assistent tilgaengelig; henter engangs AI-model
      fra det delte drev; kraever ledig RAM til AI-sammenfatning."
- [ ] Byg 1.5.2 (portable + zip).
- [ ] Publicer via app'ens updater (updates:publish) saa de 40 klienter opdaterer.

## Aabne beslutninger (afventer bruger)
1. Skal LLM'en ud til alle (delt-drev-provisionering), eller er den regelbaserede
   Hubert nok for de fleste (og LLM kun paa maskiner med RAM)?
2. Placering paa det delte drev: `<platformRoot>\ai-model\` OK?
3. Skal kopieringen vaere frivillig (bruger trykker "aktiver AI") eller automatisk
   foerste gang Hubert aabnes?
