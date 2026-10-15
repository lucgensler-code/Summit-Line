// High scores. Two backends behind one interface:
//  • local — this browser's localStorage (always available);
//  • shared — the published artifact's `db` store: one document per player at `lb/<player id>`,
//    readable by everyone who can open the game, writable only by that player (rules declared at
//    publish). No credentials live in the client; the platform enforces who may write.

import { maxPossibleScore } from './scoring';

export interface LbEntry {
  id: string;
  name: string;
  score: number;
  realSeconds: number;
  mountainName: string;
  routeName: string;
  date: string;
  mine: boolean;
}

export interface LbSubmission {
  name: string;
  score: number;
  realSeconds: number;
  mountainId: string;
  mountainName: string;
  routeId: string;
  routeName: string;
  gemsAvailable: number;
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

/** Basic sanity checks so an obviously impossible score is never stored or sent. */
export function validSubmission(s: LbSubmission) {
  return (
    !!cleanName(s.name) &&
    Number.isFinite(s.score) &&
    s.score >= 0 &&
    s.score <= maxPossibleScore(s.gemsAvailable) &&
    Number.isFinite(s.realSeconds) &&
    s.realSeconds >= 120 &&
    s.realSeconds < 6 * 3600
  );
}

// ------------------------------------------------------------------ local backend

const LOCAL_KEY = 'summitline.highscores.v1';
interface LocalRow extends Omit<LbEntry, 'mine'> {
  routeKey: string;
}
function loadLocal(): LocalRow[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const routeKey = (mountainId: string, routeId: string) => `${mountainId}_${routeId}`.replace(/[^A-Za-z0-9_-]/g, '-');

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
      id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`,
      name: cleanName(s.name),
      score: Math.round(s.score),
      realSeconds: s.realSeconds,
      mountainName: s.mountainName,
      routeName: s.routeName,
      date: new Date().toISOString(),
      routeKey: rk,
    };
    const all = loadLocal();
    all.push(row);
    // Keep the board small: best 60 by score plus best 60 by time.
    const byScore = [...all].sort((a, b) => b.score - a.score).slice(0, 60);
    const byTime = [...all].sort((a, b) => a.realSeconds - b.realSeconds).slice(0, 60);
    const keep = new Map([...byScore, ...byTime].map((r) => [r.id, r]));
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify([...keep.values()]));
    } catch {
      /* ignore */
    }
    const rs = localBoard.top(rk, 'score', 1000).findIndex((r) => r.id === row.id) + 1;
    const rt = localBoard.top(rk, 'time', 1000).findIndex((r) => r.id === row.id) + 1;
    return { id: row.id, rankScore: rs, rankTime: rt };
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

const F = (rk: string, f: string) => `${rk}__${f}`;

export async function sharedTop(rk: string, sort: LbSort, n = 25): Promise<LbEntry[] | null> {
  const s = await sharedBoard();
  if (!s) return null;
  const field = sort === 'score' ? F(rk, 'score') : F(rk, 'time');
  const snap = await s.db.collection('lb').orderBy(field, sort === 'score' ? 'desc' : 'asc').limit(n).get();
  const out: LbEntry[] = [];
  for (const d of snap.docs) {
    const v = d.data();
    if (!v || typeof v[field] !== 'number') continue;
    const best = sort === 'score' ? 'score' : 'time';
    out.push({
      id: d.id,
      name: cleanName(String(v.name ?? '')) || '???',
      score: Number(v[F(rk, best === 'score' ? 'score' : 'timeScore')] ?? 0),
      realSeconds: Number(v[F(rk, best === 'score' ? 'scoreTime' : 'time')] ?? 0),
      mountainName: String(v[F(rk, 'mountain')] ?? ''),
      routeName: String(v[F(rk, 'route')] ?? ''),
      date: String(v[F(rk, best === 'score' ? 'scoreDate' : 'timeDate')] ?? ''),
      mine: d.id === s.uid,
    });
  }
  return out;
}

/** Merge this climb into the player's single shared document (keeps best score and best time). */
export async function sharedSubmit(sub: LbSubmission): Promise<'ok' | 'unavailable' | 'denied'> {
  const s = await sharedBoard();
  if (!s) return 'unavailable';
  if (s.canWrite === false) return 'denied';
  if (!validSubmission(sub)) return 'denied';
  const rk = routeKey(sub.mountainId, sub.routeId);
  const ref = s.db.doc(`lb/${s.uid}`);
  try {
    const cur = await ref.get();
    const v: Record<string, unknown> = { ...(cur.exists ? cur.data() : {}) };
    const now = new Date().toISOString();
    v.name = cleanName(sub.name);
    v.v = 1;
    v[F(rk, 'mountain')] = sub.mountainName;
    v[F(rk, 'route')] = sub.routeName;
    if (typeof v[F(rk, 'score')] !== 'number' || sub.score > (v[F(rk, 'score')] as number)) {
      v[F(rk, 'score')] = Math.round(sub.score);
      v[F(rk, 'scoreTime')] = Math.round(sub.realSeconds);
      v[F(rk, 'scoreDate')] = now;
    }
    if (typeof v[F(rk, 'time')] !== 'number' || sub.realSeconds < (v[F(rk, 'time')] as number)) {
      v[F(rk, 'time')] = Math.round(sub.realSeconds);
      v[F(rk, 'timeScore')] = Math.round(sub.score);
      v[F(rk, 'timeDate')] = now;
    }
    await ref.set(v);
    return 'ok';
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return code === 'invalid_argument' ? 'denied' : 'unavailable';
  }
}
