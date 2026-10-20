import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fbm, mulberry32, smoothstep } from '../game/noise';
import { clockHour, daylight } from '../game/sim';
import { summitCinematic } from '../game/cinematic';
import { runtime, useGame } from '../game/store';
import { HALF, elevationFt, farHeight, getWorld, heightAt } from '../game/world';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STYLE, hazeMaterial } from './style';
import { quality } from './Performance';

// ---------------------------------------------------------------------------------------------
// Time-of-day palette.

interface Key {
  h: number;
  top: string;
  horizon: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  fog: number;
}

// v0.6 palette: lavender-blue skies, peach horizons at the golden hours, warm sun and a cool
// lavender sky fill so shadows read blue against sunlit faces (hemisphere intensities stay below
// the sun's so form is legible on snow).
const KEYS: Key[] = [
  { h: 3.5, top: '#070c26', horizon: '#1d2548', sun: '#7d8fc4', sunI: 0.38, hemiSky: '#4a5590', hemiGround: '#171a24', hemiI: 0.8, fog: 0.75 },
  { h: 5.0, top: '#1b2152', horizon: '#6a4d7c', sun: '#9a8ec8', sunI: 0.5, hemiSky: '#6a679f', hemiGround: '#221d28', hemiI: 0.9, fog: 0.8 },
  { h: 5.9, top: '#3a4387', horizon: '#ee9a80', sun: '#ff9a6a', sunI: 1.1, hemiSky: '#9c92c6', hemiGround: '#46363a', hemiI: 0.95, fog: 0.85 },
  { h: 6.8, top: '#5d78c0', horizon: '#ffc4a2', sun: '#ffc290', sunI: 2.7, hemiSky: '#b3b6dc', hemiGround: '#5e4c44', hemiI: 1.1, fog: 0.95 },
  { h: 8.5, top: '#5a84cc', horizon: '#d8e0ee', sun: '#fff0d8', sunI: 3.0, hemiSky: '#b0bde4', hemiGround: '#62544a', hemiI: 0.98, fog: 1 },
  { h: 12, top: '#5786d0', horizon: '#dce4f0', sun: '#fff8ec', sunI: 3.1, hemiSky: '#b2c0e6', hemiGround: '#64564a', hemiI: 0.98, fog: 1 },
  { h: 15.5, top: '#5d84c8', horizon: '#e8dccc', sun: '#ffe6c2', sunI: 2.9, hemiSky: '#bcc0e0', hemiGround: '#62523f', hemiI: 1.08, fog: 0.92 },
  { h: 17.2, top: '#6577bd', horizon: '#f6c6a2', sun: '#ffc27e', sunI: 2.5, hemiSky: '#bab2d8', hemiGround: '#5c463c', hemiI: 1.05, fog: 0.88 },
  { h: 18.3, top: '#5a5ea8', horizon: '#f4a688', sun: '#ff9864', sunI: 1.8, hemiSky: '#a99bce', hemiGround: '#46383e', hemiI: 1.0, fog: 0.85 },
  { h: 19.2, top: '#272b66', horizon: '#c27492', sun: '#d07486', sunI: 0.75, hemiSky: '#6e66a6', hemiGround: '#241e28', hemiI: 0.9, fog: 0.78 },
  { h: 20.2, top: '#080e2a', horizon: '#252c52', sun: '#7d8fc4', sunI: 0.38, hemiSky: '#4a5590', hemiGround: '#171a24', hemiI: 0.8, fog: 0.75 },
];

const cB = new THREE.Color();

