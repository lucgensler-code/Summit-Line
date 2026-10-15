// Shared, mutable input state written by keyboard / pointer / touch handlers and read every frame.

export type QueuedAction = 'interact' | 'eat' | 'drink' | 'rest' | 'jump' | 'primary';

export const input = {
  keys: new Set<string>(),
  /** virtual joystick, x = right, y = forward, magnitude 0..1 */
  stick: { x: 0, y: 0, active: false },
  touchJog: false,
  lookDX: 0,
  lookDY: 0,
  zoom: 0,
  /** pinch gesture: multiply camera distance by 1/zoomMul this frame */
  zoomMul: 1,
  /** request a smooth camera recenter behind the climber */
  recenter: false,
  queue: [] as QueuedAction[],
};

export function queueAction(a: QueuedAction) {
  input.queue.push(a);
}

// ------------------------------------------------------------------ key layout (desktop)

const SWAP_KEY = 'summitline.swapKeys';
let swapped = false;
try {
  swapped = localStorage.getItem(SWAP_KEY) === '1';
} catch {
  /* default layout */
}
/** false: WASD moves, arrows steer the camera. true: the reverse. */
export const keysSwapped = () => swapped;
export function setKeysSwapped(v: boolean) {
  swapped = v;
  try {
    localStorage.setItem(SWAP_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const WASD = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const moveSet = () => (swapped ? ARROWS : WASD);
const lookSet = () => (swapped ? WASD : ARROWS);

export function moveAxes() {
  const k = input.keys;
  const m = moveSet();
  let fwd = 0;
  let right = 0;
  if (k.has(m.up)) fwd += 1;
  if (k.has(m.down)) fwd -= 1;
  if (k.has(m.right)) right += 1;
  if (k.has(m.left)) right -= 1;
  const len = Math.hypot(fwd, right);
  if (len > 1) {
    fwd /= len;
    right /= len;
  }
  if (input.stick.active) {
    fwd = input.stick.y;
    right = input.stick.x;
  }
  const jog = k.has('ShiftLeft') || k.has('ShiftRight') || input.touchJog;
  return { fwd, right, jog };
}

/** Keyboard camera axes: yaw (-1..1), pitch (-1..1), zoom (-1 in .. +1 out). */
export function cameraKeyAxes() {
  const k = input.keys;
  const l = lookSet();
  const yaw = (k.has(l.right) ? 1 : 0) - (k.has(l.left) ? 1 : 0);
  const pitch = (k.has(l.up) ? 1 : 0) - (k.has(l.down) ? 1 : 0);
  const zoom = (k.has('ZoomOut') ? 1 : 0) - (k.has('ZoomIn') ? 1 : 0);
  return { yaw, pitch, zoom };
}

export function clearInput() {
  input.keys.clear();
  input.stick.x = input.stick.y = 0;
  input.stick.active = false;
  input.touchJog = false;
  input.lookDX = input.lookDY = input.zoom = 0;
  input.zoomMul = 1;
  input.recenter = false;
  input.queue.length = 0;
}
