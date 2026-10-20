// Scenery kit — rocks. One generator for everything from talus to cliff outcrops: a displaced
// icosphere chiselled by planar cuts (broad faces with defined edges), optional strata ledges and
// cracks, then painted per face — moss and lichen on top in the forest, snow caps up high.
import * as THREE from 'three';
import { clamp01, col, fbm, groundAO, mulberry32, paintFaces, smooth, welded } from './core';

export interface RockSettings {
  /** base subdivision (0 = 20 faces, 1 = 80, 2 = 320) */
  detail: 0 | 1 | 2;
  /** stretch along x / y / z */
  shape: [number, number, number];
  /** lumpy noise before chiselling (0–0.5) */
  lumpiness: number;
  /** number of planar cuts — more = more angular, defined faces */
  cuts: number;
  /** how deep the cuts bite (0–1) */
  angularity: number;
  /** horizontal strata ledges, like layered basalt (0–1) */
  ledges: number;
  /** dark crack bands across the faces (0–1) */
  cracks: number;
  /** stone colours, mixed per face */
  colors: string[];
  /** moss on upward faces (0–1) */
  moss: number;
  mossColor: string;
  /** lichen speckle on the sides (0–1) */
  lichen: number;
  lichenColor: string;
  /** snow cap on upward faces (0–1) */
  snow: number;
}

const SNOW = col('#eef1f6');
const SNOW_SHADE = col('#c6cde3');

export function rockGeometry(s: RockSettings, seed: number, far = false) {
  const rand = mulberry32(seed);
  const detail = far ? Math.max(0, s.detail - 1) : s.detail;
  const g = welded(new THREE.IcosahedronGeometry(1, detail));
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n = fbm(v.x * 1.7 + seed, v.z * 1.7 - seed, 3, seed) * s.lumpiness + fbm(v.y * 2.3 + seed, v.x * 2.3, 2, seed + 1) * s.lumpiness * 0.5;
    v.multiplyScalar(1 + n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Chisel: planar cuts press everything beyond a plane back onto it — broad flat faces.
  for (let c = 0; c < s.cuts; c++) {
    const nrm = new THREE.Vector3(rand() - 0.5, (rand() - 0.15) * 1.1, rand() - 0.5).normalize();
    const d = 0.62 - s.angularity * 0.3 + rand() * 0.18;
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const over = v.dot(nrm) - d;
      if (over > 0) v.addScaledVector(nrm, -over * (0.75 + s.angularity * 0.25));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  // Strata ledges: pull heights toward stepped layers.
  if (s.ledges > 0) {
    const step = 0.28 + rand() * 0.1;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setY(i, y + (Math.round(y / step) * step - y) * s.ledges * 0.8);
    }
  }
  // Shape and a flat base.
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i) * s.shape[1];
    if (y < -0.3 * s.shape[1]) y = -0.3 * s.shape[1] + (y + 0.3 * s.shape[1]) * 0.2;
    pos.setXYZ(i, pos.getX(i) * s.shape[0], y, pos.getZ(i) * s.shape[2]);
  }
  const stones = s.colors.map(col);
  const moss = col(s.mossColor);
  const lichen = col(s.lichenColor);
  const crackDir = new THREE.Vector3(rand() - 0.5, rand() * 0.6, rand() - 0.5).normalize();
  const crackOff = rand() * 10;
  const top = s.shape[1];
  return paintFaces(
    g,
    rand,
    (c, n, out) => {
      // v0.8: stone colour drifts smoothly across the rock (neighbouring faces stay close),
      // instead of a random colour per face.
      const tone = clamp01(fbm(c.x * 1.3 + seed * 0.37, c.z * 1.3 + c.y * 0.9, 2, seed + 9) * 0.9 + 0.5) * (stones.length - 1);
      const i0 = Math.floor(tone);
      out.copy(stones[i0]).lerp(stones[Math.min(stones.length - 1, i0 + 1)], tone - i0);
      // darker toward the ground, darker on overhangs
      out.multiplyScalar(groundAO(c.y, -0.3 * top, 0.5 * top, 0.62) * (n.y < -0.3 ? 0.75 : 1));
      if (s.cracks > 0) {
        const band = Math.abs(Math.sin(c.dot(crackDir) * 7 + crackOff));
        if (band < 0.12 * s.cracks + 0.02) out.multiplyScalar(0.62);
      }
      const up = n.y;
      // Moss and lichen in soft patches: smooth noise masks with gradual edges, so a patch spans
      // several faces and fades out rather than flipping single triangles.
      const mossMask = s.moss * smooth(0.1, 0.8, up) * smooth(-0.35, 0.35, fbm(c.x * 1.6 + seed, c.z * 1.6, 2, seed + 5));
      if (mossMask > 0) out.lerp(moss, clamp01(mossMask * 0.9));
      if (s.lichen > 0) {
        const lichenMask = s.lichen * smooth(0.0, 0.5, fbm(c.x * 2.4 - seed, c.y * 2.4 + c.z, 2, seed + 7)) * (1 - smooth(0.55, 0.9, up));
        if (lichenMask > 0) out.lerp(lichen, clamp01(lichenMask * 0.55));
      }
      if (s.snow > 0) {
        const snowMask = s.snow * smooth(0.3, 0.75, up) * smooth(-0.2 * top, 0.2 * top, c.y);
        if (snowMask > 0) out.lerp(up > 0.7 ? SNOW : SNOW_SHADE, clamp01(snowMask * 1.3));
      }
    },
    0.07,
  );
}

