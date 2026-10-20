// Screenshot the home screen on desktop and phone. Usage: node scripts/home-capture.mjs <outPrefix> [url]
import { chromium } from 'playwright';
const [out, url = 'http://localhost:5173/'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, vp, touch] of [['desk', { width: 1280, height: 720 }, false], ['phone', { width: 393, height: 852 }, true]]) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
  await p.goto(url);
  await p.waitForSelector('.start-btn', { timeout: 120000 });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: `${out}-${name}.png`, timeout: 240000 });
  await p.close();
}
await b.close();
