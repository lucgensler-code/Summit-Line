import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getLandmarks, type Landmark } from '../game/landmarks';
import { LAKE, getWorld, heightAt, snowCover } from '../game/world';
import { merge, tint } from './Vegetation';

function SignPost({ lm }: { lm: Landmark }) {
  return (
    <group position={[lm.x, lm.y, lm.z]} rotation={[0, lm.rot + Math.PI / 2, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.16, 1.8, 0.16]} />
        <meshStandardMaterial color="#5b3f2a" />
      </mesh>
      <mesh position={[0.35, 1.55, 0]} castShadow>
        <boxGeometry args={[1.1, 0.32, 0.08]} />
        <meshStandardMaterial color="#8a6440" />
      </mesh>
      <mesh position={[0.3, 1.15, 0]} rotation={[0, Math.PI, 0]} castShadow>
        <boxGeometry args={[0.95, 0.28, 0.08]} />
        <meshStandardMaterial color="#7d5a3a" />
      </mesh>
      <mesh position={[0.35, 1.55, 0.045]}>
        <planeGeometry args={[0.9, 0.06]} />
        <meshBasicMaterial color="#f0e2c4" />
      </mesh>
      <mesh position={[0.3, 1.15, 0.045]}>
        <planeGeometry args={[0.7, 0.06]} />
        <meshBasicMaterial color="#f0e2c4" />
      </mesh>
    </group>
  );
}

function Kiosk({ lm }: { lm: Landmark }) {
  return (
    <group position={[lm.x, lm.y, lm.z]} rotation={[0, lm.rot + Math.PI / 2, 0]}>
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 1.3, 0]} castShadow>
          <boxGeometry args={[0.22, 2.6, 0.22]} />
          <meshStandardMaterial color="#5b3f2a" />
        </mesh>
      ))}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[2.1, 1.3, 0.12]} />
        <meshStandardMaterial color="#6e4f34" />
      </mesh>
      <mesh position={[-0.45, 1.55, 0.07]}>
        <planeGeometry args={[0.8, 0.95]} />
        <meshStandardMaterial color="#e9e1cc" />
      </mesh>
      <mesh position={[0.5, 1.55, 0.07]}>
        <planeGeometry args={[0.85, 0.95]} />
        <meshStandardMaterial color="#6f8b6a" />
      </mesh>
      <mesh position={[0.5, 1.6, 0.075]}>
        <coneGeometry args={[0.3, 0.45, 3]} />
        <meshBasicMaterial color="#f2f2ee" />
      </mesh>
      <mesh position={[0, 2.55, 0]} rotation={[0, 0, 0]} castShadow>
        <boxGeometry args={[2.7, 0.14, 1.1]} />
        <meshStandardMaterial color="#3d4f3a" />
      </mesh>
    </group>
  );
}

function Register({ lm }: { lm: Landmark }) {
  return (
    <group position={[lm.x, lm.y, lm.z]} rotation={[0, lm.rot, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.14, 1.2, 0.14]} />
        <meshStandardMaterial color="#5b3f2a" />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.55, 0.42, 0.35]} />
        <meshStandardMaterial color="#4d6b4a" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.55, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.62, 0.06, 0.42]} />
        <meshStandardMaterial color="#3a5238" />
      </mesh>
    </group>
  );
}

function Car({ x, z, rot }: { x: number; z: number; rot: number }) {
  const y = heightAt(x, z);
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.7, 4.3]} />
        <meshStandardMaterial color="#4f6e7a" metalness={0.4} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.38, -0.2]} castShadow>
        <boxGeometry args={[1.7, 0.6, 2.5]} />
        <meshStandardMaterial color="#25323a" metalness={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.75, -0.2]}>
        <boxGeometry args={[1.5, 0.08, 2.0]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {[
        [-0.9, 1.4],
        [0.9, 1.4],
        [-0.9, -1.4],
        [0.9, -1.4],
      ].map(([wx, wz]) => (
        <mesh key={`${wx}${wz}`} position={[wx, 0.38, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.3, 12]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
      ))}
    </group>
  );
}

