"""Write STEP files for a spread of settings with the JS core, then check each one with OpenCASCADE:
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
OUT = os.path.join(HERE, '..', 'out', 'sweep')
CFGS = {
    'shs20x16': dict(shs=20, shsT=1.6),
    'shs20x2': dict(shs=20, shsT=2.0, trayBolts=True),
    'shs25x25': dict(shs=25, shsT=2.5),
    'shs25x3': dict(shs=25, shsT=3.0, rows=1),
    'shs40x3': dict(shs=40, shsT=3.0, rows=2, width=2000, depth=700, height=900),
    'shs30x16_front': dict(shs=30, shsT=1.6, hinges=[{'L': 'front', 'R': 'rear'}, {'L': 'rear', 'R': 'front'}]),
    'tiny': dict(width=700, depth=350, height=400, rows=1, joists=0, roofBars=0),
    'big': dict(width=2400, depth=1200, height=1200, rows=2, joists=6, roofBars=4, holeD=50, holePitch=80, meshPitch=100, meshWire=6),
    'allmesh': dict(wallFront='mesh', wallRear='mesh', wallMiddle='mesh', divider='perforated', rows=3),
    'allperf': dict(wallFront='perforated', wallRear='perforated', wallMiddle='perforated', divider='perforated', holeD=6, holePitch=11, holeMargin=5, rows=2, height=600, depth=450),
    'nobolts': dict(trayBolts=False, joinBolts=False, rows=3, doorGap=15, notchClear=0),
    'gap2': dict(doorGap=2, notchClear=15, meshEdge=5, meshPitch=20, meshWire=2, tFloor=5, tSheet=4, tRoof=4),
    'alu_all': dict(frameMat='aluminium', sheetMat='aluminium'),
    'alu_frame': dict(frameMat='aluminium', sheetMat='steel', rows=3, divider='perforated'),
    'alu_sheets': dict(frameMat='steel', sheetMat='aluminium', rows=2, wallFront='perforated'),
    'alu_frame35': dict(frameMat='aluminium', sheetMat='aluminium', shs=35, shsT=2.0, tFloor=3),
    'alu_20x3_mixed': dict(frameMat='aluminium', sheetMat='steel', shs=20, shsT=3.0, rows=1),
    'alu_mesh_mixed': dict(frameMat='steel', sheetMat='aluminium', wallFront='mesh', wallRear='perforated', rows=2, shs=40, shsT=3.0),
    'odd': dict(width=1333, depth=477, height=777, rows=4, joists=3, roofBars=2, trayBoltInset=40, joinBoltInset=600, holeD=37, holePitch=53, holeMargin=21),
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
