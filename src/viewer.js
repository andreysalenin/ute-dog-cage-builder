/* three.js viewer + offscreen renders for the drawing set. Needs THREE (r128) and CageCore. */
(function (root) {
'use strict';
const THREE = root.THREE;
const C = root.CageCore;

const MARK_COL = { F1: 0x2f6fdb, F1H: 0x7a4fd8, F2: 0x169a8c, F3: 0xe08a1e, F3H: 0xd43d3d, T2: 0xd43d3d };

function srgb(hex) { const c = new THREE.Color(hex); c.convertSRGBToLinear(); return c; }
function rgbHex(rgb) { return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255); }

const KIND_STYLE = {
  frame: { color: 0x2c2f34, metal: 0.45, rough: 0.5, edges: true },
  door: { color: 0x2c2f34, metal: 0.45, rough: 0.5, edges: true },
  tab: { color: 0x2c2f34, metal: 0.45, rough: 0.5, edges: true },
  floor: { color: 0x55595f, metal: 0.3, rough: 0.7, edges: true },
  sheet: { color: 0x666b72, metal: 0.3, rough: 0.6, edges: true },
  roof: { color: 0x6b7077, metal: 0.3, rough: 0.6, edges: true },
  perf: { color: 0x70757c, metal: 0.3, rough: 0.6, edges: true },
  mesh: { color: 0xb3b8be, metal: 0.6, rough: 0.35, edges: false },
  hinge: { color: 0xe3ae3a, metal: 0.5, rough: 0.4, edges: false },
  latch: { color: 0xe3ae3a, metal: 0.5, rough: 0.4, edges: false },
  bolt: { color: 0xc4c8cc, metal: 0.7, rough: 0.35, edges: false },
  cap: { color: 0x141516, metal: 0.1, rough: 0.8, edges: false },
};
// satin aluminium versions; stainless latches and bolts stay bright
const ALU_STYLE = {
  frame: { color: 0x8f949a, metal: 0.5, rough: 0.45, edges: true },
  door: { color: 0x8f949a, metal: 0.5, rough: 0.45, edges: true },
  tab: { color: 0x8f949a, metal: 0.5, rough: 0.45, edges: true },
  floor: { color: 0x9a9ea3, metal: 0.35, rough: 0.55, edges: true },
  sheet: { color: 0xa6aaaf, metal: 0.35, rough: 0.55, edges: true },
  roof: { color: 0xa6aaaf, metal: 0.35, rough: 0.55, edges: true },
  perf: { color: 0xa1a5aa, metal: 0.35, rough: 0.55, edges: true },
  mesh: { color: 0xc4c7ca, metal: 0.55, rough: 0.35, edges: false },
  hinge: { color: 0xb9bcc0, metal: 0.55, rough: 0.35, edges: false },
};
function styleOf(p) {
  if (p.material === 'aluminium' && ALU_STYLE[p.kind]) return { key: p.kind + '-al', style: ALU_STYLE[p.kind] };
  return { key: p.kind, style: KIND_STYLE[p.kind] || KIND_STYLE.frame };
}

/* Prism -> triangles (+ optional feature edges), built directly: caps by earcut, sides as quads,
   smooth normals on arcs. Much faster than ExtrudeGeometry + EdgesGeometry for perforated plates. */
function loopEdges(loop) {
  const out = []; // {a, b, na, nb}
  for (const s of loop) {
    if (s.t === 'L') {
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], l = Math.hypot(dx, dy) || 1;
      const n = [dy / l, -dx / l];
      out.push({ a: s.a, b: s.b, na: n, nb: n });
    } else {
      const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
      let sw = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]) - a0;
      if (s.ccw) { while (sw <= 1e-9) sw += 2 * Math.PI; } else { while (sw >= -1e-9) sw -= 2 * Math.PI; }
      const k = s.r < 3 ? 6 : s.r < 8 ? 8 : s.r < 20 ? 10 : 16;
      const n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / k)));
      const sg = s.ccw ? 1 : -1;
      let prev = s.a, pa = a0;
      for (let i = 1; i <= n; i++) {
        const ang = a0 + sw * i / n;
        const q = i === n ? s.b : [s.c[0] + s.r * Math.cos(ang), s.c[1] + s.r * Math.sin(ang)];
        out.push({ a: prev, b: q, na: [sg * Math.cos(pa), sg * Math.sin(pa)], nb: [sg * Math.cos(ang), sg * Math.sin(ang)] });
        prev = q; pa = ang;
      }
    }
  }
  return out;
}
function prismData(pr, withEdges) {
  const U = pr.u, Vv = pr.v, N = pr.n, O = pr.o, L = pr.len;
  const P3 = (p, w) => [O[0] + p[0] * U[0] + p[1] * Vv[0] + w * N[0], O[1] + p[0] * U[1] + p[1] * Vv[1] + w * N[1], O[2] + p[0] * U[2] + p[1] * Vv[2] + w * N[2]];
  const D3 = (n) => [n[0] * U[0] + n[1] * Vv[0], n[0] * U[1] + n[1] * Vv[1], n[0] * U[2] + n[1] * Vv[2]];
  const pos = [], nor = [], edg = [];
  const tri = (a, b, c, na, nb, nc) => { pos.push(...a, ...b, ...c); nor.push(...na, ...nb, ...nc); };
  const loops = pr.loops.map(loopEdges);
  // sides
  for (const E of loops) for (const e of E) {
    const a0 = P3(e.a, 0), b0 = P3(e.b, 0), b1 = P3(e.b, L), a1 = P3(e.a, L), na = D3(e.na), nb = D3(e.nb);
    tri(a0, b0, b1, na, nb, nb); tri(a0, b1, a1, na, nb, na);
  }
  // caps
  const contour = loops[0].map(e => new THREE.Vector2(e.a[0], e.a[1]));
  const holes = loops.slice(1).map(E => E.map(e => new THREE.Vector2(e.a[0], e.a[1])));
  const all = contour.concat(...holes);
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const nTop = N, nBot = [-N[0], -N[1], -N[2]];
  for (const f of faces) {
    let [i, j, k] = f;
    const A = all[i], B = all[j], Cc = all[k];
    if ((B.x - A.x) * (Cc.y - A.y) - (B.y - A.y) * (Cc.x - A.x) < 0) { const t = j; j = k; k = t; }
    const p = (q, w) => P3([all[q].x, all[q].y], w);
    tri(p(i, L), p(j, L), p(k, L), nTop, nTop, nTop);
    tri(p(i, 0), p(k, 0), p(j, 0), nBot, nBot, nBot);
  }
  if (withEdges) for (const E of loops) {
    for (let i = 0; i < E.length; i++) {
      const e = E[i], pr0 = E[(i + E.length - 1) % E.length];
      edg.push(...P3(e.a, 0), ...P3(e.b, 0), ...P3(e.a, L), ...P3(e.b, L));
      const d0 = [pr0.b[0] - pr0.a[0], pr0.b[1] - pr0.a[1]], d1 = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
      const c = (d0[0] * d1[0] + d0[1] * d1[1]) / ((Math.hypot(d0[0], d0[1]) * Math.hypot(d1[0], d1[1])) || 1);
      if (c < Math.cos(35 * Math.PI / 180)) edg.push(...P3(e.a, 0), ...P3(e.a, L));
    }
  }
  return { pos, nor, edg };
}
function partGeometry(solids, withEdges) {
  const pos = [], nor = [], edg = [];
  for (const s of solids) { const d = prismData(s, withEdges); for (const v of d.pos) pos.push(v); for (const v of d.nor) nor.push(v); for (const v of d.edg) edg.push(v); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  let e = null;
  if (withEdges) { e = new THREE.BufferGeometry(); e.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edg), 3)); }
  return { geom: g, edges: e };
}

