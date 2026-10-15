// Drive the built page in headless Chromium: screenshots, STEP + PDF downloads for several set-ups.
// usage: node test/browser_test.js [scenario ...]
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const FILE = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, '../out');

const SCENARIOS = {
  default: async (page) => {},
  three_rows: async (page) => {
    await page.click('#rows-inc');
    await page.waitForTimeout(300);
    await page.click('#hinge-grid button[data-row="1"][data-side="L"][data-v="front"]');
    await page.click('#hinge-grid button[data-row="0"][data-side="R"][data-v="front"]');
    await page.selectOption('#wallFront', 'mesh');
    await page.selectOption('#divider', 'perforated');
    await page.fill('#width', '1800');
    await page.fill('#trayLength', '1700');
  },
  one_row: async (page) => {
    await page.click('#rows-dec');
    await page.selectOption('#wallRear', 'perforated');
    await page.fill('#depth', '700');
    await page.fill('#height', '900');
  },
  front_hinges: async (page) => {
    await page.click('#hinge-all-front');
    await page.selectOption('#wallRear', 'mesh');
    await page.evaluate(() => document.querySelectorAll('details.grp').forEach(d => { d.open = true; }));
    await page.selectOption('#shs', '30');
    await page.fill('#depth', '600');
  },
  alu_all: async (page) => {
    await page.click('[data-mat="frameMat"] button[data-v="aluminium"]');
    await page.click('[data-mat="sheetMat"] button[data-v="aluminium"]');
    await page.evaluate(() => document.querySelectorAll('details.grp').forEach(d => { d.open = true; }));
    await page.selectOption('#shs', '35');
    await page.fill('#tFloor', '3');
    await page.dispatchEvent('#tFloor', 'change');
  },
  mixed_alu_sheets: async (page) => {
    await page.click('[data-mat="sheetMat"] button[data-v="aluminium"]');
    await page.selectOption('#divider', 'perforated');
    await page.click('#rows-inc');
  },
  alu_shared3_fit: async (page) => {
    await page.click('[data-mat="frameMat"] button[data-v="aluminium"]');
    await page.click('[data-mat="sheetMat"] button[data-v="aluminium"]');
    await page.click('#rows-inc');
    await page.selectOption('#rowJoin', 'shared');
    await page.fill('#trayLength', '2400'); await page.dispatchEvent('#trayLength', 'change');
    await page.waitForTimeout(400);
    await page.click('#fit');
    await page.check('#v-ute');
  },
  sandwich_perf3: async (page) => {
    await page.click('#rows-inc');
    await page.selectOption('#rowJoin', 'sandwich');
    await page.selectOption('#wallFront', 'perforated');
  },
  shared2_mixed_black: async (page) => {
    await page.selectOption('#frameKind', 'black');
    await page.click('[data-mat="sheetMat"] button[data-v="aluminium"]');
    await page.selectOption('#rowJoin', 'shared2');
    await page.selectOption('#divider', 'perforated');
  },
  stainless_fit_tray: async (page) => {
    await page.selectOption('#frameKind', 'ss316');
    await page.selectOption('#sheetKind', 'ss304');
    await page.selectOption('#floorType', 'tread');
    await page.click('#lock-cages');
    await page.fill('#depth', '640'); await page.dispatchEvent('#depth', 'change');
    await page.waitForTimeout(400);
    await page.click('#fit');
    await page.check('#v-doors');
  },
  shared_mesh_hinges: async (page) => {
    await page.click('#rows-inc');
    await page.selectOption('#rowJoin', 'shared');
    await page.selectOption('#wallMiddle', 'mesh');
    await page.click('#hinge-grid button[data-row="1"][data-side="L"][data-v="front"]');
    await page.click('#hinge-grid button[data-row="0"][data-side="R"][data-v="front"]');
  },
  clearances_fit: async (page) => {
    for (const [id, v] of [['#trayGapSide', '120'], ['#trayGapFront', '50'], ['#trayGapRear', '300']]) { await page.fill(id, v); await page.dispatchEvent(id, 'change'); }
    await page.click('#fit');
    await page.check('#v-ute');
  },
  clearances_tray: async (page) => {
    await page.click('#lock-cages');
    for (const [id, v] of [['#depth', '600'], ['#trayGapSide', '80'], ['#trayGapRear', '500']]) { await page.fill(id, v); await page.dispatchEvent(id, 'change'); }
    await page.click('#fit');
  },
  holes_ui: async (page) => {
    await page.selectOption('#roofType', 'perforated');
    await page.selectOption('#wallFront', 'perforated');
    await page.selectOption('#wallRear', 'perforated');
    await page.selectOption('#divider', 'perforated');
    await page.click('#hole-tabs [data-panel="front"]');
    await page.selectOption('#h-pattern', 'stagger');
    for (const [id, v] of [['#h-d', '20'], ['#h-px', '40'], ['#h-py', '35']]) { await page.fill(id, v); await page.dispatchEvent(id, 'change'); }
    await page.click('#hole-tabs [data-panel="rear"]');
    await page.selectOption('#h-area', 'top'); await page.fill('#h-rows', '2'); await page.dispatchEvent('#h-rows', 'change');
    await page.click('#hole-tabs [data-panel="divider"]');
    await page.selectOption('#h-area', 'topbottom'); await page.fill('#h-rows', '3'); await page.dispatchEvent('#h-rows', 'change');
    await page.click('#hole-tabs [data-panel="roof"]');
    await page.selectOption('#h-pattern', 'stagger');
    for (const [id, v] of [['#h-d', '40'], ['#h-px', '80'], ['#h-py', '70']]) { await page.fill(id, v); await page.dispatchEvent(id, 'change'); }
    await page.uncheck('#v-tray');
  },
  holes_copy_shared: async (page) => {
    await page.click('#rows-inc');
    await page.selectOption('#rowJoin', 'shared');
    await page.click('#hole-tabs [data-panel="middle"]');
    await page.selectOption('#h-pattern', 'stagger');
    for (const [id, v] of [['#h-d', '25'], ['#h-px', '50'], ['#h-py', '45'], ['#h-margin', '30']]) { await page.fill(id, v); await page.dispatchEvent(id, 'change'); }
    await page.click('#h-copy');
    await page.click('#hole-tabs [data-panel="roof"]');
    await page.click('#hole-use');
  },
  six_rows_small: async (page) => {
    await page.evaluate(() => {
      const c = window.__cage; Object.assign(c.params, { rows: 6, shs: 20, shsT: 1.6, stockLength: 3000, height: 650, depth: 500 });
    });
    await page.evaluate(() => { document.getElementById('shs').value = '20'; document.getElementById('shsT').value = '1.6'; document.getElementById('stockLength').value = '3000'; document.getElementById('height').value = '650'; document.getElementById('depth').value = '500'; });
    await page.evaluate(() => { const c = window.__cage; document.getElementById('rows-out').textContent = c.params.rows; });
    await page.evaluate(() => window.__cage.rebuild(false));
  },
};

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell') ? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' : '/opt/pw-browsers/chromium'),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  for (const name of names) {
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
    const t0 = Date.now();
    await page.goto(FILE);
    await page.waitForFunction(() => window.__cage && window.__cage.model, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    await SCENARIOS[name](page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(dir, 'page.png') });
    { const g = await page.$('#hole-preview'); if (g) { const d = await g.evaluateHandle(el => el.closest('details')); await d.evaluate(el => { el.open = true; el.scrollIntoView(); }); await page.waitForTimeout(150); await d.asElement().screenshot({ path: path.join(dir, 'holes.png') }); } }
    const info = await page.evaluate(() => ({
      params: window.__cage.params, parts: window.__cage.model.parts.length,
      total: window.__cage.summary.total, warnings: window.__cage.summary.warnings,
      figs: document.getElementById('figs').innerText, pdfLabel: document.getElementById('dl-pdf').innerText,
      status: document.getElementById('status').textContent, fitNote: document.getElementById('fit-note').textContent, joinNote: document.getElementById('join-note').textContent, matNote: document.getElementById('mat-note').textContent,
    }));
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(info, null, 1));
    // STEP
    let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#dl-step')]);
    await dl.saveAs(path.join(dir, dl.suggestedFilename()));
    const stepName = dl.suggestedFilename();
    // PDF
    const t1 = Date.now();
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#dl-pdf')]);
    await dl.saveAs(path.join(dir, dl.suggestedFilename()));
    const pdfName = dl.suggestedFilename();
    const status = await page.textContent('#status');
    await page.screenshot({ path: path.join(dir, 'page_after.png') });
    console.log(`${name}: parts ${info.parts}, ${info.total.toFixed(1)} kg, step ${stepName}, pdf ${pdfName} (${((Date.now() - t1) / 1000).toFixed(1)} s), status "${status}", total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log(`  before downloads: "${info.status}" | ${info.fitNote} | ${info.matNote}`);
    if (logs.length) console.log('  console:\n  ' + logs.join('\n  '));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
