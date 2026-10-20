import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { useGame } from '../game/store';

/**
 * Optional visual layers the governor can switch off on slower devices (v0.6.1), in order:
 * the glow/colour-grade pass first, then valley mist (with lower resolution), then shadow detail.
 */
export const quality = { post: true, mist: true };
/** `?hq` pins full quality (for testing a fast device); `?lq` starts at the lowest tier. */
const qParams = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const PIN_HQ = !!qParams?.has('hq');
if (qParams?.has('lq')) {
  quality.post = false;
  quality.mist = false;
}

/** Live numbers for the optional FPS overlay (F3 or ?fps). Written by the governor, read by the DOM. */
export const perfStats = { fps: 0, p95: 0, calls: 0, tris: 0, dpr: 1, tier: 0 };

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * Picks a sensible pixel ratio up front and steps quality DOWN (never back up, so it can't
 * oscillate) when frames stay slow: render scale first, then the shadow map size.
 */
export function PerfGovernor() {
  const { gl, setDpr, scene } = useThree();
  const frames = useRef<number[]>([]);
  const last = useRef(performance.now());
  const window0 = useRef(performance.now());
  const tier = useRef(0);
  const grace = useRef(performance.now() + 4000);

  useEffect(() => {
    // Desktop monitors are large: a 1.25 cap halves the pixels of a 2× Retina screen with little
    // visible loss. Phones keep their sharper setting (they were already smooth).
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch() ? 1.75 : 1.25);
    setDpr(dpr);
    perfStats.dpr = dpr;
  }, [setDpr]);

  useFrame(() => {
    const now = performance.now();
    const ft = now - last.current;
    last.current = now;
    // The home screen is deliberately throttled on phones; only measure while climbing.
    if (useGame.getState().phase === 'prep') {
      frames.current = [];
      window0.current = now;
      grace.current = Math.max(grace.current, now + 3000);
      return;
    }
    if (ft > 0 && ft < 1000) frames.current.push(ft);
    if (now - window0.current < 2000) return;
    window0.current = now;
    const arr = frames.current.sort((a, b) => a - b);
    frames.current = [];
    if (!arr.length) return;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    perfStats.fps = 1000 / avg;
    perfStats.p95 = arr[Math.floor(arr.length * 0.95)] ?? avg;
    perfStats.calls = gl.info.render.calls;
    perfStats.tris = gl.info.render.triangles;
    perfStats.tier = tier.current;
    if (now < grace.current || document.hidden || PIN_HQ) return;
    if (perfStats.fps < 48 && tier.current < 4) {
      tier.current++;
      grace.current = now + 4000;
      if (tier.current === 1 && quality.post) {
        // Cheapest big win first: drop the full-screen glow / colour-grade pass.
        quality.post = false;
      } else if (tier.current <= 3) {
        if (tier.current === 3) quality.mist = false;
        const dpr = Math.max(0.85, perfStats.dpr - 0.2);
        setDpr(dpr);
        perfStats.dpr = dpr;
      } else {
        // Smaller shadow map as a last resort.
        scene.traverse((o) => {
          const l = o as unknown as { isDirectionalLight?: boolean; shadow?: { mapSize: { set(a: number, b: number): void }; map: { dispose(): void } | null } };
          if (l.isDirectionalLight && l.shadow) {
            l.shadow.mapSize.set(1024, 1024);
            l.shadow.map?.dispose();
            l.shadow.map = null;
          }
        });
      }
    }
  });
  return null;
}

/**
 * Home screen (v0.5): the mountain is viewed from ~1 km away, so
 *  - the camera near plane is pushed out (much better depth precision: no shimmering /
 *    z-fighting between the trail ribbon, terrain and trees on phone GPUs),
 *  - the shadow map is rendered once instead of every frame,
 *  - on touch devices the scene renders at ~30 fps — it is a slow backdrop behind the planner.
 */
export function PrepMode() {
  const { gl, camera, setFrameloop, invalidate } = useThree();
  const phase = useGame((s) => s.phase);
  useEffect(() => {
    const prep = phase === 'prep';
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = prep ? 4 : 0.2;
    cam.updateProjectionMatrix();
    gl.shadowMap.autoUpdate = !prep;
    gl.shadowMap.needsUpdate = true;
    if (!prep || !isTouch()) {
      setFrameloop('always');
      return;
    }
    setFrameloop('demand');
    const id = setInterval(() => invalidate(), 33);
    return () => {
      clearInterval(id);
      setFrameloop('always');
    };
  }, [phase, gl, camera, setFrameloop, invalidate]);
  return null;
}

/** Tiny DOM overlay; toggled with F3 or by adding ?fps to the URL. */
export function FpsOverlay() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let shown = new URLSearchParams(location.search).has('fps');
    const paint = () => {
      if (!el.current) return;
      el.current.hidden = !shown;
      el.current.textContent = `${perfStats.fps.toFixed(0)} fps · p95 ${perfStats.p95.toFixed(1)} ms · ${perfStats.calls} draws · ${(perfStats.tris / 1000).toFixed(0)}k tris · dpr ${perfStats.dpr.toFixed(2)}${perfStats.tier ? ` · q-${perfStats.tier}` : ''}`;
    };
    const id = setInterval(paint, 500);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        shown = !shown;
        paint();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    paint();
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return <div ref={el} className="fps-overlay" hidden />;
}
