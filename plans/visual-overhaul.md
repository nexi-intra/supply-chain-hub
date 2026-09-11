# App-wide Visual Overhaul Plan

Goal: Give the entire app a cohesive visual refresh — vibrant but professional. Since every view already consumes shared CSS tokens (main.css), shared UI primitives (src/components/ui), and shared layout pieces (PageHeader, StateComponents, AnimatedBackground), the highest-leverage work is done at those layers first, then swept across individual views.

## Phase 1: Core design tokens (main.css) — light & dark mode
- [x] Refresh color palette: richer, more confident primary/accent hues (still professional, higher chroma than current muted blue/teal)
- [x] Improve shadow system (softer ambient + crisper contact shadow, replacing flat `--shadow-opacity: 0.08`)
- [x] Verify dark mode palette parity (contrast, saturation balance)
- [x] Keep radius scale but confirm it reads as "modern" (0.75rem base)

## Phase 2: Shared UI primitives polish (src/components/ui)
- [x] Button: add subtle gradient + lift/shadow on primary, refined hover/active states
- [x] Card: refine default shadow, add hover-lift utility variant for interactive cards
- [x] Badge: refine contrast/vibrancy
- [x] Input/Select/Textarea: refine focus ring + border treatment

## Phase 3: Shared layout polish
- [x] AnimatedBackground: slightly richer, still subtle, floating shapes
- [x] PageHeader: refine sticky header depth/gradient accent
- [x] StateComponents (Loading/Empty): visual polish pass

## Phase 4: First-impression screens
- [x] Auth screen (login/signup) — refined card, gradient, branding
- [x] Hub dashboard — module cards, header, profile

## Phase 5: Remaining views sweep (follow-up, larger surface)
- [ ] Sweep per-view gradients/spacing consistency across AdminPanel, ManagerPanel,
      VacationCalendar, ShiftSchedule, MealPlan, GuideLibrary, ProjectBoard,
      VirtualNotebook, EmailSystem, TeamOverview, ThemeBuilder
- [ ] Confirm consistent card/header/empty-state usage app-wide

---
Start with Phase 1.
