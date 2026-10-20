// Cindercrest — procedural volcanic mountain, trail network, biomes and scatter.
// Coordinates: x = east, z = south, y = up. The summit crater sits at the origin and the
// trailhead lies on the southern flank. One world unit ≈ 4.3 m when shown in the HUD.

import { clamp, fbm, lerp, smoothstep } from './noise';
import { ACTIVE_MOUNTAIN, ACTIVE_ROUTE, type GemKind } from './routes';
import { placeScenery } from './placement';
import { CINDERCREST } from '../recipes';

export const TERRAIN_SIZE = 1760;
export const TERRAIN_SEGMENTS = 440;
export const HALF = TERRAIN_SIZE / 2;
export const GRID_STEP = TERRAIN_SIZE / TERRAIN_SEGMENTS;
export const RIM_R = 34;
export const TRAIL_HALF_WIDTH = 1.7;
export const BOUNDARY_R = 835;

export const TRAILHEAD_FT = ACTIVE_MOUNTAIN.trailheadFt;
export const SUMMIT_FT = ACTIVE_MOUNTAIN.summitFt;
export const ROUTE_MILES = ACTIVE_ROUTE.miles;

export const TREELINE_H = 120;

export type Surface = 'trail' | 'forest' | 'meadow' | 'scree' | 'rock' | 'snow' | 'water';

export const SURFACE_LABEL: Record<Surface, string> = {
  trail: 'Trail',
  forest: 'Forest floor',
  meadow: 'Alpine meadow',
  scree: 'Volcanic scree',
  rock: 'Exposed rock',
  snow: 'Deep snow',
  water: 'Water',
};

// ---------------------------------------------------------------------------------------------
// Mountain profile: monotone cubic through (radius, height) pairs.

const PROFILE: [number, number][] = [
  [0, 360],
  [40, 346],
  [80, 318],
  [120, 289],
  [170, 253],
  [230, 211],
  [290, 172],
  [340, 150],
  [380, 141],
  [420, 134],
  [500, 104],
  [580, 74],
  [660, 49],
  [740, 27],
  [820, 12],
  [900, 4],
  [1300, 0],
];

