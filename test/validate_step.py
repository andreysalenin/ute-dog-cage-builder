"""Validate a STEP written by the JS writer: solids valid, volumes match the JS analytic values,
assembly names readable, no inverted solids."""
import json, sys, time
import cadquery as cq
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp

path, parts_json = sys.argv[1], sys.argv[2]
t = time.time()
wp = cq.importers.importStep(path)
solids = wp.solids().vals()
print("import s", round(time.time() - t, 1), "solids", len(solids))
bad, neg = 0, 0
vt = 0.0
for s in solids:
    if not BRepCheck_Analyzer(s.wrapped).IsValid():
        bad += 1
    p = GProp_GProps(); BRepGProp.VolumeProperties_s(s.wrapped, p)
    v = p.Mass()
    if v < 0: neg += 1
    vt += v
js = json.load(open(parts_json))
jsv = sum(p[2] for p in js); jsn = sum(p[1] for p in js)
print("invalid", bad, "negative", neg, "volume step", round(vt, 1), "js", round(jsv, 1), "ratio", round(vt / jsv, 6), "solids js", jsn)
a = cq.Assembly.importStep(path)
names = [n for n, _ in a.traverse()]
print("assembly nodes", len(names), names[:6])
bb = cq.Compound.makeCompound(solids).BoundingBox()
print("bbox", [round(x, 1) for x in (bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax)])
