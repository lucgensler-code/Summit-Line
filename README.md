# Summit Line — Cindercrest

A playable third-person mountaineering prototype for the browser. You plan an expedition, start at a
forested trailhead, and climb a procedurally generated Cascade volcano to its crater-rim summit
while managing stamina, hydration and food.

Built with React + TypeScript, Three.js, React Three Fiber, drei and Zustand. All terrain,
vegetation, the character, and the sound are generated procedurally, so there are no external assets.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run test:sim   # headless bots climb the mountain using the real gameplay code
```

## How to play

1. **Prepare.** Choose a departure time, gear, water and food. These choices change pack weight,
   lighting, snow conditions and how hard the climb is.
2. **Climb.** Follow the Climbers Trail from the trailhead (5,446 ft) through the forest, past
   Obsidian Tarn Camp, up the cinder switchbacks and snowfield to the crater rim.
3. **Summit.** Traverse the rim to the true summit on the north side (10,212 ft) and press
   **Space** at the benchmark.

| Desktop | |
|---|---|
| W A S D | Move (relative to the camera) |
| Arrow keys | Turn / tilt the camera (swap with WASD in the pause menu) |
| Shift | Run |
| Mouse drag · scroll · + / − | Rotate camera · zoom (over-the-shoulder ↔ wide) |
| C | Recenter the camera behind you |
| Space | Action near signs, the register, water and the summit; otherwise rest when stopped, jump when moving |
| F · J | Action · Jump |
| E / Q / R | Eat / drink / rest |
| M | Map |
| Esc | Pause (Resume, Restart, Controls, Return to trailhead) |
| N | Mute |
| F3 or `?fps` | Frame-rate overlay |

Shortcuts are ignored while typing in a text field.

On touch devices: virtual joystick (left thumb), drag anywhere else to look, two-finger pinch
to zoom, a Run toggle and a contextual Jump/Action button; eat, drink and rest live in the
status panel. Add `?touch` to the URL to force touch controls on.

## Systems

- **Terrain.** A 1,760 × 1,760 heightfield built from a volcanic profile, radial gullies, fBm
  noise, a crater, an alpine bench with a tarn, and a trail bench carved into the slope. Player
  height is sampled from the same triangles that are rendered, so the climber stays on the ground.
- **Trail.** A spline route with forest meanders, a bench traverse, and hairpin switchbacks tuned
  to an even grade. It has cairns, blaze posts, snow wands, signs, and a spur trail to the tarn.
- **Movement.** Speed depends on surface (trail, forest, meadow, scree, rock, deep snow), the
  uphill or downhill grade along your direction of travel, pack weight, darkness without a
  headlamp, and dehydration. Off the boot track, deep snow makes you posthole, and it gets worse
  as the snow softens in the afternoon.
- **Stamina.** Effort comes from jogging, uphill grade, off-trail terrain, snow, pack weight, thin
  air above 9,000 ft and cold without an insulated layer. You recover by walking easy, standing
  still or resting. Running out of stamina forces a slow walk until you recover.
- **Energy and hydration.** Your stamina cap (energy reserve) drops as you burn calories, and
  eating restores it. Hydration drains with effort and afternoon heat. Drinking uses water, and
  you can refill at Obsidian Tarn.
- **Loop.** Checkpoints run Treeline → Tarn Camp → Upper Snowfield → Crater Rim → Summit. The
  summit has a cinematic camera, an achievement banner, a stats summary with splits, and restart.

## v0.2 additions

- **Pinch-to-zoom** camera (2.2 → 42 units) with smoothing, terrain clearance and a first-use hint.
- **Jump / Action** button: jump hops cairns and small boulders; it becomes Action near
  something you can interact with.
- **Pace**: walking is 25% faster and jogging 20% faster. An efficient climb takes about 9 minutes.
- **Gemstones** (`src/game/routes.ts`): green gems restore 35% of your stamina cap, and red gems
  give +40% speed for 12 s (picking up another refreshes the timer rather than stacking).
  Eleven are placed by design along the route.
- **Resources**: the energy cap drains faster and only food restores it. Dehydration gradually
  slows recovery, makes jogging cost more and burns energy faster. Resting speeds the clock
  up 4×.
- **HUD**: compact layout with light-on-dark contrast, safe-area padding, tap-to-expand stats,
  and messages that never overlap the controls.
- **Map**: drawn from the real heightfield, with the trail, explored track, checkpoints,
  remaining gems, route/2×/4× zoom, and north-up or heading-up.
- **Expedition log**: climbs are saved in localStorage, with personal bests for fastest
  (real and trail-clock time), fewest supplies used and most efficient route.
- **Summit celebration**: a 48 s 360° orbit through afternoon, sunset, a starry night and
  sunrise, a compact summary, and *Enjoy the View* mode.

## v0.3 additions

- **Momentum.** Movement is about 15% faster than v0.2: an efficient climb takes about 6.6 minutes
  (`npm run test:sim`, "efficient player"). Eat and drink while walking or jogging; water gives an
  instant +18% stamina, food restores the energy cap, and resting only restores current stamina
  (the clock runs 4×). A red-gem boost also makes effort 25% lighter.
- **Gems.** Gems are small crystal clusters growing from rock. They are placed as green → red pairs
  before climbs and shortcuts, so a boost is picked up fresh, and the boost timer pauses in menus.
- **HUD.** A compact navigation module (heading-up mini-map with compass ring, summit bearing,
  elevation, distance, progress and objective) opens the full map. A small time chip has a pause
  icon. Notifications show one at a time, in priority order. Sign text and hints appear only at the
  top edge.
- **Touch.** One full-screen gesture surface handles the joystick zone, look drag, and pinch
  anywhere, including a second finger that lands in the joystick zone.
- **Grounding.** Each foot samples the terrain under it and the knee folds to absorb slopes. The
  rest pose is now a grounded kneel, and there is an eat/drink arm gesture.
- **Register.** A real register interface: sign in (stored on this device), read earlier entries,
  and earn a +150 point style bonus.
- **Scoring** (`src/game/scoring.ts`): summit 5,000 + speed (up to 3,000) + resources (up to
  1,000) + route (up to 1,000) + 50 per gem + style (register, never exhausted).
- **High scores** (`src/game/leaderboard.ts`): arcade-style name entry, with Highest Scores and
  Fastest Summits tabs. Scores are kept on this device and, in the published artifact, on a
  shared board using the artifact's `db` store. Each player has one document (`lb/<player id>`)
  that only they can write and everyone can read, and no credentials are in the client.
- **Units** (`src/game/units.ts`): US customary by default (ft, mi, lb, fl oz, °F, mph), with
  a Metric option in the pause menu. Values are stored internally in SI units, so old saves still
  read correctly.
- **World.** Far terrain continues from the playable mesh's own edge vertices into foothills and
  distant peaks, with no map edge. Fallen logs, ferns, rock spires, snowdrifts, crater ice,
  songbirds, ravens and raptors are new.
- **Summit.** A 64 s 360° orbit through a continuous day/night cycle (the sun and moon key light
  cross-fade, and the sky palette eases and wraps at midnight), then a held alpenglow.

## v0.4 additions

- **Controls.** WASD moves and the arrow keys steer the camera by default (swappable), with keyboard
  zoom, a recenter key and HUD button, and smoothed camera input. Space acts, rests or jumps by
  context. Text fields no longer lose focus after each keystroke.
- **Performance.** A frame-rate governor caps the pixel ratio and steps resolution and shadow
  quality down if frames drop. Small rocks and trunks no longer cast shadows, and scatter counts
  are lower.
- **Pacing** (`npm run test:sim`). A steady walker reaches the summit in about 6.2 minutes of real
  time and 6.3 hours on the expedition clock. A bot that runs on gentle ground and uses red boosts
  takes 4.7 minutes, and a skilled human using cut-offs can reach about 4:20. Passive and resting
  recovery are 20% higher, running is cheaper, and a red gem gives +50% speed for 15 s.
- **Gems.** Red gems sit at the start of long gentle sections, plus one on the final rim
  approach. Green gems sit on the steep switchback cut-offs, placed from the trail geometry
  (`cut` in `routes.ts`). The glow and beam are subtler.
- **Scoring v2** (`src/game/scoring.ts`, `SCORE_VERSION = 2`): speed up to 6,000 (full at 4:00 or
  faster, zero at 15:00), 150 per gem, 1,000 for the summit, 400 for a clean climb and 200 for
  signing the register. v0.3 scores are migrated by recomputing them from their times and are
  tagged "v0.3".
- **Summit flow.** A short result card (time and score) and a name entry (remembered, with
  Submit or Skip) come first, then a 32 s time-lapse that ends in a held alpenglow (skippable),
  then the detailed results.
- **Shared leaderboard.** Each player document keeps their 5 best runs by score and by time, so
  several runs from one player can appear. Runs saved offline or before the board was reachable
  are posted on the next online save. Submissions are bounds-checked against the scoring model.
- **HUD.** A slim top bar: mini-map, place name, elevation and a three-state trail status
  (green on trail, amber near, red off route with a distance and arrow to the nearest *safe* trail
  point, matched on the mini-map). The expedition clock and real time sit side by side, with
  conditions in a quieter line. There is one message slot, and SVG icons for water, food and rest.
- **Signs.** The kiosk and signs open as dialogs, and the clock pauses while you read. The
  trailhead kiosk has a bright header and a floating marker until you read it.
- **World.** Snowfall wraps around the camera and fades as you zoom out. Boots follow the slope,
  the kneel stays grounded on slopes, and there are no fallen logs and fewer spires and ice blocks.
- **Home screen.** Drag to spin the mountain; the idle orbit resumes afterwards. Lighting follows
  the departure: purple pre-dawn with stars, orange sunrise, or afternoon daylight.
- **Audio.** Soft synthesized cues for gems, exhaustion and the summit.

## Project layout

```
src/game/    world gen, routes, sim, navigation, scoring, leaderboard, records, units, weather, input, store, audio
src/scene/   R3F components: terrain, trail, vegetation, landmarks, sky/lighting, player, camera
src/ui/      prep, HUD + mini-map, map, register, leaderboard, log, pause, summit, touch gestures
scripts/     simulate-ascent.ts (headless bots), playtest.mjs (Playwright smoke test)
```
