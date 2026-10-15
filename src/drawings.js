/* A3 drawing set generator (jsPDF). Paper coordinates are mm with y UP from the
   bottom-left corner of the sheet; the helpers flip to jsPDF's y-down. */
(function (root) {
'use strict';
const C = root.CageCore, V = root.CageViewer;
const PW = 420, PH = 297;
const INK = [27, 29, 33], GREY = [107, 114, 128], LIGHT = [209, 213, 219], FAINT = [238, 240, 243];
const ACC = [180, 83, 9], WHITE = [255, 255, 255], YEL = [233, 185, 73], YEL2 = [246, 220, 140];
const MARK_RGB = { F1: [47, 111, 219], F1H: [122, 79, 216], F2: [22, 154, 140], F3: [224, 138, 30], F3H: [212, 61, 61], D1: [44, 46, 51], D2: [44, 46, 51] };
const LW_VIS = 0.30, LW_THIN = 0.13, LW_DIM = 0.12;

const f0 = (v) => Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
const STD = [2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];
function pickScale(fits, list) { for (const s of (list || STD)) if (fits(s)) return s; return (list || STD)[(list || STD).length - 1]; }
const wallName = { solid: 'solid sheet', perforated: 'sheet with air holes', mesh: 'weldmesh' };
const wallShort = { solid: 'solid sheet', perforated: 'air holes', mesh: 'weldmesh' };
// material words: which = 'frame' | 'sheet'
const metalWord = (P, which) => ({ steel: 'steel', aluminium: 'aluminium', stainless: 'stainless' })[C.metalOf(P, which)];
const metalShort = (P, which) => ({ steel: 'steel', aluminium: 'alum.', stainless: 'st. st.' })[C.metalOf(P, which)];
const gradeOf = (P, which) => C.kindOf(P, which).grade;
const matShortOf = (m) => ({ steel: 'steel', aluminium: 'alum.', stainless: 'st. st.' })[m] || m;
// extent of row i along the ute between joint centre lines (for schematics and tags)
const rowExt = (G, i) => [i ? G.joints[i - 1] : 0, i < G.N - 1 ? G.joints[i] : G.Ltot];
// what closes a row's face, in words for schedules
function faceText(P, G, i, face) {
  const N = P.rows;
  const outer = (face === 'rear' && i === 0) || (face === 'front' && i === N - 1);
  if (outer) return wallName[face === 'rear' ? P.wallRear : P.wallFront];
  const t = P.wallMiddle, spec = C.faceSpec(P, G, i, face);
  const other = C.rowLabel(face === 'rear' ? i - 1 : i + 1, N);
  if (!spec) return G.sandwich && t !== 'mesh' ? `${wallShort[t]}, clamped` : `(row ${other}'s wall)`;
  if (spec.style === 'centre') return `${wallShort[t]}, on rail centre`;
  return wallName[t];
}
// overall length chain: rows abut (separate), a sheet between them (sandwich) or share a rail (shared)
function rowDims(v, G, off, orient, at, o) {
  if (G.shared) { v.chain([0].concat(G.joints, [G.Ltot]).map(at), off, orient, o); return; }
  // a sheet between rows leaves a gap too thin to dimension: one extension line serves both rows
  for (let i = 0; i < G.N; i++) v.dim(at(G.rowY[i]), at(G.rowY[i] + G.D), off, orient, undefined, Object.assign({}, o || {}, i > 0 && G.plateT ? { noExtModel: [at(G.rowY[i])] } : {}));
}

/* ------------------------------------------------------------------ sheet */
function Sheet(doc, num, total, title, scale, info) {
  const s = { doc };
  const Y = (y) => PH - y;
  s.color = (c, kind) => { if (kind === 'fill') doc.setFillColor(c[0], c[1], c[2]); else if (kind === 'text') doc.setTextColor(c[0], c[1], c[2]); else doc.setDrawColor(c[0], c[1], c[2]); };
  s.dash = (on) => { if (doc.setLineDashPattern) doc.setLineDashPattern(on || [], 0); };
  s.font = (size, weight) => { doc.setFont('helvetica', weight === 'bold' ? 'bold' : 'normal'); doc.setFontSize(size); };
  s.tw = (str, size, weight) => { s.font(size, weight); return doc.getTextWidth(String(str)); };
  s.text = (x, y, str, o) => {
    o = o || {};
    s.font(o.size || 7, o.weight);
    s.color(o.color || INK, 'text');
    const opt = { align: o.ha || 'left', baseline: o.va || 'alphabetic' };
    if (o.box) {
      const w = doc.getTextWidth(String(str)), h = (o.size || 7) / 2.835 * 0.8;
      let x0 = o.ha === 'right' ? x - w : o.ha === 'center' ? x - w / 2 : x;
      const yc = o.va === 'middle' ? y : y + h / 2;
      s.rect(x0 - 0.8, yc - h / 2 - 0.7, w + 1.6, h + 1.4, { fill: WHITE, lw: 0 });
      s.font(o.size || 7, o.weight); s.color(o.color || INK, 'text');
    }
    doc.text(String(str), x, Y(y), opt);
  };
  s.vtext = (x, y, str, o) => { // vertical, reading upward, centred on y, glyphs left of x
    o = o || {};
    s.font(o.size || 7, o.weight); s.color(o.color || INK, 'text');
    const w = doc.getTextWidth(String(str));
    doc.text(String(str), x, Y(y - w / 2), { angle: 90 });
  };
  s.line = (xs, ys, o) => {
    o = o || {};
    doc.setLineWidth(o.lw === undefined ? LW_THIN : o.lw);
    s.color(o.color || INK);
    s.dash(o.dash);
    for (let i = 0; i < xs.length - 1; i++) doc.line(xs[i], Y(ys[i]), xs[i + 1], Y(ys[i + 1]));
    if (o.dash) s.dash(null);
  };
  s.poly = (pts, o) => s.line(pts.map(p => p[0]), pts.map(p => p[1]), o);
  s.rect = (x, y, w, h, o) => {
    o = o || {};
    const st = o.fill && (o.lw === 0 || o.noStroke) ? 'F' : o.fill ? 'FD' : 'S';
    if (o.fill) s.color(o.fill, 'fill');
    doc.setLineWidth(o.lw === undefined || o.lw === 0 ? (o.lw === 0 ? 0.01 : LW_THIN) : o.lw);
    s.color(o.color || INK);
    if (o.dash) s.dash(o.dash);
    doc.rect(x, Y(y + h), w, h, st);
    if (o.dash) s.dash(null);
  };
  s.circle = (x, y, r, o) => {
    o = o || {};
    if (o.fill) s.color(o.fill, 'fill');
    doc.setLineWidth(o.lw === undefined ? LW_THIN : o.lw);
    s.color(o.color || INK);
    doc.circle(x, Y(y), r, o.fill ? (o.lw === 0 ? 'F' : 'FD') : 'S');
  };
  s.image = (url, x, y, w, h) => doc.addImage(url, 'JPEG', x, Y(y + h), w, h, undefined, 'FAST');
  s.arrow = (tip, dir, o) => {
    o = o || {};
    const L = o.L || 2.2, W = o.W || 0.62;
    const l = Math.hypot(dir[0], dir[1]), d = [dir[0] / l, dir[1] / l], n = [-d[1], d[0]];
    const b = [tip[0] - d[0] * L, tip[1] - d[1] * L];
    s.color(o.color || INK, 'fill'); s.color(o.color || INK);
    doc.setLineWidth(0.01);
    doc.triangle(tip[0], Y(tip[1]), b[0] + n[0] * W, Y(b[1] + n[1] * W), b[0] - n[0] * W, Y(b[1] - n[1] * W), 'F');
  };
  s.dim = (p1, p2, at, orient, text, o) => {
    o = o || {};
    const size = o.size || 6.6, col = o.color || INK, gap = 1.2, over = 1.6;
    const tw = s.tw(text, size) + 1.2;
    // o.noExt: paper points where a neighbouring dimension already drew the extension line
    const skip = (p) => (o.noExt || []).some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05);
    if (orient === 'h') {
      const [a, b] = p1[0] <= p2[0] ? [p1, p2] : [p2, p1];
      for (const p of [a, b]) { if (skip(p)) continue; const sg = Math.sign(at - p[1]) || 1; s.line([p[0], p[0]], [p[1] + sg * gap, at + sg * over], { lw: LW_DIM, color: col }); }
      s.line([a[0], b[0]], [at, at], { lw: LW_DIM, color: col });
      const L = b[0] - a[0];
      if (L > 5.4) { s.arrow([a[0], at], [-1, 0], { color: col }); s.arrow([b[0], at], [1, 0], { color: col }); }
      else { s.arrow([a[0], at], [1, 0], { color: col }); s.arrow([b[0], at], [-1, 0], { color: col }); s.line([a[0] - 3.5, a[0]], [at, at], { lw: LW_DIM, color: col }); s.line([b[0], b[0] + 3.5], [at, at], { lw: LW_DIM, color: col }); }
      if (L >= tw + 1) s.text((a[0] + b[0]) / 2, at + 0.75, text, { size, ha: 'center', color: col });
      else if (o.side === 'start') s.text(a[0] - (L > 5.4 ? 1.5 : 4.2), at - 0.2, text, { size, va: 'middle', ha: 'right', color: col });
      else if (o.side === 'over') s.text((a[0] + b[0]) / 2, at + 2.2, text, { size, ha: 'center', color: col });
      else s.text(b[0] + (L > 5.4 ? 1.5 : 4.2), at - 0.2, text, { size, va: 'middle', color: col });
    } else {
      const [a, b] = p1[1] <= p2[1] ? [p1, p2] : [p2, p1];
      for (const p of [a, b]) { if (skip(p)) continue; const sg = Math.sign(at - p[0]) || 1; s.line([p[0] + sg * gap, at + sg * over], [p[1], p[1]], { lw: LW_DIM, color: col }); }
      s.line([at, at], [a[1], b[1]], { lw: LW_DIM, color: col });
      const L = b[1] - a[1];
      if (L > 5.4) { s.arrow([at, a[1]], [0, -1], { color: col }); s.arrow([at, b[1]], [0, 1], { color: col }); }
      else { s.arrow([at, a[1]], [0, 1], { color: col }); s.arrow([at, b[1]], [0, -1], { color: col }); s.line([at, at], [a[1] - 3.5, a[1]], { lw: LW_DIM, color: col }); s.line([at, at], [b[1], b[1] + 3.5], { lw: LW_DIM, color: col }); }
      if (L >= tw + 1) s.vtext(at - 0.75, (a[1] + b[1]) / 2, text, { size, color: col });
      else if (o.side === 'start') s.vtext(at - 0.75, a[1] - 3.5 - tw / 2, text, { size, color: col });
      else if (o.side === 'over') s.vtext(at - 2.2, (a[1] + b[1]) / 2, text, { size, color: col });
      else s.vtext(at - 0.75, b[1] + 3.5 + tw / 2, text, { size, color: col });
    }
  };
  s.leader = (target, at, text, o) => {
    o = o || {};
    const size = o.size || 6.2, col = o.color || INK;
    const ha = o.ha || (at[0] >= target[0] ? 'left' : 'right');
    const land = o.landing === undefined ? 2.5 : o.landing;
    const end = [at[0] + (ha === 'left' ? land : -land), at[1]];
    s.poly([target, at, end], { lw: LW_DIM, color: col });
    s.circle(target[0], target[1], 0.5, { fill: col, lw: 0 });
    s.text(end[0] + (ha === 'left' ? 0.8 : -0.8), end[1], text, { size, va: 'middle', ha, color: col, box: o.box, weight: o.weight });
  };
  s.balloon = (target, at, label, chip) => {
    const r = 3.4;
    const d = [target[0] - at[0], target[1] - at[1]], l = Math.hypot(d[0], d[1]);
    if (l > r) { s.line([at[0] + d[0] / l * r, target[0]], [at[1] + d[1] / l * r, target[1]], { lw: LW_DIM }); s.circle(target[0], target[1], 0.55, { fill: INK, lw: 0 }); }
    s.circle(at[0], at[1], r, { fill: chip || WHITE, lw: 0.25 });
    s.text(at[0], at[1] - 0.1, label, { size: 6.2, ha: 'center', va: 'middle', weight: 'bold', color: chip ? WHITE : INK });
  };
  s.heading = (x, y, t, sub) => { s.text(x, y, t, { size: 9, weight: 'bold' }); if (sub) s.text(x, y - 4.2, sub, { size: 6.2, color: GREY }); };
  s.viewLabel = (x, y, t, sub) => { s.text(x, y, t, { size: 8.5, weight: 'bold', ha: 'center' }); if (sub) s.text(x, y - 4, sub, { size: 6.2, color: GREY, ha: 'center' }); };
  s.wrap = (str, width, size) => {
    const words = String(str).split(/\s+/); const out = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (s.tw(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur);
    return out;
  };
  s.para = (x, y, lines, o) => {
    o = o || {};
    const size = o.size || 6.4, lead = (o.lead || 1.42) * size / 2.835;
    for (const ln of lines) {
      if (ln.startsWith('##')) { y -= lead * 0.35; s.text(x, y, ln.slice(2).trim(), { size: size + 0.6, weight: 'bold', color: o.color }); y -= lead * 1.05; continue; }
      s.text(x, y, ln, { size, color: o.color || INK });
      y -= lead;
    }
    return y;
  };
  s.numbered = (x, y, items, width, o) => { // auto-wrapped numbered list
    o = o || {};
    const size = o.size || 6.2, lead = 1.42 * size / 2.835;
    items.forEach((it, i) => {
      const lines = s.wrap(it, width - 5, size);
      s.text(x, y, String(i + 1 + (o.start || 0)), { size, color: o.numColor || INK });
      lines.forEach((ln, k) => { s.text(x + 5, y, ln, { size, color: o.color || INK }); y -= lead; });
    });
    return y;
  };
  s.table = (x, y, cols, rows, o) => {
    o = o || {};
    const rh = o.rowH || 4.5, size = o.size || 6.2, hsize = o.hsize || 5.8;
    const tw = cols.reduce((a, c) => a + c[1], 0);
    let yy = y;
    if (o.header !== false) {
      s.rect(x, yy - rh, tw, rh, { fill: INK, lw: 0 });
      let cx = x;
      for (const [t, w, al] of cols) {
        const tx = cx + (al === 'left' ? 1.6 : al === 'right' ? w - 1.6 : w / 2);
        s.text(tx, yy - rh / 2, t, { size: hsize, color: WHITE, ha: al, va: 'middle', weight: 'bold' });
        cx += w;
      }
      yy -= rh;
    }
    rows.forEach((r, i) => {
      if (i % 2 === 1) s.rect(x, yy - rh, tw, rh, { fill: FAINT, lw: 0 });
      let cx = x;
      const last = o.boldLast && i === rows.length - 1;
      cols.forEach(([t, w, al], j) => {
        const val = r[j];
        if (o.chipCol === j) { if (val) s.rect(cx + w / 2 - 2, yy - rh / 2 - 1.3, 4, 2.6, { fill: val, lw: 0 }); }
        else {
          const tx = cx + (al === 'left' ? 1.6 : al === 'right' ? w - 1.6 : w / 2);
          let str = val === undefined || val === null ? '' : String(val);
          while (str.length > 3 && s.tw(str, size, last ? 'bold' : null) > w - 2.4) str = str.slice(0, -2) + '.';
          s.text(tx, yy - rh / 2, str, { size, ha: al, va: 'middle', weight: last ? 'bold' : null });
        }
        cx += w;
      });
      yy -= rh;
    });
    s.line([x, x + tw], [yy, yy], { lw: LW_THIN });
    return yy;
  };
  s.titleBlock = () => {
    const x0 = 262, y0 = 8, w = 150, h = 30;
    s.rect(x0, y0, w, h, { fill: WHITE, lw: 0.5 });
    s.line([x0, x0 + w], [y0 + 12, y0 + 12], { lw: LW_THIN });
    const xs = [x0, x0 + 30, x0 + 60, x0 + 85, x0 + 120];
    for (const xx of xs.slice(1)) s.line([xx, xx], [y0, y0 + 12], { lw: LW_THIN });
    s.text(x0 + 3, y0 + h - 6.2, info.project, { size: 9.5, weight: 'bold' });
    s.text(x0 + 3, y0 + h - 12.6, title, { size: 8.2 });
    const cells = [['SHEET', `${num} of ${total}`], ['SCALE', scale], ['UNITS', 'mm'], ['DATE', info.date], ['REV', 'A']];
    cells.forEach(([lab, val], i) => { s.text(xs[i] + 2, y0 + 8.3, lab, { size: 5.2, color: GREY }); s.text(xs[i] + 2, y0 + 2.7, val, { size: 7.4 }); });
  };
  s.finish = () => { doc.setLineWidth(0.5); s.color(INK); doc.rect(8, 8, PW - 16, PH - 16, 'S'); s.titleBlock(); };
  if (num > 1) doc.addPage('a3', 'landscape');
  CUR = s;
  return s;
}
let CUR = null; // sheet being drawn; make() finishes it (border + title block on top of everything)

/* view mapping: model point -> paper */
function View(sheet, view, scale, paperXY, refUV) {
  const k = 1 / scale;
  const v = { sheet, view, scale, k };
  v.uv = (p) => V.to2d(p, view);
  v.P = (p) => { const q = v.uv(p); return [paperXY[0] + (q[0] - refUV[0]) * k, paperXY[1] + (q[1] - refUV[1]) * k]; };
  v.Puv = (q) => [paperXY[0] + (q[0] - refUV[0]) * k, paperXY[1] + (q[1] - refUV[1]) * k];
  v.image = (img) => {
    const [u0, u1, v0, v1] = img.extent;
    const a = v.Puv([u0, v0]), b = v.Puv([u1, v1]);
    sheet.image(img.url, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  };
  v.dim = (p1, p2, off, orient, text, o) => {
    const a = v.P(p1), b = v.P(p2);
    if (o && o.noExtModel) o = Object.assign({}, o, { noExt: o.noExtModel.map(v.P) });
    if (text === undefined || text === null) text = f0(Math.abs(orient === 'h' ? b[0] - a[0] : b[1] - a[1]) * scale);
    sheet.dim(a, b, (orient === 'h' ? a[1] : a[0]) + off, orient, text, o);
  };
  // chain of dimensions through model points; short end segments put their text outside the chain
  v.chain = (pts, off, orient, o) => {
    const P2 = pts.map(v.P).map((q, i) => [q, pts[i]]).sort((x, y) => orient === 'h' ? x[0][0] - y[0][0] : x[0][1] - y[0][1]).map(x => x[1]);
    for (let i = 0; i < P2.length - 1; i++) {
      const side = i === 0 ? 'start' : i === P2.length - 2 ? 'end' : 'over';
      v.dim(P2[i], P2[i + 1], off, orient, undefined, Object.assign({ side }, o || {}));
    }
  };
  // projected rectangle of a 3D box [x0,y0,z0,x1,y1,z1]
  v.boxRect = (bx, o) => {
    const pts = [[bx[0], bx[1], bx[2]], [bx[3], bx[4], bx[5]]].map(v.P);
    const x0 = Math.min(pts[0][0], pts[1][0]), x1 = Math.max(pts[0][0], pts[1][0]);
    const y0 = Math.min(pts[0][1], pts[1][1]), y1 = Math.max(pts[0][1], pts[1][1]);
    sheet.rect(x0, y0, x1 - x0, y1 - y0, o || { lw: LW_VIS });
    return [x0, y0, x1, y1];
  };
  return v;
}
function pbox(p) { const b = V.partBox(p); return b; }

/* Label placement on a rendered image (pixel coordinates, y down). Each item is
   {a: anchor [x,y], w, h: label box size, kind: 'balloon'|'text'}. Candidates on rings
   round the anchor are scored for drawing underneath, clashes with labels already
   placed, crossing leaders and leader length. Writes it.c (centre), it.end, it.box. */
function placeLabels(img, items, opt) {
  opt = Object.assign({ dists: [70, 100, 135, 175, 220, 270, 330], pad: 6, gap: 10 }, opt || {});
  const W = img.px[0], H = img.px[1], M = img.mask;
  const R = opt.region || [opt.pad, opt.pad, W - opt.pad, H - opt.pad];
  const occBox = (b) => {
    if (!M) return 0;
    const c = M.cell;
    let n = 0;
    const i0 = Math.max(0, Math.floor(b[0] / c)), i1 = Math.min(M.w - 1, Math.floor(b[2] / c));
    const j0 = Math.max(0, Math.floor(b[1] / c)), j1 = Math.min(M.h - 1, Math.floor(b[3] / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) n += M.data[j * M.w + i];
    return n;
  };
  const occSeg = (p, q) => {
    if (!M) return 0;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(L / M.cell));
    let k = 0;
    for (let t = 2; t < n; t++) { const x = p[0] + (q[0] - p[0]) * t / n, y = p[1] + (q[1] - p[1]) * t / n; const i = Math.floor(x / M.cell), j = Math.floor(y / M.cell); if (i >= 0 && j >= 0 && i < M.w && j < M.h) k += M.data[j * M.w + i]; }
    return k;
  };
  const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  const cross = (s1, s2) => (ccw(s1[0], s2[0], s2[1]) * ccw(s1[1], s2[0], s2[1]) < 0) && (ccw(s1[0], s1[1], s2[0]) * ccw(s1[0], s1[1], s2[1]) < 0);
  const hitBox = (s, b) => { // segment vs box
    const inB = (p) => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3];
    if (inB(s[0]) || inB(s[1])) return true;
    const e = [[[b[0], b[1]], [b[2], b[1]]], [[b[2], b[1]], [b[2], b[3]]], [[b[2], b[3]], [b[0], b[3]]], [[b[0], b[3]], [b[0], b[1]]]];
    return e.some(ed => cross(s, ed));
  };
  const over = (a, b, g) => a[0] < b[2] + g && a[2] > b[0] - g && a[1] < b[3] + g && a[3] > b[1] - g;
  const done = (opt.obstacles || []).map(b => ({ a: [-1e6, -1e6], box: b, seg: [[-1e6, -1e6], [-1e6 + 1, -1e6]] }));
  for (const it of items) {
    let best = null;
    for (let ai = 0; ai < 32; ai++) {
      const ang = ai * Math.PI / 16;
      for (const d of opt.dists) {
        const cx = it.a[0] + Math.cos(ang) * d * (it.kind === 'text' ? 1.25 : 1), cy = it.a[1] + Math.sin(ang) * d;
        const box = [cx - it.w / 2, cy - it.h / 2, cx + it.w / 2, cy + it.h / 2];
        if (box[0] < R[0] || box[1] < R[1] || box[2] > R[2] || box[3] > R[3]) continue;
        const end = it.kind === 'text' ? [it.a[0] < cx ? box[0] : box[2], cy] : [cx, cy];
        const seg = [it.a, end];
        let score = occBox(box) * 12 + d * 0.05 + occSeg(it.a, end) * 0.6;
        const ib = [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1];
        for (const q of items) if (q.a[0] > ib[0] && q.a[0] < ib[2] && q.a[1] > ib[1] && q.a[1] < ib[3]) score += q === it ? 3000 : 900;
        if (it.kind === 'text' && Math.abs(end[0] - it.a[0]) < it.h) score += 60; // steep leaders into text read badly
        for (const p of done) {
          if (over(box, p.box, opt.gap)) score += 2000;
          if (cross(seg, p.seg)) score += 220;
          if (hitBox(seg, p.box)) score += 400;
          if (hitBox(p.seg, box)) score += 400;
          if (Math.hypot(p.a[0] - it.a[0], p.a[1] - it.a[1]) > 1 && hitBox(seg, [p.a[0] - 8, p.a[1] - 8, p.a[0] + 8, p.a[1] + 8])) score += 150;
        }
        if (!best || score < best.score) best = { score, c: [cx, cy], box, end, seg };
      }
    }
    if (!best || (opt.maxScore !== undefined && best.score > opt.maxScore)) { if (opt.maxScore !== undefined) { it.skip = true; continue; } const c = [Math.min(W - it.w, it.a[0] + 80), Math.max(it.h, it.a[1] - 80)]; best = { c, box: [c[0] - it.w / 2, c[1] - it.h / 2, c[0] + it.w / 2, c[1] + it.h / 2], end: c, seg: [it.a, c] }; }
    Object.assign(it, { c: best.c, box: best.box, end: best.end });
    done.push({ a: it.a, box: best.box, seg: best.seg });
  }
  return items;
}

/* ------------------------------------------------------------------ renders */
async function makeRenders(model, progress) {
  const R = new V.PrintRenderer();
  R.setModel(model);
  const { P, G } = model;
  const N = P.rows, L = P.width, D = P.depth, H = P.height, A = P.shs, h = A / 2;
  const rearLab = C.rowLabel(0, N), frontLab = C.rowLabel(N - 1, N);
  const yA = G.rowY[N - 1];
  const rearSpec = C.faceSpec(P, G, N - 1, 'rear');
  const out = {};
  const step = async (name, f, frac) => { progress && progress(`Rendering ${name}...`, frac); await new Promise(r => setTimeout(r, 15)); return f(); };
  out.hero = await step('3D view', () => R.iso(-128, 21, 2400, 1500, { openDoors: { [`${rearLab}-L`]: 100 } }, null, 1.04), 0.08);
  out.rear = await step('rear view', () => R.iso(52, 24, 1500, 1000, { openDoors: { [`${rearLab}-R`]: 100 } }, null, 1.05), 0.14);
  const onlyA = (p) => p.module === frontLab;
  const ex = {
    roof: [L * 0.70, yA + D * 0.5, H + P.tRoof + 420], floor: [L * 0.72, yA + D * 0.62, A - 300],
    door: [-420 + h, yA + D * 0.45, G.latchZ + 120], frame: [h, yA + D - h, H * 0.62],
    mid: [L * 0.62, yA + (rearSpec && rearSpec.style === 'centre' ? h : A), Math.max(H * 0.55, H - A - 90)], outer: [L * 0.28, yA + D - A, H * 0.42], divider: [G.XC, yA + D * 0.5, H * 0.8],
  };
  out.exploded = await step('exploded view', () => R.iso(-140, 24, 1900, 1450, { only: onlyA, exploded: 1, explodeRows: false }, ex, 1.22), 0.2);
  const frameOnly = (p) => (G.shared || p.module === frontLab) && (p.kind === 'frame' || p.mark === 'T2'); // a shared frame is drawn whole
  const fa = {};
  const pick = (pred, frac) => { const p = model.parts.find(q => q.module === frontLab && pred(q)); if (!p) return null; const b = pbox(p); return [b[0] + (b[3] - b[0]) * frac[0], b[1] + (b[4] - b[1]) * frac[1], b[2] + (b[5] - b[2]) * frac[2]]; };
  fa.F1 = pick(q => q.mark === 'F1' && q.name.includes('bottom long rail front'), [0.72, 0.5, 0.5]);
  fa.F1H = pick(q => q.mark === 'F1H', [0.72, 0.5, 0.5]);
  fa.F2 = pick(q => q.mark === 'F2' && q.name.includes('corner FL'), [0.5, 0.5, 0.62]);
  fa.F2c = pick(q => q.mark === 'F2' && q.name.includes('centre F'), [0.5, 0.5, 0.4]);
  fa.F3e = pick(q => q.mark === 'F3' && q.name.includes('top end rail left'), [0.5, 0.55, 0.5]);
  fa.F3c = pick(q => q.mark === 'F3' && q.name.includes('top centre cross'), [0.5, 0.45, 0.5]);
  fa.F3r = pick(q => q.mark === 'F3' && q.name.includes('roof cross right'), [0.5, 0.6, 0.5]);
  fa.F3j = pick(q => q.mark === 'F3' && q.name.includes('floor joist left'), [0.5, 0.35, 0.5]);
  fa.F3H = pick(q => q.mark === 'F3H' && q.name.includes('right'), [0.5, 0.6, 0.5]);
  for (const k of Object.keys(fa)) if (!fa[k]) delete fa[k];
  out.frame = await step('frame', () => R.iso(-138, 30, 1700, 1150, { only: frameOnly, frameColours: true }, fa, 1.18), 0.28);
  out.frameAnchors = fa;
  out.R = R;
  return out;
}
function orthoRender(R, view, center, halfW, halfH, scale, opts) {
  const dpmm = 240 / 25.4;
  const pxW = Math.max(200, Math.round(2 * halfW / scale * dpmm)), pxH = Math.max(150, Math.round(2 * halfH / scale * dpmm));
  return R.ortho(view, center, halfH, pxW, pxH, opts);
}

/* ------------------------------------------------------------------ page 1: overview */
function pageOverview(doc, M, S, I, info) {
  const { P, G } = M;
  const N = P.rows;
  const s = Sheet(doc, 1, info.total, 'OVERVIEW', 'NTS', info);
  s.image(I.hero.url, 12, 110, 276, 276 * I.hero.px[1] / I.hero.px[0]);
  s.text(16, 278, `From the left front, row ${C.rowLabel(0, N)}'s left door open`, { size: 6, color: GREY });
  const rh = 134 * I.rear.px[1] / I.rear.px[0];
  s.image(I.rear.url, 12, 14, 134, rh);
  s.text(16, 16, `From the right rear, row ${C.rowLabel(0, N)}'s right door open`, { size: 6, color: GREY });
  // exploded view with labels
  const ew = 110, eh = ew * I.exploded.px[1] / I.exploded.px[0], ex = 149, ey = 12;
  s.image(I.exploded.url, ex, ey, ew, eh);
  s.text(ex + 2, ey + eh + 1.5, 'HOW A ROW GOES TOGETHER', { size: 7, weight: 'bold' });
  const an = I.exploded.anchors, pw = I.exploded.px[0], ph = I.exploded.px[1];
  const ip = (p) => [ex + p[0] / pw * ew, ey + eh - p[1] / ph * eh];
  const pxmm = pw / ew;
  const front = P.wallFront, rearSpec = C.faceSpec(P, G, N - 1, 'rear');
  const short = wallShort;
  const labels = [['roof', 'S2 roof sheet'], ['floor', P.floorType === 'tread' ? 'S1 tread-plate floor' : 'S1 floor sheet'], ['door', 'door: D1, D2, M2 mesh'], ['frame', 'frame: F1, F2, F3'],
    ['outer', `front wall: ${short[front]}`]];
  if (rearSpec) labels.push(['mid', `rear wall: ${short[rearSpec.type]}${rearSpec.style === 'centre' ? ', on the rail centre' : ''}`]);
  const items = labels.filter(([k]) => an[k]).map(([k, t]) => ({ a: an[k], t, kind: 'text', w: (s.tw(t, 5.4) + 4.4) * pxmm, h: 3.4 * pxmm }));
  placeLabels(I.exploded, items, { dists: [80, 120, 165, 215, 270, 330], gap: 12 });
  for (const it of items) {
    const left = it.end[0] <= it.c[0];
    s.leader(ip(it.a), ip(it.end), it.t, { size: 5.4, ha: left ? 'left' : 'right', landing: 2, box: true });
  }

  // right column
  const x0 = 296;
  s.text(x0, 274, 'Ute dog cages', { size: 21, weight: 'bold' });
  const fw = metalWord(P, 'frame'), sw = metalWord(P, 'sheet');
  s.text(x0, 265.5, `${N} x 2 set, ${fw} SHS frame` + (fw !== sw ? `, ${sw} sheets` : ''), { size: 9.5, color: GREY });
  const joinTxt = N < 2 ? '' : {
    separate: ` Each row is a separate module, ${f0(P.width)} x ${f0(P.depth)} x ${f0(P.height)}${G.bolted ? ', bolted to the next' : ''}; the back-to-back walls between rows are ${wallName[P.wallMiddle]}.`,
    sandwich: P.wallMiddle === 'mesh' ? ` Each row is a separate frame, ${f0(P.width)} x ${f0(P.depth)} x ${f0(P.height)}; the mesh between rows is welded into the rear row only.`
      : ` Each row is a separate frame, ${f0(P.width)} x ${f0(P.depth)} x ${f0(P.height)}, and one ${wallName[P.wallMiddle]} is clamped between neighbouring frames instead of a wall on each.`,
    shared2: ` The rows are one welded frame: neighbouring rows share the SHS between them, with a wall of ${wallName[P.wallMiddle]} on each face of it.`,
    shared: ` The rows are one welded frame: neighbouring rows share the SHS between them, with one wall of ${wallName[P.wallMiddle]} on its centre line.`,
  }[P.rowJoin];
  const desc = `${N * 2} dog compartments in ${N} ${N === 1 ? 'row' : 'rows'} of two, with a weldmesh door at each end on the sides of the ute.` + joinTxt + ' ' +
    (P.wallFront === P.wallRear ? `Both outer faces, toward the cab and the tailgate, are ${wallName[P.wallFront]}.` : `The face toward the cab is ${wallName[P.wallFront]} and the face toward the tailgate is ${wallName[P.wallRear]}.`)
    + (P.roofType === 'perforated' ? ' The roof has air holes over the open bays of the top frame.' : '');
  let y = s.para(x0, 256, s.wrap(desc, 114, 7), { size: 7 });
  const perRow = S.perModule.reduce((a, b) => a + b, 0) / Math.max(1, S.perModule.length);
  const rows = [
    ['Overall (W x L x H)', `${f0(P.width)} x ${f0(G.Ltot)} x ${f0(P.height + P.tRoof)}`],
    G.shared ? ['Each row', `${f0(P.width)} x ${f0(P.depth)} x ${f0(P.height)}, sharing its rails`] : ['Each row (module)', `${f0(P.width)} x ${f0(P.depth)} x ${f0(P.height)} + roof`],
    ['Clear inside, each dog', `${f0(G.clearL)} x ${f0(G.clearW)} x ${f0(G.clearH)} high*`],
    ['Door opening', `${f0(G.openW)} x ${f0(G.openH)}, about ${Math.round(G.clearPastDoor)} past the open door`],
    ['Mass (approx.)', G.shared ? `${Math.round(S.total)} kg, one welded set` : `${Math.round(perRow)} kg per row, ${Math.round(S.total)} kg set`],
    ['Frame + doors', `SHS ${P.shs} x ${P.shs} x ${Number(P.shsT).toFixed(1)}, ${fw} ${gradeOf(P, 'frame')}`],
    ['Sheets', `${sw}, ${gradeOf(P, 'sheet')}` + (G.mixed ? ', riveted' : '')],
  ];
  const faceTxt = (t, k) => t === 'perforated' ? `holes ${C.holeText(P.holes[k])}` : wallName[t];
  if (P.wallFront === P.wallRear && (P.wallFront !== 'perforated' || JSON.stringify(P.holes.front) === JSON.stringify(P.holes.rear))) rows.push(['Front and rear faces', faceTxt(P.wallFront, 'front')]);
  else { rows.push(['Front face (cab)', faceTxt(P.wallFront, 'front')]); rows.push(['Rear face (tailgate)', faceTxt(P.wallRear, 'rear')]); }
  if (N > 1) {
    rows.push(['Between rows', P.wallMiddle === 'perforated' ? `${P.tSheet} sheet, holes ${C.holeText(P.holes.middle)}` : wallName[P.wallMiddle]]);
    rows.push(['Row joints', `${C.ROW_JOINS[P.rowJoin].short}, ${f0(G.betweenDogs)} between dogs`]);
  }
  rows.push(['Between dogs', P.divider === 'perforated' ? `${P.tSheet} sheet, holes ${C.holeText(P.holes.divider)}` : `${P.tSheet} sheet, solid`]);
  rows.push(['Doors', `${f0(P.meshPitch)} x ${f0(P.meshPitch)} x ${f0(P.meshWire)} ${C.kindOf(P, 'frame').mesh}`]);
  rows.push(['Roof / floor', `${P.tRoof} sheet${P.roofType === 'perforated' ? ' with holes' : ''} / ${P.tFloor} ${P.floorType === 'tread' ? 'tread plate' : 'sheet'}`]);
  if (P.roofType === 'perforated') rows.push(['Roof holes', `${C.holeText(P.holes.roof)}, over the open bays`]);
  y -= 2;
  const yb = s.table(x0, y, [['KEY DATA', 42, 'left'], ['', 72, 'left']], rows, { rowH: 4.5, size: 6.3, hsize: 6 });
  s.text(x0, yb - 3, `* under the top frame; ${f0(G.clearHRoof)} between the roof bars`, { size: 5.6, color: GREY });

  // layout schematic, with the tray: cages pushed up to the headboard
  let ys = yb - 11;
  s.text(x0, ys, 'LAYOUT FROM ABOVE, ON THE TRAY', { size: 8, weight: 'bold' });
  const Lt = G.Ltot, TL = P.trayLength, fGap = P.trayGapFront;
  const headY = Lt + fGap, rearY = headY - TL, behind = TL - fGap - Lt; // the cages sit fGap from the headboard
  s.text(x0, ys - 4, `Tray ${f0(P.trayWidth)} x ${f0(TL)} (headboard to tail); cages ${f0(fGap)} from the headboard, ` + (behind >= -0.5 ? `${f0(behind)} left behind` : `${f0(-behind)} past the tail`), { size: 6, color: behind >= -0.5 ? GREY : ACC });
  const room = (P.trayWidth - P.width) / 2;
  const ext = Math.max(room, G.doorW) + 10;          // door swings (or tray edge) beyond the cage sides
  const boxW = 112, boxH = Math.max(28, ys - 8 - 98);
  const spanW = P.width + 2 * ext + 150;               // + room for the length dimension on the right
  const yLow = Math.min(0, rearY);                     // tail of the tray (or of the cages if they overhang)
  const k = Math.min(boxW / spanW, boxH / (headY - yLow + 380));
  const ox = x0 + (114 - spanW * k) / 2 + ext * k, oy = ys - 14 - headY * k - 6;
  const Pp = (X, Yy) => [ox + X * k, oy + Yy * k];
  { // tray outline and headboard
    const a = Pp(-room, rearY), b = Pp(P.width + room, headY);
    s.rect(a[0], a[1], b[0] - a[0], b[1] - a[1], { lw: 0.25, color: GREY, dash: [1.2, 0.8] });
    const h0 = Pp(-room, headY), h1 = Pp(P.width + room, headY + 50);
    s.rect(h0[0], h0[1], h1[0] - h0[0], Math.max(0.6, h1[1] - h0[1]), { fill: LIGHT, lw: 0.2, color: GREY });
  }
  for (let i = 0; i < N; i++) {
    const lab = C.rowLabel(i, N), yo = G.rowY[i], [e0, e1] = rowExt(G, i);
    for (const [side, xa, xb] of [['L', 0, G.XC], ['R', G.XC, P.width]]) {
      const p0 = Pp(xa, e0);
      s.rect(p0[0], p0[1], (xb - xa) * k, (e1 - e0) * k, { fill: FAINT, lw: 0.2 });
      const c = Pp((xa + xb) / 2, (e0 + e1) / 2);
      s.text(c[0], c[1], `${lab}-${side}`, { size: Math.min(8.5, Math.max(5, (e1 - e0) * k * 0.9)), weight: 'bold', ha: 'center', va: 'middle' });
    }
    const a = Pp(G.XC, yo + 25), b = Pp(G.XC, yo + P.depth - 25);
    s.line([a[0], b[0]], [a[1], b[1]], { lw: P.divider === 'solid' ? 0.9 : 0.5, color: INK, dash: P.divider === 'solid' ? null : [0.8, 0.5] });
    for (const face of ['rear', 'front']) {
      const spec = C.faceSpec(P, G, i, face);
      if (!spec) continue;
      const yy = spec.style === 'centre' ? yo + G.h : face === 'rear' ? yo + 12 : yo + P.depth - 12;
      const a2 = Pp(25, yy), b2 = Pp(P.width - 25, yy), type = spec.type;
      const st = type === 'solid' ? { lw: 0.7, color: INK } : type === 'perforated' ? { lw: 0.7, color: INK, dash: [1.4, 0.7] } : { lw: 0.7, color: GREY, dash: [0.3, 0.8] };
      s.line([a2[0], b2[0]], [a2[1], b2[1]], st);
    }
    if (G.plateT && i < N - 1) { // sheet clamped between this row and the next
      const yy = G.joints[i], a2 = Pp(0, yy), b2 = Pp(P.width, yy);
      s.line([a2[0], b2[0]], [a2[1], b2[1]], P.wallMiddle === 'solid' ? { lw: 0.7, color: INK } : { lw: 0.7, color: INK, dash: [1.4, 0.7] });
    }
    for (const side of ['L', 'R']) {
      const hinge = P.hinges[N - 1 - i][side];
      const xe = side === 'L' ? 0 : P.width;
      const ya = yo + G.doorY0, yb2 = yo + G.doorY1;
      const a3 = Pp(xe, ya), b3 = Pp(xe, yb2);
      s.line([a3[0], b3[0]], [a3[1], b3[1]], { lw: 1.0, color: ACC });
      const hp = Pp(xe, hinge === 'rear' ? ya : yb2), rr = G.doorW * k;
      const dirOut = side === 'L' ? -1 : 1, dirAlong = hinge === 'rear' ? 1 : -1;
      const pts = [];
      for (let t = 0; t <= 16; t++) { const th = t / 16 * Math.PI / 2; pts.push([hp[0] + dirOut * rr * Math.sin(th), hp[1] + dirAlong * rr * Math.cos(th)]); }
      s.poly(pts, { lw: 0.18, color: ACC, dash: [0.9, 0.6] });
      s.line([hp[0], hp[0] + dirOut * rr], [hp[1], hp[1]], { lw: 0.35, color: ACC });
    }
  }
  const fa = Pp(P.width / 2, headY + 140);
  s.arrow([fa[0], fa[1] + 4], [0, 1], { L: 2.6, W: 1.2 });
  s.line([fa[0], fa[0]], [fa[1], fa[1] + 2], { lw: 0.35 });
  s.text(fa[0] + 3, fa[1] + 1.6, 'FRONT (cab)', { size: 6, weight: 'bold', va: 'middle' });
  { const a = Pp(0, yLow), b = Pp(P.width, yLow); s.dim(a, b, a[1] - 6.5, 'h', f0(P.width), { size: 6 }); }
  if (room > 0) { const a = Pp(-room, yLow), b = Pp(0, yLow); s.dim(a, b, a[1] - 2.8, 'h', f0(room), { size: 5.4 }); const c = Pp(P.width, yLow), d = Pp(P.width + room, yLow); s.dim(c, d, c[1] - 2.8, 'h', f0(room), { size: 5.4 }); }
  { // along the tray: tail to the cages, the cages, the cages to the headboard
    const xd = Pp(P.width + ext + 45, 0)[0];
    const a = Pp(P.width, 0), b = Pp(P.width, Lt); s.dim(a, b, xd, 'v', f0(Lt), { size: 5.8 });
    if (fGap > 1) s.dim(b, Pp(P.width, headY), xd, 'v', f0(fGap), { size: 5.4, color: GREY, side: 'end' });
    if (Math.abs(behind) > 1) { const c = Pp(P.width, rearY); s.dim(c, a, xd, 'v', behind > 0 ? `${f0(behind)} behind` : `${f0(-behind)} over`, { size: 5.4, color: behind > 0 ? GREY : ACC, side: 'start' }); } }
  // legend
  let ly = Pp(0, yLow)[1] - 15;
  const lg = [[{ lw: 0.8, color: INK }, 'solid wall'], [{ lw: 0.7, color: INK, dash: [1.4, 0.7] }, 'air holes'], [{ lw: 0.7, color: GREY, dash: [0.3, 0.8] }, 'mesh'], [{ lw: 1.0, color: ACC }, 'door + swing']];
  lg.forEach(([st, t], i) => { const xx = x0 + i * 28.5; s.line([xx, xx + 6], [ly, ly], st); s.text(xx + 7.5, ly, t, { size: 5.8, va: 'middle' }); });
  // in this set + read first
  let yy = Math.min(ly - 9, 92);
  s.text(x0, yy, 'IN THIS SET', { size: 7.5, weight: 'bold' });
  yy = s.para(x0, yy - 5, [`1 Overview   2 General arrangement   3 ${G.shared ? 'Frame' : 'Module frame'}`, `4 Doors, details, panels   5 Cut list, stock, weights, notes` + (info.total > 5 ? '   6 Cutting plans' : '')], { size: 6.1 });
  s.text(x0, yy - 2, 'READ FIRST', { size: 7.5, weight: 'bold', color: ACC });
  const lift = G.shared ? `The welded set weighs about ${Math.round(S.total)} kg in one piece: lift it with four people or a forklift.` : `Each row weighs about ${Math.round(perRow)} kg, a two-to-three person lift.`;
  const rf = `Measure your tray and canopy before cutting. Each door needs about ${f0(G.doorW + 30)} clear beside the cage to open, so canopy gull-wings must clear it. ${lift} Never leave dogs in the cages in the sun or in a closed canopy.`;
  s.para(x0, yy - 7, s.wrap(rf, 112, 6.1), { size: 6.1 });
}

/* ------------------------------------------------------------------ page 2: general arrangement */
function pageGA(doc, M, S, I, info) {
  const { P, G } = M;
  const N = P.rows, L = P.width, D = P.depth, H = P.height, A = P.shs, h = A / 2, Lt = G.Ltot;
  const LIST = [10, 15, 20, 25, 30, 40, 50, 75, 100];
  // two layouts: 'normal' (plan above the rear elevation, one scale) and 'long' (plan down the
  // left half at its own scale, elevations stacked on the right) for long sets of rows
  const scN = pickScale(s_ => L / s_ <= 176 && Lt / s_ <= 116 && (H + P.tRoof) / s_ <= 76, LIST);
  const scLP = pickScale(s_ => L / s_ <= 150 && Lt / s_ <= 218, LIST);
  const long = scLP < scN;
  const s = Sheet(doc, 2, info.total, 'GENERAL ARRANGEMENT', long ? 'AS SHOWN' : `1:${scN} @ A3`, info);
  const R = I.R;
  const sc = long ? scLP : scN;

  // plan
  const planImg = orthoRender(R, 'top', [L / 2, Lt / 2, H / 2], L / 2 + 120, Lt / 2 + 95, sc, { cutTop: true });
  const vp = View(s, 'top', sc, long ? [36 + (150 - L / sc) / 2, 46] : [34, 150], [0, 0]);
  vp.image(planImg);
  for (const [x0, x1] of [[0, G.XC], [G.XC, L]]) vp.dim([x0, Lt, 0], [x1, Lt, 0], 9, 'h');
  vp.dim([0, Lt, 0], [L, Lt, 0], 17, 'h');
  rowDims(vp, G, -11, 'v', (y) => [0, y, 0]);
  if (N > 1) vp.dim([0, 0, 0], [0, Lt, 0], -19, 'v');
  const tags = [];
  const tagH = Math.min(8.4, G.pitch / sc - 1.5);
  for (let i = 0; i < N; i++) {
    const lab = C.rowLabel(i, N), [e0, e1] = rowExt(G, i);
    for (const [side, xc] of [['L', G.XC / 2], ['R', G.XC * 1.5]]) {
      const c = vp.P([xc, (e0 + e1) / 2, 0]);
      s.rect(c[0] - 8.5, c[1] - tagH / 2, 17, tagH, { fill: WHITE, lw: 0 });
      if (tagH >= 7) {
        s.text(c[0], c[1] + 1.2, `${lab}-${side}`, { size: 8.5, weight: 'bold', ha: 'center', va: 'middle' });
        s.text(c[0], c[1] - 2.3, `row ${lab}`, { size: 5.2, ha: 'center', va: 'middle', color: GREY });
      } else s.text(c[0], c[1], `${lab}-${side}`, { size: Math.min(8.5, Math.max(5, tagH * 2)), weight: 'bold', ha: 'center', va: 'middle' });
      tags.push([c[0] - 9.5, c[1] - tagH / 2 - 0.6, c[0] + 9.5, c[1] + tagH / 2 + 0.6]);
    }
  }
  const fa = vp.P([L + 75, Lt - 40, 0]);
  s.arrow([fa[0], fa[1] + 6], [0, 1], { L: 3, W: 1.4 });
  s.line([fa[0], fa[0]], [fa[1] - 4, fa[1] + 3], { lw: 0.4 });
  s.text(fa[0], fa[1] - 7, 'FRONT', { size: 6, weight: 'bold', ha: 'center' });
  s.text(fa[0], fa[1] - 10, '(cab)', { size: 5.6, ha: 'center', color: GREY });
  // leaders: placed inside the plan, clear of the compartment tags and of each other
  const lp = [[[G.XC, D * 0.5, 0], P.divider === 'solid' ? 'solid divider' : 'divider with air holes']];
  if (N > 1) lp.push([[L * 0.36, G.joints[0], 0], `between rows: ${wallName[P.wallMiddle]}${G.plateT ? ', one sheet' : P.rowJoin === 'shared' && P.wallMiddle !== 'mesh' ? ', one wall' : ''}`]);
  lp.push([[L * 0.40, Lt - 12, 0], `front face: ${wallName[P.wallFront]}`]);
  lp.push([[L * 0.70, 12, 0], `rear face: ${wallName[P.wallRear]}`]);
  if (P.trayBolts && G.trayBoltJoist) lp.push([[G.trayBoltJoist, P.trayBoltInset, 0], `M${G.trayBoltD} tray bolt (4 per row)`]);
  const pc0 = vp.P([0, 0, 0]), pc1 = vp.P([L, Lt, 0]);
  const lItems = lp.map(([pt, t]) => ({ a: vp.P(pt), t, kind: 'text', w: s.tw(t, 5.8) + 4.6, h: 3.6 }));
  placeLabels({ px: [PW, PH], mask: null }, lItems, { region: [pc0[0] + 1.5, pc0[1] + 1.5, pc1[0] - 1.5, pc1[1] - 1.5], obstacles: tags, dists: [6, 8, 10, 12, 14, 17, 20, 24, 28, 33, 38], gap: 1.2, maxScore: 1500 });
  for (const it of lItems) if (!it.skip) s.leader(it.a, it.end, it.t, { size: 5.8, box: true, ha: it.end[0] <= it.c[0] ? 'left' : 'right', landing: 2 });
  s.viewLabel(vp.P([L / 2, 0, 0])[0], pc0[1] - 11, 'PLAN', `${long ? `1:${sc}, ` : ''}roof sheet and top frame removed`);

  // left elevation
  const sl = long ? pickScale(s_ => Lt / s_ <= 118 && (H + P.tRoof) / s_ <= 40, LIST) : sc;
  const leftImg = orthoRender(R, 'left', [0, Lt / 2, H / 2], Lt / 2 + 70, H / 2 + 55, sl, { only: p => p.kind !== 'bolt' });
  const vl = View(s, 'left', sl, long ? [266, 232] : [264, 172], [-Lt, 0]);
  vl.image(leftImg);
  rowDims(vl, G, -9, 'h', (y) => [0, y, 0]);
  if (N > 1) vl.dim([0, Lt, 0], [0, 0, 0], -17, 'h');
  vl.dim([0, 0, 0], [0, 0, H], 10, 'v', `${f0(H)} frame`);
  vl.dim([0, 0, 0], [0, 0, H + P.tRoof], 19, 'v', `${f0(H + P.tRoof)} o/a`);
  const aF = vl.P([0, Lt, H * 0.85]);
  s.arrow([aF[0] - 7, aF[1]], [-1, 0], { L: 3, W: 1.4 });
  s.line([aF[0] - 5, aF[0] - 1.5], [aF[1], aF[1]], { lw: 0.4 });
  s.text(aF[0] - 4, aF[1] - 4.5, 'FRONT', { size: 6, weight: 'bold', ha: 'center' });
  for (let i = 0; i < N; i++) { const [e0, e1] = rowExt(G, i); s.text(vl.P([0, (e0 + e1) / 2, 0])[0], vl.P([0, 0, H])[1] + 5.5, G.pitch / sl >= 12 ? `row ${C.rowLabel(i, N)}` : C.rowLabel(i, N), { size: 6.2, ha: 'center', color: GREY }); }
  s.viewLabel(vl.P([0, Lt / 2, 0])[0], vl.P([0, 0, 0])[1] - 26, 'LEFT SIDE ELEVATION', `${long ? `1:${sl}, ` : ''}right side is a mirror image`);

  // rear elevation
  const sr = long ? pickScale(s_ => L / s_ <= 84 && (H + P.tRoof) / s_ <= 40, LIST) : sc;
  const rearImg = orthoRender(R, 'rear', [L / 2, 0, H / 2], L / 2 + 90, H / 2 + 55, sr, { only: p => p.kind !== 'bolt' });
  const vr = View(s, 'rear', sr, long ? [284, 158] : [34, 54], [0, 0]);
  vr.image(rearImg);
  vr.dim([0, 0, 0], [G.XC, 0, 0], -9, 'h');
  vr.dim([G.XC, 0, 0], [L, 0, 0], -9, 'h');
  vr.dim([0, 0, 0], [L, 0, 0], -17, 'h');
  vr.dim([0, 0, 0], [0, 0, H], -10, 'v');
  s.viewLabel(vr.P([L / 2, 0, 0])[0], vr.P([0, 0, 0])[1] - 26, 'REAR ELEVATION', `${long ? `1:${sr}, ` : ''}from the tailgate. Front face (from the cab): ${wallName[P.wallFront]}`);

  // row schedule and notes
  const nx = 264;
  let ny = long ? 120 : 132;
  s.text(nx, ny, 'ROW SCHEDULE', { size: 8, weight: 'bold' });
  const sched = [];
  for (let r = 0; r < N; r++) {
    const i = N - 1 - r, lab = C.rowLabel(i, N);
    const hg = P.hinges[r];
    sched.push([lab, r === 0 ? 'at the cab' : i === 0 ? 'at the tailgate' : 'middle', faceText(P, G, i, 'front'), faceText(P, G, i, 'rear'), `${hg.L} / ${hg.R}`, `${Math.round(S.masses[lab])} kg`]);
  }
  ny = s.table(nx, ny - 3, [['ROW', 10, 'left'], ['WHERE', 21, 'left'], ['FRONT WALL', 34, 'left'], ['REAR WALL', 34, 'left'], ['HINGES L / R', 27, 'left'], ['MASS', 22, 'right']], sched, { rowH: 4.3, size: 5.9, hsize: 5.4 });
  const first = N === 1 ? 'One row: the frame, doors and walls are on sheets 3 and 4.'
    : G.shared ? `${N} rows lettered from the cab, built as one welded frame: each row shares the SHS rails and posts between it and the next (${f0(A)} between neighbouring dogs). Row A has rails at both ends; each row behind it adds one set.`
    : G.sandwich ? `${N} rows lettered from the cab. Every row is the same frame; ${P.wallMiddle === 'mesh' ? 'the mesh between rows is welded into the rear row of each pair' : `one S8 sheet is clamped between neighbouring frames (${f0(G.betweenDogs)} between dogs)`}.`
    : `${N} rows lettered from the cab. All rows share the same frame, doors and parts; only the long walls differ (schedule above).`;
  const notes = [
    first,
    (P.trayBolts && G.trayBoltJoist ? `Each row bolts to the tray with 4 x M${G.trayBoltD} (sheet 3).` : (P.trayBolts ? 'No tray bolts: with no floor joists there is nothing for them to pass through, so tie each row down your own way.' : 'Tray bolts are turned off: tie the cages down your own way.')) + (G.bolted ? ` Neighbouring rows bolt together through the top rails${G.plateT ? ' and the sheet between them' : ''} with 2 x M10 x ${G.joinBoltL}.` : ''),
    `Hinge barrels stick out ${f0(G.hingeD)} beyond the cage ends and latches about ${Math.round(S.stickOut)} (${Math.round(S.stickOut + 7)} with the handle lifted). ` + ((P.trayWidth - L) / 2 >= 0 ? `On the tray there is ${f0((P.trayWidth - L) / 2)} each side to the tray edge` : `The cages are ${f0(L - P.trayWidth)} wider than the tray you entered`)
      + `; the cages sit ${f0(P.trayGapFront)} from the headboard with ${S.trayPlan.behind >= -0.5 ? `${f0(S.trayPlan.behind)} of tray behind them` : `${f0(-S.trayPlan.behind)} hanging past the tail`}.`,
    `Each door is ${f0(G.doorW)} wide and needs about ${f0(G.doorW + 30)} clear beside the cage to swing open. Check it clears any canopy side frame and gull-wing seals.`,
    `Overall height is ${f0(H + P.tRoof)} including the roof sheet. Check canopy, rack or headboard clearance.`,
    `Clear inside each compartment: ${f0(G.clearL)} long x ${f0(G.clearW)} wide x ${f0(G.clearH)} high under the top frame. Check your biggest dog can stand with its head up, turn round and lie flat.`,
  ];
  if (P.hinges.some(x => x.L === 'rear' || x.R === 'rear')) notes.push('A door hinged on its rear edge will be blown open by the wind if its latch lets go while driving. Pin the latches for travel.');
  if (P.roofType === 'perforated') notes.push('The roof has air holes, so rain comes in: keep the cages under a canopy or fit a cover over the holes.');
  for (const w of S.warnings.filter(x => /hinge at the same joint|join bolts|crush tube|Air holes spaced|barely reach|keepers sit/i.test(x.text)).slice(0, 3)) notes.push('CHECK: ' + w.text);
  s.text(nx, ny - 7, 'NOTES', { size: 8, weight: 'bold' });
  s.numbered(nx, ny - 12.5, notes, 146, { size: long && N > 4 ? 5.8 : 6.1 });
}

/* ------------------------------------------------------------------ page 3: module frame */
function pageFrame(doc, M, S, I, info) {
  const { P, G } = M;
  const N = P.rows, L = P.width, D = P.depth, H = P.height, A = P.shs, h = A / 2;
  const s = Sheet(doc, 3, info.total, G.shared ? `FRAME  (one welded frame, ${N} rows)` : `MODULE FRAME  (make ${N})`, 'AS SHOWN', info);
  const front = C.rowLabel(N - 1, N), yA = G.rowY[N - 1];
  const behind = N > 1 ? C.rowLabel(N - 2, N) : null;
  // colour iso
  const fr = I.frame, fh = 106, fw = fh * fr.px[0] / fr.px[1], fx = 16, fy = 271 - fh;
  s.image(fr.url, fx, fy, fw, fh);
  const px2 = (p) => [fx + p[0] / fr.px[0] * fw, fy + fh - p[1] / fr.px[1] * fh];
  const rB = 3.4 * fr.px[0] / fw;
  const balls = ['F1', 'F1H', 'F2', 'F2c', 'F3e', 'F3c', 'F3r', 'F3j', 'F3H'].filter(k => fr.anchors[k])
    .map(k => ({ k, mk: MARK_RGB[k] ? k : k.slice(0, 2), a: fr.anchors[k], kind: 'balloon', w: 2 * rB, h: 2 * rB }));
  placeLabels(fr, balls, { dists: [90, 120, 150, 185, 225, 270], gap: 12 });
  for (const b of balls) s.balloon(px2(b.a), px2(b.c), b.mk, MARK_RGB[b.mk]);
  s.heading(14, 283, G.shared ? `FRAME MEMBERS, ALL ${N} ROWS` : 'FRAME MEMBERS', `colour = cut-list mark, all SHS ${P.shs} x ${P.shs} x ${Number(P.shsT).toFixed(1)} ${metalWord(P, 'frame')} (${gradeOf(P, 'frame')}), square cut`);
  // member table
  const cnt = (mark, mod) => M.parts.filter(p => p.mark === mark && (!mod || p.module === mod)).length;
  const lenOf = (mark) => { const p = M.parts.find(q => q.mark === mark); return p ? f0(p.size) : ''; };
  const rowsT = [];
  const desc = { F1: 'Long rail (top and bottom)', F1H: 'Long rail, top, with join holes', F2: G.shared ? 'Post (corners and centre)' : 'Post (4 corner, 2 centre)', F3: 'Cross member (ends, centre, joists, roof)', F3H: G.crush ? 'Floor joist with crush tubes' : 'Floor joist, tray bolt holes' };
  for (const mk of ['F1', 'F1H', 'F2', 'F3', 'F3H']) if (cnt(mk)) rowsT.push([mk, MARK_RGB[mk], desc[mk], lenOf(mk), cnt(mk, front), cnt(mk)]);
  let yb = s.table(14, fy - 3, [['MARK', 11, 'left'], ['', 7, 'center'], ['MEMBER', 72, 'left'], ['LENGTH', 16, 'right'], [`ROW ${front}`, 16, 'right'], ['ALL ROWS', 18, 'right']], rowsT, { chipCol: 1, rowH: 4.5, size: 6.2 });
  if (N > 2 && G.bolted) s.text(14, yb - 3.5, 'Middle rows have join holes in both top long rails (2 x F1H per middle row).', { size: 5.8, color: GREY });
  if (G.shared) s.text(14, yb - 3.5, `Row ${front} has rails and posts at both ends; each row behind it adds one set (4 rails, 3 posts) shared with the row in front.`, { size: 5.8, color: GREY });

  // top frame plan (left column, bottom)
  const s3b = pickScale(s_ => L / s_ <= 172 && D / s_ <= 56, [10, 15, 20, 25, 30, 40]);
  const topParts = M.parts.filter(p => p.module === front && p.kind === 'frame' && pbox(p)[2] >= H - A - 0.5);
  const vt = View(s, 'top', s3b, [22, 58], [0, yA]);
  for (const p of topParts) vt.boxRect(pbox(p));
  const xsT = [0].concat(G.roofC, [G.XC], G.roofC.map(c => L - c).reverse(), [L]).sort((a, b) => a - b);
  vt.chain(xsT.map(x => [x, yA + D, H]), 6.5, 'h', { size: 5.6 });
  const f1h = M.parts.find(p => p.module === front && p.mark === 'F1H');
  if (f1h) {
    for (const xb of [P.joinBoltInset, L - P.joinBoltInset]) { const c = vt.P([xb, yA + h, H]); s.line([c[0], c[0]], [c[1] - 3.6, c[1] + 3.6], { lw: LW_DIM, color: ACC }); s.line([c[0] - 1.4, c[0] + 1.4], [c[1], c[1]], { lw: LW_DIM, color: ACC }); }
    vt.dim([0, yA + h, H], [P.joinBoltInset, yA + h, H], -8, 'h', undefined, { size: 5.6 });
    vt.dim([L - P.joinBoltInset, yA + h, H], [L, yA + h, H], -8, 'h', undefined, { size: 5.6 });
    const nb = vt.P([0, yA, H]);
    s.line([nb[0] + 1.2, nb[0] + 1.2], [nb[1] - 16.4, nb[1] - 11.6], { lw: LW_DIM, color: ACC }); s.line([nb[0], nb[0] + 2.4], [nb[1] - 14, nb[1] - 14], { lw: LW_DIM, color: ACC });
    s.text(nb[0] + 4.5, nb[1] - 14, 'F1H join holes: 2 x 11 through the rail, drilled with the rows clamped together', { size: 5.6, va: 'middle' });
  }
  s.viewLabel(vt.P([L / 2, yA, 0])[0], 33, 'TOP FRAME PLAN', `1:${s3b}, row ${front}, rear rail at the bottom${G.shared ? ` (shared with row ${behind})` : ''}. Spacings to roof bar and centre lines`);

  // long side elevation + end view
  const s3a = pickScale(s_ => L / s_ <= 116 && H / s_ <= 52 && D / s_ <= 40 && (L + D - A) / s_ <= 150, [10, 15, 20, 25, 30, 40, 50]);
  const vle = View(s, 'rear', s3a, [232, 226], [0, 0]);
  const elevParts = M.parts.filter(p => p.module === front && (p.mark === 'F1' || p.mark === 'F1H' || p.mark === 'F2'));
  for (const p of elevParts) vle.boxRect(pbox(p));
  const rearRail = M.parts.find(p => p.module === front && p.mark === 'F1H' && p.name.includes('top long rail rear'));
  if (rearRail) for (const xb of [P.joinBoltInset, L - P.joinBoltInset]) { const c = vle.P([xb, 0, H - h]); s.circle(c[0], c[1], 5.5 / s3a, { lw: 0.15 }); }
  const xs = [0, A, G.XC - h, G.XC + h, L - A, L];
  vle.chain(xs.map(x => [x, yA, 0]), -6, 'h', { size: 5.4 });
  vle.dim([0, yA, 0], [L, yA, 0], -12.5, 'h');
  const zs = [0, A, H - A, H];
  vle.chain(zs.map(z => [0, yA, z]), -5.5, 'v', { size: 5.4 });
  vle.dim([0, yA, 0], [0, yA, H], -12, 'v');
  s.viewLabel(vle.P([L / 2, 0, 0])[0], 203, 'LONG SIDE ELEVATION', `1:${s3a}, frame only, from the rear`);
  const exX = 232 + L / s3a + 18;
  const ve = View(s, 'left', s3a, [exX, 226], [-(yA + D), 0]);
  const endParts = M.parts.filter(p => p.module === front && (p.kind === 'frame' || p.kind === 'floor') && pbox(p)[0] < 1);
  for (const p of endParts) ve.boxRect(pbox(p), { lw: LW_THIN * 1.6 });
  ve.dim([0, yA + D - A, G.zTopU], [0, yA + A, G.zTopU], 9.5, 'h', `${f0(G.openW)} clear`, { size: 5.6 });
  ve.dim([0, yA + A, G.zFloor], [0, yA + A, G.zTopU], 7.5, 'v', `${f0(G.openH)} clear`, { size: 5.6 });
  s.viewLabel(ve.P([0, yA + D / 2, 0])[0], 203, 'END VIEW', `1:${s3a}, door opening`);

  // bottom frame plan
  const vb = View(s, 'top', s3b, [222, 128], [0, yA]);
  const botParts = M.parts.filter(p => p.module === front && p.kind === 'frame' && pbox(p)[5] <= A + 0.5);
  for (const p of botParts) vb.boxRect(pbox(p));
  for (const p of M.parts.filter(q => q.module === front && q.mark === 'T2')) { const b = pbox(p); const c = vb.P([(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, 0]); s.circle(c[0], c[1], G.crush.od / 2 / s3b, { lw: 0.15 }); s.circle(c[0], c[1], (G.crush.od / 2 - G.crush.wall) / s3b, { lw: 0.12 }); }
  const xsB = [0].concat(G.joistC, [G.XC], G.joistC.map(c => L - c).reverse(), [L]).sort((a, b) => a - b);
  vb.chain(xsB.map(x => [x, yA + D, A]), 6.5, 'h', { size: 5.6 });
  if (P.trayBolts && G.trayBoltJoist) {
    const ysB = [yA, yA + P.trayBoltInset, yA + D - P.trayBoltInset, yA + D];
    vb.chain(ysB.map(y => [L, y, A]), 6.5, 'v', { size: 5.6 });
    for (const xb of [G.trayBoltJoist, L - G.trayBoltJoist]) for (const ybb of [P.trayBoltInset, D - P.trayBoltInset]) {
      const c = vb.P([xb, yA + ybb, A]);
      s.line([c[0] - 3.2, c[0] + 3.2], [c[1], c[1]], { lw: LW_DIM, color: ACC }); s.line([c[0], c[0]], [c[1] - 3.2, c[1] + 3.2], { lw: LW_DIM, color: ACC });
    }
  }
  s.viewLabel(vb.P([L / 2, yA, 0])[0], 117, 'BOTTOM FRAME PLAN', `1:${s3b}, row ${front} from above. Spacings to joist and centre lines.${P.trayBolts && G.trayBoltJoist ? (G.crush ? '  + = tray bolt through a crush tube in F3H' : '  + = tray bolt through F3H') : ''}`);

  // build order
  s.text(222, 100, G.shared ? 'BUILD ORDER (the whole set)' : 'BUILD ORDER (each row)', { size: 8, weight: 'bold' });
  const survey = P.trayBolts && G.trayBoltJoist ? 'Survey the tray first. Tray-bolt holes must miss its crossmembers and wiring: move the F3H holes along the joist (or move the joist) to suit before drilling.' : 'Survey the tray first and plan how the cages will be tied down.';
  const bo = G.shared ? [
    survey,
    'Cut and deburr all members.' + (P.trayBolts && G.trayBoltJoist ? ' Drill F3H.' : ''),
    `Bottom frame for all ${N} rows on a flat floor: ${N + 1} long rails, the end rails, centre crosses${G.joistC.length ? ' and joists' : ''} of every row. Tack, check every bay's diagonals equal within 2 mm, then weld.${P.trayBolts && G.trayBoltJoist && G.crush ? ' Fit the F3H crush tubes.' : ''}`,
    `Lay the floor sheets on now (they butt on the shared rails' centre lines)${G.mixed ? ' and rivet them down once the frame is welded, with sealant between the metals' : ''}. They can't go in once the posts are up.`,
    `Stand the ${3 * (N + 1)} posts through the floor notches (${f0(P.notchClear)} clear) and weld each to its rail. Close the notch gaps with ${G.mixed ? 'seam sealer' : 'weld or seam sealer'}.`,
    `Top frame${G.roofC.length ? ' with its roof bars' : ''}: set it on the posts, check plumb and diagonals, then weld.`,
    (P.rowJoin === 'shared' ? 'Walls between rows on the shared rails\' centre lines, the outer walls and dividers' : 'Walls (one each side of the shared rails), dividers') + (G.mixed ? ' riveted in as trays (sheet 4) with sealant behind the flanges' : '') + ', then doors, hinges and latches.',
    'Fit the roof sheets last and seal their joints over the shared rails. Lift the finished set with four people or a forklift.',
  ] : [
    survey,
    'Cut and deburr all members.' + (P.trayBolts && G.trayBoltJoist ? ' Drill F3H.' : '') + (G.bolted ? ' Leave the F1H join holes for the last step.' : ''),
    `Bottom frame on a flat bench: 2 x long rails, 2 end rails, centre cross${G.joistC.length ? ' and the joists' : ''}. Tack, check diagonals equal within 2 mm, then weld.${P.trayBolts && G.trayBoltJoist ? (G.crush ? ' Fit the F3H crush tubes.' : '') : ''}`,
    G.mixed ? "Lay the floor sheet on the bottom frame now (it can't go in once the posts are up). Rivet it down once the frame is welded, with sealant between the metals." : "Lay the floor sheet on the bottom frame now. It can't go in once the posts are up.",
    `Stand the 6 posts on the rails through the floor notches (${f0(P.notchClear)} clear). Weld each post to its rail all round, then close the notch gaps with ${G.mixed ? 'seam sealer' : 'weld or seam sealer'}.`,
    `Top frame${G.roofC.length ? ' with its roof bars' : ''}${G.bolted ? ', F1H on the joined side(s)' : ''}. Set it on the posts, check plumb and diagonals, then weld.`,
    (G.mixed ? 'Rivet in the divider and wall trays (sheet 4) with sealant behind the flanges, then doors, hinges and latches.' : 'Divider and wall infills, then doors, hinges and latches (sheet 4).') + (G.sandwich ? ' Leave the faces between rows open: one S8 sheet goes between the frames.' : ''),
    G.bolted ? (G.plateT ? 'Clamp neighbouring rows together with the S8 sheet between them and drill the 2 join holes through both F1H rails and the sheet in one go, before the roof sheets go on. Then fit the roofs.'
      : 'Clamp neighbouring rows back to back and drill the 2 join holes through both F1H rails in one go, before the roof sheets go on. Then fit the roofs.') : 'Fit the roof sheet last.',
  ];
  s.numbered(222, 94, bo, 186, { size: 6.0 });
}

/* ------------------------------------------------------------------ page 4: doors, details, panels */
function shsSection(s, x, y, a, t, r, o) {
  // rounded square section (outer filled grey, inner white)
  const draw = (half, rr, fill, lw) => {
    const pts = [];
    const corner = (cx, cy, a0) => { for (let i = 0; i <= 6; i++) { const th = a0 + i / 6 * Math.PI / 2; pts.push([cx + rr * Math.cos(th), cy + rr * Math.sin(th)]); } };
    corner(x + half - rr, y + half - rr, 0); corner(x - half + rr, y + half - rr, Math.PI / 2);
    corner(x - half + rr, y - half + rr, Math.PI); corner(x + half - rr, y - half + rr, 1.5 * Math.PI);
    pts.push(pts[0]);
    s.color(fill, 'fill'); s.color(INK); s.doc.setLineWidth(lw);
    s.doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], -(p[1] - pts[i][1])]), pts[0][0], PH - pts[0][1], [1, 1], 'FD', true);
  };
  draw(a / 2, Math.max(r, 0.05), [201, 206, 214], (o && o.lw) || 0.3);
  draw(a / 2 - t, Math.max(r - t, 0.05), WHITE, ((o && o.lw) || 0.3) * 0.7);
}