function partBox(p) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const s of p.solids) for (const l of s.loops) for (const seg of l) {
    const pts = [seg.a, seg.b];
    if (seg.t === 'A') { pts.push([seg.c[0] + seg.r, seg.c[1]], [seg.c[0] - seg.r, seg.c[1]], [seg.c[0], seg.c[1] + seg.r], [seg.c[0], seg.c[1] - seg.r]); }
    for (const q of pts) for (const w of [0, s.len]) {
      const v = C.to3(s, q, w);
      for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], v[k]); b[k + 3] = Math.max(b[k + 3], v[k]); }
    }
  }
  return b;
}

class CageScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const hemi = new THREE.HemisphereLight(0xf2f5f8, 0x3a3d40, 0.85);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 0.95);
    this.key.position.set(-1.2, 1.6, 2.4);
    this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.35);
    this.fill.position.set(2, -1.5, 0.8);
    this.scene.add(this.fill);
    this.materials = {};
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x0c0d0e, transparent: true, opacity: 0.55 });
    this.parts = [];
    this.opts = { roof: true, doors: 0, exploded: 0, frameColours: false, only: null };
  }
  mat(key, style) {
    if (!this.materials[key]) {
      this.materials[key] = new THREE.MeshStandardMaterial({ color: srgb(style.color), metalness: style.metal, roughness: style.rough, side: THREE.DoubleSide });
    }
    return this.materials[key];
  }
  // geometry is cached by shape (position-free), so row copies and unchanged parts are built once
  geometryFor(p, style) {
    const ref = p.solids[0].o;
    const key = (style.edges ? 'e' : 'n') + JSON.stringify(p.solids.map(q => [q.o[0] - ref[0], q.o[1] - ref[1], q.o[2] - ref[2], q.u, q.v, q.len, q.loops]));
    let g = this.nextCache.get(key) || this.cache.get(key);
    if (!g) g = partGeometry(p.solids.map(q => Object.assign({}, q, { o: [q.o[0] - ref[0], q.o[1] - ref[1], q.o[2] - ref[2]] })), !!style.edges);
    this.nextCache.set(key, g);
    return { g, ref };
  }
  setModel(model) {
    for (const p of this.parts) p.group.parent && p.group.parent.remove(p.group);
    this.root.clear();
    this.parts = [];
    this.model = model;
    this.doorPivots = {};
    this.cache = this.cache || new Map();
    this.nextCache = new Map();
    for (const p of model.parts) {
      const { key: matKey, style } = styleOf(p);
      const { g, ref } = this.geometryFor(p, style);
      const mesh = new THREE.Mesh(g.geom, this.mat(matKey, style));
      mesh.position.set(ref[0], ref[1], ref[2]);
      const group = new THREE.Group();
      group.add(mesh);
      let edges = null;
      if (g.edges) {
        edges = new THREE.LineSegments(g.edges, this.edgeMat);
        edges.position.copy(mesh.position);
        group.add(edges);
      }
      const rec = { part: p, mesh, edges, group, box: partBox(p), style, matKey };
      if (p.door) {
        const key = `${p.door.module}-${p.door.side}`;
        if (!this.doorPivots[key]) {
          const pv = new THREE.Group();
          pv.position.set(p.door.axis[0], p.door.axis[1], 0);
          pv.userData = { sign: p.door.sign, module: p.door.module, side: p.door.side };
          this.doorPivots[key] = pv;
          this.root.add(pv);
        }
        group.position.set(-p.door.axis[0], -p.door.axis[1], 0);
        this.doorPivots[key].add(group);
      } else this.root.add(group);
      this.parts.push(rec);
    }
    for (const [k, g] of this.cache) if (!this.nextCache.has(k)) { g.geom.dispose(); if (g.edges) g.edges.dispose(); }
    this.cache = this.nextCache;
    this.apply();
  }
  set(opts) { Object.assign(this.opts, opts); this.apply(); }
  apply() {
    if (!this.model) return;
    const { P, G } = this.model;
    const o = this.opts;
    const N = P.rows;
    const labels = [];
    for (let i = 0; i < N; i++) labels.push(C.rowLabel(i, N));
    for (const r of this.parts) {
      const p = r.part;
      let vis = true;
      if (!o.roof && p.kind === 'roof') vis = false;
      if (o.cutTop && r.box[2] >= G.zTopU - 1) vis = false;
      if (o.only && !o.only(p)) vis = false;
      r.group.visible = vis;
      if (o.frameColours && (p.kind === 'frame' || p.mark === 'T2')) r.mesh.material = this.mat('mark-' + p.mark, { color: MARK_COL[p.mark] || 0x888888, metal: 0.2, rough: 0.55 });
      else if (o.colourOverride) r.mesh.material = o.colourOverride(p, this) || this.mat(r.matKey, r.style);
      else r.mesh.material = this.mat(r.matKey, r.style);
      // explode
      const e = o.exploded || 0;
      let dx = 0, dy = 0, dz = 0;
      if (e) {
        const idx = labels.indexOf(p.module);
        if (idx >= 0 && o.explodeRows) dy = idx * 260 * e;
        if (p.kind === 'roof') dz = 420 * e;
        if (p.kind === 'floor') dz = -300 * e;
      }
      if (p.door) { r.group.position.set(-p.door.axis[0], -p.door.axis[1], 0); }
      else r.group.position.set(dx, dy, dz);
      r.explode = [dx, dy, dz];
    }
    for (const key of Object.keys(this.doorPivots)) {
      const pv = this.doorPivots[key];
      const m = this.model.parts.find(p => p.door && `${p.door.module}-${p.door.side}` === key);
      const e = o.exploded || 0;
      const idx = labels.indexOf(pv.userData.module);
      const out = (pv.userData.side === 'L' ? -1 : 1) * 420 * e;
      pv.position.set(m.door.axis[0] + out, m.door.axis[1] + (idx >= 0 && o.explodeRows ? idx * 260 * e : 0), 0);
      let ang = (o.doors || 0) * 100;
      if (o.openDoors && o.openDoors[key] !== undefined) ang = o.openDoors[key];
      pv.rotation.z = THREE.MathUtils.degToRad(ang) * pv.userData.sign;
    }
  }
  bounds() {
    const b = new THREE.Box3();
    this.root.updateMatrixWorld(true);
    for (const r of this.parts) if (r.group.visible && this.isVisible(r.group)) b.expandByObject(r.mesh);
    return b;
  }
  isVisible(obj) { while (obj) { if (!obj.visible) return false; obj = obj.parent; } return true; }
}

