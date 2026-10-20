import { useMemo } from 'react';
import * as THREE from 'three';
import { fbm, mulberry32, smoothstep } from '../game/noise';
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
  rockPatch,
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

/**
 * Ground colour and snow colour separately, plus how snowy the spot is (0–1). The terrain mesh
 * blends them per pixel with a noise mask so the snow line is broken and natural; everything
 * else uses `terrainColor`, which blends them per vertex.
 */
export function terrainColor(x: number, z: number, h: number, slope: number, out: THREE.Color) {
  const k = terrainColorParts(x, z, h, slope, out, tmpSnow);
  return out.lerp(tmpSnow, k);
}
const tmpSnow = new THREE.Color();

export function terrainColorParts(x: number, z: number, h: number, slope: number, out: THREE.Color, snowOut: THREE.Color) {
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
  // Exposed dark rock breaking the upper snowfield (rock underfoot in the sim too)
  const patch = rockPatch(x, z, h);
  if (patch > 0) {
    tmp.copy(PAL.basalt).lerp(PAL.cinderDark, n2 * 0.6).multiplyScalar(0.9 + n1 * 0.25);
    out.lerp(tmp, smoothstep(0.15, 0.85, patch));
  }
  // Snow: off-white, cooler on steep faces and in broad wind-scoured bands; a little cinder shows
  // through only at the ragged edge of the snowfield (gameplay snow coverage is unchanged).
  snowOut.copy(PAL.snow).lerp(PAL.snowShade, n2 * 0.3 + smoothstep(0.45, 1.05, slope) * 0.55 + smoothstep(0.55, 0.8, n1) * 0.2);
  const snowK = smoothstep(0.3, 0.68, snow + (n1 - 0.5) * 0.12);
  // Distant plain
  out.lerp(PAL.plain, smoothstep(HALF - 120, HALF - 10, Math.max(Math.abs(x), Math.abs(z))) * 0.7);
  // Subtle brightness variation
  const b = 0.92 + n2 * 0.16;
  out.multiplyScalar(b);
  snowOut.multiplyScalar(0.97 + n2 * 0.06);
  return snowK;
}

