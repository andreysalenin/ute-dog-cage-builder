/* Ute dog cage core: parametric geometry, quantities and STEP writer.
   Pure JS, no DOM. Units mm. Axes: X across the ute (0 = left side of the cages),
   Y along the ute (+Y toward the cab, 0 = rear face), Z up (0 = tray). */
(function (root) {
'use strict';

/* ------------------------------------------------------------------ defaults */
const DEFAULTS = {
  rows: 2,               // modules front-to-back (each holds 2 dogs side by side)
  width: 1700,           // overall width across the ute
  depth: 550,            // each module (compartment length) along the ute
  height: 750,           // frame height (roof sheet sits on top)
  trayWidth: 1900,       // for the fit check only
  trayLength: 1800,
  shs: 25, shsT: 2.0,    // SHS size and wall
  frameMat: 'steel',     // SHS frame, doors, tabs, mesh, hinges: steel | aluminium
  sheetMat: 'steel',     // floor, roof, walls, divider: steel | aluminium
  frameKind: 'pregalv',  // grade and finish within the frame material (KINDS.frame)
  sheetKind: 'galv',     // grade and finish within the sheet material (KINDS.sheet)
  floorType: 'plain',    // plain | tread (checker plate)
  tFloor: 2.0, tSheet: 1.6, tRoof: 1.6,
  wallFront: 'solid',    // face toward the cab: solid | perforated | mesh
  wallRear: 'solid',     // face toward the tailgate
  wallMiddle: 'perforated', // walls between rows
  rowJoin: 'separate',   // how rows meet: separate | sandwich | shared2 | shared (see ROW_JOINS)
  divider: 'solid',      // between the two dogs of a row: solid | perforated
  holeD: 30, holePitch: 75, holeMargin: 45,
  meshPitch: 50, meshWire: 4, meshEdge: 25,
  doorGap: 5,
  hinges: [],            // per row from the front: {L:'rear'|'front', R:'rear'|'front'}
  defaultHinge: 'rear',
  joists: 2,             // floor joists per compartment
  roofBars: 1,           // roof cross members per compartment
  trayBolts: true, trayBoltInset: 100,
  joinBolts: true, joinBoltInset: 150,
  notchClear: 5,
  stockLength: 6500, kerf: 3,
  sheetW: 2400, sheetH: 1200,
  lock: 'tray',          // which set of sizes "Fit" keeps: tray | cages
};
// sizes that go with each material, applied when the material is switched on the page
const MAT_DEFAULTS = {
  frame: { steel: { shs: 25, shsT: 2.0 }, aluminium: { shs: 40, shsT: 2.0 } },
  sheet: { steel: { tSheet: 1.6, tRoof: 1.6, tFloor: 2.0, floorType: 'plain' },
           aluminium: { tSheet: 2.0, tRoof: 2.0, tFloor: 3.0, floorType: 'tread' } },
};
// grades within each material. finish drives the colour; metal overrides the material (stainless)
const KINDS = {
  frame: {
    steel: [
      { id: 'pregalv', label: 'Pre-galv C350L0 (in-line galv)', grade: 'C350L0, pre-galv', mesh: 'galv weldmesh', finish: 'galv' },
      { id: 'black', label: 'Black C350L0, to powder coat', grade: 'C350L0, black', mesh: 'black weldmesh', finish: 'paint' },
      { id: 'hdg', label: 'Black C350L0, hot-dip galv after', grade: 'C350L0, galv after fab', mesh: 'weldmesh, galv after fab', finish: 'galv' },
      { id: 'ss304', label: 'Stainless 304', grade: '304', mesh: '304 stainless weldmesh', finish: 'stainless', metal: 'stainless' },
      { id: 'ss316', label: 'Stainless 316 (marine)', grade: '316', mesh: '316 stainless weldmesh', finish: 'stainless', metal: 'stainless' },
    ],
    aluminium: [
      { id: '6061', label: '6061-T6 structural', grade: '6061-T6', mesh: 'aluminium weldmesh', finish: 'alu' },
      { id: '6082', label: '6082-T6 structural', grade: '6082-T6', mesh: 'aluminium weldmesh', finish: 'alu' },
      { id: '6060', label: '6060-T5 light duty', grade: '6060-T5', mesh: 'aluminium weldmesh', finish: 'alu' },
    ],
  },
  sheet: {
    steel: [
      { id: 'galv', label: 'Galvanised Z275', grade: 'galv Z275', tread: 'galv tread plate', finish: 'galv' },
      { id: 'zinc', label: 'Zincanneal, to paint', grade: 'Zincanneal', tread: 'checker plate', finish: 'paint' },
      { id: 'black', label: 'Black, to paint', grade: 'cold rolled', tread: 'checker plate', finish: 'paint' },
      { id: 'ss304', label: 'Stainless 304', grade: '304 2B', tread: '304 tread plate', finish: 'stainless', metal: 'stainless' },
      { id: 'ss316', label: 'Stainless 316 (marine)', grade: '316 2B', tread: '316 tread plate', finish: 'stainless', metal: 'stainless' },
    ],
    aluminium: [
      { id: '5052', label: '5052-H32 marine', grade: '5052-H32', tread: '5052-H32 tread plate', finish: 'alu' },
      { id: '5005', label: '5005-H34 general', grade: '5005-H34', tread: '5052-H32 tread plate', finish: 'alu' },
      { id: '5083', label: '5083-H321 heavy duty', grade: '5083-H321', tread: '5083-H321 tread plate', finish: 'alu' },
    ],
  },
};
// how neighbouring rows meet
const ROW_JOINS = {
  separate: { label: 'Separate frames, a wall each', short: 'separate frames, bolted' },
  sandwich: { label: 'Separate frames, one sheet between', short: 'separate frames, one sheet between' },
  shared2: { label: 'Shared frame, a wall each side', short: 'shared frame, a wall each side' },
  shared: { label: 'Shared frame, one wall', short: 'shared frame, one wall' },
};
const TREAD_MASS = 1.1; // tread plate weighs about 10% more than plain sheet of the same base thickness

const HINGE_D = 16, HINGE_L = 100, HINGE_END = 70; // HINGE_D/L: defaults; the model sizes them from the SHS (derived)
const MAX_HOLES = 2500;
const LATCH = { tubeOD: 20, tubeID: 13, boltD: 12, plateT: 3, plateW: 100, plateZ: [-75, 50], t4: 35 };
const DENSITY = 7.85e-6; // kg/mm3 (steel)
const MATERIALS = {
  steel: { label: 'Steel', short: 'steel', density: 7.85e-6, E: 200e3, shsGrade: 'C350, galv', sheetGrade: 'galv', meshName: 'galv weldmesh' },
  aluminium: { label: 'Aluminium', short: 'alum.', density: 2.70e-6, E: 69e3, shsGrade: '6061-T6', sheetGrade: '5052-H32', meshName: 'aluminium weldmesh' },
  stainless: { label: 'Stainless', short: 'stainless', density: 7.95e-6, E: 193e3 },
  plastic: { label: 'Plastic', short: 'plastic', density: 1.2e-6, E: 2e3 },
};
const SHEET_KINDS = ['floor', 'roof', 'sheet', 'perf'];
const SHS_SIZES = [20, 25, 30, 35, 40], SHS_WALLS = [1.6, 2.0, 2.5, 3.0]; // the sections offered on the page
// the chosen grade for 'frame' or 'sheet' (falls back to the first one offered for the material)
function kindOf(P, which) {
  const list = KINDS[which][P[which + 'Mat']] || KINDS[which].steel;
  return list.find(k => k.id === P[which + 'Kind']) || list[0];
}
// steel | aluminium | stainless
function metalOf(P, which) { const k = kindOf(P, which); return k.metal || P[which + 'Mat']; }
// what each part is made of: sheets follow the sheet choice; everything welded to the frame follows the frame
function partMaterial(p, P) {
  if (p.kind === 'cap') return 'plastic';
  if (p.kind === 'bolt' || p.kind === 'latch') return metalOf(P, 'frame') === 'steel' ? 'steel' : 'stainless';
  if (SHEET_KINDS.includes(p.kind)) return metalOf(P, 'sheet');
  return metalOf(P, 'frame');
}
function partFinish(p, P) {
  if (p.kind === 'cap') return 'plastic';
  if (p.kind === 'bolt' || p.kind === 'latch') return metalOf(P, 'frame') === 'steel' ? 'zinc' : 'stainless';
  if (p.kind === 'hinge' && metalOf(P, 'frame') === 'steel') return 'zinc';
  return kindOf(P, SHEET_KINDS.includes(p.kind) ? 'sheet' : 'frame').finish;
}

function normParams(p) {
  const P = Object.assign({}, DEFAULTS, p || {});
  const num = (k, lo, hi) => { let v = Number(P[k]); if (!isFinite(v)) v = DEFAULTS[k]; P[k] = Math.min(hi, Math.max(lo, v)); };
  num('rows', 1, 6); P.rows = Math.round(P.rows);
  num('width', 700, 2400); num('depth', 350, 1200); num('height', 400, 1200);
  num('trayWidth', 500, 3000); num('trayLength', 500, 4000);
  num('shs', 20, 50); num('shsT', 1.2, 4); num('tFloor', 1, 5); num('tSheet', 0.8, 4); num('tRoof', 0.8, 4);
  num('holeD', 10, 80); num('holePitch', 20, 250); num('holeMargin', 5, 200);
  num('meshPitch', 20, 150); num('meshWire', 2, 8); num('meshEdge', 5, 100);
  num('doorGap', 2, 8); num('joists', 0, 6); num('roofBars', 0, 4);
  num('trayBoltInset', 40, 400); num('joinBoltInset', 60, 600); num('notchClear', 0, 15);
  num('stockLength', 3000, 12000); num('kerf', 0, 6); num('sheetW', 500, 6000); num('sheetH', 500, 3000);
  P.joists = Math.round(P.joists); P.roofBars = Math.round(P.roofBars);
  if (P.holePitch < Math.max(P.holeD + 10, 25)) P.holePitch = Math.max(P.holeD + 10, 25); // keeps the hole count sane
  for (const k of ['wallFront', 'wallRear', 'wallMiddle']) if (!['solid', 'perforated', 'mesh'].includes(P[k])) P[k] = DEFAULTS[k];
  if (!['solid', 'perforated'].includes(P.divider)) P.divider = 'solid';
  for (const k of ['frameMat', 'sheetMat']) if (!['steel', 'aluminium'].includes(P[k])) P[k] = 'steel';
  P.frameKind = kindOf(P, 'frame').id; P.sheetKind = kindOf(P, 'sheet').id;
  if (!['plain', 'tread'].includes(P.floorType)) P.floorType = 'plain';
  if (!ROW_JOINS[P.rowJoin]) P.rowJoin = 'separate';
  if (!['tray', 'cages'].includes(P.lock)) P.lock = 'tray';
  P.trayBolts = !!P.trayBolts; P.joinBolts = !!P.joinBolts;
  // a shared frame is welded right through: there is nothing to bolt between rows
  if (P.rowJoin === 'shared' || P.rowJoin === 'shared2') P.joinBolts = false;
  const h = [];
  for (let i = 0; i < P.rows; i++) {
    const src = (P.hinges && P.hinges[i]) || {};
    h.push({ L: src.L === 'front' || src.L === 'rear' ? src.L : P.defaultHinge,
             R: src.R === 'front' || src.R === 'rear' ? src.R : P.defaultHinge });
  }
  P.hinges = h;
  // outside corner radius: cold-formed steel SHS is about 2t; extruded aluminium is nearly square
  const rFor = (t) => P.frameMat === 'aluminium' ? Math.min(1.0, P.shs / 2 - 1) : Math.min(2 * t, P.shs / 2 - 1);
  // keep at least 12 of flat face (outside and inside) so bolt holes fit (rules out e.g. 20 x 20 x 2.5 steel)
  const flatFor = (t) => Math.min(P.shs - 2 * rFor(t), P.shs - 2 * t - 2 * Math.max(rFor(t) - t, 0));
  if (flatFor(P.shsT) < 12) {
    P.shsTWanted = P.shsT;
    let t = P.shsT; while (t > 1.2 && flatFor(t) < 12) t = Math.round((t - 0.1) * 10) / 10;
    P.shsT = t;
  }
  P.shsR = rFor(P.shsT);
  // bolts must land on their members: tray bolts inside the joist span, join bolts clear of posts
  P.trayBoltInset = Math.max(P.shs + 15, Math.min(P.trayBoltInset, P.depth / 2 - 20));
  P.joinBoltInset = Math.max(P.shs + 15, Math.min(P.joinBoltInset, P.width / 2 - P.shs / 2 - 15));
  return P;
}

/* ------------------------------------------------------------------ vectors */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

/* ------------------------------------------------------------------ 2D loops
   A loop is a list of segments, closed. Line: {t:'L',a,b}. Arc: {t:'A',a,b,c,r,ccw}
   with sweep <= 180 deg. Outer loops CCW, holes CW (in the prism's u,v frame). */
function L2(a, b) { return { t: 'L', a, b }; }
function A2(a, b, c, r, ccw) { return { t: 'A', a, b, c, r, ccw }; }

function reverseLoop(loop) {
  return loop.slice().reverse().map(s => s.t === 'L' ? L2(s.b, s.a) : A2(s.b, s.a, s.c, s.r, !s.ccw));
}
function rectLoop(u0, v0, u1, v1) {
  const p = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  return [L2(p[0], p[1]), L2(p[1], p[2]), L2(p[2], p[3]), L2(p[3], p[0])];
}
function polyLoop(pts) { // CCW polygon
  const out = [];
  for (let i = 0; i < pts.length; i++) out.push(L2(pts[i], pts[(i + 1) % pts.length]));
  return out;
}
function circleLoop(cu, cv, r) { // CCW, two semicircles
  const a = [cu + r, cv], b = [cu - r, cv];
  return [A2(a, b, [cu, cv], r, true), A2(b, a, [cu, cv], r, true)];
}
// rounded rectangle CCW: segments 0 +u side, 2 +v side, 4 -u side, 6 -v side (lines), odd = corner arcs
function roundRectLoop(cu, cv, hw, hh, r) {
  if (r <= 1e-9) { // square corners, same side order as the rounded loop (+u, +v, -u, -v)
    const x0 = cu - hw, x1 = cu + hw, y0 = cv - hh, y1 = cv + hh;
    return [L2([x1, y0], [x1, y1]), L2([x1, y1], [x0, y1]), L2([x0, y1], [x0, y0]), L2([x0, y0], [x1, y0])];
  }
  const x0 = cu - hw, x1 = cu + hw, y0 = cv - hh, y1 = cv + hh;
  return [
    L2([x1, y0 + r], [x1, y1 - r]), A2([x1, y1 - r], [x1 - r, y1], [x1 - r, y1 - r], r, true),
    L2([x1 - r, y1], [x0 + r, y1]), A2([x0 + r, y1], [x0, y1 - r], [x0 + r, y1 - r], r, true),
    L2([x0, y1 - r], [x0, y0 + r]), A2([x0, y0 + r], [x0 + r, y0], [x0 + r, y0 + r], r, true),
    L2([x0 + r, y0], [x1 - r, y0]), A2([x1 - r, y0], [x1, y0 + r], [x1 - r, y0 + r], r, true),
  ];
}
function hexLoop(cu, cv, af) {
  const R = af / Math.sqrt(3);
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push([cu + R * Math.cos(a), cv + R * Math.sin(a)]); }
  return polyLoop(pts);
}
function segLen(s) {
  if (s.t === 'L') return Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
  return s.r * arcSweep(s);
}
function arcSweep(s) {
  let a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
  let a1 = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]);
  let d = s.ccw ? a1 - a0 : a0 - a1;
  while (d <= 1e-12) d += 2 * Math.PI;
  return d;
}
function arcPoints(s, n) { // n+1 points along an arc
  const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
  const sw = arcSweep(s) * (s.ccw ? 1 : -1);
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + sw * i / n; out.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]); }
  out[0] = s.a; out[n] = s.b;
  return out;
}
function loopPolyline(loop, arcN = 16) {
  const pts = [];
  for (const s of loop) {
    if (s.t === 'L') pts.push(s.a);
    else { const p = arcPoints(s, arcN); for (let i = 0; i < arcN; i++) pts.push(p[i]); }
  }
  return pts;
}
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
function loopArea(loop) { // signed, exact for arcs
  let a = polyArea(loop.map(s => s.a));
  for (const s of loop) if (s.t === 'A') {
    const th = arcSweep(s);
    const seg = s.r * s.r * (th - Math.sin(th)) / 2;
    a += s.ccw ? seg : -seg;
  }
  return a;
}

