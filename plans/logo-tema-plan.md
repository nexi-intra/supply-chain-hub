# Kæde-H som rød tråd i hubben – design og plan

## Hvorfor
Det nye logo (Kæde-H: tre guldled, der danner et H på midnatsblå flise) ses i introen og som app-ikon, men ingen steder inde i appen. Jacob vil have små greb, der får appen til at hænge sammen med logoet – ikke en ombygning.

## Rammer (besluttet med Jacob)
- Nexi-indigo forbliver appens hovedfarve (knapper, aktiv tilstand, fokus).
- Logoet bruges der, hvor appen præsenterer sig selv; kæden som motiv kun hvor den betyder noget.
- Jacob har givet frie hænder til detaljerne ("tag selvstændige beslutninger").

## Mine beslutninger
- **Guld findes kun inde i selve mærket.** Guld ligger tæt på signalfarven "kræver opmærksomhed" (`--signal-attention`, tone ~72) og må ikke blive pynt.
- **Mærket vises altid som hel flise** (midnat + guld) – som et app-ikon. Så ser det ens ud i lyst og mørkt tema, og der opstår ikke en lys variant, der skal vedligeholdes.
- **Tomme sider får ikke kædeled** (droppet fra forslaget): de ligger spredt i ~60 filer uden fælles komponent, og et motiv dér ville være pynt, hvilket strider mod hubbens "papir og streger"-princip.
- **Indlæseren** (de tre led der samler sig) bruges kun, når et helt modul indlæses (App + Spillehjørnet). Spillenes egne indlæsere beholdes. Den vises først efter 150 ms, så hurtige skift ikke blinker.
- **Mørkt tema:** neutrale flader flyttes fra tone 272–274 til logoets midnat (tone 259) med samme lyshed og mætning, så kontrasten er uændret. Primær/accent/signal røres ikke.

## Fase 1 – Mærket som komponent
- [x] `src/components/HubMark.tsx`: inline-SVG af Kæde-H med unikke gradient-id'er (`useId`), `size`, `className`, `decorative` (aria-hidden) ellers `role="img"` + `aria-label="Supply Chain Hub"`. Test i `HubMark.test.tsx`.
- [x] `HubLoader` i samme fil: flisen med venstre/højre led der glider ind og tværbjælken der folder ud i løkke, `role="status"`, skjult tekst, vises efter 150 ms. CSS i `main.css` (kun transform/opacity; reduced motion stopper den).

## Fase 2 – Mærket hvor appen præsenterer sig
- [x] Login (`Auth.tsx`): Kæde-H + "Supply Chain Hub" som én lockup under Nexi-logoet.
- [x] Forsiden (`Hub.tsx`): lille Kæde-H mellem Nexi-logoet og teamnavnet.
- [x] Hub-vælgeren (`HubPicker.tsx`): Kæde-H i stedet for det generiske personikon.
- [x] "Nyheder i Supply Chain Hub" (`WhatsNewDialog.tsx`): Kæde-H i stedet for gnisten.
- [x] Modulindlæsning (`App.tsx` `ViewLoadingFallback`, `GameCorner.tsx`): `HubLoader`.

## Fase 3 – Mørkt tema i logoets midnat
- [x] `main.css` `.dark`: neutrale tokens (background, card, popover, secondary, muted, border, input, sidebar, body) til tone 259. Test der låser at neutralerne følger logoet, og at primær er uændret.

## Fase 4 – Levering
- [x] Ændringslog-linje, fuld verifikation (tsc, vitest, node-suite), visuelt tjek i browser (lyst + mørkt) og i bygget app, code review, byg `release-local-2`.

Start med fase 1.
