import { useEffect, useRef, useState } from 'react';
import { input, queueAction } from '../game/input';
import { useGame } from '../game/store';

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');
}

function capture(e: React.PointerEvent) {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* pointer may already be released */
  }
}

/**
 * Full-screen camera layer: one finger drags to look, two fingers pinch to zoom.
 * Sits underneath the joystick and buttons so those keep their own touches.
 */
export function CameraGestures() {
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const down = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    capture(e);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = 0;
  };
  const move = (e: React.PointerEvent) => {
    const m = pts.current;
    const last = m.get(e.pointerId);
    if (!last) return;
    if (m.size >= 2) {
      m.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...m.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current > 0 && d > 0) input.zoomMul *= d / pinch.current;
      pinch.current = d;
      return;
    }
    input.lookDX += (e.clientX - last.x) * 1.2;
    input.lookDY += (e.clientY - last.y) * 1.2;
    m.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const up = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    pinch.current = 0;
  };
  return <div className="touch-look" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />;
}

/** Virtual joystick (left), contextual Jump/Action and Jog (right). */
export function TouchControls() {
  const [enabled] = useState(isTouchDevice);
  const stickOrigin = useRef<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false, cx: 0, cy: 0 });
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
  const R = 52;

  const onStickDown = (e: React.PointerEvent) => {
    capture(e);
    stickOrigin.current = { x: e.clientX, y: e.clientY };
    setKnob({ x: 0, y: 0, active: true, cx: e.clientX, cy: e.clientY });
    input.stick.active = true;
  };
  const onStickMove = (e: React.PointerEvent) => {
    const o = stickOrigin.current;
    if (!o) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob((k) => ({ ...k, x: dx, y: dy }));
    input.stick.x = dx / R;
    input.stick.y = -dy / R;
  };
  const onStickUp = () => {
    stickOrigin.current = null;
    setKnob({ x: 0, y: 0, active: false, cx: 0, cy: 0 });
    input.stick.active = false;
    input.stick.x = input.stick.y = 0;
  };

  const act = !!prompt;
  return (
    <div className="touch">
      <CameraGestures />
      <div className="touch-stick-zone" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        <div className={`stick-base ${knob.active ? 'active' : ''}`} style={knob.active ? { left: knob.cx - 56, top: knob.cy - 56, position: 'fixed' } : undefined}>
          <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
        {boostLeft > 0 && (
          <div className="boost-ring" aria-label={`Speed boost ${Math.ceil(boostLeft)} seconds`}>
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" className="track" />
              <circle cx="18" cy="18" r="15.5" className="arc" style={{ strokeDasharray: `${(boostLeft / 12) * 97.4} 97.4` }} />
            </svg>
            <b>{Math.ceil(boostLeft)}</b>
          </div>
        )}
      </div>
      <div className="touch-buttons">
        {act && <div className="act-label">{prompt}</div>}
        <button type="button" className={`tbtn jog ${jog ? 'on' : ''}`} onPointerDown={() => setJog((j) => !j)} aria-pressed={jog}>
          Jog
        </button>
        <button type="button" className={`tbtn main ${act ? 'act' : 'jump'}`} onPointerDown={() => queueAction('interact')}>
          {act ? 'Action' : 'Jump'}
        </button>
      </div>
    </div>
  );
}
