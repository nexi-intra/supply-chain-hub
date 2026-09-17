# Hubert "mega klog" - kryds-modul intelligens (1.5.3)

Maal: Hubert skal kunne finde SVAERE SAMMENHAENGE paa tvaers af moduler - ikke
kun slaa enkeltmoduler op. Alt skal virke paa dansk, engelsk OG finsk, og de
vigtigste evner skal vaere deterministiske (virker ogsaa UDEN AI-modellen).

Arkitektur i dag: assistantContext.query() -> highscores -> planning
(opgaver/hjemme/ferie som separate spor) -> knowledge (14 modul-adaptere +
fritekst) -> guide-uddrag -> unsupported. LLM bruges kun til (a) soegeplan ved
ukendt formulering, (b) prosa af fundet evidens. INGEN kombinerer moduler.

## Fase 1 - Deterministisk indsigts-lag (assistantInsights.cjs)
- [x] Ny fil electron/assistantInsights.cjs med kryds-modul-motor (whereIs, available, back, workload, conflicts)
- [x] Alle triggere og svar-tekster paa da/en/fi; svar paa spoergsmaalets sprog
- [x] Samme adgangsmodel (kun principal.teams, kun approved, aldrig noter/aarsager, pending taeller aldrig som fravaer)
- [x] Integration i assistantContext.query() FOER planning-sporene; konservative triggere hijacker ikke gamle spor (verificeret med tests)
- [x] 20 node-tests (da/en/fi, adgang, kanttilfaelde, anti-hijack) - alle groenne

## Fase 2 - Planner + LLM-syntese opgraderes
- [x] buildHubertSystemPrompt: nyt CONNECTING THE DOTS-afsnit (kombiner evidens paa
      tvaers af moduler, kun samme person/dato/team, sig praecist hvad der mangler,
      skel mellem paa arbejde/hjemme/ferie/syg)
- [ ] Indsigts-intents i LLM-planner-kataloget (fravalgt: deterministiske triggere
      daekker formuleringerne; planneren maa ikke omgaa dem)

## Fase 3 - Opfoelgnings-intelligens + opdagelighed
- [x] Personskifte-opfoelgning: "og Bo?" / "and Bo?" / "entä Bo?" beholder intent+dato
- [x] Datoskifte-opfoelgning: "og fredag?" beholder personen (dato-guard)
- [x] HubAssistant forslag-chips viser nye evner paa da/en/fi

## Fase 4 - Verifikation
- [x] 338/338 electron-tests (20 nye), 69/69 vitest, tsc rent
- [ ] Manuel test i dev paa alle tre sprog (bruger tester nu)
