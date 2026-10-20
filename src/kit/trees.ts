// Scenery kit — trees. One generator, three forms (tiered conifer, wind-shaped pine, dead snag),
// each driven by a plain settings object. Species are just named settings (see the recipe).
import * as THREE from 'three';
import { clamp01, col, groundAO, limb, mergeParts, mulberry32, paintFaces, smooth } from './core';

export interface TreeSettings {
  /** 'conifer' = stacked branch tiers; 'pine' = wind-shaped clumps on leaning stems; 'snag' = dead */
  form: 'conifer' | 'pine' | 'snag';
  /** total height in metres before instance scaling */
  height: number;
  /** branch tiers from the bottom of the crown to the top (conifer) */
  tiers: number;
  /** radius of the lowest tier as a fraction of height */
  width: number;
  /** how quickly tiers narrow toward the top (1 = straight cone, > 1 = narrow spire) */
  taper: number;
  /** how far branch tips hang down (0–1); negative turns them up (fir) */
  droop: number;
  /** ragged tier edges and offsets (0–1) */
  irregularity: number;
  /** branch tips around each tier (4–8) */
  sides: number;
  /** bare trunk below the crown, fraction of height */
  trunkHeight: number;
  /** top bends over like a hemlock leader (0–1). Applied to one variant only (see catalogue) */
  leaderBend: number;
  /** foliage colour at the bottom and top of the crown */
  foliage: [string, string];
  bark: string;
  /** snow lying on the upward-facing branches (0–1) */
  snow: number;
}

const SNOW = col('#eef2f8');
const SNOW_SHADE = col('#c3cbe2');

