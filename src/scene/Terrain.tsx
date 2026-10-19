import { useMemo } from 'react';
import * as THREE from 'three';
import { fbm, lerp, smoothstep } from '../game/noise';
import { STYLE } from './style';
import {
  GRID_STEP,
  HALF,
  LAKE,
  TERRAIN_SEGMENTS,
  TRAIL_HALF_WIDTH,
  TREELINE_H,
  farHeight,
  getWorld,
  heightAt,
  snowCover,
  type TrailLine,
} from '../game/world';

const C = (hex: string) => new THREE.Color(hex);
// v0.6: muted sage forest floor with warm earth patches, dusty cinder, off-white snow whose
// shaded planes go cool lavender-blue (shared palette in ./style).
const PAL = {
  duff: STYLE.needleDuff,
  moss: STYLE.moss,
  forest: STYLE.forestFloor,
  earth: STYLE.earth,
  meadowDry: STYLE.meadowDry,
  meadowGreen: STYLE.meadowGreen,
  cinder: STYLE.cinder,
  cinderDark: STYLE.cinderDark,
  pumice: STYLE.pumice,
  basalt: STYLE.basalt,
  snow: STYLE.snow,
  snowShade: STYLE.snowShade,
  plain: C('#4a5c3a'),
  shore: C('#74674f'),
};

const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

export function terrainColor(x: number, z: number, h: number, slope: number, out: THREE.Color) {
  const n1 = fbm(x / 38, z / 38, 3, 201) * 0.5 + 0.5;
  const n2 = fbm(x / 9, z / 9, 2, 211) * 0.5 + 0.5;

  // Forest floor: sage with selective warm-earth clearings (broad patches, not speckle)
  out.copy(PAL.forest).lerp(PAL.duff, n1 * 0.35).lerp(PAL.moss, smoothstep(0.55, 0.8, n2) * 0.4);
  out.lerp(PAL.earth, smoothstep(0.62, 0.78, n1) * 0.55);
  // Meadow above treeline
  const meadow = smoothstep(TREELINE_H - 14, TREELINE_H + 8, h);
  tmp.copy(PAL.meadowDry).lerp(PAL.meadowGreen, smoothstep(0.35, 0.7, n1));
  out.lerp(tmp, meadow);
  // Volcanic scree
  const scree = smoothstep(150, 180, h + n1 * 18);
  tmp.copy(PAL.cinder).lerp(PAL.cinderDark, smoothstep(0.3, 0.75, n1)).lerp(PAL.pumice, smoothstep(0.62, 0.9, n2) * 0.6);
  out.lerp(tmp, scree);
  // Steep exposed rock
  const rock = smoothstep(1.0, 1.45, slope + (n2 - 0.5) * 0.2) * 0.85;
  tmp.copy(PAL.basalt).lerp(PAL.cinderDark, n2 * 0.5);
  out.lerp(tmp, rock);
  // Crater interior
  
  // Tarn shore
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  out.lerp(PAL.shore, smoothstep(LAKE.r + 6, LAKE.r - 1, dl) * 0.8);
  // Snow
  const snow = snowCover(x, z, h, slope);
  // Snow: off-white, cooler on steep faces and in broad wind-scoured bands; a little cinder shows
  // through only at the ragged edge of the snowfield (gameplay snow coverage is unchanged).
  tmp2.copy(PAL.snow).lerp(PAL.snowShade, n2 * 0.3 + smoothstep(0.45, 1.05, slope) * 0.55 + smoothstep(0.55, 0.8, n1) * 0.2);
  out.lerp(tmp2, smoothstep(0.3, 0.68, snow + (n1 - 0.5) * 0.12));
  // Distant plain
  out.lerp(PAL.plain, smoothstep(HALF - 120, HALF - 10, Math.max(Math.abs(x), Math.abs(z))) * 0.7);
  // Subtle brightness variation
  out.multiplyScalar(0.92 + n2 * 0.16);
  return out;
}

