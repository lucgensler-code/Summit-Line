// Screenshots of the summit: the cairn and flag close up, then the celebration camera at a few
// moments of the cinematic. Dev server on :5173. Usage: node scripts/summit-capture.mjs <outPrefix>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 560 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
await p.goto(process.env.CAPTURE_URL || 'http://localhost:5173/');
await p.waitForSelector('.start-btn', { timeout: 120000 });
await p.click('.start-btn');
await p.waitForTimeout(2000);
await p.evaluate(() => {
  const s = window.__summit; const W = s.getWorld(); const pl = s.runtime.player; const l = s.runtime.loadout;
  pl.x = W.summit.x - 2.5; pl.z = W.summit.z + 2.2; pl.gameTime = (17.6 - l.departureHour) * 3600;
  pl.heading = Math.atan2(W.summit.x + 1.8 - pl.x, W.summit.z - pl.z);
  s.runtime.cam.yaw = pl.heading + Math.PI + 0.75; s.runtime.cam.pitch = 0.1; s.runtime.cam.dist = 7;
});
await p.waitForTimeout(6000);
await p.screenshot({ path: `${out}-cairn.png` });
await p.evaluate(() => {
  const s = window.__summit; const W = s.getWorld(); const pl = s.runtime.player;
  pl.x = W.summit.x; pl.z = W.summit.z; pl.summited = true;
  s.useGame.getState().completeSummit();
});
await p.waitForTimeout(1500);
const skip = p.getByText(/Skip/);
if (await skip.count()) await skip.first().click();
for (const [t, name] of [[3000, 'cine-early'], [9000, 'cine-mid'], [16000, 'cine-late']]) {
  await p.waitForTimeout(t === 3000 ? 3000 : 6500);
  await p.screenshot({ path: `${out}-${name}.png` });
}
console.log('errors', JSON.stringify(errs));
await b.close();
