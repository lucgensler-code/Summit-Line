import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { runtime, useGame } from '../game/store';
import { getWorld, type Gem } from '../game/world';
import { gemBaseKitGeometry, gemKitGeometry } from '../kit/catalogue';
import { CINDERCREST } from '../recipes';
import { smoothstep } from '../game/noise';
import { alphaTexture, dotTexture } from './textures';

const TOUCH = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

const STYLE = {
  green: { color: '#22e07f', emissive: '#0aa552', glow: '#5dff9e', spark: new THREE.Color('#7dffb0') },
  red: { color: '#ff3d3d', emissive: '#c4101c', glow: '#ff7a4d', spark: new THREE.Color('#ff9a5c') },
} as const;

function glowTexture() {
  // Radial glow: 1 at the centre, 0.55 a quarter of the way out, fading to 0 at the edge.
  return alphaTexture(64, 64, (u, v) => {
    const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    return r < 0.25 ? 1 - (r / 0.25) * 0.45 : 0.55 * (1 - (r - 0.25) / 0.75);
  });
}

/** Four-point star for the occasional sparkle. */
function starTexture() {
  return alphaTexture(64, 64, (u, v) => {
    const x = Math.abs(u - 0.5) * 2;
    const y = Math.abs(v - 0.5) * 2;
    // Concave four-point star: inside where sqrt(x) + sqrt(y) < 1, glowing toward the centre.
    const s = Math.sqrt(x) + Math.sqrt(y);
    const inside = 1 - smoothstep(0.85, 1.0, s);
    return inside * (1 - Math.min(1, Math.hypot(x, y)));
  });
}

function GemItem({ gem, cluster, base, mats, glow, star, beamGeo }: { gem: Gem; cluster: Record<'green' | 'red', THREE.BufferGeometry>; base: THREE.BufferGeometry; mats: Record<string, THREE.Material>; glow: Record<string, THREE.SpriteMaterial>; star: THREE.SpriteMaterial; beamGeo: THREE.BufferGeometry }) {
  const group = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Mesh>(null);
  const sparkle = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const beam = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => (gem.x * 13.1 + gem.z * 7.7) % 6.28, [gem]);
  const rot = useMemo(() => (gem.x * 3.7 + gem.z * 1.3) % 6.28, [gem]);
  useFrame(({ clock, camera }) => {
    const gr = group.current;
    if (!gr) return;
    const p = runtime.player;
    const collected = !!p?.gems[gem.id];
    gr.visible = !collected && useGame.getState().phase !== 'prep';
    if (!gr.visible) return;
    const t = clock.elapsedTime + phase;
    // The locator beam is for spotting gems from afar; it fades out up close.
    if (beam.current) {
      const d = camera.position.distanceTo(gr.position);
      const near = CINDERCREST.placement.gems.beamHideNear;
      beam.current.visible = d > near;
    }
    // A slow breathing glow instead of bobbing — minerals don't float.
    if (crystal.current) crystal.current.scale.setScalar(1 + Math.sin(t * 1.6) * 0.03);
    // Soft pulsing halo, and a brief star-glint every few seconds.
    if (halo.current) halo.current.scale.setScalar(1.7 + Math.sin(t * 1.6) * 0.15);
    if (sparkle.current) {
      const cyc = (t * 0.33) % 1;
      const k = cyc < 0.12 ? Math.sin((cyc / 0.12) * Math.PI) : 0;
      sparkle.current.visible = k > 0.01;
      sparkle.current.scale.setScalar(0.25 + k * 0.85);
      sparkle.current.material.rotation = t * 0.8;
    }
  });
  return (
    <group ref={group} position={[gem.x, gem.y, gem.z]} rotation={[0, rot, 0]}>
      <mesh geometry={base} material={mats.base} position={[0, 0.05, 0]} scale={[0.5, 0.5, 0.46]} castShadow receiveShadow />
      <mesh ref={crystal} geometry={cluster[gem.kind]} material={mats[gem.kind]} position={[0, 0.16, 0]} castShadow />
      <sprite ref={halo} material={glow[gem.kind]} position={[0, 0.5, 0]} scale={[1.7, 1.7, 1]} />
      <sprite ref={sparkle} material={star} position={[0.08, 0.86, 0.05]} visible={false} />
      <mesh ref={beam} geometry={beamGeo} material={mats[`${gem.kind}Beam`]} position={[0, 9, 0]} scale={TOUCH ? [0.45, 1, 0.45] : [1, 1, 1]} />
    </group>
  );
}

const SPARKS_PER_GEM = 10;
const POOL = 260;