const profileSlopes: number[] = (() => {
  const n = PROFILE.length;
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((PROFILE[i + 1][1] - PROFILE[i][1]) / (PROFILE[i + 1][0] - PROFILE[i][0]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * (PROFILE[i + 1][0] - PROFILE[i][0]) + (PROFILE[i][0] - PROFILE[i - 1][0]);
      const w2 = (PROFILE[i + 1][0] - PROFILE[i][0]) + 2 * (PROFILE[i][0] - PROFILE[i - 1][0]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return m;
})();

export function profile(r: number) {
  if (r <= PROFILE[0][0]) return PROFILE[0][1];
  const n = PROFILE.length;
  if (r >= PROFILE[n - 1][0]) return PROFILE[n - 1][1];
  let i = 0;
  while (r > PROFILE[i + 1][0]) i++;
  const [x0, y0] = PROFILE[i];
  const [x1, y1] = PROFILE[i + 1];
  const h = x1 - x0;
  const t = (r - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * h * profileSlopes[i] +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * h * profileSlopes[i + 1]
  );
}

function rimLift(theta: number) {
  // theta measured from south (+z) toward east (+x); the north rim (theta = ±π) is highest.
  const north = (1 - Math.cos(theta)) / 2;
  return 12 * north * north + 2.2 * fbm(Math.cos(theta) * 2 + 7, Math.sin(theta) * 2 + 3, 3, 91);
}

// Lake ("Obsidian Tarn") on the alpine bench.
export const LAKE = { x: 0, z: 0, r: 21, level: 0 };
{
  const r = 386;
  const th = 0.17;
  LAKE.x = r * Math.sin(th);
  LAKE.z = r * Math.cos(th);
}

const TH_POS = { x: 748 * Math.sin(0.09), z: 748 * Math.cos(0.09) };
let thLevel: number | null = null;

/** Natural terrain before trail carving, with a levelled trailhead parking area. */
export function rawHeight(x: number, z: number) {
  const h = naturalHeight(x, z);
  const d = Math.hypot(x - TH_POS.x, z - TH_POS.z);
  if (d > 40) return h;
  if (thLevel === null) thLevel = naturalHeight(TH_POS.x, TH_POS.z);
  return lerp(h, thLevel, 1 - smoothstep(18, 40, d));
}

function naturalHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const theta = Math.atan2(x, z);
  let h: number;
  const lift = rimLift(theta);
  if (r < RIM_R) {
    const k = r / RIM_R;
    h = profile(RIM_R) + lift * k * k - 19 * (1 - k * k);
    h += fbm(x / 9, z / 9, 2, 5) * 0.8;
  } else {
    h = profile(r) + lift * smoothstep(RIM_R + 70, RIM_R, r);
    // Radial ridges and gullies down the volcanic cone.
    const ridgeMask = smoothstep(55, 140, r) * smoothstep(640, 330, r);
    const warp = fbm(x / 160, z / 160, 3, 11) * 3.2;
    const ridge = 1 - Math.abs(Math.sin(theta * 11 + warp));
    h += (ridge * ridge - 0.42) * 7 * ridgeMask;
    // Broad undulations + fine detail.
    const broad = smoothstep(40, 120, r);
    h += fbm(x / 230 + 3, z / 230 - 2, 4, 21) * 13 * broad;
    h += fbm(x / 55, z / 55, 3, 31) * 3.2 * broad;
  }
  h += fbm(x / 16, z / 16, 2, 41) * 0.7;

  // Lower foothills beyond the cone.
  const outer = smoothstep(620, 900, r);
  h += (fbm(x / 140, z / 140, 4, 51) * 16 + 4) * outer;

  // Alpine bench + tarn basin.
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  const bench = 1 - smoothstep(LAKE.r + 8, LAKE.r + 52, dl);
  if (bench > 0) {
    const benchLevel = LAKE_BENCH_LEVEL;
    h = lerp(h, benchLevel, bench);
    const basin = 1 - smoothstep(LAKE.r - 10, LAKE.r + 3, dl);
    h -= basin * 4.5;
  }

  // Blend into the surrounding (non-playable) landscape so there is no visible map edge.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > HALF - 140) h = lerp(h, farHeight(x, z), smoothstep(HALF - 140, HALF - 2, edge));
  return h;
}

const LAKE_BENCH_LEVEL = profile(386) - 3;

/** Foothill landscape beyond the playable map: rolling forested ridges rising toward distant peaks. */
export function farHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const ridges = fbm(x / 520 + 11, z / 520 - 7, 4, 501) * 55 + fbm(x / 170, z / 170, 3, 511) * 14;
  const rise = smoothstep(1300, 5200, r) * 140;
  return 14 + ridges * smoothstep(700, 1500, r) + rise + fbm(x / 140, z / 140, 3, 51) * 10;
}
LAKE.level = LAKE_BENCH_LEVEL - 1.6;

// ---------------------------------------------------------------------------------------------
// Trail network.

export interface Vec2 {
  x: number;
  z: number;
}

export interface TrailLine {
  pts: Vec2[];
  heights: number[];
  /** cumulative distance at each sample */
  s: number[];
  length: number;
  main: boolean;
}

const polar = (r: number, th: number): Vec2 => ({ x: r * Math.sin(th), z: r * Math.cos(th) });

function profileGrade(r: number) {
  return Math.abs(profile(r + 2) - profile(r - 2)) / 4;
}

function mainTrailControl(): Vec2[] {
  const pts: Vec2[] = [];
  // Forest section: long meander from the trailhead to treeline.
  const r0 = 748;
  const r1 = 430;
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = lerp(r0, r1, t);
    const lateral = Math.sin(t * Math.PI * 3.5) * 62 * smoothstep(0, 0.08, t) + 16 * Math.sin(t * 9.1);
    pts.push(polar(r, 0.09 - t * 0.12 + lateral / r));
  }
  // Bench: gentle traverse past the tarn.
  pts.push(polar(400, -0.04));
  pts.push(polar(372, -0.01));
  pts.push(polar(345, 0.03));
  // Cone: switchbacks up the cinder slopes.
  // Each leg is a straight rising traverse (sampled in radius/lateral space) ending in a tight
  // hairpin, so the grade stays even instead of piling up at the turns.
  let r = 318;
  let lat = 0;
  let side = 1;
  const thetaC = 0.02;
  const at = (rr: number, ll: number) => polar(rr, thetaC + ll / rr);
  pts.push(at(r, lat));
  while (r > 58) {
    const W = lerp(16, 50, clamp((r - 50) / 260, 0, 1));
    const G = Math.max(profileGrade(r), 0.3);
    const g = lerp(0.27, 0.17, clamp((r - 60) / 220, 0, 1));
    const f = clamp(g / G, 0.12, 0.9);
    const targetLat = side * W;
    const L = Math.abs(targetLat - lat) / Math.sqrt(1 - f * f);
    const rEnd = Math.max(r - f * L, 50);
    for (const t of [0.25, 0.5, 0.75]) pts.push(at(lerp(r, rEnd, t), lerp(lat, targetLat, t)));
    const hp = 2.6;
    pts.push(at(rEnd + hp, targetLat));
    pts.push(at(rEnd - hp, targetLat + side * 1.5));
    r = rEnd - hp;
    lat = targetLat;
    side = -side;
  }
  pts.push(polar(42, 0.05));
  // Crater rim traverse to the true summit on the north rim (via the east side).
  for (let th = 0.18; th <= Math.PI + 0.001; th += 0.2) pts.push(polar(RIM_R + 0.6, th));
  pts.push(polar(RIM_R + 0.6, Math.PI));
  return pts;
}

