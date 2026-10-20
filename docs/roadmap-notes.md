# Roadmap notes: what to refactor before more mountains and ranges

Written during v0.9. The goal: several mountains in one range, then more ranges inspired by real
ones, plus alternative routes, seasons and weather. The scenery kit (`src/kit/`) is already
generic and driven by settings. The places below still assume one mountain and should move into
data before mountain #2.

## Mountain-specific code that should become recipe / route data

| Where | What is hard-coded | Move to |
| --- | --- | --- |
| `src/game/world.ts` | Terrain shape (volcano profile, crater, rim radius), main trail control points, the lake (`LAKE`), snow line and rock-patch rules | A per-mountain terrain module or recipe section; a shared "terrain kit" (cone, ridge, cirque, plateau generators) |
| `src/game/world.ts` | Checkpoint names ("Treeline", "Obsidian Tarn Camp", …) | Route data (`src/game/routes.ts`) |
| `src/game/landmarks.ts` | Sign titles and texts ("Cindercrest Trailhead", tarn signs) | Route data, with the distances still computed from the trail |
| `src/scene/Landmarks.tsx` | Summit cairn style, tents, register | Recipe items (the summit cairn already uses kit rocks) |
| `src/scene/Environment.tsx` | `PEAKS`, `RINGS`, `REVEAL` (distant ranges, the "next mountain"), sky and light palettes | A **range** definition shared by its mountains |
| `src/scene/style.ts` | One global palette | Range palette + season overrides |
| `src/scene/Vegetation.tsx`, `src/scene/Gems.tsx`, `src/game/world.ts` | `CINDERCREST` recipe imported directly | An "active mountain" lookup (the same way `ACTIVE_ROUTE` works) |
| `src/ui/MapOverlay.tsx` | "Cindercrest · Climbers Trail" title | Mountain and route names from data |

## Suggested shape

- **Range**: palette, distant-range silhouettes, sky/light keys, tree species mix and rock
  types (as kit item settings), snow line, weather tendencies. Shared by its mountains.
- **Mountain recipe** (as now): items + placement, plus terrain parameters and landmarks.
- **Route**: trail control points, checkpoints, gems, signs, side trails, difficulty.
- **Season / weather**: overrides on the range (snow line, foliage colours, cloud cover, fog).

## Already in place

- Kit generators with settings (trees, rocks, plants, gems, cairns, glTF models).
- Per-mountain recipe file (`src/recipes/cindercrest.ts`) and a route catalogue
  (`src/game/routes.ts`) with gems as data.
- Placement shared with the headless sim, deterministic per seed.
- Peaks support a fully glaciated setting (`snowLine <= 0`).

## Future iterations

Ideas to build after the trail and mountain visuals are settled. For each: what the code already
supports, and what would need to change.

### Different routes on Cindercrest
- **Supported:** routes are data in `src/game/routes.ts` (name, miles, difficulty, gems). Trail
  lines, side trails, checkpoints and the ascent sim all work from trail polylines.
- **To change:** move the main trail's control points and checkpoint names out of `world.ts`
  into each route. Let the planner pick a route, give each its own leaderboard key (the key
  already includes the route id) and run the ascent sim per route.

### Customizable characters and a two-page start
- **Supported:** the climber is built from simple parts in `src/scene/Player.tsx`; the planner
  already holds the departure time and gear choices.
- **To change:** split the planner into "route and conditions" and "character and gear". Add a
  character model option (male/female to start) with shared animation, and save the choice
  with the other preferences.

### More gear, upgrades and RPG-style stats
- **Supported:** gear is a small table (`GEAR` in `src/game/sim.ts`) with weights and
  effects, and the pack weight already changes speed and effort.
- **To change:** move gear into a catalogue with tiers and stats (traction, warmth, weight,
  light). Combine character and gear into one set of player stats used by the sim. Keep
  scoring fair, for example with separate boards per gear tier. Upgrades could be earned
  from summits and records.

### Weather and seasons
- **Supported:** the time of day, light, fog, clouds and snow line are all driven by
  parameters; the forecast line on the planner exists.
- **To change:** add weather states (clear, wind, cloud, snow showers) that affect visibility,
  stamina and footing. Add seasons as overrides on the range palette (foliage colour, snow
  line, cloud cover). The scenery kit already takes snow amounts per item.

### More mountains, then more ranges
- **Supported:** the scenery kit is generic, and each mountain has its own recipe file.
- **To change:** see the table above (terrain, landmarks, distant ranges and palette move into
  range/mountain data). Add a mountain picker and per-mountain records.

### Selling the scenery kit as asset packs
- **Supported:** every kit item is generated from settings and can be exported to glTF (the kit
  preview page does a round trip). A recipe shows the items in context.
- **To change:** a batch exporter (all items × variants → .glb with consistent scale, pivots
  and naming), preview renders, a licence, and packaging per theme (Cascade forest, alpine
  rock, volcanic). Do this after the graphics are where we want them.

### Known, left alone
- The browser console shows "THREE.Clock is deprecated". It comes from inside the 3D library
  (react-three-fiber 9.8.2), is harmless, and goes away when that library is upgraded.
