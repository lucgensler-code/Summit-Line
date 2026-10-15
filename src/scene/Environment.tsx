import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fbm, mulberry32, smoothstep } from '../game/noise';
import { clockHour, daylight } from '../game/sim';
import { summitCinematic } from '../game/cinematic';
import { runtime, useGame } from '../game/store';
import { elevationFt, farHeight } from '../game/world';
import { merge, tint } from './Vegetation';

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

const KEYS: Key[] = [
  { h: 3.5, top: '#050b22', horizon: '#1a2546', sun: '#7d8fc4', sunI: 0.38, hemiSky: '#46558a', hemiGround: '#151820', hemiI: 0.85, fog: 0.75 },
  { h: 5.0, top: '#0d1a46', horizon: '#57466e', sun: '#8a95c8', sunI: 0.45, hemiSky: '#5a66a0', hemiGround: '#1d1d24', hemiI: 0.95, fog: 0.8 },
  { h: 5.9, top: '#1f3577', horizon: '#ec8a5e', sun: '#ff8a5c', sunI: 1.0, hemiSky: '#9a8fbe', hemiGround: '#40302a', hemiI: 1.0, fog: 0.85 },
  { h: 6.8, top: '#3466b4', horizon: '#ffbc8a', sun: '#ffb877', sunI: 2.7, hemiSky: '#b6c4e2', hemiGround: '#5e4a36', hemiI: 1.35, fog: 0.95 },
  { h: 8.5, top: '#2f74d0', horizon: '#c9e2f4', sun: '#fff0d4', sunI: 3.1, hemiSky: '#bcd6f4', hemiGround: '#5e4d38', hemiI: 1.3, fog: 1 },
  { h: 12, top: '#246dd0', horizon: '#cfe5f6', sun: '#ffffff', sunI: 3.2, hemiSky: '#c4dcf6', hemiGround: '#62513d', hemiI: 1.35, fog: 1 },
  { h: 15.5, top: '#3474c6', horizon: '#ecd8b8', sun: '#ffe2b0', sunI: 2.8, hemiSky: '#c6d2e8', hemiGround: '#604c36', hemiI: 1.3, fog: 0.85 },
  { h: 17.2, top: '#3566b4', horizon: '#f7c47e', sun: '#ffc070', sunI: 2.4, hemiSky: '#c4c6d8', hemiGround: '#5e4632', hemiI: 1.2, fog: 0.8 },
  { h: 18.3, top: '#253d80', horizon: '#ff8a52', sun: '#ff7a45', sunI: 1.5, hemiSky: '#a892c0', hemiGround: '#40302a', hemiI: 1.1, fog: 0.75 },
  { h: 19.2, top: '#16225a', horizon: '#c0607a', sun: '#d06a7a', sunI: 0.7, hemiSky: '#6a62a0', hemiGround: '#221c24', hemiI: 0.95, fog: 0.72 },
  { h: 20.2, top: '#060c26', horizon: '#232a50', sun: '#7d8fc4', sunI: 0.38, hemiSky: '#46558a', hemiGround: '#151820', hemiI: 0.85, fog: 0.72 },
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
  return t >= 0 && t <= 1 ? Math.sin(Math.PI * t) * 1.05 : -0.3;
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
  const h = g.loadout.departureHour;
  return h < 6 ? 5.75 : h + 0.4;
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
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.6, h), 0.7));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.18 + pow(s, 3.0) * 0.08) * uSunVis;
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
    sunDirection(hour, dir);
    const light = daylight(hour);
    const p = runtime.player;
    if (p && useGame.getState().phase !== 'prep') focus.set(p.x, p.y, p.z);
    else focus.set(camera.position.x, 0, camera.position.z);
    if (sun.current) {
      const s = sun.current;
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
    fog.color.copy(pal.horizon);
    fog.near = 160 + elevBoost * 200;
    fog.far = (2300 + elevBoost * 1600) * pal.fog * (1 - afternoon * 0.35);
    {
      const u = skyMaterial.uniforms;
      u.uTop.value.copy(pal.top);
      u.uHorizon.value.copy(pal.horizon);
      u.uSun.value.copy(pal.sun);
      u.uSunDir.value.copy(dir);
      u.uSunVis.value = smoothstep(-0.04, 0.05, sunElevation(hour));
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
// Distant mountains and ground beyond the playable map.

function peakGeometry(radius: number, height: number, seed: number, jagged: number, snowLine: number) {
  const g = new THREE.ConeGeometry(radius, height, 48, 14, true);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rock = new THREE.Color('#4c5866');
  const forest = new THREE.Color('#2c3a33');
  const snow = new THREE.Color('#e8eef4');
  const c = new THREE.Color();
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
    const snowAmt = smoothstep(snowLine - 0.06, snowLine + 0.04, k + n * 0.15);
    c.copy(forest).lerp(rock, smoothstep(0.15, 0.4, k)).lerp(snow, snowAmt);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const PEAKS: { x: number; z: number; r: number; h: number; jag: number; snow: number; seed: number }[] = [
  { x: -260, z: -2050, r: 820, h: 330, jag: 0.5, snow: 0.6, seed: 3 }, // "Middle sister"
  { x: -760, z: -3100, r: 950, h: 390, jag: 0.8, snow: 0.55, seed: 7 }, // jagged north peak
  { x: 1850, z: 250, r: 750, h: 230, jag: 1.1, snow: 0.7, seed: 11 }, // broken eastern crags
  { x: 1650, z: 2300, r: 900, h: 300, jag: 0.25, snow: 0.62, seed: 19 }, // smooth southern volcano
  { x: -2300, z: 900, r: 1100, h: 180, jag: 0.6, snow: 0.9, seed: 23 },
  { x: -1500, z: 2700, r: 1300, h: 150, jag: 0.5, snow: 2, seed: 29 },
  { x: 3000, z: -1900, r: 1500, h: 220, jag: 0.6, snow: 0.8, seed: 31 },
  { x: 600, z: -3600, r: 1600, h: 260, jag: 0.7, snow: 0.7, seed: 37 },
  { x: -3300, z: -1300, r: 1600, h: 240, jag: 0.7, snow: 0.8, seed: 41 },
];

export function DistantLands() {
  const geos = useMemo(() => PEAKS.map((p) => peakGeometry(p.r, p.h, p.seed, p.jag, p.snow)), []);
  return (
    <group>
      {PEAKS.map((p, i) => (
        <mesh key={i} geometry={geos[i]} position={[p.x, farHeight(p.x, p.z) - 18, p.z]}>
          <meshStandardMaterial vertexColors flatShading roughness={1} />
        </mesh>
      ))}

    </group>
  );
}

export function Clouds() {
  const group = useRef<THREE.Group>(null);
  const { geo, items } = useMemo(() => {
    const rand = mulberry32(99);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const s = 14 + rand() * 18;
      parts.push(tint(new THREE.IcosahedronGeometry(s, 1).scale(1.6, 0.6, 1).translate((rand() - 0.5) * 60, (rand() - 0.5) * 6, (rand() - 0.5) * 30), '#ffffff'));
    }
    const geo = merge(parts);
    const items = Array.from({ length: 16 }, () => {
      const a = rand() * Math.PI * 2;
      const r = 900 + rand() * 1900;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 420 + rand() * 260, s: 0.8 + rand() * 1.4, rot: rand() * 3 };
    });
    return { geo, items };
  }, []);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.0025;
    if (mat.current) {
      const light = daylight(currentHour());
      mat.current.opacity = 0.35 + light * 0.5;
    }
  });
  return (
    <group ref={group}>
      {items.map((c, i) => (
        <mesh key={i} geometry={geo} position={[c.x, c.y, c.z]} scale={c.s} rotation={[0, c.rot, 0]}>
          <meshStandardMaterial ref={i === 0 ? mat : undefined} color="#ffffff" flatShading transparent opacity={0.85} roughness={1} depthWrite={false} />
        </mesh>
      ))}
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
  useFrame(({ clock }) => {
    const p = runtime.player;
    const pts = ref.current;
    if (!pts || !matRef.current) return;
    const ft = p ? elevationFt(p.y) : 0;
    // Faint drifting motes in the forest and meadows, building to spindrift near the summit.
    const high = smoothstep(8600, 9800, ft);
    const amount = useGame.getState().phase === 'prep' ? 0 : 0.22 + high * 0.78;
    matRef.current.opacity = amount * 0.85;
    matRef.current.size = 0.06 + high * 0.04;
    matRef.current.color.set(high > 0.5 ? '#ffffff' : '#fff1c4');
    pts.visible = amount > 0.01;
    if (!pts.visible || !p) return;
    const t = clock.elapsedTime;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const S = 40;
    for (let i = 0; i < COUNT; i++) {
      const sx = seeds[i * 3];
      const sy = seeds[i * 3 + 1];
      const sz = seeds[i * 3 + 2];
      const x = ((((sx * S + t * (9 + sy * 6)) % S) + S) % S) - S / 2;
      const z = ((((sz * S + t * 3 * Math.sin(sx * 6)) % S) + S) % S) - S / 2;
      const y = ((sy * 14 + Math.sin(t * 2 + sx * 30) * 0.8) % 14) - 2;
      pos.setXYZ(i, p.x + x, p.y + y, p.z + z);
    }
    pos.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial ref={matRef} color="#ffffff" size={0.09} transparent opacity={0} depthWrite={false} />
    </points>
  );
}
