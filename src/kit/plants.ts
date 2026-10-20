// Scenery kit — ground cover. Grass tufts, wildflowers, heather, huckleberry, ferns, beargrass and
// cushion plants, each from a small settings object. Built from blades, fronds and leaf clusters
// (not mounds), double-sided, with darker bases and lighter tips.
import * as THREE from 'three';
import { clamp01, col, limb, mergeParts, mulberry32, paintFaces, type Rand } from './core';

export interface GrassSettings {
  blades: number;
  height: number;
  /** how far blades arch outward (0–1) */
  spread: number;
  width: number;
  base: string;
  tip: string;
  /** dry straw blades mixed in (0–1) */
  dry: number;
}

export interface FlowerSettings {
  grass: GrassSettings;
  /** flower stalks per patch */
  stalks: number;
  /** 'spike' = lupine, 'brush' = paintbrush, 'daisy' = aster/daisy, 'club' = beargrass plume */
  head: 'spike' | 'brush' | 'daisy' | 'club';
  colors: string[];
  stalkHeight: number;
}

export interface ShrubSettings {
  /** 'heather' = low needle mat with pink bells; 'huckleberry' = airy twig shrub;
   *  'cushion' = tight alpine cushion with tiny flowers */
  form: 'heather' | 'huckleberry' | 'cushion';
  size: number;
  leaf: [string, string];
  accent: string;
  /** accent amount (flowers / red autumn leaves) 0–1 */
  accentAmount: number;
}

export interface FernSettings {
  fronds: number;
  length: number;
  arch: number;
  color: [string, string];
}

function blade(rand: Rand, s: GrassSettings, a: number, pos: number[]) {
  const h = s.height * (0.6 + rand() * 0.6);
  const out = s.spread * (0.3 + rand() * 0.7) * h;
  const w = s.width * (0.7 + rand() * 0.6);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // across-blade direction
  const px = ca;
  const pz = -sa;
  const P = (t: number, side: number) => {
    const r = out * t * t;
    const y = h * t - out * 0.3 * t * t * t;
    const ww = w * (1 - t) * side;
    return [sa * r + px * ww, y, ca * r + pz * ww];
  };
  const b0 = P(0, -1);
  const b1 = P(0, 1);
  const m0 = P(0.55, -1);
  const m1 = P(0.55, 1);
  const tip = P(1, 0);
  pos.push(...b0, ...b1, ...m0, ...m0, ...b1, ...m1, ...m0, ...m1, ...tip);
}

export function grassGeometry(s: GrassSettings, seed: number) {
  const rand = mulberry32(seed);
  const pos: number[] = [];
  for (let i = 0; i < s.blades; i++) blade(rand, s, (i / s.blades) * Math.PI * 2 + rand() * 0.6, pos);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const base = col(s.base);
  const tip = col(s.tip);
  const dry = col('#b7a46a');
  let face = 0;
  let isDry = false;
  return paintFaces(
    g,
    rand,
    (c, _n, out) => {
      if (face++ % 3 === 0) isDry = rand() < s.dry;
      out.copy(base).lerp(isDry ? dry : tip, clamp01(c.y / s.height));
    },
    0.05,
  );
}

function head(kind: FlowerSettings['head'], p: THREE.Vector3, size: number, rand: Rand) {
  if (kind === 'spike') return new THREE.ConeGeometry(size * 0.35, size * 1.8, 5).translate(p.x, p.y + size * 0.9, p.z);
  if (kind === 'club') return new THREE.IcosahedronGeometry(size * 0.5, 0).scale(0.8, 1.8, 0.8).translate(p.x, p.y + size * 0.7, p.z);
  if (kind === 'daisy') return new THREE.CylinderGeometry(size * 0.45, size * 0.3, size * 0.12, 7).rotateZ((rand() - 0.5) * 0.4).translate(p.x, p.y, p.z);
  return new THREE.IcosahedronGeometry(size * 0.32, 0).scale(1, 1.5, 1).translate(p.x, p.y + size * 0.3, p.z);
}

export function flowerGeometry(s: FlowerSettings, seed: number) {
  const rand = mulberry32(seed);
  const parts = [grassGeometry(s.grass, seed)];
  const colors = s.colors.map(col);
  const stem = col(s.grass.base);
  for (let i = 0; i < s.stalks; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * s.grass.height * 0.5;
    const h = s.stalkHeight * (0.7 + rand() * 0.5);
    const p0 = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
    const p1 = p0.clone().add(new THREE.Vector3((rand() - 0.5) * 0.1, h, (rand() - 0.5) * 0.1));
    parts.push(paintFaces(limb(p0, p1, 0.015, 0.01, 3), rand, (_c, _n, out) => out.copy(stem)));
    const flowerCol = colors[Math.floor(rand() * colors.length)];
    parts.push(paintFaces(head(s.head, p1, s.stalkHeight * 0.18, rand), rand, (c, _n, out) => out.copy(flowerCol).multiplyScalar(0.8 + 0.2 * clamp01((c.y - p1.y) / 0.2 + 0.5)), 0.08));
  }
  return mergeParts(parts);
}

