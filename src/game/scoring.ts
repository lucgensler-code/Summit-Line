// Arcade expedition score. Pure and transparent: every component has a clear maximum and a
// one-line hint so players know how to improve. Completion time dominates; collectibles can't.

export interface ScoreInput {
  realSeconds: number;
  routeMiles: number;
  distanceMi: number;
  waterUsedL: number;
  foodUsed: number;
  finalMaxStamina: number;
  exhaustions: number;
  gems: number;
  gemsAvailable: number;
  registerSigned: boolean;
}

export interface ScoreLine {
  id: 'summit' | 'speed' | 'resources' | 'route' | 'gems' | 'expedition';
  label: string;
  points: number;
  max: number;
  hint: string;
}

export interface Score {
  total: number;
  lines: ScoreLine[];
}

export const SCORE_RULES = {
  summit: 5000,
  speedMax: 3000,
  /** full speed bonus at or under this many real seconds … */
  speedFullAt: 300,
  /** … falling linearly to zero here */
  speedZeroAt: 960,
  resourcesMax: 1000,
  routeMax: 1000,
  perGem: 50,
  register: 150,
  cleanClimb: 250,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function computeScore(s: ScoreInput): Score {
  const R = SCORE_RULES;
  const speedK = clamp01((R.speedZeroAt - s.realSeconds) / (R.speedZeroAt - R.speedFullAt));
  const speed = Math.round(R.speedMax * speedK);
  // Supplies: 600 for using little (2 L water + 4 bars ≈ zero), 400 for finishing with energy in reserve.
  const used = s.waterUsedL + s.foodUsed * 0.5;
  const supplies = Math.round(600 * clamp01(1 - used / 4) + 400 * clamp01(s.finalMaxStamina / 100));
  // Route: walking the route length (or less, via shortcuts) earns everything; wandering costs.
  const ratio = s.routeMiles / Math.max(s.distanceMi, 0.01);
  const route = Math.round(R.routeMax * Math.pow(clamp01(ratio), 2));
  const gems = Math.min(s.gems, s.gemsAvailable) * R.perGem;
  const expedition = (s.registerSigned ? R.register : 0) + (s.exhaustions === 0 ? R.cleanClimb : 0);
  const lines: ScoreLine[] = [
    { id: 'summit', label: 'Summit completion', points: R.summit, max: R.summit, hint: 'Reach the true summit.' },
    { id: 'speed', label: 'Speed bonus', points: speed, max: R.speedMax, hint: `Full bonus under ${R.speedFullAt / 60}:00 real time.` },
    { id: 'resources', label: 'Resource efficiency', points: supplies, max: R.resourcesMax, hint: 'Use supplies sparingly and keep energy in reserve.' },
    { id: 'route', label: 'Route efficiency', points: route, max: R.routeMax, hint: 'Avoid wandering; smart shortcuts count.' },
    { id: 'gems', label: 'Gemstone bonus', points: gems, max: s.gemsAvailable * R.perGem, hint: `${R.perGem} points per gemstone.` },
    {
      id: 'expedition',
      label: 'Expedition style',
      points: expedition,
      max: R.register + R.cleanClimb,
      hint: 'Sign the climbers register; never hit exhaustion.',
    },
  ];
  return { total: lines.reduce((a, l) => a + l.points, 0), lines };
}

/** Upper bound used to sanity-check submitted scores. */
export function maxPossibleScore(gemsAvailable: number) {
  const R = SCORE_RULES;
  return R.summit + R.speedMax + R.resourcesMax + R.routeMax + gemsAvailable * R.perGem + R.register + R.cleanClimb;
}
