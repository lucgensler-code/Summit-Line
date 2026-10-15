// Mountain + route catalogue. Gameplay code reads route metadata from here so new mountains and
// routes can be added as data. (Cindercrest's terrain generator lives in world.ts.)

export type GemKind = 'green' | 'red';

export interface GemSpec {
  id: string;
  kind: GemKind;
  /** position along the main trail, 0 = trailhead … 1 = summit */
  at: number;
  /** sideways offset from the trail centreline in world units (+ = right of travel) */
  side: number;
  /** why it is here — design note, shown nowhere */
  note: string;
}

export interface RouteDef {
  id: string;
  name: string;
  miles: number;
  difficulty: 'Moderate' | 'Strenuous' | 'Technical';
  estMinutes: [number, number];
  gems: GemSpec[];
}

export interface MountainDef {
  id: string;
  name: string;
  range: string;
  summitFt: number;
  trailheadFt: number;
  routes: RouteDef[];
}

export const CINDERCREST: MountainDef = {
  id: 'cindercrest',
  name: 'Cindercrest',
  range: 'Cascade Range volcano',
  summitFt: 10212,
  trailheadFt: 5446,
  routes: [
    {
      id: 'climbers-trail',
      name: 'Climbers Trail',
      miles: 5.8,
      difficulty: 'Strenuous',
      estMinutes: [8, 12],
      gems: [
        { id: 'g-forest', kind: 'green', at: 0.22, side: 3.5, note: 'steepest forest pitch' },
        { id: 'r-meander', kind: 'red', at: 0.12, side: -34, note: 'cut the first meander through the trees' },
        { id: 'g-tarn', kind: 'green', at: 0.47, side: 108, note: 'far shore of the tarn — exploration' },
        { id: 'r-bench', kind: 'red', at: 0.5, side: -8, note: 'base of the cone: boost a direct line up the first switchbacks' },
        { id: 'g-switch1', kind: 'green', at: 0.6, side: 3.5, note: 'mid switchbacks' },
        { id: 'r-gully', kind: 'red', at: 0.66, side: 24, note: 'shortcut between switchback legs' },
        { id: 'g-switch2', kind: 'green', at: 0.74, side: -3.5, note: 'upper switchbacks' },
        { id: 'g-knoll', kind: 'green', at: 0.4, side: -55, note: 'on an open knoll above treeline, visible from the trail' },
        { id: 'g-snow', kind: 'green', at: 0.86, side: 12, note: 'beside the demanding snowfield' },
        { id: 'r-snow', kind: 'red', at: 0.82, side: -6, note: 'boost through the snowfield' },
        { id: 'g-rim', kind: 'green', at: 0.95, side: -2.5, note: 'crater rim' },
      ],
    },
  ],
};

export const MOUNTAINS: MountainDef[] = [CINDERCREST];
export const ACTIVE_MOUNTAIN = CINDERCREST;
export const ACTIVE_ROUTE = CINDERCREST.routes[0];
