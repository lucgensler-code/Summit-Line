import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getWorld, heightAt } from '../game/world';

interface Bird {
  cx: number;
  cz: number;
  alt: number;
  radius: number;
  speed: number;
  phase: number;
  scale: number;
  flap: number;
  glide: number;
  kind: 'song' | 'raven' | 'raptor';
}

const BODY = new THREE.ConeGeometry(0.16, 0.9, 5).rotateX(Math.PI / 2);
const WING = (() => {
  const g = new THREE.BufferGeometry();
  // A swept wing from the shoulder outward (x+).
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.2, 1.2, 0, -0.05, 0, 0, -0.3]), 3));
  g.computeVertexNormals();
  return g;
})();

/** Small flocks above the forest, ravens riding the upper slopes, raptors circling far off. */
export function Wildlife() {
  const birds = useMemo<Bird[]>(() => {
    const W = getWorld();
    const at = (f: number) => W.main.pts[Math.floor(f * (W.main.pts.length - 1))];
    const out: Bird[] = [];
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const f of [0.08, 0.24, 0.37]) {
      const p = at(f);
      for (let i = 0; i < 4; i++)
        out.push({ cx: p.x + 20, cz: p.z - 10, alt: heightAt(p.x, p.z) + 20 + rnd() * 6, radius: 26 + rnd() * 10, speed: 0.32 + rnd() * 0.05, phase: i * 0.22, scale: 0.32, flap: 16, glide: 0.1, kind: 'song' });
    }
    for (const f of [0.62, 0.74, 0.86, 0.97]) {
      const p = at(f);
      out.push({ cx: p.x, cz: p.z, alt: heightAt(p.x, p.z) + 14 + rnd() * 10, radius: 30 + rnd() * 30, speed: 0.12 + rnd() * 0.06, phase: rnd() * 6, scale: 0.8, flap: 6, glide: 0.75, kind: 'raven' });
    }
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      out.push({ cx: Math.sin(a) * 520, cz: Math.cos(a) * 520, alt: 230 + rnd() * 60, radius: 70 + rnd() * 40, speed: 0.05, phase: rnd() * 6, scale: 1.6, flap: 3, glide: 0.9, kind: 'raptor' });
    }
    return out;
  }, []);
  const mats = useMemo(
    () => ({
      song: new THREE.MeshStandardMaterial({ color: '#6b5236', side: THREE.DoubleSide, roughness: 1 }),
      raven: new THREE.MeshStandardMaterial({ color: '#16161a', side: THREE.DoubleSide, roughness: 0.6 }),
      raptor: new THREE.MeshStandardMaterial({ color: '#3a2e26', side: THREE.DoubleSide, roughness: 1 }),
    }),
    [],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    birds.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = t * b.speed + b.phase;
      const r = b.radius * (1 + 0.15 * Math.sin(a * 2.3));
      g.position.set(b.cx + Math.cos(a) * r, b.alt + Math.sin(a * 1.7) * 2, b.cz + Math.sin(a) * r);
      g.rotation.set(0, -a, Math.sin(a * 1.3) * 0.25 + 0.15);
      // Flap in bursts; ravens and raptors mostly glide.
      const burst = Math.sin(t * 0.7 + b.phase * 3) > b.glide * 2 - 1 ? 1 : 0.15;
      const w = Math.sin(t * b.flap + b.phase * 10) * 0.7 * burst + 0.12;
      const L = g.children[1] as THREE.Mesh;
      const R = g.children[2] as THREE.Mesh;
      L.rotation.z = w;
      R.rotation.z = -w;
    });
  });
  return (
    <group>
      {birds.map((b, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} scale={b.scale}>
          <mesh geometry={BODY} material={mats[b.kind]} />
          <mesh geometry={WING} material={mats[b.kind]} />
          <mesh geometry={WING} material={mats[b.kind]} scale={[-1, 1, 1]} />
        </group>
      ))}
    </group>
  );
}
