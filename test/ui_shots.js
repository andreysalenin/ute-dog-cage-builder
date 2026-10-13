// Screenshots of UI states: phone width, dark theme, viewer toggles and views.
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, '../out/ui');
fs.mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell') ? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' : '/opt/pw-browsers/chromium');

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const logs = [];
  const open = async (opts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts));
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|fonts/.test(m.text())) logs.push(m.text()); });
    page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
    await page.goto(FILE);
    await page.waitForFunction(() => window.__cage && window.__cage.model);
    await page.waitForTimeout(400);
    return { ctx, page };
  };
  // phone
  let { ctx, page } = await open({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.screenshot({ path: path.join(OUT, 'phone_top.png') });
  await page.screenshot({ path: path.join(OUT, 'phone_full.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('phone horizontal overflow px:', overflow);
  await ctx.close();
  // dark
  ({ ctx, page } = await open({ colorScheme: 'dark' }));
  await page.screenshot({ path: path.join(OUT, 'dark.png') });
  await ctx.close();
  // toggles
  ({ ctx, page } = await open({}));
  await page.check('#v-doors'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'doors_open.png') });
  await page.uncheck('#v-doors'); await page.check('#v-explode'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'exploded.png') });
  await page.uncheck('#v-explode'); await page.check('#v-marks'); await page.uncheck('#v-roof'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'marks.png') });
  for (const v of ['rear', 'side', 'front', 'top']) {
    await page.click(`.tools [data-view="${v}"]`); await page.waitForTimeout(300);
    await page.locator('#viewer').screenshot({ path: path.join(OUT, `view_${v}.png`) });
  }
  // a hinge change should swing that door in the viewer with doors open
  await page.check('#v-roof'); await page.uncheck('#v-marks'); await page.check('#v-doors');
  await page.click('#hinge-grid button[data-row="0"][data-side="L"][data-v="front"]');
  await page.click('.tools [data-view="iso"]'); await page.waitForTimeout(500);
  await page.locator('#viewer').screenshot({ path: path.join(OUT, 'hinge_front_A_L.png') });
  // bad input: absurd values get clamped, warnings show
  await page.fill('#width', '2600'); await page.fill('#trayWidth', '1800'); await page.waitForTimeout(500);
  await page.locator('.results').screenshot({ path: path.join(OUT, 'warnings.png') });
  const w = await page.evaluate(() => window.__cage.summary.warnings.map(x => x.text));
  console.log('warnings:', JSON.stringify(w));
  await ctx.close();
  await browser.close();
  console.log(logs.length ? 'errors:\n' + logs.join('\n') : 'no page errors');
})().catch((e) => { console.error(e); process.exit(1); });
