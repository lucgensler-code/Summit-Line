// Summit celebration timeline shared by the camera rig and the sky: one slow 360° orbit while the
// day runs through afternoon, sunset, a starry night and back to sunrise.
import { runtime } from './store';

export const CINE_SECONDS = 64;
/** The celebration settles here and holds: late sun, pink alpenglow on the snow. */
export const ALPENGLOW_HOUR = 18.55;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Near-constant pace with soft start/finish — keeps the time-lapse and orbit even. */
const glide = (t: number) => 0.6 * t + 0.4 * t * t * (3 - 2 * t);

export function summitCinematic() {
  const since = Math.max(0, performance.now() / 1000 - runtime.summitAt);
  const t = Math.min(since / CINE_SECONDS, 1);
  const h0 = runtime.summitHour;
  // Play the full cycle — day, golden hour, sunset, starry night, sunrise — and settle into the
  // following evening's alpenglow, which is then held.
  let end = ALPENGLOW_HOUR;
  while (end < h0 + 24) end += 24;
  // Gentle start (summit moment holds briefly), smooth in-out time-lapse.
  const k = glide(Math.max(0, Math.min(1, (since - 2.5) / (CINE_SECONDS - 2.5))));
  return {
    since,
    t,
    hour: h0 + (end - h0) * k,
    /** orbit angle: a full turn over the cinematic, then a slow drift */
    // One full turn over the cinematic (continuous velocity into the slow drift that follows).
    orbit: since < CINE_SECONDS ? glide(t) * Math.PI * 2 : Math.PI * 2 + (since - CINE_SECONDS) * 0.035,
    reveal: ease(Math.min(since / 8, 1)),
  };
}