export function Gems() {
  const W = getWorld();
  const { cluster, base, mats, glow, star, beamGeo } = useMemo(() => {
    // Kit crystals (src/kit/gems.ts): clusters of varied crystals set into a mossy stone.
    const cluster = { green: gemKitGeometry(CINDERCREST, 'green'), red: gemKitGeometry(CINDERCREST, 'red') };
    const base = gemBaseKitGeometry();
    const tex = glowTexture();
    const beam = new THREE.CylinderGeometry(0.05, 0.16, 18, 6, 1, true);
    const mk = (k: 'green' | 'red') =>
      new THREE.MeshStandardMaterial({ vertexColors: true, emissive: STYLE[k].emissive, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.05, flatShading: true });
    const beamMat = (k: 'green' | 'red') =>
      new THREE.MeshBasicMaterial({ color: STYLE[k].glow, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const sprite = (k: 'green' | 'red') =>
      new THREE.SpriteMaterial({ map: tex, color: STYLE[k].glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.42 });
    return {
      cluster,
      base,
      mats: {
        green: mk('green'),
        red: mk('red'),
        greenBeam: beamMat('green'),
        redBeam: beamMat('red'),
        base: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      } as Record<string, THREE.Material>,
      glow: { green: sprite('green'), red: sprite('red') },
      star: new THREE.SpriteMaterial({ map: starTexture(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }),
      beamGeo: beam,
    };
  }, []);

  // Idle sparkles rising around each uncollected gem (one Points draw for all gems).
  const sparkGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = W.gems.length * SPARKS_PER_GEM;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3);
    W.gems.forEach((gem, i) => {
      const c = STYLE[gem.kind].spark;
      for (let k = 0; k < SPARKS_PER_GEM; k++) col.set([c.r, c.g, c.b], (i * SPARKS_PER_GEM + k) * 3);
    });
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [W]);

  // Burst / trail particle pool (additive, faded by darkening the colour).
  const pool = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3));
    return {
      geo: g,
      vel: new Float32Array(POOL * 3),
      life: new Float32Array(POOL),
      maxLife: new Float32Array(POOL),
      base: new Float32Array(POOL * 3),
      next: 0,
      seen: 0,
    };
  }, []);
  const emitP = (x: number, y: number, z: number, c: THREE.Color, speed: number, life: number, up = 1) => {
    const i = pool.next;
    pool.next = (pool.next + 1) % POOL;
    const pos = pool.geo.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(i, x, y, z);
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * 0.9 + 0.1;
    pool.vel[i * 3] = Math.cos(a) * speed * (1 - e * 0.5);
    pool.vel[i * 3 + 1] = e * speed * up;
    pool.vel[i * 3 + 2] = Math.sin(a) * speed * (1 - e * 0.5);
    pool.life[i] = life;
    pool.maxLife[i] = life;
    pool.base[i * 3] = c.r;
    pool.base[i * 3 + 1] = c.g;
    pool.base[i * 3 + 2] = c.b;
  };
  const trailTimer = useRef(0);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = clock.elapsedTime;
    const p = runtime.player;
    // sparkles
    const sp = sparkGeo.attributes.position as THREE.BufferAttribute;
    W.gems.forEach((gem, i) => {
      const hidden = !p || p.gems[gem.id];
      for (let k = 0; k < SPARKS_PER_GEM; k++) {
        const idx = i * SPARKS_PER_GEM + k;
        if (hidden) {
          sp.setXYZ(idx, 0, -9999, 0);
          continue;
        }
        const ph = (t * 0.45 + k / SPARKS_PER_GEM) % 1;
        const a = k * 2.399 + t * 0.6;
        const r = 0.25 + 0.3 * Math.abs(Math.sin(k * 1.7));
        sp.setXYZ(idx, gem.x + Math.cos(a) * r, gem.y + 0.15 + ph * 1.4, gem.z + Math.sin(a) * r);
      }
    });
    sp.needsUpdate = true;

    // new collection bursts
    while (pool.seen < runtime.fx.length) {
      const b = runtime.fx[pool.seen++];
      const c = STYLE[b.kind].spark;
      for (let k = 0; k < 40; k++) emitP(b.x, b.y + 0.4, b.z, c, 2.2 + Math.random() * 3, 0.6 + Math.random() * 0.5);
    }
    if (runtime.fx.length === 0) pool.seen = 0;
    // speed-boost trail behind the climber
    if (p && p.realTime < p.boostUntil && Math.hypot(p.vx, p.vz) > 0.5) {
      trailTimer.current -= dt;
      while (trailTimer.current <= 0) {
        trailTimer.current += 0.025;
        emitP(p.x - Math.sin(p.heading) * 0.4 + (Math.random() - 0.5) * 0.5, p.y + p.jumpH + 0.2 + Math.random() * 1.2, p.z - Math.cos(p.heading) * 0.4 + (Math.random() - 0.5) * 0.5, STYLE.red.spark, 0.4, 0.55, 0.6);
      }
    }
    const pos = pool.geo.attributes.position as THREE.BufferAttribute;
    const col = pool.geo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < POOL; i++) {
      if (pool.life[i] <= 0) {
        col.setXYZ(i, 0, 0, 0);
        continue;
      }
      pool.life[i] -= dt;
      pool.vel[i * 3 + 1] -= 4 * dt;
      pos.setXYZ(i, pos.getX(i) + pool.vel[i * 3] * dt, pos.getY(i) + pool.vel[i * 3 + 1] * dt, pos.getZ(i) + pool.vel[i * 3 + 2] * dt);
      const f = Math.max(0, pool.life[i] / pool.maxLife[i]);
      col.setXYZ(i, pool.base[i * 3] * f, pool.base[i * 3 + 1] * f, pool.base[i * 3 + 2] * f);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  return (
    <group>
      {W.gems.map((g) => (
        <GemItem key={g.id} gem={g} cluster={cluster} base={base} mats={mats} glow={glow} star={star} beamGeo={beamGeo} />
      ))}
      <points geometry={sparkGeo} frustumCulled={false}>
        <pointsMaterial map={dotTexture()} size={0.14} vertexColors transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <points geometry={pool.geo} frustumCulled={false}>
        <pointsMaterial map={dotTexture()} size={0.3} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  );
}
