// Scenery placement (v0.7): reads a mountain recipe and dresses the world with intent — tree
// groves with clearings, boulder fields under cliffs, boulders on the outside of trail bends,
// talus on the cone, outcrops and cliff bands on the steepest faces, ground cover in drifts, and
// cairns on level ground. Deterministic (seeded) so every player sees the same mountain.
// Pure data in, scatter lists + colliders out: no rendering here, so the headless sim uses it too.
import { fbm, mulberry32, smoothstep } from './noise';
import type { Recipe } from '../recipes';
import { BOUNDARY_R, HALF, LAKE, RIM_R, TRAIL_HALF_WIDTH, TRAILHEAD_FT, TREELINE_H, corridorUnits, trailFieldDistance, type TrailHit, type World } from './world';

interface Tools {
  heightAt(x: number, z: number): number;
  gradientAt(x: number, z: number): { gx: number; gz: number };
  trailQuery(x: number, z: number, maxD?: number): TrailHit | null;
  snowCover(x: number, z: number, h: number, slope: number): number;
  addCollider(x: number, z: number, r: number): void;
}

const band = (from: number, peak: number, to: number, f: number) => (f <= from || f >= to ? 0 : f < peak ? smoothstep(from, peak, f) : 1 - smoothstep(peak, to, f));