/* ------------------------------------------------------------------ prisms
   prism = {o, u, v, n, len, loops, holes?}  3D point = o + a*u + b*v + w*n, n = u x v.
   holes: wall holes across two parallel side faces {li,k,lj,m,s,w,d}. */
function prism(o, u, v, len, loops, extra) {
  const n = cross(u, v);
  return Object.assign({ o, u, v, n, len, loops, holes: [] }, extra || {});
}
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
function frameFor(axis) { // u, v with u x v = axis
  if (axis === 'x') return [Y, Z];
  if (axis === 'y') return [Z, X];
  return [X, Y];
}
function boxP(x0, x1, y0, y1, z0, z1) {
  return prism([0, 0, z0], X, Y, z1 - z0, [rectLoop(x0, y0, x1, y1)]);
}
// plate perpendicular to an axis, spanning the given ranges, with optional round holes
function plateP(axis, t0, t1, ra, rb, holes) {
  // axis 'y': profile (z, x); axis 'x': (y, z); axis 'z': (x, y). ra = range of first profile coord, rb = second.
  const [u, v] = frameFor(axis);
  const o = axis === 'x' ? [t0, 0, 0] : axis === 'y' ? [0, t0, 0] : [0, 0, t0];
  const loops = [rectLoop(ra[0], rb[0], ra[1], rb[1])];
  for (const h of holes || []) loops.push(reverseLoop(circleLoop(h[0], h[1], h[2])));
  return prism(o, u, v, t1 - t0, loops);
}
function shsP(P, axis, start, length, c1, c2) {
  // axis 'x': c1 = y, c2 = z | 'y': c1 = x, c2 = z | 'z': c1 = x, c2 = y
  const [u, v] = frameFor(axis);
  let cu, cv, o;
  if (axis === 'x') { cu = c1; cv = c2; o = [start, 0, 0]; }
  else if (axis === 'y') { cu = c2; cv = c1; o = [0, start, 0]; }
  else { cu = c1; cv = c2; o = [0, 0, start]; }
  const a = P.shs / 2, t = P.shsT, r = P.shsR;
  const outer = roundRectLoop(cu, cv, a, a, r);
  const inner = reverseLoop(roundRectLoop(cu, cv, a - t, a - t, Math.max(r - t, 0)));
  return prism(o, u, v, length, [outer, inner], { shs: { axis, cu, cv } });
}
// index of the flat side faces of a rounded SHS: '+u','+v','-u','-v'
function shsFaces(P, side) {
  const k = { '+u': 0, '+v': 1, '-u': 2, '-v': 3 }[side];
  const rO = P.shsR > 1e-9, rI = P.shsR - P.shsT > 1e-9; // aluminium: rounded outside, square inside
  const outer = rO ? 2 * k : k;
  const nI = rI ? 8 : 4;
  return { outer, inner: nI - 1 - (rI ? 2 * k : k) }; // inner loop is reversed
}
// drill a hole through one wall of an SHS prism at distance w along it
function shsHole(P, pr, side, w, d) {
  const f = shsFaces(P, side);
  const seg = pr.loops[0][f.outer];
  pr.holes.push({ li: 0, k: f.outer, lj: 1, m: f.inner, s: segLen(seg) / 2, w, d });
}
function cylP(d, p0, p1, id) {
  const ax = sub(p1, p0), L = Math.hypot(ax[0], ax[1], ax[2]);
  const n = norm(ax);
  let u = Math.abs(n[2]) < 0.9 ? norm(cross(Z, n)) : norm(cross(X, n));
  if (Math.abs(n[0]) > 0.9) u = [0, 1, 0];
  if (Math.abs(n[1]) > 0.9) u = [0, 0, 1];
  if (Math.abs(n[2]) > 0.9) u = [1, 0, 0];
  const v = cross(n, u);
  const loops = [circleLoop(0, 0, d / 2)];
  if (id) loops.push(reverseLoop(circleLoop(0, 0, id / 2)));
  return prism(p0, u, v, L, loops);
}
function hexP(af, p0, p1, holeD) {
  const pr = cylP(1, p0, p1);
  pr.loops = [hexLoop(0, 0, af)];
  if (holeD) pr.loops.push(reverseLoop(circleLoop(0, 0, holeD / 2)));
  return pr;
}
function translateP(pr, t) { return Object.assign({}, pr, { o: add(pr.o, t), holes: pr.holes.slice() }); }
// mirror about the plane x = xc, keeping outer loops CCW
function mirrorXP(pr, xc) {
  const M = (a) => [-a[0], a[1], a[2]];
  const o = [2 * xc - pr.o[0], pr.o[1], pr.o[2]];
  const u = M(pr.v), v = M(pr.u);
  const sw = (p) => [p[1], p[0]];
  const loops = pr.loops.map(loop => {
    const swapped = loop.map(s => s.t === 'L' ? L2(sw(s.a), sw(s.b)) : A2(sw(s.a), sw(s.b), sw(s.c), s.r, !s.ccw));
    return reverseLoop(swapped);
  });
  const K = pr.loops.map(l => l.length);
  const holes = pr.holes.map(h => {
    // segment index k maps to K-1-k after reversal; the distance along it flips too
    const k2 = K[h.li] - 1 - h.k, m2 = K[h.lj] - 1 - h.m;
    const seg = loops[h.li][k2];
    return Object.assign({}, h, { k: k2, m: m2, s: segLen(seg) - h.s });
  });
  const n = cross(u, v);
  return Object.assign({}, pr, { o, u, v, n, loops, holes });
}
function prismVolume(pr) {
  let a = 0;
  for (const l of pr.loops) a += loopArea(l);
  let vol = a * pr.len;
  for (const h of pr.holes) {
    const sA = pr.loops[h.li][h.k], sB = pr.loops[h.lj][h.m];
    const t = wallDepth(pr, sA, sB);
    vol -= Math.PI * h.d * h.d / 4 * t;
  }
  return vol;
}
function to3(pr, p, w) { return add(add(add(pr.o, mul(pr.u, p[0])), mul(pr.v, p[1])), mul(pr.n, w || 0)); }
function dir3(pr, d) { return add(mul(pr.u, d[0]), mul(pr.v, d[1])); }
function rightNormal2(s) { // outward normal (2D) of a line segment
  const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]], l = Math.hypot(d[0], d[1]);
  return [d[1] / l, -d[0] / l];
}
function wallDepth(pr, sA, sB) {
  const nA = rightNormal2(sA); // outward of face A
  const pa = sA.a, pb = sB.a;
  return Math.abs((pb[0] - pa[0]) * nA[0] + (pb[1] - pa[1]) * nA[1]);
}

