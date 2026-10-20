// ============================================================================================
//  CINDERCREST — scenery recipe
//
//  Everything that dresses the mountain lives here: which kit items exist (with their look
//  settings), and where they grow. Change values here to restyle the mountain; a new mountain is
//  mostly a copy of this file with new values.
//
//  Elevations are in feet. Distances are in metres (world units). Densities are relative.
//  Modelled on a Cascade volcano like South Sister: mountain-hemlock forest at the trailhead,
//  subalpine fir and whitebark pine at treeline, flowered parkland, red cinder slopes, then rock
//  and snow to a crater rim.
// ============================================================================================
import type { CrystalSettings } from '../kit/gems';
import type { FernSettings, FlowerSettings, GrassSettings, ShrubSettings } from '../kit/plants';
import type { CairnSettings, RockSettings } from '../kit/rocks';
import type { TreeSettings } from '../kit/trees';

/** A kit item: what generator builds it, its settings, how many variants, and detail levels. */
export type KitItem =
  | { kind: 'tree'; settings: TreeSettings; variants: number; near: number; hide: number }
  | { kind: 'rock'; settings: RockSettings; variants: number; near: number; hide: number; collide?: number }
  | { kind: 'grass'; settings: GrassSettings; variants: number; hide: number }
  | { kind: 'flower'; settings: FlowerSettings; variants: number; hide: number }
  | { kind: 'shrub'; settings: ShrubSettings; variants: number; hide: number }
  | { kind: 'fern'; settings: FernSettings; variants: number; hide: number }
  | { kind: 'model'; url: string; near: number; hide: number };

// --------------------------------------------------------------------------------------------
//  Trees
// --------------------------------------------------------------------------------------------
// v0.8: species read apart by silhouette and colour, not just size.
// Douglas fir: tall and straight, regular whorls with upturned tips, a long bare trunk, deep
// blue-green. Western hemlock: broad, soft and drooping, yellow-green, a nodding top on some.
// Mountain hemlock: shorter, shaggy, drooping, blue-grey-green. Subalpine fir: a narrow dark
// spire with short stiff branches. Whitebark pine: wind-shaped clumps, yellow-green.
const douglasFir: TreeSettings = {
  form: 'conifer', height: 14, tiers: 7, width: 0.25, taper: 1.0, droop: -0.25, irregularity: 0.4, sides: 5,
  trunkHeight: 0.2, leaderBend: 0, foliage: ['#1f372c', '#3b5a45'], bark: '#6a4431', snow: 0,
};
const westernHemlock: TreeSettings = {
  form: 'conifer', height: 12, tiers: 7, width: 0.3, taper: 0.85, droop: 0.95, irregularity: 0.85, sides: 6,
  trunkHeight: 0.1, leaderBend: 0.9, foliage: ['#304a2a', '#6f8f45'], bark: '#5a3e2e', snow: 0,
};
const mountainHemlock: TreeSettings = {
  form: 'conifer', height: 9.5, tiers: 6, width: 0.27, taper: 0.95, droop: 0.8, irregularity: 0.95, sides: 6,
  trunkHeight: 0.05, leaderBend: 0.6, foliage: ['#2d4239', '#5e7a5f'], bark: '#5a4436', snow: 0,
};
const subalpineFir: TreeSettings = {
  form: 'conifer', height: 11, tiers: 7, width: 0.17, taper: 1.5, droop: 0.15, irregularity: 0.35, sides: 5,
  trunkHeight: 0.03, leaderBend: 0, foliage: ['#203436', '#3c5856'], bark: '#6a5444', snow: 0,
};
const whitebarkPine: TreeSettings = {
  form: 'pine', height: 6, tiers: 0, width: 0, taper: 0, droop: 0, irregularity: 0.8, sides: 0,
  trunkHeight: 0, leaderBend: 0, foliage: ['#4a5e30', '#86964e'], bark: '#8c8478', snow: 0,
};
const snag: TreeSettings = {
  form: 'snag', height: 10, tiers: 0, width: 0, taper: 0, droop: 0, irregularity: 0, sides: 0,
  trunkHeight: 0, leaderBend: 0, foliage: ['#000000', '#000000'], bark: '#a49a8c', snow: 0,
};
const snowy = (t: TreeSettings, snow = 0.55): TreeSettings => ({ ...t, snow });