export function Terrain() {
  const geometry = useMemo(() => {
    const W = getWorld();
    const N1 = TERRAIN_SEGMENTS + 1;
    const pos = new Float32Array(N1 * N1 * 3);
    const col = new Float32Array(N1 * N1 * 3);
    const snowCol = new Float32Array(N1 * N1 * 3);
    const snowK = new Float32Array(N1 * N1);
    const c = new THREE.Color();
    const sc = new THREE.Color();
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
        snowK[i] = terrainColorParts(x, z, h, slope, c, sc);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        snowCol[i * 3] = sc.r;
        snowCol[i * 3 + 1] = sc.g;
        snowCol[i * 3 + 2] = sc.b;
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
    // Depth (v0.6.1), baked once: ridges and knolls a touch lighter, hollows and gullies darker
    // (curvature), and the forest floor darker under the canopy, so the ground reads in layers.
    const H = W.heights;
    const at = (ix: number, iz: number) => H[Math.min(N1 - 1, Math.max(0, iz)) * N1 + Math.min(N1 - 1, Math.max(0, ix))];
    for (let iz = 0; iz < N1; iz++)
      for (let ix = 0; ix < N1; ix++) {
        const i = iz * N1 + ix;
        const lap = H[i] - (at(ix - 2, iz) + at(ix + 2, iz) + at(ix, iz - 2) + at(ix, iz + 2)) / 4;
        const f = 1 + Math.max(-0.2, Math.min(0.12, lap * 0.09));
        col[i * 3] *= f;
        col[i * 3 + 1] *= f;
        col[i * 3 + 2] *= f;
      }
    for (const t of W.trees) {
      const ix = Math.round((t.x + HALF) / GRID_STEP);
      const iz = Math.round((t.z + HALF) / GRID_STEP);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= N1 || jz >= N1) continue;
          const i = jz * N1 + jx;
          // Fallen needles and shade under the canopy: darker and warmer.
          const f = dx === 0 && dz === 0 ? 0.86 : 0.94;
          col[i * 3] = col[i * 3] * f * 0.85 + DUFF.r * 0.15;
          col[i * 3 + 1] = col[i * 3 + 1] * f * 0.85 + DUFF.g * 0.15;
          col[i * 3 + 2] = col[i * 3 + 2] * f * 0.85 + DUFF.b * 0.15;
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSnowCol', new THREE.BufferAttribute(snowCol, 3));
    g.setAttribute('aSnow', new THREE.BufferAttribute(snowK, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, []);
  const material = useMemo(() => groundMaterial(), []);

  return <mesh geometry={geometry} material={material} receiveShadow />;
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

const DUFF = new THREE.Color('#6b5638');

/**
 * Tileable value-noise texture (R: broad mottling, G: fine grain) used for ground detail and the
 * broken snow line. Generated once, 256², repeats seamlessly.
 */
function detailTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const lattice = (L: number, seed: number) => {
    const r = mulberry32(seed);
    const g = new Float32Array(L * L);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return (u: number, v: number) => {
      const x = u * L;
      const y = v * L;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const at = (i: number, j: number) => g[((j % L) + L) % L * L + (((i % L) + L) % L)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const o1 = lattice(4, 11);
  const o2 = lattice(8, 12);
  const o3 = lattice(16, 13);
  const f1 = lattice(32, 14);
  const f2 = lattice(64, 15);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const broad = o1(u, v) * 0.5 + o2(u, v) * 0.3 + o3(u, v) * 0.2;
      const fine = f1(u, v) * 0.55 + f2(u, v) * 0.45;
      const i = (y * N + x) * 4;
      data[i] = Math.round(broad * 255);
      data[i + 1] = Math.round(fine * 255);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, N, N);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Ground material (v0.7): Lambert with two per-pixel touches — mottled grain so large triangles
 * don't read as flat slabs up close, and snow that blends in through a noise threshold, giving a
 * ragged, natural snow line with patches instead of edges that follow the triangles.
 */
function groundMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tex = detailTexture();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tDetail = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSnowCol;\nattribute float aSnow;\nvarying vec3 vSnowCol;\nvarying float vSnow;\nvarying vec2 vXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowCol = aSnowCol;\nvSnow = aSnow;\nvXZ = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDetail;\nvarying vec3 vSnowCol;\nvarying float vSnow;\nvarying vec2 vXZ;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 dA = texture2D(tDetail, vXZ / 37.0).rg;
        vec2 dB = texture2D(tDetail, vXZ / 6.5).rg;
        float grain = dB.g * 0.6 + dA.g * 0.4;
        diffuseColor.rgb *= 0.86 + 0.28 * (dA.r * 0.55 + grain * 0.45);
        float edge = vSnow + (dA.r - 0.5) * 0.65 + (dB.r - 0.5) * 0.3;
        float mask = smoothstep(0.42, 0.56, edge);
        vec3 snowC = vSnowCol * (0.9 + 0.12 * dB.g + 0.06 * dA.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, snowC, mask);`,
      );
  };
  return m;
}

const FAR_FOREST = STYLE.farForest;
const FAR_SNOW = STYLE.farSnow;

const TRAIL_COLORS = {
  dirt: C('#a7804f'),
  dirtDark: C('#83603c'),
  scree: C('#9a806a'),
  snow: C('#d2deea'),
};

/**
 * Trail ribbon with depth (v0.6.1): a worn tread slightly lighter in the middle, darker
 * compacted edges, and a low raised berm of soil and grass on each side that blends into the
 * surrounding ground. Walking height is still the terrain itself — this is only the surface.
 * Cross-section (offset from centre in half-widths, height above ground, colour role):
 */
const PROFILE: [number, number, 'ground' | 'berm' | 'edge' | 'tread'][] = [
  [-1.3, 0.0, 'ground'],
  [-1.1, 0.09, 'berm'],
  [-0.96, 0.05, 'edge'],
  [-0.5, 0.06, 'tread'],
  [0, 0.065, 'tread'],
  [0.5, 0.06, 'tread'],
  [0.96, 0.05, 'edge'],
  [1.1, 0.09, 'berm'],
  [1.3, 0.0, 'ground'],
];

function ribbonGeometry(line: TrailLine, halfW: number) {
  const n = line.pts.length;
  const ACROSS = PROFILE.length;
  const pos = new Float32Array(n * ACROSS * 3);
  const col = new Float32Array(n * ACROSS * 3);
  const c = new THREE.Color();
  const g0 = new THREE.Color();
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
    if (h < TREELINE_H) c.copy(TRAIL_COLORS.dirt).lerp(TRAIL_COLORS.dirtDark, n1 * 0.8);
    else c.copy(TRAIL_COLORS.dirt).lerp(TRAIL_COLORS.scree, smoothstep(TREELINE_H, 175, h));
    const snow = snowCover(p.x, p.z, heightAt(p.x, p.z), 0.3);
    const snowK = smoothstep(0.35, 0.65, snow);
    c.lerp(TRAIL_COLORS.snow, snowK);
    const wob = 1 + 0.12 * Math.sin(i * 0.37) + 0.06 * Math.sin(i * 1.3);
    for (let j = 0; j < ACROSS; j++) {
      const [off, lift, role] = PROFILE[j];
      const w = halfW * off * wob;
      const x = p.x + px * w;
      const z = p.z + pz * w;
      const k = (i * ACROSS + j) * 3;
      const gh = heightAt(x, z);
      pos[k] = x;
      pos[k + 1] = gh + lift + 0.02;
      pos[k + 2] = z;
      terrainColor(x, z, gh, 0.3, g0);
      let out: THREE.Color;
      if (role === 'ground') out = g0;
      else if (role === 'berm') out = g0.multiplyScalar(0.8).lerp(c, 0.12);
      else if (role === 'edge') out = c.clone().multiplyScalar(0.84).lerp(g0, 0.15);
      else out = c.clone().multiplyScalar(off === 0 ? 1.06 : 1.0);
      col[k] = out.r;
      col[k + 1] = out.g;
      col[k + 2] = out.b;
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
  // Normals face up whatever the winding, so the path is lit like the ground it sits on.
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return g;
}

export function Trail() {
  const geos = useMemo(() => getWorld().lines.map((l) => ribbonGeometry(l, l.main ? TRAIL_HALF_WIDTH : TRAIL_HALF_WIDTH * 0.7)), []);
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshLambertMaterial vertexColors polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-4} />
        </mesh>
      ))}
    </group>
  );
}