function catmullRom(ctrl: Vec2[], perSeg = 24): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(i + 2, ctrl.length - 1)];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

function resample(pts: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > step * 0.3) out.push(last);
  return out;
}

function makeLine(ctrl: Vec2[], main: boolean, smoothWin = 6): TrailLine {
  const pts = resample(catmullRom(ctrl), 2);
  const raw = pts.map((p) => rawHeight(p.x, p.z));
  const heights = raw.map((_, i) => {
    let sum = 0;
    let w = 0;
    for (let k = -smoothWin; k <= smoothWin; k++) {
      const j = clamp(i + k, 0, raw.length - 1);
      const wk = 1 - Math.abs(k) / (smoothWin + 1);
      sum += raw[j] * wk;
      w += wk;
    }
    return sum / w;
  });
  const s: number[] = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, heights, s, length: s[s.length - 1], main };
}

// Segment spatial hash for fast "distance to trail" queries.
const CELL = 16;
interface SegRef {
  line: number;
  i: number;
}

class SegmentHash {
  map = new Map<number, SegRef[]>();
  key(cx: number, cz: number) {
    return (cx + 512) * 4096 + (cz + 512);
  }
  insert(lines: TrailLine[]) {
    lines.forEach((line, li) => {
      for (let i = 0; i < line.pts.length - 1; i++) {
        const a = line.pts[i];
        const b = line.pts[i + 1];
        const pad = 14;
        const minx = Math.floor((Math.min(a.x, b.x) - pad) / CELL);
        const maxx = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
        const minz = Math.floor((Math.min(a.z, b.z) - pad) / CELL);
        const maxz = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
        for (let cx = minx; cx <= maxx; cx++)
          for (let cz = minz; cz <= maxz; cz++) {
            const k = this.key(cx, cz);
            let arr = this.map.get(k);
            if (!arr) this.map.set(k, (arr = []));
            arr.push({ line: li, i });
          }
      }
    });
  }
}

export interface TrailHit {
  dist: number;
  line: number;
  index: number;
  t: number;
  height: number;
  /** distance along the line */
  s: number;
}

// ---------------------------------------------------------------------------------------------
// The world singleton.

export interface Scatter {
  x: number;
  z: number;
  y: number;
  s: number;
  rot: number;
  tint: number;
  /** kit item id from the mountain's recipe (v0.7) */
  item?: string;
}

export interface Checkpoint {
  id: string;
  name: string;
  objective: string;
  x: number;
  z: number;
  radius: number;
  s: number;
}