function Tent({ x, z, rot, color }: { x: number; z: number; rot: number; color: string }) {
  const y = heightAt(x, z);
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-1.1, 0);
    shape.lineTo(0, 1.25);
    shape.lineTo(1.1, 0);
    shape.lineTo(-1.1, 0);
    return new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false }).translate(0, 0, -1.1);
  }, []);
  return (
    <mesh geometry={geo} position={[x, y - 0.05, z]} rotation={[0, rot, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

function Lake() {
  return (
    <mesh position={[LAKE.x, LAKE.level, LAKE.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[LAKE.r + 4, 48]} />
      <meshStandardMaterial color="#2b5363" roughness={0.08} metalness={0.25} transparent opacity={0.9} />
    </mesh>
  );
}

function SummitMarker() {
  const W = getWorld();
  const flag = useRef<THREE.Mesh>(null);
  const { x, y, z } = W.summit;
  const cairn = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const ring = (r: number, yy: number, n: number, s: number) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + yy;
        parts.push(tint(new THREE.IcosahedronGeometry(s, 0).scale(1, 0.7, 1).translate(Math.cos(a) * r, yy, Math.sin(a) * r), i % 2 ? '#5d5350' : '#7a6d68'));
      }
    };
    ring(1.0, 0.3, 8, 0.45);
    ring(0.75, 0.8, 7, 0.38);
    ring(0.5, 1.25, 6, 0.32);
    ring(0.25, 1.6, 4, 0.26);
    return merge(parts);
  }, []);
  useFrame(({ clock }) => {
    const f = flag.current;
    if (!f) return;
    const pos = f.geometry.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const k = (px + 0.6) / 1.2;
      pos.setZ(i, Math.sin(t * 7 + px * 5) * 0.12 * k);
    }
    pos.needsUpdate = true;
  });
  return (
    <group position={[x + 1.8, heightAt(x + 1.8, z), z]}>
      <mesh geometry={cairn} castShadow receiveShadow>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>
      <mesh position={[0, 2.4, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 2.4, 6]} />
        <meshStandardMaterial color="#c9c9c9" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={flag} position={[0.62, 3.3, 0]}>
        <planeGeometry args={[1.2, 0.7, 10, 1]} />
        <meshStandardMaterial color="#d8462b" side={THREE.DoubleSide} />
      </mesh>
      {/* survey benchmark disk where the summit is tagged */}
      <mesh position={[-1.8, y - heightAt(x + 1.8, z) + 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.28, 20]} />
        <meshStandardMaterial color="#b88a3e" metalness={0.8} roughness={0.35} emissive="#3a2a10" />
      </mesh>
    </group>
  );
}

/** Bamboo wands with orange flags marking the boot track through the snow. */
function SnowWands() {
  const W = getWorld();
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const out: { x: number; z: number; y: number; rot: number }[] = [];
    const main = W.main;
    let last = -999;
    for (let i = 0; i < main.pts.length - 1; i++) {
      const p = main.pts[i];
      const h = heightAt(p.x, p.z);
      if (snowCover(p.x, p.z, h, 0.3) < 0.5 || main.s[i] - last < 22) continue;
      last = main.s[i];
      const b = main.pts[i + 1];
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const side = (i % 2 ? 1 : -1) * 2.6;
      const x = p.x - (dz / l) * side;
      const z = p.z + (dx / l) * side;
      out.push({ x, z, y: heightAt(x, z), rot: Math.atan2(dx, dz) });
    }
    return out;
  }, [W]);
  const geo = useMemo(() => {
    const stick = tint(new THREE.CylinderGeometry(0.025, 0.03, 1.6, 4).translate(0, 0.8, 0), '#c8b07a');
    const flagG = tint(new THREE.PlaneGeometry(0.35, 0.22).translate(0.18, 1.45, 0), '#ff6a1f');
    return merge([stick, flagG]);
  }, []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || mesh.userData.done) return;
    items.forEach((it, i) => {
      m.makeRotationY(it.rot);
      m.setPosition(it.x, it.y - 0.1, it.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.done = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, Math.max(items.length, 1)]} castShadow frustumCulled={false}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

export function Landmarks() {
  const W = getWorld();
  const lms = getLandmarks();
  const th = W.trailhead;
  const camp = W.checkpoints.find((c) => c.id === 'camp')!;
  const toLake = Math.atan2(LAKE.x - camp.x, LAKE.z - camp.z);
  const perp = th.heading + Math.PI / 2;
  return (
    <group>
      {lms.map((lm) =>
        lm.kind === 'kiosk' ? <Kiosk key={lm.id} lm={lm} /> : lm.kind === 'register' ? <Register key={lm.id} lm={lm} /> : <SignPost key={lm.id} lm={lm} />,
      )}
      <Car x={th.x + Math.sin(perp) * -9 - Math.sin(th.heading) * 6} z={th.z + Math.cos(perp) * -9 - Math.cos(th.heading) * 6} rot={th.heading + 0.4} />
      <Car x={th.x + Math.sin(perp) * -13 - Math.sin(th.heading) * 2} z={th.z + Math.cos(perp) * -13 - Math.cos(th.heading) * 2} rot={th.heading + 0.5} />
      <Tent x={camp.x + Math.sin(toLake) * 16 + Math.cos(toLake) * 8} z={camp.z + Math.cos(toLake) * 16 - Math.sin(toLake) * 8} rot={toLake + 0.6} color="#d9a032" />
      <Tent x={camp.x + Math.sin(toLake) * 20 - Math.cos(toLake) * 6} z={camp.z + Math.cos(toLake) * 20 + Math.sin(toLake) * 6} rot={toLake - 0.3} color="#3f7d8c" />
      <Lake />
      <SummitMarker />
      <SnowWands />
    </group>
  );
}
