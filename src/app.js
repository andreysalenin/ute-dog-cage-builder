/* Page wiring: settings <-> model <-> viewer, summary, downloads. */
(function () {
'use strict';
const C = window.CageCore, V = window.CageViewer;
const LS_KEY = 'ute-dog-cage-builder.v1';
const LS_SIZES = 'ute-dog-cage-builder.sizes.v1';  // sizes last used with each material
const LS_VIEW = 'ute-dog-cage-builder.view.v1';    // viewer toggles
const $ = (id) => document.getElementById(id);

const NUM_FIELDS = ['width', 'depth', 'height', 'trayWidth', 'trayLength', 'doorGap', 'holeD', 'holePitch', 'holeMargin',
  'tSheet', 'tRoof', 'tFloor', 'joists', 'roofBars', 'meshPitch', 'meshWire', 'trayBoltInset', 'joinBoltInset', 'stockLength', 'sheetW', 'sheetH'];
const SEL_FIELDS = ['wallFront', 'wallMiddle', 'wallRear', 'divider', 'shs', 'shsT', 'frameKind', 'sheetKind', 'floorType', 'rowJoin'];
const CHK_FIELDS = ['trayBolts', 'joinBolts'];
const SIZE_KEYS = { frame: ['shs', 'shsT', 'frameKind'], sheet: ['tSheet', 'tRoof', 'tFloor', 'floorType', 'sheetKind'] };

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
  for (const k of ['frameMat', 'sheetMat']) if (!['steel', 'aluminium'].includes(out[k])) out[k] = 'steel';
  out.lock = out.lock === 'cages' ? 'cages' : 'tray';
  return out;
}
const readLS = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
function loadSaved() { try { const s = readLS(LS_KEY); if (s) return sanitize(s); } catch (e) { /* bad data */ } return null; }
function save() { writeLS(LS_KEY, params); }

let params = loadSaved() || defaults();
let sizes = readLS(LS_SIZES) || { frame: {}, sheet: {} };
if (!sizes.frame || !sizes.sheet) sizes = { frame: {}, sheet: {} };
let model = null, summary = null;
let viewer = null;
let matMsg = '';

/* ---------------------------------------------------------------- settings UI */
function kindOptions() {
  for (const which of ['frame', 'sheet']) {
    const el = $(which + 'Kind'), list = C.KINDS[which][params[which + 'Mat']] || [];
    const html = list.map(k => `<option value="${k.id}">${k.label}</option>`).join('');
    if (el.dataset.mat !== params[which + 'Mat']) { el.innerHTML = html; el.dataset.mat = params[which + 'Mat']; }
    if (!list.some(k => k.id === params[which + 'Kind'])) params[which + 'Kind'] = list[0].id;
    el.value = params[which + 'Kind'];
  }
}
function fillInputs() {
  kindOptions();
  for (const k of NUM_FIELDS) { const el = $(k); if (el) el.value = params[k]; }
  for (const k of SEL_FIELDS) { const el = $(k); if (el) el.value = String(params[k]); }
  for (const k of CHK_FIELDS) { const el = $(k); if (el) el.checked = !!params[k]; }
  $('rows-out').textContent = params.rows;
  matButtons();
  lockButtons();
}
function matButtons() {
  document.querySelectorAll('[data-mat]').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(params[g.dataset.mat] === b.dataset.v))));
  const f = params.frameMat === 'aluminium', sh = params.sheetMat === 'aluminium';
  const base = f !== sh ? "Mixed metals: steel and aluminium can't be welded together, so the sheets are riveted in (the wall and divider infills become folded trays)."
    : f ? 'All aluminium: TIG or spool-gun welding, about a third of the weight of steel.' : '';
  $('mat-note').textContent = [matMsg, base].filter(Boolean).join(' ');
}
function lockButtons() {
  for (const b of document.querySelectorAll('.lock')) {
    const on = params.lock === b.dataset.lock;
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('.lock-txt').textContent = on ? 'Locked' : 'Lock';
    b.setAttribute('aria-label', `${on ? 'Locked' : 'Lock'}: ${b.dataset.lock === 'tray' ? 'tray' : 'cage'} sizes`);
  }
  $('fit-txt').textContent = params.lock === 'tray' ? 'Fit cages to tray' : 'Fit tray to cages';
}
function readInputs() {
  for (const k of NUM_FIELDS) { const el = $(k); if (el && el.value !== '') { const v = parseFloat(el.value); if (isFinite(v)) params[k] = v; } }
  for (const k of SEL_FIELDS) { const el = $(k); if (el && el.value !== '') params[k] = (k === 'shs' || k === 'shsT') ? parseFloat(el.value) : el.value; }
  for (const k of CHK_FIELDS) { const el = $(k); if (el && !el.disabled) params[k] = el.checked; }
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
// switching a material brings back the sizes last used with it (or that material's usual sizes)
function switchMaterial(which, mat) {
  const key = which + 'Mat', old = params[key];
  if (old === mat) return;
  readInputs();
  sizes[which][old] = Object.fromEntries(SIZE_KEYS[which].map(k => [k, params[k]]));
  params[key] = mat;
  const back = sizes[which][mat];
  const use = Object.assign({}, C.MAT_DEFAULTS[which][mat], back || {});
  if (!back) use[which + 'Kind'] = C.KINDS[which][mat][0].id;
  Object.assign(params, use);
  writeLS(LS_SIZES, sizes);
  const word = mat === 'aluminium' ? 'aluminium' : 'steel';
  matMsg = which === 'frame' ? `${back ? 'Back to your' : 'Usual'} ${word} frame: SHS ${params.shs} x ${params.shs} x ${Number(params.shsT).toFixed(1)}.`
    : `${back ? 'Back to your' : 'Usual'} ${word} sheets: walls ${Number(params.tSheet).toFixed(1)}, roof ${Number(params.tRoof).toFixed(1)}, floor ${Number(params.tFloor).toFixed(1)} ${params.floorType === 'tread' ? 'tread plate' : 'sheet'}.`;
  fillInputs();
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
  params.frameKind = model.P.frameKind; params.sheetKind = model.P.sheetKind;
  summary = C.summary(model);
  if (viewer) viewer.setModel(model, keepView);
  if (syncPending) { syncPending = false; syncInputs(); }
  renderSummary();
  joinNotes();
  $('hdr-layout').textContent = `${model.P.rows} x 2`;
  $('hdr-mat').textContent = { steel: 'Steel', aluminium: 'Aluminium', stainless: 'Stainless' }[C.metalOf(model.P, 'frame')];
  lastBuild = performance.now() - t0;
  try { $('dl-pdf').querySelector('span:last-child').textContent = `${window.CageDrawings.pageCount(model, summary)} sheets`; } catch (e) { /* drawings not loaded */ }
  save();
}
// notes that depend on the row join: space between dogs, join bolts
function joinNotes() {
  const { P, G } = model;
  const A = P.shs;
  const space = {
    separate: `Two ${A} frames back to back: ${fmt(2 * A)} between neighbouring dogs. Rows bolt together and can be lifted one at a time.`,
    sandwich: P.wallMiddle === 'mesh' ? `Mesh can't be clamped, so it is welded into the rear row. ${fmt(2 * A)} between neighbouring dogs.` : `One ${fmt(P.tSheet)} sheet clamped between two ${A} frames: ${fmt(2 * A + P.tSheet)} between neighbouring dogs, one sheet fewer per joint.`,
    shared2: `One ${A} SHS between rows with a sheet on each face: ${fmt(A)} between neighbouring dogs. The rows are one welded frame.`,
    shared: `One ${A} SHS between rows with one sheet on its centre line: ${fmt(A)} between neighbouring dogs. The rows are one welded frame.`,
  }[P.rowJoin];
  $('join-note').textContent = P.rows > 1 ? space : 'Only matters with two or more rows.';
  const jb = $('joinBolts');
  const sharedFrame = P.rowJoin === 'shared' || P.rowJoin === 'shared2';
  jb.disabled = sharedFrame;
  jb.checked = sharedFrame ? false : !!params.joinBolts;
  jb.nextElementSibling.textContent = sharedFrame ? 'Bolt rows together (not needed: shared frame)' : 'Bolt rows together (2 x M10 at each joint)';
}
function renderSummary() {
  const { P, G } = model, s = summary;
  const nSheets = (k) => Object.entries(s.nests).filter(([key]) => !key.startsWith('Weldmesh')).reduce((a, [, v]) => a + v.length, 0);
  const nMesh = Object.entries(s.nests).filter(([key]) => key.startsWith('Weldmesh')).reduce((a, [, v]) => a + v.length, 0);
  const holes = s.bom.filter(r => r.holes).reduce((a, r) => a + r.holes * r.qty, 0);
  const perRow = s.perModule.length ? s.perModule.reduce((a, b) => a + b, 0) / s.perModule.length : 0;
  const fm = C.metalOf(P, 'frame'), sm = C.metalOf(P, 'sheet');
  const steelish = (m) => m === 'steel' || m === 'stainless';
  const weightNote = G.mixed ? `${Math.round((s.byMat.steel || 0) + (s.byMat.stainless || 0))} steel + ${Math.round(s.byMat.aluminium || 0)} aluminium`
    : steelish(fm) ? `all aluminium would be ~${Math.round(s.massIf.aluminium)}` : `all steel would be ~${Math.round(s.massIf.steel)}`;
  const figs = [
    ['Overall, W x L x H', `${fmt(P.width)} x ${fmt(s.overall.l)} x ${fmt(s.overall.h)}`, 'mm'],
    ['Inside each dog', `${fmt(G.clearL)} x ${fmt(G.clearW)} x ${fmt(G.clearH)}`, `mm, ${fmt(G.clearHRoof)} to roof`],
    ['Door opening', `${fmt(G.openW)} x ${fmt(G.openH)}`, `mm, about ${Math.round(G.clearPastDoor)} past the open door`],
    ['Weight', `${Math.round(s.total)} kg`, `~${Math.round(perRow)} kg a row, ${weightNote}`],
    [`${{ steel: 'Steel', aluminium: 'Aluminium', stainless: 'Stainless' }[fm]} SHS ${P.shs} x ${P.shs} x ${Number(P.shsT).toFixed(1)}`, `${s.shsMetres.toFixed(1)} m`, `${s.bars.length} x ${fmt(P.stockLength / 1000)} m bars, ${C.kindOf(P, 'frame').grade}`],
    ['Sheet and mesh', `${nSheets()} ${sm === 'stainless' ? 'stainless' : sm}${nMesh ? ` + ${nMesh} mesh` : ''}`, `${fmt(P.sheetW)} x ${fmt(P.sheetH)} sheets, ${C.kindOf(P, 'sheet').grade}`],
  ];
  if (P.rows > 1) figs.push(['Between rows', `${fmt(G.betweenDogs)} mm`, C.ROW_JOINS[P.rowJoin].short]);
  if (holes) figs.push(['Air holes', `${holes} x Ø${fmt(P.holeD)}`, `at ${fmt(P.holePitch)} mm`]);
  $('figs').innerHTML = figs.map(([k, v, u]) => `<div class="fig"><div class="k">${k}</div><div class="v">${v} <small>${u}</small></div></div>`).join('');
  const w = s.warnings.filter(x => x.level !== 'info'), info = s.warnings.filter(x => x.level === 'info');
  const item = (x) => `<div class="warn ${x.level === 'bad' ? 'bad' : x.level === 'info' ? 'info' : ''}"><span>${x.text}</span></div>`;
  $('warns').innerHTML = (w.length ? `<div class="warns">${w.map(item).join('')}</div>`
    : `<div class="ok">Fits the tray you entered, with ${fmt(s.sideRoom)} each side and ${fmt(P.trayLength - s.overall.l)} spare in length.</div>`)
    + (info.length ? `<div class="warns">${info.map(item).join('')}</div>` : '');
  // fit line under the Fit button
  const spare = P.trayLength - s.overall.l;
  $('fit-note').textContent = `Cages ${fmt(P.width)} x ${fmt(s.overall.l)} on a ${fmt(P.trayWidth)} x ${fmt(P.trayLength)} tray: ` +
    (s.sideRoom < 0 ? `${fmt(-2 * s.sideRoom)} too wide` : `${fmt(s.sideRoom)} each side`) + ', ' +
    (spare < -0.5 ? `${fmt(-spare)} too long.` : `${fmt(Math.max(0, spare))} spare in length.`) +
    ` Fit keeps the locked sizes and changes the others.`;
}

/* ---------------------------------------------------------------- fit the cages and the tray to each other */
// room each side of the cages for the hinge barrels and latches
function sideRoom() { return Math.max(30, Math.ceil((summary.stickOut + 10) / 10) * 10); }
function fit() {
  readInputs();
  const P = model.P, side = sideRoom();
  const N = params.rows;
  if (params.lock === 'tray') {
    const W = Math.min(2400, Math.max(700, Math.floor((params.trayWidth - 2 * side) / 10) * 10));
    const TL = params.trayLength, A = P.shs;
    const shared = N > 1 && (params.rowJoin === 'shared' || params.rowJoin === 'shared2');
    const plate = N > 1 && params.rowJoin === 'sandwich' && params.wallMiddle !== 'mesh' ? P.tSheet : 0;
    // overall length = N rows minus the shared rails, plus any sheets clamped between rows
    const raw = shared ? (TL + (N - 1) * A) / N : (TL - (N - 1) * plate) / N;
    const D = Math.min(1200, Math.max(350, Math.floor(raw / 5) * 5));
    params.width = W; params.depth = D;
    fillInputs(); rebuild(true);
    let msg = `Cages fitted to the tray: ${fmt(W)} wide (${fmt((params.trayWidth - W) / 2)} each side for the hinges and latches), ${N} ${N === 1 ? 'row' : 'rows'} of ${fmt(D)}.`;
    if (raw > 1200) msg += ` Rows stop at 1200, so ${fmt(params.trayLength - summary.overall.l)} of the tray is left: add a row?`;
    else if (raw < 350) msg += ` ${N} rows don't fit at the 350 minimum: try ${Math.max(1, N - 1)}.`;
    status(msg);
  } else {
    params.trayWidth = Math.min(3000, Math.max(500, Math.ceil((P.width + 2 * side) / 10) * 10));
    params.trayLength = Math.min(4000, Math.max(500, Math.ceil(model.G.Ltot / 5) * 5));
    fillInputs(); rebuild(true);
    status(`Tray set to the cages: ${fmt(params.trayWidth)} wide (${fmt((params.trayWidth - P.width) / 2)} each side) and ${fmt(params.trayLength)} long.`);
  }
  if (viewer && (viewOpts.tray || viewOpts.ute)) viewer.fit();
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
function baseName(m) { return `ute-dog-cages-${m.P.rows}x2-${Math.round(m.P.width)}x${Math.round(m.G.Ltot)}`; }

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
let viewOpts = Object.assign({ roof: true, tray: true, ute: false }, readLS(LS_VIEW) || {});
function bind() {
  const edits = (e) => e.target.matches('input,select') && e.target.type !== 'file';
  document.querySelector('.rail').addEventListener('input', (e) => { if (edits(e)) schedule(true); });
  document.querySelector('.rail').addEventListener('change', (e) => { if (edits(e)) { if (e.target.id === 'floorType' || e.target.id.endsWith('Kind')) matMsg = ''; schedule(true, true); } });
  $('rows-dec').addEventListener('click', () => { params.rows = Math.max(1, params.rows - 1); $('rows-out').textContent = params.rows; hingeGrid(); schedule(false); });
  $('rows-inc').addEventListener('click', () => { params.rows = Math.min(6, params.rows + 1); $('rows-out').textContent = params.rows; hingeGrid(); schedule(false); });
  $('hinge-grid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-row]'); if (!b) return;
    params.hinges[+b.dataset.row][b.dataset.side] = b.dataset.v;
    hingeGrid(); schedule(true);
  });
  document.querySelectorAll('[data-mat]').forEach(g => g.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    switchMaterial(g.dataset.mat === 'frameMat' ? 'frame' : 'sheet', b.dataset.v);
    schedule(true);
  }));
  document.querySelectorAll('.lock').forEach(b => b.addEventListener('click', () => { params.lock = b.dataset.lock; lockButtons(); save(); }));
  $('fit').addEventListener('click', fit);
  $('hinge-all-rear').addEventListener('click', () => { params.defaultHinge = 'rear'; params.hinges = params.hinges.map(() => ({ L: 'rear', R: 'rear' })); hingeGrid(); schedule(true); });
  $('hinge-all-front').addEventListener('click', () => { params.defaultHinge = 'front'; params.hinges = params.hinges.map(() => ({ L: 'front', R: 'front' })); hingeGrid(); schedule(true); });
  document.querySelectorAll('.tools [data-view]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tools [data-view]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    viewer.view(b.dataset.view);
  }));
  const vopts = () => {
    viewOpts = { roof: $('v-roof').checked, tray: $('v-tray').checked, ute: $('v-ute').checked };
    writeLS(LS_VIEW, viewOpts);
    if (viewer) viewer.set({ roof: viewOpts.roof, doors: $('v-doors').checked ? 1 : 0, exploded: $('v-explode').checked ? 1 : 0, explodeRows: true, frameColours: $('v-marks').checked, tray: viewOpts.tray, ute: viewOpts.ute });
  };
  ['v-roof', 'v-doors', 'v-explode', 'v-marks', 'v-tray', 'v-ute'].forEach(id => $(id).addEventListener('change', () => {
    if (id === 'v-ute' && $('v-ute').checked) $('v-tray').checked = true; // the ute carries the tray
    if (id === 'v-tray' && !$('v-tray').checked) $('v-ute').checked = false;
    vopts();
    if (viewer && ['v-explode', 'v-tray', 'v-ute'].includes(id)) viewer.fit();
  }));
  $('v-roof').checked = viewOpts.roof !== false; $('v-tray').checked = !!viewOpts.tray || !!viewOpts.ute; $('v-ute').checked = !!viewOpts.ute;
  vopts();
  $('dl-step').addEventListener('click', downloadStep);
  $('dl-pdf').addEventListener('click', downloadPdf);
  $('save-json').addEventListener('click', () => saveFile('ute-dog-cage-settings.json', new Blob([JSON.stringify(params, null, 1)], { type: 'application/json' })));
  $('load-json').addEventListener('click', () => $('load-file').click());
  $('load-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { params = sanitize(JSON.parse(await f.text())); matMsg = ''; fillInputs(); hingeGrid(); rebuild(false); status('Settings loaded.'); }
    catch (err) { status('That file is not a saved settings file from this page.'); }
    e.target.value = '';
  });
  $('reset').addEventListener('click', () => { params = defaults(); matMsg = ''; fillInputs(); hingeGrid(); rebuild(false); if (viewer) viewer.fit(); status('Back to the 2 x 2 design.'); });
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
  window.__cage = { get model() { return model; }, get summary() { return summary; }, get viewer() { return viewer; }, get params() { return params; }, rebuild, downloadPdf, downloadStep, fit };
  if (viewer) viewer.set({ tray: viewOpts.tray || viewOpts.ute, ute: viewOpts.ute, roof: viewOpts.roof !== false });
  rebuild(false);
  bind();
  if (viewer) viewer.view('iso');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
