"""Damage/heal flow per fighter for one seed: `python tools/flow.py SPEC SEED`."""

import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fightsim.sim import run_headless  # noqa: E402
from fightsim.spec import load_spec  # noqa: E402

spec = load_spec(sys.argv[1])
w = run_headless(spec, int(sys.argv[2]) if len(sys.argv) > 2 else 1)
side_of = {u.uid: u.side for u in w.units}
name = {0: w.mains[0].name, 1: w.mains[1].name}
dealt = defaultdict(float)
hits = defaultdict(int)
healed = defaultdict(float)
for ev in w.events:
    if ev["type"] == "damage":
        k = (name[side_of[ev["src"]]], ev["source"])
        dealt[k] += ev["amount"]
        hits[k] += 1
    elif ev["type"] == "heal":
        healed[name[side_of[ev["unit"]]]] += ev["amount"]
print(f"duration {w.t:.1f}s winner {w.winner_side}")
for k in sorted(dealt):
    print(f"  {k[0]:>8} {k[1]:>6}: {hits[k]:4d} hits  {dealt[k]:7.1f} dmg")
for k, v in healed.items():
    print(f"  {k:>8} healed {v:.1f}")
for t, f0, f1 in w.timeline[::40]:
    print(f"  t={t:5.1f}  {f0:.2f}  {f1:.2f}")