// --------------------------------------------------------------------------------------------
//  Rocks
// --------------------------------------------------------------------------------------------
const rock = (r: Partial<RockSettings>): RockSettings => ({
  detail: 1, shape: [1.1, 1.05, 1], lumpiness: 0.18, cuts: 7, angularity: 0.65, ledges: 0, cracks: 0.4,
  colors: ['#7f7670', '#6c6560', '#8a8078'], moss: 0, mossColor: '#58773a', lichen: 0.25, lichenColor: '#a4a284', snow: 0, ...r,
});
const FOREST_STONE = ['#7a736c', '#6a645f', '#857c74'];
// v0.8: warmer basalt so cone rocks don't read as black slabs
const BASALT = ['#5b4f4a', '#685a53', '#4f4542'];
const CINDER = ['#7a4a3c', '#6a3f34', '#8a5845'];
const GREY = ['#8c857e', '#7d7670', '#9a9189'];

// --------------------------------------------------------------------------------------------
//  The item catalogue
// --------------------------------------------------------------------------------------------
export const ITEMS = {
  // trees ---------------------------------------------------------------------------------------
  douglasFir: { kind: 'tree', settings: douglasFir, variants: 3, near: 55, hide: Infinity },
  westernHemlock: { kind: 'tree', settings: westernHemlock, variants: 3, near: 55, hide: Infinity },
  mountainHemlock: { kind: 'tree', settings: mountainHemlock, variants: 3, near: 55, hide: Infinity },
  subalpineFir: { kind: 'tree', settings: subalpineFir, variants: 2, near: 55, hide: Infinity },
  mountainHemlockSnowy: { kind: 'tree', settings: snowy(mountainHemlock), variants: 3, near: 55, hide: Infinity },
  subalpineFirSnowy: { kind: 'tree', settings: snowy(subalpineFir), variants: 2, near: 55, hide: Infinity },
  whitebarkPine: { kind: 'tree', settings: whitebarkPine, variants: 2, near: 55, hide: Infinity },
  snag: { kind: 'tree', settings: snag, variants: 2, near: 140, hide: 600 },

  // rocks ---------------------------------------------------------------------------------------
  forestBoulder: { kind: 'rock', settings: rock({ detail: 1, colors: FOREST_STONE, moss: 0.85, lichen: 0.3 }), variants: 2, near: 120, hide: 700, collide: 0.8 },
  meadowBoulder: { kind: 'rock', settings: rock({ detail: 1, colors: GREY, moss: 0.25, lichen: 0.5 }), variants: 2, near: 120, hide: 900, collide: 0.8 },
  basaltBoulder: { kind: 'rock', settings: rock({ detail: 1, colors: BASALT, shape: [1.05, 1.15, 1], cuts: 9, angularity: 0.75, cracks: 0.5, lichen: 0.2 }), variants: 2, near: 130, hide: 900, collide: 0.8 },
  cinderRock: { kind: 'rock', settings: rock({ detail: 1, colors: CINDER, shape: [1, 1.2, 0.95], lumpiness: 0.28, cuts: 5, angularity: 0.5, lichen: 0.05 }), variants: 2, near: 80, hide: 260 },
  talus: { kind: 'rock', settings: rock({ detail: 1, colors: BASALT, cuts: 8, angularity: 0.75, shape: [1.1, 1.1, 1], lichen: 0.12 }), variants: 2, near: 70, hide: 220 },
  snowRock: { kind: 'rock', settings: rock({ detail: 1, colors: BASALT, cuts: 8, angularity: 0.75, snow: 0.8, lichen: 0 }), variants: 2, near: 130, hide: 900, collide: 0.8 },
  outcrop: { kind: 'rock', settings: rock({ detail: 2, colors: BASALT, shape: [1.7, 1.15, 1.05], cuts: 9, angularity: 0.75, ledges: 0.7, cracks: 0.7, lichen: 0.12 }), variants: 2, near: 160, hide: Infinity, collide: 0.7 },
  outcropSnowy: { kind: 'rock', settings: rock({ detail: 2, colors: BASALT, shape: [1.7, 1.15, 1.05], cuts: 9, angularity: 0.75, ledges: 0.7, cracks: 0.6, snow: 0.75 }), variants: 2, near: 160, hide: Infinity, collide: 0.7 },

  // ground cover --------------------------------------------------------------------------------
  grass: { kind: 'grass', settings: { blades: 10, height: 0.85, spread: 0.6, width: 0.065, base: '#6f7a40', tip: '#c9c47e', dry: 0.3 }, variants: 2, hide: 40 },
  forestGrass: { kind: 'grass', settings: { blades: 8, height: 0.7, spread: 0.55, width: 0.06, base: '#4a6534', tip: '#9cb062', dry: 0.1 }, variants: 2, hide: 55 },
  alpineGrass: { kind: 'grass', settings: { blades: 9, height: 0.55, spread: 0.65, width: 0.055, base: '#5e6a3c', tip: '#c2b47a', dry: 0.5 }, variants: 2, hide: 55 },
  lupine: { kind: 'flower', settings: { grass: { blades: 4, height: 0.35, spread: 0.6, width: 0.04, base: '#47613a', tip: '#7d9655', dry: 0 }, stalks: 3, head: 'spike', colors: ['#6f68c8', '#8a72d0', '#5b5bb8'], stalkHeight: 0.55 }, variants: 2, hide: 32 },
  paintbrush: { kind: 'flower', settings: { grass: { blades: 4, height: 0.3, spread: 0.5, width: 0.035, base: '#4c6438', tip: '#88a058', dry: 0.1 }, stalks: 3, head: 'brush', colors: ['#e0503a', '#ef6a3c', '#d83f4a'], stalkHeight: 0.42 }, variants: 2, hide: 32 },
  aster: { kind: 'flower', settings: { grass: { blades: 4, height: 0.28, spread: 0.5, width: 0.03, base: '#4c6438', tip: '#8aa05a', dry: 0.2 }, stalks: 4, head: 'daisy', colors: ['#c9b8e8', '#f2f0e6', '#e9d36a'], stalkHeight: 0.32 }, variants: 2, hide: 32 },
  beargrass: { kind: 'flower', settings: { grass: { blades: 16, height: 0.7, spread: 0.9, width: 0.025, base: '#3f5a33', tip: '#93a35e', dry: 0.15 }, stalks: 1, head: 'club', colors: ['#f3ecd2'], stalkHeight: 1.2 }, variants: 2, hide: 80 },
  heather: { kind: 'shrub', settings: { form: 'heather', size: 1.0, leaf: ['#2f4a2c', '#5c7a42'], accent: '#d76a9c', accentAmount: 0.35 }, variants: 3, hide: 55 },
  huckleberry: { kind: 'shrub', settings: { form: 'huckleberry', size: 1.1, leaf: ['#3e5e2e', '#6f8c3e'], accent: '#a8452e', accentAmount: 0.25 }, variants: 3, hide: 65 },
  cushion: { kind: 'shrub', settings: { form: 'cushion', size: 0.75, leaf: ['#5b6a44', '#8e9a68'], accent: '#e6a7c5', accentAmount: 0.4 }, variants: 2, hide: 60 },
  fern: { kind: 'fern', settings: { fronds: 10, length: 1.35, arch: 0.6, color: ['#4f7f36', '#93bd5a'] }, variants: 2, hide: 60 },
} satisfies Record<string, KitItem>;

