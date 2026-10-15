// High scores. Two backends behind one interface:
//  • local — this browser's localStorage (always available);
//  • shared — the published artifact's `db` store: one document per player at `lb/<player id>`,
//    readable by everyone who can open the game, writable only by that player (rules declared at
//    publish). No credentials live in the client; the platform enforces who may write.

import { SCORE_RULES, SCORE_VERSION, maxPossibleScore, speedPoints, MIN_PLAUSIBLE_SECONDS } from './scoring';

export interface LbEntry {
  id: string;
  name: string;
  score: number;
  realSeconds: number;
  gems?: number;
  mountainName: string;
  routeName: string;
  date: string;
  mine: boolean;
  /** recomputed from an earlier version's run (v0.3 pacing, no clean-climb data) */
  migrated?: boolean;
}

export interface LbSubmission {
  name: string;
  score: number;
  realSeconds: number;
  gems: number;
  mountainId: string;
  mountainName: string;
  routeId: string;
  routeName: string;
  gemsAvailable: number;
  migrated?: boolean;
}

export type LbSort = 'score' | 'time';

// ------------------------------------------------------------------ player name

const NAME_KEY = 'summitline.playerName';
export function cleanName(raw: string) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ._-]/g, '')
    .trim()
    .slice(0, 12);
}
/** While typing: same character set, but spaces are kept (trimmed only on submit). */
export function typingName(raw: string) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ._-]/g, '')
    .replace(/^\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 12);
}
export function loadPlayerName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}
export function savePlayerName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}

/**
 * Sanity checks so an impossible score is never stored or sent. The score must sit inside the
 * band the scoring model allows for that time and gem count (summit + speed for the time, plus at
 * most the gems collected and the two style bonuses).
 */
export function validSubmission(s: LbSubmission) {
  if (!cleanName(s.name)) return false;
  if (![s.score, s.realSeconds, s.gems, s.gemsAvailable].every(Number.isFinite)) return false;
  if (s.realSeconds < MIN_PLAUSIBLE_SECONDS || s.realSeconds >= 6 * 3600) return false;
  if (s.gems < 0 || s.gems > s.gemsAvailable) return false;
  const floor = SCORE_RULES.summit + speedPoints(s.realSeconds);
  const ceil = floor + s.gems * SCORE_RULES.perGem + SCORE_RULES.cleanClimb + SCORE_RULES.register;
  return s.score >= floor - 1 && s.score <= ceil + 1 && s.score <= maxPossibleScore(s.gemsAvailable);
}

// ------------------------------------------------------------------ local backend

// v0.5 changed pacing and scoring, so the board restarts: older runs aren't comparable.
const LOCAL_KEY = 'summitline.highscores.v3';
interface LocalRow extends Omit<LbEntry, 'mine'> {
  routeKey: string;
  scoreVersion: number;
  /** already merged into the shared board */
  synced?: boolean;
}
function readJson<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveLocal(rows: LocalRow[]) {
  // Keep the board small: best 60 by score plus best 60 by time.
  const byScore = [...rows].sort((a, b) => b.score - a.score).slice(0, 60);
  const byTime = [...rows].sort((a, b) => a.realSeconds - b.realSeconds).slice(0, 60);
  const keep = new Map([...byScore, ...byTime].map((r) => [r.id, r]));
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([...keep.values()]));
  } catch {
    /* ignore */
  }
}

function loadLocal(): LocalRow[] {
  return readJson<LocalRow>(LOCAL_KEY).filter((r) => r.scoreVersion === SCORE_VERSION);
}

export const routeKey = (mountainId: string, routeId: string) => `${mountainId}_${routeId}`.replace(/[^A-Za-z0-9_-]/g, '-');