function conifer(s: TreeSettings, seed: number, far: boolean) {
  const rand = mulberry32(seed);
  const H = s.height;
  const parts: THREE.BufferGeometry[] = [];
  const crown0 = s.trunkHeight * H;
  const lo = col(s.foliage[0]);
  const hi = col(s.foliage[1]);
  const bark = col(s.bark);
  // Trunk (visible below the crown; continues inside it).
  // Trunk: tapers to a point inside the crown so it never pokes through a narrow top.
  const trunk = new THREE.CylinderGeometry(0.004 * H, 0.05 * H, H * 0.72, far ? 4 : 6, 1, true).translate(0, H * 0.36, 0);
  parts.push(paintFaces(trunk, rand, (c, _n, out) => out.copy(bark).multiplyScalar(groundAO(c.y, 0, 1.2, 0.6)), 0.08));
  const radiusAt = (t: number) => Math.max(0.05 * H, s.width * H * Math.pow(1 - t * 0.88, s.taper));
  const paint = (tierShade: number) => (c: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => {
    out.copy(lo).lerp(hi, clamp01((c.y - crown0) / (H - crown0)));
    // branch tips catch more light than the inner crown
    const reach = Math.hypot(c.x, c.z) / Math.max(0.2, radiusAt(clamp01((c.y - crown0) / (H - crown0))));
    out.multiplyScalar(tierShade * (0.86 + 0.22 * clamp01(reach)) * (n.y < -0.2 ? 0.55 : 1));
    if (s.snow > 0 && n.y > 0.35) out.lerp(n.y > 0.7 ? SNOW : SNOW_SHADE, s.snow * smooth(0.35, 0.8, n.y));
  };

  if (far) {
    // Distance version (v0.8): two plain faceted tiers that follow the near tree's outline —
    // not stretched, no bent leader — so far trees keep a natural tip instead of a needle.
    const sides = 5;
    const tiers: [number, number, number][] = [
      // [base t, top t, radius t]
      [0, 0.66, 0],
      [0.38, 1, 0.4],
    ];
    for (const [tb, tt, tr] of tiers) {
      const yBase = crown0 + (H - crown0) * tb - Math.max(0, s.droop) * radiusAt(tr) * 0.3;
      const yTop = crown0 + (H - crown0) * tt;
      // the star-shaped near tiers read about this wide on average
      const r = radiusAt(tr) * 0.84;
      const pos: number[] = [];
      const twist = rand() * Math.PI * 2;
      for (let k = 0; k < sides; k++) {
        const a0 = twist + (k / sides) * Math.PI * 2;
        const a1 = twist + ((k + 1) / sides) * Math.PI * 2;
        pos.push(Math.sin(a0) * r, yBase, Math.cos(a0) * r, Math.sin(a1) * r, yBase, Math.cos(a1) * r, 0, yTop, 0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      parts.push(paintFaces(g, rand, paint(0.78 + tt * 0.2)));
    }
    return mergeParts(parts);
  }

  // Near version: stacked whorls. Each tier's edge is a star of branch tips and notches, so the
  // silhouette reads as branches; tips droop (hemlock) or turn up (fir) with `droop`.
  const n = Math.max(4, Math.min(8, s.sides));
  const tiers = s.tiers;
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1); // 0 bottom tier … 1 top
    const yBase = crown0 + (H - crown0) * Math.pow(t, 0.92) * 0.86;
    const r = radiusAt(t) * (0.9 + rand() * 0.2 * s.irregularity + 0.05);
    const h = ((H - crown0) / tiers) * 2.1 + r * 0.25;
    const ox = (rand() - 0.5) * s.irregularity * r * 0.2;
    const oz = (rand() - 0.5) * s.irregularity * r * 0.2;
    const twist = rand() * Math.PI * 2;
    const tips: THREE.Vector3[] = [];
    const notches: THREE.Vector3[] = [];
    const shoulder: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      const a = twist + (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.35 * s.irregularity;
      const rr = r * (1 + (rand() - 0.5) * 0.4 * s.irregularity);
      // positive droop hangs the tips down; negative turns them up
      const tipY = yBase - s.droop * r * (0.3 + rand() * 0.3);
      tips.push(new THREE.Vector3(ox + Math.sin(a) * rr, tipY, oz + Math.cos(a) * rr));
      const an = a + Math.PI / n;
      notches.push(new THREE.Vector3(ox + Math.sin(an) * r * 0.72, yBase + h * 0.12, oz + Math.cos(an) * r * 0.72));
      shoulder.push(new THREE.Vector3(ox + Math.sin(a) * r * 0.52, yBase + h * 0.45, oz + Math.cos(a) * r * 0.52));
    }
    let apex = new THREE.Vector3(ox * 0.5, yBase + h, oz * 0.5);
    if (i === tiers - 1 && s.leaderBend > 0) {
      // nodding leader: always bends toward local +x so instances can share one wind direction
      apex = apex.add(new THREE.Vector3(h * 0.38 * s.leaderBend, -h * 0.14 * s.leaderBend, 0));
    }
    const under = new THREE.Vector3(ox, yBase + h * 0.12, oz);
    const pos: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      tri(tips[k], notches[k], shoulder[k]);
      tri(notches[k], shoulder[k1], shoulder[k]);
      tri(notches[k], tips[k1], shoulder[k1]);
      tri(shoulder[k], shoulder[k1], apex);
      if (i < 2) {
        tri(notches[k], tips[k], under); // underside of the low tiers, seen from below
        tri(tips[k1], notches[k], under);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    parts.push(paintFaces(g, rand, paint(0.68 + t * 0.32)));
  }
  return mergeParts(parts);
}

function pine(s: TreeSettings, seed: number, far: boolean) {
  const rand = mulberry32(seed);
  const H = s.height;
  const parts: THREE.BufferGeometry[] = [];
  const bark = col(s.bark);
  const lo = col(s.foliage[0]);
  const hi = col(s.foliage[1]);
  const stems = 2 + Math.floor(rand() * 2);
  const base = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < stems; i++) {
    const a = rand() * Math.PI * 2;
    const lean = 0.18 + rand() * 0.3;
    const top = new THREE.Vector3(Math.sin(a) * H * lean, H * (0.7 + rand() * 0.3), Math.cos(a) * H * lean);
    parts.push(paintFaces(limb(base, top, H * 0.05, H * 0.022, far ? 4 : 5), rand, (c, _n, out) => out.copy(bark).multiplyScalar(groundAO(c.y, 0, 1, 0.6)), 0.08));
    // Foliage clumps along the upper stem, flattened by wind.
    const clumps = far ? 2 : 3 + Math.floor(rand() * 2);
    for (let k = 0; k < clumps; k++) {
      const f = 0.45 + (k / clumps) * 0.55;
      const p = base.clone().lerp(top, f);
      const r = H * (0.2 + rand() * 0.12) * (1.1 - f * 0.4);
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.scale(1.25 + rand() * 0.4, 0.55 + rand() * 0.2, 1.1 + rand() * 0.3).rotateY(rand() * 3).translate(p.x + (rand() - 0.5) * r, p.y, p.z + (rand() - 0.5) * r);
      parts.push(
        paintFaces(g, rand, (c, n, out) => {
          out.copy(lo).lerp(hi, clamp01(c.y / H)).multiplyScalar(n.y < -0.2 ? 0.6 : 0.85 + n.y * 0.15);
          if (s.snow > 0 && n.y > 0.4) out.lerp(SNOW, s.snow * smooth(0.4, 0.85, n.y));
        }, 0.08),
      );
    }
  }
  return mergeParts(parts);
}

function snag(s: TreeSettings, seed: number, far: boolean) {
  const rand = mulberry32(seed);
  const H = s.height;
  const bark = col(s.bark);
  const parts: THREE.BufferGeometry[] = [];
  const lean = new THREE.Vector3((rand() - 0.5) * 0.12 * H, H, (rand() - 0.5) * 0.12 * H);
  const trunk = limb(new THREE.Vector3(0, -0.2, 0), lean, H * 0.045, H * 0.012, far ? 5 : 6);
  parts.push(paintFaces(trunk, rand, (c, _n, out) => out.copy(bark).multiplyScalar(0.75 + 0.35 * clamp01(c.y / H)), 0.1));
  if (!far) {
    const stubs = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < stubs; i++) {
      const f = 0.35 + rand() * 0.55;
      const p = new THREE.Vector3(0, -0.2, 0).lerp(lean, f);
      const a = rand() * Math.PI * 2;
      const len = H * (0.06 + rand() * 0.14) * (1.2 - f);
      const e = p.clone().add(new THREE.Vector3(Math.sin(a) * len, -len * 0.2 + rand() * len * 0.3, Math.cos(a) * len));
      parts.push(paintFaces(limb(p, e, H * 0.012, H * 0.004, 4), rand, (_c, _n, out) => out.copy(bark).multiplyScalar(0.9), 0.1));
    }
  }
  return mergeParts(parts);
}

/** Build one tree variant. `far` is the simpler distance version (fewer facets and parts). */
export function treeGeometry(s: TreeSettings, seed: number, far = false) {
  if (s.form === 'pine') return pine(s, seed, far);
  if (s.form === 'snag') return snag(s, seed, far);
  return conifer(s, seed, far);
}