/* ------------------------------------------------------------------ model */
// colours by finish (STEP file); the viewer has matching styles
const COLORS = { // black powder coat or paint
  frame: [0.17, 0.18, 0.20], door: [0.17, 0.18, 0.20], tab: [0.17, 0.18, 0.20],
  floor: [0.30, 0.31, 0.33], sheet: [0.36, 0.38, 0.41], roof: [0.36, 0.38, 0.41],
  perf: [0.40, 0.42, 0.45], mesh: [0.66, 0.68, 0.71], hinge: [0.86, 0.70, 0.28],
  latch: [0.86, 0.70, 0.28], bolt: [0.75, 0.76, 0.78], cap: [0.08, 0.08, 0.09],
};
const FINISH_COLORS = {
  galv: { frame: [0.43, 0.46, 0.48], door: [0.43, 0.46, 0.48], tab: [0.43, 0.46, 0.48], floor: [0.50, 0.53, 0.55],
          sheet: [0.56, 0.59, 0.61], roof: [0.56, 0.59, 0.61], perf: [0.54, 0.57, 0.59], mesh: [0.70, 0.72, 0.74] },
  alu: { frame: [0.66, 0.68, 0.71], door: [0.66, 0.68, 0.71], tab: [0.66, 0.68, 0.71], floor: [0.70, 0.72, 0.74],
         sheet: [0.76, 0.78, 0.80], roof: [0.76, 0.78, 0.80], perf: [0.74, 0.76, 0.78], mesh: [0.80, 0.82, 0.84], hinge: [0.78, 0.79, 0.81] },
  stainless: { frame: [0.70, 0.72, 0.75], door: [0.70, 0.72, 0.75], tab: [0.70, 0.72, 0.75], floor: [0.72, 0.74, 0.77],
               sheet: [0.78, 0.80, 0.82], roof: [0.78, 0.80, 0.82], perf: [0.76, 0.78, 0.80], mesh: [0.82, 0.84, 0.86],
               hinge: [0.80, 0.81, 0.83], latch: [0.80, 0.81, 0.83], bolt: [0.80, 0.81, 0.83] },
};
function colourOf(p) {
  const f = FINISH_COLORS[p.finish];
  if (f && f[p.kind]) return f[p.kind];
  return COLORS[p.kind] || [0.5, 0.5, 0.5];
}
const METAL_WORD = { steel: 'steel', aluminium: 'aluminium', stainless: 'stainless steel' };
// material wording used in the drawings, the STEP file and the page
function materialText(p, P) {
  if (p.material === 'plastic') return 'plastic';
  if (p.kind === 'bolt' || p.kind === 'latch') return p.material === 'stainless' ? 'stainless steel' : 'steel, zinc plated';
  const which = SHEET_KINDS.includes(p.kind) ? 'sheet' : 'frame';
  const k = kindOf(P, which), word = METAL_WORD[metalOf(P, which)];
  if (p.kind === 'mesh') return k.mesh;
  if (p.kind === 'hinge') return metalOf(P, 'frame') === 'steel' ? 'steel, zinc plated' : `${word}`;
  if (p.kind === 'floor' && P.floorType === 'tread') return `${word} ${k.tread}`;
  if (which === 'sheet') return `${word} sheet, ${k.grade}`;
  return `${word}, ${k.grade}`;
}
// short grade words for drawings and the page: e.g. "steel C350L0, pre-galv", "aluminium 5052-H32"
function gradeText(P, which) {
  const k = kindOf(P, which), m = metalOf(P, which);
  if (m === 'stainless') return `stainless ${k.grade}`;
  return `${METAL_WORD[m]} ${k.grade}`;
}

function wirePositions(span, P) {
  const n = Math.floor((span - 2 * P.meshEdge) / P.meshPitch + 1e-9);
  const out = [];
  if (n < 0) return out;
  for (let i = 0; i <= n; i++) out.push((-n / 2 + i) * P.meshPitch);
  return out;
}
function holeGrid(w, h, P) { // centred hole pattern in a w x h panel; returns offsets from the panel centre
  const m = P.holeMargin + P.holeD / 2;
  const nu = Math.floor((w - 2 * m) / P.holePitch + 1e-9), nv = Math.floor((h - 2 * m) / P.holePitch + 1e-9);
  const us = [], vs = [];
  if (nu < 0 || nv < 0) return { us, vs };
  for (let i = 0; i <= nu; i++) us.push((-nu / 2 + i) * P.holePitch);
  for (let j = 0; j <= nv; j++) vs.push((-nv / 2 + j) * P.holePitch);
  return { us, vs };
}
function rowLabel(i, N) { return String.fromCharCode(65 + (N - 1 - i)); } // i = 0 rear -> label from the front

function derived(P) {
  const A = P.shs, h = A / 2, L = P.width, D = P.depth, H = P.height;
  const XC = L / 2;
  const zFloor = A + P.tFloor, zTopU = H - A;
  const doorY0 = A + P.doorGap, doorY1 = D - A - P.doorGap;
  const doorZ0 = zFloor + P.doorGap, doorZ1 = zTopU - P.doorGap;
  const bayA = [A, XC - h];
  const joistC = [], roofC = [];
  const r5 = (x) => Math.round(x / 5) * 5;
  for (let k = 1; k <= P.joists; k++) joistC.push(r5(bayA[0] + (bayA[1] - bayA[0]) * k / (P.joists + 1)));
  for (let k = 1; k <= P.roofBars; k++) roofC.push(r5(bayA[0] + (bayA[1] - bayA[0]) * k / (P.roofBars + 1)));
  // tray bolt crush tube: the largest common size whose hole fits the flat of the joist's top face
  // a hole through one wall must sit inside the flat of both its outside and inside faces
  const flat = Math.min(A - 2 * P.shsR, A - 2 * P.shsT - 2 * Math.max(P.shsR - P.shsT, 0));
  const crush = [{ od: 16, wall: 2.0, bolt: 10 }, { od: 14, wall: 1.8, bolt: 10 }, { od: 12, wall: 1.6, bolt: 8 }].find(c => c.od + 0.7 <= flat) || null;
  // weld-on bullet hinge sized to the tube
  const hingeD = A <= 25 ? 16 : A <= 35 ? 20 : 25, hingeL = hingeD === 25 ? 120 : 100;
  // how the rows meet: separate frames sit back to back (a sheet may be clamped between them);
  // a shared frame has one SHS line between neighbouring rows
  const N = P.rows;
  const shared = N > 1 && (P.rowJoin === 'shared' || P.rowJoin === 'shared2');
  const sandwich = N > 1 && P.rowJoin === 'sandwich';
  const plateT = sandwich && P.wallMiddle !== 'mesh' ? P.tSheet : 0;
  const pitch = shared ? D - A : D + plateT;
  const rowY = [], joints = [];
  for (let i = 0; i < N; i++) rowY.push(i * pitch);
  for (let i = 0; i < N - 1; i++) joints.push(shared ? rowY[i + 1] + h : rowY[i] + D + plateT / 2);
  // keepers on a shared post get half its depth each (both neighbouring doors use that post)
  const halfKeeper = [6, 8, 10, 12, 16, 20].filter(w => w <= h - 1).pop() || 6;
  return {
    N, shared, sandwich, plateT, pitch, rowY, joints, Ltot: N ? (N - 1) * pitch + D : 0,
    bolted: !shared && P.joinBolts && N > 1, betweenDogs: shared ? A : 2 * A + plateT, halfKeeper,
    crush, trayBoltD: crush ? crush.bolt : 8, shsFlat: flat,
    // steel and aluminium can't be welded together: infills become folded trays riveted into the frame
    mixed: P.frameMat !== P.sheetMat,
    // wall tray flanges run back into the rail; with a wall each side of a shared rail each gets half of it
    trayF: shared && P.rowJoin === 'shared2' ? Math.max(5, Math.floor(h - P.tSheet - 0.5)) : Math.max(8, Math.floor(A - P.tSheet - 1)),
    divF: Math.max(5, Math.floor(A / 2 - P.tSheet / 2 - 0.5)),
    hingeD, hingeL,
    hingeEnd: Math.min(HINGE_END, Math.max(10, ((doorZ1 - doorZ0) - 2 * hingeL) / 2 - 10)),
    // hinge barrel sits on the gap centre: how far it reaches past each tube's corner radius onto the flat face
    hingeReach: hingeD / 2 - (P.doorGap / 2 + P.shsR),
    joinBoltL: [50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120].find(l => l >= 2 * A + plateT + 18) || 120,
    A, h, L, D, H, XC, zFloor, zTopU, doorY0, doorY1, doorZ0, doorZ1,
    doorW: doorY1 - doorY0, doorH: doorZ1 - doorZ0, latchZ: (doorZ0 + doorZ1) / 2,
    bays: [[A, XC - h], [XC + h, L - A]], joistC, roofC,
    openW: D - 2 * A, openH: zTopU - zFloor,
    clearL: XC - P.tSheet / 2 - A, clearW: D - 2 * A, clearH: zTopU - zFloor, clearHRoof: H - zFloor,
    clearPastDoor: D - 3 * A - P.doorGap / 2 - hingeD / 2,
    trayBoltJoist: joistC.length ? joistC[0] : null,
  };
}

// what closes module i's rear or front face: {type, style} or null when the face is left open
// (the shared wall belongs to the row in front, or a sheet is clamped between the two frames).
// style 'infill': flush with the inside face of the rail (mesh: on the rail centre line);
// style 'centre': one sheet on the centre line of a shared rail
function faceSpec(P, G, i, face) {
  const N = P.rows;
  if (face === 'rear' && i === 0) return { type: P.wallRear, style: 'infill' };
  if (face === 'front' && i === N - 1) return { type: P.wallFront, style: 'infill' };
  const t = P.wallMiddle;
  if (G.shared) {
    if (face === 'front') return P.rowJoin === 'shared2' && t !== 'mesh' ? { type: t, style: 'infill' } : null;
    return { type: t, style: P.rowJoin === 'shared' && t !== 'mesh' ? 'centre' : 'infill' };
  }
  if (G.sandwich) return t === 'mesh' && face === 'front' ? { type: t, style: 'infill' } : null;
  return { type: t, style: 'infill' };
}

