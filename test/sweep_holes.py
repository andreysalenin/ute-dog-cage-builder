"""Air-hole arrangements and roof holes: write STEP files with the JS core, then check each one with OpenCASCADE:
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
OUT = os.path.join(HERE, '..', 'out', 'sweep_holes')
CFGS = {
    'roof_holes': dict(roofType='perforated'),
    'wall_variants': dict(wallFront='perforated', wallRear='perforated', divider='perforated', roofType='perforated',
                          holes={'front': {'pattern': 'stagger', 'd': 20, 'px': 40, 'py': 40}, 'rear': {'area': 'top', 'rows': 2},
                                 'divider': {'pattern': 'stagger', 'area': 'topbottom', 'rows': 3, 'd': 25, 'px': 45, 'py': 30},
                                 'roof': {'pattern': 'stagger', 'd': 40, 'px': 70, 'py': 60, 'margin': 30}}),
    'shared_roof_stagger': dict(rowJoin='shared', rows=3, roofType='perforated', holes={'middle': {'pattern': 'stagger', 'area': 'topbottom', 'rows': 2, 'd': 25, 'px': 50, 'py': 45}}),
    'shared2_variants_mixed': dict(rowJoin='shared2', rows=3, frameMat='aluminium', sheetMat='steel', shs=40, wallFront='perforated',
                                   holes={'front': {'d': 50, 'px': 90, 'py': 90}, 'middle': {'pattern': 'stagger', 'd': 30, 'px': 60, 'py': 55}}),
    'sandwich_top_roof_alu': dict(rowJoin='sandwich', rows=2, sheetMat='aluminium', roofType='perforated', holes={'middle': {'area': 'top', 'rows': 3, 'd': 35, 'px': 60, 'py': 50}}),
    'roofbars_holes': dict(roofBars=3, roofType='perforated', rows=1, holes={'roof': {'d': 16, 'px': 30, 'py': 30, 'margin': 15}}),
    'legacy_dense': dict(holeD=12, holePitch=20, holeMargin=10, wallFront='perforated', wallRear='perforated', divider='perforated', rows=3, roofType='perforated'),
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
