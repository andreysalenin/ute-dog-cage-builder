/* Page wiring: settings <-> model <-> viewer, summary, downloads. */
(function () {
'use strict';
const C = window.CageCore, V = window.CageViewer;
const LS_KEY = 'ute-dog-cage-builder.v1';
const $ = (id) => document.getElementById(id);

const NUM_FIELDS = ['width', 'depth', 'height', 'trayWidth', 'trayLength', 'doorGap', 'holeD', 'holePitch', 'holeMargin',
  'tSheet', 'tRoof', 'tFloor', 'joists', 'roofBars', 'meshPitch', 'meshWire', 'trayBoltInset', 'joinBoltInset', 'stockLength', 'sheetW', 'sheetH'];
const SEL_FIELDS = ['wallFront', 'wallMiddle', 'wallRear', 'divider', 'shs', 'shsT'];
const CHK_FIELDS = ['trayBolts', 'joinBolts'];

function defaults() { return JSON.parse(JSON.stringify(C.DEFAULTS)); }
// accept only known keys from a saved or loaded settings object
function sanitize(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('not a settings object');
  const out = defaults();
  let known = 0;
  for (const k of Object.keys(out)) if (Object.prototype.hasOwnProperty.call(obj, k)) { out[k] = obj[k]; known++; }
  if (!known) throw new Error('no settings found');
  out.rows = Math.min(6, Math.max(1, Math.round(Number(out.rows)) || 2));
  out.defaultHinge = out.defaultHinge === 'front' ? 'front' : 'rear';
  const hs = Array.isArray(out.hinges) ? out.hinges : [];
  out.hinges = [];
  for (let r = 0; r < out.rows; r++) { const x = hs[r] || {}; out.hinges.push({ L: x.L === 'front' || x.L === 'rear' ? x.L : out.defaultHinge, R: x.R === 'front' || x.R === 'rear' ? x.R : out.defaultHinge }); }
  return out;
}
function loadSaved() {
  try { const s = localStorage.getItem(LS_KEY); if (s) return sanitize(JSON.parse(s)); } catch (e) { /* storage blocked or bad data */ }
  return null;
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(params)); } catch (e) { /* ignore */ } }

let params = loadSaved() || defaults();
let model = null, summary = null;
let viewer = null;

/* ---------------------------------------------------------------- settings UI */
function fillInputs() {
  for (const k of NUM_FIELDS) { const el = $(k); if (el) el.value = params[k]; }
  for (const k of SEL_FIELDS) { const el = $(k); if (el) el.value = String(params[k]); }
  for (const k of CHK_FIELDS) { const el = $(k); if (el) el.checked = !!params[k]; }
  $('rows-out').textContent = params.rows;
  matButtons();
}
function matButtons() {
  document.querySelectorAll('[data-mat]').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(params[g.dataset.mat] === b.dataset.v))));
  const f = params.frameMat === 'aluminium', sh = params.sheetMat === 'aluminium';
  $('mat-note').textContent = f !== sh ? "Mixed metals: steel and aluminium can't be welded together, so the sheets are riveted in (the wall and divider infills become folded trays)."
    : f ? 'All aluminium: TIG or spool-gun welding, about a third of the steel weight.' : '';
}
function readInputs() {
  for (const k of NUM_FIELDS) { const el = $(k); if (el && el.value !== '') { const v = parseFloat(el.value); if (isFinite(v)) params[k] = v; } }
  for (const k of SEL_FIELDS) { const el = $(k); if (el) params[k] = (k === 'shs' || k === 'shsT') ? parseFloat(el.value) : el.value; }
  for (const k of CHK_FIELDS) { const el = $(k); if (el) params[k] = el.checked; }
}
function hingeGrid() {
  const g = $('hinge-grid');
  const N = params.rows;
  params.hinges = params.hinges || [];
  let html = '<div class="hd">Row</div><div class="hd">Left door</div><div class="hd">Right door</div>';
  for (let r = 0; r < N; r++) {
    const h = params.hinges[r] || { L: params.defaultHinge, R: params.defaultHinge };
    params.hinges[r] = { L: h.L || 'rear', R: h.R || 'rear' };
    const lab = String.fromCharCode(65 + r);
    const seg = (side) => `<div class="seg" role="group" aria-label="Row ${lab} ${side === 'L' ? 'left' : 'right'} door hinge">` +
      ['rear', 'front'].map(v => `<button type="button" data-row="${r}" data-side="${side}" data-v="${v}" aria-pressed="${params.hinges[r][side] === v}">${v === 'rear' ? 'Rear hinge' : 'Front hinge'}</button>`).join('') + '</div>';
    html += `<div class="row-lab">${lab}${r === 0 ? ' <small class="hint" style="display:inline">cab</small>' : ''}</div>${seg('L')}${seg('R')}`;
  }
  g.innerHTML = html;
}

