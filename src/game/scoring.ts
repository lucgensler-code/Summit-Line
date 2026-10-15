// Summit score, model v3 (v0.5). Speed dominates: every second counts the same, and nothing else
// is big enough to undo a clearly faster climb.
//
//   Time               20 points for every second under 15:00   (5:00 → 12,000; 4:05 → 12,900)
//   Gemstones          50 each                                    (11 → 550, i.e. worth ~27 s)
//   Summit reached     500
//   Clean climb        200   never hit exhaustion
//   Register signed    100
//
// So a run 27 s faster beats a slower one even if the slower run collected every gem.
// Scores from different models are never compared: records and leaderboard entries carry
// `SCORE_VERSION`, and boards only rank entries of the current version.

export const SCORE_VERSION = 3;

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
  summit: 500,
  /** points per real second under `speedZeroAt` */
  perSecond: 20,
  speedZeroAt: 900,
  perGem: 50,
  cleanClimb: 200,
  register: 100,
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function speedPoints(realSeconds: number) {
  const R = SCORE_RULES;
  return Math.round(Math.max(0, R.speedZeroAt - realSeconds) * R.perSecond);
}

export function computeScore(s: ScoreInput): Score {
  const R = SCORE_RULES;
  const gems = Math.min(s.gems, s.gemsAvailable);
  const lines: ScoreLine[] = [
    {
      id: 'speed',
      label: `Time ${mmss(s.realSeconds)}`,
      points: speedPoints(s.realSeconds),
      max: speedPoints(240),
      hint: `${R.perSecond} points for every second under ${mmss(R.speedZeroAt)} — each second faster is worth ${R.perSecond}.`,
    },
    { id: 'gems', label: `Gemstones (${gems}/${s.gemsAvailable})`, points: gems * R.perGem, max: s.gemsAvailable * R.perGem, hint: `${R.perGem} each — greens sit on the steep cut-offs, reds speed you up.` },
    { id: 'summit', label: 'Summit reached', points: R.summit, max: R.summit, hint: 'Stand on the true summit.' },
    { id: 'clean', label: 'Clean climb', points: s.exhaustions === 0 ? R.cleanClimb : 0, max: R.cleanClimb, hint: 'Never hit exhaustion.' },
    { id: 'register', label: 'Register signed', points: s.registerSigned ? R.register : 0, max: R.register, hint: 'Sign the summit register.' },
  ];
  return { version: SCORE_VERSION, total: lines.reduce((a, l) => a + l.points, 0), lines };
}

/** Upper bound used to sanity-check submitted scores. */
export function maxPossibleScore(gemsAvailable: number) {
  const R = SCORE_RULES;
  return R.summit + speedPoints(MIN_PLAUSIBLE_SECONDS) + gemsAvailable * R.perGem + R.cleanClimb + R.register;
}

/** Fastest real time we accept as plausible (well under what the sim allows). */
export const MIN_PLAUSIBLE_SECONDS = 150;
