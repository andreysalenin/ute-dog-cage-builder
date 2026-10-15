/* Page wiring: settings <-> model <-> viewer, summary, downloads. */
(function () {
'use strict';
const C = window.CageCore, V = window.CageViewer;
const LS_KEY = 'ute-dog-cage-builder.v2';
const LS_OLD = ['ute-dog-cage-builder.v1', 'ute-dog-cage-builder.sizes.v1']; // saved by earlier versions of the page
const LS_VIEW = 'ute-dog-cage-builder.view.v1';    // viewer toggles
const $ = (id) => document.getElementById(id);

const NUM_FIELDS = ['width', 'depth', 'height', 'trayWidth', 'trayLength', 'trayGapSide', 'trayGapFront', 'trayGapRear', 'doorGap',
  'tSheet', 'tRoof', 'tFloor', 'joists', 'roofBars', 'meshPitch', 'meshWire', 'trayBoltInset', 'joinBoltInset', 'stockLength', 'sheetW', 'sheetH'];
const SEL_FIELDS = ['wallFront', 'wallMiddle', 'wallRear', 'divider', 'roofType', 'shs', 'shsT', 'frameKind', 'sheetKind', 'floorType', 'rowJoin'];
const CHK_FIELDS = ['trayBolts', 'joinBolts'];
// sizes the page used for every material before aluminium got its own (used to spot old saved settings)
const OLD_SIZES = { frame: { shs: 25, shsT: 2.0 }, sheet: { tSheet: 1.6, tRoof: 1.6, tFloor: 2.0 } };

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
  // hole arrangements per panel; older settings had one hole size and spacing for every panel
  out.holes = C.normHoles(obj);
  return out;
}
const readLS = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
const dropLS = (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } };
// Settings from before aluminium had its own sizes kept the steel sizes for aluminium. Give an
// aluminium frame or aluminium sheets still on those old sizes the usual aluminium sizes instead.
function upgradeSizes(p) {
  const done = [];
  const same = (which) => Object.entries(OLD_SIZES[which]).every(([k, v]) => Math.abs(Number(p[k]) - v) < 1e-9);
  if (p.frameMat === 'aluminium' && same('frame')) { Object.assign(p, C.MAT_DEFAULTS.frame.aluminium); done.push('frame'); }
  if (p.sheetMat === 'aluminium' && same('sheet')) { Object.assign(p, C.MAT_DEFAULTS.sheet.aluminium); done.push('sheets'); }
  return done;
}
function upgradeNote(done, from) {
  if (!done.length) return '';
  const what = [done.includes('frame') ? 'the frame to 40 x 40 x 2.0 SHS' : '', done.includes('sheets') ? 'the sheets to 2.0, with a 3.0 tread-plate floor' : ''].filter(Boolean).join(' and ');
  return `${from} came from before aluminium had its own sizes, so the aluminium was set to the usual aluminium sizes: ${what}.`;
}
let loadNote = '';
function loadSaved() {
  try {
    const s = readLS(LS_KEY);
    if (s) return sanitize(s);
    const old = readLS(LS_OLD[0]);
    if (old) { const p = sanitize(old); loadNote = upgradeNote(upgradeSizes(p), 'Your saved settings'); return p; }
  } catch (e) { /* bad data */ }
  return null;
}
function save() { writeLS(LS_KEY, params); }

let params = loadSaved() || defaults();
for (const k of LS_OLD) dropLS(k);
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
  fillHoles();
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
  readHoles();
}

