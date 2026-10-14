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
| Mouse drag / scroll | Rotate camera / zoom |
| Space | Interact (signs, register, filter water, summit) |
| E / Q / R | Eat / drink / rest |
| Esc | Pause (Resume, Restart, Controls, Return to trailhead) |
| M | Mute |

On touch devices you get a virtual joystick, a camera drag zone, and buttons for Jog, Action,
Eat, Drink, Rest and Pause. Add `?touch` to the URL to force them on.

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

## Project layout

```
src/game/    world gen, gameplay sim, input, store, audio (framework-agnostic logic)
src/scene/   R3F components: terrain, trail, vegetation, landmarks, sky/lighting, player, camera
src/ui/      prep screen, HUD, pause menu, summit summary, touch controls
scripts/     simulate-ascent.ts (headless bots), playtest.mjs (Playwright smoke test)
```
