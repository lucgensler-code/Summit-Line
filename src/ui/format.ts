export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export function fmtClock(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  let hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${mm.toString().padStart(2, '0')} ${ampm}`;
}

export function fmtDuration(hours: number) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
