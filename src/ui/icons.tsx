// Small line icons for the HUD and touch controls (replace emoji, which render inconsistently
// across platforms). 24×24 viewBox, stroke = currentColor.
import type { ReactNode } from 'react';

function Svg({ children, size = 16, fill = false }: { children: ReactNode; size?: number; fill?: boolean }) {
  return (
    <svg
      className="ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconBolt = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M13 2 5 13.5h6L10 22l8-11.5h-6z" />
  </Svg>
);
export const IconDrop = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M12 3c3.5 4.4 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.6 6-11z" />
  </Svg>
);
/** Water bottle */
export const IconBottle = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M10 2.5h4M10.5 2.5v3L8 8.5V20a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 20V8.5l-2.5-3v-3" />
    <path d="M8 12.5h8" />
  </Svg>
);
/** Trail bar */
export const IconBar = (p: { size?: number }) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="8" rx="2" transform="rotate(-20 12 12)" />
    <path d="m8.2 8.9 2.7 7.6M13.6 7 16.3 14.6" />
  </Svg>
);
/** Rest — kneeling climber under a tent line */
export const IconRest = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M2.5 20 12 4l9.5 16" />
    <path d="M9 20l3-5 3 5" />
    <path d="M2 20h20" />
  </Svg>
);
export const IconRun = (p: { size?: number }) => (
  <Svg {...p}>
    <circle cx="15" cy="4.5" r="2" />
    <path d="m6 21 3.5-5.5 3.5 2.5 1-5.5 3 2.5h3" />
    <path d="M7.5 11 11 8.5h3.5l-1.5 4.5" />
  </Svg>
);
export const IconClock = (p: { size?: number }) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconTimer = (p: { size?: number }) => (
  <Svg {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 13.5V10M10 2.5h4M18.5 6.5l1.5-1.5" />
  </Svg>
);
export const IconArrow = ({ size = 14, deg = 0 }: { size?: number; deg?: number }) => (
  <svg className="ico arrow" width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${deg}deg)` }} aria-hidden="true">
    <path d="M12 3 19 19 12 15 5 19z" fill="currentColor" />
  </svg>
);
export const IconRecenter = (p: { size?: number }) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Svg>
);
export const IconGem = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M6 3h12l3 6-9 12L3 9z" />
    <path d="M3 9h18M9 3 8 9l4 12 4-12-1-6" />
  </Svg>
);
