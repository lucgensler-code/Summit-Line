import { useMemo } from 'react';
import * as THREE from 'three';
import { fbm, lerp, smoothstep } from '../game/noise';
import {
  GRID_STEP,
  HALF,
  LAKE,
  TERRAIN_SEGMENTS,
  TRAIL_HALF_WIDTH,
  TREELINE_H,
  getWorld,
  heightAt,
  snowCover,
  type TrailLine,
} from '../game/world';

const C = (hex: string) => new THREE.Color(hex);
const PAL = {
  duff: C('#6a5a36'),
  moss: C('#3f6a2a'),
  forest: C('#4f6e33'),
  meadowDry: C('#a59a52'),
  meadowGreen: C('#6c8c38'),
  cinder: C('#93492f'),
  cinderDark: C('#5c362c'),
  pumice: C('#a89582'),
  basalt: C('#433a3a'),
  snow: C('#f4f8fc'),
  snowShade: C('#c4d6ec'),
  plain: C('#3e5629'),
  shore: C('#74674f'),
};

const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

export function terrainColor(x: number, z: number, h: number, slope: number, out: THREE.Color) {
  const n1 = fbm(x / 38, z / 38, 3, 201) * 0.5 + 0.5;
  const n2 = fbm(x / 9, z / 9, 2, 211) * 0.5 + 0.5;

  // Forest floor
  out.copy(PAL.forest).lerp(PAL.duff, n1 * 0.7).lerp(PAL.moss, smoothstep(0.55, 0.8, n2) * 0.5);
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
  tmp2.copy(PAL.snow).lerp(PAL.snowShade, n2 * 0.35 + smoothstep(0.6, 1.1, slope) * 0.4);
  out.lerp(tmp2, smoothstep(0.25, 0.65, snow));
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
