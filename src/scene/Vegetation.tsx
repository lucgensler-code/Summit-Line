import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../game/noise';
import { TREELINE_H, getWorld, snowCover, type Scatter } from '../game/world';

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

function jitter(geo: THREE.BufferGeometry, amt: number, seed: number) {
  const rand = mulberry32(seed);
  const pos = geo.attributes.position;
  const map = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let o = map.get(key);
    if (!o) map.set(key, (o = [(rand() - 0.5) * amt, (rand() - 0.5) * amt, (rand() - 0.5) * amt]));
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const col = new THREE.Color();

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

type Placer = (it: Scatter, i: number) => { y?: number; sx: number; sy: number; sz: number; rx?: number; rz?: number; color?: THREE.Color };

function InstChunk({ items, geometry, material, place, cast, receive }: { items: Scatter[]; geometry: THREE.BufferGeometry; material: THREE.Material; place: Placer; cast: boolean; receive: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useInstances(ref, items, place);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={cast} receiveShadow={receive} />;
}

/** Splits scatter into spatial chunks so the camera and shadow frustums can cull them. */
function Chunked({ items, geometry, material, place, cast = false, receive = false, cell = 180 }: { items: Scatter[]; geometry: THREE.BufferGeometry; material: THREE.Material; place: Placer; cast?: boolean; receive?: boolean; cell?: number }) {
  const chunks = useMemo(() => {
    const map = new Map<string, Scatter[]>();
    for (const it of items) {
      const k = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
      let arr = map.get(k);
      if (!arr) map.set(k, (arr = []));
      arr.push(it);
    }
    return [...map.entries()];
  }, [items, cell]);
  return (
    <group>
      {chunks.map(([k, arr]) => (
        <InstChunk key={k} items={arr} geometry={geometry} material={material} place={place} cast={cast} receive={receive} />
      ))}
    </group>
  );
}

export function Trees() {
  const W = getWorld();
  // Two species: layered fir (most of the forest) and a slender spire spruce.
  const { fir, spruce, trunk, firs, spruces } = useMemo(() => {
    const c1 = new THREE.ConeGeometry(2.3, 4.4, 7, 1).translate(0, 3.6, 0);
    const c2 = new THREE.ConeGeometry(1.8, 3.8, 7, 1).translate(0, 5.6, 0);
    const c3 = new THREE.ConeGeometry(1.15, 3.2, 7, 1).translate(0, 7.6, 0);
    const fir = merge([c1, c2, c3].map((g) => tint(g, '#ffffff')));
    const s1 = new THREE.ConeGeometry(1.5, 6.5, 6, 1).translate(0, 4.6, 0);
    const s2 = new THREE.ConeGeometry(1.0, 4.2, 6, 1).translate(0, 8.4, 0);
    const spruce = merge([s1, s2].map((g) => tint(g, '#ffffff')));
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 2.4, 5).translate(0, 1.2, 0);
    const firs = W.trees.filter((t) => t.tint < 0.68 || t.y > TREELINE_H - 5);
    const spruces = W.trees.filter((t) => !(t.tint < 0.68 || t.y > TREELINE_H - 5));
    return { fir, spruce, trunk, firs, spruces };
  }, [W]);
  const greens = useMemo(
    () => [new THREE.Color('#2c5530'), new THREE.Color('#3c6a32'), new THREE.Color('#24473a'), new THREE.Color('#4c7238'), new THREE.Color('#335c2a')],
    [],
  );
  const frost = useMemo(() => new THREE.Color('#b9c8c4'), []);
  const place = useMemo(
    () => (it: Scatter) => {
      const alpine = it.y > TREELINE_H - 5;
      const g = greens[Math.floor(it.tint * 997) % greens.length];
      col.copy(g).multiplyScalar(alpine ? 0.88 : 0.92 + ((it.tint * 7.3) % 1) * 0.2);
      // Dusting of snow on high trees
      if (it.y > 150) col.lerp(frost, 0.28);
      const s = it.s;
      return { sx: s * (0.9 + it.tint * 0.2), sy: s * (alpine ? 0.8 : 1.0 + it.tint * 0.35), sz: s * (0.9 + it.tint * 0.2), color: col };
    },
    [greens, frost],
  );
  const placeTrunk = useMemo(() => (it: Scatter) => ({ sx: it.s, sy: it.s, sz: it.s }), []);
  const mats = useMemo(
    () => ({
      foliage: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88 }),
      trunk: new THREE.MeshStandardMaterial({ color: '#553826', roughness: 1 }),
    }),
    [],
  );
  return (
    <group>
      <Chunked items={firs} geometry={fir} material={mats.foliage} place={place} cast receive />
      <Chunked items={spruces} geometry={spruce} material={mats.foliage} place={place} cast receive />
      <Chunked items={W.trees} geometry={trunk} material={mats.trunk} place={placeTrunk} cast />
    </group>
  );
}

