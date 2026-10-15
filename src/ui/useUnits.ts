import { useEffect, useState } from 'react';
import { getUnits, onUnitsChange } from '../game/units';

/** Re-render when the player switches unit systems. */
export function useUnits() {
  const [u, setU] = useState(getUnits());
  useEffect(() => onUnitsChange(() => setU(getUnits())), []);
  return u;
}
