// Matched visual + render-stat capture (v0.6). Fixed viewport, DPR 1, fixed views and clock hours;
// records draw calls, triangles and frame intervals per view. Needs the dev server on :5173.
// Usage: CHROMIUM_PATH=... node scripts/visual-capture.mjs <label> <outDir>
import { chromium } from 'playwright';
const [label, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.CAPTURE_URL || 'http://localhost:5173/');
await page.waitForSelector('.start-btn', { timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/${label}-0-home.png` });
await page.click('.start-btn');
await page.waitForTimeout(1500);
await page.addStyleTag({ content: '.hud,.touch,.fps-overlay{display:none!important}' });
const stats = [];
const frame = () => page.evaluate(() => new Promise((res) => {
  const t = [];
  let last = performance.now();
  const f = () => { const n = performance.now(); t.push(n - last); last = n; if (t.length < 6) requestAnimationFrame(f); else res(t); };
  requestAnimationFrame(f);
}));
async function view(name, setup) {
  await page.evaluate(setup);
  await page.waitForTimeout(7000);
  await page.evaluate(setup); // re-apply time after settling
  const iv = await frame();
  await page.screenshot({ path: `${out}/${label}-${name}.png` });
  const info = await page.evaluate(() => { const r = window.__summitGL.info.render; return { calls: r.calls, tris: r.triangles }; });
  const sorted = [...iv].sort((a, b) => a - b);
  stats.push({ view: name, calls: info.calls, tris: info.tris, medianFrameMs: Math.round(sorted[Math.floor(sorted.length / 2)]) });
}
const at = (frac, hour, dist, pitch, yawOff) => `(() => {
  const s = window.__summit; const W = s.getWorld(); const p = s.runtime.player; const l = s.runtime.loadout;
  const m = W.main; const i = Math.min(m.pts.length - 1, Math.floor(${frac} * (m.pts.length - 1)));
  p.x = m.pts[i].x; p.z = m.pts[i].z; const n = m.pts[Math.min(i + 6, m.pts.length - 1)];
  p.heading = Math.atan2(n.x - p.x, n.z - p.z); p.vx = p.vz = 0;
  p.gameTime = (${hour} - l.departureHour) * 3600;
  s.runtime.cam.yaw = p.heading + Math.PI + ${yawOff}; s.runtime.cam.pitch = ${pitch}; s.runtime.cam.dist = ${dist};
})()`;
await view('1-forest', at(0.12, 9, 9, 0.22, 0));
await view('2-upper', at(0.8, 11, 10, 0.28, 0.35));
await view('2b-meadow', at(0.38, 10, 8, 0.2, 0));
await view('2c-cinder', at(0.6, 11, 9, 0.22, 0.3));
await view('3-approach', at(0.985, 12, 8, 0.15, 0));
for (const [k, yaw] of [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]]) {
  await view(`4-summit-${k}`, `(() => { const s = window.__summit; const W = s.getWorld(); const p = s.runtime.player; const l = s.runtime.loadout;
    p.x = W.summit.x + 3; p.z = W.summit.z + 3; p.vx = p.vz = 0; p.gameTime = (18.35 - l.departureHour) * 3600;
    s.runtime.cam.yaw = ${yaw}; s.runtime.cam.pitch = 0.3; s.runtime.cam.dist = 30; })()`);
}
await view('5-midday-summit', `(() => { const s = window.__summit; const W = s.getWorld(); const p = s.runtime.player; const l = s.runtime.loadout;
  p.x = W.summit.x + 3; p.z = W.summit.z + 3; p.gameTime = (12.5 - l.departureHour) * 3600; s.runtime.cam.yaw = 2.2; s.runtime.cam.pitch = 0.25; s.runtime.cam.dist = 30; })()`);
// Trail close-up with a gem, and sunrise (looking east) / sunset (looking west) from the meadows.
await view('6-gem', `(() => { const s = window.__summit; const W = s.getWorld(); const p = s.runtime.player; const l = s.runtime.loadout;
  const g = W.gems.find((x) => x.id === 'r-forest') || W.gems[0]; p.x = g.x + 2.5; p.z = g.z + 2.5; p.vx = p.vz = 0;
  p.heading = Math.atan2(g.x - p.x, g.z - p.z); p.gameTime = (9.5 - l.departureHour) * 3600;
  s.runtime.cam.yaw = p.heading + Math.PI; s.runtime.cam.pitch = 0.18; s.runtime.cam.dist = 5.5; })()`);
await view('7-sunrise-east', at(0.42, 6.35, 12, 0.12, 0).replace('s.runtime.cam.yaw = p.heading + Math.PI + 0', 's.runtime.cam.yaw = -Math.PI / 2'));
await view('8-sunset-west', at(0.6, 18.75, 12, 0.12, 0).replace('s.runtime.cam.yaw = p.heading + Math.PI + 0', 's.runtime.cam.yaw = Math.PI / 2'));
console.log(JSON.stringify({ label, stats, errs }, null, 1));
// Phone home screen (portrait).
try {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const ph = await ctx.newPage();
  await ph.goto(process.env.CAPTURE_URL || 'http://localhost:5173/');
  await ph.waitForSelector('.start-btn', { timeout: 120000 });
  await ph.waitForTimeout(4000);
  await ph.screenshot({ path: `${out}/${label}-9-phone-home.png`, timeout: 240000 });
  await ctx.close();
} catch (e) {
  console.error('phone home capture failed:', e.message);
}
await browser.close();
