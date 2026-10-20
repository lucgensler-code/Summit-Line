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
