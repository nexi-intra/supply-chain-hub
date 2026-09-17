# Supply Chain Hub 1.5.2

## Hvad er nyt
- **Hubert AI-assistent** er nu aktiveret i pakkede builds og svarer paa dansk, engelsk og finsk ud fra spoergsmaalets sprog.
- **AI-svar aktiveres pr. pc** via "Aktiver AI-svar" i chatten. Modellen provisioneres en gang fra det delte drev (M:) til den lokale maskine og koerer derefter lokalt i fuld fart.
- **Uden AI-model** svarer Hubert fortsat med data (opgaver, madplan, ferie, personer, highscores) og guide-uddrag via den deterministiske motor.
- Nyt **SCH-app-ikon** og nyt Hubert-ikon.
- Vite watch ignorerer release-artefakter for at undgaa EBUSY under build.

## Distribution
- Den byggede zip (`Supply Chain Hub-1.5.2-win.zip`) er publiceret via appens egen updater; klienterne opdaterer automatisk fra det delte drev.
- AI-modellen (Qwen3-VL-8B GGUF + llama.cpp runtime) ligger paa det delte drev under `ai-model/`, saa "Aktiver AI-svar" kan finde den.

## Krav
- AI-svar kraever ca. 7 GB fri RAM ved svar-generering. Klienter uden nok RAM faar fortsat deterministisk Hubert + guide-uddrag.

## Test
- 318 electron-tests og 68 renderer-tests bestaaet, ren tsc.
