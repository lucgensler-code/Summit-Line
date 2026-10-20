// Scenery kit — gem crystals. A cluster of hexagonal crystals of varied sizes radiating from a
// mossy stone. Tips are painted brighter than bases so the glow reads as coming from inside.
import * as THREE from 'three';
import { clamp01, col, mergeParts, mulberry32, paintFaces } from './core';
import { rockGeometry } from './rocks';

export interface CrystalSettings {
  crystals: number;
  /** tallest crystal height */
  height: number;
  /** how widely they fan out (0–1) */
  spread: number;
  /** crystal colour at the base and at the tip */
  colors: [string, string];
}

export function crystalGeometry(s: CrystalSettings, seed: number) {
  const rand = mulberry32(seed);
  const base = col(s.colors[0]);
  const tip = col(s.colors[1]);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < s.crystals; i++) {
    const main = i === 0;
    const h = s.height * (main ? 1 : 0.35 + rand() * 0.5);
    const r = h * (0.13 + rand() * 0.05);
    const body = new THREE.CylinderGeometry(r, r * 1.08, h, 6, 1).translate(0, h / 2, 0);
    const point = new THREE.ConeGeometry(r, r * 2.4, 6).translate(0, h + r * 1.2, 0);
    const top = h + r * 2.4;
    const crystal = mergeParts([body.toNonIndexed(), point.toNonIndexed()].map((g) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; }));
    const a = rand() * Math.PI * 2;
    const lean = main ? rand() * 0.15 : 0.25 + rand() * 0.55 * s.spread;
    crystal.rotateZ(lean).rotateY(a).translate(Math.sin(a) * r * (main ? 0 : 1.6), -0.04, Math.cos(a) * r * (main ? 0 : 1.6));
    parts.push(paintFaces(crystal, rand, (c, _n, out) => out.copy(base).lerp(tip, clamp01(c.y / top) * 1.1), 0.12));
  }
  return mergeParts(parts);
}

/** The stone the crystals grow from. */
export function crystalBaseGeometry(seed: number) {
  return rockGeometry(
    { detail: 1, shape: [1.25, 0.6, 1.05], lumpiness: 0.15, cuts: 5, angularity: 0.6, ledges: 0, cracks: 0.3, colors: ['#857b72', '#6f6762'], moss: 0.8, mossColor: '#5f7d3f', lichen: 0.2, lichenColor: '#a49a68', snow: 0 },
    seed,
  );
}
