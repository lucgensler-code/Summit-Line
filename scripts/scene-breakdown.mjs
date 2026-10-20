// Visible triangles by mesh type in two trail views (dev server on :5173, ?lq). Usage: node scripts/scene-breakdown.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:5173/?lq');
await p.waitForSelector('.start-btn', { timeout: 120000 });
await p.click('.start-btn');
await p.waitForTimeout(1500);
for (const [name, frac, hour, dist, pitch, yaw] of [['meadow', 0.38, 10, 8, 0.2, null], ['forest', 0.055, 9.5, 5.5, 0.18, null], ['sunrise', 0.42, 6.35, 12, 0.12, -Math.PI / 2]]) {
  const js = `(() => { const s = window.__summit; const W = s.getWorld(); const pl = s.runtime.player; const l = s.runtime.loadout; const m = W.main;
    const i = Math.floor(${frac} * (m.pts.length - 1)); pl.x = m.pts[i].x; pl.z = m.pts[i].z; const n = m.pts[i + 6];
    pl.heading = Math.atan2(n.x - pl.x, n.z - pl.z); pl.gameTime = (${hour} - l.departureHour) * 3600;
    s.runtime.cam.yaw = ${yaw === null ? 'pl.heading + Math.PI' : yaw}; s.runtime.cam.pitch = ${pitch}; s.runtime.cam.dist = ${dist}; })()`;
  await p.evaluate(js); await p.waitForTimeout(7000); await p.evaluate(js); await p.waitForTimeout(2000);
  const bd = await p.evaluate(() => {
    const out = {}; const calls = {}; let meshes = 0;
    const vis = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    window.__summitScene.traverse((o) => {
      if (!o.isMesh || !vis(o)) return; meshes++;
      const g = o.geometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const n = o.isInstancedMesh ? o.count : 1;
      const key = (o.material.side === 2 ? 'plant' : o.isInstancedMesh ? 'inst' : 'mesh') + ':' + Math.round(t);
      calls[key.split(':')[0]] = (calls[key.split(':')[0]] || 0) + 1;
      out[key] = (out[key] || 0) + t * n;
    });
    return meshes + ' visible meshes ' + JSON.stringify(calls) + ' | ' + Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + '=' + Math.round(v / 1000) + 'k').join(' ');
  });
  console.log(name, bd);
}
await b.close();
