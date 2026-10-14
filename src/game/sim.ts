// Pure gameplay simulation: movement, terrain effects, stamina, hydration, food, checkpoints.
// Framework-agnostic so it can be driven by the render loop or by a headless test bot.

import { clamp, lerp, smoothstep } from './noise';
import {
  BOUNDARY_R,
  LAKE,
  collidersNear,
  elevationFt,
  getWorld,
  gradientAt,
  heightAt,
  remainingToSummit,
  surfaceAt,
  type Surface,
} from './world';

export interface Loadout {
  departureHour: number;
  poles: boolean;
  spikes: boolean;
  headlamp: boolean;
  insulated: boolean;
  waterL: number;
  food: number;
}

export const DEFAULT_LOADOUT: Loadout = {
  departureHour: 7,
  poles: true,
  spikes: true,
  headlamp: false,
  insulated: true,
  waterL: 2,
  food: 4,
};

export const GEAR = {
  poles: { label: 'Trekking poles', kg: 0.5, desc: '−15% uphill effort, steadier descents' },
  spikes: { label: 'Microspikes', kg: 0.45, desc: 'Grip on snow & ice: faster, less effort on snow' },
  headlamp: { label: 'Headlamp', kg: 0.15, desc: 'Light the way before sunrise' },
  insulated: { label: 'Insulated jacket', kg: 0.7, desc: 'Resist cold & wind above 9,000 ft and at dawn' },
} as const;

export const BASE_PACK_KG = 6.5;
export const WATER_PER_DRINK = 0.5;
export const FOOD_KG = 0.25;
/** Game seconds per real second. */
export const TIME_SCALE = 26;

export const WALK_SPEED = 3.6;
export const JOG_SPEED = 6.6;

export function packWeight(l: Loadout, water = l.waterL, food = l.food) {
  let kg = BASE_PACK_KG + water + food * FOOD_KG;
  if (l.poles) kg += GEAR.poles.kg;
  if (l.spikes) kg += GEAR.spikes.kg;
  if (l.headlamp) kg += GEAR.headlamp.kg;
  if (l.insulated) kg += GEAR.insulated.kg;
  return kg;
}

export type Activity = 'idle' | 'walk' | 'jog' | 'rest' | 'exhausted' | 'summit';

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  vx: number;
  vz: number;
  phase: number; // gait phase for animation
  activity: Activity;
  stamina: number;
  maxStamina: number;
  hydration: number;
  water: number;
  food: number;
  exhausted: boolean;
  resting: boolean;
  /** seconds of gameplay (real) */
  realTime: number;
  /** expedition clock in game seconds since departure */
  gameTime: number;
  distance: number;
  elevGain: number;
  maxY: number;
  surface: Surface;
  onTrail: boolean;
  grade: number;
  snow: number;
  effort: number;
  speedFactor: number;
  timeOnTrail: number;
  timeMoving: number;
  checkpoints: Record<string, number>;
  summited: boolean;
  postholing: boolean;
  remaining: number;
  lastY: number;
  boundaryWarn: number;
  nearWater: boolean;
}

export interface MoveIntent {
  /** world-space direction, magnitude 0..1 */
  x: number;
  z: number;
  jog: boolean;
}

export type GameEvent =
  | { type: 'checkpoint'; id: string; name: string }
  | { type: 'toast'; text: string; tone?: 'info' | 'warn' | 'good' }
  | { type: 'exhausted' };

export function createPlayer(l: Loadout): PlayerState {
  const W = getWorld();
  const th = W.trailhead;
  return {
    x: th.x,
    y: th.y,
    z: th.z,
    heading: th.heading,
    speed: 0,
    vx: 0,
    vz: 0,
    phase: 0,
    activity: 'idle',
    stamina: 100,
    maxStamina: 100,
    hydration: 100,
    water: l.waterL,
    food: l.food,
    exhausted: false,
    resting: false,
    realTime: 0,
    gameTime: 0,
    distance: 0,
    elevGain: 0,
    maxY: th.y,
    surface: 'trail',
    onTrail: true,
    grade: 0,
    snow: 0,
    effort: 0,
    speedFactor: 1,
    timeOnTrail: 0,
    timeMoving: 0,
    checkpoints: {},
    summited: false,
    postholing: false,
    remaining: remainingToSummit(th.x, th.z),
    lastY: th.y,
    boundaryWarn: 0,
    nearWater: false,
  };
}

