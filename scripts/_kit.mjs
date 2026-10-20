import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
p.on('pageerror', (e) => console.log('err', e.message));
await p.goto('http://localhost:5173/kit.html');
await p.waitForFunction(() => document.title.includes('ready'), null, { timeout: 300000 });
await p.screenshot({ path: out, fullPage: true, timeout: 240000 });
await b.close();