/* ------------------------------------------------------------------ interactive viewer */
class Viewer {
  constructor(container) {
    this.container = container;
    this.cs = new CageScene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(32, 1, 10, 50000);
    this.camera.up.set(0, 0, 1);
    this.target = new THREE.Vector3(850, 550, 375);
    this.sph = { theta: 2.30, phi: 1.08, r: 4200 };
    this.bg = 0xf4f5f3;
    this.renderer.setClearColor(this.bg, 1);
    this._bindControls();
    this._resize = () => this.resize();
    root.addEventListener('resize', this._resize);
    if (root.ResizeObserver) { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container); }
    this.resize();
    this.dirty = true;
    const loop = () => { if (this.dirty) { this.render(); this.dirty = false; } this.raf = root.requestAnimationFrame(loop); };
    loop();
  }
  setBackground(hex) { this.bg = hex; this.renderer.setClearColor(hex, 1); this.dirty = true; }
  setModel(model, keepView) {
    this.cs.setModel(model);
    const { P } = model;
    const t = new THREE.Vector3(P.width / 2, P.rows * P.depth / 2, P.height / 2);
    if (!keepView) { this.target.copy(t); this.fit(); }
    else this.target.copy(t);
    this.dirty = true;
  }
  set(opts) { this.cs.set(opts); this.dirty = true; }
  fit() {
    // frame the visible parts' bounding box from the current direction
    const b = this.cs.bounds();
    if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3());
    this.target.copy(c);
    const s = this.sph, sp = Math.sin(s.phi);
    const back = new THREE.Vector3(sp * Math.cos(s.theta), sp * Math.sin(s.theta), Math.cos(s.phi)).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), back);
    if (right.lengthSq() < 1e-12) right.set(-Math.sin(s.theta), Math.cos(s.theta), 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(back, right).normalize();
    // keep clear of the toolbars drawn over the canvas
    const H = this.container.clientHeight || 300;
    let inset = 0;
    for (const el of this.container.querySelectorAll('.tools, .vbar')) {
      const r0 = el.getBoundingClientRect(), rc = this.container.getBoundingClientRect();
      inset = Math.max(inset, r0.top - rc.top < H / 2 ? r0.bottom - rc.top : rc.bottom - r0.top);
    }
    const use = Math.max(0.35, (H - 2 * inset - 28) / H);
    const ty = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * use, tx = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * (this.camera.aspect || 1) * 0.94;
    let r = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).sub(c);
      const z = p.dot(back);
      r = Math.max(r, z + Math.abs(p.dot(right)) / tx, z + Math.abs(p.dot(up)) / ty);
    }
    s.r = Math.min(30000, Math.max(300, r * 1.05));
    this.dirty = true;
  }
  view(name) {
    const v = { iso: [2.30, 1.08], rear: [-0.80, 1.10], front: [Math.PI / 2, Math.PI / 2 - 0.02],
                side: [Math.PI, Math.PI / 2 - 0.02], top: [-Math.PI / 2, 0.001] }[name] || [2.30, 1.08];
    this.sph.theta = v[0]; this.sph.phi = v[1];
    this.fit();
  }
  resize() {
    const w = this.container.clientWidth || 300, h = this.container.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }
  render() {
    const s = this.sph;
    const sp = Math.sin(s.phi);
    this.camera.position.set(this.target.x + s.r * sp * Math.cos(s.theta), this.target.y + s.r * sp * Math.sin(s.theta), this.target.z + s.r * Math.cos(s.phi));
    this.camera.lookAt(this.target);
    const k = this.cs.key;
    k.position.copy(this.camera.position).add(new THREE.Vector3(-800, 400, 2600));
    this.renderer.render(this.cs.scene, this.camera);
    if (this.onOrient) {
      const dx = Math.cos(s.theta), dy = Math.sin(s.theta);
      let t;
      if (s.phi < 0.3) t = 'Looking down from above';
      else {
        const w = [];
        if (dx < -0.38) w.push('left side'); else if (dx > 0.38) w.push('right side');
        if (dy > 0.38) w.push('cab end'); else if (dy < -0.38) w.push('tailgate end');
        t = 'Looking at the ' + w.join(' and ');
      }
      if (t !== this._orient) { this._orient = t; this.onOrient(t); }
    }
  }
  _bindControls() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const pts = new Map();
    let last = null, mode = null, pinch = null;
    const pan = (dx, dy) => {
      const r = this.sph.r * 0.0011;
      const cam = this.camera;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      this.target.addScaledVector(right, -dx * r).addScaledVector(up, dy * r);
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      last = [e.clientX, e.clientY];
      mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'rot';
      if (pts.size === 2) { const v = [...pts.values()]; pinch = { d: Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), c: [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2] }; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) {
        const v = [...pts.values()];
        const d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]);
        const c = [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2];
        this.sph.r = Math.min(30000, Math.max(300, this.sph.r * pinch.d / Math.max(d, 1)));
        pan(c[0] - pinch.c[0], c[1] - pinch.c[1]);
        pinch = { d, c };
        this.dirty = true;
        return;
      }
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      if (mode === 'pan') pan(dx, dy);
      else {
        this.sph.theta -= dx * 0.0085;
        this.sph.phi = Math.min(Math.PI - 0.05, Math.max(0.02, this.sph.phi - dy * 0.0085));
      }
      this.dirty = true;
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size === 1) { last = [...pts.values()][0]; mode = 'rot'; } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.sph.r = Math.min(30000, Math.max(300, this.sph.r * Math.exp(e.deltaY * 0.0012)));
      this.dirty = true;
    }, { passive: false });
  }
}