export interface World {
  heights: Float32Array;
  lines: TrailLine[];
  main: TrailLine;
  hash: SegmentHash;
  trailhead: Vec2 & { y: number; heading: number };
  summit: { x: number; y: number; z: number };
  hTrailhead: number;
  hSummit: number;
  ftPerUnit: number;
  miPerUnit: number;
  checkpoints: Checkpoint[];
  trees: Scatter[];
  rocks: Scatter[];
  shrubs: Scatter[];
  cairns: Scatter[];
  posts: Scatter[];
  logs: Scatter[];
  ferns: Scatter[];
  drifts: Scatter[];
  ice: Scatter[];
  spires: Scatter[];
  /** v0.6.1 boulder groups — v0.7 places all rocks through the recipe, so this stays empty */
  boulders: Scatter[];
  /** v0.7 ground cover (grass, flowers, shrubs, ferns), from the recipe */
  cover: Scatter[];
  colliders: Map<number, { x: number; z: number; r: number }[]>;
  gems: Gem[];
}

export interface Gem {
  id: string;
  kind: GemKind;
  x: number;
  y: number;
  z: number;
}

let world: World | null = null;

export function getWorld(): World {
  if (!world) world = buildWorld();
  return world;
}

const N1 = TERRAIN_SEGMENTS + 1;

