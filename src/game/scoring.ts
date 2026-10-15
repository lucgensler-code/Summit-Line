// Summit score, model v2 (v0.4). Speed is the primary skill; gemstones are a secondary reward
// for taking harder lines; two small style bonuses round it out. Every line has a clear maximum
// and a one-line hint. Reaching the summit is worth only a small completion award, so a slow
// ascent can never outscore a fast one by collecting extras.
//
//   Summit reached        1,000
//   Speed              0 – 6,000   full at ≤ 4:00 real time, linear to 0 at 15:00
//   Gemstones           150 each   (11 on the Climbers Trail → 1,650)
//   Clean climb              400   never hit exhaustion
//   Register signed          200
//
// Scores from different models are never compared: records and leaderboard entries carry
// `SCORE_VERSION`, and boards only rank entries of the current version.

export const SCORE_VERSION = 2;

export interface ScoreInput {
  realSeconds: number;
  exhaustions: number;
  gems: number;
  gemsAvailable: number;
  registerSigned: boolean;
}

export interface ScoreLine {
  id: 'summit' | 'speed' | 'gems' | 'clean' | 'register';
  label: string;
  points: number;
  max: number;
  hint: string;
}

export interface Score {
  version: number;
  total: number;
  lines: ScoreLine[];
}

export const SCORE_RULES = {
  summit: 1000,
  speedMax: 6000,
  /** full speed bonus at or under this many real seconds … */
  speedFullAt: 240,
  /** … falling linearly to zero here */
  speedZeroAt: 900,
  perGem: 150,
  cleanClimb: 400,
  register: 200,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function speedPoints(realSeconds: number) {
  const R = SCORE_RULES;
  return Math.round(R.speedMax * clamp01((R.speedZeroAt - realSeconds) / (R.speedZeroAt - R.speedFullAt)));
}

export function computeScore(s: ScoreInput): Score {
  const R = SCORE_RULES;
  const gems = Math.min(s.gems, s.gemsAvailable);
  const lines: ScoreLine[] = [
    { id: 'speed', label: 'Speed', points: speedPoints(s.realSeconds), max: R.speedMax, hint: `Full points at ${mmss(R.speedFullAt)} or faster; none after ${mmss(R.speedZeroAt)}.` },
    { id: 'gems', label: `Gemstones (${gems}/${s.gemsAvailable})`, points: gems * R.perGem, max: s.gemsAvailable * R.perGem, hint: `${R.perGem} each — greens sit on the steep cut-offs.` },
    { id: 'summit', label: 'Summit reached', points: R.summit, max: R.summit, hint: 'Stand on the true summit.' },
    { id: 'clean', label: 'Clean climb', points: s.exhaustions === 0 ? R.cleanClimb : 0, max: R.cleanClimb, hint: 'Never hit exhaustion.' },
    { id: 'register', label: 'Register signed', points: s.registerSigned ? R.register : 0, max: R.register, hint: 'Sign the summit register.' },
  ];
  return { version: SCORE_VERSION, total: lines.reduce((a, l) => a + l.points, 0), lines };
}

/** Upper bound used to sanity-check submitted scores. */
export function maxPossibleScore(gemsAvailable: number) {
  const R = SCORE_RULES;
  return R.summit + R.speedMax + gemsAvailable * R.perGem + R.cleanClimb + R.register;
}

/** Fastest real time we accept as plausible (well under what the sim allows). */
export const MIN_PLAUSIBLE_SECONDS = 150;