function pageDoors(doc, M, S, I, info) {
  const { P, G } = M;
  const N = P.rows, D = P.depth, A = P.shs, h = A / 2;
  const s = Sheet(doc, 4, info.total, 'DOORS, HINGE + LATCH DETAILS, PANELS', 'AS SHOWN', info);
  // which door to show: rear-most row's left door
  const rl = C.rowLabel(0, N), hinge = P.hinges[N - 1].L;
  const sd = pickScale(s_ => G.doorW / s_ <= 100 && G.doorH / s_ <= 150, [5, 7.5, 10, 15, 20]);
  const y0 = G.doorY0, y1 = G.doorY1, z0 = G.doorZ0, z1 = G.doorZ1;
  const v = View(s, 'left', sd, [40, 112], [-y1, z0]);
  // surrounding frame (thin)
  // frame round row rl's door, including posts and rails it shares with the next row
  const yr0 = G.rowY[0];
  const around = M.parts.filter(p => p.kind === 'frame' && pbox(p)[0] < 1 && pbox(p)[1] < yr0 + D - 1 && pbox(p)[4] > yr0 + 1);
  for (const p of around) v.boxRect(pbox(p), { lw: LW_THIN, color: GREY });
  // mesh wires
  const meshP = M.parts.find(p => p.module === rl && p.name.includes('L door mesh'));
  if (meshP) for (const w of meshP.solids) { const b = V.partBox({ solids: [w] }); const a2 = v.P([0, b[1], b[2]]), b2 = v.P([0, b[4], b[5]]); s.rect(Math.min(a2[0], b2[0]), Math.min(a2[1], b2[1]), Math.abs(b2[0] - a2[0]), Math.abs(b2[1] - a2[1]), { fill: [190, 195, 201], lw: 0.05, color: [150, 155, 160] }); }
  const mine = M.parts.filter(p => p.module === rl && p.mark !== 'T1' && (p.name.includes(' L door') || p.name.includes(' L hinge') || p.name.includes(' L latch') || p.name.includes(' L stile cap')));
  const order = (p) => p.mark === 'T3' ? 0 : p.kind === 'door' ? 1 : 2;
  for (const p of mine.slice().sort((a, b) => order(a) - order(b))) {
    if (p.kind === 'mesh') continue;
    const fill = p.kind === 'hinge' || p.kind === 'latch' ? YEL : p.mark === 'T3' ? WHITE : p.mark === 'T4' || p.mark === 'T5' ? [120, 126, 134] : null;
    for (const sol of p.solids) v.boxRect(V.partBox({ solids: [sol] }), fill ? { fill, lw: 0.2 } : { lw: LW_VIS * 0.85 });
  }
  v.dim([0, y1, z0], [0, y0, z0], -12, 'h', f0(G.doorW));
  v.chain([y1, y1 - A, y0 + A, y0].map(y => [0, y, z0]), -6, 'h', { size: 5.6 });
  // latch-edge side: heights; hinge-edge side: hinge positions
  const hEdge = hinge === 'rear' ? y0 : y1, lEdge = hinge === 'rear' ? y1 : y0, sgL = hinge === 'rear' ? -1 : 1;
  v.dim([0, lEdge, z0], [0, lEdge, z1], 17 * sgL, 'v', f0(G.doorH));
  v.dim([0, lEdge, z0 + A], [0, lEdge, z1 - A], 11 * sgL, 'v', f0(G.doorH - 2 * A), { size: 5.8 });
  v.dim([0, lEdge, z0], [0, lEdge, G.latchZ], 5 * sgL, 'v', `${f0(G.latchZ - z0)} latch`, { size: 5.6 });
  const zz = [z0, z0 + G.hingeEnd, z0 + G.hingeEnd + G.hingeL, z1 - G.hingeEnd - G.hingeL, z1 - G.hingeEnd, z1];
  v.chain(zz.map(z => [0, hEdge, z]), -9 * sgL, 'v', { size: 5.6 });
  const topY = v.P([0, 0, P.height])[1] - 3; // labels go above the surrounding frame
  const hingeEdgeY = hinge === 'rear' ? y0 : y1, latchEdgeY = hinge === 'rear' ? y1 : y0;
  { const p = v.P([0, hingeEdgeY - (hinge === 'rear' ? 2.5 : -2.5), z1 - G.hingeEnd - 40]); s.leader(p, [p[0] + (hinge === 'rear' ? 4 : -4), topY + 9], `${hinge.toUpperCase()} edge: 2 x H1 hinge`, { size: 5.8, ha: hinge === 'rear' ? 'right' : 'left', landing: 2, weight: 'bold' }); }
  { const p = v.P([0, latchEdgeY + (hinge === 'rear' ? 8 : -8), G.latchZ]); s.leader(p, [p[0] + (hinge === 'rear' ? -6 : 6), topY + 9], `${hinge === 'rear' ? 'FRONT' : 'REAR'} edge: H2 latch on T3 plate`, { size: 5.8, ha: hinge === 'rear' ? 'left' : 'right', landing: 2, weight: 'bold' }); }
  const nw = meshP ? meshP.note : '';
  s.leader(v.P([0, (y0 + y1) / 2 + 25, z0 + 225]), v.P([0, (y0 + y1) / 2 - 60, z0 + 150]), `M2: ${f0(P.meshPitch)}x${f0(P.meshPitch)}x${f0(P.meshWire)} mesh, ${nw}`, { size: 5.8, ha: 'left', box: true });
  s.text(v.P([0, y1, 0])[0], topY + 17, `D1 stiles ${f0(G.doorH)} + D2 rails ${f0(G.doorW - 2 * A)}, SHS ${A}x${A}x${Number(P.shsT).toFixed(1)}`, { size: 6, color: GREY });
  const nRear = P.hinges.reduce((a, x) => a + (x.L === 'rear' ? 1 : 0) + (x.R === 'rear' ? 1 : 0), 0), nFront = 2 * N - nRear;
  const dcx = v.P([0, (y0 + y1) / 2, 0])[0];
  s.viewLabel(dcx, 84, `DOOR (make ${2 * N})`, `1:${sd}, outside view of row ${rl}'s left door. Right-hand doors are mirrored.`);
  s.text(dcx, 76.4, nRear && nFront ? `${nRear} doors hinge on the rear edge and ${nFront} on the front edge: same parts, the hinges and latch swap edges.` : `All ${2 * N} doors hinge on the ${nRear ? 'rear' : 'front'} edge.`, { size: 6.2, color: GREY, ha: 'center' });

  // details
  const g = P.doorGap, k = A <= 25 ? 0.5 : A <= 35 ? 0.4 : 1 / 3, kLab = A <= 25 ? '1:2' : A <= 35 ? '1:2.5' : '1:3';
  const hd = G.hingeD;
  const det = (ox, oy, side) => {
    const Pp = (xo, yy) => [ox + yy * k, oy - xo * k];
    shsSection(s, ...Pp(-h, -h), A * k, P.shsT * k, P.shsR * k);
    shsSection(s, ...Pp(-h, g + h), A * k, P.shsT * k, P.shsR * k);
    const a2 = Pp(-h + 2 + P.meshWire / 2, g + A);
    s.rect(a2[0], a2[1], 34 * k, P.meshWire * k, { fill: [184, 190, 198], lw: 0.15 });
    const cw = Pp(-h - 2, g + A + 20); s.circle(cw[0], cw[1], P.meshWire / 2 * k, { fill: [154, 160, 168], lw: 0.15 });
    s.text(Pp(-h, g + A + 36)[0], Pp(-h, 0)[1], 'mesh', { size: 5.2, color: GREY, va: 'middle' });
    const fe = side === 'hinge' ? 70 : 112;
    s.line([Pp(0, -A - 14)[0], Pp(0, fe)[0]], [Pp(0, 0)[1], Pp(0, 0)[1]], { lw: LW_DIM, color: GREY, dash: [2, 0.7, 0.4, 0.7] });
    s.text(Pp(0, fe)[0] + 1, Pp(0, 0)[1], 'outside face', { size: 5, color: GREY, va: 'middle' });
    s.text(Pp(0, -A - 14)[0] - 1, Pp(-A, 0)[1] + 1.5, 'inside', { size: 5, color: GREY, ha: 'right' });
    s.text(Pp(-h, -h)[0], Pp(-A, 0)[1] + 1.5, 'post', { size: 5.4, ha: 'center', color: GREY });
    s.text(Pp(-h, g + h)[0], Pp(-A, 0)[1] + 1.5, 'door', { size: 5.4, ha: 'center', color: GREY });
    s.dim(Pp(-A, 0), Pp(-A, g), Pp(-A, 0)[1] + 5.5, 'h', `${f0(g)} gap`, { size: 5.4 });
    if (side === 'hinge') {
      const c = Pp(hd / 2, g / 2);
      s.circle(c[0], c[1], hd / 2 * k, { fill: YEL, lw: 0.25 });
      s.circle(c[0], c[1], hd * 0.19 * k, { fill: WHITE, lw: 0.15 });
      s.dim(Pp(0, g / 2 - hd / 2), Pp(hd, g / 2 - hd / 2), Pp(0, -30)[0], 'v', f0(hd), { size: 5.4 });
      s.leader(c, [c[0] + 14, c[1] - 3], `H1 barrel ${f0(hd)}, axis on the gap centre,`, { size: 5.4, ha: 'left', landing: 2 });
      [`${f0(hd / 2)} outside the face. Lower half welded to the post,`, 'upper half to the door. ' + (G.hingeReach >= 1 ? 'Each half reaches about' : 'Each half barely reaches'),
       G.hingeReach >= 1 ? `${f0(G.hingeReach)} past its tube's corner radius onto the flat.` : 'the flat of its tube: use a smaller gap.'].forEach((t, i) => s.text(c[0] + 17, c[1] - 6.6 - 3.6 * i, t, { size: 5.4 }));
      s.text(ox - 22, oy + 27, 'DETAIL 1   HINGE EDGE', { size: 7.2, weight: 'bold' });
      s.text(ox - 22, oy + 23.2, `plan section, ${kLab}`, { size: 5.6, color: GREY });
    } else {
      const T = C.LATCH.plateT, ca = T + C.LATCH.tubeOD / 2;
      let a3 = Pp(T, g); s.rect(a3[0], a3[1], C.LATCH.plateW * k, T * k, { fill: [156, 163, 175], lw: 0.15 });
      a3 = Pp(T, -A); s.rect(a3[0], a3[1], A * k, T * k, { fill: [156, 163, 175], lw: 0.15 });
      for (const [ya, yb] of [[g, g + 25], [g + 70, g + 90], [-A, 0]]) { const a4 = Pp(ca + C.LATCH.tubeOD / 2, ya); s.rect(a4[0], a4[1], (yb - ya) * k, C.LATCH.tubeOD * k, { fill: YEL, lw: 0.2 }); }
      const a5 = Pp(ca + C.LATCH.boltD / 2, -20); s.rect(a5[0], a5[1], (20 + g + C.LATCH.plateW) * k, C.LATCH.boltD * k, { fill: YEL2, lw: 0.15 });
      const hc = Pp(ca, g + 35); s.circle(hc[0], hc[1], 5 * k, { fill: YEL2, lw: 0.15 });
      const a6 = Pp(T + C.LATCH.t4, g + 42); s.rect(a6[0], a6[1], 3 * k, C.LATCH.t4 * k, { fill: [107, 114, 128], lw: 0.15 });
      let p = Pp(ca + 6, -14); s.leader(p, [p[0] - 3, p[1] - 10], 'keeper + T5 packer', { size: 5.4, ha: 'right', landing: 2 });
      p = Pp(T / 2, g + 60); s.leader(p, [p[0] + 4, p[1] - 26], `T3 cover plate ${C.LATCH.plateW} x ${C.LATCH.plateZ[1] - C.LATCH.plateZ[0]} x 3`, { size: 5.4, ha: 'left', landing: 2 });
      p = Pp(T + 30, g + 43.5); s.leader(p, [p[0] + 14, p[1] - 2], 'T4 stop tab (Detail 4)', { size: 5.4, ha: 'left', landing: 2 });
      s.text(ox - 22, oy + 27, 'DETAIL 2   LATCH EDGE', { size: 7.2, weight: 'bold' });
      s.text(ox - 22, oy + 23.2, `plan section at latch height, ${kLab}, shown locked. Mirror for the other hand`, { size: 5.6, color: GREY });
    }
  };
  det(192, 238, 'hinge');
  det(192, 180, 'latch');
  // detail 3: door stop
  { const ox3 = 214, oy3 = 124;
    const P3 = (xo, z) => [ox3 + xo * k, oy3 + (z - (P.height - A)) * k];
    shsSection(s, ...P3(-h, P.height - h), A * k, P.shsT * k, P.shsR * k);
    shsSection(s, ...P3(-h, G.doorZ1 - h), A * k, P.shsT * k, P.shsR * k);
    let a = P3(-A - 3, G.doorZ1 - 10); s.rect(a[0], a[1], 3 * k, 30 * k, { fill: [107, 114, 128], lw: 0.15 });
    a = P3(-60, P.height); s.rect(a[0], a[1], 60 * k, P.tRoof * k, { fill: [201, 206, 214], lw: 0.12 });
    s.line([P3(0, 0)[0], P3(0, 0)[0]], [P3(0, G.doorZ1 - 40)[1], P3(0, P.height + 8)[1]], { lw: LW_DIM, color: GREY, dash: [2, 0.7, 0.4, 0.7] });
    s.text(P3(0, 0)[0] + 1, P3(0, P.height + 8)[1], 'outside', { size: 5, color: GREY, va: 'middle' });
    s.dim(P3(0, G.doorZ1), P3(0, P.height - A), P3(0, 0)[0] + 8, 'v', f0(P.doorGap), { size: 5.4 });
    s.dim(P3(-A - 3, G.doorZ1 - 10), P3(-A - 3, G.doorZ1), P3(-A - 3, 0)[0] - 7, 'v', '10', { size: 5.4 });
    const p = P3(-A - 1.5, G.doorZ1 + 6); s.leader(p, [p[0] - 8, p[1] + 9], 'T1 stop tab 25 x 30 x 3', { size: 5.4, ha: 'right', landing: 2 });
    s.text(P3(-h, P.height - h)[0], P3(0, P.height + 6)[1] + 2.5, 'end rail', { size: 5.2, ha: 'center', color: GREY });
    s.text(P3(-h, 0)[0], P3(0, G.doorZ1 - A)[1] - 3.5, 'door top rail', { size: 5.2, ha: 'center', color: GREY });
    s.text(170, 152, 'DETAIL 3   DOOR STOP', { size: 7.2, weight: 'bold' });
    s.text(170, 148.2, `section at a stop tab, ${kLab}`, { size: 5.6, color: GREY });
  }
  // detail 4: latch outside view 1:2.5
  { const k4 = 0.4, ox4 = 188, oy4 = 48;
    const P4 = (d, z) => [ox4 + d * k4, oy4 + z * k4];
    const zlo = -66, zhi = 56;
    for (const [d0, d1] of [[-A - g, -g], [0, A]]) for (const dd of [d0, d1]) s.line([P4(dd, zlo)[0], P4(dd, zlo)[0]], [P4(dd, zlo)[1], P4(dd, zhi)[1]], { lw: LW_VIS * 0.8 });
    const [pz0, pz1] = C.LATCH.plateZ;
    let a = P4(0, pz0); s.rect(a[0], a[1], C.LATCH.plateW * k4, (pz1 - pz0) * k4, { fill: [209, 213, 219], lw: 0.2 });
    a = P4(-A - g, -20); s.rect(a[0], a[1], A * k4, 40 * k4, { fill: [156, 163, 175], lw: 0.15 });
    for (const [d0, d1] of [[0, 25], [70, 90], [-A - g, -g]]) { a = P4(d0, -10); s.rect(a[0], a[1], (d1 - d0) * k4, 20 * k4, { fill: YEL, lw: 0.2 }); }
    a = P4(-g - 20, -6); s.rect(a[0], a[1], (C.LATCH.plateW + g + 20) * k4, 12 * k4, { fill: YEL2, lw: 0.15 });
    a = P4(30, -32); s.rect(a[0], a[1], 10 * k4, 26 * k4, { fill: YEL2, lw: 0.15 });
    a = P4(42, -35); s.rect(a[0], a[1], 3 * k4, 25 * k4, { fill: [75, 85, 99], lw: 0.15 });
    const yt = P4(0, pz1)[1];
    s.dim(P4(0, pz1), P4(C.LATCH.plateW, pz1), yt + 4.5, 'h', f0(C.LATCH.plateW), { size: 5.4 });
    s.dim(P4(0, pz1), P4(35, pz1), yt + 10, 'h', '35', { size: 5.4 });
    s.dim(P4(0, pz1), P4(42, pz1), yt + 15.5, 'h', '42', { size: 5.4 });
    const xr = P4(C.LATCH.plateW, 0)[0];
    const feat = { [pz0]: C.LATCH.plateW, [-35]: 45, [-10]: 45, 0: C.LATCH.plateW, [pz1]: C.LATCH.plateW };
    for (const [za, zb] of [[pz0, -35], [-35, -10], [-10, 0], [0, pz1]]) s.dim(P4(feat[za], za), P4(feat[zb], zb), xr + 5, 'v', f0(Math.abs(zb - za)), { size: 5.2 });
    s.dim(P4(C.LATCH.plateW, pz0), P4(C.LATCH.plateW, pz1), xr + 11, 'v', f0(pz1 - pz0), { size: 5.4 });
    s.text(P4(-A / 2 - g, 0)[0], P4(0, zlo)[1] - 3.2, 'post', { size: 5.2, color: GREY, ha: 'center' });
    s.text(P4(A / 2, 0)[0], P4(0, zlo)[1] - 3.2, 'stile', { size: 5.2, color: GREY, ha: 'center' });
    s.text(P4(48, -24)[0], P4(48, -24)[1], 'T4', { size: 5.2, va: 'middle', weight: 'bold' });
    s.text(P4(35, -41)[0], P4(35, -41)[1], 'handle', { size: 5.2, va: 'middle', ha: 'center' });
    s.text(P4(50, pz0 + 12)[0], P4(50, pz0 + 12)[1], 'T3', { size: 5.2, va: 'middle', ha: 'center', weight: 'bold' });
    s.text(170, 98, 'DETAIL 4   LATCH, OUTSIDE VIEW', { size: 7.2, weight: 'bold' });
    s.text(170, 94.2, `1:2.5, shown locked, latch to the left. Mirror for the other hand. Heights from the bolt centre line`, { size: 5.6, color: GREY });
  }
  s.para(18, 70, s.wrap(`The door frame is flush with the cage's outer face. The mesh sits on the SHS centre line, ${f0(h - P.meshWire / 2 - 2)} in from that face. Two T1 stop tabs per door on the inside face of the top end rail, 30 in from each end, overlapping by 10. Fit hinges lift-off way up (door half on top) so the door can come off for cleaning. Cap the stile ends (H5). Latch: lift the handle up past T4, slide the bolt 20 into the keeper and let the handle drop behind T4. Put a pin or padlock through T4 for travel so the handle can't lift. T3 covers the mesh so a dog can't reach the handle.` + (M.parts.some(q => q.mark === 'T6') ? ` On a post shared by two rows each keeper and its packer (T6) take only their own half of the post, ${f0(G.halfKeeper)} wide, and the bolt goes ${f0(Math.min(20, G.halfKeeper))} in.` : ''), 128, 6), { size: 6 });

  // panels: one scale for the whole group, chosen so everything fits the right-hand column
  const PX = 266, PX1 = 410, PY0 = 46;
  s.heading(PX, 283, 'SHEET + MESH PANELS');
  const cntMark = (m) => M.parts.filter(p => p.mark === m).length;
  const has = (m) => cntMark(m) > 0;
  const cn = P.notchClear;
  // floor blank: on a shared frame it runs between rail centre lines, so the end notches are halved
  const fy0 = G.shared ? h : 0, FD = G.shared ? D - A : D;
  const notches = [[h, h], [h, D - h], [P.width - h, h], [P.width - h, D - h], [G.XC, h], [G.XC, D - h]].map(([xc, yc]) => {
    const y0 = Math.max(0, yc - h - cn - fy0), y1 = Math.min(FD, yc + h + cn - fy0);
    return [xc - h - cn, y0, A + 2 * cn, y1 - y0];
  });
  const fholes = (P.trayBolts && G.trayBoltJoist) ? [G.trayBoltJoist, P.width - G.trayBoltJoist].flatMap(xb => [P.trayBoltInset, D - P.trayBoltInset].map(yb => [xb, yb - fy0, (G.trayBoltD + 1) / 2])) : [];
  const bw = G.XC - h - A, oh = G.openH, ow = G.openW;
  // hole centres in a w x hh blank for one arrangement, from its lower-left corner
  const grid = (w, hh, sp) => C.holePattern(w, hh, sp).map(([du, dv]) => [w / 2 + du, hh / 2 + dv, sp.d / 2]);
  const places = C.holePlaces(P, G);
  const placeWord = { front: 'front face', middle: 'between rows', rear: 'rear face' };
  const small = [];
  const ts = `${Number(P.tSheet).toFixed(1)} ${metalShort(P, 'sheet')}`;
  // with mixed metals the infills are folded trays: draw the flat blank (fold lines dashed)
  const tray = (w, hh, f, opt, sub) => G.mixed ? [w + 2 * f, hh + 2 * f, Object.assign({ tray: f, holes: (opt.holes || []).map(c => [c[0] + f, c[1] + f, c[2]]) }, opt.holes ? {} : {}), sub + `, tray: ${f0(f)} flanges`] : [w, hh, opt, sub];
  const addInfill = (w, hh, f, lab, sub, opt) => { const [W2, H2, o2, s2] = tray(w, hh, f, opt, sub); small.push([W2, H2, lab, s2, o2]); };
  if (has('S4')) addInfill(bw, oh, G.trayF, 'S4  SOLID WALL', `${ts}, make ${cntMark('S4')}`, {});
  // walls with holes: one blank per arrangement (S5, or S5a, S5b, S5c when the faces differ)
  const s5 = [];
  for (const k of ['front', 'middle', 'rear']) {
    const u = places[k];
    if (!u.used || u.style !== 'infill') continue;
    const g = s5.find(x => x.mark === u.mark);
    if (g) g.where.push(placeWord[k]); else s5.push({ mark: u.mark, where: [placeWord[k]], sp: P.holes[k] });
  }
  for (const g of s5) { const hl = grid(bw, oh, g.sp); addInfill(bw, oh, G.trayF, `${g.mark}  WALL, AIR HOLES`, `${ts}, make ${cntMark(g.mark)}, ${g.where.join(' + ')}, ${hl.length} x ${C.holeText(g.sp)}`, { holes: hl }); }
  if (has('S7')) { const hl = P.wallMiddle === 'perforated' ? grid(bw, oh, P.holes.middle) : []; addInfill(bw, oh, G.divF, 'S7  WALL BETWEEN ROWS', `${ts}, make ${cntMark('S7')}, on the rail centre line` + (hl.length ? `, ${hl.length} x ${C.holeText(P.holes.middle)}` : ''), hl.length ? { holes: hl } : {}); }
  if (has('S3')) addInfill(ow, oh, G.divF, 'S3  DIVIDER', `${ts}, make ${cntMark('S3')}`, {});
  if (has('S6')) { const hl = grid(ow, oh, P.holes.divider); addInfill(ow, oh, G.divF, 'S6  DIVIDER, AIR HOLES', `${ts}, make ${cntMark('S6')}, ${hl.length} x ${C.holeText(P.holes.divider)}`, { holes: hl }); }
  if (has('M1')) { const xs_ = C.wirePositions(bw, P).map(q => bw / 2 + q), zs_ = C.wirePositions(oh, P).map(q => oh / 2 + q); small.push([bw, oh, 'M1  MESH WALL', `make ${cntMark('M1')}, ${xs_.length} x ${zs_.length} wires`, { mesh: [xs_, zs_], fill: WHITE }]); }
  { const dw = G.doorW - 2 * A, dh = G.doorH - 2 * A; const xs_ = C.wirePositions(dw, P).map(q => dw / 2 + q), zs_ = C.wirePositions(dh, P).map(q => dh / 2 + q); small.push([dw, dh, 'M2  DOOR MESH', `make ${cntMark('M2')}, ${xs_.length} x ${zs_.length} wires`, { mesh: [xs_, zs_], fill: WHITE }]); }
  // wide panels under the floor: the roof when it has holes, and the sheet clamped between rows
  const wide = [];
  const roofRows = S.bom.filter(r => r.mark === 'S2');
  if (P.roofType === 'perforated' && roofRows.length) {
    const sp = P.holes.roof, bh = D - 2 * A, holes = [];
    for (const [xa, xb] of G.roofBays) for (const [du, dv] of C.holePattern(xb - xa, bh, sp)) holes.push([(xa + xb) / 2 + du, A + bh / 2 + dv, sp.d / 2]);
    const r0 = roofRows[0], more = roofRows.slice(1).map(r => `${r.qty} x ${f0(r.size[0])} x ${f0(r.size[1])} for the middle rows, same holes, ends on the rail centre lines`);
    wide.push({ w: r0.size[0], h: r0.size[1], holes, label: 'S2  ROOF, AIR HOLES',
      sub: `${Number(P.tRoof).toFixed(1)} ${metalShort(P, 'sheet')}, make ${r0.qty}, ${holes.length} x ${C.holeText(sp)} over the open bays of the top frame` + (more.length ? `; ${more.join('; ')}` : '') + `. ${G.mixed ? 'Riveted to' : 'Sits on'} the top frame.` });
  }
  if (has('S8')) {
    const holes = [], sp = P.holes.middle;
    if (P.wallMiddle === 'perforated') for (const [xa, xb] of G.bays) for (const [du, dv] of C.holePattern(xb - xa, oh, sp)) holes.push([xa + (xb - xa) / 2 + du, G.zFloor + oh / 2 + dv, sp.d / 2]);
    const nAir = holes.length;
    if (G.bolted) for (const xb of [P.joinBoltInset, P.width - P.joinBoltInset]) holes.push([xb, P.height - h, 5.5]);
    wide.push({ w: P.width, h: P.height + P.tRoof, holes, label: 'S8  SHEET BETWEEN ROWS',
      sub: `${ts}, make ${cntMark('S8')}, full face, clamped between the frames${nAir ? `, ${nAir} x ${C.holeText(sp)} in the bays` : ''}${G.bolted ? ', 2 x Ø11 for the join bolts' : ''}` });
  }
  const S1TOP = 266;
  const WIDE_W = PX1 - PX + 2;
  const nLines = (sub, w) => s.wrap(sub, w, 5.5).length;
  for (const wp of wide) wp.extra = 3.4 * (nLines(wp.sub, WIDE_W) - 1);
  // each wide panel sits 32 under the one above (dimension, then its own label); the grid starts under the last
  const gridTopFor = (sc) => { let bottom = S1TOP - FD / sc; for (const wp of wide) bottom -= 32 + wp.extra + wp.h / sc; return wide.length ? bottom - 13 : bottom - 24; };
  const layoutFor = (sc) => {
    if (P.width / sc > 124 || FD / sc > 46) return null;
    const gridTop = gridTopFor(sc);
    const maxW = Math.max(...small.map(p => p[0] / sc)), colW = maxW + 17;
    if (maxW + 10 > PX1 - PX) return null;
    const cols = Math.max(1, Math.min(3, Math.floor((PX1 - PX - maxW - 10) / colW) + 1));
    const subW = cols > 1 ? colW - 3 : WIDE_W;
    const rows = [];
    small.forEach((p, i) => { const r = Math.floor(i / cols); rows[r] = Math.max(rows[r] || 0, p[1] / sc + 20 + 3.4 * (nLines(p[3], subW) - 1)); });
    const total = rows.reduce((a, b) => a + b, 0);
    if (gridTop - total < PY0) return null;
    return { sc, gridTop, colW, cols, rows, subW };
  };
  let lay = null;
  for (const sc of [15, 20, 25, 30, 40, 50, 75, 100]) { lay = layoutFor(sc); if (lay) break; }
  if (!lay) lay = { sc: 100, gridTop: gridTopFor(100), colW: 40, cols: 3, rows: [], subW: 37 };
  const k2 = 1 / lay.sc;
  s.text(PX, 278.6, `1:${lay.sc}. ` + (G.mixed ? 'Infills are folded trays riveted into the frame openings: flat blanks shown, fold up on the dashed lines.' : 'Nominal sizes of the frame openings: measure the welded frame and cut infills 1 to 2 under.'), { size: 6.0, color: GREY });
  s.text(PX, 275.4, G.mixed ? 'Make trays 1 to 2 under the measured openings. Air holes centred on the face. Weld every mesh wire end to the frame.' : 'Weld every mesh wire end to the frame. Laser or plasma cut air holes and deburr both sides.', { size: 6.0, color: GREY });
  const panel = (x, y, w, hh, label, sub, opt) => {
    opt = opt || {};
    if (opt.tray) { // blank with square corner notches and dashed fold lines
      const f = opt.tray * k2, W2 = w * k2, H2 = hh * k2;
      const pts = [[x + f, y], [x + W2 - f, y], [x + W2 - f, y + f], [x + W2, y + f], [x + W2, y + H2 - f], [x + W2 - f, y + H2 - f], [x + W2 - f, y + H2], [x + f, y + H2], [x + f, y + H2 - f], [x, y + H2 - f], [x, y + f], [x + f, y + f]];
      s.color([229, 231, 235], 'fill'); s.color(INK); s.doc.setLineWidth(LW_VIS * 0.8);
      s.doc.lines(pts.slice(1).concat([pts[0]]).map((q, i) => [q[0] - pts[i][0], -(q[1] - pts[i][1])]), pts[0][0], PH - pts[0][1], [1, 1], 'FD', true);
      s.line([x + f, x + W2 - f], [y + f, y + f], { lw: LW_DIM, dash: [1.2, 0.8] }); s.line([x + f, x + W2 - f], [y + H2 - f, y + H2 - f], { lw: LW_DIM, dash: [1.2, 0.8] });
      s.line([x + f, x + f], [y + f, y + H2 - f], { lw: LW_DIM, dash: [1.2, 0.8] }); s.line([x + W2 - f, x + W2 - f], [y + f, y + H2 - f], { lw: LW_DIM, dash: [1.2, 0.8] });
    } else s.rect(x, y, w * k2, hh * k2, { fill: opt.fill || [229, 231, 235], lw: LW_VIS * 0.8 });
    for (const n of opt.notches || []) s.rect(x + n[0] * k2, y + n[1] * k2, n[2] * k2, n[3] * k2, { fill: WHITE, lw: 0 });
    for (const c of opt.holes || []) s.circle(x + c[0] * k2, y + c[1] * k2, Math.max(c[2] * k2, 0.3), { fill: WHITE, lw: 0.1 });
    if (opt.mesh) { for (const xx of opt.mesh[0]) s.line([x + xx * k2, x + xx * k2], [y, y + hh * k2], { lw: 0.08, color: GREY }); for (const zz of opt.mesh[1]) s.line([x, x + w * k2], [y + zz * k2, y + zz * k2], { lw: 0.08, color: GREY }); }
    // label on top, subtitle lines under it (wrapped to the room given), then the blank
    const top = y + hh * k2, lines = s.wrap(sub, opt.maxW || 200, 5.5);
    lines.forEach((ln, i) => s.text(x, top + 2.0 + 3.4 * (lines.length - 1 - i), ln, { size: 5.5, color: GREY }));
    s.text(x, top + 5.6 + 3.4 * (lines.length - 1), label, { size: 6.6, weight: 'bold' });
    return [w * k2, hh * k2];
  };
  const y1p = S1TOP - FD * k2;
  const floorWord = P.floorType === 'tread' ? `${Number(P.tFloor).toFixed(1)} ${metalShort(P, 'sheet')} tread plate` : `${Number(P.tFloor).toFixed(1)} ${metalShort(P, 'sheet')}`;
  const wh = panel(PX, y1p, P.width, FD, `S1  FLOOR`, `${floorWord}, make ${cntMark('S1')}, notched ${f0(cn)} clear round the posts${G.shared ? ', ends on the rail centre lines' : ''}${fholes.length ? `, 4 x Ø${f0(G.trayBoltD + 1)} holes ${f0(G.trayBoltJoist)} in from the ends, ${f0(P.trayBoltInset - fy0)} from the long edges` : ''}`, { notches, holes: fholes, maxW: 400 });
  s.dim([PX, y1p], [PX + wh[0], y1p], y1p - 5.5, 'h', f0(P.width), { size: 5.8 });
  s.dim([PX + wh[0], y1p], [PX + wh[0], y1p + wh[1]], PX + wh[0] + 5, 'v', f0(FD), { size: 5.8 });
  if (P.roofType !== 'perforated') {
    s.text(PX, y1p - 13, 'S2  ROOF', { size: 6.6, weight: 'bold' });
    const roofSizes = roofRows.map(r => `${r.qty} x ${f0(r.size[0])} x ${f0(r.size[1])}`).join(' + ');
    s.text(PX + s.tw('S2  ROOF', 6.6, 'bold') + 2.5, y1p - 13, `${Number(P.tRoof).toFixed(1)} ${metalShort(P, 'sheet')}: plain ${roofSizes}, no notches or holes. ${G.mixed ? 'Riveted to' : 'Sits on'} the top frame.`, { size: 5.5, color: GREY });
  }
  let bottom = y1p;
  for (const wp of wide) {
    const ph = wp.h * k2, y = bottom - 32 - wp.extra - ph;
    panel(PX, y, wp.w, wp.h, wp.label, wp.sub, { holes: wp.holes, maxW: WIDE_W });
    s.dim([PX, y], [PX + wp.w * k2, y], y - 5.5, 'h', f0(wp.w), { size: 5.6 });
    s.dim([PX + wp.w * k2, y], [PX + wp.w * k2, y + ph], PX + wp.w * k2 + 4.5, 'v', f0(wp.h), { size: 5.6 });
    bottom = y;
  }
  let rowTop = lay.gridTop;
  small.forEach(([w, hh, lab, sub, opt], i) => {
    const r = Math.floor(i / lay.cols), c = i % lay.cols;
    if (c === 0 && r > 0) rowTop -= lay.rows[r - 1];
    const ph = hh * k2, x = PX + c * lay.colW, y = rowTop - 8 - 3.4 * (nLines(sub, lay.subW) - 1) - ph;
    panel(x, y, w, hh, lab, sub, Object.assign({ maxW: lay.subW }, opt));
    s.dim([x, y], [x + w * k2, y], y - 5.5, 'h', f0(w), { size: 5.6 });
    s.dim([x + w * k2, y], [x + w * k2, y + ph], x + w * k2 + 4.5, 'v', f0(hh), { size: 5.6 });
  });
}

