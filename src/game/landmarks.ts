// Placed landmarks (signs, camp, summit) shared by the scene and the interaction logic.

import { LAKE, getWorld, heightAt, unitsToMiles } from './world';

export interface Landmark {
  id: string;
  kind: 'sign' | 'register' | 'kiosk';
  x: number;
  z: number;
  y: number;
  rot: number;
  /** display scale (junction signposts are larger) */
  size?: number;
  /** extra arrow board pointing this way (radians, world yaw) */
  arrow?: number;
  title: string;
  text: string;
}

let cache: Landmark[] | null = null;

function offsetFromTrail(i: number, side: number, dist: number) {
  const main = getWorld().main;
  const a = main.pts[Math.max(i - 1, 0)];
  const b = main.pts[Math.min(i + 1, main.pts.length - 1)];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  const x = main.pts[i].x - (dz / l) * side * dist;
  const z = main.pts[i].z + (dx / l) * side * dist;
  return { x, z, y: heightAt(x, z), rot: Math.atan2(dx, dz) };
}

function indexNear(x: number, z: number) {
  const main = getWorld().main;
  let best = 0;
  let bd = Infinity;
  main.pts.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export function getLandmarks(): Landmark[] {
  if (cache) return cache;
  const W = getWorld();
  const main = W.main;
  const mi = (s: number) => unitsToMiles(main.length - s).toFixed(1);
  const camp = W.checkpoints.find((c) => c.id === 'camp')!;
  const rim = W.checkpoints.find((c) => c.id === 'rim')!;
  const iCamp = indexNear(camp.x, camp.z);
  const iRim = indexNear(rim.x, rim.z);
  // Which side of the trail the tarn is on (offsetFromTrail's +side is along (−dz, dx)).
  const ta = main.pts[Math.max(iCamp - 1, 0)];
  const tb = main.pts[Math.min(iCamp + 1, main.pts.length - 1)];
  const lakeSide = Math.sign(-(tb.z - ta.z) * (LAKE.x - camp.x) + (tb.x - ta.x) * (LAKE.z - camp.z)) || 1;
  const k = offsetFromTrail(5, 1, 5.5);
  const s1 = offsetFromTrail(3, -1, 3.4);
  // v0.8: the tarn sign stands at the spur junction on the tarn's side, facing up-trail traffic;
  // the register stays across the trail.
  const c1 = offsetFromTrail(Math.max(iCamp - 3, 0), lakeSide, 3.4);
  const c2 = offsetFromTrail(iCamp + 4, -lakeSide, 3.6);
  const spurMi = Math.max(0.1, unitsToMiles(W.lines[1]?.length ?? 40)).toFixed(1);
  // the junction sign's arrow board points along the side trail toward the water
  const tarnArrow = Math.atan2(LAKE.x - c1.x, LAKE.z - c1.z);
  // Viewpoint sign beside the end of the spur, turned to face someone arriving at the shore.
  const spur = W.lines[1];
  const tarnView = (() => {
    if (!spur) return offsetFromTrail(iCamp, lakeSide, 8);
    const e = spur.pts[spur.pts.length - 1];
    const b = spur.pts[Math.max(0, spur.pts.length - 4)];
    const dx = e.x - b.x;
    const dz = e.z - b.z;
    const l = Math.hypot(dx, dz) || 1;
    const x = e.x - (dz / l) * 2.6;
    const z = e.z + (dx / l) * 2.6;
    return { x, z, y: heightAt(x, z), rot: Math.atan2(dx, dz) };
  })();
  const r1 = offsetFromTrail(iRim, -1, 3);
  cache = [
    {
      id: 'kiosk',
      kind: 'kiosk',
      ...k,
      title: 'Cindercrest Trailhead — 5,446 ft',
      text:
        'Cindercrest Climbers Trail · Summit 5.8 mi · +4,766 ft.\nNo water above Obsidian Tarn. Snow lingers above 8,700 ft — microspikes recommended. Set a turnaround time and stick to it.',
    },
    {
      id: 'th-sign',
      kind: 'sign',
      ...s1,
      title: 'Trail junction',
      text: `↑ Cindercrest Summit ${mi(main.s[3])} mi\n↑ Obsidian Tarn ${unitsToMiles(camp.s).toFixed(1)} mi`,
    },
    {
      id: 'camp-sign',
      kind: 'sign',
      ...c1,
      size: 1.45,
      arrow: tarnArrow,
      title: 'Obsidian Tarn ↗ 0.1 mi · water',
      text: `↗ Obsidian Tarn ${spurMi} mi: last reliable water. Filter here.\n↑ Summit ${mi(camp.s)} mi via the cinder switchbacks.`,
    },
    {
      // v0.8: a small viewpoint where the tarn spur meets the shore
      id: 'tarn-view',
      kind: 'sign',
      ...tarnView,
      title: 'Obsidian Tarn — 7,040 ft',
      text: `Snowmelt tarn below the cinder cone. Fill up here: there's no water above.\nThe summit is ${mi(camp.s)} mi back up the switchbacks.`,
    },
    {
      id: 'camp-register',
      kind: 'register',
      ...c2,
      title: 'Climbers register',
      text: 'You sign the register: name, party size, route, and expected return.',
    },
    {
      id: 'rim-sign',
      kind: 'sign',
      ...r1,
      title: 'Crater rim',
      text: `The true summit is the high point on the north rim — ${mi(rim.s)} mi along the crater edge. Stay back from the cornices.`,
    },
  ];
  return cache;
}
