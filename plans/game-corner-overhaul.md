# Game Corner Overhaul Plan

Goal: Make "Hit N Miss", "Endless Dodger", and "Brick Break" visually stunning and more fun to play, and add a new Flappy Bird-style game ("Nexi Flyer") to the Game Corner.

## Phase 1: New game — "Nexi Flyer" (Flappy Bird clone)
- [x] Design game concept: canvas-based, gravity/flap physics, pipes obstacles, score = pipes passed
- [x] Create `src/components/NexiFlyer.tsx` with:
  - [x] Canvas-based render loop (bird, pipes, parallax background, ground)
  - [x] Physics: gravity, flap impulse, collision detection
  - [x] Difficulty settings (easy/medium/hard/expert) consistent with other games
  - [x] Menu / countdown / playing / game over states
  - [x] Global leaderboard via `useKV` consistent with other games (per-difficulty top scores)
  - [x] Polished visuals: gradient sky, clouds, animated bird, particle burst on collision, screen shake
- [x] Wire `NexiFlyer` into `src/views/GameCorner.tsx` (new module card + view)

## Phase 2: Hit N Miss — visual & gameplay polish
- [x] Add particle burst / ring animation on hit
- [x] Add combo glow & screen-edge flash on streak milestones
- [x] Add moving/decoy targets for higher difficulties for more skill-based play
- [x] Smoother spawn animation and juicier miss feedback (shake)

## Phase 3: Endless Dodger — visual & gameplay polish
- [x] Add parallax starfield background with twinkling stars
- [x] Add thruster/engine particle trail behind ship
- [x] Add explosion particle effect on collision
- [x] Add power-ups (shield / slow-motion) for extra depth
- [x] Screen shake on near-misses/collisions

## Phase 4: Brick Break — visual & gameplay polish
- [x] Improve canvas rendering: gradients on bricks/paddle/ball, glow effects
- [x] Add particle burst when bricks break
- [x] Add trail effect behind the ball
- [x] Screen shake on life loss / big combo breaks
- [x] Polish power-up visuals (icons/glow already present — enhance)

## Phase 5: Game Corner hub polish
- [x] Add Nexi Flyer card to the hub grid
- [x] Ensure consistent visual language (gradients/icons) across all 4 game cards

## Phase 6: Endless Dodger → Chicken Invaders-style shooter
- [x] Replace falling-meteorite dodging with a Space-Invaders-style chicken formation (rows/cols, moves side to side, steps down on edge hit)
- [x] Add player shooting (space/click, cooldown-limited laser bolts) that destroys chickens
- [x] Chickens randomly drop eggs that must be dodged (hit = lose life)
- [x] Add lives system (3 lives, heart icons) replacing single-hit death
- [x] Wave progression: clearing a formation spawns a tougher next wave
- [x] Power-ups reworked: Shield (absorb one hit) + Rapid Fire (faster shooting)
- [x] Keep/reuse starfield, particle system, screen shake, thruster trail from Phase 3
- [x] Modern chicken + egg + laser bolt visuals drawn with gradients/animation
- [x] Update leaderboard scoring to kill/wave based score (no longer survival-time based)

---
Start with Phase 1.