/* ------------------------------------------------------------------ page 5: cut list, stock, notes */
const RH = 4.3;
function countMarks(sheets) {
  const c = {};
  for (const sh of sheets) for (const p of sh.placed) c[p.mark] = (c[p.mark] || 0) + 1;
  return Object.entries(c).map(([m, n]) => `${n} ${m}`).join(', ');
}
function metres(mm) { return (Math.ceil(mm * 1.1 / 100) / 10).toFixed(1) + ' m'; }
function p5Data(M, S) {
  const { P, G } = M;
  const N = P.rows, b = S.bom;
  const q = (m) => b.filter(r => r.mark === m).reduce((a, r) => a + r.qty, 0);
  const row = (m) => b.find(r => r.mark === m);
  const fm3 = C.metalOf(P, 'frame'), fA = fm3 === 'aluminium', fSS = fm3 === 'stainless';
  const fa = fA ? ' alum.' : fSS ? ' st.st.' : '';
  const SHS = `SHS ${P.shs}x${P.shs}x${Number(P.shsT).toFixed(1)}${fa}`;
  const linear = [
    ['F1', MARK_RGB.F1, 'Long rail', SHS, 'square cut'], ['F1H', MARK_RGB.F1H, 'Long rail, top, joined side', SHS, `2 x 11 holes, ${f0(P.joinBoltInset)} from ends`],
    ['F2', MARK_RGB.F2, 'Post', SHS, ''], ['F3', MARK_RGB.F3, 'Cross member', SHS, 'ends, centre, joists, roof'],
    ['F3H', MARK_RGB.F3H, 'Joist, tray bolts', SHS, `${f0(P.trayBoltInset - P.shs)} from ends: Ø${f0(G.crush ? G.crush.od + 0.5 : G.trayBoltD + 1)} top, Ø${f0(G.trayBoltD + 1)} bottom`],
    ['D1', [44, 46, 51], 'Door stile', SHS, ''], ['D2', [44, 46, 51], 'Door rail', SHS, 'between stiles'],
    ['T1', null, 'Door stop tab', `Flat 25x3${fa}`, ''], ['T3', null, 'Latch cover plate', `Flat 100x3${fa}`, 'on door, at latch'],
    ['T4', null, 'Latch stop tab', `Flat 25x3${fa}`, '6 hole, see Detail 4'], ['T5', null, 'Keeper packer', `Flat ${P.shs}x3${fa}`, 'on post, under keeper'],
    ['T6', null, 'Keeper packer, half', `Flat ${G.halfKeeper}x3${fa}`, 'on posts shared by two rows'],
    ['T2', null, 'Crush tube', G.crush ? `Tube ${G.crush.od} OD x ${G.crush.wall.toFixed(1)}${fa}` : '', 'in F3H joists'],
  ].filter(r => q(r[0]) > 0).map(r => [r[0], r[1], r[2], r[3], f0(row(r[0]).size), q(r[0]), r[4]]);
  const sheetDesc = { S1: P.floorType === 'tread' ? 'Floor, tread plate' : 'Floor (notched)', S2: 'Roof', S3: 'Divider', S4: 'Solid wall', S5: 'Wall with air holes', S6: 'Divider with air holes',
    S7: 'Wall between rows', S8: 'Sheet between rows', M1: 'Mesh wall', M2: 'Door mesh' };
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  const sheetRows = [];
  // where each wall-with-holes blank goes, when the faces have different arrangements (S5a, S5b, S5c)
  const hp = C.holePlaces(P, G), s5where = {};
  for (const k of ['front', 'middle', 'rear']) if (hp[k].used && hp[k].style === 'infill') s5where[hp[k].mark] = (s5where[hp[k].mark] ? s5where[hp[k].mark] + ' + ' : '') + k;
  const order = ['S1', 'S2', 'S3', 'S6', 'S4', 'S5', 'S7', 'S8', 'M1', 'M2'];
  const sheetMarks = [...new Set(b.filter(r => Array.isArray(r.size)).map(r => r.mark))]
    .sort((x, y) => (order.indexOf(x.slice(0, 2)) - order.indexOf(y.slice(0, 2))) || x.localeCompare(y));
  for (const m of sheetMarks) {
    for (const r of b.filter(x => x.mark === m)) {
      const mat = cap(matShortOf(r.material));
      const stockTxt = r.stock.startsWith('Weldmesh') ? `${mat} mesh ${r.stock.slice(9)}` : r.stock.startsWith('Tread') ? `${mat} tread ${r.stock.slice(12)}` : `${mat} sheet ${r.stock.slice(6)}`;
      const d = r.place && P.holes[r.place] ? P.holes[r.place].d : 0;
      let note = r.tray ? `tray blank, ${f0(r.tray.f)} flanges${r.holes ? `, ${r.holes} x Ø${f0(d)} holes` : ''}` : r.holes ? `${r.holes} x Ø${f0(d)} holes each` : (r.note || '').replace('wall infill, ', '');
      if (m === 'S8') note = `clamped, ${r.holes ? `${r.holes} x Ø${f0(d)} holes` : 'no air holes'}${G.bolted ? ', 2 x Ø11' : ''}`;
      if (m === 'S1' && G.shared) note = 'ends on rail centre lines';
      if (m === 'S2' && G.shared && N > 1) note = (r.size[1] > P.depth - P.shs + 0.5 ? 'end rows' : 'middle rows') + (r.holes ? `, ${r.holes} x Ø${f0(d)} holes` : '');
      const desc = sheetDesc[m] || (m.startsWith('S5') ? `Wall with holes, ${s5where[m] || ''}` : m);
      sheetRows.push([m, m === 'S2' && r.holes ? 'Roof with air holes' : desc, stockTxt, `${f0(r.size[0])} x ${f0(r.size[1])}`, r.qty, note]);
    }
  }
  // rivets where steel meets aluminium: floor and roof at 150, wall trays at 120, divider trays at 100
  let rivets = 0;
  if (G.mixed) {
    const bw = G.XC - G.h - G.A, per = (len, pitch) => Math.ceil(len / pitch);
    const qS5 = b.filter(r => r.mark.startsWith('S5')).reduce((a, r) => a + r.qty, 0);
    rivets = 2 * per(2 * P.width + 3 * P.depth, 150) * N + q('S4') * per(2 * (bw + G.openH), 120) + qS5 * per(2 * (bw + G.openH), 120)
      + (q('S3') + q('S6')) * per(2 * (G.openW + G.openH), 100) + q('S7') * per(2 * (bw + G.openH), 100);
    rivets = Math.ceil(rivets * 1.1 / 10) * 10;
  }
  const nonSteel = fA || fSS;
  const strip = G.shared ? (N + 1) * P.width + 2 * G.Ltot : 2 * (P.width + P.depth) * N;
  const hw = [
    ['H1', `Weld-on ${fA ? 'aluminium ' : fSS ? 'stainless ' : ''}bullet hinge ${f0(G.hingeD)} x ${f0(G.hingeL)}, lift-off`, q('H1')],
    ['H2', fA ? 'Stainless drop-handle slide bolt (12 bolt, 2 guides + keeper), riveted to T3 and T5' : `Weld-on ${fSS ? 'stainless ' : ''}drop-handle slide bolt: 12 bolt, 2 guides + keeper`, q('H2')],
    ['H3', `M${G.trayBoltD} ${nonSteel ? 'stainless ' : ''}bolt (${f0(P.shs + P.tFloor + 30)} + tray deck), ${fA ? 'nylon isolating washers' : '2 washers'}, nyloc, 50x50x5 plate under the tray`, q('H3')],
    ['H4', `M10 x ${G.joinBoltL} ${nonSteel ? 'stainless ' : ''}bolt, 2 washers, nyloc (joins rows${G.plateT ? ', through the S8 sheet' : ''})`, q('H4')],
    ['H5', `${P.shs}x${P.shs} plastic insert cap: rail and door-stile ends`, q('H5')],
    ['H6', 'Stainless blind rivets 4.8 (3.2 for divider trays), approx.', rivets],
    ['H7', 'Butyl tape or polyurethane sealant between steel and aluminium', G.mixed ? 'as req.' : 0],
    ['-', `Rubber mat 10 thick, approx. ${f0(G.clearL - 10)} x ${f0(G.clearW - 10)}, one per dog`, 2 * N],
    ['-', 'Rubber strip 25 x 5 under the bottom frame (m)', f0(strip / 1000)],
  ].filter(r => r[2]);
  const fm = metalWord(P, 'frame'), sm = metalWord(P, 'sheet');
  const stock = [[`SHS ${P.shs}x${P.shs}x${Number(P.shsT).toFixed(1)} ${fm} (${gradeOf(P, 'frame')})`, `${S.bars.length + 1} x ${f0(P.stockLength / 1000)} m`, `${S.shsMetres.toFixed(1)} m net, plan uses ${S.bars.length}, 1 spare`]];
  for (const [k, sheets] of Object.entries(S.nests)) {
    const n = sheets.length;
    const nm = k.startsWith('Weldmesh') ? `${C.kindOf(P, 'frame').mesh} ${k.slice(9)}`
      : k.startsWith('Tread') ? `${cap(sm)} ${C.kindOf(P, 'sheet').tread} ${k.slice(12)}` : `${cap(sm)} sheet ${k.slice(6)} (${gradeOf(P, 'sheet')})`;
    stock.push([`${cap(nm)}, ${f0(P.sheetW)} x ${f0(P.sheetH)}`, `${n} sheet${n > 1 ? 's' : ''}`, countMarks(sheets)]);
  }
  // flat bar by width
  const flats = {};
  const addFlat = (w, marks, what) => { const len = marks.reduce((a, m) => a + q(m) * (((row(m) && row(m).size) || 0) + P.kerf), 0); if (!len) return; flats[w] = flats[w] || { len: 0, what: [] }; flats[w].len += len; flats[w].what.push(what); };
  addFlat(25, ['T1'], 'door stops'); addFlat(25, ['T4'], 'stop tabs'); addFlat(P.shs, ['T5'], 'keeper packers'); addFlat(G.halfKeeper, ['T6'], 'half packers');
  for (const w of Object.keys(flats).map(Number).sort((x, y) => y - x)) stock.push([`Flat bar ${w} x 3 ${fm}`, metres(flats[w].len), flats[w].what.join(', ')]);
  if (q('T3')) stock.push([`Flat bar 100 x 3 ${fm}`, metres(q('T3') * (C.LATCH.plateZ[1] - C.LATCH.plateZ[0] + P.kerf)), `${q('T3')} latch cover plates`]);
  if (q('T2')) stock.push([`Tube ${G.crush.od} OD x ${G.crush.wall.toFixed(1)} ${fm} (or M${G.trayBoltD} crush tubes)`, metres(q('T2') * (P.shs + P.kerf)), `${q('T2')} crush tubes`]);
  // weights by category for one (front) row
  const front = C.rowLabel(N - 1, N);
  const cat = { 'Frame (SHS)': 0, 'Doors (incl. mesh)': 0, 'Floor, roof, walls': 0, 'Mesh walls': 0, 'Hinges, latches, caps, bolts': 0 };
  for (const p of M.parts) {
    if (p.module !== front) continue;
    const m = C.partMass(p);
    if (p.group === 'door' && ['door', 'mesh', 'tab'].includes(p.kind)) cat['Doors (incl. mesh)'] += m;
    else if (['frame', 'tab'].includes(p.kind)) cat['Frame (SHS)'] += m;
    else if (['floor', 'roof', 'sheet', 'perf'].includes(p.kind)) cat['Floor, roof, walls'] += m;
    else if (p.kind === 'mesh') cat['Mesh walls'] += m;
    else cat['Hinges, latches, caps, bolts'] += m;
  }
  const wrows = Object.entries(cat).filter(([, v]) => v > 0.005).map(([k2, v]) => [k2, v.toFixed(1)]);
  wrows.push([`Row ${front}`, S.masses[front].toFixed(1)]);
  const extra = [G.bolted ? 'join bolts' : '', G.plateT ? 'sheets between' : ''].filter(Boolean).join(', ');
  wrows.push([`Set of ${N} ${N === 1 ? 'row' : 'rows'}${extra ? ' + ' + extra : ''}`, S.total.toFixed(1)]);
  const nSheets = Object.values(S.nests).reduce((a, v) => a + v.length, 0);
  return { q, row, SHS, linear, sheetRows, hw, stock, wrows, front, nSheets };
}
function barsLayout(n, yTop, yBot) {
  const bh = Math.min(3.4, (yTop - yBot) / Math.max(n, 1) - 1.2);
  return bh >= 2.2 ? bh : null;
}
function nestLayout(count, width, height, sheetW, sheetH) {
  for (const cols of [2, 3, 4]) {
    const gap = 4;
    const cw = Math.min(46, (width - gap * (cols - 1)) / cols);
    const ch = cw * sheetH / sheetW;
    const rows = Math.ceil(count / cols);
    if (rows * (ch + 7.5) <= height) return { cols, cw, ch, gap };
  }
  return null;
}
function p5Geometry(D5, S, P) {
  let y = 275;
  y -= (D5.linear.length + 1) * RH + 4;
  y -= (D5.sheetRows.length + 1) * RH + 4;
  y -= (D5.hw.length + 1) * RH;
  const stockHead = y - 8;
  y = stockHead - 7 - (D5.stock.length + 1) * RH;
  const barsHead = y - 7;
  const bh = barsLayout(S.bars.length, barsHead - 3, 14);
  const wBottom = 276 - (D5.wrows.length + 1) * RH;
  const nestHead = wBottom - 5 - 3 * 2.9 - 6;
  const nl = nestLayout(D5.nSheets, 94, nestHead - 9 - 14, P.sheetW, P.sheetH);
  return { stockHead, barsHead, bh, wBottom, nestHead, nl, fits: !!(bh && nl) };
}
function drawBars(s, M, S, x, yTop, bh, barW) {
  const P = M.P;
  const kx = barW / P.stockLength;
  S.bars.forEach((bar, i) => {
    const yy = yTop - i * (bh + 1.2);
    s.text(x + 3.5, yy - bh + 0.55, String(i + 1), { size: 5.2, color: GREY, ha: 'right' });
    let xx = x + 5;
    s.rect(xx, yy - bh, P.stockLength * kx, bh, { lw: 0.15, color: GREY, fill: WHITE });
    for (const c of bar) {
      const w = c.len * kx;
      s.rect(xx, yy - bh, w, bh, { fill: MARK_RGB[c.mark] || [100, 105, 112], lw: 0.12, color: WHITE });
      const full = `${c.mark} ${f0(c.len)}`, lab = w > s.tw(full, 4.4) + 1.2 ? full : w > s.tw(f0(c.len), 4.4) + 1.2 ? f0(c.len) : '';
      if (lab) s.text(xx + w / 2, yy - bh / 2, lab, { size: 4.4, color: WHITE, ha: 'center', va: 'middle' });
      xx += w + P.kerf * kx;
    }
    const off = P.stockLength - bar.reduce((a, c) => a + c.len, 0) - P.kerf * bar.length;
    s.text(x + 5 + P.stockLength * kx + 2, yy - bh / 2, `off-cut ${f0(Math.max(0, off))}`, { size: 5, color: GREY, va: 'middle' });
  });
}
function drawNesting(s, M, S, x, yTop, lay) {
  const P = M.P;
  const all = [];
  for (const [k, sheets] of Object.entries(S.nests)) sheets.forEach((sh, i) => all.push([k.startsWith('Weldmesh') ? `mesh ${k.slice(9)}  #${i + 1}` : k.startsWith('Tread') ? `${k.slice(12)} tread  #${i + 1}` : `${k.slice(6)} sheet  #${i + 1}`, sh, k.startsWith('Weldmesh')]));
  const kn = lay.cw / P.sheetW;
  all.forEach(([lab, sh, isMesh], i) => {
    const cx = x + (i % lay.cols) * (lay.cw + lay.gap);
    const cy = yTop - 4 - lay.ch - Math.floor(i / lay.cols) * (lay.ch + 7.5);
    s.text(cx, cy + lay.ch + 1.3, lab, { size: 5.2 });
    s.rect(cx, cy, lay.cw, lay.ch, { lw: 0.15, color: GREY, fill: WHITE });
    for (const p of sh.placed) {
      const pw = Math.min(p.w, P.sheetW - p.x), ph = Math.min(p.h, P.sheetH - p.y);
      s.rect(cx + p.x * kn, cy + p.y * kn, pw * kn, ph * kn, { fill: isMesh ? [226, 236, 248] : [223, 227, 232], lw: 0.12 });
      if (pw * kn > s.tw(p.mark, 4.6) + 0.8 && ph * kn > 2.2) s.text(cx + (p.x + pw / 2) * kn, cy + (p.y + ph / 2) * kn, p.mark, { size: 4.6, ha: 'center', va: 'middle' });
    }
  });
}
function pageMaterials(doc, M, S, I, info) {
  const { P, G } = M;
  const N = P.rows;
  const D5 = p5Data(M, S), g5 = p5Geometry(D5, S, P);
  const s = Sheet(doc, 5, info.total, 'CUT LIST, MATERIALS, NOTES', 'NTS', info);
  // column 1: cut list and stock
  s.heading(14, 283, 'CUT LIST', `for the full set of ${N} ${N === 1 ? 'row' : 'rows'} (${2 * N} dogs)`);
  let y = s.table(14, 275, [['MARK', 11, 'left'], ['', 6, 'center'], ['PART', 40, 'left'], ['MATERIAL', 30, 'left'], ['LENGTH', 15, 'right'], ['TOTAL', 13, 'right'], ['NOTES', 59, 'left']], D5.linear, { chipCol: 1, rowH: RH, size: 6.1 });
  y = s.table(14, y - 4, [['MARK', 11, 'left'], ['PART', 46, 'left'], ['MATERIAL', 30, 'left'], ['SIZE', 27, 'right'], ['TOTAL', 13, 'right'], ['NOTES', 47, 'left']], D5.sheetRows, { rowH: RH, size: 6.1 });
  y = s.table(14, y - 4, [['MARK', 11, 'left'], ['HARDWARE', 145, 'left'], ['TOTAL', 18, 'right']], D5.hw, { rowH: RH, size: 6.1 });
  s.heading(14, g5.stockHead, 'STOCK TO BUY', `SHS cutting plan uses ${f0(P.kerf)} mm kerf; flat bar and tube include 10% extra`);
  y = s.table(14, g5.stockHead - 7, [['ITEM', 74, 'left'], ['BUY', 24, 'right'], ['FOR', 76, 'left']], D5.stock, { rowH: RH, size: 6.1 });
  if (g5.fits) {
    s.text(14, g5.barsHead, `SHS CUTTING PLAN  (${f0(P.stockLength / 1000)} m bars, colours as cut list)`, { size: 6.6, weight: 'bold' });
    drawBars(s, M, S, 14, g5.barsHead - 3, g5.bh, 140);
  } else {
    s.text(14, g5.barsHead, 'SHS CUTTING PLAN and SHEET NESTING: see sheet 6', { size: 6.6, weight: 'bold' });
  }
  // column 2: weights and nesting
  const wx = 198;
  s.heading(wx, 283, 'WEIGHT', `approx., kg`);
  s.table(wx, 276, [[`ROW ${D5.front}`, 70, 'left'], ['kg', 24, 'right']], D5.wrows, { rowH: RH, size: 6.1, boldLast: true });
  { const mt = S.byMat, alt = P.frameMat === 'aluminium' ? 'steel' : 'aluminium';
    const txt = (G.mixed ? `This set: ${Math.round(mt.steel || 0)} kg of steel and ${Math.round(mt.aluminium || 0)} kg of aluminium. All steel would be about ${Math.round(S.massIf.steel)} kg, all aluminium about ${Math.round(S.massIf.aluminium)} kg.`
      : `The same sizes in ${alt} would be about ${Math.round(S.massIf[alt])} kg.`) + ' Add the dogs and mats for ute payload.';
    s.para(wx, g5.wBottom - 5, s.wrap(txt, 92, 5.9).slice(0, 3), { size: 5.9, color: GREY }); }
  if (g5.fits) {
    s.heading(wx, g5.nestHead, 'SHEET + MESH NESTING', `${f0(P.sheetW)} x ${f0(P.sheetH)} sheets`);
    drawNesting(s, M, S, wx, g5.nestHead - 9, g5.nl);
  }
  // column 3: notes
  const nx = 302;
  s.heading(nx, 283, 'FABRICATION NOTES');
  const fm3 = C.metalOf(P, 'frame'), sm3 = C.metalOf(P, 'sheet');
  const fA = fm3 === 'aluminium', fSS = fm3 === 'stainless';
  const fk = C.kindOf(P, 'frame'), sk = C.kindOf(P, 'sheet');
  const frameFinish = { pregalv: 'touch up the welds with zinc-rich paint, or powder coat it', black: 'prime and powder coat it after fabrication',
    hdg: 'hot-dip galvanise it after fabrication (drill vent and drain holes in every closed SHS first)', ss304: 'pickle and passivate the welds and leave it bare', ss316: 'pickle and passivate the welds and leave it bare' }[fk.id]
    || 'leave it bare, or powder coat or anodise it';
  const sheetFinish = { galv: 'galvanised sheet needs only the welds touched up', zinc: 'paint or powder coat the Zincanneal', black: 'paint or powder coat the sheet', ss304: 'leave the stainless sheet bare', ss316: 'leave the stainless sheet bare' }[sk.id]
    || 'leave the aluminium sheet bare or powder coat it';
  const galvAny = ['pregalv', 'hdg'].includes(fk.id) || sk.id === 'galv';
  let ny = s.numbered(nx, 275, [
    fA ? 'All joints square-cut butt joints, TIG or pulse-MIG (spool gun) welded with 5356 filler. Stainless-brush and degrease just before welding. Tack the whole frame, check square, then weld.'
       : fSS ? 'All joints square-cut butt joints, TIG welded with 308L filler (309L where stainless meets mild steel). Tack the whole frame, check square, then weld.'
       : 'All joints square-cut butt joints, MIG welded. Tack the whole frame, check square, then weld.',
    G.mixed ? "Steel and aluminium can't be welded together. Rivet the floor and roof down (stainless 4.8 at 150) and the folded wall and divider trays in through their flanges (4.8 at 120, divider trays 3.2 at 100), with butyl tape or sealant wherever the metals touch. Seal the floor all round."
      : fA ? 'Stitch-weld sheet 25 long at 150 centres to limit warping, or rivet the lapped floor and roof (stainless 4.8 at 150); infill walls are welded in. Seal the floor all round.'
      : 'Stitch-weld sheet 25 long at 150 centres to limit warping. The lapped floor and roof can be riveted instead (4.8 at 150); infill walls must be welded. Seal the floor all round.',
    'Weld every mesh wire end to the frame. No loose wire ends or sharp edges inside: grind and check by running a hand over every inside surface.' + (G.plateT ? ' Deburr the S8 sheets between rows on both faces.' : ''),
    'Air-hole panels: laser or plasma cut, deburr both sides before fitting.',
    fA ? `Welding softens aluminium next to the weld (${fk.grade} drops to about half strength): keep full-size welds and don't grind them flush.`
      : fSS ? 'Keep stainless away from carbon-steel tools, brushes and grinding dust, or it will rust-spot.'
      : galvAny ? 'Galv fumes: weld galvanised steel and mesh with ventilation or extraction.' : 'Clean the mill scale off black steel at every weld and prime the frame promptly.',
    `Finish: frame, ${frameFinish}; sheets, ${sheetFinish}.` + (G.mixed ? ' Finish the steel before the aluminium is riveted on.' : '') + ' A light-coloured roof runs much cooler in the sun than a dark one.',
    `Doors: hang with ${f0(P.doorGap)} mm packers all round. Hinge axis ${f0(G.hingeD / 2)} outside the face on the gap centre (the barrel sticks out ${f0(G.hingeD)}). Check the swing, then weld.`,
  ], 104, { size: 6.0 });
  ny -= 4;
  s.text(nx, ny, 'FITTING AND USE', { size: 7.4, weight: 'bold' });
  s.numbered(nx, ny - 6, [
    (P.trayBolts && G.trayBoltJoist ? `Bolt each row down with 4 x M${G.trayBoltD} through ${G.crush ? 'the F3H crush tubes' : 'the F3H joists (snug only, no crush tube)'}, with 50x50x5 plates under the tray and sealant under the top washers. Re-check tightness after 500 km.` : 'Tie the cages down securely to the tray (no tray bolts in this design). Re-check after 500 km.') + (fA ? ' Use stainless bolts and keep the aluminium off a steel tray with rubber strip and nylon washers.' : ''),
    N < 2 ? 'A single row needs no join bolts.' : G.shared ? 'The rows are one welded frame, so there is nothing to bolt between them.'
      : G.bolted ? `Join neighbouring rows with 2 x M10 x ${G.joinBoltL} through the top rails${G.plateT ? ' and the S8 sheet' : ''}. Snug them up only.` : 'Rows are not bolted together in this design: clamp or strap them so they cannot shift apart.',
    `Sit the ${G.shared ? 'frame' : 'rows'} on 3 to 5 mm rubber strip to stop rattles and trapped water.`,
    'Fit 10 mm rubber mats (they cover the bolt heads). Bare metal floors get hot and slippery. Hose out through the doors: there is no threshold lip.',
    "Dogs must have shade and airflow. Don't leave them caged in the sun or in a closed canopy.",
    'Dog-on-ute rules vary by state. A secured cage generally meets them; check your local rules.',
  ], 104, { size: 6.0, start: 7 });
}