export const clockHour = (p: PlayerState, l: Loadout) => l.departureHour + p.gameTime / 3600;

/** 0 before dawn … 1 in full daylight. */
export function daylight(hour: number) {
  return smoothstep(5.4, 7.0, hour) * (1 - smoothstep(18.5, 20.2, hour));
}

/** Snow softness: firm in the cold morning, mushy by early afternoon. */
export function snowSoftness(hour: number) {
  return smoothstep(9.0, 13.0, hour);
}

export const SURFACE_SPEED: Record<Surface, number> = {
  trail: 1.0,
  forest: 0.8,
  meadow: 0.86,
  scree: 0.68,
  rock: 0.6,
  snow: 0.75,
  water: 0.35,
};

const SURFACE_EFFORT: Record<Surface, number> = {
  trail: 0,
  forest: 0.55,
  meadow: 0.4,
  scree: 0.95,
  rock: 1.2,
  snow: 0.6,
  water: 2,
};

const tmpCols: { x: number; z: number; r: number }[] = [];

export function stepPlayer(p: PlayerState, l: Loadout, intent: MoveIntent, dt: number, emit: (e: GameEvent) => void) {
  if (p.summited) {
    p.activity = 'summit';
    p.speed = lerp(p.speed, 0, 1 - Math.exp(-dt * 6));
    return;
  }
  dt = Math.min(dt, 0.1);
  p.realTime += dt;
  p.gameTime += dt * TIME_SCALE;
  const hour = clockHour(p, l);
  const light = daylight(hour);
  const soft = snowSoftness(hour);

  // ---- terrain under the player
  const here = surfaceAt(p.x, p.z);
  p.surface = here.surface;
  p.onTrail = here.onTrail;
  p.snow = here.snow;

  // ---- desired movement
  let mag = Math.min(1, Math.hypot(intent.x, intent.z));
  if (mag < 0.08) mag = 0;
  const dirx = mag ? intent.x / Math.hypot(intent.x, intent.z) : 0;
  const dirz = mag ? intent.z / Math.hypot(intent.x, intent.z) : 0;
  if (mag > 0) p.resting = false;
  const wantsJog = intent.jog && mag > 0.6 && !p.exhausted;

  const { gx, gz } = gradientAt(p.x, p.z);
  const grade = mag ? gx * dirx + gz * dirz : 0; // rise per unit along travel direction
  p.grade = grade;

  // ---- speed model
  let factor = SURFACE_SPEED[p.surface];
  const deepSnow = p.surface === 'snow' || (p.onTrail && here.snow > 0.5);
  p.postholing = false;
  if (p.surface === 'snow') {
    // Postholing off the boot track; worse when the snow is soft.
    const post = lerp(0.62, 0.36, soft);
    factor = post * (l.spikes ? 1.08 : 1);
    p.postholing = true;
  } else if (p.onTrail && here.snow > 0.5) {
    factor = lerp(0.9, 0.72, soft) * (l.spikes ? 1.1 : 0.82);
  }
  if (grade > 0) factor *= clamp(1 - grade * 0.85, 0.18, 1);
  else if (grade < -0.12) {
    const steep = -grade - 0.12;
    factor *= clamp(1 + 0.25 * Math.min(steep, 0.2) - Math.max(0, steep - 0.35) * 0.9, 0.35, 1.08) * (l.poles ? 1.06 : 1);
  }
  const kg = packWeight(l, p.water, p.food);
  factor *= clamp(1 - Math.max(0, kg - 9) * 0.012, 0.75, 1);
  // Darkness without a headlamp makes route-finding slow.
  if (light < 0.35 && !l.headlamp) factor *= p.onTrail ? 0.85 : 0.7;
  if (p.hydration < 15) factor *= 0.85;

  let target = 0;
  if (mag > 0) {
    target = (wantsJog ? JOG_SPEED : WALK_SPEED) * factor * (wantsJog ? 1 : mag);
    if (p.exhausted) target = Math.min(target, WALK_SPEED * 0.5 * factor);
  }
  p.speedFactor = factor;
  const accel = target > p.speed ? 5 : 8;
  p.speed = lerp(p.speed, target, 1 - Math.exp(-dt * accel));
  if (target === 0 && p.speed < 0.05) p.speed = 0;

  // velocity follows desired direction (heading turns smoothly)
  if (mag > 0) {
    const want = Math.atan2(dirx, dirz);
    let d = want - p.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.heading += d * (1 - Math.exp(-dt * 10));
  }
  const mvx = Math.sin(p.heading) * p.speed;
  const mvz = Math.cos(p.heading) * p.speed;
  let nx = p.x + mvx * dt;
  let nz = p.z + mvz * dt;

  // ---- collisions (tree trunks, boulders, cairns)
  tmpCols.length = 0;
  const cols = collidersNear(nx, nz);
  for (const c of cols) {
    const dx = nx - c.x;
    const dz = nz - c.z;
    const rr = c.r + 0.35;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      nx = c.x + (dx / d) * rr;
      nz = c.z + (dz / d) * rr;
    }
  }
  // Tarn: wading is slow; can't go deep.
  const dl = Math.hypot(nx - LAKE.x, nz - LAKE.z);
  if (dl < LAKE.r - 6) {
    nx = LAKE.x + ((nx - LAKE.x) / dl) * (LAKE.r - 6);
    nz = LAKE.z + ((nz - LAKE.z) / dl) * (LAKE.r - 6);
  }
  // Wilderness boundary
  const rr = Math.hypot(nx, nz);
  if (rr > BOUNDARY_R) {
    nx *= BOUNDARY_R / rr;
    nz *= BOUNDARY_R / rr;
    if (p.realTime - p.boundaryWarn > 4) {
      p.boundaryWarn = p.realTime;
      emit({ type: 'toast', text: 'Wilderness boundary — the route lies uphill.', tone: 'warn' });
    }
  }

  const moved = Math.hypot(nx - p.x, nz - p.z);
  p.vx = (nx - p.x) / dt;
  p.vz = (nz - p.z) / dt;
  p.x = nx;
  p.z = nz;
  const ny = heightAt(nx, nz);
  if (ny > p.lastY) p.elevGain += ny - p.lastY;
  p.lastY = ny;
  p.y = ny;
  p.maxY = Math.max(p.maxY, ny);
  p.distance += moved;
  const moving = moved / dt > 0.2;
  if (moving) {
    p.timeMoving += dt;
    if (p.onTrail) p.timeOnTrail += dt;
  }
  const actualSpeed = moved / dt;
  p.phase += dt * (actualSpeed * (wantsJog ? 1.05 : 1.55) + 0.0);

  // ---- stamina model
  const elevFt = elevationFt(p.y);
  let effort = 0;
  if (moving) {
    effort += wantsJog ? 3.0 : 0.45;
    const up = Math.max(grade, 0);
    effort += up * (wantsJog ? 10 : 6.2) * (l.poles ? 0.85 : 1);
    if (grade < -0.4) effort += (-grade - 0.4) * 2.5 * (l.poles ? 0.7 : 1);
    effort += SURFACE_EFFORT[p.surface] * (p.onTrail ? 0 : 1);
    if (p.surface === 'snow') effort += lerp(1.2, 2.6, soft) * (l.spikes ? 0.75 : 1);
    else if (deepSnow) effort += lerp(0.2, 0.7, soft) * (l.spikes ? 0.6 : 1);
    effort *= 1 + Math.max(0, kg - 8) * 0.035;
    if (elevFt > 9000) effort *= 1.15; // thin air
  }
  const cold = (elevFt > 9000 || hour < 7) && !l.insulated;
  if (cold) effort += 0.35;
  if (p.hydration < 25) effort *= 1.35;

  let recover = 0;
  if (p.resting) recover = 13;
  else if (!moving) recover = 6;
  else if (!wantsJog) recover = 1.6 * (1 - Math.max(grade, 0) * 1.2);
  if (p.hydration < 25) recover *= 0.6;
  if (cold) recover *= 0.8;
  p.effort = effort;
  p.stamina = clamp(p.stamina + (recover - effort) * dt, 0, p.maxStamina);
  if (p.stamina <= 0.01 && !p.exhausted) {
    p.exhausted = true;
    p.resting = false;
    emit({ type: 'exhausted' });
  }
  if (p.exhausted && p.stamina > Math.min(35, p.maxStamina * 0.5)) {
    p.exhausted = false;
    emit({ type: 'toast', text: 'You have caught your breath.', tone: 'good' });
  }

  // Energy reserves: max stamina drains with calories burned.
  p.maxStamina = clamp(p.maxStamina - dt * (moving ? 0.045 + effort * 0.017 : 0.008), 30, 100);
  // Hydration
  const heat = 1 + 0.4 * smoothstep(10, 14, hour) * (elevFt < 9500 ? 1 : 0.5);
  p.hydration = clamp(p.hydration - dt * (0.07 + effort * 0.026) * heat, 0, 100);

  // ---- activity for animation
  if (p.resting) p.activity = 'rest';
  else if (p.exhausted && !moving) p.activity = 'exhausted';
  else if (moving) p.activity = wantsJog && actualSpeed > WALK_SPEED * 0.8 ? 'jog' : 'walk';
  else p.activity = 'idle';

  // ---- checkpoints
  const W = getWorld();
  for (const cp of W.checkpoints) {
    if (cp.id === 'summit' || p.checkpoints[cp.id] !== undefined) continue;
    // Reached by walking through it, or by bypassing it higher up the route (shortcuts).
    const progressed = W.main.length - p.remaining > cp.s + 20 && p.y > heightAt(cp.x, cp.z) + 4;
    if (Math.hypot(p.x - cp.x, p.z - cp.z) < cp.radius || progressed) {
      p.checkpoints[cp.id] = p.gameTime;
      emit({ type: 'checkpoint', id: cp.id, name: cp.name });
    }
  }
  p.nearWater = Math.hypot(p.x - LAKE.x, p.z - LAKE.z) < LAKE.r + 7;
  p.remaining = remainingToSummit(p.x, p.z);
}

