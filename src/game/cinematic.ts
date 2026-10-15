// Summit celebration timeline shared by the camera rig and the sky: one slow 360° orbit while the
// day runs through afternoon, sunset, a starry night and back to sunrise.
import { runtime } from './store';

export const CINE_SECONDS = 48;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function summitCinematic() {
  const since = Math.max(0, performance.now() / 1000 - runtime.summitAt);
  const t = Math.min(since / CINE_SECONDS, 1);
  const h0 = runtime.summitHour;
  // Finish on the next sunrise at least ~18 h later, so the whole day/night cycle plays out.
  let end = 6.6;
  while (end < h0 + 18) end += 24;
  // Gentle start (summit moment holds briefly), smooth in-out time-lapse.
  const k = ease(Math.max(0, Math.min(1, (since - 2.5) / (CINE_SECONDS - 2.5))));
  return {
    since,
    t,
    hour: h0 + (end - h0) * k,
    /** orbit angle: a full turn over the cinematic, then a slow drift */
    orbit: since < CINE_SECONDS ? ease(t) * Math.PI * 2 : Math.PI * 2 + (since - CINE_SECONDS) * 0.03,
    reveal: ease(Math.min(since / 8, 1)),
  };
}
