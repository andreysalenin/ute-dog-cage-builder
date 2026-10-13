const C = require('../src/core.js');
const fs = require('fs');
const cfg = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const out = process.argv[3] || 'out_default';
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const m = C.build(cfg);
const sm = C.summary(m);
const step = C.writeSTEP(m, { timestamp: '2026-10-13T10:00:00' });
fs.writeFileSync(out + '/model.step', step);
let nsol = 0, vol = 0;
const perPart = [];
for (const p of m.parts) { nsol += p.solids.length; const v = p.solids.reduce((a, s) => a + C.prismVolume(s), 0); vol += v; perPart.push([p.name, p.solids.length, v]); }
fs.writeFileSync(out + '/parts.json', JSON.stringify(perPart));
console.log('parts', m.parts.length, 'solids', nsol, 'vol', vol.toFixed(1), 'mass', (vol * C.DENSITY).toFixed(2), 'ms', Date.now() - t0, 'MB', (step.length / 1e6).toFixed(2));
console.log('masses', Object.fromEntries(Object.entries(sm.masses).map(([k, v]) => [k, +v.toFixed(1)])));
for (const r of sm.bom) console.log(r.mark, r.stock, JSON.stringify(r.size), r.qty, r.note);
console.log('bars', sm.bars.length, sm.shsMetres.toFixed(2), 'warnings', JSON.stringify(sm.warnings));
for (const [k, v] of Object.entries(sm.nests)) console.log('nest', k, v.length);
