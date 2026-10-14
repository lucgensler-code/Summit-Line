// Tiny procedural soundscape (no assets): wind that strengthens with altitude and footstep crunches.

let ctx: AudioContext | null = null;
let windGain: GainNode | null = null;
let windFilter: BiquadFilterNode | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

function makeNoise(c: AudioContext, seconds: number, brown: boolean) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

export function startAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = makeNoise(ctx, 4, true);
      src.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      src.connect(windFilter).connect(windGain).connect(master);
      src.start();
      noise = makeNoise(ctx, 0.3, false);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.1);
}

export const isMuted = () => muted;

/** altitude01: 0 at the trailhead … 1 at the summit. */
export function updateWind(altitude01: number, time: number, active: boolean) {
  if (!ctx || !windGain || !windFilter) return;
  const gust = 0.6 + 0.4 * Math.sin(time * 0.35) * Math.sin(time * 0.13 + 1.3);
  const level = active ? (0.05 + altitude01 * altitude01 * 0.4) * gust : 0.02;
  windGain.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
  windFilter.frequency.setTargetAtTime(320 + altitude01 * 500 + gust * 250, ctx.currentTime, 0.5);
}

export function footstep(kind: 'soft' | 'gravel' | 'snow', strength = 1) {
  if (!ctx || !noise || !master || muted) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = kind === 'snow' ? 'highpass' : 'lowpass';
  f.frequency.value = kind === 'snow' ? 2200 : kind === 'gravel' ? 1800 : 600;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  const peak = (kind === 'soft' ? 0.12 : 0.09) * strength;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'snow' ? 0.16 : 0.1));
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.1, 0.2);
}
