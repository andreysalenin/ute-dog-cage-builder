// Load settings files through the page's own "Load settings" input, then save the PDF and STEP.
// usage: node test/edge_test.js [name ...]
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, '../out/edge');
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell') ? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' : '/opt/pw-browsers/chromium');

const CASES = {
  shs40_gap8: { shs: 40, shsT: 3, doorGap: 8 },
  wide_endview: { width: 1740, depth: 600, height: 780 },
  panels_3col: { width: 1820, depth: 970, shs: 40, shsT: 3, divider: 'perforated' },
  six_long: { rows: 6, depth: 1000, trayLength: 6500 },
  six_xlong: { rows: 6, depth: 1200, trayLength: 7500 },
  narrow_roofbars: { width: 700, shs: 40, shsT: 3, roofBars: 4, rows: 2 },
  no_traybolts: { rows: 3, trayBolts: false, joinBolts: true },
  mixed_hinges: { rows: 3, hinges: [{ L: 'rear', R: 'front' }, { L: 'front', R: 'front' }, { L: 'rear', R: 'rear' }] },
  rows9: { rows: 9, hinges: [{ L: 'front', R: 'front' }] },
  narrow_tray: { trayWidth: 1650 },
};

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES);
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const name of names) {
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const cfgPath = path.join(dir, 'settings.json');
    fs.writeFileSync(cfgPath, JSON.stringify(CASES[name]));
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts/.test(m.text())) logs.push(m.text()); });
    page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
    await page.goto(FILE);
    await page.waitForFunction(() => window.__cage && window.__cage.model);
    await page.setInputFiles('#load-file', cfgPath);
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => ({ rows: window.__cage.model.P.rows, hingeRows: document.querySelectorAll('#hinge-grid .row-lab').length, status: document.getElementById('status').textContent, warnings: window.__cage.summary.warnings.map(w => w.text) }));
    let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#dl-step')]);
    await dl.saveAs(path.join(dir, 'model.step'));
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#dl-pdf')]);
    await dl.saveAs(path.join(dir, 'drawings.pdf'));
    await page.screenshot({ path: path.join(dir, 'page.png') });
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(info, null, 1));
    console.log(`${name}: rows ${info.rows} (hinge rows ${info.hingeRows}) "${info.status}"\n  warnings: ${info.warnings.join(' | ') || 'none'}` + (logs.length ? '\n  ERRORS: ' + logs.join(' | ') : ''));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
