import { useEffect, useRef, useState } from 'react';
import { input, queueAction } from '../game/input';
import { useGame } from '../game/store';

function isTouchDevice() {
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

/** Virtual joystick (left), camera drag zone (right), and action buttons for touch screens. */
export function TouchControls() {
  const [enabled] = useState(isTouchDevice);
  const stickOrigin = useRef<{ x: number; y: number } | null>(null);
  const lookLast = useRef<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false, cx: 0, cy: 0 });
  const [jog, setJog] = useState(false);
  const prompt = useGame((s) => s.hud?.prompt);
  const pause = useGame((s) => s.pause);

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
  const R = 56;

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

  const onLookDown = (e: React.PointerEvent) => {
    capture(e);
    lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const onLookMove = (e: React.PointerEvent) => {
    const last = lookLast.current;
    if (!last) return;
    input.lookDX += (e.clientX - last.x) * 1.2;
    input.lookDY += (e.clientY - last.y) * 1.2;
    lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const onLookUp = () => {
    lookLast.current = null;
  };

  return (
    <div className="touch">
      <div className="touch-look" onPointerDown={onLookDown} onPointerMove={onLookMove} onPointerUp={onLookUp} onPointerCancel={onLookUp} />
      <div className="touch-stick-zone" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        <div
          className={`stick-base ${knob.active ? 'active' : ''}`}
          style={knob.active ? { left: knob.cx - 64, top: knob.cy - 64, position: 'fixed' } : undefined}
        >
          <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      </div>
      <div className="touch-buttons">
        <button type="button" className={`tbtn jog ${jog ? 'on' : ''}`} onPointerDown={() => setJog((j) => !j)}>
          {jog ? 'Jog ●' : 'Jog'}
        </button>
        <button type="button" className={`tbtn act ${prompt ? 'ready' : ''}`} onPointerDown={() => queueAction('interact')}>
          {prompt ? 'Action' : 'Act'}
        </button>
        <div className="tsmall">
          <button type="button" className="tbtn s" onPointerDown={() => queueAction('eat')}>
            🍫
          </button>
          <button type="button" className="tbtn s" onPointerDown={() => queueAction('drink')}>
            💧
          </button>
          <button type="button" className="tbtn s" onPointerDown={() => queueAction('rest')}>
            ⛺
          </button>
          <button type="button" className="tbtn s" onPointerDown={pause}>
            ❚❚
          </button>
        </div>
      </div>
    </div>
  );
}
