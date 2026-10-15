// Local expedition log + personal bests (browser localStorage; no accounts).

export interface ExpeditionRecord {
  id: string;
  mountainId: string;
  mountainName: string;
  routeId: string;
  routeName: string;
  date: string; // ISO
  departureHour: number;
  /** real-world play time, seconds */
  realSeconds: number;
  /** simulated expedition time, seconds */
  gameSeconds: number;
  distanceMi: number;
  gainFt: number;
  trailPct: number;
  foodUsed: number;
  waterUsedL: number;
  finalStamina: number;
  finalMaxStamina: number;
  gems: { green: number; red: number; total: number };
  /** v0.3+ */
  score?: number;
  registerSigned?: boolean;
}

export interface PersonalBests {
  climbs: number;
  fastestReal?: ExpeditionRecord;
  fastestGame?: ExpeditionRecord;
  fewestResources?: ExpeditionRecord;
  mostEfficient?: ExpeditionRecord;
}

export type BestKind = 'fastestReal' | 'fastestGame' | 'fewestResources' | 'mostEfficient';

const KEY = 'summitline.expeditions.v1';

export function loadRecords(): ExpeditionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as ExpeditionRecord[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRecords(list: ExpeditionRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* storage unavailable (private mode) — keep playing */
  }
}

export const resourcesUsed = (r: ExpeditionRecord) => r.foodUsed * 0.5 + r.waterUsedL;
/** Efficiency: share of the climb on trail, penalised by extra distance walked. */
export const efficiency = (r: ExpeditionRecord, routeMiles: number) => r.trailPct * Math.min(1, routeMiles / Math.max(r.distanceMi, 0.1));

export function personalBests(list: ExpeditionRecord[], mountainId?: string, routeId?: string, routeMiles = 5.8): PersonalBests {
  const rs = list.filter((r) => (!mountainId || r.mountainId === mountainId) && (!routeId || r.routeId === routeId));
  const pick = (score: (r: ExpeditionRecord) => number) => rs.reduce<ExpeditionRecord | undefined>((best, r) => (!best || score(r) < score(best) ? r : best), undefined);
  return {
    climbs: rs.length,
    fastestReal: pick((r) => r.realSeconds),
    fastestGame: pick((r) => r.gameSeconds),
    fewestResources: pick((r) => resourcesUsed(r) * 1000 + r.realSeconds / 1000),
    mostEfficient: pick((r) => -efficiency(r, routeMiles)),
  };
}

/** Adds a record and reports which personal bests it set (compared with the previous log). */
export function addRecord(rec: ExpeditionRecord, routeMiles: number): BestKind[] {
  const list = loadRecords();
  const before = personalBests(list, rec.mountainId, rec.routeId, routeMiles);
  list.push(rec);
  saveRecords(list);
  const out: BestKind[] = [];
  if (!before.fastestReal || rec.realSeconds < before.fastestReal.realSeconds) out.push('fastestReal');
  if (!before.fastestGame || rec.gameSeconds < before.fastestGame.gameSeconds) out.push('fastestGame');
  if (!before.fewestResources || resourcesUsed(rec) < resourcesUsed(before.fewestResources)) out.push('fewestResources');
  if (!before.mostEfficient || efficiency(rec, routeMiles) > efficiency(before.mostEfficient, routeMiles)) out.push('mostEfficient');
  return out;
}

export function clearRecords() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const BEST_LABEL: Record<BestKind, string> = {
  fastestReal: 'Fastest summit (real time)',
  fastestGame: 'Fastest expedition (trail clock)',
  fewestResources: 'Fewest supplies used',
  mostEfficient: 'Most efficient route',
};