/* ---------------------------------------------------------------- rebuild */
let timer = null, syncPending = false, lastBuild = 0;
// heavier models wait a little longer after the last keystroke before rebuilding
function schedule(keepView, sync) { if (sync) syncPending = true; clearTimeout(timer); timer = setTimeout(() => rebuild(keepView !== false), Math.max(90, Math.min(900, lastBuild * 1.5))); }
// after an edit is committed, show the value actually used (inputs are clamped to sensible ranges)
function syncInputs() {
  const P = C.normParams(params); // range clamps only; automatic moves (join bolts, hole spacing) stay as warnings
  for (const k of NUM_FIELDS) { const el = $(k); if (el && el.value !== '' && Math.abs(parseFloat(el.value) - P[k]) > 1e-9) el.value = P[k]; }
  for (const k of ['shs', 'shsT']) { const el = $(k); if (el && Math.abs(parseFloat(el.value) - P[k]) > 1e-9) { el.value = String(P[k]); if (el.value === '') el.value = String(params[k]); } }
}
function fmt(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); }
function rebuild(keepView) {
  const t0 = performance.now();
  readInputs();
  model = C.build(params);
  // keep user hinge choices (normalised) but don't clamp the text inputs on every key
  params.hinges = model.P.hinges.map(h => ({ L: h.L, R: h.R }));
  summary = C.summary(model);
  if (viewer) viewer.setModel(model, keepView);
  if (syncPending) { syncPending = false; syncInputs(); }
  renderSummary();
  $('hdr-layout').textContent = `${model.P.rows} x 2`;
  $('hdr-mat').textContent = model.P.frameMat === 'aluminium' ? 'Aluminium' : 'Steel';
  lastBuild = performance.now() - t0;
  try { $('dl-pdf').querySelector('span:last-child').textContent = `${window.CageDrawings.pageCount(model, summary)} sheets`; } catch (e) { /* drawings not loaded */ }
  save();
}
function renderSummary() {
  const { P, G } = model, s = summary;
  const nSheets = (k) => Object.entries(s.nests).filter(([key]) => key.startsWith(k)).reduce((a, [, v]) => a + v.length, 0);
  const holes = s.bom.filter(r => r.holes).reduce((a, r) => a + r.holes * r.qty, 0);
  const perRow = s.perModule.length ? s.perModule.reduce((a, b) => a + b, 0) / s.perModule.length : 0;
  const figs = [
    ['Overall, W x L x H', `${fmt(P.width)} x ${fmt(s.overall.l)} x ${fmt(s.overall.h)}`, 'mm'],
    ['Inside each dog', `${fmt(G.clearL)} x ${fmt(G.clearW)} x ${fmt(G.clearH)}`, `mm, ${fmt(G.clearHRoof)} to roof`],
    ['Door opening', `${fmt(G.openW)} x ${fmt(G.openH)}`, `mm, about ${Math.round(G.clearPastDoor)} past the open door`],
    ['Weight', `${Math.round(s.total)} kg`, `~${Math.round(perRow)} kg a row` + (P.frameMat === P.sheetMat ? `, ${P.frameMat === 'aluminium' ? 'steel' : 'aluminium'} would be ~${Math.round(P.frameMat === 'aluminium' ? s.massIf.steel : s.massIf.aluminium)}` : `, ${Math.round(s.byMat.steel || 0)} steel + ${Math.round(s.byMat.aluminium || 0)} aluminium`)],
    [`${P.frameMat === 'aluminium' ? 'Aluminium' : 'Steel'} SHS ${P.shs} x ${P.shs} x ${Number(P.shsT).toFixed(1)}`, `${s.shsMetres.toFixed(1)} m`, `${s.bars.length} x ${fmt(P.stockLength / 1000)} m bars`],
    ['Sheet and mesh', `${nSheets('Sheet')} ${P.sheetMat} + ${nSheets('Weldmesh')} mesh`, `${fmt(P.sheetW)} x ${fmt(P.sheetH)} sheets`],
  ];
  if (holes) figs.push(['Air holes', `${holes} x Ø${fmt(P.holeD)}`, `at ${fmt(P.holePitch)} mm`]);
  $('figs').innerHTML = figs.map(([k, v, u]) => `<div class="fig"><div class="k">${k}</div><div class="v">${v} <small>${u}</small></div></div>`).join('');
  const w = s.warnings.filter(x => x.level !== 'info'), info = s.warnings.filter(x => x.level === 'info');
  const item = (x) => `<div class="warn ${x.level === 'bad' ? 'bad' : x.level === 'info' ? 'info' : ''}"><span>${x.text}</span></div>`;
  $('warns').innerHTML = (w.length ? `<div class="warns">${w.map(item).join('')}</div>`
    : `<div class="ok">Fits the tray you entered, with ${fmt(s.sideRoom)} each side and ${fmt(P.trayLength - s.overall.l)} spare in length.</div>`)
    + (info.length ? `<div class="warns">${info.map(item).join('')}</div>` : '');
}