/* ---------------------------------------------------------------- air holes: one arrangement per panel */
const HOLE_WHERE = { front: 'Front face', middle: 'Between rows', rear: 'Rear face', divider: 'Divider', roof: 'Roof' };
const HOLE_TYPE_KEY = { front: 'wallFront', middle: 'wallMiddle', rear: 'wallRear', divider: 'divider', roof: 'roofType' };
const H_FIELDS = { pattern: 'h-pattern', area: 'h-area', rows: 'h-rows', d: 'h-d', px: 'h-px', py: 'h-py', margin: 'h-margin' };
let holePanel = 'middle';
function holeSpec(k) {
  if (!params.holes || typeof params.holes !== 'object') params.holes = {};
  params.holes[k] = Object.assign({}, C.HOLE_DEFAULT, params.holes[k] || {});
  return params.holes[k];
}
function fillHoles() {
  const sp = holeSpec(holePanel);
  for (const [k, id] of Object.entries(H_FIELDS)) $(id).value = String(sp[k]);
  document.querySelectorAll('#hole-tabs [data-panel]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.panel === holePanel)));
  holeView();
}
function readHoles() {
  const sp = holeSpec(holePanel);
  for (const [k, id] of Object.entries(H_FIELDS)) {
    const el = $(id); if (!el || el.value === '') continue;
    if (k === 'pattern' || k === 'area') sp[k] = el.value; else { const v = parseFloat(el.value); if (isFinite(v)) sp[k] = v; }
  }
}
// which panels have holes, the fields that apply, and a drawing of the panel being set out
function holeView() {
  let P, G;
  try { P = C.normParams(params); G = C.derived(P); } catch (e) { return; }
  const used = C.holePlaces(P, G), sp = P.holes[holePanel], u = used[holePanel], roof = holePanel === 'roof';
  document.querySelectorAll('#hole-tabs [data-panel]').forEach(b => b.classList.toggle('on', used[b.dataset.panel].used));
  $('h-area-f').hidden = roof;
  $('h-rows-f').hidden = roof || sp.area === 'all';
  $('h-py-lab').textContent = roof ? 'Spacing along the ute' : 'Spacing up';
  let txt, canUse = false;
  if (holePanel === 'middle' && P.rows < 2) txt = 'Between rows: only with two or more rows.';
  else if (u.used) txt = `${HOLE_WHERE[holePanel]}: ${u.panels} ${roof ? (u.panels === 1 ? 'sheet' : 'sheets') : (u.panels === 1 ? 'panel' : 'panels')} with these holes, mark ${u.mark}.`;
  else { txt = `${HOLE_WHERE[holePanel]} is ${params[HOLE_TYPE_KEY[holePanel]] === 'mesh' ? 'weldmesh' : 'solid'}, so these holes are not used yet.`; canUse = true; }
  $('hole-status').textContent = txt;
  $('hole-use').hidden = !canUse;
  drawHolePreview(P, G, sp, roof);
}
function drawHolePreview(P, G, sp, roof) {
  // panel outline (u across, v up) and the areas the holes are set out in
  let W, H, bays, members = [];
  if (roof) {
    W = P.width; H = P.depth;
    bays = G.roofBays.map(([x0, x1]) => [x0, G.A, x1 - x0, H - 2 * G.A]);
    const A = G.A, h = G.h;
    members = [[0, 0, W, A], [0, H - A, W, A], [0, 0, A, H], [W - A, 0, A, H], [G.XC - h, 0, A, H]]
      .concat(G.roofC.flatMap(c => [[c - h, 0, A, H], [W - c - h, 0, A, H]]));
  } else {
    W = holePanel === 'divider' ? G.openW : G.XC - G.h - G.A; H = G.openH;
    bays = [[0, 0, W, H]];
  }
  let n = 0, area = 0, holes = '', borders = '';
  for (const [x0, y0, w, h] of bays) {
    area += w * h;
    for (const [du, dv] of C.holePattern(w, h, sp)) { n++; holes += `<circle cx="${(x0 + w / 2 + du).toFixed(1)}" cy="${(H - (y0 + h / 2 + dv)).toFixed(1)}" r="${(sp.d / 2).toFixed(1)}"/>`; }
    const m = sp.margin;
    if (w > 2 * m && h > 2 * m) borders += `<rect x="${x0 + m}" y="${(H - y0 - h + m).toFixed(1)}" width="${(w - 2 * m).toFixed(1)}" height="${(h - 2 * m).toFixed(1)}"/>`;
  }
  const pad = Math.max(W, H) * 0.025;
  const svg = $('hole-preview');
  svg.setAttribute('viewBox', `${(-pad).toFixed(1)} ${(-pad).toFixed(1)} ${(W + 2 * pad).toFixed(1)} ${(H + 2 * pad).toFixed(1)}`);
  svg.innerHTML = `<rect x="0" y="0" width="${W.toFixed(1)}" height="${H.toFixed(1)}" style="fill:var(--sheet)"/>`
    + members.map(([x, y, w, h]) => `<rect x="${x.toFixed(1)}" y="${(H - y - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" style="fill:var(--muted);opacity:.28"/>`).join('')
    + `<g style="fill:none;stroke:var(--muted);stroke-dasharray:4 3;opacity:.7" vector-effect="non-scaling-stroke">${borders.replace(/<rect /g, '<rect vector-effect="non-scaling-stroke" ')}</g>`
    + `<g style="fill:var(--bg)">${holes}</g>`;
  const open = area > 0 ? n * Math.PI * sp.d * sp.d / 4 / area * 100 : 0;
  $('hole-count').textContent = (roof ? `Roof ${fmt(W)} x ${fmt(H)}, holes over the ${bays.length} open bays of the top frame (shaded bands are the frame under it): ` : `Panel ${fmt(W)} x ${fmt(H)}: `)
    + `${n} ${n === 1 ? 'hole' : 'holes'}${roof ? '' : ' each'}, ${open.toFixed(1)}% open. Dashed line: plain border.`;
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
// switching a material always sets that material's usual sizes and its first grade
function switchMaterial(which, mat) {
  const key = which + 'Mat';
  if (params[key] === mat) return;
  readInputs();
  params[key] = mat;
  Object.assign(params, C.MAT_DEFAULTS[which][mat]);
  params[which + 'Kind'] = C.KINDS[which][mat][0].id;
  const word = mat === 'aluminium' ? 'aluminium' : 'steel';
  matMsg = which === 'frame' ? `Usual ${word} frame set: SHS ${params.shs} x ${params.shs} x ${Number(params.shsT).toFixed(1)}.`
    : `Usual ${word} sheets set: walls ${Number(params.tSheet).toFixed(1)}, roof ${Number(params.tRoof).toFixed(1)}, floor ${Number(params.tFloor).toFixed(1)} ${params.floorType === 'tread' ? 'tread plate' : 'sheet'}.`;
  fillInputs();
  save(); // keep the switch even if the page is closed before the model rebuilds
  if (loadNote && $('status').textContent === loadNote) status('');
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
  // hole fields: show the clamped arrangement (e.g. spacing raised to keep 5 of metal between holes)
  const sp = P.holes[holePanel];
  for (const [k, id] of Object.entries(H_FIELDS)) { const el = $(id); if (el && String(sp[k]) !== el.value && !(k !== 'pattern' && k !== 'area' && Math.abs(parseFloat(el.value) - sp[k]) < 1e-9)) el.value = String(sp[k]); }
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
  holeView();
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
  if (holes) {
    const used = C.holePlaces(P, G), sizes = [...new Set(C.HOLE_PANELS.filter(k => used[k].used).map(k => P.holes[k].d))].sort((a, b) => b - a);
    figs.push(['Air holes', `${holes}`, `Ø${sizes.map(fmt).join(', Ø')} mm, ${C.HOLE_PANELS.filter(k => used[k].used).map(k => ({ front: 'front', middle: 'between rows', rear: 'rear', divider: 'dividers', roof: 'roof' })[k]).join(', ')}`]);
  }
  $('figs').innerHTML = figs.map(([k, v, u]) => `<div class="fig"><div class="k">${k}</div><div class="v">${v} <small>${u}</small></div></div>`).join('');
  const w = s.warnings.filter(x => x.level !== 'info'), info = s.warnings.filter(x => x.level === 'info');
  const item = (x) => `<div class="warn ${x.level === 'bad' ? 'bad' : x.level === 'info' ? 'info' : ''}"><span>${x.text}</span></div>`;
  $('warns').innerHTML = (w.length ? `<div class="warns">${w.map(item).join('')}</div>`
    : `<div class="ok">Fits the tray you entered: ${fmt(s.sideRoom)} each side, ${fmt(P.trayGapFront)} from the headboard and ${fmt(s.trayPlan.behind)} left behind the cages.</div>`)
    + (info.length ? `<div class="warns">${info.map(item).join('')}</div>` : '');
  // fit line under the Fit button, and how far the hinges and latches stick out
  const behind = s.trayPlan.behind;
  $('fit-note').textContent = `Now: cages ${fmt(P.width)} x ${fmt(s.overall.l)} on a ${fmt(P.trayWidth)} x ${fmt(P.trayLength)} tray, ` +
    (s.sideRoom < 0 ? `${fmt(-2 * s.sideRoom)} too wide` : `${fmt(s.sideRoom)} each side`) + `, ${fmt(P.trayGapFront)} at the headboard, ` +
    (behind < -0.5 ? `${fmt(-behind)} past the tail.` : `${fmt(behind)} behind.`) +
    ` Fit keeps the locked sizes and the clearances, and changes the others.`;
  $('side-note').textContent = `Tray edge to the cage side. Hinges and latches stick out about ${Math.round(s.stickOut)}.`;
}

/* ---------------------------------------------------------------- fit the cages and the tray to each other */
// The clearances (each side, at the headboard, behind the cages) stay as set; Fit changes the unlocked sizes.
function fit() {
  clearTimeout(timer); rebuild(true); // start from what is typed in now
  const P = model.P; // clamped values, including the clearances
  const side = P.trayGapSide, front = P.trayGapFront, rear = P.trayGapRear;
  const N = params.rows;
  if (params.lock === 'tray') {
    const wRaw = P.trayWidth - 2 * side;
    const W = Math.min(2400, Math.max(700, Math.floor(wRaw)));
    const avail = P.trayLength - front - rear, A = P.shs;
    const shared = N > 1 && (params.rowJoin === 'shared' || params.rowJoin === 'shared2');
    const plate = N > 1 && params.rowJoin === 'sandwich' && params.wallMiddle !== 'mesh' ? P.tSheet : 0;
    // overall length = N rows minus the shared rails, plus any sheets clamped between rows
    const raw = shared ? (avail + (N - 1) * A) / N : (avail - (N - 1) * plate) / N;
    const D = Math.min(1200, Math.max(350, Math.floor(raw)));
    params.width = W; params.depth = D;
    fillInputs(); rebuild(true);
    let msg = `Cages fitted to the tray: ${fmt(W)} wide, ${N} ${N === 1 ? 'row' : 'rows'} of ${fmt(D)}, ${fmt(summary.overall.l)} long, with ${fmt(summary.sideRoom)} each side, ${fmt(front)} at the headboard and ${fmt(summary.trayPlan.behind)} behind.`;
    if (wRaw > 2400 || wRaw < 700) msg += ` The width stops at ${wRaw > 2400 ? 'the 2400 maximum' : 'the 700 minimum'}.`;
    if (raw > 1200) msg += ` Rows stop at 1200, so more of the tray is left behind them: add a row?`;
    else if (raw < 350) msg += ` ${N} rows don't fit at the 350 minimum: try ${Math.max(1, N - 1)}.`;
    status(msg);
  } else {
    const tw = P.width + 2 * side, tl = model.G.Ltot + front + rear;
    params.trayWidth = Math.min(3000, Math.max(500, Math.ceil(tw)));
    params.trayLength = Math.min(4000, Math.max(500, Math.ceil(tl)));
    fillInputs(); rebuild(true);
    let msg = `Tray set to the cages: ${fmt(params.trayWidth)} wide and ${fmt(params.trayLength)} long, for ${fmt(side)} each side, ${fmt(front)} at the headboard and ${fmt(rear)} behind.`;
    if (tw > 3000 || tl > 4000) msg += ` That is past the ${tw > 3000 ? '3000 width' : '4000 length'} limit, so the tray is cut short.`;
    status(msg);
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
  // air holes: pick a panel, edit its arrangement (the drawing updates as you type)
  $('hole-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-panel]'); if (!b || b.dataset.panel === holePanel) return;
    readHoles(); holePanel = b.dataset.panel; fillHoles();
  });
  for (const id of Object.values(H_FIELDS)) $(id).addEventListener('input', () => { readHoles(); holeView(); });
  $('hole-use').addEventListener('click', () => {
    readInputs(); // keep edits that haven't been rebuilt yet
    params[HOLE_TYPE_KEY[holePanel]] = 'perforated';
    fillInputs(); schedule(true);
  });
  $('h-copy').addEventListener('click', () => {
    readHoles();
    const src = Object.assign({}, holeSpec(holePanel));
    for (const k of C.HOLE_PANELS) if (k !== holePanel) params.holes[k] = Object.assign({}, src);
    holeView(); schedule(true);
    status(`${HOLE_WHERE[holePanel]} hole arrangement copied to every panel` + (holePanel !== 'roof' && src.area !== 'all' ? ' (the roof always uses the whole panel).' : '.'));
  });
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
    try {
      const raw = JSON.parse(await f.text());
      params = sanitize(raw);
      // files saved before the grades existed have no frameKind: their aluminium may still be on the old sizes
      const note = raw && !('frameKind' in raw) ? upgradeNote(upgradeSizes(params), 'This file') : '';
      matMsg = ''; fillInputs(); hingeGrid(); rebuild(false); status(note ? 'Settings loaded. ' + note : 'Settings loaded.');
    }
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
  { // start on a panel that has holes
    const P = C.normParams(params), used = C.holePlaces(P, C.derived(P));
    holePanel = ['middle', 'front', 'rear', 'divider', 'roof'].find(k => used[k].used) || 'middle';
  }
  fillInputs();
  hingeGrid();
  try { viewer = new V.Viewer($('viewer')); viewer.onOrient = (t) => { $('front-tag').textContent = t; }; }
  catch (e) { $('front-tag').textContent = 'This browser could not start the 3D view (WebGL). The cut list and STEP file still work.'; }
  window.__cage = { get model() { return model; }, get summary() { return summary; }, get viewer() { return viewer; }, get params() { return params; }, rebuild, downloadPdf, downloadStep, fit };
  if (viewer) viewer.set({ tray: viewOpts.tray || viewOpts.ute, ute: viewOpts.ute, roof: viewOpts.roof !== false });
  rebuild(false);
  bind();
  if (viewer) viewer.view('iso');
  if (loadNote) status(loadNote);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