export function nearSummit(p: PlayerState) {
  const s = getWorld().summit;
  return Math.hypot(p.x - s.x, p.z - s.z) < 6;
}

export type ActionResult = { ok: boolean; text: string };

export function eat(p: PlayerState): ActionResult {
  if (p.food <= 0) return { ok: false, text: 'No food left in your pack.' };
  p.food -= 1;
  p.maxStamina = Math.min(100, p.maxStamina + 28);
  p.stamina = Math.min(p.maxStamina, p.stamina + 22);
  return { ok: true, text: 'Ate a trail bar  +energy' };
}

export function drink(p: PlayerState): ActionResult {
  if (p.water < 0.05) return { ok: false, text: p.nearWater ? 'Bottles empty — press Space to filter water.' : 'Water bottles are empty.' };
  if (p.hydration > 97) return { ok: false, text: 'You are not thirsty.' };
  const amt = Math.min(WATER_PER_DRINK, p.water);
  p.water = Math.max(0, p.water - amt);
  p.hydration = Math.min(100, p.hydration + 34 * (amt / WATER_PER_DRINK));
  p.stamina = Math.min(p.maxStamina, p.stamina + 6);
  return { ok: true, text: `Drank ${amt.toFixed(1)} L  +hydration` };
}

export function refill(p: PlayerState, l: Loadout): ActionResult {
  const cap = Math.max(l.waterL, 1);
  if (p.water >= cap - 0.01) return { ok: false, text: 'Bottles already full.' };
  p.water = cap;
  return { ok: true, text: `Filtered water from Obsidian Tarn — ${cap.toFixed(1)} L` };
}

export function toggleRest(p: PlayerState): ActionResult {
  if (p.speed > 0.6) return { ok: false, text: 'Stop moving to rest.' };
  p.resting = !p.resting;
  return { ok: true, text: p.resting ? 'Resting… (move to continue)' : 'Back on your feet.' };
}

export function rating(p: PlayerState, l: Loadout) {
  const hours = p.gameTime / 3600;
  const trailPct = p.timeMoving > 0 ? p.timeOnTrail / p.timeMoving : 1;
  const finish = clockHour(p, l);
  let title = 'Hard-won Summit';
  if (hours < 5.2 && trailPct > 0.7) title = 'Alpine Ace';
  else if (hours < 6.5) title = 'Steady Mountaineer';
  if (finish > 15) title = 'Afternoon Summiter';
  return { title, hours, trailPct, finish };
}
