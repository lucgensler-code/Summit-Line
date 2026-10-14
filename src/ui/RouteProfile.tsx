import { useMemo } from 'react';
import { elevationFt, getWorld, unitsToMiles } from '../game/world';

/** Elevation profile of the route, like an outdoor-navigation app. */
export function RouteProfile({ progress, width = 260, height = 70, labels = false, reached = [] }: { progress?: number; width?: number; height?: number; labels?: boolean; reached?: string[] }) {
  const W = getWorld();
  const { path, area, cps } = useMemo(() => {
    const main = W.main;
    const feet = main.heights.map((h) => elevationFt(h));
    const minF = Math.min(...feet);
    const maxF = Math.max(...feet);
    const pad = 6;
    const X = (s: number) => pad + (s / main.length) * (width - pad * 2);
    const Y = (f: number) => height - pad - ((f - minF) / (maxF - minF)) * (height - pad * 2 - (labels ? 12 : 4));
    let d = '';
    for (let i = 0; i < main.pts.length; i += 4) d += `${i ? 'L' : 'M'}${X(main.s[i]).toFixed(1)},${Y(feet[i]).toFixed(1)}`;
    d += `L${X(main.length).toFixed(1)},${Y(feet[feet.length - 1]).toFixed(1)}`;
    const area = `${d}L${X(main.length)},${height}L${X(0)},${height}Z`;
    const idxAt = (s: number) => {
      let i = 0;
      while (i < main.s.length - 1 && main.s[i] < s) i++;
      return i;
    };
    const cps = W.checkpoints.map((c) => ({ id: c.id, name: c.name, x: X(c.s), y: Y(feet[idxAt(c.s)]) }));
    return { path: d, area, cps };
  }, [W, width, height, labels]);
  const px = progress !== undefined ? 6 + Math.min(Math.max(progress, 0), 1) * (width - 12) : null;
  return (
    <svg className="route-profile" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Route elevation profile, ${unitsToMiles(W.main.length).toFixed(1)} miles`}>
      <defs>
        <linearGradient id="rp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f1f5f7" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f1f5f7" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rp-fill)" />
      <path d={path} fill="none" stroke="#f3f6f8" strokeWidth="1.6" strokeLinejoin="round" />
      {cps.map((c) => (
        <g key={c.id}>
          <circle cx={c.x} cy={c.y} r={3} fill={reached.includes(c.id) ? '#f0a35e' : '#1b2430'} stroke="#f0a35e" strokeWidth="1.4" />
          {labels && c.id !== 'rim' && (
            <text x={c.x} y={c.y - 7} textAnchor={c.id === 'summit' ? 'end' : 'middle'} fontSize="9" fill="#dfe6ea">
              {c.name.replace('Obsidian Tarn Camp', 'Tarn Camp').replace('Cindercrest ', '')}
            </text>
          )}
        </g>
      ))}
      {px !== null && <line x1={px} x2={px} y1={4} y2={height} stroke="#f0a35e" strokeWidth="1.5" strokeDasharray="2 2" />}
    </svg>
  );
}
