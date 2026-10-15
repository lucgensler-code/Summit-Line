// Home-screen mountain orbit: drag (mouse or touch) to spin it; the slow idle rotation resumes a
// few seconds after the last input.
export const prepOrbit = { yaw: 0, vel: 0, lastInput: -1e9 };

export function prepDrag(dx: number) {
  const now = performance.now() / 1000;
  const d = -dx * 0.006;
  prepOrbit.yaw += d;
  prepOrbit.vel = d / Math.max(1 / 120, Math.min(0.05, now - prepOrbit.lastInput));
  prepOrbit.lastInput = now;
}
