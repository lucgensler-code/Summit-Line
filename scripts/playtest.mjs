// Browser smoke test: loads the game, starts an expedition, walks, teleports along the route,
// tags the summit and captures screenshots + console errors.
// Usage: node scripts/playtest.mjs [url] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'test-output';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('screenshot', name);
};
const state = () =>
  page.evaluate(() => {
    const s = window.__summit;
    const p = s.runtime.player;
    const g = s.useGame.getState();
    return p ? { phase: g.phase, x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(1), stamina: +p.stamina.toFixed(1), surface: p.surface, onTrail: p.onTrail, act: p.activity, hud: g.hud && { elev: Math.round(g.hud.elevFt), obj: g.hud.objective, prompt: g.hud.prompt } } : { phase: g.phase };
  });
const teleport = (frac, back = 0) =>
  page.evaluate(
    ([f, b]) => {
      const s = window.__summit;
      const W = s.getWorld();
      const i = Math.min(W.main.pts.length - 1, Math.floor(f * (W.main.pts.length - 1)));
      const j = Math.max(0, i - b);
      const p = s.runtime.player;
      p.x = W.main.pts[j].x;
      p.z = W.main.pts[j].z;
      const n = W.main.pts[Math.min(j + 4, W.main.pts.length - 1)];
      p.heading = Math.atan2(n.x - p.x, n.z - p.z);
      s.runtime.cam.yaw = p.heading + Math.PI;
    },
    [frac, back],
  );

await page.goto(url);
await page.waitForSelector('.start-btn', { timeout: 60000 });
await page.waitForTimeout(2500);
await shot('01-prep');
await page.click('.start-btn');
await page.waitForTimeout(1500);
await shot('02-trailhead');
console.log('start', await state());

await page.keyboard.down('KeyW');
await page.waitForTimeout(4000);
console.log('after walking', await state());
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(2500);
console.log('jogging', await state());
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
await page.waitForTimeout(400);
await shot('03-walked');

for (const [frac, name] of [
  [0.36, '04-treeline'],
  [0.47, '05-camp'],
  [0.7, '06-switchbacks'],
  [0.85, '07-snowfield'],
  [0.95, '08-rim'],
]) {
  await teleport(frac);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);
  console.log(name, await state());
  await shot(name);
}

// Escape pause menu
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await shot('09-paused');
console.log('paused', await state());
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// Walk the final metres to the summit benchmark and tag it.
await teleport(1, 2);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
console.log('at summit', await state());
await page.keyboard.press('Space');
await page.waitForTimeout(2500);
await shot('10-summit-result');
console.log('after summit', await state());
// v0.4 flow: result card → name (typing must keep focus and spaces) → cinematic → details.
const result = await page.$('.result-card');
console.log('result card visible:', !!result);
if (result) {
  await page.fill('#hs-name', '');
  await page.type('#hs-name', 'a b', { delay: 40 });
  console.log('typed name:', JSON.stringify(await page.inputValue('#hs-name')));
  await page.click('.result-card .skip');
  await page.waitForTimeout(1500);
  await shot('11-cinematic');
  await page.click('.cine-controls .pill-btn');
  await page.waitForTimeout(1500);
  await shot('12-details');
  const summary = await page.$('.summary-card');
  console.log('summary card visible:', !!summary);
  await page.click('.sum-actions .btn.primary');
  await page.waitForTimeout(1200);
  console.log('restarted', await state());
}

const fps = await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const f = () => {
        n++;
        if (performance.now() - t0 < 2000) requestAnimationFrame(f);
        else res((n / (performance.now() - t0)) * 1000);
      };
      requestAnimationFrame(f);
    }),
);
console.log('fps (software GL)', fps.toFixed(1));
console.log('console errors/warnings:', errors.length ? errors.slice(0, 20) : 'none');
await browser.close();
