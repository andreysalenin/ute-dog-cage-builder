"""Row joins, grades and mixed metals: write STEP files with the JS core, then check each one with OpenCASCADE:
valid solids, volume equal to the analytic JS volume, and no interference between parts."""
import json, subprocess, sys, os, time
import cadquery as cq
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'out', 'sweep_joins')
CFGS = {
    'sep_default': dict(),
    'sandwich_perf3': dict(rowJoin='sandwich', rows=3),
    'sandwich_solid_mixed': dict(rowJoin='sandwich', wallMiddle='solid', frameMat='aluminium', sheetMat='steel', shs=40),
    'sandwich_mesh': dict(rowJoin='sandwich', wallMiddle='mesh', rows=2),
    'sandwich_nobolt': dict(rowJoin='sandwich', joinBolts=False, rows=2, roofBars=2),
    'shared2_perf3': dict(rowJoin='shared2', rows=3),
    'shared2_mesh': dict(rowJoin='shared2', wallMiddle='mesh', rows=2),
    'shared2_mixed': dict(rowJoin='shared2', rows=2, frameMat='steel', sheetMat='aluminium'),
    'shared_perf3': dict(rowJoin='shared', rows=3),
    'shared_solid_alu': dict(rowJoin='shared', wallMiddle='solid', frameMat='aluminium', sheetMat='aluminium', shs=40, tFloor=3, floorType='tread', tSheet=2, tRoof=2),
    'shared_mesh': dict(rowJoin='shared', wallMiddle='mesh', rows=3),
    'shared_mixed': dict(rowJoin='shared', rows=3, frameMat='aluminium', sheetMat='steel', shs=35),
    'shared_hinges': dict(rowJoin='shared', rows=3, hinges=[{'L': 'front', 'R': 'rear'}, {'L': 'rear', 'R': 'front'}, {'L': 'front', 'R': 'front'}]),
    'shared_low20': dict(rowJoin='shared', rows=2, height=400, shs=20, shsT=1.6, hinges=[{'L': 'rear', 'R': 'front'}, {'L': 'front', 'R': 'rear'}]),
    'shared2_low40': dict(rowJoin='shared2', rows=2, height=400, shs=40, shsT=3, depth=600, hinges=[{'L': 'rear', 'R': 'front'}, {'L': 'front', 'R': 'rear'}]),
    'shared_6rows': dict(rowJoin='shared', rows=6, depth=500, wallMiddle='perforated', holeD=20, holePitch=30),
    'stainless': dict(frameKind='ss316', sheetKind='ss304', rowJoin='shared2', rows=2),
}

def check(name, cfg, clash=True):
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    r = subprocess.run(['node', os.path.join(HERE, 'step_test.js'), json.dumps(cfg), d], capture_output=True, text=True)
    if r.returncode:
        return f'{name}: node failed {r.stderr[:300]}'
    t = time.time()
    path = os.path.join(d, 'model.step')
    wp = cq.importers.importStep(path)
    solids = wp.solids().vals()
    bad = 0; vt = 0.0
    for s in solids:
        if not BRepCheck_Analyzer(s.wrapped).IsValid(): bad += 1
        p = GProp_GProps(); BRepGProp.VolumeProperties_s(s.wrapped, p); vt += p.Mass()
    js = json.load(open(os.path.join(d, 'parts.json')))
    jsv = sum(p[2] for p in js); jsn = sum(p[1] for p in js)
    msg = f'{name}: solids {len(solids)}/{jsn} invalid {bad} vol ratio {vt / jsv:.6f}'
    if clash:
        a = cq.Assembly.importStep(path)
        leaves = []
        for nm, sub in a.traverse():
            if sub.obj is not None and not sub.children:
                sh = sub.obj if isinstance(sub.obj, cq.Shape) else sub.obj.val()
                leaves.append((nm, sh))
        def bb(s):
            b = Bnd_Box(); BRepBndLib.Add_s(s.wrapped, b); return b.Get()
        boxes = [bb(s) for _, s in leaves]
        hits = []
        for i in range(len(leaves)):
            for j in range(i + 1, len(leaves)):
                A, B = boxes[i], boxes[j]
                if A[0] > B[3] + .01 or B[0] > A[3] + .01 or A[1] > B[4] + .01 or B[1] > A[4] + .01 or A[2] > B[5] + .01 or B[2] > A[5] + .01:
                    continue
                c = BRepAlgoAPI_Common(leaves[i][1].wrapped, leaves[j][1].wrapped); c.Build()
                v = cq.Shape.cast(c.Shape()).Volume()
                if v > 0.5: hits.append((round(v, 1), leaves[i][0], leaves[j][0]))
        msg += f' clashes {len(hits)}' + (' ' + str(sorted(hits, reverse=True)[:4]) if hits else '')
    return msg + f' ({time.time() - t:.0f} s)'

if __name__ == '__main__':
    names = sys.argv[1:] or list(CFGS)
    for n in names:
        print(check(n, CFGS[n]), flush=True)