export function Rocks() {
  const W = getWorld();
  const geoA = useMemo(() => jitter(new THREE.IcosahedronGeometry(1, 0), 0.45, 7), []);
  const geoB = useMemo(() => jitter(new THREE.DodecahedronGeometry(1, 0), 0.55, 19), []);
  const [rocksA, rocksB] = useMemo(() => [W.rocks.filter((r) => r.tint < 0.55), W.rocks.filter((r) => r.tint >= 0.55)], [W]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.92 }), []);
  const palette = useMemo(
    () => ({
      gray: new THREE.Color('#77706a'),
      dark: new THREE.Color('#433a37'),
      red: new THREE.Color('#8c4632'),
      lichen: new THREE.Color('#8a8a5e'),
      snow: new THREE.Color('#e9eef3'),
    }),
    [],
  );
  const place = useMemo(
    () => (it: Scatter, i: number) => {
      const r = mulberry32(i * 31 + 5);
      if (it.y > 165) col.copy(palette.red).lerp(palette.dark, r());
      else if (it.y > TREELINE_H) col.copy(palette.gray).lerp(palette.lichen, r() * 0.6);
      else col.copy(palette.gray).lerp(palette.dark, r() * 0.5);
      if (snowCover(it.x, it.z, it.y, 0.3) > 0.6) col.lerp(palette.snow, 0.55);
      return {
        sx: it.s * (0.8 + r() * 0.6),
        sy: it.s * (0.45 + r() * 0.45),
        sz: it.s * (0.8 + r() * 0.6),
        rx: (r() - 0.5) * 0.5,
        rz: (r() - 0.5) * 0.5,
        color: col,
      };
    },
    [palette],
  );
  return (
    <group>
      <Chunked items={rocksA} geometry={geoA} material={mat} place={place} cast receive />
      <Chunked items={rocksB} geometry={geoB} material={mat} place={place} cast receive />
    </group>
  );
}

export function Shrubs() {
  const W = getWorld();
  const geo = useMemo(() => jitter(new THREE.DodecahedronGeometry(0.9, 0).translate(0, 0.35, 0), 0.3, 3), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }), []);
  const cols = useMemo(() => [new THREE.Color('#5a7a2c'), new THREE.Color('#7a8a36'), new THREE.Color('#8c6d38'), new THREE.Color('#3f6430'), new THREE.Color('#9a5a6a')], []);
  const place = useMemo(
    () => (it: Scatter) => {
      col.copy(cols[Math.floor(it.tint * cols.length) % cols.length]);
      return { sx: it.s * 1.2, sy: it.s * 0.6, sz: it.s * 1.2, color: col };
    },
    [cols],
  );
  return <Chunked items={W.shrubs} geometry={geo} material={mat} place={place} receive />;
}

