import { create } from 'zustand';
import { startAudio } from './audio';
import { clearInput } from './input';
import { addRecord, type BestKind, type ExpeditionRecord } from './records';
import { computeScore, type Score } from './scoring';
import { createNav, type NavState, type SafePoint } from './navigation';
import { localBoard, routeKey } from './leaderboard';
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
  /** 1 = routine, 2 = important, 3 = critical (interrupts) */
  priority: number;
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
  tempF: number;
  windMph: number;
  weather: string;
  consumeKind: 'eat' | 'drink' | null;
  /** v0.4 navigation */
  trailState: 'on' | 'near' | 'off';
  place: string;
  /** way back to a safe trail point when not on the trail */
  guide: { distFt: number; card: string; /** screen-relative arrow angle, degrees clockwise */ rel: number } | null;
  realSeconds: number;
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
  score: Score;
  bestScoreBefore: number;
  qualifies: boolean;
  registerSigned: boolean;
  exhaustions: number;
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
  /** trail status (hysteresis) and the current safe rejoin point, shared by HUD and minimap */
  nav: NavState & { safe: SafePoint | null };
  /** signs / kiosk read this climb */
  readSigns: Set<string>;
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
  nav: { ...createNav(), safe: null },
  readSigns: new Set(),
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
  /** the one notification currently shown */
  notice: Toast | null;
  summary: Summary | null;
  showControls: boolean;
  reading: { title: string; text: string } | null;
  mapOpen: boolean;
  showHint: boolean;
  gemFlash: { kind: GemKind; at: number } | null;
  /** summit: hide the summary to enjoy the view */
  viewMode: boolean;
  logOpen: boolean;
  registerOpen: boolean;
  lbOpen: boolean;
  setLoadout: (l: Partial<Loadout>) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  toTrailhead: () => void;
  setHud: (h: HudSnapshot) => void;
  toast: (text: string, tone?: Toast['tone'], priority?: number) => void;
  dismissToast: (id: number) => void;
  completeSummit: () => void;
  setShowControls: (v: boolean) => void;
  setReading: (r: { title: string; text: string } | null) => void;
  setMapOpen: (v: boolean) => void;
  dismissHint: () => void;
  flashGem: (kind: GemKind) => void;
  setViewMode: (v: boolean) => void;
  setLogOpen: (v: boolean) => void;
  setRegisterOpen: (v: boolean) => void;
  setLbOpen: (v: boolean) => void;
}

/** True while a full-screen overlay is open — the simulation (and any boost timer) is paused. */
/** Reading a sign or the kiosk counts too: the expedition clock never runs while text is open. */
export function overlayOpen(g: { mapOpen: boolean; logOpen: boolean; registerOpen: boolean; lbOpen: boolean; reading: unknown }) {
  return g.mapOpen || g.logOpen || g.registerOpen || g.lbOpen || !!g.reading;
}

// Notification queue: one message at a time; critical ones interrupt.
const queue: Toast[] = [];
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

let toastId = 1;

function resetRun(loadout: Loadout) {
  clearInput();
  const p = createPlayer(loadout);
  runtime.player = p;
  runtime.loadout = loadout;
  runtime.runId++;
  runtime.summitAt = 0;
  runtime.registerSigned = false;
  runtime.nav = { ...createNav(), safe: null };
  runtime.readSigns = new Set();
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
  notice: null,
  summary: null,
  showControls: false,
  reading: null,
  mapOpen: false,
  showHint: false,
  gemFlash: null,
  viewMode: false,
  logOpen: false,
  registerOpen: false,
  lbOpen: false,
  setLoadout: (l) => set({ loadout: { ...get().loadout, ...l } }),
  start: () => {
    startAudio();
    resetRun(get().loadout);
    runtime.cameraUsed = hintSeen();
    set({
      phase: 'playing',
      runId: runtime.runId,
      summary: null,
      notice: null,
      reading: null,
      showControls: false,
      mapOpen: false,
      viewMode: false,
      logOpen: false,
      registerOpen: false,
      lbOpen: false,
      showHint: !runtime.cameraUsed,
    });
    queue.length = 0;
    get().toast('Follow the trail north', 'info', 2);
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
    queue.length = 0;
    set({ phase: 'prep', summary: null, hud: null, notice: null, reading: null, mapOpen: false, viewMode: false, registerOpen: false, lbOpen: false });
  },
  setHud: (h) => set({ hud: h }),
  toast: (text, tone = 'info', priority = tone === 'warn' ? 2 : 1) => {
    const cur = get().notice;
    if (cur?.text === text || queue.some((q) => q.text === text)) return;
    const t: Toast = { id: toastId++, text, tone, priority };
    const show = (n: Toast) => {
      set({ notice: n });
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => get().dismissToast(n.id), n.priority >= 3 ? 3200 : 2400);
    };
    if (!cur) show(t);
    else if (priority >= 3 && cur.priority < 3) {
      // Critical news interrupts; an interrupted routine message is stale, so drop it.
      if (cur.priority >= 2) queue.unshift(cur);
      show(t);
    } else {
      queue.push(t);
      queue.sort((a, b) => b.priority - a.priority);
      // Routine chatter goes stale quickly; keep the queue short.
      while (queue.length > 3) queue.pop();
    }
  },
  dismissToast: (id) => {
    if (get().notice?.id !== id) return;
    const next = queue.shift() ?? null;
    set({ notice: next });
    if (next) {
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => get().dismissToast(next.id), next.priority >= 3 ? 3200 : 2400);
    }
  },
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
      registerSigned: runtime.registerSigned,
    };
    const score = computeScore({
      realSeconds: p.realTime,
      exhaustions: p.exhaustions,
      gems: gems.total,
      gemsAvailable: W.gems.length,
      registerSigned: runtime.registerSigned,
    });
    rec.score = score.total;
    rec.scoreVersion = score.version;
    const rk = routeKey(ACTIVE_MOUNTAIN.id, ACTIVE_ROUTE.id);
    const prevBest = localBoard.top(rk, 'score', 1)[0]?.score ?? 0;
    const qualifies = localBoard.qualifies(rk, score.total);
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
        score,
        bestScoreBefore: prevBest,
        qualifies,
        registerSigned: runtime.registerSigned,
        exhaustions: p.exhaustions,
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
  setRegisterOpen: (v) => {
    clearInput();
    set({ registerOpen: v });
  },
  setLbOpen: (v) => set({ lbOpen: v }),
}));
