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
      estMinutes: [6, 9],
      // Flow: green before a demanding climb → red right after, beside the trail, pointing at a
      // shortcut or open ground — so the boost is collected fresh, not while exhausted.
      gems: [
        { id: 'g-forest', kind: 'green', at: 0.17, side: 3, note: 'before the steepest forest pitch' },
        { id: 'r-meander', kind: 'red', at: 0.21, side: -4, note: 'start of a long meander: cut straight up through open forest' },
        { id: 'g-knoll', kind: 'green', at: 0.4, side: -55, note: 'open knoll above treeline, visible from the trail' },
        { id: 'g-tarn', kind: 'green', at: 0.47, side: 108, note: 'far shore of the tarn — exploration' },
        { id: 'g-bench', kind: 'green', at: 0.49, side: 3, note: 'last flat ground before the cinder switchbacks' },
        { id: 'r-bench', kind: 'red', at: 0.53, side: 4, note: 'first switchback: boost a direct line up the open cone' },
        { id: 'g-switch1', kind: 'green', at: 0.64, side: 3, note: 'mid switchbacks, where most climbers stop' },
        { id: 'r-gully', kind: 'red', at: 0.67, side: -3, note: 'hairpin with an open shortcut to the next leg' },
        { id: 'g-switch2', kind: 'green', at: 0.76, side: -3, note: 'upper switchbacks' },
        { id: 'r-snow', kind: 'red', at: 0.8, side: 3, note: 'foot of the snowfield: boot track runs straight and open' },
        { id: 'g-snow', kind: 'green', at: 0.87, side: 9, note: 'beside the steep snow, just off the boot track' },
        { id: 'g-rim', kind: 'green', at: 0.95, side: -2.5, note: 'crater rim' },
      ],
    },
  ],
};

export const MOUNTAINS: MountainDef[] = [CINDERCREST];
export const ACTIVE_MOUNTAIN = CINDERCREST;
export const ACTIVE_ROUTE = CINDERCREST.routes[0];
