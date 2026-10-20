// Stand still in the forest and count pixels that change between two frames 1.5 s apart
// (low quality: no glow, mist or sway, so moving shadows/edges dominate). Dev server on :5173.
// Usage: node scripts/shimmer-check.mjs <outPrefix>  → <outPrefix>-a.png, -b.png (compare them)
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
await p.goto('http://localhost:5173/?lq');
await p.waitForSelector('.start-btn', { timeout: 120000 });
await p.click('.start-btn');
await p.waitForTimeout(2000);
await p.evaluate(() => {
  const s = window.__summit; const W = s.getWorld(); const pl = s.runtime.player; const l = s.runtime.loadout; const m = W.main;
  const i = Math.floor(0.08 * (m.pts.length - 1)); pl.x = m.pts[i].x; pl.z = m.pts[i].z; const n = m.pts[i + 6];
  pl.heading = Math.atan2(n.x - pl.x, n.z - pl.z); pl.gameTime = (15.5 - l.departureHour) * 3600;
  s.runtime.cam.yaw = pl.heading + Math.PI + 0.6; s.runtime.cam.pitch = 0.15; s.runtime.cam.dist = 9;
});
await p.waitForTimeout(8000);
const out = process.argv[2];
await p.screenshot({ path: `${out}-a.png`, clip: { x: 0, y: 100, width: 800, height: 300 } });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}-b.png`, clip: { x: 0, y: 100, width: 800, height: 300 } });
await b.close();
