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
  /** how far tier edges hang down (0–1) */
  droop: number;
  /** ragged tier edges and offsets (0–1) */
  irregularity: number;
  /** facets around each tier (5–8) */
  sides: number;
  /** bare trunk below the crown, fraction of height */
  trunkHeight: number;
  /** top bends over like a hemlock leader (0–1) */
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
  const sides = far ? Math.max(5, s.sides - 2) : s.sides;
  const tiers = far ? Math.max(3, Math.round(s.tiers * 0.6)) : s.tiers;
  const crown0 = s.trunkHeight * H;
  const lo = col(s.foliage[0]);
  const hi = col(s.foliage[1]);
  const bark = col(s.bark);
  // Trunk (visible below the crown; continues inside it).
  const trunk = new THREE.CylinderGeometry(0.035 * H * 0.7, 0.05 * H, H * 0.9, 6, 1, true).translate(0, H * 0.45, 0);
  parts.push(paintFaces(trunk, rand, (c, _n, out) => out.copy(bark).multiplyScalar(groundAO(c.y, 0, 1.2, 0.6)), 0.08));
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1); // 0 bottom tier … 1 top
    const yBase = crown0 + (H - crown0) * Math.pow(t, 0.92) * 0.86;
    const r = Math.max(0.05 * H, s.width * H * Math.pow(1 - t * 0.88, s.taper) * (0.85 + rand() * 0.3 * s.irregularity + 0.15));
    const h = (H - crown0) / tiers * 2.1 + r * 0.25;
    const ox = (rand() - 0.5) * s.irregularity * r * 0.25;
    const oz = (rand() - 0.5) * s.irregularity * r * 0.25;
    const twist = rand() * Math.PI * 2;
    // Rim (drooping, ragged), a shoulder ring, the apex. Built as a fan of quads + triangles.
    const rim: THREE.Vector3[] = [];
    const mid: THREE.Vector3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = twist + (k / sides) * Math.PI * 2;
      const rr = r * (1 + (rand() - 0.5) * 0.45 * s.irregularity);
      const droop = s.droop * r * (0.25 + rand() * 0.35);
      rim.push(new THREE.Vector3(ox + Math.sin(a) * rr, yBase - droop, oz + Math.cos(a) * rr));
      const am = a + Math.PI / sides;
      mid.push(new THREE.Vector3(ox + Math.sin(am) * r * 0.55, yBase + h * 0.38, oz + Math.cos(am) * r * 0.55));
    }
    let apex = new THREE.Vector3(ox * 0.5, yBase + h, oz * 0.5);
    if (i === tiers - 1 && s.leaderBend > 0) apex = apex.add(new THREE.Vector3(Math.sin(twist) * h * 0.35 * s.leaderBend, -h * 0.12 * s.leaderBend, Math.cos(twist) * h * 0.35 * s.leaderBend));
    const under = new THREE.Vector3(ox, yBase + h * 0.12, oz);
    const pos: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let k = 0; k < sides; k++) {
      const a0 = rim[k];
      const a1 = rim[(k + 1) % sides];
      const m0 = mid[k];
      const mPrev = mid[(k + sides - 1) % sides];
      tri(a0, a1, m0);
      tri(a0, m0, mPrev);
      tri(m0, mid[(k + 1) % sides], apex);
      tri(a1, a0, under); // underside, seen from below
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const tierShade = 0.68 + t * 0.32;
    parts.push(
      paintFaces(g, rand, (c, n, out) => {
        out.copy(lo).lerp(hi, clamp01((c.y - crown0) / (H - crown0)));
        out.multiplyScalar(tierShade * (n.y < -0.2 ? 0.55 : 1));
        if (s.snow > 0 && n.y > 0.35) out.lerp(n.y > 0.7 ? SNOW : SNOW_SHADE, s.snow * smooth(0.35, 0.8, n.y));
      }),
    );
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
