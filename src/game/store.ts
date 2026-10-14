import { create } from 'zustand';
import { startAudio } from './audio';
import { clearInput } from './input';
import { DEFAULT_LOADOUT, createPlayer, rating, type Loadout, type PlayerState } from './sim';
import { getWorld, unitsToMiles } from './world';

export type Phase = 'prep' | 'playing' | 'paused' | 'summit';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'good';
}

export interface HudSnapshot {
  elevFt: number;
  gainFt: number;
  distMi: number;
  remainMi: number;
  stamina: number;
  maxStamina: number;
  hydration: number;
  water: number;
  food: number;
  packKg: number;
  clock: number;
  elapsed: number;
  surface: string;
  onTrail: boolean;
  postholing: boolean;
  exhausted: boolean;
  resting: boolean;
  activity: string;
  heading: number;
  objective: string;
  prompt: string | null;
  progress: number;
  x: number;
  z: number;
  snowSoft: number;
  daylight: number;
  checkpoints: string[];
}

export interface Summary {
  hours: number;
  realSeconds: number;
  finishHour: number;
  distMi: number;
  gainFt: number;
  stamina: number;
  maxStamina: number;
  hydration: number;
  water: number;
  food: number;
  trailPct: number;
  title: string;
  splits: { name: string; hours: number }[];
}

/** Mutable per-run state shared with the render loop (not reactive). */
export const runtime: {
  player: PlayerState | null;
  loadout: Loadout;
  runId: number;
  summitAt: number;
  cam: { yaw: number; pitch: number; dist: number };
  registerSigned: boolean;
} = {
  player: null,
  loadout: DEFAULT_LOADOUT,
  runId: 0,
  summitAt: 0,
  cam: { yaw: 0, pitch: 0.32, dist: 8 },
  registerSigned: false,
};

interface GameStore {
  phase: Phase;
  loadout: Loadout;
  runId: number;
  hud: HudSnapshot | null;
  toasts: Toast[];
  summary: Summary | null;
  showControls: boolean;
  reading: { title: string; text: string } | null;
  setLoadout: (l: Partial<Loadout>) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  toTrailhead: () => void;
  setHud: (h: HudSnapshot) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  completeSummit: () => void;
  setShowControls: (v: boolean) => void;
  setReading: (r: { title: string; text: string } | null) => void;
}

let toastId = 1;

function resetRun(loadout: Loadout) {
  clearInput();
  const p = createPlayer(loadout);
  runtime.player = p;
  runtime.loadout = loadout;
  runtime.runId++;
  runtime.summitAt = 0;
  runtime.registerSigned = false;
  runtime.cam.yaw = p.heading + Math.PI;
  runtime.cam.pitch = 0.3;
  runtime.cam.dist = 8;
}

export const useGame = create<GameStore>((set, get) => ({
  phase: 'prep',
  loadout: DEFAULT_LOADOUT,
  runId: 0,
  hud: null,
  toasts: [],
  summary: null,
  showControls: false,
  reading: null,
  setLoadout: (l) => set({ loadout: { ...get().loadout, ...l } }),
  start: () => {
    startAudio();
    resetRun(get().loadout);
    set({ phase: 'playing', runId: runtime.runId, summary: null, toasts: [], reading: null, showControls: false });
    get().toast('Expedition started — follow the trail north toward Cindercrest.', 'info');
  },
  pause: () => {
    if (get().phase === 'playing') {
      clearInput();
      set({ phase: 'paused', showControls: false });
    }
  },
  resume: () => {
    if (get().phase === 'paused') set({ phase: 'playing', showControls: false });
  },
  restart: () => get().start(),
  toTrailhead: () => {
    clearInput();
    runtime.player = null;
    set({ phase: 'prep', summary: null, hud: null, toasts: [], reading: null });
  },
  setHud: (h) => set({ hud: h }),
  toast: (text, tone = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] });
    setTimeout(() => get().dismissToast(id), 3800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  completeSummit: () => {
    const p = runtime.player;
    if (!p) return;
    const l = runtime.loadout;
    const W = getWorld();
    const r = rating(p, l);
    const splits = W.checkpoints
      .filter((c) => p.checkpoints[c.id] !== undefined)
      .map((c) => ({ name: c.name, hours: p.checkpoints[c.id] / 3600 }));
    splits.push({ name: 'Cindercrest Summit', hours: p.gameTime / 3600 });
    set({
      phase: 'summit',
      summary: {
        hours: r.hours,
        realSeconds: p.realTime,
        finishHour: r.finish,
        distMi: unitsToMiles(p.distance),
        gainFt: p.elevGain * W.ftPerUnit,
        stamina: p.stamina,
        maxStamina: p.maxStamina,
        hydration: p.hydration,
        water: p.water,
        food: p.food,
        trailPct: r.trailPct,
        title: r.title,
        splits,
      },
    });
  },
  setShowControls: (v) => set({ showControls: v }),
  setReading: (r) => set({ reading: r }),
}));
