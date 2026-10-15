import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

function GemItem({ gem, cluster, base, mats, glow, beamGeo }: { gem: Gem; cluster: THREE.BufferGeometry; base: THREE.BufferGeometry; mats: Record<string, THREE.Material>; glow: Record<string, THREE.SpriteMaterial>; beamGeo: THREE.BufferGeometry }) {
  const group = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => (gem.x * 13.1 + gem.z * 7.7) % 6.28, [gem]);
  const rot = useMemo(() => (gem.x * 3.7 + gem.z * 1.3) % 6.28, [gem]);
  useFrame(({ clock }) => {
    const gr = group.current;
    if (!gr) return;
    const p = runtime.player;
    const collected = !!p?.gems[gem.id];
    gr.visible = !collected && useGame.getState().phase !== 'prep';
    if (!gr.visible) return;
    const t = clock.elapsedTime + phase;
    // A slow breathing glow instead of bobbing — minerals don't float.
    if (crystal.current) crystal.current.scale.setScalar(1 + Math.sin(t * 1.6) * 0.03);
  });
  return (
    <group ref={group} position={[gem.x, gem.y, gem.z]} rotation={[0, rot, 0]}>
      <mesh geometry={base} material={mats.base} castShadow receiveShadow />
      <mesh ref={crystal} geometry={cluster} material={mats[gem.kind]} castShadow />
      <sprite material={glow[gem.kind]} position={[0, 0.45, 0]} scale={[1.15, 1.15, 1]} />
      <mesh geometry={beamGeo} material={mats[`${gem.kind}Beam`]} position={[0, 9, 0]} />
    </group>
  );
}

const SPARKS_PER_GEM = 10;
const POOL = 260;

export function Gems() {
  const W = getWorld();
  const { cluster, base, mats, glow, beamGeo } = useMemo(() => {
    // Irregular crystal cluster: a few hexagonal prisms with pointed tips, leaning out of a rock.
    const prisms: THREE.BufferGeometry[] = [];
    const spec = [
      [0, 0, 0.62, 0.11, 0],
      [0.13, 0.05, 0.42, 0.08, 0.5],
      [-0.12, 0.06, 0.38, 0.075, -0.55],
      [0.02, -0.13, 0.33, 0.07, 0.35],
      [-0.06, 0.14, 0.26, 0.06, -0.2],
    ];
    spec.forEach(([x, z, h, r, lean], i) => {
      const body = new THREE.CylinderGeometry(r, r * 1.1, h, 6).translate(0, h / 2, 0);
      const tip = new THREE.ConeGeometry(r, r * 2.2, 6).translate(0, h + r * 1.1, 0);
      const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()], false)!;
      g.rotateZ(lean * 0.6).rotateX(lean * 0.4 * (i % 2 ? 1 : -1)).translate(x, 0.04, z);
      prisms.push(g);
    });
    const cluster = mergeGeometries(prisms, false)!;
    cluster.computeVertexNormals();
    const base = new THREE.DodecahedronGeometry(0.28, 0).scale(1.3, 0.45, 1.1);
    const tex = glowTexture();
    const beam = new THREE.CylinderGeometry(0.05, 0.16, 18, 6, 1, true);
    const mk = (k: 'green' | 'red') =>
      new THREE.MeshStandardMaterial({ color: STYLE[k].color, emissive: STYLE[k].emissive, emissiveIntensity: 0.55, roughness: 0.22, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.92 });
    const beamMat = (k: 'green' | 'red') =>
      new THREE.MeshBasicMaterial({ color: STYLE[k].glow, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const sprite = (k: 'green' | 'red') =>
      new THREE.SpriteMaterial({ map: tex, color: STYLE[k].glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 });
    return {
      cluster,
      base,
      mats: {
        green: mk('green'),
        red: mk('red'),
        greenBeam: beamMat('green'),
        redBeam: beamMat('red'),
        base: new THREE.MeshStandardMaterial({ color: '#4a4240', flatShading: true, roughness: 1 }),
      } as Record<string, THREE.Material>,
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
        <GemItem key={g.id} gem={g} cluster={cluster} base={base} mats={mats} glow={glow} beamGeo={beamGeo} />
      ))}
      <points geometry={sparkGeo} frustumCulled={false}>
        <pointsMaterial size={0.09} vertexColors transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <points geometry={pool.geo} frustumCulled={false}>
        <pointsMaterial size={0.22} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  );
}