/**
 * A cairn: stones stacked so each one genuinely rests on the one below — widest at the bottom,
 * each centred over its support with only a small offset, and the whole stack's centre kept over
 * the base stone. Stones keep natural, varied shapes (not uniformly flat discs). `stones` 3–7.
 */
export interface CairnSettings {
  stones: number;
  baseWidth: number;
  /** stone height relative to width (≈0.5 flat … 0.9 chunky); varies per stone */
  flatness: number;
  colors: string[];
  lichen: number;
}

export function cairnGeometry(s: CairnSettings, seed: number) {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  let below: THREE.BufferGeometry | null = null;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < s.stones; i++) {
    const t = i / Math.max(1, s.stones - 1);
    const w = s.baseWidth * (1 - t * 0.55) * (0.9 + rand() * 0.2);
    const h = w * s.flatness * (0.8 + rand() * 0.45);
    const stone = rockGeometry(
      { detail: 1, shape: [1 + rand() * 0.25, 1, 0.9 + rand() * 0.2], lumpiness: 0.16, cuts: 5, angularity: 0.55, ledges: 0, cracks: 0, colors: s.colors, moss: 0, mossColor: '#5d7a3c', lichen: s.lichen * (1 - t * 0.5), lichenColor: '#a8a070', snow: 0 },
      seed * 13 + i,
    );
    // Small offset from the support, pulled back toward the base axis so the stack never leans
    // out past its footing.
    if (i > 0) {
      cx = cx * 0.5 + (rand() - 0.5) * w * 0.14;
      cz = cz * 0.5 + (rand() - 0.5) * w * 0.14;
    }
    stone.scale(w, h, w).rotateY(rand() * Math.PI).rotateX((rand() - 0.5) * 0.08).rotateZ((rand() - 0.5) * 0.08);
    stone.computeBoundingBox();
    const bb = stone.boundingBox!;
    // Rest it on the real top surface of the stone below, measured under its own footprint.
    let restY = 0;
    if (below) {
      restY = -Infinity;
      const p = below.attributes.position;
      const reach = w * 0.38;
      for (let k = 0; k < p.count; k++) {
        if (Math.hypot(p.getX(k) - cx, p.getZ(k) - cz) < reach) restY = Math.max(restY, p.getY(k));
      }
      if (!isFinite(restY)) {
        below.computeBoundingBox();
        restY = below.boundingBox!.max.y;
      }
      restY -= h * 0.06; // settle a little into the hollow of the stone below
    }
    stone.translate(cx - (bb.min.x + bb.max.x) / 2, restY - bb.min.y, cz - (bb.min.z + bb.max.z) / 2);
    parts.push(stone);
    below = stone;
  }
  const g = parts.length === 1 ? parts[0] : mergeRocks(parts);
  return g;
}

function mergeRocks(parts: THREE.BufferGeometry[]) {
  const total = parts.reduce((a, p) => a + p.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const colr = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    p.computeVertexNormals();
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nrm.set(p.attributes.normal.array as Float32Array, o * 3);
    colr.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.computeBoundingSphere();
  return g;
}