function build(params) {
  const P = normParams(params);
  const G = derived(P);
  // join bolt heads sit at the top-rail level: find the nearest spot clear of the end rail, roof bars and centre cross
  if (G.bolted) {
    const clr = P.shs / 2 + 15;
    const blocked = G.roofC.map(c => [c - clr, c + clr]).concat([[-1e9, P.shs + 15], [G.XC - clr, 1e9]]);
    const free = (x) => blocked.every(([a, b]) => x <= a || x >= b);
    let best = null;
    for (let d = 0; d <= G.XC && best === null; d += 1) for (const x of [P.joinBoltInset - d, P.joinBoltInset + d]) if (free(x)) { best = x; break; }
    if (best === null) { P.joinBolts = false; P.joinBoltsDropped = true; G.bolted = false; }
    else if (Math.abs(best - P.joinBoltInset) > 1e-9) { P.joinBoltMoved = P.joinBoltInset; P.joinBoltInset = best; }
  }
  // cap the number of air holes so the model, viewer and STEP stay workable
  {
    const per = (w, hh) => { const g = holeGrid(w, hh, P); return g.us.length * g.vs.length; };
    const count = () => {
      let n = 0;
      for (let i = 0; i < P.rows; i++) {
        for (const face of ['rear', 'front']) { const f = faceSpec(P, G, i, face); if (f && f.type === 'perforated') n += 2 * per(G.XC - G.h - G.A, G.openH); }
        if (P.divider === 'perforated') n += per(G.openW, G.openH);
      }
      if (G.plateT && P.wallMiddle === 'perforated') n += (P.rows - 1) * 2 * per(G.XC - G.h - G.A, G.openH);
      return n;
    };
    if (count() > MAX_HOLES) { P.holePitchWanted = P.holePitch; while (count() > MAX_HOLES) P.holePitch += 5; }
  }
  const { A, h, L, D, H, XC, zFloor, zTopU } = G;
  const N = P.rows;
  const parts = [];
  const SHS = `SHS ${P.shs}x${P.shs}x${P.shsT.toFixed(1)}`;

  for (let i = 0; i < N; i++) {
    const tag = rowLabel(i, N);
    const yoff = G.rowY[i];
    // with a shared frame the rails and posts between two rows belong to the row in front
    const ownFront = !(G.shared && i < N - 1);
    const sharedRear = G.shared && i > 0, sharedFront = G.shared && i < N - 1;
    const joinRear = G.bolted && i > 0, joinFront = G.bolted && i < N - 1;
    const hinge = P.hinges[N - 1 - i];
    const mod = [];
    const add_ = (o) => { mod.push(Object.assign({ module: tag, group: 'body' }, o)); };
    const railYs = ownFront ? [['rear', h], ['front', D - h]] : [['rear', h]];

    // ---------------- frame
    for (const [lvl, zc] of [['bottom', h], ['top', H - h]]) {
      for (const [side, yc] of railYs) {
        const pr = shsP(P, 'x', 0, L, yc, zc);
        let mark = 'F1', note = 'long rail';
        if (lvl === 'top' && ((side === 'rear' && joinRear) || (side === 'front' && joinFront))) {
          for (const xb of [P.joinBoltInset, L - P.joinBoltInset]) {
            shsHole(P, pr, '+u', xb, 11); shsHole(P, pr, '-u', xb, 11);
          }
          mark = 'F1H'; note = 'long rail, 2 x 11 holes for join bolts';
        }
        add_({ name: `${lvl} long rail ${side}`, kind: 'frame', mark, stock: SHS, size: L, note, solids: [pr] });
      }
      for (const [side, xc] of [['left', h], ['right', L - h]])
        add_({ name: `${lvl} end rail ${side}`, kind: 'frame', mark: 'F3', stock: SHS, size: D - 2 * A, note: 'cross member', solids: [shsP(P, 'y', A, D - 2 * A, xc, zc)] });
      add_({ name: `${lvl} centre cross`, kind: 'frame', mark: 'F3', stock: SHS, size: D - 2 * A, note: 'cross member', solids: [shsP(P, 'y', A, D - 2 * A, XC, zc)] });
    }
    G.joistC.forEach((c, ji) => {
      for (const [side, xc] of [['left', c], ['right', L - c]]) {
        const pr = shsP(P, 'y', A, D - 2 * A, xc, h);
        let mark = 'F3', note = 'cross member';
        if (P.trayBolts && ji === 0) {
          for (const yb of [P.trayBoltInset, D - P.trayBoltInset]) {
            const ct = G.crush;
            shsHole(P, pr, '-u', yb - A, G.trayBoltD + 1);
            // top wall: crush-tube hole, or a plain bolt hole when no tube fits
            const f = shsFaces(P, '+u');
            pr.holes.push({ li: 0, k: f.outer, lj: 1, m: f.inner, s: segLen(pr.loops[0][f.outer]) / 2, w: yb - A, d: ct ? ct.od + 0.5 : G.trayBoltD + 1 });
            if (ct) add_({ name: `crush tube ${side} y${yb}`, kind: 'tab', mark: 'T2', stock: `Tube ${ct.od} OD x ${ct.wall.toFixed(1)}`, size: A - P.shsT, note: 'crush tube',
                   solids: [cylP(ct.od, [xc, yb, P.shsT], [xc, yb, A], ct.od - 2 * ct.wall)] });
          }
          mark = 'F3H'; note = G.crush ? 'joist, crush tubes for tray bolts' : 'joist, holes for tray bolts';
        }
        add_({ name: `floor joist ${side} ${c}`, kind: 'frame', mark, stock: SHS, size: D - 2 * A, note, solids: [pr] });
      }
    });
    G.roofC.forEach((c) => {
      for (const [side, xc] of [['left', c], ['right', L - c]])
        add_({ name: `roof cross ${side} ${c}`, kind: 'frame', mark: 'F3', stock: SHS, size: D - 2 * A, note: 'cross member', solids: [shsP(P, 'y', A, D - 2 * A, xc, H - h)] });
    });
    const posts = [[h, h, 'corner RL'], [h, D - h, 'corner FL'], [L - h, h, 'corner RR'], [L - h, D - h, 'corner FR'], [XC, h, 'centre R'], [XC, D - h, 'centre F']]
      .filter(([, yc]) => ownFront || yc < D / 2);
    for (const [xc, yc, nm] of posts)
      add_({ name: `post ${nm}`, kind: 'frame', mark: 'F2', stock: SHS, size: H - 2 * A, note: 'post', solids: [shsP(P, 'z', A, H - 2 * A, xc, yc)] });

    // ---------------- floor, roof, divider
    // on a shared frame every floor runs between rail centre lines (all rows the same); roofs cover the outer rails
    const c = P.notchClear, nc = A + c;
    const fy0 = G.shared ? h : 0, fy1 = G.shared ? D - h : D;
    const fpts = [[nc, fy0], [XC - h - c, fy0], [XC - h - c, A + c], [XC + h + c, A + c], [XC + h + c, fy0], [L - nc, fy0], [L - nc, nc], [L, nc],
      [L, D - nc], [L - nc, D - nc], [L - nc, fy1], [XC + h + c, fy1], [XC + h + c, D - A - c], [XC - h - c, D - A - c], [XC - h - c, fy1],
      [nc, fy1], [nc, D - nc], [0, D - nc], [0, nc], [nc, nc]];
    const floorLoops = [polyLoop(fpts)];
    if (P.trayBolts && G.trayBoltJoist !== null)
      for (const xb of [G.trayBoltJoist, L - G.trayBoltJoist]) for (const yb of [P.trayBoltInset, D - P.trayBoltInset])
        floorLoops.push(reverseLoop(circleLoop(xb, yb, (G.trayBoltD + 1) / 2)));
    const tread = P.floorType === 'tread';
    add_({ name: 'floor', kind: 'floor', mark: 'S1', stock: `${tread ? 'Tread plate' : 'Sheet'} ${P.tFloor.toFixed(1)}`, size: [L, fy1 - fy0],
           note: (G.shared ? 'ends on the rail centre lines, ' : '') + (P.trayBolts && G.trayBoltJoist !== null ? 'post notches + bolt holes' : 'post notches'),
           massFactor: tread ? TREAD_MASS : 1, tread, solids: [prism([0, 0, A], X, Y, P.tFloor, floorLoops)] });
    const ry0 = sharedRear ? h : 0, ry1 = sharedFront ? D - h : D;
    add_({ name: 'roof', kind: 'roof', mark: 'S2', stock: `Sheet ${P.tRoof.toFixed(1)}`, size: [L, ry1 - ry0], note: G.mixed ? 'riveted to top frame' : 'sits on top frame',
           solids: [boxP(0, L, ry0, ry1, H, H + P.tRoof)] });
    {
      const w = D - 2 * A, hh = zTopU - zFloor;
      let holes = [];
      if (P.divider === 'perforated') {
        const g = holeGrid(w, hh, P);
        for (const du of g.us) for (const dv of g.vs) holes.push([A + w / 2 + du, zFloor + hh / 2 + dv, P.holeD / 2]);
      }
      const t = P.tSheet, sol = [plateP('x', XC - t / 2, XC + t / 2, [A, D - A], [zFloor, zTopU], holes)];
      let size = [w, hh], note = P.divider === 'perforated' ? `divider, ${holes.length} x ${P.holeD} holes` : 'centre divider infill';
      if (G.mixed) { // folded tray: flanges to the right, against the centre posts, cross and floor
        const f = G.divF, x0 = XC + t / 2, x1 = x0 + f;
        sol.push(boxP(x0, x1, A, A + t, zFloor + t, zTopU - t), boxP(x0, x1, D - A - t, D - A, zFloor + t, zTopU - t),
                 boxP(x0, x1, A, D - A, zFloor, zFloor + t), boxP(x0, x1, A, D - A, zTopU - t, zTopU));
        size = [w + 2 * f, hh + 2 * f];
        note = `folded tray, ${Math.round(f)} flanges, riveted` + (holes.length ? `, ${holes.length} x ${P.holeD} holes` : '');
      }
      add_({ name: 'divider', kind: P.divider === 'perforated' ? 'perf' : 'sheet', mark: P.divider === 'perforated' ? 'S6' : 'S3',
             stock: `Sheet ${P.tSheet.toFixed(1)}`, size, note, tray: G.mixed ? { f: G.divF, face: [w, hh] } : null,
             holes: holes.length, solids: sol });
    }

    // ---------------- long walls
    for (const face of ['rear', 'front']) {
      const spec = faceSpec(P, G, i, face);
      if (!spec) continue;
      const type = spec.type;
      G.bays.forEach(([xa, xb], bi) => {
        const bay = bi === 0 ? 'left' : 'right';
        const w = xb - xa, hh = zTopU - zFloor;
        const grid = () => { const out = [], g = holeGrid(w, hh, P); for (const du of g.us) for (const dv of g.vs) out.push([zFloor + hh / 2 + dv, xa + w / 2 + du, P.holeD / 2]); return out; };
        if (type === 'mesh') {
          const yc = face === 'rear' ? h : D - h;
          const dogSide = face === 'rear' ? 1 : -1;
          const s = P.meshWire;
          const sol = [];
          for (const du of wirePositions(w, P)) sol.push(cylP(s, [xa + w / 2 + du, yc + dogSide * s / 2, zFloor], [xa + w / 2 + du, yc + dogSide * s / 2, zTopU]));
          for (const dv of wirePositions(hh, P)) sol.push(cylP(s, [xa, yc - dogSide * s / 2, zFloor + hh / 2 + dv], [xb, yc - dogSide * s / 2, zFloor + hh / 2 + dv]));
          add_({ name: `${face} wall ${bay} mesh`, kind: 'mesh', mark: 'M1', stock: `Weldmesh ${P.meshPitch}x${P.meshPitch}x${P.meshWire}`, size: [w, hh],
                 note: `${wirePositions(w, P).length} x ${wirePositions(hh, P).length} wires`, solids: sol });
        } else if (spec.style === 'centre') {
          // one wall between rows, on the centre line of the shared rail (this row's rear rail)
          const t = P.tSheet, y0 = h - t / 2;
          const holes = type === 'perforated' ? grid() : [];
          const sol = [plateP('y', y0, y0 + t, [zFloor, zTopU], [xa, xb], holes)];
          let size = [w, hh], note = holes.length ? `wall between rows, ${holes.length} x ${P.holeD} holes` : 'wall between rows, on the rail centre line';
          if (G.mixed) { // folded tray, flanges toward the front against the posts, rail and floor
            const f = G.divF, ya = y0 + t, yb = ya + f;
            sol.push(boxP(xa, xa + t, ya, yb, zFloor + t, zTopU - t), boxP(xb - t, xb, ya, yb, zFloor + t, zTopU - t),
                     boxP(xa, xb, ya, yb, zFloor, zFloor + t), boxP(xa, xb, ya, yb, zTopU - t, zTopU));
            size = [w + 2 * f, hh + 2 * f];
            note = `folded tray, ${Math.round(f)} flanges, riveted` + (holes.length ? `, ${holes.length} x ${P.holeD} holes` : '');
          }
          add_({ name: `rear wall ${bay} shared ${type}`, kind: type === 'perforated' ? 'perf' : 'sheet', mark: 'S7',
                 stock: `Sheet ${P.tSheet.toFixed(1)}`, size, holes: holes.length, note, tray: G.mixed ? { f: G.divF, face: [w, hh] } : null, solids: sol });
        } else {
          const y0 = face === 'rear' ? A - P.tSheet : D - A;
          const holes = type === 'perforated' ? grid() : [];
          const t = P.tSheet, sol = [plateP('y', y0, y0 + t, [zFloor, zTopU], [xa, xb], holes)];
          let size = [w, hh], note = type === 'perforated' ? `wall infill, ${holes.length} x ${P.holeD} holes` : 'wall infill, flush with inside face';
          if (G.mixed) { // folded tray: flanges run back into the frame opening against posts, rail and floor
            const f = G.trayF, ya = face === 'rear' ? y0 - f : y0 + t, yb = ya + f;
            sol.push(boxP(xa, xa + t, ya, yb, zFloor + t, zTopU - t), boxP(xb - t, xb, ya, yb, zFloor + t, zTopU - t),
                     boxP(xa, xb, ya, yb, zFloor, zFloor + t), boxP(xa, xb, ya, yb, zTopU - t, zTopU));
            size = [w + 2 * f, hh + 2 * f];
            note = `folded tray, ${Math.round(f)} flanges, riveted` + (holes.length ? `, ${holes.length} x ${P.holeD} holes` : '');
          }
          add_({ name: `${face} wall ${bay} ${type}`, kind: type === 'perforated' ? 'perf' : 'sheet', mark: type === 'perforated' ? 'S5' : 'S4',
                 stock: `Sheet ${P.tSheet.toFixed(1)}`, size, holes: holes.length, note, tray: G.mixed ? { f: G.trayF, face: [w, hh] } : null,
                 solids: sol });
        }
      });
    }

    // ---------------- doors
    for (const side of ['L', 'R']) {
      for (const dp of buildDoor(P, G, side, hinge[side], { rear: sharedRear, front: sharedFront })) mod.push(Object.assign({ module: tag }, dp));
    }

    // ---------------- caps on the open long-rail ends
    for (const zc of [h, H - h]) for (const [, yc] of railYs) for (const [x0, x1, nm] of [[-2, 0, 'L'], [L, L + 2, 'R']])
      add_({ name: `end cap ${nm} y${Math.round(yc)} z${Math.round(zc)}`, kind: 'cap', mark: 'H5', hardware: true, note: 'plastic insert cap', solids: [boxP(x0, x1, yc - h, yc + h, zc - h, zc + h)] });

    // ---------------- tray bolts
    if (P.trayBolts && G.trayBoltJoist !== null) {
      for (const xb of [G.trayBoltJoist, L - G.trayBoltJoist]) for (const yb of [P.trayBoltInset, D - P.trayBoltInset]) {
        const bd = G.trayBoltD;
        add_({ name: `tray bolt x${xb} y${yb}`, kind: 'bolt', mark: 'H3', hardware: true, note: `M${bd} tray bolt set`,
               solids: [cylP(bd, [xb, yb, -30], [xb, yb, zFloor + 2]), cylP(2 * bd, [xb, yb, zFloor], [xb, yb, zFloor + 2], bd + 0.5),
                        hexP(bd === 10 ? 16 : 13, [xb, yb, zFloor + 2], [xb, yb, zFloor + 0.84 * bd + 2])] });
      }
    }
    for (const p of mod) {
      p.solids = p.solids.map(s => translateP(s, [0, yoff, 0]));
      if (p.door) { p.door.axis = [p.door.axis[0], p.door.axis[1] + yoff]; p.door.module = tag; }
      p.name = `${tag} ${p.mark ? p.mark + ' ' : ''}${p.name}`;
      parts.push(p);
    }
  }

  // ---------------- one sheet clamped between neighbouring frames
  if (G.plateT > 0) {
    for (let i = 0; i < N - 1; i++) {
      const y0 = G.rowY[i] + D, t = G.plateT, holes = [];
      if (P.wallMiddle === 'perforated') for (const [xa, xb] of G.bays) {
        const w = xb - xa, hh = zTopU - zFloor, g = holeGrid(w, hh, P);
        for (const du of g.us) for (const dv of g.vs) holes.push([zFloor + hh / 2 + dv, xa + w / 2 + du, P.holeD / 2]);
      }
      const nAir = holes.length;
      if (G.bolted) for (const xb of [P.joinBoltInset, L - P.joinBoltInset]) holes.push([H - h, xb, 5.5]);
      parts.push({ name: `J S8 sheet between rows ${rowLabel(i + 1, N)}${rowLabel(i, N)}`, module: 'J', group: 'body', kind: nAir ? 'perf' : 'sheet', mark: 'S8',
        stock: `Sheet ${t.toFixed(1)}`, size: [L, H + P.tRoof], holes: nAir,
        note: 'clamped between the frames' + (nAir ? `, ${nAir} x ${P.holeD} holes` : '') + (G.bolted ? ', 2 x 11 bolt holes' : ''),
        solids: [plateP('y', y0, y0 + t, [0, H + P.tRoof], [0, L], holes)] });
    }
  }

  // ---------------- join bolts between rows (through both top rails, and the sheet between them if any)
  if (G.bolted) {
    for (let i = 0; i < N - 1; i++) {
      const yf = G.rowY[i] + D, zc = H - h;
      for (const xb of [P.joinBoltInset, L - P.joinBoltInset]) {
        const ya = yf - A - 2, yb = yf + G.plateT + A + 2;
        parts.push({ name: `J H4 join bolt ${rowLabel(i + 1, N)}${rowLabel(i, N)} x${xb}`, module: 'J', group: 'body', kind: 'bolt', mark: 'H4', hardware: true,
          note: `M10 x ${G.joinBoltL} join bolt set`,
          solids: [hexP(16, [xb, ya - 6.4, zc], [xb, ya, zc]), cylP(20, [xb, ya, zc], [xb, ya + 2, zc], 10),
                   cylP(10, [xb, ya, zc], [xb, ya + G.joinBoltL, zc]),
                   cylP(20, [xb, yb - 2, zc], [xb, yb, zc], 10), hexP(16, [xb, yb, zc], [xb, yb + 10, zc], 10)] });
      }
    }
  }
  for (const p of parts) { p.material = partMaterial(p, P); p.finish = partFinish(p, P); }
  return { P, G, parts };
}