const PAL = {
  top: new THREE.Color(),
  horizon: new THREE.Color(),
  sun: new THREE.Color(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  sunI: 0,
  hemiI: 0,
  fog: 1,
};

/** Interpolated sky/light palette for a clock hour (any value; wraps at 24 h). Reuses objects. */
function samplePalette(hour: number) {
  hour = ((hour % 24) + 24) % 24;
  // Cyclic: between the last key (evening) and the first (pre-dawn) we interpolate across midnight.
  let a = KEYS[KEYS.length - 1];
  let b = KEYS[0];
  let ah = a.h - 24;
  let bh = b.h;
  let hh = hour > a.h ? hour - 24 : hour;
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) {
      a = KEYS[i];
      b = KEYS[i + 1];
      ah = a.h;
      bh = b.h;
      hh = hour;
      break;
    }
  }
  const lin = THREE.MathUtils.clamp((hh - ah) / (bh - ah), 0, 1);
  const t = lin * lin * (3 - 2 * lin); // ease between keys: no visible kinks
  const mix = (x: string, y: string, out: THREE.Color) => out.set(x).lerp(cB.set(y), t);
  mix(a.top, b.top, PAL.top);
  mix(a.horizon, b.horizon, PAL.horizon);
  mix(a.sun, b.sun, PAL.sun);
  mix(a.hemiSky, b.hemiSky, PAL.hemiSky);
  mix(a.hemiGround, b.hemiGround, PAL.hemiGround);
  PAL.sunI = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
  PAL.hemiI = THREE.MathUtils.lerp(a.hemiI, b.hemiI, t);
  PAL.fog = THREE.MathUtils.lerp(a.fog, b.fog, t);
  return PAL;
}

/** Sun direction: rises in the east, arcs through the south, sets in the west. */
const MOON = new THREE.Vector3(-0.45, 0.75, 0.5).normalize();
const SUNV = new THREE.Vector3();

/** Raw sun elevation (radians, negative below the horizon) for a clock hour. */
export function sunElevation(hour: number) {
  hour = ((hour % 24) + 24) % 24;
  const t = (hour - 6) / 13;
  // Continuous through sunrise and sunset, so the disc slides below the horizon instead of popping.
  return t >= -0.2 && t <= 1.2 ? Math.max(-0.3, Math.sin(Math.PI * t) * 1.05) : -0.3;
}

/**
 * Where the sun disc is drawn: rises due east (+x), crosses the south, sets due west (−x) — the
 * same frame as the compass and minimap (north = −z). Unlike the key light it is never blended
 * toward the moon, so the disc sits on the true horizon point at sunrise and sunset.
 */
export function sunDiscDirection(hour: number, out: THREE.Vector3) {
  hour = ((hour % 24) + 24) % 24;
  const t = (hour - 6) / 13;
  const az = Math.PI * THREE.MathUtils.clamp(t, -0.2, 1.2);
  const elev = sunElevation(hour);
  return out.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
}

/** Key-light direction: the sun by day, cross-fading continuously to moonlight at night. */
export function sunDirection(hour: number, out: THREE.Vector3) {
  hour = ((hour % 24) + 24) % 24;
  const t = (hour - 6) / 13; // 0 sunrise .. 1 sunset
  const az = Math.PI * THREE.MathUtils.clamp(t, -0.08, 1.08); // 0 = east, π/2 = south, π = west
  const elev = Math.max(sunElevation(hour), 0.02);
  SUNV.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
  const w = smoothstep(-0.02, 0.16, sunElevation(hour));
  return out.copy(MOON).lerp(SUNV, w).normalize();
}

export function currentHour() {
  const g = useGame.getState();
  const p = runtime.player;
  if (p && g.phase === 'summit' && p.summited) return summitCinematic().hour;
  if (p && g.phase !== 'prep') return clockHour(p, runtime.loadout);
  // Home screen lighting follows the chosen start: alpine start = purple pre-dawn with stars,
  // sunrise = warm orange morning, late start = full afternoon daylight. Eases between themes.
  const h = g.loadout.departureHour;
  const target = h < 6 ? 5.55 : h < 8 ? 6.6 : 14;
  const now = performance.now() / 1000;
  const dt = Math.min(0.25, now - prepEase.t);
  prepEase.t = now;
  const e = 1 - Math.exp(-dt * 2.2);
  if (prepEase.h < 0) {
    prepEase.h = target;
    prepEase.alpine = h < 6 ? 1 : 0;
    prepEase.morning = h >= 6 && h < 8 ? 1 : 0;
  }
  prepEase.h += (target - prepEase.h) * e;
  prepEase.alpine += ((h < 6 ? 1 : 0) - prepEase.alpine) * e;
  prepEase.morning += ((h >= 6 && h < 8 ? 1 : 0) - prepEase.morning) * e;
  return prepEase.h;
}
/** Home-screen theme state: eased hour plus how strongly each start-time look is applied. */
const prepEase = { h: -1, t: 0, alpine: 0, morning: 0 };

