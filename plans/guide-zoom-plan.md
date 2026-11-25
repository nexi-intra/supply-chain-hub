# Zoom i åbne guides - implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En åben guide i Guides og Knowledge Library kan zoomes ind og ud (knapper, Ctrl + musehjul, Ctrl +/−/0), og zoomniveauet huskes på PC'en.

**Architecture:** Ren hjælpemodul `src/lib/guideZoom.ts` (trin, læs/gem, genveje, PDF-adresse), en lille `GuideZoomControl`-komponent, og `GuideViewer.tsx` lægger CSS `zoom` på indholdsarket og `#zoom=` på PDF-iframes. Tasterne stoppes med `preventDefault`, så Electrons skjulte menu ikke zoomer hele vinduet (bekræftet i et forsøg med Electron 44.11.5: uden `preventDefault` gik vinduets zoomfaktor fra 1 til 1,095, med `preventDefault` forblev den 1).

**Tech Stack:** React 19, TypeScript, Vitest (node-miljø, `renderToStaticMarkup`), Electron 44.

**Spec:** [guide-zoom-design.md](./guide-zoom-design.md)

## Global Constraints

- Gælder kun den åbne guide i `src/components/GuideViewer.tsx`. Ingen ændring af guidekort, liste, editor, download eller eksport.
- Zoomtrin: `[50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300]` (procent). Standard 100.
- Gemmes i `localStorage` under nøglen `guide-viewer-zoom` med `try/catch` som i `src/lib/warehouse/sound.ts`. Ugyldig eller manglende værdi giver 100.
- Knapper, overskrift og værktøjslinje skaleres ikke. Kun indholdsområdet.
- Alle nye tekster i da og en i `src/lib/translations.ts` og i fi og sv i `src/lib/translations.fi.json` og `src/lib/translations.sv.json`, under `guideViewer`.
- Resten af appen må aldrig blive forstørret af guidens genveje.
- Brugerrettet tekst uden tankestreger som bindeord.

## Review Focus

1. Ctrl + / Ctrl − / Ctrl 0 i en åben guide må kun zoome arket, ikke hele vinduet. Kræver `preventDefault` på tastetrykket (Task 3, manuel kontrol i trin 6).
2. Skriver man i et tekstfelt i guidevinduet, må Ctrl + ikke zoome guiden (Task 1-test `ignores shortcuts in editable targets`).
3. En gemt værdi som `"abc"`, `"999"`, `"-5"` eller `"115"` giver 100, ikke et ødelagt layout (Task 1-test `falls back to 100 for invalid stored values`).
4. "+" ved 300 % og "−" ved 50 % gør ingenting, og knappen er deaktiveret (Task 1-test `stays within bounds`, Task 2-test `disables buttons at the bounds`).
5. Efter guiden er lukket, reagerer Ctrl + igen som før i resten af appen, og der hænger ingen lyttere tilbage (Task 3, effekt kun når `open` er sand, med oprydning, manuel kontrol i trin 6).

---

### Task 1: Hjælpemodul for zoom

**Files:**
- Create: `src/lib/guideZoom.ts`
- Test: `src/lib/guideZoom.test.ts`

**Interfaces:**
- Produces:
  - `GUIDE_ZOOM_STEPS: readonly number[]`
  - `GUIDE_ZOOM_DEFAULT = 100`
  - `readGuideZoom(): number`
  - `saveGuideZoom(zoom: number): void`
  - `stepGuideZoom(zoom: number, direction: 1 | -1): number`
  - `guideZoomShortcut(event: { ctrlKey: boolean; metaKey?: boolean; altKey?: boolean; key: string; target?: EventTarget | null }): 'in' | 'out' | 'reset' | null`
  - `guideZoomPdfUrl(url: string, zoom: number): string`

