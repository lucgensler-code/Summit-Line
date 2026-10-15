// Headless playtest: drives the real gameplay simulation with simple bots to verify the summit is
// reachable on foot and that route choice / loadout materially change the outcome.
// Run with: npm run test:sim

import { getWorld, unitsToMiles, elevationFt } from '../src/game/world';
import {
  DEFAULT_LOADOUT,
  createPlayer,
  drink,
  eat,
  nearSummit,
  stepPlayer,
  toggleRest,
  type GameEvent,
  type Loadout,
} from '../src/game/sim';

type Strategy = 'trail' | 'direct' | 'gems' | 'smart';

function run(name: string, strategy: Strategy, loadout: Loadout, jog = false) {
  const W = getWorld();
  const p = createPlayer(loadout);
  const events: string[] = [];
  const emit = (e: GameEvent) => {
    if (e.type === 'checkpoint') events.push(`${e.name}@${(p.realTime / 60).toFixed(1)}m`);
    if (e.type === 'gem') events.push(`${e.kind} gem@${(p.realTime / 60).toFixed(1)}m`);
    if (e.type === 'exhausted') events.push(`EXHAUSTED@${(p.realTime / 60).toFixed(1)}m`);
  };
  const dt = 1 / 30;
  let idx = 0;
  let exhaustions = 0;
  let stuckTimer = 0;
  let lastD = 0;
  let lastDrink = -99;
  while (p.realTime < 60 * 60) {
    if (nearSummit(p)) break;
    // housekeeping
    if (strategy === 'smart') {
      // Efficient player: eat/drink on the move before trouble, never stop if avoidable.
      if (p.maxStamina < 72 && p.food > 0) eat(p);
      if ((p.hydration < 60 || p.stamina < 30) && p.water > 0 && p.realTime - lastDrink > 6) {
        if (drink(p).ok) lastDrink = p.realTime;
      }
    }
    if (p.maxStamina < 62 && p.food > 0) eat(p);
    if (p.hydration < 45 && p.water > 0) drink(p);
    if (p.stamina < 12 && !p.resting && p.speed < 0.6) toggleRest(p);
    if (p.resting) {
      if (p.stamina > p.maxStamina * 0.9) p.resting = false;
      stepPlayer(p, loadout, { x: 0, z: 0, jog: false }, dt, emit);
      continue;
    }
    if (p.stamina < 12 && p.speed > 0.6) {
      stepPlayer(p, loadout, { x: 0, z: 0, jog: false }, dt, emit);
      continue;
    }
    let tx: number;
    let tz: number;
    const gemR = strategy === 'smart' ? 14 : 130;
    const gem = strategy === 'gems' || strategy === 'smart' ? W.gems.find((g) => !p.gems[g.id] && Math.hypot(g.x - p.x, g.z - p.z) < gemR) : undefined;
    if (gem) {
      tx = gem.x;
      tz = gem.z;
      // resume the trail from the nearest point after detouring
      let best = idx;
      for (let k = idx; k < Math.min(idx + 120, W.main.pts.length); k++)
        if (Math.hypot(W.main.pts[k].x - gem.x, W.main.pts[k].z - gem.z) < Math.hypot(W.main.pts[best].x - gem.x, W.main.pts[best].z - gem.z)) best = k;
      idx = Math.max(idx, best);
    } else if (strategy === 'trail' || strategy === 'gems' || strategy === 'smart') {
      const pts = W.main.pts;
      while (idx < pts.length - 1 && Math.hypot(pts[idx].x - p.x, pts[idx].z - p.z) < 3.5) idx++;
      tx = pts[idx].x;
      tz = pts[idx].z;
    } else {
      // beeline at the crater rim then follow rim
      const cpRim = W.checkpoints.find((c) => c.id === 'rim')!;
      if (p.checkpoints.rim === undefined) {
        tx = cpRim.x;
        tz = cpRim.z;
      } else {
        tx = W.summit.x;
        tz = W.summit.z;
      }
    }
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const smartJog = strategy === 'smart' && p.stamina > 35 && (p.grade < 0.12 || p.realTime < p.boostUntil);
    stepPlayer(p, loadout, { x: dx / d, z: dz / d, jog: smartJog || (jog && p.stamina > 40) }, dt, emit);
    if (p.exhausted) exhaustions++;
    stuckTimer += dt;
    if (stuckTimer > 30) {
      if (Math.abs(p.distance - lastD) < 5) {
        events.push('STUCK');
        break;
      }
      lastD = p.distance;
      stuckTimer = 0;
    }
  }
  const ok = nearSummit(p);
  console.log(
    `${name.padEnd(28)} ${ok ? 'SUMMIT' : 'FAILED'}  real ${(p.realTime / 60).toFixed(1)} min  ` +
      `game ${(p.gameTime / 3600).toFixed(2)} h  dist ${unitsToMiles(p.distance).toFixed(2)} mi  ` +
      `elev ${elevationFt(p.y).toFixed(0)} ft  stam ${p.stamina.toFixed(0)}/${p.maxStamina.toFixed(0)}  ` +
      `hyd ${p.hydration.toFixed(0)}  water ${p.water.toFixed(1)}  food ${p.food}  ` +
      `onTrail ${((p.timeOnTrail / Math.max(p.timeMoving, 1)) * 100).toFixed(0)}%  gems ${p.gemCounts.green}g/${p.gemCounts.red}r  exh ${p.exhaustions}  gain ${Math.round(p.elevGain * W.ftPerUnit)}ft`,
  );
  console.log('   ', events.join(', '));
  return ok;
}

const t0 = performance.now();
getWorld();
console.log(`world built in ${(performance.now() - t0).toFixed(0)} ms`);
const results = [
  run('trail, default kit', 'trail', DEFAULT_LOADOUT),
  run('trail, jogging', 'trail', DEFAULT_LOADOUT, true),
  run('trail, heavy pack late', 'trail', { ...DEFAULT_LOADOUT, waterL: 4, food: 8, departureHour: 10 }),
  run('trail, no spikes/poles', 'trail', { ...DEFAULT_LOADOUT, poles: false, spikes: false }),
  run('direct off-trail', 'direct', DEFAULT_LOADOUT),
  run('trail + gem hunting', 'gems', DEFAULT_LOADOUT, true),
  run('efficient player', 'smart', DEFAULT_LOADOUT),
];
if (!results[0]) {
  console.error('Default trail ascent failed to reach the summit');
  process.exit(1);
}
