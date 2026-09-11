# App-forbedringer — bedre oplevelse (baseret på kodegennemgang)

4 forbedringer identificeret fra kodegennemgang, prioriteret efter bruger-mærkbar effekt.

## Fase 1 — Hurtigere opstart (code-splitting) ✅
- [x] Lazy-load alle sekundære views i App.tsx med `React.lazy()` + `Suspense` (Hub/Auth forbliver eager)
- [x] Tilføj en let loading-fallback (spinner) mens et view hentes
- [x] Verificeret: hoved-bundle faldt fra ~1,56 MB til ~916 KB; hvert view er nu eget chunk
- [x] Escape-navigation testet uændret

## Fase 2 — Stop stille fejl ved gem ✅
- [x] Centraliseret fix i `src/lib/kvErrorToast.ts` — wrapper omkring HELE KvStore-interfacet
- [x] Anvendt i `main.tsx` for både Electron- og browser-KV, dækker ALLE set/delete/update/updateField-kald i hele appen ét sted
- [x] Fejl vises nu altid som synlig toast + logges, i stedet for at forsvinde stille

## Fase 3 — Konsekvent brug af useKV-hook ✅ (delvist — bevidst)
- [x] Hub.tsx: unreadInboxCount + pendingVacationRequests migreret fra manuel window.kv.get+subscribe til useKV+useMemo (fjernede også en subtil filter-logik-diskrepans)
- [ ] ManagerPanel/ShiftSchedule: **bevidst IKKE migreret** — deres window.kv.get-kald er "hent-friskeste-data-lige-før-atomar-skrivning"-mønstre inde i handlere, ikke display-state. At konvertere disse til useKV ville introducere risiko for forældet data ved skrivning. Efterladt som fremtidigt arbejde, kræver forsigtig sag-for-sag gennemgang.

## Fase 4 — Testdækning for kritiske flows ✅
- [x] Vitest sat op (`npm run test:unit`, indgår også i `npm test`)
- [x] 26 tests: passwords.ts (hash/verify/legacy-opgradering), guideTypes.ts (review-status/migrering), dateUtils.ts (ugenumre/helligdage/lokale datoer)
- [x] Electron-tests uændrede og stadig grønne (20 tests)
- [x] **KRITISK FUND**: Test-kørslen afslørede at en tidligere performance-optimering (read-cache fra denne sessions performance-fase) havde ødelagt atomar-opdaterings-garantien — `update()` kunne læse en forældet cached værdi i stedet for frisk disk-data under fil-lås, hvilket kunne tabe data ved samtidige skrivninger fra to klienter. Rettet: `update()` bruger nu altid `skipCache: true` ved sine interne læsninger.

## Efter hver fase
- `npm run build` + `npm run electron:build` for at verificere
- Deploy til `TCD-Hub 1.4.2`
- Commit med beskrivende besked

