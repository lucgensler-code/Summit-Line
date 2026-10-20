import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cairnKitGeometry, isBentVariant, kitGeometry } from '../kit/catalogue';
import { mulberry32 } from '../game/noise';
import { useGame } from '../game/store';
import { quality } from './Performance';
import { CINDERCREST } from '../recipes';
import type { KitItem } from '../recipes/cindercrest';
import { TRAIL_HALF_WIDTH, getWorld, heightAt, type Scatter } from '../game/world';

// v0.7 scenery: every tree, rock, plant and cairn comes from the code-built kit (src/kit) as
// dressed by the mountain's recipe (src/recipes). Items are instanced per (item, variant) and
// per spatial chunk, with a near / far / hidden detail level by distance from the camera.

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

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const col = new THREE.Color();

type Placer = (it: Scatter, i: number) => { y?: number; sx: number; sy: number; sz: number; rx?: number; ry?: number; rz?: number; color?: THREE.Color };

function useInstances(ref: React.RefObject<THREE.InstancedMesh | null>, items: Scatter[], place: Placer) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      const p = place(it, i);
      e.set(p.rx ?? 0, p.ry ?? it.rot, p.rz ?? 0);
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
 * detail by distance: `geometry` within `near` of the camera, `far` (if given) beyond it, nothing
 * past `hide`. Only the near level casts shadows.
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
      const c = new THREE.Vector3();
      for (const it of arr) c.add(v.set(it.x, it.y, it.z));
      return { k, arr, c: c.divideScalar(arr.length) };
    });
  }, [items, cell]);
  const lod = near < Infinity || hide < Infinity;
  const nearMeshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const farMeshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  // Current level per chunk (0 near, 1 far, 2 hidden). v0.8: a chunk only changes level once it
  // is clearly past a threshold, so one sitting right at the edge can't flip every frame.
  const level = useRef<{ of: unknown; lv: number[] }>({ of: null, lv: [] });
  useFrame(({ camera }) => {
    if (!lod) return;
    const pad = cell * 0.71;
    if (level.current.of !== chunks) level.current = { of: chunks, lv: [] };
    const lv = level.current.lv;
    const margin = (t: number) => Math.max(4, t * 0.06);
    for (let i = 0; i < chunks.length; i++) {
      const d = camera.position.distanceTo(chunks[i].c) - pad;
      const want = d >= hide ? 2 : d < near ? 0 : 1;
      const cur = lv[i];
      let next = want;
      if (cur !== undefined && want !== cur) {
        // Only move once the distance is clear of the boundary between the two levels.
        // 0↔1 switch at `near`; anything involving hidden (2) switches at `hide`
        const edge = Math.min(want, cur) === 0 && Math.max(want, cur) === 1 ? near : hide;
        if (Math.abs(d - edge) < margin(edge)) next = cur;
      }
      if (next === cur) continue;
      lv[i] = next;
      const nm = nearMeshes.current[i];
      const fm = farMeshes.current[i];
      if (nm) nm.visible = next === 0;
      if (fm) fm.visible = next === 1;
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
// Shared materials: matte, flat-shaded facets lit by the sun and sky; plants are double-sided.

const MATS = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  plant: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
};

/**
 * Wind sway for ground cover (v0.8): a gentle, per-plant-phase lean in the vertex shader, growing
 * with height above the plant's base, so grass, flowers and ferns stir in the breeze. Costs a few
 * ALU ops per vertex; switched off at the lowest quality tier.
 */
const SWAY = { uTime: { value: 0 }, uSway: { value: 1 } };
MATS.plant.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = SWAY.uTime;
  sh.uniforms.uSway = SWAY.uSway;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 sp = instanceMatrix[3].xz;
        float ph = uTime * 1.6 + sp.x * 0.37 + sp.y * 0.29;
        float bend = uSway * max(0.0, transformed.y) * max(0.0, transformed.y) * 0.06;
        transformed.x += (sin(ph) + 0.4 * sin(ph * 2.3 + 1.7)) * bend;
        transformed.z += (cos(ph * 0.8 + 0.6)) * bend * 0.6;
      #endif`,
    );
};

export function WindSway() {
  useFrame(({ clock }) => {
    SWAY.uTime.value = clock.elapsedTime;
    SWAY.uSway.value = quality.sway ? 1 : 0;
  });
  return null;
}

const RECIPE = CINDERCREST;
const ITEMS = RECIPE.items as Record<string, KitItem>;

/** Instance look: per-instance size, lean and a gentle brightness / warmth shift. */
/** Prevailing wind (y rotation) that bent tree tops lean with; a small spread keeps it natural. */
const WIND_ROT = 2.2;

function placerFor(kind: KitItem['kind'], bent = false): Placer {
  if (kind === 'tree')
    return (it) => {
      if (bent) {
        const k = 0.9 + ((it.tint * 7.3) % 1) * 0.18;
        col.setRGB(k, k, k);
        return { sx: it.s, sy: it.s * (0.95 + it.tint * 0.15), sz: it.s, ry: WIND_ROT + (((it.tint * 13.1) % 1) - 0.5) * 0.5, color: col };
      }
      const k = 0.9 + ((it.tint * 7.3) % 1) * 0.18;
      col.setRGB(k * (0.98 + ((it.tint * 3.1) % 1) * 0.06), k, k * (0.96 + ((it.tint * 5.7) % 1) * 0.06));
      const wide = 0.85 + ((it.tint * 5.1) % 1) * 0.3;
      const lean = ((it.tint * 3.7) % 1) - 0.5;
      return { sx: it.s * wide, sy: it.s * (0.9 + it.tint * 0.25), sz: it.s * wide, rx: lean * 0.05, rz: lean * 0.06, color: col };
    };
  if (kind === 'rock')
    return (it, i) => {
      const r = mulberry32(i * 31 + 5);
      col.setScalar(0.88 + r() * 0.22);
      return { sx: it.s * (0.85 + r() * 0.35), sy: it.s * (0.8 + r() * 0.35), sz: it.s * (0.85 + r() * 0.35), rx: (r() - 0.5) * 0.18, rz: (r() - 0.5) * 0.18, color: col };
    };
  return (it) => {
    col.setScalar(0.88 + it.tint * 0.24);
    return { sx: it.s, sy: it.s * (0.85 + it.tint * 0.3), sz: it.s, color: col };
  };
}

