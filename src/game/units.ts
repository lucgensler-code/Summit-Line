// Centralised unit conversion + formatting. Gameplay stores SI-ish internal values (litres, kg,
// world units → feet/miles via world.ts); only this module decides how they are shown.

export type UnitSystem = 'us' | 'metric';

const KEY = 'summitline.units';
let system: UnitSystem = 'us';
try {
  const v = localStorage.getItem(KEY);
  if (v === 'metric' || v === 'us') system = v;
} catch {
  /* default to US */
}
const listeners = new Set<() => void>();

export const getUnits = () => system;
export function setUnits(u: UnitSystem) {
  system = u;
  try {
    localStorage.setItem(KEY, u);
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}
export function onUnitsChange(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

export const L_TO_FLOZ = 33.814;
export const KG_TO_LB = 2.20462;
export const FT_TO_M = 0.3048;
export const MI_TO_KM = 1.609344;

const int = (n: number) => Math.round(n).toLocaleString('en-US');

/** Elevation, given in feet. */
export function fmtElevation(ft: number, withUnit = true) {
  if (system === 'metric') return `${int(ft * FT_TO_M)}${withUnit ? ' m' : ''}`;
  return `${int(ft)}${withUnit ? ' ft' : ''}`;
}
export const elevUnit = () => (system === 'metric' ? 'm' : 'ft');
export const elevValue = (ft: number) => int(system === 'metric' ? ft * FT_TO_M : ft);

/** Distance, given in miles. */
export function fmtDistance(mi: number, digits = 1) {
  if (system === 'metric') return `${(mi * MI_TO_KM).toFixed(digits)} km`;
  return `${mi.toFixed(digits)} mi`;
}

/** Pack / gear weight, given in kilograms. */
export function fmtWeight(kg: number, digits = 1) {
  if (system === 'metric') return `${kg.toFixed(digits)} kg`;
  return `${(kg * KG_TO_LB).toFixed(digits)} lb`;
}

/** Water quantity, given in litres. US: whole fluid ounces. */
export function fmtWater(l: number) {
  if (system === 'metric') return `${l.toFixed(1)} L`;
  return `${Math.round(l * L_TO_FLOZ)} fl oz`;
}
/** Compact water label for tight HUD buttons. */
export function fmtWaterShort(l: number) {
  if (system === 'metric') return `${l.toFixed(1)}L`;
  return `${Math.round(l * L_TO_FLOZ)}oz`;
}

/** Temperature, given in °F. */
export function fmtTemp(f: number) {
  if (system === 'metric') return `${Math.round(((f - 32) * 5) / 9)}°C`;
  return `${Math.round(f)}°F`;
}

/** Wind speed, given in mph. */
export function fmtWind(mph: number) {
  if (system === 'metric') return `${Math.round(mph * MI_TO_KM)} km/h`;
  return `${Math.round(mph)} mph`;
}
