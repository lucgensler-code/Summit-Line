// Simple, deterministic mountain weather: temperature from elevation lapse rate + diurnal swing,
// wind that builds with altitude and through the day. Display-only for now (gameplay uses the
// existing cold/heat factors in sim.ts), but kept here so future routes can vary conditions.

export interface Conditions {
  tempF: number;
  windMph: number;
  label: string;
}

export function conditionsAt(elevFt: number, hour: number): Conditions {
  const h = ((hour % 24) + 24) % 24;
  // Warmest ~3 PM, coldest just before dawn.
  const diurnal = -Math.cos(((h - 15) / 24) * Math.PI * 2);
  const tempAtTrailhead = 50 + diurnal * 13; // °F at 5,446 ft
  const tempF = tempAtTrailhead - ((elevFt - 5446) / 1000) * 3.6;
  const altitude = Math.max(0, (elevFt - 5446) / 4766);
  const windMph = 4 + altitude * altitude * 22 + Math.max(0, Math.sin(((h - 9) / 24) * Math.PI * 2)) * 6;
  let label = 'Clear';
  if (windMph > 20) label = 'Windy';
  else if (tempF < 30) label = 'Cold, clear';
  else if (h > 13 && h < 18) label = 'Hazy';
  return { tempF, windMph, label };
}