- [x] **Step 1: Skriv de fejlende tests** i `src/lib/guideZoom.test.ts` (stub `localStorage` med et simpelt `Map`-objekt via `vi.stubGlobal`):
  - `steps up and down along the fixed steps`: `stepGuideZoom(100, 1) === 110`, `stepGuideZoom(100, -1) === 90`, `stepGuideZoom(67, -1) === 50`.
  - `stays within bounds`: `stepGuideZoom(300, 1) === 300`, `stepGuideZoom(50, -1) === 50`.
  - `remembers the zoom`: `saveGuideZoom(150)` og så `readGuideZoom() === 150`.
  - `falls back to 100 for invalid stored values`: for `'abc'`, `'999'`, `'-5'`, `'115'` og manglende nøgle giver `readGuideZoom()` 100. Og når `localStorage.getItem` kaster, giver den 100.
  - `maps keyboard shortcuts`: med `ctrlKey: true` giver `'+'` og `'='` `'in'`, `'-'` giver `'out'`, `'0'` giver `'reset'`. Uden `ctrlKey`, med `altKey: true` eller `key: 'a'` giver den `null`.
  - `ignores shortcuts in editable targets`: `target` er et objekt med `tagName: 'INPUT'`, `'TEXTAREA'` eller `isContentEditable: true` giver `null`.
  - `adds the zoom to a PDF address`: `guideZoomPdfUrl('blob:x/1', 150) === 'blob:x/1#zoom=150'` og `guideZoomPdfUrl('blob:x/1#page=2', 80) === 'blob:x/1#zoom=80'`.
- [x] **Step 2: Kør og se dem fejle:** `npx.cmd vitest run src/lib/guideZoom.test.ts` (FAIL, modulet findes ikke).
- [x] **Step 3: Implementér `src/lib/guideZoom.ts`** med signaturerne ovenfor. `readGuideZoom` accepterer kun værdier, der står i `GUIDE_ZOOM_STEPS`. `stepGuideZoom` med en værdi uden for listen går til nærmeste trin i den retning. Editérbart mål tjekkes duck-typed (`tagName`, `isContentEditable`), så testen kører i node.
- [x] **Step 4: Kør igen:** samme kommando, alle tests PASS.
- [x] **Step 5: Commit** `feat(guides): hjælpemodul til zoom i åbne guides`.

### Task 2: Zoomkontrol og tekster

**Files:**
- Create: `src/components/GuideZoomControl.tsx`
- Test: `src/components/GuideZoomControl.test.tsx`
- Modify: `src/lib/translations.ts` (begge `guideViewer`-blokke), `src/lib/translations.fi.json`, `src/lib/translations.sv.json`

**Interfaces:**
- Consumes: `GUIDE_ZOOM_STEPS`, `GUIDE_ZOOM_DEFAULT`, `stepGuideZoom` fra Task 1.
- Produces: `GuideZoomControl({ zoom, onChange, labels }: { zoom: number; onChange: (zoom: number) => void; labels: { zoomOut: string; zoomIn: string; zoomReset: string } }): JSX.Element`
- Nye nøgler under `guideViewer`: `zoomOut`, `zoomIn`, `zoomReset`.
  - da: `"Zoom ud"`, `"Zoom ind"`, `"Tilbage til 100 %"`
  - en: `"Zoom out"`, `"Zoom in"`, `"Back to 100 %"`
  - fi: `"Loitonna"`, `"Lähennä"`, `"Takaisin 100 %:iin"`
  - sv: `"Zooma ut"`, `"Zooma in"`, `"Tillbaka till 100 %"`

- [x] **Step 1: Skriv de fejlende tests** med `renderToStaticMarkup` (som `src/components/HubMark.test.tsx`):
  - `shows the current zoom`: `zoom={125}` giver `125 %` i markup, og knapperne har `aria-label="Zoom ud"` og `aria-label="Zoom ind"`, og procentknappen har `title="Tilbage til 100 %"`.
  - `disables buttons at the bounds`: ved `zoom={50}` er "Zoom ud"-knappen `disabled`, ved `zoom={300}` er "Zoom ind"-knappen `disabled`, ved `zoom={100}` er ingen af dem.
- [x] **Step 2: Kør og se dem fejle:** `npx.cmd vitest run src/components/GuideZoomControl.test.tsx`.
- [x] **Step 3: Implementér komponenten** med samme udtryk som de eksisterende segmentknapper i guideviseren (`rounded-lg border p-0.5 bg-muted/40`, `Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs"`), ikonerne `Minus`/`Plus` fra `@phosphor-icons/react`, og procent som `{zoom} %`. Klik på procenten kalder `onChange(GUIDE_ZOOM_DEFAULT)`. Tilføj de nye nøgler i alle fire sprog.
- [x] **Step 4: Kør igen:** komponenttesten og `npx.cmd vitest run src/lib/libraryTerms.test.ts` PASS, og `npx.cmd tsc -b` uden fejl.
- [x] **Step 5: Commit** `feat(guides): zoomkontrol til guidevisningen`.

### Task 3: Zoom i guideviseren

