import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, mulberry32 } from '../game/noise';
import { TRAIL_HALF_WIDTH, TREELINE_H, getWorld, heightAt, snowCover, type Scatter } from '../game/world';
import { STYLE } from './style';

// v0.6.1 scenery: rounded, softly shaded forms (smooth normals, Lambert shading), gentle baked
// darkening toward the ground, and detail levels by distance — rich near the climber, simple or
// hidden far away — so the extra shape costs little frame time.

/** Bake a flat vertex colour into a geometry so parts can be merged into one draw call. */
export function tint(geo: THREE.BufferGeometry, hex: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

export function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  g.computeVertexNormals();
  return g;
}

/** Merge indexed parts keeping each part's smooth normals (no faceting). */
function mergeSmooth(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts, false)!;
}

/** Welded copy (position only) so displacement and normals are smooth across faces. */
function welded(g: THREE.BufferGeometry) {
  const p = new THREE.BufferGeometry();
  p.setAttribute('position', g.attributes.position.clone());
  if (g.index) p.setIndex(g.index.clone());
  return mergeVertices(p, 1e-4);
}

/**
 * Bake per-vertex colour: `base` (or white) × a soft ambient-occlusion ramp, darker toward the
 * bottom of the object where it meets the ground.
 */
function bakeShade(g: THREE.BufferGeometry, y0: number, y1: number, dark: number, color?: (x: number, y: number, z: number, out: THREE.Color) => void) {
  const pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const ao = dark + (1 - dark) * Math.sqrt(k);
    if (color) color(x, y, z, c);
    else c.setRGB(1, 1, 1);
    c.multiplyScalar(ao);
    arr.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** A rounded, weathered boulder: welded icosphere, noise-displaced, flattened base, smooth normals. */
export function boulderGeometry(detail: number, seed: number, elong = 1, mossy = false) {
  const g = welded(new THREE.IcosahedronGeometry(1, detail));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const n = fbm(x * 1.6 + seed, z * 1.6 - seed, 3, seed) * 0.5 + fbm(y * 2.2 + seed, x * 2.2, 2, seed + 1) * 0.22;
    const r = 1 + n * 0.32;
    x *= r * elong;
    y *= r * 0.72;
    z *= r;
    if (y < -0.32) y = -0.32 + (y + 0.32) * 0.15; // sits flat on the ground
    pos.setXYZ(i, x, y, z);
  }
  // Weathered faces: a few planar cuts give each stone broad flat sides with rounded edges
  // (smooth normals soften where the faces meet), so it reads as stone, not a pebble or ball.
  const rnd = mulberry32(seed * 7 + 1);
  const pv = new THREE.Vector3();
  for (let c = 0; c < 6; c++) {
    const nrm = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.15) * 0.9, rnd() - 0.5).normalize();
    const d = 0.38 + rnd() * 0.22;
    for (let i = 0; i < pos.count; i++) {
      pv.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const over = pv.dot(nrm) - d;
      if (over > 0) pv.addScaledVector(nrm, -over * 0.92);
      pos.setXYZ(i, pv.x, pv.y, pv.z);
    }
  }
  g.computeVertexNormals();
  const moss = new THREE.Color('#5d7a3c');
  const stone = new THREE.Color('#8c847d');
  return bakeShade(g, -0.35, 0.6, 0.55, mossy ? (_x, y, _z, out) => out.copy(stone).lerp(moss, Math.max(0, Math.min(1, (y - 0.12) / 0.22)) * 0.85) : undefined);
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const col = new THREE.Color();

type Placer = (it: Scatter, i: number) => { y?: number; sx: number; sy: number; sz: number; rx?: number; rz?: number; color?: THREE.Color };

function useInstances(ref: React.RefObject<THREE.InstancedMesh | null>, items: Scatter[], place: Placer) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      const p = place(it, i);
      e.set(p.rx ?? 0, it.rot, p.rz ?? 0);
      q.setFromEuler(e);
      v.set(it.x, p.y ?? it.y, it.z);
      sc.set(p.sx, p.sy, p.sz);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
      if (p.color) mesh.setColorAt(i, p.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, items, place]);
}