export type ItemId = keyof typeof ITEMS;

// --------------------------------------------------------------------------------------------
//  Placement
// --------------------------------------------------------------------------------------------
export const PLACEMENT = {
  trees: {
    /** attempts across the map; fewer = sparser forest overall */
    attempts: 90000,
    max: 7000,
    /** species bands: weight rises from `from` to the band, falls off by `to` (feet) */
    species: [
      { item: 'douglasFir', from: 5300, peak: 5600, to: 6200, weight: 0.5 },
      { item: 'westernHemlock', from: 5300, peak: 5700, to: 6300, weight: 0.55 },
      { item: 'mountainHemlock', from: 5400, peak: 6300, to: 7200, weight: 1.0 },
      { item: 'subalpineFir', from: 6000, peak: 6800, to: 7400, weight: 0.8 },
      { item: 'whitebarkPine', from: 6700, peak: 7200, to: 7800, weight: 0.9 },
      { item: 'snag', from: 5500, peak: 6600, to: 7400, weight: 0.05 },
    ] as { item: ItemId; from: number; peak: number; to: number; weight: number }[],
    /** above this, high species use their snowy variant */
    snowyAbove: 7100,
    /** groves: noise scale (m) and the share of land left as clearings (0–1) */
    groveScale: 95,
    clearings: 0.3,
    /** keep this far from the trail centreline; thinned out to `thinTo` */
    trailClear: 4.2,
    thinTo: 13,
    thinFactor: 0.35,
    /** trees thin out as the forest climbs toward treeline */
    thinStart: 6500,
    maxSlope: 1.1,
    /** trees in the foothills beyond the playable map */
    farForest: 2200,
  },

  rocks: {
    forestBoulders: { item: 'forestBoulder', count: 150, size: [1.0, 2.6], below: 6800 },
    meadowBoulders: { item: 'meadowBoulder', count: 70, size: [1.2, 2.8], from: 6600, to: 7800 },
    /** boulder fields at the foot of cliffs: groups of 3–7 */
    cliffFields: { item: 'basaltBoulder', groups: 34, perGroup: [3, 7], size: [1.0, 3.0], from: 7200, to: 9800 },
    /** a boulder or two on the outside of sharp trail bends */
    trailBends: { item: 'meadowBoulder', minTurn: 1.1, spacing: 30, size: [1.3, 2.4] },
    /** talus patches on the cinder cone */
    talus: { item: 'talus', patches: 70, perPatch: [4, 10], size: [0.3, 0.9], from: 7300, to: 9700 },
    cinder: { item: 'cinderRock', count: 260, size: [0.3, 1.0], from: 7000, to: 9200 },
    /** basalt outcrops and cliff bands on the steepest faces */
    outcrops: { item: 'outcrop', snowyItem: 'outcropSnowy', count: 140, size: [2.5, 6.5], minSlope: 1.0, from: 7000, trailClear: 8 },
    /** near the summit: a few good rocks, not a crowd */
    summitRocks: { item: 'snowRock', count: 14, size: [0.9, 2.0], from: 9700 },
    /** keep rocks this far from the trail centreline */
    trailClear: 3.0,
  },

  /** ground cover grows in drifts: noise patches of `patch` metres; `cover` = share of land;
   *  each placement is a `clump` of that many plants within a metre or two */
  cover: [
    { item: 'fern', count: 7000, clump: 3, from: 5300, to: 6600, patch: 26, cover: 0.45, underTrees: true },
    { item: 'huckleberry', count: 2600, clump: 2, from: 5400, to: 7000, patch: 30, cover: 0.35 },
    { item: 'forestGrass', count: 10000, clump: 5, from: 5300, to: 6800, patch: 22, cover: 0.4 },
    { item: 'beargrass', count: 900, clump: 2, from: 6000, to: 7100, patch: 40, cover: 0.25 },
    { item: 'grass', count: 36000, clump: 7, from: 6500, to: 7800, patch: 20, cover: 0.55 },
    { item: 'lupine', count: 4500, clump: 4, from: 6600, to: 7600, patch: 18, cover: 0.22 },
    { item: 'paintbrush', count: 3000, clump: 3, from: 6600, to: 7500, patch: 16, cover: 0.18 },
    { item: 'aster', count: 2500, clump: 4, from: 6500, to: 7300, patch: 16, cover: 0.18 },
    { item: 'heather', count: 6000, clump: 3, from: 6900, to: 7900, patch: 24, cover: 0.35 },
    { item: 'alpineGrass', count: 3500, clump: 4, from: 7600, to: 8700, patch: 26, cover: 0.25 },
    { item: 'cushion', count: 1200, clump: 2, from: 7500, to: 8700, patch: 30, cover: 0.22 },
  ] as { item: ItemId; count: number; clump: number; from: number; to: number; patch: number; cover: number; underTrees?: boolean }[],

  cairns: {
    /** spacing along the trail above treeline (m) */
    spacing: 40,
    maxSlope: 0.32,
    settings: [
      { stones: 5, baseWidth: 0.95, flatness: 0.62, colors: GREY, lichen: 0.35 },
      { stones: 4, baseWidth: 1.05, flatness: 0.72, colors: GREY, lichen: 0.25 },
      { stones: 5, baseWidth: 0.9, flatness: 0.68, colors: FOREST_STONE, lichen: 0.25 },
      { stones: 3, baseWidth: 1.15, flatness: 0.78, colors: BASALT, lichen: 0.1 },
    ] as CairnSettings[],
  },

  gems: {
    crystal: {
      green: { crystals: 7, height: 0.75, spread: 0.8, colors: ['#0f7a45', '#7dffb8'] },
      red: { crystals: 7, height: 0.75, spread: 0.8, colors: ['#8a1018', '#ff8a6a'] },
    } as Record<'green' | 'red', CrystalSettings>,
    /** hide the locator beam within this distance (m); thinner beam on phones */
    beamHideNear: 22,
  },
};
