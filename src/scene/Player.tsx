import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { footstep } from '../game/audio';
import { clamp, lerp } from '../game/noise';
import { clockHour, daylight } from '../game/sim';
import { summitCinematic } from '../game/cinematic';
import { CAM_DEFAULT, CAM_MIN, runtime, useGame } from '../game/store';
import { heightAt } from '../game/world';

const COLORS = {
  jacket: '#d2602b',
  jacketDark: '#a8481d',
  pants: '#3a3f46',
  boots: '#4a3020',
  sole: '#1e1a17',
  skin: '#d9a77f',
  beanie: '#2f6b8c',
  pack: '#2c5658',
  packDark: '#1f3d3f',
  pad: '#d6b24a',
  pole: '#9aa3ab',
  glove: '#2a2a2a',
};

type Joint = THREE.Group | null;

function Limb({ len, w, color, children, jointRef, y = 0, x = 0 }: { len: number; w: number; color: string; children?: React.ReactNode; jointRef: React.RefObject<Joint>; y?: number; x?: number }) {
  return (
    <group ref={jointRef} position={[x, y, 0]}>
      <mesh position={[0, -len / 2, 0]} castShadow>
        <capsuleGeometry args={[w, Math.max(len - w * 2, 0.01), 3, 6]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <group position={[0, -len, 0]}>{children}</group>
    </group>
  );
}

/** Low-poly mountaineer rig with procedural walk / jog / idle / rest / summit animation. */
export function Player() {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const thighL = useRef<Joint>(null);
  const thighR = useRef<Joint>(null);
  const shinL = useRef<Joint>(null);
  const shinR = useRef<Joint>(null);
  const armL = useRef<Joint>(null);
  const armR = useRef<Joint>(null);
  const foreL = useRef<Joint>(null);
  const foreR = useRef<Joint>(null);
  const poleL = useRef<THREE.Group>(null);
  const poleR = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.SpotLight>(null);
  const lampTarget = useMemo(() => new THREE.Object3D(), []);
  const gait = useRef({ phase: 0, blendJog: 0, rest: 0, tired: 0, summit: 0, lean: 0, air: 0 });
  const loadout = useGame((s) => s.loadout);
  const phase = useGame((s) => s.phase);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const p = runtime.player;
    const r = root.current;
    if (!r) return;
    r.visible = !!p && phase !== 'prep';
    if (!p) return;
    r.position.set(p.x, p.y + p.jumpH, p.z);
    r.rotation.y = p.heading;

    const g = gait.current;
    const t = clock.elapsedTime;
    const speed = Math.hypot(p.vx, p.vz);
    const moving = speed > 0.25 && !p.summited;
    const jogging = p.activity === 'jog';
    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    g.blendJog = lerp(g.blendJog, jogging ? 1 : 0, k(6));
    g.rest = lerp(g.rest, p.activity === 'rest' ? 1 : 0, k(4));
    g.tired = lerp(g.tired, p.activity === 'exhausted' ? 1 : 0, k(4));
    g.summit = lerp(g.summit, p.summited ? 1 : 0, k(3));
    g.air = lerp(g.air, p.jumpH > 0.05 ? 1 : 0, k(14));
    g.lean = lerp(g.lean, clamp(p.grade, -0.5, 0.8) * (moving ? 1 : 0), k(4));
    const stride = lerp(2.3, 1.55, g.blendJog); // radians per unit travelled
    const prevStep = Math.floor(g.phase / Math.PI);
    g.phase += speed * stride * dt;
    if (moving && Math.floor(g.phase / Math.PI) !== prevStep && phase === 'playing') {
      const kind = p.snow > 0.5 ? 'snow' : p.surface === 'scree' || p.surface === 'rock' || p.y > 165 ? 'gravel' : 'soft';
      footstep(kind, jogging ? 1.3 : 1);
    }
    const amp = moving ? clamp(speed / 3.6, 0.25, 1) * lerp(0.5, 0.85, g.blendJog) : 0;
    const s = Math.sin(g.phase);
    const c = Math.cos(g.phase);

    // Legs
    const restThigh = -1.45 * g.rest;
    const set = (j: Joint, x: number) => {
      if (j) j.rotation.x = lerp(j.rotation.x, x, k(18));
    };
    const tuck = g.air * -0.7;
    set(thighL.current, s * amp * (1 - g.air) + tuck + restThigh - g.tired * 0.35 - Math.max(g.lean, 0) * 0.3);
    set(thighR.current, -s * amp * (1 - g.air) + tuck * 0.6 + restThigh - g.tired * 0.35 - Math.max(g.lean, 0) * 0.3);
    set(shinL.current, Math.max(0, -c) * amp * 1.3 * (1 - g.air) + g.air * 1.1 + 0.05 + g.rest * 1.45 + g.tired * 0.5);
    set(shinR.current, Math.max(0, c) * amp * 1.3 * (1 - g.air) + g.air * 0.8 + 0.05 + g.rest * 1.45 + g.tired * 0.5);

    // Arms (poles plant opposite to legs); summit = arms raised
    const armSwing = amp * (loadout.poles ? 0.75 : 0.9);
    const raise = g.summit * (-2.7 + Math.sin(t * 3) * 0.1);
    set(armL.current, -s * armSwing + raise - g.tired * 0.9 + g.rest * -0.5);
    set(armR.current, s * armSwing + raise - g.tired * 0.9 + g.rest * -0.5);
    set(foreL.current, -0.25 - g.blendJog * 0.9 - g.tired * 0.2 + g.summit * 0.2);
    set(foreR.current, -0.25 - g.blendJog * 0.9 - g.tired * 0.2 + g.summit * 0.2);
    if (armL.current) armL.current.rotation.z = lerp(armL.current.rotation.z, 0.1 + g.summit * 0.35, k(8));
    if (armR.current) armR.current.rotation.z = lerp(armR.current.rotation.z, -0.1 - g.summit * 0.35, k(8));

    // Body: bob, lean into the slope, breathing, sitting.
    const bob = moving ? Math.abs(Math.sin(g.phase)) * lerp(0.04, 0.09, g.blendJog) : 0;
    const breathe = Math.sin(t * (p.stamina < 30 ? 5 : 1.8)) * (p.stamina < 30 ? 0.02 : 0.008);
    if (body.current) {
      body.current.position.y = lerp(body.current.position.y, bob - g.rest * 0.52 - g.tired * 0.12, k(14));
    }
    if (torso.current) {
      const lean = 0.06 + g.blendJog * 0.22 + Math.max(g.lean, 0) * 0.35 + g.tired * 0.75 - g.summit * 0.15 + g.rest * 0.1;
      torso.current.rotation.x = lerp(torso.current.rotation.x, lean, k(6));
      torso.current.scale.set(1 + breathe, 1 + breathe * 0.5, 1 + breathe);
      torso.current.rotation.z = moving ? Math.sin(g.phase) * 0.04 : 0;
    }
    if (head.current) head.current.rotation.x = lerp(head.current.rotation.x, -0.1 - g.tired * 0.25 - g.summit * 0.35, k(6));

    // Pole tips angle back while hiking
    const showPoles = loadout.poles && g.summit < 0.5;
    if (poleL.current) poleL.current.visible = showPoles;
    if (poleR.current) poleR.current.visible = showPoles;

    // Headlamp before sunrise
    if (lamp.current) {
      const dark = 1 - daylight(clockHour(p, runtime.loadout));
      lamp.current.intensity = loadout.headlamp ? dark * 60 : 0;
      lamp.current.visible = loadout.headlamp && dark > 0.05;
      lampTarget.position.set(p.x + Math.sin(p.heading) * 8, heightAt(p.x + Math.sin(p.heading) * 8, p.z + Math.cos(p.heading) * 8), p.z + Math.cos(p.heading) * 8);
      lampTarget.updateMatrixWorld();
      lamp.current.target = lampTarget;
    }
  });

  const poleGeo = useMemo(() => new THREE.CylinderGeometry(0.018, 0.012, 1.25, 5).translate(0, -0.55, 0), []);

  return (
    <group ref={root}>
      <primitive object={lampTarget} />
      <group ref={body}>
        {/* hips */}
        <group position={[0, 0.98, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.36, 0.2, 0.22]} />
            <meshStandardMaterial color={COLORS.pants} />
          </mesh>
          {/* legs */}
          {(['L', 'R'] as const).map((side) => (
            <Limb key={side} x={side === 'L' ? 0.11 : -0.11} y={-0.04} len={0.46} w={0.075} color={COLORS.pants} jointRef={side === 'L' ? thighL : thighR}>
              <Limb len={0.44} w={0.065} color={COLORS.pants} jointRef={side === 'L' ? shinL : shinR}>
                <mesh position={[0, -0.03, 0.05]} castShadow>
                  <boxGeometry args={[0.13, 0.12, 0.26]} />
                  <meshStandardMaterial color={COLORS.boots} roughness={0.9} />
                </mesh>
                <mesh position={[0, -0.09, 0.05]}>
                  <boxGeometry args={[0.14, 0.03, 0.28]} />
                  <meshStandardMaterial color={COLORS.sole} />
                </mesh>
              </Limb>
            </Limb>
          ))}
          {/* torso pivots at the waist */}
          <group ref={torso} position={[0, 0.08, 0]}>
            <mesh position={[0, 0.3, 0]} castShadow>
              <boxGeometry args={[0.42, 0.52, 0.26]} />
              <meshStandardMaterial color={COLORS.jacket} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[0.43, 0.08, 0.27]} />
              <meshStandardMaterial color={COLORS.jacketDark} />
            </mesh>
            <mesh position={[0, 0.3, 0.135]}>
              <boxGeometry args={[0.03, 0.46, 0.01]} />
              <meshStandardMaterial color="#2a2a2a" />
            </mesh>
            {/* backpack */}
            <group position={[0, 0.32, -0.25]}>
              <mesh castShadow>
                <boxGeometry args={[0.38, 0.56, 0.24]} />
                <meshStandardMaterial color={COLORS.pack} roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.3, 0.01]} castShadow>
                <boxGeometry args={[0.36, 0.1, 0.26]} />
                <meshStandardMaterial color={COLORS.packDark} />
              </mesh>
              <mesh position={[0, -0.04, -0.13]}>
                <boxGeometry args={[0.28, 0.22, 0.05]} />
                <meshStandardMaterial color={COLORS.packDark} />
              </mesh>
              <mesh position={[0, -0.34, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.08, 0.08, 0.46, 10]} />
                <meshStandardMaterial color={COLORS.pad} />
              </mesh>
              {/* ice axe strapped to the pack */}
              <mesh position={[0.1, 0.05, -0.14]} rotation={[0, 0, 0.1]}>
                <boxGeometry args={[0.03, 0.62, 0.03]} />
                <meshStandardMaterial color="#555" metalness={0.6} />
              </mesh>
            </group>
            {/* head */}
            <group ref={head} position={[0, 0.62, 0.01]}>
              <mesh position={[0, 0.02, 0]} castShadow>
                <cylinderGeometry args={[0.06, 0.07, 0.08, 8]} />
                <meshStandardMaterial color={COLORS.skin} />
              </mesh>
              <mesh position={[0, 0.15, 0]} castShadow>
                <sphereGeometry args={[0.12, 12, 10]} />
                <meshStandardMaterial color={COLORS.skin} roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.2, -0.01]} castShadow>
                <sphereGeometry args={[0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color={COLORS.beanie} />
              </mesh>
              <mesh position={[0, 0.33, -0.01]}>
                <sphereGeometry args={[0.04, 8, 6]} />
                <meshStandardMaterial color="#e8e2d0" />
              </mesh>
              <mesh position={[0, 0.16, 0.105]}>
                <boxGeometry args={[0.2, 0.045, 0.04]} />
                <meshStandardMaterial color="#141414" metalness={0.6} roughness={0.2} />
              </mesh>
              {loadout.headlamp && (
                <mesh position={[0, 0.23, 0.11]}>
                  <boxGeometry args={[0.06, 0.04, 0.03]} />
                  <meshStandardMaterial color="#222" emissive="#fff6d0" emissiveIntensity={0.6} />
                </mesh>
              )}
              <spotLight ref={lamp} position={[0, 0.23, 0.12]} angle={0.55} penumbra={0.6} distance={28} decay={1.2} color="#fff3d6" />
            </group>
            {/* arms */}
            {(['L', 'R'] as const).map((side) => (
              <Limb key={side} x={side === 'L' ? 0.26 : -0.26} y={0.52} len={0.32} w={0.06} color={COLORS.jacket} jointRef={side === 'L' ? armL : armR}>
                <Limb len={0.3} w={0.05} color={COLORS.jacket} jointRef={side === 'L' ? foreL : foreR}>
                  <mesh position={[0, -0.02, 0]} castShadow>
                    <sphereGeometry args={[0.055, 8, 6]} />
                    <meshStandardMaterial color={COLORS.glove} />
                  </mesh>
                  <group ref={side === 'L' ? poleL : poleR} rotation={[0.35, 0, 0]}>
                    <mesh geometry={poleGeo} castShadow>
                      <meshStandardMaterial color={COLORS.pole} metalness={0.7} roughness={0.35} />
                    </mesh>
                  </group>
                </Limb>
              </Limb>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------

const tmpTarget = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

/** Third-person follow camera, prep-screen flyover and summit cinematic. */
export function CameraRig() {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const initialised = useRef(-1);
  const dist = useRef(CAM_DEFAULT);
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = useGame.getState();
    const p = runtime.player;
    const t = clock.elapsedTime;

    if (g.phase === 'prep' || !p) {
      // Slow flyover of the mountain behind the expedition planner.
      const a = t * 0.025 + 0.6;
      tmpPos.set(Math.sin(a) * 900, 330 + Math.sin(t * 0.05) * 30, Math.cos(a) * 900);
      tmpTarget.set(0, 170, 0);
      camera.position.lerp(tmpPos, initialised.current === -2 ? 0.02 : 1);
      look.current.lerp(tmpTarget, initialised.current === -2 ? 0.05 : 1);
      initialised.current = -2;
      camera.lookAt(look.current);
      return;
    }

    const cam = runtime.cam;
    // Smooth zoom toward the pinch / scroll target.
    dist.current = lerp(dist.current, cam.dist, 1 - Math.exp(-dt * 8));
    const d = dist.current;

    if (g.phase === 'summit' && p.summited) {
      // Celebration: pull back and orbit 360° while the day cycles. Drag / pinch still steer it.
      const c = summitCinematic();
      const zoom = clamp(d / CAM_DEFAULT, 0.4, 3);
      const a = cam.yaw + c.orbit;
      const r = lerp(7, 58, c.reveal) * zoom;
      const h = (lerp(2.2, 22, c.reveal) + Math.sin(cam.pitch) * 18) * zoom;
      tmpPos.set(p.x + Math.sin(a) * r, p.y + h, p.z + Math.cos(a) * r);
      const ground = heightAt(tmpPos.x, tmpPos.z) + 2;
      if (tmpPos.y < ground) tmpPos.y = ground;
      camera.position.lerp(tmpPos, 1 - Math.exp(-dt * 2.5));
      tmpTarget.set(p.x, p.y + lerp(1.4, 0.5, c.reveal), p.z);
      look.current.lerp(tmpTarget, 1 - Math.exp(-dt * 3));
      camera.lookAt(look.current);
      return;
    }

    // Close in → eye height over the shoulder; far out → look at the climber's feet area.
    const near = clamp((CAM_DEFAULT - d) / (CAM_DEFAULT - CAM_MIN), 0, 1);
    const eye = p.y + p.jumpH + lerp(1.5, 1.72, near);
    const cp = Math.cos(cam.pitch);
    // Small sideways offset when close so the climber doesn't fill the screen.
    const side = near * 0.55;
    const sx = Math.cos(cam.yaw) * side;
    const sz = -Math.sin(cam.yaw) * side;
    tmpTarget.set(p.x + sx, eye, p.z + sz);
    tmpPos.set(p.x + sx + Math.sin(cam.yaw) * cp * d, eye + Math.sin(cam.pitch) * d, p.z + sz + Math.cos(cam.yaw) * cp * d);
    // Keep the camera above the terrain along the view ray.
    for (let i = 1; i <= 5; i++) {
      const f = i / 5;
      const x = lerp(tmpTarget.x, tmpPos.x, f);
      const z = lerp(tmpTarget.z, tmpPos.z, f);
      const y = lerp(tmpTarget.y, tmpPos.y, f);
      const minY = heightAt(x, z) + 0.5;
      if (y < minY) tmpPos.y += (minY - y) / f;
    }
    if (initialised.current !== runtime.runId || camera.position.distanceTo(tmpPos) > 80) {
      initialised.current = runtime.runId;
      dist.current = cam.dist;
      camera.position.copy(tmpPos);
      look.current.copy(tmpTarget);
    }
    camera.position.lerp(tmpPos, 1 - Math.exp(-dt * 10));
    look.current.lerp(tmpTarget, 1 - Math.exp(-dt * 14));
    camera.lookAt(look.current);
  });
  return null;
}
