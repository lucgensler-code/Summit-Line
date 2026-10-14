// Shared, mutable input state written by keyboard / pointer / touch handlers and read every frame.

export type QueuedAction = 'interact' | 'eat' | 'drink' | 'rest';

export const input = {
  keys: new Set<string>(),
  /** virtual joystick, x = right, y = forward, magnitude 0..1 */
  stick: { x: 0, y: 0, active: false },
  touchJog: false,
  lookDX: 0,
  lookDY: 0,
  zoom: 0,
  queue: [] as QueuedAction[],
};

export function queueAction(a: QueuedAction) {
  input.queue.push(a);
}

export function moveAxes() {
  const k = input.keys;
  let fwd = 0;
  let right = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) right += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) right -= 1;
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

export function clearInput() {
  input.keys.clear();
  input.stick.x = input.stick.y = 0;
  input.stick.active = false;
  input.touchJog = false;
  input.lookDX = input.lookDY = input.zoom = 0;
  input.queue.length = 0;
}