function InstChunk({ items, geometry, material, place, cast, receive, meshRef }: { items: Scatter[]; geometry: THREE.BufferGeometry; material: THREE.Material; place: Placer; cast: boolean; receive: boolean; meshRef?: (m: THREE.InstancedMesh | null) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useInstances(ref, items, place);
  return (
    <instancedMesh
      ref={(m) => {
        ref.current = m;
        meshRef?.(m);
      }}
      args={[geometry, material, items.length]}
      castShadow={cast}
      receiveShadow={receive}
    />
  );
}

/**
 * Splits scatter into spatial chunks so the camera and shadow frustums can cull them, and swaps
 * detail by distance: `geometry` within `near` units of the camera, `far` (if given) beyond it,
 * nothing past `hide`. Only the near level casts shadows.
 */
function Chunked({
  items,
  geometry,
  far,
  material,
  place,
  cast = false,
  receive = false,
  cell = 120,
  near = Infinity,
  hide = Infinity,
}: {
  items: Scatter[];
  geometry: THREE.BufferGeometry;
  far?: THREE.BufferGeometry;
  material: THREE.Material;
  place: Placer;
  cast?: boolean;
  receive?: boolean;
  cell?: number;
  near?: number;
  hide?: number;
}) {
  const chunks = useMemo(() => {
    const map = new Map<string, Scatter[]>();
    for (const it of items) {
      const k = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
      let arr = map.get(k);
      if (!arr) map.set(k, (arr = []));
      arr.push(it);
    }
    return [...map.entries()].map(([k, arr]) => {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const it of arr) {
        x += it.x;
        y += it.y;
        z += it.z;
      }
      return { k, arr, c: new THREE.Vector3(x / arr.length, y / arr.length, z / arr.length) };
    });
  }, [items, cell]);
  const lod = near < Infinity || hide < Infinity;
  const nearMeshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const farMeshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  useFrame(({ camera }) => {
    if (!lod) return;
    const pad = cell * 0.71;
    for (let i = 0; i < chunks.length; i++) {
      const d = camera.position.distanceTo(chunks[i].c) - pad;
      const nm = nearMeshes.current[i];
      const fm = farMeshes.current[i];
      if (nm) nm.visible = d < near && d < hide;
      if (fm) fm.visible = d >= near && d < hide;
    }
  });
  return (
    <group>
      {chunks.map(({ k, arr }, i) => (
        <group key={k}>
          <InstChunk items={arr} geometry={geometry} material={material} place={place} cast={cast} receive={receive} meshRef={(m) => (nearMeshes.current[i] = m)} />
          {far && <InstChunk items={arr} geometry={far} material={material} place={place} cast={false} receive={receive} meshRef={(m) => (farMeshes.current[i] = m)} />}
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Trees

/**
 * A conifer as stacked, softly rounded tiers: each tier is a cone whose middle ring bulges out
 * and whose rim wavers, with smooth normals so light rolls across it. Lower tiers and the
 * underside are darker (baked occlusion).
 */
function coniferGeometry(spec: [number, number, number][], seed: number, segs: number, rounded: boolean) {
  const rand = mulberry32(seed);
  const parts = spec.map(([r, h, y], i) => {
    const g = welded(new THREE.ConeGeometry(r, h, segs, rounded ? 2 : 1, i > 0));
    const pos = g.attributes.position;
    const tw = rand() * Math.PI;
    for (let k = 0; k < pos.count; k++) {
      let px = pos.getX(k);
      let py = pos.getY(k);
      let pz = pos.getZ(k);
      const a = Math.atan2(px, pz) + tw;
      const rr = Math.hypot(px, pz);
      const t = (py + h / 2) / h; // 0 bottom … 1 tip
      let scale = 1;
      if (rounded && t > 0.05 && t < 0.95) scale = 1 + 0.16 * Math.sin(t * Math.PI); // fuller, rounder tier
      if (t < 0.05) {
        scale = 1 + 0.12 * Math.sin(a * 3 + seed + i) + 0.06 * Math.sin(a * 7 + i); // uneven rim
        py -= 0.18 * (0.5 + 0.5 * Math.sin(a * 5 + i)); // drooping branch tips
      }
      if (rr > 1e-4) {
        px *= scale;
        pz *= scale;
      }
      pos.setXYZ(k, px, py + y, pz);
    }
    g.rotateY(tw);
    g.computeVertexNormals();
    const shade = 0.66 + (i / Math.max(1, spec.length - 1)) * 0.34;
    return bakeShade(g, y - h / 2, y + h / 2, 0.7, (_x, _y, _z, out) => out.setScalar(shade));
  });
  return mergeSmooth(parts);
}

const FIR: [number, number, number][] = [
  [2.6, 3.4, 3.0],
  [2.15, 3.0, 4.6],
  [1.6, 2.7, 6.0],
  [1.0, 2.4, 7.4],
];
const SPRUCE: [number, number, number][] = [
  [1.7, 3.6, 3.2],
  [1.4, 3.2, 4.9],
  [1.1, 2.9, 6.4],
  [0.78, 2.6, 7.8],
  [0.45, 2.0, 9.0],
];

export function Trees() {
  const W = getWorld();
  const { fir, firLo, spruce, spruceLo, trunk, firs, spruces } = useMemo(() => {
    const trunk = bakeShade(welded(new THREE.CylinderGeometry(0.18, 0.32, 2.6, 6).translate(0, 1.3, 0)), 0, 2.6, 0.6);
    trunk.computeVertexNormals();
    return {
      fir: coniferGeometry(FIR, 11, 9, true),
      firLo: coniferGeometry(FIR, 11, 6, false),
      spruce: coniferGeometry(SPRUCE, 23, 8, true),
      spruceLo: coniferGeometry(SPRUCE, 23, 5, false),
      trunk,
      firs: W.trees.filter((t) => t.tint < 0.68 || t.y > TREELINE_H - 5),
      spruces: W.trees.filter((t) => !(t.tint < 0.68 || t.y > TREELINE_H - 5)),
    };
  }, [W]);
  const place = useMemo(
    () => (it: Scatter) => {
      const alpine = it.y > TREELINE_H - 5;
      const g = STYLE.pine[Math.floor(it.tint * 997) % STYLE.pine.length];
      col.copy(g).lerp(STYLE.sage, ((it.tint * 13.7) % 1) * 0.28).multiplyScalar(alpine ? 0.92 : 0.95 + ((it.tint * 7.3) % 1) * 0.16);
      if (it.y > 150) col.lerp(STYLE.frost, 0.22); // dusting of snow on high trees
      const s = it.s;
      const wide = 0.8 + ((it.tint * 5.1) % 1) * 0.4;
      const lean = ((it.tint * 3.7) % 1) - 0.5;
      return { sx: s * wide, sy: s * (alpine ? 0.78 : 0.9 + it.tint * 0.45), sz: s * wide * (0.92 + ((it.tint * 2.3) % 1) * 0.16), rx: lean * 0.04, rz: lean * 0.05, color: col };
    },
    [],
  );
  const placeTrunk = useMemo(() => (it: Scatter) => ({ sx: it.s, sy: it.s, sz: it.s, color: STYLE.trunk }), []);
  const mats = useMemo(
    () => ({
      foliage: new THREE.MeshLambertMaterial({ vertexColors: true }),
      trunk: new THREE.MeshLambertMaterial({ vertexColors: true }),
    }),
    [],
  );
  return (
    <group>
      <Chunked items={firs} geometry={fir} far={firLo} near={150} material={mats.foliage} place={place} cast receive />
      <Chunked items={spruces} geometry={spruce} far={spruceLo} near={150} material={mats.foliage} place={place} cast receive />
      {/* Trunks sit under the canopy: their shadows are invisible, so they don't cast. */}
      <Chunked items={W.trees} geometry={trunk} material={mats.trunk} place={placeTrunk} hide={420} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Rocks and boulders

const ROCK_TONES = {
  gray: STYLE.rockWarm,
  dark: STYLE.rockDark,
  red: new THREE.Color('#7e5446'),
  cool: STYLE.rockCool,
  snow: STYLE.snow,
};

function rockColor(it: Scatter, i: number) {
  const r = mulberry32(i * 31 + 5);
  if (it.y > 165) col.copy(ROCK_TONES.red).lerp(ROCK_TONES.dark, r() * 0.8);
  else col.copy(ROCK_TONES.gray).lerp(ROCK_TONES.cool, r() * 0.55).lerp(ROCK_TONES.dark, r() * 0.25);
  if (snowCover(it.x, it.z, it.y, 0.3) > 0.6) col.lerp(ROCK_TONES.snow, 0.5);
  return r;
}

export function Rocks() {
  const W = getWorld();
  const geo = useMemo(
    () => ({
      a: boulderGeometry(1, 7),
      aLo: boulderGeometry(0, 7),
      b: boulderGeometry(1, 19, 1.25),
      bLo: boulderGeometry(0, 19, 1.25),
      moss: boulderGeometry(2, 31, 1.1, true),
      mossLo: boulderGeometry(1, 31, 1.1, true),
      big: boulderGeometry(2, 43, 1.15),
      bigLo: boulderGeometry(1, 43, 1.15),
    }),
    [],
  );
  const sets = useMemo(() => {
    const small = W.rocks.filter((r) => r.s <= 1.2);
    const big = W.rocks.filter((r) => r.s > 1.2);
    const forestBig = big.filter((r) => r.y < TREELINE_H + 10 && r.tint < 0.6);
    return {
      smallA: small.filter((r) => r.tint < 0.55),
      smallB: small.filter((r) => r.tint >= 0.55),
      big: big.filter((r) => !forestBig.includes(r)),
      mossy: [...forestBig, ...W.boulders.filter((b) => b.y < TREELINE_H + 10)],
      boulders: W.boulders.filter((b) => b.y >= TREELINE_H + 10),
    };
  }, [W]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  const place = useMemo(
    () => (it: Scatter, i: number) => {
      const r = rockColor(it, i);
      return { sx: it.s * (0.85 + r() * 0.5), sy: it.s * (0.75 + r() * 0.5), sz: it.s * (0.85 + r() * 0.5), rx: (r() - 0.5) * 0.3, rz: (r() - 0.5) * 0.3, color: col };
    },
    [],
  );
  // Mossy forest boulders keep their stone colour in the geometry; the instance only varies brightness.
  const placeMoss = useMemo(
    () => (it: Scatter, i: number) => {
      const r = mulberry32(i * 17 + 3);
      col.setScalar(0.88 + r() * 0.2);
      return { sx: it.s * (0.9 + r() * 0.35), sy: it.s * (0.8 + r() * 0.35), sz: it.s * (0.9 + r() * 0.35), rx: (r() - 0.5) * 0.2, rz: (r() - 0.5) * 0.2, color: col };
    },
    [],
  );
  return (
    <group>
      <Chunked items={sets.smallA} geometry={geo.a} far={geo.aLo} near={90} hide={260} material={mat} place={place} receive />
      <Chunked items={sets.smallB} geometry={geo.b} far={geo.bLo} near={90} hide={260} material={mat} place={place} receive />
      <Chunked items={sets.big} geometry={geo.big} far={geo.bigLo} near={140} material={mat} place={place} cast receive />
      <Chunked items={sets.mossy} geometry={geo.moss} far={geo.mossLo} near={140} material={mat} place={placeMoss} cast receive />
      <Chunked items={sets.boulders} geometry={geo.big} far={geo.bigLo} near={160} material={mat} place={place} cast receive />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Bushes

/** A rounded, layered bush: three or four overlapping smooth mounds, darker underneath. */
function bushGeometry(detail: number, seed: number) {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = detail > 0 ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 0.62 : 0.38 + rand() * 0.22;
    const g = welded(new THREE.IcosahedronGeometry(r, detail));
    const ox = i === 0 ? 0 : (rand() - 0.5) * 0.9;
    const oz = i === 0 ? 0 : (rand() - 0.5) * 0.9;
    const oy = i === 0 ? 0.32 : 0.22 + rand() * 0.25;
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const z = pos.getZ(k);
      const w = 1 + fbm(x * 3 + seed, z * 3 + i, 2, seed + i) * 0.18;
      pos.setXYZ(k, x * w + ox, Math.max(y * 0.8 * w + oy, 0), z * w + oz);
    }
    g.computeVertexNormals();
    parts.push(bakeShade(g, 0, 0.9, 0.55));
  }
  return mergeSmooth(parts);
}

export function Shrubs() {
  const W = getWorld();
  const geo = useMemo(() => ({ near: bushGeometry(1, 3), far: bushGeometry(0, 3) }), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  const cols = useMemo(() => [new THREE.Color('#5d7240'), new THREE.Color('#77824c'), new THREE.Color('#8a7650'), new THREE.Color('#4b6340'), new THREE.Color('#7f6470')], []);
  const place = useMemo(
    () => (it: Scatter) => {
      col.copy(cols[Math.floor(it.tint * cols.length) % cols.length]);
      return { y: it.y - 0.08, sx: it.s * 1.25, sy: it.s * (0.75 + it.tint * 0.35), sz: it.s * 1.15, color: col };
    },
    [cols],
  );
  return <Chunked items={W.shrubs} geometry={geo.near} far={geo.far} near={90} hide={240} material={mat} place={place} receive />;
}

// ---------------------------------------------------------------------------------------------
// Trail markers and the stones along the trail edge

/** Cairns above treeline, wooden blaze posts below, bamboo wands through the snow. */
export function TrailMarkers() {
  const W = getWorld();
  const cairnRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  const { cairn, post } = useMemo(() => {
    const tones = [new THREE.Color('#8f857c'), new THREE.Color('#756c66'), new THREE.Color('#857a72'), new THREE.Color('#6a625e'), new THREE.Color('#938a80')];
    const stones = [
      [0.56, 0.3, 0, 1.15],
      [0.45, 0.78, 0.05, 1.05],
      [0.36, 1.18, -0.04, 1.2],
      [0.27, 1.5, 0.02, 1.1],
      [0.18, 1.74, 0, 1.0],
    ].map(([r, y, x, el], i) => {
      const g = boulderGeometry(1, 40 + i, el);
      g.scale(r, r * 1.05, r).rotateY(i * 1.3).translate(x, y, 0);
      // tint the baked shade by this stone's tone
      const c = g.attributes.color;
      for (let k = 0; k < c.count; k++) c.setXYZ(k, c.getX(k) * tones[i].r, c.getY(k) * tones[i].g, c.getZ(k) * tones[i].b);
      return g;
    });
    const cairn = mergeSmooth(stones);
    const wood = tint(new THREE.BoxGeometry(0.22, 1.5, 0.22).translate(0, 0.75, 0), '#6b4a30');
    const blaze = tint(new THREE.BoxGeometry(0.24, 0.2, 0.24).translate(0, 1.3, 0), '#e36a2a');
    const post = merge([wood, blaze]);
    return { cairn, post };
  }, []);
  const one = useMemo(() => () => ({ sx: 1, sy: 1, sz: 1 }), []);
  useInstances(cairnRef, W.cairns, one);
  useInstances(postRef, W.posts, one);
  // Occasional loose stones along the trail edges (decorative pebbles, no collision).
  const { stones, stoneGeo } = useMemo(() => {
    const rand = mulberry32(777);
    const out: Scatter[] = [];
    for (const line of W.lines) {
      for (let i = 2; i < line.pts.length - 2; i += 3) {
        if (rand() > 0.42) continue;
        const a = line.pts[i];
        const b = line.pts[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const l = Math.hypot(dx, dz) || 1;
        const side = (rand() < 0.5 ? -1 : 1) * (TRAIL_HALF_WIDTH + 0.5 + rand() * 0.9);
        const x = a.x - (dz / l) * side;
        const z = a.z + (dx / l) * side;
        const s = 0.14 + rand() * 0.26;
        out.push({ x, z, y: heightAt(x, z) - s * 0.25, s, rot: rand() * 6.28, tint: rand() });
      }
    }
    return { stones: out, stoneGeo: boulderGeometry(1, 61) };
  }, [W]);
  const stoneMat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  const placeStone = useMemo(
    () => (it: Scatter, i: number) => {
      rockColor(it, i + 5000);
      return { sx: it.s * 1.2, sy: it.s * 0.8, sz: it.s, color: col };
    },
    [],
  );
  return (
    <group>
      <instancedMesh ref={cairnRef} args={[cairn, undefined, W.cairns.length]} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </instancedMesh>
      <instancedMesh ref={postRef} args={[post, undefined, W.posts.length]} castShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </instancedMesh>
      <Chunked items={stones} geometry={stoneGeo} hide={160} material={stoneMat} place={placeStone} receive />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Ferns and spires

/** A fern: arching, tapering fronds radiating from the crown, each a narrow leaf strip. */
function fernGeometry(fronds: number, seed: number) {
  const rand = mulberry32(seed);
  const pos: number[] = [];
  const cols: number[] = [];
  const SEG = 5;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const len = 0.75 + rand() * 0.35;
    const rise = 0.45 + rand() * 0.2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pts: [number, number, number, number][] = [];
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const r = t * len;
      const y = Math.sin(t * Math.PI * 0.85) * rise - t * t * 0.25; // arch up, droop at the tip
      const w = 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)) * (1 - t * 0.35);
      pts.push([sa * r, y + 0.04, ca * r, w]);
    }
    for (let k = 0; k < SEG; k++) {
      const [x0, y0, z0, w0] = pts[k];
      const [x1, y1, z1, w1] = pts[k + 1];
      // leaf width runs across the frond
      const px = ca;
      const pz = -sa;
      const A = [x0 - px * w0, y0, z0 - pz * w0];
      const B = [x0 + px * w0, y0, z0 + pz * w0];
      const C = [x1 - px * w1, y1 - 0.03, z1 - pz * w1];
      const D = [x1 + px * w1, y1 - 0.03, z1 + pz * w1];
      pos.push(...A, ...B, ...C, ...C, ...B, ...D);
      const s0 = 0.62 + (k / SEG) * 0.38;
      const s1 = 0.62 + ((k + 1) / SEG) * 0.38;
      cols.push(s0, s0, s0, s0, s0, s0, s1, s1, s1, s1, s1, s1, s0, s0, s0, s1, s1, s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

export function Ecology() {
  const W = getWorld();
  const g = useMemo(() => {
    const fern = fernGeometry(8, 77);
    const spire = welded(new THREE.CylinderGeometry(0.28, 0.85, 3.2, 8, 4).translate(0, 1.4, 0));
    const pos = spire.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n = 1 + fbm(x * 2 + y, z * 2, 3, 91) * 0.35;
      pos.setXYZ(i, x * n, y, z * n);
    }
    spire.computeVertexNormals();
    bakeShade(spire, -0.2, 3, 0.6);
    return { fern, spire };
  }, []);
  const mats = useMemo(
    () => ({
      fern: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      spire: new THREE.MeshLambertMaterial({ vertexColors: true }),
    }),
    [],
  );
  const fernCols = useMemo(() => [new THREE.Color('#5c8a3a'), new THREE.Color('#6e9442'), new THREE.Color('#4f7a36')], []);
  const placeFern = useMemo(
    () => (it: Scatter) => {
      col.copy(fernCols[Math.floor(it.tint * 3) % 3]);
      return { y: it.y - 0.04, sx: it.s * 1.2, sy: it.s * (0.85 + it.tint * 0.3), sz: it.s * 1.2, color: col };
    },
    [fernCols],
  );
  const placeSpire = useMemo(
    () => (it: Scatter) => {
      col.copy(STYLE.basalt).multiplyScalar(1.1);
      return { y: it.y - 0.4, sx: it.s * 0.8, sy: it.s * (0.9 + it.tint * 0.6), sz: it.s * 0.8, rz: (it.tint - 0.5) * 0.3, color: col };
    },
    [],
  );
  return (
    <group>
      <Chunked items={W.ferns} geometry={g.fern} hide={110} material={mats.fern} place={placeFern} receive />
      <Chunked items={W.spires} geometry={g.spire} material={mats.spire} place={placeSpire} cast receive />
    </group>
  );
}
