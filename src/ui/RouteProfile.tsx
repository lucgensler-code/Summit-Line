import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fmtDistance } from '../game/units';
import { elevationFt, getWorld, unitsToMiles } from '../game/world';
import { useUnits } from './useUnits';

const SHORT: Record<string, string> = {
  treeline: 'Treeline',
  camp: 'Tarn Camp',
  snow: 'Snowfield',
  rim: 'Crater Rim',
  summit: 'Summit',
};

/** Elevation profile of the route, like an outdoor-navigation app, with non-overlapping labels. */
export function RouteProfile({ progress, width: fixedWidth = 260, height = 70, labels = false, reached = [], fluid = false }: { progress?: number; width?: number; height?: number; labels?: boolean; reached?: string[]; fluid?: boolean }) {
  useUnits();
  const W = getWorld();
  // `fluid` (v0.8): draw at the container's real width so the profile spans the whole card.
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  useLayoutEffect(() => {
    if (!fluid || !box.current) return;
    const el = box.current;
    const ro = new ResizeObserver(() => setMeasured(Math.round(el.clientWidth)));
    ro.observe(el);
    setMeasured(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, [fluid]);
  const width = fluid && measured > 0 ? measured : fixedWidth;
  const { path, area, cps } = useMemo(() => {
    const main = W.main;
    const feet = main.heights.map((h) => elevationFt(h));
    const minF = Math.min(...feet);
    const maxF = Math.max(...feet);
    const padX = 8;
    const top = labels ? 22 : 4;
    const bottom = labels ? 20 : 4;
    const X = (s: number) => padX + (s / main.length) * (width - padX * 2);
    const Y = (f: number) => height - bottom - ((f - minF) / (maxF - minF)) * (height - top - bottom);
    let d = '';
    for (let i = 0; i < main.pts.length; i += 4) d += `${i ? 'L' : 'M'}${X(main.s[i]).toFixed(1)},${Y(feet[i]).toFixed(1)}`;
    d += `L${X(main.length).toFixed(1)},${Y(feet[feet.length - 1]).toFixed(1)}`;
    const area = `${d}L${X(main.length)},${height}L${X(0)},${height}Z`;
    const idxAt = (s: number) => {
      let i = 0;
      while (i < main.s.length - 1 && main.s[i] < s) i++;
      return i;
    };
    // Labels sit on their own dots, alternating above and below the line in route order
    // (v0.6.1), so close checkpoints such as Crater Rim and Summit never collide. Each label is
    // centred on its dot and only nudged sideways to stay inside the chart.
    const cps = W.checkpoints.map((c, i) => {
      const x = X(c.s);
      const y = Y(feet[idxAt(c.s)]);
      const text = SHORT[c.id] ?? c.name;
      const w = text.length * 5.3 + 4;
      const above = i % 2 === 0;
      const tx = Math.min(width - 2 - w / 2, Math.max(2 + w / 2, x));
      return { id: c.id, x, y, text, anchor: 'middle' as const, tx, ly: above ? y - 8 : y + 16 };
    });
    return { path: d, area, cps };
  }, [W, width, height, labels]);
  const px = progress !== undefined ? 8 + Math.min(Math.max(progress, 0), 1) * (width - 16) : null;
  const svg = (
    <svg className="route-profile" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Route elevation profile, ${fmtDistance(unitsToMiles(W.main.length))}`}>
      <defs>
        <linearGradient id="rp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f1f5f7" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f1f5f7" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rp-fill)" />
      <path d={path} fill="none" stroke="#f3f6f8" strokeWidth="1.6" strokeLinejoin="round" />
      {cps.map((c) => (
        <g key={c.id}>
          <circle cx={c.x} cy={c.y} r={3} fill={reached.includes(c.id) ? '#f0a35e' : '#1b2430'} stroke="#f0a35e" strokeWidth="1.4" />
          {labels && (
            <text x={c.tx} y={c.ly} textAnchor={c.anchor} fontSize="9.5" fontWeight="600" fill="#ffffff" stroke="rgba(12,16,22,0.85)" strokeWidth="3" paintOrder="stroke">
              {c.text}
            </text>
          )}
        </g>
      ))}
      {px !== null && <line x1={px} x2={px} y1={4} y2={height} stroke="#f0a35e" strokeWidth="1.5" strokeDasharray="2 2" />}
    </svg>
  );
  return fluid ? <div ref={box} className="route-profile-box">{svg}</div> : svg;
}
