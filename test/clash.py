"""Pairwise interference check on a STEP assembly (leaf parts)."""
import sys, time
import cadquery as cq
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
a = cq.Assembly.importStep(sys.argv[1])
leaves = []
for name, sub in a.traverse():
    if sub.obj is not None and not sub.children:
        sh = sub.obj if isinstance(sub.obj, cq.Shape) else sub.obj.val()
        leaves.append((name, sh))
def bb(s):
    b = Bnd_Box(); BRepBndLib.Add_s(s.wrapped, b); return b.Get()
boxes = [bb(s) for _, s in leaves]
t = time.time(); hits = []; n = 0
for i in range(len(leaves)):
    for j in range(i + 1, len(leaves)):
        A, B = boxes[i], boxes[j]
        if A[0] > B[3] + .01 or B[0] > A[3] + .01 or A[1] > B[4] + .01 or B[1] > A[4] + .01 or A[2] > B[5] + .01 or B[2] > A[5] + .01:
            continue
        n += 1
        c = BRepAlgoAPI_Common(leaves[i][1].wrapped, leaves[j][1].wrapped); c.Build()
        v = cq.Shape.cast(c.Shape()).Volume()
        if v > 0.5: hits.append((v, leaves[i][0], leaves[j][0]))
print("leaves", len(leaves), "pairs", n, "s", round(time.time() - t, 1))
for v, x, y in sorted(hits, reverse=True)[:30]: print(" CLASH %.1f  %s <-> %s" % (v, x, y))
print("clashes", len(hits))