/* ------------------------------------------------------------------ offscreen renders for the PDF */
const VIEW_DIRS = { // direction from target toward the camera, and screen-right vector
  front: { dir: [0, 1, 0], right: [-1, 0, 0], up: [0, 0, 1] },
  rear: { dir: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  left: { dir: [-1, 0, 0], right: [0, -1, 0], up: [0, 0, 1] },
  right: { dir: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] },
  top: { dir: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
};
function to2d(p, view) {
  const v = VIEW_DIRS[view];
  return [p[0] * v.right[0] + p[1] * v.right[1] + p[2] * v.right[2], p[0] * v.up[0] + p[1] * v.up[1] + p[2] * v.up[2]];
}

class PrintRenderer {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0xffffff, 1);
    this.cs = new CageScene();
    this.cs.edgeMat.opacity = 0.75;
  }
  setModel(model) { this.cs.setModel(model); }
  // orthographic view along a principal axis; extent in view (u,v) coordinates
  ortho(view, center, halfH, pxW, pxH, opts) {
    this.cs.opts = Object.assign({ roof: true, doors: 0, exploded: 0, frameColours: false, only: null, cutTop: false, openDoors: null }, opts || {});
    this.cs.apply();
    const v = VIEW_DIRS[view];
    const halfW = halfH * pxW / pxH;
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 40000);
    cam.up.set(...v.up);
    cam.position.set(center[0] + v.dir[0] * 15000, center[1] + v.dir[1] * 15000, center[2] + v.dir[2] * 15000);
    cam.lookAt(new THREE.Vector3(...center));
    this.cs.key.position.set(v.dir[0] * 3000 - v.right[0] * 1500 + v.up[0] * 2500, v.dir[1] * 3000 - v.right[1] * 1500 + v.up[1] * 2500, v.dir[2] * 3000 - v.right[2] * 1500 + v.up[2] * 2500);
    this.cs.fill.position.set(v.dir[0] * 2000 + v.right[0] * 2000, v.dir[1] * 2000 + v.right[1] * 2000, v.dir[2] * 2000 + v.right[2] * 2000 + 500);
    this.renderer.setSize(pxW, pxH, false);
    this.renderer.render(this.cs.scene, cam);
    const [uc, vc] = to2d(center, view);
    return { url: this.renderer.domElement.toDataURL('image/jpeg', 0.92), extent: [uc - halfW, uc + halfW, vc - halfH, vc + halfH], px: [pxW, pxH] };
  }
  // orthographic "iso" view from azimuth/elevation, fitted to the visible parts
  iso(az, el, pxW, pxH, opts, anchors, margin) {
    this.cs.opts = Object.assign({ roof: true, doors: 0, exploded: 0, frameColours: false, only: null, cutTop: false, openDoors: null }, opts || {});
    this.cs.apply();
    const azr = THREE.MathUtils.degToRad(az), elr = THREE.MathUtils.degToRad(el);
    const d = new THREE.Vector3(Math.cos(elr) * Math.sin(azr), -Math.cos(elr) * Math.cos(azr), Math.sin(elr));
    const box = this.cs.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 60000);
    cam.up.set(0, 0, 1);
    cam.position.copy(center).addScaledVector(d, 20000);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    // fit: project the visible geometry's box corners
    const inv = cam.matrixWorldInverse;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    this.cs.root.updateMatrixWorld(true);
    for (const r of this.cs.parts) {
      if (!this.cs.isVisible(r.group)) continue;
      const pos = r.mesh.geometry.attributes.position;
      const mw = r.mesh.matrixWorld;
      const tmp = new THREE.Vector3();
      const step = Math.max(1, Math.floor(pos.count / 400));
      for (let i = 0; i < pos.count; i += step) {
        tmp.fromBufferAttribute(pos, i).applyMatrix4(mw).applyMatrix4(inv);
        xmin = Math.min(xmin, tmp.x); xmax = Math.max(xmax, tmp.x); ymin = Math.min(ymin, tmp.y); ymax = Math.max(ymax, tmp.y);
      }
    }
    margin = margin || 1.05;
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    let hw = (xmax - xmin) / 2 * margin, hh = (ymax - ymin) / 2 * margin;
    if (hw / hh > pxW / pxH) hh = hw * pxH / pxW; else hw = hh * pxW / pxH;
    cam.left = cx - hw; cam.right = cx + hw; cam.top = cy + hh; cam.bottom = cy - hh;
    cam.updateProjectionMatrix();
    this.cs.key.position.copy(d).multiplyScalar(3000).add(new THREE.Vector3(-1200, 900, 2600));
    this.cs.fill.position.set(2000, -1500, 800);
    this.renderer.setSize(pxW, pxH, false);
    this.renderer.render(this.cs.scene, cam);
    const out = { url: this.renderer.domElement.toDataURL('image/jpeg', 0.92), px: [pxW, pxH], anchors: {}, mask: this.mask(pxW, pxH) };
    if (anchors) for (const [k, p] of Object.entries(anchors)) {
      const v3 = new THREE.Vector3(...p).project(cam);
      out.anchors[k] = [(v3.x + 1) / 2 * pxW, (1 - v3.y) / 2 * pxH];
    }
    return out;
  }
  // coarse occupancy grid of the last render (1 = something drawn), used to keep labels off the drawing
  mask(pxW, pxH, cell) {
    cell = cell || 8;
    const mw = Math.ceil(pxW / cell), mh = Math.ceil(pxH / cell);
    const data = new Uint8Array(mw * mh);
    try {
      const c2 = root.document.createElement('canvas');
      c2.width = mw; c2.height = mh;
      const g2 = c2.getContext('2d');
      g2.drawImage(this.renderer.domElement, 0, 0, mw, mh);
      const px = g2.getImageData(0, 0, mw, mh).data;
      for (let i = 0; i < mw * mh; i++) data[i] = (px[i * 4] < 247 || px[i * 4 + 1] < 247 || px[i * 4 + 2] < 247) ? 1 : 0;
    } catch (e) { /* no 2D canvas: labels fall back to plain offsets */ }
    return { w: mw, h: mh, cell, data };
  }
  dispose() { this.renderer.dispose(); }
}

root.CageViewer = { Viewer, PrintRenderer, CageScene, to2d, VIEW_DIRS, MARK_COL, partBox, rgbHex };
})(typeof window !== 'undefined' ? window : globalThis);