/** Home-screen looks (v0.5): pink/magenta predawn alpenglow, and a warm orange sunrise. */
const THEME_ALPINE: Key = { h: 0, top: '#2b1d5e', horizon: '#e0709e', sun: '#ff86ad', sunI: 1.1, hemiSky: '#9a74b4', hemiGround: '#2c1e2c', hemiI: 1.0, fog: 0.85 };
const THEME_MORNING: Key = { h: 0, top: '#3b5ea8', horizon: '#ff9850', sun: '#ff9d50', sunI: 2.6, hemiSky: '#d2ad92', hemiGround: '#5e4030', hemiI: 1.25, fog: 0.95 };
function applyTheme(pal: typeof PAL, th: Key, w: number) {
  if (w < 0.001) return;
  pal.top.lerp(cB.set(th.top), w);
  pal.horizon.lerp(cB.set(th.horizon), w);
  pal.sun.lerp(cB.set(th.sun), w);
  pal.hemiSky.lerp(cB.set(th.hemiSky), w);
  pal.hemiGround.lerp(cB.set(th.hemiGround), w);
  pal.sunI += (th.sunI - pal.sunI) * w;
  pal.hemiI += (th.hemiI - pal.hemiI) * w;
  pal.fog += (th.fog - pal.fog) * w;
}