**Files:**
- Modify: `src/components/GuideViewer.tsx`
- Modify: `src/lib/changelog.ts` (1.6.9-posten)
- Modify: `plans/development-1.6.9.md` (fase 3)

**Interfaces:**
- Consumes: alt fra Task 1 og `GuideZoomControl` fra Task 2.

- [x] **Step 1: Tilstand.** `const [zoom, setZoom] = useState(readGuideZoom)` og en `changeZoom(next: number)`, der sætter tilstanden og kalder `saveGuideZoom`.
- [x] **Step 2: Kontrollen.** Læg `GuideZoomControl` i værktøjslinjen i højre kolonne (samme kolonne som sprog- og visningsknapperne), med labels fra `t.guideViewer`. Den vises i alle visninger.
- [x] **Step 3: Arket.** Læg `style={{ zoom: zoom / 100 }}` på den inderste indholdscontainer i hver af disse grene: tekstvisningen (A4-arket, `max-w-[1000px] mx-auto bg-white ...`), "Original Word" (`max-w-[1000px] mx-auto`), den vedhæftede Word uden sektioner og ren tekst (`guide.content`). Ikke på `DialogHeader` og ikke på scroll-containeren `flex-1 overflow-y-auto`, så scrollbaren bliver i normal størrelse.
- [x] **Step 4: PDF.** Begge iframes (`originalPdfObjectUrl` og `pdfPreviewUrl`) får `src={guideZoomPdfUrl(url, zoom)}` og `key={zoom}`, så PDF-viseren åbner med den nye zoom.
- [x] **Step 5: Taster og musehjul,** kun mens `open` er sand, med oprydning i effektens return:
  - `keydown` på `window` med `capture: true`: `guideZoomShortcut(event)` og ved et resultat `event.preventDefault()`, `event.stopPropagation()` og `changeZoom` (in/out via `stepGuideZoom`, reset til `GUIDE_ZOOM_DEFAULT`).
  - `wheel` på scroll-containeren (ref) med `{ passive: false }`: ved `ctrlKey` `preventDefault()` og ét trin ind ved `deltaY < 0`, ét trin ud ved `deltaY > 0`.
  - Brug en ref eller funktionel `setZoom`, så lytteren ikke læser en gammel zoom.
- [x] **Step 6: Kontroller i dev-vinduet** (port 5070, separat profil, se `plans/development-1.6.9.md`) på en guide i både Guides og Knowledge Library:
  - knapperne zoomer arket, og procenten følger med
  - Ctrl + / Ctrl − / Ctrl 0 og Ctrl + musehjul zoomer kun arket, mens overskrift og knapper bliver i normal størrelse
  - de to PDF-visninger åbner med samme zoom
  - zoom huskes til næste guide og efter genstart
  - et link til en anden guide og et hop til et bestemt trin lander rigtigt ved 200 %
  - efter guiden er lukket, er forsiden i normal størrelse
- [x] **Step 7: Tilføj en linje i 1.6.9-posten i `src/lib/changelog.ts`:** `'Guides og Knowledge Library: zoom ind og ud i en åben guide med knapperne øverst, Ctrl og musehjulet eller Ctrl + og Ctrl −. Tekst og billeder bliver større sammen, også i PDF-visningerne, og din zoom huskes på PC\'en'`. Sæt flueben i `plans/development-1.6.9.md` fase 3 med henvisning til denne plan.
- [x] **Step 8: Fuld kontrol:** `npx.cmd tsc -b` uden fejl og `npx.cmd vitest run` bestået.
- [x] **Step 9: Commit** `feat(guides): zoom i åbne guides og vidensartikler`.

## Resultat

- Prøvet i dev-vinduet 25.11 på guiden "PUUILO Software update": knapper, Ctrl +/−/0 og Ctrl + musehjul zoomer kun arket (vinduets zoomfaktor forblev 1, overskriften 24 px). Ved 200 % fylder arket bredden, og teksten brydes om, så der ikke kommer vandret scroll. "Forenklet preview" zoomer også billederne. Jacob bekræftede med rigtige tastetryk, at kun arket voksede.
- PDF: ingen guides i TCD har PDF-visninger. Prøvet i et Electron 44.11.5-forsøg: #zoom virker på en ny iframe, men ikke ved kun at ændre fragmentet, derfor key={zoom}. Electrons PDF-viser har ingen egne plus og minus.
- Knowledge Base er tom i TCD. Den bruger samme guidevindue.