const newId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export const localBoard = {
  top(rk: string, sort: LbSort, n = 25): LbEntry[] {
    const rows = loadLocal().filter((r) => r.routeKey === rk);
    rows.sort((a, b) => (sort === 'score' ? b.score - a.score : a.realSeconds - b.realSeconds));
    return rows.slice(0, n).map((r) => ({ ...r, mine: true }));
  },
  /** Would this score make the local top `n`? */
  qualifies(rk: string, score: number, n = 10) {
    const top = localBoard.top(rk, 'score', n);
    return top.length < n || score > top[top.length - 1].score;
  },
  add(s: LbSubmission): { id: string; rankScore: number; rankTime: number } {
    const rk = routeKey(s.mountainId, s.routeId);
    const row: LocalRow = {
      id: newId(),
      name: cleanName(s.name),
      score: Math.round(s.score),
      realSeconds: s.realSeconds,
      gems: s.gems,
      mountainName: s.mountainName,
      routeName: s.routeName,
      date: new Date().toISOString(),
      routeKey: rk,
      scoreVersion: SCORE_VERSION,
    };
    saveLocal([...loadLocal(), row]);
    const rs = localBoard.top(rk, 'score', 1000).findIndex((r) => r.id === row.id) + 1;
    const rt = localBoard.top(rk, 'time', 1000).findIndex((r) => r.id === row.id) + 1;
    return { id: row.id, rankScore: rs, rankTime: rt };
  },
  /** Runs not yet merged into the shared board (saved offline, or before it was reachable). */
  unsynced(rk: string) {
    return loadLocal().filter((r) => r.routeKey === rk && !r.synced);
  },
  markSynced(ids: string[]) {
    const set = new Set(ids);
    saveLocal(loadLocal().map((r) => (set.has(r.id) ? { ...r, synced: true } : r)));
  },
};

// ------------------------------------------------------------------ shared backend (artifact db)

