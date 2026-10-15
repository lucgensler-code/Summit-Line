// Summit celebration timeline shared by the camera rig and the sky: one 360° orbit while the
// day runs through afternoon, sunset, a starry night and sunrise, settling into warm alpenglow.
// It starts when the summit screen begins it (runtime.summitAt, set after the name step); until
// then the camera and sky hold the summit moment.
import { daylight } from './sim';
import { runtime } from './store';

export const CINE_SECONDS = 32;
/** The celebration settles here and holds: late sun, pink alpenglow on the snow. */
export const ALPENGLOW_HOUR = 18.62;

/**
 * Time warp for the time-lapse (v0.5): darkness passes quickly, golden hours linger. Hours are
 * weighted by how much there is to see, and the playhead advances evenly through that weight.
 */
function weight(h: number) {
  const d = daylight(h);
  const golden = Math.max(0, 1 - Math.abs(d - 0.45) / 0.35); // around sunrise / sunset
  return 0.12 + 0.7 * Math.min(1, d / 0.5) + 0.9 * golden;
}
let warpKey = '';
let warpTable: Float32Array | null = null;
const WARP_N = 240;
function warpHour(h0: number, h1: number, k: number) {
  const key = `${h0.toFixed(3)}:${h1.toFixed(3)}`;
  if (key !== warpKey || !warpTable) {
    warpKey = key;
    warpTable = new Float32Array(WARP_N + 1);
    for (let i = 1; i <= WARP_N; i++) warpTable[i] = warpTable[i - 1] + weight(h0 + ((h1 - h0) * (i - 0.5)) / WARP_N);
  }
  const target = k * warpTable[WARP_N];
  let i = 0;
  while (i < WARP_N && warpTable[i + 1] < target) i++;
  const seg = warpTable[i + 1] - warpTable[i] || 1;
  return h0 + ((h1 - h0) * (i + Math.min(1, (target - warpTable[i]) / seg))) / WARP_N;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Near-constant pace with soft start/finish — keeps the time-lapse and orbit even. */
const glide = (t: number) => 0.6 * t + 0.4 * t * t * (3 - 2 * t);

export function summitCinematic() {
  const since = runtime.summitAt ? Math.max(0, performance.now() / 1000 - runtime.summitAt) : 0;
  const t = Math.min(since / CINE_SECONDS, 1);
  const h0 = runtime.summitHour;
  // Play the full cycle — day, golden hour, sunset, starry night, sunrise — and settle into the
  // following evening's alpenglow, which is then held.
  let end = ALPENGLOW_HOUR;
  while (end < h0 + 24) end += 24;
  // Gentle start (summit moment holds briefly), smooth in-out time-lapse.
  const k = glide(Math.max(0, Math.min(1, (since - 1.5) / (CINE_SECONDS - 1.5))));
  return {
    since,
    t,
    hour: warpHour(h0, end, k),
    /** orbit angle: a full turn over the cinematic, then a slow drift */
    // One full turn over the cinematic (continuous velocity into the slow drift that follows).
    orbit: since < CINE_SECONDS ? glide(t) * Math.PI * 2 : Math.PI * 2 + (since - CINE_SECONDS) * 0.035,
    reveal: ease(Math.min(since / 5, 1)),
  };
}