export function placeScenery(W: World, recipe: Recipe, T: Tools) {
  const P = recipe.placement;
  const ITEMS = recipe.items as Record<string, { kind: string; collide?: number }>;
  W.trees = [];
  W.rocks = [];
  W.shrubs = [];
  W.ferns = [];
  W.cairns = [];
  W.posts = [];
  W.logs = [];
  W.drifts = [];
  W.ice = [];
  W.spires = [];
  W.cover = [];
  const ft = (h: number) => TRAILHEAD_FT + (h - W.hTrailhead) * W.ftPerUnit;
  const slopeAt = (x: number, z: number) => {
    const { gx, gz } = T.gradientAt(x, z);
    return Math.hypot(gx, gz);
  };
  const th = W.trailhead;
  const clearOf = (x: number, z: number, d: number) => {
    const hit = T.trailQuery(x, z, d + 1);
    return !hit || hit.dist > d;
  };
  const nearLake = (x: number, z: number, pad: number) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + pad;
  const nearTrailhead = (x: number, z: number, d = 26) => Math.hypot(x - th.x, z - th.z) < d;
  const nearGem = (x: number, z: number, d: number) => W.gems.some((g) => Math.hypot(g.x - x, g.z - z) < d);
  const inMap = (r: number, rand: () => number) => {
    const rr = Math.sqrt(rand()) * r;
    const a = rand() * Math.PI * 2;
    return { x: Math.sin(a) * rr, z: Math.cos(a) * rr };
  };

  const R = corridorUnits();
  // ------------------------------------------------------------------------------ trees
  {
    const rand = mulberry32(1337);
    const S = P.trees;
    let tries = 0;
    while (W.trees.length < S.max && tries < S.attempts) {
      tries++;
      const x = (rand() * 2 - 1) * (HALF - 20);
      const z = (rand() * 2 - 1) * (HALF - 20);
      const h = T.heightAt(x, z);
      if (h < -0.5 && Math.max(Math.abs(x), Math.abs(z)) > HALF - 60) continue;
      const f = ft(h);
      const weights = S.species.map((sp) => band(sp.from, sp.peak, sp.to, f) * sp.weight);
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0.001) continue;
      // Groves and clearings
      const g = fbm(x / S.groveScale, z / S.groveScale, 3, 101);
      const c0 = -0.35 + S.clearings * 0.7;
      let p = smoothstep(c0, c0 + 0.22, g) * Math.min(1, total) * (1 - smoothstep(S.thinStart, 7800, f) * 0.8);
      const hit = T.trailQuery(x, z, S.thinTo);
      if (hit && hit.dist < S.trailClear) continue;
      if (hit) p *= S.thinFactor + (1 - S.thinFactor) * smoothstep(S.trailClear, S.thinTo, hit.dist);
      // v0.8: the forest thickens toward the wilderness boundary, so the edge of the play area
      // reads as dense timber rather than an invisible wall.
      const dEdge = trailFieldDistance(x, z) - R;
      if (dEdge > -25) p = Math.min(1, p * (1 + 0.9 * smoothstep(-25, 15, dEdge)));
      if (rand() > p) continue;
      if (slopeAt(x, z) > S.maxSlope || nearLake(x, z, 4) || nearTrailhead(x, z) || nearGem(x, z, 3)) continue;
      let r = rand() * total;
      let k = 0;
      while (k < weights.length - 1 && r > weights[k]) r -= weights[k++];
      const sp = S.species[k];
      const stunt = 1 - smoothstep(sp.peak, sp.to, f) * 0.4;
      const s = (0.8 + rand() * 0.6) * stunt;
      let item: string = sp.item;
      if (f > S.snowyAbove && ITEMS[`${item}Snowy`]) item = `${item}Snowy`;
      W.trees.push({ x, z, y: h - 0.25, s, rot: rand() * Math.PI * 2, tint: rand(), item });
      T.addCollider(x, z, (sp.item === 'whitebarkPine' ? 0.5 : 0.42) * s + 0.15);
    }
    // Foothill forest beyond the playable boundary.
    let n = 0;
    for (let t = 0; t < S.farForest * 6 && n < S.farForest; t++) {
      const r = BOUNDARY_R + 10 + rand() * (HALF * 1.38 - BOUNDARY_R - 10);
      const a = rand() * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) >= HALF - 6) continue;
      const h = T.heightAt(x, z);
      if (h >= TREELINE_H) continue;
      n++;
      W.trees.push({ x, z, y: h - 0.3, s: 1.0 + rand() * 0.5, rot: rand() * Math.PI * 2, tint: rand(), item: rand() < 0.35 ? 'douglasFir' : 'mountainHemlock' });
    }
  }

  // ------------------------------------------------------------------------------ rocks
  {
    const rand = mulberry32(2024);
    const R = P.rocks;
    const put = (item: string, x: number, z: number, s: number, bury = 0.3) => {
      const h = T.heightAt(x, z);
      W.rocks.push({ x, z, y: h - s * bury, s, rot: rand() * Math.PI * 2, tint: rand(), item });
      const c = ITEMS[item]?.collide;
      if (c && s > 1.1) T.addCollider(x, z, s * c);
    };
    const okRock = (x: number, z: number, s: number) => clearOf(x, z, R.trailClear + s * 0.7) && !nearLake(x, z, 2) && !nearTrailhead(x, z, 30) && !nearGem(x, z, 2.5 + s);
    const size = ([a, b]: number[]) => a + rand() * (b - a);
    const scatterBand = (spec: { item: string; count: number; size: number[] }, ok: (x: number, z: number, f: number, sl: number) => boolean, bury = 0.3) => {
      let n = 0;
      for (let t = 0; t < spec.count * 40 && n < spec.count; t++) {
        const { x, z } = inMap(800, rand);
        const h = T.heightAt(x, z);
        const s = size(spec.size);
        if (!ok(x, z, ft(h), slopeAt(x, z)) || !okRock(x, z, s)) continue;
        put(spec.item, x, z, s, bury);
        n++;
      }
    };
    scatterBand(R.forestBoulders, (_x, _z, f, sl) => f < R.forestBoulders.below && sl < 0.9, 0.42);
    scatterBand(R.meadowBoulders, (_x, _z, f, sl) => f > R.meadowBoulders.from && f < R.meadowBoulders.to && sl < 0.8, 0.35);
    // Boulder fields at the foot of cliffs: flat-ish ground with steep ground just uphill.
    {
      const C = R.cliffFields;
      let groups = 0;
      for (let t = 0; t < 30000 && groups < C.groups; t++) {
        const { x, z } = inMap(780, rand);
        const f = ft(T.heightAt(x, z));
        if (f < C.from || f > C.to) continue;
        const { gx, gz } = T.gradientAt(x, z);
        const sl = Math.hypot(gx, gz);
        if (sl > 0.75 || sl < 0.15) continue;
        const ux = gx / sl;
        const uz = gz / sl;
        if (slopeAt(x + ux * 10, z + uz * 10) < 1.05) continue;
        if (!clearOf(x, z, 9)) continue;
        groups++;
        const n = C.perGroup[0] + Math.floor(rand() * (C.perGroup[1] - C.perGroup[0] + 1));
        for (let i = 0; i < n; i++) {
          const along = (rand() - 0.5) * 12;
          const down = -rand() * 7;
          const bx = x - uz * along + ux * down;
          const bz = z + ux * along + uz * down;
          const s = size(C.size) * (i === 0 ? 1.2 : 1);
          if (okRock(bx, bz, s)) put(C.item, bx, bz, s, 0.32);
        }
      }
    }
    // Boulders on the outside of sharp trail bends.
    {
      const B = R.trailBends;
      const m = W.main;
      let last = -Infinity;
      for (let i = 8; i < m.pts.length - 8; i++) {
        if (m.s[i] - last < B.spacing) continue;
        const a = m.pts[i - 7];
        const p = m.pts[i];
        const b = m.pts[i + 7];
        const h1 = Math.atan2(p.x - a.x, p.z - a.z);
        const h2 = Math.atan2(b.x - p.x, b.z - p.z);
        const turn = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
        if (turn < B.minTurn) continue;
        const ox = p.x - (a.x + b.x) / 2;
        const oz = p.z - (a.z + b.z) / 2;
        const ol = Math.hypot(ox, oz) || 1;
        const s = size(B.size);
        const d = TRAIL_HALF_WIDTH + 2.4 + s;
        const x = p.x + (ox / ol) * d;
        const z = p.z + (oz / ol) * d;
        const f = ft(T.heightAt(x, z));
        if (!clearOf(x, z, TRAIL_HALF_WIDTH + 1.6 + s * 0.6) || nearGem(x, z, 4) || nearTrailhead(x, z, 30)) continue;
        put(f > 7400 ? 'basaltBoulder' : B.item, x, z, s, 0.35);
        last = m.s[i];
      }
    }
    // Talus patches on the cone.
    {
      const Tl = R.talus;
      for (let pch = 0, t = 0; pch < Tl.patches && t < 20000; t++) {
        const { x, z } = inMap(600, rand);
        const f = ft(T.heightAt(x, z));
        const sl = slopeAt(x, z);
        if (f < Tl.from || f > Tl.to || sl < 0.35 || sl > 1.1 || !clearOf(x, z, 6)) continue;
        pch++;
        const n = Tl.perPatch[0] + Math.floor(rand() * (Tl.perPatch[1] - Tl.perPatch[0] + 1));
        for (let i = 0; i < n; i++) {
          const px = x + (rand() - 0.5) * 9;
          const pz = z + (rand() - 0.5) * 9;
          const s = size(Tl.size);
          if (okRock(px, pz, s)) put(Tl.item, px, pz, s, 0.25);
        }
      }
    }
    scatterBand(R.cinder, (_x, _z, f, sl) => f > R.cinder.from && f < R.cinder.to && sl < 1.0, 0.3);
    // Outcrops and cliff bands on the steepest faces, long axis along the contour.
    {
      const O = R.outcrops;
      let n = 0;
      for (let t = 0; t < 60000 && n < O.count; t++) {
        const { x, z } = inMap(700, rand);
        const h = T.heightAt(x, z);
        const f = ft(h);
        const { gx, gz } = T.gradientAt(x, z);
        const sl = Math.hypot(gx, gz);
        if (f < O.from || sl < O.minSlope || T.trailQuery(x, z, O.trailClear) || nearGem(x, z, 8) || Math.hypot(x, z) < 30) continue;
        // (v0.9: none on the summit dome itself — they read as white boxes beside the cairn)
        if (Math.hypot(x - W.summit.x, z - W.summit.z) < 50) continue;
        n++;
        const s = size(O.size);
        const cx = -gz / sl;
        const cz = gx / sl;
        const snowy = T.snowCover(x, z, h, sl) > 0.5;
        const item = snowy ? O.snowyItem : O.item;
        W.rocks.push({ x, z, y: h - s * 0.38, s, rot: Math.atan2(-cz, cx), tint: rand(), item });
        T.addCollider(x, z, s * (ITEMS[item]?.collide ?? 0.7));
      }
    }
    // (v0.8: never inside the crater, and clear of the summit cairn)
    scatterBand(R.summitRocks, (x, z, f) => f > R.summitRocks.from && Math.hypot(x, z) > RIM_R + 6 && Math.hypot(x - W.summit.x, z - W.summit.z) > 25, 0.3);
  }

  // ------------------------------------------------------------------------------ ground cover
  {
    const rand = mulberry32(777);
    P.cover.forEach((spec, si) => {
      let n = 0;
      const seed = 400 + si * 17;
      const t0 = 0.3 - spec.cover * 0.85;
      for (let t = 0; t < (spec.count / spec.clump) * 16 && n < spec.count; t++) {
        const { x, z } = inMap(820, rand);
        const h = T.heightAt(x, z);
        const f = ft(h);
        if (f < spec.from || f > spec.to) continue;
        const edge = Math.min(1, (f - spec.from) / 250, (spec.to - f) / 250);
        const drift = fbm(x / spec.patch + seed, z / spec.patch - seed, 2, seed);
        if (rand() > smoothstep(t0, t0 + 0.18, drift) * edge) continue;
        if (slopeAt(x, z) > 1.0 || nearLake(x, z, 1) || nearTrailhead(x, z, 8)) continue;
        if (!clearOf(x, z, TRAIL_HALF_WIDTH + 0.4)) continue;
        if (T.snowCover(x, z, h, slopeAt(x, z)) > 0.45) continue;
        for (let c = 0; c < spec.clump && n < spec.count; c++) {
          const cx = c === 0 ? x : x + (rand() - 0.5) * 2.4;
          const cz = c === 0 ? z : z + (rand() - 0.5) * 2.4;
          if (c > 0 && !clearOf(cx, cz, TRAIL_HALF_WIDTH + 0.4)) continue;
          W.cover.push({ x: cx, z: cz, y: T.heightAt(cx, cz) - 0.03, s: 0.75 + rand() * 0.55, rot: rand() * Math.PI * 2, tint: rand(), item: spec.item });
          n++;
        }
      }
    });
  }

  // ------------------------------------------------------------------------------ trail markers
  {
    const rand = mulberry32(99);
    const C = P.cairns;
    const main = W.main;
    let lastMark = -999;
    for (let i = 0; i < main.pts.length - 1; i++) {
      const h = main.heights[i];
      const gap = h > TREELINE_H ? C.spacing : 70;
      if (main.s[i] - lastMark < gap || main.s[i] < 30) continue;
      const a = main.pts[i];
      const b = main.pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      if (h <= TREELINE_H) {
        const side = (i % 2 ? 1 : -1) * (TRAIL_HALF_WIDTH + 1.4);
        const x = a.x - (dz / l) * side;
        const z = a.z + (dx / l) * side;
        W.posts.push({ x, z, y: T.heightAt(x, z), s: 1, rot: Math.atan2(dx, dz), tint: rand() });
        T.addCollider(x, z, 0.5);
        lastMark = main.s[i];
        continue;
      }
      // Cairns: the flattest spot just off either side of the trail.
      let best: { x: number; z: number; sl: number } | null = null;
      for (const side of [-1, 1])
        for (const off of [2.9, 3.3, 3.8]) {
          const d = side * (TRAIL_HALF_WIDTH + off - 1.7);
          const x = a.x - (dz / l) * d;
          const z = a.z + (dx / l) * d;
          const sl = slopeAt(x, z);
          if (!best || sl < best.sl) best = { x, z, sl };
        }
      if (!best || best.sl > C.maxSlope || nearGem(best.x, best.z, 3)) continue;
      // Rest on the lowest point under its footprint so no side floats.
      let y = Infinity;
      for (const [ox, oz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0, 0]]) y = Math.min(y, T.heightAt(best.x + ox, best.z + oz));
      const variant = Math.floor(rand() * C.settings.length);
      W.cairns.push({ x: best.x, z: best.z, y: y - 0.1, s: 0.95 + rand() * 0.2, rot: rand() * Math.PI * 2, tint: rand(), item: `cairn${variant}` });
      T.addCollider(best.x, best.z, 0.6);
      lastMark = main.s[i];
    }
    // v0.8: two cairns mark the tarn spur so it reads as a trail from the junction.
    const spur = W.lines[1];
    if (spur)
      for (const [f, side] of [[0.3, 1], [0.68, -1]] as const) {
        const i = Math.min(spur.pts.length - 2, Math.floor(f * (spur.pts.length - 1)));
        const a = spur.pts[i];
        const b = spur.pts[i + 1];
        const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const d = side * (TRAIL_HALF_WIDTH + 1.4);
        const x = a.x - ((b.z - a.z) / l) * d;
        const z = a.z + ((b.x - a.x) / l) * d;
        let y = Infinity;
        for (const [ox, oz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0, 0]]) y = Math.min(y, T.heightAt(x + ox, z + oz));
        const variant = Math.floor(rand() * C.settings.length);
        W.cairns.push({ x, z, y: y - 0.1, s: 0.85 + rand() * 0.15, rot: rand() * Math.PI * 2, tint: rand(), item: `cairn${variant}` });
        T.addCollider(x, z, 0.6);
      }
  }

  // v0.8: ground cover and small rocks only inside the play corridor (plus a margin) — nobody
  // walks out there, and the distant view only shows the forest, cliffs and outcrops.
  const SMALL = new Set(['talus', 'cinderRock', 'forestBoulder', 'meadowBoulder']);
  W.cover = W.cover.filter((c) => trailFieldDistance(c.x, c.z) < R + 25);
  W.rocks = W.rocks.filter((r) => !SMALL.has(r.item ?? '') || trailFieldDistance(r.x, r.z) < R + 50);
}
