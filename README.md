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
| W A S D / arrows | Move (relative to the camera) |
| Shift | Jog |
| Mouse drag / scroll | Rotate camera / zoom (over-the-shoulder ↔ wide) |
| Space | Jump, or Action near signs, the register, water and the summit |
| E / Q / R | Eat / drink / rest |
| M | Map |
| Esc | Pause (Resume, Restart, Controls, Return to trailhead) |
| N | Mute |

On touch devices: virtual joystick (left thumb), drag anywhere else to look, two-finger pinch
to zoom, a Jog toggle and a contextual Jump/Action button; eat, drink and rest live in the
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

## Project layout

```
src/game/    world gen, route data, gameplay sim, records, input, store, audio, summit timeline
src/scene/   R3F components: terrain, trail, vegetation, landmarks, sky/lighting, player, camera
src/ui/      prep screen, HUD, map, expedition log, pause menu, summit summary, touch controls
scripts/     simulate-ascent.ts (headless bots), playtest.mjs (Playwright smoke test)
```