/* ------------------------------------------------------------------ page 6 (only when needed): cutting plans */
function pagePlans(doc, M, S, I, info) {
  const P = M.P;
  const s = Sheet(doc, 6, info.total, 'CUTTING PLANS', 'NTS', info);
  s.heading(14, 283, `SHS CUTTING PLAN  (${S.bars.length} bars of ${f0(P.stockLength / 1000)} m)`, `${f0(P.kerf)} mm kerf, colours as the cut list on sheet 5`);
  const bh = Math.max(2.2, Math.min(4.2, (270 - 14) / Math.max(S.bars.length, 1) - 1.2));
  drawBars(s, M, S, 14, 272, bh, 205);
  const nx = 262;
  s.heading(nx, 283, 'SHEET + MESH NESTING', `${f0(P.sheetW)} x ${f0(P.sheetH)} sheets`);
  const count = Object.values(S.nests).reduce((a, v) => a + v.length, 0);
  const lay = nestLayout(count, 144, 270 - 46, P.sheetW, P.sheetH) || { cols: 4, cw: 33, ch: 33 * P.sheetH / P.sheetW, gap: 4 };
  drawNesting(s, M, S, nx, 274, lay);
}

/* ------------------------------------------------------------------ main */
function pageCount(model, summary) {
  return p5Geometry(p5Data(model, summary), summary, model.P).fits ? 5 : 6;
}
async function make(model, summary, progress) {
  const jsPDF = root.jspdf && root.jspdf.jsPDF;
  if (!jsPDF) throw new Error('the PDF library did not load (check your internet connection)');
  progress && progress('Preparing renders...', 0.03);
  const I = await makeRenders(model, progress);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  const d = new Date();
  const total = pageCount(model, summary);
  const info = { total, project: `UTE DOG CAGES  -  ${model.P.rows} x 2 SET`, date: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) };
  const pages = [['overview', pageOverview], ['general arrangement', pageGA], ['frame', pageFrame], ['doors and panels', pageDoors], ['cut list', pageMaterials]];
  if (total > 5) pages.push(['cutting plans', pagePlans]);
  try {
    for (let i = 0; i < pages.length; i++) {
      progress && progress(`Drawing sheet ${i + 1} of ${total}: ${pages[i][0]}...`, 0.35 + 0.6 * i / pages.length);
      await new Promise(r => setTimeout(r, 15));
      pages[i][1](doc, model, summary, I, info);
      CUR.finish();
    }
  } finally { I.R.dispose(); }
  doc.setProperties({ title: `Ute dog cages ${model.P.rows} x 2: drawings`, creator: 'Ute Dog Cage Builder', author: 'Ute Dog Cage Builder' });
  progress && progress('Saving...', 0.98);
  return doc;
}

root.CageDrawings = { make, pageCount };
})(typeof window !== 'undefined' ? window : globalThis);