/* ---------------------------------------------------------------- files */
function saveFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}
function status(txt, frac) {
  $('status').textContent = txt || '';
  $('prog').style.width = frac === undefined ? '0' : `${Math.round(frac * 100)}%`;
}
function baseName(m) { return `ute-dog-cages-${m.P.rows}x2-${Math.round(m.P.width)}x${Math.round(m.P.depth * m.P.rows)}`; }

async function downloadStep() {
  const btn = $('dl-step'); btn.disabled = true;
  status('Writing STEP file...', 0.3);
  await new Promise(r => setTimeout(r, 30));
  const m = model; // the design as it was when the button was pressed
  try {
    const txt = C.writeSTEP(m, { name: `UTE_DOG_CAGES_${m.P.rows}x2` });
    saveFile(baseName(m) + '.step', new Blob([txt], { type: 'application/step' }));
    status(`STEP saved: ${m.parts.length} parts, ${(txt.length / 1e6).toFixed(1)} MB.`, 1);
  } catch (e) { console.error(e); status('Could not write the STEP file: ' + e.message); }
  btn.disabled = false;
  setTimeout(() => $('prog').style.width = '0', 1500);
}
async function downloadPdf() {
  const btn = $('dl-pdf'); btn.disabled = true;
  const m = model, sm = summary; // later edits don't change a set that is already being drawn
  try {
    const doc = await window.CageDrawings.make(m, sm, (txt, f) => status(txt, f));
    const blob = doc.output('blob');
    saveFile(baseName(m) + '-drawings.pdf', blob);
    status(`Drawings saved: ${doc.getNumberOfPages()} A3 sheets, ${(blob.size / 1e6).toFixed(1)} MB.`, 1);
  } catch (e) { console.error(e); status('Could not make the drawings: ' + e.message); }
  btn.disabled = false;
  setTimeout(() => $('prog').style.width = '0', 1500);
}