/** Group a scatter list by (item, variant). */
function useGroups(items: Scatter[]) {
  return useMemo(() => {
    const map = new Map<string, { id: string; variant: number; arr: Scatter[] }>();
    for (const it of items) {
      const id = it.item!;
      const def = ITEMS[id];
      if (!def || def.kind === 'model') continue;
      const variant = Math.floor(it.tint * def.variants) % def.variants;
      const k = `${id}:${variant}`;
      let g = map.get(k);
      if (!g) map.set(k, (g = { id, variant, arr: [] }));
      g.arr.push(it);
    }
    return [...map.values()];
  }, [items]);
}

function KitLayer({ items, cell, cast = false }: { items: Scatter[]; cell: number; cast?: boolean }) {
  const groups = useGroups(items);
  return (
    <group>
      {groups.map(({ id, variant, arr }) => {
        const def = ITEMS[id] as Exclude<KitItem, { kind: 'model' }>;
        const isPlant = def.kind !== 'tree' && def.kind !== 'rock';
        const near = 'near' in def ? def.near : Infinity;
        const castThis = cast && (def.kind === 'tree' || ('collide' in def && !!def.collide));
        return (
          <Chunked
            key={`${id}:${variant}`}
            items={arr}
            geometry={kitGeometry(RECIPE, id, variant, false)}
            far={def.kind === 'tree' || def.kind === 'rock' ? kitGeometry(RECIPE, id, variant, true) : undefined}
            near={near}
            hide={def.hide}
            cell={cell}
            material={isPlant ? MATS.plant : MATS.solid}
            place={placerFor(def.kind, def.kind === 'tree' && isBentVariant(def.settings, variant, def.variants))}
            cast={castThis}
            receive={!isPlant}
          />
        );
      })}
    </group>
  );
}

export function Trees() {
  const W = getWorld();
  return <KitLayer items={W.trees} cell={230} cast />;
}

export function Rocks() {
  const W = getWorld();
  // v0.8: hidden on the home screen — from a kilometre away they read as dark specks.
  const prep = useGame((s) => s.phase === 'prep');
  return (
    <group visible={!prep}>
      <KitLayer items={W.rocks} cell={220} cast />
    </group>
  );
}

/** Ground cover: grass, wildflowers, shrubs and ferns (kept for the old component name). */
export function Shrubs() {
  const W = getWorld();
  return <KitLayer items={W.cover} cell={110} />;
}

/** v0.7: the old ferns / spires layer is now part of the recipe-driven layers above. */
export function Ecology() {
  return null;
}

// ---------------------------------------------------------------------------------------------
// Trail markers and the stones along the trail edge

/** Cairns above treeline, wooden blaze posts below. */
export function TrailMarkers() {
  const W = getWorld();
  const postRef = useRef<THREE.InstancedMesh>(null);
  const post = useMemo(() => {
    const wood = tint(new THREE.BoxGeometry(0.22, 1.5, 0.22).translate(0, 0.75, 0), '#6b4a30');
    const blaze = tint(new THREE.BoxGeometry(0.24, 0.2, 0.24).translate(0, 1.3, 0), '#e36a2a');
    return merge([wood, blaze]);
  }, []);
  const one = useMemo(() => () => ({ sx: 1, sy: 1, sz: 1 }), []);
  useInstances(postRef, W.posts, one);
  const cairns = useMemo(() => {
    const map = new Map<number, Scatter[]>();
    for (const c of W.cairns) {
      const vnt = Number((c.item ?? 'cairn0').slice(5)) || 0;
      if (!map.has(vnt)) map.set(vnt, []);
      map.get(vnt)!.push(c);
    }
    return [...map.entries()];
  }, [W]);
  const placeCairn = useMemo(() => (it: Scatter) => ({ sx: it.s, sy: it.s, sz: it.s }), []);
  // Occasional loose stones along the trail edges (decorative, no collision).
  const stones = useMemo(() => {
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
        out.push({ x, z, y: heightAt(x, z) - s * 0.2, s, rot: rand() * 6.28, tint: rand(), item: 'talus' });
      }
    }
    return out;
  }, [W]);
  return (
    <group>
      {cairns.map(([vnt, arr]) => (
        <Chunked key={vnt} items={arr} geometry={cairnKitGeometry(RECIPE, vnt)} material={MATS.solid} place={placeCairn} cast receive cell={300} />
      ))}
      <instancedMesh ref={postRef} args={[post, undefined, W.posts.length]} castShadow>
        <meshLambertMaterial vertexColors />
      </instancedMesh>
      <Chunked items={stones} geometry={kitGeometry(RECIPE, 'talus', 0, true)} hide={140} material={MATS.solid} place={placerFor('rock')} receive />
    </group>
  );
}