function buildDoor(P, G, side, hinge, sharedPost) {
  const { A, h, D, doorY0: y0, doorY1: y1, doorZ0: z0, doorZ1: z1, doorW, doorH, latchZ, zTopU, XC } = G;
  const out = [];
  const xo = 0;
  const SHS = `SHS ${P.shs}x${P.shs}x${P.shsT.toFixed(1)}`;
  const push = (o) => out.push(Object.assign({ group: 'door' }, o));
  // door frame
  push({ name: `${side} door stile rear`, kind: 'door', mark: 'D1', stock: SHS, size: doorH, note: 'door stile', solids: [shsP(P, 'z', z0, doorH, xo + h, y0 + h)] });
  push({ name: `${side} door stile front`, kind: 'door', mark: 'D1', stock: SHS, size: doorH, note: 'door stile', solids: [shsP(P, 'z', z0, doorH, xo + h, y1 - h)] });
  push({ name: `${side} door bottom rail`, kind: 'door', mark: 'D2', stock: SHS, size: doorW - 2 * A, note: 'door rail', solids: [shsP(P, 'y', y0 + A, doorW - 2 * A, xo + h, z0 + h)] });
  push({ name: `${side} door top rail`, kind: 'door', mark: 'D2', stock: SHS, size: doorW - 2 * A, note: 'door rail', solids: [shsP(P, 'y', y0 + A, doorW - 2 * A, xo + h, z1 - h)] });
  // door mesh: vertical wires on the dog side (+X for a left door)
  {
    const mw = doorW - 2 * A, mh = doorH - 2 * A, s = P.meshWire, yc = (y0 + y1) / 2, zc = (z0 + z1) / 2;
    const sol = [];
    for (const du of wirePositions(mw, P)) sol.push(cylP(s, [xo + h + s / 2, yc + du, z0 + A], [xo + h + s / 2, yc + du, z1 - A]));
    for (const dv of wirePositions(mh, P)) sol.push(cylP(s, [xo + h - s / 2, y0 + A, zc + dv], [xo + h - s / 2, y1 - A, zc + dv]));
    push({ name: `${side} door mesh`, kind: 'mesh', mark: 'M2', stock: `Weldmesh ${P.meshPitch}x${P.meshPitch}x${P.meshWire}`, size: [mw, mh],
           note: `${wirePositions(mw, P).length} x ${wirePositions(mh, P).length} wires`, solids: sol });
  }
  // hinges
  const yh = hinge === 'rear' ? A + P.doorGap / 2 : D - A - P.doorGap / 2;
  const HD = G.hingeD, HL = G.hingeL;
  const xh = xo - HD / 2;
  [z0 + G.hingeEnd, z1 - G.hingeEnd - HL].forEach((zb, k) => {
    const zm = zb + HL / 2;
    out.push({ name: `${side} hinge ${k + 1} post half`, kind: 'hinge', mark: 'H1', hardware: true, group: 'body', note: `weld-on bullet hinge ${HD} x ${HL}, lift-off`,
               solids: [cylP(HD, [xh, yh, zb], [xh, yh, zm])] });
    push({ name: `${side} hinge ${k + 1} door half`, kind: 'hinge', hardware: true, solids: [cylP(HD, [xh, yh, zm], [xh, yh, zb + HL])] });
  });
  // latch on the opposite edge
  const sgn = hinge === 'rear' ? 1 : -1;
  const Yd = (d) => sgn > 0 ? y1 - d : y0 + d;              // d in from the latch-side door edge
  const Yp = (d) => sgn > 0 ? (D - A) + d : A - d;          // d into the post from its face
  const span = (a, b) => [Math.min(a, b), Math.max(a, b)];
  const T = LATCH.plateT, xl = xo - T - LATCH.tubeOD / 2;
  let [ya, yb] = span(Yd(0), Yd(LATCH.plateW));
  push({ name: `${side} latch plate`, kind: 'tab', mark: 'T3', stock: 'Flat bar 100x3', size: LATCH.plateZ[1] - LATCH.plateZ[0], note: 'latch cover plate',
         solids: [boxP(xo - T, xo, ya, yb, latchZ + LATCH.plateZ[0], latchZ + LATCH.plateZ[1])] });
  [[0, 25], [70, 90]].forEach(([d0, d1], k) => {
    const [a, b] = span(Yd(d0), Yd(d1));
    push({ name: `${side} latch guide ${k + 1}`, kind: 'latch', mark: k === 0 ? 'H2' : null, hardware: true, note: 'drop-handle slide bolt, weld-on',
           solids: [cylP(LATCH.tubeOD, [xl, a, latchZ], [xl, b, latchZ], LATCH.tubeID)] });
  });
  // on a post shared with the next row the keeper gets only its own half of the post
  const half = !!(sharedPost && (hinge === 'rear' ? sharedPost.front : sharedPost.rear));
  const kd = half ? G.halfKeeper : A;
  [ya, yb] = span(Yp(0), Yp(kd));
  out.push(half ? { name: `${side} latch keeper packer half`, kind: 'tab', mark: 'T6', stock: `Flat bar ${kd}x3`, size: 40, note: 'keeper packer, half a shared post', group: 'body',
                    solids: [boxP(xo - T, xo, ya, yb, latchZ - 20, latchZ + 20)] }
             : { name: `${side} latch keeper packer`, kind: 'tab', mark: 'T5', stock: `Flat bar ${A}x3`, size: 40, note: 'keeper packer on post', group: 'body',
                 solids: [boxP(xo - T, xo, ya, yb, latchZ - 20, latchZ + 20)] });
  out.push({ name: `${side} latch keeper`, kind: 'latch', hardware: true, group: 'body', solids: [cylP(LATCH.tubeOD, [xl, ya, latchZ], [xl, yb, latchZ], LATCH.tubeID)] });
  {
    const [a, b] = span(Yd(LATCH.plateW), Yp(Math.min(20, kd)));
    const yhd = Yd(35);
    push({ name: `${side} latch bolt`, kind: 'latch', hardware: true,
           solids: [cylP(LATCH.boltD, [xl, a, latchZ], [xl, b, latchZ]), cylP(10, [xl, yhd, latchZ - LATCH.boltD / 2], [xl, yhd, latchZ - 32])] });
  }
  {
    const [a, b] = span(Yd(42), Yd(45));
    // tab extruded along Y with a 6 hole: profile (z, x)
    const x0 = xo - T - LATCH.t4, x1 = xo - T;
    push({ name: `${side} latch stop tab`, kind: 'tab', mark: 'T4', stock: 'Flat bar 25x3', size: LATCH.t4, note: 'handle stop, 6 hole for pin',
           solids: [plateP('y', a, b, [latchZ - 35, latchZ - 10], [x0, x1], [[latchZ - 22.5, x0 + 9, 3]])] });
  }
  // door stops on the inside face of the top end rail
  [[y0 + 30, y0 + 55], [y1 - 55, y1 - 30]].forEach(([a, b], k) => {
    out.push({ name: `${side} door stop ${k + 1}`, kind: 'tab', mark: 'T1', stock: 'Flat bar 25x3', size: 30, note: 'door stop tab', group: 'body',
               solids: [boxP(xo + A, xo + A + 3, a, b, z1 - 10, zTopU + 15)] });
  });
  // caps on the door stile ends
  for (const yc of [y0 + h, y1 - h]) for (const [za, zb] of [[z0 - 2, z0], [z1, z1 + 2]])
    push({ name: `${side} stile cap y${Math.round(yc)} z${Math.round(za)}`, kind: 'cap', mark: 'H5', hardware: true, note: 'plastic insert cap', solids: [boxP(xo, xo + A, yc - h, yc + h, za, zb)] });

  // door swing info (left door built at x = 0; mirror for the right)
  for (const p of out) if (p.group === 'door') p.door = { side, hinge, axis: [xh, yh], sign: (hinge === 'rear' ? 1 : -1) };
  if (side === 'R') {
    for (const p of out) {
      p.solids = p.solids.map(s => mirrorXP(s, XC));
      if (p.door) { p.door.axis = [2 * XC - p.door.axis[0], p.door.axis[1]]; p.door.sign = -p.door.sign; }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ quantities */
function partVolume(p) { return p.solids.reduce((a, s) => a + prismVolume(s), 0); }
function partMass(p) { return partVolume(p) * (p.massFactor || 1) * (MATERIALS[p.material] || MATERIALS.steel).density; }

function bom(model) {
  const rows = new Map();
  for (const p of model.parts) {
    if (!p.mark) continue;
    const key = [p.mark, p.stock || '', JSON.stringify(p.size || ''), p.note || '', p.material || ''].join('|');
    if (!rows.has(key)) rows.set(key, { mark: p.mark, stock: p.stock, size: p.size, note: p.note, material: p.material, tray: p.tray || null, qty: 0, mass: 0, holes: p.holes || 0, modules: new Set() });
    const r = rows.get(key);
    r.qty += 1; r.mass += partMass(p); r.modules.add(p.module);
  }
  return [...rows.values()].sort((a, b) => a.mark.localeCompare(b.mark, 'en', { numeric: true }));
}
function masses(model) {
  const m = {};
  for (const p of model.parts) m[p.module] = (m[p.module] || 0) + partMass(p);
  return m;
}
// first-fit decreasing; cuts are numbers or {len, mark}
function ffd(cuts, stock, kerf) {
  const L = (c) => typeof c === 'number' ? c : c.len;
  const bars = [];
  for (const c of cuts.slice().sort((a, b) => L(b) - L(a))) {
    if (L(c) > stock) { bars.push([c]); continue; }
    let placed = false;
    for (const b of bars) {
      const used = b.reduce((x, y) => x + L(y), 0) + kerf * (b.length + 1);
      if (used + L(c) <= stock) { b.push(c); placed = true; break; }
    }
    if (!placed) bars.push([c]);
  }
  return bars;
}
// MaxRects packing (best short side fit, rotation allowed) of rectangles onto sheets.
// Each piece is inflated by `gap` so pieces sit at least `gap` apart.
function nest(pieces, W, H, gap) {
  const items = pieces.map((p, i) => Object.assign({ i }, p)).sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const BW = W + gap, BH = H + gap;
  const bins = [];
  const newBin = () => ({ free: [{ x: 0, y: 0, w: BW, h: BH }], placed: [] });
  function findPos(bin, w, h) {
    let best = null;
    for (const fr of bin.free) {
      for (const [ww, hh, rot] of [[w, h, false], [h, w, true]]) {
        if (ww <= fr.w + 1e-6 && hh <= fr.h + 1e-6) {
          const ss = Math.min(fr.w - ww, fr.h - hh), ls = Math.max(fr.w - ww, fr.h - hh);
          if (!best || ss < best.ss - 1e-9 || (Math.abs(ss - best.ss) < 1e-9 && ls < best.ls)) best = { x: fr.x, y: fr.y, w: ww, h: hh, rot, ss, ls };
        }
      }
    }
    return best;
  }
  function place(bin, r) {
    const out = [];
    for (const fr of bin.free) {
      if (r.x >= fr.x + fr.w || r.x + r.w <= fr.x || r.y >= fr.y + fr.h || r.y + r.h <= fr.y) { out.push(fr); continue; }
      if (r.x > fr.x) out.push({ x: fr.x, y: fr.y, w: r.x - fr.x, h: fr.h });
      if (r.x + r.w < fr.x + fr.w) out.push({ x: r.x + r.w, y: fr.y, w: fr.x + fr.w - r.x - r.w, h: fr.h });
      if (r.y > fr.y) out.push({ x: fr.x, y: fr.y, w: fr.w, h: r.y - fr.y });
      if (r.y + r.h < fr.y + fr.h) out.push({ x: fr.x, y: r.y + r.h, w: fr.w, h: fr.y + fr.h - r.y - r.h });
    }
    bin.free = out.filter((a, i) => !out.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
  }
  for (const it of items) {
    const w = it.w + gap, h = it.h + gap;
    let done = false;
    for (const bin of bins) {
      const pos = findPos(bin, w, h);
      if (pos) { place(bin, pos); bin.placed.push({ x: pos.x, y: pos.y, w: pos.w - gap, h: pos.h - gap, mark: it.mark, rot: pos.rot }); done = true; break; }
    }
    if (!done) {
      const bin = newBin(); bins.push(bin);
      const pos = findPos(bin, w, h);
      if (pos) { place(bin, pos); bin.placed.push({ x: pos.x, y: pos.y, w: pos.w - gap, h: pos.h - gap, mark: it.mark, rot: pos.rot }); }
      else bin.placed.push({ x: 0, y: 0, w: it.w, h: it.h, mark: it.mark, oversize: true });
    }
  }
  return bins.map(b => ({ placed: b.placed }));
}
const fmt0 = (v) => Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
const A_SMALL = (P) => P.shs < 30;
function summary(model) {
  const { P, G, parts } = model;
  const b = bom(model);
  const cuts = [];
  for (const r of b) if (r.stock && r.stock.startsWith('SHS')) for (let k = 0; k < r.qty; k++) cuts.push({ len: r.size, mark: r.mark });
  const bars = ffd(cuts, P.stockLength, P.kerf);
  const shsMetres = cuts.reduce((a, c) => a + c.len, 0) / 1000;
  const sheetGroups = {};
  for (const r of b) {
    if (!Array.isArray(r.size)) continue;
    const key = r.stock;
    sheetGroups[key] = sheetGroups[key] || [];
    for (let k = 0; k < r.qty; k++) sheetGroups[key].push({ w: r.size[0], h: r.size[1], mark: r.mark });
  }
  const nests = {};
  for (const [k, pcs] of Object.entries(sheetGroups)) nests[k] = nest(pcs, P.sheetW, P.sheetH, k.startsWith('Weldmesh') ? P.meshPitch : 5);
  const m = masses(model);
  const mods = Object.keys(m).filter(k => k !== 'J');
  let xmin = 0, xmax = P.width;
  for (const p of parts) for (const s of p.solids) for (const l of s.loops) for (const seg of l) {
    for (const q of [seg.a, seg.b]) for (const w of [0, s.len]) { const v = to3(s, q, w); xmin = Math.min(xmin, v[0]); xmax = Math.max(xmax, v[0]); }
  }
  const warnings = [];
  const total = G.Ltot;
  if (total > P.trayLength + 0.5) warnings.push({ level: 'bad', text: `The cages are ${fmt0(total)} long, ${fmt0(total - P.trayLength)} more than the tray length you entered.` });
  const stickOut = Math.max(-xmin, xmax - P.width);
  const sideRoom = (P.trayWidth - P.width) / 2;
  if (sideRoom < 0) warnings.push({ level: 'bad', text: `The cages are ${Math.round(-2 * sideRoom)} wider than the tray.` });
  else if (sideRoom < stickOut) warnings.push({ level: 'warn', text: `Hinges and latches stick out ${Math.round(stickOut)} past the cage ends but only ${Math.round(sideRoom)} is left to the tray edge.` });
  if (P.joinBoltsDropped) warnings.push({ level: 'warn', text: 'No room for join bolts between the roof bars, so the rows are not bolted together. Use fewer roof bars or clamp the rows.' });
  if (P.holePitchWanted) warnings.push({ level: 'warn', text: `Air holes spaced at ${Math.round(P.holePitch)} instead of ${Math.round(P.holePitchWanted)}, to keep the hole count under ${MAX_HOLES}.` });
  if (G.hingeReach < 1) warnings.push({ level: 'warn', text: `The ${G.hingeD} mm hinge barrels barely reach past the tube corners with a ${P.doorGap} mm door gap. Use a smaller gap or bigger hinges.` });
  for (const side of ['L', 'R']) for (let r = 0; r < P.rows - 1; r++) {
    if (P.hinges[r][side] === 'rear' && P.hinges[r + 1][side] === 'front')
      warnings.push({ level: 'warn', text: `Rows ${String.fromCharCode(65 + r)} and ${String.fromCharCode(66 + r)} ${side === 'L' ? 'left' : 'right'} doors hinge at the same joint. Their latches hit if both are open, so open one at a time.` });
  }
  const halves = parts.filter(p => p.mark === 'T6').length;
  if (halves) warnings.push({ level: A_SMALL(P) ? 'warn' : 'info', text: `${halves} latch keepers sit on shared posts, where each gets half the post (${G.halfKeeper} mm) because both neighbouring doors use that post.` + (A_SMALL(P) ? ' Use 30 SHS or bigger for a firmer latch.' : '') });
  if (P.joinBolts && P.rows > 1 && P.joinBoltMoved) warnings.push({ level: 'warn', text: `Join bolts moved to ${Math.round(P.joinBoltInset)} from the sides so they miss the roof bars.` });
  if (P.shsTWanted) warnings.push({ level: 'warn', text: `${P.shs} x ${P.shs} SHS is limited to ${P.shsT.toFixed(1)} wall here, so bolt holes fit its flat faces.` });
  if (P.trayBolts && G.trayBoltJoist !== null && !G.crush) warnings.push({ level: 'warn', text: `No crush tube fits inside ${P.shs} x ${P.shs} x ${P.shsT.toFixed(1)} SHS, so the M${G.trayBoltD} tray bolts go straight through the joist. Don't over-tighten them.` });
  if (P.trayBolts && G.trayBoltJoist === null) warnings.push({ level: 'warn', text: 'With no floor joists there is nothing for the tray bolts to pass through, so none are drawn. Add a joist or plan other tie-downs.' });
  if (G.clearPastDoor < 380) warnings.push({ level: 'warn', text: `Door opening is only about ${Math.round(G.clearPastDoor)} wide past the open door.` });
  if (G.clearH < 600) warnings.push({ level: 'warn', text: `Clear height inside is ${Math.round(G.clearH)}. Check your dogs can stand with their heads up.` });
  if (G.clearL < 650) warnings.push({ level: 'warn', text: `Each compartment is only ${Math.round(G.clearL)} long inside.` });
  for (const r of b) if ((r.mark === 'S5' || r.mark === 'S6') && r.holes === 0) warnings.push({ level: 'warn', text: `No air holes fit in ${r.mark} panels with this hole size, pitch and margin.` });
  for (const k of Object.keys(nests)) for (const s of nests[k]) for (const pl of s.placed) if (pl.oversize) warnings.push({ level: 'warn', text: `A ${pl.mark} panel is bigger than a ${P.sheetW} x ${P.sheetH} sheet; it will need joining or a larger sheet.` });
  // materials: mass by material, and the same design all in steel or all in aluminium
  const byMat = {};
  let vMetal = 0, other = 0;
  for (const p of parts) {
    byMat[p.material] = (byMat[p.material] || 0) + partMass(p);
    if (p.material === 'steel' || p.material === 'aluminium' || p.material === 'stainless') vMetal += partVolume(p) * (p.massFactor || 1); else other += partMass(p);
  }
  const massIf = { steel: vMetal * MATERIALS.steel.density + other, aluminium: vMetal * MATERIALS.aluminium.density + other };
  const I = (a, t) => (Math.pow(a, 4) - Math.pow(a - 2 * t, 4)) / 12, area = (a, t) => a * a - (a - 2 * t) * (a - 2 * t);
  let frameAdvice = null;
  if (P.frameMat === 'aluminium') {
    // compare bending stiffness (E x I) with the original 25 x 25 x 2.0 steel frame
    const ref = MATERIALS.steel.E * I(DEFAULTS.shs, DEFAULTS.shsT);
    const pct = Math.round(100 * MATERIALS.aluminium.E * I(P.shs, P.shsT) / ref);
    for (const a of SHS_SIZES) for (const t of SHS_WALLS) {
      if (t < 2 || MATERIALS.aluminium.E * I(a, t) < ref * 0.97) continue;
      if (!frameAdvice || area(a, t) < frameAdvice.area) frameAdvice = { a, t, area: area(a, t) };
    }
    frameAdvice.massPct = Math.round(100 * frameAdvice.area * MATERIALS.aluminium.density / (area(DEFAULTS.shs, DEFAULTS.shsT) * MATERIALS.steel.density));
    frameAdvice.pct = pct;
    const refTxt = `the original ${DEFAULTS.shs} x ${DEFAULTS.shs} x ${DEFAULTS.shsT.toFixed(1)} steel frame`;
    warnings.push({ level: 'info', text: pct >= 95 ? `This aluminium frame is ${pct <= 120 ? 'about as stiff as' : `about ${(pct / 100).toFixed(1)} times as stiff as`} ${refTxt}.`
      : `Aluminium is about a third as stiff as steel: this frame is about ${pct}% as stiff as ${refTxt}. ${frameAdvice.a} x ${frameAdvice.a} x ${frameAdvice.t.toFixed(1)} aluminium would match it at about ${frameAdvice.massPct}% of the steel frame's weight.` });
  }
  if (P.sheetMat === 'aluminium' && P.tFloor < 3) warnings.push({ level: 'info', text: 'Aluminium floors are usually 3.0 or thicker (often tread plate). Thinner sheet flexes and dents under dogs.' });
  if (G.mixed) warnings.push({ level: 'info', text: "Steel and aluminium can't be welded together, so the wall and divider infills become folded trays riveted into the frame, and the floor and roof are riveted down. Use stainless rivets and keep the two metals apart with sealant or tape." });
  const fm = metalOf(P, 'frame'), sm = metalOf(P, 'sheet');
  if (!G.mixed && fm !== sm) warnings.push({ level: 'info', text: 'Stainless and mild steel can be welded together with 309L filler, but the mild steel side will still rust at the welds. Seal or paint those joints.' });
  if (G.shared) warnings.push({ level: 'info', text: `With a shared frame the ${P.rows} rows are one welded frame, ${fmt0(total)} long and about ${Math.round(Object.values(m).reduce((a, c) => a + c, 0))} kg. It saves ${fmt0((P.rows - 1) * P.shs)} of length but can't be split into rows to lift or fit.` });
  if (G.sandwich && P.wallMiddle === 'mesh') warnings.push({ level: 'info', text: "Mesh can't be clamped between two frames, so the mesh between rows is welded into the rear row's frame and the rows bolt straight together." });
  if (G.plateT && G.mixed) warnings.push({ level: 'info', text: 'The sheets between rows touch both metals: put butyl tape on both faces where the frames clamp them.' });
  return {
    bom: b, bars, shsMetres, nests, masses: m, perModule: mods.map(k => m[k]),
    total: Object.values(m).reduce((a, c) => a + c, 0), byMat, massIf, frameAdvice,
    overall: { x0: xmin, x1: xmax, w: P.width, l: total, h: P.height + P.tRoof },
    trayPlan: { headY: total, rearY: total - P.trayLength, spare: P.trayLength - total },
    stickOut, sideRoom, warnings,
  };
}

/* ------------------------------------------------------------------ STEP writer */
function fmtR(x) {
  if (Math.abs(x) < 5e-10) return '0.';
  let s = x.toFixed(6);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '');
  if (s.endsWith('.')) return s;
  return s;
}
function stepString(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '_') + "'"; }

function writeSTEP(model, opts) {
  opts = opts || {};
  const lines = [];
  let id = 0;
  const E = (txt) => { id += 1; lines.push(`#${id} = ${txt};`); return `#${id}`; };
  const dirCache = new Map();
  const D3 = (d) => {
    const k = d.map(x => fmtR(x)).join(',');
    if (!dirCache.has(k)) dirCache.set(k, E(`DIRECTION('',(${k}))`));
    return dirCache.get(k);
  };
  const P3 = (p) => E(`CARTESIAN_POINT('',(${p.map(fmtR).join(',')}))`);
  const AX = (p, axis, ref) => E(`AXIS2_PLACEMENT_3D('',${P3(p)},${D3(axis)},${D3(ref)})`);

  const appCtx = E(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
  const mm = E(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  const rad = E(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`);
  const sr = E(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`);
  const unc = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),${mm},'distance_accuracy_value','confusion accuracy')`);
  const ctx = E(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`);
  const pctx = E(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`);
  const pdctx = E(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`);
  const origin = AX([0, 0, 0], [0, 0, 1], [1, 0, 0]);

  function product(name, desc) {
    const pr = E(`PRODUCT(${stepString(name)},${stepString(name)},${stepString(desc || '')},(${pctx}))`);
    E(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${pr}))`);
    const pdf = E(`PRODUCT_DEFINITION_FORMATION('','',${pr})`);
    const pd = E(`PRODUCT_DEFINITION('design','',${pdf},${pdctx})`);
    const pds = E(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
    return { pd, pds };
  }
  let nauoId = 0;
  function link(parent, child, name) {
    const place = AX([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    parent.extraItems.push(place);
    const idt = E(`ITEM_DEFINED_TRANSFORMATION('','',${origin},${place})`);
    nauoId += 1;
    const nauo = E(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('${nauoId}',${stepString(name)},'',${parent.pd},${child.pd},$)`);
    const pds = E(`PRODUCT_DEFINITION_SHAPE('Placement','Placement of an item',${nauo})`);
    parent.links.push({ child, idt, pds });
  }

  function solid(pr, name) {
    // vertices and edges per loop
    const L = pr.len, n = pr.n;
    const loopsE = pr.loops.map((loop) => {
      const K = loop.length;
      const vb = [], vt = [];
      for (let k = 0; k < K; k++) {
        vb.push(E(`VERTEX_POINT('',${P3(to3(pr, loop[k].a, 0))})`));
        vt.push(E(`VERTEX_POINT('',${P3(to3(pr, loop[k].a, L))})`));
      }
      const eb = [], et = [], ev = [];
      for (let k = 0; k < K; k++) {
        const s = loop[k], k1 = (k + 1) % K;
        for (const [arr, w, va, vb_] of [[eb, 0, vb[k], vb[k1]], [et, L, vt[k], vt[k1]]]) {
          let curve, sense = '.T.';
          if (s.t === 'L') {
            const d3 = dir3(pr, [s.b[0] - s.a[0], s.b[1] - s.a[1]]);
            const len = Math.hypot(...d3);
            curve = E(`LINE('',${P3(to3(pr, s.a, w))},${E(`VECTOR('',${D3(norm(d3))},${fmtR(len)})`)})`);
          } else {
            const ref = norm(dir3(pr, [s.a[0] - s.c[0], s.a[1] - s.c[1]]));
            curve = E(`CIRCLE('',${AX(to3(pr, s.c, w), n, ref)},${fmtR(s.r)})`);
            sense = s.ccw ? '.T.' : '.F.';
          }
          arr.push(E(`EDGE_CURVE('',${va},${vb_},${curve},${sense})`));
        }
        ev.push(E(`EDGE_CURVE('',${vb[k]},${vt[k]},${E(`LINE('',${P3(to3(pr, loop[k].a, 0))},${E(`VECTOR('',${D3(n)},${fmtR(L)})`)})`)},.T.)`));
      }
      return { K, eb, et, ev };
    });
    const faces = [];
    const OE = (e, o) => E(`ORIENTED_EDGE('',*,*,${e},${o ? '.T.' : '.F.'})`);
    // wall holes: grouped per face
    const extraBounds = new Map(); // key 'li:k' -> [bound ids]
    const holeFaces = [];
    for (const hh of pr.holes) {
      const sA = pr.loops[hh.li][hh.k], sB = pr.loops[hh.lj][hh.m];
      const d2 = [sA.b[0] - sA.a[0], sA.b[1] - sA.a[1]], l2 = Math.hypot(d2[0], d2[1]);
      const p2 = [sA.a[0] + d2[0] / l2 * hh.s, sA.a[1] + d2[1] / l2 * hh.s];
      const cA = to3(pr, p2, hh.w);
      const nA = dir3(pr, rightNormal2(sA)); // outward of face A
      const a = mul(nA, -1);                   // hole axis into the material
      const t = wallDepth(pr, sA, sB);
      const cB = add(cA, mul(a, t));
      const e1 = n, e2 = cross(a, e1), r = hh.d / 2;
      const VA0 = E(`VERTEX_POINT('',${P3(add(cA, mul(e1, r)))})`), VA1 = E(`VERTEX_POINT('',${P3(add(cA, mul(e1, -r)))})`);
      const VB0 = E(`VERTEX_POINT('',${P3(add(cB, mul(e1, r)))})`), VB1 = E(`VERTEX_POINT('',${P3(add(cB, mul(e1, -r)))})`);
      const cirA = E(`CIRCLE('',${AX(cA, a, e1)},${fmtR(r)})`), cirB = E(`CIRCLE('',${AX(cB, a, e1)},${fmtR(r)})`);
      const SA0 = E(`EDGE_CURVE('',${VA0},${VA1},${cirA},.T.)`), SA1 = E(`EDGE_CURVE('',${VA1},${VA0},${cirA},.T.)`);
      const SB0 = E(`EDGE_CURVE('',${VB0},${VB1},${cirB},.T.)`), SB1 = E(`EDGE_CURVE('',${VB1},${VB0},${cirB},.T.)`);
      const L0 = E(`EDGE_CURVE('',${VA0},${VB0},${E(`LINE('',${P3(add(cA, mul(e1, r)))},${E(`VECTOR('',${D3(a)},${fmtR(t)})`)})`)},.T.)`);
      const L1 = E(`EDGE_CURVE('',${VA1},${VB1},${E(`LINE('',${P3(add(cA, mul(e1, -r)))},${E(`VECTOR('',${D3(a)},${fmtR(t)})`)})`)},.T.)`);
      const kA = `${hh.li}:${hh.k}`, kB = `${hh.lj}:${hh.m}`;
      if (!extraBounds.has(kA)) extraBounds.set(kA, []);
      if (!extraBounds.has(kB)) extraBounds.set(kB, []);
      extraBounds.get(kA).push(E(`FACE_BOUND('',${E(`EDGE_LOOP('',(${OE(SA0, 1)},${OE(SA1, 1)}))`)},.T.)`));
      extraBounds.get(kB).push(E(`FACE_BOUND('',${E(`EDGE_LOOP('',(${OE(SB1, 0)},${OE(SB0, 0)}))`)},.T.)`));
      const cyl = E(`CYLINDRICAL_SURFACE('',${AX(cA, a, e1)},${fmtR(r)})`);
      holeFaces.push(E(`ADVANCED_FACE('',(${E(`FACE_OUTER_BOUND('',${E(`EDGE_LOOP('',(${OE(SA1, 0)},${OE(L1, 1)},${OE(SB1, 1)},${OE(L0, 0)}))`)},.T.)`)}),${cyl},.F.)`));
      holeFaces.push(E(`ADVANCED_FACE('',(${E(`FACE_OUTER_BOUND('',${E(`EDGE_LOOP('',(${OE(SA0, 0)},${OE(L0, 1)},${OE(SB0, 1)},${OE(L1, 0)}))`)},.T.)`)}),${cyl},.F.)`));
    }
    // side faces
    pr.loops.forEach((loop, li) => {
      const { K, eb, et, ev } = loopsE[li];
      for (let k = 0; k < K; k++) {
        const s = loop[k], k1 = (k + 1) % K;
        const lp = E(`EDGE_LOOP('',(${OE(eb[k], 1)},${OE(ev[k1], 1)},${OE(et[k], 0)},${OE(ev[k], 0)}))`);
        const bounds = [E(`FACE_OUTER_BOUND('',${lp},.T.)`)].concat(extraBounds.get(`${li}:${k}`) || []);
        let surf, sense = '.T.';
        if (s.t === 'L') {
          const d3 = norm(dir3(pr, [s.b[0] - s.a[0], s.b[1] - s.a[1]]));
          const nrm = dir3(pr, rightNormal2(s));
          surf = E(`PLANE('',${AX(to3(pr, s.a, 0), nrm, d3)})`);
        } else {
          const ref = norm(dir3(pr, [s.a[0] - s.c[0], s.a[1] - s.c[1]]));
          surf = E(`CYLINDRICAL_SURFACE('',${AX(to3(pr, s.c, 0), n, ref)},${fmtR(s.r)})`);
          sense = s.ccw ? '.T.' : '.F.';
        }
        faces.push(E(`ADVANCED_FACE('',(${bounds.join(',')}),${surf},${sense})`));
      }
    });
    // bottom (normal -n) and top (+n)
    const botB = [], topB = [];
    pr.loops.forEach((loop, li) => {
      const { K, eb, et } = loopsE[li];
      const rb = [], rt = [];
      for (let k = K - 1; k >= 0; k--) rb.push(OE(eb[k], 0));
      for (let k = 0; k < K; k++) rt.push(OE(et[k], 1));
      const kind = li === 0 ? 'FACE_OUTER_BOUND' : 'FACE_BOUND';
      botB.push(E(`${kind}('',${E(`EDGE_LOOP('',(${rb.join(',')}))`)},.T.)`));
      topB.push(E(`${kind}('',${E(`EDGE_LOOP('',(${rt.join(',')}))`)},.T.)`));
    });
    faces.push(E(`ADVANCED_FACE('',(${botB.join(',')}),${E(`PLANE('',${AX(pr.o, mul(n, -1), pr.u)})`)},.T.)`));
    faces.push(E(`ADVANCED_FACE('',(${topB.join(',')}),${E(`PLANE('',${AX(add(pr.o, mul(n, L)), n, pr.u)})`)},.T.)`));
    const shell = E(`CLOSED_SHELL('',(${faces.concat(holeFaces).join(',')}))`);
    return E(`MANIFOLD_SOLID_BREP(${stepString(name)},${shell})`);
  }

  const colourCache = new Map();
  function styleFor(rgb) {
    const k = rgb.join(',');
    if (!colourCache.has(k)) {
      const col = E(`COLOUR_RGB('',${rgb.map(fmtR).join(',')})`);
      const fasc = E(`FILL_AREA_STYLE_COLOUR('',${col})`);
      const fas = E(`FILL_AREA_STYLE('',(${fasc}))`);
      const ssfa = E(`SURFACE_STYLE_FILL_AREA(${fas})`);
      const sss = E(`SURFACE_SIDE_STYLE('',(${ssfa}))`);
      const ssu = E(`SURFACE_STYLE_USAGE(.BOTH.,${sss})`);
      colourCache.set(k, ssu);
    }
    return colourCache.get(k);
  }

  const rootName = opts.name || `UTE_DOG_CAGES_${model.P.rows}x2`;
  const rootNode = Object.assign(product(rootName), { extraItems: [], links: [] });
  const groups = new Map();
  for (const p of model.parts) {
    const g = p.module === 'J' ? 'BETWEEN_ROWS' : `MODULE_${p.module}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  const styled = [];
  const repFinal = [];
  const usedNames = new Set();
  for (const [gname, plist] of groups) {
    const gNode = Object.assign(product(gname), { extraItems: [], links: [] });
    link(rootNode, gNode, gname);
    for (const p of plist) {
      let nm = p.name.replace(/[()]/g, '').replace(/\s+/g, '_');
      let base = nm, k = 2;
      while (usedNames.has(nm)) nm = `${base}_${k++}`;
      usedNames.add(nm);
      const pNode = Object.assign(product(nm, [p.stock, materialText(p, model.P)].filter(Boolean).join(', ')), { extraItems: [], links: [] });
      const breps = p.solids.map((s, si) => solid(s, p.solids.length > 1 ? `${nm}_${si + 1}` : nm));
      const rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${[origin].concat(breps).join(',')}),${ctx})`);
      E(`SHAPE_DEFINITION_REPRESENTATION(${pNode.pds},${rep})`);
      pNode.rep = rep;
      const ssu = styleFor(colourOf(p));
      const items = breps.map(b => E(`STYLED_ITEM('color',(${E(`PRESENTATION_STYLE_ASSIGNMENT((${ssu}))`)}),${b})`));
      styled.push(...items);
      link(gNode, pNode, nm);
    }
    repFinal.push(gNode);
  }
  // assembly representations (need their placement items)
  function finishAssembly(node) {
    const rep = E(`SHAPE_REPRESENTATION('',(${[origin].concat(node.extraItems).join(',')}),${ctx})`);
    E(`SHAPE_DEFINITION_REPRESENTATION(${node.pds},${rep})`);
    node.rep = rep;
  }
  for (const g of repFinal) finishAssembly(g);
  finishAssembly(rootNode);
  function writeLinks(node) {
    for (const lk of node.links) {
      const rel = E(`( REPRESENTATION_RELATIONSHIP('','',${lk.child.rep},${node.rep}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${lk.idt}) SHAPE_REPRESENTATION_RELATIONSHIP() )`);
      E(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${rel},${lk.pds})`);
    }
  }
  writeLinks(rootNode);
  for (const g of repFinal) writeLinks(g);
  if (styled.length) E(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.join(',')}),${ctx})`);

  const ts = opts.timestamp || new Date().toISOString().slice(0, 19);
  const head = [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('Ute dog cages, parametric'),'2;1');",
    `FILE_NAME(${stepString(rootName + '.step')},'${ts}',('Ute dog cage configurator'),(''),'cage-step-writer 1.0','cage-step-writer 1.0','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;'];
  return head.concat(lines, ['ENDSEC;', 'END-ISO-10303-21;']).join('\n') + '\n';
}

const api = { DEFAULTS, MATERIALS, MAT_DEFAULTS, KINDS, ROW_JOINS, TREAD_MASS, SHS_SIZES, SHS_WALLS, kindOf, metalOf, gradeText, faceSpec, partMaterial, partFinish, materialText, colourOf,
  partVolume, normParams, derived, build, bom, masses, summary, writeSTEP, partMass, prismVolume, wirePositions, holeGrid,
  loopPolyline, loopArea, to3, rowLabel, COLORS, FINISH_COLORS, HINGE_D, HINGE_L, HINGE_END, LATCH, DENSITY, ffd, nest };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.CageCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