/* ---------------------------------------------------------------- events */
function bind() {
  const edits = (e) => e.target.matches('input,select') && e.target.type !== 'file';
  document.querySelector('.rail').addEventListener('input', (e) => { if (edits(e)) schedule(true); });
  document.querySelector('.rail').addEventListener('change', (e) => { if (edits(e)) schedule(true, true); });
  $('rows-dec').addEventListener('click', () => { params.rows = Math.max(1, params.rows - 1); $('rows-out').textContent = params.rows; hingeGrid(); schedule(false); });
  $('rows-inc').addEventListener('click', () => { params.rows = Math.min(6, params.rows + 1); $('rows-out').textContent = params.rows; hingeGrid(); schedule(false); });
  $('hinge-grid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-row]'); if (!b) return;
    params.hinges[+b.dataset.row][b.dataset.side] = b.dataset.v;
    hingeGrid(); schedule(true);
  });
  document.querySelectorAll('[data-mat]').forEach(g => g.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    params[g.dataset.mat] = b.dataset.v; matButtons(); schedule(true);
  }));
  $('hinge-all-rear').addEventListener('click', () => { params.defaultHinge = 'rear'; params.hinges = params.hinges.map(() => ({ L: 'rear', R: 'rear' })); hingeGrid(); schedule(true); });
  $('hinge-all-front').addEventListener('click', () => { params.defaultHinge = 'front'; params.hinges = params.hinges.map(() => ({ L: 'front', R: 'front' })); hingeGrid(); schedule(true); });
  document.querySelectorAll('.tools [data-view]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tools [data-view]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    viewer.view(b.dataset.view);
  }));
  const vopts = () => viewer.set({ roof: $('v-roof').checked, doors: $('v-doors').checked ? 1 : 0, exploded: $('v-explode').checked ? 1 : 0, explodeRows: true, frameColours: $('v-marks').checked });
  ['v-roof', 'v-doors', 'v-explode', 'v-marks'].forEach(id => $(id).addEventListener('change', () => { vopts(); if (id === 'v-explode') viewer.fit(); }));
  $('dl-step').addEventListener('click', downloadStep);
  $('dl-pdf').addEventListener('click', downloadPdf);
  $('save-json').addEventListener('click', () => saveFile('ute-dog-cage-settings.json', new Blob([JSON.stringify(params, null, 1)], { type: 'application/json' })));
  $('load-json').addEventListener('click', () => $('load-file').click());
  $('load-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { params = sanitize(JSON.parse(await f.text())); fillInputs(); hingeGrid(); rebuild(false); status('Settings loaded.'); }
    catch (err) { status('That file is not a saved settings file from this page.'); }
    e.target.value = '';
  });
  $('reset').addEventListener('click', () => { params = defaults(); fillInputs(); hingeGrid(); rebuild(false); status('Back to the 2 x 2 design.'); });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const themeBg = () => { const c = getComputedStyle(document.documentElement).getPropertyValue('--viewer').trim(); if (c && viewer) viewer.setBackground(new window.THREE.Color(c).getHex()); };
  if (mq.addEventListener) mq.addEventListener('change', themeBg);
  new MutationObserver(themeBg).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  themeBg();
}

function start() {
  fillInputs();
  hingeGrid();
  try { viewer = new V.Viewer($('viewer')); viewer.onOrient = (t) => { $('front-tag').textContent = t; }; }
  catch (e) { $('front-tag').textContent = 'This browser could not start the 3D view (WebGL). The cut list and STEP file still work.'; }
  window.__cage = { get model() { return model; }, get summary() { return summary; }, get viewer() { return viewer; }, get params() { return params; }, rebuild, downloadPdf, downloadStep };
  rebuild(false);
  if (viewer) viewer.view('iso');
  bind();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