/* Minimal structural types for the platform's `db` / `user` capabilities (contract 0.2.x). */
interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface QuerySnap {
  docs: DocSnap[];
}
interface Query {
  orderBy(f: string, dir?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(d: Record<string, unknown>): Promise<void>;
}
interface Db {
  doc(p: string): DocRef;
  collection(p: string): Query & { doc(id: string): DocRef };
}
interface UserCap {
  id(): Promise<string | null>;
  can(name: string): Promise<boolean | null>;
}
type ClaudeGlobal = { use(name: string): Promise<unknown> };

let sharedInit: Promise<{ db: Db; uid: string; canWrite: boolean | null } | null> | null = null;

/** Resolves the shared store when this page runs inside the published artifact for a signed-in viewer. */
export function sharedBoard() {
  if (!sharedInit) {
    sharedInit = (async () => {
      const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
      if (!claude?.use) return null;
      try {
        const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [Db | null, UserCap | null];
        if (!db || !user) return null;
        const uid = await user.id();
        if (!uid) return null;
        const canWrite = await user.can('data.write').catch(() => null);
        return { db, uid, canWrite };
      } catch {
        return null;
      }
    })();
  }
  return sharedInit;
}

// Shared layout (v2): one document per player, `lb/<player id>`. For each route + scoring version
// it holds the player's best runs (top 5 by score ∪ top 5 by time) plus two top-level "best"
// fields the board orders by. The board flattens runs, so a player's several good climbs can all
// appear — not just one per player. v1 fields (v0.3) are left untouched in the same document.
const RUNS_KEEP = 5;
const vkey = (rk: string) => `${rk}_s${SCORE_VERSION}`;
const F = (rk: string, f: string) => `${vkey(rk)}__${f}`;

interface SharedRun {
  id: string;
  name: string;
  score: number;
  t: number;
  gems: number;
  date: string;
  m?: 1;
}

function isRun(r: unknown): r is SharedRun {
  const v = r as SharedRun;
  return !!v && typeof v.id === 'string' && typeof v.score === 'number' && typeof v.t === 'number';
}

export async function sharedTop(rk: string, sort: LbSort, n = 25): Promise<LbEntry[] | null> {
  const s = await sharedBoard();
  if (!s) return null;
  const field = sort === 'score' ? F(rk, 'score') : F(rk, 'time');
  const snap = await s.db.collection('lb').orderBy(field, sort === 'score' ? 'desc' : 'asc').limit(60).get();
  const out: LbEntry[] = [];
  for (const d of snap.docs) {
    const v = d.data();
    if (!v || typeof v[field] !== 'number') continue;
    const runs = Array.isArray(v[F(rk, 'runs')]) ? (v[F(rk, 'runs')] as unknown[]).filter(isRun) : [];
    for (const r of runs) {
      out.push({
        id: `${d.id}:${r.id}`,
        name: cleanName(String(r.name ?? v.name ?? '')) || '???',
        score: Math.round(r.score),
        realSeconds: r.t,
        gems: r.gems,
        mountainName: String(v[F(rk, 'mountain')] ?? ''),
        routeName: String(v[F(rk, 'route')] ?? ''),
        date: String(r.date ?? ''),
        mine: d.id === s.uid,
        migrated: r.m === 1,
      });
    }
  }
  out.sort((a, b) => (sort === 'score' ? b.score - a.score || a.realSeconds - b.realSeconds : a.realSeconds - b.realSeconds || b.score - a.score));
  return out.slice(0, n);
}

function keepRuns(runs: SharedRun[]) {
  const byScore = [...runs].sort((a, b) => b.score - a.score).slice(0, RUNS_KEEP);
  const byTime = [...runs].sort((a, b) => a.t - b.t).slice(0, RUNS_KEEP);
  return [...new Map([...byScore, ...byTime].map((r) => [r.id, r])).values()];
}

/**
 * Merge runs into the player's shared document. Pass the run just finished plus any local runs
 * that never reached the board (offline, or saved before the board was reachable) — this is how
 * local scores migrate. Duplicate runs (same id, or same time + score) are merged once.
 */
export async function sharedSubmit(sub: LbSubmission, pending: Omit<LbEntry, 'mine'>[] = []): Promise<'ok' | 'unavailable' | 'denied'> {
  const s = await sharedBoard();
  if (!s) return 'unavailable';
  if (s.canWrite === false) return 'denied';
  const rk = routeKey(sub.mountainId, sub.routeId);
  const now = new Date().toISOString();
  const incoming: SharedRun[] = [];
  const add = (x: LbSubmission, id: string, date: string) => {
    if (!validSubmission(x)) return;
    incoming.push({ id, name: cleanName(x.name), score: Math.round(x.score), t: Math.round(x.realSeconds * 10) / 10, gems: x.gems, date, ...(x.migrated ? { m: 1 as const } : {}) });
  };
  add(sub, newId(), now);
  for (const p of pending) add({ ...sub, name: p.name, score: p.score, realSeconds: p.realSeconds, gems: p.gems ?? 0, migrated: p.migrated }, p.id, p.date || now);
  if (!incoming.length) return 'denied';
  const ref = s.db.doc(`lb/${s.uid}`);
  try {
    const cur = await ref.get();
    const v: Record<string, unknown> = { ...(cur.exists ? cur.data() : {}) };
    const prev = Array.isArray(v[F(rk, 'runs')]) ? (v[F(rk, 'runs')] as unknown[]).filter(isRun) : [];
    const seen = new Set(prev.map((r) => `${r.t}|${r.score}`));
    const ids = new Set(prev.map((r) => r.id));
    const merged = [...prev];
    for (const r of incoming) {
      if (ids.has(r.id) || seen.has(`${r.t}|${r.score}`)) continue;
      merged.push(r);
      ids.add(r.id);
      seen.add(`${r.t}|${r.score}`);
    }
    const runs = keepRuns(merged);
    v.name = cleanName(sub.name);
    v.v = 2;
    v[F(rk, 'mountain')] = sub.mountainName;
    v[F(rk, 'route')] = sub.routeName;
    v[F(rk, 'runs')] = runs;
    v[F(rk, 'score')] = Math.max(...runs.map((r) => r.score));
    v[F(rk, 'time')] = Math.min(...runs.map((r) => r.t));
    await ref.set(v);
    return 'ok';
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return code === 'invalid_argument' || code === 'permission_denied' ? 'denied' : 'unavailable';
  }
}
