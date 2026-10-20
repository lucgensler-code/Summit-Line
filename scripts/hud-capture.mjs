// Desktop HUD screenshots: key hints shown, hidden, and the quick actions menu open.
// Dev server on :5173. Usage: node scripts/hud-capture.mjs <outPrefix>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text().slice(0, 160)));
await p.goto(process.env.CAPTURE_URL || 'http://localhost:5173/');
await p.waitForSelector('.start-btn', { timeout: 120000 });
await p.evaluate(() => { try { localStorage.removeItem('summitline.hideKeyHints'); } catch {} });
await p.click('.start-btn');
await p.waitForTimeout(5000);
await p.screenshot({ path: `${out}-shown.png` });
await p.keyboard.press('KeyH');
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}-hidden.png` });
await p.keyboard.press('Slash');
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}-menu.png` });
// remembered after reload?
await p.reload();
await p.waitForSelector('.start-btn', { timeout: 120000 });
await p.click('.start-btn');
await p.waitForTimeout(3000);
console.log('hints hidden after reload:', await p.evaluate(() => !document.querySelector('.keys-hint')));
console.log('console:', JSON.stringify(errs));
await b.close();