export function Terrain() {
  const geometry = useMemo(() => {
    const W = getWorld();
    const N1 = TERRAIN_SEGMENTS + 1;
    const pos = new Float32Array(N1 * N1 * 3);
    const col = new Float32Array(N1 * N1 * 3);
    const c = new THREE.Color();
    for (let iz = 0; iz < N1; iz++) {
      for (let ix = 0; ix < N1; ix++) {
        const i = iz * N1 + ix;
        const x = -HALF + ix * GRID_STEP;
        const z = -HALF + iz * GRID_STEP;
        const h = W.heights[i];
        pos[i * 3] = x;
        pos[i * 3 + 1] = h;
        pos[i * 3 + 2] = z;
        const hx = W.heights[iz * N1 + Math.min(ix + 1, N1 - 1)] - W.heights[iz * N1 + Math.max(ix - 1, 0)];
        const hz = W.heights[Math.min(iz + 1, N1 - 1) * N1 + ix] - W.heights[Math.max(iz - 1, 0) * N1 + ix];
        const slope = Math.hypot(hx, hz) / (2 * GRID_STEP);
        terrainColor(x, z, h, slope, c);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
    }
    const idx = new Uint32Array(TERRAIN_SEGMENTS * TERRAIN_SEGMENTS * 6);
    let k = 0;
    for (let iz = 0; iz < TERRAIN_SEGMENTS; iz++) {
      for (let ix = 0; ix < TERRAIN_SEGMENTS; ix++) {
        const a = iz * N1 + ix;
        const b = a + 1;
        const cc = a + N1;
        const d = cc + 1;
        idx[k++] = a;
        idx[k++] = cc;
        idx[k++] = b;
        idx[k++] = cc;
        idx[k++] = d;
        idx[k++] = b;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------

/**
 * Non-playable surroundings: concentric square rings from the terrain's own edge vertices out to
 * ~9 km, following farHeight(). Ring 0 reuses the playable mesh's boundary heights exactly, so
 * there is no seam or visible map edge — the landscape just continues into the fog.
 */
export function FarTerrain() {
  const geometry = useMemo(() => {
    const W = getWorld();
    const N = TERRAIN_SEGMENTS;
    const N1 = N + 1;
    // Perimeter of the playable grid, clockwise.
    const ring: { ix: number; iz: number }[] = [];
    for (let i = 0; i < N; i++) ring.push({ ix: i, iz: 0 });
    for (let i = 0; i < N; i++) ring.push({ ix: N, iz: i });
    for (let i = N; i > 0; i--) ring.push({ ix: i, iz: N });
    for (let i = N; i > 0; i--) ring.push({ ix: 0, iz: i });
    const M = ring.length;
    const RINGS = 24;
    const OUTER = 9000;
    const pos = new Float32Array((RINGS + 1) * M * 3);
    const col = new Float32Array((RINGS + 1) * M * 3);
    const c = new THREE.Color();
    for (let k = 0; k <= RINGS; k++) {
      const f = 1 + Math.pow(k / RINGS, 1.9) * (OUTER / HALF - 1);
      for (let j = 0; j < M; j++) {
        const { ix, iz } = ring[j];
        const bx = -HALF + ix * GRID_STEP;
        const bz = -HALF + iz * GRID_STEP;
        const x = bx * f;
        const z = bz * f;
        const h = k === 0 ? W.heights[iz * N1 + ix] : farHeight(x, z);
        const o = (k * M + j) * 3;
        pos[o] = x;
        pos[o + 1] = h;
        pos[o + 2] = z;
        terrainColor(x, z, h, 0.25, c);
        const n = fbm(x / 260, z / 260, 2, 707) * 0.5 + 0.5;
        if (k > 0) c.lerp(FAR_FOREST, 0.55 + n * 0.25).lerp(FAR_SNOW, smoothstep(150, 210, h) * 0.8);
        col[o] = c.r;
        col[o + 1] = c.g;
        col[o + 2] = c.b;
      }
    }
    const idx = new Uint32Array(RINGS * M * 6);
    let t = 0;
    for (let k = 0; k < RINGS; k++)
      for (let j = 0; j < M; j++) {
        const a = k * M + j;
        const b = k * M + ((j + 1) % M);
        const cc = (k + 1) * M + j;
        const d = (k + 1) * M + ((j + 1) % M);
        idx[t++] = a;
        idx[t++] = b;
        idx[t++] = cc;
        idx[t++] = b;
        idx[t++] = d;
        idx[t++] = cc;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    // Fix winding-independent lighting: make sure normals face up.
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    g.computeBoundingSphere();
    return g;
  }, []);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

const FAR_FOREST = STYLE.farForest;
const FAR_SNOW = STYLE.farSnow;

const TRAIL_COLORS = {
  dirt: C('#a7804f'),
  dirtDark: C('#83603c'),
  scree: C('#9a806a'),
  snow: C('#d2deea'),
};

function ribbonGeometry(line: TrailLine, halfW: number) {
  const n = line.pts.length;
  const ACROSS = 5;
  const pos = new Float32Array(n * ACROSS * 3);
  const col = new Float32Array(n * ACROSS * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = line.pts[Math.max(i - 1, 0)];
    const b = line.pts[Math.min(i + 1, n - 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const px = -dz / l;
    const pz = dx / l;
    const p = line.pts[i];
    const h = line.heights[i];
    const n1 = fbm(p.x / 6, p.z / 6, 2, 301) * 0.5 + 0.5;
    if (h < TREELINE_H) c.copy(TRAIL_COLORS.dirt).lerp(TRAIL_COLORS.dirtDark, n1);
    else c.copy(TRAIL_COLORS.dirt).lerp(TRAIL_COLORS.scree, smoothstep(TREELINE_H, 175, h));
    const slope = 0.3;
    const snow = snowCover(p.x, p.z, heightAt(p.x, p.z), slope);
    c.lerp(TRAIL_COLORS.snow, smoothstep(0.35, 0.65, snow));
    for (let j = 0; j < ACROSS; j++) {
      const t = j / (ACROSS - 1) - 0.5;
      const w = halfW * 2 * t * (1 + 0.15 * Math.sin(i * 0.37 + j));
      const x = p.x + px * w;
      const z = p.z + pz * w;
      const k = (i * ACROSS + j) * 3;
      pos[k] = x;
      pos[k + 1] = heightAt(x, z) + 0.07;
      pos[k + 2] = z;
      const edge = Math.abs(t) * 2;
      const shade = lerp(1.04, 0.86, edge * edge);
      col[k] = c.r * shade;
      col[k + 1] = c.g * shade;
      col[k + 2] = c.b * shade;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < ACROSS - 1; j++) {
      const a = i * ACROSS + j;
      const b = a + 1;
      const cc = a + ACROSS;
      const d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Force normals up-ish so the path is lit like the ground it sits on.
  return g;
}

export function Trail() {
  const geos = useMemo(() => getWorld().lines.map((l) => ribbonGeometry(l, l.main ? TRAIL_HALF_WIDTH : TRAIL_HALF_WIDTH * 0.7)), []);
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-4} />
        </mesh>
      ))}
    </group>
  );
}
