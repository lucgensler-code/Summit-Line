import { create } from 'zustand';
import { startAudio } from './audio';
import { clearInput } from './input';
import { addRecord, type BestKind, type ExpeditionRecord } from './records';
import { ACTIVE_MOUNTAIN, ACTIVE_ROUTE, type GemKind } from './routes';
import { DEFAULT_LOADOUT, clockHour, createPlayer, rating, type Loadout, type PlayerState } from './sim';
import { getWorld, unitsToMiles } from './world';

export type Phase = 'prep' | 'playing' | 'paused' | 'summit';

/** Camera distance range: near over-the-shoulder … wide route-planning view. */
export const CAM_MIN = 2.2;
export const CAM_MAX = 42;
export const CAM_DEFAULT = 8;

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
  boostLeft: number;
  limiter: string | null;
  gemCount: number;
  gemTotal: number;
  canAct: boolean;
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
  gems: { green: number; red: number; total: number; available: number };
  foodUsed: number;
  waterUsed: number;
  bests: BestKind[];
  climbNumber: number;
}

export interface Burst {
  kind: GemKind;
  x: number;
  y: number;
  z: number;
  t0: number;
}

/** Mutable per-run state shared with the render loop (not reactive). */
export const runtime: {
  player: PlayerState | null;
  loadout: Loadout;
  runId: number;
  summitAt: number;
  /** clock hour at the moment of summiting (time-lapse starts here) */
  summitHour: number;
  cam: { yaw: number; pitch: number; dist: number };
  registerSigned: boolean;
  cameraUsed: boolean;
  fx: Burst[];
} = {
  player: null,
  loadout: DEFAULT_LOADOUT,
  runId: 0,
  summitAt: 0,
  summitHour: 12,
  cam: { yaw: 0, pitch: 0.32, dist: CAM_DEFAULT },
  registerSigned: false,
  cameraUsed: false,
  fx: [],
};

const HINT_KEY = 'summitline.cameraHintSeen';
function hintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

interface GameStore {
  phase: Phase;
  loadout: Loadout;
  runId: number;
  hud: HudSnapshot | null;
  toasts: Toast[];
  summary: Summary | null;
  showControls: boolean;
  reading: { title: string; text: string } | null;
  mapOpen: boolean;
  showHint: boolean;
  gemFlash: { kind: GemKind; at: number } | null;
  /** summit: hide the summary to enjoy the view */
  viewMode: boolean;
  logOpen: boolean;
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
  setMapOpen: (v: boolean) => void;
  dismissHint: () => void;
  flashGem: (kind: GemKind) => void;
  setViewMode: (v: boolean) => void;
  setLogOpen: (v: boolean) => void;
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
  runtime.fx.length = 0;
  runtime.cam.yaw = p.heading + Math.PI;
  runtime.cam.pitch = 0.3;
  runtime.cam.dist = CAM_DEFAULT;
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
  mapOpen: false,
  showHint: false,
  gemFlash: null,
  viewMode: false,
  logOpen: false,
  setLoadout: (l) => set({ loadout: { ...get().loadout, ...l } }),
  start: () => {
    startAudio();
    resetRun(get().loadout);
    runtime.cameraUsed = hintSeen();
    set({
      phase: 'playing',
      runId: runtime.runId,
      summary: null,
      toasts: [],
      reading: null,
      showControls: false,
      mapOpen: false,
      viewMode: false,
      logOpen: false,
      showHint: !runtime.cameraUsed,
    });
    get().toast('Expedition started — follow the trail north toward Cindercrest.', 'info');
  },
  pause: () => {
    if (get().phase === 'playing') {
      clearInput();
      set({ phase: 'paused', showControls: false, mapOpen: false });
    }
  },
  resume: () => {
    if (get().phase === 'paused') set({ phase: 'playing', showControls: false });
  },
  restart: () => get().start(),
  toTrailhead: () => {
    clearInput();
    runtime.player = null;
    set({ phase: 'prep', summary: null, hud: null, toasts: [], reading: null, mapOpen: false, viewMode: false });
  },
  setHud: (h) => set({ hud: h }),
  toast: (text, tone = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone }] });
    setTimeout(() => get().dismissToast(id), 3600);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  completeSummit: () => {
    const p = runtime.player;
    if (!p) return;
    const l = runtime.loadout;
    const W = getWorld();
    const r = rating(p, l);
    runtime.summitHour = clockHour(p, l);
    const splits = W.checkpoints
      .filter((c) => p.checkpoints[c.id] !== undefined && c.id !== 'summit')
      .map((c) => ({ name: c.name, hours: p.checkpoints[c.id] / 3600 }));
    splits.push({ name: `${ACTIVE_MOUNTAIN.name} Summit`, hours: p.gameTime / 3600 });
    const gems = { ...p.gemCounts, total: p.gemCounts.green + p.gemCounts.red, available: W.gems.length };
    const rec: ExpeditionRecord = {
      id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      mountainId: ACTIVE_MOUNTAIN.id,
      mountainName: ACTIVE_MOUNTAIN.name,
      routeId: ACTIVE_ROUTE.id,
      routeName: ACTIVE_ROUTE.name,
      date: new Date().toISOString(),
      departureHour: l.departureHour,
      realSeconds: p.realTime,
      gameSeconds: p.gameTime,
      distanceMi: unitsToMiles(p.distance),
      gainFt: p.elevGain * W.ftPerUnit,
      trailPct: r.trailPct,
      foodUsed: p.foodUsed,
      waterUsedL: p.waterUsed,
      finalStamina: p.stamina,
      finalMaxStamina: p.maxStamina,
      gems: { green: gems.green, red: gems.red, total: gems.total },
    };
    const bests = addRecord(rec, ACTIVE_ROUTE.miles);
    let climbNumber = 1;
    try {
      climbNumber = JSON.parse(localStorage.getItem('summitline.expeditions.v1') || '[]').length;
    } catch {
      /* ignore */
    }
    set({
      phase: 'summit',
      viewMode: false,
      mapOpen: false,
      reading: null,
      summary: {
        hours: r.hours,
        realSeconds: p.realTime,
        finishHour: r.finish,
        distMi: rec.distanceMi,
        gainFt: rec.gainFt,
        stamina: p.stamina,
        maxStamina: p.maxStamina,
        hydration: p.hydration,
        water: p.water,
        food: p.food,
        trailPct: r.trailPct,
        title: r.title,
        splits,
        gems,
        foodUsed: p.foodUsed,
        waterUsed: p.waterUsed,
        bests: climbNumber > 1 ? bests : [],
        climbNumber,
      },
    });
  },
  setShowControls: (v) => set({ showControls: v }),
  setReading: (r) => set({ reading: r }),
  setMapOpen: (v) => {
    clearInput();
    set({ mapOpen: v });
  },
  dismissHint: () => {
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
    set({ showHint: false });
  },
  flashGem: (kind) => set({ gemFlash: { kind, at: performance.now() } }),
  setViewMode: (v) => set({ viewMode: v }),
  setLogOpen: (v) => set({ logOpen: v }),
}));
