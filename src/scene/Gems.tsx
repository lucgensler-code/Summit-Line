import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { runtime, useGame } from '../game/store';
import { getWorld, type Gem } from '../game/world';

const STYLE = {
  green: { color: '#22e07f', emissive: '#0aa552', glow: '#5dff9e', spark: new THREE.Color('#7dffb0') },
  red: { color: '#ff3d3d', emissive: '#c4101c', glow: '#ff7a4d', spark: new THREE.Color('#ff9a5c') },
} as const;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function GemItem({ gem, geo, mats, glow, beamGeo }: { gem: Gem; geo: THREE.BufferGeometry; mats: Record<string, THREE.Material>; glow: Record<string, THREE.SpriteMaterial>; beamGeo: THREE.BufferGeometry }) {
  const group = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => (gem.x * 13.1 + gem.z * 7.7) % 6.28, [gem]);
  useFrame(({ clock }) => {
    const gr = group.current;
    if (!gr) return;
    const p = runtime.player;
    const collected = !!p?.gems[gem.id];
    gr.visible = !collected && useGame.getState().phase !== 'prep';
    if (!gr.visible) return;
    const t = clock.elapsedTime + phase;
    if (crystal.current) {
      crystal.current.position.y = Math.sin(t * 1.8) * 0.18;
      crystal.current.rotation.y = t * 1.2;
    }
  });
  return (
    <group ref={group} position={[gem.x, gem.y, gem.z]}>
      <mesh ref={crystal} geometry={geo} material={mats[gem.kind]} castShadow />
      <sprite material={glow[gem.kind]} scale={[3.4, 3.4, 1]} />
      <mesh geometry={beamGeo} material={mats[`${gem.kind}Beam`]} position={[0, 14, 0]} />
    </group>
  );
}

const SPARKS_PER_GEM = 10;
const POOL = 260;

export function Gems() {
  const W = getWorld();
  const { geo, mats, glow, beamGeo } = useMemo(() => {
    const a = new THREE.OctahedronGeometry(0.5, 0);
    a.scale(1, 1.55, 1);
    const tex = glowTexture();
    const beam = new THREE.CylinderGeometry(0.12, 0.35, 28, 6, 1, true);
    const mk = (k: 'green' | 'red') =>
      new THREE.MeshStandardMaterial({ color: STYLE[k].color, emissive: STYLE[k].emissive, emissiveIntensity: 1.1, roughness: 0.18, metalness: 0.15, flatShading: true });
    const beamMat = (k: 'green' | 'red') =>
      new THREE.MeshBasicMaterial({ color: STYLE[k].glow, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const sprite = (k: 'green' | 'red') =>
      new THREE.SpriteMaterial({ map: tex, color: STYLE[k].glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
    return {
      geo: a,
      mats: { green: mk('green'), red: mk('red'), greenBeam: beamMat('green'), redBeam: beamMat('red') } as Record<string, THREE.Material>,
      glow: { green: sprite('green'), red: sprite('red') },
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
        const r = 0.5 + 0.5 * Math.sin(k * 1.7);
        sp.setXYZ(idx, gem.x + Math.cos(a) * r, gem.y - 0.6 + ph * 2.4, gem.z + Math.sin(a) * r);
      }
    });
    sp.needsUpdate = true;

    // new collection bursts
    while (pool.seen < runtime.fx.length) {
      const b = runtime.fx[pool.seen++];
      const c = STYLE[b.kind].spark;
      for (let k = 0; k < 46; k++) emitP(b.x, b.y, b.z, c, 3 + Math.random() * 4, 0.7 + Math.random() * 0.6);
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
        <GemItem key={g.id} gem={g} geo={geo} mats={mats} glow={glow} beamGeo={beamGeo} />
      ))}
      <points geometry={sparkGeo} frustumCulled={false}>
        <pointsMaterial size={0.16} vertexColors transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <points geometry={pool.geo} frustumCulled={false}>
        <pointsMaterial size={0.22} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  );
}
