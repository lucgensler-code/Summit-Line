// Summit Line scenery kit — shared building blocks.
//
// Every kit item is generated from code and a plain settings object, so the same generators can
// dress any mountain (via a recipe) and, later, be exported as model files. Items are built as
// flat-shaded, low-poly meshes with colours baked per face: broad visible facets, gentle
// darkening toward the ground, and colour variation from face to face.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, mulberry32 } from '../game/noise';

export { fbm, mulberry32 };
export type Rand = () => number;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const col = (hex: string) => new THREE.Color(hex);

/** Welded copy (position only) so displacement stays watertight across faces. */
export function welded(g: THREE.BufferGeometry) {
  const p = new THREE.BufferGeometry();
  p.setAttribute('position', g.attributes.position.clone());
  if (g.index) p.setIndex(g.index.clone());
  return mergeVertices(p, 1e-4);
}

/**
 * Turn a geometry into flat-shaded triangles and paint each face. `paint` receives the face
 * centroid and normal and writes the face colour (a little per-face jitter keeps facets lively).
 */
export function paintFaces(
  g: THREE.BufferGeometry,
  rand: Rand,
  paint: (c: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void,
  jitter = 0.06,
) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const out = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.x += pos.getX(f + k) / 3, c.y += pos.getY(f + k) / 3, c.z += pos.getZ(f + k) / 3;
    n.set(nrm.getX(f), nrm.getY(f), nrm.getZ(f));
    paint(c, n, out);
    const j = 1 + (rand() - 0.5) * 2 * jitter;
    for (let k = 0; k < 3; k++) colors.set([out.r * j, out.g * j, out.b * j], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Merge already-painted, non-indexed parts. */
export function mergeParts(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(
    parts.map((p) => {
      const q = p.index ? p.toNonIndexed() : p;
      for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') q.deleteAttribute(k);
      return q;
    }),
    false,
  )!;
  g.computeBoundingSphere();
  return g;
}

/** Ambient-occlusion style darkening: 1 at/above `y1`, `dark` at/below `y0`. */
export const groundAO = (y: number, y0: number, y1: number, dark: number) => dark + (1 - dark) * Math.sqrt(clamp01((y - y0) / (y1 - y0)));

/** Darken / brighten a colour in place. */
export const shade = (c: THREE.Color, k: number) => c.multiplyScalar(k);

/** A thin tapered cylinder between two points (branches, stems, trunks). */
export function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sides = 5) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true).translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(a.x, a.y, a.z);
  return g;
}
