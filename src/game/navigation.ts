// Navigation helpers for the HUD and minimap: a three-state trail status with hysteresis, a
// "safe way back" bearing when the climber is off route, and named places along the climb.
// Pure functions over world data so they can be unit-checked headlessly.

import { getWorld, heightAt, gradientAt, LAKE, RIM_R, TREELINE_H, TRAIL_HALF_WIDTH } from './world';

export type TrailState = 'on' | 'near' | 'off';

/** World units from the trail centreline. "near" = close enough to see and rejoin the trail. */
const NEAR_IN = 13; // off → near
const NEAR_OUT = 17; // near → off
const ON_GRACE = 0.6; // seconds off the tread before "on" drops to "near"

export interface NavState {
  state: TrailState;
  offFor: number;
}

export function createNav(): NavState {
  return { state: 'on', offFor: 0 };
}

export interface SafePoint {
  x: number;
  z: number;
  /** horizontal distance, world units */
  dist: number;
  /** world bearing (atan2(dx, dz)) */
  bearing: number;
}

/**
 * Nearest trail point the climber can safely walk to: candidates along every trail line are scored
 * by distance, with heavy penalties for a straight line that crosses cliffs (very steep ground),
 * the tarn, or a big drop/climb; points further up the route get a small bonus so guidance
 * doesn't send people backwards.
 */
export function safeTrailPoint(x: number, z: number): SafePoint | null {
  const W = getWorld();
  let best: SafePoint | null = null;
  let bestCost = Infinity;
  // Coarse pass: nearest few candidates by distance.
  const cands: { x: number; z: number; d: number; s: number; main: boolean }[] = [];
  for (const line of W.lines) {
    for (let i = 0; i < line.pts.length; i += 3) {
      const q = line.pts[i];
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < 260) cands.push({ x: q.x, z: q.z, d, s: line.s[i] / line.length, main: line.main });
    }
  }
  if (!cands.length) {
    // Far from everything: fall back to the absolute nearest main-line point.
    for (let i = 0; i < W.main.pts.length; i += 3) {
      const q = W.main.pts[i];
      cands.push({ x: q.x, z: q.z, d: Math.hypot(q.x - x, q.z - z), s: W.main.s[i] / W.main.length, main: true });
    }
  }
  cands.sort((a, b) => a.d - b.d);
  const h0 = heightAt(x, z);
  for (const c of cands.slice(0, 40)) {
    let cost = c.d;
    // Walk the straight line and look for hazards.
    const steps = Math.max(2, Math.min(10, Math.ceil(c.d / 6)));
    let worst = 0;
    let wet = false;
    for (let k = 1; k < steps; k++) {
      const f = k / steps;
      const px = x + (c.x - x) * f;
      const pz = z + (c.z - z) * f;
      const g = gradientAt(px, pz);
      worst = Math.max(worst, Math.hypot(g.gx, g.gz));
      if (Math.hypot(px - LAKE.x, pz - LAKE.z) < LAKE.r - 1) wet = true;
    }
    if (worst > 1.15) cost += 60 + (worst - 1.15) * 120; // cliff band
    if (wet) cost += 80;
    const dh = Math.abs(heightAt(c.x, c.z) - h0);
    cost += Math.max(0, dh / Math.max(c.d, 1) - 0.6) * 40; // steep straight-line grade
    cost -= c.s * 12; // prefer points further along the route
    if (!c.main) cost += 4;
    if (cost < bestCost) {
      bestCost = cost;
      best = { x: c.x, z: c.z, dist: c.d, bearing: Math.atan2(c.x - x, c.z - z) };
    }
  }
  return best;
}

/** Advance the trail state with hysteresis. `onTread` is the sim's own on-trail flag. */
export function stepNav(nav: NavState, onTread: boolean, dt: number, trailDist: number) {
  if (onTread) {
    nav.offFor = 0;
    nav.state = 'on';
    return nav.state;
  }
  nav.offFor += dt;
  if (nav.state === 'on') {
    if (nav.offFor > ON_GRACE) nav.state = trailDist > NEAR_OUT ? 'off' : 'near';
  } else if (nav.state === 'near') {
    if (trailDist > NEAR_OUT) nav.state = 'off';
  } else if (trailDist < NEAR_IN) nav.state = 'near';
  return nav.state;
}

/** Distance (world units) to the nearest trail centreline, searched wider than the sim's 12 u. */
export function trailDistance(x: number, z: number) {
  const W = getWorld();
  let best = Infinity;
  for (const line of W.lines) {
    for (let i = 0; i < line.pts.length; i += 2) {
      const q = line.pts[i];
      const d = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z);
      if (d < best) best = d;
    }
  }
  return Math.max(0, Math.sqrt(best) - TRAIL_HALF_WIDTH * 0.5);
}

/** Named place for the HUD location line. */
export function placeName(x: number, z: number) {
  const W = getWorld();
  const h = heightAt(x, z);
  const r = Math.hypot(x, z);
  if (Math.hypot(x - W.summit.x, z - W.summit.z) < 14) return 'Summit';
  if (r < RIM_R + 16) return 'Crater Rim';
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 45 && h < TREELINE_H + 70) return 'Obsidian Tarn';
  const th = W.main.pts[0];
  if (Math.hypot(x - th.x, z - th.z) < 40) return 'Trailhead';
  if (h < TREELINE_H * 0.55) return 'Lower Forest';
  if (h < TREELINE_H) return 'Upper Forest';
  if (h < 168) return 'Alpine Meadows';
  if (h > 262) return 'Upper Snowfield';
  return 'Cinder Switchbacks';
}

const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Compass point for a world bearing (the HUD compass treats −z as north). */
export function cardinal(bearing: number) {
  const deg = ((180 - (bearing * 180) / Math.PI) % 360 + 360) % 360;
  return CARD[Math.round(deg / 45) % 8];
}
