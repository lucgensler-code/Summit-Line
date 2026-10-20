// Walk the climber along the trail in small steps and report trees (instanced chunks) that
// become visible near the camera between steps — pop-in. Dev server on :5173.
// Usage: node scripts/popin-check.mjs [startFrac] [steps]
import { chromium } from 'playwright';
const [f0 = '0.02', steps = '24'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
const errs = [];
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text().slice(0, 300)));
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/?lq');
await p.waitForSelector('.start-btn', { timeout: 120000 });
await p.click('.start-btn');
await p.waitForTimeout(2000);
let prev = null;
for (let k = 0; k < Number(steps); k++) {
  const frac = Number(f0) + k * 0.002;
  await p.evaluate((frac) => {
    const s = window.__summit; const W = s.getWorld(); const pl = s.runtime.player; const m = W.main;
    const i = Math.floor(frac * (m.pts.length - 1)); pl.x = m.pts[i].x; pl.z = m.pts[i].z;
    const n = m.pts[i + 6]; pl.heading = Math.atan2(n.x - pl.x, n.z - pl.z); s.runtime.cam.yaw = pl.heading + Math.PI;
  }, frac);
  await p.waitForTimeout(900);
  const cur = await p.evaluate(() => {
    const out = {};
    const vis = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    const cam = window.__summitScene.children.length && window.__summitGL ? null : null;
    let id = 0;
    window.__summitScene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      id++;
      out[o.uuid] = { v: vis(o), n: o.count, t: o.geometry.attributes.position.count / 3, cast: o.castShadow };
    });
    return out;
  });
  if (prev) {
    let appeared = 0, vanished = 0, both = 0;
    for (const [u, c] of Object.entries(cur)) {
      const q = prev[u];
      if (!q) continue;
      if (c.v && !q.v) appeared += c.n;
      if (!c.v && q.v) vanished += c.n;
    }
    console.log(`step ${k} frac ${frac.toFixed(3)}  instances appeared ${appeared}  vanished ${vanished}`);
  }
  prev = cur;
}
// Any chunk where neither near nor far tree mesh is visible (should never happen for trees)?
const gaps = await p.evaluate(() => {
  let n = 0, total = 0;
  const byTris = {};
  window.__summitScene.traverse((o) => {
    if (!o.isGroup || o.children.length !== 2) return;
    const [a, c] = o.children;
    if (!a.isInstancedMesh || !c.isInstancedMesh) return;
    total++;
    const vis = (x) => { for (let q = x; q; q = q.parent) if (!q.visible) return false; return true; };
    if (!vis(a) && !vis(c)) {
      n++;
      const t = Math.round(a.geometry.attributes.position.count / 3);
      a.geometry.computeBoundingSphere();
      const cam = window.__summit.runtime.player;
      const d = Math.hypot(a.boundingSphere.center.x - cam.x, a.boundingSphere.center.z - cam.z);
      byTris[t] = (byTris[t] || []).concat(Math.round(d));
    }
  });
  return `${n} of ${total} two-level chunks have neither level visible; near-tris -> chunk distances: ${JSON.stringify(byTris)}`;
});
console.log(gaps);
console.log('console errors/warnings:', errs.length ? errs.join('\n') : 'none');
await p.screenshot({ path: process.env.SHOT ?? '/dev/null' }).catch(() => {});
await b.close();