export function shrubGeometry(s: ShrubSettings, seed: number) {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const lo = col(s.leaf[0]);
  const hi = col(s.leaf[1]);
  const accent = col(s.accent);
  const leafPaint = (h: number) => (c: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => {
    out.copy(lo).lerp(hi, clamp01(c.y / h)).multiplyScalar(n.y < -0.2 ? 0.65 : 1);
    if (rand() < s.accentAmount * 0.5) out.lerp(accent, 0.75);
  };
  if (s.form === 'huckleberry') {
    // Airy shrub: twigs fanning up with small leaf clusters along them.
    const twigs = 6 + Math.floor(rand() * 3);
    for (let i = 0; i < twigs; i++) {
      const a = rand() * Math.PI * 2;
      const lean = 0.25 + rand() * 0.45;
      const top = new THREE.Vector3(Math.sin(a) * s.size * lean, s.size * (0.6 + rand() * 0.4), Math.cos(a) * s.size * lean);
      parts.push(paintFaces(limb(new THREE.Vector3(0, 0, 0), top, 0.025, 0.012, 3), rand, (_c, _n, out) => out.set('#6b3a2a')));
      for (let k = 0; k < 3; k++) {
        const p = top.clone().multiplyScalar(0.45 + k * 0.27);
        const g = new THREE.OctahedronGeometry(s.size * (0.13 + rand() * 0.06), 0).scale(1.4, 0.55, 1.1).rotateY(rand() * 3).rotateX((rand() - 0.5) * 0.6).translate(p.x, p.y, p.z);
        parts.push(paintFaces(g, rand, leafPaint(s.size), 0.1));
      }
    }
  } else if (s.form === 'heather') {
    // Low mat of needle-leaved sprigs with pink bell tips.
    const sprigs = 26 + Math.floor(rand() * 8);
    for (let i = 0; i < sprigs; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * s.size * 0.6;
      const h = s.size * (0.18 + rand() * 0.16) * (1 - (r / s.size) * 0.6);
      const g = new THREE.ConeGeometry(s.size * 0.13, h, 4).rotateZ((rand() - 0.5) * 0.5).translate(Math.sin(a) * r, h / 2, Math.cos(a) * r);
      parts.push(
        paintFaces(g, rand, (c, _n, out) => {
          out.copy(lo).lerp(hi, clamp01(c.y / (s.size * 0.4)));
          if (c.y > h * 0.55 && rand() < s.accentAmount) out.copy(accent);
        }, 0.08),
      );
    }
  } else {
    // Cushion plant: tight faceted dome with tiny flowers.
    const g = new THREE.IcosahedronGeometry(s.size * 0.5, 1).scale(1.3, 0.42, 1.15).translate(0, s.size * 0.06, 0);
    parts.push(paintFaces(g, rand, (_c, n, out) => {
      out.copy(lo).lerp(hi, clamp01(n.y));
      if (n.y > 0.4 && rand() < s.accentAmount * 0.45) out.copy(accent);
    }, 0.12));
  }
  return mergeParts(parts);
}

/** A fern: arching fronds whose leaflets alternate along the stem (saw-tooth outline). */
export function fernGeometry(s: FernSettings, seed: number) {
  const rand = mulberry32(seed);
  const pos: number[] = [];
  const SEG = 8;
  for (let f = 0; f < s.fronds; f++) {
    const a = (f / s.fronds) * Math.PI * 2 + rand() * 0.4;
    const len = s.length * (0.75 + rand() * 0.4);
    const rise = s.arch * (0.8 + rand() * 0.4);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let k = 0; k < SEG; k++) {
      const t0 = k / SEG;
      const t1 = (k + 1) / SEG;
      const P = (t: number) => [sa * t * len, Math.sin(t * Math.PI * 0.85) * rise - t * t * rise * 0.6 + 0.03, ca * t * len] as const;
      const [x0, y0, z0] = P(t0);
      const [x1, y1, z1] = P(t1);
      // leaflet: a pointed triangle each side of the stem
      const w = 0.3 * len * Math.sin(Math.PI * Math.min(1, t0 * 1.1 + 0.1)) * (1 - t0 * 0.4);
      for (const side of [-1, 1]) {
        const lx = x0 * 0.5 + x1 * 0.5 + ca * w * side;
        const lz = z0 * 0.5 + z1 * 0.5 - sa * w * side;
        pos.push(x0, y0, z0, x1, y1, z1, lx, (y0 + y1) / 2 - 0.04, lz);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lo = col(s.color[0]);
  const hi = col(s.color[1]);
  return paintFaces(g, rand, (c, _n, out) => out.copy(lo).lerp(hi, clamp01((Math.hypot(c.x, c.z) / s.length) * 1.2)), 0.08);
}
