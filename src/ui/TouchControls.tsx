import { useEffect, useRef, useState } from 'react';
import { SPEED_BOOST } from '../game/sim';
import { IconRun } from './icons';
import { input, queueAction } from '../game/input';
import { useGame } from '../game/store';

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');
}

const STICK_R = 52;
const PINCH_WINDOW_MS = 260;

type Role = 'stick' | 'look';
interface Ptr {
  role: Role;
  x: number;
  y: number;
  t: number;
}

/**
 * One full-screen gesture surface (beneath the buttons and HUD controls):
 *  • a finger that lands in the lower-left movement zone drives the joystick;
 *  • any other single finger drags the camera;
 *  • two non-joystick fingers anywhere pinch-zoom — including a second finger that lands in the
 *    movement zone within a moment of the first (that's a pinch, not a joystick).
 */
export function GestureLayer({ stick = true, onStick }: { stick?: boolean; onStick?: (s: { active: boolean; cx: number; cy: number; x: number; y: number }) => void }) {
  const ptrs = useRef(new Map<number, Ptr>());
  const stickId = useRef<number | null>(null);
  const stickOrigin = useRef({ x: 0, y: 0 });
  const pinchDist = useRef(0);

  const inStickZone = (x: number, y: number) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const landscape = w > h;
    return x < w * (landscape ? 0.36 : 0.5) && y > h * (landscape ? 0.35 : 0.5) && y < h - (landscape ? 10 : 120);
  };
  const looks = () => [...ptrs.current.values()].filter((p) => p.role === 'look');

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const now = performance.now();
    const recentLook = looks().some((p) => now - p.t < PINCH_WINDOW_MS);
    const role: Role = stick && stickId.current === null && inStickZone(e.clientX, e.clientY) && !recentLook ? 'stick' : 'look';
    ptrs.current.set(e.pointerId, { role, x: e.clientX, y: e.clientY, t: now });
    if (role === 'stick') {
      stickId.current = e.pointerId;
      stickOrigin.current = { x: e.clientX, y: e.clientY };
      input.stick.active = true;
      onStick?.({ active: true, cx: e.clientX, cy: e.clientY, x: 0, y: 0 });
    }
    pinchDist.current = 0;
  };
  const move = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    if (p.role === 'stick') {
      let dx = e.clientX - stickOrigin.current.x;
      let dy = e.clientY - stickOrigin.current.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        dx = (dx / len) * STICK_R;
        dy = (dy / len) * STICK_R;
      }
      input.stick.x = dx / STICK_R;
      input.stick.y = -dy / STICK_R;
      onStick?.({ active: true, cx: stickOrigin.current.x, cy: stickOrigin.current.y, x: dx, y: dy });
      return;
    }
    const lk = looks();
    if (lk.length >= 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = lk;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0 && d > 0) input.zoomMul *= d / pinchDist.current;
      pinchDist.current = d;
      return;
    }
    input.lookDX += (e.clientX - p.x) * 1.2;
    input.lookDY += (e.clientY - p.y) * 1.2;
    p.x = e.clientX;
    p.y = e.clientY;
  };
  const up = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    ptrs.current.delete(e.pointerId);
    if (p?.role === 'stick') {
      stickId.current = null;
      input.stick.active = false;
      input.stick.x = input.stick.y = 0;
      onStick?.({ active: false, cx: 0, cy: 0, x: 0, y: 0 });
    }
    pinchDist.current = 0;
  };
  return <div className="touch-look" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />;
}

/** Backwards-compatible name used by the summit screen (camera only). */
export function CameraGestures() {
  return <GestureLayer stick={false} />;
}

/** Joystick visual, contextual Jump/Action and Dash. */
export function TouchControls() {
  const [enabled] = useState(isTouchDevice);
  const [knob, setKnob] = useState({ active: false, cx: 0, cy: 0, x: 0, y: 0 });
  const [jog, setJog] = useState(false);
  const prompt = useGame((s) => s.hud?.prompt);
  const boostLeft = useGame((s) => s.hud?.boostLeft ?? 0);

  useEffect(() => {
    input.touchJog = jog;
  }, [jog]);
  useEffect(
    () => () => {
      input.stick.active = false;
      input.touchJog = false;
    },
    [],
  );

  if (!enabled) return null;
  const act = !!prompt;
  return (
    <div className="touch">
      <GestureLayer onStick={setKnob} />
      <div className={`stick-base ${knob.active ? 'active' : ''}`} style={knob.active ? { left: knob.cx - 56, top: knob.cy - 56 } : undefined} aria-hidden="true">
        <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      {boostLeft > 0 && (
        <div className="boost-ring" aria-label={`Speed boost ${Math.ceil(boostLeft)} seconds`}>
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" className="track" />
            <circle cx="18" cy="18" r="15.5" className="arc" style={{ strokeDasharray: `${(boostLeft / SPEED_BOOST.seconds) * 97.4} 97.4` }} />
          </svg>
          <b>{Math.ceil(boostLeft)}</b>
        </div>
      )}
      <div className="touch-buttons">
        {act && <div className="act-label">{prompt}</div>}
        <button type="button" className={`tbtn jog ${jog ? 'on' : ''}`} onPointerDown={() => setJog((j) => !j)} aria-pressed={jog} aria-label="Dash">
          <IconRun size={18} />
          <span>Dash</span>
        </button>
        <button type="button" className={`tbtn main ${act ? 'act' : 'jump'}`} onPointerDown={() => queueAction('interact')}>
          {act ? 'Action' : 'Jump'}
        </button>
      </div>
    </div>
  );
}