/** Cairns above treeline, wooden blaze posts below, bamboo wands through the snow. */
export function TrailMarkers() {
  const W = getWorld();
  const cairnRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  const { cairn, post } = useMemo(() => {
    const stones = [
      [0.55, 0.32, 0],
      [0.45, 0.85, 0.05],
      [0.36, 1.3, -0.03],
      [0.26, 1.68, 0.02],
      [0.17, 1.98, 0],
    ].map(([r, y, x], i) => tint(jitter(new THREE.IcosahedronGeometry(r, 0), r * 0.35, 40 + i).scale(1, 0.7, 1).translate(x, y, 0), i % 2 ? '#8c8279' : '#6f6660'));
    const cairn = merge(stones);
    const wood = tint(new THREE.BoxGeometry(0.22, 1.5, 0.22).translate(0, 0.75, 0), '#6b4a30');
    const blaze = tint(new THREE.BoxGeometry(0.24, 0.2, 0.24).translate(0, 1.3, 0), '#e36a2a');
    const post = merge([wood, blaze]);
    return { cairn, post };
  }, []);
  const one = useMemo(() => () => ({ sx: 1, sy: 1, sz: 1 }), []);
  useInstances(cairnRef, W.cairns, one);
  useInstances(postRef, W.posts, one);
  return (
    <group>
      <instancedMesh ref={cairnRef} args={[cairn, undefined, W.cairns.length]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={postRef} args={[post, undefined, W.posts.length]} castShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

/** Fallen logs, ferns, wind-carved rock spires, snowdrifts and crater ice — all instanced. */
export function Ecology() {
  const W = getWorld();
  const g = useMemo(() => {
    const log = merge([
      tint(new THREE.CylinderGeometry(0.32, 0.38, 6, 7).rotateZ(Math.PI / 2).translate(0, 0.3, 0), '#6a4a32'),
      tint(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 7).rotateZ(Math.PI / 2).translate(3.02, 0.3, 0), '#b08a5a'),
      tint(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 4).rotateZ(0.9).translate(-1.2, 0.7, 0.2), '#5a3d28'),
    ]);
    const fern = jitter(new THREE.ConeGeometry(0.7, 0.55, 6, 1, true).translate(0, 0.27, 0), 0.18, 77);
    const spire = jitter(new THREE.CylinderGeometry(0.25, 0.85, 3.2, 6, 3).translate(0, 1.4, 0), 0.35, 91);
    const drift = jitter(new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0.18, 101);
    const ice = merge(
      [0, 1, 2, 3].map((i) =>
        tint(
          jitter(new THREE.OctahedronGeometry(0.35 + i * 0.07, 0).scale(0.6, 2.2, 0.6), 0.08, 120 + i)
            .rotateZ((i - 1.5) * 0.35)
            .rotateX((i % 2 ? 1 : -1) * 0.25)
            .translate((i - 1.5) * 0.35, 0.45, (i % 2) * 0.3),
          '#ffffff',
        ),
      ),
    );
    return { log, fern, spire, drift, ice };
  }, []);
  const mats = useMemo(
    () => ({
      log: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
      fern: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, side: THREE.DoubleSide }),
      spire: new THREE.MeshStandardMaterial({ color: '#3d3434', flatShading: true, roughness: 0.95 }),
      drift: new THREE.MeshStandardMaterial({ color: '#f2f7fc', roughness: 0.9 }),
      ice: new THREE.MeshStandardMaterial({ vertexColors: true, color: '#bfe4ff', roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88, emissive: '#2a5a80', emissiveIntensity: 0.25, flatShading: true }),
    }),
    [],
  );
  const fernCols = useMemo(() => [new THREE.Color('#3f7a2c'), new THREE.Color('#5a8a30'), new THREE.Color('#2f6630')], []);
  const placeLog = useMemo(() => (it: Scatter) => ({ y: it.y - 0.05, sx: it.s, sy: it.s, sz: it.s }), []);
  const placeFern = useMemo(
    () => (it: Scatter) => {
      col.copy(fernCols[Math.floor(it.tint * 3) % 3]);
      return { y: it.y - 0.05, sx: it.s * 1.3, sy: it.s, sz: it.s * 1.3, color: col };
    },
    [fernCols],
  );
  const placeSpire = useMemo(() => (it: Scatter) => ({ y: it.y - 0.4, sx: it.s * 0.8, sy: it.s * (0.9 + it.tint * 0.6), sz: it.s * 0.8, rz: (it.tint - 0.5) * 0.3 }), []);
  const placeDrift = useMemo(() => (it: Scatter) => ({ y: it.y - 0.25, sx: it.s * 1.8, sy: it.s * 0.32, sz: it.s, rx: 0 }), []);
  const placeIce = useMemo(() => (it: Scatter) => ({ y: it.y - 0.2, sx: it.s, sy: it.s, sz: it.s }), []);
  return (
    <group>
      <Chunked items={W.logs} geometry={g.log} material={mats.log} place={placeLog} cast receive />
      <Chunked items={W.ferns} geometry={g.fern} material={mats.fern} place={placeFern} receive />
      <Chunked items={W.spires} geometry={g.spire} material={mats.spire} place={placeSpire} cast receive />
      <Chunked items={W.drifts} geometry={g.drift} material={mats.drift} place={placeDrift} receive />
      <Chunked items={W.ice} geometry={g.ice} material={mats.ice} place={placeIce} cast />
    </group>
  );
}