// ---------------------------------------------------------------------------------------------

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // keep on the far plane
}`;

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uSunVis;
uniform float uStars;
uniform float uLow;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.6, h), 0.7));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.18 + pow(s, 3.0) * 0.08) * uSunVis;
  // Sunrise / sunset: a broad warm glow along the horizon around the sun.
  vec3 dh = normalize(vec3(d.x, 0.0, d.z));
  vec3 sh = normalize(vec3(uSunDir.x, 0.0001, uSunDir.z));
  float az = max(dot(dh, sh), 0.0);
  col += uSun * pow(az, 5.0) * exp(-max(h, 0.0) * 7.0) * 0.55 * uLow * smoothstep(-0.25, 0.0, uSunDir.y);
  // horizon haze band
  col = mix(col, uHorizon * 1.05, smoothstep(0.12, 0.0, abs(h - 0.01)) * 0.35);
  // stars
  if (uStars > 0.01 && h > 0.0) {
    vec3 g = floor(d * 300.0);
    float r = hash(g);
    float st = step(0.996, r) * (0.6 + 0.4 * fract(r * 37.0));
    col += vec3(st * 1.6) * uStars * smoothstep(0.0, 0.12, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const skyMaterial = new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uSun: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunVis: { value: 1 },
    uStars: { value: 0 },
    uLow: { value: 0 },
  },
});

function SkyDome() {
  const mat = skyMaterial;
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} frustumCulled={false} name="sky">
      <sphereGeometry args={[5000, 32, 16]} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------

export function Atmosphere() {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const fog = useMemo(() => new THREE.Fog('#cfe0ec', 220, 3600), []);
  const focus = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    scene.fog = fog;
    scene.add(target);
    return () => {
      scene.fog = null;
      scene.remove(target);
    };
  }, [scene, fog, target]);

  useFrame(({ camera }) => {
    const hour = currentHour();
    const pal = samplePalette(hour);
    if (useGame.getState().phase === 'prep') {
      applyTheme(pal, THEME_ALPINE, prepEase.alpine * 0.85);
      applyTheme(pal, THEME_MORNING, prepEase.morning * 0.7);
    }
    sunDirection(hour, dir);
    const light = daylight(hour);
    const p = runtime.player;
    if (p && useGame.getState().phase !== 'prep') focus.set(p.x, p.y, p.z);
    else focus.set(camera.position.x, 0, camera.position.z);
    if (sun.current) {
      const s = sun.current;
      // Long, softer shadows when the sun is low; crisper at midday.
      s.shadow.radius = 1.5 + 3 * (1 - smoothstep(0.1, 0.6, sunElevation(hour)));
      s.color.copy(pal.sun);
      s.intensity = pal.sunI;
      s.position.copy(focus).addScaledVector(dir, 160);
      target.position.copy(focus);
      s.target = target;
    }
    if (hemi.current) {
      hemi.current.color.copy(pal.hemiSky);
      hemi.current.groundColor.copy(pal.hemiGround);
      hemi.current.intensity = pal.hemiI;
    }
    // Fog: thin in clear morning air, thicker haze in the afternoon and at night.
    const h24 = ((hour % 24) + 24) % 24;
    const afternoon = smoothstep(13, 17, h24) * (1 - smoothstep(18, 20, h24));
    const elevBoost = p ? smoothstep(7000, 10000, elevationFt(p.y)) : 0.4;
    // Haze: a cool blend of horizon and sky light, so distance turns paler and bluer rather than
    // orange. Distant ranges read the same colour (HAZE) for seamless atmospheric perspective.
    HAZE.copy(pal.horizon).lerp(pal.hemiSky, 0.45).lerp(pal.top, 0.08);
    fog.color.copy(HAZE);
    // The far ranges carry their own haze, so scene fog can be shorter: foothills beyond the map
    // melt into the same mist the ranges rise out of.
    fog.near = 120 + elevBoost * 140;
    fog.far = (1900 + elevBoost * 900) * pal.fog * (1 - afternoon * 0.2);
    {
      const u = skyMaterial.uniforms;
      u.uTop.value.copy(pal.top);
      u.uHorizon.value.copy(pal.horizon);
      u.uSun.value.copy(pal.sun);
      sunDiscDirection(hour, u.uSunDir.value);
      u.uSunVis.value = smoothstep(-0.06, 0.03, sunElevation(hour));
      u.uLow.value = 1 - smoothstep(0.04, 0.4, sunElevation(hour));
      u.uStars.value = 1 - smoothstep(0, 0.35, light);
    }
  });

  return (
    <>
      <SkyDome />
      <hemisphereLight ref={hemi} args={['#bcd2ea', '#5a4c3c', 0.8]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2.5}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Distant mountains and ground beyond the playable map (v0.6).
//
// Everything past the playable map uses `hazeMaterial`: albedo dimmed by a per-vertex haze amount
// plus the current haze colour as emission. Haze rises with distance (paler, bluer ranges) and
// toward the base of each form (valley mist), so the layers read like the reference panorama at
// the cost of one opaque draw call per form — no transparency, no volumetrics.

/** Live haze colour: a cool blend of the horizon and sky light, updated by <Atmosphere/>. */
export const HAZE = new THREE.Color('#c8d0e4');

const _c = new THREE.Color();
/** Bake vertex colours (albedo × (1 − haze)) and uv.y = haze into a non-indexed geometry. */
function bakeHaze(g: THREE.BufferGeometry, albedo: (x: number, y: number, z: number, out: THREE.Color) => void, haze: (y: number) => number) {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = Math.min(1, Math.max(0, haze(y)));
    albedo(x, y, z, _c);
    _c.multiplyScalar(1 - h);
    col.set([_c.r, _c.g, _c.b], i * 3);
    uv.set([0.5, h], i * 2);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/** A broad, faceted volcano/peak with irregular snow (local coordinates, base at y = 0). */
function peakGeometry(radius: number, height: number, seed: number, jagged: number, snowLine: number, baseHaze: number) {
  const g = new THREE.ConeGeometry(radius, height, 22, 7, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i) + height / 2;
    const z = pos.getZ(i);
    const a = Math.atan2(x, z);
    const k = y / height;
    const n = fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + k * 3, 4, seed) * jagged;
    const rs = 1 + n * (1 - k) * 0.6;
    const yy = Math.pow(k, 1.25 + 0.4 * Math.sin(seed)) * height * (1 + n * 0.25);
    pos.setXYZ(i, x * rs, yy, z * rs);
  }
  return bakeHaze(
    g,
    (x, y, z, out) => {
      const k = y / height;
      const a = Math.atan2(x, z);
      const n = fbm(Math.cos(a) * 3 + seed, k * 4, 3, seed + 3);
      const snowAmt = smoothstep(snowLine - 0.05, snowLine + 0.05, k + n * 0.2);
      out.copy(STYLE.farForest).lerp(STYLE.farRock, smoothstep(0.12, 0.35, k)).lerp(STYLE.farSnow, snowAmt);
    },
    (y) => baseHaze + (1 - baseHaze) * smoothstep(height * 0.32, 0, y) * 0.75,
  );
}

/**
 * A full ring of ridgelines around the world at radius `R`: one band of broad facets whose
 * crest varies with angle. Three of these, paler with distance, give every heading layered
 * mountain profiles and hide the map boundary.
 */
function ridgeRing(R: number, seg: number, crest: number, amp: number, seed: number, haze: number, snowY: number) {
  const pos: number[] = [];
  // Separate mountains rather than a wall: a periodic noise raised to a power gives broad peaks
  // and saddles that dip to the foothills, plus a sharper secondary layer for summits.
  const crestAt = (a: number) => {
    const n = fbm(Math.cos(a) * 3.2 + seed, Math.sin(a) * 3.2 - seed, 3, seed) * 0.5 + 0.5;
    const peak = Math.max(0, fbm(Math.cos(a) * 7 + seed * 2, Math.sin(a) * 7, 2, seed + 9));
    return crest * 0.25 + amp * (Math.pow(n, 2.2) * 2.6 + Math.pow(peak, 1.5) * 1.2);
  };
  const rows = (a: number, j: number) => {
    const c = crestAt(a);
    const wob = fbm(Math.cos(a) * 9 + j, Math.sin(a) * 9, 2, seed + 4) * 90;
    return [
      [Math.sin(a) * (R - 420), -90, Math.cos(a) * (R - 420)],
      [Math.sin(a) * (R - 150 + wob), c * 0.5, Math.cos(a) * (R - 150 + wob)],
      [Math.sin(a) * (R + 80), c, Math.cos(a) * (R + 80)],
    ];
  };
  let prev = rows(0, 0);
  for (let j = 1; j <= seg; j++) {
    const cur = rows((j / seg) * Math.PI * 2, j);
    for (let r = 0; r < 2; r++) {
      const [a0, a1, b0, b1] = [prev[r], prev[r + 1], cur[r], cur[r + 1]];
      // Two triangles per cell, wound to face the centre of the world.
      pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
    }
    prev = cur;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return bakeHaze(
    g,
    (x, y, z, out) => {
      const n = fbm(x / 600, z / 600, 2, seed + 7) * 0.5 + 0.5;
      out.copy(STYLE.farForest).lerp(STYLE.farRock, smoothstep(crest * 0.25, crest * 0.9, y) * (0.6 + n * 0.4)).lerp(STYLE.farSnow, smoothstep(snowY - 25, snowY + 15, y + n * 40));
    },
    // Valley mist: haze thickens toward the foot of each range.
    (y) => haze + (1 - haze) * smoothstep(crest * 0.75, -40, y) * 0.85,
  );
}

const RINGS = [
  { R: 2300, seg: 180, crest: 120, amp: 120, seed: 5, haze: 0.38, snowY: 290 },
  { R: 3300, seg: 150, crest: 150, amp: 150, seed: 13, haze: 0.54, snowY: 290 },
  { R: 4700, seg: 120, crest: 200, amp: 200, seed: 29, haze: 0.68, snowY: 330 },
];

/** Secondary snow peaks spread around the compass (the reveal range is separate, below). */
const PEAKS: { x: number; z: number; r: number; h: number; jag: number; snow: number; seed: number; haze: number }[] = [
  { x: 3300, z: 600, r: 1100, h: 560, jag: 0.6, snow: 0.55, seed: 11, haze: 0.5 }, // east
  { x: 1900, z: 3400, r: 1200, h: 620, jag: 0.35, snow: 0.5, seed: 19, haze: 0.52 }, // south-east volcano
  { x: -1800, z: 3700, r: 1250, h: 540, jag: 0.7, snow: 0.55, seed: 23, haze: 0.56 }, // south-west
  { x: 900, z: -4300, r: 1300, h: 600, jag: 0.8, snow: 0.5, seed: 37, haze: 0.6 }, // north
];

/**
 * The summit reveal: the range beyond Cindercrest, hidden from the trail by the mountain itself.
 * Taller than Cindercrest so it rises above the horizon from the top: a glaciated "next mountain"
 * and three more great peaks around it — the levels to come.
 */
const REVEAL: { ahead: number; lateral: number; r: number; h: number; jag: number; snow: number; seed: number; haze: number }[] = [
  // Laid out along the final approach to the summit (v0.5.1), so they rise on the horizon directly
  // behind the summit marker: `ahead` = distance past the summit, `lateral` = + right / − left.
  { ahead: 2550, lateral: 0, r: 1000, h: 900, jag: 0.9, snow: 0.42, seed: 53, haze: 0.16 }, // the next mountain
  { ahead: 3300, lateral: -1450, r: 1250, h: 1050, jag: 0.7, snow: 0.45, seed: 61, haze: 0.32 },
  { ahead: 3800, lateral: 1550, r: 1300, h: 930, jag: 1.0, snow: 0.48, seed: 67, haze: 0.42 },
  { ahead: 4700, lateral: -350, r: 1500, h: 1150, jag: 0.6, snow: 0.5, seed: 71, haze: 0.52 },
];

/** Horizontal direction of the last stretch of trail into the summit (unit vector). */
function approachDir() {
  const m = getWorld().main;
  const n = m.pts.length;
  let i = n - 1;
  while (i > 0 && m.s[n - 1] - m.s[i] < 22) i--;
  const dx = m.pts[n - 1].x - m.pts[i].x;
  const dz = m.pts[n - 1].z - m.pts[i].z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
}

export function DistantLands() {
  const ringGeos = useMemo(() => RINGS.map((r) => ridgeRing(r.R, r.seg, r.crest, r.amp, r.seed, r.haze, r.snowY)), []);
  const geos = useMemo(() => PEAKS.map((p) => peakGeometry(p.r, p.h, p.seed, p.jag, p.snow, p.haze)), []);
  const revealGeos = useMemo(() => REVEAL.map((p) => peakGeometry(p.r, p.h, p.seed, p.jag, p.snow, p.haze)), []);
  const revealPos = useMemo(() => {
    const W = getWorld();
    const f = approachDir();
    // right-hand perpendicular of the approach direction
    const rx = -f.z;
    const rz = f.x;
    return REVEAL.map((p) => [W.summit.x + f.x * p.ahead + rx * p.lateral, -40, W.summit.z + f.z * p.ahead + rz * p.lateral] as [number, number, number]);
  }, []);
  // One shared haze material for rings and peaks; the reveal has its own (it fades in).
  const farMat = useMemo(() => {
    const m = hazeMaterial();
    m.side = THREE.DoubleSide; // rings are seen from inside
    return m;
  }, []);
  const revealMat = useMemo(() => hazeMaterial(), []);
  // Kept for the reveal: hidden on the home screen and on the way up, faded in on the final rim
  // traverse, fully there for the summit celebration.
  const reveal = useRef<THREE.Group>(null);
  const fade = useRef(0);
  useFrame((_, dt) => {
    farMat.emissive.copy(HAZE);
    const g = useGame.getState();
    const p = runtime.player;
    const want = g.phase === 'summit' || (p && g.phase !== 'prep' && elevationFt(p.y) > 9950) ? 1 : 0;
    fade.current += (want - fade.current) * (1 - Math.exp(-Math.min(dt, 0.1) * (want ? 1.2 : 6)));
    if (want === 0 && fade.current < 0.01) fade.current = 0;
    if (reveal.current) reveal.current.visible = fade.current > 0.005;
    if (!reveal.current?.visible) return;
    revealMat.emissive.copy(HAZE);
    const solid = fade.current > 0.995;
    if (revealMat.transparent === solid) {
      revealMat.transparent = !solid;
      revealMat.needsUpdate = true;
    }
    revealMat.opacity = fade.current;
  });
  return (
    <group>
      {RINGS.map((_, i) => (
        <mesh key={`ring${i}`} geometry={ringGeos[i]} material={farMat} frustumCulled={false} />
      ))}
      {PEAKS.map((p, i) => (
        <mesh key={i} geometry={geos[i]} material={farMat} position={[p.x, -60, p.z]} />
      ))}
      <group ref={reveal} visible={false}>
        {REVEAL.map((_, i) => (
          <mesh key={`r${i}`} geometry={revealGeos[i]} material={revealMat} position={revealPos[i]} />
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Valley mist (v0.6.1): two soft, partly see-through layers lying in the valleys beyond the
// playable map, between the ridgelines. Cheap unlit transparent rings; dropped on low quality.

function mistTexture() {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = (x / (n - 1)) * 2 - 1;
      const v = (y / (n - 1)) * 2 - 1;
      const r = Math.hypot(u, v); // 0 centre … 1 outer edge of the ring geometry
      const inner = smoothstep(0.19, 0.3, r);
      const outer = 1 - smoothstep(0.72, 1.0, r);
      const patch = 0.55 + 0.45 * (fbm(u * 6, v * 6, 3, 515) * 0.5 + 0.5);
      const a = inner * outer * patch;
      const o = (y * n + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

export function ValleyMist() {
  const ref = useRef<THREE.Group>(null);
  const { geo, mats } = useMemo(() => {
    const tex = mistTexture();
    const geo = new THREE.RingGeometry(900, 5000, 96, 1).rotateX(-Math.PI / 2);
    // Planar UVs across the ring's full square so the texture's radius matches the ring radius.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 10000 + 0.5, pos.getZ(i) / 10000 + 0.5);
    const mk = (o: number) => new THREE.MeshBasicMaterial({ color: '#ffffff', alphaMap: tex, transparent: true, opacity: o, depthWrite: false, fog: false });
    return { geo, mats: [mk(0.55), mk(0.4)] };
  }, []);
  useFrame(() => {
    if (ref.current) ref.current.visible = quality.mist;
    const light = daylight(currentHour());
    for (const m of mats) m.color.copy(HAZE).multiplyScalar(0.85 + light * 0.2);
  });
  return (
    <group ref={ref}>
      <mesh geometry={geo} material={mats[0]} position={[0, 45, 0]} renderOrder={-1} />
      <mesh geometry={geo} material={mats[1]} position={[0, 110, 0]} rotation={[0, 1.3, 0]} renderOrder={-1} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Clouds (v0.6.1): rounded, softly shaded cumulus built from overlapping smooth mounds — a mid
// layer drifting beside the mountain at heights you climb past, and a high layer far out. They
// are opaque (stars never show through) and take scene fog, so distant ones melt into the haze.
// Each layer is a single merged mesh: two draw calls in total.

function groundAt(x: number, z: number) {
  return Math.max(Math.abs(x), Math.abs(z)) < HALF - 2 ? heightAt(x, z) : farHeight(x, z);
}

function cloudLayer(count: number, seed: number, rMin: number, rMax: number, yMin: number, yMax: number, size: number, detail: number) {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  let placed = 0;
  for (let t = 0; t < count * 40 && placed < count; t++) {
    const a = rand() * Math.PI * 2;
    const r = rMin + rand() * (rMax - rMin);
    const cx = Math.sin(a) * r;
    const cz = Math.cos(a) * r;
    const cy = yMin + rand() * (yMax - yMin);
    const w = size * (0.7 + rand() * 0.7);
    // Keep clear of the mountain: sample the ground under the whole cloud.
    let clear = true;
    for (const [ox, oz] of [[0, 0], [w * 1.6, 0], [-w * 1.6, 0], [0, w], [0, -w]])
      if (groundAt(cx + ox, cz + oz) > cy - w * 0.9) clear = false;
    if (!clear) continue;
    placed++;
    const blobs = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < blobs; i++) {
      const br = w * (i === 0 ? 0.62 : 0.32 + rand() * 0.3);
      const g = new THREE.IcosahedronGeometry(br, detail);
      const ox = (rand() - 0.5) * w * 2.6;
      const oz = (rand() - 0.5) * w * 1.2;
      const oy = (rand() - 0.2) * w * 0.35;
      g.scale(1.15, 0.55, 1).translate(cx + ox, cy + oy, cz + oz);
      const welded = new THREE.BufferGeometry();
      welded.setAttribute('position', g.attributes.position);
      const m = mergeVertices(welded, 1e-3);
      m.computeVertexNormals();
      // Flattened, shaded base; bright, sunlit tops.
      const pos = m.attributes.position;
      const colr = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k);
        if (y < cy - w * 0.12) pos.setY(k, cy - w * 0.12 - (cy - w * 0.12 - y) * 0.25);
        const up = Math.min(1, Math.max(0, (pos.getY(k) - (cy - w * 0.2)) / (w * 0.8)));
        const v = 0.74 + up * 0.26;
        colr.set([v * 0.97, v * 0.97, v], k * 3);
      }
      m.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      m.computeVertexNormals();
      parts.push(m);
    }
  }
  return mergeGeometries(parts, false)!;
}

export function Clouds() {
  const high = useRef<THREE.Mesh>(null);
  const { mid, top, mat } = useMemo(
    () => ({
      mid: cloudLayer(9, 41, 300, 760, 150, 330, 26, 2),
      top: cloudLayer(16, 99, 1000, 2900, 470, 700, 70, 1),
      mat: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#ffffff') }),
    }),
    [],
  );
  useFrame((_, dt) => {
    if (high.current) high.current.rotation.y += dt * 0.0025;
    // A little self-light so cloud undersides stay soft rather than grey; tinted by the hour.
    const pal = samplePalette(currentHour());
    mat.emissive.copy(pal.horizon).lerp(HAZE, 0.5).multiplyScalar(0.18 + daylight(currentHour()) * 0.12);
  });
  return (
    <group>
      <mesh geometry={mid} material={mat} />
      <mesh ref={high} geometry={top} material={mat} />
    </group>
  );
}

/** Wind-blown snow crystals around the climber high on the mountain. */
export function Spindrift() {
  const ref = useRef<THREE.Points>(null);
  const COUNT = 600;
  const { geo, seeds } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const rand = mulberry32(5);
    const seeds = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT * 3; i++) seeds[i] = rand();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo, seeds };
  }, []);
  const matRef = useRef<THREE.PointsMaterial>(null);
  useFrame(({ clock, camera }) => {
    const p = runtime.player;
    const pts = ref.current;
    if (!pts || !matRef.current) return;
    const ft = p ? elevationFt(p.y) : 0;
    // The particles live in a volume that wraps around the camera (world-anchored, so they don't
    // swim), and fade out as the camera pulls back — no visible "snow box" when zoomed out.
    const zoomFade = 1 - smoothstep(12, 26, runtime.cam.dist);
    // Faint drifting motes in the forest and meadows, building to spindrift near the summit.
    const high = smoothstep(8600, 9800, ft);
    const phase = useGame.getState().phase;
    const amount = phase === 'prep' || phase === 'summit' ? 0 : (0.22 + high * 0.78) * zoomFade;
    matRef.current.opacity = amount * 0.85;
    matRef.current.size = 0.06 + high * 0.04;
    matRef.current.color.set(high > 0.5 ? '#ffffff' : '#fff1c4');
    pts.visible = amount > 0.01;
    if (!pts.visible || !p) return;
    const t = clock.elapsedTime;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const S = 30;
    const H = 16;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const wrap = (v: number, m: number) => ((v % m) + m) % m;
    for (let i = 0; i < COUNT; i++) {
      const sx = seeds[i * 3];
      const sy = seeds[i * 3 + 1];
      const sz = seeds[i * 3 + 2];
      const x = cx + wrap(sx * S * 7 + t * (9 + sy * 6) - cx, S) - S / 2;
      const z = cz + wrap(sz * S * 7 + t * 3 * Math.sin(sx * 6) - cz, S) - S / 2;
      const y = cy + wrap(sy * H * 7 - t * (0.6 + sx) + Math.sin(t * 2 + sx * 30) * 0.8 - cy, H) - H / 2;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial ref={matRef} color="#ffffff" size={0.09} transparent opacity={0} depthWrite={false} />
    </points>
  );
}
