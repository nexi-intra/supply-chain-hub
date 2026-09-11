# Release 1.2.0 — In-app opdateringer + kodeforbedringer

Kontekst: Appen bruges af 10-15 computere. Master-kopien ligger på
`M:\375750 - Terminal Configurations & Dispatch\7. Automation Framework\13. TCD HUB`,
og hver bruger har en lokal kopi på `C:\TCD TOOLS`. Brugerne har **ikke**
admin-rettigheder, så opdateringer må aldrig kræve installation. Alle klienter
peger allerede på den fælles datamappe (TCD HUB STORAGE) — den bruges nu også
som opdateringskanal via undermappen `updates/`.

## Fase 1 — Ny release + in-app opdateringssystem
- [x] Kopiér kildekode til ny mappe `TCD-Hub 1.2.0/tcd-hub-1.2.0 - Source code` (version 1.2.0)
- [x] `electron/updater.cjs`: manifest-læsning, versionssammenligning, publicering (sha256 + kopi af zip til `<datamappe>/updates/`), installation (kopiér zip lokalt → verificér checksum → udpak → opdaterings-script overskriver appmappen efter appen lukker → genstart)
- [x] `electron/main.cjs`: IPC-handlers (`updates:status`, `updates:check`, `updates:select-zip`, `updates:publish`, `updates:install`) + automatisk tjek ved opstart og hvert 15. minut
- [x] `electron/preload.cjs`: eksponér `electronUpdates`-API til renderer
- [x] `src/lib/electronUpdatesBridge.ts` + window-typing i `vite-end.d.ts`
- [x] `src/components/UpdateNotification.tsx`: popup-dialog når ny version findes ("Opdater nu"/"Senere")
- [x] `src/components/UpdateManager.tsx`: publicerings-UI (vælg zip, version, release-noter) i Manager Panel → Datalagring
- [x] Montér UpdateNotification i `App.tsx`

## Fase 2 — Sikkerhed: fjern hardcoded admin-password
- [x] Fjern `ADMIN_PASSWORD`-konstanten og bypass-login i `src/views/Auth.tsx` (admin logger ind via sin gemte konto; første opsætning sker via signup, som allerede auto-godkender admin-emailen)

## Fase 3 — Hub: reaktiv opdatering i stedet for polling
- [x] Erstat `setInterval`-polling (5 s) i `src/views/Hub.tsx` med `window.kv.subscribe` på de relevante nøgler

## Fase 4 — Centralisér delte typer
- [x] Udvid `src/lib/types.ts` med de delte interfaces (StoredUser, SickLeaveEntry, VacationEntry, ShiftRole, ShiftAssignment, BirthdayEntry, Email, WeekMenu — inkl. isSingleDay/manuallyGranted på VacationEntry)
- [x] Opdater alle filer med duplikerede interfaces til at importere fra types.ts (14 filer)

## Fase 5 — Split ManagerPanel
- [x] Udtræk de 5 næsten identiske spil-leaderboard-sektioner til én genbrugelig `components/GameLeaderboardAdmin.tsx`
- [x] Reducér ManagerPanel.tsx tilsvarende (3.796 → 2.222 linjer)

## Fase 6 — Byg og udgiv
- [x] `npm run electron:build` i den nye mappe → `release/TCD Hub-1.2.0-win.zip` (174 MB) — udpakket app ligger også i roden af `TCD-Hub 1.2.0/` (samme struktur som 1.1.0)
- [x] Verificér ingen compile-fejl (tsc)
- [x] Opdater README med afsnit om opdateringssystemet
- [ ] Manuel udrulning af 1.2.0 (engangs-kopi til M:-drevet og lokalt på klienterne) — herefter kan alle fremtidige versioner publiceres direkte fra appen

## Fase 7 — CPU-optimering (før publicering)
- [x] Diagnose: `AnimatedBackground` kørte på alle skærme med 15 JS-drevne framer-motion-animationer (60 fps), 3 store cirkler med `blur(64px)` der blev gen-rasteriseret hver frame, og et pulserende fuldskærms-gradient-lag → 40-60 % CPU, især uden GPU-acceleration
- [x] Omskriv `AnimatedBackground.tsx`: ren CSS-animation (kun transform/opacity → compositor-venlig), radial-gradients i stedet for blur, 6 figurer i stedet for 15, statisk grundgradient, `prefers-reduced-motion`-støtte
- [x] Keyframes (`bg-float`, `bg-glow`) tilføjet i `main.css`
- [x] Genbygget release + opdateret udpakket app i `TCD-Hub 1.2.0/`
- [x] Målt: appen bruger nu ~1,3 % CPU i tomgang (4 processer, 8 kerner)

## Fase 8 — Fungerende “Husk mig” / auto-login
- [x] “Husk mig” gemmer session-token LOKALT pr. maskine (localStorage) — aldrig i den fælles datamappe, så klienter ikke logger ind som hinandens brugere
- [x] Huskede sessioner: 365 dages glidende udløb (fornyes ved hver app-start) i stedet for 24 timer; inaktivitets-timeout springes over
- [x] Auto-login ved opstart validerer stadig token mod 'active-sessions' OG at brugeren findes og ikke er pending/rejected
- [x] Manuelt log ud sletter både sessionen og det lokale token; “Husk mig” er nu markeret som standard
- [x] Oprydning: udløbne sessioner fjernes fra 'active-sessions' ved nye logins
- [x] Genbyg release efter ændringen

## Fase 9 — Garanteret master-login (admin)
- [x] `MASTER_ADMIN_PASSWORD_HASH` (PBKDF2-hash, ikke klartekst) i `src/lib/userRoles.ts` — kun hashen ligger i kildekoden
- [x] Auth.tsx: admin-emailen kan altid logge ind med master-adgangskoden, uanset tilstanden af den delte brugerliste (slettet/ændret konto, KV utilgængelig)
- [x] Ved succesfuldt master-login synkroniseres/oprettes admin-brugeren i KV med status 'approved' og rolle 'admin', uden at overskrive et evt. eget gemt password
- [x] Genbygget og synkroniseret til udrullet app + zip