function buildWorld(): World {
  const mainLine = makeLine(mainTrailControl(), true);
  // Spur trail from the main trail to the tarn shore.
  let best = 0;
  let bestD = Infinity;
  mainLine.pts.forEach((p, i) => {
    const d = Math.hypot(p.x - LAKE.x, p.z - LAKE.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const j = mainLine.pts[best];
  const dirx = (LAKE.x - j.x) / bestD;
  const dirz = (LAKE.z - j.z) / bestD;
  const shore = { x: LAKE.x - dirx * (LAKE.r + 4), z: LAKE.z - dirz * (LAKE.r + 4) };
  // v0.8: a straighter spur (gentle bend only) so the tarn is a short, obvious side trip.
  const mid = { x: lerp(j.x, shore.x, 0.5) - dirz * 4, z: lerp(j.z, shore.z, 0.5) + dirx * 4 };
  const spur = makeLine([j, mid, shore], false, 4);
  const lines = [mainLine, spur];
  const hash = new SegmentHash();
  hash.insert(lines);

  const heights = new Float32Array(N1 * N1);
  for (let iz = 0; iz < N1; iz++) {
    const z = -HALF + iz * GRID_STEP;
    for (let ix = 0; ix < N1; ix++) {
      const x = -HALF + ix * GRID_STEP;
      let h = rawHeight(x, z);
      const hit = nearestOnTrail(lines, hash, x, z, 12);
      if (hit) {
        const w = 1 - smoothstep(TRAIL_HALF_WIDTH + 1.2, TRAIL_HALF_WIDTH + 9, hit.dist);
        h = lerp(h, hit.height - 0.15, w);
      }
      heights[iz * N1 + ix] = h;
    }
  }

  const W = {
    heights,
    lines,
    main: mainLine,
    hash,
  } as World;
  world = W;

  const start = mainLine.pts[0];
  const next = mainLine.pts[6];
  W.trailhead = {
    x: start.x,
    z: start.z,
    y: heightAt(start.x, start.z),
    heading: Math.atan2(next.x - start.x, next.z - start.z),
  };
  const end = mainLine.pts[mainLine.pts.length - 1];
  W.summit = { x: end.x, z: end.z, y: heightAt(end.x, end.z) };
  W.hTrailhead = W.trailhead.y;
  W.hSummit = W.summit.y;
  W.ftPerUnit = (SUMMIT_FT - TRAILHEAD_FT) / (W.hSummit - W.hTrailhead);
  W.miPerUnit = ROUTE_MILES / mainLine.length;

  // Checkpoints derived from the route itself.
  const idxWhere = (pred: (i: number) => boolean) => {
    for (let i = 0; i < mainLine.pts.length; i++) if (pred(i)) return i;
    return mainLine.pts.length - 1;
  };
  const cp = (id: string, name: string, objective: string, i: number, radius = 14): Checkpoint => ({
    id,
    name,
    objective,
    x: mainLine.pts[i].x,
    z: mainLine.pts[i].z,
    radius,
    s: mainLine.s[i],
  });
  const iTree = idxWhere((i) => mainLine.heights[i] > TREELINE_H);
  const iSnow = idxWhere((i) => mainLine.heights[i] > 262);
  const iRim = idxWhere((i) => Math.hypot(mainLine.pts[i].x, mainLine.pts[i].z) < RIM_R + 4);
  W.checkpoints = [
    cp('treeline', 'Treeline', 'Follow the trail up through the forest to treeline', iTree),
    cp('camp', 'Obsidian Tarn Camp', 'Reach Obsidian Tarn Camp, the alpine checkpoint', best, 16),
    cp('snow', 'Upper Snowfield', 'Climb the cinder switchbacks to the upper snowfield', iSnow),
    cp('rim', 'Crater Rim', 'Kick steps up the final snow slope to the crater rim', iRim, 10),
    cp('summit', 'Cindercrest Summit', 'Traverse the crater rim to the true summit', mainLine.pts.length - 1, 5),
  ];

  // v0.7: gems first (fixed spots on the route), then the recipe dresses the mountain around them.
  W.colliders = new Map();
  W.gems = placeGems(W);
  W.boulders = [];
  scatterAll(W);
  // summit cairn (drawn in Landmarks, 1.8 m east of the benchmark) is solid
  addCollider(W, W.summit.x + 1.8, W.summit.z, 1.0);
  return W;
}

export function nearestOnTrail(lines: TrailLine[], hash: SegmentHash, x: number, z: number, maxD = 12): TrailHit | null {
  const arr = hash.map.get(hash.key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!arr) return null;
  let best: TrailHit | null = null;
  for (const ref of arr) {
    const line = lines[ref.line];
    const a = line.pts[ref.i];
    const b = line.pts[ref.i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1e-6;
    const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / len2, 0, 1);
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d <= maxD && (!best || d < best.dist)) {
      best = {
        dist: d,
        line: ref.line,
        index: ref.i,
        t,
        height: lerp(line.heights[ref.i], line.heights[ref.i + 1], t),
        s: lerp(line.s[ref.i], line.s[ref.i + 1], t),
      };
    }
  }
  return best;
}

export function trailQuery(x: number, z: number, maxD = 12) {
  const w = getWorld();
  return nearestOnTrail(w.lines, w.hash, x, z, maxD);
}

/** Exact height of the rendered terrain mesh (matches its triangulation). */
export function heightAt(x: number, z: number) {
  const w = world!;
  const gx = clamp((x + HALF) / GRID_STEP, 0, TERRAIN_SEGMENTS - 1e-4);
  const gz = clamp((z + HALF) / GRID_STEP, 0, TERRAIN_SEGMENTS - 1e-4);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const h = w.heights;
  const h00 = h[iz * N1 + ix];
  const h10 = h[iz * N1 + ix + 1];
  const h01 = h[(iz + 1) * N1 + ix];
  const h11 = h[(iz + 1) * N1 + ix + 1];
  // Triangles: (00,01,10) and (01,11,10) — split along the 01-10 diagonal.
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

export function gradientAt(x: number, z: number, e = 1.2) {
  return {
    gx: (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e),
    gz: (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e),
  };
}

/**
 * Exposed rock in the upper snowfield (v0.6.1), 0..1: wind-scoured ribs and outcrops breaking the
 * snow like a real approach. Never on or near the trail (the boot track stays continuous) and not
 * in the crater. Where it is > 0.5 the ground is rock underfoot.
 */
export function rockPatch(x: number, z: number, h: number) {
  if (h < 236) return 0;
  const r = Math.hypot(x, z);
  if (r < RIM_R + 6) return 0;
  const n = fbm(x / 26 + 3, z / 26 - 7, 3, 331);
  const ribs = fbm(Math.atan2(x, z) * 9, r / 40, 2, 337); // radial ribs down the cone
  // v0.8: fewer, narrower ribs (rather than blotches) so the cap reads as snow broken by rock.
  let m = smoothstep(0.3, 0.42, n * 0.35 + ribs * 0.8) * smoothstep(240, 266, h);
  // keep the final snow slope below the rim clean (no dark shards around the summit)
  m *= smoothstep(RIM_R + 45, RIM_R + 95, r);
  if (m <= 0) return 0;
  if (world) {
    const t = trailQuery(x, z, 9);
    if (t) m *= smoothstep(TRAIL_HALF_WIDTH + 1.2, TRAIL_HALF_WIDTH + 4, t.dist);
  }
  return m;
}

/** Snow cover 0..1 from elevation, slope and noise. */
export function snowCover(x: number, z: number, h: number, slope: number) {
  const r = Math.hypot(x, z);
  const line = 252 + fbm(x / 70, z / 70, 3, 77) * 22;
  let s = smoothstep(line - 6, line + 8, h);
  // Lingering patches lower down in hollows on the north/shaded side.
  // (v0.8: rarer, so the lower cone isn't spotted with white from a distance)
  const patch = smoothstep(0.5, 0.7, fbm(x / 45 + 9, z / 45, 3, 61)) * smoothstep(190, 225, h);
  s = Math.max(s, patch * 0.9);
  s *= 1 - smoothstep(1.2, 1.7, slope);
  if (r < RIM_R + 1) s = Math.max(s, 0.85);
  s *= 1 - rockPatch(x, z, h) * 0.95;
  return clamp(s, 0, 1);
}

export function surfaceAt(x: number, z: number): { surface: Surface; onTrail: boolean; snow: number; slope: number; h: number; trail: TrailHit | null } {
  const h = heightAt(x, z);
  const { gx, gz } = gradientAt(x, z);
  const slope = Math.hypot(gx, gz);
  const trail = trailQuery(x, z, 12);
  const onTrail = !!trail && trail.dist < TRAIL_HALF_WIDTH + 0.9;
  const snow = snowCover(x, z, h, slope);
  let surface: Surface;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r - 2 && h < LAKE.level) surface = 'water';
  else if (onTrail) surface = 'trail';
  else if (snow > 0.5) surface = 'snow';
  else if (slope > 1.15 || rockPatch(x, z, h) > 0.5) surface = 'rock';
  else if (h > 168) surface = 'scree';
  else if (h > TREELINE_H) surface = 'meadow';
  else surface = 'forest';
  return { surface, onTrail, snow, slope, h, trail };
}

export const elevationFt = (h: number) => {
  const w = getWorld();
  return TRAILHEAD_FT + (h - w.hTrailhead) * w.ftPerUnit;
};
export const unitsToMiles = (u: number) => u * getWorld().miPerUnit;

// ---------------------------------------------------------------------------------------------
// Scatter (trees, rocks, shrubs, cairns, trail posts) + collision buckets.

const COL_CELL = 10;
const colKey = (cx: number, cz: number) => (cx + 1024) * 4096 + (cz + 1024);

function addCollider(W: World, x: number, z: number, r: number) {
  const k = colKey(Math.floor(x / COL_CELL), Math.floor(z / COL_CELL));
  let arr = W.colliders.get(k);
  if (!arr) W.colliders.set(k, (arr = []));
  arr.push({ x, z, r });
}

const nearOut: { x: number; z: number; r: number }[] = [];
/** Colliders in the 3×3 cells around a point. Returns a shared array (no per-frame allocation). */
export function collidersNear(x: number, z: number) {
  const W = getWorld();
  const cx = Math.floor(x / COL_CELL);
  const cz = Math.floor(z / COL_CELL);
  nearOut.length = 0;
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const arr = W.colliders.get(colKey(cx + dx, cz + dz));
      if (arr) for (let i = 0; i < arr.length; i++) nearOut.push(arr[i]);
    }
  return nearOut;
}

// ---- Play corridor (v0.8): how far from any trail the climber may roam.
/** Corridor half-width in miles either side of the main trail and the tarn spur. */
export const CORRIDOR_MI = 0.5;
const CF_CELL = 8;
const CF_N = Math.ceil(TERRAIN_SIZE / CF_CELL) + 1;
let corridorField: Float32Array | null = null;

/** Distance (units) to the nearest trail centreline, from a coarse precomputed field (bilinear). */
export function trailFieldDistance(x: number, z: number) {
  if (!corridorField) {
    const W = getWorld();
    const pts: Vec2[] = [];
    for (const l of W.lines) for (let i = 0; i < l.pts.length; i += 2) pts.push(l.pts[i]);
    corridorField = new Float32Array(CF_N * CF_N);
    for (let iz = 0; iz < CF_N; iz++)
      for (let ix = 0; ix < CF_N; ix++) {
        const px = -HALF + ix * CF_CELL;
        const pz = -HALF + iz * CF_CELL;
        let b = Infinity;
        for (let k = 0; k < pts.length; k++) {
          const dx = pts[k].x - px;
          const dz = pts[k].z - pz;
          const d = dx * dx + dz * dz;
          if (d < b) b = d;
        }
        corridorField[iz * CF_N + ix] = Math.sqrt(b);
      }
  }
  const fx = clamp((x + HALF) / CF_CELL, 0, CF_N - 1.001);
  const fz = clamp((z + HALF) / CF_CELL, 0, CF_N - 1.001);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const f = corridorField;
  const a = f[iz * CF_N + ix] * (1 - tx) + f[iz * CF_N + ix + 1] * tx;
  const b = f[(iz + 1) * CF_N + ix] * (1 - tx) + f[(iz + 1) * CF_N + ix + 1] * tx;
  return a * (1 - tz) + b * tz;
}

/** Corridor half-width in world units. */
export const corridorUnits = () => CORRIDOR_MI / getWorld().miPerUnit;

function scatterAll(W: World) {
  placeScenery(W, CINDERCREST, { heightAt, gradientAt, trailQuery, snowCover, addCollider: (x, z, r) => addCollider(W, x, z, r) });
}

/** Remaining route distance (units) to the summit from a world position. */
export function remainingToSummit(x: number, z: number) {
  const W = getWorld();
  const main = W.main;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < main.pts.length; i += 2) {
    const p = main.pts[i];
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return Math.sqrt(bestD) + (main.length - main.s[best]);
}

/** Resolve the route's gem specs (trail fraction + sideways offset) into world positions. */
function placeGems(W: World): Gem[] {
  const main = W.main;
  const indexAt = (frac: number) => {
    const target = frac * main.length;
    let i = 0;
    while (i < main.pts.length - 2 && main.s[i] < target) i++;
    return i;
  };
  return ACTIVE_ROUTE.gems.map((g) => {
    const i = indexAt(g.at);
    let x: number;
    let z: number;
    if (g.cut !== undefined) {
      // Find the switchback leg directly above: the farthest-along trail point within reach.
      const p0 = main.pts[i];
      let best = i;
      for (let k = i; k < main.pts.length; k++) {
        if (Math.hypot(main.pts[k].x - p0.x, main.pts[k].z - p0.z) < 45 && main.s[k] > main.s[best]) best = k;
      }
      const p1 = main.pts[best];
      x = lerp(p0.x, p1.x, g.cut);
      z = lerp(p0.z, p1.z, g.cut);
    } else {
      const a = main.pts[Math.max(i - 1, 0)];
      const b = main.pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      // right-hand perpendicular of the travel direction
      x = main.pts[i].x - (dz / l) * g.side;
      z = main.pts[i].z + (dx / l) * g.side;
    }
    if (g.nudge) {
      x += g.nudge[0];
      z += g.nudge[1];
    }
    // Never bury a gem in a tree or boulder: push it clear of any collider.
    for (const c of collidersNear(x, z)) {
      const d = Math.hypot(x - c.x, z - c.z);
      const need = c.r + 1.2;
      if (d < need) {
        const ux = d > 1e-3 ? (x - c.x) / d : 1;
        const uz = d > 1e-3 ? (z - c.z) / d : 0;
        x = c.x + ux * need;
        z = c.z + uz * need;
      }
    }
    return { id: g.id, kind: g.kind, x, z, y: heightAt(x, z) + 0.02 };
  });
}
