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
  /**
   * Shortcut gem: instead of sitting beside the trail, it is placed partway along the straight
   * line from the trail point at `at` to the switchback leg directly above it, so collecting it
   * means taking the steep cut-off. Value = fraction along that line.
   */
  cut?: number;
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
      estMinutes: [4, 7],
      // v0.4 layout, derived from the trail's grade profile (scripts/simulate-ascent.ts → gems):
      //  · red (speed boost) at the START of the longer gentle sections, where the boost turns
      //    into distance instead of being wasted grinding up a hill — plus one for the final
      //    summit approach along the rim;
      //  · green (stamina) on the steep switchback cut-offs — the reward for taking the harder,
      //    shorter line.
      gems: [
        { id: 'r-forest', kind: 'red', at: 0.055, side: 2.5, note: 'start of the long gentle forest traverse' },
        { id: 'g-forest', kind: 'green', at: 0.235, side: 0, cut: 0.5, note: 'short steep cut through the upper forest' },
        { id: 'g-meadow', kind: 'green', at: 0.335, side: 0, cut: 0.5, note: 'cut across the meadow bend' },
        { id: 'r-meadow', kind: 'red', at: 0.355, side: -2.5, note: 'start of the flat meadow below the tarn' },
        { id: 'g-cone1', kind: 'green', at: 0.44, side: 0, cut: 0.5, note: 'first switchback cut-off on the cinder cone' },
        { id: 'g-cone2', kind: 'green', at: 0.5, side: 0, cut: 0.5, note: 'switchback cut-off above the bench' },
        { id: 'g-cone3', kind: 'green', at: 0.56, side: 0, cut: 0.5, note: 'steep cinder cut-off' },
        { id: 'r-traverse', kind: 'red', at: 0.675, side: 2.5, note: 'start of the long rising traverse below the snow' },
        { id: 'g-cone4', kind: 'green', at: 0.72, side: 0, cut: 0.5, note: 'upper switchback cut-off' },
        { id: 'g-snow', kind: 'green', at: 0.84, side: 0, cut: 0.3, note: 'short steep snow cut-off just above the boot track' },
        { id: 'r-rim', kind: 'red', at: 0.935, side: -2.5, note: 'final summit approach along the rim' },
      ],
    },
  ],
};

export const MOUNTAINS: MountainDef[] = [CINDERCREST];
export const ACTIVE_MOUNTAIN = CINDERCREST;
export const ACTIVE_ROUTE = CINDERCREST.routes[0];
