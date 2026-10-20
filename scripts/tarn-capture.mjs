// Screenshot the tarn junction as seen walking up the main trail. Dev server on :5173.
// Usage: node scripts/tarn-capture.mjs <out.png> [hour] [approach|junction]
import { chromium } from 'playwright';
const [out, hour = '9.5', mode = 'approach'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 560 } });
await p.goto('http://localhost:5173/');
await p.waitForSelector('.start-btn', { timeout: 120000 });
await p.click('.start-btn');
await p.waitForTimeout(2000);
const js = `(() => { const s = window.__summit; const W = s.getWorld(); const pl = s.runtime.player; const l = s.runtime.loadout; const m = W.main;
  const j = W.lines[1].pts[0]; let bi = 0, bd = 1e9; m.pts.forEach((q, i) => { const d = Math.hypot(q.x - j.x, q.z - j.z); if (d < bd) { bd = d; bi = i; } });
  const i = Math.max(0, bi - 14); pl.x = m.pts[i].x; pl.z = m.pts[i].z; const n = m.pts[i + 6];
  pl.heading = Math.atan2(n.x - pl.x, n.z - pl.z); pl.gameTime = (${hour} - l.departureHour) * 3600;
  if ('${mode}' === 'junction') { pl.x = j.x; pl.z = j.z; pl.heading = Math.atan2(W.lines[1].pts[W.lines[1].pts.length - 1].x - j.x, W.lines[1].pts[W.lines[1].pts.length - 1].z - j.z); }
  s.runtime.cam.yaw = pl.heading + Math.PI; s.runtime.cam.pitch = 0.12; s.runtime.cam.dist = 8; })()`;
await p.evaluate(js); await p.waitForTimeout(6000); await p.evaluate(js); await p.waitForTimeout(2500);
await p.screenshot({ path: out });
await b.close();
